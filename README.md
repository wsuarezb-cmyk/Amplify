# Pitch — App de Calidad SAACA

## ¿Qué es Pitch?

**Pitch** es la interfaz web interna del equipo de calidad de Seller Experience para analizar y
calibrar las evaluaciones de **SAACA**, el pipeline automático de calidad de Falabella que evalúa
con IA las interacciones de soporte a sellers. Es la evolución de la app anterior, "Pauta".

| Módulo | Qué hace | Rol mínimo |
|---|---|---|
| **Reportería** | Dashboard sobre un extracto diario cargado en memoria, con *cross-filter* estilo Data Studio: cualquier filtro o click recalcula todo el tablero sin nuevas consultas. Incluye KPIs (calidad ponderada, % defectuosas, accuracy por categoría), evolutivo, cumplimiento por criterio, heatmap de tipificación, comparativas, vista de agente y export CSV. | VIEWER |
| ↳ **Diagnóstico IA** | Botón junto a "Descargar CSV". Genera un diagnóstico ejecutivo (HTML imprimible) con los filtros aplicados: indicadores frente a la operación, hallazgos basados en evaluaciones reales de SAACA, reconocimientos y plan de acción. Tiene un límite mensual por usuario y no se almacena. | VIEWER |
| **Calibración** | Evaluación humana de una muestra en dos pasos: primero un voto a ciegas, luego la revisión frente a SAACA (el auditor puede cambiar su voto y explica los desacuerdos). Mide el acuerdo humano–SAACA. Cada voto final queda en `saaca_eval_detail` con `mechanism = 'HUMANO'`. | AUDITOR (generar muestras: LIDER_QUALITY) |
| **Glosario** | Transparenta cómo trabaja SAACA: catálogo de criterios (activos, inactivos e historial de versiones), matriz criterio × tipo de interacción y explicación del proceso y los resultados. | VIEWER |

La usan líderes de Quality, auditores y analistas de operaciones.

**Stack:**
- Backend: **FastAPI + BigQuery**, Python 3.12.
- Frontend: **React 18 + Vite 5**.
- IA: **Gemini vía el gateway corporativo Kairos**, el mismo que usa SAACA.
- Despliegue: **Cloud Run detrás de IAP**.

---

## Autenticación (resumen)

**No hay login propio, ni Google Sign-In, ni JWT de sesión.**
- **Identidad:** viene del header `X-Goog-Authenticated-User-Email` que inyecta **IAP**.
- **Rol:** se resuelve contra la tabla `pitch_users`, que funciona como lista blanca por email exacto.
- **Jerarquía de roles:** `VIEWER < AUDITOR < LIDER_QUALITY < ADMIN`.

En **desarrollo local** no hay IAP, así que la identidad se simula con `DEV_AUTH_BYPASS=true` y
`DEV_USER_EMAIL`. Estas variables **no existen en Cloud Run**.

> El modelo de confianza completo y la **regla de seguridad innegociable** (nunca
> `--allow-unauthenticated`) están en [`CLAUDE.md`](CLAUDE.md).

---

## Requisitos previos

| Requisito | Versión | Dónde conseguirlo |
|-----------|---------|-------------------|
| Python | 3.12 (la imagen de Cloud Run usa 3.12) | https://www.python.org/downloads/ |
| Node.js | 20 LTS o superior (la imagen de Cloud Run compila con 20) | https://nodejs.org/en/download |
| Git | reciente | https://git-scm.com/downloads |
| `gcp_user_credentials.json` | — | Credenciales de BigQuery; pedírselas a Ana Oviedo (aoviedo@falabella.com) |
| `KAIROS_JWT` | — | Solo para el Diagnóstico IA; es el secret `kairos-jwt-saaca-evaluate-job-dev` |

> El JSON de credenciales da acceso al dataset `sandbox_data_analytics_psc` del proyecto
> `bi-fcom-drmb-sell-in-sbx`. **No se sube al repositorio** (está en `.gitignore`). El acceso a
> BigQuery requiere la **VPN de Falabella** activa.

---

## Estructura del proyecto

```
pitch-app/
├── README.md                   # Este archivo — onboarding humano
├── CLAUDE.md                   # Reglas del proyecto: auth, datos, flujos, convenciones
├── Dockerfile                  # Imagen multi-stage (build React + runtime FastAPI)
├── cloudbuild.yaml             # (opcional) build vía Cloud Build; hoy se usa el build local
├── docs/                       # Documentación — ver "Documentación" más abajo
│
├── backend/                    # API REST — FastAPI + Python 3.12
│   ├── main.py                 # Entry point: middlewares, routers, SPA de React
│   ├── config.py               # Settings (Pydantic) desde .env / entorno
│   ├── dependencies.py         # Conector BigQuery singleton + guards de rol
│   ├── requirements.txt        # Dependencias de runtime
│   ├── requirements-dev.txt    # + pytest (desarrollo)
│   ├── .env.example
│   ├── auth/                   # middleware.py — identidad por header de IAP
│   ├── connectors/             # bigquery_connector.py, genai_connector.py (gateway Kairos)
│   ├── models/                 # Schemas Pydantic (pitch, glosario, diagnostico, auth)
│   ├── routers/                # auth, pitch_dashboard, pitch_calibracion, pitch_diagnostico,
│   │                           #   glosario, criteria, interaction
│   ├── services/               # pitch_reporting, calibracion, glosario, user, interaction
│   │   └── diagnostico/        # Diagnóstico IA: filtros, métricas, contexto, muestras,
│   │                           #   prompt, render, repositorio, service
│   ├── scripts/                # probar_genai.py, generar_diagnostico_prueba.py (+ DDL legacy de Pauta)
│   └── tests/                  # pytest — nunca tocan BigQuery ni la IA (dobles en conftest.py)
│
└── frontend/                   # SPA React 18 + Vite 5
    ├── package.json            # scripts: dev, build, test
    ├── vite.config.js          # dev server en :5173 con proxy /api → :8080
    ├── design-system/          # tokens de marca (CSS + logo) — requerido para compilar
    └── src/
        ├── App.jsx             # Router (React Router v6)
        ├── pages/              # Reporteria, Calibracion, CalibracionCaso, Glosario, Unauthorized…
        ├── components/
        │   ├── reporteria/     # KPIs, filtros, gráficos, vista de agente, drilldown, export
        │   ├── diagnostico/    # botón y modal del Diagnóstico IA
        │   ├── calibracion/    # muestra, bandeja con filtros, voto a ciegas, revisión frente a SAACA
        │   ├── glosario/       # criterios, matriz, "Cómo funciona SAACA"
        │   └── layout/         # Layout, Sidebar, TopBar
        ├── contexts/           # AuthContext, PitchDataContext (extracto + cross-filter)
        ├── constants/          # roles, rutas, secciones de reportería, texto del glosario
        ├── services/           # api.js — cliente HTTP
        └── utils/              # lógica pura (+ *.test.js): aggregations, scores, filtros…
```

---

## Configuración inicial (primera vez)

### Backend

```powershell
# 1. Desde la raíz del proyecto, crear el entorno virtual (Python 3.12)
py -3.12 -m venv backend\.venv

# 2. Instalar dependencias (runtime + pytest)
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt

# 3. Crear el archivo de variables de entorno
copy backend\.env.example backend\.env
```

**4. Completar `backend/.env`:**

| Variable | Descripción | Obligatoria |
|----------|-------------|-------------|
| `BQ_PROJECT_ID` | Proyecto GCP de BigQuery (`bi-fcom-drmb-sell-in-sbx`) | ✅ |
| `BQ_DATASET` | Dataset (`sandbox_data_analytics_psc`) | ✅ |
| `BQ_CREDENTIALS_PATH` | Ruta al `gcp_user_credentials.json`. Si es relativa, se resuelve desde `backend/` | ✅ |
| `DEV_AUTH_BYPASS` | `true` para simular identidad en local (sin IAP) | ✅ en dev |
| `DEV_USER_EMAIL` | Email con el que entras en local (debe estar en `pitch_users`) | ✅ en dev |
| `ALLOWED_ORIGINS` | Orígenes CORS (`http://localhost:5173`) | ✅ |
| `KAIROS_JWT` | JWT del gateway de IA. Sin él, solo el Diagnóstico IA responde 503 | Solo para Diagnóstico IA |
| `DIAGNOSTICO_CUOTA_MENSUAL` | Diagnósticos por usuario y mes (por defecto 5; ADMIN sin límite) | No |

> `config.py` también acepta los nombres legacy `BQ_PROJECT` y `GOOGLE_APPLICATION_CREDENTIALS`.
> El endpoint y el modelo del gateway ya tienen por defecto los de SAACA (`KAIROS_CHAT_ENDPOINT`,
> `GENAI_MODEL`); solo se cambian juntos.

### Frontend

```powershell
cd frontend
npm ci
```

> ⚠️ Usa **`npm ci`**, que instala exactamente las versiones del lockfile. **Nunca** uses
> `npm audit fix --force`: sube versiones mayores sin preguntar (por ejemplo, Vite 5 → 8), rompe
> la compatibilidad con los plugins y cambia el lockfile que se despliega. La actualización de
> dependencias es una tarea planificada aparte.

El frontend no necesita variables de entorno: la identidad es transparente vía IAP y solo
consulta `GET /api/auth/me` para conocer el rol.

---

## Levantar la app en desarrollo

Necesitas **dos terminales**, ambas con la VPN activa.

```powershell
# Terminal 1 — Backend (desde la raíz)
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --port 8080
```
**Verificación:** http://localhost:8080/api/health debe responder `{"status": "ok", ...}`. La
documentación interactiva de la API está en http://localhost:8080/api/docs.

```powershell
# Terminal 2 — Frontend
cd frontend
npm run dev
```
**Verificación:** http://localhost:5173.

Con `DEV_AUTH_BYPASS=true` la app entra directo como `DEV_USER_EMAIL`, sin pantalla de login, con
el rol que tenga ese email en `pitch_users`.

---

## Pruebas

```powershell
# Backend (desde la raíz) — no tocan BigQuery ni la IA
backend\.venv\Scripts\python.exe -m pytest backend\tests

# Frontend — lógica pura con node --test, sin dependencias extra
cd frontend
npm test
npm run build
```

Para probar el gateway de IA y la calidad del diagnóstico con datos reales, ver
[`docs/sprints/sprint-2026-10-diagnostico-ia-setup.md`](docs/sprints/sprint-2026-10-diagnostico-ia-setup.md).

---

## Datos (resumen)

- **Lectura:**
  - `pitch_users`: usuarios y roles (alta y gestión por data op directa).
  - `pitch_eval_enriched` y la vista `vw_pitch_dashboard_extracto`: alimentan Reportería y el
    Diagnóstico IA. La consulta que arma la tabla está en `docs/sprints/vw_pitch_eval_enriched.sql`.
  - Catálogo de SAACA: `saaca_cat_criteria`, que está versionado, y `saaca_cat_criteria_mapping`.
- **Escritura desde la app (únicas):**
  - `pitch_muestra_calibracion` y `saaca_eval_detail` (`mechanism='HUMANO'`), desde Calibración.
  - `pitch_diagnosticos_ia`, registro de uso del Diagnóstico IA para la cuota.
- **Semáforo de calidad ponderada:** ≥90 Bueno, ≥85 Regular, <85 Crítico. Es el mismo en el
  tablero y en el diagnóstico.

Detalle completo en [`CLAUDE.md`](CLAUDE.md).

---

## Documentación

| Documento | Para qué |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Reglas del proyecto: dónde está cada cosa, auth, datos, flujos, deuda técnica |
| [`docs/deploy-cloud-run.md`](docs/deploy-cloud-run.md) | Runbook de despliegue, incluida la configuración única del Diagnóstico IA |
| [`docs/project-guidelines.md`](docs/project-guidelines.md) | Forma de trabajo: investigar → planear → implementar con pruebas → commits pequeños |
| [`docs/sprints/`](docs/sprints/README.md) | Planes, diagnósticos y SQL/DDL de cada sprint (qué se aplicó y cuándo) |
| [`docs/PAUTA_ENTREGA_DEMO.md`](docs/PAUTA_ENTREGA_DEMO.md) | Histórico: entrega de Pauta, la versión anterior |

---

## Despliegue

La app corre en **Cloud Run** (`pitch-app`, `us-central1`, proyecto `flb-rtl-3p-sx-reg-dev`) detrás
de **IAP**. El paso a paso está en **[`docs/deploy-cloud-run.md`](docs/deploy-cloud-run.md)**.

> ⚠️ `pitch-app` va SIEMPRE con `--no-allow-unauthenticated`. Para cambiar configuración usar
> `--update-secrets` / `--update-env-vars`, nunca `--set-*`, que borra lo existente. Ver
> [`CLAUDE.md`](CLAUDE.md) antes de tocar el despliegue.

---

## Troubleshooting

**1. `DefaultCredentialsError` al iniciar el backend**
→ Verificar que `BQ_CREDENTIALS_PATH` apunta al JSON y que existe. Una ruta relativa se resuelve
desde `backend/`.

**2. BigQuery no conecta / `403 Access Denied`**
→ Verificar que la **VPN de Falabella** está activa.

**3. `GET /api/auth/me` devuelve 401 en local**
→ Falta identidad: revisar `DEV_AUTH_BYPASS=true` **y** `DEV_USER_EMAIL` en `backend/.env`, y
reiniciar el backend (la config se cachea al arranque).

**4. `GET /api/auth/me` devuelve 403 en local**
→ El `DEV_USER_EMAIL` no está en `pitch_users`.

**5. Puerto 8080 ocupado**
→ `uvicorn backend.main:app --reload --port 8081` y ajustar `ALLOWED_ORIGINS` si aplica.

**6. El frontend no compila (módulos faltantes, "Could not resolve …" dentro de `node_modules`)**
→ Instalación incompleta o dañada. Reinstalar desde cero **sin** `npm audit fix`:
```powershell
cd frontend
Remove-Item -Recurse -Force node_modules
npm ci
```
Si vuelve a faltar algún archivo, puede ser el antivirus o la sincronización de OneDrive sobre la
carpeta. Prueba mover el repo a una ruta corta fuera de Documents (por ejemplo `C:\dev\pitch-app`).

**7. Diagnóstico IA responde 503**
→ Falta `KAIROS_JWT` en el `.env` (o en Cloud Run), o el JWT fue rechazado. Probar con
`backend\.venv\Scripts\python.exe -m backend.scripts.probar_genai`.

**8. `UserWarning ... without a quota project` en la consola**
→ Aviso inofensivo de las credenciales locales de gcloud. Se silencia con
`gcloud auth application-default set-quota-project bi-fcom-drmb-sell-in-sbx`.
