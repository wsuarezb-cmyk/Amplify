"""
Prueba de humo del gateway de IA (Kairos) con la configuración de backend/.env.

Correr desde la raíz del proyecto (VPN activa):
    backend\\.venv\\Scripts\\python.exe -m backend.scripts.probar_genai

Hace UNA llamada mínima con salida estructurada. No escribe nada en ningún lado.
"""

import sys
import time

from pydantic import BaseModel

from backend.config import get_settings
from backend.connectors.genai_connector import GenAIAuthError, GenAIConnector, GenAIError


class Ping(BaseModel):
    ok: bool
    mensaje: str


def main() -> int:
    s = get_settings()
    if not s.KAIROS_JWT:
        print("✗ Falta KAIROS_JWT en backend/.env")
        return 1

    conn = GenAIConnector.desde_settings(s)
    print(f"Endpoint : {conn.chat_url}")
    print(f"Modelo   : {conn.model}")

    t0 = time.time()
    try:
        r = conn.generar(
            system="Responde en español, en formato JSON.",
            user='Devuelve ok=true y mensaje="Pitch conectado al gateway".',
            schema=Ping,
            max_tokens=64,
        )
    except GenAIAuthError as exc:
        print(f"✗ Credencial rechazada: {exc}")
        return 1
    except GenAIError as exc:
        print(f"✗ Error del gateway: {exc}")
        return 1

    print(f"✓ Respuesta en {time.time() - t0:.1f}s: {r.parsed}")
    print(f"  Tokens: entrada={r.prompt_tokens}, salida={r.output_tokens}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
