/**
 * ComparacionReveal — resultado final tras confirmar la calibración:
 * SAACA vs voto final del auditor por criterio + coincidencia y observaciones.
 */

import { useEffect, useState } from 'react';
import { getComparacion } from '../../services/api.js';

const RESULT_STYLE = {
  CUMPLE:      { bg: 'var(--color-result-cumple-bg)',      color: 'var(--color-result-cumple)' },
  NO_CUMPLE:   { bg: 'var(--color-result-no-cumple-bg)',   color: 'var(--color-result-no-cumple)' },
  'N/A':       { bg: 'var(--color-result-na-bg)',          color: 'var(--color-result-na)' },
  NO_EVALUADO: { bg: 'var(--color-result-no-evaluado-bg)', color: 'var(--color-result-no-evaluado)' },
};

export function ResultChip({ resultado }) {
  if (!resultado) return <span style={{ color: 'var(--color-gray-400)' }}>—</span>;
  const s = RESULT_STYLE[resultado] ?? { bg: 'var(--color-gray-100)', color: 'var(--color-fg-muted)' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 'var(--radius-full)',
      background: s.bg, color: s.color,
      fontFamily: 'var(--font-body)', fontSize: 10,
      fontWeight: 'var(--font-weight-bold)', whiteSpace: 'nowrap',
    }}>
      {resultado}
    </span>
  );
}

export default function ComparacionReveal({ interactionId, inconsistente }) {
  const [data, setData]   = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getComparacion(interactionId)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message ?? 'Error al cargar la comparación'); });
    return () => { cancelled = true; };
  }, [interactionId]);

  if (error) {
    return (
      <div style={{ padding: '12px 16px', fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-xs)', color: 'var(--color-red-700)' }}>
        {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)' }}>
        Cargando comparación…
      </div>
    );
  }

  const pct = data.total_criterios > 0
    ? (data.coincidencias / data.total_criterios) * 100
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Resumen */}
      <div style={{
        padding: '12px 16px',
        background: 'var(--color-primary-light)',
        borderBottom: '1px solid var(--color-orange-300)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-weight-bold)', color: 'var(--color-orange-900)' }}>
          Comparación con SAACA
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-weight-bold)', color: 'var(--color-primary-dark)' }}>
          {data.coincidencias}/{data.total_criterios} coincidencias
          {pct != null ? ` (${pct.toFixed(0)}%)` : ''}
        </span>
      </div>

      {inconsistente && (
        <div style={{
          margin: '10px 16px 0', padding: '8px 12px',
          background: 'var(--color-warning-light)', border: '1px solid var(--color-orange-300)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-orange-900)',
        }}>
          Tu evaluación quedó guardada, pero el estado de la muestra no pudo
          actualizarse — el caso fue registrado para revisión del equipo.
        </div>
      )}

      {/* Tabla comparativa */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
          <thead>
            <tr style={{ background: 'var(--color-gray-100)' }}>
              {['Criterio', 'SAACA', 'Tu voto final', '¿Coincide?', 'Observación SAACA', 'Tu observación'].map(h => (
                <th key={h} style={{
                  padding: '7px 12px', textAlign: 'left',
                  fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-muted)',
                  fontSize: 10, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
                  whiteSpace: 'nowrap',
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.criterios.map(c => (
              <tr key={c.criterion_id} style={{ borderTop: '1px solid var(--color-gray-100)' }}>
                <td style={{ padding: '8px 12px', color: 'var(--color-black)', minWidth: 150 }}>
                  {c.criterion_name ?? c.criterion_id}
                </td>
                <td style={{ padding: '8px 12px' }}><ResultChip resultado={c.resultado_auto} /></td>
                <td style={{ padding: '8px 12px' }}><ResultChip resultado={c.resultado_humano} /></td>
                <td style={{ padding: '8px 12px' }}>
                  {c.coincide == null ? (
                    <span style={{ color: 'var(--color-gray-400)' }}>—</span>
                  ) : c.coincide ? (
                    <span style={{ color: 'var(--color-result-cumple)', fontWeight: 'var(--font-weight-bold)' }}>✓ Sí</span>
                  ) : (
                    <span style={{ color: 'var(--color-result-no-cumple)', fontWeight: 'var(--font-weight-bold)' }}>✗ No</span>
                  )}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--color-gray-700)', lineHeight: 1.45 }}>
                  {c.observacion_auto
                    ? c.observacion_auto
                    : <span style={{ color: 'var(--color-gray-400)', fontStyle: 'italic' }}>Sin observación registrada</span>}
                </td>
                <td style={{ padding: '8px 12px', color: 'var(--color-gray-700)', lineHeight: 1.45 }}>
                  {c.observacion_humana
                    ? c.observacion_humana
                    : <span style={{ color: 'var(--color-gray-400)', fontStyle: 'italic' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
