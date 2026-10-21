import TraceEmbed from '../components/trace/TraceEmbed.jsx';

export default function Trace() {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 28, lineHeight: 1.2,
          color: 'var(--color-black)', marginBottom: 5,
        }}>
          Trace
        </h1>
        <p style={{ color: 'var(--color-fg-muted)', fontSize: 13 }}>
          Entiende qué pasó con cada comunicación por seller.
        </p>
      </div>
      <TraceEmbed />
    </section>
  );
}
