import ChartCard from './ChartCard.jsx';

const TRACE_EMBED_URL =
  'https://datastudio.google.com/embed/reporting/252d6950-c6cd-46d0-88c7-4eebf717b221/page/h9a1F';

export default function TraceEmbed() {
  return (
    <ChartCard title="Trace">
      <iframe
        title="Reporte Trace en Looker Studio"
        src={TRACE_EMBED_URL}
        style={{
          display: 'block',
          width: '100%',
          height: 'min(78vh, 900px)',
          minHeight: 600,
          border: 'none',
        }}
        frameBorder="0"
        allowFullScreen
        sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      />
    </ChartCard>
  );
}
