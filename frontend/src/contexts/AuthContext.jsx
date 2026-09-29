/**
 * AuthContext — identidad transparente vía IAP.
 *
 * No hay login propio ni Google Sign-In: si IAP te dejó pasar, ya estás
 * autenticado. El frontend solo consulta GET /api/auth/me para saber quién
 * eres y tu rol, y así ajustar nav y permisos.
 *
 * Estados expuestos por useAuth():
 *   user       — { email, full_name, role, ... } | null
 *   loading    — true mientras resuelve /me
 *   authError  — 'denied' (403 — email no está en pitch_users) |
 *                'unavailable' (401/5xx/red — error transitorio, no denegación) |
 *                null
 *   retry()    — reintenta la resolución de /me (para el error transitorio)
 *   logout()   — cierra la sesión de IAP (/_gcp_iap/clear_login_cookie)
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [authError, setAuthError] = useState(null);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        setUser(await res.json());
      } else if (res.status === 403) {
        setAuthError('denied');   // autenticado en IAP, pero sin acceso a Pitch
      } else {
        // 401/503/otro — nunca confirma denegación, puede ser un error transitorio
        setAuthError('unavailable');
      }
    } catch {
      setAuthError('unavailable');   // red caída u otro fallo técnico
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  /** Cierra la sesión de IAP y fuerza re-autenticación con Google. */
  const logout = useCallback(() => {
    window.location.href = '/_gcp_iap/clear_login_cookie';
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, authError, retry: checkAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return ctx;
}
