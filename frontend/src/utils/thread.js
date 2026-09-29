/**
 * Utilidades para procesar el hilo del caso (thread).
 *
 * Movido desde CaseViewer.jsx para permitir testeo independiente y reutilización.
 */

/**
 * Limpieza básica de formato para un campo de texto individual
 * (cuerpo de email, descripción de tarea, etc.): normaliza saltos de línea,
 * elimina sangrías y espacios de origen (Salesforce/HTML→texto), líneas
 * separadoras decorativas y colas de "Mensaje original" citado.
 *
 * Es la misma limpieza de base que usa el hilo del caso — usarla en cualquier
 * lugar donde se muestre un campo largo crudo, para que ambas vistas lean igual.
 */
export function cleanFieldText(raw) {
  if (!raw) return raw;
  return String(raw)
    .replace(/\r\n/g, '\n')
    .replace(/^[ \t]+/gm, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/^(Cc|Cco|Archivo adjunto|Cuerpo):\s*$/gm, '')
    .replace(/\n-{3,}[^\n]*Mensaje original[^\n]*[\s\S]*?(?=\n\n\[|$)/g, '')
    .replace(/^\s*[:.=\-_*|#~]{10,}\s*$/gm, '')
    .replace(/^\s+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Limpia y normaliza el texto del hilo del caso.
 *
 * Problema raíz: Salesforce actualiza retroactivamente el task_description
 * de la tarea "solicitud al seller" para añadir la respuesta cuando esta llega.
 * El SP de SAACA vuelca ambos eventos como filas separadas (fecha solicitud +
 * fecha respuesta), y AMBAS quedan con "Solicitud\n...\nRespuesta Seller\n...".
 *
 * Solución: procesar bloque a bloque — la PRIMERA aparición de cada texto de
 * solicitud → [SOLICITUD AL SELLER]; la siguiente vez que ese mismo texto aparece
 * (ahora con respuesta incluida) → [RESPUESTA DEL SELLER] mostrando solo la respuesta.
 */
export function cleanThreadText(rawText) {
  if (!rawText) return rawText;

  // ── Paso 1: limpieza básica de formato (compartida con cleanFieldText) ──
  let text = cleanFieldText(rawText);

  // ── Paso 2: separar en bloques y procesar SELLER_REPLY ──────────────────
  const blocks = text.split(/\n\n(?=\[(?:APERTURA|RESPUESTA|EMAIL|SOLICITUD|RECONTACTO|REAPERTURA|GESTI))/);
  const seenSolicitudes = new Set();

  const processed = blocks.map(block => {
    const m = block.match(/^\[RESPUESTA DEL SELLER - ([^\]]+)\]\n?([\s\S]*)$/);
    if (!m) return block;

    const date    = m[1];
    const content = m[2];

    const solIdx = content.search(/^Solicitud[ \t]*$/m);
    const resIdx = content.search(/^Respuesta Seller[ \t]*$/m);

    // Sin secciones reconocibles → devolver tal cual
    if (solIdx === -1 && resIdx === -1) return block;

    let solicitudText = '';
    let respuestaText = '';

    if (solIdx !== -1) {
      const afterSol = content.slice(solIdx).replace(/^Solicitud[ \t]*\n/, '');
      const cutAt    = afterSol.search(/^Respuesta Seller[ \t]*$/m);
      solicitudText  = (cutAt !== -1 ? afterSol.slice(0, cutAt) : afterSol).trim();
    }
    if (resIdx !== -1) {
      const afterRes = content.slice(resIdx).replace(/^Respuesta Seller[ \t]*\n/, '');
      respuestaText  = afterRes.trim();
    }

    const key = solicitudText.slice(0, 120); // clave de dedup

    // Solo solicitud (sin respuesta aún)
    if (!respuestaText) {
      seenSolicitudes.add(key);
      return `[SOLICITUD AL SELLER - ${date}]\n${solicitudText}`;
    }

    // Tiene solicitud Y respuesta
    if (solicitudText) {
      if (!seenSolicitudes.has(key)) {
        // Primera aparición de esta solicitud → mostrar solo solicitud
        seenSolicitudes.add(key);
        return `[SOLICITUD AL SELLER - ${date}]\n${solicitudText}`;
      }
      // Ya mostrada → mostrar solo la respuesta del seller
      return `[RESPUESTA DEL SELLER - ${date}]\n${respuestaText}`;
    }

    // Solo respuesta
    return `[RESPUESTA DEL SELLER - ${date}]\n${respuestaText}`;
  });

  return processed.join('\n\n');
}

/**
 * Parsea el hilo limpio en un array de bloques estructurados.
 * @param {string|null} cleanedText – texto ya procesado por cleanThreadText()
 * @returns {{ id: number, header: string, type: string, date: string, body: string }[]}
 */
export function parseThreadBlocks(cleanedText) {
  if (!cleanedText) return [];
  const raw = cleanedText.split(/\n\n(?=\[)/);
  return raw.map((block, i) => {
    const headerMatch = block.match(/^\[([^\]]+)\]/);
    if (!headerMatch) return { id: i, header: block.slice(0, 60), date: '', type: 'INFO', body: block };
    const full = headerMatch[1];                         // "EMAIL - 2026-02-20 10:14"
    const dash = full.indexOf(' - ');
    const type = dash !== -1 ? full.slice(0, dash) : full;
    const date = dash !== -1 ? full.slice(dash + 3) : '';
    const body = block.slice(headerMatch[0].length).replace(/^\n/, '').trim();
    return { id: i, header: full, type, date, body };
  });
}
