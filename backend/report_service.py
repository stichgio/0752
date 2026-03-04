import os
import base64
import re
import io
import gc
import tempfile
import hashlib
import logging
from jinja2 import Environment, FileSystemLoader  # pyre-ignore[21]
import jinja2  # pyre-ignore[21]
from fastapi import HTTPException  # type: ignore
from config import settings  # type: ignore


def _configure_windows_gtk_runtime() -> None:
    """Optionally add GTK runtime directory on Windows for WeasyPrint dependencies."""
    if os.name != "nt":
        return

    gtk_path = settings.gtk_runtime_bin.strip()
    if not gtk_path or not os.path.isdir(gtk_path):
        return

    os.environ["PATH"] = gtk_path + os.pathsep + os.environ.get("PATH", "")
    add_dll_directory = getattr(os, "add_dll_directory", None)
    if callable(add_dll_directory):
        try:
            add_dll_directory(gtk_path)
        except Exception:
            pass


_configure_windows_gtk_runtime()

try:
    from weasyprint import HTML  # pyre-ignore[21]
    WEASYPRINT_AVAILABLE = True
except (OSError, ImportError) as e:
    print(f"WARNING: WeasyPrint not available: {e}")
    HTML = None
    WEASYPRINT_AVAILABLE = False

CHROME_PATH = None
if not WEASYPRINT_AVAILABLE:
    _windows_browser_candidates = [
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    ]
    _linux_browser_candidates = ["/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"]
    _browser_candidates = _windows_browser_candidates if os.name == "nt" else _linux_browser_candidates
    for _p in _browser_candidates:
        if os.path.isfile(_p):
            CHROME_PATH = _p
            print(f"INFO: Using browser fallback for PDF: {_p}")
            break

PDF_ENGINE_AVAILABLE = WEASYPRINT_AVAILABLE or (CHROME_PATH is not None)

from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
import piexif  # pyre-ignore[21]
from PIL import Image  # pyre-ignore[21]
import asyncio
import httpx  # pyre-ignore[21]


class BoundedCache:
    """Simple LRU cache with max size, using OrderedDict."""
    def __init__(self, maxsize=100):
        self._cache = OrderedDict()
        self._maxsize = maxsize

    def get(self, key):
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        return None

    def put(self, key, value):
        if key in self._cache:
            self._cache.move_to_end(key)
        self._cache[key] = value
        while len(self._cache) > self._maxsize:
            self._cache.popitem(last=False)

    def clear(self):
        self._cache.clear()

# ============================================================================
# CONFIGURACIÓN OPTIMIZADA Y ESTABLE
# ============================================================================

A4_WIDTH_MM, A4_HEIGHT_MM = 210, 297
TARGET_DPI = 150

MAX_IMAGE_SIZE = (
    int((A4_WIDTH_MM / 25.4) * TARGET_DPI),
    int((A4_HEIGHT_MM / 25.4) * TARGET_DPI)
)

JPEG_QUALITY = 90
MAX_CONCURRENT = 5
MAX_PDF_WORKERS = 4
PIPELINE_BUFFER_SIZE = 8
GC_INTERVAL = 10

# ✅ BATCHING OPTIMIZATION: Procesar múltiples reportes en paralelo
PDF_BATCH_SIZE = 5  # Número de PDFs a generar en paralelo por lote
HTML_PREFETCH_SIZE = 10  # Número de HTMLs a pre-renderizar adelante

# ✅ GHOSTSCRIPT COMPRESSION: Reducir tamaño del PDF final
GHOSTSCRIPT_ENABLED = settings.ghostscript_enabled   # Habilitar compresión post-proceso
GHOSTSCRIPT_QUALITY = settings.ghostscript_quality   # Opciones: screen (72dpi), ebook (150dpi), printer (300dpi), prepress (300dpi+)

TEMP_DIR = tempfile.gettempdir()

# ============================================================================
# GHOSTSCRIPT COMPRESSION UTILITY
# ============================================================================

def _check_ghostscript_available():
    """Verifica si Ghostscript está disponible en el sistema"""
    import shutil
    # Buscar gs (Linux/Mac) o gswin64c (Windows)
    gs_commands = ['gs', 'gswin64c', 'gswin32c']
    for cmd in gs_commands:
        if shutil.which(cmd):
            return cmd
    return None

def _compress_pdf_with_ghostscript(input_path, output_path=None, quality="printer"):
    """
    Comprime un PDF usando Ghostscript sin pérdida visible de calidad.

    Args:
        input_path: Ruta al PDF original
        output_path: Ruta de salida (si None, sobrescribe el original)
        quality: Nivel de calidad
            - "screen": 72 dpi, menor calidad, máxima compresión
            - "ebook": 150 dpi, buena calidad, buena compresión
            - "printer": 300 dpi, alta calidad, compresión moderada (RECOMENDADO)
            - "prepress": 300 dpi, máxima calidad, mínima compresión

    Returns:
        tuple: (success: bool, compressed_path: str, stats: dict)
    """
    import subprocess
    import shutil

    gs_cmd = _check_ghostscript_available()
    if not gs_cmd:
        print("[GS] Ghostscript no disponible, omitiendo compresión")
        return False, input_path, {"error": "Ghostscript not available"}

    # Si no se especifica output, usar archivo temporal
    if output_path is None:
        tmp_output = tempfile.NamedTemporaryFile(delete=False, suffix='_compressed.pdf')
        output_path = tmp_output.name
        tmp_output.close()
        replace_original = True
    else:
        replace_original = False

    # Obtener tamaño original
    original_size = os.path.getsize(input_path)

    # Comando Ghostscript optimizado para calidad/tamaño
    gs_args = [
        gs_cmd,
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        f'-dPDFSETTINGS=/{quality}',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        # Optimizaciones adicionales sin afectar calidad visible
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        '-dSubsetFonts=true',
        # Mantener calidad de imágenes
        '-dColorImageDownsampleType=/Bicubic',
        '-dGrayImageDownsampleType=/Bicubic',
        '-dMonoImageDownsampleType=/Bicubic',
        '-dAutoRotatePages=/None',
        '-dColorConversionStrategy=/LeaveColorUnchanged',
        f'-sOutputFile={output_path}',
        input_path
    ]

    try:
        result = subprocess.run(
            gs_args,
            capture_output=True,
            text=True,
            timeout=300  # 5 minutos máximo
        )

        if result.returncode != 0:
            print(f"[GS] Error: {result.stderr}")
            # Si falla, retornar el original
            if replace_original and os.path.exists(output_path):
                os.remove(output_path)
            return False, input_path, {"error": result.stderr}

        # Verificar que el archivo comprimido existe y es válido
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            print("[GS] Error: Archivo comprimido inválido")
            return False, input_path, {"error": "Invalid output file"}

        compressed_size = os.path.getsize(output_path)
        reduction = ((original_size - compressed_size) / original_size) * 100

        stats = {
            "original_size": original_size,
            "compressed_size": compressed_size,
            "reduction_percent": round(reduction, 1),  # pyre-ignore[6]
            "quality": quality
        }

        # Solo usar versión comprimida si realmente es menor
        if compressed_size < original_size:
            if replace_original:
                # Reemplazar original con comprimido
                os.remove(input_path)
                shutil.move(output_path, input_path)  # pyre-ignore[6]
                print(f"[GS] ✅ Comprimido: {original_size/1024/1024:.1f}MB → {compressed_size/1024/1024:.1f}MB ({reduction:.1f}% reducción)")
                return True, input_path, stats
            else:
                print(f"[GS] ✅ Comprimido: {original_size/1024/1024:.1f}MB → {compressed_size/1024/1024:.1f}MB ({reduction:.1f}% reducción)")
                return True, output_path, stats
        else:
            # El comprimido es mayor o igual, usar original
            if os.path.exists(output_path):
                os.remove(output_path)
            print(f"[GS] ℹ️ Sin mejora de compresión, usando original ({original_size/1024/1024:.1f}MB)")
            return True, input_path, {"skipped": True, "reason": "No improvement"}

    except subprocess.TimeoutExpired:
        print("[GS] Error: Timeout en compresión")
        if replace_original and os.path.exists(output_path):
            os.remove(output_path)
        return False, input_path, {"error": "Timeout"}
    except Exception as e:
        print(f"[GS] Error: {e}")
        if replace_original and os.path.exists(output_path):
            try:
                os.remove(output_path)
            except OSError:
                pass
        return False, input_path, {"error": str(e)}


class ReportService:
    def __init__(self, templates_dir=None):
        if templates_dir is None:
            templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")

        # ✅ OPTIMIZACIÓN SEGURA: Bytecode Cache
        cache_dir = os.path.join(TEMP_DIR, 'jinja2_cache')
        os.makedirs(cache_dir, exist_ok=True)

        self.env = Environment(
            loader=FileSystemLoader(templates_dir),
            auto_reload=False,
            cache_size=400,
            bytecode_cache=jinja2.FileSystemBytecodeCache(cache_dir)
        )

        # Pre-cargar templates más usados
        self.template = self.env.get_template("report.html")
        try:
            _ = self.template.module  # Forzar compilación
        except Exception as e:
            logging.warning("Pre-compilación de report.html falló: %s", e)

        # Cache de templates adicionales
        self._template_cache = {}

        # ✅ OPTIMIZACIÓN SEGURA: Cache de imágenes (LRU bounded)
        self._image_cache = BoundedCache(maxsize=100)
        self._logo_cache = {}

        # ✅ OPTIMIZACIÓN SEGURA: Cliente HTTP persistente
        self._http_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(
                max_connections=10,
                max_keepalive_connections=5
            )
        )

    async def close(self):
        """Clean up resources. Called during app shutdown."""
        await self._http_client.aclose()

    def get_template(self, template_name, strict=False):
        """Cargar template con cache"""
        if strict:
            try:
                loaded_template = self.env.get_template(template_name)
                self._template_cache[template_name] = loaded_template
                return loaded_template
            except Exception as e:
                print(f"Error loading template {template_name}: {e}")
                logging.warning("# FIX: BUG-006 template '%s' not found in strict mode", template_name)
                # FIX: BUG-006 allow strict mode to fail fast when template does not exist
                raise HTTPException(status_code=404, detail=f"Template '{template_name}' not found")

        if template_name not in self._template_cache:
            try:
                self._template_cache[template_name] = self.env.get_template(template_name)
            except Exception as e:
                print(f"Error loading template {template_name}: {e}")
                logging.warning("# FIX: BUG-006 template '%s' not found, using default fallback", template_name)
                # Fallback a template por defecto
                self._template_cache[template_name] = self.template

        return self._template_cache[template_name]

    def get_image_dimensions(self, img_path):
        """Returns (width, height, is_landscape) for an image"""
        try:
            with Image.open(img_path) as img:
                width, height = img.size
                is_landscape = width >= height
                return width, height, is_landscape
        except Exception:
            return 0, 0, True

    def get_image_metadata(self, img_path):
        metadata = {"date": "N/A", "coords": "N/A"}
        try:
            exif_dict = piexif.load(img_path)
            if piexif.ImageIFD.DateTime in exif_dict["0th"]:
                date_str = exif_dict["0th"][piexif.ImageIFD.DateTime].decode("utf-8")
                metadata["date"] = date_str

            if "GPS" in exif_dict and exif_dict["GPS"]:
                gps = exif_dict["GPS"]
                if piexif.GPSIFD.GPSLatitude in gps and piexif.GPSIFD.GPSLongitude in gps:
                    lat = self._convert_to_degrees(gps[piexif.GPSIFD.GPSLatitude])
                    lon = self._convert_to_degrees(gps[piexif.GPSIFD.GPSLongitude])
                    if gps[piexif.GPSIFD.GPSLatitudeRef] == b'S': lat = -lat
                    if gps[piexif.GPSIFD.GPSLongitudeRef] == b'W': lon = -lon
                    metadata["coords"] = f"{lat:.6f}, {lon:.6f}"
        except Exception:
            pass
        return metadata

    @staticmethod
    def optimize_image_for_pdf(image_content, max_size=MAX_IMAGE_SIZE, quality=JPEG_QUALITY):
        """Optimización de imágenes con resolución adaptativa"""
        try:
            if isinstance(image_content, str) and os.path.exists(image_content):
                with open(image_content, "rb") as f:
                    image_content = f.read()
            elif not isinstance(image_content, bytes):
                return None

            img = Image.open(io.BytesIO(image_content))
            del image_content

            if img.mode in ('RGBA', 'P', 'LA'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                if img.mode in ('RGBA', 'LA'):
                    background.paste(img, mask=img.split()[-1])
                else:
                    background.paste(img)
                img.close()
                img = background
            elif img.mode != 'RGB':
                old_img = img
                img = img.convert('RGB')
                old_img.close()

            if img.width <= max_size[0] and img.height <= max_size[1]:
                effective_size = (img.width, img.height)
            else:
                effective_size = max_size

            img.thumbnail(effective_size, Image.Resampling.BILINEAR)

            buffer = io.BytesIO()
            img.save(buffer, format="JPEG", quality=quality)
            img.close()

            buffer.seek(0)
            result = buffer.getvalue()
            buffer.close()

            return result
        except Exception as e:
            print(f"Error optimizing image: {e}")
            return None

    def _convert_to_degrees(self, value):
        d = float(value[0][0]) / float(value[0][1])
        m = float(value[1][0]) / float(value[1][1])
        s = float(value[2][0]) / float(value[2][1])
        return d + (m / 60.0) + (s / 3600.0)

    def _convert_to_base64_uri(self, image_bytes, mime_type="image/jpeg"):
        """Convert image bytes to base64 data URI"""
        b64_data = base64.b64encode(image_bytes).decode('utf-8')
        return f"data:{mime_type};base64,{b64_data}"

    def _process_logo(self, logo_data, side):
        """Process logo and return base64 data URI"""
        if logo_data is None:
            return None

        logo_hash = hashlib.sha256(str(logo_data).encode("utf-8") if not isinstance(logo_data, bytes) else logo_data).hexdigest()
        cache_key = f"logo_{side}_{logo_hash}"  # FIX: BUG-001 avoid cross-request/logo-content cache collisions
        if cache_key in self._logo_cache:
            return self._logo_cache[cache_key]

        try:
            # If already a data URI, return as-is
            if isinstance(logo_data, str) and logo_data.startswith("data:"):
                self._logo_cache[cache_key] = logo_data
                return logo_data

            # Convert bytes to data URI
            if isinstance(logo_data, bytes):
                logo_bytes = logo_data
            elif isinstance(logo_data, str):
                logo_bytes = logo_data.encode()
            else:
                return logo_data

            # Detect mime type (assume PNG for logos)
            data_uri = self._convert_to_base64_uri(logo_bytes, "image/png")
            self._logo_cache[cache_key] = data_uri
            return data_uri
        except Exception as e:
            print(f"Error processing logo: {e}")
            return logo_data

    async def _process_files_serial(self, files, max_size=MAX_IMAGE_SIZE, quality=JPEG_QUALITY):
        """Procesamiento de imágenes con base64 inline (sin archivos temporales)"""
        processed_images = []
        orientations = []

        if not files:
            return processed_images, "grid", 0

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        sem = asyncio.Semaphore(MAX_CONCURRENT)

        async def process_single_file(idx, file_obj):
            async with sem:
                try:
                    f_path = ""
                    f_name = ""
                    content = None

                    if isinstance(file_obj, dict):
                        f_path = file_obj.get("path", "")
                        f_name = file_obj.get("name", "")
                    else:
                        f_path = getattr(file_obj, 'path', '')
                        f_name = getattr(file_obj, 'filename', '')

                    # Acquire Content
                    if f_path.startswith("http"):
                        try:
                            resp = await self._http_client.get(f_path)
                            resp.raise_for_status()
                            content = resp.content
                        except Exception as e:
                            print(f"Error downloading {f_path}: {e}")
                            return None
                    elif f_path and os.path.exists(f_path):
                        def read_file():
                            with open(f_path, "rb") as f:
                                return f.read()
                        content = await loop.run_in_executor(None, read_file)  # pyre-ignore[6]
                    else:
                        return None

                    if not content:
                        return None

                    # Cache key: use (path, mtime, size) for local files, MD5 for HTTP/bytes
                    if f_path and os.path.exists(f_path):
                        stat = os.stat(f_path)
                        cache_key = f"local:{f_path}:{stat.st_mtime}:{stat.st_size}"
                    else:
                        cache_key = f"md5:{hashlib.md5(content).hexdigest()}"

                    cached = self._image_cache.get(cache_key)
                    if cached is not None:
                        cached_result = cached.copy()
                        cached_result['data'] = cached_result['data'].copy()
                        cached_result['data']['order'] = file_obj.get("order", idx) if isinstance(file_obj, dict) else idx
                        return cached_result

                    # Extract Metadata
                    metadata = {"date": "N/A", "coords": "N/A"}
                    width, height, is_landscape = 0, 0, True

                    if f_path and os.path.exists(f_path):
                        try:
                            metadata = self.get_image_metadata(f_path)
                            width, height, is_landscape = self.get_image_dimensions(f_path)
                        except Exception:
                            pass

                    # Optimize Image
                    optimized_bytes = await loop.run_in_executor(
                        None,
                        self.optimize_image_for_pdf,
                        content,
                        max_size,
                        quality
                    )

                    del content

                    if not optimized_bytes:
                        return None

                    if width == 0:
                        try:
                            with Image.open(io.BytesIO(optimized_bytes)) as img_check:
                                width, height = img_check.size
                                is_landscape = width >= height
                        except Exception:
                            is_landscape = True

                    # Convert to base64 data URI (no temp files needed)
                    image_data_uri = self._convert_to_base64_uri(optimized_bytes, "image/jpeg")

                    del optimized_bytes

                    result = {
                        "data": {
                            "path": image_data_uri,
                            "name": f_name,
                            "order": file_obj.get("order", idx) if isinstance(file_obj, dict) else idx,
                            "date": metadata.get("date", "N/A"),
                            "coords": metadata.get("coords", "N/A"),
                            "is_landscape": is_landscape,
                            "width": width,
                            "height": height
                        },
                        "orientation": is_landscape
                    }

                    self._image_cache.put(cache_key, result)

                    return result

                except Exception as e:
                    print(f"Error processing file {file_obj}: {e}")
                    import traceback
                    traceback.print_exc()
                    return None

        tasks = [process_single_file(idx, f) for idx, f in enumerate(files)]
        results = await asyncio.gather(*tasks)

        for res in results:
            if res:
                processed_images.append(res["data"])  # pyre-ignore[16]
                orientations.append(res["orientation"])  # pyre-ignore[16]

        processed_images.sort(key=lambda x: x["order"])

        img_count = len(processed_images)
        majority_landscape = sum(orientations) > len(orientations) / 2 if orientations else True

        if img_count == 1:
            layout_mode = "1"
        elif img_count == 2:
            layout_mode = "2"
        elif img_count == 3:
            layout_mode = "3"
        elif img_count == 4:
            layout_mode = "4"
        elif img_count == 5:
            layout_mode = "5"
        elif img_count == 6:
            layout_mode = "6"
        else:
            layout_mode = "grid"

        return processed_images, layout_mode, img_count

    async def generate_batch_pdf(self, reports_list, output_path=None, logo_left=None, logo_right=None, custom_template_str=None, template_name=None, on_progress=None):
        """
        Pipeline optimizado con BATCHING para generación de PDFs

        Mejoras de rendimiento:
        - Pre-renderiza múltiples HTMLs en paralelo (HTML_PREFETCH_SIZE)
        - Genera PDFs en lotes paralelos (PDF_BATCH_SIZE)
        - Merge incremental para liberar memoria
        """
        from pypdf import PdfWriter  # pyre-ignore[21]
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import time

        if not PDF_ENGINE_AVAILABLE:
            raise RuntimeError("No hay motor PDF disponible. Instale WeasyPrint o xhtml2pdf.")

        total_reports = len(reports_list)
        start_time = time.time()
        print(f"[PDF] Starting BATCHED generation: {total_reports} reports (batch_size={PDF_BATCH_SIZE})")

        logo_left_uri = logo_left
        logo_right_uri = logo_right

        # Template Selection con manejo de errores
        if custom_template_str:
            from jinja2 import Template  # pyre-ignore[21]
            template = Template(custom_template_str)
        elif template_name:
            # Check if it's in the technical reports templates
            tech_tpl_path = os.path.join(os.path.dirname(__file__), "technical_reports", "templates", template_name)
            if os.path.exists(tech_tpl_path):
                 tech_env = Environment(loader=FileSystemLoader(os.path.dirname(tech_tpl_path)))
                 template = tech_env.get_template(os.path.basename(tech_tpl_path))
            else:
                 try:
                    template = self.get_template(template_name)
                 except Exception:
                    print(f"Template {template_name} not found, falling back to default")
                    template = self.template
        else:
            template = self.template

        # =====================================================================
        # FASE 1: Pre-procesar todos los HTMLs en paralelo (batched)
        # =====================================================================
        async def prepare_single_html(i, report):
            """Prepara un HTML individual con sus imágenes procesadas"""
            try:
                row_data = report.get("data", {})
                files = report.get("files", [])

                # Procesar imágenes
                images, layout_mode, img_count = await self._process_files_serial(  # pyre-ignore[6, 16]
                    files,
                    max_size=MAX_IMAGE_SIZE,
                    quality=JPEG_QUALITY
                )

                # Renderizar HTML
                single_report_context = [{
                    "data": row_data,
                    "images": images,
                    "layout_mode": layout_mode,
                    "img_count": img_count
                }]

                html_out = template.render(
                    reports=single_report_context,
                    report=row_data,
                    title="PANEL FOTOGRÁFICO",
                    logo_left=logo_left_uri or logo_left,
                    logo_right=logo_right_uri or logo_right
                )

                return {'html': html_out, 'index': i}

            except Exception as e:
                print(f"[PDF] Error preparing HTML {i}: {e}")
                import traceback
                traceback.print_exc()
                return None

        # Preparar HTMLs en lotes para mejor control de memoria
        all_html_items = []
        html_batch_size = HTML_PREFETCH_SIZE

        for batch_start in range(0, total_reports, html_batch_size):
            batch_end = min(batch_start + html_batch_size, total_reports)
            batch_reports = reports_list[batch_start:batch_end]

            # Procesar lote de HTMLs en paralelo
            tasks = [
                prepare_single_html(batch_start + idx, report)
                for idx, report in enumerate(batch_reports)
            ]
            batch_results = await asyncio.gather(*tasks)

            # Filtrar resultados válidos
            valid_results = [r for r in batch_results if r is not None]
            all_html_items.extend(valid_results)

            print(f"[PDF] HTMLs prepared: {len(all_html_items)}/{total_reports}")
            if on_progress:
                await on_progress("preparing", len(all_html_items), total_reports, "")

            # GC después de cada lote de HTMLs
            if batch_end % GC_INTERVAL == 0:
                gc.collect()

        if not all_html_items:
            raise RuntimeError("No se preparó ningún HTML exitosamente")

        # Ordenar por índice original
        all_html_items.sort(key=lambda x: x['index'])

        # =====================================================================
        # FASE 2: Generar PDFs en lotes paralelos
        # =====================================================================
        print(f"[PDF] Starting PDF generation in batches of {PDF_BATCH_SIZE}...")

        loop = asyncio.get_running_loop()
        all_pdf_paths = []
        final_writer = None

        # Procesar en lotes de PDF_BATCH_SIZE
        for batch_start in range(0, len(all_html_items), PDF_BATCH_SIZE):
            batch_end = min(batch_start + PDF_BATCH_SIZE, len(all_html_items))
            batch_items = all_html_items[batch_start:batch_end]  # pyre-ignore[16]

            # Generar lote de PDFs en paralelo usando ThreadPoolExecutor
            with ThreadPoolExecutor(max_workers=PDF_BATCH_SIZE) as executor:
                # Enviar todos los trabajos del lote simultáneamente
                future_to_index = {
                    executor.submit(_render_pdf_to_file_safe, item['html']): item['index']  # pyre-ignore[6]
                    for item in batch_items
                }

                # Recoger resultados a medida que completan
                batch_results = []
                for future in as_completed(future_to_index):
                    original_index = future_to_index[future]
                    try:
                        pdf_path = future.result()
                        if pdf_path:
                            batch_results.append((original_index, pdf_path))
                    except Exception as e:
                        print(f"[PDF] Error generating PDF {original_index}: {e}")

                # Ordenar por índice y agregar a lista final
                batch_results.sort(key=lambda x: x[0])
                all_pdf_paths.extend([path for _, path in batch_results])

            # Liberar memoria de HTMLs procesados
            for item in batch_items:
                item['html'] = None

            processed_count = min(batch_end, len(all_html_items))
            elapsed = time.time() - start_time
            rate = processed_count / elapsed if elapsed > 0 else 0
            print(f"[PDF] Generated: {processed_count}/{len(all_html_items)} PDFs ({rate:.1f} PDFs/sec)")
            if on_progress:
                await on_progress("rendering", processed_count, len(all_html_items), "")

            # GC después de cada lote
            gc.collect()

        if not all_pdf_paths:
            raise RuntimeError("No se generó ningún PDF exitosamente")

        final_writer = None
        try:
            # =====================================================================
            # FASE 3: Merge con STREAMING - Escribe directamente a disco
            # =====================================================================
            print(f"[PDF] Streaming merge of {len(all_pdf_paths)} PDFs...")
            if on_progress:
                await on_progress("merging", 0, len(all_pdf_paths), "")
            merge_start = time.time()

            # Determinar archivo de salida
            if output_path:
                final_output_path = output_path
            else:
                # Crear archivo temporal para el resultado
                tmp_final = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
                final_output_path = tmp_final.name
                tmp_final.close()

            # ✅ STREAMING MERGE: Usar PdfWriter con escritura incremental
            # Esto reduce significativamente el uso de memoria para PDFs grandes
            final_writer = PdfWriter()

            # Configurar para menor uso de memoria
            merge_batch_size = 10  # Procesar en lotes pequeños para liberar memoria

            for batch_idx in range(0, len(all_pdf_paths), merge_batch_size):
                batch_paths = all_pdf_paths[batch_idx:batch_idx + merge_batch_size]  # pyre-ignore[16]

                for pdf_path in batch_paths:
                    try:
                        # Usar append que es más eficiente en memoria que add_page
                        final_writer.append(pdf_path)
                        # Eliminar archivo temporal inmediatamente
                        os.remove(pdf_path)
                    except Exception as e:
                        print(f"[PDF] Error merging {pdf_path}: {e}")
                        # Intentar limpiar el archivo si falló
                        try:
                            if os.path.exists(pdf_path):
                                os.remove(pdf_path)
                        except OSError:
                            pass

                # GC después de cada lote de merge
                if batch_idx > 0 and batch_idx % (merge_batch_size * 2) == 0:
                    gc.collect()

            # Escribir resultado final a disco
            with open(final_output_path, "wb") as f:
                final_writer.write(f)

            final_writer.close()
            del final_writer
            gc.collect()

            merge_time = time.time() - merge_start

            # =====================================================================
            # FASE 4: Compresión Ghostscript (opcional)
            # =====================================================================
            compression_stats = None
            if GHOSTSCRIPT_ENABLED and total_reports > 1:  # Solo comprimir si hay múltiples reportes
                print(f"[PDF] Applying Ghostscript compression (quality={GHOSTSCRIPT_QUALITY})...")
                if on_progress:
                    await on_progress("compressing", 0, 1, "")
                compress_start = time.time()

                success, final_output_path, compression_stats = _compress_pdf_with_ghostscript(
                    final_output_path,
                    quality=GHOSTSCRIPT_QUALITY
                )

                compress_time = time.time() - compress_start
                print(f"[PDF]    - Compression time: {compress_time:.1f}s")

            # Preparar resultado
            if output_path:
                result = output_path
            else:
                # Si no se especificó output_path, leer el archivo y retornar bytes
                # (para compatibilidad con código existente)
                with open(final_output_path, 'rb') as f:
                    result = f.read()
                os.remove(final_output_path)

            # Estadísticas finales
            total_time = time.time() - start_time
            gen_time = total_time - merge_time
            print(f"[PDF] ✅ Complete! {total_reports} reports in {total_time:.1f}s ({total_reports/total_time:.1f} reports/sec)")
            print(f"[PDF]    - Generation + HTML: {gen_time:.1f}s")
            print(f"[PDF]    - Streaming merge: {merge_time:.1f}s")
            if compression_stats and "reduction_percent" in compression_stats:
                print(f"[PDF]    - Compression: {compression_stats['reduction_percent']}% size reduction")

            return result
        finally:
            # FIX: BUG-002 ensure temporary PDFs are cleaned even when merge/compression fails
            for pdf_path in all_pdf_paths:
                try:
                    if os.path.exists(pdf_path):
                        os.remove(pdf_path)  # pyre-ignore[6]
                except OSError:
                    pass
            if final_writer is not None:
                try:
                    final_writer.close()
                except Exception:
                    pass
            # FIX: BUG-010 always clear logo cache, even on exceptions
            self._logo_cache.clear()
            self._image_cache.clear()
            gc.collect()



# ============================================================================
# HELPER FUNCTIONS - VERSIÓN SEGURA
# ============================================================================

def _render_pdf_to_file_safe(html_string):
    """
    Renderizado seguro de PDF con manejo de errores robusto.
    Usa WeasyPrint si está disponible, sino Chrome/Edge headless como fallback.
    """
    import tempfile

    if WEASYPRINT_AVAILABLE:
        try:
            temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')

            # ✅ CONFIGURACIÓN SEGURA: Sin optimizaciones arriesgadas
            if HTML is None:
                # FIX: BUG-004 avoid assert removed by -O in production
                raise RuntimeError("WeasyPrint HTML class not available")
            HTML(string=html_string, base_url=os.getcwd()).write_pdf(  # pyre-ignore[16]
                temp_pdf.name,
                optimize_images=False,  # Ya optimizadas
                uncompressed_pdf=False  # Comprimir
            )

            temp_pdf.close()
            return temp_pdf.name

        except Exception as e:
            print(f"[ERROR] WeasyPrint PDF rendering failed: {e}")
            import traceback
            traceback.print_exc()
            if not CHROME_PATH:
                return None

    if CHROME_PATH:
        return _render_pdf_with_chrome(html_string)

    return None


def _render_pdf_with_chrome(html_string):
    """Render HTML to PDF using Chrome/Edge headless mode."""
    import tempfile
    import subprocess

    html_path = None
    pdf_path = None
    try:
        html_file = tempfile.NamedTemporaryFile(
            delete=False, suffix='.html', mode='w', encoding='utf-8'
        )
        html_file.write(html_string)
        html_file.close()
        html_path = html_file.name

        pdf_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
        pdf_file.close()
        pdf_path = pdf_file.name

        chrome_args: list = [arg for arg in [
                CHROME_PATH,
                '--headless',
                '--disable-gpu',
                '--no-sandbox',
                '--disable-software-rasterizer',
                '--run-all-compositor-stages-before-draw',
                f'--print-to-pdf={pdf_file.name}',
                '--print-to-pdf-no-header',
                '--no-margins',
                '--paper-width=8.27',
                '--paper-height=11.69',
                html_path,
            ] if arg is not None]
        result = subprocess.run(
            chrome_args,
            capture_output=True,
            text=True,
            timeout=60,
        )

        os.unlink(html_path)

        if os.path.getsize(pdf_path) > 0:
            return pdf_path

        print(f"[ERROR] Chrome PDF generation produced empty file. stderr: {result.stderr}")
        # FIX: BUG-003 cleanup orphaned PDF temp file when Chrome output is empty/invalid
        if pdf_path and os.path.exists(pdf_path):
            os.unlink(pdf_path)
        return None

    except Exception as e:
        print(f"[ERROR] Chrome PDF rendering failed: {e}")
        import traceback
        traceback.print_exc()
        # FIX: BUG-003 cleanup temp artifacts on fallback exceptions
        if html_path and os.path.exists(html_path):
            try:
                os.unlink(html_path)
            except OSError:
                pass
        if pdf_path and os.path.exists(pdf_path):
            try:
                os.unlink(pdf_path)
            except OSError:
                pass
        return None
