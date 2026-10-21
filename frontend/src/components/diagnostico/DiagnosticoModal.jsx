/**
 * DiagnosticoModal — confirma el alcance del diagnóstico IA con los filtros
 * aplicados en Reportería, muestra la cuota del mes y descarga el HTML.
 * El diagnóstico no se almacena: se genera y se descarga en el momento.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { SparkleRegular } from '@fluentui/react-icons';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { generarDiagnostico, getDiagnosticoCuota } from '../../services/api.js';
import {
  ALCANCE_LABEL, contarInteracciones, detectarAlcance, textoCuota, validarDiagnostico,
} from '../../utils/diagnostico.js';

const filaStyle = { display: 'flex', gap: 10, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' };
const lblStyle  = { minWidth: 150, color: 'var(--color-fg-muted)' };

function Mensaje({ tipo, children }) {
  const tonos = {
    error: { bg: 'var(--color-danger-light)',  bd: 'var(--color-red-300)',    fg: 'var(--color-red-900)' },
    warn:  { bg: 'var(--color-warning-light)', bd: 'var(--color-orange-300)', fg: 'var(--color-orange-900)' },
    ok:    { bg: 'var(--color-success-light)', bd: 'var(--color-green-300)',  fg: 'var(--color-green-900)' },
  };
  const t = tonos[tipo];
  return (
    <div style={{
      padding: '8px 12px', background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 'var(--radius-sm)',
      fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: t.fg, lineHeight: 1.5,
    }}>
      {children}
    </div>
  );
}

function descargar(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DiagnosticoModal({ onClose }) {
  const { filters, filteredRows, filterOptions, activeFilterCount } = usePitchData();
  const [cuota, setCuota]           = useState(null);
  const [cuotaError, setCuotaError] = useState(null);
  const [generando, setGenerando]   = useState(false);
  const [segundos, setSegundos]     = useState(0);
  const [error, setError]           = useState(null);
  const [listo, setListo]           = useState(false);
  const timer = useRef(null);

  const nInteracciones = useMemo(() => contarInteracciones(filteredRows), [filteredRows]);
  const alcance        = useMemo(() => detectarAlcance(filters, filterOptions), [filters, filterOptions]);
  const validacion     = validarDiagnostico(filters, nInteracciones);
  const sinCuota       = cuota && !cuota.ilimitada && cuota.restantes <= 0;

  function cargarCuota() {
    getDiagnosticoCuota()
      .then(c => { setCuota(c); setCuotaError(null); })
      .catch(e => setCuotaError(e.message ?? 'No se pudo consultar la cuota'));
  }

  useEffect(() => {
    cargarCuota();
    return () => clearInterval(timer.current);
  }, []);

  async function handleGenerar() {
    if (validacion || sinCuota || generando) return;
    setGenerando(true);
    setError(null);
    setListo(false);
    setSegundos(0);
    timer.current = setInterval(() => setSegundos(s => s + 1), 1000);
    try {
      const { blob, filename } = await generarDiagnostico(filters);
      descargar(blob, filename);
      setListo(true);
      cargarCuota();
    } catch (e) {
      setError(e.message ?? 'No se pudo generar el diagnóstico');
    } finally {
      clearInterval(timer.current);
      setGenerando(false);
    }
  }

  const puedeGenerar = !validacion && !sinCuota && !generando && !cuotaError;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 'var(--z-modal)', background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div role="dialog" aria-modal="true" aria-label="Diagnóstico con IA" style={{
        background: 'var(--color-surface)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
        width: '100%', maxWidth: 520, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)',
          fontWeight: 'var(--font-weight-bold)', fontSize: 'var(--text-md)', color: 'var(--color-black)' }}>
          <SparkleRegular style={{ width: 20, height: 20, color: 'var(--color-primary-dark)' }} />
          Diagnóstico con IA
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--color-fg-muted)', lineHeight: 1.5 }}>
          Genera un diagnóstico ejecutivo con los filtros aplicados: indicadores frente a la operación,
          hallazgos a partir de evaluaciones reales de SAACA, reconocimientos y plan de acción.
          Se descarga como HTML (puedes guardarlo en PDF con Ctrl+P).
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
          background: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)' }}>
          <div style={filaStyle}><span style={lblStyle}>Tipo</span><b>{ALCANCE_LABEL[alcance.tipo]}</b></div>
          <div style={filaStyle}><span style={lblStyle}>Alcance</span><span>{alcance.etiqueta}</span></div>
          <div style={filaStyle}>
            <span style={lblStyle}>Período</span>
            <span>{filters.fecha_start && filters.fecha_end ? `${filters.fecha_start} a ${filters.fecha_end}` : '—'}</span>
          </div>
          <div style={filaStyle}>
            <span style={lblStyle}>Interacciones evaluadas</span>
            <span>{nInteracciones.toLocaleString('es-419')}</span>
          </div>
          <div style={filaStyle}><span style={lblStyle}>Filtros activos</span><span>{activeFilterCount}</span></div>
        </div>

        {cuotaError
          ? <Mensaje tipo="error">{cuotaError}</Mensaje>
          : cuota && <Mensaje tipo={sinCuota ? 'warn' : 'ok'}>
              {textoCuota(cuota)}{sinCuota ? ' Se renueva el día 1 del próximo mes.' : ''}
            </Mensaje>}
        {validacion && <Mensaje tipo="warn">{validacion}</Mensaje>}
        {generando && (
          <Mensaje tipo="ok">
            Generando diagnóstico… {segundos} s (suele tardar alrededor de un minuto). No cierres esta ventana.
          </Mensaje>
        )}
        {listo && <Mensaje tipo="ok">Diagnóstico descargado. Ábrelo desde tus descargas.</Mensaje>}
        {error && <Mensaje tipo="error">{error}</Mensaje>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={generando}
            style={{
              padding: '8px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', cursor: generando ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-fg-muted)',
            }}
          >
            {listo ? 'Cerrar' : 'Cancelar'}
          </button>
          <button
            onClick={handleGenerar}
            disabled={!puedeGenerar}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', border: 'none',
              borderRadius: 'var(--radius-sm)',
              background: puedeGenerar ? 'var(--color-primary)' : 'var(--color-gray-400)',
              color: 'var(--color-fg-on-primary)', cursor: puedeGenerar ? 'pointer' : 'not-allowed',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            <SparkleRegular style={{ width: 15, height: 15 }} />
            {generando ? 'Generando…' : listo ? 'Generar de nuevo' : 'Generar y descargar'}
          </button>
        </div>
      </div>
    </div>
  );
}
