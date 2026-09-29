/**
 * MatrizInteraccion — qué criterios activos evalúa SAACA en cada tipo de
 * interacción (saaca_cat_criteria_mapping, mapping activo, sin filas HUMANO).
 */

import { useMemo } from 'react';
import ChartCard from '../reporteria/ChartCard.jsx';
import { CRITICIDAD_LABEL, matrizInteraccion } from '../../utils/glosario.js';

const thStyle = {
  padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap',
  fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-fg-muted)', borderBottom: '1px solid var(--color-gray-200)',
};

export default function MatrizInteraccion({ criterios, tipos }) {
  const filas = useMemo(() => matrizInteraccion(criterios, tipos), [criterios, tipos]);

  return (
    <ChartCard
      title="Criterios por tipo de interacción"
      subtitle="Cada celda indica con qué mecanismo SAACA evalúa el criterio en ese tipo de interacción"
    >
      {filas.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)', color: 'var(--color-fg-subtle)' }}>
          No hay criterios activos con tipo de interacción asignado.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-subtle)' }}>
                <th style={{ ...thStyle, textAlign: 'left', fontFamily: 'var(--font-body)',
                  textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
                  Criterio
                </th>
                {tipos.map(t => <th key={t} style={thStyle}>{t}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map(f => (
                <tr key={f.criterion_id} style={{ borderTop: '1px solid var(--color-gray-100)' }}>
                  <td style={{ padding: '8px 12px', minWidth: 220 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                      fontWeight: 'var(--font-weight-bold)', color: 'var(--color-gray-400)', marginRight: 6 }}>
                      {f.criterion_id}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                      color: 'var(--color-black)' }}>
                      {f.criterion_name}
                    </span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, marginLeft: 6,
                      color: f.error_type === 'CRITICAL' ? 'var(--color-result-no-cumple)' : 'var(--color-fg-subtle)' }}>
                      {CRITICIDAD_LABEL[f.error_type] ?? ''}
                    </span>
                  </td>
                  {tipos.map(t => (
                    <td key={t} style={{ padding: '8px 12px', textAlign: 'center' }}>
                      {f.celdas[t] ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--radius-full)',
                          background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)',
                          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 'var(--font-weight-bold)',
                          whiteSpace: 'nowrap',
                        }}>
                          {f.celdas[t]}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-gray-300)' }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
