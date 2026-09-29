/**
 * Calibración — bandeja del auditor (spec 6.4) + panel de generación de
 * muestra visible solo para LIDER_QUALITY/ADMIN (spec 6.3).
 *
 * Aislamiento total: el backend filtra por el email del JWT — la bandeja
 * solo muestra lo asignado al auditor autenticado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import { useAuth } from '../contexts/AuthContext.jsx';
import { hasMinRole, ROLES } from '../constants/roles.js';
import { getCalibracionInbox } from '../services/api.js';
import GenerarMuestraPanel from '../components/calibracion/GenerarMuestraPanel.jsx';
import BatchesGenerados from '../components/calibracion/BatchesGenerados.jsx';
import CalibracionDashboard from '../components/calibracion/CalibracionDashboard.jsx';
import BandejaFiltros from '../components/calibracion/BandejaFiltros.jsx';
import Paginador from '../components/reporteria/Paginador.jsx';
import { DEFAULT_BANDEJA_FILTERS, ESTADO_LABEL, filtrarBandeja, opcionesBandeja } from '../utils/bandejaFilters.js';

const PAGE_SIZE = 20;

// Se abren los casos con trabajo pendiente: voto a ciegas (PENDIENTE) o revisión frente a SAACA (EN_PROGRESO).
const ABRIBLE = new Set(['PENDIENTE', 'EN_PROGRESO']);

const ESTADO_STYLE = {
  PENDIENTE:   { bg: 'var(--color-warning-light)',         color: 'var(--color-orange-900)' },
  EN_PROGRESO: { bg: 'var(--color-info-light)',            color: 'var(--color-info)' },
  COMPLETADO:  { bg: 'var(--color-result-cumple-bg)',      color: 'var(--color-result-cumple)' },
  DESCARTADO:  { bg: 'var(--color-result-no-evaluado-bg)', color: 'var(--color-result-no-evaluado)' },
};

function EstadoBadge({ estado }) {
  const s = ESTADO_STYLE[estado] ?? ESTADO_STYLE.PENDIENTE;
  const label = ESTADO_LABEL[estado] ?? ESTADO_LABEL.PENDIENTE;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 'var(--radius-full)',
      background: s.bg, color: s.color,
      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
      fontWeight: 'var(--font-weight-semibold)', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

export default function Calibracion() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [batchesKey, setBatchesKey] = useState(0);   // fuerza refresh de BatchesGenerados
  const [filters, setFilters] = useState(DEFAULT_BANDEJA_FILTERS);
  const [page, setPage]       = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getCalibracionInbox());
    } catch (e) {
      setError(e.message ?? 'Error al cargar la bandeja');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const esLider = hasMinRole(user?.role, ROLES.LIDER_QUALITY);
  const items = useMemo(() => data?.items ?? [], [data]);
  const pendientes = items.filter(i => i.estado === 'PENDIENTE');
  const enRevision = items.filter(i => i.estado === 'EN_PROGRESO');

  const opciones   = useMemo(() => opcionesBandeja(items), [items]);
  const filtrados  = useMemo(() => filtrarBandeja(items, filters), [items, filters]);
  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE));
  const pageSafe   = Math.min(page, totalPages - 1);
  const visibles   = filtrados.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE);

  function handleFilters(next) {
    setFilters(next);
    setPage(0);
  }

  const thStyle = {
    padding: '10px 14px', textAlign: 'left',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
    fontWeight: 'var(--font-weight-bold)', color: 'var(--color-fg-muted)',
    textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
    borderBottom: '1px solid var(--color-gray-200)', whiteSpace: 'nowrap',
  };
  const tdStyle = {
    padding: '11px 14px', verticalAlign: 'middle',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg)',
    borderBottom: '1px solid var(--color-gray-100)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Mini dashboard de seguimiento — propio para auditor, global para líder */}
      <CalibracionDashboard esLider={esLider} />

      {/* Panel del líder */}
      {esLider && (
        <>
          <GenerarMuestraPanel onGenerated={() => { load(); setBatchesKey(k => k + 1); }} />
          <BatchesGenerados refreshKey={batchesKey} onAnulado={load} />
        </>
      )}

      {/* Bandeja */}
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        // overflow visible: los desplegables de BandejaFiltros no deben recortarse
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'visible',
      }}>
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--color-gray-200)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-weight-bold)',
              fontSize: 'var(--text-base)', color: 'var(--color-black)' }}>
              Mi bandeja de calibración
            </div>
            {data && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                color: 'var(--color-fg-subtle)', marginTop: 2 }}>
                {pendientes.length} interacci{pendientes.length !== 1 ? 'ones' : 'ón'} pendiente{pendientes.length !== 1 ? 's' : ''} ·
                {' '}{enRevision.length} en revisión ·
                {' '}{data.total_completados} criterio{data.total_completados !== 1 ? 's' : ''} completado{data.total_completados !== 1 ? 's' : ''} ·
                {' '}{data.total_descartados} descartado{data.total_descartados !== 1 ? 's' : ''}
              </div>
            )}
          </div>
          <button
            onClick={load}
            title="Actualizar bandeja"
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)', color: 'var(--color-fg-muted)',
            }}
          >
            <ArrowClockwiseRegular style={{ fontSize: 14 }} />
            Actualizar
          </button>
        </div>

        {loading && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-fg-subtle)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            Cargando bandeja…
          </div>
        )}

        {error && !loading && (
          <div style={{ padding: '16px 20px', color: 'var(--color-red-900)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            {error}
            <button onClick={load} style={{
              marginLeft: 12, cursor: 'pointer', textDecoration: 'underline',
              background: 'none', border: 'none', color: 'var(--color-red-900)',
              fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)',
            }}>
              Reintentar
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ padding: '48px 24px', textAlign: 'center',
            color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            No tienes interacciones asignadas en este momento.
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <BandejaFiltros filters={filters} onChange={handleFilters} opciones={opciones} />
            <div style={{
              padding: '8px 20px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              color: 'var(--color-fg-subtle)', borderBottom: '1px solid var(--color-gray-100)',
            }}>
              {filtrados.length} de {items.length} interacci{items.length !== 1 ? 'ones' : 'ón'}
            </div>
          </>
        )}

        {!loading && !error && items.length > 0 && filtrados.length === 0 && (
          <div style={{ padding: '36px 24px', textAlign: 'center',
            color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            Ninguna interacción coincide con los filtros.
          </div>
        )}

        {!loading && !error && filtrados.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-subtle)' }}>
                  <th style={thStyle}>Caso / Interacción</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>País</th>
                  <th style={thStyle}>Agente</th>
                  <th style={thStyle}>Criterios asignados</th>
                  <th style={thStyle}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(item => (
                  <tr
                    key={item.interaction_id}
                    onClick={() => {
                      if (ABRIBLE.has(item.estado)) {
                        navigate(`/calibracion/caso/${encodeURIComponent(item.interaction_id)}`, { state: { item } });
                      }
                    }}
                    style={{
                      cursor: ABRIBLE.has(item.estado) ? 'pointer' : 'default',
                      opacity: ABRIBLE.has(item.estado) ? 1 : 0.65,
                      transition: 'background var(--transition-fast)',
                    }}
                    onMouseEnter={e => { if (ABRIBLE.has(item.estado)) e.currentTarget.style.background = 'var(--color-primary-light)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = ''; }}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-black)' }}>
                        {item.numero_caso ?? '—'}
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-fg-subtle)' }}>
                        {item.interaction_id}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        display: 'inline-block', padding: '2px 9px', borderRadius: 'var(--radius-full)',
                        background: 'var(--color-gray-100)', color: 'var(--color-gray-700)',
                        fontWeight: 'var(--font-weight-semibold)', fontSize: 10, whiteSpace: 'nowrap',
                      }}>
                        {item.interaction_type}
                      </span>
                    </td>
                    <td style={tdStyle}>{item.pais ?? '—'}</td>
                    <td style={tdStyle}>
                      <div>{item.nombre_agente ?? '—'}</div>
                      {item.departamento && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)' }}>
                          {item.departamento}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-weight-bold)' }}>
                        {item.criterios.length}
                      </span>
                      <span style={{ color: 'var(--color-fg-subtle)', fontSize: 'var(--text-xs)' }}>
                        {' '}criterio{item.criterios.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td style={tdStyle}><EstadoBadge estado={item.estado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Paginador page={pageSafe} totalPages={totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}
