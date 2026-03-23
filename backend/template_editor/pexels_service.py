# -*- coding: utf-8 -*-
"""
Proxy seguro hacia la API de Pexels.

- Nunca expone la API key al cliente.
- Cachea respuestas en memoria por TTL corto para no quemar cuota.
- Normaliza el payload de Pexels a un DTO interno estable.
- Traduce errores HTTP de Pexels a HTTPException con semántica clara.
"""
from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Dict, Optional

import httpx
from fastapi import HTTPException

from config import settings

# ── Constantes ────────────────────────────────────────────────────────────────

PEXELS_BASE = "https://api.pexels.com/v1"
REQUEST_TIMEOUT = 10.0          # segundos
CACHE_TTL = 60                  # segundos por entrada
MAX_CACHE_ENTRIES = 256


# ── Caché en memoria ──────────────────────────────────────────────────────────

class _Cache:
    def __init__(self, ttl: int, maxsize: int) -> None:
        self._store: Dict[str, tuple[float, Any]] = {}
        self._ttl = ttl
        self._maxsize = maxsize

    def _key(self, endpoint: str, params: dict) -> str:
        raw = endpoint + json.dumps(params, sort_keys=True)
        return hashlib.md5(raw.encode()).hexdigest()

    def get(self, endpoint: str, params: dict) -> Optional[Any]:
        k = self._key(endpoint, params)
        entry = self._store.get(k)
        if entry and (time.monotonic() - entry[0]) < self._ttl:
            return entry[1]
        self._store.pop(k, None)
        return None

    def set(self, endpoint: str, params: dict, value: Any) -> None:
        if len(self._store) >= self._maxsize:
            oldest = min(self._store, key=lambda k: self._store[k][0])
            self._store.pop(oldest, None)
        k = self._key(endpoint, params)
        self._store[k] = (time.monotonic(), value)


_cache = _Cache(ttl=CACHE_TTL, maxsize=MAX_CACHE_ENTRIES)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_configured() -> bool:
    return bool((settings.pexels_api_key or "").strip())


def _resolve_api_key(client_key: Optional[str]) -> str:
    """Prioriza la key del servidor; si no hay, usa la del cliente si está permitido."""
    server = (settings.pexels_api_key or "").strip()
    if server:
        return server
    ck = (client_key or "").strip()
    if ck and settings.pexels_accepts_client_key:
        return ck
    raise HTTPException(
        status_code=503,
        detail={
            "code": "PEXELS_NOT_CONFIGURED",
            "message": "La integración con Pexels no está habilitada. Define PEXELS_API_KEY en el backend o, si tu entorno lo permite, guarda tu clave en la app.",
        },
    )


def _translate_pexels_error(status: int, body: str) -> HTTPException:
    if status in (401, 403):
        return HTTPException(
            status_code=403,
            detail={
                "code": "PEXELS_AUTH_ERROR",
                "message": "Clave de API de Pexels inválida o sin permisos. Verifica PEXELS_API_KEY.",
            },
        )
    if status == 429:
        return HTTPException(
            status_code=429,
            detail={
                "code": "PEXELS_RATE_LIMIT",
                "message": "Cuota de Pexels agotada. Intenta más tarde.",
            },
        )
    return HTTPException(
        status_code=502,
        detail={
            "code": "PEXELS_PROVIDER_ERROR",
            "message": f"Error del proveedor Pexels (HTTP {status}).",
        },
    )


def _parse_rate_limit(headers: httpx.Headers) -> Optional[Dict[str, int]]:
    try:
        return {
            "limit": int(headers.get("X-Ratelimit-Limit", 0)),
            "remaining": int(headers.get("X-Ratelimit-Remaining", 0)),
            "reset": int(headers.get("X-Ratelimit-Reset", 0)),
        }
    except (ValueError, TypeError):
        return None


def _normalize_photo(photo: Dict[str, Any]) -> Dict[str, Any]:
    src: Dict[str, Any] = photo.get("src") or {}
    photographer = photo.get("photographer") or ""
    photographer_url = photo.get("photographer_url") or ""
    provider_id = str(photo.get("id") or "")
    alt = photo.get("alt") or photographer or f"Foto Pexels {provider_id}"

    url = src.get("large2x") or src.get("original") or src.get("large") or ""
    preview_url = src.get("medium") or src.get("small") or url
    thumbnail_url = src.get("tiny") or src.get("small") or preview_url
    source_page_url = photo.get("url") or ""
    avg_color = photo.get("avg_color") or ""

    attribution = f"Foto de {photographer} en Pexels" if photographer else "Foto de Pexels"

    return {
        "provider": "pexels",
        "providerAssetId": provider_id,
        "name": alt[:80] if alt else f"pexels-{provider_id}",
        "type": "image",
        "url": url,
        "previewUrl": preview_url,
        "thumbnailUrl": thumbnail_url,
        "sourcePageUrl": source_page_url,
        "photographer": photographer,
        "photographerUrl": photographer_url,
        "attributionText": attribution,
        "avgColor": avg_color,
        "width": int(photo.get("width") or 0),
        "height": int(photo.get("height") or 0),
        "alt": alt,
    }


def _build_response(data: Dict[str, Any], rate_limit: Optional[Dict[str, int]]) -> Dict[str, Any]:
    photos: list = data.get("photos") or []
    total = int(data.get("total_results") or 0)
    page = int(data.get("page") or 1)
    per_page = int(data.get("per_page") or 24)
    next_page = data.get("next_page")
    prev_page = data.get("prev_page")

    result: Dict[str, Any] = {
        "items": [_normalize_photo(p) for p in photos],
        "page": page,
        "perPage": per_page,
        "totalResults": total,
        "nextPage": next_page,
        "prevPage": prev_page,
    }
    if rate_limit:
        result["rateLimit"] = rate_limit
    return result


# ── Llamadas públicas ─────────────────────────────────────────────────────────

async def search_photos(
    query: str,
    page: int = 1,
    per_page: int = 24,
    orientation: Optional[str] = None,
    size: Optional[str] = None,
    color: Optional[str] = None,
    locale: str = "es-ES",
    client_key: Optional[str] = None,
) -> Dict[str, Any]:
    api_key = _resolve_api_key(client_key)

    params: Dict[str, Any] = {
        "query": query.strip(),
        "page": page,
        "per_page": min(per_page, 80),
        "locale": locale,
    }
    if orientation:
        params["orientation"] = orientation
    if size:
        params["size"] = size
    if color:
        params["color"] = color

    endpoint = "/search"
    cached = _cache.get(endpoint, params)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        try:
            response = await client.get(
                f"{PEXELS_BASE}{endpoint}",
                params=params,
                headers={"Authorization": api_key},
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail={"code": "PEXELS_TIMEOUT", "message": "Timeout al contactar Pexels."})
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail={"code": "PEXELS_NETWORK_ERROR", "message": str(exc)})

    if not response.is_success:
        raise _translate_pexels_error(response.status_code, response.text)

    rate_limit = _parse_rate_limit(response.headers)
    result = _build_response(response.json(), rate_limit)
    _cache.set(endpoint, params, result)
    return result


async def curated_photos(
    page: int = 1,
    per_page: int = 24,
    client_key: Optional[str] = None,
) -> Dict[str, Any]:
    api_key = _resolve_api_key(client_key)

    params: Dict[str, Any] = {
        "page": page,
        "per_page": min(per_page, 80),
    }

    endpoint = "/curated"
    cached = _cache.get(endpoint, params)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        try:
            response = await client.get(
                f"{PEXELS_BASE}{endpoint}",
                params=params,
                headers={"Authorization": api_key},
            )
        except httpx.TimeoutException:
            raise HTTPException(status_code=504, detail={"code": "PEXELS_TIMEOUT", "message": "Timeout al contactar Pexels."})
        except httpx.RequestError as exc:
            raise HTTPException(status_code=502, detail={"code": "PEXELS_NETWORK_ERROR", "message": str(exc)})

    if not response.is_success:
        raise _translate_pexels_error(response.status_code, response.text)

    rate_limit = _parse_rate_limit(response.headers)
    result = _build_response(response.json(), rate_limit)
    _cache.set(endpoint, params, result)
    return result


def pexels_status() -> Dict[str, Any]:
    """Estado sin exponer secretos. `configured` = key en servidor."""
    return {
        "configured": _is_configured(),
        "acceptsClientKey": settings.pexels_accepts_client_key,
    }
