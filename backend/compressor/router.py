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
import shutil
from PIL import Image
import subprocess

router = APIRouter(prefix="/api/compressor", tags=["compressor"])


def compress_image_pillow(
    input_bytes: bytes,
    filename: str,
    quality: int = 85,
    max_dimension: Optional[int] = None
) -> tuple[bytes, str]:
    """
    Compress image using Pillow with quality-focused settings.
    Returns compressed bytes and output filename.
    """
    img = Image.open(io.BytesIO(input_bytes))

    # Convert RGBA to RGB if saving as JPEG
    original_format = img.format or 'JPEG'
    output_format = original_format

    # Determine output format based on input
    ext = os.path.splitext(filename)[1].lower()
    if ext in ['.jpg', '.jpeg']:
        output_format = 'JPEG'
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')
    elif ext == '.png':
        output_format = 'PNG'
    elif ext == '.webp':
        output_format = 'WEBP'
    else:
        output_format = 'JPEG'
        if img.mode in ('RGBA', 'P'):
            img = img.convert('RGB')

    # Resize if max_dimension is specified
    if max_dimension:
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
            'compress_level': 6  # Balanced compression
        }
    elif output_format == 'WEBP':
        save_kwargs = {
            'quality': quality,
            'method': 4  # Balanced speed/compression
        }

    img.save(output_buffer, format=output_format, **save_kwargs)
    output_buffer.seek(0)

    # Generate output filename
    base_name = os.path.splitext(filename)[0]
    if output_format == 'JPEG':
        output_filename = f"{base_name}.jpg"
    elif output_format == 'PNG':
        output_filename = f"{base_name}.png"
    elif output_format == 'WEBP':
        output_filename = f"{base_name}.webp"
    else:
        output_filename = filename

    return output_buffer.read(), output_filename


def compress_pdf_ghostscript(input_path: str, output_path: str, quality: str = "ebook") -> bool:
    """
    Compress PDF using Ghostscript.
    Quality levels: screen (lowest), ebook (balanced), printer (high), prepress (highest)
    Returns True if successful.
    """
    # Map quality names to Ghostscript settings
    quality_settings = {
        "screen": "/screen",      # ~72 dpi - smallest
        "ebook": "/ebook",        # ~150 dpi - balanced (default)
        "printer": "/printer",    # ~300 dpi - high quality
        "prepress": "/prepress"   # ~300 dpi - highest quality
    }

    gs_quality = quality_settings.get(quality, "/ebook")

    # Try to find Ghostscript
    gs_commands = ['gs', 'gswin64c', 'gswin32c']
    gs_cmd = None

    for cmd in gs_commands:
        try:
            subprocess.run([cmd, '--version'], capture_output=True, check=True)
            gs_cmd = cmd
            break
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue

    if not gs_cmd:
        # Ghostscript not available, return False
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
        ], check=True, capture_output=True)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Ghostscript error: {e}")
        return False


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

    Parameters:
    - files: Files to compress
    - quality: Image quality (1-100), default 85 for balanced compression
    - compress_pdfs: Whether to compress PDF files
    - pdf_quality: PDF compression quality (screen, ebook, printer, prepress)
    - max_dimension: Optional max width/height for images

    Returns: ZIP file with compressed files and metadata
    """
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="No se proporcionaron archivos")

    # Validate quality
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
                compressed_filename = filename
                success = False
                error_msg = None

                try:
                    # Handle images
                    if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff']:
                        compressed_content, compressed_filename = compress_image_pillow(
                            original_content,
                            filename,
                            quality=quality,
                            max_dimension=max_dimension
                        )
                        success = True

                    # Handle PDFs
                    elif ext == '.pdf' and compress_pdfs:
                        input_path = os.path.join(temp_dir, f"input_{filename}")
                        output_path = os.path.join(temp_dir, f"output_{filename}")

                        with open(input_path, 'wb') as f:
                            f.write(original_content)

                        if compress_pdf_ghostscript(input_path, output_path, pdf_quality):
                            with open(output_path, 'rb') as f:
                                compressed_content = f.read()
                            compressed_filename = filename
                            success = True
                        else:
                            # Ghostscript not available, return original
                            compressed_content = original_content
                            error_msg = "Ghostscript no disponible, archivo sin comprimir"

                    else:
                        # Unsupported file type, keep original
                        compressed_content = original_content
                        error_msg = "Tipo de archivo no soportado para compresion"

                except Exception as e:
                    compressed_content = original_content
                    error_msg = str(e)

                compressed_size = len(compressed_content) if compressed_content else original_size

                # Only use compressed if it's actually smaller
                if compressed_content and compressed_size >= original_size:
                    compressed_content = original_content
                    compressed_size = original_size
                    compressed_filename = filename
                    if success:
                        error_msg = "El archivo ya esta optimizado"

                reduction_percent = ((original_size - compressed_size) / original_size * 100) if original_size > 0 else 0

                results.append({
                    "filename": filename,
                    "original_size": original_size,
                    "compressed_size": compressed_size,
                    "reduction_percent": round(reduction_percent, 1),
                    "success": success and compressed_size < original_size,
                    "error": error_msg
                })

                compressed_files.append((compressed_filename, compressed_content or original_content))

            # Create ZIP with results
            zip_buffer = io.BytesIO()

            with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zip_file:
                for filename, content in compressed_files:
                    zip_file.writestr(filename, content)

                # Add metadata file
                import json
                metadata = {
                    "total_files": len(files),
                    "total_original_size": sum(r["original_size"] for r in results),
                    "total_compressed_size": sum(r["compressed_size"] for r in results),
                    "total_reduction_percent": round(
                        (sum(r["original_size"] for r in results) - sum(r["compressed_size"] for r in results)) /
                        max(sum(r["original_size"] for r in results), 1) * 100, 1
                    ),
                    "files": results
                }
                zip_file.writestr("_compression_report.json", json.dumps(metadata, indent=2, ensure_ascii=False))

            zip_buffer.seek(0)

            return Response(
                content=zip_buffer.read(),
                media_type="application/zip",
                headers={
                    "Content-Disposition": "attachment; filename=archivos_comprimidos.zip",
                    "X-Compression-Stats": json.dumps({
                        "total_original": metadata["total_original_size"],
                        "total_compressed": metadata["total_compressed_size"],
                        "reduction_percent": metadata["total_reduction_percent"]
                    })
                }
            )

    except Exception as e:
        print(f"Error in compression: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error al comprimir archivos: {str(e)}")


@router.post("/compress-single")
async def compress_single_file(
    file: UploadFile = File(...),
    quality: int = Form(default=85),
    pdf_quality: str = Form(default="ebook"),
    max_dimension: Optional[int] = Form(default=None)
):
    """
    Compress a single file and return it directly (not as ZIP).
    """
    original_content = await file.read()
    original_size = len(original_content)
    filename = file.filename or "archivo"
    ext = os.path.splitext(filename)[1].lower()

    quality = max(1, min(100, quality))

    try:
        # Handle images
        if ext in ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tiff']:
            compressed_content, output_filename = compress_image_pillow(
                original_content,
                filename,
                quality=quality,
                max_dimension=max_dimension
            )

            # Determine media type
            if output_filename.endswith('.jpg') or output_filename.endswith('.jpeg'):
                media_type = 'image/jpeg'
            elif output_filename.endswith('.png'):
                media_type = 'image/png'
            elif output_filename.endswith('.webp'):
                media_type = 'image/webp'
            else:
                media_type = 'application/octet-stream'

            compressed_size = len(compressed_content)

            # Return original if compressed is larger
            if compressed_size >= original_size:
                return Response(
                    content=original_content,
                    media_type=media_type,
                    headers={
                        "Content-Disposition": f"attachment; filename={filename}",
                        "X-Original-Size": str(original_size),
                        "X-Compressed-Size": str(original_size),
                        "X-Reduction-Percent": "0"
                    }
                )

            reduction = round((original_size - compressed_size) / original_size * 100, 1)

            return Response(
                content=compressed_content,
                media_type=media_type,
                headers={
                    "Content-Disposition": f"attachment; filename={output_filename}",
                    "X-Original-Size": str(original_size),
                    "X-Compressed-Size": str(compressed_size),
                    "X-Reduction-Percent": str(reduction)
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
                                "Content-Disposition": f"attachment; filename={filename}",
                                "X-Original-Size": str(original_size),
                                "X-Compressed-Size": str(original_size),
                                "X-Reduction-Percent": "0"
                            }
                        )

                    reduction = round((original_size - compressed_size) / original_size * 100, 1)

                    return Response(
                        content=compressed_content,
                        media_type='application/pdf',
                        headers={
                            "Content-Disposition": f"attachment; filename={filename}",
                            "X-Original-Size": str(original_size),
                            "X-Compressed-Size": str(compressed_size),
                            "X-Reduction-Percent": str(reduction)
                        }
                    )
                else:
                    # Ghostscript not available
                    return Response(
                        content=original_content,
                        media_type='application/pdf',
                        headers={
                            "Content-Disposition": f"attachment; filename={filename}",
                            "X-Original-Size": str(original_size),
                            "X-Compressed-Size": str(original_size),
                            "X-Reduction-Percent": "0",
                            "X-Error": "Ghostscript no disponible"
                        }
                    )

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Tipo de archivo no soportado: {ext}"
            )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error compressing single file: {e}")
        raise HTTPException(status_code=500, detail=f"Error al comprimir archivo: {str(e)}")


@router.get("/health")
async def health_check():
    """Health check endpoint for the compressor service."""
    # Check if Ghostscript is available
    gs_available = False
    gs_commands = ['gs', 'gswin64c', 'gswin32c']

    for cmd in gs_commands:
        try:
            subprocess.run([cmd, '--version'], capture_output=True, check=True)
            gs_available = True
            break
        except (subprocess.CalledProcessError, FileNotFoundError):
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
