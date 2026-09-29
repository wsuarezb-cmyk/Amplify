# Pauta — Documento de Entrega DEMO
**Versión:** 1.0.0 DEMO  
**Fecha:** Mayo 2026  
**Equipo:** Seller Journey & Analytics — Falabella ecommerce  
**Repositorio:** https://github.com/aoviedo-afk/pauta-app  
**Contacto:** Ana María Oviedo Ome — aoviedo@falabella.com

---

## ¿Qué es Pauta?

Pauta es la aplicación web de calidad del equipo Seller Experience PSC. Su nombre viene del concepto musical: la pauta es la hoja donde se escribe la música — el marco que le da estructura a todo. En el contexto del equipo, Pauta es el marco que da estructura al proceso de calidad.

Pauta es la **interfaz humana de SAACA** — el Sistema Automatizado de Análisis de Calidad y Atención que ya está en producción evaluando interacciones de soporte a sellers con inteligencia artificial. SAACA evalúa automáticamente, Pauta hace esos resultados visibles, navegables y auditables por las personas del equipo.

Pauta pertenece al ecosistema de apps del equipo junto a Seller Overture, Echo y Clave. Está diseñada para integrarse a Seller Overture cuando ese proyecto avance.

---

## El problema que resuelve

Antes de Pauta, el equipo de Mejora Continua auditaba manualmente el 1-2% de las interacciones de soporte. Con SAACA evaluando automáticamente el 100%, el equipo necesitaba:

1. **Ver los resultados** de SAACA de forma clara, filtrable y navegable — sin entrar a BigQuery
2. **Auditar casos específicos** — el humano puede revisar casos seleccionados, ver el hilo completo de la conversación, y emitir su propio veredicto criterio por criterio
3. **Que la evaluación humana prevalezca** — cuando un auditor evalúa una interacción, ese resultado reemplaza al de SAACA en el reporting

---

## Relación con SAACA

```
Salesforce
    │
    ▼  (stored procedures en BigQuery)
psc_casos_enriched / psc_tareas_enriched
    │
    ▼  saaca_sp_prepare()
saaca_input_* (7 tablas de entrada)
    │
    ▼  Pipeline Python con Gemini 2.5 Flash (Cloud Run Job, corre diariamente)
saaca_eval_detail ◄── FUENTE PRINCIPAL DE PAUTA
    │
    ▼  pauta_v_eval_enriched (vista BigQuery con tipificación enriquecida)
PAUTA — Dashboard + Auditoría
```

**Regla de oro:** Pauta NUNCA modifica el pipeline de SAACA. Solo lee sus resultados y escribe evaluaciones humanas en `saaca_eval_detail` con `mechanism = 'HUMANO'`.

---

## ¿Qué hace la app? — Módulos

### Módulo 1: Dashboard de Calidad

Vista de reporting con métricas generadas por SAACA, navegables de lo general a lo específico.

**Filtros disponibles:**
- Período de fechas
- País (CL, CO, PE)
- Equipo / Departamento
- Tipificación (3 niveles en cascada)
- Criterio evaluado
- Agente (búsqueda con multiselect)

**Métricas disponibles:**
- **Score ponderado general** — promedio del score por interacción (fórmula: score por interacción = suma de result_score × weight / suma de weights × 100)
- **Accuracy por categoría de error:**
  - Error Crítico del Usuario (ECU) — % de interacciones sin error de este tipo
  - Error Crítico de Negocio (ECN)
  - Error Crítico de Compliance (ECC)
  - No Crítico (NON_CRITICAL)
- **Detalle por criterio** — gráfico de barras horizontales, ordenado de mayor a menor incumplimiento
- **Resultados por agente** — tabla con score e interacciones, ordenada por volumen
- **Interacciones evaluadas** — tabla drill-down con expansión inline para ver los criterios evaluados de cada interacción

**Principio de precedencia:** si una interacción tiene tanto evaluación SAACA como evaluación humana, el reporting siempre muestra la evaluación humana.

---

### Módulo 2: Auditoría Humana

Flujo completo para que el equipo de Mejora Continua audite casos seleccionados.

#### Creación de muestras

El ADMIN crea un "batch" de casos para auditar. Puede seleccionar dos tipos de universo:

- **Casos evaluados por SAACA:** casos que ya pasaron por el pipeline automático. Se filtran por fecha de evaluación, país, equipo y tipificación. Se puede especificar N casos o % del universo disponible.
- **Casos NO evaluados por SAACA:** casos que existen en el sistema pero no pasaron por el pipeline. Se filtran por fecha de cierre del caso.

Al crear el batch, el sistema selecciona los casos aleatoriamente y genera una fila en `saaca_audit_sample` por cada interacción evaluable del caso.

#### ¿Qué interacciones son evaluables?

Solo las que tienen criterios activos en el catálogo:

| Tipo | Criterios | Evaluable |
|------|-----------|-----------|
| EMAIL | C0001–C0006, C0013 | ✅ Sí |
| TASK_INFO_REQUEST | C0001, C0004–C0006 | ✅ Sí |
| TASK_REOPEN | C0007, C0009 | ✅ Sí |
| TASK_RECONTACT | C0008 | ✅ Sí |
| CASE | C0010–C0012 | ✅ Sí |
| SELLER_REPLY | — | ❌ Solo contexto |
| TASK_INTERNAL | — | ❌ Solo contexto |

#### Bandeja del auditor

Cada ADMIN ve sus casos asignados agrupados por caso, con:
- Progreso de evaluación (X/N interacciones completadas)
- Indicador de si el caso fue evaluado por SAACA o no
- Score SAACA de referencia si existe
- Estado: PENDIENTE / EN PROGRESO / COMPLETADO

#### Vista del caso — Hilo cronológico

Al abrir un caso, el auditor ve el **hilo completo de la conversación** en orden cronológico — sin restricción temporal (a diferencia de SAACA que filtra el hilo para no darle contexto futuro a la IA).

Cada bloque del hilo es expandible:
- **Bloques evaluables** (EMAIL, TASK_REOPEN, etc.): al expandir, muestran el texto de la interacción + el formulario de evaluación
- **Bloques de contexto** (SELLER_REPLY, TASK_INTERNAL): al expandir, muestran solo el texto — sin formulario, para que el auditor entienda la conversación completa

#### Formulario de evaluación

Por cada interacción evaluable, el auditor ve:
- Nombre y descripción de cada criterio activo para ese tipo de interacción
- El resultado de SAACA como referencia (CUMPLE / NO_CUMPLE / N/A) si el caso fue evaluado automáticamente
- Radio buttons para emitir su veredicto: CUMPLE / NO_CUMPLE / N/A
- Campo de observación opcional

Al guardar:
1. Se insertan filas en `saaca_eval_detail` con `mechanism = 'HUMANO'`
2. Se actualiza el status de la interacción en `saaca_audit_sample` a `COMPLETED`
3. La barra de progreso del caso se actualiza
4. Si se recarga la página, el formulario muestra la evaluación guardada en modo lectura

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Python 3.12 + FastAPI |
| Frontend | React 18 + Vite 5 |
| Base de datos | BigQuery (bi-fcom-drmb-sell-in-sbx.sandbox_data_analytics_psc) |
| Autenticación | DEV_AUTH_BYPASS (demo) → Google OAuth / Azure SSO (producción) |
| Despliegue | Local (demo) → Cloud Run Service (pendiente) |
| Design System | Seller Center Falabella (Montserrat + Inter, tokens de color del wordmark) |
| Iconografía | Microsoft Fluent Icons |

---

## Tablas BigQuery que usa Pauta

### Solo lectura (de SAACA):
- `saaca_eval_detail` — resultados de evaluación automática
- `saaca_eval_run` — metadatos de llamadas a Gemini
- `saaca_input_*` — 7 tablas de interacciones (emails, tareas, casos)
- `saaca_cat_criteria` — catálogo de criterios activos
- `saaca_cat_criteria_mapping` — mapeo criterio × tipo de interacción
- `psc_casos_enriched` — enriquecimiento de casos con tipificación

### Lectura y escritura (propias de Pauta):
- `pauta_v_eval_enriched` — vista que enriquece saaca_eval_detail con tipificación del caso
- `saaca_eval_detail` — Pauta escribe evaluaciones humanas (mechanism='HUMANO')
- `saaca_audit_sample` — interacciones seleccionadas para auditoría
- `saaca_audit_assignment` — batches de auditoría con su auditor asignado
- `pauta_users` — usuarios habilitados con su rol (VIEWER o ADMIN)

---

## Modelo de roles

| Rol | Quién | Qué puede hacer |
|-----|-------|----------------|
| **VIEWER** | Agentes, líderes | Solo ver el dashboard de reporting |
| **ADMIN** | Equipo de Mejora Continua, Analytics | Dashboard + crear muestras + auditar casos |

---

## Estado actual — DEMO

Esta versión es un **demo funcional** con las siguientes características y limitaciones:

### ✅ Qué funciona
- Dashboard completo con filtros y todas las métricas
- Creación de muestras (casos evaluados por SAACA + casos no evaluados)
- Bandeja de auditoría con progreso por caso
- Hilo cronológico completo del caso
- Evaluación humana criterio por criterio con referencia SAACA
- Persistencia correcta en BigQuery sin streaming buffer bug
- Precedencia humano sobre IA en el reporting

### ⚠️ Limitaciones del demo
- **Autenticación:** usa `DEV_AUTH_BYPASS=true` — cualquier email @falabella.com entra como ADMIN. **No apto para producción.**
- **Sin despliegue cloud:** corre solo en desarrollo local. Requiere VPN + credenciales GCP.
- **Un auditor por batch:** el sistema soporta un auditor por batch. Asignación múltiple es trabajo futuro.
- **Sin notificaciones:** no hay emails automáticos cuando se asigna un batch.
- **Vite v5:** tiene una vulnerabilidad de seguridad moderada en el servidor de desarrollo (esbuild). No afecta producción.

---

## Roadmap — próximas etapas

### Etapa 6 — Despliegue en Cloud Run (pendiente)
- Configurar Google OAuth Client ID en GCP
- Desactivar `DEV_AUTH_BYPASS`
- Configurar secrets en Secret Manager
- Build de imagen Docker y push a Artifact Registry
- Crear Cloud Run Service
- Smoke test post-despliegue

### Futuro
- **Autenticación Azure SSO** — integración corporativa via Seguridad de la Información
- **Integración a Seller Overture** — embeber Pauta en el portal principal del equipo
- **Coaching automatizado** — generar planes de mejora basados en patrones de error por agente
- **Tendencia temporal** — gráfico de evolución del score en el tiempo
- **Notificaciones** — alertar al auditor cuando se le asigna un batch

---

## Cómo levantar la app localmente

Ver el archivo `README.md` en el repositorio para instrucciones paso a paso.

**Requisitos mínimos:**
- Python 3.12
- Node.js 20+
- VPN Falabella activa
- Archivo `gcp_user_credentials.json` (pedírselo a Ana Oviedo)

**Resumen de comandos:**
```powershell
# Terminal 1 — Backend
backend\.venv\Scripts\activate
uvicorn backend.main:app --reload --port 8080

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Luego abrir http://localhost:5174

---

## Preguntas frecuentes

**¿Pauta modifica los datos de SAACA?**
No. Pauta solo lee el pipeline de SAACA. La única escritura que hace es insertar evaluaciones humanas en `saaca_eval_detail` con `mechanism='HUMANO'` — esto no afecta las evaluaciones automáticas existentes, coexisten en la misma tabla.

**¿Qué pasa si SAACA no evaluó un caso?**
El auditor puede igual crear una muestra de casos no evaluados y auditarlos manualmente desde Pauta. El hilo de la conversación se construye desde las tablas `saaca_input_*` que el SP de preparación ya llenó.

**¿Cómo sé si una evaluación es de SAACA o humana?**
En BigQuery: el campo `mechanism` en `saaca_eval_detail` dice `AUTO_IA`, `AUTO_IA_RAG` (SAACA) o `HUMANO` (Pauta). En la UI: los bloques evaluados por humano muestran badge COMPLETADO en verde.

**¿El score del dashboard incluye evaluaciones humanas?**
Sí. La vista `pauta_v_eval_enriched` y todas las queries de reporting aplican la regla de precedencia: si existe evaluación humana para una interacción y criterio, esa prevalece sobre la de SAACA.

**¿Quién puede crear muestras?**
Solo usuarios con rol ADMIN en la tabla `pauta_users`. Para agregar un usuario, Ana Oviedo ejecuta el script `backend/scripts/create_pauta_users.py` o inserta directamente en BigQuery.

**¿Cuándo estará en producción?**
El despliegue en Cloud Run está pendiente de coordinar la autenticación con el equipo de Seguridad de la Información de Falabella (Azure SSO corporativo). El Dockerfile ya está listo.

---

## Arquitectura de decisiones clave

| Decisión | Por qué |
|----------|---------|
| FastAPI + React (no Streamlit) | La app tiene usuarios recurrentes y necesita UX de producción, no un prototipo analítico |
| BigQuery como única base de datos | Sin infraestructura adicional, consistente con todo el ecosistema de datos del equipo |
| Inserción DML (no streaming) en tablas de auditoría | Evita el streaming buffer bug de BigQuery que impedía UPDATEs inmediatos |
| Hilo completo para el auditor humano (sin filtro de fecha) | El humano necesita contexto completo; la IA tenía filtro para no evaluar con contexto futuro |
| Evaluación humana prevalece sobre IA | El juicio humano es la fuente de verdad final del proceso de calidad |
| Rol AUDITOR eliminado | Simplificación: los auditores son ADMIN y crean sus propias muestras |
| `DEV_AUTH_BYPASS` en lugar de OAuth para el demo | Evita depender de Google Cloud Console para la demo; se reemplaza en producción |

---

*Documento generado para entrega DEMO — Mayo 2026*  
*Equipo Seller Journey & Analytics — Falabella ecommerce*
