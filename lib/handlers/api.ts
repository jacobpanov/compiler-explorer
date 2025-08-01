// Copyright (c) 2023, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import express from 'express';
import _ from 'underscore';

import {isString, unique} from '../../shared/common-utils.js';
import {CompilerInfo} from '../../types/compiler.interfaces.js';
import {Language, LanguageKey} from '../../types/languages.interfaces.js';
import {assert, unwrap} from '../assert.js';
import {ClientStateNormalizer} from '../clientstate-normalizer.js';
import {CompilationEnvironment} from '../compilation-env.js';
import {IExecutionEnvironment} from '../execution/execution-env.interfaces.js';
import {LocalExecutionEnvironment} from '../execution/index.js';
import {logger} from '../logger.js';
import {ClientOptionsHandler} from '../options-handler.js';
import {PropertyGetter} from '../properties.interfaces.js';
import {SentryCapture} from '../sentry.js';
import {BaseShortener, getShortenerTypeByKey} from '../shortener/index.js';
import {StorageBase} from '../storage/index.js';

import {CompileHandler} from './compile.js';

function methodNotAllowed(req: express.Request, res: express.Response) {
    res.status(405).send('Method Not Allowed');
}

export class ApiHandler {
    public compilers: CompilerInfo[] = [];
    public languages: Partial<Record<LanguageKey, Language>> = {};
    private usedLangIds: LanguageKey[] = [];
    private options: ClientOptionsHandler | null = null;
    public readonly handle: express.Router;
    public readonly shortener: BaseShortener;
    private release = {
        gitReleaseName: '',
        releaseBuildNumber: '',
    };
    private readonly compilationEnvironment: CompilationEnvironment;

    constructor(
        compileHandler: CompileHandler,
        ceProps: PropertyGetter,
        private readonly storageHandler: StorageBase,
        urlShortenService: string,
        compilationEnvironment: CompilationEnvironment,
    ) {
        this.handle = express.Router();
        this.compilationEnvironment = compilationEnvironment;
        const cacheHeader = `public, max-age=${ceProps('apiMaxAgeSecs', 24 * 60 * 60)}`;
        this.handle.use((req, res, next) => {
            res.header({
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
                'Cache-Control': cacheHeader,
            });
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });
        this.handle.route('/compilers').get(this.handleCompilers.bind(this)).all(methodNotAllowed);

        this.handle.route('/compilers/:language').get(this.handleCompilers.bind(this)).all(methodNotAllowed);

        this.handle.route('/languages').get(this.handleLanguages.bind(this)).all(methodNotAllowed);

        this.handle.route('/libraries/:language').get(this.handleLangLibraries.bind(this)).all(methodNotAllowed);

        this.handle.route('/libraries').get(this.handleAllLibraries.bind(this)).all(methodNotAllowed);

        this.handle.route('/tools/:language').get(this.handleLangTools.bind(this)).all(methodNotAllowed);

        this.handle
            .route('/asm/:opcode')
            .get((req, res) => res.redirect(`amd64/${req.params.opcode}`))
            .all(methodNotAllowed);

        const maxUploadSize = ceProps('maxUploadSize', '1mb');
        const textParser = express.text({limit: ceProps('bodyParserLimit', maxUploadSize), type: () => true});

        this.handle
            .route('/compiler/:compiler/compile')
            .post(textParser, compileHandler.handle.bind(compileHandler))
            .all(methodNotAllowed);
        this.handle
            .route('/compiler/:compiler/cmake')
            .post(compileHandler.handleCmake.bind(compileHandler))
            .all(methodNotAllowed);

        if (this.compilationEnvironment.ceProps('localexecutionEndpoint', false)) {
            this.handle.route('/localexecution/:hash').post(this.handleLocalExecution.bind(this)).all(methodNotAllowed);
        }

        this.handle
            .route('/popularArguments/:compiler')
            .post(compileHandler.handlePopularArguments.bind(compileHandler))
            .get(compileHandler.handlePopularArguments.bind(compileHandler))
            .all(methodNotAllowed);
        this.handle
            .route('/optimizationArguments/:compiler')
            .post(compileHandler.handleOptimizationArguments.bind(compileHandler))
            .get(compileHandler.handleOptimizationArguments.bind(compileHandler))
            .all(methodNotAllowed);
        this.handle.route('/shortlinkinfo/:id').get(this.shortlinkInfoHandler.bind(this)).all(methodNotAllowed);

        const shortenerType = getShortenerTypeByKey(urlShortenService);
        this.shortener = new shortenerType(storageHandler);
        this.handle.route('/shortener').post(this.shortener.handle.bind(this.shortener)).all(methodNotAllowed);

        this.handle.route('/version').get(this.handleReleaseName.bind(this)).all(methodNotAllowed);
        this.handle.route('/releaseBuild').get(this.handleReleaseBuild.bind(this)).all(methodNotAllowed);
        // Let's not document this one, eh?
        this.handle.route('/forceServerError').get((req, res) => {
            logger.error(`Forced server error from ${req.ip}`);
            throw new Error('Forced server error');
        });
    }

    shortlinkInfoHandler(req: express.Request, res: express.Response, next: express.NextFunction) {
        const id = req.params.id;
        this.storageHandler
            .expandId(id)
            .then(result => {
                const config = JSON.parse(result.config);

                if (result.created) res.header('Link-Created', result.created.toUTCString());

                if (config.content) {
                    const normalizer = new ClientStateNormalizer();
                    normalizer.fromGoldenLayout(config);

                    res.send(normalizer.normalized);
                } else {
                    res.send(config);
                }
            })
            .catch(err => {
                logger.warn(`Exception thrown when expanding ${id}: `, err);
                logger.warn('Exception value:', err);
                SentryCapture(err, 'shortlinkInfoHandler');
                next({
                    statusCode: 404,
                    message: `ID "${id}" could not be found`,
                });
            });
    }

    handleLanguages(req: express.Request, res: express.Response) {
        const availableLanguages = this.usedLangIds.map(val => {
            const lang = this.languages[val];
            const newLangObj: Language = Object.assign({}, lang);
            if (this.options) {
                newLangObj.defaultCompiler = this.options.options.defaultCompiler[unwrap(lang).id];
            }
            return newLangObj;
        });

        this.outputList(availableLanguages, 'Id', req, res);
    }

    filterCompilerProperties(list: CompilerInfo[] | Language[], selectedFields: string[]) {
        return list.map(compiler => {
            return _.pick(compiler, selectedFields);
        });
    }

    outputList(list: CompilerInfo[] | Language[], title: string, req: express.Request, res: express.Response) {
        if (req.accepts(['text', 'json']) === 'json') {
            if (req.query.fields === 'all') {
                res.send(list);
            } else {
                const defaultfields = [
                    'id',
                    'name',
                    'lang',
                    'compilerType',
                    'semver',
                    'extensions',
                    'monaco',
                    'instructionSet',
                ];
                if (req.query.fields) {
                    assert(isString(req.query.fields));
                    const filteredList = this.filterCompilerProperties(list, req.query.fields.split(','));
                    res.send(filteredList);
                } else {
                    const filteredList = this.filterCompilerProperties(list, defaultfields);
                    res.send(filteredList);
                }
            }
            return;
        }

        const maxLength = Math.max(
            ...list
                .map(item => item.id)
                .concat([title])
                .map(item => item.length),
        );
        const header = title.padEnd(maxLength, ' ') + ' | Name\n';
        const body = list.map(lang => lang.id.padEnd(maxLength, ' ') + ' | ' + lang.name).join('\n');
        res.set('Content-Type', 'text/plain');
        res.send(header + body);
    }

    getLibrariesAsArray(languageId: LanguageKey) {
        const libsForLanguageObj = unwrap(this.options).options.libs[languageId];
        if (!libsForLanguageObj) return [];

        return Object.keys(libsForLanguageObj).map(key => {
            const language = libsForLanguageObj[key];
            const versionArr = Object.keys(language.versions).map(key => {
                return {
                    ...language.versions[key],
                    id: key,
                };
            });

            return {
                id: key,
                name: language.name,
                description: language.description,
                url: language.url,
                versions: versionArr,
            };
        });
    }

    getToolsAsArray(languageId: LanguageKey) {
        const toolsForLanguageObj = unwrap(this.options).options.tools[languageId];
        if (!toolsForLanguageObj) return [];

        return Object.keys(toolsForLanguageObj).map(key => {
            const tool = toolsForLanguageObj[key];
            return {
                id: key,
                name: tool.name,
                type: tool.type,
                languageId: tool.languageId || languageId,
                allowStdin: tool.stdinHint !== 'disabled',
            };
        });
    }

    handleLangLibraries(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (this.options) {
            if (req.params.language) {
                res.send(this.getLibrariesAsArray(req.params.language as LanguageKey));
            } else {
                next({
                    statusCode: 404,
                    message: 'Language is required',
                });
            }
        } else {
            next({
                statusCode: 500,
                message: 'Internal error',
            });
        }
    }

    handleLangTools(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (this.options) {
            if (req.params.language) {
                res.send(this.getToolsAsArray(req.params.language as LanguageKey));
            } else {
                next({
                    statusCode: 404,
                    message: 'Language is required',
                });
            }
        } else {
            next({
                statusCode: 500,
                message: 'Internal error',
            });
        }
    }

    async handleLocalExecution(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (!req.params.hash) {
            next({statusCode: 404, message: 'No hash supplied'});
            return;
        }

        if (!req.body.ExecutionParams) {
            next({statusCode: 404, message: 'No ExecutionParams'});
            return;
        }

        try {
            const env: IExecutionEnvironment = new LocalExecutionEnvironment(this.compilationEnvironment);
            await env.downloadExecutablePackage(req.params.hash);
            const execResult = await env.execute(req.body.ExecutionParams);
            logger.debug('execResult', execResult);
            res.send(execResult);
        } catch (e) {
            logger.error(e);
            next({statusCode: 500, message: 'Internal error'});
        }
    }

    handleAllLibraries(req: express.Request, res: express.Response, next: express.NextFunction) {
        if (this.options) {
            res.send(this.options.options.libs);
        } else {
            next({
                statusCode: 500,
                message: 'Internal error',
            });
        }
    }

    handleCompilers(req: express.Request, res: express.Response) {
        let filteredCompilers = this.compilers;
        if (req.params.language) {
            filteredCompilers = this.compilers.filter(compiler => compiler.lang === req.params.language);
        }

        this.outputList(filteredCompilers, 'Compiler Name', req, res);
    }

    handleReleaseName(req: express.Request, res: express.Response) {
        res.send(this.release.gitReleaseName);
    }

    handleReleaseBuild(req: express.Request, res: express.Response) {
        res.send(this.release.releaseBuildNumber);
    }

    setCompilers(compilers: CompilerInfo[]) {
        this.compilers = compilers;
        this.usedLangIds = unique(this.compilers.map(compiler => compiler.lang));
    }

    setLanguages(languages: Partial<Record<LanguageKey, Language>>) {
        this.languages = languages;
    }

    setOptions(options: ClientOptionsHandler) {
        this.options = options;
    }

    setReleaseInfo(gitReleaseName: string | undefined, releaseBuildNumber: string | undefined) {
        this.release = {
            gitReleaseName: gitReleaseName || '',
            releaseBuildNumber: releaseBuildNumber || '',
        };
    }
}
