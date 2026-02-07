"""
PDF Compressor Backend Router
Provides endpoints for PDF file compression using Ghostscript.
Falls back to pypdf-based compression when Ghostscript is not available.
"""

import io
import logging
import os
import shutil
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
    "aggressive": "/ebook",  # Uses /ebook base + custom DPI overrides below
    "screen": "/screen",
    "ebook": "/ebook",
    "printer": "/printer",
    "prepress": "/prepress",
}

# Extra Ghostscript params tuned for stronger compression with acceptable quality.
# Values are conservative for screen/ebook presets to avoid excessive visual loss.
GS_COMPRESSION_TUNING = {
    "aggressive": {"resolution": 110, "jpeg_quality": 45, "mono_resolution": 600},
    "screen": {"resolution": 96, "jpeg_quality": 50, "mono_resolution": 600},
    "ebook": {"resolution": 144, "jpeg_quality": 60, "mono_resolution": 600},
    "printer": {"resolution": 300, "jpeg_quality": 75, "mono_resolution": 1200},
    "prepress": {"resolution": 300, "jpeg_quality": 85, "mono_resolution": 1200},
}

# Custom DPI overrides per quality level (applied on top of -dPDFSETTINGS)
# When set, these override the default DPI that the PDFSETTINGS preset uses.
GS_DPI_OVERRIDES: dict[str, int] = {
    "aggressive": 100,
}

# Ghostscript command candidates (includes absolute paths for restricted PATH envs)
GS_COMMANDS = [
    "gs",
    "/usr/bin/gs",
    "/usr/local/bin/gs",
    "gswin64c",
    "gswin32c",
]

# ── Ghostscript detection cache ──────────────────────────────────────
# Evaluated once at first use, avoids subprocess overhead on every request.
_gs_cache: dict = {"checked": False, "available": False, "cmd": None}


def is_ghostscript_available() -> tuple[bool, Optional[str]]:
    """Check if Ghostscript is available and return the command to use.
    Result is cached after first successful/failed probe."""
    if _gs_cache["checked"]:
        return _gs_cache["available"], _gs_cache["cmd"]

    for cmd in GS_COMMANDS:
        try:
            result = subprocess.run(
                [cmd, "--version"],
                capture_output=True,
                timeout=5,
            )
            if result.returncode == 0:
                version = result.stdout.decode().strip()
                logger.info(f"Ghostscript found: {cmd} (version {version})")
                _gs_cache.update(checked=True, available=True, cmd=cmd)
                return True, cmd
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired, PermissionError):
            continue

    # Log diagnostic info when GS is not found
    logger.warning("Ghostscript not found in any candidate path. Falling back to pypdf.")
    logger.warning(f"  PATH = {os.environ.get('PATH', '(not set)')}")
    gs_exists = shutil.which("gs")
    logger.warning(f"  shutil.which('gs') = {gs_exists}")
    _gs_cache.update(checked=True, available=False, cmd=None)
    return False, None


# ── pypdf fallback compressor ────────────────────────────────────────

def compress_pdf_pypdf(input_path: str, output_path: str, quality: str = "ebook") -> bool:
    """
    Fallback PDF compression using pypdf.
    Rewrites the PDF removing unused objects, compressing streams,
    and reducing image quality where possible.
    Returns True if output file was created successfully.
    """
    try:
        from pypdf import PdfReader, PdfWriter

        reader = PdfReader(input_path)
        writer = PdfWriter()

        # Copy all pages
        for page in reader.pages:
            writer.add_page(page)

        # Copy metadata
        if reader.metadata:
            writer.add_metadata(reader.metadata)

        # Remove duplication & compress streams
        writer.compress_identical_objects(remove_identicals=True, remove_orphans=True)

        # Compress all content streams
        for page in writer.pages:
            page.compress_content_streams()

        # Write compressed output
        with open(output_path, "wb") as f:
            writer.write(f)

        return True

    except Exception as e:
        logger.error(f"pypdf compression error: {e}")
        return False


# ── Helpers ──────────────────────────────────────────────────────────

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
    tuning = GS_COMPRESSION_TUNING.get(quality, GS_COMPRESSION_TUNING["ebook"])
    dpi_override = GS_DPI_OVERRIDES.get(quality)
    color_resolution = dpi_override or tuning["resolution"]
    available, gs_cmd = is_ghostscript_available()

    if not available or not gs_cmd:
        return False

    try:
        cmd = [
            gs_cmd,
            "-sDEVICE=pdfwrite",
            "-dCompatibilityLevel=1.4",
            f"-dPDFSETTINGS={gs_quality}",
            "-dDetectDuplicateImages=true",
            "-dCompressFonts=true",
            "-dOptimize=true",
            "-dDownsampleColorImages=true",
            "-dDownsampleGrayImages=true",
            "-dDownsampleMonoImages=true",
            f"-dColorImageResolution={color_resolution}",
            f"-dGrayImageResolution={color_resolution}",
            f"-dMonoImageResolution={tuning['mono_resolution']}",
            f"-dJPEGQ={tuning['jpeg_quality']}",
            "-dNOPAUSE",
            "-dQUIET",
            "-dBATCH",
            f"-sOutputFile={output_path}",
            input_path,
        ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        logger.error(f"Ghostscript error: {e}")
        return False


def _compress_pdf(input_path: str, output_path: str, quality: str = "ebook") -> tuple[bool, str]:
    """
    Compress a PDF trying Ghostscript first, falling back to pypdf.
    Returns (success, method_used).
    """
    # 1. Try Ghostscript (best quality compression)
    if compress_pdf_ghostscript(input_path, output_path, quality):
        return True, "ghostscript"

    # 2. Fallback: pypdf-based compression
    logger.info("Using pypdf fallback for compression")
    if compress_pdf_pypdf(input_path, output_path, quality):
        return True, "pypdf"

    return False, "none"


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

        ok, method = _compress_pdf(input_path, output_path, pdf_quality)
        if ok:
            with open(output_path, "rb") as f:
                compressed_content = f.read()
            success = True
            if method == "pypdf":
                error_msg = None  # pypdf is a valid method, not an error
        else:
            compressed_content = original_content
            error_msg = "No se pudo comprimir el PDF"

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

            ok, method = _compress_pdf(input_path, output_path, pdf_quality)
            if ok:
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
                # Neither GS nor pypdf worked — return original with informative header
                return Response(
                    content=original_content,
                    media_type="application/pdf",
                    headers=create_compression_headers(
                        filename, original_size, original_size, "No se pudo comprimir el PDF"
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
    gs_available, gs_cmd = is_ghostscript_available()

    return {
        "status": "ok",
        "service": "compressor",
        "capabilities": {
            "pdfs": True,  # Always true now (pypdf fallback)
            "ghostscript": gs_available,
        },
        "ghostscript_available": gs_available,
        "ghostscript_cmd": gs_cmd,
        "fallback": "pypdf" if not gs_available else None,
    }
