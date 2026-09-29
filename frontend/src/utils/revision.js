/**
 * Reglas del paso de revisión frente a SAACA — espejo de
 * backend/services/calibracion_service.py (requiere_observacion,
 * validar_confirmacion). El backend valida igual: esto solo guía la UI.
 */

export const MIN_OBSERVACION = 5;

/** Obligatoria si el voto final difiere de SAACA o del voto a ciegas. */
export function requiereObservacion(resultadoCiego, resultadoSaaca, resultadoFinal) {
  return resultadoFinal !== resultadoSaaca || resultadoFinal !== resultadoCiego;
}

export function observacionValida(texto) {
  return (texto ?? '').trim().length >= MIN_OBSERVACION;
}

/**
 * ¿Se puede confirmar? criterios: [{criterion_id, resultado_ciego, resultado_saaca}],
 * finales: {criterion_id → label}, observaciones: {criterion_id → texto}.
 */
export function puedeConfirmar(criterios, finales, observaciones) {
  return criterios.length > 0 && criterios.every(c => {
    const final = finales[c.criterion_id];
    if (!final) return false;
    return !requiereObservacion(c.resultado_ciego, c.resultado_saaca, final)
      || observacionValida(observaciones[c.criterion_id]);
  });
}
