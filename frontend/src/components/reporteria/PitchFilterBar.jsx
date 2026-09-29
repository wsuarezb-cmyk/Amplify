/**
 * PitchFilterBar — todos los filtros de Reportería (spec 5.2 + ronda v2):
 * fecha, país, equipo, tipo, mecanismo, criterio, tipificación N1/N2/N3,
 * propietario, manager (todos con buscador donde la lista es larga),
 * y filtros multi-valor por lista pegada: N° caso, ID interacción, seller.
 *
 * Layout responsive: grid auto-fit que llena el ancho disponible.
 * Botón global "Limpiar filtros" prominente y persistente cuando hay activos —
 * cubre también los cross-filters aplicados desde los gráficos (mismo estado).
 */

import { useState } from 'react';
import {
  CalendarLtrRegular, DismissRegular, FilterRegular,
  ChevronDownRegular, ChevronUpRegular,
} from '@fluentui/react-icons';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import ExportButton from './ExportButton.jsx';
import DiagnosticoButton from '../diagnostico/DiagnosticoButton.jsx';
import { MultiSelect, MultiValueInput, SearchableMultiSelect } from './inputs.jsx';

const labelStyle = {
  fontFamily: 'var(--font-body)', fontSize: 10,
  fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-subtle)',
  letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase',
  whiteSpace: 'nowrap',
};

const inputStyle = {
  height: 32, padding: '0 10px', boxSizing: 'border-box', width: '100%',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  color: 'var(--color-fg)', background: 'var(--color-surface)', outline: 'none',
};

function Field({ label, children, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...style }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </div>
  );
}

export default function PitchFilterBar() {
  const { filters, setFilter, resetFilters, activeFilterCount, filterOptions } = usePitchData();
  const [expanded, setExpanded] = useState(false);

  if (!filterOptions) return null;

  // Cascada de tipificación: N2 y N3 se restringen según los niveles superiores
  const n2Options = [...new Set(
    filterOptions.tipiTree
      .filter(t => t.n2 && (filters.tipificacion_nivel_1.length === 0 || filters.tipificacion_nivel_1.includes(t.n1)))
      .map(t => t.n2)
  )].sort();

  const n3Options = [...new Set(
    filterOptions.tipiTree
      .filter(t =>
        t.nombre &&
        (filters.tipificacion_nivel_1.length === 0 || filters.tipificacion_nivel_1.includes(t.n1)) &&
        (filters.tipificacion_nivel_2.length === 0 || filters.tipificacion_nivel_2.includes(t.n2))
      )
      .map(t => t.nombre)
  )].sort();

  function onN1Change(val) {
    const validN2 = val.length > 0
      ? new Set(filterOptions.tipiTree.filter(t => val.includes(t.n1) && t.n2).map(t => t.n2))
      : null;
    const newN2 = validN2 ? filters.tipificacion_nivel_2.filter(v => validN2.has(v)) : filters.tipificacion_nivel_2;
    const validN3 = val.length > 0
      ? new Set(filterOptions.tipiTree.filter(t =>
          val.includes(t.n1) && (newN2.length === 0 || newN2.includes(t.n2)) && t.nombre
        ).map(t => t.nombre))
      : null;
    const newN3 = validN3 ? filters.nombre_tipificacion.filter(v => validN3.has(v)) : filters.nombre_tipificacion;
    setFilter('tipificacion_nivel_1', val);
    setFilter('tipificacion_nivel_2', newN2);
    setFilter('nombre_tipificacion', newN3);
  }

  function onN2Change(val) {
    const validN3 = val.length > 0
      ? new Set(filterOptions.tipiTree.filter(t => val.includes(t.n2) && t.nombre).map(t => t.nombre))
      : null;
    const newN3 = validN3 ? filters.nombre_tipificacion.filter(v => validN3.has(v)) : filters.nombre_tipificacion;
    setFilter('tipificacion_nivel_2', val);
    setFilter('nombre_tipificacion', newN3);
  }

  // Helper: opciones string para SearchableMultiSelect
  const asStr = { getValue: (o) => o, getLabel: (o) => o };

  // ── Chips de filtros activos (marca TODO filtro, venga de donde venga) ──
  const DIM_LABEL = {
    pais: 'País', departamento: 'Equipo', tipo_interaccion: 'Tipo',
    mecanismo_evaluacion: 'Mecanismo', id_criterio: 'Criterio',
    tipificacion_nivel_1: 'Tipif. N1', tipificacion_nivel_2: 'Tipif. N2',
    nombre_tipificacion: 'Tipif. N3', email_agente: 'Propietario',
    email_manager: 'Manager', numero_caso: 'N° caso',
    interaction_id: 'ID interacción', seller_code: 'Seller',
  };
  const criterioName = id => filterOptions.criterios.find(c => c.id === id)?.nombre ?? id;
  const agenteName = email => filterOptions.agentes.find(a => a.email === email)?.nombre ?? email;
  const managerName = email => filterOptions.managers.find(m => m.email === email)?.nombre ?? email;

  const chips = [];
  if (filters.fecha_start || filters.fecha_end) {
    chips.push({
      id: '__fecha', label: 'Período',
      value: `${filters.fecha_start || '…'} → ${filters.fecha_end || '…'}`,
      remove: () => { setFilter('fecha_start', ''); setFilter('fecha_end', ''); },
    });
  }
  for (const key of Object.keys(DIM_LABEL)) {
    for (const v of filters[key]) {
      const disp = key === 'id_criterio' ? criterioName(v)
        : key === 'email_agente' ? agenteName(v)
        : key === 'email_manager' ? managerName(v)
        : v;
      chips.push({
        id: `${key}-${v}`, label: DIM_LABEL[key], value: disp,
        remove: () => setFilter(key, filters[key].filter(x => x !== v)),
      });
    }
  }

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      padding: '12px 20px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {/* Fila única: período + país + equipo + más filtros + export + limpiar */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <Field label="Período">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarLtrRegular style={{ width: 16, height: 16, color: 'var(--color-fg-subtle)', flexShrink: 0 }} />
            <input
              type="date" min={filterOptions.fechaMin} max={filterOptions.fechaMax}
              value={filters.fecha_start}
              onChange={e => setFilter('fecha_start', e.target.value)}
              style={{ ...inputStyle, width: 132 }}
            />
            <span style={{ color: 'var(--color-gray-400)', fontSize: 'var(--text-sm)' }}>→</span>
            <input
              type="date" min={filterOptions.fechaMin} max={filterOptions.fechaMax}
              value={filters.fecha_end}
              onChange={e => setFilter('fecha_end', e.target.value)}
              style={{ ...inputStyle, width: 132 }}
            />
          </div>
        </Field>

        <Field label="País">
          <MultiSelect label="Todos" options={filterOptions.pais}
            value={filters.pais} onChange={v => setFilter('pais', v)} />
        </Field>
        <Field label="Equipo">
          <SearchableMultiSelect label="Todos" options={filterOptions.departamento}
            value={filters.departamento} onChange={v => setFilter('departamento', v)} {...asStr} />
        </Field>

        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 32, padding: '0 14px', cursor: 'pointer',
            background: 'var(--color-primary-light)',
            border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-primary-dark)',
          }}
        >
          {expanded
            ? <ChevronUpRegular style={{ width: 14, height: 14 }} />
            : <ChevronDownRegular style={{ width: 14, height: 14 }} />}
          {expanded ? 'Menos filtros' : 'Más filtros'}
        </button>

        <div style={{ flex: 1 }} />

        <DiagnosticoButton />
        <ExportButton />

        {activeFilterCount > 0 ? (
          <button
            onClick={resetFilters}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              height: 34, padding: '0 16px',
              background: 'var(--color-primary)', border: 'none',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-on-dark)',
            }}
          >
            <DismissRegular style={{ width: 14, height: 14 }} />
            Limpiar filtros ({activeFilterCount})
          </button>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, height: 34,
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)',
          }}>
            <FilterRegular style={{ width: 13, height: 13 }} />
            Sin filtros activos
          </span>
        )}
      </div>

      {/* Chips de filtros activos — reflejan cualquier filtro (panel, gráficos, drill) */}
      {chips.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center',
          paddingBottom: 4, borderBottom: '1px dashed var(--color-gray-200)',
        }}>
          <span style={{ ...labelStyle, marginRight: 2 }}>Filtros activos</span>
          {chips.map(chip => (
            <span key={chip.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)',
              borderRadius: 'var(--radius-full)', padding: '2px 4px 2px 9px',
              fontFamily: 'var(--font-body)', fontSize: 11,
            }}>
              <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>{chip.label}:</span>
              <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {chip.value}
              </span>
              <button
                onClick={chip.remove}
                title="Quitar filtro"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: 'var(--radius-full)',
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  color: 'var(--color-primary-dark)', fontSize: 12, lineHeight: 1, padding: 0,
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Grid de dimensiones adicionales — colapsable */}
      {expanded && (
      <div className="fade-slide-in" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 12,
        alignItems: 'start',
      }}>
        <Field label="Tipo de interacción">
          <MultiSelect label="Todos" options={filterOptions.tipo_interaccion}
            value={filters.tipo_interaccion} onChange={v => setFilter('tipo_interaccion', v)} />
        </Field>
        <Field label="Mecanismo">
          <MultiSelect label="Todos" options={filterOptions.mecanismo_evaluacion}
            value={filters.mecanismo_evaluacion} onChange={v => setFilter('mecanismo_evaluacion', v)} />
        </Field>
        <Field label="Criterio">
          <SearchableMultiSelect label="Todos"
            options={filterOptions.criterios}
            value={filters.id_criterio}
            onChange={v => setFilter('id_criterio', v)}
            getValue={o => o.id} getLabel={o => o.nombre}
          />
        </Field>
        <Field label="Tipificación N1">
          <SearchableMultiSelect label="Todas" options={filterOptions.tipificacion_nivel_1}
            value={filters.tipificacion_nivel_1} onChange={onN1Change} {...asStr} />
        </Field>
        <Field label="Tipificación N2">
          <SearchableMultiSelect label="Todas" options={n2Options}
            value={filters.tipificacion_nivel_2} onChange={onN2Change} {...asStr} />
        </Field>
        <Field label="Tipificación N3">
          <SearchableMultiSelect label="Todas" options={n3Options}
            value={filters.nombre_tipificacion} onChange={v => setFilter('nombre_tipificacion', v)} {...asStr} />
        </Field>
        <Field label="Propietario">
          <SearchableMultiSelect label="Todos"
            options={filterOptions.agentes}
            value={filters.email_agente}
            onChange={v => setFilter('email_agente', v)}
            getValue={o => o.email} getLabel={o => o.nombre}
          />
        </Field>
        <Field label="Manager">
          <SearchableMultiSelect label="Todos"
            options={filterOptions.managers}
            value={filters.email_manager}
            onChange={v => setFilter('email_manager', v)}
            getValue={o => o.email} getLabel={o => o.nombre}
          />
        </Field>
        <Field label="N° caso (lista)">
          <MultiValueInput label="N° caso" placeholder="Pega o escribe casos…"
            value={filters.numero_caso} onChange={v => setFilter('numero_caso', v)} />
        </Field>
        <Field label="ID interacción (lista)">
          <MultiValueInput label="ID interacción" placeholder="Pega o escribe IDs…"
            value={filters.interaction_id} onChange={v => setFilter('interaction_id', v)} />
        </Field>
        <Field label="Seller (lista)">
          <MultiValueInput label="Seller" placeholder="Pega o escribe seller codes…"
            value={filters.seller_code} onChange={v => setFilter('seller_code', v)} />
        </Field>
      </div>
      )}
    </div>
  );
}
