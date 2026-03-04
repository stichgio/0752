import os

path = r'c:\Users\INTEL\Desktop\GIO\backend\msheets\multi_sheet_report.py'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix 1: _build_page_html style
old_style_1 = """@page {
    size: A4 portrait;
    margin: 10mm 12mm 10mm 12mm;
}
html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    width: 100%;
}
.page-container {
    width: 100%;
    page-break-after: always;
    page-break-inside: avoid;
}"""

new_style_1 = """@page {
    size: A4 portrait;
    margin: 0;
}
html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    width: 210mm;
    height: 297mm;
}
.page-container {
    width: 210mm;
    height: 297mm;
    max-height: 297mm;
    padding: 10mm 12mm;
    page-break-after: always;
    page-break-inside: avoid;
    overflow: hidden;
    box-sizing: border-box;
}"""

# Fix 2: _build_volanteo_page_html style
old_style_2 = """* { margin: 0; padding: 0; box-sizing: border-box; }
@page { size: A4 portrait; margin: 10mm 12mm 10mm 12mm; }
html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    line-height: 1.3;
    color: #222;
    background: #fff;
}
.page {
    width: 100%;
    min-height: 277mm;
    margin: 0;
    padding: 8mm;
    background: #fff;
    display: flex;
    flex-direction: column;
    page-break-after: always;
    page-break-inside: avoid;
    box-sizing: border-box;
}"""

new_style_2 = """* { margin: 0; padding: 0; box-sizing: border-box; }
@page { size: A4 portrait; margin: 0; }
html, body {
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 10px;
    line-height: 1.3;
    color: #222;
    background: #fff;
    width: 210mm;
    height: 297mm;
}
.page {
    width: 210mm;
    height: 297mm;
    max-height: 297mm;
    margin: 0;
    padding: 10mm 12mm;
    background: #fff;
    display: flex;
    flex-direction: column;
    page-break-after: always;
    page-break-inside: avoid;
    box-sizing: border-box;
    overflow: hidden;
}"""

def smart_replace(content, old, new):
    if old in content:
        return content.replace(old, new)
    # try with CRLF
    old_crlf = old.replace('\n', '\r\n')
    if old_crlf in content:
        return content.replace(old_crlf, new.replace('\n', '\r\n'))
    return content

content = smart_replace(content, old_style_1, new_style_1)
content = smart_replace(content, old_style_2, new_style_2)

# Also fix the usable_height_mm in _build_image_grid_html if not already fixed
content = content.replace('usable_height_mm = 235.0', 'usable_height_mm = 230.0')
content = content.replace('row_height_mm = min(usable_height_mm / rows, 140.0)', 'row_height_mm = min(usable_height_mm / rows, 135.0)')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixes applied to multi_sheet_report.py")
