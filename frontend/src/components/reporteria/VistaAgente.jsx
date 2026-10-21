/**
 * VistaAgente — panorama individual de un agente/analista para feedback 1:1.
 *
 * El líder selecciona un agente (o se sincroniza con el filtro global de
 * propietario) y ve, respetando los filtros globales:
 *  - KPIs del agente vs su equipo y vs el total filtrado.
 *  - Tendencia de score del agente superpuesta a la del equipo.
 *  - Criterios que más incumple, con comparación explícita vs el equipo.
 *  - Peores interacciones para el 1:1 — variedad por tipo, filtrables al
 *    drilldown, paginadas por tandas (una por tipo por página).
 *
 * Todo en memoria sobre el extracto — cero queries BQ adicionales.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { FilterRegular, FilterDismissRegular, ArrowUpRegular, ArrowDownRegular } from '@fluentui/react-icons';
import ChartCard from './ChartCard.jsx';
import KPICard from './KPICard.jsx';
import Paginador from './Paginador.jsx';
import { SearchableSelect } from './inputs.jsx';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { byCriterion, byPeriod, computeKpis } from '../../utils/aggregations.js';
import { getScoreColor, getScoreBg, SCORE_THRESHOLDS } from '../../utils/scores.js';

function AgenteTooltip({ active, payload, label }) {
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
      <div style={{ color: 'var(--color-primary-dark)' }}>
        Agente: {row.scoreAgente != null ? `${row.scoreAgente.toFixed(1)}%` : '—'}
        {row.nAgente != null ? ` (${row.nAgente})` : ''}
      </div>
      <div style={{ color: 'var(--color-fg-muted)' }}>
        Equipo: {row.scoreEquipo != null ? `${row.scoreEquipo.toFixed(1)}%` : '—'}
      </div>
    </div>
  );
}

export default function VistaAgente() {
  const { filteredRows, filterOptions, loading, filters, crossFilter } = usePitchData();
  const [agente, setAgente] = useState(null);   // email seleccionado (foco local)
  const [page, setPage] = useState(0);

  // Sync con el filtro global: al filtrar un propietario desde la tabla o el
  // panel, la Vista de agente enfoca al más recientemente filtrado.
  useEffect(() => {
    if (filters.email_agente.length >= 1) {
      setAgente(filters.email_agente[filters.email_agente.length - 1]);
    }
  }, [filters.email_agente]);

  useEffect(() => { setPage(0); }, [agente]);

  const datos = useMemo(() => {
    if (!agente) return null;
    const agentRows = filteredRows.filter(r => r.email_agente === agente);
    if (agentRows.length === 0) return { vacio: true };

    const nombre = agentRows[0].nombre_agente ?? agente;
    const equipo = agentRows[0].departamento ?? null;
    const manager = agentRows[0].nombre_manager ?? null;
    const teamRows = equipo
      ? filteredRows.filter(r => r.departamento === equipo)
      : filteredRows;

    const kAgente = computeKpis(agentRows);
    const kEquipo = computeKpis(teamRows);
    const kTotal  = computeKpis(filteredRows);

    const serieAgente = byPeriod(agentRows, 'dia');
    const serieEquipo = new Map(byPeriod(teamRows, 'dia').map(d => [d.fecha, d]));
    const tendencia = serieAgente.map(d => ({
      fecha: d.fecha,
      scoreAgente: d.score,
      nAgente: d.interacciones,
      scoreEquipo: serieEquipo.get(d.fecha)?.score ?? null,
    }));

    // Criterios más débiles del agente (menor cumplimiento), con el % del
    // equipo y la diferencia. delta > 0 = por encima del equipo (mejor).
    const critEquipo = new Map(byCriterion(teamRows).map(c => [c.id_criterio, c]));
    const criterios = byCriterion(agentRows)
      .filter(c => c.noCumple > 0)
      .sort((a, b) => a.pctCumple - b.pctCumple)   // más débil primero
      .slice(0, 6)
      .map(c => {
        const eq = critEquipo.get(c.id_criterio);
        return {
          ...c,
          cumpleEquipo: eq ? eq.pctCumple : null,
          delta: eq ? c.pctCumple - eq.pctCumple : null,
        };
      });

    // Peores interacciones con VARIEDAD por tipo (round-robin), hasta 50
    const porTipo = new Map();
    for (const r of agentRows) {
      if (!r.es_primera_fila_interaccion) continue;
      const t = r.tipo_interaccion ?? '(sin tipo)';
      if (!porTipo.has(t)) porTipo.set(t, []);
      porTipo.get(t).push(r);
    }
    for (const arr of porTipo.values()) {
      arr.sort((a, b) => (a.score_interaccion ?? 101) - (b.score_interaccion ?? 101));
    }
    const grupos = [...porTipo.values()];
    const peores = [];
    let rr = 0;
    while (peores.length < 50) {
      let added = false;
      for (const g of grupos) {
        if (g[rr]) { peores.push(g[rr]); added = true; if (peores.length >= 50) break; }
      }
      if (!added) break;
      rr++;
    }

    return { nombre, equipo, manager, kAgente, kEquipo, kTotal, tendencia, criterios, peores, nTipos: grupos.length };
  }, [filteredRows, agente]);

  const pageSize = Math.max(datos?.nTipos ?? 1, 1);
  const totalPages = datos?.peores ? Math.ceil(datos.peores.length / pageSize) : 0;
  const safePage = Math.min(page, Math.max(totalPages - 1, 0));
  const pagedPeores = datos?.peores?.slice(safePage * pageSize, (safePage + 1) * pageSize) ?? [];

  return (
    <ChartCard
      title="Vista de agente"
      subtitle="Panorama individual para feedback 1:1 — respeta los filtros globales activos"
      loading={loading}
      empty={false}
      actions={
        filterOptions && (
          <SearchableSelect
            label="Seleccionar agente"
            placeholder="Seleccionar agente…"
            options={filterOptions.agentes}
            value={agente}
            onChange={setAgente}
            getValue={o => o.email}
            getLabel={o => o.nombre}
          />
        )
      }
    >
      {!agente ? (
        <div style={{ padding: 40, textAlign: 'center',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg-subtle)' }}>
          Selecciona un agente para ver su panorama individual.
        </div>
      ) : datos?.vacio ? (
        <div style={{ padding: 40, textAlign: 'center',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg-subtle)' }}>
          El agente no tiene interacciones con los filtros actuales.
        </div>
      ) : (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Identificación + KPIs comparados */}
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg-muted)' }}>
            <b style={{ color: 'var(--color-black)', fontSize: 'var(--text-base)' }}>{datos.nombre}</b>
            {datos.equipo && <> · {datos.equipo}</>}
            {datos.manager && <> · Manager: {datos.manager}</>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <KPICard
              label="Score del agente"
              value={datos.kAgente.scorePonderado != null ? `${datos.kAgente.scorePonderado.toFixed(1)}%` : '—'}
              sublabel={`Equipo: ${datos.kEquipo.scorePonderado?.toFixed(1) ?? '—'}% · Total: ${datos.kTotal.scorePonderado?.toFixed(1) ?? '—'}%`}
              color={getScoreColor(datos.kAgente.scorePonderado)}
            />
            <KPICard
              label="% Defectuosas"
              value={datos.kAgente.pctDefectuosas != null ? `${datos.kAgente.pctDefectuosas.toFixed(1)}%` : '—'}
              sublabel={`${datos.kAgente.nDefectuosas} / ${datos.kAgente.totalInteracciones} · Equipo: ${datos.kEquipo.pctDefectuosas?.toFixed(1) ?? '—'}%`}
              color={datos.kAgente.pctDefectuosas > (datos.kEquipo.pctDefectuosas ?? 0)
                ? 'var(--color-score-low)' : 'var(--color-score-high)'}
            />
            <KPICard
              label="Volumen evaluado"
              value={datos.kAgente.totalInteracciones.toLocaleString('es-419')}
              sublabel="interacciones en el período filtrado"
              color="var(--color-fg-muted)"
            />
          </div>

          {/* Tendencia agente vs equipo */}
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-muted)',
              textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 6 }}>
              Tendencia diaria — agente (naranja) vs equipo (gris)
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={datos.tendencia} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-gray-200)" />
                <XAxis dataKey="fecha" tickFormatter={f => f?.slice(5)}
                  tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-fg-subtle)' }}
                  axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`}
                  tick={{ fontFamily: 'var(--font-body)', fontSize: 10, fill: 'var(--color-fg-subtle)' }}
                  axisLine={false} tickLine={false} width={42} />
                <Tooltip content={<AgenteTooltip />} cursor={{ fill: 'var(--color-gray-100)' }} />
                <ReferenceLine y={SCORE_THRESHOLDS.HIGH.min}
                  stroke="var(--color-score-high)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="scoreEquipo"
                  stroke="var(--color-gray-400)" strokeWidth={1.6} dot={false} connectNulls />
                <Line type="monotone" dataKey="scoreAgente"
                  stroke="var(--color-primary-dark)" strokeWidth={2.4} dot={{ r: 2.5 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="chart-grid-2">
            {/* Criterios que más incumple — comparación explícita vs equipo */}
            <div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-muted)',
                textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 6 }}>
                Criterios más débiles — tú vs equipo (cumplimiento)
              </div>
              {datos.criterios.length === 0 ? (
                <div style={{ padding: 16, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                  color: 'var(--color-result-cumple)' }}>
                  Sin incumplimientos en el período filtrado. 🎉
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
                  <thead>
                    <tr style={{ color: 'var(--color-fg-subtle)', textAlign: 'right' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 'var(--font-weight-semibold)' }}>Criterio</th>
                      <th style={{ padding: '4px 8px', fontWeight: 'var(--font-weight-semibold)' }}>Tú</th>
                      <th style={{ padding: '4px 8px', fontWeight: 'var(--font-weight-semibold)' }}>Equipo</th>
                      <th style={{ padding: '4px 8px', fontWeight: 'var(--font-weight-semibold)' }}>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.criterios.map(c => {
                      const mejor = c.delta != null && c.delta > 0.05;   // por encima del equipo = mejor
                      const peor = c.delta != null && c.delta < -0.05;   // por debajo del equipo = peor
                      const difColor = peor ? 'var(--color-result-no-cumple)'
                        : mejor ? 'var(--color-result-cumple)' : 'var(--color-fg-muted)';
                      const Arrow = mejor ? ArrowUpRegular : peor ? ArrowDownRegular : null;
                      return (
                        <tr key={c.id_criterio} style={{ borderTop: '1px solid var(--color-gray-100)' }}>
                          <td style={{ padding: '7px 8px', color: 'var(--color-black)' }}>
                            {c.nombre_criterio ?? c.id_criterio}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                            fontWeight: 700, color: getScoreColor(c.pctCumple) }}>
                            {c.pctCumple.toFixed(0)}%
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)',
                            color: 'var(--color-fg-muted)' }}>
                            {c.cumpleEquipo != null ? `${c.cumpleEquipo.toFixed(0)}%` : '—'}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap', color: difColor,
                            fontWeight: 700 }}>
                            {c.delta == null ? '—' : (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, justifyContent: 'flex-end' }}>
                                {Arrow && <Arrow style={{ width: 12, height: 12 }} />}
                                {Math.abs(c.delta).toFixed(0)} pp {mejor ? 'por encima' : peor ? 'por debajo' : '='}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div style={{ marginTop: 6, fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--color-fg-subtle)' }}>
                % = cumplimiento (más alto, mejor). <span style={{ color: 'var(--color-result-cumple)', fontWeight: 700 }}>Verde</span> = por encima del equipo ·{' '}
                <span style={{ color: 'var(--color-result-no-cumple)', fontWeight: 700 }}>Rojo</span> = por debajo (a reforzar).
              </div>
            </div>

            {/* Peores interacciones — variedad por tipo, filtrables, paginadas */}
            <div className="vista-agente-sep">
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-muted)',
                textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 6 }}>
                Peores interacciones para el 1:1 — variedad por tipo
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
                <tbody>
                  {pagedPeores.map(r => {
                    const filtrada = filters.interaction_id.includes(r.interaction_id);
                    return (
                      <tr key={r.interaction_id} style={{ borderBottom: '1px solid var(--color-gray-100)' }}>
                        <td style={{ padding: '6px 6px' }}>
                          <button
                            onClick={() => crossFilter('interaction_id', r.interaction_id)}
                            title={filtrada ? 'Quitar del drilldown' : 'Marcar para verla en el Drilldown'}
                            style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 24, height: 24, borderRadius: 'var(--radius-sm)',
                              border: `1px solid ${filtrada ? 'var(--color-primary)' : 'var(--color-border)'}`,
                              background: filtrada ? 'var(--color-primary-light)' : 'var(--color-surface)',
                              color: filtrada ? 'var(--color-primary-dark)' : 'var(--color-fg-subtle)',
                              cursor: 'pointer',
                            }}
                          >
                            {filtrada ? <FilterDismissRegular style={{ width: 13, height: 13 }} />
                                      : <FilterRegular style={{ width: 13, height: 13 }} />}
                          </button>
                        </td>
                        <td style={{ padding: '6px 6px' }}>
                          <span style={{
                            display: 'inline-block', padding: '1px 7px', borderRadius: 'var(--radius-full)',
                            background: 'var(--color-gray-100)', color: 'var(--color-gray-700)',
                            fontWeight: 'var(--font-weight-semibold)', fontSize: 9, whiteSpace: 'nowrap',
                          }}>
                            {r.tipo_interaccion}
                          </span>
                        </td>
                        <td style={{ padding: '6px 6px', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                          {r.numero_caso ?? '—'}
                        </td>
                        <td style={{ padding: '6px 6px', fontFamily: 'var(--font-mono)', fontSize: 10,
                          color: 'var(--color-fg-muted)', whiteSpace: 'nowrap' }}>
                          {r.fecha_evaluacion}
                        </td>
                        <td style={{ padding: '6px 6px', textAlign: 'right' }}>
                          {r.score_interaccion != null ? (
                            <span style={{
                              display: 'inline-block', padding: '1px 8px', borderRadius: 'var(--radius-full)',
                              background: getScoreBg(r.score_interaccion), color: getScoreColor(r.score_interaccion),
                              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                            }}>
                              {r.score_interaccion.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {totalPages > 1 && (
                <Paginador page={safePage} totalPages={totalPages} onChange={setPage} />
              )}
              <div style={{ marginTop: 6, fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--color-fg-subtle)' }}>
                Cada página trae una interacción por tipo. El botón de filtro las marca para el
                Drilldown, donde ves el detalle con la observación de SAACA.
              </div>
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}
