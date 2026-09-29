/**
 * ChartCard — contenedor estándar de gráficos de Reportería.
 * Unifica título, subtítulo, skeleton de carga y estado vacío (spec 5.6).
 */

const skeletonStyle = {
  background: 'linear-gradient(90deg, var(--color-gray-200) 25%, var(--color-gray-100) 50%, var(--color-gray-200) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s infinite',
  borderRadius: 'var(--radius-sm)',
};

export default function ChartCard({ title, subtitle, loading, empty, children, actions }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '14px 20px 10px',
        borderBottom: '1px solid var(--color-gray-200)',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'var(--font-display)', fontWeight: 'var(--font-weight-bold)',
            fontSize: 'var(--text-base)', color: 'var(--color-black)',
          }}>
            {title}
          </div>
          {subtitle && (
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
              color: 'var(--color-fg-subtle)', marginTop: 2,
            }}>
              {subtitle}
            </div>
          )}
        </div>
        {actions}
      </div>

      {loading ? (
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ ...skeletonStyle, height: 18, width: '55%' }} />
          <div style={{ ...skeletonStyle, height: 140 }} />
        </div>
      ) : empty ? (
        <div style={{
          padding: 40, textAlign: 'center',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--color-fg-subtle)',
        }}>
          No hay evaluaciones para esta combinación de filtros en el período seleccionado.
        </div>
      ) : (
        children
      )}
    </div>
  );
}
