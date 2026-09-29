/**
 * HeatmapTipCriterio — heatmap criterio (filas) × tipificación (columnas).
 *
 * - Selector de nivel N1/N2/N3: muestra TODAS las tipificaciones de ese nivel
 *   (top por volumen), sin tener que navegar en orden estricto.
 * - Ancho equitativo: las columnas reparten el ancho disponible; con muchas,
 *   scroll horizontal (min por celda).
 * - Click en el encabezado de una columna → filtra la reportería por esa
 *   tipificación (se marca en chips) y baja al siguiente nivel (efecto drill).
 * - Intensidad = % NO_CUMPLE (base CUMPLE + NO_CUMPLE) sobre criterionRows.
 */

import { useMemo, useState } from 'react';
import ChartCard from './ChartCard.jsx';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';
import { heatmapTipCriterio } from '../../utils/aggregations.js';

const LEVELS = ['tipificacion_nivel_1', 'tipificacion_nivel_2', 'nombre_tipificacion'];
const LEVEL_LABELS = ['Nivel 1', 'Nivel 2', 'Nivel 3'];
const MIN_CELL = 42;    // ancho mínimo por columna (px) antes de scrollear
const LABEL_COL = 200;  // ancho de la columna de nombres de criterio

function cellBackground(pct) {
  const alpha = Math.min(1, 0.08 + (pct / 100) * 0.92);
  return `color-mix(in srgb, var(--color-result-no-cumple) ${Math.round(alpha * 100)}%, var(--color-surface))`;
}

export default function HeatmapTipCriterio() {
  const { criterionRows, loading, crossFilter } = usePitchData();
  const [level, setLevel] = useState(0);
  const [hover, setHover] = useState(null);

  const { tips, crits, critNames, matrix } = useMemo(
    () => heatmapTipCriterio(criterionRows, LEVELS[level], 30, 20),
    [criterionRows, level],
  );

  function handleColumnClick(tip) {
    if (tip.startsWith('(sin')) return;
    crossFilter(LEVELS[level], tip);          // filtra global (marca en chips)
    if (level < LEVELS.length - 1) setLevel(level + 1);  // efecto drill
  }

  const nCols = tips.length;
  const gridCols = `${LABEL_COL}px repeat(${nCols}, minmax(${MIN_CELL}px, 1fr))`;
  const minWidth = LABEL_COL + nCols * MIN_CELL;

  return (
    <ChartCard
      title="Heatmap criterio × tipificación"
      subtitle="% NO_CUMPLE por celda — más intenso = más incumplimiento · click en una columna filtra y baja de nivel"
      loading={loading}
      empty={tips.length === 0}
      actions={
        <div style={{
          display: 'inline-flex', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
          border: '1px solid var(--color-border)',
        }}>
          {LEVEL_LABELS.map((lbl, i) => {
            const active = level === i;
            return (
              <button
                key={i}
                onClick={() => setLevel(i)}
                style={{
                  padding: '4px 12px', border: 'none', cursor: 'pointer',
                  background: active ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: active ? 'var(--color-fg-on-dark)' : 'var(--color-fg-muted)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                  fontWeight: active ? 'var(--font-weight-semibold)' : 'var(--font-weight-regular)',
                }}
              >
                {`N${i + 1}`}
              </button>
            );
          })}
        </div>
      }
    >
      <div style={{ padding: '12px 16px 16px', overflowX: 'auto' }}>
        <div style={{ minWidth, display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* Fila de encabezados de tipificación (rotados, clickeables) */}
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 3, alignItems: 'end' }}>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 9,
              fontWeight: 'var(--font-weight-semibold)', color: 'var(--color-fg-subtle)',
              textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
              alignSelf: 'end', paddingBottom: 4,
            }}>
              Criterio
            </div>
            {tips.map(tip => (
              <div
                key={tip}
                onClick={() => handleColumnClick(tip)}
                title={tip.startsWith('(sin') ? tip : `${tip} — click para filtrar y desglosar`}
                style={{
                  display: 'flex', justifyContent: 'center', alignItems: 'flex-end',
                  height: 118, cursor: tip.startsWith('(sin') ? 'default' : 'pointer',
                }}
              >
                <div style={{
                  writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                  maxHeight: 112, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-body)', fontSize: 10,
                  fontWeight: 'var(--font-weight-semibold)',
                  color: tip.startsWith('(sin') ? 'var(--color-fg-muted)' : 'var(--color-primary-dark)',
                }}>
                  {tip}
                </div>
              </div>
            ))}
          </div>

          {/* Filas de criterios */}
          {crits.map((crit, ci) => (
            <div key={crit} style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 3, alignItems: 'center' }}>
              <div title={critNames[ci]} style={{
                fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-gray-800)',
                paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {critNames[ci]}
              </div>
              {matrix[ci].map((cell, ti) => (
                <div
                  key={tips[ti]}
                  onMouseEnter={() => cell && setHover({ tip: tips[ti], crit: critNames[ci], ...cell })}
                  onMouseLeave={() => setHover(null)}
                  title={cell ? `${critNames[ci]} × ${tips[ti]}: ${cell.pctNoCumple.toFixed(1)}% no cumple (n=${cell.n})` : ''}
                  style={{
                    height: 24, borderRadius: 4, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    background: cell ? cellBackground(cell.pctNoCumple) : 'var(--color-gray-100)',
                    fontFamily: 'var(--font-mono)', fontSize: 9,
                    color: cell && cell.pctNoCumple > 45 ? 'var(--color-white)' : 'var(--color-gray-700)',
                  }}
                >
                  {cell ? cell.pctNoCumple.toFixed(0) : ''}
                </div>
              ))}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 8, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          color: 'var(--color-fg-subtle)', minHeight: 16,
        }}>
          {hover
            ? `${hover.crit} × ${hover.tip}: ${hover.pctNoCumple.toFixed(1)}% no cumple (base ${hover.n.toLocaleString('es-419')})`
            : `Mostrando ${LEVEL_LABELS[level]} · pasa el cursor sobre una celda para el detalle.`}
        </div>
      </div>
    </ChartCard>
  );
}
