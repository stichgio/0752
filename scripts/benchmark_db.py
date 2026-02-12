"""
Benchmark script for JSON DB performance.
Run from project root: python scripts/benchmark_db.py
"""
import sys
import os
import time
import tempfile
import shutil

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from technical_reports.database import TechnicalReportsDB
from technical_reports.models import TechnicalReport
from datetime import datetime


def benchmark_crud(n=100):
    """Benchmark N create + get_all + delete cycles."""
    tmp = tempfile.mkdtemp()
    print(f"Benchmarking with {n} items in temp dir: {tmp}")

    try:
        db = TechnicalReportsDB(storage_dir=tmp)

        # --- CREATE ---
        start = time.perf_counter()
        for i in range(n):
            report = TechnicalReport(
                id=f"BENCH-{i:04d}",
                metadata={"informe_id": i, "dia": 1, "mes": "ENERO", "anio": 2025, "pagina": "1 de 2"},
                header={"cs": "TEST", "contratista": "TEST", "codigo_infraestructura": "TEST",
                        "ubicacion": "TEST", "suministro": "TEST", "tipo": "ELEVADO", "volumen": 0},
                inspeccion={},
                valvulas={},
                canastillas={},
                last_modified=datetime.now().isoformat()
            )
            db.create_report(report)
        create_time = time.perf_counter() - start

        # --- GET ALL ---
        start = time.perf_counter()
        for _ in range(10):
            db.get_all_reports()
        get_all_time = time.perf_counter() - start

        # --- GET SINGLE ---
        start = time.perf_counter()
        for i in range(n):
            db.get_report(f"BENCH-{i:04d}")
        get_single_time = time.perf_counter() - start

        # --- UPDATE ---
        start = time.perf_counter()
        for i in range(min(n, 20)):
            report = TechnicalReport(
                id=f"BENCH-{i:04d}",
                metadata={"informe_id": i, "dia": 2, "mes": "FEBRERO", "anio": 2025, "pagina": "1 de 2"},
                header={"cs": "UPDATED", "contratista": "UPDATED", "codigo_infraestructura": "TEST",
                        "ubicacion": "TEST", "suministro": "TEST", "tipo": "ELEVADO", "volumen": 10},
                inspeccion={},
                valvulas={},
                canastillas={},
                last_modified=datetime.now().isoformat()
            )
            db.update_report(f"BENCH-{i:04d}", report)
        update_time = time.perf_counter() - start

        # --- CLEAR ALL ---
        start = time.perf_counter()
        db.clear_all_reports()
        clear_time = time.perf_counter() - start

        # File size check
        db_file = os.path.join(tmp, "technical_reports.json")
        file_size = os.path.getsize(db_file) if os.path.exists(db_file) else 0

        print(f"\n{'='*50}")
        print(f"BENCHMARK RESULTS ({n} items)")
        print(f"{'='*50}")
        print(f"CREATE {n} items:   {create_time:.3f}s  ({n/create_time:.0f} ops/sec)")
        print(f"GET_ALL x10:       {get_all_time:.3f}s  ({10/get_all_time:.0f} calls/sec)")
        print(f"GET_SINGLE x{n}:  {get_single_time:.3f}s  ({n/get_single_time:.0f} ops/sec)")
        print(f"UPDATE x20:        {update_time:.3f}s  ({20/update_time:.0f} ops/sec)")
        print(f"CLEAR_ALL:         {clear_time:.3f}s")
        print(f"DB file size after clear: {file_size} bytes")
        print(f"{'='*50}")

    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 100
    benchmark_crud(count)
