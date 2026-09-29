/**
 * ExportButton — descarga CSV de pitch_eval_enriched con los filtros activos.
 * Gobernado: exige rango de fechas ≤ 31 días (validado también en backend) y
 * avisa si el resultado quedó cortado en 50.000 filas.
 */

import { useMemo, useState } from 'react';
import { ArrowDownloadRegular } from '@fluentui/react-icons';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { exportEnriched } from '../../services/api.js';

const MAX_DIAS = 31;

export default function ExportButton() {
  const { filters } = usePitchData();
  const [descargando, setDescargando] = useState(false);
  const [aviso, setAviso] = useState(null);   // { tipo: 'ok'|'warn'|'error', texto }

  const validacion = useMemo(() => {
    if (!filters.fecha_start || !filters.fecha_end) {
      return 'Elige un rango de fechas para poder exportar (máx. 31 días).';
    }
    const dias = (new Date(filters.fecha_end) - new Date(filters.fecha_start)) / 86400000 + 1;
    if (dias > MAX_DIAS) {
      return `El rango es de ${Math.round(dias)} días — el export permite máximo ${MAX_DIAS}.`;
    }
    return null;
  }, [filters.fecha_start, filters.fecha_end]);

  async function handleExport() {
    if (validacion || descargando) return;
    setDescargando(true);
    setAviso(null);
    try {
      const { blob, truncated, filename } = await exportEnriched(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setAviso(truncated
        ? { tipo: 'warn', texto: 'Descarga cortada en 50.000 filas — acota más los filtros para el detalle completo.' }
        : { tipo: 'ok', texto: 'CSV descargado.' });
    } catch (e) {
      setAviso({ tipo: 'error', texto: e.message ?? 'Error al exportar' });
    } finally {
      setDescargando(false);
    }
  }

  const disabled = Boolean(validacion) || descargando;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <button
        onClick={handleExport}
        disabled={disabled}
        title={validacion ?? 'Descarga pitch_eval_enriched (con observación SAACA) con los filtros aplicados'}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 34, padding: '0 16px',
          background: disabled ? 'var(--color-gray-200)' : 'var(--color-surface)',
          border: `1px solid ${disabled ? 'var(--color-border)' : 'var(--color-primary)'}`,
          borderRadius: 'var(--radius-sm)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-weight-semibold)',
          color: disabled ? 'var(--color-fg-subtle)' : 'var(--color-primary-dark)',
        }}
      >
        <ArrowDownloadRegular style={{ width: 15, height: 15 }} />
        {descargando ? 'Exportando…' : 'Descargar CSV'}
      </button>

      {aviso && (
        <span style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          color: aviso.tipo === 'error' ? 'var(--color-red-700)'
            : aviso.tipo === 'warn' ? 'var(--color-orange-900)'
            : 'var(--color-green-700)',
        }}>
          {aviso.texto}
        </span>
      )}
    </div>
  );
}
