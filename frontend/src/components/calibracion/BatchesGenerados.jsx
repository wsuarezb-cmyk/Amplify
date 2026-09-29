/**
 * BatchesGenerados — batches de muestra con su progreso (LIDER_QUALITY+).
 *
 * Red de seguridad operativa: si el response de una generación se pierde
 * (red/timeout), el batch insertado aparece aquí — detectable y anulable
 * desde la app, sin intervención manual en BQ. Anular marca ANULADO solo
 * las unidades pendientes (vuelven al pool elegible); lo completado y
 * descartado se conserva intacto.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowClockwiseRegular } from '@fluentui/react-icons';
import { getBatchesMuestra, anularBatchMuestra } from '../../services/api.js';
import LoadingNotice from './LoadingNotice.jsx';

export default function BatchesGenerados({ refreshKey, onAnulado }) {
  const [batches, setBatches]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [confirmId, setConfirmId] = useState(null);   // batch en confirmación de anulado
  const [anulando, setAnulando] = useState(null);
  const [aviso, setAviso]       = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBatchesMuestra();
      setBatches(data.batches);
    } catch (e) {
      setError(e.message ?? 'Error al cargar los batches');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  async function handleAnular(batchId) {
    setAnulando(batchId);
    setAviso(null);
    setError(null);
    try {
      const res = await anularBatchMuestra(batchId);
      setAviso(
        `✓ Batch ${batchId.slice(0, 8)}… anulado: ${res.anuladas_pendientes} pendientes anuladas` +
        (res.conservadas_completadas > 0 ? `, ${res.conservadas_completadas} completadas conservadas` : '')
      );
      setConfirmId(null);
      await load();
      if (onAnulado) onAnulado();
    } catch (e) {
      setError(e.message ?? 'Error al anular el batch');
    } finally {
      setAnulando(null);
    }
  }

  const thStyle = {
    padding: '8px 12px', textAlign: 'left',
    fontFamily: 'var(--font-body)', fontSize: 9,
    fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-subtle)',
    textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
    borderBottom: '1px solid var(--color-gray-200)', whiteSpace: 'nowrap',
  };
  const tdStyle = {
    padding: '8px 12px', verticalAlign: 'middle',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg)',
    borderBottom: '1px solid var(--color-gray-100)',
  };

  return (
    <div style={{
      background: 'var(--color-surface)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden',
    }}>
      <div style={{
        padding: '12px 18px', borderBottom: '1px solid var(--color-gray-200)',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'var(--font-weight-bold)',
            fontSize: 'var(--text-sm)', color: 'var(--color-black)' }}>
            Batches generados
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
            color: 'var(--color-fg-subtle)', marginTop: 2 }}>
            Si una generación dio error pero aparece aquí, sí se insertó — puedes anularla.
          </div>
        </div>
        <button
          onClick={load}
          title="Actualizar"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 10px', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
            cursor: 'pointer', fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-xs)', color: 'var(--color-fg-muted)',
          }}
        >
          <ArrowClockwiseRegular style={{ fontSize: 13 }} />
          Actualizar
        </button>
      </div>

      {aviso && (
        <div style={{
          margin: '10px 18px 0', padding: '8px 12px',
          background: 'var(--color-success-light)', border: '1px solid var(--color-green-300)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-green-900)',
        }}>
          {aviso}
        </div>
      )}
      {error && (
        <div style={{
          margin: '10px 18px 0', padding: '8px 12px',
          background: 'var(--color-danger-light)', border: '1px solid var(--color-red-300)',
          borderRadius: 'var(--radius-sm)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-red-900)',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <LoadingNotice label="Cargando batches…" />
      ) : batches.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--color-fg-subtle)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)' }}>
          Aún no hay batches generados.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-subtle)' }}>
                {['Batch', 'Generado', 'Total', 'Pendientes', 'Completados', 'Descartados', 'Anulados', 'Auditores', ''].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {batches.map(b => {
                const anulable = b.pendientes + b.en_progreso > 0;
                const enConfirm = confirmId === b.batch_id;
                return (
                  <tr key={b.batch_id}>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                      {b.batch_id.slice(0, 8)}…
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--color-fg-muted)', whiteSpace: 'nowrap' }}>
                      {b.fecha_generacion?.slice(0, 16) ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{b.total}</td>
                    <td style={{ ...tdStyle, color: 'var(--color-orange-900)' }}>{b.pendientes + b.en_progreso}</td>
                    <td style={{ ...tdStyle, color: 'var(--color-result-cumple)' }}>{b.completados}</td>
                    <td style={{ ...tdStyle, color: 'var(--color-fg-muted)' }}>{b.descartados}</td>
                    <td style={{ ...tdStyle, color: 'var(--color-result-no-evaluado)' }}>{b.anulados}</td>
                    <td style={{ ...tdStyle, maxWidth: 220 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap' }} title={b.auditores.join(', ')}>
                        {b.auditores.join(', ')}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {anulable && (
                        enConfirm ? (
                          <span style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              onClick={() => handleAnular(b.batch_id)}
                              disabled={anulando === b.batch_id}
                              style={{
                                padding: '4px 10px', border: 'none',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--color-danger)', color: 'var(--color-fg-on-dark)',
                                cursor: 'pointer', fontFamily: 'var(--font-body)',
                                fontSize: 10, fontWeight: 'var(--font-weight-bold)',
                              }}
                            >
                              {anulando === b.batch_id ? 'Anulando…' : `Confirmar (${b.pendientes + b.en_progreso})`}
                            </button>
                            <button
                              onClick={() => setConfirmId(null)}
                              style={{
                                padding: '4px 10px', border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
                                cursor: 'pointer', fontFamily: 'var(--font-body)',
                                fontSize: 10, color: 'var(--color-fg-muted)',
                              }}
                            >
                              Cancelar
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmId(b.batch_id)}
                            style={{
                              padding: '4px 10px', border: '1px solid var(--color-red-300)',
                              borderRadius: 'var(--radius-sm)', background: 'var(--color-surface)',
                              cursor: 'pointer', fontFamily: 'var(--font-body)',
                              fontSize: 10, fontWeight: 'var(--font-weight-semibold)',
                              color: 'var(--color-danger)',
                            }}
                          >
                            Anular
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
