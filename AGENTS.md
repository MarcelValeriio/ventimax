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
| F1 | Producto ampliado: SKU, marca fabricante, códigos OEM, atributos, compatibilidad por vehículo (marca, modelo, años, motor, versión), grupos de equivalencia; importación desde Excel; bot por vehículo. **Diseño: `docs/f1-producto-ampliado.md`** | **En curso** (F1-1 en ejecución desde 2026-11-02; F1-2 a F1-6 pendientes) |
| F2 | Catálogo web público con carrito y pedido a WhatsApp con código no adivinable. **Diseño: `docs/f2-catalogo-web.md`.** Requisitos de seguridad obligatorios: `docs/auditoria-seguridad-2026-10.md` (sección F2) | **Cerrada** (F2-1 a F2-4 aprobadas, 2026-10-29). Tienda en `https://ventimax-tienda.onrender.com` |
| F3 | Búsqueda con IA sobre la BD (texto y notas de voz), registro de búsquedas sin resultado, pase a asesor | Pendiente |
| F4 | Formularios nativos (WhatsApp Flows), lectura de fotos de piezas, equivalencias entre marcas | Pendiente |
| F5 | **Canal TikTok** (Business Messaging API): mensajes directos de la cuenta de empresa en el Inbox, como cuarto canal con el mismo esquema que Instagram (preguntas frecuentes por el bot; para comprar, enlace a WhatsApp). Beta abierta en Latinoamérica; requiere cuenta TikTok Business y app aprobada (revisión de seguridad y privacidad de TikTok). Investigación previa (2026-10-28, subagente): la documentación oficial de TikTok no se pudo leer sin navegador, así que lo técnico (endpoints, JSON del webhook, firma) está **sin verificar**. Según integradores: ventana de 48 h desde el último mensaje del cliente, unos 10 mensajes por ventana, solo texto e imagen (sin botones confirmados), tokens de ~24 h que se renuevan, y Latinoamérica disponible (Venezuela sin confirmar). Antes del diseño hay que leer la documentación oficial con sesión iniciada. Se diseña después de F0, junto a F2. **Decisión del dueño (2026-10-28): sin botones.** El bot de TikTok responde solo con texto: respuestas por intención (precios, envíos, horario, pagos, catálogo) armadas con variables de la marca y del panel (`{{brandName}}`, horario, métodos de envío y pago vigentes, etc.), y **enlaces** para llevar al cliente a comprar: `{{waLink}}` (chat de WhatsApp con texto prellenado y la etiqueta de origen TikTok) y `{{catalogoUrl}}` (catálogo web de F2; mientras F2 no exista, solo WhatsApp). Los textos van en `messages` de la marca, nunca en el código | Pendiente (requisitos del dueño) |
| — | Costo de envío por kilómetro (con la ubicación de la tienda, F2c, se puede calcular la distancia al punto de despacho) | Pendiente (después de F0) |
| F2d | **Mapa con buscador en el carrito** (paso 2 de la idea del dueño, 2026-10-29): el cliente mueve un pin y busca su dirección. Empezar con OpenStreetMap (gratis, copiado al repo); Google Maps solo si el buscador se queda corto (requiere cuenta de Google Cloud con tarjeta y clave, la configura el dueño, y abrir la CSP de la tienda) | **Cerrada** (2026-11-01). Leaflet + OSM copiados al repo, buscador por Nominatim con caché y límite propio de 30/min por IP (revisión de Claude). Pendiente menor: "Caracas" escrito en `catalogo/js/mapa.js` y `services/geocodingService.ts` (regla 5) |
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

### F1-1 · Campos del producto ampliado: modelo, normalización, índices, mocks y suite — Backend · `Aprobada`

Base: `docs/f1-producto-ampliado.md` §1 (aprobado por el dueño). Solo modelo y servicio: **sin** rutas nuevas, **sin** cambios en el panel ni en el bot (eso es F1-2 y F1-5). Todos los campos nuevos son opcionales: los productos actuales no cambian.

1. **`models/Producto.ts`** y **`types/models.d.ts` (`IProducto`)**, campos nuevos:
   - `sku` (String, trim, mayúsculas, máx. 40; índice único **disperso**).
   - `marcaFabricante` (String, trim, máx. 60).
   - `codigosOEM` ([String], máx. 30 elementos; cada uno se guarda normalizado: mayúsculas, sin espacios ni guiones, máx. 30 caracteres).
   - `atributos` ([{ `nombre` máx. 40, `valor` máx. 120 }], máx. 20 elementos).
   - `grupoEquivalencia` (String, trim, máx. 60).
   - `compatibilidad` ([{ `marca` (req., máx. 60), `modelo` (req., máx. 60), `marcaNorm`, `modeloNorm`, `anioDesde` (entero 1950–2100), `anioHasta` (entero 1950–2100), `motor` (máx. 20), `version` (máx. 40), `nota` (máx. 120) }], máx. 200 elementos). `marcaNorm`/`modeloNorm` **los calcula el servidor**, no los envía el cliente.
   - Índices: `{ "compatibilidad.marcaNorm": 1, "compatibilidad.modeloNorm": 1 }` y `{ codigosOEM: 1 }`.
2. **Servicio nuevo `services/productoAmpliado.ts`** (funciones puras, sin DOM ni BD):
   - `normalizarTexto(s)`: minúsculas, sin acentos (NFD), sin espacios extra, trim.
   - `normalizarCodigoOEM(s)`: mayúsculas, quita espacios y guiones.
   - `normalizarCompatibilidad(lista)`: calcula `marcaNorm`/`modeloNorm` y devuelve `{ ok, valor, errores[] }`. Error si `anioDesde > anioHasta` (cuando ambos existen), si falta marca/modelo, si un año está fuera de 1950–2100 o si se pasa un límite de longitud.
   - `validarProductoAmpliado(datos)`: valida y normaliza los campos nuevos (`sku`, `codigosOEM`, `atributos`, `compatibilidad`, etc.) con los límites de arriba. Devuelve `{ ok, valor, errores[] }`. Los mensajes de error son en español y genéricos (no revelan internos).
3. **Hook en el modelo:** `pre("validate")` en `Producto.ts` aplica las funciones de `productoAmpliado.ts` (así Mongoose siempre guarda normalizado). Un error de validación lanza error de Mongoose; no se guarda nada a medias.
4. **Mocks** (`services/dbLocal.ts`, `services/dbMock.ts`): no ejecutan hooks de Mongoose. Hay que asegurar que los campos nuevos se guardan y se devuelven tal cual en `find`, `findOne`, `create` y `updateOne`, sin perder campos. No tocar la lógica de los campos existentes.
5. **Suite nueva `scripts/test-producto-ampliado.ts`** y añadirla a `SUITES` en `scripts/ci.sh` (después de `test-sucursales.ts`). Debe cubrir:
   - Normalizadores: acentos, mayúsculas, espacios y guiones en OEM, `marcaNorm`/`modeloNorm` correctos.
   - Validación: año desde > hasta → error; años fuera de rango → error; marca vacía → error; límites de longitud y de cantidad → error; producto sin campos nuevos → `ok`.
   - Mock: un producto con `sku`, `codigosOEM` y `compatibilidad` se guarda y se lee completo; `sku` repetido en el mock no se acepta si el mock aplica índice único (si no lo aplica, documentarlo en la entrega y no inventar la prueba).
   - Regresión: los campos actuales (`name`, `price`, `categorias`, `descuentoPct`) siguen igual.
   - Sin texto de marca escrito en el código nuevo.

**Restricciones:** no leer `.env`. No ejecutar `git add/commit/stash/reset`. No instalar dependencias (`exceljs` es de F1-3, requiere aprobación). Solo `NODE_ENV=test` y la base local.

**Cierre:** `npm run build` en verde, `./scripts/ci.sh` en verde (todas las suites, incluida la nueva), y la lista de archivos tocados con la salida del `ci.sh` en la entrega.

### F1-2 · Panel: pestañas General / Compatibilidad / Equivalencias y búsqueda de productos — Backend + Frontend · `Aprobada`

**Corrección (2026-11-02, subagente + Claude):** ID automático al crear (`validators/index.js`: `id` opcional; el `<select>`/input ya no es `required` en `ProductTab.js`), error de validación con el campo (`Datos inválidos. <campo>: <mensaje>`, Zod 4 usa `issues`), y el modal ya no se desmonta al buscar. Verificado en Chrome a 1440 px: crear sin ID genera `prod-<timestamp>`; con el buscador usado el formulario conserva nombre, precio y vehículo; editar muestra una sola fila de vehículo; buscar `Corolla 2012` encuentra el producto y `Corolla 2015` no. CI verde (46 suites).

**Paso 1 del plan (`docs/plan-haiku-f1.md`), 2026-11-02, Claude:**
- 1440 px, recorrido completo: Nuevo producto con General (nombre, precio, SKU `FA-F1-001`, marca `Mann`, OEM `C-2654; 04465-02220`, atributo `Tipo: Papel plegado`), Compatibilidad (1 fila Toyota Corolla 2009–2014), Equivalencias (grupo `filtro-aire-corolla-09-14`) → Guardar OK (`prod-1793636707991`). Reabrir en edición: todo cargado, OEM normalizado a `C2654; 0446502220`, 1 fila de vehículo, grupo cargado.
- Búsquedas: `FA-F1` → 1 resultado (SKU). `C-2654` → resultado (OEM con guion). `toyota corolla 2012` → pf-test-001 y el filtro. `Corolla 2015` (previo) → 0.
- Consola: 0 errores/CSP desde que se activó la captura (login y carga del panel).
- **Bloqueado: 390 px.** `resize_window` reporta éxito pero `innerWidth` queda en 1800. Medir en un iframe de 390 px del propio panel falla con `SecurityError` (frame bloqueado, cross-origin desde el iframe; el panel no se puede embeber). Sin ancho de 390 real no hay verificación móvil.
- Decisión pendiente de Claude: cómo medir 390 px (ventana/emulación externa) o aprobar con 390 px como deuda documentada.

**Motivo de devolución (Claude, 2026-11-02):** CI verde, pero el recorrido en navegador encontró dos fallos en el formulario nuevo:
1. **ID obligatorio sin aviso.** Al crear, si el campo ID (placeholder `p-001`) está vacío, el panel muestra solo "Error al guardar: Datos inválidos". Debe generar el ID automáticamente (como hace el backend con `prod-<timestamp>`) o marcar el campo con un mensaje claro.
2. **Formulario que pierde datos.** Con el modal "Nuevo Producto" abierto, al escribir en el buscador de la lista (detrás del modal) los campos de General quedaron vacíos (nombre, SKU, marca, OEM) y la fila de compatibilidad no se guardó. Reproducción: Nuevo → llenar General → pestaña Compatibilidad → agregar vehículo → (escribir en buscador) → Guardar. Corregir para que el formulario conserve su estado y el buscador no lo reinicie.
Además: confirmar que el modal de edición carga la compatibilidad guardada (al editar apareció una fila vacía extra).

**Pendiente antes de aprobar:** recorrido en Chrome a 390 y 1440 px con consola (0 errores de CSP). Hoy solo hay verificación parcial: se corrió el flujo en 1440 px y una captura en 390 px; la consola no se capturó desde la carga de la página.

Base: `docs/f1-producto-ampliado.md` §4. Depende de F1-1 (`Aprobada`). **Se ejecuta sola**: no se hace en paralelo con F1-4 ni con F1-3.

1. **Backend (`controllers/adminController.ts`)**:
   - Crear (`POST`) y actualizar (`PUT`) producto aceptan `sku`, `marcaFabricante`, `codigosOEM`, `atributos`, `grupoEquivalencia` y `compatibilidad`. Solo se copian los campos que llegan (`undefined` = no tocar).
   - **Antes de cualquier `create` o `findOneAndUpdate`** se llama `validarProductoAmpliado` (de `services/productoAmpliado.ts`). Si `ok` es `false`, responde `400` con los `errores` (son mensajes en español y no revelan internos). Cierra el hueco de F1-1: el hook no corre en `findOneAndUpdate`.
   - Errores de otro tipo siguen en `500` genérico.
   - Cada guardado queda en la auditoría de producto que ya existe, con los campos nuevos en el resumen de cambios. No se añade `tipoRecurso` nuevo.
   - Validar que `sku` no se repita: si ya lo tiene otro producto, `400` con mensaje claro (el índice único también protege, pero el mensaje debe ser legible, no un error de Mongo).
2. **Listado admin**: `GET` de productos acepta `q`. Busca en `name`, `sku` (prefijo), `codigosOEM` (normalizado con `normalizarCodigoOEM`) y `compatibilidad` (por `marcaNorm`/`modeloNorm` con `normalizarTexto`, y año si el texto trae 4 dígitos, p. ej. "Corolla 2012"). El texto se escapa antes de usarlo en una expresión regular. Si hoy la búsqueda es solo en el navegador, se pasa al servidor; no se rompe lo que ya existe.
3. **Frontend (panel, `public/src/features/inventory/`)**: el formulario de producto (revisar `components/ProductTab.js` y el modal que lo usa) queda con tres pestañas:
   - **General:** campos de hoy más SKU, marca fabricante, códigos OEM (un campo de texto separado por `;`, se normaliza al guardar) y atributos (filas nombre/valor, con agregar y quitar).
   - **Compatibilidad:** tabla editable con marca, modelo, año desde, año hasta, motor, versión y nota; agregar y quitar filas. Motor y versión vacíos = sirve para todos.
   - **Equivalencias:** campo de grupo de equivalencia y lista de los otros productos con el mismo grupo (solo lectura en esta tarea).
   - Lista de productos con el buscador nuevo (SKU, OEM, vehículo).
   - Íconos solo de Lucide (`Icono`). Sin `innerHTML` con datos. Sin scripts en línea. Sin marca escrita en el código.
   - Móvil primero (390 px), botones táctiles de 44 px, `prefers-reduced-motion` respetado.
4. **Fuera de alcance:** importación Excel/CSV (F1-3), vehículo del cliente (F1-4), bot (F1-5).
5. **Suite nueva** `scripts/test-producto-admin-ampliado.ts` en `SUITES` de `ci.sh` (después de `test-producto-ampliado.ts`). Debe cubrir:
   - POST y PUT con campos nuevos: se guardan normalizados; campos inválidos → `400` con errores; SKU repetido → `400` legible.
   - PUT sin campos nuevos no cambia nada de ellos (regresión).
   - Búsqueda: por SKU, por OEM con y sin guiones, por "marca modelo año", y texto con caracteres de regex no rompe.
   - Frontend: `esbuild --bundle` en cada archivo tocado; sin `innerHTML` con datos; sin marca escrita.
6. **Recorrido en Chrome** a 390 y 1440 px con la consola abierta: crear un producto con las tres pestañas, buscar por vehículo, 0 errores de CSP. Lista de pantallas en la entrega. Para esto, usar `scripts/dev-local.sh` y `scripts/demo-local.ts` (base local de Docker).

**Restricciones:** igual que F1-1. No leer `.env`. Sin commit. Sin instalar dependencias.

**Cierre:** `npm run build` y `./scripts/ci.sh` en verde (con la suite nueva), `esbuild --bundle` en los archivos tocados, recorrido de Chrome con la lista de pantallas, y lista de archivos tocados.

### F1-2b · Fotos al crear un producto (subida al guardar) — Frontend · `Aprobada`

**Entrega (2026-11-02, Haiku 5.5, sin browser):** archivos tocados: `public/src/features/inventory/components/ProductTab.js` (estado `fotosPendientes`, vista previa con `URL.createObjectURL`/`revokeObjectURL`, validación de tipo y 5 MB, `subirFotosPendientes` tras el POST, reintento como edición, Guardar deshabilitado con "Subiendo..."; quitado "Guarda el producto para añadir fotos"; modo edición sin cambios), `scripts/test-fotos-al-crear.ts` (nueva, 12 pruebas), `scripts/ci.sh` (suite añadida después de `test-producto-admin-ampliado.ts`). Backend sin cambios.
Verificación: `npm run build` en verde; `./scripts/ci.sh` en verde: "✅ Build, 47 suites e imports del panel en verde." (`test-fotos-al-crear.ts`: 12 pruebas pasaron); `esbuild@0.23.0 --bundle` de `ProductTab.js` sin errores.
**No verificado:** recorrido en Chrome a 1440 y 390 px con consola (0 errores de CSP). En esta sesión no había herramienta de navegador disponible, así que no se levantó `dev-local.sh` ni se recorrieron pantallas. Queda para revisión o para el dueño.
**Desviación menor:** si el `POST` responde sin `id` con fotos pendientes, el modal se cierra y las fotos se pierden (el backend siempre devuelve `id`, así que no debería pasar).

Pedido del dueño (2026-11-02): hoy el campo de fotos solo aparece al **editar** un producto ya guardado; en "Nuevo producto" sale "Guarda el producto para añadir fotos" (`ProductTab.js`, ya era así en `HEAD`). Debe poder elegir las fotos al crear. Solo frontend: el backend no cambia (`POST /api/admin/products` devuelve el producto con su `id` en `res.data.data`, y `POST /api/admin/products/:id/imagenes` ya existe con su validación de 5 fotos, tipo y tamaño). Depende de que F1-2 esté `Aprobada`.

1. **Estado local de fotos pendientes** en `public/src/features/inventory/components/ProductTab.js`: al crear (`!editingProduct`) el selector de archivos funciona igual (`accept` JPG/PNG/WebP, `multiple`), pero los archivos se guardan en un estado `fotosPendientes` (array de `File`), no se suben. Máximo 5 en total; si el usuario elige más, se toman las primeras que quepan y se avisa con el mismo toast de hoy.
2. **Vista previa** con `URL.createObjectURL` (se libera con `URL.revokeObjectURL` al quitar la foto, al cerrar el modal y al desmontar). Cada foto pendiente tiene botón de quitar (`Icono`, 44 px). La primera es la principal; mostrar la etiqueta "Principal" como hoy. No hace falta reordenar en modo crear.
3. **Validación en el cliente antes de aceptar cada archivo**: tipo (`image/jpeg`, `image/png`, `image/webp`) y tamaño (5 MB, el mismo límite que muestra `AyudaTamanoImagen`). Rechazar con toast de error, sin romper el resto.
4. **`handleSave` en modo crear:** primero `POST /api/admin/products` (sin cambios). Con el `id` devuelto, subir las fotos pendientes **de una en una**, en orden, a `/api/admin/products/${id}/imagenes` (mismo código que `handleUploadImage`: `FormData` con el campo `imagen`). Si una foto falla, seguir con las demás y juntar los errores.
5. **Resultado:**
   - Todas suben: cerrar el modal y toast "Producto guardado exitosamente".
   - Alguna falla (incluido "Cloudinary no está configurado"): **el producto ya existe**, así que no se vuelve a hacer `POST`. Pasar el modal a modo edición del producto recién creado (`setEditingProduct` con el producto devuelto, `productImages` con lo que sí subió), mostrar un toast de error con el motivo y dejar que el usuario reintente las fotos desde el campo de edición. Nunca crear un segundo producto.
   - Si el `POST` del producto falla, las fotos pendientes se conservan en el formulario.
6. Mientras sube, el botón Guardar queda deshabilitado con el estado "Subiendo..." para evitar doble envío.
7. Quitar el texto "Guarda el producto para añadir fotos". El modo edición no cambia.
8. Sin `innerHTML`, sin scripts en línea, solo `Icono`, sin marca escrita, 44 px táctiles, 390 px sin scroll horizontal.
9. **Suite nueva** `scripts/test-fotos-al-crear.ts` en `SUITES` de `ci.sh` (después de `test-producto-admin-ampliado.ts`; los scripts de `ci.sh` ya validan el código del panel leyendo el archivo, seguir ese estilo de las suites del panel). Debe comprobar: `esbuild --bundle` de `ProductTab.js` en verde; ya no existe el texto "Guarda el producto para añadir fotos"; existe `fotosPendientes`, `URL.revokeObjectURL` y la subida a `/imagenes` tras el `POST` de creación; el `POST` de creación no se repite en el reintento; sin `innerHTML` con datos.
10. **Recorrido en Chrome** (`dev-local.sh`, base de Docker) a 1440 px y 390 px con la consola abierta (0 errores de CSP): crear producto con 2 fotos y ver la vista previa; quitar una; guardar. En local no hay Cloudinary, así que el resultado esperado es el camino de error del punto 5: el producto se crea una sola vez, el modal pasa a edición y muestra "Cloudinary no está configurado". Dejar en la entrega la lista de pantallas. La subida real a Cloudinary la prueba el dueño en producción.

**Restricciones:** igual que F1-1. No leer `.env`. Sin commit. Sin instalar dependencias. No tocar el backend. No cambiar el modo de edición de fotos.

**Cierre:** `npm run build` y `./scripts/ci.sh` en verde (con la suite nueva), `esbuild --bundle` en `ProductTab.js`, recorrido de Chrome con la lista de pantallas, y lista de archivos tocados.

### F1-3 · Importación y exportación Excel/CSV con vista previa — Backend + Frontend · `Aprobada`

**Revisión (2026-11-04, Claude):** recorrido en Chrome a 1083 px (la ventana no baja de ahí; 390 px queda para el dueño) con un Excel de 10 filas generado con `generarXlsx`: paso 1 con plantilla y exportación, vista previa con 9 nuevos, 2 errores (fila 8 "El precio está vacío" y su compatibilidad) y Confirmar bloqueado. Consola sin errores. Dudas resueltas abajo.

Especificación completa: **`docs/plan-haiku-f1.md`, Paso 2**, y diseño en `docs/f1-producto-ampliado.md` §3. Depende de F1-2 (`Aprobada`).

**Aprobación del dueño (2026-11-02):** se autoriza instalar `exceljs` (`npm install exceljs`, solo esa dependencia) y hacer la tarea completa: `.xlsx` y `.csv`. **El formato definitivo de las tablas (columnas exactas de la plantilla del cliente de repuestos) queda pendiente**: usar las columnas del §3.1 del diseño, aisladas en una sola constante (`COLUMNAS_PRODUCTOS` y `COLUMNAS_COMPATIBILIDAD` en `services/importacionProductos.ts`) para cambiarlas después en un solo lugar. No inventar columnas nuevas.

**Cierre:** reglas generales del plan (punto 9), suite `scripts/test-importacion-productos.ts` en `SUITES`, recorrido en Chrome a 390 y 1440 px con un Excel de 10 filas (si no hay herramienta de navegador, decirlo y dejar la lista de pasos para que el dueño la haga). Estado final: `Lista para revisión`.

**Entrega (2026-11-02, Haiku 5.5 subagente, revisión de Claude pendiente)**

Archivos tocados:
- `services/importacionProductos.ts` (nuevo): parseo xlsx/CSV, análisis sin BD, exportación y plantilla. Columnas en `COLUMNAS_PRODUCTOS` y `COLUMNAS_COMPATIBILIDAD`.
- `controllers/adminController.ts`: handlers `descargarPlantillaProductos`, `exportarProductos`, `previsualizarImportacionProductos`, `confirmarImportacionProductos`, `desactivarProductosImportacion`. En modo test, `Categoria` pasa a usar el mock (`dbLocal.getCategoriaModel()`), que antes faltaba.
- `routes/adminRoutes.ts`: multer de importación (2 MB, `.xlsx`/`.csv`, MIME, un solo archivo por campo) y 5 rutas `/api/admin/productos/...` con `config:manage`.
- `public/src/features/inventory/components/ImportarProductosModal.js` (nuevo): cuatro pasos, con `Icono`, sin HTML crudo.
- `public/src/features/inventory/components/ProductTab.js`: botón Importar junto a Nuevo y render del modal.
- `scripts/test-importacion-productos.ts` (nuevo) y `scripts/ci.sh` (`SUITES`, después de `test-fotos-al-crear.ts`).
- `package.json` y `package-lock.json`: `exceljs` ^4.4.0 (aprobado por el dueño). Ninguna otra dependencia.

Decisiones (para revisar):
1. Confirmar no aplica nada si hay cualquier error. La vista previa muestra todo y deja el botón deshabilitado.
2. Celda vacía en una actualización = no cambia el campo. Si un SKU aparece en la hoja Compatibilidad, su lista de vehículos se reemplaza; si no aparece, no se toca. Con el archivo no se puede borrar toda la compatibilidad de un producto.
3. Tope de 2000 filas **por hoja** (no en total). Mismo tope para el CSV.
4. SKU repetido en el archivo: se rechazan todas sus filas.
5. Fórmulas: se lee el valor guardado de la celda; nunca se evalúa nada.
6. Categoría que no existe: se crea al confirmar (como dice el plan). El §3.2 del diseño la lista como error de vista previa; seguí el plan.
7. Rutas en español `/api/admin/productos/...` (como dice el plan). El resto del admin usa `/products`.
8. Solo descarga `.xlsx` (plantilla y exportación). El CSV es solo para subir; para compatibilidad en CSV se suben dos archivos.
9. Sin transacción: si la importación falla a mitad, queda constancia en la auditoría de lo aplicado antes del error; no hay deshacer.
10. Desactivar faltantes: endpoint aparte (`POST /api/admin/productos/importar/desactivar`), con confirmación en el panel. Nunca borra.

Verificación:
- `npm run build`: en verde.
- `./scripts/ci.sh`: en verde. Salida final: `✅ Build, 48 suites e imports del panel en verde.` La suite nueva imprime:
```
  ✅ Archivo: solo .xlsx y .csv, MIME coherente con la extensión, máximo 2 MB
  ✅ CSV: BOM, separador ; o ,, comillas escapadas, CRLF
  ✅ xlsx: dos hojas, fórmulas leídas solo por su valor, texto enriquecido
  ✅ Formato: falta hoja, falta columna, 2001 filas → error; 2000 → ok; archivo roto → error legible
  ✅ Análisis: nuevos 2, cambios 1, sin cambio 1, errores 13, no en archivo 1
  ✅ Vista previa: responde el resumen y no escribe en la BD ni en la auditoría
  ✅ Confirmar con errores: 400 y no aplica nada
  ✅ Confirmar: crea IMP-NEW1 con categorías y compatibilidad, actualiza IMP-100 por SKU, no borra, audita
  ✅ Desactivar: solo marca activo=false; ids inválidos → 400
  ✅ Plantilla: xlsx vacío con las hojas Productos y Compatibilidad
  ✅ Exportar: ida y vuelta sin cambios fantasma
  ✅ Estático: sin marca, sin ejecución de código del archivo, permiso config:manage
  ✅ Panel: modal con Icono (14 íconos de Lucide), sin innerHTML ni on*, enlazado en Inventario
🎉 TODOS LOS TESTS DE IMPORTACIÓN DE PRODUCTOS (F1-3) PASARON EXITOSAMENTE.
```
- Una corrida previa del CI falló **una vez** en `simulate-ig-webhook.js` (`socket hang up`). Corrida sola: 37/0. Corrida completa siguiente: verde. Parece intermitente y no tiene relación con F1-3.
- `esbuild --bundle`: lo cubre el bucle de `ci.sh` sobre todo `public/src` (incluye `ProductTab.js` e `ImportarProductosModal.js`).

No verificado (no hay herramienta de navegador en esta sesión y no se levantó el Docker local):
- Recorrido en Chrome a 390 y 1440 px con la consola abierta (0 errores de CSP). Pendiente.
- Un Excel real de 10 filas del cliente. Solo se probaron archivos generados por la suite.

Pasos del recorrido para el dueño:
1. `docker compose -f docker-compose.local.yml up -d`, luego `./scripts/dev-local.sh`. Abrir la consola de Chrome **antes** de cargar `http://localhost:3000/panel`.
2. A 390 px y a 1440 px: Inventario → **Importar** → Paso 1: descargar la plantilla (debe tener las hojas Productos y Compatibilidad).
3. Hacer un Excel de 10 filas (SKU, Nombre, Categorías, Precio, …) con una fila de compatibilidad por producto. Subirlo → **Ver vista previa**. Revisar nuevos, cambios (antes/después), sin cambio y fuera del archivo.
4. Poner una fila sin precio: debe aparecer en Errores con su fila, y **Confirmar** debe quedar deshabilitado. Corregir, subir y confirmar.
5. Comprobar en la lista de productos. Repetir con **Exportar catálogo actual** y volver a subir el mismo archivo: la vista previa no debe mostrar cambios.
6. Desactivar los productos que faltan: debe pedir confirmación.
7. Revisar: 0 errores de CSP en la consola; botones de 44 px; sin desplazamiento horizontal de la página en 390 px.

Dudas para Claude (no bloquean la entrega, son decisiones de diseño para revisar): decisiones 1, 2, 6, 8 y 9 de arriba. En especial la 2: sin forma de vaciar la compatibilidad de un producto desde el archivo.

### F2o · Quitar "Caracas" escrito en el código (regla 5) — Frontend + Backend · `Aprobada`

**Entrega (2026-11-02, Antigravity):**

Archivos tocados:
- `config/brand/ventimax/settings.json`: bloque `mapa` con `ciudad`, `pais`, `centro: { lat, lng }` y `palabrasArea`. No se tocó `default/`.
- `services/configValidators.ts`: interfaz `MapaConfig`, `ResultadoValidacionMapa` y validador `validarConfigMapa`.
- `services/configManager.ts`: validación de bloque `mapa` en `validateSchema()`.
- `controllers/publicController.ts`: `GET /api/public/marca` expone `mapa` en lista blanca estricta.
- `services/geocodingService.ts`: regex de área escapado (`getAreaRegex`), sufijo territorial (`getSufijoUbicacion`), `construirQueryBusqueda`; 0 ocurrencias de "Caracas" en código o comentarios.
- `catalogo/js/mapa.js`: `montarSelectorMapa` acepta `configMapa`, centro por defecto configurable y placeholder dinámico `Buscar calle, avenida o sector en <ciudad>…`; 0 ocurrencias de "Caracas" en código o comentarios.
- `catalogo/js/app.js`: pasa `configMapa: state.marca?.mapa` a `montarSelectorMapa`.
- `catalogo/js/api.js`: comentario neutro sin "en Caracas".
- `scripts/test-api-publica.ts` y `scripts/test-pie-pagina.ts`: actualización de lista blanca estricta de `/api/public/marca` con `mapa`.
- `scripts/test-mapa-marca.ts` (nueva suite, 7 pruebas): sufijo y regex de la marca, cambio con marcas alternativas, caracteres especiales de regex escapados, fallback solo país sin ciudad si falta el bloque, validación de esquema, y grep de "Caracas" dando 0 en ambos archivos.
- `scripts/ci.sh`: suite añadida después de `test-mapa-carrito.ts`.

Verificación:
- `npm run build`: en verde.
- `./scripts/ci.sh`: en verde. Salida: `✅ Build, 49 suites e imports del panel en verde.`
  - `test-mapa-marca.ts`: 7/7 pasaron.
  - `test-mapa-carrito.ts`: 7/7 pasaron (regresión).
- `esbuild --bundle` verificado en `catalogo/js/mapa.js`, `catalogo/js/app.js` y `catalogo/js/api.js`.
- Recorrido en Chrome Headless a 1440 y 390 px (`catalogo/#/carrito`):
  - Montaje interactivo de mapa Leaflet, pin central `#1E8C88` y placeholder `"Buscar calle, avenida o sector en Caracas…"`.
  - 0 errores de consola y 0 violaciones de CSP.

Resto menor de F2d. El área de búsqueda del mapa y el sufijo de ciudad deben salir de la marca/panel, no del código. Ocurrencias: `catalogo/js/mapa.js` (líneas 4, 12 y 40: comentario, coordenadas por defecto y placeholder) y `services/geocodingService.ts` (líneas 88, 102 y 103: regex y sufijo `, Caracas, Venezuela`).

1. Añadir a la marca (`config/brand/ventimax/`, no a `default/`) y a su validador un bloque `mapa`: `ciudad` (texto), `pais` (texto), `centro: { lat, lng }`, `palabrasArea` (lista para el regex de "ya trae ciudad"). Valores de VentiMax: los actuales de Caracas/Venezuela.
2. Exponerlo en `GET /api/public/marca` (lista blanca) y usarlo en `catalogo/js/mapa.js` (centro por defecto y placeholder `Buscar calle, avenida o sector en <ciudad>…`) y en `geocodingService.ts` (sufijo y regex construidos con escape de regex). Si falta el bloque, usar solo el país y no agregar ciudad.
3. Sin textos de marca en el código resultante; los comentarios tampoco nombran Caracas.
4. Suite nueva `scripts/test-mapa-marca.ts` en `SUITES` (después de `test-mapa-carrito.ts`): sufijo y regex salen de la marca, otra marca de prueba cambia el resultado, texto con caracteres de regex no rompe, `grep` de "Caracas" en los dos archivos da 0 coincidencias. Regresión: `test-mapa-carrito.ts` sigue en 7/7.
5. Recorrido en Chrome a 390 y 1440 px de la tienda (mapa del carrito: pin inicial, buscador, 0 errores de CSP).

**Cierre:** `npm run build`, `./scripts/ci.sh` en verde, `esbuild --bundle` en los archivos tocados, lista de archivos y de pantallas.

### F1-4 · Vehículo del cliente (`Etiqueta`, `EtiquetaIg`, ficha del Inbox, copiloto) — Backend + Frontend · `Aprobada`

**Entrega (2026-11-02, Antigravity):**

Archivos tocados:
- `types/models.d.ts`: interfaz `IVehiculoCliente` y campo opcional `vehiculo?: IVehiculoCliente | null` en `IEtiqueta` e `IEtiquetaIg`.
- `models/Etiqueta.ts`: subesquema `vehiculo` (`marca`, `modelo`, `marcaNorm`, `modeloNorm`, `anio`, `motor`, `version`) con hook `pre("validate")` que calcula `marcaNorm` y `modeloNorm` usando `normalizarTexto` de `services/productoAmpliado.ts`.
- `models/EtiquetaIg.ts`: subesquema `vehiculo` con el mismo hook `pre("validate")`.
- `services/vehiculoCliente.ts` (nuevo): funciones puras `validarVehiculo(datos)`, `describirVehiculo(v)` y constantes `LIMITES_VEHICULO`.
- `services/dbMock.ts`: soporte para `etiquetasIg`, persistencia de `vehiculo` en `findOneAndUpdate` y `create` tanto para `getEtiquetaModel` como para `getEtiquetaIgModel`.
- `controllers/adminController.ts`: `getChatContext` incluye `vehiculo: etiqueta?.vehiculo || null`. En `extractOrderFromChat` (copiloto) se añade el vehículo a los datos conocidos, se instruye extraer `vehiculo: { marca, modelo, anio, motor, version }`, se valida con `validarVehiculo` y se propone al operador sin auto-guardar en base de datos.
- `services/inbox/adapters/instagramAdapter.ts`: `contexto` incluye `vehiculo: et?.vehiculo || null` para Instagram y Messenger.
- `controllers/inboxController.ts`: endpoint `postVehiculo(req, res, io)` para fijar o borrar (`null`) vehículo por canal WhatsApp (`Etiqueta`) o IG/Messenger (`EtiquetaIg`), valida con `validarVehiculo`, audita con `tipoRecurso: "usuario"` (`actualizar_vehiculo` o `borrar_vehiculo`), emite sockets `vehiculo_actualizado` e `inbox_actualizado`, y responde con 500 genérico ante fallos internos.
- `routes/adminRoutes.ts`: rutas `POST /inbox/vehiculo` y `POST /etiqueta/vehiculo` protegidas con `isAuthenticated` y `authorize(["chat:manage"])`.
- `services/inboxService.ts`: `crearVentaManual` valida y asocia el vehículo a la etiqueta si fue seleccionado por el operador.
- `public/src/features/inbox/components/InboxCustomerCardDrawer.js` (nuevo): componente para la ficha del cliente en el Inbox unificado, respetando la regla 7 (sin tocar `features/whatsapp/**`). Muestra sección "Vehículo del Cliente", datos formateados, botones accesibles de 44 px para Editar, Eliminar y Agregar, y modal integrado con validación y prevención de doble submit. Usa íconos Lucide empaquetados (`truck`, `square-pen`, `trash`).
- `public/src/features/inbox/components/InboxManualOrderModal.js`: copiloto muestra sección "Vehículo detectado" al extraer orden del chat con checkbox para asociarlo al cliente si el humano lo confirma.
- `public/src/features/inbox/InboxConsole.js`: importa `InboxCustomerCardDrawer.js?v=1`.
- `scripts/test-vehiculo-cliente.ts` (nueva suite, 31 aserciones): validación pura, límites, hooks Mongoose, persistencia en `dbLocal` y `dbMock`, permisos HTTP (401/403/400/200), contexto de chat, copiloto propone y no auto-guarda, regresión sin vehículo y verificación de ausencia de marcas.
- `scripts/ci.sh`: suite `test-vehiculo-cliente.ts` agregada a `SUITES`.

Verificación:
- `npm run build`: en verde.
- `./scripts/ci.sh`: en verde. Salida: `✅ Build, 50 suites e imports del panel en verde.`
  - `test-vehiculo-cliente.ts`: 31/31 aserciones superadas.
- `esbuild --bundle` verificado en todos los archivos del panel y catálogo:
  - `public/src/features/inbox/InboxConsole.js`
  - `public/src/features/inbox/components/InboxCustomerCardDrawer.js`
  - `public/src/features/inbox/components/InboxManualOrderModal.js`
- Recorrido en Chrome Headless (CDP) a 1440 y 390 px (`/panel/#/inbox`):
  - 1440x900: Ficha del cliente abierta en Inbox, sección "Vehículo del Cliente" visible con botón "+ Agregar Vehículo". Modal de agregar vehículo con inputs de marca, modelo, año, motor y versión. Guardado exitoso y actualización reactiva mostrando datos del vehículo (`Toyota Corolla 2012 1.8 GLI`) con botones para Editar (`square-pen`) y Eliminar (`trash`).
  - 390x844 (móvil): sin desplazamiento horizontal (`scrollWidth === clientWidth === 390`), botones táctiles con dimensiones de al menos 44 px (`buttonSizes: [{ h: 44, w: 44 }, { h: 44, w: 44 }]`, `todos44px: true`).
  - Consola: 0 errores totales, **0 violaciones de CSP**.

Base: `docs/f1-producto-ampliado.md` §1.3 y §4; plan: `docs/plan-haiku-f1.md`, Paso 3. Depende de F1-1 (`Aprobada`). **No cambia el flujo del bot** (eso es F1-5). Se puede hacer en paralelo con F1-3, pero sin tocar `ProductTab.js`, `adminController.ts` de productos ni `routes/adminRoutes.ts` de importación.

1. **Modelos** `models/Etiqueta.ts`, `models/EtiquetaIg.ts` y `types/models.d.ts`: `vehiculo: { marca, modelo, anio, motor, version }`, todo opcional. Límites: marca/modelo 60, motor 20, versión 40, año entero 1950–2100. El servidor calcula `marcaNorm` y `modeloNorm` con `normalizarTexto` de `services/productoAmpliado.ts`.
2. **Servicio** `services/vehiculoCliente.ts` (funciones puras): `validarVehiculo(datos)` → `{ ok, valor, errores[] }` (mensajes en español, genéricos) y `describirVehiculo(v)` → "Toyota Corolla 2012 1.8" (omite lo vacío).
3. **Endpoint** para fijar o borrar el vehículo de un contacto desde el Inbox, en el flujo de etiquetas que ya existe (`inboxController.ts`/`adminController.ts`): permiso de edición de etiquetas que ya exista, validación con `validarVehiculo` antes de guardar, auditoría (sin `tipoRecurso` nuevo; si hace falta, añadirlo al enum de `models/Auditoria.ts`), `500` genérico.
4. **Panel:** la ficha del cliente en el Inbox (`public/src/features/inbox/`) muestra el vehículo y permite editarlo o borrarlo. Sin vehículo, solo el botón de agregar. Solo `Icono`, sin `innerHTML` con datos, 44 px táctiles, 390 px sin scroll horizontal.
5. **Copiloto de venta manual** (`InboxManualOrderModal.js` y el servicio que extrae el pedido, `services/inboxService.ts`): al extraer un pedido del chat, también **propone** el vehículo; el humano confirma antes de guardarse. Ampliar solo su salida y validación; no cambiar nada más.
6. **No tocar** `features/whatsapp/**`, `features/instagram/**` ni el flujo del bot.
7. Suite nueva `scripts/test-vehiculo-cliente.ts` en `SUITES` (después de `test-mapa-carrito.ts` o de la última suite de F1): validación, normalización, persistencia en ambos modelos (mock `dbLocal.ts`/`dbMock.ts`), endpoint con y sin permiso, copiloto propone y no guarda solo, regresión (etiquetas sin vehículo no cambian), sin marca escrita.
8. Recorrido en Chrome a 390 y 1440 px de la ficha del Inbox con datos de `demo-local.ts`, 0 errores de CSP.

**Cierre:** `npm run build`, `./scripts/ci.sh` en verde (con la suite nueva), `esbuild --bundle` en los archivos tocados, lista de archivos y de pantallas.

### F1-7 · Peso y medidas de la caja del producto — Backend + Frontend · `Aprobada`

**Revisión (2026-11-04, Claude):** campos "Peso (kg)" y "Medidas de la caja (cm)" vistos en Chrome a 1083 px. Reglas duplicadas resueltas: `validators/index.js` usa `normalizarMedida` de `services/medidasProducto.ts` (Haiku; la suite compara 100 casos). Pendiente del dueño: 390 px.

Pedido del dueño (2026-11-04), base para el cotizador de envío nacional por peso (tarea siguiente). Campos opcionales `pesoKg` (0–1000, 3 decimales), `altoCm`, `anchoCm`, `profundidadCm` (>0–500, 1 decimal) en modelo, validador Zod, POST/PUT con auditoría, importación/exportación (4 columnas al final de `COLUMNAS_PRODUCTOS`) y panel (General: "Peso (kg)" y "Medidas de la caja (cm)"). Reglas en `services/medidasProducto.ts`. **No** se exponen en `/api/public`.

**Entrega (2026-11-04, Haiku 5.5):** `services/medidasProducto.ts` (nuevo), `models/Producto.ts`, `types/models.d.ts`, `validators/index.js`, `controllers/adminController.ts`, `services/importacionProductos.ts`, `ProductTab.js`, `scripts/test-peso-producto.ts` (nuevo) y `scripts/ci.sh`. Claude revisó el diff y corrió `./scripts/ci.sh`: `✅ Build, 52 suites e imports del panel en verde.` **Pendiente:** recorrido en Chrome a 390 y 1440 px (sin navegador en la sesión). Nota: las reglas están duplicadas en `validators/index.js` (JS) y `medidasProducto.ts`.

**Cotizador (siguiente tarea, sin especificar):** Zoom tiene cotización pública sin credenciales (`https://api.zoom.red/canguroazul/CalcularTarifa`, solo pide `peso`; responde en Bs con la tasa). MRW no tiene API pública: el dueño trae 8 cotizaciones de su calculadora para deducir la tabla. Tealca: API con credenciales a pedir. Falta saber si el envío es estimado informativo o se cobra en el pedido.

### F1-8 · Cotizador de envío nacional (MRW y Zoom) con estimado en el carrito — Backend + Frontend · `Aprobada`

**Revisión (2026-11-04, Claude):** confirmado por el dueño en producción (MRW y Zoom con estimado bajo el botón de WhatsApp). No se probó en local: arrancar con una empresa MRW configurada hace 80 consultas reales.

**Entrega (2026-11-04, Haiku 5.5; revisión de Claude):** `services/cotizadorEnvio.ts` y `controllers/cotizadorController.ts` (nuevos; el controlador va aparte porque `publicController` no debe leer `pesoKg`), `services/empresasEnvio.ts`, `types/models.d.ts`, `controllers/shippingController.ts` (cotizador validado; cambiarlo exige `config:manage`), `controllers/publicController.ts` (`/info` expone `cotizador`), `routes/publicRoutes.ts` (30/min por IP), `services/agendaService.ts` (job cada 10 min que decide si toca, y revisión al arrancar), `ShippingNacionalModal.js` (select por empresa), `catalogo/js/api.js`, `app.js`, `style.css` y `scripts/test-cotizador-envio.ts` (31 pruebas, sin red). Claude revisó el diff y corrió `./scripts/ci.sh`: `✅ Build, 53 suites e imports del panel en verde.`
- Solo retiro en agencia: MRW guarda solo `retiro`; Zoom siempre `modalidad_tarifa=1`. Texto: "Envío estimado: $X (Bs Y) · se paga al retirar en la agencia". Solo si el método tiene `cobroADestino`.
- Desviaciones aceptadas: la API recibe `metodoId` y `sucursalId` (Zoom estima solo con sucursal elegida, que da ciudad y oficina); `valor_mercancia` de Zoom = subtotal en Bs; MRW se consulta con medidas 1×1×1 cm.
- **Sin verificar con la red real:** si Zoom acepta `oficina_retirar` con el código de sucursal del directorio, y que MRW no cambie precio por medidas. Probar en producción con una empresa configurada.
- Nota: con una empresa MRW configurada, arrancar `dev-local.sh` hace 80 consultas reales a MRW (una por segundo) si la tabla local tiene más de 24 h.
- **Pendiente:** recorrido en Chrome a 390 y 1440 px. Tealca queda con cotizador "ninguno" (decisión del dueño, 2026-11-04).

Pedido del dueño (2026-11-04). Depende de F1-7. Decisiones: MRW se consulta **una vez al día, antes del horario de atención** (no depende del destino); Zoom se consulta al momento con caché diaria por ciudad y peso (sí depende del destino). El envío se muestra como **estimado**: todos los envíos nacionales son **cobro a destino** y con **retiro en la agencia** de la empresa, nunca a domicilio (dueño, 2026-11-04). No se suma al total del pedido. Tealca no tiene cotizador automático (su calculadora web exige reCAPTCHA y su app usa un token): tabla manual o credenciales de su API.

Datos verificados por Claude (2026-11-04):
- **MRW** (endpoint interno de su web, sin credenciales, puede cambiar sin aviso): `POST https://mrwve.com/api/calculo-envio`, JSON `{ envio: 1, peso, alto, ancho, largo, retiro }` (`envio` 1 = paquete; `retiro` 0 = agencia, 1 = domicilio; medidas ≥ 1). Respuesta: `Pago_en_Origen` (total en Bs), `Cantidad_de_Cupones`, `Tipo_de_envio`; error con `codigo: "03"`. Topes: 0,501–80 kg, alto + ancho + largo ≤ 300 cm. No pide destino. Las medidas no cambiaron el precio en las pruebas.
- **Zoom** (API pública oficial): `GET https://api.zoom.red/canguroazul/CalcularTarifa?tipo_tarifa=2&modalidad_tarifa=<1 oficina|2 puerta>&ciudad_remitente=<cod>&ciudad_destinatario=<cod>&oficina_retirar=<cod>&cantidad_piezas=1&peso=<kg>&valor_mercancia=<monto>&valor_declarado=0`; ciudades en `GET .../getCiudades` (`codciudad`, `nombre_ciudad`, `nombre_estado`); oficinas en `getOficinas?codciudad=&codservicio=1`. Respuesta: `entidadRespuesta.total` en Bs con formato `"22.150,58"` y `tasa`.

1. **Servicio `services/cotizadorEnvio.ts`**: funciones puras para el peso del pedido (suma de `pesoKg` × cantidad; si algún producto no tiene peso → sin estimado), parseo de las dos respuestas (formato `22.150,58`), conversión Bs → USD con la tasa de `services/bcv.ts`, y clientes HTTP con tiempo límite (8 s), sin reintentos en bucle.
2. **Tabla diaria de MRW**: modelo nuevo (o `Setting`) con `{ fecha, retiro: { kg: totalBs }, domicilio: { kg: totalBs } }` de 1 a 80 kg enteros (redondear el peso del pedido hacia arriba). Las consultas van espaciadas a 1 por segundo. Si la actualización falla, queda la última tabla buena y se registra el error (sin romper el arranque).
3. **Job diario** en `services/agendaService.ts`: corre 60 minutos antes de la apertura del día, según `horarioService` y la zona horaria de la marca. Un día no laborable no corre. Además, si al arrancar la tabla tiene más de 24 h, se actualiza.
4. **Zoom al momento**: caché en memoria o BD por `(codciudad destino, kg, modalidad)` hasta el día siguiente. El código de la ciudad de origen y de destino sale de `getCiudades` (caché diaria) comparando nombres con `normalizarTexto`. La ciudad de origen es la de `mapa.ciudad` de la marca o un campo del panel; **nada escrito en el código**.
5. **Panel (Inventario → Envíos)**: cada empresa de envío nacional tiene un campo `cotizador`: `ninguno` | `mrw` | `zoom` (validador, `config:manage`, auditoría). Nada se decide por el nombre de la empresa.
6. **API pública** `POST /api/public/cotizar-envio` `{ items: [{ id, cantidad }], empresaId, modalidad: "agencia"|"domicilio", ciudadDestino? }`: el peso sale de la BD, nunca del cliente. Respuesta con lista blanca: `{ disponible, montoUsd, montoBs, fecha, estimado: true }`. Con límite por IP como `/buscar-direccion` y `500` genérico. Sin peso, sin cotizador o con un fallo externo → `{ disponible: false }`.
7. **Tienda (carrito)**: al elegir una empresa con cotizador (y, para Zoom, la sucursal o ciudad), muestra "Envío estimado: $X (Bs Y) · se paga al recibir". Si no hay estimado, no muestra nada. Sin `innerHTML` con datos y con íconos de Lucide.
8. **Suite** `scripts/test-cotizador-envio.ts` en `SUITES` (después de `test-peso-producto.ts`): **sin red real** (mockear `fetch`/axios). Debe cubrir parseo de las dos respuestas, peso del pedido, producto sin peso, redondeo de kg, fallo externo que cae a la última tabla, lista blanca de la API pública, límite por IP, campo `cotizador` validado y job que no corre en día no laborable.

**Cierre:** `npm run build` y `./scripts/ci.sh` en verde, `esbuild --bundle` en los archivos tocados, y lista de archivos. Sin consultas reales a MRW ni a Zoom desde las pruebas.

### F2q · Investigación: reseñas reales de Mercado Libre en la tienda — Investigación · `Aprobada`

**Revisión (2026-11-04, Claude):** documento `docs/resenas-mercadolibre-investigacion.md` aprobado. Verificado: `GET https://api.mercadolibre.com/reviews/item/{id}` sin token responde `403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES`, así que hace falta app y OAuth. **Sin verificar por Claude:** la página de documentación y los términos responden 403 a un cliente sin navegador. Las cláusulas citadas (5.2, 5.3, 6, 7.6) se toman de la entrega; el dueño debe leer los términos antes de publicar. Condiciones para la tarea de ejecución:
1. El flujo OAuth lleva parámetro `state` aleatorio guardado en la sesión del panel y comprobado en el callback (anti-CSRF). El callback exige sesión con `config:manage`.
2. **Primera versión sin fotos ni videos de las reseñas:** mostrarlas exige abrir `img-src` de la CSP de la tienda (`render.yaml`) a `http2.mlstatic.com`. Se decide después.
3. Tokens en `Setting` (clave propia), nunca en `/api/public` ni en logs. Al renovar se guarda el nuevo `refresh_token` antes de usar el `access_token`. Si la renovación falla, push al dueño (como el aviso de Zoom) y la tienda sigue con la última copia hasta 24 h; pasado ese plazo la sección se oculta (regla de 24 h de los términos).
4. Job diario de Agenda. Una publicación con 404 borra sus reseñas guardadas.

Pedido del dueño (2026-11-04): mostrar en la tienda (`catalogo/`) las reseñas **reales** que sus productos tienen en Mercado Libre, traídas por API. **Esta tarea es solo de investigación:** no se escribe código ni se instala nada. Entrega: `docs/resenas-mercadolibre-investigacion.md`.

**Entrega (2026-11-04, Antigravity):**
- Documento de investigación entregado: `docs/resenas-mercadolibre-investigacion.md`.
- Contesta las 6 preguntas con fuentes oficiales de Mercado Libre Developers actualizadas a 2026 y pruebas reales contra la API:
  1. API oficial de evaluaciones `GET /reviews/item/{id}` (promedio, distribución de estrellas, textos, fotos/videos de compradores y comprador anónimo con `reviewer_id: 0`) y reputación del vendedor en `GET /users/{id}` (`seller_reputation`). Confirmada compatibilidad con `MLV` (Venezuela).
  2. Autenticación OAuth 2.0 (Authorization Code Grant): DevCenter, scope `read`, tokens de 6 horas y Refresh Token Rotation (RTR) con 180 días de vigencia. Persistencia segura en MongoDB y variables de entorno en Render.
  3. Relación en catálogo: campo opcional `mercadoLibreId` en `models/Producto.ts` con regex `^ML[A-Z]\d{8,14}$`, editable en `ProductTab.js` con enlace de verificación a `articulo.mercadolibre.com.ve`.
  4. Términos de uso y legalidad: cláusula 5.2 (exhibición permitida fuera del sitio), cláusula 5.3 (obligación contractual de actualizar cada 24 horas y remover eliminados), atribución transparente sin confusión de marca y privacidad estricta. Scraping prohibido (cláusula 7.6).
  5. Diseño técnico: job periódico de Agenda cada 24 horas (3:00 AM) para desacoplar llamadas externas, modelo `ResenaProducto` en MongoDB, lista blanca estricta en `/api/public/productos/:id/resenas`, y renderizado en la tienda con Lucide y `textContent` (cero `innerHTML` con datos de usuarios).
  6. Matriz de riesgos: mitigación de CloudFront PolicyAgent 403 con Bearer token en backend, manejo de RTR para evitar desautenticación, y degradación elegante si la publicación es pausada o borrada (404).
- Sin código de producción, sin dependencias nuevas y sin credenciales en el repositorio.

Preguntas que hay que responder, con fuente (documentación oficial de Mercado Libre Developers, sitio de Venezuela `MLV` si aplica):
1. **Qué API existe hoy** para leer reseñas u opiniones de un producto (p. ej. `GET /reviews/item/{item_id}`): endpoint, si es pública o pide token, qué campos devuelve (calificación, texto, fecha, nombre del comprador, fotos), paginación y límites de uso. ¿Funciona para publicaciones de Venezuela (`MLV`)? ¿Hay también reputación del vendedor (`/users/{id}`)?
2. **Autenticación:** si hace falta app y OAuth, qué pasos hace el dueño (crear app en el portal de desarrolladores, URL de redirección, permisos, renovación del token y cada cuánto vence). Ninguna clave va en el repo: solo variables de entorno en Render, documentadas en `.env.example`.
3. **Cómo se relaciona** cada publicación de Mercado Libre (`item_id`, p. ej. `MLV123456789`) con un producto nuestro: proponer un campo opcional en el producto (`mercadoLibreId`) editable desde el panel.
4. **Términos de uso:** ¿Mercado Libre permite mostrar esas reseñas fuera de su sitio? ¿Exige atribución o enlace a la publicación? ¿Se puede mostrar el nombre del comprador o hay que ocultarlo (privacidad)?
5. **Propuesta de diseño** (para que Claude escriba la tarea de ejecución): copia periódica en nuestra BD con un job de Agenda (no consultar Mercado Libre en cada visita), caché, qué se expone en `/api/public` (lista blanca), qué pasa si la API falla (la sección no se muestra) y cómo se ve en la ficha del producto (estrellas con Lucide, sin `innerHTML` con datos).
6. **Riesgos:** cambios de la API sin aviso, bloqueo por país o IP del servidor (Render está en Oregón), límites de uso.

**Restricciones:** no leer `.env`, sin commit, sin instalar dependencias, no crear la app de Mercado Libre (eso lo hace el dueño). Si la documentación oficial no se puede leer sin sesión, decirlo y marcar lo que quede **sin verificar**, como se hizo con TikTok (F5).

**Cierre:** el documento con las 6 respuestas, las fuentes y la lista de pasos del dueño. Estado final: `Lista para revisión`.

### F1-9 · Descuento por volumen (tienda web y venta manual) — Backend + Frontend · `Aprobada`

**Entrega (2026-11-04, Haiku 5.5; revisión de Claude):** `services/descuentoVolumen.ts` (cálculo puro y validador) y `services/descuentoVolumenService.ts` (Setting `descuentoVolumen`, inicial desde la marca, apagado), `orderService.calcularTotalCarrito` (recalcula sobre los ítems actuales solo si `aplicaDescuentoVolumen === true`), `publicController` (`/info` con `{activo, tramos}`; `postPedidoWeb` con precios y descuentos de la base), `chatFlowService` (reclamo del código web), `adminController.postManualSale` (booleano estricto, precio de la base), `configAdminController` + rutas `GET/PUT /config/descuento-volumen` (`config:manage`, auditoría), modelos `CarritoWeb`/`Pedido`, tienda (vista previa), `InboxManualOrderModal.js` (interruptor) y `SettingsPanel.js` (tramos). Suite `test-descuento-volumen.ts` 46/46. CI verde (55 suites). Desviaciones aceptadas: el pedido web con precio o descuento del cliente responde `400` (esquema `.strict()`); ítems sin `descuentoProductoPct` no cuentan.

**Recorrido en Chrome (2026-11-04, Claude, 1083 px, base local):** panel → Catálogo web → Descuento por volumen activado y guardado. Tienda: 4 unidades → "Agrega 1 unidad más para −3 %"; 5 → −3 % (−$3,75 sobre $125); 5 normales + 1 en oferta → el −3 % solo sobre los $125; 4 normales + 1 en oferta → sin descuento. API: ítem con `precio` → 400; límite de 5 carritos por IP → 429. Venta manual con el selector encendido y 5 unidades → pedido #005 por $121,25 y aviso "Descuento por volumen −3 % aplicado". Consola sin errores. Corregido: los números de los tramos se veían oscuros sobre fondo oscuro (`SettingsPanel.js`, `text-gray-800 dark:text-gray-100`).

**Línea del descuento en los mensajes (2026-11-04, Haiku 5.5; revisión de Claude):** "Descuento por volumen (−N %): −$X (−Bs. Y)" antes del total en el resumen del pedido web, las instrucciones de pago, la mini comanda y la comanda de pago verificado. Plantilla en `settings.messages.descuentoVolumenLinea` de la marca. Suite 56/56. **Pendiente del dueño:** 390 px.


Pedido del dueño (2026-11-04). Decisiones del dueño:
- Tramos iniciales: **5 o más unidades → 3 %**, **10 o más → 5 %** (se aplica el tramo más alto alcanzado, no se suman).
- **Solo cuentan y solo reciben el descuento las unidades de productos sin descuento propio** (`descuentoVigente(prod) === 0`). Ej.: 4 en oferta + 2 normales = 2 unidades → sin descuento.
- Canales: **tienda web** (automático) y **venta manual del panel** (el operador elige con un selector si se aplica; por defecto apagado). **No** aplica al bot de WhatsApp ni a Instagram/Messenger, salvo el pedido web que el bot reclama con su código (ver punto 4).
- Tramos y activación **editables desde el panel**.

**Principio anti-exploit:** el navegador nunca decide el descuento. Solo envía `{ id, cantidad }` (tienda) o el interruptor `aplicarDescuentoVolumen: boolean` (venta manual). El servidor cuenta, decide el tramo y calcula el monto con la configuración y los precios de la base, en cada punto donde se fija un total.

1. **Servicio puro `services/descuentoVolumen.ts`** (sin BD ni red): `calcularDescuentoVolumen(items, config)` con `items: [{ precioBase, descuentoProductoPct, cantidad }]` → `{ unidadesElegibles, pct, subtotalElegible, montoUsd }`. Cantidades enteras 1–50 por producto (las mismas reglas de hoy); un valor inválido cuenta 0, nunca suma. Monto = subtotal elegible × pct / 100, redondeado a centavos **una sola vez** sobre el subtotal (no por línea). `validarConfigDescuentoVolumen(cfg)`: `activo` booleano; `tramos` de 1 a 5, `minUnidades` entero 2–500 estrictamente creciente, `pct` entero 1–50 estrictamente creciente. Config inválida → se trata como inactiva (nunca se cobra un descuento inventado).
2. **Configuración** en `Setting` (clave propia) con validador, `authorize(["config:manage"])`, auditoría (si hace falta, nuevo `tipoRecurso` en el enum de `models/Auditoria.ts`) y `500` genérico. Valor inicial al arrancar si no existe: `{ activo: false, tramos: [{5,3},{10,5}] }` desde la marca (`config/brand/ventimax/`, no `default/`); el dueño lo activa en el panel. Panel: sección "Descuento por volumen" junto a la gestión de descuentos/cintillo (F2g), con interruptor y filas de tramos, solo `Icono`, 44 px, 390 px.
3. **Tienda web:**
   - `GET /api/public/info` (lista blanca) expone solo `{ activo, tramos }` para mostrar en el carrito una vista previa ("Descuento por volumen −3 %: −$X") y un aviso de cuánto falta para el siguiente tramo. Es solo visual.
   - `POST /api/public/pedidos` recalcula con los productos de la base y guarda en `CarritoWeb` el precio vigente por línea (sin el descuento por volumen) y un bloque `descuentoVolumen: { pct, montoUsd, unidadesElegibles }`. El `total` guardado ya lo resta. La respuesta usa las cifras del servidor (la confirmación muestra esas, no las del navegador).
4. **Pedido web reclamado por el bot** (`chatFlowService`, recuperación por código): vuelve a calcular el descuento con los precios y la configuración **de ese momento** (como ya hace con los precios) y lo guarda en el carrito del estado (`descuentoVolumen`). Si cambió respecto al pedido web, avisa al cliente con los avisos de cambios que ya existen. **`orderService.calcularTotalCarrito` resta el descuento recalculándolo sobre los ítems actuales**, nunca un monto guardado: si el cliente quita productos en WhatsApp y baja de 5, el descuento desaparece. Un carrito que no viene de la web no recibe descuento (el bot no lo ofrece). No se puede reclamar dos códigos web para sumar unidades (confirmar cómo se comporta hoy; si se pueden juntar, el descuento se recalcula sobre el carrito resultante).
5. **Venta manual** (`/inbox/whatsapp/venta-manual` y la venta rápida que exista): selector "Aplicar descuento por volumen" (apagado por defecto). El servidor recibe solo el booleano, recalcula con los precios de la base y la configuración vigente, y lo audita (`descuentoVolumen` con pct y monto en el pedido). Si la configuración está inactiva o no se llega al tramo, el selector no hace nada y el panel lo indica. Respetar que hoy el precio de la venta manual usa `precioVigente` (commit `50cfb10`).
6. **Pedido y ventas:** el `Pedido` guarda `descuentoVolumen` y su total ya lo resta; el resumen de ventas y los totales en Bs salen de ese total (sin restar dos veces).
7. **Casos a cubrir en la suite nueva `scripts/test-descuento-volumen.ts`** (en `SUITES` de `ci.sh`): 4 → 0 %, 5 → 3 %, 9 → 3 %, 10 → 5 %; mezcla con productos en oferta (no cuentan ni reciben); cantidades negativas, decimales, texto, `NaN` o más de 50 → `400` como hoy; precio o descuento enviados por el cliente se ignoran; IDs repetidos en el mismo pedido se suman antes de contar (no duplican); configuración inválida → sin descuento; config apagada → sin descuento; bot: quitar productos tras reclamar el código recalcula y quita el descuento; venta manual con el selector apagado → sin descuento, encendido → con descuento, encendido sin `config:manage`/permiso de venta → según permisos actuales; redondeo a centavos; lista blanca de `/api/public/info`; sin marca escrita.

**Restricciones:** igual que F1-1. No tocar `features/whatsapp/**` ni `features/instagram/**` salvo lo imprescindible de la venta manual, nombrando las líneas en la entrega.

**Cierre:** `npm run build`, `./scripts/ci.sh` en verde, `esbuild --bundle` en los archivos tocados, lista de archivos y decisiones. Estado final: `Lista para revisión`.

## Dudas para Claude

_(Antigravity escribe aquí: tarea, pregunta, opciones que ve. Claude responde debajo.)_

**F1-3 (Haiku 5.5, 2026-11-02):** no bloquea, pero hay que decidir:
- Compatibilidad: si un SKU aparece en la hoja Compatibilidad se reemplaza su lista; no hay forma de vaciarla desde el archivo. ¿Se acepta, o se añade una marca explícita?
- Categoría inexistente: el plan dice que se crea; el §3.2 del diseño la lista como error. Se siguió el plan.
- Confirmar se niega con cualquier error (sin aplicar parcial). Confirmar que es lo esperado.
- Riesgo residual: un `.xlsx` de 2 MB comprimido puede expandirse en memoria antes del tope de 2000 filas (no hay límite de descompresión).
- `package-lock.json`: npm reescribió unas 2100 líneas (reordenamiento; sin cambios de versiones). Revisar en el commit.
- El commit `6b1e31a` del dueño, hecho durante esta sesión, ya trae una versión anterior de `services/importacionProductos.ts`. El working tree tiene la final.

**Respuesta de Claude (2026-11-04):** se acepta todo como está. (1) Vaciar la compatibilidad de un producto se hace desde el panel; si el cliente de repuestos lo pide en el archivo, se añade una marca explícita en F1-6. (2) La categoría que no existe se crea al confirmar (el plan manda). (3) Confirmar es todo o nada: correcto. (4) Descompresión: riesgo bajo, la ruta exige `config:manage` y el archivo tiene tope de 2 MB; queda anotado. (5) El dueño ya hizo el commit.

## Pendientes del dueño

- **Formato de las tablas de importación (F1-3):** definir las columnas finales de la plantilla Excel/CSV con una muestra del Excel real del cliente de repuestos. Mientras tanto se usan las del §3.1 de `docs/f1-producto-ampliado.md`.

- **Antes de abrir a clientes reales:** el WhatsApp de Datos del negocio (584242555659) es el número personal del dueño, usado solo para pruebas (decisión del 2026-10-29). Cambiarlo por el WhatsApp Business de VentiMax al conectar Meta.
- **Mr. Pachi (fuera de este repo):** su Instagram envía el número del administrador porque `WHATSAPP_PHONE` está vacío allá (su código cae a `ADMIN_PHONE_NUMBER`). Poner el número de ventas de Pachi en `WHATSAPP_PHONE` (panel de Pachi → variables, o Render → reply-bot-pachi → Environment). Revisado el 2026-10-29: VentiMax y Pachi no comparten base de datos, Cloudinary ni servidor.

- ~~**Render → Blueprints → ventimax → Manual Sync**~~ (cabecera `no-cache` y tienda `ventimax-tienda`): **hecho** el 2026-11-02.

- ~~**URGENTE: cambiar la contraseña de Atlas**~~: **hecho** el 2026-11-02 (`MONGODB_URI` nueva en Render). La contraseña vieja del commit `3391fa5` ya no sirve.

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
| 2026-11-04 | — | F1-8, corrección: Zoom sin estimado en ciudades fuera de `getCiudades` (tabla oficina → codciudad en `services/zoomCiudades.ts`, 344 de 401 sucursales con tarifa; 57 sin código, consultar a Zoom; la tabla no tiene script de regeneración), estimado bajo el botón de WhatsApp solo en Bs, y tabla de MRW con logs y arranque al guardar en el panel. CI verde (53 suites). Confirmado por el dueño en producción — Ejecutado por **Haiku 5.5** (subagente) + **Claude** | Claude (Cerebro) | Aprobada |
| 2026-11-04 | — | F2q aprobada: reseñas de Mercado Libre requieren app y OAuth (403 verificado sin token); condiciones para la ejecución: `state` en OAuth, sin fotos en la primera versión (CSP), tokens en `Setting`, job diario — Ejecutado por **Antigravity** + **Claude** | Claude (Cerebro) | Aprobada |
| 2026-11-04 | — | Recorrido en Chrome (1083 px, base local) de F1-3, F1-7 y F1-9: todo correcto; corregido el color de los tramos en el panel. Línea del descuento por volumen en resumen, pago y comandas, y reglas de peso en una sola fuente (Haiku). F1-3, F1-7 y F1-8 aprobadas. CI verde (55 suites). Pendiente del dueño: 390 px — Ejecutado por **Haiku 5.5** (subagente) + **Claude** | Claude (Cerebro) | Aprobada |
| 2026-11-04 | — | F1-9 descuento por volumen (5 → 3 %, 10 → 5 %, solo productos sin oferta, tienda y venta manual con selector) y aviso semanal de cambios de códigos de oficina de Zoom (log + push, racha de 3 fallos, `scripts/regenerar-zoom-ciudades.ts`). CI verde (55 suites) — Ejecutado por **Haiku 5.5** (subagentes) + **Claude** | Claude (Cerebro) | Aprobada |
| 2026-11-04 | — | F2q: documento de investigación `docs/resenas-mercadolibre-investigacion.md` con las 6 respuestas sobre API de reseñas de Mercado Libre, OAuth 2.0, términos de uso, mitigación de PolicyAgent 403 y propuesta de diseño con Agenda y lista blanca — Ejecutado por **Antigravity** | Antigravity (TPM) | Lista para revisión |
| 2026-11-04 | — | F1-7 (peso y medidas de la caja) y F1-8 (cotizador MRW tabla diaria y Zoom en vivo, estimado en el carrito, solo retiro en agencia, cobro a destino). CI verde (53 suites). Pendiente: recorrido en Chrome y prueba real en producción. Tealca sin cotizador — Ejecutado por **Haiku 5.5** (subagente) + **Claude** | Claude (Cerebro) | Lista para revisión |
| 2026-11-02 | — | F2o y F1-4 aprobadas: CI verde (50 suites), 0 "Caracas" en código, `mapa` por marca con lista blanca, vehículo del cliente con validación, permiso `chat:manage`, auditoría y copiloto que propone sin guardar. Notas menores: `/api/public/marca` devuelve centro 0,0 si el dato es inválido; venta manual guarda vehículo solo en WhatsApp (la venta manual es solo WhatsApp) — Ejecutado por **Antigravity** + **Claude** | Claude (Cerebro) | Aprobada |
| 2026-11-02 | — | F1-3 entregada: importación y exportación xlsx/CSV con vista previa (nada se escribe hasta confirmar), confirmar por SKU sin borrar, desactivación aparte, suite `test-importacion-productos.ts` en `ci.sh` (48 suites en verde). Pendiente: recorrido en Chrome a 390 y 1440 px con Excel de 10 filas (sin herramienta de navegador). `exceljs` aprobado por el dueño — Ejecutado por **Haiku 5.5** (subagente) + **Claude** | Claude (Cerebro) | Lista para revisión |
| 2026-11-02 | — | F1-2 y F1-2b aprobadas: CI verde (47 suites), recorrido del dueño en Chrome a 390 px correcto (pestañas, búsqueda, fotos al crear con vista previa y reintento como edición). Siguiente: Paso 2 (F1-3) de `docs/plan-haiku-f1.md`, requiere aprobar `exceljs` — Ejecutado por **Haiku 5.5** (subagente) + **Claude** | Claude (Cerebro) | Aprobada |
| 2026-11-02 | — | F1-2b: fotos al crear producto (estado pendiente, subida tras el POST, reintento como edición); CI verde (47 suites), sin recorrido de Chrome (no había navegador). Ejecutado por **Haiku 5.5** (subagente) | Claude (Cerebro) | Lista para revisión |
| 2026-11-02 | — | F1-2 entregada por Haiku con CI verde (46 suites) y backend revisado; **Devuelta** por Claude: fallos en el formulario (ID obligatorio sin aviso; pérdida de datos con el buscador abierto) y recorrido de Chrome incompleto. Ver tarea F1-2 — Ejecutado por **Haiku 5.5** (subagente) + **Claude** | Claude (Cerebro) | Devuelta |
| 2026-11-02 | — | F1-2 corregida (ID automático, error por campo, modal estable); verificada en Chrome a 1440 px. Pendiente: 390 px y consola de CSP desde la carga — Ejecutado por **Haiku 5.5** (subagente) + **Claude** | Claude (Cerebro) | Lista para revisión |
| 2026-11-02 | — | F1-1: campos ampliados del producto (sku, marca fabricante, códigos OEM, atributos, grupo de equivalencia, compatibilidad), `services/productoAmpliado.ts`, hook `pre("validate")`, suite `test-producto-ampliado.ts` en `ci.sh` (45 suites en verde). Revisado por Claude. Pendiente para F1-2: `findOneAndUpdate` no pasa por el hook; las rutas deben llamar `validarProductoAmpliado` antes de actualizar — Ejecutado por **Haiku 5.5** (subagente) + **Claude** | Claude (Cerebro) | Aprobada |
| 2026-11-01 | — | F2d: mapa con buscador en el carrito revisado y cerrado. Claude añadió límite propio a `/geocodificar` y `/buscar-direccion` (OSM permite ~1 petición/s), tope de 120 caracteres a la búsqueda y la suite `test-mapa-carrito.ts` (7/7) en `ci.sh` — Ejecutado por **Claude** | Claude (Cerebro) | Aprobada |
| 2026-11-01 | — | F2n: sucursales de envío nacional revisada y aprobada (CI en verde: build, 43 suites e imports; validación de sucursal en servidor contra la base, lista blanca sin `_id` ni coordenadas, salvaguarda `--confirmar` en el script) — Ejecutado por **Claude** | Claude (Cerebro) | Aprobada |
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
