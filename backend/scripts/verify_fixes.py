"""Quick smoke checks for hardening fixes in backend/main.py and backend/report_service.py."""

from __future__ import annotations

import asyncio
import os
import tempfile

from report_service import ReportService, _render_pdf_with_chrome
from main import _normalize_photo_grid_template_compat


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_template_normalization() -> None:
    html = "<html><head><title>x</title></head><body><div class='photo-cell-wrap'></div></body></html>"
    normalized = _normalize_photo_grid_template_compat(html)
    _assert(normalized is not None and "photo-grid-compat-fix" in normalized, "compat CSS was not injected")


def test_get_template_fallback_and_strict() -> None:
    service = ReportService()
    fallback_template = service.get_template("definitely_missing_template.html")
    _assert(fallback_template is service.template, "fallback template should resolve to default")

    strict_failed = False
    try:
        service.get_template("definitely_missing_template.html", strict=True)
    except Exception:
        strict_failed = True
    _assert(strict_failed, "strict mode should fail for missing templates")


def test_logo_cache_hashing() -> None:
    service = ReportService()
    logo_a = service._process_logo(b"A", "left")
    logo_b = service._process_logo(b"B", "left")
    _assert(logo_a != logo_b, "logo cache key should include logo content hash")


def test_chrome_fallback_cleanup() -> None:
    before = set(os.listdir(tempfile.gettempdir()))
    _render_pdf_with_chrome("<html><body>smoke</body></html>")
    after = set(os.listdir(tempfile.gettempdir()))
    lingering = [name for name in (after - before) if name.endswith(".html") or name.endswith(".pdf")]
    _assert(not lingering, f"chrome fallback left temp files behind: {lingering}")


async def _close_service() -> None:
    service = ReportService()
    await service.close()


def main() -> None:
    test_template_normalization()
    test_get_template_fallback_and_strict()
    test_logo_cache_hashing()
    test_chrome_fallback_cleanup()
    asyncio.run(_close_service())
    print("verify_fixes: all checks passed")


if __name__ == "__main__":
    main()
