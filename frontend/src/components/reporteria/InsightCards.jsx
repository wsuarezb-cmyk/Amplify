/**
 * InsightCards — semana vs semana anterior (spec 5.5 + ronda v2).
 *
 * Dos columnas lado a lado: Alertas (rojas, empeora) | Avances (verdes, mejora).
 * Ordenadas por prioridad = |delta| × √base (cambios grandes con volumen
 * grande primero). Calculadas en frontend sobre TODO el payload (sin filtros),
 * ventanas móviles de 7 días ancladas en la fecha máxima del extracto.
 */

import { useMemo, useState } from 'react';
import {
  ArrowTrendingDownRegular, ArrowTrendingRegular, WarningRegular, RibbonRegular,
} from '@fluentui/react-icons';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { computeInsights, insightWindows } from '../../utils/aggregations.js';

const MAX_VISIBLE = 3;   // por columna

// dd/mm a partir de una fecha ISO 'yyyy-mm-dd'
const dm = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');

const TONO = {
  mala: {
    titulo: 'Alertas',
    border: 'var(--color-red-300)',
    accent: 'var(--color-danger)',
    text: 'var(--color-danger)',
    IconScore: ArrowTrendingDownRegular,
    IconCriterio: WarningRegular,
  },
  buena: {
    titulo: 'Avances',
    border: 'var(--color-green-300)',
    accent: 'var(--color-success)',
    text: 'var(--color-green-700)',
    IconScore: ArrowTrendingRegular,
    IconCriterio: RibbonRegular,
  },
};

function InsightCard({ ins }) {
  const t = TONO[ins.direccion];
  const Icon = ins.tipo === 'score' ? t.IconScore : t.IconCriterio;
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: `1px solid ${t.border}`,
      borderLeft: `4px solid ${t.accent}`,
      borderRadius: 'var(--radius-md)',
      padding: '10px 14px',
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <Icon style={{ width: 18, height: 18, color: t.accent, flexShrink: 0, marginTop: 2 }} />
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', lineHeight: 1.5, minWidth: 0 }}>
        <div style={{ fontWeight: 'var(--font-weight-bold)', color: 'var(--color-black)' }}>
          {ins.corte}
        </div>
        {ins.tipo === 'score' ? (
          <div style={{ color: 'var(--color-gray-700)' }}>
            El score ponderado {ins.delta < 0 ? 'cayó' : 'subió'}{' '}
            <b style={{ color: t.text }}>{Math.abs(ins.delta).toFixed(1)} pts</b>
            {' '}({ins.anterior.toFixed(1)}% → {ins.actual.toFixed(1)}%)
            {' '}· base {ins.volumen.toLocaleString('es-419')}
          </div>
        ) : (
          <div style={{ color: 'var(--color-gray-700)' }}>
            <b>{ins.criterio}</b>: el incumplimiento {ins.delta > 0 ? 'subió' : 'bajó'}{' '}
            <b style={{ color: t.text }}>{Math.abs(ins.delta).toFixed(1)} pp</b>
            {' '}({ins.anterior.toFixed(1)}% → {ins.actual.toFixed(1)}%)
            {' '}· base {ins.volumen.toLocaleString('es-419')}
          </div>
        )}
      </div>
    </div>
  );
}

function Columna({ direccion, items }) {
  const [showAll, setShowAll] = useState(false);
  const t = TONO[direccion];
  const visible = showAll ? items : items.slice(0, MAX_VISIBLE);

  return (
    <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-weight-bold)', letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase', color: t.text,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {t.titulo} ({items.length})
      </div>
      {items.length === 0 ? (
        <div style={{
          padding: '14px 16px', borderRadius: 'var(--radius-md)',
          border: '1px dashed var(--color-border)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)',
        }}>
          Sin {t.titulo.toLowerCase()} esta semana.
        </div>
      ) : (
        <>
          {visible.map((ins, i) => <InsightCard key={i} ins={ins} />)}
          {items.length > MAX_VISIBLE && (
            <button
              onClick={() => setShowAll(s => !s)}
              style={{
                alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                color: 'var(--color-primary-dark)', fontWeight: 'var(--font-weight-semibold)',
                padding: '2px 0',
              }}
            >
              {showAll ? 'Ver menos' : `Ver ${items.length - MAX_VISIBLE} más`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function InsightCards() {
  const { allRows, loading } = usePitchData();

  const insights = useMemo(() => allRows ? computeInsights(allRows) : [], [allRows]);
  const win = useMemo(() => allRows ? insightWindows(allRows) : null, [allRows]);

  if (loading || insights.length === 0) return null;

  const malas  = insights.filter(i => i.direccion === 'mala');
  const buenas = insights.filter(i => i.direccion === 'buena');

  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
      padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div>
        <div style={{
          fontFamily: 'var(--font-display)', fontWeight: 'var(--font-weight-bold)',
          fontSize: 'var(--text-base)', color: 'var(--color-black)',
        }}>
          Alertas y avances — últimos 7 días vs los 7 previos
        </div>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          color: 'var(--color-fg-subtle)', marginTop: 2,
        }}>
          {win && (
            <>Compara <b>{dm(win.w1Start)}–{dm(win.w1End)}</b> contra <b>{dm(win.w0Start)}–{dm(win.w0End)}</b>{' '}
            (ventana de 7 días anclada en la última fecha con datos, no en el día de hoy). </>
          )}
          Señal global de tendencia — <b>independiente de los filtros aplicados</b>.
          Priorizado por magnitud × volumen.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <Columna direccion="mala" items={malas} />
        <Columna direccion="buena" items={buenas} />
      </div>
    </div>
  );
}
