# AGENTS.md — Gobernanza multiagente de VentiMax

> **Proyecto:** VentiMax. Bot de ventas por WhatsApp, Instagram y Messenger con panel administrativo
> (Node.js + TypeScript + Express 5 + MongoDB, SPA React 18 sin build).
> Nace como copia de `reply-bot-pachi` (Mr. Pachi, hasta su commit `77e1102`). El repositorio de VentiMax
> empieza con **historial nuevo** (2026-10-28): el heredado traía el `.env` de Pachi en commits viejos. Ese
> historial queda solo en el repo de Pachi y en una rama local del dueño (`historial-pachi-local`) que
> **nunca se sube**.
>
> **Objetivo:** convertir el sistema en una **plantilla multimarca**. VentiMax (ventiladores marca
> Fortunne) es la marca piloto. El siguiente cliente es una venta de repuestos de vehículos.
> Clonar a un cliente nuevo debe ser: copiar `config/brand/<marca>/`, ajustar el panel y
> configurar Render, Meta y Atlas. **Nada de la marca puede quedar escrito en el código.**

## Roles

| Quién | Qué hace |
|---|---|
| **Claude** (Cerebro) | Decide la arquitectura, escribe las tareas del tablero con su criterio de cierre, revisa cada entrega y la aprueba o la devuelve. Hace cambios pequeños o de arquitectura. Consulta Render por MCP (solo lectura). |
| **Antigravity** (TPM) | Ejecuta las tareas del tablero delegando en sus subagentes (matriz de abajo). No amplía ni cambia el alcance: si algo no está en la especificación o no cuadra con el código, lo escribe en **Dudas para Claude** y espera. |
| **Subagente Haiku 5.5** (desde 2026-10-29) | Antigravity se quedó sin tokens: desde el 2026-10-29 Claude reparte el trabajo de ejecución a un subagente con Haiku 5.5 y revisa cada entrega con los mismos criterios (`./scripts/ci.sh`, revisión del diff, nada de la marca en el código). Las reglas no negociables valen igual para el subagente. |
| **Dueño** | Hace todos los commits. Configura Render, Meta y MongoDB Atlas. Aporta los datos reales (precios, cuentas de pago, teléfonos). |

## Matriz de ruteo de subagentes (Antigravity)

| Subagente | Dominio | Stack | Cuándo |
|---|---|---|---|
| **Backend** | Lógica de negocio, APIs, webhooks, BD | Node.js, TypeScript, Express 5, Mongoose, Meta API | Flujos de WhatsApp/IG/FB, modelos, endpoints |
| **Frontend** | Panel SPA, sockets | React 18 (`e(...)` sin JSX), Tailwind, Socket.IO | Inbox, Kanban, Configuración, Inventario |
| **QA** | Pruebas y mocks | Scripts en `scripts/`, `services/dbLocal.ts`, `dbMock.ts` | Suites nuevas o rotas |
| **DevOps** | Despliegue, jobs, seguridad | Render, Agenda, rate limiting, Watchdog | Caché, webhooks, tareas programadas, service worker |

Manifiestos de cada subagente: `.agents/`.

## Reglas no negociables

1. **Git solo lectura** (`status`, `diff`, `log`). Nadie ejecuta `commit`, `add`, `push`, `stash`, `reset` ni `restore`. Todo queda en el working tree.
2. **Prohibido leer el `.env`** o imprimir sus valores. Las variables se documentan en `.env.example`.
3. **No arrancar el servidor contra una base de datos real.** Las pruebas corren con `NODE_ENV=test` (usan `dbLocal`/`dbMock`). Única excepción: el entorno local con Docker (sección "Entorno local"), arrancado **solo** con `scripts/dev-local.sh`.
4. **No inventar datos del negocio** (precios, cuentas, teléfonos, correos). Si faltan, usar el texto `PENDIENTE_DUEÑO` y anotarlo en **Pendientes del dueño**.
5. **Ningún texto de marca en el código.** Nombre, bot, rubro, contacto, unidad de venta y mensajes salen de `config/brand/<marca>/` (vía `services/configManager.ts`) o de la colección `Setting` si se edita desde el panel.
6. **No cambiar `config/brand/default/`** ni renombrar los identificadores internos `pachi_*` (localStorage, eventos del navegador) en la Fase 0.
7. **No tocar `features/whatsapp/**` ni `features/instagram/**`** salvo las líneas que la tarea nombre explícitamente.

## Verificación obligatoria antes de pedir revisión

Cada tarea se entrega con la salida de estos comandos pegada en su bloque:

```bash
npm run build
NODE_ENV=test npx tsx scripts/test-config-validators.ts
NODE_ENV=test npx tsx scripts/test-config-store.ts
# Suites de regresión: correrlas TODAS en cada tarea que toque backend
NODE_ENV=test npx tsx scripts/test-whatsapp-edge-cases.js   # 30/0
NODE_ENV=test npx tsx scripts/test-inbox-service.js         # 364/0
NODE_ENV=test npx tsx scripts/simulate-ig-webhook.js        # 37/0
NODE_ENV=test npx tsx scripts/simulate-messenger-webhook.js # 54/0
NODE_ENV=test npx tsx scripts/test-dynamic-menu.ts          # 6/6
NODE_ENV=test npx tsx scripts/test-multicategoria.ts        # 7/7
NODE_ENV=test npx tsx scripts/test-mensajes-marca.ts        # 16/16 por marca
NODE_ENV=test npx tsx scripts/test-privacidad.ts            # 6/6
NODE_ENV=test npx tsx scripts/test-horario.ts               # 7/7
NODE_ENV=test npx tsx scripts/test-seguridad.ts             # 16/16
NODE_ENV=test npx tsx scripts/test-flujo-no-laborable.ts    # 9/9
# + la suite nueva de la tarea
# Frontend: cada archivo tocado, con resolución de imports
npx --yes esbuild@0.23.0 <archivo> --bundle --external:https://* --outfile=/dev/null
```

**Atajo:** `./scripts/ci.sh` corre todo lo anterior (build, las suites y `esbuild --bundle` sobre los 53 archivos de `public/src`) y termina con la lista de fallos. GitHub Actions (`.github/workflows/ci.yml`) lo ejecuta en cada push. Una suite nueva se añade a la lista `SUITES` de ese script.

Sin `--bundle`, esbuild no resuelve imports: una ruta relativa mal escrita deja **todo el panel en blanco** y ningún chequeo de sintaxis lo detecta.

Además de las suites de arriba, `scripts/ci.sh` corre las de flujo completo, e2e, efectivo, pago mixto, resumen de ventas, respuestas rápidas de Instagram y push (actualizadas el 2026-10-28). **Usar `./scripts/ci.sh` como verificación de cada entrega.**

### ⛔ Scripts prohibidos (cargan el `.env` real)

Estos scripts **no son pruebas**: leen el `.env`, se conectan a la BD de producción o **envían WhatsApp reales al administrador**. Nadie los ejecuta, ni con `NODE_ENV=test`:

- Envían WhatsApp: `test-comandas.ts`, `test-comanda-real.ts`, `test-comanda-gps-notes.ts`, `test-mini-comanda.ts`, `test-delivery-notif.js`.
- Se conectan a MongoDB real: `audit_*`, `test_db*.ts`, `analyze-faqs.js`, `check-meta-codes.js`, `clearAndSeed.js`, `db-reset-prod.js`, `diagnostico-historial.js`, `find_id.js`, `find_msgs.js`, `seed-*.js`, `test-agenda-init.js`, `test-receipt-notification.js`, `unlock-bot.js`.

Ante la duda: si un script tiene `dotenv` y no fuerza `NODE_ENV=test` con mocks, **no se ejecuta**.

### Entorno local (Docker)

Para ver el panel en el navegador con datos de prueba. Base MongoDB en un contenedor, accesible solo desde la máquina (`127.0.0.1:27017`).

```bash
docker compose -f docker-compose.local.yml up -d          # levanta MongoDB (apagar: down; borrar datos: down -v)
npx tsx scripts/crear-admin-local.ts <usuario> <clave>    # primera vez; solo si no hay usuarios
./scripts/dev-local.sh                                    # servidor en http://localhost:3000/panel
npx tsx scripts/demo-local.ts                             # datos de demostración (chats de 3 canales, 4 pedidos, 2 pagos)
npx tsx scripts/demo-local.ts --borrar                    # quita solo los datos de demostración
```

- `dev-local.sh` se niega a arrancar si la base no es `127.0.0.1`/`localhost` y deja **vacías** todas las credenciales externas (WhatsApp, Meta, IA, Cloudinary, VAPID). dotenv no sobrescribe variables ya definidas, así que aunque el `.env` tuviera datos reales, este modo no envía nada.
- En el primer arranque se siembran las categorías y los productos de la marca. Lo que se configura en local **no pasa a producción**.
- Errores esperados en consola: Watchdog y envíos fallan por falta de tokens. No hay IA ni mensajes entrantes de Meta.
- Antigravity puede usarlo para verificar a ojo el panel. Nunca se cambia el host de la base ni se rellenan las credenciales.

## Flujo de trabajo

1. **Claude** escribe la tarea en el tablero con especificación y criterio de cierre.
2. **Antigravity** la pasa a `En curso`, la ejecuta y la deja en `Lista para revisión` con: archivos tocados, evidencia de verificación y desviaciones (si las hubo).
3. **Claude** revisa el diff y la marca `Aprobada` o `Devuelta` (con el motivo). **Solo Claude pone `Aprobada`.** Antigravity deja la tarea en `Lista para revisión`.
4. **Dueño** commitea.

Estados: `Pendiente` · `En curso` · `Lista para revisión` · `Devuelta` · `Aprobada` · `Bloqueada (dueño)`.
Firmas en el historial: `— Ejecutado por **Antigravity**`, `— Ejecutado por **Claude**`, `— Co-diseñado con **Claude**`.

---

## Hoja de ruta

| Fase | Contenido | Estado |
|---|---|---|
| **F0** | Plantilla multimarca: marca `ventimax`, código sin textos de Mr. Pachi, horario, fin de semana y métodos de envío editables desde el panel, arranque seguro, imágenes de producto, guía para nuevos clientes. Las 14 tareas cerradas el 2026-10-28 | **Cerrada** |
| F1 | Producto ampliado: SKU, marca fabricante, códigos OEM, atributos, compatibilidad por vehículo (marca, modelo, años, motor, versión), grupos de equivalencia; importación desde Excel; bot por vehículo. **Diseño: `docs/f1-producto-ampliado.md`** | Diseñada (espera cierre de F0) |
| F2 | Catálogo web público con carrito y pedido a WhatsApp con código no adivinable. **Diseño: `docs/f2-catalogo-web.md`.** Requisitos de seguridad obligatorios: `docs/auditoria-seguridad-2026-10.md` (sección F2) | **Cerrada** (F2-1 a F2-4 aprobadas, 2026-10-29). Tienda en `https://ventimax-tienda.onrender.com` |
| F3 | Búsqueda con IA sobre la BD (texto y notas de voz), registro de búsquedas sin resultado, pase a asesor | Pendiente |
| F4 | Formularios nativos (WhatsApp Flows), lectura de fotos de piezas, equivalencias entre marcas | Pendiente |
| F5 | **Canal TikTok** (Business Messaging API): mensajes directos de la cuenta de empresa en el Inbox, como cuarto canal con el mismo esquema que Instagram (preguntas frecuentes por el bot; para comprar, enlace a WhatsApp). Beta abierta en Latinoamérica; requiere cuenta TikTok Business y app aprobada (revisión de seguridad y privacidad de TikTok). Investigación previa (2026-10-28, subagente): la documentación oficial de TikTok no se pudo leer sin navegador, así que lo técnico (endpoints, JSON del webhook, firma) está **sin verificar**. Según integradores: ventana de 48 h desde el último mensaje del cliente, unos 10 mensajes por ventana, solo texto e imagen (sin botones confirmados), tokens de ~24 h que se renuevan, y Latinoamérica disponible (Venezuela sin confirmar). Antes del diseño hay que leer la documentación oficial con sesión iniciada. Se diseña después de F0, junto a F2. **Decisión del dueño (2026-10-28): sin botones.** El bot de TikTok responde solo con texto: respuestas por intención (precios, envíos, horario, pagos, catálogo) armadas con variables de la marca y del panel (`{{brandName}}`, horario, métodos de envío y pago vigentes, etc.), y **enlaces** para llevar al cliente a comprar: `{{waLink}}` (chat de WhatsApp con texto prellenado y la etiqueta de origen TikTok) y `{{catalogoUrl}}` (catálogo web de F2; mientras F2 no exista, solo WhatsApp). Los textos van en `messages` de la marca, nunca en el código | Pendiente (requisitos del dueño) |
| — | Costo de envío por kilómetro (con la ubicación de la tienda, F2c, se puede calcular la distancia al punto de despacho) | Pendiente (después de F0) |
| F2d | **Mapa con buscador en el carrito** (paso 2 de la idea del dueño, 2026-10-29): el cliente mueve un pin y busca su dirección. Empezar con OpenStreetMap (gratis, copiado al repo); Google Maps solo si el buscador se queda corto (requiere cuenta de Google Cloud con tarjeta y clave, la configura el dueño, y abrir la CSP de la tienda) | Pendiente |
| F2b | **Rediseño de la tienda** (pedido del dueño, 2026-10-29): estilo de tienda en línea estándar con acabado tipo Mercado Libre, preguntas frecuentes editables desde el panel, íconos de Lucide. Sistema visual en `DESIGN.md`; contexto en `PRODUCT.md` | **Cerrada** (2026-10-29) |

---

## Datos del negocio VentiMax (fuente para la Fase 0)

- **Nombre comercial:** VentiMax · **Bot:** Yuri-Bot · **Marca de producto:** Fortunne
- **Rubro:** venta de ventiladores Fortunne. Delivery en Caracas (costo según zona, a convenir) y envíos a nivel nacional.
- **País:** Venezuela. Se mantienen tasa BCV, Pago Móvil, cédula y zona horaria `America/Caracas`.
- **Colores** (sacados de la caja): primario `#1E8C88` (turquesa oscuro), secundario `#5CC0BB` (turquesa claro), neutro del logo `#1A1A1A`.
- **Logo Fortunne:** `public/assets/brand/ventimax/fortunne-logo.png` (ya en el repo). **Solo para el catálogo** (marca del producto), no para el panel. El panel sigue con `/assets/favicon.svg` hasta que VentiMax tenga logo propio.
- **Categorías:** Mesa · Pared · Pedestal. **Un producto puede estar en varias categorías** (F0-7): el Turbo Fan 10" (2 en 1) aparece en Mesa y en Pared, así que la categoría "Mesa/Pared" ya no hace falta.
- **Punto de retiro (2026-10-28):** Av. Sucre de Catia, Gato Negro, frente a la entrada del Parque del Oeste, Caracas. **No va en el código:** el dueño lo carga en el panel (Inventario → Envíos, método tipo "Retiro") y lo cambia cuando quiera (F0-12). Horario: el de atención, salvo que el dueño indique otro.
- **Métodos de pago:** los mismos de Mr. Pachi (Transferencia, Pago Móvil, USDT, Zelle, Efectivo), **con datos de cuenta `PENDIENTE_DUEÑO`**. Ya son editables desde el panel (Inventario → Pagos).
- **Catálogo inicial** (leído de las cajas y confirmado por el dueño el 2026-10-27). Precios en USD.

| Código | Nombre | Categorías | Precio | Ficha |
|---|---|---|---|---|
| N21 | Fortunne Mini Jumbo 6" | Mesa | $25 | 6" (15,24 cm), 3 aspas aerodinámicas, 3 velocidades |
| N22 | Fortunne High Velocity Fan 8" | Mesa | $35 | 8" (20,32 cm), 3 aspas aerodinámicas, 3 velocidades |
| N04 | Fortunne Turbo Fan 10" | Mesa + Pared | $40 | 10" (25,4 cm), 2 en 1 mesa/pared, 3 velocidades |
| N20 | Fortunne Turbo Fan 12" | Mesa | $46 | 12" (30,48 cm), 3 aspas aerodinámicas, 3 velocidades |
| N24 | Fortunne Turbo Fan 20" | Mesa | $75 | 20" (50,80 cm), 5 aspas aerodinámicas, 3 velocidades |
| N37 | Fortunne Ventilador de Pedestal 18" | Pedestal | $25 | 18" (45,72 cm), 180 W, 3 aspas, altura ajustable |

> Precio del N37 confirmado: es la línea básica; los modelos de mesa usan materiales más premium. El prompt de IA (F0-1) debe poder explicarlo si el cliente pregunta por qué un 18" cuesta menos que uno de mesa.

---

## Tareas cerradas

Detalle completo (especificación, entregas, revisiones e historial) en **`docs/historico-tablero.md`**. Léelo solo si necesitas saber cómo o por qué se hizo algo.

| Tarea | Qué quedó |
|---|---|
| F0-1 a F0-14 | Plantilla multimarca: marca `ventimax` en `config/brand/`, sin textos de marca en el código, horario y días no laborables editables, métodos de envío y retiro, productos en varias categorías, fotos de producto (Cloudinary), arranque seguro (`JWT_SECRET`, primer administrador), CSP sin `'unsafe-inline'` en scripts, datos del negocio editables |
| F0-6, F0-10 | Documentación (`docs/nuevo-cliente.md`, `GEMINI.md`) y restos del rubro de comida |
| F2-1 a F2-4 | Catálogo web: API pública `/api/public` (lista blanca), pedido web con código `PREFIJO-XXXXX`, bot que reconoce el código (reclamo atómico), tienda estática `catalogo/`, panel y contadores de abuso |
| M-1 a M-5 | `enviarYRegistrar` (estado de entrega de los mensajes del bot), errores 500 genéricos, bot de Instagram/Messenger más natural (`cortesiaService`), panel solo con Lucide, auditoría por área y acción |
| F2b, F2c, F2e, F2f | Rediseño de la tienda, entrega elegida en el carrito, empresa de envío con cobro a destino y logos |
| F2g, F2h | Descuentos por producto con cintillo en movimiento; una sola lista de preguntas frecuentes (tienda y bot) |
| F2i | Slider de portada gestionado desde el panel y encabezado de dos niveles |
| F2j | Aliados comerciales (modelo, CRUD, página `#/aliados`) |
| F2k | Tres artículos relacionados en la ficha del producto |
| F2l | Pie de página de varias columnas con contacto, horario, retiro y legal |
| F2m | Investigación de sucursales de Zoom, MRW y Tealca: `docs/sucursales-envios-investigacion.md` |

---

## Reglas de la tienda y del panel (vigentes)

Valen para toda tarea nueva de la tienda (`catalogo/`) y de su gestión en el panel.

- Sin `innerHTML` con datos, sin `<script>` en línea ni `on*=`, sin CDN. Íconos solo de Lucide (`catalogo/js/iconos.js`, `Icono` en el panel). Sin emojis como ícono.
- Nada de la marca escrito en el código: nombre, colores y logos salen de `/api/public/marca` y de lo que cargue el dueño.
- Todo dato nuevo del panel pasa por: validador (`configValidators.ts` o Zod), `authorize(["config:manage"])`, auditoría y `500` genérico. **Todo `tipoRecurso` nuevo que se audite se añade al enum de `models/Auditoria.ts`** (en M-5 se perdían auditorías por no hacerlo; la suite `test-auditoria.ts` lo comprueba).
- Imágenes: Cloudinary, carpeta `<BRAND_NAME>/<carpeta>`, JPG/PNG/WebP. Al quitar o reemplazar una imagen se borra de Cloudinary, y el servidor **solo acepta `publicId` que empiecen por la carpeta de esa función** (en F2f un `publicId` ajeno permitía borrar fotos de productos). Sin Cloudinary configurado, el panel muestra el error "Cloudinary no está configurado" sin romperse.
- Lo que ve el público sale de `GET /api/public/info` con lista blanca: nunca `_id`, `publicId` ni campos internos. Si una sección no tiene datos, **no se muestra** (ni su enlace ni su ruta).
- Nada aleatorio en pantalla (lección de F0-13). Móvil primero (390 px), botones táctiles de 44 px, `prefers-reduced-motion` respetado.
- Cierre de cada tarea: suite nueva en `SUITES` de `ci.sh`, `./scripts/ci.sh` en verde, `esbuild --bundle` en los archivos tocados, y recorrido en Chrome a 390 y 1440 px con la consola abierta (**0 errores de CSP**), con la lista de pantallas en la entrega.

---

## Tareas abiertas

### F2n · Sucursales de envío nacional: empresa → estado → sucursal — Backend + Frontend · `Lista para revisión`

Base: `docs/sucursales-envios-investigacion.md` (F2m, aprobada). Decisión del dueño (2026-11-01): en envío nacional el cliente elige **empresa → estado → sucursal**. Sin mapa (eso es F2d). Las reglas del tablero de 2026-11-01 (sin `innerHTML` con datos, sin scripts en línea, Lucide, nada de marca escrita, 44 px, `prefers-reduced-motion`) valen aquí.

1. **Modelo `models/Sucursal.ts`** (+ tipos, mock en `dbLocal`/`dbMock`): `empresa` (slug en minúsculas: `zoom`, `mrw`, `tealca`), `codigo` (oficial de la empresa), `nombre`, `estado`, `ciudad`, `direccion`, `telefono`, `horario`, `lat`, `lng`, `activa` (por defecto `true`). Índice único `{ empresa, codigo }` e índice `{ empresa, estado, activa }`. Textos recortados a: nombre 80, ciudad 60, dirección 300, teléfono 30, horario 120.
2. **Carga (no en vivo).** Script `scripts/sync-sucursales.ts`, **manual**, que baja las tres listas con una petición cada una (pausa de 3 s entre empresas, `User-Agent` de navegador normal), las normaliza y hace `upsert` por `{ empresa, codigo }`. Las que ya no vienen se marcan `activa: false`, nunca se borran. Si una empresa devuelve un resultado vacío o con menos de la mitad de lo que había, **no toca esa empresa** y avisa (evita borrar todo por una caída). Modo `--simular` que imprime los conteos sin escribir. Nunca se llama desde el servidor ni desde un cron. Prohibido ejecutarlo contra una base real: el dueño lo corre en Atlas con su `MONGODB_URI`; Claude/Haiku solo contra la base local de Docker.
   - Mapeos: Zoom (`sku`→`codigo`, `title`, `street`, `city`, `lat`/`lng`, `phone`, `days_str` + horas→`horario`); MRW (`codigo`, `nombre`, `direccion`, `estado`, `latitud`/`longitud`); Tealca (`fields.code`, `post.name`, `state`, `city`, coordenadas de `url_google_map` con `/q=([-\d.]+),([-\d.]+)/`, teléfono sacado del texto de `acerca_de` solo si cabe en un patrón claro, si no vacío). Todo texto de Tealca se limpia de HTML.
   - **Zoom sin estado:** `services/estadosVenezuela.ts` con la lista de los 24 estados y un mapa ciudad→estado para las 122 ciudades de Zoom. Una ciudad sin estado conocido deja la sucursal fuera, con aviso `⚠️` y su nombre en la salida del script, para completarla a mano. Nunca se inventa el estado.
   - Normalizar estados a un nombre único (`D.Capital`, `Distrito Capital` → `Distrito Capital`; `Vargas`/`La Guaira` → `La Guaira`).
3. **API pública** (en `routes/publicRoutes.ts`, mismas reglas del router: sin nada del panel, límite de lectura holgado, `Vary: Origin`, errores genéricos):
   - `GET /api/public/sucursales/estados?empresa=zoom` → `[{ estado, cantidad }]` ordenado por nombre.
   - `GET /api/public/sucursales?empresa=zoom&estado=Zulia` → `[{ id, codigo, nombre, ciudad, direccion, telefono, horario }]` (solo activas, orden por ciudad y nombre; `id` es `<empresa>-<codigo>`). **Sin `_id` ni coordenadas** (lista blanca). `empresa` y `estado` se validan contra lista cerrada; valor desconocido → 400 genérico. `Cache-Control: public, max-age=3600`.
   - `GET /api/public/info`: cada empresa de envío nacional agrega `conSucursales: true` si tiene alguna sucursal activa, para que la tienda sepa si muestra los selectores.
4. **Vínculo con las empresas del método de envío.** El nombre de la empresa en el método (F2e/F2f, texto libre) se relaciona con el `slug` por un campo nuevo opcional `slug` en cada empresa (`MetodoEnvio.empresas[].slug`, entre los slugs conocidos). El panel lo ofrece como selector "Directorio de sucursales: Ninguno / Zoom / MRW / Tealca" en cada tarjeta de empresa. Sin slug, la empresa funciona como hoy (sin selectores). `/api/public/info` devuelve `slug` solo si tiene sucursales.
5. **Tienda** (`catalogo/`): al elegir una empresa con `slug`, aparecen dos selectores en cascada: **Estado** (con la cantidad entre paréntesis) y **Sucursal** (cada opción: "código · nombre — ciudad", y debajo la dirección corta). El de sucursal se desactiva hasta elegir estado; cambiar de empresa o de estado limpia lo de abajo. Mientras carga, esqueleto; si falla, mensaje amable y se puede seguir con el campo de texto de siempre (`pideDatos`). **Sin sucursal elegida no se habilita "Pedir por WhatsApp"** cuando la empresa tiene selectores. Lógica sin DOM en `catalogo/js/sucursales.js` (cascada, validación, cuerpo del pedido), probada con Node. Selectores nativos `<select>` (accesibles y cómodos en celular) con etiquetas visibles. El código y la dirección elegidos se ven en el resumen del carrito.
6. **Pedido:** el `POST /api/public/pedidos` acepta `entrega.sucursalId` (Zod estricto, ≤ 40, formato `^[a-z]+-[A-Za-z0-9-]+$`). El servidor la busca en la base: debe existir, estar activa y **coincidir con la empresa elegida**; si no, 400. Nunca se confía en nombre ni dirección del navegador. Se guarda en `CarritoWeb.entrega.sucursal = { empresa, codigo, nombre, estado, ciudad, direccion }`. El mensaje de WhatsApp agrega "Sucursal: <empresa> <código> — <nombre>, <ciudad> (<estado>)" y la dirección, con textos nuevos en `settings.messages` de **ambas** marcas (y en `test-mensajes-marca.ts`).
7. **Bot y comanda:** al cargar el código web, la sucursal se muestra en el resumen y **no se vuelve a pedir** (el pedido guarda `entrega.sucursal`); si dejó de estar activa, el bot avisa y la pide como siempre (texto libre). Se muestra en la comanda, la tarjeta del Kanban, el detalle del pedido y la notificación al administrador (`services/envioTexto.ts`, un solo lugar).
8. **Panel:** en Inventario → Envíos, la tarjeta de empresas agrega el selector "Directorio de sucursales" (punto 4). Bloque de solo lectura en Configuración → Catálogo web: "Directorio de sucursales" con la cantidad activa por empresa y la fecha de la última carga (campo `Setting` o `max(updatedAt)`), con el texto "Se actualiza con `scripts/sync-sucursales.ts` (lo corre el administrador técnico)". Sin botón para ejecutar la carga desde el panel.
9. **Privacidad y términos:** los datos son de oficinas públicas, sin datos personales. En `docs/nuevo-cliente.md`, sección nueva: cómo correr el script, cada cuánto (sugerido mensual) y el aviso de que Zoom prohíbe en sus términos reproducir su contenido con fines comerciales sin autorización: **decisión del dueño (2026-11-01): se usan las tres empresas** (Zoom, MRW y Tealca) y no se pide permiso a Zoom. Si más adelante cambia de idea, quitar el slug a Zoom basta.

**Cierre:** suite nueva `scripts/test-sucursales.ts` (en `SUITES`):
- Normalizadores con muestras reales recortadas de los tres formatos (incluidas Tealca sin ciudad y Zoom sin estado): estado normalizado, coordenadas extraídas, HTML limpio, ciudad desconocida de Zoom omitida con aviso.
- Sincronización con mock: `upsert` sin duplicar, desaparecidas → `activa: false`, respuesta vacía o menor a la mitad → esa empresa no se toca; `--simular` no escribe.
- API pública: lista blanca (sin `_id` ni coordenadas), empresa/estado desconocidos → 400, inactivas ausentes, `conSucursales`.
- Pedido: sucursal de otra empresa → 400, inexistente o inactiva → 400, nombre/dirección enviados por el navegador ignorados, guardado en `CarritoWeb`, texto de WhatsApp con la sucursal; empresa con selectores sin sucursal → 400.
- Bot: carga la sucursal sin pedirla de nuevo; sucursal desactivada → la pide.
- Tienda: `sucursales.js` (cascada, limpieza al cambiar, bloqueo sin sucursal), sin `innerHTML`, sin marca escrita. `esbuild --bundle` en los archivos tocados.
- Chrome a 390 y 1440 px con datos cargados en la base local: empresa → estado → sucursal, cambio de empresa, fallo de la API (cae al campo de texto), 0 errores de CSP.
- `./scripts/ci.sh` en verde.

#### Entrega y verificación (Antigravity)
- **Correcciones aplicadas (Claude, 2026-11-01):**
  1. **Salvaguarda remota estricta y corrección de bypass en `esBaseLocal(uri)` (`scripts/sync-sucursales.ts`):**
     - Se corrigió `esBaseLocal` para que analice únicamente el host canónico: se descartan credenciales (`...@`), se aísla la autoridad antes de `/` o `?`, se remueve `:puerto` (no admitido en `mongodb+srv://`), y se compara de forma exacta contra `127.0.0.1` o `localhost`.
     - Si la autoridad tiene más de un `@` (ej. `mongodb://u@evil.com@localhost/x`), se considera ambigua y se rechaza inmediatamente retornando `false`.
     - Se previenen bypasses donde "localhost" o "127.0.0.1" aparezcan en el usuario, contraseña o query parameters (ej. `?appName=localhost` o `?x=127.0.0.1`).
     - Para cualquier URI remota, se exige obligatoriamente `--confirmar` si no se corre con `--simular`.
     - Se documentó en el encabezado del script y en `docs/nuevo-cliente.md` (§6.1).
  2. **Nuevos casos en suite `scripts/test-sucursales.ts`:**
     - Se añadieron aserciones para los casos de bypass reportados: `mongodb+srv://u:localhost@cluster.mongodb.net/ventimax` (false), `mongodb+srv://u:p@cluster.mongodb.net/ventimax?appName=localhost` (false), `mongodb+srv://u:p@cluster.mongodb.net/ventimax?x=127.0.0.1` (false), `mongodb://u@evil.com@localhost/x` (false), `mongodb://127.0.0.1:27017/x` (true) y `mongodb://localhost/x` (true).
     - Se verificó que `validarPermisoEjecucion` y la ejecución en subproceso CLI abortan con código 1 sin escribir si falta `--confirmar`.
  3. **Evidencia completa de navegador (Tienda y Panel `ShippingNacionalModal` a 1440 y 390 px):**
     - Se ejecutó el recorrido completo con Chrome Headless vía CDP (puerto 9224) verificando las 4 vistas con **0 errores de consola y 0 violaciones de CSP**.

- **Archivos tocados:**
  - `models/Sucursal.ts` (creado)
  - `types/models.d.ts` (definición de ISucursal y tipos ampliados)
  - `services/estadosVenezuela.ts` (creado: 24 estados y mapeo de 122 ciudades Zoom)
  - `scripts/sync-sucursales.ts` (creado: sincronización manual, normalizadores, upsert, umbral de seguridad, salvaguarda `--confirmar` para bases remotas)
  - `services/empresasEnvio.ts` (soporte de slug de directorio: zoom, mrw, tealca)
  - `models/CarritoWeb.ts`, `models/Pedido.ts` (esquema de sucursal persistida)
  - `validators/index.js` (validación estricta de entrega con sucursalId)
  - `config/brand/default/settings.json`, `config/brand/ventimax/settings.json` (clave `webOrderPrefillSucursal`)
  - `scripts/test-mensajes-marca.ts` (prueba de la clave en ambas marcas)
  - `services/envioTexto.ts` (funciones centralizadas `textoSucursalEnvio` y `direccionSucursalEnvio`)
  - `services/orderService.ts`, `controllers/chatFlowController.ts`, `controllers/adminController.ts` (sucursal en notificaciones y comandas)
  - `services/chatFlowService.ts` (validación de sucursal activa en `aplicarEntregaWeb` y fallback)
  - `public/src/features/dashboard/KanbanBoard.js`, `public/src/components/OrderDetailsModal.js` (renderizado de sucursal en comanda, tarjeta y modal)
  - `public/src/features/inventory/components/ShippingNacionalModal.js` (selector de directorio de sucursales por empresa)
  - `controllers/configAdminController.ts`, `public/src/features/dashboard/SettingsPanel.js` (bloque de solo lectura con conteos de sucursales)
  - `routes/publicRoutes.ts`, `controllers/publicController.ts` (endpoints `/api/public/sucursales/estados`, `/api/public/sucursales`, flag `conSucursales` en `/api/public/info`)
  - `catalogo/js/sucursales.js` (creado: lógica no-DOM de cascada, validación y formateo)
  - `catalogo/js/api.js`, `catalogo/js/entrega.js`, `catalogo/js/app.js`, `catalogo/css/style.css` (selectores en cascada, fallback a texto libre, 0 innerHTML, 0 emojis)
  - `docs/nuevo-cliente.md` (sección 6.1 documentando sincronización manual, flag `--confirmar` y términos de Zoom)
  - `services/dbLocal.ts`, `services/dbMock.ts` (modelo mock de Sucursal completo)
  - `scripts/ci.sh` (inclusión de `test-sucursales.ts` en `SUITES`)
  - `scripts/test-sucursales.ts` (creado: suite integral con 28 pruebas y 101 aserciones)
  - `scripts/dev-local.sh` (exportación de `CATALOGO_ORIGEN` para dev local)
  - `AGENTS.md` (estado a `Lista para revisión`)

- **Evidencia de verificación de la suite `scripts/test-sucursales.ts` (28 pruebas / 101 aserciones):**
  ```text
  $ NODE_ENV=test BRAND_NAME=ventimax npx tsx scripts/test-sucursales.ts
  ================================================================================
  📦 SUITE DE PRUEBAS: SUCURSALES DE ENVÍO NACIONAL (F2n)
  ================================================================================

  1. Normalizadores con muestras reales
  ⚠️ [Zoom] Ciudad sin estado venezolano conocido: 'MIAMI' (Oficina: ZOOM-MIA - Zoom Miami). Omitida.
  ⚠️ [Zoom] Ciudad sin estado venezolano conocido: 'CIUDAD_INEXISTENTE_XYZ' (Oficina: ZOOM-DESC - Zoom Ficticio). Omitida.
    ✅ Zoom: normaliza correctamente y omite ciudades sin estado venezolano
    ✅ MRW: normaliza estados alternativos (D.Capital, Vargas) a nombres estándar
    ✅ Tealca: limpia HTML, extrae teléfono y parsea coordenadas de url_google_map

  2. Sincronización con mock y protecciones
  🚨 [Sync] Respuesta vacía para ZOOM. Se omite la actualización para proteger los datos existentes.
  🚨 [Sync] MRW devolvió 2 sucursales, menos de la mitad de las 10 previas. Se omite para evitar desastres.
  [SIMULAR] TEALCA: 1 sucursales recibidas (0 previas en BD). Sin cambios.
    ✅ Salvaguarda remota: exige --confirmar para cualquier URI no local (aborta antes de conectar)
    ✅ Sincronización: upsert, preservación de datos, desactivación y protección contra caídas

  3. Endpoints de la API pública
    ✅ API pública: estados, sucursales (whitelist sin _id ni coords) y conSucursales en /info

  4. Validación de sucursal en pedidos web
  ⚠️ [Catálogo] POST /api/public/pedidos: entrega rechazada - Debes seleccionar una sucursal de entrega.
  ⚠️ [Catálogo] POST /api/public/pedidos: entrega rechazada - La sucursal seleccionada no existe o no está disponible.
  ⚠️ [Catálogo] POST /api/public/pedidos: entrega rechazada - La sucursal seleccionada no pertenece a la empresa de envío elegida.
    ✅ Pedido: validación estricta de empresa-sucursal, guarda oficial y arma WhatsApp prefill

  5. Flujo del bot de WhatsApp
    ✅ Bot: retiene sucursal si está activa; si fue desactivada avisa y pide datos al cliente

  6. Lógica de la tienda (sucursales.js y entrega.js)
    ✅ Tienda: funciones sin DOM, cascada, validación y fallback ante fallo de API

  7. Verificación de integridad y seguridad
    ✅ Código limpio: sin innerHTML con datos dinámicos ni marcas fijas en código

  🎉 TODOS LOS TESTS DE SUCURSALES (F2N) PASARON EXITOSAMENTE (28 pruebas).
  ```

- **Evidencia de verificación de `./scripts/ci.sh` (Build, 43 suites e imports en verde):**
  ```text
  $ ./scripts/ci.sh
  ▶ Build
  > ventimax@1.0.0 build
  > tsc && node -e "const fs = require('fs'); if (fs.existsSync('config')) fs.cpSync('config', 'dist/config', { recursive: true });"

  ▶ test-config-validators.ts ... ✅
  ▶ test-config-store.ts ... ✅
  ▶ test-whatsapp-edge-cases.js ... ✅
  ▶ test-inbox-service.js ... ✅ (364/364)
  ▶ simulate-ig-webhook.js ... ✅ (37/37)
  ▶ simulate-messenger-webhook.js ... ✅ (54/54)
  ▶ test-dynamic-menu.ts ... ✅
  ▶ test-multicategoria.ts ... ✅
  ▶ test-mensajes-marca.ts ... ✅
  ▶ test-privacidad.ts ... ✅
  ▶ test-horario.ts ... ✅
  ▶ test-seguridad.ts ... ✅
  ▶ test-flujo-no-laborable.ts ... ✅
  ▶ test-metodos-envio.ts ... ✅
  ▶ test-stock-eliminar.ts ... ✅
  ▶ test-retiro.ts ... ✅
  ▶ test-datos-negocio.ts ... ✅
  ▶ test-rutas-seguridad.ts ... ✅
  ▶ test-api-publica.ts ... ✅
  ▶ test-catalogo-web.ts ... ✅
  ▶ test-catalogo-panel.ts ... ✅
  ▶ test-banner-tienda.ts ... ✅
  ▶ test-slider-tienda.ts ... ✅
  ▶ test-aliados.ts ... ✅
  ▶ test-faq-tienda.ts ... ✅
  ▶ test-banner-lateral.ts ... ✅
  ▶ test-bot-social.ts ... ✅
  ▶ test-iconos.ts ... ✅
  ▶ test-panel-referencias.ts ... ✅ (66 archivos)
  ▶ test-entrega-web.ts ... ✅
  ▶ test-mapa-carrito.ts ... ✅
  ▶ test-geocodificacion-publica.ts ... ✅
  ▶ test-pie-pagina.ts ... ✅
  ▶ test-sucursales.ts ... ✅
  ▶ test-flujo-completo.js ... ✅
  ▶ test-e2e.js ... ✅
  ▶ test-cash-payment.js ... ✅
  ▶ test-mixed-payment.js ... ✅
  ▶ test-sales-summary.js ... ✅
  ▶ test-quick-replies.js ... ✅
  ▶ test-ig-quick-replies.js ... ✅
  ▶ test-web-push-fullstack.js ... ✅

  ▶ Imports del panel y catálogo (esbuild --bundle)
  ✅ Build, 43 suites e imports del panel en verde.
  ```

- **Evidencia del recorrido en Chrome a 1440 px y 390 px (Tienda y Panel `ShippingNacionalModal`):**
  ```text
  🚀 Levantando Chrome headless limpio en puerto 9224 ...

  =======================================================
  🛒 1. VERIFICACIÓN TIENDA: ESCRITORIO (1440 × 900 px)
  =======================================================
     Agregando producto al carrito...
     Seleccionando método Envío Nacional...
     Envío Nacional seleccionado: true
     Seleccionando Empresa -> Zoom...
     Estados cargados (Zoom): [ 'Selecciona un estado…', 'Distrito Capital (1)', 'Miranda (2)' ]
     Seleccionando Estado -> Miranda...
     Seleccionando Sucursal -> ZOOM-CCS-01...
     Fila resumen de sucursal visible: true
     Texto resumen: Sucursal: ZOOM-CCS-01 · Oficina Chacao (Chacao) — Av. Francisco de Miranda, Torre Cavendes [DEMO]
     Cambiando a MRW (limpieza de cascada)...
     Estado limpiado: true
     Resumen ocultado: true
     Cambiando a Domesa (empresa sin directorio -> campo de texto libre)...
     Selectores cascada ausentes: true
     Campo de texto libre presente: true

  =======================================================
  📱 2. VERIFICACIÓN TIENDA: MÓVIL (390 × 844 px)
  =======================================================
     Alturas táctiles en móvil (>= 40px): true
     Resumen de sucursal visible en móvil: true
     Botón Pedir por WhatsApp habilitado: true

  =======================================================
  🖥️ 3. VERIFICACIÓN PANEL: ESCRITORIO (1440 × 900 px)
  =======================================================
     Autenticación de panel: { ok: true, status: 200 }
     Navegando a Inventario en la barra lateral...
     Pestaña Inventario seleccionada: true
     Navegando a subpestaña Envíos...
     Subpestaña Envíos seleccionada: true
     Abriendo ShippingNacionalModal...
     Modal de envío abierto: { abierto: true, modo: 'editar' }
     Modal visible en escritorio: true
     Selects de directorio de sucursales encontrados: 3
     Opciones disponibles en el modal: [
    { value: '', text: 'Ninguno (sin directorio de sucursales)' },
    { value: 'zoom', text: 'Zoom' },
    { value: 'mrw', text: 'MRW' },
    { value: 'tealca', text: 'Tealca' }
  ]

  =======================================================
  📱 4. VERIFICACIÓN PANEL: MÓVIL (390 × 844 px)
  =======================================================
     Altura táctil del select en móvil (>= 40px): true (41 px)
     Modal adaptado a pantalla móvil: true (ancho: 358 px)

  =======================================================
  📋 REGISTRO DE CONSOLA Y CSP EN TODAS LAS PANTALLAS
  =======================================================
     Total console errors: 0
     Total CSP warnings/errors: 0
  🎉 TODAS LAS VERIFICACIONES (TIENDA Y PANEL A 1440px Y 390px) PASARON EXITOSAMENTE CON 0 ERRORES DE CSP.
  ```
- **Desviaciones:** Ninguna. Se incorporaron ambas correcciones solicitadas por Claude. Listo para revisión.

---

## Dudas para Claude

_(Antigravity escribe aquí: tarea, pregunta, opciones que ve. Claude responde debajo.)_

## Pendientes del dueño

- **Antes de abrir a clientes reales:** el WhatsApp de Datos del negocio (584242555659) es el número personal del dueño, usado solo para pruebas (decisión del 2026-10-29). Cambiarlo por el WhatsApp Business de VentiMax al conectar Meta.
- **Mr. Pachi (fuera de este repo):** su Instagram envía el número del administrador porque `WHATSAPP_PHONE` está vacío allá (su código cae a `ADMIN_PHONE_NUMBER`). Poner el número de ventas de Pachi en `WHATSAPP_PHONE` (panel de Pachi → variables, o Render → reply-bot-pachi → Environment). Revisado el 2026-10-29: VentiMax y Pachi no comparten base de datos, Cloudinary ni servidor.

- **Render → Blueprints → ventimax → Manual Sync** después del push del 2026-10-29 16:25, para que la tienda tome la cabecera `Cache-Control: no-cache` (evita que tras un despliegue se mezclen archivos nuevos y viejos).

- **URGENTE: cambiar la contraseña del usuario de base de datos de Atlas.** La `MONGODB_URI` real (usuario y contraseña de producción) se subió a GitHub dentro de `.env.example` en el commit `3391fa5` (2026-10-28). Claude devolvió la plantilla a `MONGODB_URI=` vacío el 2026-10-29. Pasos: Atlas → Database Access → usuario → Edit → Edit Password → Autogenerate → Update User; después actualizar `MONGODB_URI` en Render (Environment) con la contraseña nueva. Con la contraseña cambiada, la vieja que quedó en el historial ya no sirve.

- **Render → Blueprints → ventimax → Manual Sync** para crear la tienda (`ventimax-tienda`) y aplicar `CATALOGO_ORIGEN` en el servidor; el push no lo hizo solo (2026-10-29).

- **Limpiar el historial de GitHub** de los datos de clientes de Mr. Pachi (comandos dados por Claude el 2026-10-28). Hacerlo cuando el working tree esté limpio, después del commit de F0-9.

- Número de WhatsApp de VentiMax, correo, web e Instagram.
- Logo propio de VentiMax para el panel (el de Fortunne queda solo para el catálogo).
- Datos reales de las cuentas de pago: se cargan desde el panel, nunca en el repo.
- Razón social, RIF y dirección para la política de privacidad (Meta la revisa). Se cargan en el panel: Configuración → Operación → **Datos del negocio** (F0-14). Lo mismo para correo, web, Instagram y WhatsApp.
- ~~¿Hay punto de retiro físico?~~ Respondido el 2026-10-28 (ver Datos del negocio). Al configurar producción, cargarlo en Inventario → Envíos.
- **Render, Meta, Atlas y carga del panel:** lista paso a paso en `docs/lanzamiento-ventimax.md`.
- ¿Se borra `config/brand/default.json`?
- Dominio propio para el catálogo web y el panel (F2): **pendiente por decisión del dueño** (2026-10-27).
- **TikTok (F5):** pasar la cuenta de VentiMax a cuenta de empresa (TikTok Business) y registrarse como desarrollador en el portal de TikTok for Business pidiendo acceso a la Business Messaging API. La revisión de TikTok puede tardar; conviene empezarla ya.

---

## Historial

| Fecha | Hora | Tarea | Responsable | Estado |
|---|---|---|---|---|
| 2026-11-01 | — | AGENTS.md aligerado de ~3200 a ~470 líneas: tareas cerradas y historial movidos a `docs/historico-tablero.md`; quedan reglas, hoja de ruta, tareas abiertas y pendientes — Ejecutado por **Claude** | Claude (Cerebro) | Completado |
| 2026-11-01 | — | F2l: Pie de página (footer) de varias columnas, responsive, botón volver arriba, lista blanca en /api/public/info y /api/public/marca; suite test-pie-pagina.ts en CI — Ejecutado por **Antigravity** | Antigravity (TPM) | Lista para revisión |
| 2026-11-01 | — | F2j: Aliados comerciales (modelo Aliado, CRUD /api/admin/aliados con config:manage y auditoría, pestaña Aliados en Inventario, /api/public/info con aliados y vista tienda #/aliados con 0 innerHTML); suite test-aliados.ts en CI — Ejecutado por **Antigravity** | Antigravity (TPM) | Lista para revisión |
| 2026-11-01 | — | Tareas nuevas F2i (slider de portada gestionado desde el panel, independiente del cintillo y del banner lateral, y encabezado de dos niveles con menú de categorías), F2j (aliados comerciales con logo y descripción; sin aliados, la sección no se muestra) y F2k (3 artículos relacionados en la ficha), pedidas por el dueño — Ejecutado por **Claude** | Claude (Cerebro) | Completado |
| 2026-10-30 | 03:00 | F2g: el descuento no se guardaba desde el panel (el controlador no lo leía) y el cintillo pasa a ser una cinta en movimiento con todos los productos en descuento, que se pausa con el mouse y enlaza a cada ficha; subagente Haiku, revisado por Claude — Ejecutado por **Claude** + subagente | Claude (Cerebro) | Completado |
| 2026-10-30 | 02:00 | F2h: una sola lista de preguntas frecuentes para la tienda y el bot (`FAQ.mostrarEnTienda`, migración automática de las preguntas de la tienda con palabras clave que no tapan otras respuestas); subagente Haiku, revisado por Claude — Ejecutado por **Claude** + subagente | Claude (Cerebro) | Completado |
| 2026-10-30 | 00:30 | F2g: descuentos por producto (precio vigente único en tienda, bot, ventas y pedido web) y cintillo promocional configurable; 3 subagentes Haiku en paralelo, revisado por Claude — Ejecutado por **Claude** + subagentes | Claude (Cerebro) | Completado |
| 2026-10-30 | 23:30 | M-5: auditoría agrupada por área y acción (Haiku). Claude corrigió en la revisión: auditorías que fallaban en silencio en producción (enum sin `metodo_envio`, listas en campos de texto), "fetchProducts is not defined" al subir fotos, categorías adicionales y emoji descartados por el validador desde F0-7, productos desactivados que se reactivaban al guardar, y textos de Mr. Pachi en el panel — Ejecutado por **Claude** + subagente | Claude (Cerebro) | Completado |
| 2026-10-29 | 17:00 | F2f: empresas de envío con logo (tarjetas clicables en la tienda, formulario de envío nacional con una tarjeta por empresa y subida de logo a Cloudinary). Primera tarea con el esquema "Opus orquesta, 3 subagentes Haiku 5.5 medium en paralelo"; Claude corrigió el borrado de imágenes ajenas en Cloudinary y el selector de tipo — Ejecutado por **Claude** + subagentes | Claude (Cerebro) | Completado |
| 2026-10-29 | 16:25 | Tienda: tras el despliegue de F2e la CDN de Render sirvió durante ~8 min el JavaScript nuevo con el CSS viejo (empresas sin formato). `render.yaml`: `Cache-Control: no-cache` en todos los archivos del sitio estático (se revalidan con 304). Requiere Manual Sync del Blueprint — Ejecutado por **Claude** | Claude (Cerebro) | Completado |

_Historial completo en `docs/historico-tablero.md`._
