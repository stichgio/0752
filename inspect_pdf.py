import base64
import io
import os
from pypdf import PdfReader

b64_data = open(r"backend\data\formato_d\template-d.b64", "r", encoding="ascii").read()
pdf_bytes = base64.b64decode(b64_data)

reader = PdfReader(io.BytesIO(pdf_bytes))
page = reader.pages[0]
os.makedirs("inspect_pdf_tmp", exist_ok=True)

def dump_stream(obj, name):
    try:
        data = obj.get_data()
        with open(f"inspect_pdf_tmp/{name}.txt", "wb") as f:
            f.write(data)
    except Exception as e:
        print(f"Failed to dump {name}: {e}")

contents = page.get("/Contents")
if contents:
    try:
        # Handle ArrayObject of contents
        from pypdf.generic import ArrayObject
        if isinstance(contents, ArrayObject) or isinstance(contents, list):
            for i, c in enumerate(contents):
                dump_stream(c.get_object(), f"page_content_{i}")
        else:
            dump_stream(contents.get_object(), "page_content")
    except Exception as e:
        print(f"Error handling page contents: {e}")

xobjects = page.get("/Resources", {}).get("/XObject", {})
if hasattr(xobjects, "get_object"):
    xobjects = xobjects.get_object()
    for name, ref in xobjects.items():
        obj = ref.get_object()
        if obj.get("/Subtype") == "/Form":
            dump_stream(obj, f"xobject_{name.decode('utf-8') if isinstance(name, bytes) else name.replace('/', '')}")
print("Dumped content streams to inspect_pdf_tmp")
