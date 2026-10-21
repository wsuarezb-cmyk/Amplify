/**
 * RevisionSaaca — paso 2 de la calibración: el auditor ve su voto a ciegas
 * frente al veredicto y la observación de SAACA, puede reconsiderar su voto
 * y escribe su observación. La observación es obligatoria donde hay
 * desacuerdo (voto final ≠ SAACA) o si cambió su voto tras leer a SAACA.
 *
 * Solo cuenta el voto final: es el que se guarda en saaca_eval_detail.
 */

import { useEffect, useState } from 'react';
import { CheckmarkCircleRegular, InfoRegular } from '@fluentui/react-icons';
import { confirmarCalibracion, getRevision } from '../../services/api.js';
import { MIN_OBSERVACION, observacionValida, puedeConfirmar, requiereObservacion } from '../../utils/revision.js';
import { RESULT_OPTIONS } from './EvalFormCiego.jsx';
import { ResultChip } from './ComparacionReveal.jsx';
import LoadingNotice from './LoadingNotice.jsx';

const labelStyle = {
  fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--color-fg-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
};

/**
 * Props:
 *   interactionId, interactionType
 *   revision — (opcional) RevisionResponse ya recibida tras el voto a ciegas;
 *              si no viene (caso retomado desde la bandeja) se consulta.
 *   onConfirmed(response) — callback tras guardar el voto final
 */
export default function RevisionSaaca({ interactionId, interactionType, revision: inicial, onConfirmed }) {
  const [revision, setRevision] = useState(inicial ?? null);
  const [finales, setFinales]   = useState({});   // criterion_id → voto final
  const [obs, setObs]           = useState({});   // criterion_id → observación
  const [error, setError]       = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (inicial) return;
    let cancelled = false;
    getRevision(interactionId)
      .then(d => { if (!cancelled) setRevision(d); })
      .catch(e => { if (!cancelled) setError(e.message ?? 'Error al cargar la revisión'); });
    return () => { cancelled = true; };
  }, [interactionId, inicial]);

  // El voto final arranca igual al voto a ciegas
  useEffect(() => {
    if (!revision) return;
    setFinales(Object.fromEntries(revision.criterios.map(c => [c.criterion_id, c.resultado_ciego])));
  }, [revision]);

  if (!revision) {
    return error
      ? <div style={{ padding: '12px 16px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          color: 'var(--color-red-900)' }}>{error}</div>
      : <LoadingNotice label="Cargando lo que dijo SAACA…" />;
  }

  const criterios = revision.criterios;
  if (criterios.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-fg-subtle)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
        No hay criterios en revisión para esta interacción.
      </div>
    );
  }

  const listo = puedeConfirmar(criterios, finales, obs);

  async function handleConfirm() {
    if (!listo || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await confirmarCalibracion({
        interaction_id:   interactionId,
        interaction_type: interactionType,
        evaluations: criterios.map(c => ({
          criterion_id: c.criterion_id,
          result_label: finales[c.criterion_id],
          observation:  obs[c.criterion_id]?.trim() || null,
        })),
      });
      onConfirmed(response);
    } catch (e) {
      setError(e.message ?? 'Error al guardar la calibración');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--color-orange-300)',
        background: 'var(--color-primary-light)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-orange-900)',
      }}>
        Paso 2 · Revisa lo que dijo SAACA — puedes mantener o cambiar tu voto
      </div>

      {criterios.map((c, i) => {
        const final = finales[c.criterion_id];
        const coincide = final === c.resultado_saaca;
        const cambio = final !== c.resultado_ciego;
        const obligatoria = final && requiereObservacion(c.resultado_ciego, c.resultado_saaca, final);
        const texto = obs[c.criterion_id] ?? '';
        const falta = obligatoria && !observacionValida(texto);

        return (
          <div key={c.criterion_id} style={{
            padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8,
            borderBottom: i < criterios.length - 1 ? '1px solid var(--color-gray-100)' : 'none',
          }}>
            {/* Criterio */}
            <div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10,
                fontWeight: 'var(--font-weight-bold)', color: 'var(--color-gray-400)' }}>
                {c.criterion_id}
              </span>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-black)', lineHeight: 1.4 }}>
                {c.criterion_name ?? c.criterion_id}
              </div>
              {c.criterion_description && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                  color: 'var(--color-fg-muted)', lineHeight: 1.5 }}>
                  {c.criterion_description}
                </div>
              )}
            </div>

            {/* Tu voto a ciegas vs SAACA */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={labelStyle}>Tu voto a ciegas</span>
                <ResultChip resultado={c.resultado_ciego} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={labelStyle}>SAACA</span>
                <ResultChip resultado={c.resultado_saaca} />
              </div>
            </div>

            <div style={{
              padding: '8px 10px', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg-subtle)', border: '1px solid var(--color-gray-200)',
            }}>
              <div style={{ ...labelStyle, marginBottom: 3 }}>Observación de SAACA</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                color: 'var(--color-gray-900)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                {c.observacion_saaca
                  || <span style={{ color: 'var(--color-gray-400)', fontStyle: 'italic' }}>Sin observación registrada</span>}
              </div>
            </div>

            {/* Voto final */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={labelStyle}>Tu voto final</span>
                {final && (
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 'var(--font-weight-bold)',
                    color: coincide ? 'var(--color-result-cumple)' : 'var(--color-result-no-cumple)',
                  }}>
                    {coincide ? '✓ Coincide con SAACA' : '✗ Difiere de SAACA'}
                    {cambio ? ' · cambiaste tu voto' : ''}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {RESULT_OPTIONS.map(opt => {
                  const isSel = final === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setFinales(s => ({ ...s, [c.criterion_id]: opt.value }))}
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

            {/* Observación del auditor */}
            <div>
              <textarea
                placeholder={obligatoria
                  ? '¿Por qué difieres de SAACA o cambiaste tu voto? (obligatoria)'
                  : 'Observación (opcional)'}
                value={texto}
                onChange={e => setObs(o => ({ ...o, [c.criterion_id]: e.target.value }))}
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  border: `1px solid ${falta ? 'var(--color-orange-300)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 8px', resize: 'vertical', outline: 'none',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg)',
                }}
              />
              {falta && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2,
                  fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--color-orange-900)' }}>
                  <InfoRegular style={{ width: 12, height: 12 }} />
                  Observación obligatoria (mínimo {MIN_OBSERVACION} caracteres).
                </div>
              )}
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
          onClick={handleConfirm}
          disabled={!listo || submitting}
          style={{
            width: '100%', height: 40,
            background: listo && !submitting ? 'var(--color-primary)' : 'var(--color-gray-400)',
            color: 'var(--color-fg-on-primary)', border: 'none', borderRadius: 'var(--radius-sm)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-weight-bold)',
            cursor: listo && !submitting ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          <CheckmarkCircleRegular style={{ width: 16, height: 16 }} />
          {submitting ? 'Guardando…' : listo ? 'Confirmar calibración' : 'Completa las observaciones obligatorias'}
        </button>
      </div>
    </div>
  );
}
