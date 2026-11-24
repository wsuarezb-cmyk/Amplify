"""
Schema Pydantic del usuario autenticado.

UserContext se puebla en AuthMiddleware (email desde el header de IAP,
rol desde Overture en producción) y se expone por GET /api/auth/me.
"""

from pydantic import BaseModel


class UserContext(BaseModel):
    """Usuario autenticado: email (del header IAP) + rol de la app."""

    user_id: str
    email: str
    full_name: str
    role: str  # 'VIEWER' | 'AUDITOR' | 'LIDER_QUALITY' | 'ADMIN'
