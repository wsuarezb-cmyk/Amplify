import TraceWorkspace from '../components/trace/TraceWorkspace.jsx';

export default function Trace() {
  return (
    <section className="trace-page">
      <header className="trace-page-heading">
        <div>
          <span className="trace-kicker">SELLER COMMUNICATIONS</span>
          <h1>Trace</h1>
        </div>
        <p>Genera audiencias, verifica cada reducción y sigue los envíos por template.</p>
      </header>
      <TraceWorkspace />
    </section>
  );
}
