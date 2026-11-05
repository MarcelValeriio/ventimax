# F1-5 · 4a · Investigación del bot por vehículo (`busquedaPorVehiculo`)

Estado: investigación (sin cambios de código). Todas las líneas se verificaron con `grep -n` / `sed -n` el 2026-11-04.
Fuentes: `docs/plan-haiku-f1.md` (Paso 4), `docs/f1-producto-ampliado.md` §2.

## 0. Hallazgo previo: "features/whatsapp/**" no contiene el bot

- `public/src/features/whatsapp/` y `public/src/features/instagram/` son **solo la consola del panel** (`WhatsAppConsole.js`, `InstagramConsole.js`, componentes de UI). No hay lógica de bot en esas carpetas.
- El bot de WhatsApp vive en el backend: `services/chatFlowService.ts` (3123 líneas), `controllers/chatFlowController.ts`, `services/orderService.ts`, `services/whatsapp.ts`, `controllers/webhookController.ts`.
- Por eso el Paso 4 dice "este paso toca `features/whatsapp/**`", pero el flujo que hay que tocar **no** está ahí. La regla 7 (`AGENTS.md:43`) protege la consola del panel, no el bot. **Pendiente de confirmar por Claude.** Si se acepta, la lista (c) de la sección 6 queda vacía.

## 1. Cómo se activa hoy el menú de categorías

Dos entradas al menú de categorías, según el mensaje del cliente:

| Entrada | Dónde | Efecto |
|---|---|---|
| "Hola" / inicio | `services/chatFlowService.ts:1054` `handleInicio` | Envía saludo (`_sendYGuardar`) y luego el **menú de FAQ** (`enviarMenuFaq`, `:1035`). Fija `paso: "en_faq"` (`:1075`). **No** muestra categorías. |
| "Hacer pedido" / "pedir" / "comprar"… | `services/chatFlowService.ts:1245` (`esHacerPedido`) dentro de `handleEnFaq` (`:1197`) | `setEstado({paso:"esperando_seleccion"})` (`:1259`) y `chatFlow.mostrarCategorias(from, io)` (`:1260`). |
| Pedir en fin de semana | `services/chatFlowService.ts:1078-1161` (`handleFinDeSemanaOpciones`) | `mostrarCategorias` en `:1161`. |
| Pedir desde FAQ con número "1" / "pedir" (en `_processBatch`) | `services/chatFlowService.ts:743-781` | `setEstado` + `mostrarCategorias` en `:780-781`. |
| "Menú", "productos", "vaciar…" en otros pasos | `:1352`, `:1393`, `:1440`, `:1482`, `:1523`, `:1565` | Re-listan categorías. |

**Quién envía la lista de categorías:**
- `controllers/chatFlowController.ts:200-256` `mostrarCategorias(to, io, padreId=null)`:
  - Consulta `Categoria.find({padre, slug != "general"})` (`:206`).
  - Arma una sola sección (`:219-227`): `rows: categorias.slice(0, 10)` (`:222`), `id: "category_<slug>"` (`:223`), `title` de 24 caracteres (`:224`), `description: "Explorar <nombre>"` (`:225`).
  - Envía tipo `"lista"` con `buttonText: "Ver Opciones 📂"` (`:241`) vía `enviarYRegistrar`.
- `controllers/chatFlowController.ts:261-330` `mostrarProductos`: mismo patrón. Filtro en `:270-279`, `Producto.find(...).limit(10)` en `:284`, filas `products.slice(0, 10)` en `:316`, título `sanitizeTitle(p.name)` en `:318`.

**IDs de botón/lista y dónde se procesan la respuesta:**
- El webhook normaliza la respuesta: `controllers/webhookController.ts:119-126`. `list_reply` → `text = list_reply.id` e `interactiveTitle = list_reply.title`. `tipo` queda `"interactive"`.
- `services/chatFlowService.ts:192` `handleIncomingMessage` → cola/debounce → `_processBatch` (`:451`).
- Prioridad de los toques interactivos en `_processBatch`: `interactiveItem` (`:615`), `categoryItem` que fuerza `paso = "esperando_seleccion"` (`:616-620`).
- Prefijos reconocidos: `category_`, `cat_` (`:616-617`, `:1303`), `product_`, `prod_`, `faq_`, `pago_`, `metodo_`, `btn_`, `datos_correctos`, `cambiar_`, `confirmar_`, `efectivo_` (`esPayloadInteractivo`, `:668-680`; `haySeleccionEnLote`, `:705-720`).
- Despacho por paso: `const handler = this.handlers[paso]` (`:878`); contexto `{from, tipo, text, interactiveTitle, mediaId, io, location, estado, low, cleanText, …}` (`:879-892`); mapa de handlers en el constructor (`:160-186`).
- `handleEsperandoSeleccion` (`:1302-1396`): toma el slug de `low.replace("category_","")` (`:1303-1305`), busca `Categoria.findOne({slug})` (`:1305`), si tiene subcategorías vuelve a `mostrarCategorias(…, catDoc._id)` (`:1352`), si no, consulta productos en `:1323` y llama `chatFlow.mostrarProductos(from, io, null, catDoc._id)`.
- `handleEsperandoProducto` (`:1398`): busca producto por texto/id (`:1399`).

## 2. Estado de la conversación y modo manual

**Modelo:** `models/Etiqueta.ts` (un documento por teléfono, `telefono` único en `:5`).
- `paso` String, default `"inicio"` (`:10`).
- `modo` enum `automatico|manual`, default `automatico` (`:11`).
- `carrito` Object (`:12`): `items`, `producto_actual`, `nombre`, `cedula`, `direccion`, `ubicacion`, `pago`, `pedido`, `envio`.
- `bloqueado` (`:18`), `stuck`, `reintentosFallidos`, `unreadCount`, `etiqueta`, `canal` (`:7`).
- `vehiculo` (F1-4): subesquema en `:28-55`, hook `pre("validate")` en `:47-50` calcula `marcaNorm`/`modeloNorm`.

**Acceso:** `services/orderService.ts`:
- `getEstado(tel)` `:134` (crea el documento con `paso:"inicio"` si no existe; devuelve el documento completo, incluido `vehiculo`).
- `getModo` `:163`, `setModo(tel, modo, io)` `:168` (emite `modo_actualizado`).
- `setEstado(tel, update, io)` `:176`: `findOneAndUpdate` con `upsert` y emite `estado_actualizado` con `getPasoLabel(paso)`.

**Modo manual:**
- Se pasa a manual en: `services/chatFlowService.ts:555` (pedido de asesor: `hablar_asesor`, "asesor", "humano", "agente"), `:944`, `:2497`.
- Gating: `_processBatch` calcula `esModoManual` en `:470` y `estaEnManosHumanas` (pedido activo, `:459-468`), y sale sin responder en `:508-519`.
- Un pedido activo (no entregado/cancelado) también corta el bot. El vehículo no cambia esto.

**Vehículo ya guardado:** la lectura de `Etiqueta.vehiculo` ya existe por el `estado` que recibe cada handler. **`services/chatFlowService.ts` hoy no referencia `vehiculo`** (grep vacío). `services/instagramFlowService.ts` tampoco.

## 3. Envío de listas de WhatsApp (helper y límites)

Helper existente: `services/whatsapp.ts:135-200` `enviarLista(to, text, buttonText, sections, headerText, footerText, phoneId)`.

Límites que ya aplica (verificados):
- Botón: 20 caracteres (`:143`).
- Filas: **10 en total** entre todas las secciones. El corte es **silencioso** (`:149` `.filter(() => totalRows < 10)`). El llamador debe armar máximo 10 (9 + "Otra (escríbela)").
- Título de fila: 24 (`:154`). Descripción de fila: 72 (`:157`).
- Título de sección: 24 (`:163`). Si no hay filas, aborta y devuelve `false` (`:169-172`).
- Cuerpo: 1024 (`:175`). Header: 60 (`:183`). Footer: 60 (`:186`).
- En modo test (`NODE_ENV=test`) solo registra un mock (`:136-140`).

Puente de envío: `controllers/chatFlowController.ts:90` `enviarYRegistrar` → para `tipo: "lista"` llama `whatsappService.enviarLista` en `:116-123` (pasa `headerText` y `footerText`, no `phoneId`). Luego registra el mensaje.

Ejemplo de lista con un solo paso (para copiar el patrón): `services/chatFlowService.ts:1789-1811` `pedirEmpresaEnvio`. Sus IDs son `empresa_<i>`.

**Trampa existente:** `handleEsperandoEmpresaEnvio` (`:1814`) y `handleEsperandoMetodoEnvio` (`:1973`) desestructuran `listReplyId`, pero el contexto de `_processBatch` (`:879-892`) **no lo envía**. Ese valor siempre es `undefined`. Esas listas funcionan solo porque `text` trae el id (`empresa_0`). En 4b usar `text`, no `listReplyId`.

## 4. Vehículo del cliente y flags de configuración

**Vehículo (F1-4):**
- `services/vehiculoCliente.ts`: `LIMITES_VEHICULO` `:33`, `validarVehiculo(datos)` `:46` → `{ok, valor, errores}`, `describirVehiculo(v)` `:116`.
- Lectura del bot: `estado.vehiculo` (llega por `orderService.getEstado`, `:134`, y por el `estado` del contexto `:879-892`).
- Escritura: `orderService.setEstado(from, { vehiculo: {...} })` (sin cambios de código: el campo ya está en el esquema).
- Mock: `services/dbLocal.ts` / `services/dbMock.ts` ya persisten `vehiculo` (F1-4).

**Flags `settings.features.*`:**
- Valor: `config/brand/ventimax/settings.json:30-34` (`showBcvRate`, `allowManualStepOverride`, `sendProductImage`). Default de la plantilla en `config/brand/default/settings.json:16-20` (no tocar).
- Lectura: `configManager.get("settings.features.<clave>")` (`services/configManager.ts:164-166`, ruta punteada). Ejemplo real: `services/chatFlowService.ts:1894` (`sendProductImage === false`).
- Carga: al arrancar, desde JSON (`services/configManager.ts:11`, `loadAll` `:15`). Cambiar la bandera exige reinicio.
- **Validación: ninguna.** `services/configValidators.ts` y `services/configManager.ts` no mencionan `features` (grep vacío). `validateSchema` (`configManager.ts:43-60`) solo exige claves básicas. Para `busquedaPorVehiculo` hay que añadir el validador (patrón de `mapa`: `configManager.ts:152-162`, `configValidators.ts:726-737`).
- Los flags no son editables desde el panel: van en el JSON de la marca.

## 5. Instagram / Messenger

**No comparten el flujo.** Confirmado:
- `tipo: "lista"` solo aparece en `services/chatFlowService.ts` y `controllers/chatFlowController.ts`. Ningún archivo de IG/Messenger lo usa.
- `services/instagramFlowService.ts` solo responde FAQ (`getMenuDinamico`, texto) y redirige a WhatsApp (encabezado `:4`, `getWhatsAppPhoneNumber` `:216`).
- `services/inbox/adapters/instagramAdapter.ts:392-395` solo arma `menuTexto` (texto con `getMenuDinamico`).
- `services/messenger.ts`: sin listas.

Por tanto F1-5 no toca canales IG/Messenger. Solo WhatsApp.

## 6. Lista propuesta para 4b

### (a) Archivos nuevos
- `services/busquedaVehiculo.ts`: consultas (marcas por cantidad de productos, modelos por marca, años, motores solo si hay piezas que lo exigen, categorías y productos compatibles, universales = `compatibilidad` vacío). Consulta `Producto` con `compatibilidad.marcaNorm` / `modeloNorm` (índice en `models/Producto.ts:92`). Usar `dbLocal` en test.
- `scripts/test-bot-vehiculo.ts`: suite nueva (añadir a `SUITES` de `scripts/ci.sh`).
- Opcional según el plan: modelo de "búsqueda sin resultado" (`models/BusquedaSinResultado.ts`) más getter en `services/dbLocal.ts`/`dbMock.ts`. Alternativa: usar `Setting`. **Decisión de Claude.**

### (b) Fuera de `features/whatsapp|instagram`
1. `config/brand/ventimax/settings.json` (bloque `features`, `:30-34`): añadir `"busquedaPorVehiculo": false`. Textos nuevos en `messages` (`:100`), nunca en código.
2. `services/configValidators.ts` (nueva función `validarFeatures`, junto a `validarConfigMapa` `:737`) y `services/configManager.ts` `validateSchema` (`:152-162` como patrón): validar que los flags son booleanos.
3. `services/chatFlowService.ts`:
   - Constructor `:161-186`: añadir handlers de los pasos nuevos (p. ej. `vehiculo_marca`, `vehiculo_modelo`, `vehiculo_anio`, `vehiculo_motor`).
   - `esPayloadInteractivo` `:668-680` y `haySeleccionEnLote` `:705-720`: añadir el prefijo nuevo (p. ej. `veh_`) para que no se trate como texto de FAQ.
   - Filtro de productos compatibles en `handleEsperandoSeleccion` `:1323-1330` (`$and` de la consulta) cuando el flag está activo y `estado.vehiculo` existe.
   - Entrada "Hacer pedido": `:1259-1260` y `:780-781`, o un solo punto de entrada (ver 3.4).
4. `controllers/chatFlowController.ts`:
   - Punto de entrada único recomendado: al inicio de `mostrarCategorias` (`:200-203`), si `padreId` es null y el flag está activo, delegar a `busquedaVehiculo` (marca) y salir. Con el flag en `false` la función es idéntica. Con esto se cubren todas las entradas de la sección 1 sin tocar cada `if`.
   - `mostrarProductos` (`:261-284`): aceptar `vehiculo` opcional y añadir el filtro de compatibilidad a `conditions` (`:270-279`). Con `vehiculo` ausente, sin cambios.
5. `utils/pasoEmbudo.js` `PASO_LABELS` (`:7-37`): faltan etiquetas de pasos ya existentes (`en_faq`, `esperando_metodo_envio`, `esperando_empresa_envio`, `esperando_notas`, `esperando_confirmacion_web`, `esperando_reemplazo_web`) y habrá que añadir las nuevas. Hoy `getPasoLabel` devuelve la clave cruda.
6. `scripts/ci.sh`: añadir la suite a `SUITES`.

### (c) Dentro de `features/whatsapp/**`
- **Ninguna línea necesaria** para el bot (ver sección 0). La consola del panel no cambia.
- Si Claude quiere mostrar el vehículo en la consola de WhatsApp, eso es otra tarea y pide autorización de líneas.

## 7. Riesgos para las suites de regresión

| Suite (esperado) | Qué la toca | Riesgo | Mitigación |
|---|---|---|---|
| `test-whatsapp-edge-cases.js` (30/0) | Usa `chatFlowService` y `orderService` directamente. `:593` espera `paso === "esperando_seleccion"` tras "Pedir Lunes". Hay otras suites que llaman `mostrarCategorias`: `test-flujo-no-laborable.ts`, `test-resilience.js`. | Alto si el guard de `mostrarCategorias` no está protegido por el flag. | Flag `false` por defecto en `config/brand/ventimax/settings.json`; guard con `=== true` estricto; prueba con flag en `false` antes y después. |
| `test-inbox-service.js` (364/0) | Lee `Etiqueta`, `paso` y `vehiculo` (F1-4). `scripts/test-inbox-service.js` menciona handlers/paso. | Medio: nuevos pasos o etiquetas pueden cambiar salidas del inbox. | No cambiar `getPasoLabel` para pasos existentes; solo añadir claves. |
| `simulate-ig-webhook.js` (37/0) | IG no usa el flujo. Riesgo solo si se cambia `enviarLista` o `enviarYRegistrar` compartido. | Bajo. | No tocar `services/whatsapp.ts`. Ya hubo un `socket hang up` intermitente en IG (ver entrega F1-3). |
| `simulate-messenger-webhook.js` (54/0) | Igual que IG. | Bajo. | Igual. |
| `test-dynamic-menu.ts`, `test-multicategoria.ts` (ci) | Menú FAQ y categorías. | Medio si cambia `mostrarCategorias` o `enviarMenuFaq`. | Solo guard con flag; no cambiar `construirMenuFaq`. |

Riesgos de diseño que no son de tests:
- **"Hola" no muestra categorías** (`handleInicio`, `:1054-1076`). El diseño (`f1-producto-ampliado.md` §2) empieza por "Hola → ¿Para qué vehículo?". Hay que decidir: ¿la marca aparece al pulsar "Hacer pedido" o reemplaza el saludo? **Decisión de Claude.**
- **Límite de 10 filas silencioso** (`whatsapp.ts:149`): el "Otra (escríbela)" debe contarse en el llamador.
- **Mensajes en código** (regla 5, pre-existentes en la ruta a tocar): `controllers/chatFlowController.ts:221` ("Variedades Disponibles"), `:225` ("Explorar"), `:230` (emoji `🥢` por defecto), `:241` ("Ver Opciones 📂"), `services/chatFlowService.ts:1030` (texto del menú FAQ). Los textos nuevos de F1-5 van en `messages`. Limpiar los viejos es otra tarea.
- **Scripts prohibidos**: `scripts/diagnostico-historial.js` referencia `mostrarCategorias`/`PASO_LABELS`, pero está en la lista de scripts que no se ejecutan (AGENTS.md). No correrlo.

## 8. Preguntas para Claude (antes de 4b)

1. ¿Confirmas que el bot no está en `features/whatsapp|instagram` (sección 0), y que la lista (c) queda vacía?
2. ¿La entrada es por "Hacer pedido" (recomendado) o también por "Hola" (diseño §2)?
3. ¿Punto de entrada único en `mostrarCategorias` (controlador) o un helper en `chatFlowService`?
4. ¿"Búsqueda sin resultado": modelo nuevo con getter en `dbLocal`/`dbMock` o `Setting`?
5. ¿Se corrige ahora el `listReplyId` de las listas de envío (sección 3) o queda como deuda?
