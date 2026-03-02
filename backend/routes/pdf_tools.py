"""PDF tools endpoints: merge (interleaved/sequential), split, and organize."""

import json
import os
import tempfile
import traceback
import zipfile
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile  # type: ignore
from fastapi.responses import FileResponse  # type: ignore

from pdf_tools import merge_pdfs_interleaved, merge_pdfs_sequential, split_pdf, split_pdf_by_ranges, organize_pdf  # type: ignore
from utils.file_utils import save_upload  # type: ignore

router = APIRouter(prefix="/api", tags=["pdf-tools"])


# --- Validation helpers ---

def _cleanup_file(path: str):
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception as e:
        print(f"Error removing temp file {path}: {e}")


def _validate_pdf_file(file: UploadFile) -> bool:
    """Valida PDF por magic number sin consumir el stream de forma permanente."""
    try:
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


# --- Endpoints ---

@router.post("/tools/merge-pdfs")
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
            for idx, file in enumerate(files):
                # Avoid collisions when users upload files with the same name.
                safe_filename = f"{idx:04d}_{file.filename}"
                file_path = os.path.join(temp_dir, safe_filename)
                await save_upload(file, file_path)
                input_paths.append(file_path)

            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            final_path = tmp.name
            tmp.close()

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

@router.post("/tools/merge-pdfs-normal")
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
            for idx, file in enumerate(files):
                safe_filename = f"{idx:04d}_{file.filename}"
                file_path = os.path.join(temp_dir, safe_filename)
                file_size = await save_upload(file, file_path)
                input_paths.append(file_path)
                print(f"  Saved file {idx}: {file.filename} -> {safe_filename} ({file_size} bytes)")

            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            final_path = tmp.name
            tmp.close()

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

@router.post("/tools/split-pdf")
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
            input_path = os.path.join(temp_dir, file.filename)
            await save_upload(file, input_path)

            output_dir = os.path.join(temp_dir, "split_output")
            os.makedirs(output_dir, exist_ok=True)

            if mode == "custom" and ranges:
                try:
                    range_list = json.loads(ranges)
                    range_tuples = [(r[0], r[1]) for r in range_list]
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Invalid ranges format: {e}")

                output_files = split_pdf_by_ranges(
                    input_path=input_path,
                    output_dir=output_dir,
                    ranges=range_tuples
                )
            else:
                output_files = split_pdf(
                    input_path=input_path,
                    output_dir=output_dir,
                    pages_per_file=pages_per_file
                )

            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
            final_zip = tmp.name
            tmp.close()
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

@router.post("/tools/organize-pdf")
async def tool_organize_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    operations: str = Form(...),
    mode: str = Form("organize"),
    ranges: Optional[str] = Form(None),
):
    """
    Endpoint para la tab ORGANIZAR de pdf-tools.html.
    Recibe el archivo PDF + operations JSON del frontend (executeOrganize()).
    """
    try:
        ops = json.loads(operations)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid 'operations' JSON")

    page_order = ops.get("pageOrder", [])
    rotations = ops.get("rotations", [])
    cuts = ops.get("cuts", [])

    if not page_order:
        raise HTTPException(status_code=400, detail="pageOrder is empty")

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = os.path.join(temp_dir, file.filename)
            await save_upload(file, input_path)

            if mode == "organize-split" and cuts:
                output_paths = organize_pdf(
                    input_path=input_path,
                    output_path=temp_dir,
                    page_order=page_order,
                    rotations=rotations,
                    cuts=cuts,
                )["output_paths"]

                final_zip = tempfile.NamedTemporaryFile(delete=False, suffix=".zip").name
                with zipfile.ZipFile(final_zip, "w", zipfile.ZIP_DEFLATED) as zf:
                    for i, p in enumerate(output_paths, 1):
                        zf.write(p, arcname=f"part_{i:02d}.pdf")

                background_tasks.add_task(_cleanup_file, final_zip)
                return FileResponse(
                    final_zip,
                    media_type="application/zip",
                    filename="organized_split.zip",
                )
            else:
                final_path = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf").name
                organize_pdf(
                    input_path=input_path,
                    output_path=final_path,
                    page_order=page_order,
                    rotations=rotations,
                    cuts=None,
                )

                background_tasks.add_task(_cleanup_file, final_path)
                return FileResponse(
                    final_path,
                    media_type="application/pdf",
                    filename="organized.pdf",
                )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Organize Error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
