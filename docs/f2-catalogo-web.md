# F2 · Catálogo web con pedido a WhatsApp (diseño)

> Para el dueño y para Claude/Antigravity al convertirlo en tareas. Borrador del 2026-10-27.
> Requisitos de seguridad obligatorios: `docs/auditoria-seguridad-2026-10.md`, sección F2 (aquí se citan como **[R1]…[R15]**).
> Sirve para todas las marcas: el mismo catálogo toma nombre, colores, logo y número de WhatsApp de la marca activa.

## Idea en una línea

El cliente arma el carrito en una página web y toca **"Pedir por WhatsApp"**. Se abre WhatsApp con un mensaje
ya escrito que trae un código (`VM-7K3Q9`). El bot reconoce el código, carga ese carrito y sigue con el flujo de
siempre: datos del cliente, envío, pago y comprobante. **La web nunca pide ni guarda datos personales [R7].**

```
Catálogo web            Servidor (/api/public)          WhatsApp + bot
─────────────           ──────────────────────          ─────────────────────────────
ver productos   ──GET──▶ catálogo (campos públicos)
armar carrito
"Pedir por WA"  ──POST─▶ recalcula precios, valida
                ◀─────── código VM-7K3Q9 (3 días)
abre wa.me/<número>?text="Hola, quiero confirmar mi pedido VM-7K3Q9"
                                                         cliente envía el mensaje
                                                         bot detecta el código → carga el carrito
                                                         "Recibimos tu pedido web: 2x N04… ¿Es correcto?"
                                                         → datos del cliente → envío → pago (flujo actual)
```

---

## 1. Dónde vive

| Pieza | Dónde | Por qué |
|---|---|---|
| Catálogo (HTML, CSS, JS) | Carpeta nueva `catalogo/` del repo, publicada como **sitio estático aparte** (Render Static Site, gratis, con CDN) en su propio dominio: `tienda.<dominio>` o `<marca>-tienda.onrender.com` | Origen distinto del panel: un fallo en la tienda no puede tocar la sesión del panel [R1]. El CDN absorbe picos de visitas [R12] |
| API pública | Router nuevo `routes/publicRoutes.ts` en el servidor actual, bajo `/api/public/*` | Reutiliza la base y el catálogo; aislado del panel: sin sesión y sin importar controladores del panel [R2] |
| Panel | Igual que hoy, con `X-Robots-Tag: noindex` [R3] | No debe aparecer en buscadores |

Variables por cliente: `CATALOGO_ORIGEN` (URL del catálogo, la única permitida por CORS) en el servidor, y
`API_URL` en el sitio estático.

### Tecnología del catálogo

HTML + CSS + JavaScript sin framework ni CDN de terceros: lo exige la CSP estricta [R11]. Tailwind por CDN (el
del panel) no sirve aquí porque necesita `unsafe-eval`. Con 6 a 40 productos, una página de unos 50 KB carga al
instante en datos móviles. Si más adelante hace falta SEO fuerte (miles de repuestos), se pasa a páginas
pre-generadas sin cambiar la API.

---

## 2. API pública (`/api/public`)

Todas con límite por IP, respuestas genéricas de error [R13] y validación Zod [R9].

| Método y ruta | Qué devuelve / hace | Caché |
|---|---|---|
| `GET /api/public/marca` | `brandName`, colores, logo, `productBrandLogoUrl`, si la búsqueda por vehículo está activa | 10 min |
| `GET /api/public/catalogo` | Categorías y productos activos con **solo**: id público, nombre, descripción, precio en USD, **precio en Bs a la tasa BCV del momento** (más la tasa y su fecha), imágenes (F0-9), categorías, `disponible` (true/false, nunca el stock exacto) y, con F1, atributos y compatibilidad [R4][R5] | 2 min |
| `GET /api/public/vehiculos` | (con F1) marcas → modelos → años que existen en el catálogo | 10 min |
| `POST /api/public/pedidos` | Recibe `{ items: [{ productoId, cantidad }], website: "" }`; devuelve `{ codigo, total, enlaceWhatsApp, expira }` | — |

Lo que **no** existe: ninguna ruta pública que lea un pedido por su código, ni datos de clientes, ni stock exacto [R8].

### `POST /api/public/pedidos` paso a paso

1. Campo trampa `website` lleno → responde 200 con un código falso y no guarda nada (el bot no se entera) [R9].
2. Zod: 1 a 20 líneas; cantidad entera de 1 a 50 por línea; cuerpo de máximo 5 KB [R9].
3. Cada producto se busca en la base: debe existir, estar activo y tener stock si lo controla. El **precio y el
   total salen de la base**; el navegador no manda precios [R6].
4. Se genera el código: prefijo de la marca (`settings.catalogo.prefijoPedido`, p. ej. `VM`) + 5 caracteres al
   azar de un alfabeto sin confusiones (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`): ~28 millones de combinaciones,
   con reintento si ya existe [R8].
5. Se guarda en la colección nueva **`CarritoWeb`** y se devuelve el enlace
   `https://wa.me/<whatsappPhone>?text=<mensaje con el código>` (texto en `settings.messages.webOrderPrefill`).
6. Límite: 5 carritos por IP cada 10 minutos [R9]. Si se supera, 429 con mensaje amable.

### Modelo `CarritoWeb`

```ts
codigo: String (único)        // "VM-7K3Q9"
items: [{ productoId, nombre, precio, cantidad }]   // precios congelados al crear
total: Number
estado: "pendiente" | "vinculado"
telefono: String | null       // WhatsApp que lo reclamó
pedidoId: ObjectId | null     // Pedido creado a partir de él
creadoEn: Date
expiraEn: Date                // índice TTL: se borra solo a los 3 días (72 h) si nadie lo reclama [R10]; configurable en settings.catalogo.vigenciaHoras
```

No guarda IP, nombre, teléfono del navegador ni nada personal.

---

## 3. El bot recibe el código

En `chatFlowService.handleIncomingMessage`, antes del despacho por paso (junto a las demás intercepciones), si
el texto contiene `\b<PREFIJO>-[2-9A-HJKMNP-Z]{5}\b`:

| Caso | Respuesta del bot |
|---|---|
| Código válido, pendiente y sin caducar | Carga los productos en `carrito.items` con la forma de siempre (`{ id, producto, price, cantidad }`), marca el carrito como `vinculado` con ese teléfono y muestra el resumen: "Recibimos tu pedido web VM-7K3Q9: …, total $X. ¿Confirmas?" (botones Sí / Modificar). Con **Sí** pasa a `esperando_datos_cliente` (o a confirmar datos si es cliente conocido), como hoy después del carrito |
| Precio o disponibilidad cambiaron desde que se creó | Usa el precio actual, quita lo agotado y lo dice: "El N04 ahora cuesta $42" / "El N20 se agotó" |
| Código ya usado por **otro** teléfono | "Ese código ya fue usado." + menú. Nunca se cargan los productos (evita que alguien se quede con el carrito de otro) |
| Código ya usado por el **mismo** teléfono | Muestra de nuevo el resumen (el cliente reenvió el mensaje) |
| Código inexistente o caducado | "No encontramos ese pedido o venció (duran 3 días). Puedes armarlo de nuevo en <URL del catálogo> o escribir *Menú*." |
| El cliente tenía otro carrito a medias en el chat | Pregunta: "¿Reemplazo tu carrito actual por el pedido web?" |

El código se busca tal cual en mayúsculas y con o sin guion (`vm 7k3q9` también vale).
Si el bot está en **modo manual**, no carga nada: el asesor ve el código resaltado en el Inbox (punto 4).

---

## 4. Panel

- **Inbox:** si la conversación llegó por un código, etiqueta "🛒 Pedido web VM-7K3Q9" en la cabecera del hilo, con su contenido.
- **Kanban y comanda:** el pedido lleva `origen: "web"` y el código; insignia "WEB" en la tarjeta (como la de anuncios).
- **Ventas:** métrica "Carritos web creados / confirmados por WhatsApp" (conversión del catálogo).
- **Configuración → Catálogo web:** activar/desactivar el catálogo (con `false`, `/api/public/pedidos` responde que no está disponible y el bot ignora los códigos), prefijo del código y texto del mensaje de WhatsApp.
- **Registro de abuso [R14]:** contador de rechazos (límite, campo trampa, validación) por día, visible para el administrador.

---

## 5. Páginas del catálogo

1. **Inicio:** logo y colores de la marca, buscador, categorías. Con F1: selector "¿Para qué vehículo?" (marca → modelo → año) que filtra todo el catálogo y se recuerda en el navegador.
2. **Categoría / resultados:** tarjetas con foto, nombre, **precio en USD y en Bs** (tasa BCV del día, con la fecha de la tasa visible), botón **Agregar**. Los agotados **se muestran** con la etiqueta "Agotado" y el botón desactivado; nunca se ocultan.
3. **Producto:** fotos (F0-9), descripción, atributos, compatibilidad (F1), cantidad.
4. **Carrito:** líneas, cantidades, total y botón **"Pedir por WhatsApp"**. El carrito vive en el navegador (`localStorage`) hasta que se pide.
5. **Confirmación:** "Te abrimos WhatsApp con tu pedido VM-7K3Q9. Si no se abrió, toca aquí." + el código visible para copiarlo.

Accesible en móvil primero (la mayoría llegará desde Instagram o WhatsApp), sin cuentas ni registro.

---

## 6. Tareas propuestas

| Tarea | Contenido | Depende de |
|---|---|---|
| F2-1 | `CarritoWeb`, router `/api/public` (marca, catálogo, pedidos) con límites, Zod, honeypot, CORS a `CATALOGO_ORIGEN` y cabeceras [R2–R9, R11, R13]; suite con precio manipulado, honeypot, límite, producto inactivo/agotado y enumeración | F0 cerrada (imágenes de F0-9) |
| F2-2 | Bot: intercepción del código y los 6 casos de la tabla del punto 3; suite | F2-1 |
| F2-3 | Sitio estático `catalogo/` (5 páginas), CSP estricta, sin dependencias externas | F2-1 |
| F2-4 | Panel: insignias en Inbox/Kanban, métrica de conversión, sección Configuración → Catálogo web, registro de abuso | F2-2 |
| F2-5 | Filtro por vehículo en el catálogo | F1 y F2-3 |
| F2-6 | Prueba de seguridad previa a publicar [R15] y guía en `docs/nuevo-cliente.md` (Render Static Site, dominio, variables) | F2-1 a F2-4 |

---

## 7. Decisiones del dueño (2026-10-27)

| Tema | Decisión |
|---|---|
| Precios | Se muestran **en USD y en Bs**. El Bs se calcula siempre con la tasa BCV **del día** (servicio `bcv.ts`): en el catálogo, en el resumen del bot al cargar el código y al pagar. El carrito web guarda solo USD; nunca se congela un monto en Bs |
| Vigencia del código | **3 días** (72 h) |
| Agotados | **Se muestran** marcados "Agotado" y no se pueden agregar; no se ocultan |
| Dominio | **Pendiente.** Mientras tanto, direcciones `onrender.com` (catálogo y panel ya quedan en orígenes distintos). Con dominio propio se añade Cloudflare delante |
