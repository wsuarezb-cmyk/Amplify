/**
 * DiagnosticoButton — abre el modal de Diagnóstico IA. Va junto a
 * "Descargar CSV" en la barra de filtros de Reportería.
 */

import { useState } from 'react';
import { SparkleRegular } from '@fluentui/react-icons';
import DiagnosticoModal from './DiagnosticoModal.jsx';

export default function DiagnosticoButton() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        title="Genera un diagnóstico ejecutivo con IA a partir de los filtros aplicados"
        style={{
          display: 'flex', alignItems: 'center', gap: 6, height: 34, padding: '0 16px',
          background: 'var(--color-primary)', border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-sm)', cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-on-primary)',
        }}
      >
        <SparkleRegular style={{ width: 15, height: 15 }} />
        Diagnóstico IA
      </button>
      {abierto && <DiagnosticoModal onClose={() => setAbierto(false)} />}
    </>
  );
}
