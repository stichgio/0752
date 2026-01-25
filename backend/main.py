from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException, APIRouter
import base64
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
import pandas as pd
import io # Keep io as it's used in /upload
import shutil
import os
import uuid
import json
import tempfile
from typing import List, Optional
from report_service import run_batch_generation, ReportService
from pdf_tools import merge_pdfs_interleaved, split_pdf, split_pdf_by_ranges
import zipfile


app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "¡El backend está vivo y funcionando!", "status": "ok"}

# Enable CORS for frontend (separate deployment on Vercel)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for Vercel/HuggingFace deployment
    allow_credentials=False,  # Must be False when using wildcard origins
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global storage (for demo purposes)
current_data = {"df": None}
jobs = {}

# Create API Router with prefix
api_router = APIRouter(prefix="/api")

@api_router.get("/templates")
async def list_templates():
    templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
    if not os.path.exists(templates_dir):
        return {"templates": []}
    
    templates = [f for f in os.listdir(templates_dir) if f.endswith(".html") and f != "report.html"]
    return {"templates": templates}

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
    background_tasks: BackgroundTasks,
    data: str = Form(...),
    files: List[UploadFile] = File(default=[]),
    logoLeft: Optional[UploadFile] = File(None),
    logoRight: Optional[UploadFile] = File(None),
    customTemplate: Optional[str] = Form(None)
):
    print(f"Received request: data len={len(data)}, files={len(files)}, customTemplate={'yes' if customTemplate else 'no'}")
    try:
        # Parse JSON data
        row_data = json.loads(data)
        
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
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                file_map[file.filename] = {"name": file.filename, "path": file_path}

            # Prepare reports list
            service = ReportService()
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
                    custom_template_str=customTemplate
                )
            except Exception:
                # If generation fails, ensure we clean up the file immediately
                if os.path.exists(output_path):
                    os.remove(output_path)
                raise

            # Cleanup task (runs after response is sent)
            def cleanup_file(path: str):
                try:
                    if os.path.exists(path):
                        os.remove(path)
                except Exception as e:
                    print(f"Error removing temp file {path}: {e}")

            background_tasks.add_task(cleanup_file, output_path)

            # Return FileResponse (streams from disk)
            return FileResponse(
                output_path, 
                media_type="application/pdf", 
                filename="report_consolidado.pdf"
            )
            
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON format in 'data' field: {str(e)}")
    except Exception as e:
        import traceback
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

@api_router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    contents = await file.read()
    if file.filename.endswith('.csv'):
        df = pd.read_csv(io.BytesIO(contents))
    elif file.filename.endswith(('.xls', '.xlsx')):
        df = pd.read_excel(io.BytesIO(contents))
    else:
        raise HTTPException(status_code=400, detail="Invalid file format")
    
    current_data["df"] = df
    current_data["headers"] = df.columns.tolist()
    
    return {"headers": current_data["headers"], "rowCount": len(df)}

def background_job(job_id: str, records: list, folder_path: str, id_column: str, output_folder: str):
    try:
        results = run_batch_generation(records, folder_path, id_column, output_folder)
        jobs[job_id] = {
            "status": "completed",
            "total": len(records),
            "success": sum(1 for r in results if r["status"] == "success"),
            "results": results
        }
    except Exception as e:
        jobs[job_id] = {
            "status": "failed",
            "error": str(e)
        }

@api_router.post("/generate")
async def generate_reports(
    background_tasks: BackgroundTasks,
    folder_path: str = Form(...),
    id_column: str = Form(...),
    output_folder: str = Form(...)
):
    if current_data["df"] is None:
        raise HTTPException(status_code=400, detail="No data uploaded")
    
    if not os.path.exists(folder_path):
        raise HTTPException(status_code=400, detail="Local folder path does not exist")

    job_id = str(uuid.uuid4())
    os.makedirs(output_folder, exist_ok=True)

    records = current_data["df"].to_dict('records')
    jobs[job_id] = {"status": "processing", "total": len(records), "success": 0}
    
    background_tasks.add_task(background_job, job_id, records, folder_path, id_column, output_folder)
    
    return {"job_id": job_id}

@api_router.get("/status/{job_id}")
async def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    return jobs[job_id]

# --- PDF Tools Endpoints ---

@api_router.post("/tools/merge-pdfs")
async def tool_merge_pdfs(
    files: List[UploadFile] = File(...),
    strict: bool = Form(False)
):
    print(f"Tool Merge Request: {len(files)} files, strict={strict}")
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="Se requieren al menos 2 archivos PDF")

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_paths = []
            # Save uploaded files
            for file in files:
                file_path = os.path.join(temp_dir, file.filename)
                with open(file_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                input_paths.append(file_path)

            # Define output path
            output_path = os.path.join(temp_dir, "merged_output.pdf")

            # Execute merge
            result = merge_pdfs_interleaved(
                input_paths=input_paths,
                output_path=output_path,
                strict=strict
            )

            # Read result bytes
            with open(output_path, "rb") as f:
                pdf_bytes = f.read()

            return Response(
                content=pdf_bytes, 
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=merged_interleaved.pdf"}
            )
            
    except Exception as e:
        print(f"Merge Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/tools/split-pdf")
async def tool_split_pdf(
    file: UploadFile = File(...),
    mode: str = Form("pages"),  # 'pages' or 'custom'
    pages_per_file: int = Form(1),
    ranges: Optional[str] = Form(None)  # JSON string e.g. "[[1,2], [3,5]]"
):
    print(f"Tool Split Request: {file.filename}, mode={mode}, pages={pages_per_file}, ranges={ranges}")
    
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # Save input file
            input_path = os.path.join(temp_dir, file.filename)
            with open(input_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            
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

            # Create ZIP of results
            zip_io = io.BytesIO()
            with zipfile.ZipFile(zip_io, mode='w', compression=zipfile.ZIP_DEFLATED) as zip_file:
                for f_path in output_files:
                    zip_file.write(f_path, arcname=os.path.basename(f_path))
            
            zip_io.seek(0)
            
            return Response(
                content=zip_io.read(), 
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename={os.path.splitext(file.filename)[0]}_split.zip"}
            )

    except Exception as e:
        print(f"Split Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# Include the API router
# Include the API router
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=7860)