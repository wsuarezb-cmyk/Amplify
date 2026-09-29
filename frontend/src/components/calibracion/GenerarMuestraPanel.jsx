/**
 * GenerarMuestraPanel — flujo de dos pasos del líder de calidad:
 *
 * 1. Período → "Ver tamaño ideal": muestra el n de Cochran (informativo,
 *    no genera nada).
 * 2. El líder ingresa capacidad_objetivo (capacidad real del equipo) →
 *    "Calcular cobertura": asignación por estrato (pisos + prioridad
 *    CRITICAL + reparto proporcional) y desglose de cobertura
 *    COMPLETA / PARCIAL / SIN COBERTURA por criticidad.
 * 3. Distribuir el total asignado entre auditores → "Generar" confirma:
 *    recién ahí ocurre la selección aleatoria y la inserción.
 */

import { useMemo, useState } from 'react';
import { AddRegular, DeleteRegular } from '@fluentui/react-icons';
import { getMuestraPreview, generarMuestra } from '../../services/api.js';

const inputStyle = {
  height: 32, padding: '0 10px', boxSizing: 'border-box',
  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
  color: 'var(--color-fg)', background: 'var(--color-surface)', outline: 'none',
};

const fieldLabelStyle = {
  display: 'flex', flexDirection: 'column', gap: 4,
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
  fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-muted)',
  textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
};

const COBERTURA_STYLE = {
  COMPLETA:      { color: 'var(--color-result-cumple)',      label: 'Completa' },
  PARCIAL:       { color: 'var(--color-score-medium)',       label: 'Parcial' },
  SIN_COBERTURA: { color: 'var(--color-result-no-cumple)',   label: 'Sin cobertura' },
};

function CoberturaResumenCard({ resumen }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {['CRITICAL', 'NON_CRITICAL'].map(grupo => {
        const r = resumen?.[grupo];
        if (!r) return null;
        return (
          <div key={grupo} style={{
            flex: '1 1 220px',
            background: 'var(--color-surface)', border: '1px solid var(--color-gray-200)',
            borderRadius: 'var(--radius-sm)', padding: '10px 14px',
          }}>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              fontWeight: 'var(--font-weight-bold)',
              color: grupo === 'CRITICAL' ? 'var(--color-result-no-cumple)' : 'var(--color-fg-muted)',
              textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 6,
            }}>
              Estratos {grupo === 'CRITICAL' ? 'críticos' : 'no críticos'}
            </div>
            <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
              {Object.entries(COBERTURA_STYLE).map(([key, s]) => (
                <span key={key} style={{ color: s.color }}>
                  <b style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>{r[key]}</b> {s.label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function GenerarMuestraPanel({ onGenerated }) {
  const [fechaStart, setFechaStart] = useState('');
  const [fechaEnd, setFechaEnd]     = useState('');
  const [capacidad, setCapacidad]   = useState('');
  const [preview, setPreview]       = useState(null);   // último preview (con o sin capacidad)
  const [distribucion, setDistribucion] = useState([{ auditor_email: '', cantidad: '' }]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError]           = useState(null);
  const [success, setSuccess]       = useState(null);
  const [showEstratos, setShowEstratos] = useState(false);

  const conCapacidad = preview?.total_asignado != null;

  const totalDistribuido = useMemo(
    () => distribucion.reduce((acc, d) => acc + (parseInt(d.cantidad, 10) || 0), 0),
    [distribucion],
  );

  async function fetchPreview(capacidadNum) {
    if (!fechaStart || !fechaEnd) { setError('Ingresa el período primero.'); return; }
    setLoadingPreview(true);
    setError(null);
    setSuccess(null);
    try {
      setPreview(await getMuestraPreview(fechaStart, fechaEnd, capacidadNum));
    } catch (e) {
      setError(e.message ?? 'Error al calcular el preview');
    } finally {
      setLoadingPreview(false);
    }
  }

  function handleVerIdeal() {
    setPreview(null);
    fetchPreview(null);
  }

  function handleCalcularCobertura() {
    const cap = parseInt(capacidad, 10);
    if (!cap || cap <= 0) { setError('Ingresa una capacidad objetivo válida (> 0).'); return; }
    fetchPreview(cap);
  }

  async function handleGenerar() {
    if (!conCapacidad) { setError('Calcula la cobertura con tu capacidad objetivo primero.'); return; }
    const dist = distribucion
      .filter(d => d.auditor_email.trim() && parseInt(d.cantidad, 10) > 0)
      .map(d => ({ auditor_email: d.auditor_email.trim().toLowerCase(), cantidad: parseInt(d.cantidad, 10) }));
    if (dist.length === 0) { setError('Agrega al menos un auditor con cantidad.'); return; }
    if (totalDistribuido !== preview.total_asignado) {
      setError(`La distribución suma ${totalDistribuido} pero la asignación es de ${preview.total_asignado}.`);
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await generarMuestra({
        fecha_start: fechaStart,
        fecha_end: fechaEnd,
        capacidad_objetivo: preview.capacidad_objetivo,
        distribucion: dist,
      });
      setSuccess(
        `✓ Muestra generada: ${res.total_insertados} unidades en ${res.total_estratos} estratos ` +
        `(batch ${res.batch_id.slice(0, 8)}…)`
      );
      setPreview(null);
      setCapacidad('');
      setDistribucion([{ auditor_email: '', cantidad: '' }]);
      if (onGenerated) onGenerated();
    } catch (e) {
      setError(e.message ?? 'Error al generar la muestra');
    } finally {
      setGenerating(false);
    }
  }

  function updateDist(i, key, val) {
    setDistribucion(d => d.map((row, idx) => idx === i ? { ...row, [key]: val } : row));
  }

  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)',
      padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-weight-bold)',
          fontSize: 'var(--text-base)', color: 'var(--color-black)' }}>
          Generar muestra de calibración
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          color: 'var(--color-fg-subtle)', marginTop: 2 }}>
          Cochran por estrato como referencia (Z=1.96, p=0.5, margen 10% crítico / 15% no crítico)
          · la asignación real la define tu capacidad objetivo
        </div>
      </div>

      {success && (
        <div style={{
          background: 'var(--color-success-light)', border: '1px solid var(--color-green-300)',
          borderRadius: 'var(--radius-sm)', padding: '10px 14px',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-green-900)',
        }}>
          {success}
        </div>
      )}

      {/* Paso 1: período → tamaño ideal */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
        <label style={fieldLabelStyle}>
          Desde
          <input type="date" value={fechaStart} onChange={e => setFechaStart(e.target.value)} style={inputStyle} />
        </label>
        <label style={fieldLabelStyle}>
          Hasta
          <input type="date" value={fechaEnd} onChange={e => setFechaEnd(e.target.value)} style={inputStyle} />
        </label>
        <button
          onClick={handleVerIdeal}
          disabled={loadingPreview}
          style={{
            height: 32, padding: '0 18px',
            background: 'var(--color-surface)', border: '1px solid var(--color-primary)',
            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-primary-dark)',
          }}
        >
          {loadingPreview && !conCapacidad ? 'Calculando…' : '1 · Ver tamaño ideal'}
        </button>
      </div>

      {/* Referencia Cochran + Paso 2: capacidad */}
      {preview && (
        <div style={{
          background: 'var(--color-primary-light)', border: '1px solid var(--color-orange-300)',
          borderRadius: 'var(--radius-md)', padding: '12px 16px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-gray-900)' }}>
            <span>
              Población elegible:{' '}
              <b style={{ fontFamily: 'var(--font-mono)' }}>{preview.total_poblacion.toLocaleString('es-419')}</b>
            </span>
            <span>
              Tamaño ideal (Cochran, referencia):{' '}
              <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary-dark)', fontSize: 'var(--text-base)' }}>
                {preview.total_muestra_ideal.toLocaleString('es-419')}
              </b>
            </span>
            <span>Estratos: <b style={{ fontFamily: 'var(--font-mono)' }}>{preview.estratos.length}</b></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            <label style={fieldLabelStyle}>
              Capacidad objetivo del equipo
              <input
                type="number" min={1}
                placeholder={`ej: ${Math.min(preview.total_muestra_ideal, 200)}`}
                value={capacidad}
                onChange={e => setCapacidad(e.target.value)}
                style={{ ...inputStyle, width: 180 }}
              />
            </label>
            <button
              onClick={handleCalcularCobertura}
              disabled={loadingPreview}
              style={{
                height: 32, padding: '0 18px',
                background: 'var(--color-primary)', border: 'none',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-on-dark)',
              }}
            >
              {loadingPreview ? 'Calculando…' : '2 · Calcular cobertura'}
            </button>
          </div>

          {/* Desglose de cobertura con la capacidad ingresada */}
          {conCapacidad && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-gray-900)' }}>
                <span>
                  Asignación con capacidad {preview.capacidad_objetivo.toLocaleString('es-419')}:{' '}
                  <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-primary-dark)', fontSize: 'var(--text-base)' }}>
                    {preview.total_asignado.toLocaleString('es-419')}
                  </b> unidades
                </span>
                {preview.total_asignado < preview.capacidad_objetivo && (
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-fg-muted)' }}>
                    (la población disponible no alcanza la capacidad completa)
                  </span>
                )}
                <button
                  onClick={() => setShowEstratos(s => !s)}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                    color: 'var(--color-primary-dark)', fontWeight: 'var(--font-weight-semibold)', padding: 0 }}
                >
                  {showEstratos ? 'Ocultar estratos' : 'Ver estratos'}
                </button>
              </div>

              <CoberturaResumenCard resumen={preview.cobertura_resumen} />

              {showEstratos && (
                <div style={{ maxHeight: 260, overflowY: 'auto', background: 'var(--color-surface)',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-gray-200)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse',
                    fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-gray-100)', position: 'sticky', top: 0 }}>
                        {['Estrato (criterio|mecanismo|resultado|país)', 'Criticidad', 'N', 'n ideal', 'Asignado', 'Cobertura'].map(h => (
                          <th key={h} style={{ padding: '6px 10px', textAlign: 'left',
                            fontFamily: 'var(--font-body)', fontSize: 9, textTransform: 'uppercase',
                            color: 'var(--color-fg-muted)', letterSpacing: 'var(--tracking-wide)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.estratos.map(e => {
                        const cob = COBERTURA_STYLE[e.cobertura] ?? null;
                        return (
                          <tr key={e.estrato} style={{ borderTop: '1px solid var(--color-gray-100)' }}>
                            <td style={{ padding: '4px 10px', color: 'var(--color-gray-800)' }}>{e.estrato}</td>
                            <td style={{ padding: '4px 10px',
                              color: e.criticidad === 'CRITICAL' ? 'var(--color-result-no-cumple)' : 'var(--color-fg-muted)' }}>
                              {e.criticidad}
                            </td>
                            <td style={{ padding: '4px 10px', textAlign: 'right' }}>{e.poblacion}</td>
                            <td style={{ padding: '4px 10px', textAlign: 'right' }}>{e.muestra_ideal}</td>
                            <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 700 }}>{e.asignado}</td>
                            <td style={{ padding: '4px 10px',
                              fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700,
                              color: cob?.color ?? 'var(--color-fg-muted)' }}>
                              {cob?.label ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Paso 3: distribución por auditor + confirmación */}
      {conCapacidad && preview.total_asignado > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
            fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-muted)',
            textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
            Distribución por auditor
          </div>

          {distribucion.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="email"
                placeholder="auditor@falabella.com"
                value={d.auditor_email}
                onChange={e => updateDist(i, 'auditor_email', e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <input
                type="number" min={1}
                placeholder="Cant."
                value={d.cantidad}
                onChange={e => updateDist(i, 'cantidad', e.target.value)}
                style={{ ...inputStyle, width: 90 }}
              />
              <button
                onClick={() => setDistribucion(dist => dist.filter((_, idx) => idx !== i))}
                disabled={distribucion.length === 1}
                title="Quitar auditor"
                style={{
                  height: 32, width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: distribucion.length === 1 ? 'not-allowed' : 'pointer',
                  color: 'var(--color-fg-muted)', opacity: distribucion.length === 1 ? 0.4 : 1,
                }}
              >
                <DeleteRegular style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={() => setDistribucion(d => [...d, { auditor_email: '', cantidad: '' }])}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                height: 30, padding: '0 12px',
                background: 'none', border: '1px dashed var(--color-border-strong)',
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-muted)',
              }}
            >
              <AddRegular style={{ width: 13, height: 13 }} />
              Agregar auditor
            </button>
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              color: totalDistribuido === preview.total_asignado
                ? 'var(--color-result-cumple)'
                : 'var(--color-result-no-cumple)',
              fontWeight: 'var(--font-weight-semibold)',
            }}>
              Distribuido: {totalDistribuido} / {preview.total_asignado}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          background: 'var(--color-danger-light)', border: '1px solid var(--color-red-300)',
          borderRadius: 'var(--radius-sm)', padding: '8px 14px',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-red-900)',
        }}>
          {error}
        </div>
      )}

      {conCapacidad && preview.total_asignado > 0 && (
        <button
          onClick={handleGenerar}
          disabled={generating || totalDistribuido !== preview.total_asignado}
          style={{
            alignSelf: 'flex-start', height: 38, padding: '0 24px',
            background: generating || totalDistribuido !== preview.total_asignado
              ? 'var(--color-gray-400)' : 'var(--color-primary)',
            border: 'none', borderRadius: 'var(--radius-sm)',
            cursor: generating || totalDistribuido !== preview.total_asignado ? 'not-allowed' : 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
            fontWeight: 'var(--font-weight-bold)', color: 'var(--color-fg-on-dark)',
          }}
        >
          {generating ? 'Generando…' : `3 · Confirmar y generar (${preview.total_asignado} unidades)`}
        </button>
      )}
    </div>
  );
}
