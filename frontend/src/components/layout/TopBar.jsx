/**
 * TopBar — barra de marca (la navegación de app vive en el Sidebar).
 *
 * Empieza con "Overture SX" + la onda de 4 colores (clickeable → redirige a
 * Overture), un separador, y luego la marca Pitch con su leyenda (sin repetir
 * la onda). A la derecha, el menú de usuario. Estilos en index.css.
 */

import { useEffect, useRef, useState } from 'react';
import { SignOutRegular, PersonRegular } from '@fluentui/react-icons';
import { useAuth } from '../../contexts/AuthContext.jsx';

const OVERTURE_URL = 'https://foverture-sx-396556777333.us-east4.run.app/dashboard';

const ROLE_LABEL = {
  VIEWER: 'Viewer',
  AUDITOR: 'Auditor',
  LIDER_QUALITY: 'Líder de Calidad',
  ADMIN: 'Administrador',
};

// Onda de 4 barras de la marca Overture — colores/alturas idénticos al portal.
const BRAND_BARS = [
  { color: 'var(--color-green)',    height: 10 },
  { color: 'var(--color-blue)',     height: 13 },
  { color: 'var(--color-red)',      height: 11 },
  { color: 'var(--color-gray-500)', height: 8 },
];

export default function TopBar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const initials = (user?.full_name ?? '?')
    .split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  return (
    <header className="pitch-navbar">
      {/* Marca Overture SX (redirige a Overture) */}
      <a
        href={OVERTURE_URL}
        className="overture-brand"
        title="Ir a Overture SX"
      >
        <span className="overture-brand-text">Overture<span className="overture-sx">SX</span></span>
        <div className="overture-brand-bars">
          {BRAND_BARS.map((b, i) => (
            <span key={i} style={{ background: b.color, height: b.height }} />
          ))}
        </div>
      </a>

      {/* Separador */}
      <span className="brand-separator" aria-hidden="true" />

      {/* Marca Pitch (sin repetir la onda) */}
      <div className="pitch-brand-only">
        <span className="pitch-brand-text">Pitch</span>
        <span className="pitch-brand-subtitle">"Evalúa precisión y desviaciones a partir de SAACA"</span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Usuario */}
      {user && (
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button className="pitch-user-trigger" onClick={() => setMenuOpen(o => !o)}>
            <div className="pitch-user-avatar">{initials}</div>
            <div className="topbar-username" style={{ textAlign: 'left', lineHeight: 1.2 }}>
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-gray-900)',
              }}>
                {user.full_name}
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--color-fg-muted)' }}>
                {ROLE_LABEL[user.role] ?? user.role}
              </div>
            </div>
            <span style={{ fontSize: 9, color: 'var(--color-fg-subtle)' }}>▼</span>
          </button>

          {menuOpen && (
            <div className="pitch-user-menu">
              <div style={{
                padding: '8px 16px', borderBottom: '1px solid var(--color-gray-200)',
                display: 'flex', alignItems: 'center', gap: 8,
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-muted)',
              }}>
                <PersonRegular style={{ width: 14, height: 14 }} />
                <div>
                  <div style={{ color: 'var(--color-gray-900)', fontWeight: 'var(--font-weight-semibold)' }}>
                    {user.email}
                  </div>
                  <div style={{ fontSize: 10 }}>{ROLE_LABEL[user.role] ?? user.role}</div>
                </div>
              </div>
              <button
                onClick={logout}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 16px', border: 'none', background: 'none',
                  cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  color: 'var(--color-danger)', fontWeight: 'var(--font-weight-medium)',
                }}
              >
                <SignOutRegular style={{ width: 15, height: 15 }} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
