/**
 * CalibracionCaso — calibración de una interacción asignada, en dos pasos.
 *
 * Layout: hilo COMPLETO del caso a la izquierda (contexto, con la interacción
 * asignada resaltada) + detalle de la interacción y el paso actual a la derecha:
 *   ciego      → EvalFormCiego: voto sin ver a SAACA (criterios PENDIENTE)
 *   revision   → RevisionSaaca: voto a ciegas vs SAACA, voto final + observación
 *                (criterios EN_PROGRESO; se retoma si el auditor salió a mitad)
 *   completado → ComparacionReveal: resultado final guardado
 *
 * Los datos de la asignación llegan por navigate state desde la bandeja;
 * si se entra por URL directa, se recuperan desde el inbox.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeftRegular, DismissCircleRegular } from '@fluentui/react-icons';

import { getCalibracionInbox, getCaseThread, getInputDetail } from '../services/api.js';
import { cleanFieldText } from '../utils/thread.js';
import ThreadView from '../components/calibracion/ThreadView.jsx';
import EvalFormCiego from '../components/calibracion/EvalFormCiego.jsx';
import ComparacionReveal from '../components/calibracion/ComparacionReveal.jsx';
import RevisionSaaca from '../components/calibracion/RevisionSaaca.jsx';
import DescartarModal from '../components/calibracion/DescartarModal.jsx';
import LoadingNotice from '../components/calibracion/LoadingNotice.jsx';

// Campos legibles del detalle de la interacción (input-detail)
const FIELD_LABEL = {
  interaction_date: 'Fecha', case_number: 'Caso', case_country: 'País',
  owner_name: 'Agente', owner_email: 'Email agente', owner_department: 'Equipo',
  task_subject: 'Asunto', email_to: 'Destinatario', email_body: 'Cuerpo del email',
  task_description: 'Descripción / Comentario', task_status: 'Estado tarea',
  reopening_reason: 'Motivo de reapertura', reopen_context: 'Contexto reapertura',
  recontact_reason: 'Motivo recontacto', recontact_within_sla: 'Dentro de SLA',
  case_state_at_recontact: 'Estado caso al recontactar',
  task_hours_elapsed: 'Horas transcurridas', task_hours_business: 'Horas hábiles',
  case_description: 'Descripción del caso', case_closure_reason: 'Razón de cierre',
  tipificacion_level_1_final: 'Tipificación L1', tipificacion_level_2_final: 'Tipificación L2',
  tipificacion_name_final: 'Tipificación nombre',
  case_impactonorders: 'Impacto en órdenes', case_skuimpact: 'SKUs impactados',
  case_duplicate: 'Caso duplicado',
};

const HIDDEN_FIELDS = new Set(['interaction_id', 'interaction_type']);
const LONG_TEXT_FIELDS = new Set(['email_body', 'task_description', 'reopen_context', 'case_description']);

function InteractionDetailCard({ interactionId, interactionType }) {
  const [fields, setFields]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [copiado, setCopiado] = useState(false);

  function copiarId() {
    navigator.clipboard?.writeText(interactionId).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInputDetail(interactionId, interactionType)
      .then(d => { if (!cancelled) setFields(d.fields ?? {}); })
      .catch(() => { if (!cancelled) setFields(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [interactionId, interactionType]);

  const entries = fields
    ? Object.entries(fields).filter(([k, v]) => !HIDDEN_FIELDS.has(k) && v != null && v !== '')
    : [];

  return (
    <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {/* ID de la interacción — siempre visible, copiable para buscar en Salesforce */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        borderBottom: '1px solid var(--color-gray-100)', paddingBottom: 5,
      }}>
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-muted)',
          minWidth: 140, flexShrink: 0, textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
        }}>
          ID Interacción
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)',
          color: 'var(--color-gray-900)', wordBreak: 'break-all', flex: 1,
        }}>
          {interactionId}
        </span>
        <button
          onClick={copiarId}
          title="Copiar ID para buscar en Salesforce"
          style={{
            flexShrink: 0, padding: '2px 10px',
            border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
            background: copiado ? 'var(--color-success-light)' : 'var(--color-surface)',
            cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 10,
            fontWeight: 'var(--font-weight-semibold)',
            color: copiado ? 'var(--color-green-900)' : 'var(--color-fg-muted)',
          }}
        >
          {copiado ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>

      {loading && <LoadingNotice label="Cargando detalle de la interacción…" height={40} />}
      {!loading && fields === null && (
        <div style={{ color: 'var(--color-orange-900)', fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-xs)', padding: '6px 8px',
          background: 'var(--color-warning-light)', borderRadius: 'var(--radius-sm)' }}>
          No se pudo cargar el detalle — el hilo del caso sigue disponible como contexto.
        </div>
      )}
      {!loading && entries.map(([k, v]) => (
        <div key={k} style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          borderBottom: '1px solid var(--color-gray-100)', paddingBottom: 5,
        }}>
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-muted)',
            minWidth: 140, flexShrink: 0, textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wide)', paddingTop: 1,
          }}>
            {FIELD_LABEL[k] ?? k}
          </span>
          {LONG_TEXT_FIELDS.has(k) ? (
            <pre style={{
              margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              color: 'var(--color-gray-900)', lineHeight: 1.55,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1,
            }}>
              {cleanFieldText(v)}
            </pre>
          ) : (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              color: 'var(--color-gray-900)', lineHeight: 1.4, flex: 1,
            }}>
              {String(v)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function CalibracionCaso() {
  const { interaction_id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [item, setItem]           = useState(location.state?.item ?? null);
  const [thread, setThread]       = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [revision, setRevision]           = useState(null);  // RevisionResponse tras el voto a ciegas
  const [confirmResult, setConfirmResult] = useState(null);  // ConfirmarResponse tras el voto final
  const [showDescartar, setShowDescartar] = useState(false);

  // Recuperar la asignación si se entró por URL directa (sin navigate state)
  useEffect(() => {
    if (item || !interaction_id) return;
    getCalibracionInbox()
      .then(data => {
        const found = data.items.find(i => i.interaction_id === interaction_id);
        if (found) setItem(found);
        else setError('Esta interacción no está asignada a tu bandeja.');
      })
      .catch(e => setError(e.message ?? 'Error al cargar la asignación'));
  }, [interaction_id, item]);

  // Cargar el hilo del caso cuando conocemos el numero_caso
  useEffect(() => {
    if (!item?.numero_caso) {
      if (item) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getCaseThread(item.numero_caso)
      .then(d => { if (!cancelled) setThread(d); })
      .catch(e => { if (!cancelled) setError(e.message ?? 'Error al cargar el hilo'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [item?.numero_caso]);

  const pendientes = useMemo(
    () => (item?.criterios ?? []).filter(c => c.estado === 'PENDIENTE' || c.estado === 'EN_PROGRESO'),
    [item],
  );

  // PENDIENTE manda: si falta algún voto a ciegas, primero se vota; si todo
  // está votado (EN_PROGRESO), el caso se retoma directo en la revisión.
  const fase = confirmResult ? 'completado'
    : revision ? 'revision'
    : pendientes.some(c => c.estado === 'PENDIENTE') ? 'ciego'
    : pendientes.length > 0 ? 'revision'
    : 'ciego';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', gap: 14 }}>

      {/* Header */}
      <div style={{
        background: 'var(--color-surface)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
        padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <button
          onClick={() => navigate('/calibracion')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-medium)',
            color: 'var(--color-primary-dark)',
          }}
        >
          <ArrowLeftRegular style={{ fontSize: 14 }} />
          Mi bandeja
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--color-border)' }} />

        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 'var(--font-weight-bold)',
          fontSize: 'var(--text-sm)', color: 'var(--color-black)' }}>
          {item?.numero_caso ?? interaction_id}
        </span>
        {item && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
            color: 'var(--color-fg-muted)' }}>
            {item.interaction_type} · {item.pais ?? '—'} · {item.nombre_agente ?? '—'}
          </span>
        )}

        {fase !== 'completado' && pendientes.length > 0 && (
          <button
            onClick={() => setShowDescartar(true)}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', border: '1px solid var(--color-red-300)',
              borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-xs)', fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-danger)',
            }}
          >
            <DismissCircleRegular style={{ fontSize: 14 }} />
            Descartar
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '14px 18px', background: 'var(--color-danger-light)',
          border: '1px solid var(--color-red-300)', borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-red-900)',
        }}>
          {error}
        </div>
      )}

      {!error && item && (
        <div className="chart-grid-2" style={{ alignItems: 'start' }}>

          {/* Columna izquierda: hilo completo del caso */}
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
            padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-weight-bold)', color: 'var(--color-fg-muted)',
              textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
              Hilo del caso {thread ? `· ${thread.total_tasks} eventos` : ''}
            </div>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-fg-subtle)',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
                Cargando hilo…
              </div>
            ) : (
              <ThreadView
                sellerThreadText={thread?.seller_thread_text}
                internalThreadText={thread?.internal_thread_text}
                targetInteractionId={item.interaction_id}
              />
            )}
          </div>

          {/* Columna derecha: detalle + evaluación ciega / comparación */}
          <div style={{
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 16px', borderBottom: '1px solid var(--color-gray-200)',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-weight-bold)', color: 'var(--color-fg-muted)',
              textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
            }}>
              Interacción evaluada
            </div>
            <InteractionDetailCard
              interactionId={item.interaction_id}
              interactionType={item.interaction_type}
            />

            <div style={{ borderTop: '2px solid var(--color-gray-200)' }}>
              {fase === 'completado' && (
                <ComparacionReveal
                  interactionId={item.interaction_id}
                  inconsistente={confirmResult.estado_muestra_inconsistente}
                />
              )}
              {fase === 'revision' && (
                <RevisionSaaca
                  interactionId={item.interaction_id}
                  interactionType={item.interaction_type}
                  revision={revision}
                  onConfirmed={setConfirmResult}
                />
              )}
              {fase === 'ciego' && (
                <EvalFormCiego
                  interactionId={item.interaction_id}
                  interactionType={item.interaction_type}
                  assignedCriteria={item.criterios}
                  onSubmitted={setRevision}
                />
              )}
            </div>

            {fase === 'completado' && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-gray-200)' }}>
                <button
                  onClick={() => navigate('/calibracion')}
                  style={{
                    width: '100%', height: 38,
                    background: 'var(--color-primary)', color: 'var(--color-fg-on-dark)',
                    border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--font-weight-bold)',
                  }}
                >
                  Volver a la bandeja
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showDescartar && (
        <DescartarModal
          interactionId={interaction_id}
          onClose={() => setShowDescartar(false)}
          onDiscarded={() => navigate('/calibracion')}
        />
      )}
    </div>
  );
}
