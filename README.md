# Amplify — Planner y Trace

## ¿Qué es Amplify?

**Amplify** es la aplicación interna del equipo de Comunicaciones. Reúne módulos de calidad SAACA
(Reportería, Calibración, Glosario y Diagnóstico IA) con Planner para solicitudes y decisiones de
publicación, y Trace para el seguimiento en Looker Studio.

| Vista | Qué hace | Estado |
|---|---|---|
| **Planner** | Calendario de solicitudes manuales, aprobación/reprogramación de solicitudes externas y creación manual. | Aprobación externa disponible; integración de aprobadas al calendario pendiente. “Plan” permanece como placeholder. |
| **Trace** | Reporte de seguimiento en Looker Studio embebido. | Disponible; dashboard propio no implementado. |
| **Reportería** | Dashboard con filtros cruzados, vistas ejecutiva/operativa, drilldown y descarga CSV. Incluye Diagnóstico IA cuando Kairos está configurado. | Disponible. |
| **Calibración** | Evaluación humana en dos pasos: voto ciego y confirmación frente a SAACA. | Disponible para rol AUDITOR o superior. |
| **Glosario** | Catálogo de criterios vigente e historial, con descripción de cómo evalúa SAACA. | Disponible para todos los roles. |

---

## Vistas

### Planner

Planner ofrece las vistas **Calendario**, **Lista y aprobaciones** y **Nueva solicitud**.

- **Calendario:** muestra las solicitudes manuales creadas directamente en Amplify. Estas no
  requieren aprobación porque quien las crea ya considera las reglas de programación.
- **Lista y aprobaciones:** usa `vw_planner_solicitudes`, alimentada por la tabla externa
  `comunicaciones_solicitudes_amplify`. Un analista asigna prioridad y autoriza en la fecha
  solicitada o reprograma con fecha y motivo. Las decisiones se registran como eventos append-only.
- **Nueva solicitud:** permite crear una solicitud manual; ofrece “Plan” como opción, pero su
  formulario todavía no está definido. Las solicitudes manuales se guardan en una tabla distinta y
  no entran a la cola de aprobación. El formulario incluye área (opción única), países y tipos de
  material (selección múltiple), acción, audiencia (opción única), fecha y campos de descripción.
  “Otras” permite especificar texto. El responsable se rellena con el nombre del usuario autenticado;
  su email se conserva solo para auditoría y no se expone en la respuesta.
- **Pendiente de integrar:** el calendario visible todavía no combina las solicitudes externas
  autorizadas/reprogramadas. El backend ya expone `/api/planner/calendario` para esa lectura.

### Flujo de aprobación y API

Todos los endpoints requieren usuario autenticado. No hay restricción por rol para aprobar todavía.

| Método y ruta | Uso |
|---|---|
| `GET /api/planner/solicitudes` | Lista externa con filtros opcionales: estado, país, proyecto, área, responsable, prioridad y rango de fechas. |
| `GET /api/planner/calendario?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` | Solicitudes decididas por fecha aprobada, con filtros combinables. |
| `GET /api/planner/filtros` | Valores de filtros disponibles desde la vista. |
| `POST /api/planner/solicitudes/{sp_item_id}/decision` | Autoriza o reprograma; registra una fila en la tabla de decisiones. |
| `GET /api/planner/solicitudes/{sp_item_id}/historial` | Historial de decisiones, con email del analista enmascarado. |
| `GET/POST /api/planner/solicitudes-manuales` | Lista o crea solicitudes manuales; no participan en aprobación. |

- **Autorizar:** requiere prioridad y toma `fecha_publicacion` de la fuente. Si no existe, solicita
  reprogramar.
- **Reprogramar:** requiere prioridad, fecha no pasada según `PLANNER_TIMEZONE` y motivo.
- **Concurrencia:** el cliente envía `decision_esperada`; si la última decisión o la versión de la
  solicitud cambió, el endpoint responde `409` y no agrega la decisión.
- **Estados:** `PENDIENTE`, `MODIFICADA`, `AUTORIZADA` y `REPROGRAMADA`. Las solicitudes externas
  sin decisión no aparecen en el calendario de aprobaciones.
- **Privacidad:** correos de solicitantes/analistas no se muestran en la cola. El historial entrega
  una versión enmascarada del correo del analista.

### Trace

- Embebe un reporte de **Looker Studio** en un `iframe` (`frontend/src/components/trace/TraceEmbed.jsx`).
- Un dashboard propio es una evolución futura, no una funcionalidad actual.

### Módulos de calidad SAACA

- **Reportería:** extracto diario cacheado, filtros cruzados, indicadores y descarga CSV. El
  drilldown consulta `pitch_eval_enriched` para incluir observaciones que no están en la vista del
  dashboard.
- **Diagnóstico IA:** botón desde Reportería que genera un informe HTML imprimible con el alcance y
  filtros seleccionados. El código calcula cifras y muestras; Kairos redacta el diagnóstico. Es
  opcional: sin `KAIROS_JWT` solo esta función responde con servicio no disponible. La cuota mensual
  se aplica por usuario; los errores técnicos no consumen cuota.
- **Calibración:** el primer voto es ciego y no escribe en `saaca_eval_detail`. La confirmación
  registra el voto final como `HUMANO` y completa la muestra.
- **Glosario:** muestra criterios únicos, versión vigente e historial.
- **Interacción:** la consulta de caso construye el hilo seller/interno desde `saaca_input_*`.

---

## Stack

- Backend: **FastAPI**, Python 3.12.
- Datos: **BigQuery**.
- Frontend: **React 18 + Vite 5**.
- Visualización: **Looker Studio** embebido en Trace.
- Despliegue: **Cloud Run detrás de IAP**.

---

## Autenticación (resumen)

- **Identidad:** viene del header `X-Goog-Authenticated-User-Email` que inyecta **IAP**. No hay
  login propio.
- **Autorización:** el email se valida contra `pitch_users`; el contexto incluye nombre y rol.
- **Planner:** sus endpoints requieren usuario autenticado. Las decisiones no tienen aún guard de
  rol; está marcado para definirse después de probar el flujo.
- En **desarrollo local** no hay IAP, así que la identidad se simula con `DEV_AUTH_BYPASS=true`
  y `DEV_USER_EMAIL`. Estas variables **no existen en Cloud Run**.

> Nunca desplegar con `--allow-unauthenticated`.

---

## BigQuery

Proyecto configurado: `bi-fcom-drmb-sell-in-sbx`. El backend usa dos datasets: `BQ_DATASET`
(`sandbox_data_analytics_psc`, Pitch) y `PLANNER_DATASET` (`sandbox_data_analytics`, Planner).
La identidad de usuarios se consulta en `pitch_users` dentro de `BQ_DATASET`.

### Dataset `sandbox_data_analytics_psc`

| Recurso | Tipo | Uso y acceso de la app |
|---|---|---|
| `pitch_users` | Tabla | Lee usuarios activos y roles para autenticación/autorización. |
| `pitch_eval_enriched` | Tabla | Lee reportería, calibración y muestras de diagnóstico. |
| `vw_pitch_dashboard_extracto` | Vista | Fuente del dashboard de reportería. |
| `vw_pitch_calibracion_comparativa` | Vista | KPI/comparativa de calibración. |
| `saaca_cat_criteria` | Tabla | Catálogo de criterios. |
| `saaca_cat_criteria_mapping` | Tabla | Mapeo criterio–tipo de interacción para evaluación humana. |
| `pitch_muestra_calibracion` | Tabla | Lee/escribe muestras y votos de Calibración. |
| `saaca_eval_detail` | Tabla | Lee evaluaciones y agrega resultados `HUMANO` de Calibración. |
| `pitch_diagnosticos_ia` | Tabla | Registra intentos/uso del Diagnóstico IA; no almacena el HTML generado. |
| `saaca_input_case`, `saaca_input_email`, `saaca_input_seller_reply` | Tablas | Lee información para el hilo y contexto de casos. |
| `saaca_input_task_info_request`, `saaca_input_task_reopen`, `saaca_input_task_recontact`, `saaca_input_task_internal` | Tablas | Lee interacciones/tareas para el hilo del caso. |

Las tablas `saaca_input_*`, `pitch_eval_enriched`, catálogos y vistas son fuentes de lectura para
Amplify; la app no las modifica. Las únicas escrituras del módulo de calidad son las indicadas en
Calibración y Diagnóstico IA.

### Dataset `sandbox_data_analytics`

| Recurso | Tipo | Uso y acceso de la app |
|---|---|---|
| `comunicaciones_solicitudes_amplify` | Tabla externa | Fuente externa de solicitudes para aprobación; Amplify solo la lee. La carga externa la mantiene mediante `MERGE`. |
| `comunicaciones_decisiones_amplify` | Tabla | Registro append-only de autorizaciones/reprogramaciones; Amplify inserta decisiones. |
| `vw_planner_solicitudes` | Vista | Une la solicitud externa con su última decisión y calcula estado/fecha de calendario. Es la fuente de Lista y aprobaciones y de los endpoints de lectura del Planner. |
| `comunicaciones_solicitudes_manuales_amplify` | Tabla (DDL disponible) | Destino de solicitudes creadas en Amplify; la app lee e inserta mediante Load Job. No requiere aprobación ni se une a la cola externa. La ejecución del DDL no está confirmada. |

Los DDL están en [`docs/sql/`](docs/sql/): `comunicaciones_decisiones_amplify.sql`,
`comunicaciones_solicitudes_manuales_amplify.sql` y `vw_planner_solicitudes.sql`. La vista fue
creada y verificada en BigQuery; una consulta devolvió `sp_item_id = 1`, estado `PENDIENTE`,
`fecha_publicacion = 2026-10-31` y `fecha_calendario = NULL`. `require_partition_filter` de la
fuente externa es `false`. Aunque el DDL de la tabla manual está disponible, no se ha confirmado
que se haya ejecutado en BigQuery. Los archivos SQL son referencia/reproducibilidad; no los
ejecutes de nuevo en producción sin revisión.

La app nunca escribe en la tabla externa de solicitudes. La tabla de decisiones conserva el
historial completo y la vista usa solo la decisión más reciente.

---

## Requisitos previos

| Requisito | Versión | Dónde conseguirlo |
|-----------|---------|-------------------|
| Python | 3.12 | https://www.python.org/downloads/ |
| Node.js | 20 LTS o superior | https://nodejs.org/en/download |
| Git | reciente | https://git-scm.com/downloads |
| Acceso a BigQuery | — | Solicitar IAM y credenciales al responsable del proyecto |

> Las credenciales **no se suben al repositorio** (deben estar en `.gitignore`). El acceso a
> BigQuery requiere la **VPN de Falabella** activa.

---

## Estructura del proyecto

```
Amplify/
├── README.md
├── backend/                    # API REST — FastAPI + Python 3.12
│   ├── main.py                 # Entry point
│   ├── config.py               # Settings desde .env / entorno
│   ├── requirements.txt
│   ├── .env.example
│   ├── auth/                   # Identidad por header de IAP
│   ├── connectors/             # Conexión a BigQuery
│   ├── models/                 # Schemas
│   ├── routers/                # API de autenticación, Pitch y Planner
│   ├── services/               # Reportería, calibración, Planner y diagnóstico
│   └── tests/                  # Pruebas backend con FakeBQ
│
└── frontend/                   # SPA React + Vite
    ├── package.json
    └── src/
        ├── App.jsx             # Router
        ├── pages/              # Planner, Trace
        ├── components/
        │   ├── planner/        # Ticket de aprobación
        │   ├── trace/          # Looker Studio embebido
        │   └── layout/         # Layout, Sidebar, TopBar
        ├── services/           # Cliente HTTP
        └── utils/
```

---

## Configuración inicial (primera vez)

### Backend

```powershell
# 1. Desde la raíz del proyecto, crear el entorno virtual
py -3.12 -m venv backend\.venv

# 2. Instalar dependencias
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

# 3. Crear el archivo de variables de entorno
copy backend\.env.example backend\.env
```

Completar `backend/.env` con las variables necesarias:

| Variable | Descripción | Obligatoria |
|----------|-------------|-------------|
| `BQ_PROJECT_ID` | Proyecto GCP de BigQuery | Sí |
| `BQ_DATASET` | Dataset | Sí |
| `BQ_CREDENTIALS_PATH` | Ruta al JSON de credenciales | Sí |
| `PLANNER_DATASET` | Dataset del Planner; default `sandbox_data_analytics` | No |
| `PLANNER_TIMEZONE` | Zona horaria para validar reprogramaciones; default `America/Bogota` | No |
| `DEV_AUTH_BYPASS` | `true` para simular identidad en local | Solo en dev |
| `DEV_USER_EMAIL` | Email con el que se entra en local | Solo en dev |
| `ALLOWED_ORIGINS` | Orígenes CORS (`http://localhost:5173`) | Sí |
| `KAIROS_JWT` | Credencial opcional para Diagnóstico IA | Solo para Diagnóstico IA |

### Frontend

```powershell
cd frontend
npm ci
```

> Usar `npm ci` (respeta el lockfile). Evitar `npm audit fix --force`, porque sube versiones
> mayores y puede romper la compatibilidad con los plugins.

---

## Levantar la app en desarrollo

Se necesitan dos terminales, con la VPN activa.

```powershell
# Terminal 1 — Backend (desde la raíz)
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8080
```

Verificación: http://localhost:8080/api/health

```powershell
# Terminal 2 — Frontend
cd frontend
npm run dev
```

Verificación: http://localhost:5173

---

## Pruebas

```powershell
# Desde la raíz del proyecto
backend\.venv\Scripts\python.exe -m pytest backend\tests

# Desde frontend/
cd frontend
npm test
npm run build
```

Las pruebas backend usan `FakeBQ` y no consultan ni escriben BigQuery. Las pruebas frontend usan
`node --test`.

---

## Hoja de ruta

- [ ] **Planner:** mostrar solicitudes externas autorizadas/reprogramadas en el Calendario, con
  filtros y prioridad. El calendario visible hoy conserva el flujo manual directo.
- [ ] **Planner:** definir y construir el formulario para “Plan”.
- [ ] **Planner:** agregar una vista dedicada de Auditoría; hoy el historial se muestra dentro del
  ticket de aprobación.
- [ ] **Planner:** definir roles específicos para aprobar solicitudes.
- [ ] **Trace:** evaluar si se reemplaza Looker Studio por un dashboard propio.

---

## Despliegue

La app corre en **Cloud Run** detrás de **IAP**.

| Dato | Valor |
|------|-------|
| Proyecto GCP | `flb-rtl-3p-sx-reg-dev` |
| Servicio de Cloud Run | `amplify-app` |
| Región | `us-east4` |
| Imagen | `us-east4-docker.pkg.dev/flb-rtl-3p-sx-reg-dev/sx-reg/amplify-app:latest` |
| Trigger de Cloud Build | `amplify-deploy` |

### Estado del pipeline

`cloudbuild.yaml` compila y publica la imagen en Artifact Registry, región `us-east4`, repositorio
`sx-reg`, servicio `amplify-app`. El paso de Cloud Run está comentado mientras la cuenta del
trigger no tenga permisos; Cloud Build **no despliega** nuevas revisiones automáticamente.

`DEPLOY.md` y `docs/deploy-cloud-run.md` conservan instrucciones heredadas de Pitch, no un runbook
validado para Amplify. No usarlos para desplegar esta aplicación. El despliegue manual requiere el
procedimiento y los permisos del responsable de infraestructura.

### Reglas de seguridad al desplegar

- **Nunca** agregar `--allow-unauthenticated`: el servicio debe seguir protegido por IAP.
- Para cambiar configuración usar `--update-env-vars` / `--update-secrets`, nunca `--set-*`,
  que borra lo existente.

## Troubleshooting

**1. `DefaultCredentialsError` al iniciar el backend**
→ Verificar que `BQ_CREDENTIALS_PATH` apunta al JSON y que el archivo existe.

**2. BigQuery no conecta / `403 Access Denied`**
→ Verificar que la **VPN de Falabella** está activa.

**3. `GET /api/auth/me` devuelve 401 en local**
→ Revisar `DEV_AUTH_BYPASS=true` y `DEV_USER_EMAIL` en `backend/.env` y reiniciar el backend.

**4. `GET /api/auth/me` devuelve 403 en local**
→ El `DEV_USER_EMAIL` no está dado de alta en la tabla de usuarios.

**5. Puerto 8080 ocupado**
→ Usar `--port 8081` y ajustar `ALLOWED_ORIGINS` si aplica.

**6. El frontend no compila**
```powershell
cd frontend
Remove-Item -Recurse -Force node_modules
npm ci
```

**7. Planner no muestra solicitudes de aprobación**
→ Confirmar acceso a `vw_planner_solicitudes` y que existan solicitudes externas no eliminadas.
Las solicitudes manuales de Amplify no aparecen en esta cola.

**8. Trace no carga**
→ Confirmar que el usuario tiene permiso para abrir el reporte de Looker Studio embebido.