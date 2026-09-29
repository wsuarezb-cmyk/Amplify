# Deploy de Pitch a Cloud Run — runbook

Guía paso a paso para publicar una nueva versión de **Pitch** en Cloud Run.
Pensada para correrse desde **Cloud Shell** (tiene `gcloud` y `docker` listos).

| Dato | Valor |
|---|---|
| Servicio Cloud Run | `pitch-app` |
| Región | `us-central1` |
| Proyecto | `flb-rtl-3p-sx-reg-dev` |
| Artifact Registry (repo) | `pitch-repo` |
| Imagen | `us-central1-docker.pkg.dev/flb-rtl-3p-sx-reg-dev/pitch-repo/pitch-app:latest` |
| Repo GitHub | `https://github.com/aoviedo-afk/pitch-app.git` |

> ## ⚠️ Regla de seguridad innegociable
> `pitch-app` va **SIEMPRE** con `--no-allow-unauthenticated` y **nunca** con un
> binding `allUsers`. La identidad viene del header `X-Goog-Authenticated-User-Email`
> que inyecta IAP, y solo es confiable porque el invoker del Cloud Run está bloqueado
> al service agent de IAP. Si el contenedor fuera alcanzable directo, cualquiera
> podría forjar el header y suplantar a cualquier usuario (incluido ADMIN).
> **No agregues `--allow-unauthenticated` en ningún deploy.**

---

## 0. Subir el código a GitHub (desde tu local)

Cloud Shell toma el código desde GitHub, así que primero pusheá los commits:

```bash
git push origin main
```

`.env` y las credenciales están en `.gitignore` — no se suben.

## 1. Traer el código y fijar el proyecto (en Cloud Shell)

Usá siempre la ruta absoluta `~/pitch-app` (evita el error clásico de correr
`cd pitch-app` estando ya dentro del repo, que hace fallar el `cd` y —con `&&`—
saltarse el `git pull`, dejándote con código viejo):

```bash
# Clona si no existe; si ya existe, entra y actualiza
[ -d ~/pitch-app ] || git clone https://github.com/aoviedo-afk/pitch-app.git ~/pitch-app
cd ~/pitch-app
git pull origin main

# ⚠️ Confirmá que estás en el commit que querés desplegar ANTES de construir:
git log --oneline -1

gcloud config set project flb-rtl-3p-sx-reg-dev
gcloud auth configure-docker us-central1-docker.pkg.dev
```

> Si `git log --oneline -1` no muestra el commit esperado, el build empaquetará
> código viejo y el deploy no reflejará tus cambios (aunque GitHub esté al día).

## 2. Construir y subir la imagen

Se construye la imagen localmente y se sube a Artifact Registry. Este método
**evita `gcloud builds submit`**, que falla en este proyecto por permisos del
bucket de Cloud Build (`serviceusage.services.use` / acceso al bucket
`..._cloudbuild`).

```bash
IMG=us-central1-docker.pkg.dev/flb-rtl-3p-sx-reg-dev/pitch-repo/pitch-app:latest

docker build -t "$IMG" .
docker push "$IMG"
```

El `Dockerfile` es multi-stage: compila el frontend (`npm ci` + `npm run build`)
y arma el runtime Python (FastAPI + uvicorn) sirviendo el `dist/`. Tarda ~2-3 min.

## 3. Desplegar la nueva revisión

```bash
gcloud run deploy pitch-app \
  --image=us-central1-docker.pkg.dev/flb-rtl-3p-sx-reg-dev/pitch-repo/pitch-app:latest \
  --region=us-central1 \
  --project=flb-rtl-3p-sx-reg-dev
```

**Se pasa SOLO `--image` a propósito.** Cloud Run conserva toda la configuración
existente de la revisión anterior:

- Secret `BQ_CREDENTIALS_AOVIEDO` montado como volumen en
  `/app/credentials/bq/gcp_user_credentials.json`.
- Env `GOOGLE_APPLICATION_CREDENTIALS` apuntando a ese archivo.
- Ingress de IAP + `--no-allow-unauthenticated`.
- `min-instances=0`, sin `--service-account` (usa las credenciales personales del secret).

Al no re-especificar flags, no hay riesgo de tumbar el volumen del secret ni la auth.

## 4. Verificar

```bash
gcloud run services describe pitch-app --region=us-central1 \
  --format='value(status.latestReadyRevisionName, status.url)'
```

Luego abrí la app (vía IAP) y validá login + los cambios de la versión.

- El cambio de revisión es **inmediato** (Cloud Run enruta el 100% del tráfico al
  terminar el deploy). Con `min-instances=0`, el primer request puede tener un
  *cold start* de unos segundos.
- El frontend usa assets con hash (`index-XXXX.js`) y sirve `index.html` fresco;
  si ves algo cacheado, hacé un **hard refresh** (Ctrl/Cmd+Shift+R).

---

## Rollback

Cada deploy crea una revisión nueva (`pitch-app-000NN-xxx`). Para volver a una
revisión anterior sin reconstruir:

```bash
# Listar revisiones
gcloud run revisions list --service=pitch-app --region=us-central1

# Enrutar el 100% del tráfico a una revisión previa
gcloud run services update-traffic pitch-app --region=us-central1 \
  --to-revisions=pitch-app-000NN-xxx=100
```

---

## Notas y deuda técnica

- **Credenciales BigQuery**: Pitch corre con las credenciales personales de
  `aoviedo@falabella.com` (secret `BQ_CREDENTIALS_AOVIEDO`) en vez de una cuenta de
  servicio dedicada, mientras se resuelve el acceso cross-project vía gobernanza de
  datos de Falabella. La primera vez que se creó el servicio, el secret y su volumen
  se configuraron con `--set-secrets` / `--update-secrets`; los redeploys por imagen
  **no** tocan esa config.
- **Dev bypass**: `DEV_AUTH_BYPASS` / `DEV_USER_EMAIL` son SOLO para desarrollo local
  (simulan el header de IAP). **No existen en Cloud Run** — ahí la identidad siempre
  viene de IAP. Ver [`CLAUDE.md`](../CLAUDE.md) para el modelo de auth completo.
- **`cloudbuild.yaml`** existe en la raíz por si en el futuro se habilitan los permisos
  de Cloud Build; hoy el camino soportado es el build local de los pasos 2-3.
