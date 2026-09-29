/**
 * ClearFiltersBubble — botón flotante para limpiar todos los filtros desde
 * cualquier punto del scroll. Visible solo cuando hay filtros activos (incluye
 * cross-filters de gráficos y drills, todos en el mismo estado global).
 *
 * Arrastrable: el "grip" de la izquierda mueve la burbuja (cuando tapa algo);
 * el resto del botón limpia los filtros. La posición se recuerda mientras dure
 * la sesión de la página.
 */

import { useEffect, useRef, useState } from 'react';
import { DismissRegular } from '@fluentui/react-icons';
import { usePitchData } from '../../contexts/PitchDataContext.jsx';

export default function ClearFiltersBubble() {
  const { activeFilterCount, resetFilters } = usePitchData();
  const [pos, setPos] = useState(null);          // {left, top} px, o null = esquina inferior derecha
  const ref = useRef(null);
  const drag = useRef(null);                       // {offsetX, offsetY}

  useEffect(() => {
    function onMove(e) {
      if (!drag.current) return;
      const w = ref.current?.offsetWidth ?? 180;
      const h = ref.current?.offsetHeight ?? 44;
      const left = Math.min(Math.max(8, e.clientX - drag.current.offsetX), window.innerWidth - w - 8);
      const top = Math.min(Math.max(8, e.clientY - drag.current.offsetY), window.innerHeight - h - 8);
      setPos({ left, top });
    }
    function onUp() { drag.current = null; }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  if (activeFilterCount === 0) return null;

  function startDrag(e) {
    const rect = ref.current.getBoundingClientRect();
    drag.current = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
    e.preventDefault();
  }

  const posStyle = pos
    ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' }
    : undefined;

  return (
    <div ref={ref} className="clear-filters-bubble" style={posStyle}>
      <span
        className="clear-filters-grip"
        onPointerDown={startDrag}
        title="Arrastrar para mover"
        aria-label="Mover"
      >
        ⠿
      </span>
      <button
        onClick={resetFilters}
        className="clear-filters-action"
        title="Limpiar todos los filtros"
      >
        <DismissRegular style={{ width: 16, height: 16 }} />
        Limpiar filtros ({activeFilterCount})
      </button>
    </div>
  );
}
