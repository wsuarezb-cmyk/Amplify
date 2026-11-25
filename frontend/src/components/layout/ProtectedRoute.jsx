/**
 * ProtectedRoute — gate por módulo autorizado.
 *
 * La identidad ya está garantizada por IAP y resuelta en AppGate (si el
 * usuario no tiene acceso, ni siquiera llega aquí). Este wrapper valida el
 * módulo y redirige a la primera ruta permitida para su rol.
 */

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { canAccessAppModule, defaultAppRoute } from '../../constants/roles.js';

export default function ProtectedRoute({ module }) {
  const { user } = useAuth();

  if (!canAccessAppModule(user?.role, module)) {
    return <Navigate to={defaultAppRoute(user?.role)} replace />;
  }

  return <Outlet />;
}
