
# Guía de ejecución por fases para GitHub Copilot

> **Regla principal:** el contenido técnico y funcional que aparece después de esta guía es la especificación completa y no debe alterarse, resumirse ni reinterpretarse. Esta sección únicamente indica el orden recomendado para que el asistente de programación procese e implemente esa misma especificación por fases.

## Fase 0: lectura, alcance y descubrimiento

Leer primero las secciones **1 a 5** de la especificación. Antes de escribir código, confirmar estructura real del repositorio, componente actual de Trace, embed de Looker Studio, backend, rutas, cliente BigQuery, autenticación IAP, pruebas y convenciones existentes.

**Gate:** no iniciar cambios funcionales hasta entender la arquitectura real y confirmar que el cambio queda limitado a Trace.

## Fase 1: fundaciones de datos y contratos

Procesar las secciones **4, 9, 10, 11 y 16**. Implementar o preparar las capas de acceso a BigQuery, modelos tipados, contratos API, mapeo de estados y reglas de acceso a datos. Incluir las tablas de auditoría e histórico diario descritas en la especificación cuando corresponda.

**Gate:** acceso parametrizado, modelos definidos, pruebas base y ninguna modificación fuera de Trace.

## Fase 2: generación de audiencias, búsqueda y validación

Implementar las secciones **7.1, 7.2 y 7.3**. Construir la entrada por Seller ID y las búsquedas alternativas, validar contra la base maestra y exponer los filtros confirmados con sus catálogos y tratamiento de nulos.

**Gate:** conteos de entrada, encontrados/no encontrados, contactos y filtros deben ser reproducibles y conciliables.

## Fase 3: funnel, alertas y confirmación

Implementar las secciones **7.4, 7.5 y 7.6**. Incorporar confirmación de reglas, funnel de trazabilidad, exclusiones, variaciones porcentuales y alertas del 20% definidas en la especificación.

**Gate:** ninguna reducción de volumen puede ocurrir silenciosamente y los conteos deben conciliar.

## Fase 4: descarga y auditoría de la audiencia

Implementar la sección **7.7** y la auditoría descrita en **10.4**. Exigir template, generar el CSV exactamente con el contrato definido y persistir el historial asociado al usuario autenticado.

**Gate:** la descarga solo se habilita después de validaciones, confirmaciones y conciliación; debe quedar registrada en historial.

## Fase 5: monitoreo diario de la base maestra

Implementar la sección **10.5**. Crear el snapshot diario y la comparación contra el día anterior según la especificación, incluyendo la alerta de disminución igual o superior al 20%.

**Gate:** operación idempotente, primera ejecución sin falsa alerta y diferencias de sellers/contactos claramente separadas.

## Fase 6: seguimiento de envíos

Implementar la sección **8** junto con el modelo de estados de la sección **9**. Permitir consulta por template, resumen, detalle individual, aperturas, clics, `Not Sent` y causas. Incorporar la conciliación con la audiencia registrada.

**Gate:** Trace debe responder qué ocurrió con una audiencia y qué ocurrió con un seller específico sin inferir estados que los datos no soportan.

## Fase 7: historial operativo de Trace

Completar la consulta de la tabla de auditoría definida en **10.4** dentro de la interfaz de Trace. Permitir búsqueda del historial y visualización de sus conteos, filtros, exclusiones, advertencias y template.

**Gate:** el usuario puede reconstruir qué audiencia se generó, por quién y con qué resultado agregado.

## Fase 8: interfaz final y convivencia con Looker Studio

Aplicar las secciones **6, 12 y 13**. Integrar los módulos dentro de Trace respetando el sistema visual actual y mantener Looker Studio como vista secundaria.

**Gate:** la experiencia nativa es principal, Looker Studio continúa disponible y ninguna otra parte de Amplify cambia.

## Fase 9: pruebas, observabilidad y cierre

Ejecutar las secciones **14, 15, 16, 17 y 18**. Completar pruebas backend/frontend, observabilidad, controles de seguridad y rendimiento, evidencia de aceptación y documentación de Trace. Revisar las definiciones técnicas pendientes de la sección **19** y respetar la instrucción final de la sección **20**.

**Gate final:** todos los criterios de Definition of Done deben cumplirse. Looker Studio no se elimina hasta recibir validación explícita de negocio.

## Regla de trabajo para cada fase

En cada fase GitHub Copilot debe seguir este ciclo:

1. Leer completas las secciones indicadas antes de editar.
2. Identificar archivos existentes que participan en esa fase.
3. Implementar únicamente el alcance de la fase.
4. Ejecutar pruebas relacionadas y las pruebas de regresión disponibles.
5. Verificar que no hubo cambios funcionales fuera de Trace.
6. Documentar decisiones, archivos modificados, pruebas ejecutadas y bloqueos.
7. Solo después continuar con la fase siguiente.

---

# Especificación completa sin cambios

# Instrucciones de implementación: evolución de la pestaña Trace de Amplify

## 1. Objetivo de este documento

Este documento debe usarse como contexto principal para GitHub Copilot al modificar **únicamente la pestaña Trace** de Amplify.

El objetivo es reemplazar el panel embebido de Looker Studio por una experiencia nativa dentro de Amplify que permita:

1. Generar y validar audiencias a partir de una lista de Seller IDs.
2. Aplicar filtros de negocio de forma explícita y trazable.
3. Mostrar el impacto de cada filtro antes de descargar la audiencia.
4. Descargar la audiencia final de contactos.
5. Consultar posteriormente el resultado de un envío por campaña o template.
6. Responder de forma clara:
   - ¿Qué ocurrió con esta audiencia?
   - ¿Qué ocurrió con este seller específico?

## 1.1 Decisiones funcionales confirmadas

Las siguientes definiciones fueron confirmadas por negocio y deben considerarse requisitos, no supuestos:

- `src_id` es el Seller ID utilizado para la búsqueda en la base maestra.
- La primera versión incluye filtros de contacto, ventas, tipo de seller, catálogo, estado del seller, HELD, desuscripción, delist, geografía/país y exclusión operacional.
- Los valores nulos se conservan como nulos y deben hacerse visibles; no se convierten automáticamente en elegibles ni excluidos.
- Se genera una alerta cuando más del 20% de los Seller IDs buscados no aparece en la base maestra.
- También debe existir una alerta por disminución de la base completa entre un día y el día anterior.
- No existe un límite funcional máximo de Seller IDs por búsqueda. La implementación debe soportar volumen alto de forma segura, sin imponer un límite arbitrario visible al usuario.
- Cuando un seller tiene varios contactos, el usuario controla cuáles incluir mediante el filtro de tipo de contacto.
- El seguimiento se consulta por `template` y se concilia por Seller ID, contacto y template.
- Se requiere auditoría de previews y descargas, asociada al usuario autenticado.
- No se requiere enmascaramiento adicional de email o teléfono, sin perjuicio de los controles de acceso y la minimización de logs.
- País debe estar disponible como filtro en la primera versión.
- Looker Studio no se elimina por completo: permanece temporalmente como vista secundaria dentro de Trace.
- El CSV final debe contener exactamente, en este orden: `email`, `seller_id`, `phone`. El encabezado `seller_id` se alimenta desde `src_id`.
- La tabla maestra tiene granularidad de una fila por seller-contacto.
- La búsqueda por nombre debe ser exacta.
- El usuario debe informar el nombre del `template` antes de descargar la audiencia.
- La reducción diaria de la base completa genera alerta cuando es igual o superior al 20%.
- Se autoriza crear persistencia para el snapshot diario de volumen y para el historial/auditoría de audiencias.
- Looker Studio solo podrá retirarse cuando negocio comunique explícitamente que la nueva Trace está validada.

## 2. Restricción crítica de alcance

> Modificar exclusivamente la funcionalidad asociada a la pestaña **Trace**.

No modificar, salvo que sea estrictamente necesario para conectar Trace con componentes compartidos ya existentes:

- Planner.
- Calendario.
- Solicitudes manuales.
- Autenticación e IAP.
- Administración de usuarios o roles.
- Navegación global.
- Layout general.
- Pipeline de Cloud Build.
- Configuración de Cloud Run.
- Infraestructura o recursos GCP.
- Contratos ya utilizados por otras vistas.
- Estilos globales.
- Dependencias o versiones del proyecto, excepto si son indispensables y están justificadas.

Antes de programar, inspeccionar el repositorio y confirmar la estructura real. El README contiene elementos marcados como `[VALIDAR]`, por lo que no se debe asumir que nombres de carpetas, stack, rutas, variables o comandos coinciden exactamente con el código.

## 3. Contexto funcional

Amplify es una aplicación interna de Seller Communications desplegada en Cloud Run. Actualmente cuenta con vistas Planner y Trace. Trace presenta un dashboard embebido de Looker Studio, que debe ser reemplazado por una herramienta operacional de generación, control y seguimiento de audiencias.

La nueva Trace no debe funcionar como un dashboard pasivo. Debe guiar al usuario por un flujo controlado, mostrar conteos en cada transición, hacer visibles las exclusiones y permitir la conciliación posterior con el resultado real del envío.

El diseño debe prevenir incidentes donde una audiencia final quede materialmente por debajo del universo esperado sin que el usuario lo detecte antes de descargarla o enviarla.

## 4. Fuentes de datos autorizadas y schemas confirmados

### 4.1 Base maestra de contactos

Usar como fuente para búsqueda, validación, filtros y generación de audiencias:

```text
bi-fcom-drmb-sell-in-sbx.sandbox_pzamora.base_contactos_v2
```

Schema confirmado:

| Columna | Tipo | Nullable | Uso esperado |
|---|---|---:|---|
| `Pais` | STRING | Sí | País y filtro de país |
| `Nombre` | STRING | Sí | Búsqueda alternativa |
| `Rut` | STRING | Sí | Búsqueda alternativa |
| `id_seller` | INT64 | Sí | Identificador auxiliar, no usar como Seller ID principal |
| `src_id` | STRING | Sí | **Seller ID principal para búsquedas** |
| `contacto` | STRING | Sí | Rol/tipo de contacto. La granularidad de la tabla es una fila por seller-contacto |
| `email` | STRING | Sí | Contacto y búsqueda alternativa |
| `phone` | STRING | Sí | Contacto y búsqueda alternativa |
| `num_emails_por_seller` | INT64 | Sí | Conteo diagnóstico de emails por seller |
| `geography` | STRING | Sí | Filtro de geografía |
| `tipo_seller` | STRING | Sí | Filtro de tipo de seller |
| `final_score` | FLOAT64 | Sí | Dato de score; no filtrar en V1 salvo decisión posterior |
| `valor` | STRING | Sí | Validar semántica antes de utilizar |
| `estado_sellers_sx` | STRING | Sí | Filtro de estado del seller |
| `Seller_Delist` | STRING | Sí | Filtro de seller delist |
| `fecha_creacion_seller` | DATE | Sí | Dato informativo |
| `dias_creacion` | INT64 | Sí | Dato informativo |
| `ultimo_login` | DATE | Sí | Dato informativo |
| `sin_login_3m` | INT64 | Sí | Señal de actividad; no exponer como filtro independiente en V1 salvo necesidad |
| `tiene_catalogo` | INT64 | Sí | Filtro tiene catálogo |
| `tiene_venta_12m` | INT64 | Sí | Filtro tiene ventas |
| `ultima_venta_12m` | DATE | Sí | Dato informativo |
| `dias_desde_ultima_venta` | INT64 | Sí | Dato informativo |
| `integrado` | INT64 | Sí | No filtrar en V1 salvo decisión posterior |
| `mc_held_status` | STRING | Sí | Filtro de HELD |
| `desuscritos_mc` | STRING | Sí | Filtro de desuscripción |
| `envios_3m` | INT64 | Sí | Dato de engagement |
| `opens_3m` | INT64 | Sí | Dato de engagement |
| `open_rate_3m` | FLOAT64 | Sí | Dato de engagement |
| `estado_engagement_3m` | STRING | Sí | Dato de engagement; no se confirmó como filtro V1 |
| `flag_or_0_3m` | INT64 | Sí | Señal auxiliar |
| `flag_or0_sin_login_3m` | INT64 | Sí | Regla de exclusión operacional |

Catálogos y etiquetas de negocio confirmados:

#### Tipo de contacto: `contacto`

- `Comercial`
- `Representante Bodega`
- `Seller Full Access`
- `Seller Order Access`
- `Representante legal`
- `Seller API Access`
- `FSC - Seller Setup`
- `Seller API Order Access`
- `Seller Developer`
- `Seller Catalog Access`
- `Seller API Product Access`

La selección de contacto filtra filas de la tabla. Un mismo `src_id` puede producir más de una fila/contacto.

#### Segmento del seller: `tipo_seller`

- `Autogestionado`
- `Híbrido`
- `Cartera asesorada`
- `NULL`, visible como `Sin dato`

#### Tiene venta: `tiene_venta_12m`

- `1` = `Sí`
- `0` = `No`
- `NULL` = `Sin dato`, si aparece

#### Tiene catálogo: `tiene_catalogo`

- `1` = `Sí`
- `0` = `No`
- `NULL` = `Sin dato`, si aparece

#### Estado seller: `estado_sellers_sx`

- `Activo`
- `Inactivo`
- `Riesgo`
- `Nuevo`
- `NULL`, visible como `Sin dato`

#### Desuscrito: `desuscritos_mc`

- `activo_mc` = `Activo`
- `unsubscribed` = `Desuscrito`
- `NULL` = `Sin dato`, si aparece

#### Seller delist: `Seller_Delist`

- `Seller delist`
- `Seller OK`
- `NULL`, visible como `Sin dato`

#### Geografía: `geography`

- `National`
- `International`
- `NULL` = `Sin dato`, si aparece

#### País: `Pais`

- `Chile`
- `Perú`
- `Colombia`
- `NULL` = `Sin dato`, si aparece

Regla confirmada para exclusión operacional:

```sql
CASE
  WHEN flag_or0_sin_login_3m = 1 THEN 'Excluir'
  ELSE 'Mantener'
END
```

Tratamiento confirmado de `flag_or0_sin_login_3m`: `1 = Excluir`, valores no nulos distintos de `1 = Mantener` y `NULL = Sin clasificar`. El SQL debe usar un `WHEN ... IS NULL` explícito antes del `ELSE`; no se debe permitir que un nulo termine clasificado como `Mantener`.

### 4.2 Histórico de resultados de envío

Usar para consultar el resultado posterior del envío:

```text
bi-fcom-drmb-sell-in-sbx.crm_sellers.detalle_contactos_historico
```

Schema confirmado:

| Columna | Tipo | Nullable | Uso esperado |
|---|---|---:|---|
| `pais` | STRING | Sí | País del envío |
| `area_solicitante` | STRING | Sí | Contexto del envío |
| `tipo_envio` | STRING | Sí | Tipo de envío |
| `template` | STRING | Sí | Identificador principal de búsqueda de campaña/template |
| `email` | STRING | Sí | Contacto para conciliación |
| `id_seller` | STRING | Sí | Seller ID en histórico |
| `fecha` | DATE | Sí | Fecha del envío |
| `id_jobenvio` | INT64 | Sí | Identificador técnico del job |
| `id_suscriptor` | INT64 | Sí | Identificador técnico del suscriptor |
| `estado_envio` | STRING | Sí | Estado del envío |
| `causa` | STRING | Sí | Causa de no envío o error |
| `open` | STRING | Sí | Indicador de apertura; validar valores reales |
| `clic` | STRING | Sí | Indicador de clic; validar valores reales |

Valores confirmados de `estado_envio`:

- `Enviado`
- `Not Sent`

Agrupación inicial:

- Enviados: `estado_envio = 'Enviado'`.
- No enviados/error: `estado_envio = 'Not Sent'`, utilizando `causa` para explicar el motivo.
- No enviados: `estado_envio = 'Not Sent'`. No equivale por sí solo a error o exclusión; debe conservarse como `No enviado` y desglosarse por `causa`.
- Causas confirmadas de `Not Sent`: `Missing Email Address`, `List Level Opt Out`, `List Detective Exclusion`, `Account Level Opt Out`, `Held`, `Unsubscribed`, `Build Email Error | Send Failure` y `NULL`/sin causa.
- Abiertos: `open = 'Open'`; `open IS NULL` significa que no abrió el email.
- Clics: `clic = 'Clic'`; `clic IS NULL` significa que no hizo clic dentro del email.
- Excluidos y entregados: no atribuir estos estados si la tabla no contiene una regla validada para ellos.
- No interpretar `NULL` de `open` o `clic` como falla técnica. Es ausencia de apertura o clic, respectivamente.

### 4.3 Reglas de acceso a datos

- Consultar BigQuery exclusivamente desde el backend. Nunca desde el navegador.
- Utilizar el mecanismo de credenciales y el cliente de BigQuery ya existente en el repositorio.
- No agregar credenciales, service account keys, tokens ni secretos al código.
- No crear infraestructura GCP fuera de lo necesario para la auditoría aprobada.
- Ejecutar consultas parametrizadas.
- Nunca concatenar directamente IDs, templates o filtros recibidos desde el frontend dentro del SQL.
- Seleccionar solamente las columnas necesarias.
- Aplicar paginación al detalle para evitar respuestas masivas.
- Mantener los permisos actuales de IAP y Cloud Run.

## 5. Trabajo previo obligatorio para Copilot

Antes de modificar archivos:

1. Leer el README y la estructura real del repositorio.
2. Identificar:
   - Componente o página actual de Trace.
   - Implementación del embed de Looker Studio.
   - Router de frontend.
   - Cliente HTTP existente.
   - Router o endpoints backend relacionados con Trace.
   - Conector o servicio actual de BigQuery.
   - Manejo de errores, configuración y logging.
   - Framework real de frontend y backend.
   - Frameworks de pruebas disponibles.
3. Ejecutar las pruebas existentes y el build antes de comenzar, para establecer una línea base.
4. Documentar brevemente en el PR los archivos de Trace encontrados y el enfoque que se seguirá.
5. Si el stack real difiere del README, respetar el código real. No migrar tecnología.
6. Si no existe una capa específica de Trace, crearla siguiendo los patrones ya usados por el repositorio, sin refactorizar módulos ajenos.

## 6. Experiencia objetivo de la pestaña Trace

Trace debe tener dos módulos claramente separados, accesibles dentro de la misma pestaña:

1. **Generación de Audiencias**
2. **Seguimiento de Envíos**

Puede implementarse con subtabs, tabs internas o un selector equivalente, reutilizando el sistema visual existente.

## 7. Módulo 1: Generación de Audiencias

### 7.1 Paso 1: ingreso de Seller IDs

Crear un área donde el usuario pueda pegar una lista de Seller IDs.

Requisitos:

- Admitir IDs separados por salto de línea, coma, punto y coma, tabulación o espacios.
- Limpiar espacios al inicio y al final.
- Ignorar filas vacías.
- Deduplicar los IDs de entrada.
- Conservar métricas separadas para:
  - Total de valores recibidos.
  - Total de IDs válidos.
  - Total de IDs inválidos.
  - Total de duplicados eliminados.
  - Total de Seller IDs únicos a consultar.
- Mostrar ejemplos de IDs inválidos, con un límite razonable.
- No consultar BigQuery si no quedan Seller IDs válidos.
- No imponer un límite funcional de Seller IDs. Para soportar volumen alto, procesar la entrada en lotes o mediante el patrón eficiente que permita el repositorio y BigQuery, con protección técnica por tamaño de payload, timeout y costo. Si una solicitud excede la capacidad sincrónica, devolver un error claro sin truncar silenciosamente.

No asumir el tipo del Seller ID. Inspeccionar el schema de la tabla y normalizar frontend, API y SQL al tipo real.

### 7.2 Paso 2: validación contra la base maestra

Consultar `bi-fcom-drmb-sell-in-sbx.sandbox_pzamora.base_contactos_v2` y clasificar los IDs en:

- Encontrados.
- No encontrados.
- Con contacto disponible.
- Sin contacto disponible, si el schema permite determinarlo.
- Con múltiples contactos, si un seller puede tener más de un contacto.

La interfaz debe mostrar, como mínimo:

- Seller IDs ingresados inicialmente.
- Seller IDs únicos y válidos.
- Seller IDs encontrados.
- Seller IDs no encontrados.
- Número total de contactos asociados a los sellers encontrados.

Permitir descargar o copiar la lista de no encontrados para diagnóstico, sin incluir datos innecesarios.

### 7.3 Paso 3: filtros y búsquedas alternativas

Filtros obligatorios para la primera versión:

| Filtro visible | Campo base | Regla/consideración |
|---|---|---|
| Tipo de contacto | `contacto` | Selección múltiple usando los 11 valores confirmados. Filtra filas seller-contacto. |
| Tiene venta | `tiene_venta_12m` | `1 = Sí`, `0 = No`, `NULL = Sin dato`. |
| Segmento del seller | `tipo_seller` | `Autogestionado`, `Híbrido`, `Cartera asesorada`, `Sin dato`. |
| Tiene catálogo | `tiene_catalogo` | `1 = Sí`, `0 = No`, `NULL = Sin dato`. |
| Estado seller | `estado_sellers_sx` | `Activo`, `Inactivo`, `Riesgo`, `Nuevo`, `Sin dato`. |
| HELD | `mc_held_status` | Selección múltiple; no interpretar valores sin profiling. |
| Desuscrito | `desuscritos_mc` | `activo_mc = Activo`, `unsubscribed = Desuscrito`, `NULL = Sin dato`. |
| Seller delist | `Seller_Delist` | `Seller delist`, `Seller OK`, `Sin dato`. |
| Geografía | `geography` | `National`, `International`, `Sin dato`. |
| País | `Pais` | `Chile`, `Perú`, `Colombia`, `Sin dato`. |
| Exclusión operacional | `flag_or0_sin_login_3m` | `1 = Excluir`, no nulo distinto de 1 = `Mantener`, `NULL = Sin clasificar`. |

Búsquedas alternativas, además de Seller ID (`src_id`):

- RUT: `Rut`.
- Email: `email`.
- Teléfono: `phone`.
- Nombre: `Nombre`.

Estas cuatro opciones deben presentarse como tipos de búsqueda, no como filtros posteriores de la audiencia. La UI debe obligar a seleccionar el tipo de identificador de entrada para evitar mezclar valores ambiguos en una misma consulta. En V1 se recomienda una sola modalidad por búsqueda. La búsqueda por `Nombre` debe ser exacta después de normalizar espacios; no debe usar coincidencia aproximada.

Reglas comunes:

1. Obtener opciones de filtros desde valores reales o catálogos controlados del backend.
2. Mostrar los nulos como `Sin dato` o etiqueta equivalente, preservándolos como nulos en la lógica y respuesta.
3. No convertir nulos automáticamente en elegibles o excluidos.
4. Mostrar nombre de negocio, descripción, valores seleccionados y cantidad excluida.
5. Centralizar las reglas en backend y evitar lógica divergente entre frontend y backend.
6. No implementar en V1 filtros no confirmados, aunque existan columnas de score o engagement.

### 7.4 Paso 4: confirmación de filtros

Antes de ejecutar la generación final, mostrar un resumen de reglas seleccionadas.

El usuario debe confirmar explícitamente:

- Seller IDs analizados.
- Filtros aplicados.
- Resultado esperado del filtrado.
- Exclusiones previstas.

No aplicar filtros ocultos en el frontend. Toda regla efectiva debe aparecer en el resumen.

### 7.5 Paso 5: funnel y resumen de trazabilidad

Antes de habilitar la descarga, presentar un funnel operativo con conteos y variación porcentual entre etapas.

Etapas mínimas:

1. Registros recibidos.
2. Seller IDs únicos y válidos.
3. Seller IDs encontrados en la base maestra.
4. Sellers excluidos por cada regla.
5. Sellers elegibles finales.
6. Contactos asociados a la audiencia final.

Para cada transición mostrar:

- Volumen inicial.
- Volumen final.
- Diferencia absoluta.
- Variación porcentual.
- Motivo o regla de exclusión.

La suma de sellers elegibles y sellers excluidos/no encontrados debe ser conciliable con el universo de IDs únicos válidos. Agregar validaciones para detectar diferencias de conteo.

### 7.6 Alertas preventivas

Implementar alertas visuales previas a la descarga cuando ocurra cualquiera de estas condiciones:

- Existen Seller IDs no encontrados.
- Más del 20% de los Seller IDs buscados no aparece en la base maestra. Esta alerta debe ser destacada y requiere confirmación explícita antes de continuar.
- La base maestra completa disminuye frente al día anterior. Mostrar volumen actual, volumen anterior, diferencia absoluta y variación porcentual.
- Existen registros sin clasificación requerida.
- Hay datos nulos que impiden evaluar una regla.
- La audiencia disminuye por encima de un umbral configurable.
- La audiencia final queda vacía.
- El número de contactos finales es cero.
- Existe una diferencia no conciliada entre conteos.
- Un seller genera una cantidad inesperadamente alta de contactos, si el modelo de datos permite detectar este caso.

Comportamiento recomendado:

- Advertencia: permite continuar después de confirmación explícita.
- Error bloqueante: impide descargar cuando no hay audiencia, no hay contactos o los conteos no concilian.

El umbral confirmado para Seller IDs no encontrados es mayor al 20%. Mantenerlo como configuración con valor inicial `0.20`. Para la disminución diaria de la base completa, generar alerta cuando el volumen sea igual o superior a 20% menor que el snapshot del día anterior. Mantener el umbral como configuración con valor inicial `0.20`.

### 7.7 Paso 6: descarga

Habilitar la descarga solamente después de:

- Consulta exitosa.
- Confirmación de filtros.
- Cálculo del resumen.
- Validaciones de conciliación.
- Confirmación de advertencias, si existen.

Formato recomendado: CSV UTF-8 con encabezados.

El usuario debe ingresar y confirmar el nombre del `template` antes de descargar. Este valor es obligatorio para crear la auditoría y facilitar la conciliación posterior.

El CSV final debe contener exactamente estas columnas y en este orden:

```text
email,seller_id,phone
```

Mapeo:

- `email` ← `base_contactos_v2.email`
- `seller_id` ← `base_contactos_v2.src_id`
- `phone` ← `base_contactos_v2.phone`

No incluir `contacto`, nombre, RUT, país ni otras columnas en el archivo productivo. Los campos `email` y `phone` pueden permanecer nulos si así resulta del filtro de contacto seleccionado, pero cada fila exportada debe tener al menos uno de los dos canales disponible. Bloquear o excluir filas sin email y sin phone, mostrándolas como exclusión por `Sin canal de contacto`.

La descarga debe generarse desde el backend o mediante un mecanismo que no exponga consultas ni credenciales.

Requisitos:

- Incluir únicamente columnas requeridas para el proceso de envío.
- Evitar exponer PII adicional.
- Mantener una convención estable de encabezados.
- Escapar correctamente comas, comillas, saltos de línea y caracteres especiales.
- Usar nombre de archivo con timestamp y, si el usuario lo proporciona, un identificador de audiencia.
- No registrar correos, teléfonos u otros datos personales completos en logs.

## 8. Módulo 2: Seguimiento de Envíos

### 8.1 Búsqueda

Permitir buscar resultados en:

```text
bi-fcom-drmb-sell-in-sbx.crm_sellers.detalle_contactos_historico
```

El criterio funcional principal es `template`. También puede utilizarse `fecha`, `pais`, `id_jobenvio` y `tipo_envio` como refinadores cuando resulte útil y corresponda al diseño final.

Antes de implementar:

- Inspeccionar el schema.
- Utilizar `template` como identificador funcional de búsqueda.
- Utilizar `id_seller`, `email`, `estado_envio`, `causa`, `fecha`, `open` y `clic` para el detalle.
- Permitir búsqueda exacta o selector de templates disponibles. Evitar búsqueda parcial costosa sobre toda la tabla sin rango de fecha.
- No inventar un `campaign_id`: no existe en el schema confirmado.

### 8.2 Resumen de resultados

Para una campaña/template seleccionado mostrar, cuando los datos lo permitan:

- Sellers incluidos o procesados.
- Sellers enviados.
- Sellers con error.
- Sellers excluidos.
- Contactos procesados.
- Distribución por estado.
- Fecha o rango de ejecución.

Diferenciar métricas a nivel seller y a nivel contacto. No sumar contactos como si fueran sellers.

### 8.3 Detalle individual

Mostrar una tabla paginada con:

- Seller ID.
- Contacto, enmascarado en pantalla si las políticas o patrones existentes lo requieren.
- Campaña/template.
- Estado normalizado.
- Estado original de la fuente, si es útil para auditoría.
- Fecha/hora del evento.
- Motivo de error o exclusión, si existe.
- Otros campos relevantes que existan realmente en la tabla.

Incluir:

- Búsqueda por Seller ID dentro del resultado.
- Filtro por estado.
- Ordenamiento por fecha.
- Estado vacío comprensible.
- Paginación server-side.

### 8.4 Respuesta a las preguntas de trazabilidad

La interfaz debe permitir responder:

#### ¿Qué ocurrió con esta audiencia?

Mediante el resumen por campaña/template, distribución de estados y detalle de excepciones.

#### ¿Qué ocurrió con este seller específico?

Mediante una búsqueda por Seller ID que muestre sus registros y estados dentro de la campaña/template consultada.

La conciliación se realizará por Seller ID, contacto/email y `template`. El usuario espera que la cantidad descargada para un envío coincida posteriormente con sellers y contactos visibles al consultar ese template. Como no existe una clave única confirmada entre descarga y envío, la UI debe presentar la conciliación como comparación por estas dimensiones y señalar diferencias, duplicados o ambigüedades.

## 9. Modelo de estados

El objetivo conceptual de Trace considera estados como:

- Recibido.
- Procesado.
- Elegible.
- Excluido.
- Enviado.
- Entregado.
- Abierto.
- Error.
- No enviado.
- Abierto.
- Clic.

Sin embargo, no se debe asumir que todos existen en las dos tablas disponibles.

Implementación:

- Crear un mapeo centralizado entre estados de origen y estados de presentación.
- Conservar el valor de origen.
- No mapear estados desconocidos a éxito.
- Mostrar los estados desconocidos como `SIN_CLASIFICAR` o equivalente visible.
- Registrar métricas técnicas de estados no reconocidos sin incluir PII.

## 10. API propuesta

Adaptar nombres y convenciones al repositorio real. Una posible separación es:

```text
POST /api/trace/audiences/preview
POST /api/trace/audiences/export
GET  /api/trace/sends/options
GET  /api/trace/sends/summary
GET  /api/trace/sends/detail
```

### 10.1 Preview de audiencia

Entrada conceptual:

```json
{
  "seller_ids": ["..."],
  "filters": {
    "...": ["..."]
  }
}
```

Salida conceptual:

```json
{
  "input": {
    "received": 0,
    "valid_unique": 0,
    "invalid": 0,
    "duplicates": 0
  },
  "matching": {
    "found": 0,
    "not_found": 0,
    "contacts": 0
  },
  "exclusions": [
    {
      "rule": "...",
      "label": "...",
      "excluded_sellers": 0,
      "remaining_sellers": 0
    }
  ],
  "result": {
    "eligible_sellers": 0,
    "final_contacts": 0
  },
  "alerts": [],
  "reconciliation_ok": true
}
```

### 10.2 Exportación

No confiar en conteos enviados por el frontend. El backend debe volver a validar la solicitud o usar un identificador de preview seguro y temporal según los patrones existentes.

### 10.3 Seguimiento

Las consultas de resumen y detalle deben utilizar los mismos filtros para evitar diferencias entre tarjetas y tabla.

## 10.4 Auditoría e historial de audiencias

Se autoriza crear una tabla de auditoría para persistir el historial de audiencias y consultarlo dentro de Trace.

Antes de crearla, Copilot debe verificar si existe un dataset de sandbox/aplicación y un patrón de nombres aprobado. No crearla en los datasets de las tablas fuente sin validar permisos y ownership. El dataset y nombre físico continúan siendo parámetros de configuración.

Nombre lógico recomendado: `trace_audience_history`.

DDL conceptual mínimo:

```sql
CREATE TABLE `<PROJECT>.<DATASET>.trace_audience_history` (
  audience_id STRING NOT NULL,
  created_at TIMESTAMP NOT NULL,
  created_date DATE NOT NULL,
  created_by STRING NOT NULL,
  template STRING NOT NULL,
  search_type STRING NOT NULL,
  initial_sellers INT64 NOT NULL,
  found_sellers INT64 NOT NULL,
  final_sellers INT64 NOT NULL,
  final_contacts INT64 NOT NULL,
  filters_json JSON,
  exclusions_json JSON,
  warnings_json JSON,
  export_file_name STRING,
  status STRING NOT NULL
)
PARTITION BY created_date
CLUSTER BY template, created_by;
```

Campos mínimos solicitados por negocio:

- Fecha.
- Persona que creó la audiencia.
- Número de sellers inicial.
- Número de sellers final.
- Nombre del template.

Se agregan campos técnicos necesarios para trazabilidad, conciliación y operación. Si BigQuery no admite `JSON` con la configuración real del proyecto, usar `STRING` con JSON validado.

Reglas:

- Obtener `created_by` de la identidad autenticada por IAP, nunca de un valor libre enviado por el frontend.
- Exigir `template` antes de la descarga.
- Insertar el registro de auditoría al confirmar/generar la descarga.
- No guardar listas completas de Seller IDs, emails o teléfonos en esta tabla.
- Mostrar en Trace una subvista `Historial de audiencias` con búsqueda por template, usuario y rango de fechas.
- Permitir ver conteos, filtros, exclusiones, advertencias y estado de cada audiencia.
- La auditoría no reemplaza la tabla histórica de resultados de envío. Debe usarse para comparar lo descargado contra lo procesado posteriormente.

## 10.5 Snapshot diario del volumen de la base maestra

Se autoriza crear una segunda tabla para registrar fecha y cantidad total diaria de la base maestra y soportar la alerta de disminución.

Nombre lógico recomendado: `trace_contacts_daily_snapshot`.

DDL conceptual:

```sql
CREATE TABLE `<PROJECT>.<DATASET>.trace_contacts_daily_snapshot` (
  snapshot_date DATE NOT NULL,
  captured_at TIMESTAMP NOT NULL,
  total_rows INT64 NOT NULL,
  distinct_sellers INT64 NOT NULL,
  total_contacts INT64 NOT NULL
)
PARTITION BY snapshot_date;
```

Cálculos mínimos:

- `total_rows`: número de filas de `base_contactos_v2`.
- `distinct_sellers`: `COUNT(DISTINCT src_id)` sin contar nulos.
- `total_contacts`: número de filas con al menos un canal disponible (`email IS NOT NULL OR phone IS NOT NULL`).

Reglas de operación:

- Registrar un snapshot por día.
- Evitar duplicados por `snapshot_date` mediante `MERGE` o patrón idempotente.
- Comparar el snapshot actual contra el día anterior disponible.
- Generar alerta si `distinct_sellers` o `total_contacts` disminuye 20% o más. Mostrar ambas métricas para evitar confundir filas, sellers y contactos.
- Si no existe snapshot anterior, registrar el actual y mostrar `Sin histórico suficiente`, sin disparar una falsa alerta.
- El mecanismo de ejecución diaria debe reutilizar capacidades existentes del proyecto. Si requiere Cloud Scheduler, Scheduled Queries u otra infraestructura nueva, incluirla como propuesta separada y documentada, sin modificar infraestructura ajena a Trace sin aprobación.

## 11. Backend

Implementar siguiendo la arquitectura existente:

- Router/controlador fino.
- Servicio de negocio para normalización, reglas, conteos y conciliación.
- Repositorio/conector para BigQuery.
- Modelos de request/response tipados.
- Manejo uniforme de errores.

Requisitos técnicos:

- Parametrizar arrays de Seller IDs con mecanismos soportados por BigQuery.
- Validar el tamaño técnico del payload sin establecer un máximo funcional arbitrario de Seller IDs.
- Configurar timeout.
- Evitar consultas `SELECT *`.
- Aplicar paginación y límites.
- Devolver códigos HTTP adecuados.
- No devolver stack traces al frontend.
- Registrar duración de consulta, número de IDs, número de filas y resultado general, nunca el listado completo de contactos.
- Mantener compatibilidad con Cloud Run.

## 12. Frontend

Reutilizar componentes, librerías y convenciones existentes.

Estados mínimos de UI:

- Inicial.
- Validando entrada.
- Consultando.
- Preview disponible.
- Advertencia.
- Error.
- Sin resultados.
- Descargando.
- Descarga completada.

Principios:

- No congelar la pantalla durante consultas.
- Deshabilitar acciones duplicadas mientras una solicitud está en curso.
- Mostrar mensajes accionables.
- Preservar los IDs y filtros ante un error recuperable.
- No guardar contactos o audiencias sensibles en `localStorage` o logs del navegador.
- Mantener accesibilidad de formularios, botones, tablas y alertas.
- No introducir un nuevo sistema visual.

## 13. Permanencia temporal de Looker Studio

Looker Studio debe permanecer como vista secundaria durante la etapa de validación.

Requisitos:

- La experiencia nativa de Trace debe ser la vista principal.
- Mantener el embed existente detrás de una subtab o acceso claramente rotulado, por ejemplo `Dashboard anterior` o `Looker Studio`.
- No duplicar la carga del iframe cuando la vista secundaria no está activa.
- No eliminar todavía la variable de entorno, URL, componente o dependencia del embed.
- No modificar permisos de Looker Studio.
- Evitar que la vista secundaria interfiera con el estado de Generación de Audiencias o Seguimiento de Envíos.
- Documentar que su retiro definitivo queda sujeto a validación funcional y conciliación de métricas.

## 14. Pruebas obligatorias

### 14.1 Backend

Cubrir, al menos:

- Parser y deduplicación de Seller IDs.
- IDs inválidos.
- Volúmenes altos de IDs y procesamiento por lotes.
- IDs encontrados y no encontrados.
- Sellers con múltiples contactos.
- Aplicación de cada filtro.
- Nulos en columnas de filtros.
- Conteo por regla de exclusión.
- Conciliación de conteos.
- Audiencia vacía.
- Exportación CSV.
- Orden exacto del CSV: `email,seller_id,phone`.
- Obligación de template antes de la descarga.
- Exclusión/bloqueo de filas sin email y sin phone.
- Inserción de auditoría usando la identidad IAP.
- Consulta del historial de audiencias.
- Snapshot diario idempotente y alerta por caída igual o superior al 20%.
- Catálogos confirmados y categoría visible para nulos.
- Búsqueda exacta por nombre.
- Interpretación de `Open`, `Clic` y sus nulos.
- Desglose de `Not Sent` por `causa`.
- Parámetros de consulta, evitando SQL injection.
- Resumen por campaña/template.
- Filtro por Seller ID y estado.
- Paginación.
- Estados desconocidos.
- Errores de BigQuery y timeouts.

Usar mocks o fixtures. Las pruebas automatizadas no deben depender de BigQuery real, salvo que el repositorio ya tenga pruebas de integración controladas.

### 14.2 Frontend

Cubrir, al menos:

- Ingreso y normalización de IDs.
- Resumen de inválidos y duplicados.
- Selección y confirmación de filtros.
- Funnel y alertas.
- Bloqueo de descarga ante errores críticos.
- Confirmación de advertencias.
- Estados loading, empty y error.
- Búsqueda de campaña/template.
- Resumen y detalle.
- Filtro por seller y estado.
- Paginación.

### 14.3 Casos de aceptación funcional

1. Al ingresar IDs válidos y aplicar filtros, el usuario ve la reducción por cada regla antes de descargar.
2. Los no encontrados aparecen separados y no se pierden silenciosamente.
3. El total final concilia con el universo inicial después de inválidos, duplicados, no encontrados y exclusiones.
4. Una caída fuerte de volumen genera una alerta visible.
5. No se puede descargar una audiencia vacía o inconsistente.
6. La descarga contiene únicamente contactos elegibles y columnas permitidas.
7. El usuario puede consultar un envío y ver resumen y detalle.
8. El usuario puede buscar un Seller ID específico dentro de un envío.
9. La modificación no cambia Planner ni otras funcionalidades.
10. Build, lint, type-check y pruebas existentes continúan exitosos.

## 15. Observabilidad y operación

Agregar logs estructurados, siguiendo el patrón existente, para:

- Inicio y fin de preview.
- Duración de consultas.
- Cantidades agregadas por etapa.
- Exportaciones realizadas.
- Consultas de seguimiento.
- Errores de BigQuery.
- Estados de envío sin clasificación.

No registrar:

- Listas completas de Seller IDs.
- Correos o teléfonos completos.
- Contenido de archivos exportados.
- Credenciales o SQL con datos sensibles.

Si el repositorio ya usa correlation/request IDs, conservarlos.

## 16. Rendimiento y control de costos

- Usar consultas selectivas.
- Evitar escanear toda la tabla histórica sin filtro de campaña/template o rango razonable.
- No cargar todos los detalles en memoria o navegador.
- Usar paginación server-side.
- Considerar debounce en búsquedas textuales.
- Exponer errores de consulta con mensajes comprensibles, sin detalles internos.
- Si el volumen exige una estrategia distinta, documentar el hallazgo antes de incorporar nueva infraestructura.

## 17. Definición de terminado

La tarea se considera terminada cuando:

- La funcionalidad principal de Trace ya no depende del embed de Looker Studio, pero el dashboard permanece accesible como vista secundaria temporal.
- Existen los dos módulos funcionales.
- Los datos se consultan desde las tablas autorizadas.
- Los filtros implementados corresponden a columnas y reglas validadas.
- El funnel muestra conteos y exclusiones conciliables.
- Las alertas preventivas funcionan.
- La descarga está controlada y probada.
- El seguimiento permite resumen y detalle por seller.
- No se modificó funcionalidad fuera de Trace.
- No se expusieron secretos ni PII en logs.
- Pasan build, lint, type-check y pruebas.
- Se actualiza la documentación específica de Trace.
- El CSV respeta exactamente el contrato `email,seller_id,phone`.
- La descarga exige template y crea un registro de historial asociado al usuario autenticado.
- Trace permite consultar el historial de audiencias.
- Existe snapshot diario de la base y alerta por caída igual o superior al 20%.
- Looker Studio permanece disponible hasta recibir la declaración explícita de validación.
- El PR incluye capturas o evidencia de los casos de aceptación.

## 18. Entregables esperados del cambio

1. Código frontend de la nueva Trace.
2. Endpoints y servicios backend necesarios.
3. Consultas parametrizadas a BigQuery.
4. Pruebas automáticas.
5. Documentación de filtros y mapeo de estados.
6. Actualización del README solo en las secciones directamente relacionadas con Trace y únicamente con información confirmada.
7. Descripción de PR con:
   - Alcance.
   - Archivos modificados.
   - Decisiones técnicas.
   - Evidencia de pruebas.
   - Riesgos o limitaciones.
   - Dudas pendientes.

## 19. Definiciones técnicas aún pendientes

Las definiciones funcionales anteriores quedan resueltas. Antes de desplegar, solo deben confirmarse estos puntos técnicos:

1. Project, dataset y nombres físicos definitivos para `trace_audience_history` y `trace_contacts_daily_snapshot`.
2. Retención y permisos de consulta para las dos tablas nuevas.
3. Mecanismo disponible para ejecutar el snapshot diario: Scheduled Query, Cloud Scheduler/Cloud Run Job o capacidad ya existente.
4. Valores reales y semántica del filtro `mc_held_status`, que todavía no fueron informados. La UI puede obtenerlos dinámicamente, pero la etiqueta de cada valor debe validarse.
5. Si las búsquedas alternativas por RUT, email, teléfono y nombre pueden producir varios sellers, la UI debe mostrar resultados antes de agregarlos a la audiencia.
6. Confirmar si la alerta diaria debe observar ambas métricas (`distinct_sellers` y `total_contacts`) o solamente sellers. La especificación propone ambas para mayor control.

No quedan pendientes funcionales sobre el CSV, contacto, filtros categóricos informados, umbrales, `open`, `clic`, `Not Sent`, nulos de la exclusión, template, búsqueda por nombre o permanencia de Looker Studio.

## 20. Instrucción final para GitHub Copilot

Implementa el cambio en iteraciones pequeñas y revisables. Primero inspecciona y reporta la estructura real y las decisiones que pueden tomarse con evidencia del repositorio. Después crea el flujo vertical mínimo de Trace: entrada de Seller IDs, preview contra BigQuery, conteos conciliados y UI. Continúa con filtros, alertas, exportación y seguimiento de envíos.

Usa los schemas y reglas confirmados en este documento. No inventes valores categóricos, columnas adicionales, reglas de negocio, estados, endpoints ni componentes existentes. No retires Looker Studio hasta que negocio haya comunicado literalmente que la solución está validada. Cuando falte una definición, deja una pregunta explícita y utiliza una abstracción configurable, sin codificar una decisión de negocio arbitraria.
