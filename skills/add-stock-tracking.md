# /add-stock-tracking — Control de inventario con stock atómico

## Objetivo
Añadir campo `stock` al modelo Producto, lógica atómica de decremento al agregar al carrito, y visibilidad en el panel admin. Actualmente el bot vende productos ilimitadamente sin verificar disponibilidad real.

## Archivos a modificar
1. `models/Producto.js` — añadir campo stock
2. `services/chatFlowService.js` — validación atómica al agregar al carrito
3. `controllers/adminController.js` — endpoint de actualización de stock
4. `public/src/features/inventory/components/ProductTab.js` — campo stock en formulario y vista

---

## Paso 1: models/Producto.js

Buscar la línea:
```js
  activo: { type: Boolean, default: true }
```

Reemplazar por:
```js
  activo: { type: Boolean, default: true },
  stock: { type: Number, default: 0 }  // 0 = sin control de stock (venta ilimitada)
```

---

## Paso 2: services/chatFlowService.js

En el método `handleEsperandoCantidad`, buscar donde se hace `carrito.items.push(...)`.

La lógica actual es:
```js
if (!isNaN(cantidad) && cantidad > 0) {
  const prod = carrito.producto_actual;
  if (prod) {
    carrito.items.push({
      producto: prod.name,
      price: prod.price,
      cantidad,
    });
```

Reemplazar por:
```js
if (!isNaN(cantidad) && cantidad > 0) {
  const prod = carrito.producto_actual;
  if (prod) {
    // VERIFICACIÓN DE STOCK ATÓMICA
    if (prod.id) {
      const productInDb = await Producto.findOne({ id: prod.id, activo: true });
      if (productInDb && productInDb.stock > 0) {
        // Verificar que hay suficiente stock
        const alreadyInCart = carrito.items
          .filter(i => i.producto === prod.name)
          .reduce((sum, i) => sum + i.cantidad, 0);
        const totalRequested = alreadyInCart + cantidad;
        
        if (totalRequested > productInDb.stock) {
          const disponible = productInDb.stock - alreadyInCart;
          if (disponible <= 0) {
            await enviarTexto(from, `⚠️ *${prod.name}* está agotado. Por favor elige otro producto.`);
            await chatFlow.mostrarCategorias(from, io);
            return;
          }
          await enviarTexto(from, `⚠️ Solo quedan *${disponible}* unidades de *${prod.name}*. Por favor ajusta la cantidad.`);
          return;
        }
      }
    }

    carrito.items.push({
      producto: prod.name,
      price: prod.price,
      cantidad,
    });
```

---

## Paso 3: controllers/adminController.js

### 3a. Actualizar getProducts para incluir stock

Buscar la función `getProducts`. Asegurarse de que el `.select()` o el objeto devuelto incluya `stock`. Si usa populate, el campo stock ya se incluye automáticamente.

### 3b. Actualizar postProduct y updateProduct para aceptar stock

En `postProduct`, buscar:
```js
const { id, name, price, description, emoji, categoria } = req.body;
```

Reemplazar por:
```js
const { id, name, price, description, emoji, categoria, stock } = req.body;
```

Y en el objeto de creación añadir `stock`:
```js
const newProd = await Producto.create({ 
  id, name, price, description, emoji, categoria, 
  stock: stock !== undefined ? Number(stock) : 0 
});
```

En `updateProduct`, buscar:
```js
const { name, price, description, emoji, categoria, activo } = req.body;
```

Reemplazar por:
```js
const { name, price, description, emoji, categoria, activo, stock } = req.body;
```

Y si `stock !== undefined`, añadir al objeto update:
```js
if (stock !== undefined) updateData.stock = Number(stock);
```

---

## Paso 4: public/src/features/inventory/components/ProductTab.js

### 4a. Añadir stock al estado inicial de formData

Buscar:
```js
const [formData, setFormData] = useState({
    id: "",
    name: "",
    price: "",
    description: "",
    emoji: "🍱",
    categoria: "",
  });
```

Reemplazar por:
```js
const [formData, setFormData] = useState({
    id: "",
    name: "",
    price: "",
    stock: "",
    description: "",
    emoji: "🍱",
    categoria: "",
  });
```

### 4b. Actualizar handleOpenModal para incluir stock

Buscar donde se hace `setFormData({...})` dentro de `handleOpenModal`. Añadir:
```js
stock: product.stock !== undefined ? product.stock : "",
```

### 4c. Añadir campo stock en el formulario del modal

En el modal de creación/edición de producto (el JSX), buscar el campo de `price` y añadir justo después un campo para stock:

```js
// Después del input de price:
e("div", null,
  e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "📦 Stock (0 = ilimitado)"),
  e("input", {
    type: "number",
    min: "0",
    value: formData.stock,
    onChange: (ev) => setFormData({ ...formData, stock: ev.target.value }),
    placeholder: "0 = sin límite de stock",
    className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 text-sm"
  })
)
```

### 4d. Mostrar stock en la tarjeta de producto

En la lista de productos, donde se muestra el nombre y precio, añadir un badge de stock:

```js
product.stock > 0 
  ? e("span", { className: "text-[10px] text-emerald-600 dark:text-emerald-400 font-bold" }, `📦 ${product.stock} en stock`)
  : e("span", { className: "text-[10px] text-gray-400" }, "📦 Stock ilimitado")
```

### 4e. Enviar stock al guardar

En la función que hace `apiClient.post` o `apiClient.put`, asegurarse de incluir `stock` en el body:
```js
stock: formData.stock !== "" ? Number(formData.stock) : 0
```

---

## Verificación

1. Ir al panel admin → Inventario → Productos → Crear/Editar producto
2. Verificar que aparece el campo "Stock"
3. Poner stock=5 en un producto
4. Desde WhatsApp, intentar pedir 6 unidades de ese producto
5. El bot debe responder: "Solo quedan 5 unidades. Ajusta la cantidad."
6. Pedir 3 unidades → debe permitirlo
7. Verificar que productos con stock=0 permiten compra ilimitada

## Notas importantes
- `stock: 0` significa SIN control (venta ilimitada), para no romper productos existentes.
- La verificación es atómica: consulta MongoDB en el momento exacto de agregar al carrito.
- No se decrementa el stock al agregar al carrito (solo se valida). El decremento real ocurriría al confirmar el pedido (futuro improvement).
- Si un producto se agota mientras el cliente está comprando, el bot lo detecta en el handler de cantidad.
