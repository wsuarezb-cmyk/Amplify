# Amplify — Planner y Trace

> **Nota para quien edite este README:** los textos marcados con `[VALIDAR]` fueron heredados
> de la estructura del proyecto anterior (Pitch) y deben confirmarse contra el código de este
> repositorio antes de publicarlo. Borra esta nota cuando no quede ningún `[VALIDAR]`.

## ¿Qué es Amplify?

**Amplify** es la aplicación web interna del equipo de Comunicaciones para planificar los envíos
de comunicaciones y hacerles seguimiento. Por ahora tiene **dos vistas**:

| Vista | Qué hace | Estado |
|---|---|---|
| **Planner** | Recibe los planes de comunicaciones y los muestra en un calendario, distribuidos según las reglas del equipo de Comunicaciones. También recibe solicitudes de envíos manuales. | En desarrollo |
| **Trace** | Seguimiento de los envíos mediante un dashboard de **Looker** embebido. | Looker embebido; dashboard propio planificado |

---

## Vistas

### Planner

Objetivo: tener en un solo calendario toda la planificación de envíos.

- **Planes de comunicaciones:** la vista recibe los planes y los ubica en el calendario. La
  distribución sigue las **reglas definidas por el equipo de Comunicaciones**
  `[VALIDAR: listar las reglas implementadas o enlazar a docs/reglas-planner.md]`.
- **Solicitudes de envío manual:** llegan desde un **formulario de Office** y se administran
  desde **Amplify**. Aparecen junto a los planes en el calendario
  `[VALIDAR: cómo llegan las respuestas del formulario a la app (tabla, API, flujo automatizado) y qué estados tiene una solicitud: pendiente, aprobada, rechazada…]`.

### Trace

- Hoy embebe un **dashboard de Looker** que ya existía `[VALIDAR: iframe o SDK, y dónde se configura la URL]`.
- **Evolución planificada:** construir un dashboard propio dentro de la app para mejorar el
  rendimiento y no depender del embebido.

---

## Stack

`[VALIDAR todo este bloque: se asumió el mismo stack que Pitch]`

- Backend: **FastAPI**, Python 3.12.
- Datos: **BigQuery**.
- Frontend: **React 18 + Vite 5**.
- Visualización: **Looker** (embebido, en la vista Trace).
- Despliegue: **Cloud Run detrás de IAP**.

---

## Autenticación (resumen)

`[VALIDAR: se asumió el mismo modelo que Pitch]`

- **Identidad:** viene del header `X-Goog-Authenticated-User-Email` que inyecta **IAP**. No hay
  login propio.
- **Rol:** se resuelve contra una tabla de usuarios `[VALIDAR: nombre de la tabla y roles]`.
- En **desarrollo local** no hay IAP, así que la identidad se simula con `DEV_AUTH_BYPASS=true`
  y `DEV_USER_EMAIL`. Estas variables **no existen en Cloud Run**.

> Nunca desplegar con `--allow-unauthenticated`.

---

## Requisitos previos

| Requisito | Versión | Dónde conseguirlo |
|-----------|---------|-------------------|
| Python | 3.12 | https://www.python.org/downloads/ |
| Node.js | 20 LTS o superior | https://nodejs.org/en/download |
| Git | reciente | https://git-scm.com/downloads |
| Credenciales de BigQuery | — | Solicitarlas al responsable técnico del proyecto `[VALIDAR: nombre o canal]` |

> Las credenciales **no se suben al repositorio** (deben estar en `.gitignore`). El acceso a
> BigQuery requiere la **VPN de Falabella** activa.

---

## Estructura del proyecto

`[VALIDAR: ajustar a la estructura real del repositorio]`

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
│   ├── routers/                # Endpoints de planner y trace
│   └── services/               # Lógica de negocio (reglas de distribución, solicitudes)
│
└── frontend/                   # SPA React + Vite
    ├── package.json
    └── src/
        ├── App.jsx             # Router
        ├── pages/              # Planner, Trace
        ├── components/
        │   ├── planner/        # Calendario, planes, solicitudes manuales
        │   ├── trace/          # Looker embebido (luego, dashboard propio)
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

Completar `backend/.env` `[VALIDAR: confirmar la lista contra .env.example]`:

| Variable | Descripción | Obligatoria |
|----------|-------------|-------------|
| `BQ_PROJECT_ID` | Proyecto GCP de BigQuery | Sí |
| `BQ_DATASET` | Dataset | Sí |
| `BQ_CREDENTIALS_PATH` | Ruta al JSON de credenciales | Sí |
| `DEV_AUTH_BYPASS` | `true` para simular identidad en local | Solo en dev |
| `DEV_USER_EMAIL` | Email con el que se entra en local | Solo en dev |
| `ALLOWED_ORIGINS` | Orígenes CORS (`http://localhost:5173`) | Sí |
| `[VARIABLE_LOOKER]` | URL del dashboard de Looker embebido en Trace | `[VALIDAR]` |

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

`[VALIDAR: confirmar que existen pruebas y los comandos]`

```powershell
backend\.venv\Scripts\python.exe -m pytest backend\tests

cd frontend
npm test
npm run build
```

---

## Hoja de ruta

- [ ] **Planner:** completar la distribución del calendario con todas las reglas del equipo de
  Comunicaciones.
- [ ] **Planner:** flujo completo de solicitudes de envío manual (formulario de Office → Amplify
  → calendario).
- [ ] **Trace:** reemplazar el Looker embebido por un dashboard propio dentro de la app, con
  mejor rendimiento.

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

### Cómo actualizar el servicio existente en Cloud Run

**Paso 1 — Subir los cambios al repositorio**

Hacer `push` a https://github.com/wsuarezb-cmyk/Amplify

**Paso 2 — Esperar el build**

Verificar en [Cloud Build](https://console.cloud.google.com/cloud-build/builds?cloudshell=true&project=flb-rtl-3p-sx-reg-dev)
el estado del trigger `amplify-deploy`. **No continuar hasta que el build termine con éxito.**
Si falla, revisar los logs del build y corregir antes de seguir.

**Paso 3 — Actualizar el servicio desde Cloud Shell**

Cuando el build termine, ejecutar en Cloud Shell:

```bash
gcloud run deploy amplify-app \
  --image=us-east4-docker.pkg.dev/flb-rtl-3p-sx-reg-dev/sx-reg/amplify-app:latest \
  --region=us-east4
```

Este comando crea una nueva revisión del servicio con la imagen recién construida y conserva la
configuración existente (variables de entorno, secretos y acceso).

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

**7. El dashboard de Trace no carga**
→ Verificar la URL de Looker configurada y que tu usuario tenga permiso de acceso al dashboard
`[VALIDAR]`.