/**
 * EvalFormCiego — paso 1 de la calibración: voto a ciegas (spec 6.1).
 *
 * NUNCA consulta el veredicto de SAACA antes del submit: no hay badge de
 * resultado AUTO ni observación de la IA. Tampoco pide observación: el
 * auditor la escribe en el paso 2 (RevisionSaaca), ya frente a lo que dijo
 * SAACA, que es donde aporta valor.
 *
 * Solo se muestran los criterios asignados en pitch_muestra_calibracion
 * (prop assignedCriteria). La metadata (descripción, criticidad) llega con la
 * bandeja desde el catálogo canónico — no depende del mapping HUMANO por tipo
 * de interacción, que no existe para todos los tipos (p.ej. TASK_RECONTACT).
 */

import { useMemo, useState } from 'react';
import { CheckmarkCircleRegular, DismissCircleRegular } from '@fluentui/react-icons';
import { evaluarCalibracion } from '../../services/api.js';

// ÚNICAMENTE CUMPLE / NO_CUMPLE: la unidad de calibración siempre tiene un
// veredicto real de la IA (N/A y NO_EVALUADO se excluyen del universo desde
// la query de población) — el auditor nunca dictamina N/A.
export const RESULT_OPTIONS = [
  { value: 'CUMPLE',    label: 'Cumple',
    bg: 'var(--color-result-cumple-bg)', color: 'var(--color-result-cumple)', border: 'var(--color-green-300)' },
  { value: 'NO_CUMPLE', label: 'No cumple',
    bg: 'var(--color-result-no-cumple-bg)', color: 'var(--color-result-no-cumple)', border: 'var(--color-red-300)' },
];

/**
 * Props:
 *   interactionId, interactionType — de la muestra
 *   assignedCriteria — [{ criterion_id, criterion_name, criterion_description,
 *                         error_type, estado }] de la bandeja
 *   onSubmitted(revision) — callback tras guardar el voto, con la revisión
 *                           (voto a ciegas vs SAACA) para el paso 2
 */
export default function EvalFormCiego({ interactionId, interactionType, assignedCriteria, onSubmitted }) {
  const [selections, setSelections] = useState({});   // criterion_id → result_label
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  // Un criterio se evalúa una sola vez aunque llegue repetido: selections se
  // indexa por criterion_id, así que un duplicado dejaba el contador en "1/2".
  // Solo PENDIENTE: los EN_PROGRESO ya tienen voto a ciegas.
  const pendientes = useMemo(() => {
    const unicos = new Map();
    for (const c of assignedCriteria) {
      if (c.estado === 'PENDIENTE' && !unicos.has(c.criterion_id)) {
        unicos.set(c.criterion_id, c);
      }
    }
    return [...unicos.values()];
  }, [assignedCriteria]);

  const allEvaluated = pendientes.length > 0 && pendientes.every(c => selections[c.criterion_id]);

  async function handleSubmit() {
    if (!allEvaluated || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await evaluarCalibracion({
        interaction_id:   interactionId,
        interaction_type: interactionType,
        evaluations: pendientes.map(c => ({
          criterion_id: c.criterion_id,
          result_label: selections[c.criterion_id],
        })),
      });
      onSubmitted(response.revision);
    } catch (e) {
      setError(e.message ?? 'Error al enviar la evaluación');
    } finally {
      setSubmitting(false);
    }
  }

  if (pendientes.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-fg-subtle)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
        No quedan criterios pendientes en esta interacción.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--color-gray-200)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'var(--color-bg-subtle)',
      }}>
        <span style={{ fontFamily: 'var(--font-body)', fontWeight: 'var(--font-weight-semibold)',
          fontSize: 'var(--text-xs)', color: 'var(--color-black)' }}>
          Paso 1 · Voto a ciegas — SAACA se revela al guardar
        </span>
        <span style={{
          background: allEvaluated ? 'var(--color-result-cumple-bg)' : 'var(--color-warning-light)',
          color: allEvaluated ? 'var(--color-result-cumple)' : 'var(--color-orange-900)',
          borderRadius: 'var(--radius-full)', padding: '2px 10px',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          fontWeight: 'var(--font-weight-semibold)',
        }}>
          {Object.keys(selections).filter(k => pendientes.some(c => c.criterion_id === k)).length}/{pendientes.length} evaluados
        </span>
      </div>

      {/* Criterios asignados */}
      {pendientes.map((c, i) => {
        const selected = selections[c.criterion_id];
        return (
          <div key={c.criterion_id} style={{
            borderBottom: i < pendientes.length - 1 ? '1px solid var(--color-gray-100)' : 'none',
            padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                fontWeight: 'var(--font-weight-bold)', color: 'var(--color-gray-400)' }}>
                {c.criterion_id}
              </span>
              {c.error_type && (
                <span style={{
                  background: c.error_type === 'CRITICAL' ? 'var(--color-result-no-cumple-bg)' : 'var(--color-gray-100)',
                  color:      c.error_type === 'CRITICAL' ? 'var(--color-result-no-cumple)'    : 'var(--color-gray-700)',
                  borderRadius: 3, padding: '1px 6px',
                  fontFamily: 'var(--font-body)', fontSize: 9,
                  fontWeight: 'var(--font-weight-bold)',
                  textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
                }}>
                  {c.error_type === 'CRITICAL' ? 'CRÍTICO' : 'NO CRÍTICO'}
                </span>
              )}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-black)',
              lineHeight: 1.4, marginBottom: 2 }}>
              {c.criterion_name ?? c.criterion_id}
            </div>
            {c.criterion_description && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                color: 'var(--color-fg-muted)', lineHeight: 1.5, marginBottom: 8 }}>
                {c.criterion_description}
              </div>
            )}

            {/* Botones de resultado */}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {RESULT_OPTIONS.map(opt => {
                const isSel = selected === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSelections(s => ({ ...s, [c.criterion_id]: opt.value }))}
                    style={{
                      flex: 1, height: 30,
                      border: `1.5px solid ${isSel ? opt.border : 'var(--color-border)'}`,
                      background: isSel ? opt.bg : 'var(--color-bg-subtle)',
                      color: isSel ? opt.color : 'var(--color-fg-muted)',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                      fontWeight: isSel ? 'var(--font-weight-bold)' : 'var(--font-weight-regular)',
                      transition: 'var(--transition-fast)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {error && (
        <div style={{
          margin: '0 16px 8px', padding: '8px 12px',
          background: 'var(--color-danger-light)', border: '1px solid var(--color-red-300)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-red-900)',
        }}>
          {error}
        </div>
      )}

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-gray-200)' }}>
        <button
          onClick={handleSubmit}
          disabled={!allEvaluated || submitting}
          style={{
            width: '100%', height: 40,
            background: allEvaluated && !submitting ? 'var(--color-primary)' : 'var(--color-gray-400)',
            color: 'var(--color-fg-on-dark)', border: 'none', borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-weight-bold)',
            cursor: allEvaluated && !submitting ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {submitting
            ? 'Enviando…'
            : allEvaluated
            ? <><CheckmarkCircleRegular style={{ width: 16, height: 16 }} /> Guardar voto y ver a SAACA</>
            : <><DismissCircleRegular style={{ width: 16, height: 16 }} /> Evalúa todos los criterios asignados</>
          }
        </button>
      </div>
    </div>
  );
}
