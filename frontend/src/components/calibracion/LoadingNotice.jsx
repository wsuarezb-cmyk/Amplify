/**
 * LoadingNotice — skeleton de carga (mismo shimmer que KPICard/ChartCard de
 * Reportería) que además avisa si la espera se alarga (cola de slots de BQ).
 */

import { useEffect, useState } from 'react';

const skeletonStyle = {
  background: 'linear-gradient(90deg, var(--color-gray-200) 25%, var(--color-gray-100) 50%, var(--color-gray-200) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s infinite',
  borderRadius: 'var(--radius-sm)',
};

const SLOW_THRESHOLD_MS = 7000;

export default function LoadingNotice({ label = 'Cargando…', height = 60 }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...skeletonStyle, height }} />
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
        color: 'var(--color-fg-subtle)', textAlign: 'center',
      }}>
        {slow ? 'Esto está tardando más de lo usual — seguimos intentando…' : label}
      </div>
    </div>
  );
}
