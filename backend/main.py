 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/backend/main.py b/backend/main.py
index a73673b745b95fc7aa5768fd3e0015235a9b2251..2814ef05dbffb4c7e1a0b5d6fbddb189ea5dcde0 100644
--- a/backend/main.py
+++ b/backend/main.py
@@ -112,50 +112,74 @@ def _validate_pdf_file(file: UploadFile) -> bool:
     except Exception:
         return False
 
 
 def _validate_pdf_uploads(files: List[UploadFile], min_files: int = 2) -> None:
     """Validación compartida para endpoints de merge sin alterar contrato de API."""
     if len(files) < min_files:
         raise HTTPException(status_code=400, detail="Se requieren al menos 2 archivos PDF")
     for file in files:
         if not _validate_pdf_file(file):
             raise HTTPException(status_code=400, detail=f"El archivo '{file.filename}' no es un PDF válido")
 
 
 # --- App Lifespan: singleton ReportService ---
 @asynccontextmanager
 async def lifespan(app: FastAPI):
     app.state.report_service = ReportService()
     print("[App] ReportService initialized (singleton)")
     yield
     await app.state.report_service.close()
     print("[App] ReportService closed")
 
 app = FastAPI(lifespan=lifespan)
 
 
+def _is_development_environment() -> bool:
+    env_name = os.getenv("ENVIRONMENT") or os.getenv("APP_ENV") or "production"
+    return env_name.strip().lower() in {"dev", "development", "local"}
+
+
+def _get_cors_allowed_origins() -> List[str]:
+    raw_origins = os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
+    if raw_origins:
+        origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
+        if "*" in origins:
+            if _is_development_environment():
+                return ["*"]
+            filtered_origins = [origin for origin in origins if origin != "*"]
+            print("[CORS] Ignoring wildcard origin outside development environment")
+            return filtered_origins
+        return origins
+
+    if _is_development_environment():
+        return ["*"]
+
+    print("[CORS] CORS_ALLOWED_ORIGINS is not configured; no cross-origin requests will be allowed")
+    return []
+
+
 def _error_code_from_status(status_code: int) -> str:
     if status_code == 400:
         return "BAD_REQUEST"
     if status_code == 401:
         return "UNAUTHORIZED"
     if status_code == 403:
         return "FORBIDDEN"
     if status_code == 404:
         return "NOT_FOUND"
     if status_code == 405:
         return "METHOD_NOT_ALLOWED"
     if status_code == 409:
         return "CONFLICT"
     if status_code == 422:
         return "VALIDATION_ERROR"
     if status_code == 429:
         return "RATE_LIMITED"
     if 500 <= status_code < 600:
         return "INTERNAL_ERROR"
     return "REQUEST_ERROR"
 
 
 def _extract_error_message(detail: Any) -> str:
     if isinstance(detail, str):
         return detail
@@ -175,55 +199,56 @@ async def http_exception_handler(_: Request, exc: HTTPException):
         status_code=exc.status_code,
         content={
             "detail": message,
             "error": {
                 "code": _error_code_from_status(exc.status_code),
                 "message": message,
             },
         },
         headers=exc.headers,
     )
 
 
 @app.exception_handler(RequestValidationError)
 async def request_validation_exception_handler(_: Request, exc: RequestValidationError):
     return JSONResponse(
         status_code=422,
         content={
             "detail": exc.errors(),
             "error": {
                 "code": "VALIDATION_ERROR",
                 "message": "Request validation failed",
             },
         },
     )
 
-# Enable CORS for frontend (separate deployment on Vercel)
+# Enable CORS with environment-based allowed origins.
+cors_allowed_origins = _get_cors_allowed_origins()
 app.add_middleware(
     CORSMiddleware,
-    allow_origins=["*"],  # Allow all origins for Vercel/HuggingFace deployment
-    allow_credentials=False,  # Must be False when using wildcard origins
+    allow_origins=cors_allowed_origins,
+    allow_credentials=False,
     allow_methods=["*"],
     allow_headers=["*"],
     expose_headers=[
         "X-Original-Size",
         "X-Compressed-Size",
         "X-Reduction-Percent",
         "X-Filename",
         "X-Error",
         "Content-Disposition",
     ],
 )
 
 # Create API Router with prefix
 api_router = APIRouter(prefix="/api")
 
 
 class TemplateStatusUpdatePayload(BaseModel):
     status: Literal["draft", "published", "archived"] = Field(default="draft")
     author: str = Field(default="system", min_length=1, max_length=120)
 
 # Include the routers (Only include once)
 app.include_router(technical_reports_router)
 app.include_router(fichas_tecnicas_router)
 app.include_router(image_optimizer_router)
 app.include_router(compressor_router)
 
EOF
)