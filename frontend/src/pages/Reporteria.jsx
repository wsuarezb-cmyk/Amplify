/**
 * Reportería — página única con Vista Ejecutiva / Operativa. La navegación
 * (vista + secciones) vive en el Sidebar; esta página consume el estado de
 * vista y publica la sección activa vía el context del Outlet (useOutletContext).
 */

import { useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { PitchDataProvider, usePitchData } from '../contexts/PitchDataContext.jsx';
import { seccionesVisibles } from '../constants/reporteriaSections.js';
import PitchFilterBar from '../components/reporteria/PitchFilterBar.jsx';
import ClearFiltersBubble from '../components/reporteria/ClearFiltersBubble.jsx';
import KpiRow from '../components/reporteria/KpiRow.jsx';
import InsightCards from '../components/reporteria/InsightCards.jsx';
import TrendChart from '../components/reporteria/TrendChart.jsx';
import CriteriaStackedBar from '../components/reporteria/CriteriaStackedBar.jsx';
import TipificacionDrill from '../components/reporteria/TipificacionDrill.jsx';
import HeatmapTipCriterio from '../components/reporteria/HeatmapTipCriterio.jsx';
import ComparativaConfigurable from '../components/reporteria/ComparativaConfigurable.jsx';
import OwnerManagerTable from '../components/reporteria/OwnerManagerTable.jsx';
import CaseDrilldown from '../components/reporteria/CaseDrilldown.jsx';
import VistaAgente from '../components/reporteria/VistaAgente.jsx';

function ReporteriaContent() {
  const { error, reload, meta, loading } = usePitchData();
  const { view, setActiveSection } = useOutletContext();
  const observerRef = useRef(null);

  // Resaltar la sección visible mientras se hace scroll (la publica al Sidebar).
  useEffect(() => {
    observerRef.current?.disconnect();
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -65% 0px' },
    );
    for (const s of seccionesVisibles(view)) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    observerRef.current = observer;
    return () => observer.disconnect();
  }, [view, loading, setActiveSection]);

  if (error) {
    return (
      <div style={{
        padding: '24px', background: 'var(--color-danger-light)',
        border: '1px solid var(--color-red-300)', borderRadius: 'var(--radius-md)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-red-900)',
        display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start',
      }}>
        <span>No se pudo cargar el extracto del día: {error}</span>
        <button
          onClick={reload}
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
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Encabezado: título de vista + metadata de carga */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontWeight: 'var(--font-weight-bold)',
          fontSize: 'var(--text-lg)', color: 'var(--color-black)',
        }}>
          {view === 'operativa' ? 'Vista Operativa' : 'Vista Ejecutiva'}
        </span>
        {meta && !loading && (
          <span style={{
            marginLeft: 'auto', fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-xs)', color: 'var(--color-fg-subtle)',
          }}>
            {meta.total_filas.toLocaleString('es-419')} evaluaciones · datos al {meta.fecha_carga?.slice(0, 10)}
          </span>
        )}
      </div>

      {/* Alertas primero: señal global independiente de los filtros */}
      <section id="sec-alertas">
        <InsightCards />
      </section>

      <section id="sec-filtros">
        <PitchFilterBar />
      </section>

      <section id="sec-kpis">
        <KpiRow />
      </section>

      <section id="sec-tendencia">
        <TrendChart />
      </section>

      {view === 'operativa' && (
        <div className="fade-slide-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section id="sec-criterios" className="chart-grid-2">
            <CriteriaStackedBar />
            <TipificacionDrill />
          </section>
          <section id="sec-heatmap">
            <HeatmapTipCriterio />
          </section>
          <section id="sec-comparativa">
            <ComparativaConfigurable />
          </section>
          <section id="sec-propietarios">
            <OwnerManagerTable />
          </section>
          <section id="sec-agente">
            <VistaAgente />
          </section>
          <section id="sec-drilldown">
            <CaseDrilldown />
          </section>
        </div>
      )}

      {/* Burbuja flotante de limpiar filtros (visible con filtros activos) */}
      <ClearFiltersBubble />
    </div>
  );
}

export default function Reporteria() {
  return (
    <PitchDataProvider>
      <ReporteriaContent />
    </PitchDataProvider>
  );
}
