# F1 · Producto ampliado (diseño)

> Para el dueño y para Claude/Antigravity al convertirlo en tareas. Borrador del 2026-10-27.
> Cliente objetivo: tienda de repuestos de vehículos, unos 40 productos al inicio.
> No cambia nada para VentiMax: todos los campos nuevos son opcionales y la búsqueda por vehículo se activa por marca.

## Lo que sabemos del cliente

| Pregunta | Respuesta del dueño | Consecuencia en el diseño |
|---|---|---|
| ¿Cómo pide el cliente? | **Por vehículo** y **por foto** | La compatibilidad es el dato central. La foto llega en F4, pero necesita estos mismos datos para responder |
| ¿Varias marcas o calidades por pieza? | No se sabe aún | Se resuelve con **grupos de equivalencia** opcionales, sin cambiar el carrito |
| ¿Dónde están los datos? | **Excel o Google Sheets** | Importación desde `.xlsx` y `.csv` con vista previa y validación |
| Detalle de compatibilidad | **Marca, modelo, años, motor y versión** | Motor y versión son opcionales por fila: vacío = sirve para todos |

---

## 1. Modelo de datos

### 1.1 Campos nuevos en `Producto` (todos opcionales)

```ts
sku: String                 // código interno de la tienda, único si existe
marcaFabricante: String     // Bosch, NGK, Toyota (original), genérico...
codigosOEM: [String]        // números de parte originales, normalizados en mayúsculas sin espacios ni guiones
atributos: [{ nombre: String, valor: String }]   // "Posición: delantera", "Medida: 5W-30"
grupoEquivalencia: String   // mismo valor = misma pieza en distinta marca/calidad
compatibilidad: [{
  marca: String,            // "Toyota"
  modelo: String,           // "Corolla"
  anioDesde: Number,        // 2009
  anioHasta: Number,        // 2014
  motor: String,            // "1.8" — vacío = cualquier motor
  version: String,          // "GLi" — vacío = cualquier versión
  nota: String              // "solo con ABS"
}]
```

- Se guarda además una forma normalizada de `marca` y `modelo` (minúsculas, sin acentos ni espacios) para buscar sin errores de tipeo ("toyota", "Toyota ", "TOYOTA").
- Índices: `{ sku: 1 }` único y disperso; `{ "compatibilidad.marcaNorm": 1, "compatibilidad.modeloNorm": 1 }`; `{ codigosOEM: 1 }`.
- Con 40 productos la compatibilidad va **dentro del producto**. Si algún cliente llega a miles de piezas por vehículo, se pasa a una colección aparte sin cambiar la interfaz del bot.

### 1.2 Por qué grupos de equivalencia y no variantes

Unas "pastillas Bosch $30" y unas "pastillas genéricas $15" para el mismo carro serían **dos productos** con el mismo `grupoEquivalencia`.

- El carrito, el stock, los pedidos, el Kanban y las comandas no cambian: ya funcionan con productos.
- El bot puede ofrecer "la tenemos en dos calidades" mostrando el grupo.
- Es la base de F4 (equivalencias entre marcas): las equivalencias salen **solo de datos cargados**, nunca inventadas por la IA.
- Si el cliente no maneja calidades, el campo queda vacío y no se ve en ninguna parte.

### 1.3 El vehículo del cliente

En `Etiqueta` (y `EtiquetaIg`) se guarda `vehiculo: { marca, modelo, anio, motor, version }`. El bot pregunta una sola vez y lo reutiliza en la conversación y en compras siguientes ("¿Sigue siendo para tu Corolla 2012?"). Se muestra en la ficha del cliente del Inbox.

---

## 2. Bot de WhatsApp

Se activa con `settings.features.busquedaPorVehiculo: true` en la marca. Con `false` (VentiMax) el flujo actual no cambia.

```
Cliente: "Hola"
Bot:     ¿Para qué vehículo buscas el repuesto?      → lista de marcas que existen en el catálogo
Cliente: Toyota
Bot:     ¿Qué modelo?                                  → lista de modelos de esa marca en el catálogo
Cliente: Corolla
Bot:     ¿De qué año?                                  → texto (se valida contra los rangos cargados)
Cliente: 2012
Bot:     (solo si hay piezas que dependen del motor) ¿Qué motor? 1.6 / 1.8
Bot:     Categorías con repuestos para tu Toyota Corolla 2012 1.8   → solo las que tienen piezas compatibles
         → productos compatibles → (foto, F0-9) → cantidad → flujo actual
```

- Las listas solo muestran marcas y modelos **que existen en el catálogo**: nunca se ofrece algo que no hay.
- WhatsApp permite 10 filas por lista: si hay más marcas o modelos, se muestran las 9 con más productos más "Otra (escríbela)".
- Si el vehículo no tiene piezas cargadas: "No tenemos repuestos registrados para ese vehículo" y se pasa a un asesor (modo manual), guardando la búsqueda para el registro de F3.
- Productos **sin** compatibilidad (aceites, accesorios universales) aparecen para cualquier vehículo, marcados como "universal".
- El texto libre ("pastillas corolla 2012") lo resuelve F3 (búsqueda con IA sobre estos mismos campos). La foto, F4.

---

## 3. Importación desde Excel o Google Sheets

### 3.1 Plantilla (dos hojas)

**Hoja `Productos`** — una fila por producto:

| SKU | Nombre | Categorías | Precio | Stock | Controlar stock | Marca fabricante | Códigos OEM | Grupo equivalencia | Descripción | Activo |
|---|---|---|---|---|---|---|---|---|---|---|
| PF-001 | Pastillas freno delanteras | Frenos | 30 | 12 | sí | Bosch | 04465-02220; 04465-12610 | pastillas-corolla-09-14 | Juego de 4 | sí |

**Hoja `Compatibilidad`** — una fila por vehículo compatible:

| SKU | Marca | Modelo | Año desde | Año hasta | Motor | Versión | Nota |
|---|---|---|---|---|---|---|---|
| PF-001 | Toyota | Corolla | 2009 | 2014 | 1.8 | | |
| PF-001 | Toyota | Corolla | 2009 | 2014 | 1.6 | | |

Varias categorías y varios códigos OEM se separan con `;`. Desde Google Sheets: *Archivo → Descargar → .xlsx*.

### 3.2 Flujo en el panel (Inventario → Importar)

1. Descargar la plantilla vacía o **exportar el catálogo actual** en el mismo formato (así se edita en Excel y se vuelve a subir).
2. Subir el archivo → **vista previa** con lo que va a pasar: productos nuevos, productos que cambian (con el antes y después del precio), filas con error y el motivo (precio vacío, año desde > año hasta, SKU repetido, categoría inexistente).
3. Confirmar. Se aplica por **SKU**: crea o actualiza. **Nunca borra**: los productos que no están en el archivo se listan y el usuario decide si los desactiva.
4. Las categorías nuevas se crean al confirmar. Todo queda en la auditoría.

Requiere una dependencia nueva para leer Excel (`exceljs`, a aprobar). El CSV se lee sin dependencias.

---

## 4. Panel

- Formulario de producto con pestañas: **General** (lo de hoy + SKU, marca fabricante, códigos OEM, atributos), **Compatibilidad** (tabla editable de vehículos) y **Equivalencias** (grupo y los otros productos del grupo).
- Lista de productos con búsqueda por SKU, código OEM y vehículo ("Corolla 2012").
- Ficha del cliente en el Inbox: su vehículo.
- Copiloto de venta manual: al extraer un pedido del chat, también extrae el vehículo.

---

## 5. Tareas propuestas (en orden)

| Tarea | Contenido | Depende de |
|---|---|---|
| F1-1 | Campos nuevos del producto, normalización, índices, mocks y su suite | F0 cerrada |
| F1-2 | Panel: pestañas General/Compatibilidad/Equivalencias y búsqueda | F1-1 |
| F1-3 | Importación y exportación Excel/CSV con vista previa | F1-1 (y aprobar `exceljs`) |
| F1-4 | Vehículo del cliente en `Etiqueta`/`EtiquetaIg`, ficha del Inbox y copiloto | F1-1 |
| F1-5 | Flujo del bot por vehículo con `busquedaPorVehiculo` | F1-1, F1-4 |
| F1-6 | Marca nueva del cliente de repuestos (`config/brand/<marca>/`) y carga real de su Excel | F1-3, datos del cliente |

F1-2, F1-3 y F1-4 se pueden hacer en paralelo una vez aprobada F1-1.

---

## 6. Pendiente de confirmar con el cliente

- [ ] Una muestra de su Excel real (aunque sean 10 filas), para ajustar la plantilla a sus columnas.
- [ ] Si vende en varias calidades o marcas por pieza (decide si se usan los grupos).
- [ ] Si tiene precios distintos para mecánicos o talleres (mayorista). No está en este diseño.
- [ ] Si tiene más de una sede con stock separado. No está en este diseño.
- [ ] Qué marcas de vehículos atiende (para la primera carga y para probar el flujo).
