"""
Genera un diagnóstico IA con datos reales y lo guarda como archivo local, SIN
registrarlo en BigQuery (no consume cuota). Para revisar la calidad del texto
y ajustar el prompt.

Correr desde la raíz del proyecto (VPN activa), por ejemplo:
    backend\\.venv\\Scripts\\python.exe -m backend.scripts.generar_diagnostico_prueba ^
        --desde 2026-09-01 --hasta 2026-09-27 --agente correo@falabella.com

    ... --equipo "FRONT OFFICE" (alcance EQUIPO; valores con espacios entre comillas)
    ... --pais CO               (alcance GENERAL de un país)

Abre el HTML resultante en el navegador. Imprime también el contexto en JSON
(--contexto) para compararlo con el tablero.
"""

import argparse
import json
import sys
from pathlib import Path

from backend.config import get_settings
from backend.connectors.genai_connector import GenAIError
from backend.dependencies import get_bq
from backend.services.diagnostico.service import DiagnosticoService


def main() -> int:
    p = argparse.ArgumentParser(description="Diagnóstico IA de prueba (no guarda ni consume cuota)")
    p.add_argument("--desde", required=True, help="AAAA-MM-DD")
    p.add_argument("--hasta", required=True, help="AAAA-MM-DD")
    p.add_argument("--agente", action="append", default=[], help="email_agente (repetible)")
    p.add_argument("--equipo", action="append", default=[], help="departamento (repetible)")
    p.add_argument("--manager", action="append", default=[], help="email_manager (repetible)")
    p.add_argument("--pais", action="append", default=[], help="país (repetible)")
    p.add_argument("--salida", default="diagnostico_prueba.html", help="archivo HTML de salida")
    p.add_argument("--contexto", action="store_true", help="solo imprimir el contexto JSON, sin IA")
    a = p.parse_args()

    filtros = {
        "fecha_start": a.desde, "fecha_end": a.hasta,
        "email_agente": a.agente, "departamento": a.equipo,
        "email_manager": a.manager, "pais": a.pais,
    }
    svc = DiagnosticoService(get_bq(), get_settings())

    try:
        if a.contexto:
            _, ctx = svc.preparar(filtros)
            print(json.dumps(ctx, ensure_ascii=False, indent=2))
            return 0
        print("Generando diagnóstico (puede tardar hasta un minuto)…")
        html, meta = svc.generar_html(filtros, usuario="prueba-local")
    except (ValueError, GenAIError, RuntimeError) as exc:
        print(f"✗ {type(exc).__name__}: {exc}")
        return 1

    salida = Path(a.salida).resolve()
    salida.write_text(html, encoding="utf-8")
    print(f"✓ Diagnóstico guardado en: {salida}")
    print(f"  Alcance: {meta['alcance']['tipo']} — {meta['alcance']['etiqueta']}")
    print(f"  Interacciones: {meta['n_interacciones']} · ejemplos: {meta['n_muestras']}")
    print(f"  Tokens: {meta['prompt_tokens']} entrada / {meta['output_tokens']} salida "
          f"(~USD {meta['costo_estimado_usd']}) · {meta['duracion_s']}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
