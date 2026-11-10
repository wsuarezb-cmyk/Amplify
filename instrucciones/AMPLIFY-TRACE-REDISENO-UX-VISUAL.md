# Instrucciones para GitHub Copilot: rediseño visual de Trace

## 1. Objetivo

Realizar una iteración **principalmente visual y de UX** sobre la implementación ya operativa de `Trace` en Amplify.

La lógica funcional existente debe preservarse. No rehacer la arquitectura, no cambiar reglas de negocio, no modificar las consultas a BigQuery y no alterar los contratos API salvo que sea estrictamente necesario para representar correctamente información que el frontend ya recibe.

Los cambios se concentran en:

1. `Trace > Generación de audiencias`:
   - búsqueda;
   - filtros;
   - composición de audiencia;
   - conciliación;
   - reportería visual.
2. Orden de las subtabs de Trace.
3. `Trace > Historial`: reemplazar visualización de JSON por columnas legibles.

---

# 2. Regla crítica: preservar la operación actual

Trace ya está funcional en su parte operativa. Esta tarea **NO es una reimplementación**.

Antes de modificar código:

- inspeccionar la implementación actual;
- identificar componentes reutilizables;
- identificar la librería de gráficos ya utilizada;
- identificar el estado derivado que alimenta filtros, tarjetas, gráficos y tablas;
- ejecutar tests/build existentes como baseline.

Preservar especialmente:

- consulta inicial de audiencia;
- filtros dinámicos posteriores a la consulta;
- lógica AND/OR ya implementada;
- conciliación de sellers/contactos;
- descarga;
- auditoría;
- historial;
- seguimiento de envíos;
- Looker Studio;
- autenticación;
- infraestructura.

No volver al patrón de consultar BigQuery por cada filtro.

---

# 3. Alcance permitido

Modificar únicamente componentes de Trace necesarios para este rediseño.

No modificar:

- Planner;
- Reportería general;
- Glosario;
- navegación lateral global;
- header global;
- IAP/autenticación;
- roles;
- Cloud Run;
- Cloud Build;
- lógica de negocio que no esté directamente relacionada con la representación solicitada.

No introducir un nuevo design system. Reutilizar tipografía, colores, borders, spacing, botones y estados existentes de Amplify.

---

# PARTE A. ORDEN DE LAS SUBTABS DE TRACE

## 4. Nuevo orden

Cambiar el orden visual de las subtabs de Trace a:

1. `Generación de audiencias`
2. `Historial`
3. `Seguimiento de envíos`
4. `Looker Studio`

El cambio de orden no debe alterar rutas, estado o funcionalidad interna salvo lo estrictamente necesario para presentar esa secuencia.

Si cada tab tiene route/query param/ID interno, preservar el identificador estable. No intercambiar contenidos por posición de array de forma que enlaces existentes apunten a otra pantalla.

---

# PARTE B. GENERACIÓN DE AUDIENCIAS > BÚSQUEDA

## 5. Objetivo visual de la búsqueda

La sección `01 Define la búsqueda` debe verse más compacta, equilibrada y fácil de limpiar cuando se pegan cientos o miles de identificadores.

Actualmente el textarea de Seller IDs es considerablemente más alto que el selector `Identificador` y el botón `Consultar base`.

Se desea una composición horizontal visualmente equilibrada.

## 6. Altura y alineación

En desktop, hacer que los tres controles principales tengan una altura visual equivalente:

```text
┌───────────────────┐  ┌────────────────────────────────────────┐  ┌─────────────────┐
│ Identificador     │  │ IDs / valores ingresados               │  │ Consultar base  │
│ Seller ID       v │  │ ...                                    │  │                 │
└───────────────────┘  └────────────────────────────────────────┘  └─────────────────┘
```

Interpretación:

- el textarea/listado no debe ocupar varias veces la altura del selector;
- usar una altura compacta equivalente al bloque de selector/botón;
- el textarea puede seguir admitiendo múltiples líneas mediante scroll interno;
- no expandir automáticamente el textarea según cantidad de IDs;
- mantener accesibilidad y legibilidad.

No hacer el campo tan bajo que oculte completamente que admite múltiples valores. Debe ser evidente que es un input masivo.

En responsive/mobile, permitir que los controles se apilen.

## 7. Acción para vaciar la entrada

Agregar una acción explícita para borrar todos los identificadores de una vez.

Preferencia de UX:

- icono `X` dentro del campo, o
- botón secundario `Vaciar` / `Limpiar entrada` asociado al textarea.

Requisitos:

- visible cuando exista contenido;
- accesible por teclado;
- `aria-label`/label comprensible;
- al hacer clic debe limpiar todo el input;
- debe limpiar las métricas derivadas del input que correspondan antes de una nueva consulta;
- NO debe ejecutar una consulta;
- NO debe limpiar accidentalmente una audiencia ya consultada si la arquitectura actual diferencia input pendiente de dataset cargado. Respetar la semántica existente.

Si actualmente cambiar el contenido invalida el resultado anterior, mantener ese comportamiento de forma explícita y consistente.

---

# PARTE C. FILTROS MÁS COMPACTOS

## 8. Mantener multiselección

Los filtros deben conservar exactamente su capacidad de selección múltiple y su lógica dinámica actual.

No cambiar:

- catálogos;
- reglas;
- nulos;
- lógica AND entre dimensiones;
- lógica OR dentro de una dimensión;
- funcionamiento de `Limpiar filtros`;
- filtrado local sin nuevas consultas.

## 9. Cambiar presentación a dropdowns compactos

La cuadrícula actual ocupa demasiado alto cuando un filtro se abre y muestra checkboxes dentro de una tarjeta grande.

Transformar cada filtro en un control compacto tipo dropdown / multi-select popover.

Ejemplo conceptual:

```text
[ Tipo de contacto      Todos  v ]
[ Tiene venta           Todos  v ]
[ Segmento del seller   Todos  v ]
[ Tiene catálogo        Todos  v ]
...
```

Al abrir:

```text
┌──────────────────────────────┐
│ Estado seller                │
│ □ Sin dato               0   │
│ ☑ Activo               258   │
│ □ Inactivo              26   │
│ □ Riesgo                 0   │
│ □ Nuevo                  0   │
└──────────────────────────────┘
```

El popover/dropdown no debe aumentar permanentemente la altura de la grilla.

## 10. Estado resumido del filtro

Cuando no haya selección específica:

```text
Todos
```

Cuando haya una opción:

```text
Activo
```

o, siguiendo el patrón que mejor encaje con el componente existente:

```text
1 seleccionado
```

Cuando haya varias:

```text
3 seleccionados
```

Evitar strings largos que deformen la grilla.

Mantener los conteos por opción si ya se calculan actualmente.

## 11. Limpiar filtros

Mantener el botón `Limpiar filtros`, ya que el comportamiento actual es deseado.

Puede conservarse en el encabezado `Reglas de inclusión`.

El botón debe seguir limpiando todos los filtros sin nueva consulta backend.

## 12. Densidad de layout

Objetivo: ocupar materialmente menos altura que la versión actual para que los gráficos de composición queden visibles inmediatamente debajo de los filtros.

En desktop, usar una grilla compacta, por ejemplo 3 o 4 controles por fila según el ancho real disponible.

No sacrificar legibilidad solo para comprimir.

---

# PARTE D. COMPOSICIÓN DE LA AUDIENCIA

## 13. Nueva ubicación

Los gráficos de `Composición de la audiencia` deben aparecer **inmediatamente debajo de los filtros**, antes de `Conciliación`.

Nuevo orden dentro de `Generación de audiencias`:

```text
01 Define la búsqueda
        ↓
02 Reglas de inclusión / filtros
        ↓
Composición de la audiencia: 5 gráficos
        ↓
03 Conciliación
   ├─ tarjetas
   ├─ reportería de conciliación
   └─ tabla etapa/regla
```

## 14. Eliminar selector de dimensión

Actualmente `Composición de la audiencia` muestra un único gráfico y un dropdown para elegir dimensión.

Eliminar ese patrón.

No debe ser necesario seleccionar qué dimensión visualizar.

## 15. Mostrar cinco gráficos simultáneos

Mostrar directamente los cinco gráficos de barras:

1. `País`
2. `Geografía`
3. `Segmento del seller`
4. `Estado seller`
5. `Tipo de contacto`

Todos deben estar visibles en la misma sección y reaccionar a los filtros dinámicos actuales.

No ejecutar nuevas consultas para renderizarlos.

## 16. Tipo de gráfico

Mantener gráficos de barras.

Recomendación de layout desktop:

```text
┌──────────────────────────┬──────────────────────────┐
│ País                     │ Geografía                │
│ barras                   │ barras                   │
└──────────────────────────┴──────────────────────────┘
┌──────────────────────────┬──────────────────────────┐
│ Segmento del seller      │ Estado seller            │
│ barras                   │ barras                   │
└──────────────────────────┴──────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ Tipo de contacto                                    │
│ barras                                              │
└─────────────────────────────────────────────────────┘
```

`Tipo de contacto` puede ocupar ancho completo porque contiene más categorías.

Si la implementación existente permite una grilla distinta con mejor responsive, puede adaptarse sin cambiar el requisito de mostrar los cinco simultáneamente.

## 17. Métricas de composición

Mantener la semántica ya implementada para `Sellers únicos elegibles / participación sobre el total filtrado` cuando corresponda.

Para `Tipo de contacto`, revisar la granularidad actual seller-contacto para evitar dobles interpretaciones. Si el gráfico actualmente cuenta sellers únicos por tipo de contacto, preservar esa semántica y etiquetarla claramente.

Todos los gráficos deben:

- ordenar categorías de mayor a menor cuando sea útil;
- mostrar `Sin dato` para nulos según la lógica actual;
- mostrar el valor de cada barra;
- tener tooltip con valor y porcentaje cuando ya exista soporte;
- usar los mismos filtros activos que el resto de la pantalla;
- usar colores consistentes con Amplify.

---

# PARTE E. CONCILIACIÓN > TARJETAS

## 18. Mantener Conciliación después de Composición

La sección `03 Conciliación` debe comenzar después de los cinco gráficos anteriores.

Dentro de Conciliación, el orden será:

1. Tarjetas de conciliación.
2. Reportería de conciliación.
3. Tabla `Etapa / regla`.

## 19. Cambios en las tarjetas

### Eliminar

Quitar la tarjeta:

```text
Sellers con múltiples contactos
```

### Renombrar/corregir concepto

Reemplazar:

```text
Sellers sin canal
```

por:

```text
Sellers sin contacto
```

La definición solicitada es sellers encontrados en la base que no cuentan con un contacto utilizable según la lógica existente de contacto de Trace.

No cambiar silenciosamente la regla de negocio. Primero inspeccionar cómo se calcula hoy `sin canal`. Si el cálculo actual equivale exactamente a seller sin email y sin phone/contacto utilizable, reutilizarlo y cambiar la etiqueta. Si no equivale, documentar la diferencia antes de modificar la lógica.

## 20. Set esperado de tarjetas

Después del cambio, mantener como mínimo:

- Valores recibidos.
- Únicos válidos.
- Encontrados.
- No encontrados.
- Sellers sin contacto.
- Sellers elegibles.
- Contactos finales.

La distribución visual puede adaptarse a 7 tarjetas. No agregar una tarjeta vacía solo para completar la cuadrícula.

## 21. Tarjetas más expresivas

Las tarjetas actuales se perciben visualmente demasiado neutras.

Mejorar jerarquía sin convertirlas en elementos excesivamente coloridos:

- conservar fondo neutro para métricas normales;
- usar acento verde/lima para resultados finales positivos como `Sellers elegibles` y `Contactos finales` si el patrón actual ya existe;
- utilizar estados de advertencia/error solamente cuando corresponda;
- aumentar separación visual entre label y valor;
- mantener números como elemento dominante.

No cambiar el design system global.

---

# PARTE F. NO ENCONTRADOS Y SELLERS SIN CONTACTO

## 22. Copiar no encontrados

Mantener la funcionalidad existente para copiar IDs no encontrados.

La acción puede seguir siendo un botón o acción contextual claramente asociada a `No encontrados`.

## 23. Copiar sellers sin contacto

Agregar comportamiento equivalente para sellers sin contacto:

```text
Copiar sin contacto
```

Requisitos:

- copiar los Seller IDs afectados;
- copiar cada ID una sola vez;
- usar el mismo formato del botón `Copiar no encontrados`;
- mostrar feedback de éxito consistente con la aplicación;
- deshabilitar/ocultar la acción si el conteo es 0;
- no ejecutar backend adicional para obtener la lista si esa información ya está en el dataset cargado.

## 24. Alerta roja del 20%

Aplicar estado visual rojo a las tarjetas:

- `No encontrados`;
- `Sellers sin contacto`;

cuando cada una alcance o supere el 20% de los sellers ingresados en la búsqueda.

Denominador:

```text
Seller IDs únicos válidos ingresados en la búsqueda
```

No usar `Valores recibidos` si incluye duplicados. No usar `Encontrados` como denominador.

Regla conceptual:

```text
noEncontrados / unicosValidos >= 0.20
```

```text
sellersSinContacto / unicosValidos >= 0.20
```

Cuando se alcance el umbral:

- borde y/o fondo rojo suave;
- label/indicador de alerta rojo;
- mantener contraste accesible;
- no usar solo color para comunicar el problema;
- incluir texto o icono como `Alerta ≥20%`.

Cuando sea inferior a 20%, conservar estilo normal.

Si `unicosValidos = 0`, no calcular porcentaje y no mostrar falsa alerta.

---

# PARTE G. REPORTERÍA DENTRO DE CONCILIACIÓN

## 25. Ubicación

Los siguientes gráficos siguen perteneciendo a `Conciliación` y deben ir después de las tarjetas:

1. `Impacto de filtros y exclusiones`.
2. `Elegibles vs excluidos`.

Después de ambos queda la tabla `Etapa / regla`.

---

# PARTE H. IMPACTO DE FILTROS Y EXCLUSIONES COMO EMBUDO

## 26. Cambiar tipo de visualización

Reemplazar el gráfico de barras actual de `Impacto de filtros y exclusiones` por un **gráfico tipo embudo (funnel)**.

Objetivo: visualizar claramente la reducción secuencial desde el universo ingresado hasta los sellers elegibles.

## 27. Etapas del embudo

El funnel debe usar el mismo cálculo que la tabla `Etapa / regla` y representar, en orden, las etapas que efectivamente aplicaron.

Debe comenzar por el universo de búsqueda y representar, según corresponda:

```text
Únicos válidos ingresados
        ↓
Encontrados en base
        ↓
Después de regla/filtro 1
        ↓
Después de regla/filtro 2
        ↓
...
        ↓
Sellers elegibles
```

No inventar etapas sin reducción real.

`No encontrados` debe reflejarse como la reducción entre `Únicos válidos ingresados` y `Encontrados en base`.

Cada filtro/regla que reduzca sellers debe generar un paso del funnel con:

- nombre de etapa;
- sellers restantes;
- reducción absoluta desde la etapa anterior;
- porcentaje restante sobre los únicos válidos iniciales;
- opcionalmente reducción porcentual de esa etapa en tooltip.

## 28. Caso sin filtros aplicados

Si no hay filtros/reglas que reduzcan la audiencia y todos los sellers válidos fueron encontrados, el gráfico puede visualizarse como un único bloque/rectángulo con el total.

Si no hay filtros pero existen `No encontrados`, deben existir al menos:

```text
Únicos válidos
    ↓
Encontrados
```

porque sí hubo reducción.

No forzar una forma de embudo falsa cuando los valores sean iguales.

## 29. Fuente única de verdad

Funnel y tabla deben derivarse del mismo objeto/selector de conciliación.

No recalcular las reglas independientemente en el componente visual.

---

# PARTE I. ELEGIBLES VS EXCLUIDOS COMO MEDIO CÍRCULO

## 30. Nuevo diseño

Reemplazar la barra horizontal 100% de `Elegibles vs excluidos` por un indicador de **medio círculo / semicircular gauge**.

No debe presentarse como velocímetro con significado de rendimiento. Es una visualización de proporción del universo inicial.

## 31. Denominador

Para esta visualización:

```text
100% = Seller IDs únicos válidos ingresados en la búsqueda
```

Este criterio cambia con respecto a la visual actual, que usa sellers encontrados como denominador.

## 32. Numerador coloreado

La parte coloreada del medio círculo representa los sellers que **llegan al estado final elegible** después de:

- no encontrados;
- sellers sin contacto si forman parte de exclusión efectiva;
- filtros aplicados;
- reglas de exclusión.

Fórmula conceptual:

```text
porcentajeElegible = sellersElegibles / unicosValidos * 100
```

El resto hasta 100% queda en un color neutro/suave y representa la reducción total del universo inicial.

Ejemplo conceptual:

```text
286 únicos válidos = 100%
258 elegibles       = 90.2%
```

Entonces el semicírculo colorea aproximadamente 90.2% del arco.

## 33. Texto del gauge

En el centro/interior mostrar preferentemente:

```text
258
90.2%
Sellers elegibles
```

Debajo o en tooltip, permitir desglose del resto:

- no encontrados;
- sin contacto;
- excluidos por filtros/reglas.

No sumar categorías superpuestas. El desglose debe seguir la lógica secuencial del funnel.

Si `unicosValidos = 0`, mostrar empty state en vez de división por cero.

---

# PARTE J. TABLA ETAPA / REGLA

## 34. Mantener tabla

La tabla existente `Etapa / regla` debe mantenerse debajo de los dos gráficos de conciliación.

No cambiar la lógica existente salvo lo necesario para mantener consistencia con:

- `Sellers sin contacto`;
- funnel;
- denominador del nuevo gauge.

Los números del funnel, tarjetas y tabla deben conciliar exactamente.

---

# PARTE K. HISTORIAL

## 35. Problema actual

En la subtab `Historial`, los datos provenientes de campos JSON no son comprensibles para el usuario final cuando se muestran como JSON crudo.

No mostrar objetos JSON completos en una celda como experiencia principal.

## 36. Reemplazar JSON por columnas legibles

Inspeccionar la estructura real de los JSON almacenados en el historial y convertir las propiedades útiles en columnas humanas.

No inventar propiedades: derivar las columnas de las claves realmente existentes.

Ejemplo conceptual únicamente:

```text
Fecha | Usuario | Template | Sellers iniciales | Sellers finales | País | Segmento | Estado seller | Seller delist | Exclusión operacional | ...
```

Si el JSON contiene filtros multiselección, mostrarlos como texto legible, por ejemplo:

```text
Chile, Perú
```

o chips si ya existe un componente reutilizable y no aumenta excesivamente la altura de la tabla.

## 37. Valores vacíos

Cuando una propiedad no exista, sea `null`, array vacío o string vacío, mostrar:

```text
-
```

No mostrar:

```text
null
{}
[]
undefined
```

## 38. Evitar una tabla inmanejable

Antes de convertir cada key del JSON en columna, identificar cuáles son funcionalmente útiles.

Prioridad:

1. metadata principal de la audiencia;
2. filtros utilizados;
3. conteos de inicio/final;
4. template;
5. usuario/fecha;
6. advertencias/exclusiones resumidas.

Si existen demasiadas propiedades secundarias, usar una columna `Detalle` expandible o modal reutilizando patrones existentes, pero nunca volver a JSON crudo como vista principal.

Mantener la información completa disponible si actualmente es necesaria para auditoría.

---

# PARTE L. RESPONSIVE Y ACCESIBILIDAD

## 39. Responsive

En desktop:

- búsqueda en una fila equilibrada;
- filtros en grilla compacta;
- composición en grilla de gráficos;
- conciliación con layout amplio.

En viewport estrecho:

- inputs de búsqueda apilados;
- filtros en 1 o 2 columnas;
- gráficos apilados;
- evitar scroll horizontal de toda la página;
- las tablas pueden usar su mecanismo responsive actual.

## 40. Accesibilidad

Todos los nuevos elementos deben incluir:

- labels claros;
- navegación por teclado en dropdown multiselect;
- estados focus visibles;
- acciones X/Vaciar con nombre accesible;
- gráficos acompañados por labels/valores suficientes;
- alertas del 20% no comunicadas solo mediante color;
- contraste suficiente.

---

# PARTE M. PRUEBAS

## 41. Búsqueda

Validar:

- textarea compacto;
- scroll interno con muchos IDs;
- `Vaciar` limpia todos los valores;
- vaciar no genera query;
- consultar continúa funcionando igual;
- comportamiento responsive.

## 42. Filtros

Validar:

- todos continúan siendo multiselección;
- dropdown/popover abre y cierra correctamente;
- selección múltiple conserva lógica actual;
- `Limpiar filtros` conserva funcionamiento;
- ningún cambio de filtro consulta BigQuery;
- los conteos por opción continúan correctos.

## 43. Composición

Validar render simultáneo de:

- País;
- Geografía;
- Segmento del seller;
- Estado seller;
- Tipo de contacto.

Validar que los cinco se actualicen al cambiar filtros.

## 44. Conciliación

Validar:

- `Sellers con múltiples contactos` ya no aparece como tarjeta;
- `Sellers sin contacto` aparece y usa definición consistente;
- se pueden copiar no encontrados;
- se pueden copiar sellers sin contacto;
- no hay IDs duplicados en lo copiado;
- tarjetas activan alerta en `>=20%`;
- tarjetas no activan alerta en `<20%`;
- denominador = únicos válidos;
- 0 únicos válidos no produce `NaN`/`Infinity`.

## 45. Funnel

Casos mínimos:

1. Todos encontrados, sin filtros:
   - un único bloque si no hay reducción.
2. Algunos no encontrados, sin filtros:
   - `Únicos válidos` → `Encontrados`.
3. Con un filtro:
   - agregar la etapa de reducción.
4. Con varios filtros:
   - mostrar reducción secuencial.
5. Filtro sin impacto:
   - no crear una falsa etapa de reducción, salvo que la tabla existente requiera mostrarla por auditoría. En ese caso puede aparecer en tabla, pero no necesita ensanchar visualmente el funnel.

## 46. Gauge semicircular

Validar:

- denominador = únicos válidos;
- numerador = sellers elegibles;
- 100% cuando todos quedan elegibles;
- 0% cuando ninguno queda elegible;
- valor intermedio correcto;
- empty state con denominador 0.

## 47. Historial

Validar:

- JSON ya no aparece crudo en la tabla principal;
- claves útiles se transforman en columnas;
- arrays aparecen legibles;
- vacíos aparecen `-`;
- no se pierde información necesaria para auditoría.

## 48. Regresión

Ejecutar:

- tests frontend existentes;
- tests backend solo si se modifica backend;
- lint/type-check si existen;
- build completo del frontend.

Verificar que continúan funcionando:

- generación de audiencias;
- filtros locales;
- descarga;
- historial;
- seguimiento de envíos;
- Looker Studio.

---

# PARTE N. DEFINITION OF DONE

## 49. Criterios de aceptación

- [ ] Las subtabs aparecen en el orden: Generación de audiencias, Historial, Seguimiento de envíos, Looker Studio.
- [ ] La lógica/rutas internas de las tabs no se rompen con el cambio de orden.
- [ ] El ingreso masivo de IDs tiene altura compacta y alineada visualmente con Identificador y Consultar base.
- [ ] Existe acción para vaciar todos los IDs de una vez.
- [ ] Los filtros continúan siendo multiselección.
- [ ] Los filtros se muestran como dropdowns/popovers compactos.
- [ ] `Limpiar filtros` permanece disponible y funcional.
- [ ] Los filtros siguen siendo locales/dinámicos y no generan nuevas queries.
- [ ] Los cinco gráficos de composición aparecen simultáneamente debajo de filtros.
- [ ] Ya no existe selector de dimensión para Composición.
- [ ] El orden de la página es búsqueda → filtros → composición → conciliación.
- [ ] `Sellers con múltiples contactos` se eliminó de las tarjetas.
- [ ] `Sellers sin canal` fue reemplazado por `Sellers sin contacto` con definición validada.
- [ ] Se pueden copiar sellers no encontrados.
- [ ] Se pueden copiar sellers sin contacto.
- [ ] `No encontrados` se marca como alerta cuando representa >=20% de únicos válidos.
- [ ] `Sellers sin contacto` se marca como alerta cuando representa >=20% de únicos válidos.
- [ ] `Impacto de filtros y exclusiones` es un funnel secuencial.
- [ ] El funnel incluye la pérdida por no encontrados.
- [ ] Sin reducciones, el funnel puede verse como un único bloque.
- [ ] `Elegibles vs excluidos` se presenta como medio círculo.
- [ ] El gauge toma únicos válidos ingresados como 100%.
- [ ] La parte coloreada del gauge representa sellers elegibles finales.
- [ ] Funnel, gauge, tarjetas y tabla concilian.
- [ ] Historial no presenta JSON crudo como vista principal.
- [ ] Historial presenta información JSON mediante columnas legibles.
- [ ] Valores faltantes en Historial aparecen como `-`.
- [ ] No se modificó funcionalidad fuera de Trace.
- [ ] Tests/build pasan.

---

# PARTE O. EJECUCIÓN POR FASES PARA GITHUB COPILOT

## 50. Fase 0: inspección visual y técnica

No escribir código todavía.

Identificar:

- archivo/componente de tabs de Trace;
- componente de búsqueda;
- componente textarea;
- componentes de filtros;
- librería/componente de dropdown multiselect disponible;
- componentes de los gráficos actuales;
- estado/selectores que alimentan composición y conciliación;
- componente de tarjetas;
- cálculo actual de `Sellers sin canal`;
- lista actual de no encontrados;
- componente/tabla de Historial;
- campos JSON reales y sus claves;
- archivos exactos que habría que modificar.

Entregar reporte y DETENERSE.

## 51. Fase 1: búsqueda, tabs y filtros compactos

Implementar únicamente:

- nuevo orden de tabs;
- input masivo compacto;
- acción Vaciar/X;
- filtros dropdown multiselect;
- conservar Limpiar filtros.

Ejecutar pruebas relacionadas y detenerse.

## 52. Fase 2: composición de audiencia

Implementar únicamente:

- mover composición debajo de filtros;
- retirar selector de dimensión;
- mostrar cinco gráficos simultáneos;
- responsive de los gráficos.

Ejecutar pruebas y detenerse.

## 53. Fase 3: tarjetas y alertas

Implementar:

- quitar múltiples contactos;
- sellers sin contacto;
- copiar sellers sin contacto;
- alertas >=20%;
- mejora visual de tarjetas.

Validar conciliación y detenerse.

## 54. Fase 4: reportería de conciliación

Implementar:

- funnel de impacto;
- gauge semicircular;
- denominadores definidos;
- conciliación con tabla.

Ejecutar pruebas y detenerse.

## 55. Fase 5: Historial

Implementar:

- extracción/presentación de JSON como columnas;
- `-` para vacíos;
- detalle legible si hay demasiadas propiedades.

No cambiar persistencia ni esquema de auditoría salvo que sea estrictamente necesario, lo cual debe justificarse antes.

Ejecutar pruebas y detenerse.

## 56. Fase 6: integración y regresión

Ejecutar pruebas completas, responsive, accesibilidad y build.

Verificar que el cambio fue principalmente visual/UX y que la lógica operativa ya validada continúa funcionando.

---

# 57. Instrucción final para GitHub Copilot

Empieza únicamente por la **Fase 0**.

Esta tarea parte de una Trace ya operacional. La prioridad es mejorar claridad visual, densidad de información y lectura del funnel sin romper la lógica existente.

No reescribas módulos que ya funcionan para conseguir cambios puramente visuales. Reutiliza los estados, selectores, componentes y librerías existentes siempre que sea posible.
