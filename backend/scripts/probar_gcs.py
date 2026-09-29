"""
Prueba de humo de GCS con la configuración de backend/.env.

Correr desde la raíz del proyecto (VPN activa):
    backend\\.venv\\Scripts\\python.exe -m backend.scripts.probar_gcs

Sube un archivo de prueba bajo {DIAGNOSTICO_GCS_PREFIX}/_prueba/, lo lee,
compara el contenido y lo borra. Verifica permisos de escritura, lectura y
borrado con las mismas credenciales que usará el diagnóstico.
"""

import sys
from datetime import datetime, timezone

from backend.config import get_settings
from backend.connectors.gcs_connector import GCSConnector


def main() -> int:
    s = get_settings()
    if not s.DIAGNOSTICO_GCS_BUCKET:
        print("✗ Falta DIAGNOSTICO_GCS_BUCKET en backend/.env")
        return 1

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    path = f"{s.DIAGNOSTICO_GCS_PREFIX.rstrip('/')}/_prueba/ping-{ts}.txt"
    contenido = f"Pitch — prueba de GCS {ts}"
    print(f"Bucket : {s.DIAGNOSTICO_GCS_BUCKET} (proyecto {s.DIAGNOSTICO_GCS_PROJECT})")
    print(f"Objeto : {path}")

    try:
        gcs = GCSConnector.desde_settings(s)
        gcs.upload_text(path, contenido, content_type="text/plain; charset=utf-8")
        print("✓ Escritura")
        leido = gcs.download_bytes(path)
        if leido is None or leido.decode("utf-8") != contenido:
            print("✗ Lectura: el contenido no coincide")
            return 1
        print("✓ Lectura")
        gcs.delete(path)
        print("✓ Borrado")
    except Exception as exc:
        print(f"✗ {type(exc).__name__}: {exc}")
        return 1

    print("✓ GCS listo para el diagnóstico")
    return 0


if __name__ == "__main__":
    sys.exit(main())
