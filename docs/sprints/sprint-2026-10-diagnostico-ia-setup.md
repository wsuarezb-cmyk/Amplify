# Diagnóstico IA — configuración y pruebas

Pasos que corre la usuaria en el PC corporativo (VPN activa). Nada de esto modifica lo que hoy
funciona en Pitch.

Los diagnósticos **no se almacenan**: se generan y se descargan en el momento. Por eso no hay
GCS ni historial de archivos. BigQuery solo guarda un registro por diagnóstico, que sirve para la
cuota mensual por usuario y para ver el costo.

## 1. Tabla en BigQuery

Correr [`sprint-2026-10-diagnostico-ia.sql`](sprint-2026-10-diagnostico-ia.sql):
- **Sección A:** limpieza, para quien ya creó las tablas con la versión anterior. Borra
  `pitch_diagnosticos_descargas` y las columnas `gcs_path` / `expires_at`.
- **Sección B:** definición final, como referencia.

## 2. Variables en `backend/.env` (solo en el corporativo)

```
KAIROS_JWT=<valor del secret kairos-jwt-saaca-evaluate-job-dev>
```

Para leer el JWT desde Secret Manager:
```bash
gcloud secrets versions access latest --secret=kairos-jwt-saaca-evaluate-job-dev --project=flb-rtl-3p-sx-reg-dev
```

- El endpoint y el modelo ya tienen por defecto los de SAACA.
- Opcional: `DIAGNOSTICO_CUOTA_MENSUAL=5`.
- Nunca commitear `.env`, que ya está en `.gitignore`.
- Si quedaron variables `DIAGNOSTICO_GCS_*` de la versión anterior, se pueden borrar: se ignoran.

## 3. Instalar dependencias y probar el gateway

```powershell
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
backend\.venv\Scripts\python.exe -m backend.scripts.probar_genai
```

Resultado esperado: `✓ Respuesta en N s: ok=True mensaje='Pitch conectado al gateway'`.

## 4. Revisar la calidad del diagnóstico

Genera un diagnóstico real en un archivo local, sin registrarlo en BigQuery y sin consumir cuota:

```powershell
backend\.venv\Scripts\python.exe -m backend.scripts.generar_diagnostico_prueba --desde 2026-09-01 --hasta 2026-09-27 --agente correo@falabella.com
backend\.venv\Scripts\python.exe -m backend.scripts.generar_diagnostico_prueba --desde 2026-09-01 --hasta 2026-09-27 --equipo "FRONT OFFICE" --salida equipo.html
backend\.venv\Scripts\python.exe -m backend.scripts.generar_diagnostico_prueba --desde 2026-09-01 --hasta 2026-09-27 --pais CO --salida general.html
```

- **Valores con espacios** (por ejemplo, equipos): van entre comillas, `"FRONT OFFICE"`.
- **Correos:** se comparan sin distinguir mayúsculas y minúsculas.
- **Solo datos:** con `--contexto` se imprime el JSON de datos sin IA, para compararlo con el tablero.

## Problemas comunes

| Síntoma | Causa probable |
|---|---|
| `Credencial rechazada (401/403)` | JWT vencido o mal copiado |
| `404 no Route matched` | Endpoint mal escrito |
| `400 cannot use own model` | `GENAI_MODEL` no corresponde al endpoint |
| `0 interacciones evaluadas` | El filtro no coincide con los datos: revisa el valor exacto en Reportería o el período |
| `UserWarning ... without a quota project` | Aviso inofensivo de las credenciales locales de gcloud. Se silencia con `gcloud auth application-default set-quota-project bi-fcom-drmb-sell-in-sbx` |
