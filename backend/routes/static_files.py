"""SPA / static file serving for Hugging Face Spaces / Docker deployment."""

import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse  # type: ignore
from fastapi.staticfiles import StaticFiles  # type: ignore


def mount_static(app: FastAPI) -> None:
    """Mount static assets and SPA catch-all routes if the static folder exists."""
    if not os.path.exists("static"):
        return

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
        path = os.path.join("static", full_path)
        if os.path.exists(path) and os.path.isfile(path):
            return FileResponse(path)

        # Fallback to index.html for React Router
        return FileResponse("static/index.html")
