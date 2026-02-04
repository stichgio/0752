"""
Compressor Backend Router
Provides endpoints for file compression (images and PDFs).
Prioritizes quality preservation over aggressive compression.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import Response
from typing import List, Optional
import zipfile
import io
import os
import tempfile
from PIL import Image
import subprocess
import json
from urllib.parse import quote

router = APIRouter(prefix="/api/compressor", tags=["compressor"])


def compress_image_pillow(
    input_bytes: bytes,
    filename: str,
    quality: int = 85,
    max_dimension: Optional[int] = None
) -> tuple[bytes, str]:
    """
    Compress image using Pillow with quality-focused settings.
    Returns compressed bytes and original filename (preserving name).
    """
    img = Image.open(io.BytesIO(input_bytes))

    # Determine output format based on input extension
    ext = os.path.splitext(filename)[1].lower()

    if ext in ['.jpg', '.jpeg']:
        output_format = 'JPEG'
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
    elif ext == '.png':
        output_format = 'PNG'
    elif ext == '.webp':
        output_format = 'WEBP'
    elif ext in ['.bmp', '.tiff', '.tif']:
        # Convert BMP/TIFF to JPEG for better compression
        output_format = 'JPEG'
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
    else:
        output_format = 'JPEG'
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

    # Resize if max_dimension is specified
    if max_dimension and max_dimension > 0:
        width, height = img.size
        if width > max_dimension or height > max_dimension:
            if width > height:
                new_width = max_dimension
                new_height = int(height * (max_dimension / width))
            else:
                new_height = max_dimension
                new_width = int(width * (max_dimension / height))
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

    # Save to buffer with compression
    output_buffer = io.BytesIO()

    save_kwargs = {}
    if output_format == 'JPEG':
        save_kwargs = {
            'quality': quality,
            'optimize': True,
            'progressive': True
        }
    elif output_format == 'PNG':
        save_kwargs = {
            'optimize': True,
            'compress_level': 6
        }
    elif output_format == 'WEBP':
        save_kwargs = {
            'quality': quality,
            'method': 4
        }

    img.save(output_buffer, format=output_format, **save_kwargs)
    output_buffer.seek(0)

    # Keep original filename
    return output_buffer.read(), filename


def compress_pdf_ghostscript(input_path: str, output_path: str, quality: str = "ebook") -> bool:
    """
    Compress PDF using Ghostscript.
    Returns True if successful.
    """
    quality_settings = {
        "screen": "/screen",
        "ebook": "/ebook",
        "printer": "/printer",
        "prepress": "/prepress"
    }

    gs_quality = quality_settings.get(quality, "/ebook")

    # Try to find Ghostscript
    gs_commands = ['gs', 'gswin64c', 'gswin32c']
    gs_cmd = None

    for cmd in gs_commands:
        try:
            result = subprocess.run([cmd, '--version'], capture_output=True, timeout=5)
            if result.returncode == 0:
                gs_cmd = cmd
                break
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            continue

    if not gs_cmd:
        return False

    try:
        subprocess.run([
            gs_cmd,
            '-sDEVICE=pdfwrite',
            '-dCompatibilityLevel=1.4',
            f'-dPDFSETTINGS={gs_quality}',
            '-dNOPAUSE',
            '-dQUIET',
            '-dBATCH',
            f'-sOutputFile={output_path}',
            input_path
        ], check=True, capture_output=True, timeout=120)
        return True
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        print(f"Ghostscript error: {e}")
        return False


def safe_filename_header(filename: str) -> str:
    """Create a safe Content-Disposition header value."""
    # Use RFC 5987 encoding for non-ASCII filenames
    try:
        filename.encode('ascii')
        return f'attachment; filename="{filename}"'
    except UnicodeEncodeError:
        encoded = quote(filename, safe='')
        return f"attachment; filename*=UTF-8''{encoded}"


@router.post("/compress")
async def compress_files(
    files: List[UploadFile] = File(...),
    quality: int = Form(default=85),
    compress_pdfs: bool = Form(default=True),
    pdf_quality: str = Form(default="ebook"),
    max_dimension: Optional[int] = Form(default=None)
):
    """
    Compress multiple files (images and/or PDFs).
    Returns: ZIP file with compressed files
    """
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="No se proporcionaron archivos")

    quality = max(1, min(100, quality))

    results = []
    compressed_files = []

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            for file in files:
                original_content = await file.read()
                original_size = len(original_content)
                filename = file.filename or "archivo"
                ext = os.path.splitext(filename)[1].lower()

                compressed_content = None
                success = False
                error_msg = None

                try:
                    # Handle images
                    if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif']:
                        compressed_content, _ = compress_image_pillow(
                            original_content,
                            filename,
                            quality=quality,
                            max_dimension=max_dimension
                        )
                        success = True

                    # Handle PDFs
                    elif ext == '.pdf' and compress_pdfs:
                        input_path = os.path.join(temp_dir, f"input_{hash(filename)}.pdf")
                        output_path = os.path.join(temp_dir, f"output_{hash(filename)}.pdf")

                        with open(input_path, 'wb') as f:
                            f.write(original_content)

                        if compress_pdf_ghostscript(input_path, output_path, pdf_quality):
                            with open(output_path, 'rb') as f:
                                compressed_content = f.read()
                            success = True
                        else:
                            compressed_content = original_content
                            error_msg = "Ghostscript no disponible"

                    else:
                        compressed_content = original_content
                        error_msg = "Tipo de archivo no soportado"

                except Exception as e:
                    compressed_content = original_content
                    error_msg = str(e)
                    print(f"Error compressing {filename}: {e}")

                compressed_size = len(compressed_content) if compressed_content else original_size

                # Only use compressed if smaller
                if compressed_content and compressed_size >= original_size:
                    compressed_content = original_content
                    compressed_size = original_size
                    if success:
                        error_msg = "Ya optimizado"

                reduction_percent = ((original_size - compressed_size) / original_size * 100) if original_size > 0 else 0

                results.append({
                    "filename": filename,
                    "original_size": original_size,
                    "compressed_size": compressed_size,
                    "reduction_percent": round(reduction_percent, 1),
                    "success": success and compressed_size < original_size,
                    "error": error_msg
                })

                compressed_files.append((filename, compressed_content or original_content))

            # Create ZIP
            zip_buffer = io.BytesIO()
            with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zip_file:
                for fname, content in compressed_files:
                    zip_file.writestr(fname, content)

            zip_buffer.seek(0)

            return Response(
                content=zip_buffer.read(),
                media_type="application/zip",
                headers={
                    "Content-Disposition": "attachment; filename=comprimidos.zip"
                }
            )

    except Exception as e:
        print(f"Error in compression: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al comprimir: {str(e)}")


@router.post("/compress-single")
async def compress_single_file(
    file: UploadFile = File(...),
    quality: int = Form(default=85),
    pdf_quality: str = Form(default="ebook"),
    max_dimension: Optional[int] = Form(default=None)
):
    """
    Compress a single file and return it directly.
    """
    original_content = await file.read()
    original_size = len(original_content)
    filename = file.filename or "archivo"
    ext = os.path.splitext(filename)[1].lower()

    quality = max(1, min(100, quality))

    try:
        # Handle images
        if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff', '.tif']:
            compressed_content, _ = compress_image_pillow(
                original_content,
                filename,
                quality=quality,
                max_dimension=max_dimension
            )

            # Determine media type
            if ext in ['.jpg', '.jpeg']:
                media_type = 'image/jpeg'
            elif ext == '.png':
                media_type = 'image/png'
            elif ext == '.webp':
                media_type = 'image/webp'
            else:
                media_type = 'image/jpeg'

            compressed_size = len(compressed_content)

            # Return original if compressed is larger
            if compressed_size >= original_size:
                return Response(
                    content=original_content,
                    media_type=media_type,
                    headers={
                        "Content-Disposition": safe_filename_header(filename),
                        "X-Original-Size": str(original_size),
                        "X-Compressed-Size": str(original_size),
                        "X-Reduction-Percent": "0",
                        "X-Filename": filename
                    }
                )

            reduction = round((original_size - compressed_size) / original_size * 100, 1)

            return Response(
                content=compressed_content,
                media_type=media_type,
                headers={
                    "Content-Disposition": safe_filename_header(filename),
                    "X-Original-Size": str(original_size),
                    "X-Compressed-Size": str(compressed_size),
                    "X-Reduction-Percent": str(reduction),
                    "X-Filename": filename
                }
            )

        # Handle PDFs
        elif ext == '.pdf':
            with tempfile.TemporaryDirectory() as temp_dir:
                input_path = os.path.join(temp_dir, "input.pdf")
                output_path = os.path.join(temp_dir, "output.pdf")

                with open(input_path, 'wb') as f:
                    f.write(original_content)

                if compress_pdf_ghostscript(input_path, output_path, pdf_quality):
                    with open(output_path, 'rb') as f:
                        compressed_content = f.read()

                    compressed_size = len(compressed_content)

                    # Return original if compressed is larger
                    if compressed_size >= original_size:
                        return Response(
                            content=original_content,
                            media_type='application/pdf',
                            headers={
                                "Content-Disposition": safe_filename_header(filename),
                                "X-Original-Size": str(original_size),
                                "X-Compressed-Size": str(original_size),
                                "X-Reduction-Percent": "0",
                                "X-Filename": filename
                            }
                        )

                    reduction = round((original_size - compressed_size) / original_size * 100, 1)

                    return Response(
                        content=compressed_content,
                        media_type='application/pdf',
                        headers={
                            "Content-Disposition": safe_filename_header(filename),
                            "X-Original-Size": str(original_size),
                            "X-Compressed-Size": str(compressed_size),
                            "X-Reduction-Percent": str(reduction),
                            "X-Filename": filename
                        }
                    )
                else:
                    # Ghostscript not available - return original with error header
                    return Response(
                        content=original_content,
                        media_type='application/pdf',
                        headers={
                            "Content-Disposition": safe_filename_header(filename),
                            "X-Original-Size": str(original_size),
                            "X-Compressed-Size": str(original_size),
                            "X-Reduction-Percent": "0",
                            "X-Filename": filename,
                            "X-Error": "Ghostscript no disponible para comprimir PDFs"
                        }
                    )

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Tipo de archivo no soportado: {ext}. Use JPG, PNG, WEBP o PDF."
            )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error compressing single file: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al comprimir: {str(e)}")


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    gs_available = False
    gs_commands = ['gs', 'gswin64c', 'gswin32c']

    for cmd in gs_commands:
        try:
            result = subprocess.run([cmd, '--version'], capture_output=True, timeout=5)
            if result.returncode == 0:
                gs_available = True
                break
        except:
            continue

    return {
        "status": "ok",
        "service": "compressor",
        "capabilities": {
            "images": True,
            "pdfs": gs_available
        },
        "ghostscript_available": gs_available
    }
