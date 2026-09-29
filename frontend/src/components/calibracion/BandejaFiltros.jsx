/**
 * BandejaFiltros — barra de filtros de la bandeja de calibración.
 * Componente controlado: la lógica pura vive en utils/bandejaFilters.js.
 */

import { DismissRegular, SearchRegular } from '@fluentui/react-icons';
import { MultiSelect } from '../reporteria/inputs.jsx';
import { DEFAULT_BANDEJA_FILTERS, ESTADOS_BANDEJA, ESTADO_LABEL, filtrosActivos } from '../../utils/bandejaFilters.js';

const inputStyle = {
  height: 32, padding: '0 10px', boxSizing: 'border-box',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  background: 'var(--color-surface)', outline: 'none',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg)',
};

const labelStyle = {
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  color: 'var(--color-fg-subtle)',
};

/**
 * Props:
 *   filters, onChange(nuevosFiltros) — estado controlado
 *   opciones — resultado de opcionesBandeja(items)
 */
export default function BandejaFiltros({ filters, onChange, opciones }) {
  const set = (key) => (value) => onChange({ ...filters, [key]: value });
  const activos = filtrosActivos(filters);

  return (
    <div style={{
      padding: '12px 20px', borderBottom: '1px solid var(--color-gray-200)',
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      background: 'var(--color-bg-subtle)',
    }}>
      <div style={{ position: 'relative' }}>
        <SearchRegular style={{
          position: 'absolute', left: 9, top: 9, width: 14, height: 14, color: 'var(--color-fg-subtle)',
        }} />
        <input
          type="search"
          placeholder="Caso, interacción o agente"
          value={filters.texto}
          onChange={e => set('texto')(e.target.value)}
          style={{ ...inputStyle, width: 230, paddingLeft: 28 }}
        />
      </div>

      <MultiSelect
        label="Estado" options={ESTADOS_BANDEJA} value={filters.estado} onChange={set('estado')}
        renderOption={e => ESTADO_LABEL[e] ?? e}
      />
      <MultiSelect label="Tipo" options={opciones.tipos} value={filters.tipo} onChange={set('tipo')} />
      <MultiSelect label="País" options={opciones.paises} value={filters.pais} onChange={set('pais')} />
      <MultiSelect
        label="Criterio" options={opciones.criterios} value={filters.criterio} onChange={set('criterio')}
        renderOption={id => `${id} · ${opciones.criterioNombre[id] ?? ''}`}
      />
      <MultiSelect
        label="Batch" options={opciones.batches} value={filters.batch} onChange={set('batch')}
        renderOption={id => `${opciones.batchFecha[id] || 's/f'} · ${id.slice(0, 8)}`}
      />

      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={labelStyle}>Asignado desde</span>
        <input type="date" value={filters.desde} max={filters.hasta || undefined}
          onChange={e => set('desde')(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={labelStyle}>hasta</span>
        <input type="date" value={filters.hasta} min={filters.desde || undefined}
          onChange={e => set('hasta')(e.target.value)} style={inputStyle} />
      </label>

      {activos > 0 && (
        <button
          onClick={() => onChange(DEFAULT_BANDEJA_FILTERS)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, height: 32, padding: '0 10px',
            border: 'none', background: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-muted)',
            textDecoration: 'underline',
          }}
        >
          <DismissRegular style={{ width: 12, height: 12 }} />
          Limpiar filtros ({activos})
        </button>
      )}
    </div>
  );
}
