/**
 * Glosario — transparenta cómo trabaja SAACA. Disponible para todos los roles.
 *
 *   Cómo funciona SAACA            → contenido fijo (constants/glosarioContenido.js)
 *   Criterios                      → catálogo vivo: vigente + historial (/api/glosario)
 *   Criterios por tipo de interacción → matriz desde el mapping de SAACA
 */

import { useCallback, useEffect, useState } from 'react';
import { getGlosario } from '../services/api.js';
import LoadingNotice from '../components/calibracion/LoadingNotice.jsx';
import ComoFuncionaSaaca from '../components/glosario/ComoFuncionaSaaca.jsx';
import CriteriosTabla from '../components/glosario/CriteriosTabla.jsx';
import MatrizInteraccion from '../components/glosario/MatrizInteraccion.jsx';

const TABS = [
  { id: 'saaca',     label: 'Cómo funciona SAACA' },
  { id: 'criterios', label: 'Criterios' },
  { id: 'matriz',    label: 'Criterios por tipo de interacción' },
];

export default function Glosario() {
  const [tab, setTab]         = useState('saaca');
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getGlosario());
    } catch (e) {
      setError(e.message ?? 'Error al cargar el catálogo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // "Cómo funciona" es contenido fijo: se muestra aunque el catálogo falle.
  const necesitaCatalogo = tab !== 'saaca';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 'var(--font-weight-bold)',
          fontSize: 'var(--text-lg)', color: 'var(--color-black)',
        }}>
          Glosario
        </span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)' }}>
          Cómo evalúa SAACA y qué mide cada criterio
        </span>
        {data && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)' }}>
            {data.criterios.length} criterios · catálogo al {data.fecha_carga?.slice(0, 10)}
          </span>
        )}
      </div>

      {/* Pestañas */}
      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--color-border)', flexWrap: 'wrap' }}>
        {TABS.map(t => {
          const activo = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={activo}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${activo ? 'var(--color-primary)' : 'transparent'}`,
                marginBottom: -1,
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                fontWeight: activo ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
                color: activo ? 'var(--color-primary-dark)' : 'var(--color-fg-muted)',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'saaca' && <ComoFuncionaSaaca />}

      {necesitaCatalogo && loading && <LoadingNotice label="Cargando catálogo de criterios…" />}

      {necesitaCatalogo && error && !loading && (
        <div style={{
          padding: '24px', background: 'var(--color-danger-light)',
          border: '1px solid var(--color-red-300)', borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-red-900)',
          display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start',
        }}>
          <span>No se pudo cargar el catálogo de criterios: {error}</span>
          <button
            onClick={load}
            style={{
              padding: '8px 18px', border: 'none', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-danger)', color: 'var(--color-fg-on-dark)',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              fontWeight: 'var(--font-weight-semibold)', cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </div>
      )}

      {necesitaCatalogo && data && !loading && tab === 'criterios' && (
        <CriteriosTabla criterios={data.criterios} tipos={data.tipos_interaccion} />
      )}
      {necesitaCatalogo && data && !loading && tab === 'matriz' && (
        <MatrizInteraccion criterios={data.criterios} tipos={data.tipos_interaccion} />
      )}
    </div>
  );
}
