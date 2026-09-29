import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import ProtectedRoute from './components/layout/ProtectedRoute.jsx';
import Layout from './components/layout/Layout.jsx';
import Unauthorized from './pages/Unauthorized.jsx';
import ServiceUnavailable from './pages/ServiceUnavailable.jsx';
import Reporteria from './pages/Reporteria.jsx';
import Calibracion from './pages/Calibracion.jsx';
import CalibracionCaso from './pages/CalibracionCaso.jsx';
import Glosario from './pages/Glosario.jsx';
import { ROUTES } from './constants/routes.js';
import { ROLES } from './constants/roles.js';

/**
 * Gate de sesión: la identidad la garantiza IAP. Solo esperamos a resolver
 * "quién soy" (rol) vía /api/auth/me antes de renderizar la app.
 */
function AppGate() {
  const { user, loading, authError } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-body)', color: 'var(--color-fg-subtle)', fontSize: 14,
      }}>
        Cargando…
      </div>
    );
  }

  if (authError === 'denied') {
    return <Unauthorized />;
  }

  if (authError === 'unavailable' || !user) {
    return <ServiceUnavailable />;
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={ROUTES.REPORTERIA} replace />} />
        <Route path={ROUTES.REPORTERIA} element={<Reporteria />} />
        {/* Glosario — disponible para todos los roles */}
        <Route path={ROUTES.GLOSARIO} element={<Glosario />} />

        {/* Módulo de calibración — requiere rol AUDITOR o superior */}
        <Route element={<ProtectedRoute minRole={ROLES.AUDITOR} />}>
          <Route path={ROUTES.CALIBRACION} element={<Calibracion />} />
          <Route path={ROUTES.CALIBRACION_CASO} element={<CalibracionCaso />} />
        </Route>
      </Route>

      {/* Cualquier ruta no definida → reportería */}
      <Route path="*" element={<Navigate to={ROUTES.REPORTERIA} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppGate />
      </BrowserRouter>
    </AuthProvider>
  );
}
