"""
GCSConnector — lectura/escritura de objetos en Google Cloud Storage.

Adaptado de saaca/connectors/gcs_connector.py con bucket y proyecto por
configuración (en SAACA estaban fijos a sell-in). Credenciales: el mismo
archivo que BigQueryConnector (service_account o authorized_user); sin
archivo, ADC.

Nota: con credenciales authorized_user no se pueden firmar URLs, por eso las
descargas pasan por el backend (download_bytes) en vez de signed URLs.
"""

import json
import logging
import os
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/cloud-platform"]
_TOKEN_URI_DEFAULT = "https://oauth2.googleapis.com/token"
_BACKEND_DIR = Path(__file__).resolve().parent.parent


def resolver_ruta_credenciales(path: Optional[str]) -> Optional[str]:
    """Misma regla que dependencies.get_bq(): una ruta relativa se resuelve desde backend/."""
    if path and not Path(path).is_absolute():
        return str(_BACKEND_DIR / path)
    return path


def _credenciales(credentials_path: Optional[str]):
    """Credenciales desde archivo (mismo formato que BQ) o None para usar ADC."""
    if not credentials_path or not os.path.exists(credentials_path):
        return None
    with open(credentials_path) as f:
        data = json.load(f)
    if data.get("type") == "service_account":
        from google.oauth2 import service_account as sa
        return sa.Credentials.from_service_account_info(data, scopes=_SCOPES)
    from google.oauth2.credentials import Credentials as UserCredentials
    return UserCredentials(
        token=data.get("token"),
        refresh_token=data["refresh_token"],
        token_uri=data.get("token_uri", _TOKEN_URI_DEFAULT),
        client_id=data["client_id"],
        client_secret=data["client_secret"],
    )


class GCSConnector:

    def __init__(
        self,
        bucket: str,
        project: Optional[str] = None,
        credentials_path: Optional[str] = None,
        client: Any = None,               # inyectable en tests
    ) -> None:
        if client is None:
            from google.cloud import storage
            client = storage.Client(project=project, credentials=_credenciales(credentials_path))
        self._client = client
        self._bucket = client.bucket(bucket)
        self.bucket_name = bucket
        logger.info("GCSConnector inicializado — bucket: %s", bucket)

    @classmethod
    def desde_settings(cls, settings) -> "GCSConnector":
        return cls(
            bucket=settings.DIAGNOSTICO_GCS_BUCKET,
            project=settings.DIAGNOSTICO_GCS_PROJECT,
            credentials_path=resolver_ruta_credenciales(settings.BQ_CREDENTIALS_PATH),
        )

    def upload_text(self, path: str, content: str, content_type: str = "text/html; charset=utf-8") -> None:
        self._bucket.blob(path).upload_from_string(content.encode("utf-8"), content_type=content_type)

    def download_bytes(self, path: str) -> Optional[bytes]:
        """Bytes del objeto, o None si no existe (p.ej. borrado por la regla de 90 días)."""
        blob = self._bucket.blob(path)
        if not blob.exists():
            return None
        return blob.download_as_bytes()

    def delete(self, path: str) -> None:
        self._bucket.blob(path).delete()
