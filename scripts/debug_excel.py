# -*- coding: utf-8 -*-
import openpyxl
import os

file_path = "giolbas.xlsx"
if not os.path.exists(file_path):
    print("File not found")
    exit()

wb = openpyxl.load_workbook(file_path, data_only=False)
sheet = wb.active

# Headers
headers = []
for cell in sheet[1]:
    headers.append(str(cell.value))
print("Headers:", headers)

# Inspect first few rows for columns that look like 'concentración'
target_indices = [i for i, h in enumerate(headers) if 'concentrac' in str(h).lower()]

print(f"Target column indices: {target_indices}")

for i, row in enumerate(sheet.iter_rows(min_row=2, max_row=5)):
    print(f"Row {i+2}:")
    for col_idx in target_indices:
        cell = row[col_idx]
        print(f"  Col '{headers[col_idx]}': Value={cell.value!r}, Type={type(cell.value)}, Format={cell.number_format!r}")
