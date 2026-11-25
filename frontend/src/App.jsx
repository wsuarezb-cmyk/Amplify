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
import Planner from './pages/Planner.jsx';
import Trace from './pages/Trace.jsx';
import { ROUTES } from './constants/routes.js';
import { canAccessAppModule, defaultAppRoute } from './constants/roles.js';

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

  const homeRoute = defaultAppRoute(user.role);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={homeRoute} replace />} />
        <Route element={<ProtectedRoute module="reporteria" />}>
          <Route path={ROUTES.REPORTERIA} element={<Reporteria />} />
        </Route>
        <Route element={<ProtectedRoute module="planner" />}>
          <Route path={ROUTES.PLANNER} element={<Planner />} />
        </Route>
        <Route element={<ProtectedRoute module="trace" />}>
          <Route path={ROUTES.TRACE} element={<Trace />} />
        </Route>
        <Route element={<ProtectedRoute module="glosario" />}>
          <Route path={ROUTES.GLOSARIO} element={<Glosario />} />
        </Route>
        <Route element={<ProtectedRoute module="calibracion" />}>
          <Route path={ROUTES.CALIBRACION} element={<Calibracion />} />
          <Route path={ROUTES.CALIBRACION_CASO} element={<CalibracionCaso />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to={homeRoute} replace />} />
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
