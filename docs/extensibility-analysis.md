# Análisis de extensibilidad del sistema

## Diagnóstico ejecutivo
El sistema está **funcionalmente modular por dominio** (routers y componentes separados por herramienta), pero su extensibilidad depende de wiring manual y convenciones implícitas. Esto lo deja en un estado **medio-bajo** para crecimiento rápido con seguridad: se puede escalar en features, pero con alto riesgo de drift entre frontend, backend y configuración.

---

## 1) ¿Qué tan preparado está para agregar nuevas tools?

### Fortalezas
- Backend separado por módulos (`technical_reports`, `fichas_tecnicas`, `image_optimizer`, `compressor`, `ocr_tools`, `template_editor`, `msheets`) con routers propios. 
- Frontend separado por pantallas/componentes por herramienta.

### Hallazgos críticos
- Registro de tools en backend es manual y centralizado en `main.py` (`app.include_router(...)` para cada módulo). No hay auto-registro ni contrato plugin.  
- Registro de tools en frontend también es manual y duplicado: rutas en `AppRouter.jsx` y navegación en `DashboardLayout.jsx`.
- Prefijos API no son homogéneos (`/api/tools` para OCR, `/api/compressor`, `/api/template-editor`, etc.), lo que complica onboarding y observabilidad.

**Impacto:** cada tool nueva exige tocar múltiples lugares (backend + frontend + navegación + entrypoints), aumentando riesgo de omisiones.

---

## 2) Configuración granular

### Fortalezas
- Existe objeto central de configuración con `pydantic-settings` (`Settings`) y aliases de entorno.
- Hay flags y parámetros finos en OCR y CORS.

### Limitaciones
- Configuración aún global/monolítica: no existe estructura por tool (`tools.<id>.enabled`, `limits`, `policies`) ni niveles (global, entorno, tenant, request).
- Mezcla de fuentes: varias rutas leen `os.getenv(...)` directamente (template editor) en vez de pasar siempre por `settings`.
- No hay validación fuerte de compatibilidad entre opciones (ej. combinaciones inválidas de backend OCR/modelos).

**Impacto:** difícil gobernar configuraciones complejas y reproducibles entre ambientes.

---

## 3) Habilitar/deshabilitar capacidades

### Estado actual
- Solo algunas capacidades tienen feature flag real (Template Editor).
- Otras herramientas siempre están activas si se registran router y ruta.
- En frontend no hay catálogo de capacidades consumido del backend para render condicional del menú.

### Riesgo
- Feature rollout parcial/manual; puede haber discrepancias backend/frontend (ruta visible pero endpoint deshabilitado o viceversa).

---

## 4) Control de prompts, reglas y flujos

### Estado actual
- OCR tiene prompts y schemas hardcodeados en router/servicio.
- Hay soporte parcial de prompt de entrada, pero depende del backend OCR elegido (en modo local se ignora `prompt`).
- No existe motor declarativo de reglas/flujos (policy engine, workflow DSL, state machine).

### Riesgo
- Cambiar reglas requiere redeploy.
- No hay versionado ni trazabilidad de prompts/reglas por ejecución.

---

## 5) Personalización por contexto

### Estado actual
- Personalización básica por entorno (development/production).
- Sin capas claras por organización/usuario/rol/plantilla/canal.
- No hay strategy/factory unificada para resolver comportamiento contextual entre tools.

### Riesgo
- Escalar a multi-tenant, RBAC detallado o experiencias por cliente sería costoso y propenso a condicionales dispersos.

---

## 6) Escalar sin romper el sistema

### Riesgos técnicos detectados
- `backend/main.py` concentra demasiada lógica transversal y endpoints; tiende a convertirse en cuello de botella de cambios.
- Parches globales en runtime (multipart parser) aplican a toda la app sin políticas por ruta.
- Ausencia de contrato de plugin/tool + health/readiness por herramienta.
- Testing está orientado a features puntuales; falta suite de contratos de extensibilidad.

---

## Bugs principales (foco extensibilidad)
1. **Flag inconsistente en Template Editor**: el router mezcla `settings` y `os.getenv`, creando posibles resultados distintos según cómo se inicie el proceso.
2. **Comportamiento no uniforme de prompts OCR**: `prompt` puede ser ignorado en backend local, pero aplicado en Ollama; esto rompe expectativas de contrato API.
3. **Riesgo de drift de rutas/capacidades** por doble registro manual frontend/backend sin fuente única de verdad.
4. **Inconsistencia de namespace API** (`/api/tools` vs `/api/<tool>`), generando deuda de integración.

---

## Limitaciones actuales
- Sin arquitectura plugin (descubrimiento, lifecycle, manifest, dependencias).
- Sin `capability registry` central para UI + API + observabilidad.
- Sin políticas de feature flags por contexto (tenant, rol, porcentaje, entorno).
- Sin versionado de prompts/reglas y sin evaluaciones automáticas de regresión de comportamiento.
- Sin interfaz estándar de configuración por tool.

---

## Funcionalidades faltantes
- **Tool Manifest** (id, rutas, capacidades, permisos, feature flags, dependencias).
- **Registry central** (backend) y endpoint `/api/capabilities` consumido por frontend.
- **Config layering**: defaults → env → tenant → usuario → request.
- **Policy/Rule engine** para prompts, límites y validaciones por contexto.
- **Prompt Registry versionado** + auditoría.
- **Contract tests** para plugins/tools.

---

## Rediseño recomendado (incremental)

### A. Control plane de capacidades
Crear un módulo `capabilities` con:
- `ToolManifest` tipado.
- Registro único de tools.
- Resolución de flags por contexto.
- Endpoint público de capacidades efectivas.

### B. Arquitectura plugin en backend
Definir interfaz base:
- `register_routes(app_or_router)`
- `get_manifest()`
- `healthcheck()`
- `validate_config(settings)`

Cargar plugins por lista de módulos en config (`ENABLED_TOOLS=ocr,compressor,...`) + validación al startup.

### C. Frontend dirigido por capacidades
- Menú y rutas generados desde `/api/capabilities`.
- Fallback por feature no disponible con componente estándar.
- Evitar duplicación `AppRouter`/`DashboardLayout` mediante catálogo único.

### D. Prompt/rules governance
- `prompt_registry` versionado (archivo + DB opcional).
- Resolución por `context_key` (tool, tenant, idioma, tipo_doc).
- Trazabilidad en logs: prompt_version, rule_set, backend efectivo.

### E. Hardening para escala
- Separar `main.py` en composición por dominios + bootstrap infra.
- Estándar de errores y telemetría por tool.
- Contract testing de manifests y capacidad mínima por plugin.

---

## Arquitectura ideal para tools/plugins

### Componentes
1. **Plugin SDK interno** (tipos e interfaces).
2. **Plugin Loader** (descubrimiento y lifecycle).
3. **Capability Service** (resuelve enabled/disabled y permisos por contexto).
4. **Configuration Service** (layering + validación de schema por tool).
5. **Prompt/Rule Service** (versionado y selección contextual).
6. **Observability Layer** (métricas/logs/tracing con tags de tool y versión).

### Flujo recomendado
- Startup:
  1. Cargar config global.
  2. Descubrir plugins.
  3. Validar config de cada plugin.
  4. Registrar rutas.
  5. Publicar capacidades.
- Request:
  1. Resolver contexto (entorno, tenant, rol, canal, flags).
  2. Evaluar capability/policy.
  3. Resolver prompt/regla/version.
  4. Ejecutar tool con tracing.

---

## Plan de implementación por prioridad

### P0 (inmediato, 1-2 sprints)
1. Unificar lectura de configuración (eliminar `os.getenv` directo en routers).
2. Crear `ToolManifest` mínimo y endpoint `/api/capabilities`.
3. Centralizar catálogo de tools en frontend para evitar doble mantenimiento.
4. Normalizar prefijos API para nuevas tools.

### P1 (corto plazo, 2-4 sprints)
1. Implementar loader de plugins interno con registro declarativo.
2. Agregar feature flags por tool en `Settings` con esquema consistente.
3. Introducir `prompt_registry` y versionado mínimo.
4. Contract tests (manifest válido, rutas registradas, capability visible).

### P2 (mediano plazo, 1-2 trimestres)
1. Policy engine contextual (tenant/rol/tipo documento).
2. Config layering completo y overrides por contexto.
3. Observabilidad avanzada (dashboards por tool, tasa de error por versión).
4. Migración gradual de tools legacy al SDK plugin.

### P3 (escala enterprise)
1. Marketplace interno de plugins (firma/versionado/compatibilidad).
2. Rollouts progresivos (porcentaje, cohortes, canary).
3. Gobernanza integral de prompts/reglas con aprobación y auditoría.

---

## Conclusión
El sistema tiene base modular útil, pero hoy está más cerca de una **arquitectura por módulos estáticos** que de una **plataforma extensible**. Para escalar sin fricción, conviene evolucionar hacia un modelo de **capabilities + manifests + plugins + configuración contextual versionada**.
