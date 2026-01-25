import os
import base64
import re
import io
import gc
import tempfile
from uuid import uuid4
from jinja2 import Environment, FileSystemLoader

# Try to import WeasyPrint, handle missing GTK3 on Windows
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
    print(f"WARNING: WeasyPrint could not be loaded (likely missing GTK3). PDF generation will fail. Error: {e}")
    HTML = None
except ImportError as e:
    print(f"WARNING: WeasyPrint not installed. PDF generation will fail. Error: {e}")
    HTML = None

from concurrent.futures import ProcessPoolExecutor
import piexif
import pathlib
from PIL import Image

# ============================================================================
# MEMORY-OPTIMIZED CONFIGURATION FOR 512MB RAM
# ============================================================================
# Target: 65 reports × 9 images = 585 images total in one PDF
# Strategy: "Process-and-Forget" with incremental disk streaming
# ============================================================================

MAX_IMAGE_SIZE = (1600, 1600)  # Increased for HD quality
JPEG_QUALITY = 90            # High quality for HD output
MAX_CONCURRENT = 5           # Parallel processing enabled
WRITE_EVERY_N_REPORTS = 1    # Flush PDF to disk after each report
TEMP_DIR = tempfile.gettempdir()


class ReportService:
    def __init__(self, templates_dir=None):
        if templates_dir is None:
            # Resolve templates dir relative to this file's location
            templates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "templates")
        self.env = Environment(loader=FileSystemLoader(templates_dir))
        self.template = self.env.get_template("report.html")
        
        # Cache for logos written to disk (avoid repeated base64 in memory)
        self._logo_cache = {}

    def get_image_dimensions(self, img_path):
        """Returns (width, height, is_landscape) for an image"""
        try:
            with Image.open(img_path) as img:
                width, height = img.size
                is_landscape = width >= height
                return width, height, is_landscape
        except Exception:
            return 0, 0, True  # Default to landscape if can't read

    def get_image_metadata(self, img_path):
        metadata = {"date": "N/A", "coords": "N/A"}
        try:
            exif_dict = piexif.load(img_path)
            if piexif.ImageIFD.DateTime in exif_dict["0th"]:
                date_str = exif_dict["0th"][piexif.ImageIFD.DateTime].decode("utf-8")
                metadata["date"] = date_str
            
            # Simplified GPS extraction
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
        MEMORY-OPTIMIZED image processing:
        - Uses thumbnail() in-place (no copy)
        - BILINEAR resampling (3× faster, 50% less RAM than LANCZOS)
        - No progressive JPEG (avoids large temp buffer)
        - No optimize=True (avoids double-pass)
        """
        try:
            # Handle if content is bytes or file path
            if isinstance(image_content, str) and os.path.exists(image_content):
                with open(image_content, "rb") as f:
                    image_content = f.read()
            elif not isinstance(image_content, bytes):
                return None

            img = Image.open(io.BytesIO(image_content))
            
            # Free input bytes immediately
            del image_content
            
            # Convert to RGB properly handling transparency
            if img.mode in ('RGBA', 'P', 'LA'):
                # Create white background
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                # Paste with alpha mask if available
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
                
            # thumbnail() modifies in-place, BILINEAR is faster and uses less RAM
            img.thumbnail(max_size, Image.Resampling.BILINEAR)
            
            # Save without progressive or optimize (smaller temp buffer)
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
        """
        Searches for images matching {pattern_id}-*.jpg or similar
        """
        images = []
        if not os.path.exists(folder_path):
            return images

        # Regex to match pattern-1.jpg, pattern-2.jpg, etc.
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
        """Write logo to temp file once and return file:// URI"""
        if logo_data is None:
            return None
            
        cache_key = f"logo_{side}"
        if cache_key in self._logo_cache:
            return self._logo_cache[cache_key]
        
        try:
            # Handle base64 data URI
            if logo_data.startswith("data:"):
                # Extract base64 part
                header, b64_data = logo_data.split(",", 1)
                logo_bytes = base64.b64decode(b64_data)
            else:
                logo_bytes = logo_data.encode() if isinstance(logo_data, str) else logo_data
            
            temp_path = os.path.join(TEMP_DIR, f"logo_{side}_{uuid4().hex[:8]}.png")
            with open(temp_path, "wb") as f:
                f.write(logo_bytes)
            
            # Use pathlib for proper Windows file:// URI
            file_uri = pathlib.Path(temp_path).as_uri()
            self._logo_cache[cache_key] = file_uri
            return file_uri
        except Exception as e:
            print(f"Error writing logo to disk: {e}")
            return logo_data  # Fallback to original

    async def _process_files_serial(self, files, max_size=(1920, 1920), quality=90):
        """
        Async helper to process files concurrently using asyncio.gather and Semaphore.
        Uses MAX_CONCURRENT to control parallelism.
        Images are written to temp files, not kept in memory as base64.
        """
        import asyncio
        import httpx
        
        processed_images = []
        orientations = []
        temp_files = []  # Track for cleanup
        
        # Handle None or empty files (for templates that don't need images)
        if not files:
            return processed_images, "grid", 0, temp_files
        
        # Get running loop
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        # Semaphore to control concurrency
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

                    # 1. Acquire Content (I/O)
                    if f_path.startswith("http"):
                        # URL download with httpx
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            resp = await client.get(f_path)
                            resp.raise_for_status()
                            content = resp.content
                    elif f_path and os.path.exists(f_path):
                        # Local file read in executor
                        def read_file():
                            with open(f_path, "rb") as f:
                                return f.read()
                        content = await loop.run_in_executor(None, read_file)
                    else:
                        return None  # Skip invalid paths

                    if not content:
                        return None

                    # 2. Extract Metadata (only for local files)
                    metadata = {"date": "N/A", "coords": "N/A"}
                    width, height, is_landscape = 0, 0, True
                    
                    if f_path and os.path.exists(f_path):
                        try:
                            metadata = self.get_image_metadata(f_path)
                            width, height, is_landscape = self.get_image_dimensions(f_path)
                        except Exception:
                            pass
                    
                    # 3. Optimize Image (CPU Bound) - Run in Thread Pool
                    optimized_bytes = await loop.run_in_executor(
                        None, 
                        self.optimize_image_for_pdf, 
                        content, 
                        max_size, 
                        quality
                    )
                    
                    # Free original content immediately
                    del content
                    
                    if not optimized_bytes:
                        return None

                    # If we didn't get dimensions from file (e.g. URL), get from optimized bytes
                    if width == 0:
                        try:
                            with Image.open(io.BytesIO(optimized_bytes)) as img_check:
                                width, height = img_check.size
                                is_landscape = width >= height
                        except Exception:
                            is_landscape = True

                    # 4. Write to temp file instead of keeping base64 in memory
                    temp_img_path = os.path.join(TEMP_DIR, f"img_{uuid4().hex}.jpg")
                    with open(temp_img_path, "wb") as f:
                        f.write(optimized_bytes)
                    
                    # Free optimized bytes immediately
                    del optimized_bytes
                    
                    # Store file:// URI instead of base64
                    file_uri = pathlib.Path(temp_img_path).as_uri()
                    
                    return {
                        "data": {
                            "path": file_uri,
                            "name": f_name,
                            "order": file_obj.get("order", idx) if isinstance(file_obj, dict) else idx,
                            "date": metadata.get("date", "N/A"),
                            "coords": metadata.get("coords", "N/A"),
                            "is_landscape": is_landscape,
                            "width": width,
                            "height": height,
                            "_temp_file": temp_img_path  # For cleanup
                        },
                        "orientation": is_landscape,
                        "temp_path": temp_img_path
                    }
                    
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

        # Sort by order to ensure correct sequence
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
        MEMORY-OPTIMIZED consolidated PDF generation.
        
        Strategy: Multi-pass approach for 512MB RAM constraint
        1. Generate individual PDFs to disk (one at a time)
        2. Merge all PDFs using pypdf (very memory efficient)
        3. Cleanup temp files
        
        This avoids keeping all rendered pages in memory simultaneously.
        """
        from pypdf import PdfWriter, PdfReader
        
        if HTML is None:
            raise RuntimeError("WeasyPrint is not available. Please install GTK3 Runtime on Windows or use the Docker container.")

        total_reports = len(reports_list)
        
        # Memory estimation warning
        estimated_mb = total_reports * 9 * 0.5  # ~0.5MB per optimized image
        print(f"[PDF] Starting batch: {total_reports} reports, ~{estimated_mb:.0f}MB estimated")
        
        # Use base64 data URIs directly for logos (more reliable across environments)
        # WeasyPrint handles data: URIs perfectly, avoiding file:// path issues
        logo_left_uri = logo_left  # Keep as data:image/... base64
        logo_right_uri = logo_right  # Keep as data:image/... base64
        
        # 1. Template Selection
        if custom_template_str:
            from jinja2 import Template
            template = Template(custom_template_str)
        else:
            template = self.template

        # 2. Generate individual PDFs to disk
        temp_pdf_paths = []
        all_temp_images = []
        
        try:
            for i, report in enumerate(reports_list):
                # Data extraction
                row_data = report.get("data")
                files = report.get("files")
                
                # a. Process Images SERIALLY (memory safe)
                images, layout_mode, img_count, temp_files = await self._process_files_serial(
                    files, 
                    max_size=MAX_IMAGE_SIZE, 
                    quality=JPEG_QUALITY
                )
                all_temp_images.extend(temp_files)
                
                # b. Render Context: Single report only
                single_report_context = [{
                    "data": row_data,
                    "images": images,
                    "layout_mode": layout_mode,
                    "img_count": img_count
                }]
                
                # c. Render HTML (minimal context)
                html_out = template.render(
                    reports=single_report_context,
                    title="PANEL FOTOGRÁFICO",
                    logo_left=logo_left_uri or logo_left,
                    logo_right=logo_right_uri or logo_right
                )
                
                # d. Generate single PDF to temp file
                temp_pdf_path = os.path.join(TEMP_DIR, f"report_{uuid4().hex}.pdf")
                try:
                    pdf_bytes = HTML(string=html_out, base_url=os.getcwd()).write_pdf()
                    with open(temp_pdf_path, "wb") as f:
                        f.write(pdf_bytes)
                    temp_pdf_paths.append(temp_pdf_path)
                    
                    # Free PDF bytes
                    del pdf_bytes
                except Exception as e:
                    print(f"[PDF] Error generating report {i+1}: {e}")
                
                # e. Cleanup after each report
                del html_out
                del images
                del single_report_context
                gc.collect()
                
                # Progress logging
                print(f"[PDF] Processed {i+1}/{total_reports}")

            # 3. Merge all PDFs using pypdf (memory efficient)
            print(f"[PDF] Merging {len(temp_pdf_paths)} PDFs...")
            
            final_writer = PdfWriter()
            for pdf_path in temp_pdf_paths:
                try:
                    # pypdf reads pages lazily, very memory efficient
                    final_writer.append(pdf_path)
                except Exception as e:
                    print(f"[PDF] Error appending {pdf_path}: {e}")
            
            # 4. Write final output
            if output_path:
                with open(output_path, "wb") as f:
                    final_writer.write(f)
                result = output_path
            else:
                output_buffer = io.BytesIO()
                final_writer.write(output_buffer)
                result = output_buffer.getvalue()
            
            final_writer.close()
            
            print(f"[PDF] Complete! Generated {total_reports} pages")
            return result
            
        finally:
            # 5. Cleanup ALL temp files
            for pdf_path in temp_pdf_paths:
                try:
                    if os.path.exists(pdf_path):
                        os.remove(pdf_path)
                except Exception:
                    pass
            
            for img_path in all_temp_images:
                try:
                    if os.path.exists(img_path):
                        os.remove(img_path)
                except Exception:
                    pass
            
            # Clear logo cache
            for key, uri in list(self._logo_cache.items()):
                try:
                    if uri.startswith("file://"):
                        path = uri.replace("file://", "")
                        if os.path.exists(path):
                            os.remove(path)
                except Exception:
                    pass
            self._logo_cache.clear()
            
            gc.collect()

    async def generate_pdf_from_uploads(self, row_data, files, logo_left=None, logo_right=None, output_filename="report.pdf"):
        # Wrapper for backward compatibility / single mode
        return await self.generate_batch_pdf([{
            "data": row_data,
            "files": files
        }], logo_left=logo_left, logo_right=logo_right)

    def generate_pdf_task(self, row_data, folder_path, id_column, output_path):
        """
        Single worker task for PDF generation
        """
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

def run_batch_generation(df_records, folder_path, id_column, output_path):
    # This must be a top-level function for ProcessPoolExecutor to pickle it
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
