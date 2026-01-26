# backend/report_service.py - VERSIÓN ESTABLE

import os
import base64
import re
import io
import gc
import tempfile
import hashlib
from uuid import uuid4
from jinja2 import Environment, FileSystemLoader
import jinja2

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
    WEASYPRINT_AVAILABLE = True
except (OSError, ImportError) as e:
    print(f"WARNING: WeasyPrint not available: {e}")
    HTML = None
    WEASYPRINT_AVAILABLE = False

from concurrent.futures import ThreadPoolExecutor
import piexif
import pathlib
from PIL import Image
import asyncio
import httpx

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

TEMP_DIR = tempfile.gettempdir()


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
        except Exception:
            pass  # Ignorar errores de compilación
        
        # Cache de templates adicionales
        self._template_cache = {}
        
        # ✅ OPTIMIZACIÓN SEGURA: Cache de imágenes
        self._image_cache = {}
        self._logo_cache = {}
        
        # ✅ OPTIMIZACIÓN SEGURA: Cliente HTTP persistente
        self._http_client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(
                max_connections=10,
                max_keepalive_connections=5
            )
        )

    def get_template(self, template_name):
        """Cargar template con cache"""
        if template_name not in self._template_cache:
            try:
                self._template_cache[template_name] = self.env.get_template(template_name)
            except Exception as e:
                print(f"Error loading template {template_name}: {e}")
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
        """Procesamiento de imágenes con cache"""
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
                        content = await loop.run_in_executor(None, read_file)
                    else:
                        return None

                    if not content:
                        return None

                    # Cache con hash
                    file_hash = hashlib.md5(content).hexdigest()
                    
                    if file_hash in self._image_cache:
                        cached_result = self._image_cache[file_hash].copy()
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
                    
                    self._image_cache[file_hash] = result
                    
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

    async def generate_batch_pdf(self, reports_list, output_path=None, logo_left=None, logo_right=None, custom_template_str=None, template_name=None):
        """
        Pipeline optimizado ESTABLE para generación de PDFs
        """
        from pypdf import PdfWriter, PdfReader
        
        if not WEASYPRINT_AVAILABLE:
            raise RuntimeError("WeasyPrint is not available. Cannot generate PDFs.")

        total_reports = len(reports_list)
        print(f"[PDF] Starting batch: {total_reports} reports")
        
        logo_left_uri = logo_left
        logo_right_uri = logo_right
        
        # Template Selection con manejo de errores
        if custom_template_str:
            from jinja2 import Template
            template = Template(custom_template_str)
        elif template_name:
            # Check if it's in the technical reports templates
            tech_tpl_path = os.path.join(os.path.dirname(__file__), "technical_reports", "templates", template_name)
            if os.path.exists(tech_tpl_path):
                 # Load from file directly using a new environment for this specific path to avoid loader issues
                 tech_env = Environment(loader=FileSystemLoader(os.path.dirname(tech_tpl_path)))
                 template = tech_env.get_template(os.path.basename(tech_tpl_path))
            else:
                 try:
                    template = self.get_template(template_name)
                 except:
                    print(f"Template {template_name} not found, falling back to default")
                    template = self.template
        else:
            template = self.template

        # Pipeline Asíncrono
        from asyncio import Queue
        processed_queue = Queue(maxsize=PIPELINE_BUFFER_SIZE)
        
        async def process_images_stage():
            for i, report in enumerate(reports_list):
                try:
                    row_data = report.get("data", {})
                    files = report.get("files", [])
                    
                    # Procesar imágenes
                    images, layout_mode, img_count, temp_files = await self._process_files_serial(
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
                
                except Exception as e:
                    print(f"[PDF] Error processing report {i}: {e}")
                    import traceback
                    traceback.print_exc()
            
            await processed_queue.put(None)
        
        async def generate_pdfs_stage():
            temp_pdf_paths = []
            loop = asyncio.get_running_loop()
            
            with ThreadPoolExecutor(max_workers=MAX_PDF_WORKERS) as executor:
                while True:
                    item = await processed_queue.get()
                    if item is None:
                        break
                    
                    try:
                        pdf_path = await loop.run_in_executor(
                            executor,
                            _render_pdf_to_file_safe,
                            item['html']
                        )
                        
                        if pdf_path:
                            temp_pdf_paths.append(pdf_path)
                        
                        # Cleanup inmediato
                        for img_path in item['temp_images']:
                            try:
                                if os.path.exists(img_path):
                                    os.remove(img_path)
                            except:
                                pass
                    
                    except Exception as e:
                        print(f"[PDF] Error generating PDF: {e}")
                        import traceback
                        traceback.print_exc()
            
            return temp_pdf_paths
        
        # Ejecutar pipeline
        producer_task = asyncio.create_task(process_images_stage())
        temp_pdf_paths = await generate_pdfs_stage()
        await producer_task
        
        if not temp_pdf_paths:
            raise RuntimeError("No PDFs were generated successfully")
        
        # Merge
        print(f"[PDF] Merging {len(temp_pdf_paths)} PDFs...")
        
        final_writer = PdfWriter()
        for pdf_path in temp_pdf_paths:
            try:
                with open(pdf_path, 'rb') as f:
                    reader = PdfReader(f)
                    for page in reader.pages:
                        final_writer.add_page(page)
                
                os.remove(pdf_path)
            except Exception as e:
                print(f"[PDF] Error merging {pdf_path}: {e}")
        
        # Write output
        if output_path:
            with open(output_path, "wb") as f:
                final_writer.write(f)
            result = output_path
        else:
            output_buffer = io.BytesIO()
            final_writer.write(output_buffer)
            result = output_buffer.getvalue()
        
        final_writer.close()
        
        # Cleanup
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
        
        gc.collect()
        
        print(f"[PDF] Complete! Generated {total_reports} pages")
        return result

    async def generate_pdf_from_uploads(self, row_data, files, logo_left=None, logo_right=None, output_filename="report.pdf"):
        """Wrapper para backward compatibility"""
        return await self.generate_batch_pdf([{
            "data": row_data,
            "files": files
        }], logo_left=logo_left, logo_right=logo_right)

    def generate_pdf_task(self, row_data, folder_path, id_column, output_path):
        """Single worker task"""
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
        
        try:
            HTML(string=html_out, base_url=folder_path).write_pdf(pdf_file)
            return {"id": item_id, "status": "success", "file": pdf_file}
        except Exception as e:
            print(f"Error generating PDF for {item_id}: {e}")
            return {"id": item_id, "status": "error", "message": str(e)}


# ============================================================================
# HELPER FUNCTIONS - VERSIÓN SEGURA
# ============================================================================

def _render_pdf_to_file_safe(html_string):
    """
    Renderizado seguro de PDF con manejo de errores robusto
    """
    import tempfile
    from weasyprint import HTML
    
    try:
        temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix='.pdf')
        
        # ✅ CONFIGURACIÓN SEGURA: Sin optimizaciones arriesgadas
        HTML(string=html_string, base_url=os.getcwd()).write_pdf(
            temp_pdf.name,
            optimize_images=False,  # Ya optimizadas
            uncompressed_pdf=False  # Comprimir
        )
        
        temp_pdf.close()
        return temp_pdf.name
    
    except Exception as e:
        print(f"[ERROR] PDF rendering failed: {e}")
        import traceback
        traceback.print_exc()
        return None


def run_batch_generation(df_records, folder_path, id_column, output_path):
    """Legacy batch generation"""
    from concurrent.futures import ProcessPoolExecutor
    
    service = ReportService()
    results = []
    
    with ProcessPoolExecutor() as executor:
        futures = [
            executor.submit(service.generate_pdf_task, row, folder_path, id_column, output_path)
            for row in df_records
        ]
        
        for future in futures:
            try:
                results.append(future.result())
            except Exception as e:
                print(f"Error in batch generation: {e}")
                results.append({"status": "error", "message": str(e)})
            
    return results