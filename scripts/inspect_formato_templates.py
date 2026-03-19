"""
Inspect televisiva.b64 and maquina.b64 to find OT number location in PDF structure.
Goal: determine if we can use direct content stream manipulation instead of visual overlay.
"""
import base64
import io
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from pypdf import PdfReader

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "backend", "data", "formato_d")


def load_b64(name: str) -> bytes:
    path = os.path.join(DATA_DIR, name)
    with open(path, "r", encoding="ascii") as f:
        return base64.b64decode(f.read())


def inspect_template(name: str):
    print(f"\n{'='*80}")
    print(f"  INSPECTING: {name}")
    print(f"{'='*80}")
    
    pdf_bytes = load_b64(name)
    reader = PdfReader(io.BytesIO(pdf_bytes))
    
    print(f"  Pages: {len(reader.pages)}")
    
    page = reader.pages[0]
    mediabox = page.mediabox
    print(f"  MediaBox: {mediabox}")
    
    # Check page resources
    resources = page.get("/Resources")
    if resources:
        res_obj = resources.get_object() if hasattr(resources, 'get_object') else resources
        print(f"  Resource keys: {list(res_obj.keys())}")
        
        # Check fonts
        fonts = res_obj.get("/Font")
        if fonts:
            font_obj = fonts.get_object() if hasattr(fonts, 'get_object') else fonts
            print(f"  Fonts: {list(font_obj.keys())}")
    
    # Inspect XObjects
    xobjects = page["/Resources"].get("/XObject")
    if xobjects:
        xobj_dict = xobjects.get_object()
        print(f"\n  XObjects ({len(xobj_dict)} total):")
        for xname, ref in xobj_dict.items():
            xobject = ref.get_object()
            subtype = xobject.get("/Subtype", "?")
            data = xobject.get_data() if hasattr(xobject, 'get_data') else b""
            tj_count = data.count(b"Tj")
            has_text = tj_count > 0
            
            info = f"    {xname}: Subtype={subtype}, DataLen={len(data)}, Tj_count={tj_count}"
            
            # Check for number-like patterns
            if has_text and subtype == "/Form":
                # Look for number patterns in the stream
                text = data.decode("latin-1", errors="replace")
                # Find all Tj text operations
                import re
                tj_matches = re.findall(r'\(([^)]*)\)\s*Tj', text)
                if tj_matches:
                    info += f", Texts={tj_matches[:10]}"
                
                # Check for markers similar to template-d
                has_marker1 = b"3.7440772 0 0 3.7440772" in data
                has_marker2 = b"1 0 0 rg" in data
                has_marker3 = b"/H2" in data
                info += f", markers=[scale={has_marker1}, red={has_marker2}, H2={has_marker3}]"
            
            print(info)
            
            # Print the full stream data for Form XObjects with text
            if has_text and subtype == "/Form" and tj_count <= 15:
                print(f"      --- Stream content (first 2000 chars) ---")
                decoded = data.decode("latin-1", errors="replace")
                for line in decoded[:2000].split("\n"):
                    print(f"      | {line}")
                print(f"      --- end ---")
    
    # Check page content streams for OT text
    print(f"\n  Page content stream analysis:")
    if "/Contents" in page:
        contents = page["/Contents"]
        if hasattr(contents, 'get_object'):
            contents = contents.get_object()
        
        if hasattr(contents, 'get_data'):
            data = contents.get_data()
        elif isinstance(contents, list):
            data = b""
            for item in contents:
                obj = item.get_object() if hasattr(item, 'get_object') else item
                if hasattr(obj, 'get_data'):
                    data += obj.get_data()
        else:
            data = b""
        
        import re
        text = data.decode("latin-1", errors="replace")
        tj_matches = re.findall(r'\(([^)]*)\)\s*Tj', text)
        print(f"    Total Tj operations in page content: {data.count(b'Tj')}")
        
        # Look for OT or number patterns
        ot_related = [m for m in tj_matches if 'OT' in m.upper() or m.strip().isdigit() or (len(m) <= 10 and any(c.isdigit() for c in m))]
        if ot_related:
            print(f"    OT/number-related texts: {ot_related[:20]}")
        
        # Look for "0000" or number patterns
        num_patterns = re.findall(r'\b\d{4,7}\b', text)
        if num_patterns:
            print(f"    Number patterns found: {num_patterns[:20]}")
        
        # Find TJ array operations (more common in complex PDFs)
        tj_array = re.findall(r'\[(.*?)\]\s*TJ', text, re.DOTALL)
        for i, arr in enumerate(tj_array[:30]):
            texts_in_arr = re.findall(r'\(([^)]*)\)', arr)
            combined = "".join(texts_in_arr)
            if any(c.isdigit() for c in combined) or 'OT' in combined.upper():
                print(f"    TJ array #{i}: texts={texts_in_arr}")
    
    # Check structure tree for accessible text
    print(f"\n  Checking accessible metadata:")
    for object_number in sorted(reader.xref.get(0, {}).keys()):
        try:
            from pypdf.generic import IndirectObject
            obj = reader.get_object(IndirectObject(object_number, 0, reader))
            if not hasattr(obj, "get"):
                continue
            t_val = obj.get("/T")
            e_val = obj.get("/E")
            if t_val or e_val:
                if any(c.isdigit() for c in str(t_val or "")) or any(c.isdigit() for c in str(e_val or "")):
                    print(f"    ObjNum={object_number}: /T={t_val}, /E={e_val}")
        except Exception:
            pass


if __name__ == "__main__":
    for name in ["template-d.b64", "televisiva.b64", "maquina.b64"]:
        try:
            inspect_template(name)
        except Exception as e:
            print(f"  ERROR inspecting {name}: {e}")
            import traceback
            traceback.print_exc()
