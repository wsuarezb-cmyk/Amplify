/**
 * ComparativaConfigurable — compara interacciones y score por la dimensión que
 * elija el usuario (país, tipificación N1/N2/N3, equipo, manager, propietario,
 * tipo, mecanismo). Reemplaza "Comparativa entre países" + "Volumen por mecanismo".
 *
 * Barras horizontales: largo = interacciones, color y número = score.
 * Click en una barra → filtra la reportería por ese valor (se marca en chips).
 */

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import ChartCard from './ChartCard.jsx';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { byDimension } from '../../utils/aggregations.js';
import { getScoreColor } from '../../utils/scores.js';

const DIMENSIONS = [
  { key: 'pais',                 label: 'País',                labelKey: null },
  { key: 'departamento',         label: 'Equipo',              labelKey: null },
  { key: 'email_manager',        label: 'Manager',             labelKey: 'nombre_manager' },
  { key: 'email_agente',         label: 'Propietario',         labelKey: 'nombre_agente' },
  { key: 'tipificacion_nivel_1', label: 'Tipificación N1',     labelKey: null },
  { key: 'tipificacion_nivel_2', label: 'Tipificación N2',     labelKey: null },
  { key: 'nombre_tipificacion',  label: 'Tipificación N3',     labelKey: null },
  { key: 'tipo_interaccion',     label: 'Tipo de interacción', labelKey: null },
  { key: 'mecanismo_evaluacion', label: 'Mecanismo',           labelKey: null },
];

const ROW_H = 30;
const MAX_BARS = 25;

function CompTooltip({ active, payload }) {
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
      <div>% defectuosas: {row.pctDefectuosas != null ? `${row.pctDefectuosas.toFixed(1)}%` : '—'}</div>
    </div>
  );
}

export default function ComparativaConfigurable() {
  const { filteredRows, loading, crossFilter } = usePitchData();
  const [dimKey, setDimKey] = useState('pais');

  const dim = DIMENSIONS.find(d => d.key === dimKey) ?? DIMENSIONS[0];

  const data = useMemo(() =>
    byDimension(filteredRows, dim.key, dim.labelKey)
      .sort((a, b) => b.interacciones - a.interacciones)
      .slice(0, MAX_BARS),
  [filteredRows, dim.key, dim.labelKey]);

  const chartHeight = Math.max(160, data.length * ROW_H);

  return (
    <ChartCard
      title="Comparativa"
      subtitle="Barras = interacciones · color y número = score · click filtra la reportería"
      loading={loading}
      empty={data.length === 0}
      actions={
        <select
          value={dimKey}
          onChange={e => setDimKey(e.target.value)}
          style={{
            height: 30, padding: '0 8px', cursor: 'pointer',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--color-surface)', color: 'var(--color-fg)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          }}
        >
          {DIMENSIONS.map(d => (
            <option key={d.key} value={d.key}>Comparar por: {d.label}</option>
          ))}
        </select>
      }
    >
      <div style={{ padding: '8px 16px 16px', maxHeight: 460, overflowY: 'auto' }}>
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 8, bottom: 0 }} barSize={16}>
            <CartesianGrid horizontal={false} stroke="var(--color-gray-200)" />
            <XAxis
              type="number"
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-fg-subtle)' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              type="category" dataKey="label" width={190}
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-gray-800)' }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<CompTooltip />} cursor={{ fill: 'var(--color-gray-100)' }} />
            <Bar
              dataKey="interacciones"
              cursor="pointer"
              onClick={(entry) => crossFilter(dim.key, entry.key)}
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
