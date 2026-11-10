# Instrucciones para GitHub Copilot: reportería dinámica y filtros locales en Trace > Generación de Audiencias

## 1. Objetivo

Modificar **únicamente la hoja/módulo `Generación de Audiencias` dentro de la pestaña Trace** de Amplify para mejorar la experiencia posterior a la consulta inicial.

El cambio tiene dos objetivos inseparables:

1. Incorporar gráficos de reportería entre las tarjetas de conciliación y la tabla resumen/funnel existente.
2. Cambiar el comportamiento de filtros para que, una vez realizada la consulta inicial, los filtros operen de forma dinámica sobre el dataset ya recuperado, **sin volver a consultar BigQuery por cada cambio de filtro**.

La experiencia objetivo es:

```text
Ingreso/búsqueda
      ↓
UNA consulta al backend / BigQuery
      ↓
Dataset de trabajo de la audiencia
      ↓
Filtros locales dinámicos
      ↓
Tarjetas + gráficos + tabla resumen + descarga
      ↑
      └──── todos reaccionan al mismo estado filtrado
```

## 2. Restricción absoluta de alcance

Modificar exclusivamente:

```text
Trace > Generación de Audiencias
```

No modificar:

- Seguimiento de envíos.
- Historial de audiencias.
- Looker Studio.
- Planner.
- Reportería global de Amplify.
- Glosario.
- Navegación general.
- Autenticación/IAP.
- Gestión de usuarios.
- Cloud Run o Cloud Build.
- Otras APIs o pantallas salvo una adaptación estrictamente necesaria del endpoint que alimenta la consulta inicial de Generación de Audiencias.

No realizar refactors generales.

## 3. Antes de programar

Antes de modificar código:

1. Leer `README.md` y la documentación vigente de Trace.
2. Inspeccionar la implementación real de `Generación de Audiencias`.
3. Identificar:
   - componente/página React responsable;
   - estado actual del preview;
   - componentes de filtros;
   - botón `Actualizar preview con filtros`;
   - endpoint utilizado para consultar la audiencia;
   - servicio frontend que llama al endpoint;
   - estructura exacta de la respuesta;
   - lógica que calcula las tarjetas de `Conciliación`;
   - lógica que construye la tabla `Etapa / regla`;
   - mecanismo actual de descarga;
   - librerías de gráficos que ya existan en `package.json`.
4. Ejecutar tests/build actuales antes del cambio.
5. No agregar una nueva librería de gráficos si el repositorio ya tiene una adecuada. Si no existe, preferir una librería React ligera y mantenida, pero documentar la nueva dependencia antes de incorporarla.

El código real define cómo integrar técnicamente el cambio. Este documento define el comportamiento funcional esperado.

---

# PARTE A. FILTROS DINÁMICOS SIN NUEVAS CONSULTAS A BIGQUERY

## 4. Problema actual

Actualmente el flujo obliga al usuario a cambiar un filtro y ejecutar nuevamente una acción como:

```text
Actualizar preview con filtros
```

Esto provoca una nueva consulta para recalcular la audiencia.

Ese comportamiento debe cambiar.

Una vez ejecutada la búsqueda inicial, la aplicación debe disponer de un **dataset base de trabajo** suficiente para aplicar los filtros confirmados de Generación de Audiencias en frontend/memoria sin consultar nuevamente BigQuery.

## 5. Principio funcional

Debe existir una separación explícita entre:

### Dataset base

Resultado inmutable de la búsqueda inicial.

Ejemplo conceptual:

```javascript
baseAudienceRows
```

### Estado de filtros

Selecciones actuales del usuario.

Ejemplo conceptual:

```javascript
activeFilters
```

### Dataset filtrado

Resultado derivado del dataset base y los filtros actuales.

Ejemplo conceptual:

```javascript
filteredAudienceRows = applyFilters(baseAudienceRows, activeFilters)
```

`filteredAudienceRows` debe ser **estado derivado**, no una segunda fuente de verdad independiente.

La implementación exacta debe seguir los patrones React existentes y puede usar `useMemo`, selectors u otro mecanismo equivalente ya utilizado por el proyecto.

## 6. Consulta inicial

La consulta inicial debe ejecutarse cuando el usuario introduce la población que desea analizar por las modalidades ya implementadas, por ejemplo Seller ID u otras búsquedas existentes.

Esa consulta debe traer en una sola operación las columnas necesarias para:

- identificar sellers y contactos;
- calcular las tarjetas;
- aplicar todos los filtros disponibles en Generación de Audiencias;
- construir los gráficos solicitados;
- construir la tabla de conciliación;
- generar posteriormente el CSV final.

No utilizar `SELECT *` simplemente para resolver esta necesidad. Seleccionar explícitamente las columnas requeridas.

Para el comportamiento ya definido de Trace, el dataset de trabajo debe incluir, cuando corresponda al resultado real del endpoint, al menos la información equivalente a:

- `src_id` / Seller ID.
- `contacto`.
- `email`.
- `phone`.
- `Pais`.
- `geography`.
- `tipo_seller`.
- `tiene_venta_12m`.
- `tiene_catalogo`.
- `estado_sellers_sx`.
- `mc_held_status`.
- `desuscritos_mc`.
- `Seller_Delist`.
- `flag_or0_sin_login_3m`.

Mantener únicamente campos necesarios para esta pantalla.

## 7. Regla crítica: cero consultas por interacción con filtros

Después de una consulta inicial exitosa:

- cambiar País NO consulta BigQuery;
- cambiar Geografía NO consulta BigQuery;
- cambiar Segmento NO consulta BigQuery;
- cambiar Tiene venta NO consulta BigQuery;
- cambiar Tiene catálogo NO consulta BigQuery;
- cambiar Estado seller NO consulta BigQuery;
- cambiar Tipo de contacto NO consulta BigQuery;
- cambiar Desuscrito NO consulta BigQuery;
- cambiar Seller delist NO consulta BigQuery;
- cambiar HELD NO consulta BigQuery;
- cambiar Exclusión operacional NO consulta BigQuery;
- limpiar filtros NO consulta BigQuery;
- combinar varios filtros NO consulta BigQuery.

La red del navegador debe evidenciar que estas acciones no generan nuevas llamadas al endpoint de preview/audiencia.

## 8. Cuándo sí se permite una nueva consulta

Realizar otra consulta solamente cuando cambie el **universo de entrada**, por ejemplo:

- el usuario carga/busca nuevos Seller IDs;
- ejecuta una nueva búsqueda por RUT, email, teléfono o nombre;
- reemplaza la lista original;
- pulsa explícitamente una acción equivalente a `Nueva consulta` o `Consultar` sobre un nuevo universo.

Los filtros de análisis no deben redefinir el dataset base mediante backend.

## 9. Comportamiento de los filtros

Después de cargar el dataset base:

1. Los filtros quedan habilitados.
2. Cada cambio se aplica inmediatamente.
3. Los filtros se combinan con lógica AND entre dimensiones.
4. Si una dimensión permite selección múltiple, los valores seleccionados dentro de esa dimensión operan con lógica OR.

Ejemplo:

```text
País = Chile OR Perú
AND
Segmento = Autogestionado
AND
Tiene venta = Sí
```

Debe mostrar sellers/contactos que cumplan simultáneamente esas condiciones.

Los nulos conservan el tratamiento ya definido en Trace (`Sin dato` / `Sin clasificar` según corresponda).

## 10. Facetas dinámicas

Idealmente, los controles deben funcionar como filtros facetados:

- mostrar las opciones válidas;
- mostrar cantidad de registros/sellers cuando el componente existente lo permita;
- reaccionar a los demás filtros activos;
- nunca esconder una selección activa de forma que el usuario no pueda desmarcarla.

No es necesario realizar queries al backend para obtener las facetas después de la consulta inicial. Deben calcularse desde el dataset en memoria.

## 11. Eliminar la interacción de “Actualizar preview con filtros”

El botón actual `Actualizar preview con filtros` deja de tener función en el nuevo modelo.

Preferencia:

- retirarlo de esta hoja;
- aplicar filtros automáticamente al cambiar la selección.

Si el diseño existente exige mantener una acción visual por compatibilidad, no debe efectuar consultas a BigQuery y debe limitarse a aplicar estado local. Sin embargo, la opción preferida es eliminar el botón para evitar confusión.

## 12. Estado y rendimiento

Para evitar renders y cálculos innecesarios:

- mantener un único dataset base;
- calcular el resultado filtrado mediante estado derivado/memoización;
- no duplicar arrays grandes sin necesidad;
- normalizar valores usados repetidamente si ayuda al desempeño;
- no usar `JSON.stringify` de datasets completos como dependencia de hooks;
- no persistir la audiencia en `localStorage` o `sessionStorage`;
- limpiar dataset y filtros cuando el usuario inicia una nueva consulta;
- conservar el dataset solo durante la sesión activa de la página.

Si el dataset recuperado resulta demasiado grande para filtrado fluido en navegador, **no volver silenciosamente al patrón de una query por filtro**. Documentar el volumen/problemática y proponer una estrategia distinta. El objetivo de esta modificación es interacción local después de una sola consulta.

---

# PARTE B. REPORTERÍA VISUAL

## 13. Ubicación

Agregar una nueva sección de reportería exactamente entre:

```text
Tarjetas de Conciliación
        ↓
NUEVA REPORTERÍA VISUAL
        ↓
Tabla resumen Etapa / regla
```

No mover la tabla existente a otra hoja.

La reportería debe sentirse como continuación natural del bloque `Conciliación`.

## 14. Objetivo de los gráficos

Los gráficos no son decorativos.

Deben ayudar a responder rápidamente:

1. ¿Cómo está compuesta la audiencia actual?
2. ¿Qué filtros/exclusiones están reduciendo más la audiencia?
3. ¿Cómo se distribuyen los sellers/contactos resultantes?
4. ¿De dónde proviene la mayor pérdida entre el universo encontrado y la audiencia elegible?

Todos deben recalcularse automáticamente usando el mismo `filteredAudienceRows` de los filtros dinámicos.

No realizar llamadas adicionales al backend para alimentar los gráficos.

## 15. Gráfico 1: composición de la audiencia

Crear un gráfico de barras horizontales o verticales para mostrar la composición de la audiencia según una dimensión seleccionable.

Dimensiones recomendadas disponibles desde la información ya utilizada por los filtros:

- País.
- Geografía.
- Segmento del seller.
- Estado seller.
- Tipo de contacto.

Agregar un selector de dimensión en el encabezado del gráfico.

Al cambiar la dimensión, recalcular localmente.

Métrica primaria:

```text
Sellers únicos
```

Mostrar también `Contactos` en tooltip o como segunda serie únicamente si mantiene legibilidad.

Reglas:

- agrupar nulos como `Sin dato`;
- ordenar de mayor a menor;
- evitar leyendas redundantes;
- tooltip con valor absoluto y porcentaje del total filtrado;
- no mezclar cantidad de sellers con cantidad de contactos bajo la misma escala sin distinguir claramente ambas métricas.

## 16. Gráfico 2: impacto de filtros/exclusiones

Crear un gráfico que muestre cuánto reduce cada regla la audiencia.

Preferencia visual:

- waterfall si la librería existente lo soporta correctamente;
- si no, barras horizontales de exclusiones por etapa.

Debe utilizar la misma lógica de la tabla resumen `Etapa / regla`.

Para cada regla mostrar, cuando aplique:

- sellers antes;
- sellers excluidos;
- sellers finales;
- variación porcentual.

Ejemplo conceptual:

```text
Encontrados en base       15.981
Seller delist            -10.813
Exclusión operacional       -120
...
Sellers elegibles          5.048
```

No hardcodear estos números. Son solamente una referencia visual basada en el estado mostrado actualmente.

La visualización y la tabla resumen deben provenir del **mismo cálculo de funnel** para impedir discrepancias.

## 17. Gráfico 3: elegibles vs excluidos

Agregar una visualización compacta para responder qué proporción del universo encontrado permanece elegible.

Recomendación:

- barra 100% apilada como primera opción;
- donut solo si encaja mejor con la librería y sistema visual existente.

Categorías mínimas:

- Elegibles.
- Excluidos por reglas/filtros.

Los no encontrados pertenecen al proceso anterior de conciliación y no deben mezclarse silenciosamente con exclusiones posteriores. Si se visualizan, deben aparecer como una categoría independiente.

Debe mostrar:

- valor absoluto;
- porcentaje;
- total usado como denominador.

## 18. Layout recomendado

En desktop:

```text
┌─────────────────────────────────────────────────────────────┐
│            Composición de audiencia                         │
│       gráfico ancho + selector de dimensión                 │
└─────────────────────────────────────────────────────────────┘

┌──────────────────────────────┬──────────────────────────────┐
│ Impacto de filtros           │ Elegibles vs excluidos      │
│ waterfall/barras             │ 100% stacked / donut        │
└──────────────────────────────┴──────────────────────────────┘
```

Si el ancho real de la aplicación o componentes existentes lo hacen mejor, se puede utilizar una grilla equivalente.

En pantallas estrechas, apilar los gráficos verticalmente.

No introducir scroll horizontal en toda la página.

## 19. Coherencia visual

Respetar el diseño actual mostrado por Amplify:

- fondo claro;
- bordes suaves;
- tipografía existente;
- tarjetas simples;
- verde/lima de Amplify como acento, no como único color de datos;
- estados positivos/advertencias coherentes con los ya existentes;
- títulos y labels en español.

No introducir un sistema de diseño independiente.

La captura de referencia actual muestra el bloque `Conciliación`, ocho métricas agregadas y debajo la tabla `Etapa / regla`. La reportería se debe insertar entre esos dos elementos sin alterar el resto de la estructura de Trace.

## 20. Un único modelo de datos para toda la pantalla

Después de la consulta inicial, los siguientes elementos deben reaccionar al mismo estado:

```text
activeFilters
      ↓
filteredAudienceRows
      ↓
┌───────────────┬─────────────────┬─────────────────┐
│ tarjetas      │ gráficos        │ tabla/funnel    │
└───────────────┴─────────────────┴─────────────────┘
      ↓
CSV de audiencia final
```

Evitar implementar cálculos independientes que puedan producir números diferentes.

Crear funciones/selectores puros y testeables, por ejemplo conceptualmente:

```javascript
applyAudienceFilters(rows, filters)
calculateAudienceMetrics(baseRows, filteredRows, inputStats)
calculateFunnel(baseRows, filters)
buildAudienceBreakdown(filteredRows, dimension)
buildEligibilityBreakdown(...)
```

Los nombres reales deben respetar las convenciones del repositorio.

---

# PARTE C. CONTEOS Y SEMÁNTICA

## 21. Diferenciar sellers y contactos

La granularidad de la base es seller-contacto.

Por lo tanto, cada métrica debe indicar si representa:

- sellers únicos; o
- filas/contactos.

Usar Seller ID (`src_id` en origen) para `COUNT DISTINCT` conceptual de sellers.

No interpretar el número de filas como número de sellers.

## 22. Tarjetas actuales

Las tarjetas actuales deben mantenerse, pero deben reaccionar inmediatamente a los filtros cuando la semántica de la tarjeta dependa de la audiencia filtrada.

Mantener como referencia estable las métricas del universo de entrada cuando corresponda:

- Valores recibidos.
- Únicos válidos.
- Encontrados.
- No encontrados.

Actualizar dinámicamente las métricas posteriores al filtrado, incluyendo al menos:

- Sellers elegibles.
- Contactos finales.

Para métricas como `Sellers sin canal` y `Sellers con múltiples contactos`, revisar su definición actual y decidir desde el código existente si representan universo base o resultado actual. Mantener la semántica original y documentar el comportamiento.

## 23. Tabla resumen

La tabla `Etapa / regla` debe continuar existiendo.

Sin embargo:

- debe recalcularse localmente;
- debe usar exactamente las mismas reglas de los filtros;
- debe actualizarse inmediatamente;
- no debe requerir `Actualizar preview con filtros`;
- los gráficos de impacto deben consumir el mismo modelo de funnel.

## 24. Descarga

La descarga final debe corresponder exactamente al estado filtrado visible en pantalla.

Antes de descargar:

- las tarjetas;
- los gráficos;
- el total final de la tabla;
- la cantidad de sellers/contactos exportables

deben ser conciliables.

Mantener el contrato de CSV ya implementado para Trace. No modificar columnas u orden como parte de esta tarea.

Si el backend vuelve a validar el export por seguridad/auditoría, conservar ese control. La optimización de este documento aplica a la **interacción analítica de filtros y reporte**, no obliga a eliminar validaciones del backend al momento de generar la descarga final.

---

# PARTE D. ESTADOS DE UI

## 25. Antes de consultar

Antes de disponer del dataset:

- filtros deshabilitados o en estado inicial;
- reportería puede mostrar un empty state;
- texto sugerido: `Realiza una consulta para visualizar la composición de la audiencia.`

No mostrar gráficos con ceros que puedan interpretarse como datos reales.

## 26. Después de consultar

Después de una consulta exitosa:

- filtros activos;
- tarjetas visibles;
- gráficos visibles;
- tabla visible;
- no debe ser necesario ningún botón de actualización.

## 27. Sin resultados por filtros

Si una combinación deja cero resultados:

- no ejecutar otra query;
- mostrar `0` en métricas derivadas;
- gráficos con empty state claro;
- mantener visibles los filtros para poder corregir la selección;
- ofrecer `Limpiar filtros`;
- no borrar el dataset base.

## 28. Nueva consulta

Cuando el usuario cambia el universo de entrada y ejecuta una nueva consulta:

1. Marcar loading.
2. Reemplazar el dataset base al recibir la respuesta.
3. Reiniciar filtros a sus valores iniciales, salvo que el comportamiento vigente explícitamente requiera conservarlos.
4. Recalcular tarjetas, gráficos y tabla.
5. Evitar mostrar métricas de la consulta anterior durante la carga como si todavía fueran actuales.

---

# PARTE E. PRUEBAS OBLIGATORIAS

## 29. Pruebas unitarias de filtrado

Cubrir al menos:

- un filtro individual;
- varios filtros con AND;
- selección múltiple OR dentro de una dimensión;
- nulos;
- limpiar filtros;
- combinación sin resultados;
- seller con varios contactos;
- conteo de sellers únicos vs contactos;
- exclusión operacional `Excluir`, `Mantener`, `Sin clasificar`;
- filtros que afecten columnas con valores nulos.

## 30. Pruebas del modelo de reportería

Validar:

- agrupación por País;
- agrupación por Geografía;
- agrupación por Segmento;
- agrupación por Estado seller;
- agrupación por Tipo de contacto;
- porcentajes sumando correctamente;
- nulos agrupados como `Sin dato`;
- funnel usando las mismas exclusiones que la tabla;
- elegibles + excluidos conciliando con el universo correspondiente.

## 31. Prueba crítica de red

Agregar una prueba o realizar una validación verificable de este comportamiento:

```text
1. Ejecutar consulta inicial.
2. Registrar número de requests al endpoint de audiencia/preview.
3. Cambiar un filtro.
4. Cambiar otro filtro.
5. Limpiar un filtro.
6. Seleccionar múltiples valores.
7. Confirmar que el número de requests al endpoint NO aumentó.
```

Una nueva llamada se admite solo cuando se ejecuta una nueva búsqueda de universo o cuando se genera la descarga si el flujo de exportación requiere validación backend.

## 32. Pruebas de UI

Cubrir:

- empty state previo a consulta;
- render de gráficos posterior a consulta;
- actualización inmediata de tarjetas;
- actualización inmediata de gráficos;
- actualización inmediata de tabla;
- selector de dimensión del gráfico de composición;
- limpiar filtros;
- cero resultados;
- responsive layout;
- accesibilidad básica de filtros y gráficos.

Para gráficos, proporcionar etiquetas/summary accesible cuando la librería visual no sea suficientemente interpretable por tecnologías de asistencia.

---

# PARTE F. CRITERIOS DE ACEPTACIÓN

## 33. Definition of Done

La modificación se considera terminada solamente si se cumplen todos los puntos:

- [ ] Solo se modificó `Trace > Generación de Audiencias`, salvo dependencias estrictamente necesarias y documentadas.
- [ ] La búsqueda inicial sigue consultando correctamente la fuente de datos.
- [ ] El resultado inicial contiene los campos requeridos para filtrado y reportería local.
- [ ] Después de esa consulta, modificar filtros no genera nuevas consultas a BigQuery.
- [ ] Se eliminó la necesidad funcional de `Actualizar preview con filtros`.
- [ ] Los filtros reaccionan inmediatamente.
- [ ] Los filtros se combinan correctamente.
- [ ] Las tarjetas se actualizan con el estado filtrado según su semántica.
- [ ] Existen gráficos entre las tarjetas y la tabla resumen.
- [ ] Existe gráfico de composición de audiencia.
- [ ] Existe gráfico de impacto de filtros/exclusiones.
- [ ] Existe visualización de elegibles vs excluidos.
- [ ] Los gráficos reaccionan a los filtros sin backend.
- [ ] Gráficos y tabla usan una única lógica de funnel.
- [ ] Sellers y contactos están correctamente diferenciados.
- [ ] Cero resultados no elimina el dataset base.
- [ ] `Limpiar filtros` restaura la audiencia derivada sin nueva consulta.
- [ ] La descarga corresponde a la audiencia filtrada visible.
- [ ] No se modificaron Seguimiento, Historial, Looker, Planner ni otras hojas.
- [ ] No se introdujeron secretos ni PII adicional en logs/storage.
- [ ] Tests existentes continúan pasando.
- [ ] Nuevos tests de filtros/reportes pasan.
- [ ] Build de frontend exitoso.

---

# PARTE G. ORDEN DE EJECUCIÓN PARA COPILOT

## 34. Fase 0: inspección

No escribir código todavía.

Entregar un reporte corto indicando:

- archivos exactos de Generación de Audiencias;
- endpoint llamado actualmente;
- cuándo se vuelve a consultar hoy;
- forma actual de la respuesta;
- dónde se guardan los resultados;
- cómo se calculan tarjetas y tabla;
- librería gráfica disponible;
- archivos que sería necesario modificar.

Detenerse al terminar esta fase.

## 35. Fase 1: desacoplar consulta y filtros

Objetivo:

```text
BigQuery -> dataset base una vez
filtros -> procesamiento local
```

Implementar y probar únicamente esta separación.

No agregar gráficos todavía.

Gate:

- cambiar filtros no produce requests de preview;
- tarjetas y tabla siguen conciliando.

Detenerse al terminar.

## 36. Fase 2: reportería

Agregar los tres componentes visuales utilizando exclusivamente estado derivado del dataset ya cargado.

Gate:

- todos reaccionan a filtros;
- cero consultas adicionales;
- gráficos y tabla concilian.

Detenerse al terminar.

## 37. Fase 3: integración, UX y regresión

Completar:

- empty states;
- limpiar filtros;
- responsive;
- accesibilidad;
- pruebas completas;
- build;
- revisión de alcance.

No modificar ninguna otra hoja para “homogeneizar” estilos.

---

# 38. Instrucción final para GitHub Copilot

Empieza leyendo el código real y ejecutando **solo la Fase 0**.

No programes los gráficos ni cambies los filtros hasta haber identificado con exactitud cómo funciona hoy el preview de Generación de Audiencias.

La prioridad de esta tarea es separar claramente:

```text
CONSULTAR DATOS
```

de

```text
EXPLORAR / FILTRAR / REPORTAR DATOS YA CONSULTADOS
```

La segunda actividad debe ser completamente dinámica en frontend mientras el usuario permanezca trabajando sobre el mismo universo de entrada.
