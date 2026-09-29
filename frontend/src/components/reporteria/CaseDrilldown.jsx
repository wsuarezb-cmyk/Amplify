/**
 * CaseDrilldown — tabla de interacciones filtradas con drilldown en vivo.
 *
 * Expandir una fila llama GET /api/pitch/dashboard/interaction/{id}
 * (pitch_eval_enriched, CON observacion_saaca) — la única consulta a BQ
 * en vivo de Reportería. Caché por interacción para no repetir requests.
 */

import { Fragment, useMemo, useState } from 'react';
import ChartCard from './ChartCard.jsx';
import Paginador from './Paginador.jsx';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { getPitchInteractionDetail } from '../../services/api.js';
import { getScoreColor, getScoreBg } from '../../utils/scores.js';

const PAGE_SIZE = 20;

const RESULT_BADGE = {
  CUMPLE:       { bg: 'var(--color-result-cumple-bg)',      color: 'var(--color-result-cumple)',      label: 'CUMPLE' },
  NO_CUMPLE:    { bg: 'var(--color-result-no-cumple-bg)',   color: 'var(--color-result-no-cumple)',   label: 'NO CUMPLE' },
  'N/A':        { bg: 'var(--color-result-na-bg)',          color: 'var(--color-result-na)',          label: 'N/A' },
  NO_EVALUADO:  { bg: 'var(--color-result-no-evaluado-bg)', color: 'var(--color-result-no-evaluado)', label: 'NO EVALUADO' },
};

function ResultBadge({ resultado }) {
  const b = RESULT_BADGE[resultado] ?? { bg: 'var(--color-gray-100)', color: 'var(--color-fg-muted)', label: resultado ?? '—' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 'var(--radius-full)',
      background: b.bg, color: b.color,
      fontWeight: 'var(--font-weight-bold)', fontSize: 10, fontFamily: 'var(--font-body)',
      whiteSpace: 'nowrap',
    }}>
      {b.label}
    </span>
  );
}

function DetailPanel({ interactionId, cache, setCache }) {
  const detail = cache[interactionId];

  if (detail === undefined) {
    getPitchInteractionDetail(interactionId)
      .then(d => setCache(prev => ({ ...prev, [interactionId]: d })))
      .catch(() => setCache(prev => ({ ...prev, [interactionId]: null })));
    return (
      <div style={{ padding: '12px 16px', color: 'var(--color-fg-subtle)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
        Cargando detalle…
      </div>
    );
  }
  if (detail === null) {
    return (
      <div style={{ padding: '12px 16px', color: 'var(--color-red-700)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
        No se pudo cargar el detalle de la interacción.
      </div>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse',
      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
      <thead>
        <tr style={{ background: 'var(--color-gray-100)' }}>
          {['Criterio', 'Resultado', 'Mecanismo', 'Peso', 'Peso relativo', 'Observación SAACA'].map(h => (
            <th key={h} style={{
              padding: '7px 12px', textAlign: 'left',
              fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-muted)',
              fontSize: 10, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
            }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {detail.criterios.map(c => (
          <tr key={c.id_criterio} style={{ borderTop: '1px solid var(--color-gray-100)' }}>
            <td style={{ padding: '7px 12px', color: 'var(--color-black)', minWidth: 160 }}>
              {c.nombre_criterio ?? c.id_criterio}
            </td>
            <td style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
              <ResultBadge resultado={c.resultado} />
            </td>
            <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--color-fg-muted)', whiteSpace: 'nowrap' }}>
              {c.mecanismo_evaluacion ?? '—'}
            </td>
            <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 10,
              textAlign: 'right', color: 'var(--color-gray-800)' }}>
              {c.peso_aplicado != null ? c.peso_aplicado : '—'}
            </td>
            <td style={{ padding: '7px 12px', fontFamily: 'var(--font-mono)', fontSize: 10,
              textAlign: 'right', color: 'var(--color-gray-800)' }}>
              {c.peso_relativo_criterio != null ? `${(c.peso_relativo_criterio * 100).toFixed(1)}%` : '—'}
            </td>
            <td style={{ padding: '7px 12px', color: 'var(--color-gray-700)', lineHeight: 1.45 }}>
              {c.observacion_saaca
                ? c.observacion_saaca
                : <span style={{ color: 'var(--color-gray-400)', fontStyle: 'italic' }}>Sin observación registrada</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CaseDrilldown() {
  const { filteredRows, loading } = usePitchData();
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [detailCache, setDetailCache] = useState({});

  const interactions = useMemo(() => {
    const list = filteredRows.filter(r => r.es_primera_fila_interaccion);
    return [...list].sort((a, b) => (a.score_interaccion ?? 101) - (b.score_interaccion ?? 101));
  }, [filteredRows]);

  const totalPages = Math.ceil(interactions.length / PAGE_SIZE);
  // Si el filtrado reduce las páginas por debajo de la actual, volver al rango válido
  const safePage = Math.min(page, Math.max(totalPages - 1, 0));
  const paged = interactions.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const thStyle = {
    padding: '10px 14px', textAlign: 'left',
    fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-gray-700)', fontSize: 'var(--text-xs)',
    textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
    borderBottom: '1px solid var(--color-gray-200)', whiteSpace: 'nowrap',
  };

  return (
    <ChartCard
      title="Drilldown de interacciones"
      subtitle="Peor score primero · expandir una fila consulta BQ en vivo (incluye observación de la IA)"
      loading={loading}
      empty={interactions.length === 0}
      actions={
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)' }}>
          {interactions.length.toLocaleString('es-419')} interacciones
        </span>
      }
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-subtle)' }}>
              {['Tipo', 'Caso', 'ID Interacción', 'Propietario', 'País', 'Tipificación N3', 'Fecha', 'Score', ''].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map(row => {
              const isExpanded = expandedId === row.interaction_id;
              return (
                <Fragment key={row.interaction_id}>
                  <tr
                    onClick={() => setExpandedId(prev => prev === row.interaction_id ? null : row.interaction_id)}
                    style={{
                      borderBottom: '1px solid var(--color-gray-100)', cursor: 'pointer',
                      background: isExpanded ? 'var(--color-primary-light)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '9px 14px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 'var(--radius-full)',
                        background: 'var(--color-gray-100)', color: 'var(--color-gray-700)',
                        fontWeight: 'var(--font-weight-semibold)', fontSize: 10, whiteSpace: 'nowrap',
                      }}>
                        {row.tipo_interaccion}
                      </span>
                    </td>
                    <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                      {row.numero_caso ?? '—'}
                    </td>
                    <td
                      title={row.interaction_id}
                      style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 10,
                        color: 'var(--color-fg-muted)', maxWidth: 130,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {row.interaction_id}
                    </td>
                    <td style={{ padding: '9px 14px' }}>{row.nombre_agente ?? '—'}</td>
                    <td style={{ padding: '9px 14px' }}>{row.pais ?? '—'}</td>
                    <td
                      title={row.nombre_tipificacion}
                      style={{ padding: '9px 14px', fontSize: 'var(--text-xs)', maxWidth: 170,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {row.nombre_tipificacion ?? '—'}
                    </td>
                    <td style={{ padding: '9px 14px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                      color: 'var(--color-fg-muted)' }}>
                      {row.fecha_evaluacion ?? '—'}
                    </td>
                    <td style={{ padding: '9px 14px' }}>
                      {row.score_interaccion != null ? (
                        <span style={{
                          display: 'inline-block', padding: '2px 10px', borderRadius: 'var(--radius-full)',
                          background: getScoreBg(row.score_interaccion),
                          color: getScoreColor(row.score_interaccion),
                          fontWeight: 'var(--font-weight-semibold)',
                          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                        }}>
                          {row.score_interaccion.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '9px 8px', color: 'var(--color-fg-subtle)', textAlign: 'center' }}>
                      {isExpanded ? '▲' : '▼'}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr style={{ background: 'var(--color-bg-subtle)' }}>
                      <td colSpan={9} style={{ padding: '0 0 0 20px', borderBottom: '2px solid var(--color-primary-light)' }}>
                        <DetailPanel
                          interactionId={row.interaction_id}
                          cache={detailCache}
                          setCache={setDetailCache}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <Paginador page={safePage} totalPages={totalPages} onChange={setPage} />
    </ChartCard>
  );
}
