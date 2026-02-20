"""
Utilities for the template editor module.

fix: imagen-cortada — url_to_base64 converts remote image URLs to base64
data URIs so WeasyPrint can render them without HTTP context.
"""

import base64
import logging

logger = logging.getLogger(__name__)

# 1x1 gray pixel PNG — used as placeholder when image fetch fails
PLACEHOLDER_BASE64 = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
    "AAAADUlEQVR42mO88f/BfwAJhAPk5fHLzAAAAABJRU5ErkJggg=="
)


def url_to_base64(url: str) -> str:
    """
    Convert an image URL to a base64 data URI for WeasyPrint compatibility.

    - If the URL is already a ``data:`` URI, return it as-is.
    - If the URL starts with ``http(s)://``, fetch and encode to base64.
    - For all other values (relative paths, empty strings), return as-is.
    - On fetch failure, return a gray 1x1 placeholder.
    """
    if not url or not isinstance(url, str):
        return PLACEHOLDER_BASE64

    url = url.strip()

    # Already a data URI — use directly
    if url.startswith("data:"):
        return url

    # Only convert HTTP(S) URLs
    if not url.startswith(("http://", "https://")):
        return url

    try:
        import httpx

        resp = httpx.get(url, timeout=10, follow_redirects=True)
        resp.raise_for_status()
        mime = resp.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        data = base64.b64encode(resp.content).decode("ascii")
        return f"data:{mime};base64,{data}"
    except Exception as exc:
        logger.warning("Failed to fetch image %s: %s", url, exc)
        return PLACEHOLDER_BASE64
