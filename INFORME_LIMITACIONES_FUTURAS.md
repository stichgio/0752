# 🔎 Informe de Limitaciones Futuras — Glitch/AutoReport

> **Auditoría realizada el:** 2026-03-09
> **Stack analizado:** FastAPI (Python 3.11) + React 18/Vite/TypeScript + WeasyPrint + JSON local
> **Archivos revisados:** 14 archivos principales (routers, modelos, hooks, utils, config)

---

## Resumen ejecutivo

El sistema funciona correctamente como herramienta individual de generación de PDFs e informes técnicos, pero presenta fragilidades estructurales que lo bloquean ante cualquier crecimiento real. La persistencia en JSON local sin transacciones ni bloqueos concurrentes correctos es el riesgo más inmediato; un solo import accidental borra todos los datos sin recuperación posible. La mezcla de patrones sync/async en el event loop de FastAPI implica que con 3–4 usuarios simultáneos se producirán bloqueos y timeouts. La ausencia total de autenticación expone todos los endpoints de escritura/borrado. El diccionario de mapeo de columnas de 500+ líneas en `technical_reports/router.py` es una bomba de mantenibilidad: cualquier nuevo campo de CSV requiere edición manual de ese archivo. Si el sistema se despliega en la nube con usuarios reales sin refactorizar estas áreas, requerirá una reescritura parcial en menos de 6 meses.

---

## Listado de limitaciones

### LIM-001: Sin autenticación ni autorización en endpoints críticos

- **Dimensión**: [E] SEGURIDAD
- **Severidad**: 🔴 Alta
- **Dónde está**: Todos los routers — `backend/*/router.py`; especialmente `fichas_tecnicas/router.py:237`, `technical_reports/router.py:331`
- **Descripción**: Ningún endpoint valida identidad del llamante. Cualquier cliente HTTP puede ejecutar `POST /fichas-tecnicas/import-file` o `DELETE /reports/{id}` sin credencial alguna. El único control de acceso existente es la determinación de rol en `template_editor/router.py:58`, que concede `admin` automáticamente si la variable `ENVIRONMENT=dev`.
- **Escenario de dolor**: Con usuarios reales, cualquier miembro del equipo (o atacante externo si el puerto es público) puede borrar toda la base de datos o sobreescribir informes de otros usuarios.
- **Dirección de solución**: Implementar middleware de autenticación JWT o API-key en FastAPI (`HTTPBearer` o `APIKeyHeader`). Separar rutas públicas (lectura) de rutas protegidas (escritura/borrado). Nunca elevar privilegios automáticamente según variable de entorno.

---

### LIM-002: Import destructivo sin backup ni confirmación

- **Dimensión**: [B] PERSISTENCIA
- **Severidad**: 🔴 Alta
- **Dónde está**: `backend/fichas_tecnicas/router.py:237-287`, `backend/technical_reports/router.py:331-443`
- **Descripción**: El endpoint `POST /import-file` elimina **todos** los registros existentes (`clear_existing=True`) y los reemplaza con el archivo subido. No existe modo dry-run, copia de seguridad previa, ni rollback en caso de fallo parcial durante la importación.
- **Escenario de dolor**: Un CSV malformado o con pocas filas importado accidentalmente borra meses de fichas técnicas. No hay undo. El `deleted_count` aparece en la respuesta JSON pero es información post-mortem.
- **Dirección de solución**: Crear backup atómico del JSON antes del import (`fichas_YYYYMMDD_HHMMSS.json`). Implementar modo `dry_run=true` que devuelve preview sin escribir. Añadir endpoint de restore. Convertir el import en operación merge-by-id por defecto en lugar de replace-all.

---

### LIM-003: Bloqueo del event loop por I/O síncrono en endpoints async

- **Dimensión**: [A] ESCALABILIDAD
- **Severidad**: 🔴 Alta
- **Dónde está**: `backend/db/base_json_db.py:27-28`, `backend/fichas_tecnicas/router.py:268`, `backend/technical_reports/router.py:519-555`
- **Descripción**: La clase `BaseJsonDB` usa `threading.Lock` (no `asyncio.Lock`). Las operaciones de lectura/escritura de disco se llaman directamente desde coroutines async sin `run_in_executor`. Los `ThreadPoolExecutor` anidados dentro de funciones async bloquean el event loop durante la generación de PDFs en lote.
- **Escenario de dolor**: Con 3 usuarios generando PDFs simultáneamente, los `await` se bloquean entre sí. Los timeouts de 60s del frontend se alcanzan con frecuencia. Uvicorn con un solo worker colapsa; con múltiples workers el `threading.Lock` no protege entre procesos.
- **Dirección de solución**: Convertir operaciones de disco a `asyncio.to_thread()`. Reemplazar `threading.Lock` por `asyncio.Lock`. Separar la generación de PDFs en worker pool dedicado (Celery, ARQ, o FastAPI BackgroundTasks correctamente).

---

### LIM-004: Persistencia JSON sin concurrencia multi-proceso

- **Dimensión**: [B] PERSISTENCIA
- **Severidad**: 🔴 Alta
- **Dónde está**: `backend/db/base_json_db.py:27-76`, `backend/data/*.json`
- **Descripción**: El `threading.Lock` protege solo dentro del mismo proceso. Con `uvicorn --workers 4` (o cualquier despliegue multi-proceso), múltiples workers leen y escriben el mismo archivo JSON simultáneamente sin coordinación. El write atómico (`os.replace`) reduce pero no elimina la corrupción de datos.
- **Escenario de dolor**: Dos usuarios actualizan fichas al mismo tiempo → último write gana → datos perdidos silenciosamente. El archivo JSON crece ilimitadamente en memoria al arrancar (carga completa en `__init__`).
- **Dirección de solución**: Migrar a SQLite con WAL mode para uso mono-servidor (reemplaza JSON sin infraestructura extra). Para escalado real: PostgreSQL con SQLAlchemy async. Implementar file-level locking (`fcntl.flock`) como medida provisional.

---

### LIM-005: Diccionario de normalización de 500+ entradas codificado a mano

- **Dimensión**: [C] MANTENIBILIDAD
- **Severidad**: 🔴 Alta
- **Dónde está**: `backend/technical_reports/router.py:50-480` — `_HEADER_MAPPING`
- **Descripción**: Un diccionario con más de 500 entradas mapea variantes textuales de encabezados CSV a nombres de campo canónicos. Cada nueva variante (acento distinto, espacio extra, abreviatura) requiere edición manual. Las columnas sin mapeo se descartan silenciosamente. Existen entradas semánticamente cuestionables (ej. `'canastillasaduccion12': 'canastillas_aduccion_14'` con un comentario "if needed").
- **Escenario de dolor**: Un nuevo cliente entrega CSV con encabezados ligeramente distintos → datos se pierden sin warning → operador descubre el problema cuando el PDF sale vacío → debe editar el router y redesplegar.
- **Dirección de solución**: Reemplazar el diccionario estático por un algoritmo de matching difuso (distancia de Levenshtein o `rapidfuzz`). Emitir warning con lista de columnas no mapeadas en la respuesta del import. Permitir que el usuario defina mapeos custom vía JSON configurable sin tocar código.

---

### LIM-006: Valores por defecto mutables en modelos Pydantic

- **Dimensión**: [F] TESTING / CALIDAD
- **Severidad**: 🔴 Alta
- **Dónde está**: `backend/fichas_tecnicas/models.py:47-102`, `backend/technical_reports/models.py:64-91`
- **Descripción**: Los modelos usan listas y diccionarios como valores por defecto directos (ej. `productos: List[ProductoQuimico] = [ProductoQuimico(), ...]`). En Python, todos los instancias comparten el mismo objeto mutable. Modificar `ficha_a.productos` puede alterar `ficha_b.productos` si fueron creados desde defaults.
- **Escenario de dolor**: Bug intermitente difícil de reproducir: al procesar fichas en paralelo con `ThreadPoolExecutor`, los objetos default se mutan entre threads, produciendo datos cruzados entre informes.
- **Dirección de solución**: Usar `Field(default_factory=...)` para todos los campos mutables. Habilitar `model_config = ConfigDict(extra='forbid')` para detectar typos en nombres de campo.

---

### LIM-007: Sin sistema de logging estructurado

- **Dimensión**: [G] OBSERVABILIDAD
- **Severidad**: 🟡 Media
- **Dónde está**: Todos los módulos backend — mezclado `print()` y `logger.xxx()` sin patrón consistente; ej. `fichas_tecnicas/router.py:252`, `image_optimizer/router.py:51`, `config.py:73`
- **Descripción**: La mayoría de mensajes operacionales usan `print()` a stdout. No hay correlation ID por request. No hay logging de duración de operaciones. No hay diferenciación entre DEBUG/INFO/WARNING/ERROR en muchos módulos. Los errores en threads hijos (ThreadPoolExecutor) se loggean a veces con `print()`, a veces se silencian.
- **Escenario de dolor**: En producción, con múltiples usuarios, los logs de stdout se mezclan sin forma de saber qué request generó qué error. Un fallo de PDF silencioso (excepción capturada con `except: pass`) es invisible para el operador.
- **Dirección de solución**: Adoptar `structlog` o configurar `python-json-logger` con formato JSON. Añadir middleware de FastAPI que asigne `X-Request-ID` a cada request y lo propague al contexto de log. Eliminar todos los `print()` en favor de `logger.xxx()`.

---

### LIM-008: Sin límites de tamaño en uploads de archivos

- **Dimensión**: [E] SEGURIDAD
- **Severidad**: 🟡 Media
- **Dónde está**: `backend/image_optimizer/router.py:17-53`, `backend/compressor/router.py:577-581`, `backend/fichas_tecnicas/router.py`
- **Descripción**: Los endpoints que reciben `UploadFile` leen el contenido completo en memoria (`await file.read()`) sin verificar tamaño previamente. La validación de número de archivos en compressor ocurre después de leer todos los archivos en memoria. No existe límite de tamaño por archivo ni límite de payload total.
- **Escenario de dolor**: Un usuario (malicioso o accidental) sube un PDF de 2GB → el servidor agota RAM → OOM killer termina el proceso → todos los usuarios en el servidor pierden sesión.
- **Dirección de solución**: Configurar `max_upload_size` en Uvicorn/middleware. Leer el tamaño del header `Content-Length` antes de procesar. Validar número de archivos **antes** de leer contenido. Implementar límite por archivo (ej. 50MB) y límite total de batch (ej. 200MB).

---

### LIM-009: Manejo de errores genérico que enmascara fallos reales

- **Dimensión**: [F] TESTING / CALIDAD
- **Severidad**: 🟡 Media
- **Dónde está**: `backend/compressor/router.py:102-149`, `backend/fichas_tecnicas/router.py:341-345`, `backend/technical_reports/router.py:519-555`; frontend `useAsyncAction.ts:37-39`
- **Descripción**: Existen más de 30 bloques `except Exception as e: print(...)` o `except Exception: pass` que consumen excepciones sin distinción. Los errores de validación, I/O, OOM, timeout y corrupción se tratan de forma idéntica. En el frontend, `alert(msg)` bloquea la UI ante cualquier error.
- **Escenario de dolor**: Un PDF corrupto pasa la validación de magic bytes, falla en WeasyPrint con `MemoryError`, el except genérico devuelve el PDF original sin compresión con `success=True`. El usuario no sabe que algo falló.
- **Dirección de solución**: Crear jerarquía de excepciones de dominio (`ValidationError`, `ProcessingError`, `StorageError`). Manejar cada tipo con estrategia específica. En frontend, reemplazar `alert()` por el sistema toast ya disponible (`sonner`). Implementar esquema de respuesta de error consistente (`{error_code, message, detail}`).

---

### LIM-010: Timeout y configuración de calidad hardcodeados en múltiples lugares

- **Dimensión**: [C] MANTENIBILIDAD
- **Severidad**: 🟡 Media
- **Dónde está**: `backend/compressor/router.py:167-169` y `:385-386` (mapeos de calidad duplicados); `:401` (cálculo de timeout con magic numbers); `frontend/src/utils/apiClient.ts:7-10` (timeout 60000ms)
- **Descripción**: Los mapeos de calidad JPEG (`{"ultra": 20, "aggressive": 30, ...}`) están definidos en dos lugares distintos del mismo archivo con valores diferentes para la misma clave. El timeout de subprocess se calcula con `max(120, min(600, size * 15))` sin documentación ni configurabilidad. El timeout del frontend es fijo en 60s.
- **Escenario de dolor**: Se decide cambiar la calidad "aggressive" de 30 a 35 → se actualiza un diccionario → se olvida el otro → comportamiento inconsistente según ruta de código.
- **Dirección de solución**: Centralizar todos los parámetros configurables en `backend/config.py` como campos Pydantic con validación. Unificar los mapeos de calidad en una única constante importada. Exponer timeouts como variables de entorno.

---

### LIM-011: Templates PDF rígidos sin separación de datos y presentación

- **Dimensión**: [D] EXTENSIBILIDAD
- **Severidad**: 🟡 Media
- **Dónde está**: `backend/fichas_tecnicas/templates/`, `backend/technical_reports/templates/` (Jinja2 + CSS embebido)
- **Descripción**: Los templates Jinja2 contienen CSS embebido inline. La lógica de presentación (colores corporativos, márgenes, fuentes) está mezclada con la estructura HTML. No existe sistema de theming. Añadir un nuevo tipo de informe implica duplicar el template completo.
- **Escenario de dolor**: El cliente pide cambiar el color corporativo → hay que editar CSS en 4 templates distintos → un template se olvida → los PDFs son inconsistentes entre módulos.
- **Dirección de solución**: Separar estilos en un archivo CSS base compartido importado por todos los templates. Implementar variables CSS (custom properties) para theming. Crear template base con bloques Jinja2 (`{% block %}`) que los templates específicos extiendan.

---

### LIM-012: Estado frontend distribuido sin sincronización global

- **Dimensión**: [H] UX / RENDIMIENTO
- **Severidad**: 🟡 Media
- **Dónde está**: `frontend/src/hooks/useLocalDraft.ts`, `frontend/src/App.jsx:63-67`, `frontend/src/hooks/useSSEProgress.ts`
- **Descripción**: El estado de la aplicación se gestiona mediante hooks locales (`useLocalDraft`, `useAsyncAction`, `useSSEProgress`) sin store global. Los datos de usuario (logos, columnas custom) se persisten en `localStorage` con claves string literales dispersas. No hay invalidación de caché coordinada entre tabs o sesiones.
- **Escenario de dolor**: El usuario trabaja en dos pestañas → guarda en pestaña A → pestaña B tiene estado stale → sobrescribe el trabajo de A. La hidratación desde localStorage causa flash de contenido no estilizado. Si localStorage está lleno, el draft se pierde silenciosamente (`catch(e) { console.error }`) sin notificar al usuario.
- **Dirección de solución**: Implementar store global ligero (Zustand o Jotai) con persistencia opcional. Centralizar todas las storage keys en un archivo de constantes con versioning (`STORAGE_V1_DRAFT_KEY`). Notificar al usuario si el guardado falla con el toast de `sonner`.

---

### LIM-013: Autocomplete y paginación con full-scan de base de datos

- **Dimensión**: [A] ESCALABILIDAD
- **Severidad**: 🟡 Media
- **Dónde está**: `backend/fichas_tecnicas/router.py:636-649`, `backend/technical_reports/router.py:170-189`
- **Descripción**: El endpoint `GET /autocomplete/cliente` carga **todas** las fichas del disco, extrae los clientes únicos en Python y ordena en memoria. La paginación de informes carga todos los registros y aplica `skip/limit` en Python. Ambas operaciones son O(n) con n = número total de registros.
- **Escenario de dolor**: Con 10.000 fichas, cada keystroke de autocomplete carga 10.000 objetos del disco, los deserializa y desecha 9.990. Con JSON local esto no escala; con una DB real seguiría siendo un anti-patrón.
- **Dirección de solución**: Mantener índices en memoria para campos frecuentes (clientes únicos, estados) actualizados en cada write. Implementar paginación con cursor en lugar de offset. Como medida provisional: caché en memoria con TTL de 30s para resultados de autocomplete.

---

### LIM-014: Sin health checks ni endpoint de estado de dependencias

- **Dimensión**: [G] OBSERVABILIDAD
- **Severidad**: 🟡 Media
- **Dónde está**: `backend/main.py` (asumido), `backend/config.py`, `backend/fichas_tecnicas/router.py:18-31`
- **Descripción**: No existe endpoint `GET /health` que reporte el estado de dependencias opcionales (Ghostscript, openpyxl, Supabase). La ausencia de openpyxl se detecta con `print()` al arrancar. La indisponibilidad de Supabase en `template_editor` retorna lista vacía sin indicación de error. No hay readiness/liveness probes para despliegue en contenedores.
- **Escenario de dolor**: En producción en Kubernetes/Docker, el pod arranca pero Ghostscript no está instalado → las compresiones silenciosamente no comprimen → el operador descubre el problema días después revisando logs de stdout.
- **Dirección de solución**: Implementar `GET /health` con checks de dependencias (Ghostscript disponible, escritura en disco, conexión Supabase). Retornar `{"status": "degraded", "checks": {...}}` con HTTP 200 para degradación parcial y HTTP 503 para fallo crítico. Documentar qué funcionalidades se degradan sin cada dependencia.

---

### LIM-015: Riesgo de path traversal en manejo de nombres de archivo

- **Dimensión**: [E] SEGURIDAD
- **Severidad**: 🟡 Media
- **Dónde está**: `backend/image_optimizer/router.py:31-38`, `backend/compressor/router.py:449-452`
- **Descripción**: Los nombres de archivo de uploads se usan directamente con `os.path.basename()` para crear entradas en ZIPs. `os.path.basename("../../etc/passwd")` devuelve `"passwd"`, lo que es seguro para el ZIP pero no lo es si el nombre se usa después para construir paths de archivo en disco. La validación de PDF solo comprueba extensión `.pdf`.
- **Escenario de dolor**: Un cliente automatizado sube archivos con nombres crafteados → logs exponen nombres de archivo → o un futuro refactor usa el nombre para construir un path → path traversal.
- **Dirección de solución**: Sanitizar nombres de archivo con una función centralizada que use `pathlib.Path(name).name` y valide contra allowlist de caracteres. Generar nombres internos con UUID y mapear al nombre original solo en el header `Content-Disposition` de la respuesta.

---

### LIM-016: Generación de PDFs en lote sin streaming ni control de memoria

- **Dimensión**: [H] UX / RENDIMIENTO
- **Severidad**: 🟡 Media
- **Dónde está**: `backend/fichas_tecnicas/router.py:381-409`, `backend/technical_reports/router.py:669-701`
- **Descripción**: La consolidación de PDFs carga todos los archivos individuales en un objeto `PdfWriter` simultáneamente. El uso de memoria crece linealmente con el número de informes (200 fichas × 2MB = 400MB RAM). No existe streaming del merge ni liberación de memoria entre batches.
- **Escenario de dolor**: Un usuario genera 500 fichas técnicas → el servidor necesita ~1GB RAM solo para ese merge → OOM killer termina el proceso → el usuario recibe error 500 sin saber qué pasó → los archivos temporales no se limpian.
- **Dirección de solución**: Implementar merge por streaming usando `pypdf` con modo append-incremental. Limitar el tamaño de batch de merge y concatenar resultados intermedios. Añadir metric de uso de memoria al log de la operación.

---

### LIM-017: CORS configurable pero con lógica de validación frágil

- **Dimensión**: [E] SEGURIDAD
- **Severidad**: 🟢 Baja
- **Dónde está**: `backend/config.py:23-78`
- **Descripción**: La lógica de CORS tiene tres paths de ejecución para determinar los orígenes permitidos. El uso de `"*"` en producción se filtra silenciosamente con un `print()` de warning. Si `CORS_ALLOWED_ORIGINS` no está configurado en producción, el CORS queda vacío (`[]`) sin que el operador lo note explícitamente.
- **Escenario de dolor**: Se despliega en producción sin configurar `CORS_ALLOWED_ORIGINS` → el frontend en `app.example.com` no puede conectar al backend → el equipo pasa horas debuggeando CORS.
- **Dirección de solución**: Simplificar a dos casos: desarrollo (wildcard) y producción (lista explícita requerida). En producción, si la lista está vacía, loggear WARNING nivel ERROR y opcionalmente fallar el arranque. Mover el warning de `print()` a `logger.warning()`.

---

### LIM-018: Sin versionado de API ni estrategia de compatibilidad

- **Dimensión**: [D] EXTENSIBILIDAD
- **Severidad**: 🟢 Baja
- **Dónde está**: `backend/main.py` (asumido), todos los routers con prefijo `/api/`
- **Descripción**: No existe prefijo de versión en las rutas (`/api/v1/`). Los cambios breaking en el schema de respuesta afectan directamente al frontend sin posibilidad de migración gradual. El `model_validator` de `TechnicalReport` parchea datos legacy, indicando que ya hubo cambios de schema sin versionado formal.
- **Escenario de dolor**: Se añade un campo requerido al modelo de ficha → el frontend antiguo (usuarios con caché de browser) envía requests sin ese campo → errores 422 masivos → hay que forzar hard-refresh a todos los usuarios.
- **Dirección de solución**: Adoptar prefijo `/api/v1/` desde ahora. Mantener compatibilidad hacia atrás con `model_validator` durante períodos de transición documentados. Implementar `Deprecation` header en endpoints que cambiarán.

---

## Mapa de prioridades

| ID      | Título                                          | Dimensión | Severidad | Impacto | Esfuerzo | Orden |
|---------|-------------------------------------------------|-----------|-----------|---------|----------|-------|
| LIM-001 | Sin autenticación en endpoints críticos         | [E]       | 🔴        | Alto    | Medio    | 1     |
| LIM-002 | Import destructivo sin backup ni confirmación   | [B]       | 🔴        | Alto    | Bajo     | 2     |
| LIM-006 | Valores por defecto mutables en modelos Pydantic| [F]       | 🔴        | Alto    | Bajo     | 3     |
| LIM-003 | Bloqueo del event loop por I/O síncrono         | [A]       | 🔴        | Alto    | Medio    | 4     |
| LIM-004 | Persistencia JSON sin concurrencia multi-proceso| [B]       | 🔴        | Alto    | Alto     | 5     |
| LIM-005 | Diccionario de normalización de 500+ entradas   | [C]       | 🔴        | Alto    | Medio    | 6     |
| LIM-008 | Sin límites de tamaño en uploads                | [E]       | 🟡        | Alto    | Bajo     | 7     |
| LIM-009 | Manejo de errores genérico que enmascara fallos | [F]       | 🟡        | Medio   | Medio    | 8     |
| LIM-016 | Generación de PDFs en lote sin control memoria  | [H]       | 🟡        | Alto    | Medio    | 9     |
| LIM-007 | Sin sistema de logging estructurado             | [G]       | 🟡        | Medio   | Bajo     | 10    |
| LIM-014 | Sin health checks de dependencias               | [G]       | 🟡        | Medio   | Bajo     | 11    |
| LIM-013 | Autocomplete y paginación con full-scan         | [A]       | 🟡        | Medio   | Medio    | 12    |
| LIM-010 | Timeout y configuración hardcodeada duplicada   | [C]       | 🟡        | Medio   | Bajo     | 13    |
| LIM-012 | Estado frontend sin sincronización global       | [H]       | 🟡        | Medio   | Medio    | 14    |
| LIM-011 | Templates PDF rígidos sin separación CSS        | [D]       | 🟡        | Medio   | Medio    | 15    |
| LIM-015 | Riesgo de path traversal en nombres de archivo  | [E]       | 🟡        | Medio   | Bajo     | 16    |
| LIM-018 | Sin versionado de API                           | [D]       | 🟢        | Bajo    | Bajo     | 17    |
| LIM-017 | Lógica de CORS frágil                           | [E]       | 🟢        | Bajo    | Bajo     | 18    |

---

## Dependencias entre limitaciones

```
LIM-004 (JSON multi-proceso)
  └── bloquea resolver LIM-013 (paginación eficiente)
  └── bloquea resolver LIM-003 parcialmente (async-safe DB)

LIM-001 (Autenticación)
  └── debe resolverse antes de LIM-018 (versionado API)
      (no tiene sentido versionar endpoints sin protegerlos primero)

LIM-007 (Logging estructurado)
  └── debe resolverse antes de LIM-014 (health checks)
      (los health checks necesitan logs correlacionados para ser útiles)
  └── debe resolverse antes de LIM-009 (manejo de errores)
      (el nuevo manejo de errores debe loggear con estructura)

LIM-006 (Defaults mutables Pydantic)
  └── debe resolverse antes de LIM-016 (PDFs en lote)
      (el procesamiento paralelo amplifica el bug de defaults mutables)

LIM-002 (Import sin backup)
  └── independiente, puede resolverse en cualquier orden
  └── pero conviene hacerlo antes de LIM-004 (migración DB)
      (el proceso de migración a SQLite requiere un import confiable)

LIM-005 (Diccionario 500+ entradas)
  └── independiente, pero facilita LIM-011 (extensibilidad templates)
      (un mapping dinámico permite templates con campos arbitrarios)
```

---

## Próximos pasos recomendados (roadmap de hardening)

### Fase 1 — Quick wins (1–3 semanas, bajo esfuerzo, alto impacto inmediato)

1. **Corregir defaults mutables en modelos Pydantic** (`LIM-006`)
   Cambiar todas las listas/dicts como defaults a `Field(default_factory=...)`. Añadir `model_config = ConfigDict(extra='forbid')`. Es un cambio de 2 líneas por modelo que previene bugs de concurrencia.

2. **Agregar límites de tamaño a todos los endpoints de upload** (`LIM-008`)
   Configurar `max_upload_size` en middleware de FastAPI. Añadir validación de `Content-Length` antes de `await file.read()`. Limitar a 50MB por archivo y 200MB por batch.

3. **Crear backup atómico antes de cada import** (`LIM-002`)
   Antes de `clear_existing=True`, copiar el JSON actual a `data/backups/fichas_YYYYMMDD_HHMMSS.json`. Añadir endpoint `GET /backups` y `POST /restore/{backup_id}`. Costo: ~30 líneas de código.

4. **Centralizar y deduplicar configuración de calidad** (`LIM-010`)
   Mover los mapeos de calidad JPEG a `backend/config.py`. Importar desde ambos puntos de uso. Eliminar la versión duplicada con valores distintos.

5. **Reemplazar `print()` por `logger.xxx()`** (`LIM-007`)
   Configurar `logging` con `python-json-logger` en `main.py`. Sustituir los ~40 `print()` dispersos. Añadir `X-Request-ID` middleware. Sin cambios de arquitectura.

6. **Sanitizar nombres de archivo en uploads** (`LIM-015`)
   Crear función `sanitize_filename(name: str) -> str` usando `pathlib.Path(name).name` + regex allowlist. Usarla en todos los endpoints que reciben `UploadFile`.

7. **Implementar `GET /health`** (`LIM-014`)
   Endpoint que verifica: disco escribible, Ghostscript disponible, Supabase alcanzable (si configurado). Retorna JSON estructurado. Sin dependencias externas.

---

### Fase 2 — Refactor estructural (1–2 meses, mediano esfuerzo)

8. **Autenticación con API-key o JWT** (`LIM-001`)
   Implementar `HTTPBearer` middleware en FastAPI. Proteger todos los endpoints de escritura (`POST`, `PUT`, `DELETE`). Dejar lectura pública o con autenticación ligera. Definir roles: viewer / editor / admin.

9. **Corregir mezcla async/sync en el event loop** (`LIM-003`)
   Convertir operaciones de `BaseJsonDB` a `asyncio.to_thread()`. Reemplazar `threading.Lock` por `asyncio.Lock`. Mover la generación paralela de PDFs a un `ProcessPoolExecutor` gestionado externamente.

10. **Refactorizar `_HEADER_MAPPING` a matching difuso** (`LIM-005`)
    Implementar función `match_header(raw: str, candidates: List[str]) -> Optional[str]` con `rapidfuzz.process.extractOne`. Eliminar el diccionario de 500 entradas. Emitir warning por columnas sin mapeo en la respuesta.

11. **Resolver error handling genérico con jerarquía de excepciones** (`LIM-009`)
    Crear `backend/exceptions.py` con `AppError`, `ValidationError`, `ProcessingError`, `StorageError`. Añadir exception handler global en FastAPI. Definir schema `ErrorResponse` consistente.

12. **Implementar merge de PDFs por streaming** (`LIM-016`)
    Reemplazar `PdfWriter.append()` iterativo por merge con archivos intermedios. Limitar memoria por operación. Limpiar archivos temporales con `contextlib.ExitStack` para garantizar limpieza incluso en errores.

13. **Índices en memoria para autocomplete y paginación con cursor** (`LIM-013`)
    Mantener set `_clientes_index` actualizado en cada write de `BaseJsonDB`. Implementar `get_page(cursor_id, limit)` en lugar de `get_all()[skip:skip+limit]`.

14. **Template base compartido para PDFs** (`LIM-011`)
    Crear `backend/templates/base.html` con variables CSS y bloques Jinja2. Refactorizar templates de fichas y technical_reports para extender la base.

---

### Fase 3 — Evolución de plataforma (2–6 meses, alto esfuerzo, preparación para multi-tenant)

15. **Migración de persistencia JSON → SQLite/PostgreSQL** (`LIM-004`)
    Implementar capa de repositorio (`backend/db/repository.py`) con interfaz abstracta. Migrar `BaseJsonDB` a SQLAlchemy async. Comenzar con SQLite WAL mode para simplicidad; PostgreSQL cuando haya multi-servidor.

16. **Sistema de colas para generación de PDFs** (`LIM-003 + LIM-016`)
    Implementar worker pool con ARQ (Redis-backed) o Celery. Los endpoints de generación de PDFs retornan `task_id` inmediatamente. El SSE de progreso suscribe al estado del task. Permite escalar workers independientemente.

17. **Versionado de API y estrategia de migración** (`LIM-018`)
    Adoptar prefijo `/api/v1/`. Documentar deprecations con `Deprecation` header. Implementar schema migration automatizada para datos existentes.

18. **Store global frontend + gestión de sesión** (`LIM-012`)
    Adoptar Zustand para estado global. Centralizar storage keys con versioning. Implementar sincronización entre tabs con `BroadcastChannel API`. Integrar con el sistema de autenticación (Fase 2).

19. **Observabilidad completa** (`LIM-007 + LIM-014`)
    Integrar OpenTelemetry para trazas distribuidas. Exponer métricas Prometheus (`/metrics`). Dashboard en Grafana o equivalente. Alertas en fallo de health checks críticos.

---

*Este informe identifica las limitaciones que bloquean el crecimiento real del sistema. Las Fases 1 y 2 son requisito mínimo antes de cualquier despliegue con usuarios reales. La Fase 3 habilita colaboración en equipo y despliegue en la nube sin reescritura.*
