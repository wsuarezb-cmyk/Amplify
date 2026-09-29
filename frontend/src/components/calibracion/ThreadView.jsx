/**
 * ThreadView — render puro del hilo del caso (sin formulario embebido).
 *
 * Diseño confirmado: se muestra el hilo COMPLETO del caso para contexto;
 * la interacción asignada en la muestra se resalta como "EVALUADA".
 * El modo ciego aplica solo al veredicto de SAACA — el contenido del hilo
 * siempre es visible.
 *
 * El body de cada bloque empieza con "ID: {interaction_id}" (insertado por el
 * backend); se extrae para identificar el bloque objetivo y se oculta del texto.
 */

import { useMemo, useState } from 'react';
import { ChevronRightRegular, ChevronDownRegular } from '@fluentui/react-icons';
import { cleanThreadText, parseThreadBlocks } from '../../utils/thread.js';

// Colores por tipo de bloque — tokens del design system (keyed por el label
// que genera el backend; mantener sincronizado con _TYPE_LABEL en interaction.py).
const BLOCK_COLORS = {
  'APERTURA DEL CASO':        { bg: 'var(--color-blue-100)',   border: 'var(--color-blue-300)',   text: 'var(--color-blue-900)' },
  'EMAIL':                    { bg: 'var(--color-blue-100)',   border: 'var(--color-blue-300)',   text: 'var(--color-blue-700)' },
  'SOLICITUD AL SELLER':      { bg: 'var(--color-orange-100)', border: 'var(--color-orange-300)', text: 'var(--color-orange-900)' },
  'RESPUESTA DEL SELLER':     { bg: 'var(--color-green-100)',  border: 'var(--color-green-300)',  text: 'var(--color-green-900)' },
  'SOLICITUD DE INFORMACIÓN': { bg: 'var(--color-orange-100)', border: 'var(--color-orange-300)', text: 'var(--color-orange-900)' },
  'REAPERTURA':               { bg: 'var(--color-red-100)',    border: 'var(--color-red-300)',    text: 'var(--color-red-900)' },
  'RECONTACTO':               { bg: 'var(--color-red-100)',    border: 'var(--color-red-300)',    text: 'var(--color-red-700)' },
  'GESTIÓN INTERNA':          { bg: 'var(--color-gray-100)',   border: 'var(--color-gray-300)',   text: 'var(--color-gray-800)' },
  DEFAULT:                    { bg: 'var(--color-gray-100)',   border: 'var(--color-gray-300)',   text: 'var(--color-gray-700)' },
};

function getBlockColors(type) {
  for (const key of Object.keys(BLOCK_COLORS)) {
    if (type.startsWith(key)) return BLOCK_COLORS[key];
  }
  return BLOCK_COLORS.DEFAULT;
}

function extractInteractionId(body) {
  const m = body?.match(/^ID: ([^\n]+)/);
  return m ? m[1].trim() : null;
}

function stripIdLine(body) {
  return body?.replace(/^ID: [^\n]+\n?/, '') ?? '';
}

function ThreadBlockView({ block, isTarget }) {
  const [expanded, setExpanded] = useState(isTarget);
  const colors = getBlockColors(block.type);
  const displayBody = stripIdLine(block.body);

  return (
    <div style={{
      borderRadius: 'var(--radius-md)',
      border: isTarget
        ? '2px solid var(--color-primary)'
        : `1px solid ${colors.border}`,
      boxShadow: isTarget ? '0 0 0 3px var(--color-primary-light)' : 'none',
      background: expanded ? colors.bg : 'var(--color-surface)',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 14px', background: 'none', border: 'none',
          cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ color: isTarget ? 'var(--color-primary-dark)' : colors.text, flexShrink: 0, display: 'flex' }}>
          {expanded
            ? <ChevronDownRegular style={{ fontSize: 14 }} />
            : <ChevronRightRegular style={{ fontSize: 14 }} />}
        </span>
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          fontWeight: 'var(--font-weight-bold)',
          color: isTarget ? 'var(--color-primary-dark)' : colors.text,
          textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
        }}>
          {block.type}
        </span>
        {isTarget && (
          <span style={{
            background: 'var(--color-primary)', color: 'var(--color-fg-on-dark)',
            borderRadius: 'var(--radius-sm)', padding: '1px 7px',
            fontFamily: 'var(--font-body)', fontSize: 9,
            fontWeight: 'var(--font-weight-bold)',
          }}>
            EVALUADA
          </span>
        )}
        <span style={{ flex: 1 }} />
        {block.date && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
            color: 'var(--color-fg-subtle)', flexShrink: 0,
          }}>
            {block.date}
          </span>
        )}
      </button>

      {expanded && displayBody && (
        <pre style={{
          margin: 0, padding: '12px 16px',
          borderTop: `1px solid ${colors.border}`,
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          lineHeight: 1.6, color: 'var(--color-gray-900)',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {displayBody}
        </pre>
      )}
    </div>
  );
}

/**
 * Props:
 *   sellerThreadText / internalThreadText — texto crudo del backend
 *   targetInteractionId — interaction_id asignado en la muestra (highlight)
 */
export default function ThreadView({ sellerThreadText, internalThreadText, targetInteractionId }) {
  const blocks = useMemo(() => {
    const seller   = parseThreadBlocks(cleanThreadText(sellerThreadText));
    const internal = parseThreadBlocks(cleanThreadText(internalThreadText));
    return [...seller, ...internal].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
  }, [sellerThreadText, internalThreadText]);

  if (blocks.length === 0) {
    return (
      <div style={{
        padding: 32, textAlign: 'center',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
        color: 'var(--color-fg-subtle)', background: 'var(--color-bg-subtle)',
        borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)',
      }}>
        No se encontró hilo para este caso.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {blocks.map(block => (
        <ThreadBlockView
          key={`${block.id}-${block.date}`}
          block={block}
          isTarget={targetInteractionId != null && extractInteractionId(block.body) === targetInteractionId}
        />
      ))}
    </div>
  );
}
