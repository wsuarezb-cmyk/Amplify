/* Skeleton loading animation — keyframes 'shimmer' definidos en index.css */
const skeletonStyle = {
  background: 'linear-gradient(90deg, var(--color-gray-200) 25%, var(--color-gray-100) 50%, var(--color-gray-200) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s infinite',
  borderRadius: 'var(--radius-sm)',
};

export default function KPICard({ label, value, sublabel, color, loading }) {
  const displayColor = color ?? 'var(--color-primary-dark)';

  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      padding: '20px 22px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      transition: 'box-shadow var(--transition-base), border-color var(--transition-base)',
      cursor: 'default',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
      e.currentTarget.style.borderColor = 'var(--color-border-strong)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
      e.currentTarget.style.borderColor = 'var(--color-border)';
    }}
    >
      {/* Label */}
      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        letterSpacing: 'var(--tracking-wider)',
        textTransform: 'uppercase',
        color: 'var(--color-fg-subtle)',
      }}>
        {label}
      </div>

      {/* Value */}
      {loading ? (
        <div style={{ ...skeletonStyle, height: 40, width: '70%' }} />
      ) : (
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 34,
          fontWeight: 'var(--font-weight-extrabold)',
          color: displayColor,
          letterSpacing: 'var(--tracking-tight)',
          lineHeight: 1,
        }}>
          {value}
        </div>
      )}

      {/* Sublabel */}
      {sublabel && !loading && (
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-fg-subtle)',
          marginTop: 2,
        }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}
