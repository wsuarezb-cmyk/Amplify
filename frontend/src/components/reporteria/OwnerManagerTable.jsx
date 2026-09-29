/**
 * OwnerManagerTable — resultados por propietario con rollup por manager (spec 5.4).
 * Evolución del AgentTable de Pauta: filas agrupadas por manager, expandibles
 * a los propietarios de su equipo.
 */

import { useMemo, useState } from 'react';
import { ChevronRightRegular, ChevronDownRegular, FilterRegular, FilterDismissRegular } from '@fluentui/react-icons';
import ChartCard from './ChartCard.jsx';
import Paginador from './Paginador.jsx';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { getScoreColor, getScoreBg } from '../../utils/scores.js';

const PAGE_SIZE = 20;

/** Botón de filtro por fila: aplica/quita cross-filter de manager o propietario. */
function RowFilterButton({ active, onClick, title }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 26, height: 26, borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
        background: active ? 'var(--color-primary-light)' : 'var(--color-surface)',
        color: active ? 'var(--color-primary-dark)' : 'var(--color-fg-subtle)',
        cursor: 'pointer', flexShrink: 0,
      }}
    >
      {active
        ? <FilterDismissRegular style={{ width: 14, height: 14 }} />
        : <FilterRegular style={{ width: 14, height: 14 }} />}
    </button>
  );
}

function ScoreBadge({ score }) {
  if (score == null) return <span style={{ color: 'var(--color-score-none)' }}>—</span>;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 'var(--radius-full)',
      background: getScoreBg(score), color: getScoreColor(score),
      fontWeight: 'var(--font-weight-semibold)',
      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
    }}>
      {score.toFixed(1)}%
    </span>
  );
}

function DefectBadge({ pct }) {
  if (pct == null) return <span style={{ color: 'var(--color-score-none)' }}>—</span>;
  const tone = pct > 20 ? 'low' : pct > 10 ? 'medium' : 'high';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 'var(--radius-full)',
      background: `var(--color-score-${tone}-bg)`, color: `var(--color-score-${tone})`,
      fontWeight: 'var(--font-weight-semibold)',
      fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
    }}>
      {pct.toFixed(1)}%
    </span>
  );
}

const thStyle = {
  padding: '10px 16px', textAlign: 'left',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-weight-semibold)', letterSpacing: 'var(--tracking-wide)',
  textTransform: 'uppercase', color: 'var(--color-fg-subtle)',
  borderBottom: '1px solid var(--color-gray-200)', whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '10px 16px', verticalAlign: 'middle',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg)',
  borderBottom: '1px solid var(--color-gray-100)',
};

export default function OwnerManagerTable() {
  const { filteredRows, loading, crossFilter, filters } = usePitchData();
  const [expanded, setExpanded] = useState(() => new Set());
  const [page, setPage] = useState(0);

  const grouped = useMemo(() => {
    const managers = new Map();
    for (const r of filteredRows) {
      if (!r.es_primera_fila_interaccion) continue;
      const mKey = r.email_manager ?? '(sin manager)';
      let m = managers.get(mKey);
      if (!m) {
        m = { key: mKey, nombre: r.nombre_manager ?? '(sin manager)',
              n: 0, scoreSum: 0, nScore: 0, defectuosas: 0, agentes: new Map() };
        managers.set(mKey, m);
      }
      m.n++;
      if (r.score_interaccion != null) { m.scoreSum += r.score_interaccion; m.nScore++; }
      if (r.es_defectuosa) m.defectuosas++;

      const aKey = r.email_agente ?? '(sin agente)';
      let a = m.agentes.get(aKey);
      if (!a) {
        a = { key: aKey, nombre: r.nombre_agente ?? '(sin agente)',
              departamento: r.departamento, pais: r.pais,
              n: 0, scoreSum: 0, nScore: 0, defectuosas: 0 };
        m.agentes.set(aKey, a);
      }
      a.n++;
      if (r.score_interaccion != null) { a.scoreSum += r.score_interaccion; a.nScore++; }
      if (r.es_defectuosa) a.defectuosas++;
    }

    const finish = d => ({
      ...d,
      score: d.nScore > 0 ? d.scoreSum / d.nScore : null,
      pctDefectuosas: d.n > 0 ? (d.defectuosas / d.n) * 100 : null,
    });

    return [...managers.values()]
      .map(m => ({
        ...finish(m),
        agentes: [...m.agentes.values()].map(finish).sort((a, b) => b.n - a.n),
      }))
      .sort((a, b) => b.n - a.n);
  }, [filteredRows]);

  function toggle(key) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const totalPages = Math.ceil(grouped.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(totalPages - 1, 0));
  const paged = grouped.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const managerFiltered = (email) => filters.email_manager.includes(email);
  const agenteFiltered = (email) => filters.email_agente.includes(email);

  return (
    <ChartCard
      title="Resultados por propietario"
      subtitle="Rollup por manager — expandir para ver el equipo · el ícono de filtro acota toda la reportería a ese manager/propietario"
      loading={loading}
      empty={grouped.length === 0}
      actions={
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)' }}>
          {grouped.length.toLocaleString('es-419')} managers
        </span>
      }
    >
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-subtle)' }}>
              <th style={{ ...thStyle, width: 34 }} />
              <th style={thStyle}>Manager / Propietario</th>
              <th style={thStyle}>Equipo</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Interacciones</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Score</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>% Defectuosas</th>
            </tr>
          </thead>
          <tbody>
            {paged.map(m => {
              const isOpen = expanded.has(m.key);
              const mFiltered = m.key.includes('@') && managerFiltered(m.key);
              return [
                <tr
                  key={m.key}
                  onClick={() => toggle(m.key)}
                  style={{
                    cursor: 'pointer',
                    background: mFiltered ? 'var(--color-primary-light)'
                      : isOpen ? 'var(--color-bg-subtle)' : 'transparent',
                  }}
                >
                  <td style={{ ...tdStyle, paddingRight: 0 }}>
                    {m.key.includes('@') && (
                      <RowFilterButton
                        active={mFiltered}
                        onClick={() => crossFilter('email_manager', m.key)}
                        title={mFiltered ? 'Quitar filtro de este manager' : 'Filtrar la reportería por este manager'}
                      />
                    )}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 'var(--font-weight-semibold)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {isOpen
                        ? <ChevronDownRegular style={{ width: 14, height: 14 }} />
                        : <ChevronRightRegular style={{ width: 14, height: 14 }} />}
                      {m.nombre}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ color: 'var(--color-fg-subtle)', fontSize: 'var(--text-xs)' }}>
                      {m.agentes.length} propietario{m.agentes.length !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    {m.n.toLocaleString('es-419')}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}><ScoreBadge score={m.score} /></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}><DefectBadge pct={m.pctDefectuosas} /></td>
                </tr>,
                ...(isOpen ? m.agentes.map(a => {
                  const aFiltered = a.key.includes('@') && agenteFiltered(a.key);
                  return (
                    <tr key={`${m.key}|${a.key}`}
                      style={{ background: aFiltered ? 'var(--color-primary-light)' : 'var(--color-bg-subtle)' }}
                    >
                      <td style={{ ...tdStyle, paddingRight: 0, paddingLeft: 28 }}>
                        {a.key.includes('@') && (
                          <RowFilterButton
                            active={aFiltered}
                            onClick={() => crossFilter('email_agente', a.key)}
                            title={aFiltered ? 'Quitar filtro de este propietario' : 'Filtrar la reportería por este propietario'}
                          />
                        )}
                      </td>
                      <td style={{ ...tdStyle, paddingLeft: 30 }}>
                        <div>{a.nombre}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-fg-subtle)' }}>
                          {a.key}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: 'var(--color-fg-muted)', fontSize: 'var(--text-xs)' }}>
                          {a.departamento ?? '—'}{a.pais ? ` · ${a.pais}` : ''}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                        {a.n.toLocaleString('es-419')}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}><ScoreBadge score={a.score} /></td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}><DefectBadge pct={a.pctDefectuosas} /></td>
                    </tr>
                  );
                }) : []),
              ];
            })}
          </tbody>
        </table>
      </div>

      <Paginador page={safePage} totalPages={totalPages} onChange={setPage} />
    </ChartCard>
  );
}
