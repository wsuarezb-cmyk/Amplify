/**
 * CriteriaStackedBar — barra 100% apilada por criterio, clickeable.
 *
 * Segmentos: ÚNICAMENTE CUMPLE vs NO_CUMPLE — N/A y NO_EVALUADO quedan fuera
 * del denominador (misma base que pct_cumple / pct_no_cumple). PARCIAL no existe.
 *
 * Click en una barra → crossFilter('id_criterio', id): filtra todos los demás
 * gráficos del dashboard sin ningún request (spec 5.4).
 */

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
} from 'recharts';
import ChartCard from './ChartCard.jsx';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { byCriterion } from '../../utils/aggregations.js';

function CriteriaTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', padding: '10px 14px', minWidth: 180,
      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 6, lineHeight: 1.3 }}>
        {label}
      </div>
      <div style={{ color: 'var(--color-result-cumple)' }}>
        ✓ Cumple: {row.pctCumple?.toFixed(1)}% ({row.cumple?.toLocaleString('es-419')})
      </div>
      <div style={{ color: 'var(--color-result-no-cumple)' }}>
        ✗ No cumple: {row.pctNoCumple?.toFixed(1)}% ({row.noCumple?.toLocaleString('es-419')})
      </div>
      <div style={{ color: 'var(--color-fg-subtle)', marginTop: 4 }}>
        Base: {row.total?.toLocaleString('es-419')} evaluaciones · click para filtrar
      </div>
    </div>
  );
}

export default function CriteriaStackedBar() {
  const { criterionRows, loading, crossFilter, filters } = usePitchData();

  const data = useMemo(() => byCriterion(criterionRows).map(c => ({
    ...c,
    name: c.nombre_criterio ?? c.id_criterio,
  })), [criterionRows]);

  const chartHeight = Math.max(260, data.length * 44);

  return (
    <ChartCard
      title="Cumplimiento por criterio"
      subtitle="Base CUMPLE + NO_CUMPLE — peor primero · click en una barra filtra el dashboard"
      loading={loading}
      empty={data.length === 0}
    >
      {/* Leyenda */}
      <div style={{ padding: '8px 20px 0', display: 'flex', gap: 16 }}>
        {[
          { color: 'var(--color-result-cumple)', label: 'Cumple' },
          { color: 'var(--color-result-no-cumple)', label: 'No cumple' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-muted)' }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 16px 16px' }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 44, left: 8, bottom: 0 }}
            barSize={18}
          >
            <CartesianGrid horizontal={false} stroke="var(--color-gray-200)" />
            <XAxis
              type="number" domain={[0, 100]}
              tickFormatter={v => `${v}%`}
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-fg-subtle)' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              type="category" dataKey="name" width={190}
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-gray-800)' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<CriteriaTooltip />} cursor={{ fill: 'var(--color-gray-100)' }} />

            <Bar
              dataKey="pctCumple" stackId="a"
              fill="var(--color-result-cumple)"
              cursor="pointer"
              onClick={(entry) => crossFilter('id_criterio', entry.id_criterio)}
              opacity={filters.id_criterio.length > 0 ? 0.9 : 1}
            />
            <Bar
              dataKey="pctNoCumple" stackId="a"
              fill="var(--color-result-no-cumple)"
              radius={[0, 4, 4, 0]}
              cursor="pointer"
              onClick={(entry) => crossFilter('id_criterio', entry.id_criterio)}
            >
              <LabelList
                dataKey="pctNoCumple"
                position="right"
                formatter={v => (v > 0 ? `${v.toFixed(0)}%` : '')}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--color-result-no-cumple)' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
