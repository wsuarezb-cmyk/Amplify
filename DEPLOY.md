# Deploy Rápido Pitch (FTC)

## Requisitos previos

```bash
ssh -T git@github.com
```

Resultado esperado:

```text
Hi aoviedo-Falabella_FTC!
```

Proyecto:

```bash
gcloud config set project flb-rtl-3p-sx-reg-dev
```

Docker:

```bash
gcloud auth configure-docker us-central1-docker.pkg.dev
```

---

# Estado actual

✅ IAP configurado

✅ BigQuery configurado

✅ BQ_CREDENTIALS_AOVIEDO configurado

✅ KAIROS_JWT configurado

✅ KAIROS_CHAT_ENDPOINT configurado

✅ GENAI_MODEL configurado

✅ DIAGNOSTICO_CUOTA_MENSUAL configurado

No volver a ejecutar configuraciones IA salvo que cambien los requerimientos.

---

# Deploy

## 1. Clonar repositorio FTC

```bash
cd ~

rm -rf APP01597-corp-selleranalytics-overture-pitch

git clone git@github.com:falabella-retail/APP01597-corp-selleranalytics-overture-pitch.git

cd APP01597-corp-selleranalytics-overture-pitch
```

---

## 2. Definir imagen

```bash
export IMG=us-central1-docker.pkg.dev/flb-rtl-3p-sx-reg-dev/pitch-repo/pitch-app:latest
```

---

## 3. Build

```bash
docker build -t "$IMG" .
```

---

## 4. Push

```bash
docker push "$IMG"
```

---

## 5. Deploy

IMPORTANTE:

No modificar variables.

No modificar secrets.

No modificar IAP.

No modificar volumen BigQuery.

```bash
gcloud run deploy pitch-app \
--image="$IMG" \
--region=us-central1 \
--project=flb-rtl-3p-sx-reg-dev
```

---

## 6. Validar

```bash
gcloud run services describe pitch-app \
--region us-central1 \
--format='value(status.latestReadyRevisionName,status.url)'
```

---

## Validación funcional

Verificar:

- Login vía IAP
- Consultas BigQuery
- Diagnóstico IA
- Generación correcta de respuestas

---

## Deploy habitual

```bash
export IMG=us-central1-docker.pkg.dev/flb-rtl-3p-sx-reg-dev/pitch-repo/pitch-app:latest

docker build -t "$IMG" .

docker push "$IMG"

gcloud run deploy pitch-app \
--image="$IMG" \
--region=us-central1 \
--project=flb-rtl-3p-sx-reg-dev
```