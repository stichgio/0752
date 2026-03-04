"""SPA / static file serving for Hugging Face Spaces / Docker deployment."""

import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse  # type: ignore
from fastapi.staticfiles import StaticFiles  # type: ignore


def mount_static(app: FastAPI) -> None:
    """Mount static assets and SPA catch-all routes if the static folder exists."""
    if not os.path.exists("static"):
        return
    static_root = Path("static").resolve()

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
        candidate = (static_root / full_path).resolve()
        try:
            candidate.relative_to(static_root)
        except ValueError:
            raise HTTPException(status_code=404, detail="Not Found")
        if candidate.exists() and candidate.is_file():
            return FileResponse(str(candidate))

        # Fallback to index.html for React Router
        return FileResponse("static/index.html")
