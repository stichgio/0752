"""
Servicio de lógica de negocio para informes técnicos
"""
from typing import Optional
from jinja2 import Environment, FileSystemLoader
import os
from .models import TechnicalReport

# Lazy loading de WeasyPrint para evitar errores de importación al inicio
_HTML = None

def get_weasyprint_html():
    global _HTML
    if _HTML is None:
        try:
            from weasyprint import HTML
            _HTML = HTML
        except Exception as e:
            print(f"[TechReports Service] WeasyPrint not available: {e}")
            raise RuntimeError(f"WeasyPrint is not available: {e}")
    return _HTML

class TechnicalReportService:
    def __init__(self):
        templates_dir = os.path.join(os.path.dirname(__file__), "templates")
        
        if not os.path.exists(templates_dir):
            os.makedirs(templates_dir, exist_ok=True)
            print(f"[TechReports Service] Created templates directory: {templates_dir}")
        
        self.env = Environment(loader=FileSystemLoader(templates_dir))
        self._template = None
        self._templates_dir = templates_dir
    
    @property
    def template(self):
        """Lazy loading del template"""
        if self._template is None:
            template_path = os.path.join(self._templates_dir, "informe_tecnico.html")
            if not os.path.exists(template_path):
                raise FileNotFoundError(f"Template not found: {template_path}")
            self._template = self.env.get_template("informe_tecnico.html")
        return self._template
    
    def generate_pdf(self, report: TechnicalReport, logo_left: Optional[str] = None) -> bytes:
        """Generar PDF del informe"""
        try:
            # Obtener datos como dict
            report_dict = report.dict()
            
            # Renderizar HTML
            html_content = self.template.render(
                report=report_dict,
                logo_left=logo_left
            )
            
            # Obtener WeasyPrint
            HTML = get_weasyprint_html()
            
            # Generar PDF
            pdf_bytes = HTML(string=html_content, base_url=self._templates_dir).write_pdf()
            
            return pdf_bytes
        
        except Exception as e:
            print(f"[TechReports Service] Error generating PDF: {e}")
            import traceback
            traceback.print_exc()
            raise

# Instancia global (lazy)
service = TechnicalReportService()
