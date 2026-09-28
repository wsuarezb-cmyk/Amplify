# Pitch — App de Calidad SAACA

## ¿Qué es Pitch?

**Pitch** es la interfaz web interna del equipo de calidad de Seller Experience para
analizar y calibrar las evaluaciones de **SAACA** (el pipeline automático de calidad de
Falabella). Es la evolución de la app anterior, "Pauta".

Tiene **dos módulos**:

- **Reportería** — dashboard sobre un extracto diario cargado en memoria, con
  *cross-filter* estilo Data Studio: cualquier filtro o click en un gráfico recalcula
  todo el tablero sin nuevas consultas. Incluye KPIs (calidad ponderada, % defectuosas,
  accuracy por categoría de error), evolutivo, cumplimiento por criterio, heatmap de
  tipificación, comparativas configurables y una vista de agente para feedback 1:1.
- **Calibración** — evaluación humana **ciega** de una muestra, criterio por criterio,
  que luego se compara contra SAACA para medir el acuerdo humano–automático. Cada
  evaluación humana queda en `saaca_eval_detail` con `mechanism = 'HUMANO'`.

La usan **líderes de Quality y analistas de operaciones**. Stack: **FastAPI + BigQuery**
(backend) y **React 18 + Vite 5** (frontend), desplegado en **Cloud Run detrás de IAP**.

---

## Autenticación (resumen)

**No hay login propio, ni Google Sign-In, ni JWT.** La identidad viene del header
`X-Goog-Authenticated-User-Email` que inyecta **IAP**, y el rol se resuelve contra la
tabla `pitch_users` (lista blanca por email exacto). Jerarquía de roles:
`VIEWER < AUDITOR < LIDER_QUALITY < ADMIN`.

En **desarrollo local** no hay IAP, así que se simula la identidad con
`DEV_AUTH_BYPASS=true` + `DEV_USER_EMAIL`. Estas variables **no existen en Cloud Run**.

> El modelo de confianza completo y la **regla de seguridad innegociable** (nunca
> `--allow-unauthenticated`) están en [`CLAUDE.md`](CLAUDE.md).

---

## Requisitos previos

| Requisito | Versión mínima | Dónde conseguirlo |
|-----------|---------------|-------------------|
| Python | 3.12 | https://www.python.org/downloads/ |
| Node.js | 20 LTS | https://nodejs.org/en/download |
| Git | reciente | https://git-scm.com/downloads |
| `gcp_user_credentials.json` | — | Credenciales de BigQuery — pedírselas a Ana Oviedo (aoviedo@falabella.com) |

> El JSON de credenciales da acceso al dataset `sandbox_data_analytics_psc` del proyecto
> `bi-fcom-drmb-sell-in-sbx`. **No se sube al repositorio** (está en `.gitignore`).
> El acceso a BigQuery requiere la **VPN de Falabella** activa.

---

## Estructura del proyecto

```
app_calidad/
├── README.md
├── CLAUDE.md                   # Modelo de auth, datos y reglas del proyecto
├── Dockerfile                  # Imagen multi-stage para Cloud Run
├── cloudbuild.yaml             # (opcional) build vía Cloud Build
├── docs/
│   └── deploy-cloud-run.md     # Runbook de despliegue
│
├── backend/                    # API REST — FastAPI + Python 3.12
│   ├── main.py                 # Entry point + montaje del build de React
│   ├── config.py               # Settings (Pydantic) desde .env / entorno
│   ├── dependencies.py         # BigQuery + guards de rol
│   ├── requirements.txt
│   ├── .env.example
│   ├── auth/                   # middleware.py — identidad por header de IAP
│   ├── connectors/             # Cliente de BigQuery
│   ├── models/                 # Schemas Pydantic
│   ├── routers/                # auth, pitch_dashboard, pitch_calibracion, criteria, interaction
│   ├── services/               # user_service, pitch_reporting_service, calibracion_service, …
│   └── scripts/
│
└── frontend/                   # SPA React 18 + Vite 5
    ├── package.json
    ├── vite.config.js          # dev server en :5173
    ├── design-system/          # tokens de marca (CSS + logo) usados en el build
    └── src/
        ├── App.jsx             # Router (React Router v6)
        ├── pages/              # Reporteria, Calibracion, CalibracionCaso, Unauthorized
        ├── components/
        │   ├── reporteria/     # KPIs, filtros, gráficos, vista de agente, drilldown
        │   ├── calibracion/    # generación de muestra, evaluación ciega, reveal
        │   └── layout/         # Layout, Sidebar, TopBar
        ├── contexts/           # AuthContext, PitchDataContext (extracto + cross-filter)
        ├── constants/          # roles, rutas, secciones de reportería
        ├── services/           # api.js — cliente HTTP
        └── utils/              # aggregations, scores, fechas
```

---

## Configuración inicial (primera vez)

### Backend

```powershell
# 1. Desde la raíz del proyecto, crear el entorno virtual
python -m venv backend/.venv

# 2. Activar (Windows)
backend\.venv\Scripts\activate

# 3. Instalar dependencias
pip install -r backend/requirements.txt

# 4. Crear el archivo de variables de entorno
copy backend\.env.example backend\.env
```

**5. Completar `backend/.env`:**

| Variable | Descripción | Obligatoria |
|----------|-------------|-------------|
| `BQ_PROJECT_ID` | Proyecto GCP de BigQuery (`bi-fcom-drmb-sell-in-sbx`) | ✅ |
| `BQ_DATASET` | Dataset (`sandbox_data_analytics_psc`) | ✅ |
| `BQ_CREDENTIALS_PATH` | Ruta al `gcp_user_credentials.json` | ✅ |
| `DEV_AUTH_BYPASS` | `true` para simular identidad en local (sin IAP) | ✅ en dev |
| `DEV_USER_EMAIL` | Email con el que entras en local (debe estar en `pitch_users`) | ✅ en dev |
| `ALLOWED_ORIGINS` | Orígenes CORS (`http://localhost:5173`) | ✅ |

> `config.py` también acepta los nombres legacy `BQ_PROJECT` y
> `GOOGLE_APPLICATION_CREDENTIALS` por compatibilidad.

### Frontend

```powershell
cd frontend
npm ci
```

> El frontend **no** necesita variables de entorno para el flujo actual: la identidad
> es transparente vía IAP y solo consulta `GET /api/auth/me` para conocer el rol.

---

## Levantar la app en desarrollo

Necesitas **dos terminales**.

### Terminal 1 — Backend

```powershell
backend\.venv\Scripts\activate
uvicorn backend.main:app --reload --port 8080
```

**Verificación:** http://localhost:8080/api/health → `{"status": "ok", ...}`

### Terminal 2 — Frontend

```powershell
cd frontend
npm run dev
```

**Verificación:** http://localhost:5173

Con `DEV_AUTH_BYPASS=true` la app entra directo como `DEV_USER_EMAIL` (sin pantalla de
login), con el rol que tenga ese email en `pitch_users`.

---

## Datos (resumen)

- `pitch_users` — tabla fuente de usuarios y roles (alta/gestión = data op directa).
- `pitch_eval_enriched` y la vista `vw_pitch_dashboard_extracto` alimentan Reportería.
- `pitch_muestra_calibracion` y `saaca_eval_detail` (`mechanism='HUMANO'`) son las
  **únicas** tablas con escritura desde la app.
- El `result_label` humano solo es `CUMPLE` / `NO_CUMPLE`.

Detalle completo en [`CLAUDE.md`](CLAUDE.md).

---

## Despliegue

La app corre en **Cloud Run** (`pitch-app`, `us-central1`, proyecto
`flb-rtl-3p-sx-reg-dev`) detrás de **IAP**. El paso a paso para publicar una versión
está en **[`docs/deploy-cloud-run.md`](docs/deploy-cloud-run.md)**.

> ⚠️ `pitch-app` va SIEMPRE con `--no-allow-unauthenticated`. Ver la regla de seguridad
> en [`CLAUDE.md`](CLAUDE.md) antes de tocar el despliegue.

---

## Troubleshooting

**1. `DefaultCredentialsError` al iniciar el backend**
→ Verificar que `BQ_CREDENTIALS_PATH` en `backend/.env` apunta al `gcp_user_credentials.json`
y que el archivo existe.

**2. BigQuery no conecta / `403 Access Denied`**
→ Verificar que la **VPN de Falabella** está activa. Sin VPN no hay acceso al proyecto GCP.

**3. `GET /api/auth/me` devuelve 401 en local**
→ Falta identidad: revisar que `DEV_AUTH_BYPASS=true` **y** `DEV_USER_EMAIL` estén en
`backend/.env`, y reiniciar el backend (la config se cachea al arranque).

**4. `GET /api/auth/me` devuelve 403 en local**
→ El `DEV_USER_EMAIL` no está en `pitch_users`. Usar un email dado de alta en la tabla.

**5. Puerto 8080 ocupado**
→ `uvicorn backend.main:app --reload --port 8081` y ajustar `ALLOWED_ORIGINS` si aplica.

**6. El frontend no compila (módulos faltantes)**
```powershell
cd frontend
Remove-Item -Recurse -Force node_modules
npm ci
```
