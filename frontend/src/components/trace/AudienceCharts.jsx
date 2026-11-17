/**
 * Reportería visual de Trace > Generación de Audiencias.
 * Todo se calcula en memoria con el mismo funnel que la tabla Etapa / regla.
 */

import { useMemo, useState } from 'react';
import {
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import ChartCard from '../reporteria/ChartCard.jsx';
import {
  COMPOSITION_DIMENSIONS, buildAudienceBreakdown, buildEligibilityBreakdown,
  buildImpactFunnel, categoryLabel,
} from '../../utils/traceAudience.js';

const fmt = value => Number(value ?? 0).toLocaleString('es-419');
const pct = value => `${Number(value ?? 0).toFixed(1)}%`;
const CHART_COLORS = [
  'var(--trace-chart-amber)', 'var(--trace-chart-olive)', 'var(--trace-chart-dark)',
  'var(--trace-chart-yellow)', 'var(--trace-chart-cream)',
];

function ChartTooltip({ active, payload, children }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', padding: '10px 14px', minWidth: 190,
      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', boxShadow: 'var(--shadow-md)',
      color: 'var(--color-gray-800)',
    }}>
      {children(payload[0].payload)}
    </div>
  );
}

function EmptyChart({ children }) {
  return (
    <div style={{
      padding: 40, textAlign: 'center', fontFamily: 'var(--font-body)',
      fontSize: 'var(--text-sm)', color: 'var(--color-fg-subtle)',
    }}>
      {children}
    </div>
  );
}

function categoryColor(index) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

function DonutDistribution({ data }) {
  const radius = 48;
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + item.sellers, 0);
  let offset = 0;

  return (
    <div className="trace-donut-layout">
      <svg className="trace-donut" viewBox="0 0 140 140" role="img"
        aria-label={data.map(item => `${item.name}: ${fmt(item.sellers)}, ${pct(item.pctSellers)}`).join('; ')}>
        <circle className="trace-donut-track" cx="70" cy="70" r={radius} />
        {data.map((item, index) => {
          const length = circumference * item.pctSellers / 100;
          const dashOffset = -offset;
          offset += length;
          return <circle key={item.value} className="trace-donut-segment" cx="70" cy="70" r={radius}
            stroke={categoryColor(index)} strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={dashOffset} transform="rotate(-90 70 70)"
            aria-label={`${item.name}: ${fmt(item.sellers)} (${pct(item.pctSellers)})`} />;
        })}
        <text className="trace-donut-percent" x="70" y="67" textAnchor="middle">100%</text>
        <text className="trace-donut-total" x="70" y="86" textAnchor="middle">{fmt(total)}</text>
      </svg>
      <ul className="trace-chart-legend">
        {data.map((item, index) => <li key={item.value} title={`${item.name}: ${fmt(item.sellers)} (${pct(item.pctSellers)})`}>
          <span className="trace-legend-dot" style={{ background: categoryColor(index) }} />
          <span className="trace-legend-name">{item.name}</span>
          <span className="trace-legend-value">{pct(item.pctSellers)} ({fmt(item.sellers)})</span>
        </li>)}
      </ul>
    </div>
  );
}

function StackedDistribution({ data }) {
  return (
    <div className="trace-stacked-distribution">
      <div className="trace-stacked-track" role="img"
        aria-label={data.map(item => `${item.name}: ${fmt(item.sellers)}, ${pct(item.pctSellers)}`).join('; ')}>
        {data.map((item, index) => <span key={item.value} title={`${item.name}: ${fmt(item.sellers)} (${pct(item.pctSellers)})`}
          style={{ width: `${item.pctSellers}%`, background: categoryColor(index) }} />)}
      </div>
      <ul className="trace-chart-legend">
        {data.map((item, index) => <li key={item.value}>
          <span className="trace-legend-dot" style={{ background: categoryColor(index) }} />
          <span className="trace-legend-name">{item.name}</span>
          <span className="trace-legend-value">{pct(item.pctSellers)} ({fmt(item.sellers)})</span>
        </li>)}
      </ul>
    </div>
  );
}

function ContactTypeDistribution({ data }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? data : data.slice(0, 5);
  const maximum = data[0]?.sellers ?? 0;

  return (
    <div className="trace-contact-bars">
      {visible.map((item, index) => <div className="trace-contact-bar-row" key={item.value}>
        <span className="trace-contact-bar-name">{item.name}</span>
        <div className="trace-contact-bar-track" title={`${fmt(item.sellers)} sellers · ${pct(item.pctSellers)}`}>
          <span style={{ width: `${maximum ? (item.sellers / maximum) * 100 : 0}%`, background: categoryColor(index) }} />
        </div>
        <span className="trace-contact-bar-value">{fmt(item.sellers)}</span>
      </div>)}
      {data.length > 5 && <button className="trace-more-categories" type="button" aria-expanded={showAll} onClick={() => setShowAll(value => !value)}>
        {showAll ? 'Ver menos' : 'Ver más'}
      </button>}
    </div>
  );
}

function CompositionChart({ rows, options, dimension, title }) {
  const data = useMemo(() => buildAudienceBreakdown(rows, dimension).map(item => ({
    ...item, name: categoryLabel(options, dimension, item.value),
  })), [rows, dimension, options]);
  const subtitle = dimension === 'contact_type'
    ? 'Sellers únicos por tipo de contacto; un seller puede aparecer en más de una categoría'
    : 'Sellers únicos elegibles · participación sobre el total filtrado';

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {data.length === 0 ? <EmptyChart>Sin sellers elegibles con los filtros actuales.</EmptyChart> : (
        <div className={`trace-composition-chart trace-composition-chart--${dimension}`}>
          {dimension === 'country' || dimension === 'geography'
            ? <DonutDistribution data={data} />
            : dimension === 'seller_segment' || dimension === 'seller_status'
              ? <StackedDistribution data={data} />
              : <ContactTypeDistribution data={data} />}
        </div>
      )}
    </ChartCard>
  );
}

function ImpactChart({ funnel, metrics, inputUnique }) {
  const data = useMemo(() => buildImpactFunnel(inputUnique, metrics, funnel.stages), [inputUnique, metrics, funnel]);
  const colors = ['var(--trace-chart-olive)', 'var(--trace-chart-amber)', 'var(--trace-chart-dark)', 'var(--trace-chart-yellow)'];

  return (
    <ChartCard title="Impacto de filtros y exclusiones" subtitle="Reducción secuencial desde los Seller IDs únicos ingresados">
      {!data.length ? <EmptyChart>Ingresa IDs únicos válidos para ver el embudo.</EmptyChart> : (
        <div className="trace-impact-funnel" role="list" aria-label="Etapas de reducción de la audiencia">
          {data.length === 1 && <p className="trace-funnel-note">No hubo reducciones; todos los IDs quedaron elegibles.</p>}
          {data.map((stage, index) => <div className="trace-impact-step" role="listitem" key={stage.key}>
            {index > 0 && <span className="trace-impact-arrow" aria-hidden="true">↓</span>}
            <div className="trace-impact-stage-heading">
              <span className="trace-impact-stage-index">{String(index + 1).padStart(2, '0')}</span>
              <strong>{stage.name}</strong>
              <span>{fmt(stage.remaining)} sellers</span>
            </div>
            <div className="trace-impact-stage-track" role="img" aria-label={`${stage.name}: ${fmt(stage.remaining)} sellers, ${pct(stage.remainingPercent)} del universo inicial`}>
              <span style={{
                width: `${stage.remaining ? Math.max(stage.remainingPercent, 1) : 0}%`,
                background: colors[index % colors.length],
              }} />
            </div>
            <div className="trace-impact-stage-meta">
              <span>{pct(stage.remainingPercent)} del universo inicial</span>
              {stage.reduction > 0 && <span>−{fmt(stage.reduction)} desde la etapa anterior ({pct(stage.reductionPercent)})</span>}
            </div>
          </div>)}
        </div>
      )}
    </ChartCard>
  );
}

function EligibilityChart({ metrics, notFound, inputUnique }) {
  const breakdown = buildEligibilityBreakdown(metrics, notFound, inputUnique);
  const radius = 96;
  const arcLength = Math.PI * radius;
  const progress = (breakdown.pctEligible / 100) * arcLength;

  return (
    <ChartCard title="Elegibles del universo ingresado" subtitle={`${fmt(breakdown.total)} IDs únicos válidos = 100%`}>
      {!breakdown.total ? <EmptyChart>Sin IDs únicos válidos para calcular la proporción.</EmptyChart> : (
        <div className="trace-eligibility-gauge">
          <svg className="trace-gauge" viewBox="0 0 240 164" role="img"
            aria-label={`${fmt(breakdown.eligible)} de ${fmt(breakdown.total)} sellers elegibles, ${pct(breakdown.pctEligible)}`}>
            <path className="trace-gauge-track" d="M 24 128 A 96 96 0 0 1 216 128" />
            <path className="trace-gauge-value" d="M 24 128 A 96 96 0 0 1 216 128"
              style={{ strokeDasharray: `${progress} ${arcLength}` }} />
            <text className="trace-gauge-number" x="120" y="83" textAnchor="middle">{fmt(breakdown.eligible)}</text>
            <text className="trace-gauge-percent" x="120" y="107" textAnchor="middle">{pct(breakdown.pctEligible)}</text>
            <text className="trace-gauge-end" x="20" y="151" textAnchor="start">0</text>
            <text className="trace-gauge-end" x="220" y="151" textAnchor="end">100%</text>
          </svg>
          <strong className="trace-gauge-caption">Sellers elegibles</strong>
          <p className="trace-gauge-total">De <strong>{fmt(breakdown.total)}</strong> IDs únicos válidos ingresados</p>
          <div className="trace-gauge-breakdown">
            <span><i className="trace-gauge-key trace-gauge-key--missing" />No encontrados <strong>{fmt(breakdown.notFound)}</strong></span>
            <span><i className="trace-gauge-key trace-gauge-key--excluded" />Excluidos por filtros <strong>{fmt(breakdown.excludedByFilters)}</strong></span>
            <span><i className="trace-gauge-key trace-gauge-key--contact" />Sin contacto (informativo) <strong>{fmt(breakdown.sellersWithoutContact)}</strong></span>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

export default function AudienceCharts({ ready, rows, options }) {
  return (
    <section className="trace-composition">
      <div className="trace-section-heading trace-composition-heading">
        <div><h2>Composición de la audiencia</h2></div>
        <span className="trace-muted">Los cinco gráficos responden a los filtros seleccionados</span>
      </div>
      {!ready ? <div className="trace-chart-empty">Realiza una consulta para visualizar la composición de la audiencia.</div> : <>
        {rows.length === 0 && <div className="trace-chart-empty trace-chart-empty--inline" role="status">Ningún seller cumple la combinación de filtros actual.</div>}
        <div className="trace-composition-grid">
          {COMPOSITION_DIMENSIONS.map(([dimension, label]) => (
            <div className={`trace-composition-item trace-composition-item--${dimension}`} key={dimension}>
              <CompositionChart rows={rows} options={options} dimension={dimension} title={label} />
            </div>
          ))}
        </div>
      </>}
    </section>
  );
}

export function ReconciliationCharts({ ready, funnel, metrics, notFound, inputUnique }) {
  if (!ready) return null;
  return (
    <div className="trace-reconciliation-charts">
      <div className="chart-grid-2">
        <ImpactChart funnel={funnel} metrics={metrics} inputUnique={inputUnique} />
        <EligibilityChart metrics={metrics} notFound={notFound} inputUnique={inputUnique} />
      </div>
    </div>
  );
}
