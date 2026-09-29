/**
 * Contenido fijo de "Cómo funciona SAACA" (pestaña Glosario).
 *
 * Redactado a partir de la documentación de SAACA (catálogo de criterios,
 * SP de preparación y pipeline de evaluación). Nivel acordado: explica el
 * proceso y el significado de los resultados SIN exponer las reglas exactas
 * de los pre-filtros deterministas. Los criterios, descripciones y pesos NO
 * van aquí: vienen en vivo del catálogo (/api/glosario).
 *
 * Revisar con Calidad antes de cambiar el texto.
 */

export const SECCIONES_SAACA = [
  {
    id: 'proceso',
    titulo: 'Proceso general',
    subtitulo: 'Qué es SAACA y cómo evalúa',
    parrafos: [
      'SAACA (Sistema Automatizado de Análisis de Calidad y Atención) es el proceso que evalúa '
        + 'automáticamente la calidad de la atención a sellers. Usa un modelo de IA (Gemini) como '
        + 'evaluador, con instrucciones y criterios definidos por el equipo de procesos y proyectos.',
    ],
    pasos: [
      { titulo: 'Selección de casos',
        texto: 'Cada día se toman casos cerrados hace entre 72 y 96 horas, de sellers nacionales e '
          + 'internacionales, y se elige una muestra aleatoria por agente garantizando una muestra representativa.' },
      { titulo: 'Clasificación de interacciones',
        texto: 'Cada caso se descompone en interacciones (emails, tareas y el caso en sí) y cada una '
          + 'se clasifica según su tipo. El tipo define qué criterios le aplican.' },
      { titulo: 'Evaluación',
        texto: 'Durante la noche, SAACA evalúa cada interacción contra todos los criterios activos de su tipo, '
          + 'leyendo el hilo completo del caso como contexto. Algunos escenarios simples se resuelven con '
          + 'reglas fijas, sin llamar a la IA (por ejemplo, casos duplicados o comentarios vacíos).' },
      { titulo: 'Resultado',
        texto: 'Por cada interacción y criterio queda un resultado con su observación (la justificación de la '
          + 'IA) y, cuando aplica, una sugerencia de corrección. Pitch carga esos resultados una vez al día.' },
    ],
  },
  {
    id: 'resultados',
    titulo: 'Resultados y puntaje',
    subtitulo: 'Qué significa cada resultado de un criterio',
    resultados: [
      { resultado: 'CUMPLE',      texto: 'El criterio se cumple en esta interacción.' },
      { resultado: 'NO_CUMPLE',   texto: 'El criterio no se cumple. Si el criterio es crítico, la interacción queda marcada como defectuosa.' },
      { resultado: 'N/A',         texto: 'El criterio no aplica a esta interacción en particular (por ejemplo, un aviso automático sin respuesta que evaluar). No suma ni resta.' },
      { resultado: 'NO_EVALUADO', texto: 'No hubo información suficiente o la evaluación automática falló. No suma ni resta y no se usa en calibración.' },
    ],
    parrafos: [
      'Interacción defectuosa: basta con que un criterio crítico tenga resultado NO_CUMPLE. '
        + 'Los criterios no críticos con NO_CUMPLE afectan el puntaje, pero no marcan la interacción como defectuosa.',
      'Cada criterio tiene un peso en el catálogo (visible en la pestaña Criterios). Los criterios críticos '
        + 'pesan más que los no críticos, y los resultados N/A y NO_EVALUADO quedan fuera del cálculo.',
      'Los criterios críticos se agrupan en tres categorías: ECU (impacto en el seller), '
        + 'ECN (impacto en el negocio) y ECC (cumplimiento contractual o normativo).',
    ],
  },
  {
    id: 'tipos',
    titulo: 'Tipos de interacción',
    subtitulo: 'Cómo se clasifica lo que SAACA evalúa',
    tipos: [
      { tipo: 'EMAIL',             texto: 'Email enviado por el agente al seller. Se evalúa el contenido de la respuesta frente a lo que el seller planteó en el hilo.' },
      { tipo: 'TASK_INFO_REQUEST', texto: 'Tarea de "Solicitud de información" en la que el agente pide datos al seller. Se evalúa si lo solicitado tiene sentido para el caso.' },
      { tipo: 'TASK_REOPEN',       texto: 'Tarea de reapertura del caso. Se evalúa el motivo de reapertura seleccionado y si el agente respondió después de reabrir.' },
      { tipo: 'TASK_RECONTACT',    texto: 'Tarea de recontacto. Se evalúa si el motivo de recontacto seleccionado corresponde a lo que el seller realmente pidió.' },
      { tipo: 'CASE',              texto: 'El caso completo al cierre. Se evalúa la comunicación de cierre.' },
    ],
    parrafos: [
      'Las respuestas del seller y las tareas internas no se evalúan actualmente: se usan solo como contexto del hilo.',
    ],
  },
  {
    id: 'calibracion',
    titulo: 'Calibración humana',
    subtitulo: 'Cómo se mide el acuerdo entre auditores y SAACA',
    pasos: [
      { titulo: 'Muestra',
        texto: 'Líderes de Calidad generan una muestra de evaluaciones de SAACA con resultado CUMPLE o NO_CUMPLE, '
          + 'repartida por criterio, resultado y país, y la asignan a auditores.' },
      { titulo: 'Voto a ciegas',
        texto: 'El auditor revisa el caso y marca CUMPLE o NO_CUMPLE por criterio sin ver lo que dijo SAACA.' },
      { titulo: 'Revisión frente a SAACA',
        texto: 'Al guardar, se revela el resultado y la observación de SAACA. El auditor puede mantener o cambiar '
          + 'su voto; si su voto final difiere de SAACA o lo cambió, debe explicar por qué.' },
      { titulo: 'Acuerdo',
        texto: 'El porcentaje de acuerdo es la proporción de criterios calibrados donde el voto final del auditor '
          + 'coincide con SAACA. Se muestra en Reportería (últimos 90 días) y en el seguimiento de Calibración.' },
    ],
  },
];
