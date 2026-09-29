/**
 * KpiRow — Vista Ejecutiva (spec 5.3 + ronda v2): calidad ponderada,
 * % defectuosas (X/Y), accuracy de errores críticos por categoría (ECU/ECN/ECC)
 * y acuerdo humano-SAACA de calibración (ventana 90d, independiente de filtros).
 * Grid responsivo vía clase .kpi-grid (index.css).
 */

import { useEffect, useMemo, useState } from 'react';
import KPICard from './KPICard.jsx';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { getCalibracionKpi } from '../../services/api.js';
import { computeKpis } from '../../utils/aggregations.js';
import { getScoreColor } from '../../utils/scores.js';

const CATEGORIAS = [
  { key: 'ECU', label: 'Error Crítico de Usuario' },
  { key: 'ECN', label: 'Error Crítico de Negocio' },
  { key: 'ECC', label: 'Error Crítico de Compliance' },
  { key: 'NON_CRITICAL', label: 'Error No Crítico' },
];

export default function KpiRow() {
  const { filteredRows, loading } = usePitchData();
  const [calibracion, setCalibracion] = useState(null);   // null = cargando; false = sin dato

  const kpis = useMemo(() => computeKpis(filteredRows), [filteredRows]);

  useEffect(() => {
    let cancelled = false;
    getCalibracionKpi()
      .then(d => { if (!cancelled) setCalibracion(d); })
      .catch(() => { if (!cancelled) setCalibracion(false); });
    return () => { cancelled = true; };
  }, []);

  const defectColor = kpis.pctDefectuosas == null
    ? 'var(--color-score-none)'
    : kpis.pctDefectuosas > 20 ? 'var(--color-score-low)'
    : kpis.pctDefectuosas > 10 ? 'var(--color-score-medium)'
    : 'var(--color-score-high)';

  return (
    <div className="kpi-grid">
      <KPICard
        label="Calidad ponderada"
        value={kpis.scorePonderado != null ? `${kpis.scorePonderado.toFixed(1)}%` : '—'}
        sublabel={`${kpis.totalInteracciones.toLocaleString('es-419')} interacciones`}
        color={getScoreColor(kpis.scorePonderado)}
        loading={loading}
      />
      <KPICard
        label="% Defectuosas"
        value={kpis.pctDefectuosas != null ? `${kpis.pctDefectuosas.toFixed(1)}%` : '—'}
        sublabel={kpis.totalInteracciones > 0
          ? `${kpis.nDefectuosas.toLocaleString('es-419')} / ${kpis.totalInteracciones.toLocaleString('es-419')} defectuosas`
          : undefined}
        color={defectColor}
        loading={loading}
      />
      {CATEGORIAS.map(({ key, label }) => {
        const data = kpis.accuracyPorCategoria[key];
        const pct = data?.pctAccuracy;
        return (
          <KPICard
            key={key}
            label={label}
            value={pct != null ? `${pct.toFixed(1)}%` : '—'}
            sublabel={data
              ? `${(data.total - data.conError).toLocaleString('es-419')} / ${data.total.toLocaleString('es-419')} sin error`
              : undefined}
            color={getScoreColor(pct)}
            loading={loading}
          />
        );
      })}

      {/* Acuerdo humano-SAACA — meta-KPI de calibración, no responde a los filtros */}
      <KPICard
        label={`Acuerdo con SAACA (${calibracion?.ventana_dias ?? 90}d)`}
        value={calibracion && calibracion.pct_acuerdo != null
          ? `${calibracion.pct_acuerdo.toFixed(1)}%`
          : '—'}
        sublabel={calibracion && calibracion.total_calibrados > 0
          ? `${calibracion.coincidencias.toLocaleString('es-419')} / ${calibracion.total_calibrados.toLocaleString('es-419')} criterios calibrados`
          : calibracion === null ? undefined : 'Sin calibraciones en la ventana'}
        color={calibracion ? getScoreColor(calibracion.pct_acuerdo) : 'var(--color-score-none)'}
        loading={loading || calibracion === null}
      />
    </div>
  );
}
