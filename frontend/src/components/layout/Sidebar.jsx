/**
 * Sidebar — navegación de la app (Reportería / Calibración / Glosario) + navegación de
 * secciones dentro de Reportería (Vista Ejecutiva / Operativa → secciones).
 *
 * Colapsable: expandido muestra íconos + texto y la navegación anidada;
 * colapsado muestra solo íconos con tooltip para dar espacio a la reportería.
 * El estado de vista y sección activa se comparte con la página vía props
 * (los levanta Layout y los pasa al Outlet).
 */

import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  DataBarVerticalRegular,
  ClipboardTaskListLtrRegular,
  BookInformationRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { hasMinRole, ROLES } from '../../constants/roles.js';
import { ROUTES } from '../../constants/routes.js';
import { NAV_GROUPS } from '../../constants/reporteriaSections.js';

const APP_ITEMS = [
  { id: 'reporteria', label: 'Reportería', path: ROUTES.REPORTERIA, Icon: DataBarVerticalRegular, minRole: ROLES.VIEWER },
  { id: 'calibracion', label: 'Calibración', path: ROUTES.CALIBRACION, Icon: ClipboardTaskListLtrRegular, minRole: ROLES.AUDITOR },
  { id: 'glosario', label: 'Glosario', path: ROUTES.GLOSARIO, Icon: BookInformationRegular, minRole: ROLES.VIEWER },
];

export default function Sidebar({ view, setView, activeSection, collapsed, setCollapsed }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const onReporteria = location.pathname.startsWith(ROUTES.REPORTERIA);

  function goToSection(groupView, sectionId) {
    // Asegura la vista correcta antes de hacer scroll (la operativa solo
    // renderiza sus secciones cuando está activa).
    if (view !== groupView) setView(groupView);
    if (!onReporteria) navigate(ROUTES.REPORTERIA);
    // Diferir para dar tiempo a que la sección exista en el DOM.
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  return (
    <aside className={`pitch-sidebar${collapsed ? ' collapsed' : ''}`}>
      {/* Toggle contraer/expandir */}
      <button
        className="sidebar-toggle"
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? 'Expandir menú' : 'Contraer menú'}
      >
        {collapsed
          ? <ChevronRightRegular style={{ width: 18, height: 18 }} />
          : <><ChevronLeftRegular style={{ width: 18, height: 18 }} /><span className="sidebar-label">Contraer menú</span></>}
      </button>

      {/* Navegación de app */}
      <nav className="sidebar-app-nav">
        {APP_ITEMS
          .filter(item => hasMinRole(user?.role, item.minRole))
          .map(({ id, label, path, Icon }) => (
            <NavLink
              key={id}
              to={path}
              className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
              title={collapsed ? label : undefined}
            >
              <Icon style={{ width: 20, height: 20, flexShrink: 0 }} />
              <span className="sidebar-label">{label}</span>
            </NavLink>
          ))}
      </nav>

      {/* Navegación de secciones dentro de Reportería (solo expandido) */}
      {onReporteria && !collapsed && (
        <div className="sidebar-sections">
          {NAV_GROUPS.map(group => (
            <div key={group.view} className="sidebar-group">
              <button
                className={`sidebar-group-header${view === group.view ? ' active' : ''}`}
                onClick={() => setView(group.view)}
              >
                {group.label}
              </button>
              <div className="sidebar-group-items">
                {group.sections.map(s => (
                  <button
                    key={s.id}
                    className={`sidebar-section${activeSection === s.id ? ' active' : ''}`}
                    onClick={() => goToSection(group.view, s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
