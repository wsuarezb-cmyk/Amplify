# Trace: configuración y operación

La vista nativa de Trace consulta estas fuentes de solo lectura:

- `bi-fcom-drmb-sell-in-sbx.sandbox_pzamora.base_contactos_v2`
- `bi-fcom-drmb-sell-in-sbx.crm_sellers.detalle_contactos_historico`

Las consultas ocurren únicamente en el backend. Las listas de identificadores se procesan en
lotes de 1.000 valores y se envían como parámetros de BigQuery. El campo de entrada admite hasta
1.000.000 caracteres; si se supera, la API rechaza la solicitud sin truncar valores.

## Persistencia

Negocio/operación debe confirmar el proyecto, dataset, ownership y permisos antes de crear tablas.
No se fijó un dataset de destino en el código. Configurar los IDs completos en `backend/.env` o
en el entorno del servicio:

```dotenv
TRACE_AUDIENCE_HISTORY_TABLE=project.dataset.trace_audience_history
TRACE_CONTACTS_SNAPSHOT_TABLE=project.dataset.trace_contacts_daily_snapshot
TRACE_NOT_FOUND_ALERT_THRESHOLD=0.20
TRACE_DAILY_DROP_THRESHOLD=0.20
```

DDL propuesto para el historial:

```sql
CREATE TABLE `<PROJECT>.<DATASET>.trace_audience_history` (
  audience_id STRING NOT NULL,
  created_at TIMESTAMP NOT NULL,
  created_date DATE NOT NULL,
  created_by STRING NOT NULL,
  template STRING NOT NULL,
  search_type STRING NOT NULL,
  initial_sellers INT64 NOT NULL,
  found_sellers INT64 NOT NULL,
  final_sellers INT64 NOT NULL,
  final_contacts INT64 NOT NULL,
  filters_json STRING,
  exclusions_json STRING,
  warnings_json STRING,
  export_file_name STRING,
  status STRING NOT NULL
)
PARTITION BY created_date
CLUSTER BY template, created_by;
```

DDL propuesto para los snapshots diarios:

```sql
CREATE TABLE `<PROJECT>.<DATASET>.trace_contacts_daily_snapshot` (
  snapshot_date DATE NOT NULL,
  captured_at TIMESTAMP NOT NULL,
  total_rows INT64 NOT NULL,
  distinct_sellers INT64 NOT NULL,
  total_contacts INT64 NOT NULL
)
PARTITION BY snapshot_date;
```

La descarga y el historial requieren `TRACE_AUDIENCE_HISTORY_TABLE`. La comparación de volumen
requiere `TRACE_CONTACTS_SNAPSHOT_TABLE`. La captura manual idempotente está disponible para ADMIN
en `POST /api/trace/contacts/daily-volume/capture`; no se configuró Scheduler ni otra ejecución
automática porque no existe una capacidad aprobada identificada en el repositorio. La primera
captura no genera alerta. La reducción de sellers o contactos igual o superior a 20% frente al
snapshot anterior genera alerta.

## Contratos de Trace

- `POST /api/trace/audiences/preview`: preview, filtros, conteos por etapa y alertas.
- `POST /api/trace/audiences/export`: exige template y confirmación de filtros; atribuye el registro
  de historial al usuario autenticado, no a un email enviado por el frontend.
- `GET /api/trace/sends/summary` y `/api/trace/sends/detail`: resumen y detalle paginado por template.
- `GET /api/trace/audiences/history`: búsqueda paginada del historial.
- `GET /api/trace/contacts/daily-volume`: estado de la base contra los snapshots disponibles.

El CSV contiene exactamente `email,seller_id,phone`, en ese orden. Las categorías nulas se
representan en la interfaz como `Sin dato`; `flag_or_0_3m` no es un filtro V1. La regla de exclusión
utiliza `flag_or0_sin_login_3m`: el valor `1` siempre se excluye, los nulos se conservan como
`Sin dato` y generan una advertencia, sin equipararse a `Mantener`.

## Pendientes de operación

- Confirmar proyecto/dataset de destino, permisos y retención de las dos tablas.
- Configurar una ejecución diaria autorizada para la captura del snapshot.
- Validar las categorías reales de `mc_held_status`; se obtienen dinámicamente desde BigQuery.
- Ejecutar pruebas de conciliación con datos reales autorizados antes de retirar Looker. Looker
  permanece disponible como vista secundaria hasta recibir la validación explícita de negocio.
## Generación de audiencias: filtros locales

`POST /api/trace/audiences/dataset` se llama una sola vez por consulta y devuelve el dataset base
(14 columnas explícitas, formato columnar). Filtros, tarjetas, gráficos, funnel y alertas se
calculan en el navegador con `frontend/src/utils/traceAudience.js`; cambiar filtros no genera
requests. `POST /audiences/export` sigue revalidando en el backend antes de descargar. Las tarjetas
de "Sellers sin canal" y "Sellers con múltiples contactos" miden el universo encontrado (no cambian
con los filtros). El dataset vive solo en memoria de la página.
