# Pitch — notas para Claude Code

App de calidad SAACA (evolución de "Pauta"). Módulos:
- **Reportería:** dashboard sobre un extracto diario en memoria, con cross-filter. Incluye el
  **Diagnóstico IA**, un botón junto a "Descargar CSV".
- **Calibración:** evaluación humana de una muestra en dos pasos (voto a ciegas → revisión frente a SAACA).
- **Glosario:** catálogo de criterios y cómo trabaja SAACA.

Backend FastAPI + BigQuery, frontend React (Vite), IA vía el gateway Kairos (Gemini). Despliega a
Cloud Run (`pitch-app`, us-central1, proyecto `flb-rtl-3p-sx-reg-dev`).

- **Onboarding humano** (setup local, estructura, pruebas, troubleshooting): [`README.md`](README.md).
- **Despliegue:** [`docs/deploy-cloud-run.md`](docs/deploy-cloud-run.md).
- **Forma de trabajo:** [`docs/project-guidelines.md`](docs/project-guidelines.md). Resumen: investigar →
  planear → implementar con pruebas → commits pequeños con prefijo (`feat:`, `fix:`, `docs:`…);
  no hacer push ni merge.
- **Historial de sprints y SQL aplicado a mano:** [`docs/sprints/README.md`](docs/sprints/README.md).

## Dónde está qué

- **Auth:**
  - `backend/auth/middleware.py`: las dos puertas.
  - `backend/services/user_service.py`: `get_user_by_email`, `LOWER(email)`, caché de 5 min.
  - `backend/config.py`: settings y dev bypass.
- **Reportería (backend):** `routers/pitch_dashboard.py` → `services/pitch_reporting_service.py`
  (arma el extracto columnar, cacheado por día).
- **Reportería (frontend):**
  - `contexts/PitchDataContext.jsx` es el corazón del cross-filter (`filteredRows` a nivel
    interacción, `criterionRows` a nivel criterio).
  - Los gráficos viven en `components/reporteria/`.
  - Las agregaciones puras están en `utils/aggregations.js`.
  - El semáforo está en `utils/scores.js`.
- **Calibración:** `routers/pitch_calibracion.py` → `services/calibracion_service.py`. Frontend en
  `pages/Calibracion*.jsx` y `components/calibracion/`.
- **Glosario** (todos los roles):
  - Backend: `routers/glosario.py` → `services/glosario_service.py`. `consolidar_catalogo` deja una
    entrada por criterio (versión vigente más historial) y excluye las filas HUMANO del mapping.
    Caché diaria.
  - Frontend: `pages/Glosario.jsx` y `components/glosario/`.
  - El texto fijo de "Cómo funciona SAACA" está en `constants/glosarioContenido.js`. Revisar con
    Calidad antes de editarlo.
- **Diagnóstico IA** (feature aislada; ver sección propia abajo):
  - Backend: `routers/pitch_diagnostico.py` → `services/diagnostico/`.
  - Conector: `connectors/genai_connector.py`.
  - Frontend: `components/diagnostico/` y `utils/diagnostico.js`.
- **Roles:** `constants/roles.js` (frontend) y `dependencies.py` (`_ROLE_ORDER`, backend). Mantener
  ambos sincronizados.

## Autenticación — patrón IAP-header (estándar Overture, igual que Canon)

**No hay login propio, ni Google Sign-In client-side, ni JWT de sesión.**
- La identidad viene del header **`X-Goog-Authenticated-User-Email`** que inyecta IAP, con formato
  `accounts.google.com:correo@falabella.com`; se hace el split por `:`.
- El `KAIROS_JWT` del Diagnóstico IA es otra cosa: es la credencial del backend hacia el gateway de
  IA, no una sesión de usuario.

El flujo, en `backend/auth/middleware.py`, tiene **dos puertas**:

1. **IAP decide quién llega:** inyecta el header y borra cualquier copia que venga del cliente.
2. **`pitch_users` decide quién accede y con qué rol:** es una lista blanca por email exacto. No se
   valida el dominio del email en ningún punto, porque la tabla ya es la lista blanca.

Respuestas y rol:
- **Email que no está en `pitch_users`:** 403. Nunca se asigna un rol por defecto.
- **Sin header ni fallback:** 401.
- **Rol:** lo resuelve `get_user_by_email` (cacheado 5 min) y puebla `request.state.user`.
- **Frontend:** `GET /api/auth/me` expone el rol para ajustar la navegación y los permisos.
- **Jerarquía:** `VIEWER < AUDITOR < LIDER_QUALITY < ADMIN`.

**Desarrollo local** (sin IAP): `DEV_AUTH_BYPASS=true` más `DEV_USER_EMAIL` simulan la
identidad. Estas variables NO existen en Cloud Run.

### ⚠️ Regla de seguridad innegociable
El header NO está firmado. Es confiable **solo** porque IAP lo inyecta y el **invoker de Cloud Run
está bloqueado al service agent de IAP** (`service-<num>@gcp-sa-iap.iam...`).

- `pitch-app` debe seguir SIEMPRE con `--no-allow-unauthenticated` y **nunca** con un binding
  `allUsers`. Si el contenedor fuera alcanzable directamente, cualquiera podría forjar el header y
  suplantar a cualquier usuario, incluido ADMIN.
- IAP está integrado directamente sobre el Cloud Run (modo IAP-on-Cloud-Run, sin Load Balancer
  separado).
- Para cambiar configuración en Cloud Run usar `--update-secrets` / `--update-env-vars`, **nunca**
  `--set-*`, que reemplaza todo y borraría el volumen de credenciales.

## Datos

- **`pitch_users`** es una TABLA (no una vista): fuente de usuarios y roles. El alta y la gestión son
  data op directa.
- **`pitch_eval_enriched`** (tabla) y **`vw_pitch_dashboard_extracto`** (vista, sin
  `observacion_saaca`) alimentan Reportería y el Diagnóstico IA. La consulta que arma la tabla está en
  `docs/sprints/vw_pitch_eval_enriched.sql`. Grano: una fila por (interacción, criterio).
- **Tablas con escritura desde la app (las únicas):**
  - `pitch_muestra_calibracion` y `saaca_eval_detail` (`mechanism='HUMANO'`), desde Calibración.
  - `pitch_diagnosticos_ia`, registro de uso del Diagnóstico IA para la cuota.
  - Todas se escriben con `insert_rows_dml` (Load Job), nunca con streaming insert.
- **`result_label` humano:** solo CUMPLE o NO_CUMPLE. No existe PARCIAL, y N/A y NO_EVALUADO se
  excluyen del universo de calibración.
- **`saaca_cat_criteria` está versionado** (`criteria_version`, `valid_from/valid_to`, `is_active`):
  nunca hacer JOIN directo. Usar `_catalogo_canonico()` de `calibracion_service.py`, que deja una
  fila por criterio. Un JOIN directo duplicó C0007/C0008 y causó el bug "1/2" (sprint 2026-10).
- **`saaca_eval_detail`** puede tener varias filas AUTO por interacción × criterio (reintentos de
  SAACA). En calibración, el veredicto SAACA de referencia es `resultado_auto_snapshot` de la muestra.
- **Semáforo de calidad ponderada:** ≥90 Bueno, ≥85 Regular, <85 Crítico. Está definido en dos
  lugares que deben coincidir: `SCORE_THRESHOLDS` (`frontend/src/utils/scores.js`) y `_SEMAFORO`
  (`backend/services/diagnostico/metricas.py`). El comentario del CSS en `design-system` los
  referencia.

## Calibración — flujo de dos pasos (sprint 2026-10)

1. `POST /evaluar`: voto a ciegas, sin observación. La muestra pasa a `EN_PROGRESO` con
   `resultado_ciego`/`fecha_voto_ciego`. No escribe en `saaca_eval_detail`.
2. `GET /revision/{id}`: voto a ciegas frente al veredicto y la observación de SAACA (solo filas `EN_PROGRESO`).
3. `POST /confirmar`: voto final (puede cambiar) más observación, obligatoria si el voto final
   difiere de SAACA o del voto a ciegas. Genera una fila HUMANO con el voto final y la muestra pasa a `COMPLETADO`.

Solo cuenta el voto final. DDL asociado: `docs/sprints/sprint-2026-10-ddl.sql`.

## Diagnóstico IA (sprint 2026-10)

Botón en Reportería que genera un diagnóstico ejecutivo en HTML imprimible con los filtros aplicados.
**Principio: la IA redacta, el código calcula.**

- **Flujo** (`services/diagnostico/service.py`):
  cuota → filtros → contexto (extracto cacheado) → muestras (BQ) → IA → HTML → registro.
  - `filtros.py` y `metricas.py` replican EXACTO `PitchDataContext.jsx` y `utils/aggregations.js`.
    **Si cambia una fórmula allá, cambia aquí** (y los tests de `test_diagnostico_metricas.py`).
    Única diferencia: los filtros de correo no distinguen mayúsculas.
  - `contexto.py` arma los datos:
    - KPIs del alcance frente a la operación y al equipo;
    - clusters, con criterios evaluados por tipo;
    - criterios, procesos y tendencia;
    - la valoración, con el semáforo;
    - alcance PERSONA / EQUIPO / GENERAL.
    - Los correos nunca viajan a la IA.
  - `muestras.py` es la única consulta en vivo: unas 40 evaluaciones con `observacion_saaca`, sesgadas
    a NO_CUMPLE y repartidas por criterio.
  - `prompt.py` tiene el schema estricto `DiagnosticoIA` y un glosario de indicadores.
    **Versionar `PROMPT_VERSION`** ante cualquier cambio; queda registrado en cada fila.
    Mantener el prompt simple y general, sin reglas para casos puntuales (lección de SAACA).
  - `render.py`: las tablas salen del contexto y el texto de la IA se escapa.
- **Endpoints** (`/api/pitch/diagnostico`):
  - `POST` (raíz): genera y devuelve el HTML descargable.
  - `GET /cuota`.
  - `POST /contexto` y `POST /preview`: solo ADMIN, para validar cifras y prompt sin consumir cuota.
- **Cuota:** `DIAGNOSTICO_CUOTA_MENSUAL` por usuario y mes calendario (UTC). ADMIN no tiene límite.
  Los fallos técnicos se registran como `ERROR` y no descuentan. Los errores del usuario (período
  inválido, menos de 20 interacciones) no se registran.
- **No se almacena:** se descartó GCS por costo y mantenimiento; se regenera.
- **Configuración opcional:** sin `KAIROS_JWT` solo esta feature responde 503. El conector es una
  réplica mínima del de SAACA (mismo endpoint y JWT, par endpoint/modelo, retener el cliente por
  DT-003) más timeout y reintentos ante 429/5xx.
- **Scripts:** `backend/scripts/probar_genai.py` (prueba de conexión) y
  `backend/scripts/generar_diagnostico_prueba.py` (HTML local sin cuota).
  Setup: `docs/sprints/sprint-2026-10-diagnostico-ia-setup.md`.

## Pruebas

- **Backend:** `backend\.venv\Scripts\python -m pytest backend/tests`.
  - Dependencias en `backend/requirements-dev.txt`.
  - Dobles en `conftest.py` (`FakeBQ`) y en cada test (IA falsa). **Nunca tocan BigQuery ni el gateway.**
- **Frontend:** `npm test` en `frontend/` (`node --test`, sin dependencias). La lógica pura va en
  `utils/*.js` con su `*.test.js`. Validar además con `npm run build`.
- **Dependencias del frontend:** instalar siempre con `npm ci`. **Nunca `npm audit fix --force`**:
  subió Vite 5 → 8 y rompió la compatibilidad (sprint 2026-10).

## Deuda técnica conocida

- **Credenciales BigQuery:** Pitch corre en producción con las credenciales personales de
  aoviedo@falabella.com en vez de una cuenta de servicio dedicada, mientras se resuelve el acceso
  cross-project a `bi-fcom-drmb-sell-in-sbx` vía gobernanza de datos de Falabella. Son el secret
  `BQ_CREDENTIALS_AOVIEDO`, montado como volumen en `/app/credentials/bq/gcp_user_credentials.json`.
- **Confianza del header:** IAP es la única capa; no se verifica la firma
  `X-Goog-IAP-JWT-Assertion`. Queda pendiente un hardening opcional (defensa en profundidad).
- **Fórmulas duplicadas JS/Python:** las métricas del tablero existen en `utils/aggregations.js` y en
  `services/diagnostico/metricas.py`. Están cubiertas por tests, pero se mantienen a mano.
- **`KAIROS_JWT` sin expiración conocida:** la renovación es manual en Secret Manager (ver runbook).
- **Dependencias del frontend:** hay avisos de `npm audit` (vite/esbuild solo afectan al servidor de
  desarrollo; react-router exige pasar a v7). Es una tarea planificada aparte.
