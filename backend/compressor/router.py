"""
PDF Compressor Backend Router
Provides endpoints for PDF file compression using Ghostscript.
Falls back to pypdf-based compression when Ghostscript is not available.
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import shutil
import subprocess
import tempfile
import time
import zipfile
from typing import Any, Optional
from urllib.parse import quote

from fastapi import APIRouter, File, Form, HTTPException, UploadFile  # type: ignore
from fastapi.responses import Response  # type: ignore

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/compressor", tags=["compressor"])

MAX_FILES_PER_REQUEST = 20

# Ghostscript quality settings mapping
GS_QUALITY_SETTINGS = {
    "ultra": "/screen",
    "aggressive": "/ebook",   # Uses /ebook base + custom DPI overrides below
    "screen": "/screen",
    "ebook": "/ebook",
    "printer": "/printer",
    "prepress": "/prepress",
}

# Custom DPI overrides per quality level (color/gray channels)
GS_DPI_OVERRIDES: dict[str, int] = {
    "ultra": 72,
    "aggressive": 100,
}

# Mono channel DPI overrides (ultra uses higher mono DPI for readability)
GS_MONO_DPI_OVERRIDES: dict[str, int] = {
    "ultra": 100,
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

    logger.warning("Ghostscript not found in any candidate path. Falling back to pypdf.")
    logger.warning(f"  PATH = {os.environ.get('PATH', '(not set)')}")
    gs_exists = shutil.which("gs")
    logger.warning(f"  shutil.which('gs') = {gs_exists}")
    _gs_cache.update(checked=True, available=False, cmd=None)
    return False, None


# ── PDF validation ────────────────────────────────────────────────────

def validate_pdf_signature(content: bytes) -> bool:
    """Validate PDF magic number (%PDF-)."""
    # Allow byte array slicing
    return len(content) >= 5 and content[:5] == b'%PDF-'


# ── Content analysis ─────────────────────────────────────────────────

def analyze_pdf_content(input_path: str) -> dict:
    """
    Analyze the PDF to infer whether it is mostly text, images, or mixed.
    Uses pypdf to count pages and detect XObject images.
    Returns: { "has_images": bool, "page_count": int, "image_count": int, "type": "text"|"images"|"mixed" }
    """
    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(input_path)
        page_count = len(reader.pages)
        image_count = 0

        for page in reader.pages:
            try:
                resources = page.get("/Resources")
                if not resources:
                    continue
                xobjects = resources.get("/XObject")
                if not xobjects:
                    continue
                xobj_dict = xobjects.get_object()
                for name in xobj_dict:
                    try:
                        obj = xobj_dict[name].get_object()
                        if obj.get("/Subtype") == "/Image":
                            # Allow basic math
                            image_count += 1
                    except Exception:
                        continue
            except Exception:
                continue

        if image_count == 0:
            content_type = "text"
        elif image_count >= max(page_count, 1):
            content_type = "images"
        else:
            content_type = "mixed"

        return {
            "has_images": image_count > 0,
            "page_count": page_count,
            "image_count": image_count,
            "type": content_type,
        }
    except Exception:
        return {"has_images": True, "page_count": 0, "image_count": 0, "type": "mixed"}


# ── pypdf fallback compressor ────────────────────────────────────────

def _reduce_image_quality(page, quality: str) -> None:
    """Reduce quality of images embedded in a PDF page via pypdf.

    Iterates over /XObject resources and re-encodes any image as JPEG with a
    quality factor that matches the requested compression level.  This is a
    best-effort operation — any individual image failure is silently skipped so
    the rest of the page can still benefit from stream compression.
    """
    try:
        from PIL import Image as PILImage  # type: ignore
    except ImportError:
        return  # Pillow not available — skip image reduction

    quality_map = {"ultra": 20, "aggressive": 30, "screen": 40, "ebook": 55, "printer": 75, "prepress": 90}
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
                from pypdf.generic import NameObject, NumberObject  # type: ignore
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
    reducing image quality, eliminating duplicates, and cleaning metadata.
    Returns True if output file was created successfully.
    """
    try:
        from pypdf import PdfReader, PdfWriter  # type: ignore

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

        # Clean unnecessary metadata
        writer.add_metadata({
            '/Producer': '',
            '/Creator': '',
            '/CreationDate': '',
            '/ModDate': '',
        })

        # For aggressive/ultra modes, also remove embedded thumbnails
        if quality in ('aggressive', 'ultra'):
            for page in writer.pages:
                try:
                    if '/Thumb' in page:
                        del page['/Thumb']
                except Exception:
                    pass

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
    compression_method: Optional[str] = None,
    processing_time: Optional[float] = None,
) -> dict[str, str]:
    """Create standardized headers for compressed file response."""
    headers: dict[str, str] = {
        "Content-Disposition": safe_filename_header(filename),
        "X-Original-Size": str(original_size),
        "X-Compressed-Size": str(compressed_size),
    }

    if original_size > 0:
        reduction = round(float(original_size - compressed_size) / original_size * 100, 1)  # type: ignore
        headers["X-Reduction-Percent"] = str(reduction)
    else:
        headers["X-Reduction-Percent"] = "0"

    headers["X-Filename"] = quote(filename, safe="")

    if error_msg:
        headers["X-Error"] = quote(error_msg, safe="")

    if compression_method:
        headers["X-Compression-Method"] = compression_method

    if processing_time is not None:
        headers["X-Processing-Time"] = f"{processing_time:.2f}"

    return headers


def compress_pdf_ghostscript(
    input_path: str,
    output_path: str,
    quality: str = "ebook",
    file_size_bytes: int = 0,
    content_info: Optional[dict] = None,
) -> tuple[bool, str]:
    """
    Compress PDF using Ghostscript with advanced optimization flags.
    Returns (success, failure_reason). failure_reason is "" on success,
    or "encrypted" when the PDF is password-protected.
    """
    gs_quality = GS_QUALITY_SETTINGS.get(quality, "/ebook")
    available, gs_cmd = is_ghostscript_available()

    if not available or not gs_cmd:
        return False, ""

    if content_info is None:
        content_info = analyze_pdf_content(input_path)

    # Determine color conversion strategy based on quality and content type
    if quality == "ultra" or content_info.get("type") == "text":
        color_strategy = "/Gray"
    else:
        color_strategy = "/LeaveColorUnchanged"

    cmd: list[str] = [
        str(gs_cmd),
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
        f"-dColorConversionStrategy={color_strategy}",
        "-dDownsampleColorImages=true",
        "-dDownsampleGrayImages=true",
        "-dDownsampleMonoImages=true",
        "-dOptimize=true",
    ]

    # Ultra-specific extra flags
    if quality == "ultra":
        cmd.extend([
            "-dColorImageFilter=/DCTEncode",
            "-dGrayImageFilter=/DCTEncode",
            "-dEmbedAllFonts=false",
            "-dConvertCMYKImagesToRGB=true",
        ])

    # Content-type specific flags: tune JPEG quality for image-heavy PDFs
    if content_info.get("type") == "images":
        jpeg_q_map = {"ultra": 40, "aggressive": 55, "screen": 60, "ebook": 75, "printer": 85, "prepress": 95}
        cmd.append(f"-dJPEGQ={jpeg_q_map.get(quality, 75)}")

    # Apply custom DPI overrides if defined for this quality level
    dpi = GS_DPI_OVERRIDES.get(quality)
    if dpi:
        mono_dpi = GS_MONO_DPI_OVERRIDES.get(quality, dpi)
        cmd.extend([
            f"-dColorImageResolution={dpi}",
            f"-dGrayImageResolution={dpi}",
            f"-dMonoImageResolution={mono_dpi}",
        ])

    cmd.extend([f"-sOutputFile={output_path}", input_path])

    # Dynamic timeout: 15s per MB, min 120s, max 600s
    timeout = max(120, min(600, (file_size_bytes // (1024 * 1024)) * 15)) if file_size_bytes > 0 else 120

    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=timeout)
        return True, ""
    except subprocess.CalledProcessError as e:
        stderr = e.stderr.decode("utf-8", errors="replace") if e.stderr else ""
        if "encrypted" in stderr.lower() or "password" in stderr.lower():
            logger.warning(f"Ghostscript: encrypted PDF detected: {input_path}")
            return False, "encrypted"
        logger.error(f"Ghostscript error: {e}")
        return False, ""
    except subprocess.TimeoutExpired:
        logger.error(f"Ghostscript timed out after {timeout}s for {input_path}")
        return False, ""


def _compress_pdf(
    input_path: str,
    output_path: str,
    quality: str = "ebook",
    file_size_bytes: int = 0,
) -> tuple[bool, str, str]:
    """
    Compress a PDF trying Ghostscript first, falling back to pypdf.
    Returns (success, method_used, failure_reason).
    """
    content_info = analyze_pdf_content(input_path)

    # 1. Try Ghostscript (best quality compression)
    gs_ok, failure_reason = compress_pdf_ghostscript(
        input_path, output_path, quality, file_size_bytes, content_info
    )
    if gs_ok:
        return True, "ghostscript", ""

    # Encrypted PDFs cannot be processed by pypdf either
    if failure_reason == "encrypted":
        return False, "none", "encrypted"

    # 2. Fallback: pypdf-based compression
    logger.info("Using pypdf fallback for compression")
    if compress_pdf_pypdf(input_path, output_path, quality):
        return True, "pypdf", ""

    return False, "none", ""


def validate_pdf_file(filename: str) -> bool:
    """Validate if file has PDF extension."""
    ext = os.path.splitext(str(filename))[1].lower()
    return ext == ".pdf"


async def _process_single_pdf(
    file: UploadFile,
    temp_dir: str,
    pdf_quality: str,
    file_index: int = 0,
) -> tuple[str, bytes, dict[str, Any]]:
    """
    Process a single PDF file for compression.
    Each file gets its own subdirectory to avoid name collisions in parallel processing.
    Returns: (filename, content, result_metadata)
    """
    original_content: bytes = await file.read()
    original_size: int = len(original_content)
    filename: str = file.filename or "documento.pdf"

    # Validate PDF extension
    if not validate_pdf_file(filename):
        return filename, original_content, {
            "filename": filename,
            "original_size": original_size,
            "compressed_size": original_size,
            "reduction_percent": 0,
            "success": False,
            "error": "Solo se admiten archivos PDF",
            "method": "none",
            "failure_reason": "",
            "processing_time": 0.0,
        }

    # Validate PDF signature
    if not validate_pdf_signature(original_content):
        return filename, original_content, {
            "filename": filename,
            "original_size": original_size,
            "compressed_size": original_size,
            "reduction_percent": 0,
            "success": False,
            "error": "El archivo no es un PDF válido (firma incorrecta)",
            "method": "none",
            "failure_reason": "",
            "processing_time": 0.0,
        }

    compressed_content: Optional[bytes] = None
    success = False
    error_msg: Optional[str] = None
    method = "none"
    failure_reason = ""

    # Isolated subdirectory for this file to avoid collisions in parallel processing
    sub_dir = os.path.join(temp_dir, f"file_{file_index}")
    os.makedirs(sub_dir, exist_ok=True)

    t_start = time.monotonic()
    try:
        input_path = os.path.join(sub_dir, "input.pdf")
        output_path = os.path.join(sub_dir, "output.pdf")

        with open(input_path, "wb") as f:
            f.write(original_content)

        ok, method, failure_reason = _compress_pdf(input_path, output_path, pdf_quality, original_size)
        if ok:
            with open(output_path, "rb") as f:
                compressed_content = f.read()
            success = True
        else:
            compressed_content = original_content
            if failure_reason == "encrypted":
                error_msg = "PDF protegido: no se puede comprimir"
            else:
                error_msg = "No se pudo comprimir el PDF"

    except Exception as e:
        compressed_content = original_content
        error_msg = str(e)
        logger.error(f"Error compressing {filename}: {e}")

    # Subtraction and rounding issue
    processing_time = round(time.monotonic() - t_start, 2)
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
        "reduction_percent": round(float(reduction_percent), 1),  # type: ignore
        "success": success and compressed_size < original_size,
        "error": error_msg,
        "method": method,
        "failure_reason": failure_reason,
        "processing_time": processing_time,
    }

    return filename, compressed_content or original_content, result


@router.post("/compress")
async def compress_pdfs(
    files: list[UploadFile] = File(...),
    pdf_quality: str = Form(default="aggressive"),
) -> Response:
    """
    Compress multiple PDF files in parallel.
    Returns: ZIP file with compressed PDFs
    """
    if not files:
        raise HTTPException(status_code=400, detail="No se proporcionaron archivos")

    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(
            status_code=400,
            detail=f"Máximo {MAX_FILES_PER_REQUEST} archivos por solicitud",
        )

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            # Process all files in parallel using asyncio.gather
            tasks = [
                _process_single_pdf(file, temp_dir, pdf_quality, i)
                for i, file in enumerate(files)
            ]
            results_and_files = await asyncio.gather(*tasks)

            compressed_files: list[tuple[str, bytes]] = [
                (filename, content) for filename, content, _ in results_and_files
            ]

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

    except HTTPException:
        raise
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
    original_content: bytes = await file.read()
    original_size: int = len(original_content)
    filename: str = file.filename or "documento.pdf"

    # Validate PDF extension
    if not validate_pdf_file(filename):
        raise HTTPException(
            status_code=400,
            detail="Tipo de archivo no soportado. Solo se admiten archivos PDF.",
        )

    # Validate PDF magic number
    if not validate_pdf_signature(original_content):
        raise HTTPException(
            status_code=400,
            detail="El archivo no es un PDF válido (firma incorrecta)",
        )

    t_start = time.monotonic()
    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = os.path.join(temp_dir, "input.pdf")
            output_path = os.path.join(temp_dir, "output.pdf")

            with open(input_path, "wb") as f:
                f.write(original_content)

            ok, method, failure_reason = _compress_pdf(input_path, output_path, pdf_quality, original_size)
            # round time issue
            processing_time = round(time.monotonic() - t_start, 2)

            # Encrypted PDF — return original with informative header
            if failure_reason == "encrypted":
                return Response(
                    content=original_content,
                    media_type="application/pdf",
                    headers=create_compression_headers(
                        filename, original_size, original_size,
                        error_msg="PDF protegido: no se puede comprimir",
                        compression_method="none",
                        processing_time=processing_time,
                    ),
                )

            if ok:
                with open(output_path, "rb") as f:
                    compressed_content = f.read()

                compressed_size = len(compressed_content)

                # Return original if compressed is not smaller
                if compressed_size >= original_size:
                    return Response(
                        content=original_content,
                        media_type="application/pdf",
                        headers=create_compression_headers(
                            filename, original_size, original_size,
                            error_msg="Ya optimizado",
                            compression_method=method,
                            processing_time=processing_time,
                        ),
                    )

                headers = create_compression_headers(
                    filename, original_size, compressed_size,
                    compression_method=method,
                    processing_time=processing_time,
                )

                # Add warning header for ultra mode
                if pdf_quality == "ultra":
                    headers["X-Warning"] = quote("Modo ultra: documento puede perder colores", safe="")

                return Response(
                    content=compressed_content,
                    media_type="application/pdf",
                    headers=headers,
                )
            else:
                # Neither GS nor pypdf worked — return original with informative header
                return Response(
                    content=original_content,
                    media_type="application/pdf",
                    headers=create_compression_headers(
                        filename, original_size, original_size,
                        error_msg="No se pudo comprimir el PDF",
                        compression_method="none",
                        processing_time=processing_time,
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
