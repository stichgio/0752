# -*- coding: utf-8 -*-
import os
import re
from pathlib import Path

ROOT = Path(r'C:\Users\INTEL\Desktop\GIO')

def process_js_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Remove BOM if present
    if content.startswith('\ufeff'):
        content = content[1:]
    
    # Fix corrupted box-drawing characters: â”€, â”€, etc
    # These are UTF-8 encoded box drawing chars rendered incorrectly
    replacements = {
        'â\u20ac\u201e': '\u2500',  # â”€ -> ─
        'â\u20ac\u201c': '\u2502',  # â”€ -> │
        'â\u20ac\u2019': '\u251c',  # â”' -> ├
        'â\u20ac\u2018': '\u2514',  # â”` -> └
        'â\u20ac\u201e': '\u250c',  # â”„ -> ┌
        'â\u20ac\u201d': '\u2510',  # â”" -> ┐
        '\u009d': '',  # Remove problematic control character
        'â\u0080\u009d': '\u2500',  # Another variant
    }
    
    # More aggressive pattern for box drawing chars
    # Pattern: â followed by combining chars that form box drawing
    content = re.sub(r'\u00e2\u201e\u20ac', '\u2500', content)  # â”€
    content = re.sub(r'\u00e2\u201c\u20ac', '\u2502', content)  # â”€
    content = re.sub(r'\u00e2\u20ac\u201c', '\u2502', content)  # â€
    
    # Clean up any remaining problematic sequences
    content = content.replace('\x9d', '')
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def process_directory(root, extensions):
    count = 0
    for ext in extensions:
        for filepath in root.rglob(ext):
            if 'node_modules' in str(filepath) or '.venv' in str(filepath) or '__pycache__' in str(filepath):
                continue
            try:
                if process_js_file(filepath):
                    print(f'Fixed: {filepath.relative_to(ROOT)}')
                    count += 1
            except Exception as e:
                print(f'Error: {filepath.relative_to(ROOT)}: {e}')
    return count

if __name__ == '__main__':
    # Fix frontend files
    count = process_directory(ROOT / 'frontend', ['*.jsx', '*.tsx', '*.ts', '*.js'])
    print(f'\nTotal files fixed: {count}')