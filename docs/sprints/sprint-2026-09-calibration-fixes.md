# Sprint: Corrección y Mejora del Módulo de Calibración

## Objetivo

Analizar los siguientes issues e identificar el orden óptimo de abordaje.

NO implementar todavía.

Debes:

- investigar
- comprender dependencias
- detectar relaciones entre issues
- proponer secuencia de ejecución

No debes modificar código.

---

## Issue 1

Al refrescar determinadas páginas la aplicación muestra:

{
  "detail": "Not Found"
}

El usuario debe regresar al home o reabrir la aplicación.

Objetivo:

- identificar flujo de routing
- identificar causa raíz
- determinar si es frontend, backend o infraestructura
- documentar evidencia

---

## Issue 2

Algunos usuarios no reciben batches asignados en su bandeja personal de calibración.

Observaciones:

- Administradores sí pueden visualizar batches.
- Líder Quality sí puede visualizar batches.
- Usuarios asignados no siempre los reciben aún con el rol correcto de auditores.
- Existe sospecha de relación con roles o permisos.

Objetivo:

Validar o refutar esa hipótesis mediante evidencia.

---

## Issue 3

Algunas calibraciones muestran:

"No tienes criterios pendientes para esta asignación"

impidiendo guardar la auditoría.

Objetivo:

Investigar flujo de validación y persistencia.

---

## Issue 4

Lentitud general del módulo de calibración.

Contexto conocido:

- Existen consultas a BigQuery.
- El proyecto sell-in presenta saturación en ciertas ventanas horarias.
- No es obligatorio resolver la causa raíz.

Objetivo:

Generar alternativas de experiencia de usuario.

Ejemplos:

- loading states
- mensajes informativos
- precarga
- caché
- estrategias ya presentes en reportería

Investigar qué mecanismos ya existen en el proyecto antes de sugerir nuevas alternativas.

---

## Issue 5

Usuarios con acceso válido reciben ocasionalmente mensaje indicando que no tienen acceso.

La validación inicial depende de BigQuery.

Si BigQuery excede timeout, el sistema interpreta incorrectamente que el usuario no tiene acceso.

Objetivo:

Investigar flujos actuales.

Determinar:

- cómo se valida acceso
- cómo se manejan errores
- diferencias entre:
  - acceso denegado
  - error técnico
  - timeout
  - servicio no disponible

Sin implementar.

---

## Improvement 1

Diseñar propuesta para mini dashboard de seguimiento de calibraciones.

Usuarios objetivo:

- Líder Quality
- Auditores

Objetivo:

- reutilizar componentes existentes si es posible
- reutilizar patrones visuales existentes
- respetar diseño actual del proyecto

Investigar primero qué visualizaciones ya existen.

---

# Entregable esperado

Genera:

1. Dependencias entre issues.
2. Orden recomendado de ejecución.
3. Complejidad relativa.
4. Riesgo relativo.
5. Plan de implementación por fases.
6. Casos de prueba necesarios.
7. Información que debes solicitar al Product Owner.