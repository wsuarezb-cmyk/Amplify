# docs/sprints — registro de sprints

Planes, diagnósticos de datos y SQL de cada sprint. El SQL (consultas, DDL, limpiezas) **no lo
ejecuta la app**: se corre a mano en la consola de BigQuery y se deja aquí como registro de qué se
hizo y por qué. Si algo se aplicó en producción, está marcado.

## Sprint 2026-09 — Correcciones de Calibración

| Archivo | Qué es | Estado |
|---|---|---|
| [`sprint-2026-09-calibration-fixes.md`](sprint-2026-09-calibration-fixes.md) | Issues y pedido de análisis: refresh "Not Found", batches que no llegan, "sin criterios pendientes", lentitud, falsos "sin acceso", mini dashboard | Resuelto |

## Sprint 2026-10

### Fase 1 — Calibración

Muestra solo con veredictos comparables, catálogo sin duplicados ("1/2"), filtros de bandeja y
flujo de dos pasos.

| Archivo | Qué es | Estado |
|---|---|---|
| [`sprint-2026-10-diagnostico.sql`](sprint-2026-10-diagnostico.sql) | Consultas de diagnóstico de datos de Calibración (D1–D10) y limpiezas (L1–L4). *No confundir con el Diagnóstico IA.* | Corrido. L3/L4 borraron 11 filas HUMANO duplicadas; L1/L2 no encontraron nada que anular |
| [`resultados-sprint-2026-10-diagnostico.txt`](resultados-sprint-2026-10-diagnostico.txt) | Resultados de D1–D10, con el DDL de las tablas y vistas involucradas | Evidencia |
| [`sprint-2026-10-ddl.sql`](sprint-2026-10-ddl.sql) | DDL-1: columnas `resultado_ciego` / `fecha_voto_ciego` en `pitch_muestra_calibracion`. DDL-2: desempate por `evaluated_at` en `vw_pitch_calibracion_comparativa` | Aplicado |

Hallazgos clave, detallados en `CLAUDE.md` › Datos:
- `saaca_cat_criteria` está versionado: C0007 y C0008 tienen v1 inactiva y v2 activa.
- `saaca_eval_detail` puede tener varias corridas AUTO por interacción × criterio.

### Fase 2 — Glosario

No requirió SQL: solo lee `saaca_cat_criteria` y `saaca_cat_criteria_mapping`.

### Fase 3 — Diagnóstico IA

Botón en Reportería que genera un diagnóstico ejecutivo con IA.

| Archivo | Qué es | Estado |
|---|---|---|
| [`sprint-2026-10-diagnostico-ia.sql`](sprint-2026-10-diagnostico-ia.sql) | Tabla `pitch_diagnosticos_ia` (registro y cuota). La sección A limpia la versión anterior, que tenía GCS e historial de descargas | Aplicar la sección A si se creó la versión anterior |
| [`sprint-2026-10-diagnostico-ia-setup.md`](sprint-2026-10-diagnostico-ia-setup.md) | Configuración local, prueba del gateway y script para revisar la calidad del texto | Guía vigente |

Decisiones de diseño:
- **La IA redacta, el código calcula:** las cifras replican las fórmulas del tablero.
- **Sin almacenamiento:** el diagnóstico se regenera en vez de guardarse.
- **Cuota mensual por usuario:** ADMIN no tiene límite y los intentos fallidos no cuentan.
- **Semáforo:** ≥90 Bueno, ≥85 Regular, <85 Crítico, alineado con el tablero.

## Referencia

| Archivo | Qué es |
|---|---|
| [`vw_pitch_eval_enriched.sql`](vw_pitch_eval_enriched.sql) | Consulta que construye `pitch_eval_enriched`: deduplicación de evaluaciones, `score_interaccion` ponderado, banderas `es_primera_fila_*`, resolución de agente y manager. Es la fuente de verdad de los campos que usan Reportería y el Diagnóstico IA |
