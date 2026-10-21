/**
 * Navegación de secciones de Reportería — compartida entre el Sidebar y la
 * página (para el IntersectionObserver que resalta la sección activa).
 *
 * Cada vista (Ejecutiva / Operativa) agrupa sus secciones. Las secciones de la
 * vista ejecutiva se renderizan SIEMPRE; la operativa agrega las suyas.
 */

export const NAV_GROUPS = [
  {
    view: 'ejecutiva',
    label: 'Vista Ejecutiva',
    sections: [
      { id: 'sec-alertas',   label: 'Alertas' },
      { id: 'sec-filtros',   label: 'Filtros' },
      { id: 'sec-kpis',      label: 'KPIs' },
      { id: 'sec-tendencia', label: 'Tendencia' },
    ],
  },
  {
    view: 'operativa',
    label: 'Vista Operativa',
    sections: [
      { id: 'sec-criterios',    label: 'Criterios' },
      { id: 'sec-heatmap',      label: 'Heatmap' },
      { id: 'sec-comparativa',  label: 'Comparativa' },
      { id: 'sec-propietarios', label: 'Propietarios' },
      { id: 'sec-agente',       label: 'Vista agente' },
      { id: 'sec-drilldown',    label: 'Drilldown' },
    ],
  },
];

/** Secciones presentes en el DOM según la vista activa (para el observer). */
export function seccionesVisibles(view) {
  const ejecutiva = NAV_GROUPS[0].sections.filter(
    section => !section.visibleInViews || section.visibleInViews.includes(view),
  );
  return view === 'operativa'
    ? [...ejecutiva, ...NAV_GROUPS[1].sections]
    : ejecutiva;
}
