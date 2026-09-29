/**
 * Inputs reutilizables del FilterBar de Reportería.
 * Adaptados del patrón MultiSelect/SearchableMultiSelect de Pauta, a tokens CSS.
 */

import { useState, useRef, useEffect } from 'react';
import { FilterRegular, DismissRegular } from '@fluentui/react-icons';

function useClickOutside(onOutside) {
  const ref = useRef(null);
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onOutside();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onOutside]);
  return ref;
}

const triggerStyle = (hasSelection) => ({
  display: 'flex', alignItems: 'center', gap: 6,
  height: 32, padding: '0 12px',
  background: hasSelection ? 'var(--color-primary-light)' : 'var(--color-surface)',
  border: `1px solid ${hasSelection ? 'var(--color-primary)' : 'var(--color-border)'}`,
  borderRadius: 'var(--radius-sm)', cursor: 'pointer',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  color: hasSelection ? 'var(--color-primary-dark)' : 'var(--color-fg-muted)',
  fontWeight: hasSelection ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
  whiteSpace: 'nowrap',
});

const dropdownStyle = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 'var(--z-dropdown)',
  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
  minWidth: 200, display: 'flex', flexDirection: 'column',
};

function ClearRow({ onClear }) {
  return (
    <div style={{ borderTop: '1px solid var(--color-gray-200)', padding: '4px 8px' }}>
      <button
        onClick={onClear}
        style={{
          width: '100%', padding: '6px 0', background: 'none', border: 'none',
          cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          color: 'var(--color-fg-muted)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 4,
        }}
      >
        <DismissRegular style={{ width: 12, height: 12 }} />
        Limpiar selección
      </button>
    </div>
  );
}

export function MultiSelect({ label, options, value, onChange, renderOption }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(() => setOpen(false));

  function toggle(opt) {
    if (value.includes(opt)) onChange(value.filter(v => v !== opt));
    else onChange([...value, opt]);
  }

  const hasSelection = value.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={triggerStyle(hasSelection)}>
        <FilterRegular style={{ width: 14, height: 14 }} />
        {hasSelection ? `${label} (${value.length})` : label}
      </button>

      {open && (
        <div style={{ ...dropdownStyle, maxHeight: 280 }}>
          <div style={{ overflowY: 'auto', padding: '4px 0' }}>
            {options.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 'var(--text-sm)',
                color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-body)' }}>
                Sin opciones
              </div>
            )}
            {options.map(opt => (
              <label key={opt} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 14px', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                color: 'var(--color-fg)',
              }}>
                <input
                  type="checkbox"
                  checked={value.includes(opt)}
                  onChange={() => toggle(opt)}
                  style={{ accentColor: 'var(--color-primary)', width: 14, height: 14, cursor: 'pointer' }}
                />
                {renderOption ? renderOption(opt) : opt}
              </label>
            ))}
          </div>
          {hasSelection && <ClearRow onClear={() => { onChange([]); setOpen(false); }} />}
        </div>
      )}
    </div>
  );
}

/**
 * MultiValueInput — filtro por lista de valores exactos (N° caso, ID interacción,
 * seller_code). Acepta escribir y Enter, o PEGAR una lista separada por comas,
 * espacios, punto y coma o saltos de línea (ej. columna copiada de Excel).
 * Los valores quedan como chips removibles; el match es exacto (Set).
 */
export function MultiValueInput({ label, placeholder, value, onChange }) {
  const [draft, setDraft] = useState('');

  function addValues(text) {
    const nuevos = text
      .split(/[\s,;]+/)
      .map(v => v.trim())
      .filter(v => v.length > 0 && !value.includes(v));
    if (nuevos.length > 0) onChange([...value, ...nuevos]);
  }

  function commitDraft() {
    if (draft.trim()) { addValues(draft); setDraft(''); }
  }

  const hasSelection = value.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder={hasSelection ? `${label} (${value.length})` : placeholder ?? label}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitDraft(); }
            if (e.key === 'Backspace' && !draft && hasSelection) onChange(value.slice(0, -1));
          }}
          onBlur={commitDraft}
          onPaste={e => {
            e.preventDefault();
            addValues(e.clipboardData.getData('text'));
            setDraft('');
          }}
          style={{
            height: 32, padding: '0 10px', width: '100%', boxSizing: 'border-box',
            border: `1px solid ${hasSelection ? 'var(--color-primary)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-sm)', outline: 'none',
            background: hasSelection ? 'var(--color-primary-light)' : 'var(--color-surface)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg)',
          }}
        />
      </div>
      {hasSelection && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {value.slice(0, 8).map(v => (
            <span key={v} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              background: 'var(--color-primary-light)', color: 'var(--color-primary-dark)',
              borderRadius: 'var(--radius-full)', padding: '1px 8px',
              fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
            }}>
              {v}
              <button
                onClick={() => onChange(value.filter(x => x !== v))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: 'var(--color-primary-dark)', lineHeight: 1, fontSize: 11 }}
              >×</button>
            </span>
          ))}
          {value.length > 8 && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--color-fg-subtle)' }}>
              +{value.length - 8} más
            </span>
          )}
          <button
            onClick={() => onChange([])}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--color-fg-muted)',
              textDecoration: 'underline' }}
          >
            limpiar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * SearchableSelect — selección ÚNICA con buscador (ej. elegir un agente).
 * value: id seleccionado o null. onChange(id|null).
 */
export function SearchableSelect({ label, options, value, onChange, getLabel, getValue, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useClickOutside(() => { setOpen(false); setSearch(''); });

  const selected = value != null ? options.find(o => getValue(o) === value) : null;
  const filtered = search.length > 0
    ? options.filter(o => getLabel(o).toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={ref} style={{ position: 'relative', minWidth: 240 }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...triggerStyle(selected != null), width: '100%', justifyContent: 'flex-start' }}>
        <FilterRegular style={{ width: 14, height: 14, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selected ? getLabel(selected) : (placeholder ?? label)}
        </span>
      </button>

      {open && (
        <div style={{ ...dropdownStyle, minWidth: 280 }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-gray-200)' }}>
            <input
              type="text"
              placeholder="Buscar…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                padding: '6px 8px', outline: 'none',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                color: 'var(--color-fg)', background: 'var(--color-bg-subtle)',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 260, padding: '4px 0' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 'var(--text-sm)',
                color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-body)' }}>
                Sin resultados
              </div>
            )}
            {filtered.map(opt => {
              const id = getValue(opt);
              const isSel = id === value;
              return (
                <button
                  key={id}
                  onClick={() => { onChange(isSel ? null : id); setOpen(false); setSearch(''); }}
                  style={{
                    width: '100%', display: 'block', textAlign: 'left',
                    padding: '7px 14px', border: 'none', cursor: 'pointer',
                    background: isSel ? 'var(--color-primary-light)' : 'transparent',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    color: isSel ? 'var(--color-primary-dark)' : 'var(--color-fg)',
                    fontWeight: isSel ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
                  }}
                >
                  {getLabel(opt)}
                </button>
              );
            })}
          </div>
          {selected && <ClearRow onClear={() => { onChange(null); setOpen(false); setSearch(''); }} />}
        </div>
      )}
    </div>
  );
}

export function SearchableMultiSelect({ label, options, value, onChange, getLabel, getValue }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useClickOutside(() => { setOpen(false); setSearch(''); });

  const filtered = search.length > 0
    ? options.filter(o => getLabel(o).toLowerCase().includes(search.toLowerCase()))
    : options;

  function toggle(opt) {
    const id = getValue(opt);
    if (value.includes(id)) onChange(value.filter(v => v !== id));
    else onChange([...value, id]);
  }

  const hasSelection = value.length > 0;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={triggerStyle(hasSelection)}>
        <FilterRegular style={{ width: 14, height: 14 }} />
        {hasSelection ? `${label} (${value.length})` : label}
      </button>

      {open && (
        <div style={{ ...dropdownStyle, minWidth: 260 }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-gray-200)' }}>
            <input
              type="text"
              placeholder="Buscar…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                padding: '6px 8px', outline: 'none',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                color: 'var(--color-fg)', background: 'var(--color-bg-subtle)',
              }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 240, padding: '4px 0' }}>
            {filtered.length === 0 && (
              <div style={{ padding: '10px 14px', fontSize: 'var(--text-sm)',
                color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-body)' }}>
                Sin resultados
              </div>
            )}
            {filtered.map(opt => {
              const id = getValue(opt);
              return (
                <label key={id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 14px', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  color: 'var(--color-fg)',
                }}>
                  <input
                    type="checkbox"
                    checked={value.includes(id)}
                    onChange={() => toggle(opt)}
                    style={{ accentColor: 'var(--color-primary)', width: 14, height: 14 }}
                  />
                  {getLabel(opt)}
                </label>
              );
            })}
          </div>
          {hasSelection && <ClearRow onClear={() => { onChange([]); setOpen(false); setSearch(''); }} />}
        </div>
      )}
    </div>
  );
}
