"""
verify_template_integration.py
──────────────────────────────
Script E2E para verificar la integración completa del flujo de plantillas:
  Crear → Publicar → Verificar en generador → Limpiar

Uso:
  python scripts/verify_template_integration.py
  python scripts/verify_template_integration.py --base-url http://mi-servidor:7860
"""

import argparse
import sys
import time
import uuid

try:
    import httpx
except ImportError:
    try:
        import requests as _req

        class _HttpxCompat:
            """Wrapper mínimo sobre requests para mantener la API de httpx."""

            class Response:
                def __init__(self, r):
                    self.status_code = r.status_code
                    self._r = r

                def json(self):
                    return self._r.json()

                def raise_for_status(self):
                    self._r.raise_for_status()

                @property
                def text(self):
                    return self._r.text

            class Client:
                def __init__(self, *, base_url, timeout):
                    self.base_url = base_url.rstrip("/")
                    self.timeout = timeout

                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    pass

                def get(self, path, **kw):
                    return _HttpxCompat.Response(
                        _req.get(self.base_url + path, timeout=self.timeout, **kw)
                    )

                def post(self, path, **kw):
                    return _HttpxCompat.Response(
                        _req.post(self.base_url + path, timeout=self.timeout, **kw)
                    )

                def put(self, path, **kw):
                    return _HttpxCompat.Response(
                        _req.put(self.base_url + path, timeout=self.timeout, **kw)
                    )

                def delete(self, path, **kw):
                    return _HttpxCompat.Response(
                        _req.delete(self.base_url + path, timeout=self.timeout, **kw)
                    )

        httpx = _HttpxCompat()
    except ImportError:
        print("ERROR: Se necesita 'httpx' o 'requests'.  Instala uno con:")
        print("  pip install httpx")
        sys.exit(1)

# ── Colores ANSI (se desactivan si la terminal no lo soporta) ───────────
_NO_COLOR = not sys.stdout.isatty()


def _c(code: str, text: str) -> str:
    if _NO_COLOR:
        return text
    return f"\033[{code}m{text}\033[0m"


def ok(msg: str) -> None:
    print(_c("32", f"  [OK]    {msg}"))


def fail(msg: str) -> None:
    print(_c("31", f"  [FAIL]  {msg}"))


def info(msg: str) -> None:
    print(_c("36", f"  [INFO]  {msg}"))


def header(msg: str) -> None:
    print()
    print(_c("1;35", f"{'='*60}"))
    print(_c("1;35", f"  {msg}"))
    print(_c("1;35", f"{'='*60}"))


# ── Payload de plantilla de prueba ──────────────────────────────────────
TEST_TEMPLATE_NAME = f"__E2E_Test_{uuid.uuid4().hex[:8]}"
TEST_AUTHOR = "e2e-verify-script"

TEMPLATE_PAYLOAD = {
    "name": TEST_TEMPLATE_NAME,
    "reportType": "generic",
    "author": TEST_AUTHOR,
    "featureFlag": True,
    "templateJson": {
        "reportType": "generic",
        "sections": [
            {
                "id": "sec-e2e-1",
                "type": "body",
                "title": "Seccion E2E",
                "blocks": [
                    {
                        "id": "blk-e2e-1",
                        "type": "text",
                        "content": "<p>Plantilla de prueba E2E - {{ title }}</p>",
                        "variables": ["title"],
                        "placeholders": [],
                        "metadata": {},
                        "locked": False,
                    }
                ],
                "metadata": {},
            }
        ],
        "metadata": {},
        "variableBindings": {},
        "protectionRules": {
            "required_block_ids": [],
            "editable_placeholder_by_block": {},
        },
    },
}


# ── Funciones de cada paso ──────────────────────────────────────────────
def step_create(client) -> str | None:
    """Paso 1: Crear plantilla de prueba. Devuelve el template_id o None."""
    header("PASO 1 · Crear plantilla de prueba")
    info(f"Nombre: {TEST_TEMPLATE_NAME}")

    r = client.post("/api/template-editor/templates", json=TEMPLATE_PAYLOAD)
    if r.status_code not in (200, 201):
        fail(f"HTTP {r.status_code} al crear plantilla")
        fail(f"Respuesta: {r.text[:300]}")
        return None

    data = r.json()
    tid = data.get("id")
    version = data.get("currentVersion", "?")
    ok(f"Plantilla creada  id={tid}  version={version}  status={data.get('status')}")
    return tid


def step_publish(client, tid: str) -> bool:
    """Paso 2: Publicar la plantilla."""
    header("PASO 2 · Publicar plantilla")
    info(f"POST /api/template-editor/templates/{tid}/publish")

    r = client.post(
        f"/api/template-editor/templates/{tid}/publish",
        json={"author": TEST_AUTHOR},
    )
    if r.status_code == 403:
        fail("HTTP 403 - Feature flag deshabilitado")
        info("Asegurate de que FEATURE_TEMPLATE_EDITOR=true en backend/.env")
        info("y reinicia el backend.")
        return False
    if r.status_code not in (200, 201):
        fail(f"HTTP {r.status_code} al publicar")
        fail(f"Respuesta: {r.text[:300]}")
        return False

    data = r.json()
    ok(f"Publicada  version={data.get('currentVersion')}  status={data.get('status')}")
    return True


def step_verify_integration(client) -> bool:
    """Paso 3: Verificar que /api/templates devuelve la plantilla en editorTemplates."""
    header("PASO 3 · Verificar integracion con generador")
    info("GET /api/templates")

    r = client.get("/api/templates")
    if r.status_code != 200:
        fail(f"HTTP {r.status_code} en /api/templates")
        return False

    data = r.json()
    editor_templates = data.get("editorTemplates", [])
    info(f"editorTemplates contiene {len(editor_templates)} elemento(s)")

    found = any(t.get("name") == TEST_TEMPLATE_NAME for t in editor_templates)
    if found:
        ok(f"'{TEST_TEMPLATE_NAME}' encontrada en editorTemplates")
        return True
    else:
        fail(f"'{TEST_TEMPLATE_NAME}' NO aparece en editorTemplates")
        info(f"Templates disponibles: {[t.get('name') for t in editor_templates]}")
        return False


def step_cleanup(client, tid: str) -> bool:
    """Paso 4: Eliminar (archivar) la plantilla de prueba."""
    header("PASO 4 · Limpieza (archivar plantilla)")
    info(f"DELETE /api/template-editor/templates/{tid}")

    r = client.delete(
        f"/api/template-editor/templates/{tid}",
        params={"author": TEST_AUTHOR},
    )
    if r.status_code not in (200, 204):
        fail(f"HTTP {r.status_code} al eliminar")
        fail(f"Respuesta: {r.text[:300]}")
        return False

    data = r.json()
    ok(f"Plantilla archivada  status={data.get('status')}")

    # Verificar que ya no aparece en /api/templates
    r2 = client.get("/api/templates")
    if r2.status_code == 200:
        still = any(
            t.get("name") == TEST_TEMPLATE_NAME
            for t in r2.json().get("editorTemplates", [])
        )
        if still:
            fail("La plantilla sigue apareciendo en editorTemplates tras archivarla")
            return False
        ok("Confirmado: plantilla ya no aparece en editorTemplates")
    return True


# ── Orquestador ─────────────────────────────────────────────────────────
def run(base_url: str) -> int:
    header(f"E2E Template Integration Verify")
    info(f"Target: {base_url}")
    info(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    tid: str | None = None
    results: dict[str, bool] = {}

    try:
        with httpx.Client(base_url=base_url, timeout=30) as client:
            # Paso 1 – Crear
            tid = step_create(client)
            results["create"] = tid is not None
            if not tid:
                return 1

            # Paso 2 – Publicar
            results["publish"] = step_publish(client, tid)
            if not results["publish"]:
                step_cleanup(client, tid)
                return 1

            # Paso 3 – Integración
            results["integration"] = step_verify_integration(client)

            # Paso 4 – Limpieza (siempre se ejecuta si tenemos tid)
            results["cleanup"] = step_cleanup(client, tid)
            tid = None  # ya se limpió

    except Exception as exc:
        exc_type = type(exc).__name__
        if "Connect" in exc_type or "ConnectionError" in exc_type:
            fail(f"No se pudo conectar a {base_url}")
            info("Esta el backend encendido?  (python -m uvicorn backend.main:app)")
            info("La URL de Supabase esta configurada en .env?")
        else:
            fail(f"Error inesperado ({exc_type}): {exc}")
        return 1
    finally:
        # Safety net: si algo fallo antes de la limpieza, intentar limpiar
        if tid:
            info("Ejecutando limpieza de emergencia...")
            try:
                with httpx.Client(base_url=base_url, timeout=10) as client:
                    client.delete(
                        f"/api/template-editor/templates/{tid}",
                        params={"author": TEST_AUTHOR},
                    )
                    ok("Limpieza de emergencia completada")
            except Exception:
                fail(f"No se pudo limpiar la plantilla {tid}. Archivala manualmente.")

    # ── Resumen ──────────────────────────────────────────────────────
    header("RESUMEN")
    all_ok = all(results.values())
    for step_name, passed in results.items():
        status = _c("32", "PASS") if passed else _c("31", "FAIL")
        print(f"  {status}  {step_name}")

    print()
    if all_ok:
        ok("Todos los pasos completados correctamente.")
        ok("La base de datos quedo en su estado original (idempotente).")
    else:
        fail("Algunos pasos fallaron. Revisa los logs arriba.")

    return 0 if all_ok else 1


# ── CLI ──────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="Verificacion E2E de la integracion de plantillas"
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:7860",
        help="URL base del backend (default: http://localhost:7860)",
    )
    args = parser.parse_args()
    sys.exit(run(args.base_url))


if __name__ == "__main__":
    main()
