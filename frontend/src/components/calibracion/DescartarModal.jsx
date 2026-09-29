/**
 * DescartarModal — descarte de una interacción asignada con motivo obligatorio.
 */

import { useState } from 'react';
import { descartarCalibracion } from '../../services/api.js';

export default function DescartarModal({ interactionId, onClose, onDiscarded }) {
  const [motivo, setMotivo]         = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  const valido = motivo.trim().length >= 5;

  async function handleConfirm() {
    if (!valido || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await descartarCalibracion({ interaction_id: interactionId, motivo: motivo.trim() });
      onDiscarded(res);
    } catch (e) {
      setError(e.message ?? 'Error al descartar');
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 'var(--z-modal)',
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }}>
      <div style={{
        background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)', width: '100%', maxWidth: 440,
        padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-weight-bold)',
          fontSize: 'var(--text-md)', color: 'var(--color-black)' }}>
          Descartar interacción
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--color-fg-muted)', lineHeight: 1.5 }}>
          El descarte saca esta interacción de tu bandeja. Vuelve a ser elegible
          para muestreo después de 90 días. El motivo es obligatorio.
        </div>

        <textarea
          autoFocus
          placeholder="Motivo del descarte (mínimo 5 caracteres)…"
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            padding: '8px 10px', resize: 'vertical', outline: 'none',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            color: 'var(--color-fg)',
          }}
        />

        {error && (
          <div style={{
            padding: '8px 12px', background: 'var(--color-danger-light)',
            border: '1px solid var(--color-red-300)', borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-red-900)',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '8px 16px', background: 'var(--color-surface)',
              border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              color: 'var(--color-fg-muted)',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={!valido || submitting}
            style={{
              padding: '8px 18px', border: 'none', borderRadius: 'var(--radius-sm)',
              background: valido && !submitting ? 'var(--color-danger)' : 'var(--color-gray-400)',
              color: 'var(--color-fg-on-dark)',
              cursor: valido && !submitting ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            {submitting ? 'Descartando…' : 'Descartar'}
          </button>
        </div>
      </div>
    </div>
  );
}
