/**
 * CriteriosTabla — catálogo de criterios de SAACA: Activos / Inactivos,
 * búsqueda y filtros; cada criterio se expande para ver la descripción
 * completa, dónde aplica (con las notas del mapping) y su historial de versiones.
 *
 * Tarjeta propia con overflow visible (no ChartCard): los desplegables de
 * MultiSelect no deben recortarse.
 */

import { useMemo, useState } from 'react';
import { ChevronDownRegular, ChevronRightRegular, SearchRegular } from '@fluentui/react-icons';
import { MultiSelect } from '../reporteria/inputs.jsx';
import {
  CATEGORIA_LABEL, CRITICIDAD_LABEL, DEFAULT_GLOSARIO_FILTERS, contarPorEstado, filtrarCriterios,
} from '../../utils/glosario.js';

const labelStyle = {
  fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--color-fg-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
};

function Badge({ children, tono = 'neutro' }) {
  const tonos = {
    critico: { bg: 'var(--color-result-no-cumple-bg)', color: 'var(--color-result-no-cumple)' },
    neutro:  { bg: 'var(--color-gray-100)',            color: 'var(--color-gray-700)' },
    marca:   { bg: 'var(--color-primary-light)',       color: 'var(--color-primary-dark)' },
  };
  const t = tonos[tono];
  return (
    <span style={{
      display: 'inline-block', padding: '1px 8px', borderRadius: 'var(--radius-full)',
      background: t.bg, color: t.color, whiteSpace: 'nowrap',
      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 'var(--font-weight-semibold)',
    }}>
      {children}
    </span>
  );
}

function DetalleCriterio({ c }) {
  return (
    <div style={{ padding: '4px 20px 16px 48px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={labelStyle}>Descripción</div>
        <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--color-fg)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {c.criterion_description ?? '—'}
        </p>
      </div>

      <div>
        <div style={labelStyle}>Dónde se evalúa</div>
        {c.tipos_interaccion.length === 0 ? (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)' }}>
            Sin tipo de interacción asignado.
          </div>
        ) : (
          <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {c.tipos_interaccion.map(t => (
              <li key={`${t.interaction_type}-${t.mechanism}`} style={{
                display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap',
                opacity: t.is_active ? 1 : 0.55,
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg)',
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-weight-bold)' }}>
                  {t.interaction_type}
                </span>
                <Badge tono="marca">{t.mechanism}</Badge>
                {!t.is_active && <Badge>inactivo</Badge>}
                {t.notes && <span style={{ color: 'var(--color-fg-muted)' }}>{t.notes}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div style={labelStyle}>Historial de versiones</div>
        <table style={{ marginTop: 4, borderCollapse: 'collapse',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
          <thead>
            <tr>
              {['Versión', 'Vigente desde', 'Hasta', 'Estado'].map(h => (
                <th key={h} style={{ ...labelStyle, textAlign: 'left', padding: '4px 16px 4px 0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {c.historial.map(h => (
              <tr key={h.criteria_version} style={{
                fontWeight: h.criteria_version === c.criteria_version ? 'var(--font-weight-bold)' : 'normal',
              }}>
                <td style={{ padding: '3px 16px 3px 0', fontFamily: 'var(--font-mono)' }}>v{h.criteria_version}</td>
                <td style={{ padding: '3px 16px 3px 0' }}>{h.valid_from ?? '—'}</td>
                <td style={{ padding: '3px 16px 3px 0' }}>{h.valid_to ?? 'sin término'}</td>
                <td style={{ padding: '3px 16px 3px 0' }}>{h.is_active ? 'Activa' : 'Inactiva'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CriteriosTabla({ criterios, tipos }) {
  const [filters, setFilters]   = useState(DEFAULT_GLOSARIO_FILTERS);
  const [abiertos, setAbiertos] = useState(() => new Set());

  const conteo    = useMemo(() => contarPorEstado(criterios), [criterios]);
  const visibles  = useMemo(() => filtrarCriterios(criterios, filters), [criterios, filters]);
  const set = (key) => (value) => setFilters(f => ({ ...f, [key]: value }));

  function toggle(id) {
    setAbiertos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const segmento = (estado, label) => {
    const activo = filters.estado === estado;
    return (
      <button
        onClick={() => set('estado')(estado)}
        style={{
          height: 32, padding: '0 14px', cursor: 'pointer',
          border: `1px solid ${activo ? 'var(--color-primary)' : 'var(--color-border)'}`,
          background: activo ? 'var(--color-primary-light)' : 'var(--color-surface)',
          color: activo ? 'var(--color-primary-dark)' : 'var(--color-fg-muted)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          fontWeight: activo ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
          borderRadius: estado === 'ACTIVO' ? 'var(--radius-sm) 0 0 var(--radius-sm)' : '0 var(--radius-sm) var(--radius-sm) 0',
        }}
      >
        {label} ({conteo[estado] ?? 0})
      </button>
    );
  };

  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
    }}>
      {/* Filtros */}
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid var(--color-gray-200)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
      }}>
        <div style={{ display: 'flex' }}>
          {segmento('ACTIVO', 'Activos')}
          {segmento('INACTIVO', 'Inactivos')}
        </div>
        <div style={{ position: 'relative' }}>
          <SearchRegular style={{ position: 'absolute', left: 9, top: 9, width: 14, height: 14,
            color: 'var(--color-fg-subtle)' }} />
          <input
            type="search"
            placeholder="Buscar criterio"
            value={filters.texto}
            onChange={e => set('texto')(e.target.value)}
            style={{
              height: 32, width: 220, padding: '0 10px 0 28px', boxSizing: 'border-box',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', outline: 'none',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg)',
            }}
          />
        </div>
        <MultiSelect label="Tipo de interacción" options={tipos} value={filters.tipos} onChange={set('tipos')} />
        <MultiSelect
          label="Criticidad" options={['CRITICAL', 'NON_CRITICAL']} value={filters.criticidad}
          onChange={set('criticidad')} renderOption={v => CRITICIDAD_LABEL[v] ?? v}
        />
      </div>

      {/* Lista */}
      {visibles.length === 0 ? (
        <div style={{ padding: '36px 24px', textAlign: 'center', fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)', color: 'var(--color-fg-subtle)' }}>
          {filters.estado === 'INACTIVO' && conteo.INACTIVO === 0
            ? 'No hay criterios inactivos en el catálogo.'
            : 'Ningún criterio coincide con los filtros.'}
        </div>
      ) : visibles.map(c => {
        const abierto = abiertos.has(c.criterion_id);
        const Chevron = abierto ? ChevronDownRegular : ChevronRightRegular;
        return (
          <div key={c.criterion_id} style={{ borderTop: '1px solid var(--color-gray-100)' }}>
            <button
              onClick={() => toggle(c.criterion_id)}
              aria-expanded={abierto}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '12px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <Chevron style={{ width: 16, height: 16, color: 'var(--color-fg-subtle)', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-weight-bold)', color: 'var(--color-gray-400)', minWidth: 48 }}>
                {c.criterion_id}
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-black)', flex: 1, minWidth: 200 }}>
                {c.criterion_name}
              </span>
              <Badge tono={c.error_type === 'CRITICAL' ? 'critico' : 'neutro'}>
                {CRITICIDAD_LABEL[c.error_type] ?? c.error_type}
              </Badge>
              {c.error_category && c.error_category !== 'NON_CRITICAL' && (
                <Badge>{CATEGORIA_LABEL[c.error_category] ?? c.error_category}</Badge>
              )}
              {c.criterion_weight != null && <Badge>Peso {c.criterion_weight}</Badge>}
              <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {c.tipos_interaccion.filter(t => t.is_active).map(t => (
                  <Badge key={`${t.interaction_type}-${t.mechanism}`} tono="marca">{t.interaction_type}</Badge>
                ))}
              </span>
            </button>
            {abierto && <DetalleCriterio c={c} />}
          </div>
        );
      })}
    </div>
  );
}
