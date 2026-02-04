"""
PDF Compressor Backend Router
Provides endpoints for PDF file compression using Ghostscript.
"""

import io
import logging
import os
import subprocess
import tempfile
import zipfile
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/compressor", tags=["compressor"])

# Ghostscript quality settings mapping
GS_QUALITY_SETTINGS = {
    "screen": "/screen",
    "ebook": "/ebook",
    "printer": "/printer",
    "prepress": "/prepress",
}

# Ghostscript command candidates
GS_COMMANDS = ["gs", "gswin64c", "gswin32c"]


def is_ghostscript_available() -> tuple[bool, Optional[str]]:
    """Check if Ghostscript is available and return the command to use."""
    for cmd in GS_COMMANDS:
        try:
            result = subprocess.run([cmd, "--version"], capture_output=True, timeout=5)
            if result.returncode == 0:
                return True, cmd
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            continue
    return False, None


def safe_filename_header(filename: str) -> str:
    """Create a safe Content-Disposition header value."""
    try:
        filename.encode("ascii")
        return f'attachment; filename="{filename}"'
    except UnicodeEncodeError:
        encoded = quote(filename, safe="")
        return f"attachment; filename*=UTF-8''{encoded}"


def create_compression_headers(
    filename: str,
    original_size: int,
    compressed_size: int,
    error_msg: Optional[str] = None,
) -> dict[str, str]:
    """Create standardized headers for compressed file response."""
    headers: dict[str, str] = {
        "Content-Disposition": safe_filename_header(filename),
        "X-Original-Size": str(original_size),
        "X-Compressed-Size": str(compressed_size),
    }

    if original_size > 0:
        reduction = round((original_size - compressed_size) / original_size * 100, 1)
        headers["X-Reduction-Percent"] = str(reduction)
    else:
        headers["X-Reduction-Percent"] = "0"

    headers["X-Filename"] = filename

    if error_msg:
        headers["X-Error"] = error_msg

    return headers


def compress_pdf_ghostscript(input_path: str, output_path: str, quality: str = "ebook") -> bool:
    """
    Compress PDF using Ghostscript.
    Returns True if successful.
    """
    gs_quality = GS_QUALITY_SETTINGS.get(quality, "/ebook")
    available, gs_cmd = is_ghostscript_available()

    if not available or not gs_cmd:
        return False

    try:
        subprocess.run(
            [
                gs_cmd,
                "-sDEVICE=pdfwrite",
                "-dCompatibilityLevel=1.4",
                f"-dPDFSETTINGS={gs_quality}",
                "-dNOPAUSE",
                "-dQUIET",
                "-dBATCH",
                f"-sOutputFile={output_path}",
                input_path,
            ],
            check=True,
            capture_output=True,
            timeout=120,
        )
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        logger.error(f"Ghostscript error: {e}")
        return False


def validate_pdf_file(filename: str) -> bool:
    """Validate if file has PDF extension."""
    ext = os.path.splitext(filename)[1].lower()
    return ext == ".pdf"


async def _process_single_pdf(
    file: UploadFile,
    temp_dir: str,
    pdf_quality: str,
) -> tuple[str, bytes, dict]:
    """
    Process a single PDF file for compression.
    Returns: (filename, content, result_metadata)
    """
    original_content = await file.read()
    original_size = len(original_content)
    filename = file.filename or "documento.pdf"

    # Validate PDF extension
    if not validate_pdf_file(filename):
        return filename, original_content, {
            "filename": filename,
            "original_size": original_size,
            "compressed_size": original_size,
            "reduction_percent": 0,
            "success": False,
            "error": "Solo se admiten archivos PDF",
        }

    compressed_content: Optional[bytes] = None
    success = False
    error_msg: Optional[str] = None

    try:
        input_path = os.path.join(temp_dir, f"input_{hash(filename)}.pdf")
        output_path = os.path.join(temp_dir, f"output_{hash(filename)}.pdf")

        with open(input_path, "wb") as f:
            f.write(original_content)

        if compress_pdf_ghostscript(input_path, output_path, pdf_quality):
            with open(output_path, "rb") as f:
                compressed_content = f.read()
            success = True
        else:
            compressed_content = original_content
            error_msg = "Ghostscript no disponible"

    except Exception as e:
        compressed_content = original_content
        error_msg = str(e)
        logger.error(f"Error compressing {filename}: {e}")

    compressed_size = len(compressed_content) if compressed_content else original_size

    # Use original if compressed is not smaller
    if compressed_content and compressed_size >= original_size:
        compressed_content = original_content
        compressed_size = original_size
        if success:
            error_msg = "Ya optimizado"

    reduction_percent = (
        ((original_size - compressed_size) / original_size * 100)
        if original_size > 0
        else 0
    )

    result = {
        "filename": filename,
        "original_size": original_size,
        "compressed_size": compressed_size,
        "reduction_percent": round(reduction_percent, 1),
        "success": success and compressed_size < original_size,
        "error": error_msg,
    }

    return filename, compressed_content or original_content, result


@router.post("/compress")
async def compress_pdfs(
    files: list[UploadFile] = File(...),
    pdf_quality: str = Form(default="ebook"),
) -> Response:
    """
    Compress multiple PDF files.
    Returns: ZIP file with compressed PDFs
    """
    if not files:
        raise HTTPException(status_code=400, detail="No se proporcionaron archivos")

    results: list[dict] = []
    compressed_files: list[tuple[str, bytes]] = []

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            for file in files:
                filename, content, result = await _process_single_pdf(
                    file, temp_dir, pdf_quality
                )
                results.append(result)
                compressed_files.append((filename, content))

            # Create ZIP
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED) as zip_file:
                for fname, content in compressed_files:
                    zip_file.writestr(fname, content)

            zip_buffer.seek(0)

            return Response(
                content=zip_buffer.read(),
                media_type="application/zip",
                headers={"Content-Disposition": safe_filename_header("pdfs_comprimidos.zip")},
            )

    except Exception as e:
        logger.exception("Error in compression")
        raise HTTPException(status_code=500, detail=f"Error al comprimir: {str(e)}")


@router.post("/compress-single")
async def compress_single_pdf(
    file: UploadFile = File(...),
    pdf_quality: str = Form(default="ebook"),
) -> Response:
    """
    Compress a single PDF file and return it directly.
    """
    original_content = await file.read()
    original_size = len(original_content)
    filename = file.filename or "documento.pdf"

    # Validate PDF extension
    if not validate_pdf_file(filename):
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de archivo no soportado. Solo se admiten archivos PDF.",
        )

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = os.path.join(temp_dir, "input.pdf")
            output_path = os.path.join(temp_dir, "output.pdf")

            with open(input_path, "wb") as f:
                f.write(original_content)

            if compress_pdf_ghostscript(input_path, output_path, pdf_quality):
                with open(output_path, "rb") as f:
                    compressed_content = f.read()

                compressed_size = len(compressed_content)

                # Return original if compressed is larger
                if compressed_size >= original_size:
                    return Response(
                        content=original_content,
                        media_type="application/pdf",
                        headers=create_compression_headers(filename, original_size, original_size),
                    )

                return Response(
                    content=compressed_content,
                    media_type="application/pdf",
                    headers=create_compression_headers(filename, original_size, compressed_size),
                )
            else:
                # Ghostscript not available - return original with error header
                return Response(
                    content=original_content,
                    media_type="application/pdf",
                    headers=create_compression_headers(
                        filename, original_size, original_size, "Ghostscript no disponible para comprimir PDFs"
                    ),
                )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error compressing PDF")
        raise HTTPException(status_code=500, detail=f"Error al comprimir: {str(e)}")


@router.get("/health")
async def health_check() -> dict:
    """Health check endpoint."""
    gs_available, _ = is_ghostscript_available()

    return {
        "status": "ok",
        "service": "compressor",
        "capabilities": {
            "pdfs": gs_available,
        },
        "ghostscript_available": gs_available,
    }
