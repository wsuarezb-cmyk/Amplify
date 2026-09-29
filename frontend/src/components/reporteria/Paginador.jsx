/**
 * Paginador — paginación estándar de tablas de Reportería:
 * anterior/siguiente + input para saltar directo a una página.
 *
 * Props:
 *   page        — página actual (base 0)
 *   totalPages  — total de páginas
 *   onChange(p) — callback con la nueva página (base 0, ya acotada)
 */

import { useEffect, useState } from 'react';

export default function Paginador({ page, totalPages, onChange }) {
  const [draft, setDraft] = useState(String(page + 1));

  // Sincronizar el input cuando la página cambia desde fuera (flechas, reset por filtros)
  useEffect(() => { setDraft(String(page + 1)); }, [page]);

  if (totalPages <= 1) return null;

  function go(p) {
    onChange(Math.min(Math.max(p, 0), totalPages - 1));
  }

  function commitDraft() {
    const n = parseInt(draft, 10);
    if (!isNaN(n)) go(n - 1);
    else setDraft(String(page + 1));
  }

  const btnStyle = (disabled) => ({
    padding: '4px 12px', borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)', background: 'var(--color-surface)',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg)',
  });

  return (
    <div style={{
      padding: '10px 20px', borderTop: '1px solid var(--color-gray-200)',
      display: 'flex', alignItems: 'center', gap: 8,
      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-muted)',
    }}>
      <button disabled={page === 0} onClick={() => go(page - 1)} style={btnStyle(page === 0)}>‹</button>
      <span>Página</span>
      <input
        type="number" min={1} max={totalPages}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={e => { if (e.key === 'Enter') commitDraft(); }}
        style={{
          width: 64, height: 26, padding: '0 6px', textAlign: 'center',
          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          color: 'var(--color-fg)', outline: 'none',
        }}
      />
      <span>de {totalPages.toLocaleString('es-419')}</span>
      <button disabled={page >= totalPages - 1} onClick={() => go(page + 1)} style={btnStyle(page >= totalPages - 1)}>›</button>
    </div>
  );
}
