"""
Router: GET /api/auth/me — retorna el usuario autenticado.

La identidad la resuelve AuthMiddleware desde el header de IAP
(X-Goog-Authenticated-User-Email) y el rol desde pitch_users, poblando
request.state.user. No hay login propio ni JWT: si IAP te dejó pasar y
tu email está en pitch_users, ya estás autenticado y con rol asignado.
"""

from fastapi import APIRouter, HTTPException, Request

from backend.models.auth import UserContext

router = APIRouter()


@router.get("/me", response_model=UserContext)
async def get_me(request: Request) -> UserContext:
    """
    Retorna el UserContext (email + rol) que pobló el AuthMiddleware.
    Usado por el frontend para ajustar nav y permisos según el rol.
    """
    user: UserContext | None = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="No autenticado")
    return user
