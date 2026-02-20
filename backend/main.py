from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, APIRouter, Request
from fastapi.staticfiles import StaticFiles
import base64
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel, Field
import shutil
import os
import json
import tempfile
import traceback
from typing import Any, Dict, List, Literal, Optional
from report_service import ReportService
from pdf_tools import merge_pdfs_interleaved, merge_pdfs_sequential, split_pdf, split_pdf_by_ranges
import zipfile
from technical_reports.router import router as technical_reports_router
from technical_reports.models import TechnicalReport
from fichas_tecnicas.router import router as fichas_tecnicas_router
from image_optimizer.router import router as image_optimizer_router
from compressor.router import router as compressor_router
from template_editor.router import router as template_editor_router
from template_editor.service import (
    get_all_published_templates,
    get_preview_html,
    get_published_template_by_name,
    get_template,
    publish_template,
    set_template_status,
)
from utils.file_utils import save_upload


# --- Cleanup helper (used by multiple endpoints) ---
def _cleanup_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Error removing temp file {path}: {e}")


def _validate_pdf_file(file: UploadFile) -> bool:
    """Valida PDF por magic number sin consumir el stream de forma permanente."""
    try:
        # Preserve current position to avoid side effects before save_upload.
        current_pos = file.file.tell()
        file.file.seek(0)
        header = file.file.read(5)
        file.file.seek(current_pos)
        return header == b"%PDF-"
    except Exception:
        return False


def _validate_pdf_uploads(files: List[UploadFile], min_files: int = 2) -> None:
    """Validación compartida para endpoints de merge sin alterar contrato de API."""
    if len(files) < min_files:
        raise HTTPException(status_code=400, detail="Se requieren al menos 2 archivos PDF")
    for file in files:
        if not _validate_pdf_file(file):
            raise HTTPException(status_code=400, detail=f"El archivo '{file.filename}' no es un PDF válido")


# --- App Lifespan: singleton ReportService ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.report_service = ReportService()
    print("[App] ReportService initialized (singleton)")
    yield
    await app.state.report_service.close()
    print("[App] ReportService closed")

app = FastAPI(lifespan=lifespan)

# Enable CORS for frontend (separate deployment on Vercel)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for Vercel/HuggingFace deployment
    allow_credentials=False,  # Must be False when using wildcard origins
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-Original-Size",
        "X-Compressed-Size",
        "X-Reduction-Percent",
        "X-Filename",
        "X-Error",
        "Content-Disposition",
    ],
)

# Create API Router with prefix
api_router = APIRouter(prefix="/api")


class TemplateStatusUpdatePayload(BaseModel):
    status: Literal["draft", "published", "archived"] = Field(default="draft")
    author: str = Field(default="system", min_length=1, max_length=120)

# Include the routers (Only include once)
app.include_router(technical_reports_router)
app.include_router(fichas_tecnicas_router)
app.include_router(image_optimizer_router)
app.include_router(compressor_router)
app.include_router(template_editor_router)

@api_router.get("/templates")
async def list_templates():
    templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
    if not os.path.exists(templates_dir):
        file_templates = []
    else:
        file_templates = [f for f in os.listdir(templates_dir) if f.endswith(".html") and f != "report.html"]

    # Include published templates from the block editor
    editor_templates = get_all_published_templates()

    return {"templates": file_templates, "editorTemplates": editor_templates}


@api_router.get("/templates/published")
async def list_published_templates():
    return {"templates": get_all_published_templates()}


@api_router.patch("/templates/{template_id}")
async def update_template_status_endpoint(template_id: str, payload: TemplateStatusUpdatePayload):
    try:
        if payload.status == "published":
            updated = publish_template(template_id, payload.author)
        else:
            updated = set_template_status(template_id, payload.status, payload.author)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"{type(exc).__name__}: {exc}")

    if hasattr(updated, "model_dump"):
        return updated.model_dump()
    return updated.dict()


@api_router.put("/templates/{template_id}")
async def update_template_status_put_endpoint(template_id: str, payload: TemplateStatusUpdatePayload):
    return await update_template_status_endpoint(template_id, payload)


@api_router.get("/templates/{template_id}/render")
async def render_template_by_id(template_id: str):
    record = get_template(template_id)
    if not record:
        raise HTTPException(status_code=404, detail="Template not found")

    compiled_html = get_preview_html(template_id)
    if not compiled_html:
        raise HTTPException(status_code=404, detail="Template content not found")

    latest_version = record.versions[-1] if record.versions else None
    template_json: Optional[Dict[str, Any]] = None
    if latest_version and latest_version.templateJson:
        if hasattr(latest_version.templateJson, "model_dump"):
            template_json = latest_version.templateJson.model_dump()
        else:
            template_json = latest_version.templateJson.dict()

    published_at = None
    for version in reversed(record.versions):
        if version.status == "published":
            published_at = version.diffSummary.get("publishedAt") or version.createdAt
            break

    return {
        "id": record.id,
        "name": record.name,
        "status": record.status,
        "content": compiled_html,
        "templateJson": template_json,
        "publishedAt": published_at,
        "updatedAt": record.updatedAt,
    }

@api_router.get("/templates/{filename}")
async def get_template_content(filename: str):
    # Security: Ensure filename is just a name, not a path
    safe_filename = os.path.basename(filename)
    templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
    file_path = os.path.join(templates_dir, safe_filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Template not found")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return {"name": safe_filename, "content": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/generate-pdf")
async def generate_single_pdf(
    request: Request,
    background_tasks: BackgroundTasks,
    data: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
    customTemplate: Optional[str] = Form(None),
    templateName: Optional[str] = Form(None)
):
    print(f"Received request: data len={len(data)}, files={len(files)}, customTemplate={'yes' if customTemplate else 'no'}, templateName={templateName}")
    try:
        # Parse JSON data
        row_data = json.loads(data)

        # Compatibility bridge: optionally resolve published visual template without changing API contract.
        resolved_custom_template = customTemplate
        resolved_template_name = templateName
        if templateName and not customTemplate:
            compiled_template = get_published_template_by_name(templateName)
            if compiled_template:
                resolved_custom_template = compiled_template
                resolved_template_name = None

        # Validate against Pydantic model to ensure defaults and legacy patching.
        # The root_validator in TechnicalReport handles all legacy/incomplete data
        # normalization (valvulas.impulsion, canastillas '14', missing inspeccion).
        try:
            if isinstance(row_data, dict) and 'valvulas' in row_data:
                validated = TechnicalReport(**row_data)
                row_data = validated.dict()
        except Exception as e:
            print(f"Warning: Model validation failed (continuing with raw data): {e}")

        # Helper to process logo
        async def process_logo(logo_file):
            if not logo_file: return None
            content = await logo_file.read()
            encoded = base64.b64encode(content).decode("utf-8")
            # Detect mime
            mime = "image/jpeg"
            if logo_file.filename.lower().endswith(".png"):
                mime = "image/png"
            return f"data:{mime};base64,{encoded}"

        logo_left_b64 = await process_logo(logoLeft)
        logo_right_b64 = await process_logo(logoRight)

        # Create temp directory for images
        with tempfile.TemporaryDirectory() as temp_dir:
            file_map = {}

            # Save uploaded images to temp dir
            for file in files:
                file_path = os.path.join(temp_dir, file.filename)
                await save_upload(file, file_path)
                file_map[file.filename] = {"name": file.filename, "path": file_path}

            # Use singleton ReportService
            service = request.app.state.report_service
            reports_payload = []

            # Check if this is a batch request (list) or legacy single (dict)
            if isinstance(row_data, list):
                # Expecting [{ "row_data": {...}, "image_filenames": ["a.jpg", ...] }]
                for item in row_data:
                    r_data = item.get("row_data", {})
                    img_names = item.get("image_filenames", [])

                    # Find matching file objects
                    r_files = []
                    for name in img_names:
                        if name in file_map:
                            r_files.append(file_map[name])

                    reports_payload.append({"data": r_data, "files": r_files})
            else:
                # Legacy single mode: all files belong to this row
                # Convert file_map values to list
                r_files = list(file_map.values())
                reports_payload.append({"data": row_data, "files": r_files})

            # Create a temporary file for output that persists (delete=False)
            # This ensures the large PDF is written to disk, not held in RAM.
            # FileResponse will stream it from disk to the client.
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_output:
                output_path = tmp_output.name

            try:
                # Generate PDF to file directly (chunked write)
                await service.generate_batch_pdf(
                    reports_payload,
                    output_path=output_path,
                    logo_left=logo_left_b64,
                    logo_right=logo_right_b64,
                    custom_template_str=resolved_custom_template,
                    template_name=resolved_template_name
                )
            except Exception:
                # If generation fails, ensure we clean up the file immediately
                if os.path.exists(output_path):
                    os.remove(output_path)
                raise

            background_tasks.add_task(_cleanup_file, output_path)

            # Return FileResponse (streams from disk)
            return FileResponse(
                output_path,
                media_type="application/pdf",
                filename="report_consolidado.pdf"
            )

    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format in 'data' field: {str(e)}")
    except Exception as e:
        error_trace = traceback.format_exc()
        print(f"PDF Generation Error:\n{error_trace}")

        # Try to provide a user-friendly message for common errors
        error_msg = str(e)
        if "weasyprint" in error_trace.lower():
            error_msg = f"PDF Generation Engine Error (WeasyPrint): {str(e)}"
        elif "No such file" in error_msg:
             error_msg = f"Missing file resource: {str(e)}"

        # Return 500 with clear details
        raise HTTPException(
            status_code=500,
            detail={
                "message": "Failed to generate PDF",
                "reason": error_msg,
                "type": type(e).__name__
            }
        )

# --- PDF Tools Endpoints ---

@api_router.post("/tools/merge-pdfs")
async def tool_merge_pdfs(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
    strict: bool = Form(False)
):
    print(f"Tool Merge Request: {len(files)} files, strict={strict}")
    _validate_pdf_uploads(files)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_paths = []
            # Save uploaded files (streaming)
            for file in files:
                file_path = os.path.join(temp_dir, file.filename)
                await save_upload(file, file_path)
                input_paths.append(file_path)

            # Output to persistent temp file (survives TemporaryDirectory cleanup)
            final_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name

            # Execute merge
            merge_pdfs_interleaved(
                input_paths=input_paths,
                output_path=final_path,
                strict=strict
            )

        background_tasks.add_task(_cleanup_file, final_path)
        return FileResponse(
            final_path,
            media_type="application/pdf",
            filename="merged_interleaved.pdf"
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Merge Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/tools/merge-pdfs-normal")
async def tool_merge_pdfs_normal(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...)
):
    """
    Merge normal (secuencial) - Une PDFs uno después del otro sin intercalar.
    """
    print(f"Tool Merge Normal Request: {len(files)} files")
    _validate_pdf_uploads(files)

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_paths = []
            # Save uploaded files with unique names to avoid collisions (streaming)
            for idx, file in enumerate(files):
                safe_filename = f"{idx:04d}_{file.filename}"
                file_path = os.path.join(temp_dir, safe_filename)
                file_size = await save_upload(file, file_path)
                input_paths.append(file_path)
                print(f"  Saved file {idx}: {file.filename} -> {safe_filename} ({file_size} bytes)")

            # Output to persistent temp file
            final_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name

            # Execute sequential merge
            merge_pdfs_sequential(
                input_paths=input_paths,
                output_path=final_path
            )

        background_tasks.add_task(_cleanup_file, final_path)
        return FileResponse(
            final_path,
            media_type="application/pdf",
            filename="merged_normal.pdf"
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Merge Normal Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/tools/split-pdf")
async def tool_split_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    mode: str = Form("pages"),  # 'pages' or 'custom'
    pages_per_file: int = Form(1),
    ranges: Optional[str] = Form(None)  # JSON string e.g. "[[1,2], [3,5]]"
):
    print(f"Tool Split Request: {file.filename}, mode={mode}, pages={pages_per_file}, ranges={ranges}")

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # Save input file (streaming)
            input_path = os.path.join(temp_dir, file.filename)
            await save_upload(file, input_path)

            output_dir = os.path.join(temp_dir, "split_output")
            os.makedirs(output_dir, exist_ok=True)

            # Execute split based on mode
            if mode == "custom" and ranges:
                # Parse ranges
                try:
                    range_list = json.loads(ranges)
                    # Convert to list of tuples
                    range_tuples = [(r[0], r[1]) for r in range_list]
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid ranges format: {e}")

                output_files = split_pdf_by_ranges(
                    input_path=input_path,
                    output_dir=output_dir,
                    ranges=range_tuples
                )
            else:
                # Default Pages Per File mode
                output_files = split_pdf(
                    input_path=input_path,
                    output_dir=output_dir,
                    pages_per_file=pages_per_file
                )

            # Create ZIP to persistent temp file (not BytesIO)
            final_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip").name
            with zipfile.ZipFile(final_zip, mode='w', compression=zipfile.ZIP_DEFLATED) as zip_file:
                for f_path in output_files:
                    zip_file.write(f_path, arcname=os.path.basename(f_path))

        background_tasks.add_task(_cleanup_file, final_zip)
        return FileResponse(
            final_zip,
            media_type="application/zip",
            filename=f"{os.path.splitext(file.filename)[0]}_split.zip"
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Split Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Include the API router
app.include_router(api_router)


# SERVING FRONTEND (React) - For Hugging Face Spaces / Docker
# If 'static' folder exists (created by Dockerfile), serve it.
if os.path.exists("static"):
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")

    @app.get("/technical-reports")
    async def serve_page_technical():
        return FileResponse("static/technical-reports.html")

    # Catch-all for SPA (must be last)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # Allow API calls to pass through (just in case)
        if full_path.startswith("api/"):
             raise HTTPException(status_code=404, detail="Not Found")

        # Check if file exists in static (e.g. favicon.ico, public assets)
        path = os.path.join("static", full_path)
        if os.path.exists(path) and os.path.isfile(path):
            return FileResponse(path)

        # Fallback to index.html for React Router
        return FileResponse("static/index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)
