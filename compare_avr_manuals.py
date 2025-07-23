#!/usr/bin/env python3

"""
Test script to compare AVR instruction documentation between old and new manual URLs
This helps us validate that the update won't break existing functionality
"""

import io
import urllib.request
from pdfminer.high_level import extract_text
from pdfminer.layout import LAParams
import re

OLD_URL = "https://ww1.microchip.com/downloads/en/DeviceDoc/AVR-InstructionSet-Manual-DS40002198.pdf"
NEW_URL = "https://ww1.microchip.com/downloads/aemDocuments/documents/MCU08/ProductDocuments/ReferenceManuals/AVR-InstructionSet-Manual-DS40002198.pdf"

# Regex from the current docenizer
section_regex = re.compile(r"^(6\.\d{1,3}?)\s+?(?P<mnemonic>\w+?)\s+?(?:\((?P<mnemonic_2>\w+?)\)\s+?)?[-\u2013]\s+?(?P<name>.+?)\s*?$\s+?\1\.1\s+?Description\s+(?P<description>(?s:.+?))\s+?Operation:", re.MULTILINE)

def get_instruction_count(url, label):
    print(f"\n=== Testing {label} ===")
    print(f"URL: {url}")
    
    try:
        with urllib.request.urlopen(url) as u:
            pdf_bytes = u.read()
            
        print(f"PDF Size: {len(pdf_bytes):,} bytes")
        
        with io.BytesIO(pdf_bytes) as pdf_io:
            pdf_params = LAParams(boxes_flow=None)
            print("Extracting text from PDF...")
            text = extract_text(pdf_io, laparams=pdf_params)
            
        print(f"Extracted text length: {len(text):,} characters")
        
        # Find all instructions
        instructions = set()
        for match in section_regex.finditer(text):
            mnemonic = match.group("mnemonic")
            if mnemonic:
                instructions.add(mnemonic)
                
            mnemonic_2 = match.group("mnemonic_2")
            if mnemonic_2 and mnemonic_2 not in ("AVRe", "AVRrc"):
                instructions.add(mnemonic_2)
        
        instructions = sorted(list(instructions))
        print(f"Found {len(instructions)} unique instructions")
        
        # Show first 10 and last 10 instructions as preview
        if len(instructions) > 20:
            preview = instructions[:10] + ["..."] + instructions[-10:]
        else:
            preview = instructions
            
        print("Instructions found:", ", ".join(preview))
        
        return instructions
        
    except Exception as e:
        print(f"Error processing {label}: {e}")
        return []

def main():
    print("AVR Instruction Set Manual Comparison")
    print("=" * 50)
    
    old_instructions = get_instruction_count(OLD_URL, "Current Manual (2021)")
    new_instructions = get_instruction_count(NEW_URL, "New Manual")
    
    if old_instructions and new_instructions:
        print(f"\n=== COMPARISON RESULTS ===")
        
        old_set = set(old_instructions)
        new_set = set(new_instructions)
        
        added = new_set - old_set
        removed = old_set - new_set
        common = old_set & new_set
        
        print(f"Common instructions: {len(common)}")
        print(f"Instructions in new manual only: {len(added)}")
        print(f"Instructions in old manual only: {len(removed)}")
        
        if added:
            print(f"\nNEW INSTRUCTIONS: {sorted(list(added))}")
            
        if removed:
            print(f"\nREMOVED INSTRUCTIONS: {sorted(list(removed))}")
            
        # Test some key instructions from our test file
        test_instructions = ["ADD", "SUB", "MUL", "AND", "OR", "EOR", "LSL", "LSR", 
                           "CLI", "SEI", "NOP", "WDR", "FMULS", "MOVW", "ADIW"]
        
        print(f"\n=== KEY INSTRUCTION CHECK ===")
        for instr in test_instructions:
            old_has = instr in old_set
            new_has = instr in new_set
            status = "✓" if new_has else "✗"
            change = ""
            if old_has != new_has:
                change = " (CHANGED!)"
            print(f"{status} {instr}{change}")

if __name__ == "__main__":
    main()
