/**
 * CalibracionDashboard — mini dashboard de seguimiento (Improvement 1).
 * AUDITOR ve solo su propio avance; LIDER_QUALITY+ ve además el desglose
 * por auditor (mismo aislamiento de datos que el resto del módulo).
 */

import { useCallback, useEffect, useState } from 'react';
import KPICard from '../reporteria/KPICard.jsx';
import ChartCard from '../reporteria/ChartCard.jsx';
import { getCalibracionDashboard } from '../../services/api.js';

function pct(value) {
  return value == null ? '—' : `${value.toFixed(1)}%`;
}

export default function CalibracionDashboard({ esLider }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getCalibracionDashboard());
    } catch (e) {
      setError(e.message ?? 'Error al cargar el dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const thStyle = {
    padding: '10px 14px', textAlign: 'left',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-weight-bold)', color: 'var(--color-fg-muted)',
    textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
    borderBottom: '1px solid var(--color-gray-200)', whiteSpace: 'nowrap',
  };
  const tdStyle = {
    padding: '10px 14px', verticalAlign: 'middle',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg)',
    borderBottom: '1px solid var(--color-gray-100)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && (
        <div style={{
          padding: '8px 12px', background: 'var(--color-danger-light)',
          border: '1px solid var(--color-red-300)', borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-red-900)',
        }}>
          {error}
        </div>
      )}

      <div className="kpi-grid">
        <KPICard label="Asignados" value={data?.total_asignados ?? '—'} loading={loading}
          sublabel={data ? `${data.fecha_start} a ${data.fecha_end}` : undefined} />
        <KPICard label="Completados" value={data?.total_completados ?? '—'} loading={loading} />
        <KPICard label="Pendientes" value={data?.total_pendientes ?? '—'} loading={loading} />
        <KPICard label="% Avance" value={loading ? '—' : pct(data?.pct_avance)} loading={loading} />
        <KPICard label="% Acuerdo con SAACA" value={loading ? '—' : pct(data?.pct_acuerdo)} loading={loading} />
      </div>

      {esLider && (
        <ChartCard
          title="Progreso por auditor"
          subtitle="Ventana seleccionada — mismos datos que Batches generados, agregados por persona"
          loading={loading}
          empty={!loading && (data?.por_auditor ?? []).length === 0}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-subtle)' }}>
                  {['Auditor', 'Asignados', 'Completados', 'Pendientes', 'Descartados', '% Avance', '% Acuerdo'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.por_auditor ?? []).map(a => (
                  <tr key={a.auditor_email}>
                    <td style={tdStyle}>{a.auditor_email}</td>
                    <td style={tdStyle}>{a.asignados}</td>
                    <td style={tdStyle}>{a.completados}</td>
                    <td style={tdStyle}>{a.pendientes}</td>
                    <td style={tdStyle}>{a.descartados}</td>
                    <td style={tdStyle}>{pct(a.pct_avance)}</td>
                    <td style={tdStyle}>{pct(a.pct_acuerdo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
