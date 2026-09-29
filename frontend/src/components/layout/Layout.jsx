import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

/**
 * Layout de Pitch — Sidebar (navegación) + (TopBar de marca + contenido).
 *
 * El estado de vista (Ejecutiva/Operativa) y la sección activa se levantan aquí
 * y se comparten: el Sidebar los controla/resalta, y la página (Reportería) los
 * consume vía el context del Outlet (useOutletContext).
 */
export default function Layout() {
  const [view, setView] = useState('ejecutiva');
  const [activeSection, setActiveSection] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <Sidebar
        view={view}
        setView={setView}
        activeSection={activeSection}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <TopBar />
        <main style={{
          flex: 1, overflowY: 'auto',
          background: 'var(--color-bg-subtle)', padding: 'var(--space-6)',
        }}>
          <Outlet context={{ view, setView, setActiveSection }} />
        </main>
      </div>
    </div>
  );
}
