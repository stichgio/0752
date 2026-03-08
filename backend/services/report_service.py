import os
import base64
import re
import shutil
import io
import gc
import tempfile
import hashlib
import logging
from jinja2 import Environment, FileSystemLoader
import jinja2
from fastapi import HTTPException
from config import settings


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
    from weasyprint import HTML
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
import piexif
from PIL import Image, ImageOps
import asyncio
import httpx


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

SLOT_RENDER_DPI = 180
LOGO_RENDER_DPI = 300


def _mm_to_px(mm, dpi):
    return int(round((mm / 25.4) * dpi))


def _size_from_mm(width_mm, height_mm, dpi=TARGET_DPI):
    return (_mm_to_px(width_mm, dpi), _mm_to_px(height_mm, dpi))


BACKEND_TEMPLATE_IMAGE_SLOTS_MM = {
    "report.html": {1: (135, 180), 2: (94, 180), 3: (94, 88), 4: (94, 88), 5: (94, 58), 6: (94, 58), "default": (94, 70)},
    "aniegos_ate.html": {1: (135, 180), 2: (94, 180), 3: (94, 88), 4: (94, 88), 5: (94, 58), 6: (94, 58), "default": (94, 70)},
    "report_volanteo.html": {"default": (92, 78)},
    "format_etapas.html": {"default": (92, 76)},
    "format_reservorios.html": {"default": (60, 54)},
    "format_reservorios_2.html": {"default": (60, 54)},
}

DEFAULT_LOGO_MAX_SIZE = _size_from_mm(70, 24, LOGO_RENDER_DPI)


def resolve_backend_template_image_max_size(template_name, image_count):
    normalized_name = os.path.basename(template_name).lower() if template_name else ""
    slots = BACKEND_TEMPLATE_IMAGE_SLOTS_MM.get(normalized_name)
    if not slots:
        return MAX_IMAGE_SIZE

    width_mm, height_mm = slots.get(image_count, slots.get("default", (A4_WIDTH_MM, A4_HEIGHT_MM)))
    return _size_from_mm(width_mm, height_mm, SLOT_RENDER_DPI)


def _decode_data_uri(data_uri):
    if not isinstance(data_uri, str) or not data_uri.startswith("data:") or "," not in data_uri:
        return None, None

    header, payload = data_uri.split(",", 1)
    mime_type = header[5:].split(";", 1)[0] or "application/octet-stream"

    try:
        return base64.b64decode(payload), mime_type
    except Exception:
        return None, None


def _normalize_image_mime(image_format, fallback="image/png"):
    normalized = (image_format or "").upper()
    format_to_mime = {
        "JPEG": "image/jpeg",
        "JPG": "image/jpeg",
        "PNG": "image/png",
        "WEBP": "image/webp",
        "GIF": "image/gif",
        "BMP": "image/bmp",
        "TIFF": "image/tiff",
    }
    return format_to_mime.get(normalized, fallback)


JPEG_QUALITY = 90
MAX_CONCURRENT = 5
MAX_PDF_WORKERS = 4
PIPELINE_BUFFER_SIZE = 8
GC_INTERVAL = 10

# BATCHING OPTIMIZATION: Procesar múltiples reportes en paralelo
PDF_BATCH_SIZE = 5  # Número de PDFs a generar en paralelo por lote
HTML_PREFETCH_SIZE = 10  # Número de HTMLs a pre-renderizar adelante

# GHOSTSCRIPT COMPRESSION: Reducir tamaño del PDF final
GHOSTSCRIPT_ENABLED = settings.ghostscript_enabled
GHOSTSCRIPT_QUALITY = settings.ghostscript_quality

TEMP_DIR = tempfile.gettempdir()

# ============================================================================
# GHOSTSCRIPT COMPRESSION UTILITY
# ============================================================================

def _check_ghostscript_available():
    """Verifica si Ghostscript está disponible en el sistema"""
    import shutil
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

    if output_path is None:
        tmp_output = tempfile.NamedTemporaryFile(delete=False, suffix='_compressed.pdf')
        output_path = tmp_output.name
        tmp_output.close()
        replace_original = True
    else:
        replace_original = False

    original_size = os.path.getsize(input_path)

    gs_args = [
        gs_cmd,
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        f'-dPDFSETTINGS=/{quality}',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-dDetectDuplicateImages=true',
        '-dCompressFonts=true',
        '-dSubsetFonts=true',
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
            timeout=300
        )

        if result.returncode != 0:
            print(f"[GS] Error: {result.stderr}")
            if replace_original and os.path.exists(output_path):
                os.remove(output_path)
            return False, input_path, {"error": result.stderr}

        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            print("[GS] Error: Archivo comprimido inválido")
            return False, input_path, {"error": "Invalid output file"}

        compressed_size = os.path.getsize(output_path)
        reduction = ((original_size - compressed_size) / original_size) * 100

        stats = {
            "original_size": original_size,
            "compressed_size": compressed_size,
            "reduction_percent": round(reduction, 1),
            "quality": quality
        }

        if compressed_size < original_size:
            if replace_original:
                os.remove(input_path)
                shutil.move(output_path, input_path)
                print(f"[GS] Comprimido: {original_size/1024/1024:.1f}MB → {compressed_size/1024/1024:.1f}MB ({reduction:.1f}% reducción)")
                return True, input_path, stats
            else:
                print(f"[GS] Comprimido: {original_size/1024/1024:.1f}MB → {compressed_size/1024/1024:.1f}MB ({reduction:.1f}% reducción)")
                return True, output_path, stats
        else:
            if os.path.exists(output_path):
                os.remove(output_path)
            print(f"[GS] Sin mejora de compresión, usando original ({original_size/1024/1024:.1f}MB)")
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
            templates_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "templates")

        cache_dir = os.path.join(TEMP_DIR, 'jinja2_cache')
        os.makedirs(cache_dir, exist_ok=True)

        self.env = Environment(
            loader=FileSystemLoader(templates_dir),
            auto_reload=False,
            cache_size=400,
            bytecode_cache=jinja2.FileSystemBytecodeCache(cache_dir)
        )

        self.template = self.env.get_template("report.html")
        try:
            _ = self.template.module
        except Exception as e:
            logging.warning("Pre-compilación de report.html falló: %s", e)

        self._template_cache = {}
        self._image_cache = BoundedCache(maxsize=100)
        self._logo_cache = BoundedCache(maxsize=20)

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
                logging.warning("template '%s' not found in strict mode", template_name)
                raise HTTPException(status_code=404, detail=f"Template '{template_name}' not found")

        if template_name not in self._template_cache:
            try:
                self._template_cache[template_name] = self.env.get_template(template_name)
            except Exception as e:
                print(f"Error loading template {template_name}: {e}")
                logging.warning("template '%s' not found, using default fallback", template_name)
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
        except Exception as e:
            print(f"[report_service] Warning: could not extract EXIF from file path: {e}")
        return metadata

    @staticmethod
    def _extract_metadata_from_image_bytes(image_content):
        metadata = {"date": "N/A", "coords": "N/A"}
        try:
            exif_dict = piexif.load(image_content)
            if piexif.ImageIFD.DateTime in exif_dict["0th"]:
                date_str = exif_dict["0th"][piexif.ImageIFD.DateTime].decode("utf-8")
                metadata["date"] = date_str

            if "GPS" in exif_dict and exif_dict["GPS"]:
                gps = exif_dict["GPS"]
                if piexif.GPSIFD.GPSLatitude in gps and piexif.GPSIFD.GPSLongitude in gps:
                    lat = ReportService._convert_to_degrees(None, gps[piexif.GPSIFD.GPSLatitude])
                    lon = ReportService._convert_to_degrees(None, gps[piexif.GPSIFD.GPSLongitude])
                    if gps.get(piexif.GPSIFD.GPSLatitudeRef) == b'S':
                        lat = -lat
                    if gps.get(piexif.GPSIFD.GPSLongitudeRef) == b'W':
                        lon = -lon
                    metadata["coords"] = f"{lat:.6f}, {lon:.6f}"
        except Exception as e:
            print(f"[report_service] Warning: could not extract EXIF from image bytes: {e}")
        return metadata

    @staticmethod
    def prepare_image_for_pdf(image_content, max_size=MAX_IMAGE_SIZE, quality=JPEG_QUALITY, original_quality=False):
        """Open the source image once and return metadata plus final PDF bytes."""
        try:
            if isinstance(image_content, str) and os.path.exists(image_content):
                with open(image_content, "rb") as f:
                    image_content = f.read()
            elif not isinstance(image_content, bytes):
                return None

            metadata = ReportService._extract_metadata_from_image_bytes(image_content)

            with Image.open(io.BytesIO(image_content)) as opened_img:
                width, height = opened_img.size
                is_landscape = width >= height
                img = ImageOps.exif_transpose(opened_img)
                detected_mime = _normalize_image_mime(opened_img.format, "image/png")

                if original_quality:
                    output_bytes = image_content
                    if img is not opened_img:
                        buffer = io.BytesIO()
                        save_fmt = opened_img.format or "PNG"
                        save_kwargs = {"optimize": False}
                        if save_fmt.upper() in ("JPEG", "JPG"):
                            save_kwargs["quality"] = 100
                            save_kwargs["subsampling"] = 0
                            if img.mode not in ("RGB", "L"):
                                img = img.convert("RGB")
                        img.save(buffer, format=save_fmt, **save_kwargs)
                        output_bytes = buffer.getvalue()
                    return {
                        "bytes": output_bytes,
                        "mime_type": detected_mime,
                        "width": width,
                        "height": height,
                        "is_landscape": is_landscape,
                        "metadata": metadata,
                    }

                if img.mode in ('RGBA', 'P', 'LA'):
                    background = Image.new('RGB', img.size, (255, 255, 255))
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    if img.mode in ('RGBA', 'LA'):
                        background.paste(img, mask=img.split()[-1])
                    else:
                        background.paste(img)
                    img = background
                elif img.mode != 'RGB':
                    img = img.convert('RGB')

                if img.width > max_size[0] or img.height > max_size[1]:
                    img.thumbnail(max_size, Image.Resampling.LANCZOS)

                buffer = io.BytesIO()
                img.save(
                    buffer,
                    format="JPEG",
                    quality=quality,
                    optimize=True,
                    progressive=True,
                )
                return {
                    "bytes": buffer.getvalue(),
                    "mime_type": "image/jpeg",
                    "width": width,
                    "height": height,
                    "is_landscape": is_landscape,
                    "metadata": metadata,
                }
        except Exception as e:
            print(f"Error preparing image: {e}")
            return None

    @staticmethod
    def optimize_image_for_pdf(image_content, max_size=MAX_IMAGE_SIZE, quality=JPEG_QUALITY, original_quality=False):
        """Optimización de imágenes con resolución adaptativa"""
        prepared = ReportService.prepare_image_for_pdf(
            image_content,
            max_size=max_size,
            quality=quality,
            original_quality=original_quality,
        )
        return prepared.get("bytes") if prepared else None

    @staticmethod
    def optimize_logo_for_pdf(logo_content, max_size=DEFAULT_LOGO_MAX_SIZE, mime_type="image/png"):
        """Reduce logos sobredimensionados sin afectar su calidad visible en plantilla."""
        try:
            if not isinstance(logo_content, bytes):
                return None, mime_type

            with Image.open(io.BytesIO(logo_content)) as opened_img:
                img = ImageOps.exif_transpose(opened_img)
                detected_mime = _normalize_image_mime(opened_img.format, mime_type)
                needs_resize = img.width > max_size[0] or img.height > max_size[1]
                if not needs_resize:
                    return logo_content, detected_mime

                preserve_png = detected_mime == "image/png" or img.mode in ('RGBA', 'LA', 'P')

                if preserve_png:
                    if img.mode == 'P':
                        img = img.convert('RGBA')
                    elif img.mode not in ('RGBA', 'LA', 'RGB'):
                        img = img.convert('RGBA')
                    img.thumbnail(max_size, Image.Resampling.LANCZOS)
                    buffer = io.BytesIO()
                    img.save(buffer, format="PNG", optimize=True)
                    return buffer.getvalue(), "image/png"

                if img.mode != 'RGB':
                    img = img.convert('RGB')
                img.thumbnail(max_size, Image.Resampling.LANCZOS)
                buffer = io.BytesIO()
                img.save(
                    buffer,
                    format="JPEG",
                    quality=95,
                    optimize=True,
                    progressive=True,
                )
                return buffer.getvalue(), "image/jpeg"
        except Exception as e:
            print(f"Error optimizing logo: {e}")
            return None, mime_type

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
        cache_key = f"logo_{side}_{logo_hash}"
        cached_logo = self._logo_cache.get(cache_key)
        if cached_logo is not None:
            return cached_logo

        try:
            logo_bytes = None
            logo_mime = "image/png"

            if isinstance(logo_data, str) and logo_data.startswith("data:"):
                decoded_bytes, decoded_mime = _decode_data_uri(logo_data)
                if decoded_bytes is None:
                    self._logo_cache.put(cache_key, logo_data)
                    return logo_data
                logo_bytes = decoded_bytes
                logo_mime = decoded_mime or logo_mime
            elif isinstance(logo_data, bytes):
                logo_bytes = logo_data
            elif isinstance(logo_data, str):
                self._logo_cache.put(cache_key, logo_data)
                return logo_data
            else:
                return logo_data

            optimized_logo, optimized_mime = self.optimize_logo_for_pdf(
                logo_bytes,
                max_size=DEFAULT_LOGO_MAX_SIZE,
                mime_type=logo_mime,
            )
            final_bytes = optimized_logo or logo_bytes
            final_mime = optimized_mime or logo_mime

            data_uri = self._convert_to_base64_uri(final_bytes, final_mime)
            self._logo_cache.put(cache_key, data_uri)
            return data_uri
        except Exception as e:
            print(f"Error processing logo: {e}")
            return logo_data

    @staticmethod
    def _build_image_cache_key(source_key, max_size, quality, original_quality):
        return f"{source_key}|{max_size[0]}x{max_size[1]}|q={quality}|oq={int(bool(original_quality))}"

    async def _process_files_serial(self, files, max_size=MAX_IMAGE_SIZE, quality=JPEG_QUALITY, original_quality=False):
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
                        content = await loop.run_in_executor(None, read_file)
                    else:
                        return None

                    if not content:
                        return None

                    if f_path and os.path.exists(f_path):
                        stat = os.stat(f_path)
                        source_cache_key = f"local:{f_path}:{stat.st_mtime}:{stat.st_size}"
                    else:
                        source_cache_key = f"md5:{hashlib.md5(content).hexdigest()}"

                    cache_key = self._build_image_cache_key(
                        source_cache_key,
                        max_size=max_size,
                        quality=quality,
                        original_quality=original_quality,
                    )

                    cached = self._image_cache.get(cache_key)
                    if cached is not None:
                        cached_result = cached.copy()
                        cached_result['data'] = cached_result['data'].copy()
                        cached_result['data']['order'] = file_obj.get("order", idx) if isinstance(file_obj, dict) else idx
                        return cached_result

                    prepared_image = await loop.run_in_executor(
                        None,
                        self.prepare_image_for_pdf,
                        content,
                        max_size,
                        quality,
                        original_quality
                    )

                    del content

                    if not prepared_image:
                        return None

                    image_data_uri = self._convert_to_base64_uri(
                        prepared_image["bytes"],
                        prepared_image["mime_type"],
                    )

                    result = {
                        "data": {
                            "path": image_data_uri,
                            "name": f_name,
                            "order": file_obj.get("order", idx) if isinstance(file_obj, dict) else idx,
                            "date": prepared_image["metadata"].get("date", "N/A"),
                            "coords": prepared_image["metadata"].get("coords", "N/A"),
                            "is_landscape": prepared_image["is_landscape"],
                            "width": prepared_image["width"],
                            "height": prepared_image["height"]
                        },
                        "orientation": prepared_image["is_landscape"]
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
                processed_images.append(res["data"])
                orientations.append(res["orientation"])

        processed_images.sort(key=lambda x: x["order"])

        img_count = len(processed_images)

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

    async def generate_batch_pdf(self, reports_list, output_path=None, logo_left=None, logo_right=None, custom_template_str=None, template_name=None, on_progress=None, original_quality=False):
        """
        Pipeline optimizado con BATCHING para generación de PDFs

        Mejoras de rendimiento:
        - Pre-renderiza múltiples HTMLs en paralelo (HTML_PREFETCH_SIZE)
        - Genera PDFs en lotes paralelos (PDF_BATCH_SIZE)
        - Merge incremental para liberar memoria
        """
        from pypdf import PdfWriter
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import time

        if not PDF_ENGINE_AVAILABLE:
            raise RuntimeError("No hay motor PDF disponible. Instale WeasyPrint o xhtml2pdf.")

        total_reports = len(reports_list)
        start_time = time.time()
        print(f"[PDF] Starting BATCHED generation: {total_reports} reports (batch_size={PDF_BATCH_SIZE})")

        logo_left_uri = self._process_logo(logo_left, "left")
        logo_right_uri = self._process_logo(logo_right, "right")

        # Template Selection con manejo de errores
        use_single_pass_render = False
        backend_template_name = None
        if custom_template_str:
            from jinja2 import Template
            template = Template(custom_template_str)
        elif template_name:
            tech_tpl_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "technical_reports", "templates", template_name)
            if os.path.exists(tech_tpl_path):
                tech_env = Environment(loader=FileSystemLoader(os.path.dirname(tech_tpl_path)))
                template = tech_env.get_template(os.path.basename(tech_tpl_path))
            else:
                try:
                    template = self.get_template(template_name)
                    backend_template_name = os.path.basename(template_name)
                    use_single_pass_render = True
                except Exception as e:
                    print(f"Template {template_name} not found, falling back to default: {e}")
                    template = self.template
                    backend_template_name = "report.html"
                    use_single_pass_render = True
        else:
            template = self.template
            backend_template_name = "report.html"
            use_single_pass_render = True

        # Rendering all backend-template reports in a single HTML document is fragile
        # when the batch contains multiple photo-heavy pages. Keep the merged path only
        # for multi-report exports; a single report can safely skip the extra merge work.
        if total_reports > 1:
            use_single_pass_render = False
        elif total_reports == 1:
            use_single_pass_render = True
        # =====================================================================
        # FASE 1: Pre-procesar todos los reportes en paralelo (batched)
        # =====================================================================
        async def prepare_single_render_input(i, report):
            """Prepara un HTML individual con sus imágenes procesadas"""
            try:
                row_data = report.get("data", {})
                files = report.get("files", [])

                # Procesar imágenes
                image_max_size = resolve_backend_template_image_max_size(
                    backend_template_name,
                    len(files),
                )
                images, layout_mode, img_count = await self._process_files_serial(
                    files,
                    max_size=image_max_size,
                    quality=100 if original_quality else JPEG_QUALITY,
                    original_quality=original_quality
                )

                report_context = {
                    "data": row_data,
                    "images": images,
                    "layout_mode": layout_mode,
                    "img_count": img_count
                }

                if use_single_pass_render:
                    return {"report": report_context, "index": i}

                html_out = template.render(
                    reports=[report_context],
                    report=row_data,
                    title="PANEL FOTOGRÁFICO",
                    logo_left=logo_left_uri or logo_left,
                    logo_right=logo_right_uri or logo_right
                )

                return {"html": html_out, "index": i}

            except Exception as e:
                print(f"[PDF] Error preparing report {i}: {e}")
                import traceback
                traceback.print_exc()
                return None

        prepared_items = []
        prepared_count = 0
        html_batch_size = HTML_PREFETCH_SIZE

        for batch_start in range(0, total_reports, html_batch_size):
            batch_end = min(batch_start + html_batch_size, total_reports)
            batch_reports = reports_list[batch_start:batch_end]

            tasks = [
                prepare_single_render_input(batch_start + idx, report)
                for idx, report in enumerate(batch_reports)
            ]
            for completed_task in asyncio.as_completed(tasks):
                result = await completed_task
                prepared_count += 1
                if result is not None:
                    prepared_items.append(result)
                if on_progress:
                    await on_progress(
                        "preparing",
                        prepared_count,
                        total_reports,
                        f"Documento {prepared_count} de {total_reports} preparado",
                    )

            print(f"[PDF] Reports prepared: {prepared_count}/{total_reports}")

            if batch_end % GC_INTERVAL == 0:
                gc.collect()

        if not prepared_items:
            raise RuntimeError("No se preparó ningún reporte exitosamente")

        prepared_items.sort(key=lambda x: x["index"])

        if use_single_pass_render:
            single_pdf_path = None
            final_output_path = None
            compression_stats = None
            merge_time = 0.0

            try:
                loop = asyncio.get_running_loop()
                print(f"[PDF] Rendering combined HTML for {len(prepared_items)} reports...")
                combined_reports = [item["report"] for item in prepared_items]
                combined_html = template.render(
                    reports=combined_reports,
                    report=combined_reports[0]["data"] if combined_reports else {},
                    title="PANEL FOTOGRÁFICO",
                    logo_left=logo_left_uri or logo_left,
                    logo_right=logo_right_uri or logo_right
                )

                single_pdf_path = await loop.run_in_executor(None, _render_pdf_to_file_safe, combined_html, original_quality)
                if not single_pdf_path:
                    raise RuntimeError("No se generó el PDF consolidado. WeasyPrint puede no estar disponible en el servidor.")

                if on_progress:
                    await on_progress("rendering", total_reports, total_reports, "")
                    await on_progress("merging", 1, 1, "")

                if output_path:
                    os.replace(single_pdf_path, output_path)
                    final_output_path = output_path
                    single_pdf_path = None
                else:
                    final_output_path = single_pdf_path
                    single_pdf_path = None

                if GHOSTSCRIPT_ENABLED and total_reports > 1 and not original_quality:
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

                if output_path:
                    result = output_path
                else:
                    with open(final_output_path, "rb") as f:
                        result = f.read()
                    os.remove(final_output_path)

                total_time = time.time() - start_time
                gen_time = total_time - merge_time
                print(f"[PDF] Complete! {total_reports} reports in {total_time:.1f}s ({total_reports/total_time:.1f} reports/sec)")
                print(f"[PDF]    - Generation + HTML: {gen_time:.1f}s")
                print("[PDF]    - Merge skipped: single-pass render")
                if compression_stats and "reduction_percent" in compression_stats:
                    print(f"[PDF]    - Compression: {compression_stats['reduction_percent']}% size reduction")

                return result
            finally:
                if single_pdf_path is not None:
                    try:
                        if os.path.exists(single_pdf_path):
                            os.remove(single_pdf_path)
                    except OSError:
                        pass
                gc.collect()

        # =====================================================================
        # FASE 2: Generar PDFs en lotes paralelos
        # =====================================================================
        render_batch_size = 1 if (not WEASYPRINT_AVAILABLE and CHROME_PATH) else PDF_BATCH_SIZE
        render_engine = "browser" if (not WEASYPRINT_AVAILABLE and CHROME_PATH) else "weasyprint"
        print(f"[PDF] Starting PDF generation in batches of {render_batch_size} (engine={render_engine})...")

        all_pdf_paths = []
        failed_pdf_indices = []
        rendered_count = 0
        final_writer = None
        final_output_path = None
        compression_stats = None
        completed = False

        try:
            for batch_start in range(0, len(prepared_items), render_batch_size):
                batch_end = min(batch_start + render_batch_size, len(prepared_items))
                batch_items = prepared_items[batch_start:batch_end]
                max_workers = max(1, min(render_batch_size, len(batch_items)))

                with ThreadPoolExecutor(max_workers=max_workers) as executor:
                    future_to_index = {
                        executor.submit(_render_pdf_to_file_safe, item['html'], original_quality): item['index']
                        for item in batch_items
                    }

                    batch_results = []
                    for future in as_completed(future_to_index):
                        original_index = future_to_index[future]
                        try:
                            pdf_path = future.result()
                            if pdf_path:
                                batch_results.append((original_index, pdf_path))
                            else:
                                failed_pdf_indices.append(original_index)
                                print(f"[PDF] Render returned no PDF for report {original_index}")
                        except Exception as e:
                            failed_pdf_indices.append(original_index)
                            print(f"[PDF] Error generating PDF {original_index}: {e}")
                        finally:
                            rendered_count += 1
                            if on_progress:
                                await on_progress(
                                    "rendering",
                                    rendered_count,
                                    len(prepared_items),
                                    f"PDF {rendered_count} de {len(prepared_items)} renderizado",
                                )

                    batch_results.sort(key=lambda x: x[0])
                    all_pdf_paths.extend([path for _, path in batch_results])

                for item in batch_items:
                    item['html'] = None

                processed_count = rendered_count
                elapsed = time.time() - start_time
                rate = processed_count / elapsed if elapsed > 0 else 0
                print(f"[PDF] Generated: {processed_count}/{len(prepared_items)} PDFs ({rate:.1f} PDFs/sec)")

                gc.collect()

            if failed_pdf_indices:
                failed_pdf_indices.sort()
                raise RuntimeError(
                    f"Fallo la renderizacion de {len(failed_pdf_indices)} de {len(prepared_items)} PDF(s) del consolidado. "
                    f"Indices fallidos: {failed_pdf_indices}"
                )

            if not all_pdf_paths:
                raise RuntimeError("No se genero ningun PDF exitosamente. WeasyPrint puede no estar disponible en el servidor.")

            # =====================================================================
            # FASE 3: Merge con STREAMING - Escribe directamente a disco
            # =====================================================================
            print(f"[PDF] Streaming merge of {len(all_pdf_paths)} PDFs...")
            if on_progress:
                await on_progress("merging", 0, len(all_pdf_paths), "")
            merge_start = time.time()
            merged_count = 0

            if output_path:
                final_output_path = output_path
            else:
                tmp_final = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
                final_output_path = tmp_final.name
                tmp_final.close()

            final_writer = PdfWriter()
            merge_batch_size = 10

            for batch_idx in range(0, len(all_pdf_paths), merge_batch_size):
                batch_paths = all_pdf_paths[batch_idx:batch_idx + merge_batch_size]

                for pdf_path in batch_paths:
                    try:
                        final_writer.append(pdf_path)
                        os.remove(pdf_path)
                    except Exception as e:
                        print(f"[PDF] Error merging {pdf_path}: {e}")
                        try:
                            if os.path.exists(pdf_path):
                                os.remove(pdf_path)
                        except OSError:
                            pass
                    finally:
                        merged_count += 1
                        if on_progress:
                            await on_progress(
                                "merging",
                                merged_count,
                                len(all_pdf_paths),
                                f"Documento {merged_count} de {len(all_pdf_paths)} unido",
                            )

                if batch_idx > 0 and batch_idx % (merge_batch_size * 2) == 0:
                    gc.collect()

            with open(final_output_path, "wb") as f:
                final_writer.write(f)

            final_writer.close()
            final_writer = None
            gc.collect()
            merge_time = time.time() - merge_start

            # =====================================================================
            # FASE 4: Compresion Ghostscript (opcional)
            # =====================================================================
            if GHOSTSCRIPT_ENABLED and total_reports > 1 and not original_quality:
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

            if output_path:
                result = output_path
            else:
                with open(final_output_path, 'rb') as f:
                    result = f.read()
                os.remove(final_output_path)
                final_output_path = None

            total_time = time.time() - start_time
            gen_time = total_time - merge_time
            print(f"[PDF] Complete! {total_reports} reports in {total_time:.1f}s ({total_reports/total_time:.1f} reports/sec)")
            print(f"[PDF]    - Generation + HTML: {gen_time:.1f}s")
            print(f"[PDF]    - Streaming merge: {merge_time:.1f}s")
            if compression_stats and "reduction_percent" in compression_stats:
                print(f"[PDF]    - Compression: {compression_stats['reduction_percent']}% size reduction")

            completed = True
            return result

        finally:
            for pdf_path in all_pdf_paths:
                try:
                    if os.path.exists(pdf_path):
                        os.remove(pdf_path)
                except OSError:
                    pass
            if final_writer is not None:
                try:
                    final_writer.close()
                except Exception as e:
                    print(f"[report_service] Warning: could not close PDF writer: {e}")
            if not completed and final_output_path is not None:
                try:
                    if os.path.exists(final_output_path):
                        os.remove(final_output_path)
                except OSError:
                    pass
            gc.collect()


# ============================================================================
# HELPER FUNCTIONS - VERSIÓN SEGURA
# ============================================================================

def _render_pdf_to_file_safe(html_string, original_quality=False):
    """
    Renderizado seguro de PDF con manejo de errores robusto.
    Usa WeasyPrint si está disponible, sino Chrome/Edge headless como fallback.
    """
    import tempfile

    if WEASYPRINT_AVAILABLE:
        try:
            temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')

            if HTML is None:
                raise RuntimeError("WeasyPrint HTML class not available")
            HTML(string=html_string, base_url=os.getcwd()).write_pdf(
                temp_pdf.name,
                optimize_images=False,
                uncompressed_pdf=True if original_quality else False
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

    browser_tmp_dir = tempfile.mkdtemp(prefix='report_service_browser_')
    html_path = None
    pdf_path = None
    try:
        html_file = tempfile.NamedTemporaryFile(
            delete=False,
            suffix='.html',
            dir=browser_tmp_dir,
            mode='w',
            encoding='utf-8'
        )
        html_file.write(html_string)
        html_file.close()
        html_path = html_file.name

        pdf_file = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
        pdf_file.close()
        pdf_path = pdf_file.name

        profile_dir = os.path.join(browser_tmp_dir, 'profile')
        os.makedirs(profile_dir, exist_ok=True)

        chrome_args: list = [arg for arg in [
                CHROME_PATH,
                '--headless',
                '--disable-gpu',
                '--no-sandbox',
                '--disable-software-rasterizer',
                '--disable-crash-reporter',
                '--disable-breakpad',
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-extensions',
                '--allow-file-access-from-files',
                f'--crash-dumps-dir={browser_tmp_dir}',
                f'--user-data-dir={profile_dir}',
                f'--print-to-pdf={pdf_path}',
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
            timeout=90,
        )

        if result.returncode == 0 and os.path.exists(pdf_path) and os.path.getsize(pdf_path) > 0:
            return pdf_path

        print(
            f"[ERROR] Chrome PDF generation failed. rc={result.returncode}, "
            f"stderr: {result.stderr}, stdout: {result.stdout}"
        )
        if pdf_path and os.path.exists(pdf_path):
            os.unlink(pdf_path)
        return None

    except Exception as e:
        print(f"[ERROR] Chrome PDF rendering failed: {e}")
        import traceback
        traceback.print_exc()
        if pdf_path and os.path.exists(pdf_path):
            try:
                os.unlink(pdf_path)
            except OSError:
                pass
        return None
    finally:
        if html_path and os.path.exists(html_path):
            try:
                os.unlink(html_path)
            except OSError:
                pass
        shutil.rmtree(browser_tmp_dir, ignore_errors=True)
