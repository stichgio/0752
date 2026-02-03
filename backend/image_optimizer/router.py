"""
Image Optimizer Backend Router
Provides endpoints for image compression and ZIP download functionality.
The actual image compression is done client-side using browser-image-compression.
This backend handles ZIP creation for batch downloads.
"""

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response
from typing import List
import zipfile
import io
import os

router = APIRouter(prefix="/api/image-optimizer", tags=["image-optimizer"])


@router.post("/download-zip")
async def create_zip_download(files: List[UploadFile] = File(...)):
    """
    Creates a ZIP file from multiple optimized images.
    The images are already compressed client-side, this just bundles them.
    """
    if len(files) == 0:
        raise HTTPException(status_code=400, detail="No se proporcionaron archivos")

    try:
        # Create ZIP in memory
        zip_buffer = io.BytesIO()

        with zipfile.ZipFile(zip_buffer, mode='w', compression=zipfile.ZIP_DEFLATED) as zip_file:
            for file in files:
                # Read file content
                content = await file.read()

                # Add to ZIP with original filename
                zip_file.writestr(file.filename, content)

        # Seek to beginning of buffer
        zip_buffer.seek(0)

        return Response(
            content=zip_buffer.read(),
            media_type="application/zip",
            headers={
                "Content-Disposition": "attachment; filename=imagenes_optimizadas.zip"
            }
        )

    except Exception as e:
        print(f"Error creating ZIP: {e}")
        raise HTTPException(status_code=500, detail=f"Error al crear archivo ZIP: {str(e)}")


@router.get("/health")
async def health_check():
    """Health check endpoint for the image optimizer service."""
    return {"status": "ok", "service": "image-optimizer"}
