"""
# -*- coding: utf-8 -*-
Utilities for the template editor module.

fix: imagen-cortada — url_to_base64 converts remote image URLs to base64
data URIs so WeasyPrint can render them without HTTP context.
"""

import base64
import ipaddress
import logging
import socket
from typing import Optional, Tuple
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)

# 1x1 gray pixel PNG — used as placeholder when image fetch fails
PLACEHOLDER_BASE64 = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ"
    "AAAADUlEQVR42mO88f/BfwAJhAPk5fHLzAAAAABJRU5ErkJggg=="
)

_PRIVATE_HOSTS = {"localhost", "localhost.localdomain"}


def _is_public_address(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return ip.is_global


def _is_safe_remote_url(url: str) -> bool:
    try:
        parsed = urlparse(url.strip())
    except Exception:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname or hostname in _PRIVATE_HOSTS:
        return False

    if _is_public_address(hostname):
        return True

    try:
        infos = socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)
    except socket.gaierror:
        return False

    addresses = [info[4][0] for info in infos if info and len(info) >= 5 and info[4]]
    return bool(addresses) and all(_is_public_address(address) for address in addresses)


def fetch_remote_binary(url: str, timeout: float = 10.0, max_redirects: int = 3) -> Optional[Tuple[bytes, str]]:
    """
    Fetch a remote binary while blocking obvious SSRF targets and re-validating redirects.
    """
    if not _is_safe_remote_url(url):
        return None

    try:
        import httpx

        current = url.strip()
        for _ in range(max_redirects + 1):
            response = httpx.get(current, timeout=timeout, follow_redirects=False)

            if 300 <= response.status_code < 400:
                location = (response.headers.get("location") or "").strip()
                if not location:
                    return None
                next_url = urljoin(current, location)
                if not _is_safe_remote_url(next_url):
                    return None
                current = next_url
                continue

            response.raise_for_status()
            return response.content, response.headers.get("content-type", "image/jpeg")
    except Exception as exc:
        logger.warning("Failed to fetch remote asset %s: %s", url, exc)

    return None


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
        fetched = fetch_remote_binary(url, timeout=10.0)
        if not fetched:
            return PLACEHOLDER_BASE64
        payload, content_type = fetched
        mime = content_type.split(";")[0].strip() or "image/jpeg"
        data = base64.b64encode(payload).decode("ascii")
        return f"data:{mime};base64,{data}"
    except Exception as exc:
        logger.warning("Failed to fetch image %s: %s", url, exc)
        return PLACEHOLDER_BASE64
