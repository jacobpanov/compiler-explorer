# AVR Instruction Set Manual Update Analysis

## Current Situation

The Compiler Explorer project uses a docenizer script (`etc/scripts/docenizers/docenizer-avr.py`) to automatically generate instruction documentation from Microchip's AVR Instruction Set Manual. The script currently uses:

**Current URL:**
```
https://ww1.microchip.com/downloads/en/DeviceDoc/AVR-InstructionSet-Manual-DS40002198.pdf
```
- File size: 1,232,586 bytes
- References "© 2021 Microchip Technology Inc." in regex patterns
- Document: DS40002198

## Discovered Issue

A newer version of the same document exists at:

**New URL:**
```
https://ww1.microchip.com/downloads/aemDocuments/documents/MCU08/ProductDocuments/ReferenceManuals/AVR-InstructionSet-Manual-DS40002198.pdf
```
- File size: 1,538,679 bytes (~300KB larger)
- Same document number: DS40002198
- Significantly larger size suggests substantial updates/additions

## Impact Assessment

### What This Means:
1. **Potentially Missing Instructions**: The larger file size suggests new instructions or expanded documentation that may not appear in Compiler Explorer's instruction tooltips
2. **Outdated Documentation**: Users may see incomplete or outdated instruction descriptions
3. **GCC 14.2.0 Compatibility**: AVR GCC 14.2.0 may support newer instructions not documented in the 2021 manual

### Current Instruction Coverage:
The current generated file (`lib/asm-docs/generated/asm-docs-avr.ts`) includes approximately 100+ AVR instructions from the 2021 manual, including:
- Basic arithmetic: ADD, SUB, MUL, etc.  
- Logic operations: AND, OR, EOR, etc.
- Branch instructions: All BR* variants
- Memory operations: LD, ST, LPM, SPM
- Fractional multiply: FMUL, FMULS, FMULSU
- Atomic operations: LAC, LAS, LAT, XCH

## Proposed Solution

### 1. Update the Docenizer Script
Update `etc/scripts/docenizers/docenizer-avr.py`:

```python
# Change this line:
FILE = ("https://ww1.microchip.com/downloads/en/DeviceDoc/"
        "AVR-InstructionSet-Manual-DS40002198.pdf")

# To this:
FILE = ("https://ww1.microchip.com/downloads/aemDocuments/documents/MCU08/"
        "ProductDocuments/ReferenceManuals/AVR-InstructionSet-Manual-DS40002198.pdf")
```

### 2. Update Copyright Regex
Update the copyright year regex if the new manual has a different year:

```python
# May need to update this regex to handle different copyright years
header_footer_regex = re.compile(r"\s+?\w+?-page \d{1,3}?\s+?Manual\s+?\u00a9 202\d Microchip Technology Inc.\s+?AVR\u00ae Instruction Set Manual\s+?Instruction Description\s*", re.MULTILINE)
```

### 3. Regenerate Documentation
Run the docenizer script to generate updated instruction documentation:

```bash
cd etc/scripts/docenizers
python docenizer-avr.py
```

## Benefits of This Update

1. **Complete Instruction Coverage**: Ensures all instructions supported by AVR GCC 14.2.0 have proper documentation
2. **Accurate Information**: Users get the most current instruction descriptions and usage notes
3. **Better Developer Experience**: More comprehensive tooltips and help text in the assembly view
4. **Future-Proofing**: Using the more recent URL structure may be more stable

## Risk Assessment

### Low Risk:
- Same document number (DS40002198) - unlikely to break existing parsing
- URL change is just a path restructure, not a fundamental format change
- Current URL remains accessible as fallback

### Testing Requirements:
1. Verify the docenizer script can parse the new PDF successfully
2. Check that generated TypeScript file compiles without errors
3. Test that instruction tooltips display correctly in Compiler Explorer
4. Validate that no instructions are lost in the migration

## Implementation Priority

**Priority: Medium-High**

This is a good improvement that enhances the user experience without introducing breaking changes. It's particularly relevant since:
- You're already working with AVR GCC 14.2.0
- The file size difference suggests significant updates
- It's a low-risk, high-benefit change

## Next Steps

1. Create a backup of the current generated file
2. Update the docenizer script with the new URL
3. Run the docenizer to generate new documentation
4. Compare old vs new instruction lists to identify additions
5. Test the updated documentation in a development environment
6. Submit as a pull request to the Compiler Explorer project

This would be an excellent contribution to the Compiler Explorer project and would benefit all AVR developers using the platform.
