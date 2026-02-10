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
    "aggressive": "/ebook",   # Uses /ebook base + custom DPI overrides below
    "screen": "/screen",
    "ebook": "/ebook",
    "printer": "/printer",
    "prepress": "/prepress",
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

def _reduce_image_quality(page, quality: str) -> None:
    """Reduce quality of images embedded in a PDF page via pypdf.

    Iterates over /XObject resources and re-encodes any image as JPEG with a
    quality factor that matches the requested compression level.  This is a
    best-effort operation — any individual image failure is silently skipped so
    the rest of the page can still benefit from stream compression.
    """
    try:
        from PIL import Image as PILImage
    except ImportError:
        return  # Pillow not available — skip image reduction

    quality_map = {"aggressive": 30, "screen": 40, "ebook": 55, "printer": 75, "prepress": 90}
    jpeg_quality = quality_map.get(quality, 55)

    try:
        resources = page.get("/Resources")
        if not resources:
            return
        xobjects = resources.get("/XObject")
        if not xobjects:
            return
        xobj_dict = xobjects.get_object()
        for name in xobj_dict:
            obj = xobj_dict[name].get_object()
            if obj.get("/Subtype") != "/Image":
                continue
            try:
                w = int(obj["/Width"])
                h = int(obj["/Height"])
                color_space = obj.get("/ColorSpace", "/DeviceRGB")
                cs_str = str(color_space)

                data = obj.get_data()
                if "Gray" in cs_str:
                    mode, channels = "L", 1
                elif "CMYK" in cs_str:
                    mode, channels = "CMYK", 4
                else:
                    mode, channels = "RGB", 3

                expected = w * h * channels
                if len(data) < expected:
                    continue  # Compressed or unusual format — skip

                img = PILImage.frombytes(mode, (w, h), data[:expected])
                if mode == "CMYK":
                    img = img.convert("RGB")

                import io as _io
                buf = _io.BytesIO()
                img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
                obj._data = buf.getvalue()
                from pypdf.generic import NameObject, NumberObject
                obj[NameObject("/Filter")] = NameObject("/DCTDecode")
                obj[NameObject("/Length")] = NumberObject(len(obj._data))
            except Exception:
                continue  # skip problematic images
    except Exception:
        return


def compress_pdf_pypdf(input_path: str, output_path: str, quality: str = "ebook") -> bool:
    """
    Fallback PDF compression using pypdf.
    Rewrites the PDF removing unused objects, compressing streams,
    reducing image quality, and eliminating duplicates.
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

        # Reduce embedded image quality (best-effort)
        for page in writer.pages:
            _reduce_image_quality(page, quality)

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

    headers["X-Filename"] = quote(filename, safe="")

    if error_msg:
        headers["X-Error"] = quote(error_msg, safe="")

    return headers


def compress_pdf_ghostscript(input_path: str, output_path: str, quality: str = "ebook") -> bool:
    """
    Compress PDF using Ghostscript with advanced optimization flags.
    Returns True if successful.
    """
    gs_quality = GS_QUALITY_SETTINGS.get(quality, "/ebook")
    available, gs_cmd = is_ghostscript_available()

    if not available or not gs_cmd:
        return False

    cmd = [
        gs_cmd,
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        f"-dPDFSETTINGS={gs_quality}",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        # ── Advanced compression flags ──
        "-dDetectDuplicateImages=true",
        "-dCompressFonts=true",
        "-dSubsetFonts=true",
        "-dColorImageDownsampleType=/Bicubic",
        "-dGrayImageDownsampleType=/Bicubic",
        "-dMonoImageDownsampleType=/Bicubic",
        "-dAutoRotatePages=/None",
        "-dColorConversionStrategy=/LeaveColorUnchanged",
        "-dDownsampleColorImages=true",
        "-dDownsampleGrayImages=true",
        "-dDownsampleMonoImages=true",
        "-dOptimize=true",
    ]

    # Apply custom DPI overrides if defined for this quality level
    dpi = GS_DPI_OVERRIDES.get(quality)
    if dpi:
        cmd.extend([
            f"-dColorImageResolution={dpi}",
            f"-dGrayImageResolution={dpi}",
            f"-dMonoImageResolution={dpi}",
        ])

    cmd.extend([f"-sOutputFile={output_path}", input_path])

    try:
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
    pdf_quality: str = Form(default="aggressive"),
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
    pdf_quality: str = Form(default="aggressive"),
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
