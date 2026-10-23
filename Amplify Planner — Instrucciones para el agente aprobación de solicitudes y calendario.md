# Amplify Planner — Instrucciones para el agente: aprobación de solicitudes y calendario

Oct 22, 2026 · @William Andres Suarez Bautista

## Contexto y objetivo

El objetivo es que la vista **Planner** trabaje con datos reales: cada solicitud del formulario llega como un ticket, un analista la autoriza o le cambia la fecha de publicación, y solo entonces aparece en el **Calendario**.

Hoy las pestañas *Calendario* y *Lista y aprobaciones* muestran datos de ejemplo (COM-1040 a COM-1051). Las solicitudes reales ya se cargan, mediante un proceso externo con `MERGE`, en la tabla `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.comunicaciones_solicitudes_amplify`.

Alcance de este plan:

- **Lista y aprobaciones:** reemplazar los datos de ejemplo por las solicitudes reales, presentadas como tickets, con dos acciones: *Autorizar* y *Modificar fecha*.
- **Calendario:** mostrar las solicitudes decididas en su fecha final, con filtros por país, proyecto, área, responsable, prioridad y estado.
- **Auditoría:** mostrar el historial de decisiones de cada solicitud.

Todas las solicitudes pasan por un analista. El formulario no indica urgencia: el analista asigna la prioridad según lo acordado internamente con el solicitante.

## Reglas de trabajo para el agente

Estas reglas aplican en todas las fases y tienen prioridad sobre cualquier otra indicación de este documento.

1. **Investigar antes de implementar.** Antes de escribir código, revisa el repositorio y entrega un resumen corto con: el stack real, la estructura de carpetas, dónde viven hoy el Calendario, *Lista y aprobaciones* y Auditoría, de dónde salen los datos de ejemplo, cómo se conecta el backend a BigQuery y cómo se identifica al usuario. Si algo de este documento no coincide con el código, gana el código: repórtalo y espera confirmación.
2. **No inventar.** No inventes campos, tablas, endpoints ni datos. Si falta un dato, déjalo como pregunta abierta.
3. **No ejecutar cambios en BigQuery ni desplegar.** Prepara el SQL (DDL de la tabla y la vista) en `docs/sql/` para que una persona lo revise y lo ejecute. No hagas `gcloud run deploy` ni cambios de configuración en Cloud Run.
4. **Consultas siempre parametrizadas.** Nunca construyas SQL concatenando valores que vengan del usuario.
5. **Datos personales.** No expongas correos (`responsable_email`, `creado_por_email`) en el frontend, en logs, en nombres de archivo ni en datos de prueba. En la interfaz se muestra el nombre del responsable; si hiciera falta el correo, va enmascarado (`•••@dominio`). Los datos de prueba usan valores ficticios.
6. **Secretos.** No escribas credenciales, tokens ni rutas a archivos de credenciales en el código ni en la documentación. Se leen de variables de entorno.
7. **Cambios pequeños y con pruebas.** Un commit por paso lógico, con pruebas que pasen. No actualices dependencias ni uses `npm audit fix --force`.
8. **Reutilizar lo existente.** Usa los componentes, estilos y el cliente HTTP que ya existen en el proyecto; no agregues librerías nuevas sin justificarlo.

## Fuente de datos

La única fuente de solicitudes es `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.comunicaciones_solicitudes_amplify`. Es una tabla particionada y de **solo lectura** para la app: la alimenta un proceso externo que hace `MERGE`, así que cualquier escritura de la app en ella se perdería en la siguiente carga.

| Campo | Tipo | Modo | Uso en la app |
| --- | --- | --- | --- |
| `sp_item_id` | INTEGER | REQUIRED | Identificador único de la solicitud. Clave para unir con las decisiones. |
| `titulo` | STRING | NULLABLE | Título del ticket. |
| `responsable_id` | INTEGER | NULLABLE | Filtro por responsable. |
| `responsable_nombre` | STRING | NULLABLE | Se muestra en ticket y calendario. |
| `responsable_email` | STRING | NULLABLE | No se envía al frontend. |
| `fecha_publicacion` | DATE | NULLABLE | Fecha solicitada de publicación. |
| `area` | STRING | NULLABLE | Filtro y dato del ticket. |
| `pais` | STRING | NULLABLE | Nombre largo (ej. “Falabella Chile”). |
| `pais_codigo` | STRING | NULLABLE | Código (CL, CO, PE). Se usa en filtros y chips. |
| `proyecto` | STRING | NULLABLE | Filtro y dato del ticket. |
| `fecha_solicitud` | DATE | NULLABLE | Fecha en que se creó la solicitud. |
| `creado_por_email` | STRING | NULLABLE | No se envía al frontend. |
| `sp_created_at` | TIMESTAMP | REQUIRED | Creación en el origen. |
| `sp_modified_at` | TIMESTAMP | REQUIRED | Última modificación en el origen. Sirve para detectar cambios después de una decisión. |
| `fecha_cargue` | TIMESTAMP | REQUIRED | Momento de la carga. |
| `is_deleted` | BOOLEAN | REQUIRED | `true` = solicitud eliminada en el origen. Se excluye de todas las vistas. |

**Calidad de datos observada en la muestra del 2026-10-20 (4 filas).** La interfaz debe manejar estos casos sin romperse:

- `titulo` y `area` vienen en `null` en todas las filas. El encabezado del ticket debe usar `proyecto` como respaldo y mostrar “Sin área” cuando falte el área.
- Una fila no tiene responsable (`responsable_id`, `responsable_nombre` y `responsable_email` en `null`). Se muestra “Sin responsable”.
- El agente debe reportar si `titulo` y `area` siguen vacíos, porque puede ser un problema de mapeo en la carga del formulario y no de la app.

**Verificaciones que el agente debe hacer antes de usar la tabla:**

- Confirmar por qué columna está particionada y si exige filtro de partición (`require_partition_filter`). Si lo exige, la vista debe incluirlo.
- Confirmar que `sp_item_id` es único. Si no lo es, la vista debe quedarse con la fila más reciente por `sp_modified_at`.

## Reglas de negocio y estados

Toda solicitud pasa por un analista antes de llegar al calendario. El formulario no marca urgencia: el analista asigna la prioridad al decidir.

&#91;embedded content: estados de una solicitud · 4 estados, 1 decisión\]

La única forma de salir de *Pendiente* o *Modificada* es una decisión del analista; ninguna regla automática mueve solicitudes al calendario.

- **Autorizar:** la solicitud va al calendario en la `fecha_publicacion` solicitada, con la prioridad elegida.
- **Modificar fecha:** el analista elige una fecha nueva (no pasada) y escribe el motivo. La solicitud va al calendario en esa fecha.
- **Modificada:** si `sp_modified_at` es posterior a la última decisión, la solicitud cambió en el formulario. Se mantiene en su fecha aprobada, con alerta, y vuelve a la lista para que el analista decida de nuevo.
- **Varias decisiones:** cuenta solo la más reciente; las anteriores quedan en Auditoría.
- **Estados en pantalla:** los cuatro estados reemplazan a los de ejemplo (Borrador, En revisión, Aprobado, Programado, Enviado). *Enviado* no se implementa porque no hay fuente que confirme el envío.

## Modelo de datos nuevo

Se agregan dos objetos en el mismo dataset: una **tabla de decisiones** de solo inserción y una **vista consolidada** que la une con las solicitudes. El agente guarda este SQL en `docs/sql/` y **no lo ejecuta**; lo ejecuta una persona después de revisarlo.

### Tabla de decisiones

Cada vez que un analista autoriza o reprograma se inserta una fila nueva. Nunca se actualizan ni se borran filas: así la tabla es también el registro de auditoría.

```sql
CREATE TABLE IF NOT EXISTS `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.comunicaciones_decisiones_amplify` (
  decision_id        STRING    NOT NULL,  -- UUID generado por el backend
  sp_item_id         INT64     NOT NULL,  -- solicitud decidida
  accion             STRING    NOT NULL,  -- 'AUTORIZAR' | 'REPROGRAMAR'
  prioridad          STRING    NOT NULL,  -- 'ALTA' | 'MEDIA' | 'BAJA'
  fecha_solicitada   DATE,                -- fecha_publicacion al momento de decidir
  fecha_aprobada     DATE      NOT NULL,  -- fecha que va al calendario
  motivo             STRING,              -- obligatorio si accion = 'REPROGRAMAR'
  decidido_por_email STRING    NOT NULL,  -- identidad del usuario autenticado
  decidido_at        TIMESTAMP NOT NULL,
  decision_anterior  STRING               -- decision_id que se reemplaza (null en la primera)
)
PARTITION BY DATE(decidido_at)
CLUSTER BY sp_item_id;
```

Se guarda `fecha_aprobada` incluso al autorizar sin cambios. Así, si alguien edita la fecha en el formulario después, el calendario no se mueve solo.

### Vista consolidada

Es la única fuente que usa el backend para Lista, Calendario y Auditoría (esta última lee también la tabla de decisiones completa).

```sql
CREATE OR REPLACE VIEW `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.vw_planner_solicitudes` AS
WITH solicitudes AS (
  SELECT *
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.comunicaciones_solicitudes_amplify`
  WHERE is_deleted = FALSE
  -- Agregar aquí el filtro de partición si la tabla lo exige.
  QUALIFY ROW_NUMBER() OVER (PARTITION BY sp_item_id ORDER BY sp_modified_at DESC) = 1
),
ultima_decision AS (
  SELECT *
  FROM `bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics.comunicaciones_decisiones_amplify`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY sp_item_id ORDER BY decidido_at DESC) = 1
)
SELECT
  s.sp_item_id,
  s.titulo,
  s.proyecto,
  s.area,
  s.pais,
  s.pais_codigo,
  s.responsable_id,
  s.responsable_nombre,
  s.fecha_solicitud,
  s.fecha_publicacion,
  s.sp_modified_at,
  d.decision_id,
  d.accion,
  d.prioridad,
  d.fecha_aprobada,
  d.motivo,
  d.decidido_at,
  CASE
    WHEN d.sp_item_id IS NULL             THEN 'PENDIENTE'
    WHEN s.sp_modified_at > d.decidido_at THEN 'MODIFICADA'
    WHEN d.accion = 'AUTORIZAR'           THEN 'AUTORIZADA'
    WHEN d.accion = 'REPROGRAMAR'         THEN 'REPROGRAMADA'
  END AS estado,
  d.fecha_aprobada AS fecha_calendario
FROM solicitudes s
LEFT JOIN ultima_decision d USING (sp_item_id);
```

Notas para el agente:

- La vista no expone `responsable_email`, `creado_por_email` ni `decidido_por_email`. El correo de quien decidió solo se lee desde el endpoint de Auditoría, y se entrega enmascarado.
- `fecha_calendario` solo tiene valor cuando hay decisión. Las pendientes no van al calendario.

## Backend

El backend expone cinco endpoints bajo `/api/planner`, todos detrás de la misma autenticación que el resto de la app. Los nombres y rutas son una propuesta: el agente los adapta a las convenciones que encuentre en el repositorio.

| Método y ruta | Para qué | Parámetros |
| --- | --- | --- |
| `GET /api/planner/solicitudes` | Lista de tickets para *Lista y aprobaciones* | `estado`, `pais_codigo`, `proyecto`, `area`, `responsable_id`, `prioridad`, `desde`, `hasta` (todos opcionales) |
| `GET /api/planner/calendario` | Eventos del calendario | `desde` y `hasta` (obligatorios), más los mismos filtros |
| `GET /api/planner/filtros` | Valores disponibles para cada filtro | — |
| `POST /api/planner/solicitudes/{sp_item_id}/decision` | Autorizar o reprogramar | Cuerpo descrito abajo |
| `GET /api/planner/solicitudes/{sp_item_id}/historial` | Decisiones de una solicitud, para Auditoría | — |

### Cuerpo de la decisión

```json
{
  "accion": "REPROGRAMAR",
  "prioridad": "ALTA",
  "fecha_aprobada": "2026-11-05",
  "motivo": "Se cruza con el envío de Black Friday",
  "decision_esperada": "uuid-de-la-ultima-decision-o-null"
}
```

### Validaciones del endpoint de decisión

1. La solicitud existe en la vista y no está eliminada. Si no, `404`.
2. `accion` es `AUTORIZAR` o `REPROGRAMAR`, y `prioridad` es `ALTA`, `MEDIA` o `BAJA`. Si no, `422`.
3. Con `AUTORIZAR`, el backend toma `fecha_aprobada` de `fecha_publicacion` e ignora la que venga en el cuerpo. Si la solicitud no tiene `fecha_publicacion`, responde `422` y pide reprogramar.
4. Con `REPROGRAMAR`, `fecha_aprobada` y `motivo` son obligatorios, y la fecha no puede ser anterior a hoy.
5. **Control de concurrencia:** `decision_esperada` debe coincidir con el `decision_id` de la última decisión (o ser `null` si no hay). Si otro analista decidió antes, responde `409` y el frontend recarga el ticket.
6. `decidido_por_email` sale de la identidad autenticada del usuario, **nunca** del cuerpo de la petición.
7. La inserción usa una consulta `INSERT` parametrizada (no streaming), para que la fila sea visible de inmediato en la vista.

### Seguridad

- Por ahora no hay roles: cualquier usuario autenticado puede decidir. Deja el guard de rol preparado en un solo punto (un `TODO` en la dependencia del endpoint de decisión), para activarlo cuando se definan los roles.
- El endpoint de decisión rechaza peticiones sin usuario identificado (`401`).
- Los logs registran `sp_item_id`, acción y resultado, pero no correos.
- La cuenta de servicio de la app solo necesita leer la tabla de solicitudes y la vista, e insertar en la tabla de decisiones. Si el agente detecta permisos más amplios, lo reporta.
- La zona horaria para “hoy” se define en una variable de configuración. Valor por defecto propuesto: `America/Bogota`.

## Frontend

Se modifican las tres pestañas existentes del Planner; no se crean pestañas nuevas. *Nueva solicitud* queda como está, porque las solicitudes llegan del formulario.

### Lista y aprobaciones

Reemplaza los datos de ejemplo por `GET /api/planner/solicitudes` y conserva el diseño actual (tabla, chips de país y chips de conteo por estado).

- **Chips de estado:** Pendiente, Modificada, Autorizada y Reprogramada, cada uno con su conteo. Por defecto se muestran Pendiente y Modificada, que son las que el analista debe atender.
- **Columnas:** ID (`SOL-{sp_item_id}`), Título, País, Proyecto, Área, Responsable, Fecha solicitada, Fecha aprobada, Prioridad y Estado.
- **Columnas sin fuente:** *Canal* y *Aviso soporte* no existen en la tabla. Se ocultan; no se rellenan con valores inventados.
- **Orden:** primero las pendientes, por `fecha_publicacion` más cercana.

Al hacer clic en una fila se abre el **ticket** (panel lateral o modal, según lo que ya use la app):

- Encabezado: `SOL-{sp_item_id} · {titulo}`; si no hay título, se usa `proyecto`.
- Datos: país, proyecto, área, responsable, fecha de solicitud y fecha de publicación solicitada. Los valores nulos se muestran como “Sin área”, “Sin responsable”, etc.
- Si el estado es **Modificada**, un aviso indica que la solicitud cambió en el formulario después de la última decisión.
- Selector de **prioridad** (Alta, Media, Baja), obligatorio para decidir.
- Botón **Autorizar**: confirma con la fecha solicitada.
- Botón **Modificar fecha**: abre un selector de fecha (no permite días pasados) y un campo de motivo obligatorio.
- **Aviso de conflicto** al elegir fecha: si ese día ya hay otras comunicaciones del mismo país en el calendario, se muestra cuántas. Es solo informativo, no bloquea. Alimenta el chip *Conflictos* existente.
- Si el backend responde `409`, el ticket se recarga y se informa que otra persona ya decidió.

### Calendario

Reemplaza los datos de ejemplo por `GET /api/planner/calendario`, pidiendo el rango visible.

- Cada evento se ubica en `fecha_calendario` y muestra título (o proyecto), código de país y prioridad.
- Las reprogramadas llevan una marca visual. Al pasar el cursor se ve la fecha que se había solicitado.
- Las modificadas siguen en su fecha aprobada, con una marca de alerta, hasta que el analista vuelva a decidir.
- **Filtros:** país (el actual), más proyecto, área, responsable, prioridad y estado. Los valores salen de `GET /api/planner/filtros`. Los filtros deben poder combinarse y limpiarse con un botón.
- Clic en un evento: abre el mismo ticket de *Lista y aprobaciones*.

### Auditoría

Muestra el historial de `GET /api/planner/solicitudes/{sp_item_id}/historial`: fecha y hora, acción, prioridad, fecha solicitada, fecha aprobada, motivo y quién decidió (con el correo enmascarado). Orden: lo más reciente primero.

## Fases de implementación

El trabajo se hace en seis fases, en orden. Al terminar cada una, el agente se detiene, entrega un resumen y espera aprobación antes de seguir.

**Fase 0 — Reconocimiento (sin cambios de código)**

- [ ] Resumen del stack, la estructura y dónde viven Calendario, Lista y Auditoría.
- [ ] Origen de los datos de ejemplo actuales.
- [ ] Cómo se conecta el backend a BigQuery y cómo obtiene la identidad del usuario.
- [ ] Diferencias entre este documento y el código.

Criterio de aceptación: el resumen está aprobado por una persona.

**Fase 1 — SQL**

- [ ] `docs/sql/comunicaciones_decisiones_amplify.sql` con el DDL de la tabla.
- [ ] `docs/sql/vw_planner_solicitudes.sql` con la vista, ajustada al filtro de partición si aplica.

Criterio de aceptación: una persona ejecuta ambos archivos y `SELECT * FROM vw_planner_solicitudes` devuelve las solicitudes no eliminadas con estado `PENDIENTE`.

**Fase 2 — Backend de lectura**

- [ ] Endpoints `solicitudes`, `calendario` y `filtros`, con sus pruebas.

Criterio de aceptación: los endpoints devuelven datos reales, sin correos, y los filtros combinados funcionan.

**Fase 3 — Backend de decisiones**

- [ ] Endpoint de decisión con todas las validaciones, y endpoint de historial.

Criterio de aceptación: una decisión insertada cambia el estado en la vista; una decisión con `decision_esperada` vieja recibe `409`; una reprogramación sin motivo recibe `422`.

**Fase 4 — Frontend: Lista y ticket**

- [ ] Lista con datos reales, chips de estado, ticket y acciones Autorizar y Modificar fecha.

Criterio de aceptación: un analista autoriza una solicitud y reprograma otra desde la interfaz, y ambas cambian de estado sin recargar la página.

**Fase 5 — Frontend: Calendario y Auditoría**

- [ ] Calendario con datos reales y filtros combinables.
- [ ] Auditoría con el historial de decisiones.

Criterio de aceptación: las dos solicitudes de la fase 4 aparecen en el calendario en su fecha aprobada, los filtros las muestran y ocultan correctamente, y su historial aparece en Auditoría.

## Pruebas

Las pruebas automáticas no tocan BigQuery: usan dobles del conector, con datos ficticios y sin correos reales. La prueba contra datos reales es manual y la hace una persona en desarrollo.

**Backend (automáticas)**

- [ ] Autorizar guarda `fecha_aprobada = fecha_publicacion` aunque el cuerpo traiga otra fecha.
- [ ] Autorizar una solicitud sin `fecha_publicacion` responde `422`.
- [ ] Reprogramar sin motivo, sin fecha o con fecha pasada responde `422`.
- [ ] `decision_esperada` desactualizada responde `409` y no inserta nada.
- [ ] `decidido_por_email` se toma de la identidad, aunque el cuerpo traiga otro valor.
- [ ] Petición sin usuario identificado responde `401`.
- [ ] Ninguna respuesta de `solicitudes`, `calendario` ni `filtros` contiene campos de correo.
- [ ] Las consultas usan parámetros, no valores concatenados.

**Frontend (automáticas, sobre la lógica pura)**

- [ ] Encabezado del ticket con y sin `titulo`.
- [ ] Valores nulos de área y responsable.
- [ ] Combinación de filtros del calendario.
- [ ] Cálculo del aviso de conflicto por país y fecha.

**Manual en desarrollo (con la vista ya creada)**

- [ ] Autorizar una solicitud y verla en el calendario en su fecha.
- [ ] Reprogramar otra y verla en la nueva fecha con su marca.
- [ ] Editar en el formulario una solicitud ya decidida, esperar la carga y verla como *Modificada*.
- [ ] Revisar el historial de ambas en Auditoría.

## Fuera de alcance y decisiones pendientes

El agente no implementa lo siguiente en este plan:

- **Roles y permisos.** Se definen después de probar las vistas; por ahora solo queda el punto preparado para el guard.
- **Rechazar solicitudes.** Solo existen *Autorizar* y *Modificar fecha*.
- **Reglas automáticas de distribución.** El analista decide la fecha; el aviso de conflicto es solo informativo.
- **Canal y Aviso soporte.** No tienen fuente en la tabla.
- **El proceso de carga del formulario.** Se mantiene separado del backend web (ver abajo).

### Dónde debe vivir el proceso de carga

Recomendación: **fuera del backend web**, como un proceso propio. Puede estar en este mismo repositorio, en una carpeta `jobs/` con su propio Dockerfile, desplegado como Cloud Run Job y programado con Cloud Scheduler.

Razones:

- **Mínimo privilegio.** El proceso necesita credenciales del origen del formulario y permiso de `MERGE`. El backend web no debe tenerlos.
- **Ciclo de vida.** Un servicio web escala a cero y corta peticiones largas. Un job se ejecuta completo, con reintentos y registros propios.
- **Aislamiento de fallos.** Si la carga falla, la app sigue funcionando con los últimos datos cargados, y al revés.

Si el proceso actual ya funciona de forma estable donde está, no es urgente moverlo; esta recomendación aplica cuando se decida integrarlo al proyecto.

### Decisiones a confirmar

- [ ] Nombre de la tabla de decisiones (`comunicaciones_decisiones_amplify`) y de la vista (`vw_planner_solicitudes`).
- [ ] Valores de prioridad: Alta, Media y Baja, como en la vista actual.
- [ ] Zona horaria para validar fechas pasadas (propuesta: `America/Bogota`).
- [ ] Comportamiento de las solicitudes *Modificadas*: siguen en el calendario con alerta hasta una nueva decisión.
