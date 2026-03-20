# -*- coding: utf-8 -*-
import os
import re
from pathlib import Path

ROOT = Path(r'C:\Users\INTEL\Desktop\GIO')

def process_python_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Remove BOM if present
    if content.startswith('\ufeff'):
        content = content[1:]
    
    # Check if already has coding declaration
    has_coding = re.search(r'^#.*coding.*utf-8', content, re.MULTILINE | re.IGNORECASE)
    
    if not has_coding:
        # Add coding declaration after docstring if exists
        lines = content.split('\n')
        insert_idx = 0
        
        # Skip docstring at the start
        if lines and lines[0].startswith('"""'):
            in_docstring = True
            docstring_end = None
            for i, line in enumerate(lines):
                if i == 0 and lines[0].endswith('"""') and len(lines[0]) > 3:
                    in_docstring = False
                    docstring_end = 0
                    break
                if '"""' in line:
                    docstring_end = i
                    in_docstring = False
                    break
            if docstring_end is not None:
                insert_idx = docstring_end + 1
        elif lines and lines[0].startswith("'''"):
            in_docstring = True
            docstring_end = None
            for i, line in enumerate(lines):
                if i == 0 and lines[0].endswith("'''") and len(lines[0]) > 3:
                    in_docstring = False
                    docstring_end = 0
                    break
                if "'''" in line:
                    docstring_end = i
                    in_docstring = False
                    break
            if docstring_end is not None:
                insert_idx = docstring_end + 1
        
        # Insert coding declaration
        lines.insert(insert_idx, '# -*- coding: utf-8 -*-')
        content = '\n'.join(lines)
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        return True
    return False

def process_directory(root):
    count = 0
    for ext in ['*.py']:
        for filepath in root.rglob(ext):
            if 'node_modules' in str(filepath) or '.venv' in str(filepath) or '__pycache__' in str(filepath):
                continue
            try:
                if process_python_file(filepath):
                    print(f'Fixed: {filepath.relative_to(ROOT)}')
                    count += 1
            except Exception as e:
                print(f'Error: {filepath.relative_to(ROOT)}: {e}')
    return count

if __name__ == '__main__':
    count = process_directory(ROOT / 'backend')
    count += process_directory(ROOT / 'scripts')
    print(f'\nTotal files fixed: {count}')