# GEMINI.md — Reglas técnicas de la plantilla multimarca (VentiMax)

> **Qué es:** bot de ventas por WhatsApp, Instagram y Messenger con panel administrativo. Flujo completo:
> catálogo → carrito → datos del cliente → envío/ubicación → pago → comprobante → verificación → despacho.
> **Plantilla multimarca:** el mismo código sirve a varios negocios. La marca activa se elige con
> `BRAND_NAME` y vive en `config/brand/<marca>/`. VentiMax (ventiladores Fortunne) es la marca piloto;
> `default` es la marca histórica (Mr. Pachi) y la usan las suites de prueba.
> **Gobernanza y tablero de tareas:** `AGENTS.md`. Este archivo solo trae las reglas técnicas.

---

## 1. Regla principal: nada de la marca en el código

Nombre del negocio, nombre del bot, rubro, contacto, emojis, unidad de venta, textos que ve el cliente,
productos, precios y datos de pago **no se escriben en el código**. Salen de una de estas tres fuentes:

| Fuente | Qué guarda | Cómo se lee | Cambia con |
|---|---|---|---|
| `config/brand/<marca>/` | Identidad de la marca, textos del bot, tema, catálogo inicial, prompt de IA | `services/configManager.ts` | Commit + reinicio |
| Colección `Setting` (panel → Configuración) | Ajustes operativos editables: alertas del Watchdog, horario, flujo de días no laborables (F0-3/F0-4) | Servicio propio con caché en memoria | Panel, sin reiniciar |
| Colecciones de negocio (panel → Inventario) | Productos, categorías, métodos de pago, métodos de envío (F0-5), FAQ, respuestas rápidas | Modelos de Mongoose | Panel, sin reiniciar |
| Variables de entorno (Render) | Secretos, IDs de Meta, teléfonos de administrador | `process.env` / `services/configStore.ts` | Render (o panel para las 4 claves editables) |

### 1.1 Cómo leer la configuración de marca (errores ya cometidos)

`configManager` carga cada archivo **bajo su propio nombre**:

| Archivo | Clave raíz |
|---|---|
| `settings.json` | `settings` |
| `payments.json` | `payments` |
| `products.json` | `products` |
| `ai_prompt.txt` | `ai_prompt` |

Por eso los mensajes del bot están en **`settings.messages.*`**, no en `messages.*`:

```ts
configManager.format("settings.messages.botStarted", { pid });   // ✅ texto de la marca
configManager.format("messages.botStarted", { pid });            // ❌ devuelve "" y cae al respaldo
```

- `get(ruta)` devuelve el valor o `undefined`. `format(ruta, vars)` devuelve `""` si la ruta no existe y
  sustituye `{{variable}}`; `brandName` y `botIdentity` se inyectan siempre.
- Las suites **no** detectan una ruta mal escrita: el bot sigue respondiendo con el texto de respaldo.
  Toda clave nueva se comprueba cargando la marca (`BRAND_NAME=ventimax NODE_ENV=test`) y verificando que
  devuelve texto no vacío.
- Un mensaje nuevo se añade en `messages` de **todas** las marcas (`default` y `ventimax`).
- `settings.brandName` es obligatorio (`validateSchema`): no necesita respaldo en el código.
- Respaldos permitidos cuando falta una clave: textos **neutros** (`"Asistente virtual"`, `"📦"`, `""`).
  Prohibido usar como respaldo `"Mr. Pachi"`, `"VentiMax"`, `"Yuri-Bot"`, `"🥟"` o cualquier dato de un
  negocio concreto.
- Excepción: dentro de una rama `if (process.env.NODE_ENV === "test")` (mocks) pueden quedar datos de
  `default`, porque las suites corren con esa marca.

### 1.2 Qué contiene una marca

```
config/brand/<marca>/
  settings.json   → brandName, botIdentity, businessDescription, productBrand, contact{email,website,instagram},
                    sales{unitSingular,unitPlural}, brandEmoji, categoryEmoji, theme{primaryColor,
                    secondaryColor, logoUrl, productBrandLogoUrl}, features, watchdog, messages{...}
  products.json   → catálogo inicial: id, name, price, description, categorias[] (la primera es la principal)
  payments.json   → plantilla de métodos de pago (solo la lee scripts/migrations/migrate-payments.js;
                    en producción los métodos se gestionan desde el panel, colección MetodoPago)
  ai_prompt.txt   → prompt del asistente de ventas; usa {{brandName}}; sin precios (salen del catálogo)
```

`products.json` solo se usa para **sembrar** una base vacía (`services/dbSeed.ts`): si ya hay productos
no hace nada. Después, el catálogo se gestiona desde el panel. Guía para crear una marca nueva:
`docs/nuevo-cliente.md`.

`config/brand/default/` no se modifica en la Fase 0.

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js 18/20 + Express 5 + TypeScript (`module: NodeNext`, `strict: false`, `allowJs`) |
| Build / ejecución | `npm run build` (tsc → `dist/` y copia `config/`), `npm start`, `npm run dev` (nodemon + tsx) |
| HTTP externo | `axios`. No usar `fetch` nativo |
| Base de datos | MongoDB con Mongoose 9 |
| Frontend | React 18 por import maps (Skypack) + Tailwind CDN, **sin build**: `React.createElement` como `e()`, sin JSX |
| Mensajería | Meta Cloud API v20 (WhatsApp, Instagram Direct, Messenger) |
| IA | DeepSeek (asistente, copiloto, reactivación), OpenAI (imágenes), Gemini y Gladia/Deepgram (audio) |
| Jobs | Agenda (colección `agendaJobs`) |
| Tiempo real | Socket.IO 4 (autenticado con la cookie JWT) + Web Push (VAPID) |
| Resiliencia y seguridad | `opossum` (circuit breaker), `express-rate-limit`, `zod`, `helmet`, HMAC de Meta |
| Otros | BCV por scraping (caché 3 h), Cloudinary, multer (memoria, 10 MB), JWT en cookie HttpOnly + bcryptjs |

---

## 3. Estructura

```
index.ts                     → Express, Helmet, rate limiting, rawBody para HMAC, Socket.IO, siembra y arranque
controllers/
  webhookController.ts       → WhatsApp: responde 200 y delega en chatFlowService
  instagramWebhookController.ts, messengerWebhookController.ts
  chatFlowController.ts      → Vistas de WhatsApp: bienvenida, menú, categorías, productos, resumen, pagos
  inboxController.ts         → Inbox unificado (/api/admin/inbox)
  adminController.ts         → Productos, categorías, pedidos, usuarios, Kanban, backup, venta manual
  paymentController.ts       → CRUD de métodos de pago (/api/admin/payments)
  configController.ts        → GET /api/config (público: marca, tema, vapidPublicKey) y config de admin
services/
  configManager.ts           → Marca activa (sección 1). Singleton
  configStore.ts             → Variables de entorno editables/visibles en el panel (EDITABLE_KEYS, READONLY_KEYS)
  configValidators.ts        → Validación por clave de lo que se guarda desde el panel
  catalogQuery.ts            → filtroPorCategoria(): regla única de pertenencia a categoría (principal o adicional)
  chatFlowService.ts         → Máquina de estados de WhatsApp (mapa this.handlers)
  instagramFlowService.ts    → Flujo de Instagram y Messenger
  orderService.ts            → Pedidos, etiquetas, mensajes, correlativos, comprobantes
  whatsapp.ts, instagram.ts, messenger.ts → Clientes de la API de Meta
  ai.ts                      → Asistente de ventas (prompt de la marca + catálogo real + tasa BCV)
  faqMatcher.ts              → FAQ y menú dinámico {menu}
  reactivationService.ts     → Retoma de carritos abandonados
  watchdogService.ts         → Pedidos estancados, alertas al admin, salud de conexiones
  dbSeed.ts                  → Siembra de productos y categorías desde products.json si la base está vacía
  dbLocal.ts, dbMock.ts      → Mocks de modelos para NODE_ENV=test
models/                      → Usuario, Pedido, Producto (categoria + categorias[]), Categoria, MetodoPago, Setting,
                               Mensaje, MensajeIg, Etiqueta, EtiquetaIg, FAQ, QuickReply, Counter, Auditoria, ...
routes/, middlewares/ (auth, hmacValidator, rateLimiter, csp), validators/, types/
data/permissions.js          → Roles → permisos granulares
utils/helpers.ts             → getCaracasTime, formatBs, formatUsd, limpiarCedula, esFinDeSemanaCaracas
config/brand/<marca>/        → Sección 1.2
public/index.html            → SPA del panel, sin scripts en línea (CSP): arranca con public/src/boot/panel.js
                               (login: public/src/boot/login.js); public/src/features/ (inbox, dashboard, inventory, sales;
                               whatsapp e instagram son legado)
services/paginaPrivacidad.ts → Política de privacidad (ruta /privacidad) con los datos de datosNegocioService
                               (panel → Datos del negocio; si están vacíos, settings.legal/contact de la marca)
middlewares/csp.ts           → Content Security Policy del panel. No poner <script> en línea ni onclick= en public/*.html;
                               un CDN nuevo se añade aquí
scripts/                     → Suites de prueba y scripts operativos (ver sección 6: muchos NO se ejecutan)
```

Archivos que siguen en `.js` (`middlewares/rateLimiter.js`, `data/*.js`, `utils/pasoEmbudo.js`, `scripts/`) son
deuda técnica. Código nuevo de backend: `.ts`.

---

## 4. Patrones

- **Máquina de estados:** cada paso del bot es un `handle*` registrado en `this.handlers` de
  `chatFlowService.ts`. Pasos nuevos = handler nuevo en el mapa, no `if/else` anidados.
- **Estado persistente:** el paso y el carrito viven en `Etiqueta` (WhatsApp) y `EtiquetaIg` (Instagram y
  Messenger). Un reinicio no pierde conversaciones.
- **Mocks en test:** con `NODE_ENV=test` los servicios cambian los modelos por los de `dbLocal`/`dbMock`.
  Un servicio nuevo que use modelos replica ese patrón. Los mocks deben comportarse **igual que MongoDB**
  (misma semántica de cada clave de consulta); si no, una consulta rota pasa las pruebas.
- **Categorías:** un producto pertenece a X si `categoria === X` o `categorias` contiene X. Toda consulta por
  categoría usa `filtroPorCategoria()`; en el carrito el producto cuenta una sola vez.
- **Estados de pedido:** `pendiente_pago → pendiente_verificacion → verificado → en_ruta → entregado`,
  `cancelado` desde cualquiera. Activos: `estado $nin ["entregado","cancelado","anulado"]`.
- **Permisos:** las rutas usan `authorize([...permisos])`, nunca roles. Los ajustes del panel exigen
  `config:manage`.
- **Ajustes editables desde el panel:** documento `Setting` (`key`/`value`) + valor por defecto de la marca +
  caché en memoria + endpoint `GET/PUT` con `config:manage` + validador en `configValidators.ts`.
- **Inbox unificado:** `public/src/features/inbox/` con un adaptador por canal en `services/inbox/adapters/`.
  Las consolas `features/whatsapp/` y `features/instagram/` son legado: no se amplían.

---

## 5. Convenciones

- Nombres, mensajes, comentarios y logs en español. Logs con prefijo (`✅ ❌ ⚠️ 🔔 🚨 📡 🚚`).
- En archivos existentes se respeta su estilo (`require` o `import`); en archivos nuevos, `import`/`export`.
- Zona horaria `America/Caracas` (`index.ts` fija `TZ`); usar `getCaracasTime()`.
- Cédula venezolana: 7-9 dígitos, sin puntos, guiones ni prefijos V/E.
- Webhook de Meta: responder 200 de inmediato y procesar después.
- Variables de entorno: lista comentada en `.env.example`. Ningún secreto en código ni en logs.
- Frontend: cada archivo tocado se verifica con `esbuild --bundle` (sección 6). Cache-busting `?v=N` en los
  imports que cambian.

---

## 6. Pruebas

Todas corren con `NODE_ENV=test` y los mocks. La lista obligatoria y los resultados esperados están en
`AGENTS.md` → "Verificación obligatoria". Resumen:

```bash
npm run build
NODE_ENV=test npx tsx scripts/test-config-validators.ts
NODE_ENV=test npx tsx scripts/test-config-store.ts
NODE_ENV=test npx tsx scripts/test-whatsapp-edge-cases.js
NODE_ENV=test npx tsx scripts/test-inbox-service.js
NODE_ENV=test npx tsx scripts/simulate-ig-webhook.js
NODE_ENV=test npx tsx scripts/simulate-messenger-webhook.js
NODE_ENV=test npx tsx scripts/test-dynamic-menu.ts
NODE_ENV=test npx tsx scripts/test-multicategoria.ts
NODE_ENV=test npx tsx scripts/test-mensajes-marca.ts
NODE_ENV=test npx tsx scripts/test-privacidad.ts
npx --yes esbuild@0.23.0 <archivo-frontend> --bundle --external:https://* --outfile=/dev/null
```

Sin `--bundle`, esbuild no resuelve imports y una ruta mal escrita deja el panel en blanco.

### ⛔ Scripts que NO se ejecutan

Leen el `.env` real: se conectan a la base de producción o **envían WhatsApp reales**. Lista completa en
`AGENTS.md` → "Scripts prohibidos". Entre ellos: `test-comandas.ts`, `test-comanda-real.ts`,
`test-comanda-gps-notes.ts`, `test-mini-comanda.ts`, `test-delivery-notif.js`, `test-receipt-notification.js`,
`test-agenda-init.js`, `db-reset-prod.js`, `seed-*.js`, `clearAndSeed.js`, `unlock-bot.js`, `audit_*`,
`test_db*.ts` y `scripts/migrations/*`.

Regla: si un script carga `dotenv` y no fuerza `NODE_ENV=test` con mocks, no se ejecuta.
Tampoco se arranca el servidor local contra una base real. El `.env` local de VentiMax está vacío
(sin credenciales); nadie le pega datos de producción de ningún cliente.

---

## 7. Seguridad

1. JWT solo en cookie HttpOnly; nada de tokens en `localStorage`. El frontend usa `withCredentials: true`.
2. `JWT_SECRET` obligatorio (≥ 32 caracteres; en producción el servidor no arranca sin él). Sesiones de 30 días,
   validadas con `verificarSesion()` (`middlewares/auth.ts`): usuario activo y rol leídos de la base.
   Todo dato de un cliente que vaya a HTML se escapa; nunca `innerHTML` con datos sin escapar.
3. Helmet activo con `contentSecurityPolicy: false` por los CDN. No desactivar otras protecciones.
4. `rawBody` para validar la firma HMAC de Meta en todos los webhooks. Solo `NODE_ENV=test` la omite. Auditoría y requisitos del catálogo público: `docs/auditoria-seguridad-2026-10.md`.
5. Socket.IO autenticado; los eventos que envían mensajes o cambian el modo exigen `chat:manage`.
6. `GET /api/config` es público: solo marca, tema y `vapidPublicKey`. Nada de pagos, teléfonos ni prompts.
7. Sin datos sensibles en logs (teléfonos, tokens, `MONGODB_URI`). Contraseñas con bcrypt (salt 10).
8. Multer limitado a 10 MB.

---

## 8. Lo que nunca se hace

- ❌ Escribir datos de una marca en el código (sección 1).
- ❌ Cambiar un modelo de Mongoose sin actualizar `dbLocal.ts` y `dbMock.ts` (con la misma semántica).
- ❌ Crear archivos `.js` nuevos en `services/`, `controllers/`, `models/`, `routes/` o `middlewares/`.
- ❌ Añadir dependencias sin aprobación de Claude.
- ❌ Cambiar el flujo de estados de pedido sin revisar el Watchdog y el Kanban.
- ❌ Leer o imprimir el `.env`; tocar variables de Render, Meta o Atlas (eso lo hace el dueño).
- ❌ Ejecutar los scripts de la sección 6.
- ❌ Operaciones de escritura en git (`commit`, `add`, `push`, `stash`, `reset`, `restore`).
- ❌ Ampliar el alcance de una tarea: las dudas se escriben en `AGENTS.md` → "Dudas para Claude".

---

## 9. Si tocas X, revisa Y

| Si modificas... | Revisa también... |
|---|---|
| `models/Pedido.ts` | `orderService.ts`, `adminController.ts`, `chatFlowService.ts`, `watchdogService.ts`, `KanbanBoard.js`, `SalesDashboard.js`, mocks |
| `models/Producto.ts` / `Categoria.ts` | `dbSeed.ts`, `catalogQuery.ts`, `chatFlowController.ts`, `faqMatcher.ts`, `ai.ts`, `ProductTab.js`, `ProductTable.js`, `InboxQuickCalculator.js`, mocks |
| `models/MetodoPago.ts` | `paymentController.ts`, `chatFlowController.ts`, `orderService.ts`, `PaymentTab.js` |
| `chatFlowService.ts` | `chatFlowController.ts`, `orderService.ts`, `test-whatsapp-edge-cases.js` |
| `instagramFlowService.ts` | `simulate-ig-webhook.js`, `simulate-messenger-webhook.js` |
| `services/inboxService.ts` | `inboxController.ts`, `services/inbox/adapters/`, `features/inbox/`, `test-inbox-service.js` |
| `middlewares/auth.ts`, `data/permissions.js` | `adminRoutes.ts`, `apiClient.js`, `login.html`, `UserManagement.js` |
| Una clave de `config/brand/*/settings.json` | Todas las marcas, `configManager.validateSchema()`, `docs/nuevo-cliente.md` |
| `.env.example` | `configStore.ts` (si la clave se muestra en el panel), `docs/nuevo-cliente.md` |

---

## 10. Skills

La carpeta `skills/` tiene guías de mejora (`/add-indexes`, `/add-rate-limit`, `/secure-webhook`,
`/validate-with-zod`, `/add-health-endpoint`, `/setup-circuit-breaker`, `/add-push-notifications`,
`/add-stock-tracking`, `/extract-order-modal`). La mayoría ya se aplicó en este código (HMAC, rate limiting,
Zod, circuit breaker, push, stock). **No se ejecutan por iniciativa propia:** si una aplica, se propone en
"Dudas para Claude". Su código usa `require()`; se adapta al estilo del archivo que se toque.

---

> **Última actualización:** 2026-10-27 — Claude (Cerebro), tarea F0-6. Reescrito para la plantilla multimarca.
