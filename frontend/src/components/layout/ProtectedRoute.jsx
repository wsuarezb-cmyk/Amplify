/**
 * ProtectedRoute — gate por rol mínimo dentro de la app.
 *
 * La identidad ya está garantizada por IAP y resuelta en AppGate (si el
 * usuario no tiene acceso, ni siquiera llega aquí). Este wrapper solo valida
 * el ROL: si es insuficiente para la ruta, redirige a Reportería (nivel base).
 *
 * Usa hasMinRole() de constants/roles.js — única fuente de verdad de la
 * jerarquía (VIEWER < AUDITOR < LIDER_QUALITY < ADMIN).
 */

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { hasMinRole } from '../../constants/roles.js';
import { ROUTES } from '../../constants/routes.js';

export default function ProtectedRoute({ minRole }) {
  const { user } = useAuth();

  if (!hasMinRole(user?.role, minRole)) {
    return <Navigate to={ROUTES.REPORTERIA} replace />;
  }

  return <Outlet />;
}
