import os
import base64
import re
import io
import gc
import tempfile
import hashlib
import mmap
import subprocess
from uuid import uuid4
from jinja2 import Environment, FileSystemLoader
import jinja2

# ============================================================================
# OPTIMIZACIÓN #1: CAIRO BACKEND DETECTION
# ============================================================================
try:
    import cairocffi
    CAIRO_AVAILABLE = True
    print("[PDF] CairoCFFI backend disponible ✓")
except ImportError:
    CAIRO_AVAILABLE = False
    print("[PDF] CairoCFFI no disponible, usando backend estándar")

# ============================================================================
# OPTIMIZACIÓN #5: ADAPTIVE BATCH SIZING
# ============================================================================
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    print("[PDF] psutil no disponible, usando valores por defecto")

# WeasyPrint imports
if os.name == 'nt':
    gtk_path = r"C:\Program Files\GTK3-Runtime Win64\bin"
    if os.path.isdir(gtk_path):
        os.environ['PATH'] = gtk_path + os.pathsep + os.environ.get('PATH', '')
        if hasattr(os, 'add_dll_directory'):
            try:
                os.add_dll_directory(gtk_path)
            except Exception:
                pass

try:
    from weasyprint import HTML
except OSError as e:
    print(f"WARNING: WeasyPrint could not be loaded: {e}")
    HTML = None
except ImportError as e:
    print(f"WARNING: WeasyPrint not installed: {e}")
    HTML = None

from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import piexif
import pathlib
from PIL import Image
import asyncio
import httpx

# ============================================================================
# CONFIGURACIÓN SUPER-OPTIMIZADA
# ============================================================================

# Resolución adaptativa (150 DPI = balance calidad/velocidad)
A4_WIDTH_MM, A4_HEIGHT_MM = 210, 297
TARGET_DPI = 150  # 150=rápido, 200=balance, 300=ultra-calidad

MAX_IMAGE_SIZE = (
    int((A4_WIDTH_MM / 25.4) * TARGET_DPI),   # 1240px @ 150dpi
    int((A4_HEIGHT_MM / 25.4) * TARGET_DPI)   # 1754px @ 150dpi
)

JPEG_QUALITY = 90
MAX_CONCURRENT = 5           # Workers para procesamiento de imágenes
MAX_PDF_WORKERS = 4          # Workers para generación de PDFs
GC_INTERVAL = 10             # gc.collect() cada N reportes
MMAP_THRESHOLD = 1_000_000   # Usar mmap para archivos > 1MB

TEMP_DIR = tempfile.gettempdir()


# ============================================================================
# OPTIMIZACIÓN #5: CÁLCULO ADAPTATIVO DE BATCH SIZE
# ============================================================================
def calculate_optimal_batch_size():
    """
    Calcula tamaño óptimo de batch basado en recursos disponibles.
    
    Considera:
    - Memoria RAM disponible
    - Número de CPUs físicos
    - Límites seguros para evitar OOM
    """
    if not PSUTIL_AVAILABLE:
        return 8  # Valor por defecto seguro
    
    try:
        mem = psutil.virtual_memory()
        available_mb = mem.available / (1024 * 1024)
        cpu_count = psutil.cpu_count(logical=False) or 2
        
        # ~50MB por reporte en proceso
        memory_based = int(available_mb / 50)
        cpu_based = cpu_count * 3
        
        optimal = max(min(memory_based, cpu_based, 20), 4)
        print(f"[PDF] Batch size adaptativo: {optimal} (RAM: {available_mb:.0f}MB, CPUs: {cpu_count})")
        return optimal
    except Exception as e:
        print(f"[PDF] Error calculando batch size: {e}")
        return 8


# ============================================================================
# OPTIMIZACIÓN #4: COMPRESIÓN GHOSTSCRIPT
# ============================================================================
def compress_pdf_ghostscript(input_path, output_path):
    """
    Comprime PDF usando Ghostscript para reducir tamaño 40-60%.
    
    Configuración /ebook:
    - Resolución: 150 DPI
    - Calidad: Buena para pantalla
    - Compresión: Óptima
    """
    # Detectar comando gs (Linux) o gswin64c (Windows)
    gs_cmd_name = 'gs'
    if os.name == 'nt':
        gs_cmd_name = 'gswin64c'
    
    gs_cmd = [
        gs_cmd_name,
        '-sDEVICE=pdfwrite',
        '-dCompatibilityLevel=1.4',
        '-dPDFSETTINGS=/ebook',
        '-dNOPAUSE',
        '-dQUIET',
        '-dBATCH',
        '-dColorImageDownsampleType=/Bicubic',
        '-dColorImageResolution=150',
        '-dGrayImageDownsampleType=/Bicubic',
        '-dGrayImageResolution=150',
        f'-sOutputFile={output_path}',
        input_path
    ]
    
    try:
        result = subprocess.run(gs_cmd, check=True, timeout=120, capture_output=True)
        
        # Verificar que la compresión fue exitosa
        if os.path.exists(output_path):
            original_size = os.path.getsize(input_path)
            compressed_size = os.path.getsize(output_path)
            reduction = (1 - compressed_size / original_size) * 100
            print(f"[PDF] Ghostscript: {original_size/1024:.0f}KB → {compressed_size/1024:.0f}KB ({reduction:.1f}% reducción)")
            return True
        return False
    except FileNotFoundError:
        print("[PDF] Ghostscript no encontrado, saltando compresión")
        return False
    except subprocess.TimeoutExpired:
        print("[PDF] Ghostscript timeout, saltando compresión")
        return False
    except Exception as e:
        print(f"[PDF] Error en Ghostscript: {e}")
        return False


class ReportService:
    def __init__(self, templates_dir=None):
        if templates_dir is None:
            templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
        
        # Bytecode Cache + Compilación AOT
        cache_dir = os.path.join(TEMP_DIR, 'jinja2_cache')
        os.makedirs(cache_dir, exist_ok=True)
        
        self.env = Environment(
            loader=FileSystemLoader(templates_dir),
            auto_reload=False,
            cache_size=400,
            bytecode_cache=jinja2.FileSystemBytecodeCache(cache_dir)
        )
        
        self.template = self.env.get_template("report.html")
        self._templates_dir = templates_dir
        
        # Forzar compilación inmediata
        try:
            _ = self.template.module
        except Exception:
            pass
        
        # Cache de imágenes procesadas (para duplicados)
        self._image_cache = {}
        
        # Cache para logos
        self._logo_cache = {}
        
        # OPTIMIZACIÓN #3: Cliente HTTP persistente con HTTP/2
        self._http_client = None
    
    async def _get_http_client(self):
        """Obtiene cliente HTTP persistente con connection pooling"""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(
                timeout=30.0,
                limits=httpx.Limits(
                    max_connections=20,
                    max_keepalive_connections=10
                ),
                http2=True
            )
        return self._http_client
    
    async def _close_http_client(self):
        """Cierra cliente HTTP de forma segura"""
        if self._http_client is not None:
            await self._http_client.aclose()
            self._http_client = None

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
        """
        Optimización de imagen con Pillow/Pillow-SIMD.
        
        - Resolución adaptativa basada en DPI
        - BILINEAR resampling (rápido)
        - JPEG compresión eficiente
        """
        try:
            if isinstance(image_content, str) and os.path.exists(image_content):
                with open(image_content, "rb") as f:
                    image_content = f.read()
            elif not isinstance(image_content, bytes):
                return None

            img = Image.open(io.BytesIO(image_content))
            del image_content
            
            # Convertir a RGB
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
            
            # No upscale si imagen ya es pequeña
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

    def find_images(self, folder_path, pattern_id):
        """Busca imágenes matching pattern"""
        images = []
        if not os.path.exists(folder_path):
            return images

        regex = re.compile(rf"^{re.escape(str(pattern_id))}[-_]?(\d+)\.(jpg|jpeg|png)$", re.IGNORECASE)
        
        for file in os.listdir(folder_path):
            match = regex.match(file)
            if match:
                full_path = os.path.join(folder_path, file)
                metadata = self.get_image_metadata(full_path)
                images.append({
                    "path": pathlib.Path(full_path).as_uri(),
                    "name": file,
                    "order": int(match.group(1)),
                    **metadata
                })
        
        return sorted(images, key=lambda x: x["order"])

    def _write_logo_to_disk(self, logo_data, side):
        """Cache de logos en disco"""
        if logo_data is None:
            return None
            
        cache_key = f"logo_{side}"
        if cache_key in self._logo_cache:
            return self._logo_cache[cache_key]
        
        try:
            if logo_data.startswith("data:"):
                header, b64_data = logo_data.split(",", 1)
                logo_bytes = base64.b64decode(b64_data)
            else:
                logo_bytes = logo_data.encode() if isinstance(logo_data, str) else logo_data
            
            temp_path = os.path.join(TEMP_DIR, f"logo_{side}_{uuid4().hex[:8]}.png")
            with open(temp_path, "wb") as f:
                f.write(logo_bytes)
            
            file_uri = pathlib.Path(temp_path).as_uri()
            self._logo_cache[cache_key] = file_uri
            return file_uri
        except Exception as e:
            print(f"Error writing logo to disk: {e}")
            return logo_data

    async def _process_files_serial(self, files, max_size=MAX_IMAGE_SIZE, quality=JPEG_QUALITY):
        """
        Procesamiento de archivos con:
        - Cache MD5 para duplicados
        - mmap para archivos grandes
        - Cliente HTTP persistente
        """
        processed_images = []
        orientations = []
        temp_files = []
        
        if not files:
            return processed_images, "grid", 0, temp_files
        
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        sem = asyncio.Semaphore(MAX_CONCURRENT)
        http_client = await self._get_http_client()

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

                    # OPTIMIZACIÓN #3: Cliente HTTP persistente
                    if f_path.startswith("http"):
                        resp = await http_client.get(f_path)
                        resp.raise_for_status()
                        content = resp.content
                    
                    # OPTIMIZACIÓN #2: mmap para archivos grandes
                    elif f_path and os.path.exists(f_path):
                        file_size = os.path.getsize(f_path)
                        
                        if file_size > MMAP_THRESHOLD:
                            # Usar mmap para archivos > 1MB
                            def read_file_mmap():
                                with open(f_path, "rb") as f:
                                    with mmap.mmap(f.fileno(), 0, access=mmap.ACCESS_READ) as mmapped:
                                        return bytes(mmapped)
                            content = await loop.run_in_executor(None, read_file_mmap)
                        else:
                            # Lectura normal para archivos pequeños
                            def read_file():
                                with open(f_path, "rb") as f:
                                    return f.read()
                            content = await loop.run_in_executor(None, read_file)
                    else:
                        return None

                    if not content:
                        return None

                    # Hash para cache de duplicados
                    file_hash = hashlib.md5(content).hexdigest()
                    
                    # Revisar cache
                    if file_hash in self._image_cache:
                        cached_result = self._image_cache[file_hash].copy()
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

                    # Write to temp file
                    temp_img_path = os.path.join(TEMP_DIR, f"img_{uuid4().hex}.jpg")
                    with open(temp_img_path, "wb") as f:
                        f.write(optimized_bytes)
                    
                    del optimized_bytes
                    
                    file_uri = pathlib.Path(temp_img_path).as_uri()
                    
                    result = {
                        "data": {
                            "path": file_uri,
                            "name": f_name,
                            "order": file_obj.get("order", idx) if isinstance(file_obj, dict) else idx,
                            "date": metadata.get("date", "N/A"),
                            "coords": metadata.get("coords", "N/A"),
                            "is_landscape": is_landscape,
                            "width": width,
                            "height": height,
                            "_temp_file": temp_img_path
                        },
                        "orientation": is_landscape,
                        "temp_path": temp_img_path
                    }
                    
                    # Cachear resultado
                    self._image_cache[file_hash] = result
                    
                    return result
                    
                except Exception as e:
                    print(f"Error processing file {file_obj}: {e}")
                    return None

        # Create tasks
        tasks = [process_single_file(idx, f) for idx, f in enumerate(files)]
        
        # Execute concurrently
        results = await asyncio.gather(*tasks)
        
        # Process results
        for res in results:
            if res:
                processed_images.append(res["data"])
                orientations.append(res["orientation"])
                temp_files.append(res["temp_path"])

        processed_images.sort(key=lambda x: x["order"])

        img_count = len(processed_images)
        majority_landscape = sum(orientations) > len(orientations) / 2 if orientations else True
        
        if img_count == 2:
            layout_mode = "2h" if not majority_landscape else "2v"
        elif img_count == 4:
            layout_mode = "4v" if not majority_landscape else "4h"
        else:
            layout_mode = "grid"
            
        return processed_images, layout_mode, img_count, temp_files

    async def generate_batch_pdf(self, reports_list, output_path=None, logo_left=None, logo_right=None, custom_template_str=None):
        """
        OPTIMIZACIÓN EXTREMA: Pipeline asíncrono con todas las mejoras
        
        MEJORAS:
        1. Pipeline Producer/Consumer
        2. mmap para archivos grandes
        3. Cliente HTTP persistente
        4. Compresión Ghostscript post-proceso
        5. Batch adaptativo basado en recursos
        6. Bytecode cache de templates
        """
        from pypdf import PdfWriter, PdfReader
        
        if HTML is None:
            raise RuntimeError("WeasyPrint is not available")

        total_reports = len(reports_list)
        
        # OPTIMIZACIÓN #5: Batch adaptativo
        optimal_batch = calculate_optimal_batch_size()
        
        print(f"[PDF] Starting EXTREME OPTIMIZED batch: {total_reports} reports, buffer: {optimal_batch}")
        
        # Logos en base64
        logo_left_uri = logo_left
        logo_right_uri = logo_right
        
        # Template Selection
        if custom_template_str:
            from jinja2 import Template
            template = Template(custom_template_str)
        else:
            template = self.template

        # Pipeline asíncrono con batch adaptativo
        processed_queue = asyncio.Queue(maxsize=optimal_batch)
        all_temp_images = []
        
        # Stage 1: Producer
        async def process_images_stage():
            for i, report in enumerate(reports_list):
                row_data = report.get("data")
                files = report.get("files")
                
                # Procesar imágenes
                images, layout_mode, img_count, temp_files = await self._process_files_serial(
                    files, 
                    max_size=MAX_IMAGE_SIZE, 
                    quality=JPEG_QUALITY
                )
                all_temp_images.extend(temp_files)
                
                # Renderizar HTML
                single_report_context = [{
                    "data": row_data,
                    "images": images,
                    "layout_mode": layout_mode,
                    "img_count": img_count
                }]
                
                html_out = template.render(
                    reports=single_report_context,
                    title="PANEL FOTOGRÁFICO",
                    logo_left=logo_left_uri or logo_left,
                    logo_right=logo_right_uri or logo_right
                )
                
                await processed_queue.put({
                    'html': html_out,
                    'temp_images': temp_files,
                    'index': i
                })
                
                del html_out
                del images
                del single_report_context
                
                if (i + 1) % GC_INTERVAL == 0:
                    gc.collect()
                
                print(f"[PDF] Processed {i+1}/{total_reports}")
            
            await processed_queue.put(None)
        
        # Stage 2: Consumer
        async def generate_pdfs_stage():
            temp_pdf_paths = []
            loop = asyncio.get_running_loop()
            
            with ThreadPoolExecutor(max_workers=MAX_PDF_WORKERS) as executor:
                while True:
                    item = await processed_queue.get()
                    if item is None:
                        break
                    
                    pdf_path = await loop.run_in_executor(
                        executor,
                        _render_pdf_to_file_optimized,
                        item['html']
                    )
                    temp_pdf_paths.append(pdf_path)
            
            return temp_pdf_paths
        
        try:
            # Ejecutar pipeline
            producer_task = asyncio.create_task(process_images_stage())
            temp_pdf_paths = await generate_pdfs_stage()
            await producer_task
            
            # Merge PDFs
            print(f"[PDF] Merging {len(temp_pdf_paths)} PDFs...")
            
            # Determinar ruta de salida
            if output_path:
                merge_output_path = output_path
            else:
                merge_output_path = os.path.join(TEMP_DIR, f"merged_{uuid4().hex}.pdf")
            
            final_writer = PdfWriter()
            for pdf_path in temp_pdf_paths:
                try:
                    with open(pdf_path, 'rb') as f:
                        reader = PdfReader(f)
                        for page in reader.pages:
                            final_writer.add_page(page)
                    
                    # Cleanup inmediato
                    os.remove(pdf_path)
                except Exception as e:
                    print(f"[PDF] Error appending {pdf_path}: {e}")
            
            # Escribir PDF sin comprimir primero
            uncompressed_path = merge_output_path + ".uncompressed.pdf"
            with open(uncompressed_path, "wb") as f:
                final_writer.write(f)
            final_writer.close()
            
            # OPTIMIZACIÓN #4: Compresión Ghostscript
            gs_success = compress_pdf_ghostscript(uncompressed_path, merge_output_path)
            
            if gs_success:
                # Eliminar versión sin comprimir
                os.remove(uncompressed_path)
            else:
                # Usar versión sin comprimir si GS falla
                if os.path.exists(uncompressed_path):
                    os.rename(uncompressed_path, merge_output_path)
            
            # Retornar resultado
            if output_path:
                result = output_path
            else:
                with open(merge_output_path, "rb") as f:
                    result = f.read()
                os.remove(merge_output_path)
            
            print(f"[PDF] Complete! Generated {total_reports} pages")
            return result
            
        finally:
            # Cleanup
            for img_path in all_temp_images:
                try:
                    if os.path.exists(img_path):
                        os.remove(img_path)
                except Exception:
                    pass
            
            for key, uri in list(self._logo_cache.items()):
                try:
                    if uri.startswith("file://"):
                        path = uri.replace("file://", "")
                        if os.path.exists(path):
                            os.remove(path)
                except Exception:
                    pass
            self._logo_cache.clear()
            
            self._image_cache.clear()
            
            # Cerrar cliente HTTP
            await self._close_http_client()
            
            gc.collect()

    async def generate_pdf_from_uploads(self, row_data, files, logo_left=None, logo_right=None, output_filename="report.pdf"):
        """Wrapper para backward compatibility"""
        return await self.generate_batch_pdf([{
            "data": row_data,
            "files": files
        }], logo_left=logo_left, logo_right=logo_right)

    def generate_pdf_task(self, row_data, folder_path, id_column, output_path):
        """Single worker task para legacy batch generation"""
        item_id = str(row_data.get(id_column, ""))
        images = self.find_images(folder_path, item_id)
        
        if not images:
            return {"id": item_id, "status": "skipped", "message": "No images found"}

        html_out = self.template.render(
            data=row_data,
            images=images,
            title="PANEL FOTOGRÁFICO"
        )
        
        pdf_file = os.path.join(output_path, f"Reporte_{item_id}.pdf")
        HTML(string=html_out, base_url=folder_path).write_pdf(pdf_file)
        
        return {"id": item_id, "status": "success", "file": pdf_file}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _render_pdf_to_file_optimized(html_string):
    """
    WeasyPrint optimizado:
    - optimize_images=False (ya optimizadas)
    - Sin re-compresión
    """
    import tempfile
    from weasyprint import HTML
    
    temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
    
    HTML(string=html_string, base_url=os.getcwd()).write_pdf(
        temp_pdf.name,
        optimize_images=False,
        jpeg_quality=None,
        uncompressed_pdf=False,
        pdf_forms=False
    )
    
    return temp_pdf.name


def run_batch_generation(df_records, folder_path, id_column, output_path):
    """Legacy batch generation con ProcessPoolExecutor"""
    service = ReportService(templates_dir=os.path.join(os.getcwd(), "backend", "templates"))
    results = []
    
    with ProcessPoolExecutor() as executor:
        futures = [
            executor.submit(service.generate_pdf_task, row, folder_path, id_column, output_path)
            for row in df_records
        ]
        
        for future in futures:
            results.append(future.result())
            
    return results
