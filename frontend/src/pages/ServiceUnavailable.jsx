/**
 * ServiceUnavailable — no se pudo verificar el acceso por un error transitorio
 * (401 inesperado, 503 de BigQuery, o red caída). Deliberadamente NO dice
 * "sin acceso": ese mensaje es exclusivo de Unauthorized (403 confirmado).
 */

import { useAuth } from '../contexts/AuthContext.jsx';

export default function ServiceUnavailable() {
  const { retry, logout } = useAuth();

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg-subtle)', fontFamily: 'var(--font-body)', padding: 24,
    }}>
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
        padding: '48px 40px', maxWidth: 440, textAlign: 'center',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 'var(--font-weight-extrabold)',
          fontSize: 28, color: 'var(--color-primary)', letterSpacing: 'var(--tracking-tight)',
        }}>
          Pitch
        </span>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 'var(--font-weight-semibold)',
          fontSize: 18, color: 'var(--color-black)', margin: 0,
        }}>
          No pudimos verificar tu acceso
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-fg-subtle)', margin: 0, lineHeight: 1.5 }}>
          Ocurrió un problema temporal. Intenta de nuevo en unos segundos.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={retry}
            style={{
              padding: '10px 20px',
              background: 'var(--color-primary)', color: 'var(--color-fg-on-dark)',
              border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            Reintentar
          </button>
          <button
            onClick={logout}
            style={{
              padding: '10px 20px',
              background: 'var(--color-surface)', color: 'var(--color-fg-subtle)',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            Cambiar de cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
