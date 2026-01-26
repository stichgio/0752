"""
Servicio de lógica de negocio para informes técnicos
"""
from typing import Optional
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
import io
import os
from .models import TechnicalReport

class TechnicalReportService:
    def __init__(self):
        templates_dir = os.path.join(os.path.dirname(__file__), "templates")
        self.env = Environment(loader=FileSystemLoader(templates_dir))
        self.template = self.env.get_template("informe_tecnico.html")
    
    def generate_pdf(self, report: TechnicalReport, logo_left: Optional[str] = None) -> bytes:
        """Generar PDF del informe"""
        try:
            # Renderizar HTML
            html_content = self.template.render(
                report=report.dict(),
                logo_left=logo_left
            )
            
            # Generar PDF
            pdf_bytes = HTML(string=html_content).write_pdf()
            
            return pdf_bytes
        
        except Exception as e:
            print(f"[TechReports Service] Error generating PDF: {e}")
            raise

# Instancia global
service = TechnicalReportService()
