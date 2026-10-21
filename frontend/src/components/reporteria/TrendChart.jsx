/**
 * TrendChart — evolución de calidad con granularidad Día/Mes/Año (default Día)
 * y click-filtro estilo Data Studio: click en una barra filtra la reportería a
 * ese período (barra resaltada, resto atenuado); click de nuevo deselecciona.
 *
 * Nota de agregación: al filtrar por fecha, el resto del dashboard se recorta
 * a la ventana, pero esta gráfica sigue mostrando TODA la serie (usa las filas
 * sin el filtro de fecha propio) y RESALTA la ventana filtrada — barras dentro
 * en color, fuera atenuadas, y una banda sombreada — para que se vea qué está
 * filtrado y la selección se pueda quitar visualmente, igual que en Data Studio.
 */

import { useMemo, useState } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea, Cell,
} from 'recharts';
import ChartCard from './ChartCard.jsx';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { byPeriod, periodRange } from '../../utils/aggregations.js';
import { SCORE_THRESHOLDS } from '../../utils/scores.js';

const GRANULARIDADES = [
  { id: 'dia',  label: 'Día' },
  { id: 'mes',  label: 'Mes' },
  { id: 'anio', label: 'Año' },
];

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload ?? {};
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', padding: '10px 14px',
      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
      boxShadow: 'var(--shadow-md)',
    }}>
      <div style={{ fontWeight: 'var(--font-weight-bold)', marginBottom: 4 }}>{label}</div>
      <div>Score: {row.score != null ? `${row.score.toFixed(1)}%` : '—'}</div>
      <div>Interacciones: {row.interacciones?.toLocaleString('es-419')}</div>
      <div>% defectuosas: {row.pctDefectuosas != null ? `${row.pctDefectuosas.toFixed(1)}%` : '—'}</div>
      <div style={{ color: 'var(--color-fg-subtle)', marginTop: 3 }}>Click para filtrar / quitar</div>
    </div>
  );
}

export default function TrendChart() {
  const { allRows, filters, setFilter, loading } = usePitchData();
  const [gran, setGran] = useState('dia');

  // Serie sobre los filtros NO temporales: así la selección de período se ve
  // en contexto y se puede desseleccionar (la propia gráfica no se recorta).
  const rowsSinFecha = useMemo(() => {
    if (!allRows) return [];
    const f = filters;
    const casosSet  = f.numero_caso.length    > 0 ? new Set(f.numero_caso)    : null;
    const interSet  = f.interaction_id.length > 0 ? new Set(f.interaction_id) : null;
    const sellerSet = f.seller_code.length    > 0 ? new Set(f.seller_code)    : null;
    return allRows.filter(r =>
      (f.pais.length === 0                 || f.pais.includes(r.pais)) &&
      (f.departamento.length === 0         || f.departamento.includes(r.departamento)) &&
      (f.tipo_interaccion.length === 0     || f.tipo_interaccion.includes(r.tipo_interaccion)) &&
      (f.tipificacion_nivel_1.length === 0 || f.tipificacion_nivel_1.includes(r.tipificacion_nivel_1)) &&
      (f.tipificacion_nivel_2.length === 0 || f.tipificacion_nivel_2.includes(r.tipificacion_nivel_2)) &&
      (f.nombre_tipificacion.length === 0  || f.nombre_tipificacion.includes(r.nombre_tipificacion)) &&
      (f.email_agente.length === 0         || f.email_agente.includes(r.email_agente)) &&
      (f.email_manager.length === 0        || f.email_manager.includes(r.email_manager)) &&
      (!casosSet  || casosSet.has(r.numero_caso)) &&
      (!interSet  || interSet.has(r.interaction_id)) &&
      (!sellerSet || sellerSet.has(r.seller_code))
    );
  }, [allRows, filters]);

  const data = useMemo(() => byPeriod(rowsSinFecha, gran), [rowsSinFecha, gran]);

  const hasDateFilter = !!(filters.fecha_start || filters.fecha_end);

  // ¿Este período (barra) cae dentro de la ventana de fechas filtrada?
  // Overlap: sirve para rangos arbitrarios (no solo cuando coincide una barra).
  const periodInRange = (fecha) => {
    const [ini, fin] = periodRange(fecha);
    if (filters.fecha_start && fin < filters.fecha_start) return false;
    if (filters.fecha_end && ini > filters.fecha_end) return false;
    return true;
  };

  // Selección EXACTA de una sola barra (para el toggle al volver a hacer clic).
  const exactSelected = useMemo(() => {
    if (!filters.fecha_start || !filters.fecha_end) return null;
    const match = data.find(d => {
      const [ini, fin] = periodRange(d.fecha);
      return ini === filters.fecha_start && fin === filters.fecha_end;
    });
    return match?.fecha ?? null;
  }, [data, filters.fecha_start, filters.fecha_end]);

  // Banda sombreada que marca la ventana filtrada (primer→último período dentro).
  const rangeBand = (() => {
    if (!hasDateFilter) return null;
    const keys = data.filter(d => periodInRange(d.fecha)).map(d => d.fecha);
    return keys.length ? { x1: keys[0], x2: keys[keys.length - 1] } : null;
  })();

  function handleBarClick(entry) {
    const [ini, fin] = periodRange(entry.fecha);
    if (exactSelected === entry.fecha) {
      // Toggle off: quitar el filtro temporal
      setFilter('fecha_start', '');
      setFilter('fecha_end', '');
    } else {
      setFilter('fecha_start', ini);
      setFilter('fecha_end', fin);
    }
  }

  return (
    <ChartCard
      title="Evolución de calidad"
      subtitle={`Score ponderado y volumen por ${GRANULARIDADES.find(g => g.id === gran).label.toLowerCase()} — banda objetivo ≥ ${SCORE_THRESHOLDS.HIGH.min}% · click en una barra filtra el período · la ventana de fechas filtrada se resalta`}
      loading={loading}
      empty={data.length === 0}
      actions={
        <div style={{
          display: 'inline-flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
          border: '1px solid var(--color-border)',
        }}>
          {GRANULARIDADES.map(g => {
            const active = gran === g.id;
            return (
              <button
                key={g.id}
                onClick={() => setGran(g.id)}
                style={{
                  padding: '5px 14px', border: 'none', cursor: 'pointer',
                  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: active ? 'var(--color-fg-on-primary)' : 'var(--color-fg-muted)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                  fontWeight: active ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
                  transition: 'var(--transition-fast)',
                }}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      }
    >
      <div style={{ padding: '12px 16px 16px' }}>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-gray-200)" />
            <XAxis
              dataKey="fecha"
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-fg-subtle)' }}
              tickFormatter={f => gran === 'dia' ? f?.slice(5) : f}
              axisLine={false} tickLine={false}
            />
            <YAxis
              yAxisId="score" domain={[0, 100]}
              tickFormatter={v => `${v}%`}
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-fg-subtle)' }}
              axisLine={false} tickLine={false} width={42}
            />
            <YAxis
              yAxisId="vol" orientation="right"
              tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-fg-subtle)' }}
              axisLine={false} tickLine={false} width={42}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--color-gray-100)' }} />

            {/* Banda de umbral: zona objetivo */}
            <ReferenceArea
              yAxisId="score" y1={SCORE_THRESHOLDS.HIGH.min} y2={100}
              fill="var(--color-score-high-bg)" fillOpacity={0.35}
            />

            {/* Ventana de fechas filtrada — resalta el rango activo */}
            {rangeBand && (
              <ReferenceArea
                yAxisId="score" x1={rangeBand.x1} x2={rangeBand.x2}
                fill="var(--color-primary)" fillOpacity={0.08}
                stroke="var(--color-primary)" strokeOpacity={0.25}
              />
            )}
            <ReferenceLine
              yAxisId="score" y={SCORE_THRESHOLDS.HIGH.min}
              stroke="var(--color-score-high)" strokeDasharray="4 4"
            />

            <Bar
              yAxisId="vol" dataKey="interacciones"
              barSize={gran === 'dia' ? 14 : 34} radius={[3, 3, 0, 0]}
              cursor="pointer"
              onClick={handleBarClick}
            >
              {data.map(entry => {
                const inRange = periodInRange(entry.fecha);
                const highlight = hasDateFilter && inRange;   // dentro de la ventana
                const dimmed = hasDateFilter && !inRange;      // fuera de la ventana
                return (
                  <Cell
                    key={entry.fecha}
                    fill={highlight ? 'var(--color-primary)' : 'var(--color-primary-light)'}
                    stroke={highlight ? 'var(--color-primary-dark)' : 'var(--color-yellow-300)'}
                    fillOpacity={dimmed ? 0.3 : 1}
                  />
                );
              })}
            </Bar>
            <Line
              yAxisId="score" type="monotone" dataKey="score"
              stroke="var(--color-primary-dark)" strokeWidth={2.2}
              dot={gran !== 'dia'} activeDot={{ r: 4 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
