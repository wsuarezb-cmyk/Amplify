/**
 * TipificacionDrill — desglose de tipificación por nivel, integrado al filtro global.
 *
 * - Selector de nivel N1/N2/N3: muestra TODAS las tipificaciones de ese nivel
 *   (top por volumen), sin navegar en orden estricto.
 * - Barras: largo = interacciones, color = semáforo de score, y el SCORE visible
 *   al final de cada barra (es reportería de calidad).
 * - Click en una barra → filtra la reportería por esa tipificación (se marca en
 *   chips) y baja al siguiente nivel (efecto drill).
 * - Con muchas categorías, scroll vertical.
 */

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import ChartCard from './ChartCard.jsx';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { byDimension } from '../../utils/aggregations.js';
import { getScoreColor } from '../../utils/scores.js';

const LEVELS = ['tipificacion_nivel_1', 'tipificacion_nivel_2', 'nombre_tipificacion'];
const LEVEL_LABELS = ['Nivel 1', 'Nivel 2', 'Nivel 3'];
const MIN_ROW_H = 30;    // alto mínimo por barra (con muchas → scroll)
const FILL_H = 360;      // alto objetivo a llenar cuando hay pocas barras
const MAX_BARS = 40;

function DrillTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', padding: '10px 14px',
      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 4 }}>{row.label}</div>
      <div>Score: {row.score != null ? `${row.score.toFixed(1)}%` : '—'}</div>
      <div>Interacciones: {row.interacciones?.toLocaleString('es-419')}</div>
    </div>
  );
}

export default function TipificacionDrill() {
  const { filteredRows, loading, crossFilter } = usePitchData();
  const [level, setLevel] = useState(0);

  const data = useMemo(() =>
    byDimension(filteredRows, LEVELS[level])
      .sort((a, b) => b.interacciones - a.interacciones)
      .slice(0, MAX_BARS),
  [filteredRows, level]);

  function handleClick(entry) {
    crossFilter(LEVELS[level], entry.key);
    if (level < LEVELS.length - 1) setLevel(level + 1);
  }

  // Con pocas barras se reparte FILL_H (barras gruesas que llenan el alto);
  // con muchas, cada barra usa MIN_ROW_H y el contenedor scrollea.
  const chartHeight = Math.max(FILL_H, data.length * MIN_ROW_H);
  const band = data.length > 0 ? chartHeight / data.length : chartHeight;
  const barSize = Math.min(48, Math.round(band * 0.55));

  return (
    <ChartCard
      title="Tipificación por nivel"
      subtitle="Barras = interacciones · color y número = score · click filtra la reportería y baja de nivel"
      loading={loading}
      empty={data.length === 0}
      actions={
        <div style={{
          display: 'inline-flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
          border: '1px solid var(--color-border)',
        }}>
          {LEVEL_LABELS.map((lbl, i) => {
            const active = level === i;
            return (
              <button
                key={i}
                onClick={() => setLevel(i)}
                style={{
                  padding: '4px 12px', border: 'none', cursor: 'pointer',
                  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: active ? 'var(--color-fg-on-dark)' : 'var(--color-fg-muted)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                  fontWeight: active ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
                }}
              >
                {`N${i + 1}`}
              </button>
            );
          })}
        </div>
      }
    >
      <div style={{ padding: '8px 16px 16px', maxHeight: 420, overflowY: 'auto' }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }} barSize={barSize}>
            <CartesianGrid horizontal={false} stroke="var(--color-gray-200)" />
            <XAxis
              type="number"
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-fg-subtle)' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              type="category" dataKey="label" width={180}
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-gray-800)' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<DrillTooltip />} cursor={{ fill: 'var(--color-gray-100)' }} />
            <Bar
              dataKey="interacciones"
              cursor="pointer"
              onClick={handleClick}
              radius={[0, 4, 4, 0]}
            >
              {data.map(entry => (
                <Cell key={entry.key} fill={getScoreColor(entry.score)} fillOpacity={0.8} />
              ))}
              <LabelList
                dataKey="score"
                position="right"
                formatter={v => (v != null ? `${v.toFixed(0)}%` : '')}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fill: 'var(--color-gray-700)' }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
