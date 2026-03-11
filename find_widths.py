import re
import os

folder = 'inspect_pdf_tmp'
widths = {}

for f in os.listdir(folder):
    path = os.path.join(folder, f)
    if not os.path.isfile(path): continue
    with open(path, 'rb') as file:
        data = file.read().decode('latin-1', errors='ignore')
        # PDF line width operator is [width] w
        matches = re.findall(r'(\d*\.?\d+)\s+w\b', data)
        if matches:
            widths[f] = set(matches)

for f, val in widths.items():
    print(f"{f}: {val}")
