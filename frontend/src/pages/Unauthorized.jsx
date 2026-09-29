/**
 * Unauthorized — IAP autenticó al usuario, pero su email no está en pitch_users.
 * Equivalente al <NotAuthorized> de Canon.
 */

import { useAuth } from '../contexts/AuthContext.jsx';

export default function Unauthorized() {
  const { logout } = useAuth();

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
          Tu cuenta no tiene acceso a Pitch
        </h1>
        <p style={{ fontSize: 14, color: 'var(--color-fg-subtle)', margin: 0, lineHeight: 1.5 }}>
          Ingresaste correctamente con Google, pero tu usuario no está habilitado
          en Pitch. Contacta al administrador para solicitar acceso.
        </p>
        <button
          onClick={logout}
          style={{
            marginTop: 8, padding: '10px 20px',
            background: 'var(--color-primary)', color: 'var(--color-fg-on-dark)',
            border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          Cambiar de cuenta
        </button>
      </div>
    </div>
  );
}
