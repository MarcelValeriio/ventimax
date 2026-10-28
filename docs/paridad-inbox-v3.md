# Auditoría de paridad funcional — Inbox V3 (raíl de canales + 3 columnas)

**Estado:** contrato de aceptación. Documento de auditoría y verificación.
**Fecha:** 2026-09-13
**Autor:** auditoría de paridad (subagente Frontend)
**Alcance:** garantizar que la migración del inbox al diseño **V3 (raíl lateral de canales → lista de conversaciones del canal activo → hilo)** **NO pierda ni una sola función, botón, modal, menú ni comportamiento** de las dos consolas de chat en producción.

> **Regla de producto (textual del dueño):** *"que cada chat tenga sus propios botones tal cual los tienen ahorita, ya sea en WhatsApp silenciar, administrador de perfil de WhatsApp, cada chat debe mantener toda su operatividad"*.
>
> **Método de la auditoría:** lectura línea por línea de los **30 archivos `.js`** de `public/src/features/{whatsapp,instagram,inbox}`, de `public/index.html` (1092 líneas) y de `docs/inbox-unificado-contrato.md` (1044 líneas), más greps sistemáticos de `onClick`, `onChange`, `onSubmit`, `onKeyDown`, `onDoubleClick`, `title=`, `aria-label`, `placeholder`, `showToast`, `Modal`, `useEffect`, `addEventListener`, `socket.on`, `socket.emit`, `localStorage`, `sessionStorage`, `Notification`, `Audio`, `apiClient.`, `scale(`.
>
> **Ningún archivo de producción fue modificado por esta auditoría.**

## Glosario del veredicto "¿Ya existe en el inbox nuevo?"

| Valor | Significado |
|---|---|
| **Sí** | El comportamiento existe y es funcionalmente equivalente en `public/src/features/inbox/` |
| **Parcial** | Existe una versión degradada / incompleta / que cubre solo uno de los canales o de los sub-casos |
| **No** | No existe en el inbox nuevo; hoy solo vive en la consola legacy |
| **N/A** | El elemento se evaluó y se decidió **NO migrarlo** (retirada explícita con justificación de producto, p. ej. la retirada del mock/demo de Instagram en el LOTE B7b). No es una brecha: no hay paridad pendiente |

## Resumen ejecutivo (cifras)

> Cifras contadas con script sobre la propia matriz (IDs únicos, sin duplicados). **No son estimaciones.**

**Funciones a migrar desde las dos consolas actuales + entorno: 212 filas** (`X`=16, `WA`=139, `IG`=57)

> **Corrección de recuento (LOTE B7b):** el encabezado original decía 210 (`X`=15, `IG`=56), pero al verificar fila por fila la matriz de §1 contiene **X-01..X-16** (16) e **IG-01..IG-57** (57), sin huecos ni duplicados. Las cifras de abajo usan el **recuento real de la tabla: 212**; el «210» histórico queda anotado solo para trazabilidad.

| Métrica | Valor |
|---|---|
| **Total de funciones inventariadas (excluye lo ya nativo del inbox)** | **212** |
| — Transversales / de entorno (`index.html`, socket global, notificaciones, deep-link) | 16 |
| — Específicos de la consola WhatsApp (orquestador + 9 componentes) | 139 |
| — Específicos de la consola Instagram (orquestador + 7 componentes) | 57 |
| **Ya cubiertas por el inbox nuevo (Sí)** | **211** |
| **Cubiertas parcialmente (Parcial)** | **0** |
| **En brecha (No)** | **0** |
| **Retiradas por decisión de producto (N/A)** | **1** |
| — Filas no-Sí de riesgo ALTO | 0 |
| — Filas no-Sí de riesgo MEDIO | 0 |
| — Filas no-Sí de riesgo BAJO (IG-15, N/A por retirada) | 1 |

> **Cifras recalculadas el 2026-09-13 por el LOTE B8 (retirada de los NavButton legacy «WhatsApp» e «Instagram»).** Partiendo de las 209 «Sí» / 2 «Parcial» / 0 «No» / 1 «N/A» que dejó B7c, el LOTE B8 cerró **las 2 únicas filas que quedaban abiertas: X-13 y X-14**. Resultado final: **211 «Sí» / 0 «Parcial» / 0 «No» / 1 «N/A»** sobre las 212 funciones de consolas + entorno ⇒ **0 brechas de paridad**. Los dos NavButton se retiraron del nav principal (el Inbox es el punto de entrada único de los 3 canales) pero **ni las pestañas ni las consolas se eliminaron**: `WhatsAppConsole.js`/`InstagramConsole.js` siguen importadas (`index.html:118-119`), siguen montadas por su render condicional (`index.html:994-995`) y siguen accesibles como vista de detalle por el atajo `openCanalConsole` (`index.html:682-702`) desde el botón «Consola» del hilo (`InboxThread.js:1053-1067`). Ver la nota de B8 al pie de esta tabla y §1.A para la evidencia fila por fila. ⚠️ Se mantienen los dos matices de B7c: **WA-19/WA-20 son «Sí» SOLO A NIVEL DE CLIENTE** (el backend no emite `cliente_presencia`/`cliente_typing`; idéntico en el legacy) y **`whatsapp_message`** (WA-17) se suscribe sin productor.

> **Cifras del LOTE B7c (superadas por la de arriba):** partiendo de las 195 «Sí» / 15 «Parcial» / 1 «No» / 1 «N/A» que dejó B7b, B7c cerró las 13 filas transversales/WhatsApp que quedaban abiertas de su alcance — X-03, X-07, X-15 y WA-04, WA-11, WA-17, WA-19, WA-20, WA-21, WA-23, WA-27, WA-30, WA-41 — y la única fila que estaba en «No» (WA-28, `alerta_orden_estancada` en vivo), dejando **209 «Sí» / 2 «Parcial» / 0 «No» / 1 «N/A»**. Lo único que quedó abierto entonces fueron **X-13 y X-14** (los NavButton de WhatsApp e Instagram, cerrados en **B8**). Las 45 filas nativas del inbox (`IN-*`) siguen `Sí`, así que las cifras de esta tabla cuentan solo las **212** funciones de las consolas + entorno.

> **\* Nota histórica del recálculo del LOTE B7a (superada por la nota de arriba):** la versión original de esta matriz se escribió ANTES de los lotes B2–B6, así que filas marcadas «No» ya estaban implementadas en el inbox; B7a verificó cada una contra el código y actualizó 91 filas (WA-12..WA-40, WA-43..WA-139, IG-49) con la evidencia `archivo:línea`. Las 13 filas que B7a dejó «en brecha» fueron **WA-28** y 12 detalles de Instagram (IG-15/16/24/36/38/39/50/51/52/55/56/57): **las 11 de funcionalidad real las cerró el LOTE B7b** (IG-15 se retiró por decisión de producto). Las 45 filas nativas del inbox (`IN-*`) siguen `Sí`, así que las cifras de esta tabla cuentan solo las 210 funciones de las consolas + entorno; además **WA-19/WA-20** quedan «Parcial» porque el backend no emite presencia/typing — canal listo y sin productor, exactamente igual que en la consola legacy.

**Funciones nativas del inbox nuevo que la V3 debe preservar (no perder en el rediseño): 45 filas** (`IN-01`…`IN-45`, todas `Sí` por definición).

> **Total de filas de la matriz: 257** = 212 (consolas + entorno) + 45 (inbox nativo).

> **Nota de vigencia (LOTE B8):** tras B8 **no queda ninguna fila «en brecha» ni «Parcial»**: el único valor no-`Sí` de la matriz es el **N/A** de IG-15 (retirada de producto en B7b). Las secciones §2, §4, §5 y §6 se conservan como el ANÁLISIS de la auditoría original (pre-lotes); la fuente de verdad del estado es la columna **«¿Ya existe en el inbox nuevo?»** de §1, verificada fila por fila en B7a/B7b/B7c/B8. Las líneas `archivo:línea` de §1.A/§1.B son las del árbol de trabajo al cierre de B8 (B8 retiró los NavButton X-13/X-14 de `index.html`, lo que reubicó el nav: `index.html:801-819`); las de §1.O (`IN-*`) corresponden a la auditoría original (pre-B2) y son indicativas — B2..B7c crecieron `InboxConsole.js`/`InboxThread.js` por encima de ellas, así que ahí manda el nombre de la función, no el número de línea.

---

## 1. Matriz de paridad exhaustiva

Convención de IDs: `X-` transversales · `WA-` consola WhatsApp · `IG-` consola Instagram · `IN-` inbox nuevo.
La columna **"Dónde debe vivir en la V3"** usa las tres columnas del diseño: **Raíl** (raíl lateral de canales), **Col-C** (columna central = lista de conversaciones del canal activo), **Col-H** (columna derecha = hilo de la conversación).

### 1.A — Transversales / entorno (globales del panel)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| X-01 | `window.showToast` global (único toast del panel) | `index.html:1080-1089` | Todos | estado | Global | Sí — consumido en `InboxConsole.js:231,310,503,556,583,591,612,615,633` | alto |
| X-02 | `Notification.requestPermission()` al arrancar | `index.html:225-229,453` | Todos | automático | Global | Sí (indirecto, es global) | medio |
| X-03 | Push notification vía Service Worker (`sendPushNotification`) | `index.html:236-262` | Todos | automático | Global | **Sí (LOTE B7c)** — `sendPushNotification` queda endurecida (`index.html:241`: guarda para entornos sin API de notificaciones; el SW se registra en `index.html:468-473`) y el inbox la usa CADA vez que la pestaña está oculta y entra un mensaje por socket, con el CANAL en el título y el cuerpo (`InboxConsole.js:985-995`); el envío sigue pasando por el SW registrado en `/sw.js` | alto |
| X-04 | Registro del Service Worker `/sw.js` | `index.html:456-460` | Todos | automático | Global | Sí (global) | bajo |
| X-05 | Pre-carga de audios locales (`cash-register.mp3`) | `index.html:549` | WhatsApp | automático | Global | Sí (global) | bajo |
| X-06 | Overlay "Activar Alertas"—permiso de audio por sesión (`audio_enabled_session`) | `index.html:1000-1073` | Todos | modal | Global | Sí → pero **el inbox usa Web Audio propio (`playNotificationTone`) y NO consulta `audioEnabled`** | alto |
| X-07 | Listener global `pago_enviado_cliente` (toast + cashSound + push) | `index.html:488-503` | WhatsApp | automático | Global | **Sí (LOTE B7c)** — el listener global queda ACOTADO a WhatsApp (`index.html:489-493`: ningún payload de otro canal dispara el sonido de caja ni el toast de pago) y el inbox aplica ese comprobante a su historial de compras + sidebar + tono de pago (`InboxConsole.js:1029-1092`), sin duplicar el push (lo cubre el global) | medio |
| X-08 | Listener global `alerta_cliente_trabado` (\|toast + alertSound) | `index.html:487-497` | WhatsApp | automático | Global | Sí (global) | bajo |
| X-09 | Listener global `bot_destrabado` (limpia stuckClients) | `index.html:499-503` | WhatsApp | automático | Global | Sí (global) | bajo |
| X-10 | Listener global `alerta_orden_estancada` | `index.html:505-511` | WhatsApp | automático | Global | Sí (global) | bajo |
| X-11 | Listener global `pago_confirmado` (successSound + toast) | `index.html:527-533` | WhatsApp | automático | Global | Sí (global) | bajo |
| X-12 | NavButton "Inbox" con badge `inboxUnread` | `index.html:801-805` + `310-320` | Todos | botón | Raíl | Sí — es el **punto de entrada único** de los 3 canales tras B8 (`tab:"inbox"`, `icon:"fa-inbox"`, `badge: inboxUnread`); el raíl de canales del inbox (X-13/X-14 retirados) lo engloba | alto |
| X-13 | NavButton "WhatsApp" (pestaña `chat`) | `index.html:807-819` (bloque retirado) → NavButton «Inbox» en `index.html:801-805` | WhatsApp | botón | Raíl | **Sí — CERRADA en el LOTE B8.** El NavButton «WhatsApp» (`tab: "chat"`) SE RETIRA del nav principal: `public/index.html` ya no contiene ningún `tab: "chat"` (el bloque queda documentado en el comentario `index.html:807-819`, donde antes estaba el botón). El Inbox pasa a ser el punto de entrada único de los 3 canales: el NavButton «Inbox» sigue en `index.html:801-805` (`tab:"inbox"`, `icon:"fa-inbox"`, `badge: inboxUnread`). **La pestaña NO se elimina**: `activeTab === "chat" && e(WhatsAppConsole, { socket })` sigue en `index.html:994` y su import en `index.html:118`; se llega a ella por el atajo `openCanalConsole(canal, usuarioId)` (`index.html:682-702`, `setActiveTab` en `:702`) que dispara el botón «Consola» del hilo (`InboxThread.js:1053-1067`). Inventario funcional de la consola: §1.B–§1.I, todo «Sí». | medio | cerrada (riesgo resuelto) |
| X-14 | NavButton "Instagram" (pestaña `instagram`) | `index.html:807-819` (bloque retirado) → NavButton «Inbox» en `index.html:801-805` | Instagram | botón | Raíl | **Sí — CERRADA en el LOTE B8.** Ídem X-13: el NavButton «Instagram» (`tab: "instagram"`) SE RETIRA del nav principal y no queda ningún `tab: "instagram"` en `public/index.html`. **La pestaña NO se elimina**: `activeTab === "instagram" && e(InstagramConsole, { socket })` sigue en `index.html:995` y su import en `index.html:119`; mismo atajo `openCanalConsole` (`index.html:682-702`). El raíl de canales del inbox es el sustituto funcional (X-12/IN-31). Inventario funcional de la consola: §1.J–§1.N, 56 «Sí» + 1 «N/A». | medio | cerrada (riesgo resuelto) |
| X-15 | Deep-link `openCanalConsole(canal, usuarioId)` (sessionStorage + evento `pachi:focus-conversacion` + cambio de pestaña) | `index.html:682-702` | WA + IG | atajo | Col-H (botón «Consola») | **Sí (LOTE B7c; promotor único de entrada desde B8)** — el productor ya existía (`index.html:682-702`, con el `sessionStorage` en `:687-692` y el evento en `:697-700`) y ahora el INBOX UNIFICADO lo CONSUME: al montar lee y BORRA `pachi_inbox_deeplink` (solo si es reciente, TTL 30 s) y escucha `pachi:focus-conversacion` para fijar el raíl en el canal y ABRIR la conversación (`InboxConsole.js:1140-1150`, `:1275-1312`, `:1317-1327`). Las consolas legacy siguen sin consumirlo (prohibido editarlas en todos los lotes), pero el deep-link YA NO es «solo cambia de pestaña». **Desde B8 es la ÚNICA vía de entrada a las pestañas `chat`/`instagram`** (sus NavButton se retiraron) | alto |
| X-16 | Badge global de no leídos (`fetchInboxUnread` con `?canal=todos&limite=1`) + `useInboxSocket` | `index.html:310-320` + `328-331` | Todos | automático | Global / Raíl | Sí — reusa el hook del inbox; **no depende de las pestañas retiradas en B8** (se refresca por `[user, activeTab]` y por invalidación de socket) | medio |

### 1.B — Consola WhatsApp — orquestador (`WhatsAppConsole.js`, 1127 líneas)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| WA-01 | Tono de notificación nativo (Web Audio) tipo mensaje | `WhatsAppConsole.js:25-65,521` | WhatsApp | automático | Global | Sí — `InboxConsole.js:59-94` (`playNotificationTone`) | alto |
| WA-02 | Tono de "pago" (comprobante) | `WhatsAppConsole.js:42-51,574` | WhatsApp | automático | Global | Sí — `InboxConsole.js:73-81,230` | alto |
| WA-03 | Ocultar `#global-sidebar` en móvil con chat activo | `WhatsAppConsole.js:398-416` | WhatsApp | automático | Col-H | Sí — `InboxConsole.js:378-394` | alto |
| WA-04 | Badge `(N)` en el título de la pestaña por no leídos | `WhatsAppConsole.js:743-753,784-801` | WhatsApp | automático | Global | **Sí (LOTE B7c)** — el inbox escribe `document.title` con los no leídos del CANAL ACTIVO (`InboxConsole.js:1225-1250`; con el raíl en «Todos» usa el global) y `index.html:275-284` respeta esa autoridad (`window.__pachiInboxTitulo`), con el título base publicado en `index.html:169`. Un no leído de Instagram no aparece con el raíl en WhatsApp | alto |
| WA-05 | Listener `refreshChatList` (botón de refresco del sidebar) | `WhatsAppConsole.js:366-374` | WhatsApp | atajo | Col-C | Sí — `InboxConsole.js:348-356` | medio |
| WA-06 | Carga inicial: `fetchChatList` + `fetchModes` | `WhatsAppConsole.js:361-363` | WhatsApp | automático | Col-C | Sí (lista unificada) — `InboxConsole.js:243-279` | bajo |
| WA-07 | `fetchChatList` → `GET /api/admin/historial` modo lista | `WhatsAppConsole.js:154-188` | WhatsApp | automático | — | Sí → `GET /api/admin/inbox` | bajo |
| WA-08 | `fetchModes` → `GET /api/admin/modos` | `WhatsAppConsole.js:190-197` | WhatsApp | automático | — | Sí → `modo` inline | bajo |
| WA-09 | `fetchChatHistory` paginado (page/limit 20) | `WhatsAppConsole.js:200-225` | WhatsApp | automático | Col-H | Sí — `InboxConsole.js:283-315` | bajo |
| WA-10 | **Preservar posición de scroll al cargar mensajes anteriores** | `WhatsAppConsole.js:214,388-396` | WhatsApp | automático | Col-H | Sí — `InboxThread.js:130-140,157-160` | medio |
| WA-11 | `fetchPurchases` → `GET /api/admin/pedidos-historial` | `WhatsAppConsole.js:228-237` | WhatsApp | automático | Col-H | **Sí (LOTE B7c)** — `InboxConsole.js:644-659` (`cargarCompras`) lo pide al abrir cada chat de WhatsApp (y tras cada acción de pedido, `:676-681`) y `InboxThread.js:736-762` inyecta UNA tarjeta «Pedido Confirmado» por compra del historial (paridad `MessageList.js:34-45`), con caída al pedido activo del CRM; en Instagram/Messenger no se pide (el modelo `Pedido` es WhatsApp-only) | medio |
| WA-12 | `fetchChatContext` → `GET /api/admin/chat-context` (CRM: nombre, cédula, LTV, carrito, tokens, repartidores, comprobante) | `WhatsAppConsole.js:240-278` | WhatsApp | automático | Col-H (Ficha) | Sí (LOTE B4) — `InboxConsole.js:454-500` pide `GET /inbox/contexto` y de ahí salen la ficha CRM, el LTV, el carrito en vivo, el comprobante y el pedido activo | alto |
| WA-13 | `handleAssignDriver` → `PATCH /api/admin/orders/:id/repartidor` | `WhatsAppConsole.js:280-292` | WhatsApp | botón | Col-H (Ficha) | Sí (LOTE B4) — `InboxConsole.js:579-608` → `PATCH /inbox/whatsapp/pedido/:id/repartidor` desde la ficha | alto |
| WA-14 | `handleConfirmPayment` → `POST /api/admin/confirmar_pago` | `WhatsAppConsole.js:295-313` | WhatsApp | botón | Col-H (banner) | Sí (LOTE B4) — `InboxConsole.js:511-543` → `POST /inbox/whatsapp/pago/confirmar` desde el banner del hilo | alto |
| WA-15 | `handleUpdateStatus` → `PATCH /api/admin/orders/:id/status` | `WhatsAppConsole.js:315-336` | WhatsApp | botón | Col-H (banner) | Sí (LOTE B4) — `InboxConsole.js:545-577` → `PATCH /inbox/whatsapp/pedido/:id/estado` (en_ruta/entregado) | alto |
| WA-16 | `handleToggleMode` → `POST /api/admin/chats/modo` | `WhatsAppConsole.js:338-359` | WhatsApp | botón | Col-H | Sí — `InboxConsole.js:564-598` (`/inbox/modo`) | medio |
| WA-17 | Socket `nuevo_mensaje` + `whatsapp_message` (append + update sidebar, dedupe `recentlySentRef`, toasts de otros chats) | `WhatsAppConsole.js:422-526,711-712` | WhatsApp | automático | Global | **Sí (LOTE B7c)** — `useInboxSocket.js:80-87,293-329` acepta el payload PLANO de WhatsApp (`{from,text,direction,…}`; antes el normalizador exigía `{mensaje}` y el append de WhatsApp NUNCA ocurría) y `InboxConsole.js:901-1006` appendea en el hilo abierto con dedupe por `_id`/wamid, actualiza preview + no leídos y avisa (toast con el canal + tono + push) cuando la conversación NO está atendida. `whatsapp_message` se suscribe de forma DEFENSIVA (0 emisores en el backend) | medio |
| WA-18 | Socket `mensaje_status_actualizado` (últimos ticks: sent/delivered/read/failed) | `WhatsAppConsole.js:529-544,713` | WhatsApp | automático | Col-H × Global | Sí (LOTE B5) — `useInboxSocket.js:26` escucha `mensaje_status_actualizado`/`status_actualizado` y `InboxConsole.js:679-717` parchea el mensaje en sitio (sin esperar la recarga) | alto |
| WA-19 | Socket `cliente_presencia` (online/offline + TTL) | `WhatsAppConsole.js:679-693,714` | WhatsApp | automático | Col-H | **Sí a nivel de CLIENTE (LOTE B7c) · brecha de BACKEND** — el inbox escucha `cliente_presencia` con TTL (`useInboxSocket.js:50,98-120,500-511`), lo normaliza y lo pinta en la cabecera (`InboxConsole.js:1161-1185`, `InboxThread.js:917-940`) con el texto literal del legacy, y el limpiador de 3 s lo expira (WA-29). **El backend NO tiene ningún emisor** (grep de las emisiones de `cliente_presencia` sobre `services/`, `controllers/` y `routes/` → 0): canal listo y sin productor, exactamente igual que en la consola legacy. Verificado con el harness (evento simulado → «en línea»; sin emisor → la cabecera no inventa estado) | medio |
| WA-20 | Socket `cliente_typing` ("escribiendo..." + TTL) | `WhatsAppConsole.js:695-709,715` | WhatsApp | automático | Col-H | **Sí a nivel de CLIENTE (LOTE B7c) · brecha de BACKEND** — el inbox escucha `cliente_typing` con TTL (`useInboxSocket.js:50,98-120,500-511`) → «escribiendo...» (`InboxConsole.js:1161-1185`, `InboxThread.js:397-404,917-940`). **El backend NO lo emite** (0 emisores, igual que el legacy; verificado con grep del árbol) | medio |
| WA-21 | Socket `pago_enviado_cliente` (purchaseHistory + sidebar + tono) | `WhatsAppConsole.js:547-592,716` | WhatsApp | automático | Global | **Sí (LOTE B7c)** — canal propio SIN debounce en `useInboxSocket.js:111,349-367,570-580` y `InboxConsole.js:1029-1092`: alta/actualización del pedido en el historial del hilo (WA-11), resumen «Pago recibido (#…» + nombre/cédula en el sidebar, tono de pago y toast, todo sin HTTP (el push lo cubre X-07). `Pedido` es WhatsApp-only: un payload de otro canal se ignora | medio |
| WA-22 | Socket `order_status_changed` (pedido completo en purchaseHistory + sidebar) | `WhatsAppConsole.js:595-617,717` | WhatsApp | automático | Global | Sí (LOTE B4) — `order_status_changed` suscrito (`useInboxSocket.js:93`) → invalidación + recarga | medio |
| WA-23 | Socket `modo_actualizado` (actualiza operationModes) | `WhatsAppConsole.js:620-622,718` | WhatsApp | automático | Col-H × Col-C | **Sí (LOTE B7c)** — `modo_actualizado` va por el canal de MODO sin debounce (`useInboxSocket.js:97,505-515`, refs en `:460-464`) y `InboxConsole.js:1003-1021` parchea `modo` + recalcula `requiereAtencion` EN SITIO (§6.2.1), no solo por recarga; el evento sigue también en el canal legacy (recarga = verdad del servidor) | medio |
| WA-24 | Socket `pago_confirmado` (pedido + purchaseHistory) | `WhatsAppConsole.js:625-634,719` | WhatsApp | automático | Global | Sí (LOTE B4) — `pago_confirmado` suscrito (`useInboxSocket.js:95`) → invalidación + recarga | medio |
| WA-25 | Socket `pedido_actualizado` (estado parcial) | `WhatsAppConsole.js:637-642,720` | WhatsApp | automático | Global | Sí (LOTE B4) — `pedido_actualizado` suscrito (`useInboxSocket.js:96`) | medio |
| WA-26 | Socket `bot_destrabado` (modo → automático + toast) | `WhatsAppConsole.js:645-650,721` | WhatsApp | automático | Global | Sí (LOTE B4) — `bot_destrabado` suscrito (`useInboxSocket.js:98`) | medio |
| WA-27 | Socket `estado_actualizado` (paso/pasoLabel/etiqueta del embudo) | `WhatsAppConsole.js:652-666,722` | WhatsApp | automático | Col-C × Col-H | **Sí (LOTE B7c)** — canal propio SIN debounce (`useInboxSocket.js:134,390-411,599-609`) y `InboxConsole.js:1116-1129` parchea `paso`/`pasoLabel`/`etiqueta` EN SITIO (solo los campos presentes; un payload incompleto no borra lo pintado). El evento sigue además en el canal legacy, así que la recarga reconcilia | medio |
| WA-28 | Socket `alerta_orden_estancada` (marca `stuck`) | `WhatsAppConsole.js:668-676,723` | WhatsApp | automático | Col-C | **Sí (LOTE B7c)** — era la ÚNICA fila en «No». `useInboxSocket.js:122,369-388,582-596` lo entrega sin debounce (emisor real: `services/watchdogService.ts:225`, payload `{id,correlativo,cliente,telefono,minutos}`) y `InboxConsole.js:1097-1114` marca `stuck: true` + `requiereAtencion` en la fila EN VIVO → punto rojo pulsante (WA-59). El toast/sonido siguen siendo del listener global X-10 (no se duplican) | bajo |
| WA-29 | Limpieza de TTL de presencia/typing cada 3 s | `WhatsAppConsole.js:756-781` | WhatsApp | automático | Col-H | Sí (LOTE B7a) — `InboxConsole.js:742-765` limpia los TTL de presencia/typing cada 3 s | bajo |
| WA-30 | Reset de no leídos al volver a la pestaña (`visibilitychange`) | `WhatsAppConsole.js:784-801` | WhatsApp | automático | Global | **Sí (LOTE B7c)** — listener de `visibilitychange` en `InboxConsole.js:1255-1272`: al recuperar la visibilidad se re-marca leída la conversación activa por `POST /inbox/leido` (idempotente) y el badge del título baja EN EL CLIENTE (`marcarLeido`, `:1453-1483`), paridad con el reseteo local del legacy. Con la pestaña virgen (sin chat activo) no marca nada | medio |
| WA-31 | Reset de no leídos + recarga al cambiar de cliente | `WhatsAppConsole.js:804-818` | WhatsApp | automático | Col-H | Sí — `InboxConsole.js:412-421` (`abrirConversacion`) | bajo |
| WA-32 | Recargar contexto/purchases en cada cambio de chat | `WhatsAppConsole.js:814-816` | WhatsApp | automático | Col-H | Sí (LOTE B4) — `InboxConsole.js:903-917` (`abrirConversacion`) recarga contexto e hilo en cada cambio de chat | alto |
| WA-33 | Botón **Reintentar** en mensaje fallido (`enviar_desde_panel` con `retryMsgId/retryWamid`) | `WhatsAppConsole.js:873-893` · `MessageBubble.js:173-196` | WhatsApp | botón | Col-H | Sí (LOTE B3) — botón Reintentar en la burbuja fallida (`InboxThread.js:1436-1476`) → `POST /inbox/mensaje` con `retryMsgId/retryWamid` | alto |
| WA-34 | Enviar texto por socket con cita (`replyToMid`/`replyToText`) | `WhatsAppConsole.js:827-870` | WhatsApp | botón | Col-H | Sí (LOTE B3) — cita con `replyToMid/replyToText`: barra en `InboxThread.js:1518` + auto-focus + envío en `InboxConsole.js:946-1005` | alto |
| WA-35 | Barra de acción: **Confirmar Pago y Enviar Comandas** | `WhatsAppConsole.js:936-956` | WhatsApp | botón | Col-H | Sí (LOTE B4) — botón «Confirmar Pago y Enviar Comandas» (`InboxThread.js:553-570`) | alto |
| WA-36 | Barra de acción: **Despachar Pedido (En Ruta)** | `WhatsAppConsole.js:957-978` | WhatsApp | botón | Col-H | Sí (LOTE B4) — botón «Despachar Pedido (En Ruta)» (`InboxThread.js:574-597`) | alto |
| WA-37 | Barra de acción: **Marcar como Entregado** | `WhatsAppConsole.js:979-1001` | WhatsApp | botón | Col-H | Sí (LOTE B4) — botón «Marcar como Entregado» (`InboxThread.js:598-620`) | alto |
| WA-38 | Modal Ficha del Cliente (drawer desktop + bottom-sheet móvil) | `WhatsAppConsole.js:1084-1092` | WhatsApp | modal | Col-H | Sí (LOTE B4) — `CustomerCardDrawer.js` REUTILIZADO tal cual desde la consola (`InboxConsole.js:1462-1475`) | alto |
| WA-39 | Modal Perfil de WhatsApp Business | `WhatsAppConsole.js:1111-1115` | WhatsApp | modal | Raíl (acción de canal WhatsApp) | Sí (LOTE B6) — `components/InboxWhatsAppProfileModal.js:25-26` (endpoints unificados `/inbox/whatsapp/profile*`), abierto desde el engranaje | bajo |
| WA-40 | Modal Venta Manual / Copiloto IA | `WhatsAppConsole.js:1116-1122` | WhatsApp | modal | Col-H | Sí (LOTE B7a) — `features/inbox/components/InboxManualOrderModal.js` (versión propia del inbox: el legacy hardcodea endpoints), montado en `InboxConsole.js:1486-1502` | alto |
| WA-41 | Instalación del `<style>` con clases `.wa-*` (doodle + colas) | `WhatsAppConsole.js:377-386` · `styles.js` | WhatsApp | automático | Col-H | **Sí (LOTE B7c)** — el inbox inyecta la MISMA hoja con el mismo `id` (`wa-custom-styles`) importando `features/whatsapp/components/styles.js?v=4` sin editarlo (`InboxConsole.js:1208-1222`) y aplica las clases SOLO en WhatsApp: `wa-bg-doodle` en el fondo del hilo (`InboxThread.js:76-79`) y `wa-bubble-tail-in/out` en las colas (`InboxThread.js:1387-1397`, con la geometría en línea de B5 como respaldo) | bajo |
| WA-42 | Ordenamiento de conversaciones por timestamp DESC en cliente | `WhatsAppConsole.js` (implícito) · `WhatsAppSidebar.js:156-160` | WhatsApp | automático | Col-C | Sí — el servidor ordena y `InboxConsole.js:152-154` blinda | bajo |

### 1.C — Consola WhatsApp — `WhatsAppSidebar.js` (509 líneas) y `ContactCard.js` (169)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| WA-43 | Cabecera "WhatsApp · Mensajería de WhatsApp Business" | `WhatsAppSidebar.js:162-223` | WhatsApp | estado | Col-C (título del canal activo) | Sí (LOTE B7a) — descriptor del canal activo bajo el título de la Col-C (`InboxSidebar.js:31-40,134-145`), sin perder IN-25 | bajo |
| WA-44 | **Toggle de silencio** (`localStorage.pachi_muted` + evento `pachi_mute_toggled` + toast) | `WhatsAppSidebar.js:29-35` | WhatsApp | botón | Raíl | Sí (LOTE B7a) — el toggle del inbox escribe `pachi_muted_inbox` **y** `pachi_muted` (`InboxConsole.js:1259-1283`): silenciar en el inbox silencia también el tono global/legacy | medio |
| WA-45 | **Botón "Perfil de WhatsApp Business"** (icono `fa-store`) | `WhatsAppSidebar.js:240-251` | WhatsApp | botón | Raíl (acción de canal) | Sí (LOTE B6) — engranaje «Ajustes del canal» de la cabecera de la lista: `InboxSidebar.js:149` → `InboxChannelSettings.js:71-105` | bajo |
| WA-46 | Botón **Actualizar lista** (`refreshChatList`) | `WhatsAppSidebar.js:267-280` | WhatsApp | botón | Col-C | Sí — `InboxFilterBar.js:224-239` | bajo |
| WA-47 | Buscador "por nombre, teléfono o mensaje" | `WhatsAppSidebar.js:286-319` | WhatsApp | botón | Col-C | Sí — `InboxFilterBar.js:62-95` | bajo |
| WA-48 | **Variantes de teléfono** (`normalizeDigits` / `getPhoneVariants`: 58, 0 inicial, cédula) en la búsqueda | `WhatsAppSidebar.js:39-49,101-149` | WhatsApp | automático | — (servidor) | Sí (LOTE B7a) — variantes 58 / 0 inicial / cédula portadas al filtro de SERVIDOR (`services/inboxService.ts:186-244`, `pasaFiltros`), que es donde el contrato §2.1 delega la búsqueda | medio |
| WA-49 | Pestaña **Todos** | `WhatsAppSidebar.js:326-338` | WhatsApp | botón | Col-C | Sí — filtros unificados | bajo |
| WA-50 | Pestaña **No Leídos** + contador | `WhatsAppSidebar.js:340-363` | WhatsApp | botón | Col-C | Sí — `InboxFilterBar.js:151-178` | bajo |
| WA-51 | Pestaña **Modo Manual** + contador | `WhatsAppSidebar.js:365-388` | WhatsApp | botón | Col-C | Sí — `InboxFilterBar.js:179-193` | bajo |
| WA-52 | Pestaña **Verificar Pago** (atención) + contador | `WhatsAppSidebar.js:390-413` | WhatsApp | botón | Col-C | Sí — `InboxFilterBar.js:194-208` (`Atención`) | bajo |
| WA-53 | Pestaña **Con Pedido** + contador | `WhatsAppSidebar.js:415-438` | WhatsApp | botón | Col-C | Sí — `InboxFilterBar.js:209-223` | bajo |
| WA-54 | Conteos client-side de las 5 pestañas (`isRequiresAttention`, `hasOrder`) | `WhatsAppSidebar.js:52-93` | WhatsApp | estado | — | Sí — el servidor aporta `totales`/`totalesNoLeidos`; `requiereAtencion`/`pedido` vienen en el objeto | medio |
| WA-55 | Estado vacío + botón **Limpiar filtros** | `WhatsAppSidebar.js:448-487` | WhatsApp | botón | Col-C | Sí — `InboxSidebar.js:149-192` | bajo |
| WA-56 | Tarjeta de contacto: avatar DiceBear por teléfono | `ContactCard.js:54-58` | WhatsApp | estado | Col-C | Sí — `InboxConversationRow.js:48-52,106-112` | bajo |
| WA-57 | **Badge de Modo Manual** en el avatar | `ContactCard.js:60-72` | WhatsApp | estado | Col-C | Sí — `InboxConversationRow.js:122-133` | bajo |
| WA-58 | Nombre visible + teléfono (solo si hay nombre) | `ContactCard.js:80-99` | WhatsApp | estado | Col-C | Sí — `InboxConversationRow.js:141-191` | bajo |
| WA-59 | **Indicador de lead estancado** (punto rojo pulsante) | `ContactCard.js:109-114` | WhatsApp | estado | Col-C | Sí (LOTE B7a) — punto rojo pulsante (`InboxConversationRow.js:157-169`), paridad exacta con `ContactCard.js:109-114` | bajo |
| WA-60 | Hora formateada del último mensaje | `ContactCard.js:115-120` | WhatsApp | estado | Col-C | Sí — `InboxConversationRow.js:34-45,193-204` | bajo |
| WA-61 | Preview con `line-clamp-3` móvil / `line-clamp-2` desktop | `ContactCard.js:126-134` | WhatsApp | estado | Col-C | Sí (LOTE B7a) — `line-clamp-3 md:line-clamp-2` (`InboxConversationRow.js:218-220`) | bajo |
| WA-62 | Chip de **paso del embudo** (`pasoLabel`) | `ContactCard.js:137-151` | WhatsApp | estado | Col-C | Sí — `InboxConversationRow.js:234-248` | bajo |
| WA-63 | **Contador de no leídos** (pill verde) | `ContactCard.js:153-163` | WhatsApp | estado | Col-C | Sí — `InboxConversationRow.js:282-293` | bajo |
| WA-64 | Navegación por teclado en la fila (Enter/Espacio) + `aria-label` | `ContactCard.js:29-38` | WhatsApp | atajo | Col-C | Sí — `InboxConversationRow.js:81-89` | bajo |

### 1.D — Consola WhatsApp — `WhatsAppHeader.js` (176) e `WhatsAppInput.js` (273)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| WA-65 | Botón **Volver** (móvil) | `WhatsAppHeader.js:73-80` | WhatsApp | botón | Col-H | Sí — `InboxThread.js:192-203` | bajo |
| WA-66 | Avatar DiceBear por teléfono en cabecera | `WhatsAppHeader.js:81-91` | WhatsApp | estado | Col-H | Sí — `InboxThread.js:204-210` | bajo |
| WA-67 | **Toggle Modo Bot/Manual** con punto de estado | `WhatsAppHeader.js:96-128` | WhatsApp | botón | Col-H | Sí — `InboxThread.js:256-279` | bajo |
| WA-68 | **Estado de presencia / escribiendo** ("escribiendo…", "en línea", "desconectado") | `WhatsAppHeader.js:34-62,130` | WhatsApp | estado | Col-H | Sí (LOTE B7a) — presencia/escribiendo en la cabecera del hilo (`InboxThread.js:370-380,510,820`), alimentada por `cliente_presencia`/`cliente_typing` (`useInboxSocket.js:50`) con TTL limpiado cada 3 s. Solo WhatsApp | medio |
| WA-69 | Botón **Ficha** (id-card) con `aria-pressed` visual | `WhatsAppHeader.js:134-152` | WhatsApp | botón | Col-H | Sí (LOTE B4) — botón «Ficha» con `aria-pressed` (`InboxThread.js:900-925`) → `CustomerCardDrawer` | alto |
| WA-70 | Botón **Venta IA** (copiloto) | `WhatsAppHeader.js:153-170` | WhatsApp | botón | Col-H | Sí (LOTE B7a) — botón «Venta IA» en la cabecera (`InboxThread.js:866-888`, solo WhatsApp) → Copiloto de Venta Manual (WA-131..139) | alto |
| WA-71 | **Picker de emojis** (25 emojis) + botón flotante | `WhatsAppInput.js:6-32,173-209` | WhatsApp | menú | Col-H | Sí (LOTE B7a) — picker de 25 emojis con botón flotante en el composer (`InboxThread.js:359-366,1593-1640`) | medio |
| WA-72 | Botón **Adjuntar** (imagen/PDF) con `accept="image/*,application/pdf"` | `WhatsAppInput.js:211-234` | WhatsApp | botón | Col-H | Sí (LOTE B7a) — adjunto con `accept` por canal (`InboxThread.js:1544,1578`) + `caption` y cita en el multipart (`InboxConsole.js:1111-1180`) | medio |
| WA-73 | **Caption** al adjuntar (texto del input se envía como `caption`) | `WhatsAppInput.js:98-101` | WhatsApp | automático | Col-H | Sí (LOTE B7a) — el texto del composer viaja como `caption` (`InboxThread.js:729-736` → `InboxConsole.js:1131-1146`) y se limpia al enviar | bajo |
| WA-74 | **Barra de respuesta citada** con botón cancelar | `WhatsAppInput.js:131-163` | WhatsApp | botón | Col-H | Sí (LOTE B3) — barra de respuesta citada con botón cancelar (`InboxThread.js:1518-1560`) | alto |
| WA-75 | **Auto-focus del textarea al citar** | `WhatsAppInput.js:56-60` | WhatsApp | automático | Col-H | Sí (LOTE B3) — auto-focus del textarea al citar (`InboxThread.js:470-484`) | bajo |
| WA-76 | Textarea `rows=3`, `min-h-[70/64px]`, `max-h-[140px]` con scroll interno | `WhatsAppInput.js:237-253` | WhatsApp | estado | Col-H | Sí (LOTE B7a) — textarea `rows=3` + `min-h-[70px] sm:min-h-[64px]` + `max-h-[140px]` con scroll interno (`InboxThread.js:1645-1660`) | bajo |
| WA-77 | **Enter envía / Shift+Enter salta línea** | `WhatsAppInput.js:242-247` | WhatsApp | atajo | Col-H | Sí — `InboxThread.js:169-174` | bajo |
| WA-78 | Botón **Enviar** deshabilitado si vacío | `WhatsAppInput.js:256-268` | WhatsApp | botón | Col-H | Sí — `InboxThread.js:612-627` | bajo |
| WA-79 | Guardas: "Selecciona un chat primero" / "Subiendo archivo..." / toasts de éxito-error | `WhatsAppInput.js:76-121` | WhatsApp | automático | Col-H | Sí (LOTE B7a) — guardas y toasts del composer: «Selecciona un chat primero», «📎 Subiendo archivo...» y «✅ Archivo enviado con éxito!» (`InboxConsole.js:1111-1185`) | bajo |

### 1.E — Consola WhatsApp — `MessageList.js` (158) y `MessageBubble.js` (500)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| WA-80 | **Banner de Modo Manual** en el hilo ("el bot está pausado…") | `MessageList.js:54-68` | WhatsApp | estado | Col-H | Sí (LOTE B5) — banner de Modo Manual en el hilo (`InboxThread.js:988-1004`), texto literal del legacy | medio |
| WA-81 | Botón **Cargar mensajes anteriores** | `MessageList.js:70-86` | WhatsApp | botón | Col-H | Sí — `InboxThread.js:357-372` | bajo |
| WA-82 | **Separadores de fecha** (Hoy/Ayer/fecha larga `es-VE`) | `MessageList.js:6-21,93-106` | WhatsApp | estado | Col-H | Sí — `InboxThread.js:52-62,397-411` | bajo |
| WA-83 | **Tarjeta de "Pedido Confirmado"** inyectada en el timeline (correlativo + montos USD/VES) | `MessageList.js:108-127` | WhatsApp | estado | Col-H | Sí (LOTE B5) — tarjeta «Pedido Confirmado» intercalada en el timeline (`InboxThread.js:636-676` + `:685-710`) | medio |
| WA-84 | Burbuja: cola de burbuja in/out + `bg-[#dcf8c6]` | `MessageBubble.js:234-248` · `styles.js` | WhatsApp | estado | Col-H | Sí (LOTE B5) — cola de burbuja in/out (`InboxThread.js:287-303`, `estiloCola`) y `bg-[#dcf8c6]` en `CANAL_META.whatsapp.saliente` (`InboxThread.js:54-55`) | bajo |
| WA-85 | **Heurística de tipo multimedia** (audio/imagen/documento/ubicación por MIME, tipo, extensión) | `MessageBubble.js:66-79` | WhatsApp | automático | Col-H | Sí (LOTE B5) — heurística por tipo + MIME + extensión + `location` (`InboxThread.js:182-260`, `detectarTipoMultimedia`) | medio |
| WA-86 | **Cita previa** (`replyToText`) en la burbuja | `MessageBubble.js:251-270` | WhatsApp | estado | Col-H | Sí — `InboxThread.js:460-471` | bajo |
| WA-87 | **Reproductor de audio** ("Nota de voz") | `MessageBubble.js:273-311` | WhatsApp | estado | Col-H | Sí — `InboxThread.js:473-483` | bajo |
| WA-88 | Imagen → abrir **lightbox interno con zoom** | `MessageBubble.js:314-366` | WhatsApp | botón | Col-H | Sí (LOTE B5) — imagen → lightbox interno REUTILIZADO (`ImageLightboxModal.js`, import en `InboxThread.js:42`, montaje en `:1691-1702`) | medio |
| WA-89 | Manejo de error de imagen ("No se pudo cargar la imagen") | `MessageBubble.js:342-354` | WhatsApp | automático | Col-H | Sí (LOTE B5) — error de imagen por mensaje (`InboxThread.js:630-632` + fallback «No se pudo cargar la imagen.») | bajo |
| WA-90 | **Documento descargable** con icono por tipo (PDF/DOC/XLS/ZIP/TXT) | `MessageBubble.js:6-39,369-421` | WhatsApp | botón | Col-H | Sí (LOTE B5) — documento descargable con icono por tipo y `download` (`InboxThread.js:244-286` `getFileIconInfo` + `:1351`) | bajo |
| WA-91 | **Ubicación compartida** → enlace a Google Maps | `MessageBubble.js:423-463` | WhatsApp | estado | Col-H | Sí (LOTE B5) — ubicación compartida → enlace a Google Maps (`InboxThread.js:174-180`,`:1100`,`:1300`) | medio |
| WA-92 | **Botón Responder/Citar** (hover, requiere `wamid` válido) | `MessageBubble.js:219-233` | WhatsApp | botón | Col-H | Sí (LOTE B3) — botón Responder/Citar en la burbuja (`InboxThread.js:1144-1160`), solo con id externo real | alto |
| WA-93 | **Doble clic para citar** | `MessageBubble.js:215` | WhatsApp | atajo | Col-H | Sí (LOTE B3) — doble clic para citar (`InboxThread.js:1163`) | medio |
| WA-94 | **Botón Reintentar** en mensaje fallido | `MessageBubble.js:173-196` | WhatsApp | botón | Col-H | Sí (LOTE B3) — botón Reintentar en el mensaje fallido (`InboxThread.js:1436`) | alto |
| WA-95 | **Ticks de estado**: enviando ⏱️ / enviado ✓ / entregado ✓✓ / leído ✓✓ azul | `MessageBubble.js:136-207` | WhatsApp | estado | Col-H | Sí (LOTE B5) — ticks enviando/sent/delivered/read/failed con parcheo EN VIVO (`InboxThread.js:311-317` + `InboxConsole.js:679-717`) | alto |
| WA-96 | Hora del mensaje (24 h) | `MessageBubble.js:479-493` | WhatsApp | estado | Col-H | Sí — `InboxThread.js:538` | bajo |

### 1.F — Consola WhatsApp — `ImageLightboxModal.js` (287)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| WA-97 | Visor modal de imagen en overlay | `ImageLightboxModal.js:78-95` | WhatsApp | modal | Col-H | Sí (LOTE B5) — el visor se REUTILIZA importando `ImageLightboxModal.js` tal cual (100 % dirigido por props) desde `InboxThread.js:42,1691-1702` | medio |
| WA-98 | Botón **Zoom +** (hasta 3×) | `ImageLightboxModal.js:132-144` | WhatsApp | botón | Col-H | Sí (LOTE B5) — reutilizado `ImageLightboxModal.js` (Zoom + hasta 3×) | medio |
| WA-99 | Botón **Zoom −** | `ImageLightboxModal.js:145-157` | WhatsApp | botón | Col-H | Sí (LOTE B5) — reutilizado `ImageLightboxModal.js` (Zoom −) | bajo |
| WA-100 | Botón **Reset zoom (1x)** | `ImageLightboxModal.js:158-171` | WhatsApp | botón | Col-H | Sí (LOTE B5) — reutilizado `ImageLightboxModal.js` (Reset 1×) | bajo |
| WA-101 | Botón **Cerrar** con `aria-label="Cerrar imagen"` | `ImageLightboxModal.js:172-185` | WhatsApp | botón | Col-H | Sí (LOTE B5) — reutilizado `ImageLightboxModal.js` (Cerrar con `aria-label="Cerrar imagen"`) | bajo |
| WA-102 | **Cerrar con Escape** | `ImageLightboxModal.js:52-58` | WhatsApp | atajo | Col-H | Sí (LOTE B5) — reutilizado `ImageLightboxModal.js` (cierre con Escape) | bajo |
| WA-103 | Cerrar al clic en backdrop (no en la imagen) | `ImageLightboxModal.js:88-93,198-204` | WhatsApp | automático | Col-H | Sí (LOTE B5) — reutilizado `ImageLightboxModal.js` (cierre por backdrop, no sobre la imagen) | bajo |
| WA-104 | Bloqueo del scroll del body mientras abierto | `ImageLightboxModal.js:40-41,64` | WhatsApp | automático | Col-H | Sí (LOTE B5) — reutilizado `ImageLightboxModal.js` (bloqueo del scroll del body) | bajo |
| WA-105 | Restauración del foco al elemento disparador | `ImageLightboxModal.js:44-50,67-71` | WhatsApp | automático | Col-H | Sí (LOTE B5) — reutilizado `ImageLightboxModal.js` (restauración del foco; el disparador se captura del evento en `InboxThread.js:621-627`) | bajo |
| WA-106 | Mensaje de fallback si la imagen no carga | `ImageLightboxModal.js:227-258` | WhatsApp | estado | Col-H | Sí (LOTE B5) — reutilizado `ImageLightboxModal.js` (fallback si la imagen no carga) | bajo |

### 1.G — Consola WhatsApp — `QuickReplyBar.js` (136), `QuickReplyBottomSheet.js` (419), `parseTemplate.js` (49)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| WA-107 | Barra de respuestas rápidas (carga `GET /api/admin/quick-replies`, filtra `active`) | `QuickReplyBar.js:31-50,77-116` | WA + IG | estado | Col-H | Sí (LOTE B2) — `InboxQuickReplyBar.js:145-152` carga `GET /api/admin/quick-replies` y filtra `active !== false` | alto |
| WA-108 | Botón **"Respuestas Rapidas"** (abre bottom sheet) | `QuickReplyBar.js:97-114` | WA + IG | botón | Col-H | Sí (LOTE B2) — botón «Respuestas Rápidas» que abre el bottom sheet reutilizado (`InboxQuickReplyBar.js`) | alto |
| WA-109 | Registro de uso (`PUT /api/admin/quick-replies/:id` `usageCount+1`) | `QuickReplyBar.js:57-63` | WA + IG | automático | Col-H | Sí (LOTE B2) — registro de uso `usageCount + 1` (`InboxQuickReplyBar.js:199-210`) | bajo |
| WA-110 | Sustitución de tokens `{nombre}{items}{totalUSD}{totalBS}{total}` (`parseTemplate`) | `parseTemplate.js:5-48` · `QuickReplyBar.js:65-69` | WA + IG | automático | Col-H | Sí (LOTE B2) — `parseTemplate` REUTILIZADO del legacy (`InboxQuickReplyBar.js:30`) con el contexto de tokens del endpoint unificado | alto |
| WA-111 | Envío directo por socket si no hay tokens | `QuickReplyBar.js:71-75` | WhatsApp | botón | Col-H | Sí (LOTE B2) — envío directo por la prop `onSend` → `POST /api/admin/inbox/mensaje` (`InboxQuickReplyBar.js:226`); el inbox no usa el socket legacy `enviar_desde_panel` | alto |
| WA-112 | Bottom sheet: buscador local tiempo real | `QuickReplyBottomSheet.js:177-216` | WA + IG | botón | Col-H | Sí (LOTE B2) — bottom sheet REUTILIZADO (`QuickReplyBottomSheet.js`) con su buscador local | alto |
| WA-113 | Bottom sheet: chips de categorías + **Favoritas** | `QuickReplyBottomSheet.js:66-68,218-281` | WA + IG | botón | Col-H | Sí (LOTE B2) — chips de categorías + Favoritas (bottom sheet reutilizado) | medio |
| WA-114 | Bottom sheet: orden Favoritas-primero + orden manual | `QuickReplyBottomSheet.js:89-93` | WA + IG | automático | Col-H | Sí (LOTE B2) — orden Favoritas-primero (bottom sheet reutilizado) | bajo |
| WA-115 | Bottom sheet: badge **Completar** (tokens) vs **Envío directo** | `QuickReplyBottomSheet.js:328-398` | WA + IG | estado | Col-H | Sí (LOTE B2) — badge Completar vs Envío directo (bottom sheet reutilizado; decisión de tokens en `InboxQuickReplyBar.js:89-121`) | bajo |
| WA-116 | Bottom sheet: **Escape**, backdrop, botón cerrar, foco en buscador, bloqueo de scroll | `QuickReplyBottomSheet.js:30-62,104-108,161-174` | WA + IG | atajo | Col-H | Sí (LOTE B2) — Escape/backdrop/cerrar/foco/bloqueo de scroll (bottom sheet reutilizado) | medio |
| WA-117 | Bottom sheet: estado vacío + **Restablecer filtros** | `QuickReplyBottomSheet.js:291-327` | WA + IG | botón | Col-H | Sí (LOTE B2) — estado vacío + Restablecer filtros (bottom sheet reutilizado) | bajo |

### 1.H — Consola WhatsApp — `CustomerCardDrawer.js` (322)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| WA-118 | Drawer lateral derecho (desktop) / bottom sheet (móvil) | `CustomerCardDrawer.js:296-315` | WhatsApp | modal | Col-H | Sí (LOTE B4) — `CustomerCardDrawer.js` REUTILIZADO tal cual (`InboxConsole.js:1462-1475`): drawer desktop / bottom-sheet móvil | alto |
| WA-119 | Botón **Refrescar datos** (`onRefreshContext`) | `CustomerCardDrawer.js:146-150` | WhatsApp | botón | Col-H | Sí (LOTE B4) — «Refrescar datos» → `onRefreshContext` (`InboxConsole.js:1471`) | medio |
| WA-120 | Botón cerrar ficha (✕) | `CustomerCardDrawer.js:151-155` | WhatsApp | botón | Col-H | Sí (LOTE B4) — botón cerrar ✕ del drawer reutilizado | bajo |
| WA-121 | Sección **Datos del Cliente** (nombre, cédula, dirección) | `CustomerCardDrawer.js:166-193` | WhatsApp | estado | Col-H | Sí (LOTE B4) — sección Datos del Cliente (nombre, cédula, dirección) desde `/inbox/contexto` | medio |
| WA-122 | Botón **Abrir en Google Maps** (dirección) | `CustomerCardDrawer.js:76-80,185-191` | WhatsApp | botón | Col-H | Sí (LOTE B4) — «Abrir en Google Maps» (drawer reutilizado) | medio |
| WA-123 | Sección **Historial de Compras** (nº compras + LTV USD) | `CustomerCardDrawer.js:195-211` | WhatsApp | estado | Col-H | Sí (LOTE B4) — Historial de Compras (nº compras + LTV USD) desde `/inbox/contexto` | medio |
| WA-124 | Sección **Carrito en Vivo** (ítems, tasa BCV, totales USD/Bs) | `CustomerCardDrawer.js:213-243` | WhatsApp | estado | Col-H | Sí (LOTE B4) — Carrito en Vivo (items, tasa BCV, totales USD/Bs) desde `/inbox/contexto` | medio |
| WA-125 | Sección **Pedido activo** (ID formateado + estado) | `CustomerCardDrawer.js:245-255` | WhatsApp | estado | Col-H | Sí (LOTE B4) — pedido activo del CRM (`pedidoActivo`) + banner del hilo (`InboxThread.js:1030-1050`) | bajo |
| WA-126 | Botón **Ver Comprobante con Zoom** (abre visor) | `CustomerCardDrawer.js:257-267` | WhatsApp | botón | Col-H | Sí (LOTE B4) — «Ver Comprobante con Zoom» en la ficha (drawer reutilizado) | alto |
| WA-127 | **Visor de comprobante** con Zoom + / − / reset / cerrar | `CustomerCardDrawer.js:83-130` | WhatsApp | modal | Col-H | Sí (LOTE B4) — visor de comprobante con Zoom +/−/reset/cerrar (drawer reutilizado) | alto |
| WA-128 | Selector + botón **Guardar repartidor** (asignación) | `CustomerCardDrawer.js:269-291` | WhatsApp | botón | Col-H | Sí (LOTE B4) — selector + «Guardar repartidor» → `onAssignDriver` (`InboxConsole.js:1470`) | alto |
| WA-129 | Indicador **Asignado a @repartidor** | `CustomerCardDrawer.js:287-290` | WhatsApp | estado | Col-H | Sí (LOTE B4) — indicador «Asignado a @repartidor» (drawer reutilizado) | bajo |
| WA-130 | Cerrar con **Escape** (ficha o visor) | `CustomerCardDrawer.js:27-42` | WhatsApp | atajo | Col-H | Sí (LOTE B4) — cierre con Escape de la ficha/visor (drawer reutilizado) | bajo |

### 1.I — Consola WhatsApp — `ChatManualOrderModal.js` (301)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| WA-131 | Modal **Copiloto: Venta Manual** | `ChatManualOrderModal.js:158-298` | WhatsApp | modal | Col-H | Sí (LOTE B7a) — `features/inbox/components/InboxManualOrderModal.js` (cabecera, cuerpo scrollable, Cancelar / Confirmar e Ingresar; cierre con ✕ y Escape) | alto |
| WA-132 | Estado **"Analizando la conversación..."** + extracción IA (`POST /chat/extract-order`) | `ChatManualOrderModal.js:47-79,171-173` | WhatsApp | automático | Col-H | Sí (LOTE B7a) — estado «Analizando la conversación...» + `POST /api/admin/inbox/whatsapp/copiloto/extraer` (`InboxManualOrderModal.js:145-196`); 404 = chat sin historial → llenado manual sin toast de error | medio |
| WA-133 | Campos: **Nombre, Cédula, Dirección** | `ChatManualOrderModal.js:176-202` | WhatsApp | estado | Col-H | Sí (LOTE B7a) — campos Nombre, Cédula y Dirección (`InboxManualOrderModal.js:362-410`) prellenados por la IA | bajo |
| WA-134 | **Agregar / quitar producto** y cambiar cantidad | `ChatManualOrderModal.js:147-156,204-227` | WhatsApp | botón | Col-H | Sí (LOTE B7a) — «+ Agregar», selector de catálogo, cantidad (`number`, min 1) y papelera por fila (`InboxManualOrderModal.js:414-495`) | bajo |
| WA-135 | Carga de **catálogo** (`GET /products`) y **métodos de pago** (`GET /payments`) | `ChatManualOrderModal.js:31-46` | WhatsApp | automático | Col-H | Sí (LOTE B7a) — `GET /api/admin/inbox/products` + `GET /api/admin/inbox/payments` en paralelo (`InboxManualOrderModal.js:126-160`) | bajo |
| WA-136 | Campo **Notas** | `ChatManualOrderModal.js:229-237` | WhatsApp | estado | Col-H | Sí (LOTE B7a) — campo Notas (`InboxManualOrderModal.js:497-512`) | bajo |
| WA-137 | Selector de **Método de Pago** | `ChatManualOrderModal.js:239-251` | WhatsApp | botón | Col-H | Sí (LOTE B7a) — selector de Método de Pago con preselección del primero activo (`InboxManualOrderModal.js:514-548`) | bajo |
| WA-138 | **Comprobante extraído del chat** (preview + "Ver imagen completa") | `ChatManualOrderModal.js:255-273` | WhatsApp | estado | Col-H | Sí (LOTE B7a) — comprobante extraído del chat: preview 64×64 + «Ver imagen completa» (`InboxManualOrderModal.js:556-605`) | medio |
| WA-139 | **Subir comprobante manual** + guardar venta (`POST /manual-sale` multipart) | `ChatManualOrderModal.js:85-145,274-296` | WhatsApp | botón | Col-H | Sí (LOTE B7a) — subida manual del comprobante + `POST /api/admin/inbox/whatsapp/venta-manual` (multipart `canal`+`usuarioId`+`data`+`comprobante`) (`InboxManualOrderModal.js:218-290`) | medio |

### 1.J — Consola Instagram — orquestador (`InstagramConsole.js`, 665 líneas)

> **Nota de vigencia (LOTE B7b, 2026-09-13):** las filas de §1.J a §1.N ya están **verificadas contra el código** tras el cierre de Instagram. Filas de IG-01 a IG-57: **56 «Sí» + 1 «N/A» (IG-15, retirado por decisión de producto)**, 0 «Parcial» y 0 «No».

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| IG-01 | **Bot global ON/OFF de Instagram** (`GET/POST /api/admin/ig/bot-toggle`) | `InstagramConsole.js:49-87` | Instagram | botón | Raíl (estado de canal) | Sí (LOTE B6) — `InboxConsole.js:585-633` por `GET/POST /api/admin/inbox/instagram/bot-toggle`, pintado en `InboxChannelSettings.js:106-168` | bajo |
| IG-02 | Socket `ig_bot_toggle` (sincroniza el switch global) | `InstagramConsole.js:247-251,272` | Instagram | automático | Raíl | Sí (LOTE B6) — `hooks/useInboxSocket.js:36,217` (opción `onBotToggle`, sin debounce) → `InboxConsole.js:712` | bajo |
| IG-03 | `fetchConversations` → `GET /api/admin/ig/historial` (preserva `messages`/`unreadCount` locales, autoselección del primero en desktop) | `InstagramConsole.js:90-122` | Instagram | automático | Col-C | **Sí por equivalencia (LOTE B7b), con divergencia deliberada** — `cargarLista` (`InboxConsole.js:371-408`) NO toca `mensajes` (el hilo abierto conserva lo cargado) y el store adopta `noLeidos`/`ultimoMensaje` del servidor; la AUTOSELECCIÓN se descarta a propósito porque seleccionar marca leído (§8.3 · A-66 · IN-14) | medio |
| IG-04 | `marcarLeidoEnServidor` → `POST /api/admin/inbox/leido` (ya unificado) | `InstagramConsole.js:127-138` | Instagram | automático | Global | Sí — `InboxConsole.js:397-410` | bajo |
| IG-05 | `fetchMessagesForActiveContact` → `GET /api/admin/ig/historial?usuario=` | `InstagramConsole.js:141-154` | Instagram | automático | Col-H | Sí → `/inbox/hilo` | bajo |
| IG-06 | Ocultar `#global-sidebar` en móvil con chat activo | `InstagramConsole.js:168-186` | Instagram | automático | Col-H | Sí — `InboxConsole.js:378-394` | bajo |
| IG-07 | Socket `mensaje_ig` (append + dedupe de temporales + contador no leídos) | `InstagramConsole.js:192-241,270` | Instagram | automático | Global | **Sí (LOTE B7b)** — `useInboxSocket.js:70,227,384` entrega `mensaje_ig`/`mensaje_messenger`/`nuevo_mensaje` SIN debounce y `InboxConsole.js:752` appendea al hilo abierto, deduplica el temporal por texto y sube `noLeidos` si no es la conversación activa (la recarga sigue como fuente de verdad) | medio |
| IG-08 | Socket `ig_actualizado` (recarga) | `InstagramConsole.js:243-245,271` | Instagram | automático | Global | Sí — `useInboxSocket.js:25` | bajo |
| IG-09 | Socket `ig_modo_actualizado` (modo + `requiresAttention`) | `InstagramConsole.js:253-268,273` | Instagram | automático | Col-C × Col-H | **Sí (LOTE B7b)** — `useInboxSocket.js:80,252,396` + `InboxConsole.js:828` parchean `modo` y recalculan `requiereAtencion` en sitio (manual · stuck · bloqueado · anuncio, §6.2.1) | medio |
| IG-10 | `handleToggleContactBotMode` → `POST /api/admin/ig/modo` (optimista + rollback) | `InstagramConsole.js:286-346` | Instagram | botón | Col-H | Sí — `InboxConsole.js:564-598` (vía `/inbox/modo`) | bajo |
| IG-11 | `handleSelectContact` (selección + reset local + leído explícito) | `InstagramConsole.js:349-357` | Instagram | botón | Col-C | Sí — `InboxConsole.js:412-421` | bajo |
| IG-12 | `handleSend` → `POST /api/admin/ig/enviar` (con fallback mock) | `InstagramConsole.js:360-440` | Instagram | botón | Col-H | Sí — `/inbox/mensaje` | bajo |
| IG-13 | `handleSendImage` → `POST /api/admin/ig/enviar-imagen` (con fallback mock) | `InstagramConsole.js:442-526` | Instagram | botón | Col-H | Sí — `/inbox/adjunto` | bajo |
| IG-14 | Estado vacío "Instagram Direct" | `InstagramConsole.js:644-680` | Instagram | estado | Col-H | Sí — `InboxConsole.js:688-735` (texto unificado) | bajo |
| IG-15 | `INITIAL_INSTAGRAM_CONVERSATIONS` (mock con `ig_user_*`, se usa como fallback y en modo demo) | `mockData.js:7-224` | Instagram | estado | — | **N/A — RETIRADO (LOTE B7b)** — decisión de producto, no una brecha: el inbox consume SOLO el endpoint real y NO tiene modo demo, tal como pide §3 («Retirar o mantener como modo demo explícito; no debe filtrarse a producción»). Se eligió RETIRAR. El archivo `mockData.js` queda intacto (prohibido tocar `features/instagram/**`) | bajo |
| IG-16 | Banners globales de bot pausado | `InstagramConsole.js:567-597` | Instagram | estado | Col-H | **Sí (LOTE B7b)** — `InboxConsole.js:1503` (estado del switch de canal, LOTE B6) → `InboxThread.js:1057` pinta el banner con el texto literal y «Reactivar Bot» (`onReactivarBotCanal` → `alternarBotInstagram(true)`) | medio |

### 1.K — Consola Instagram — `InstagramSidebar.js` (430)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| IG-17 | Cabecera "Instagram Direct · Mensajería de Meta Direct" | `InstagramSidebar.js:64-177` | Instagram | estado | Col-C | **Sí (LOTE B7a; verificado en B7b)** — `InboxSidebar.js:31-36` (`DESCRIPTOR_CANAL.instagram = "Instagram Direct · Mensajería de Meta Direct"`), visible bajo el título «Inbox unificado» | bajo |
| IG-18 | **Switch Bot ON/OFF global** (`role="switch"`, `aria-checked`) | `InstagramSidebar.js:127-164` | Instagram | botón | Raíl | Sí (LOTE B6) — `InboxChannelSettings.js:106-168` (`role="switch"` + `aria-checked` + ON/OFF) en el engranaje de la cabecera de la lista | bajo |
| IG-19 | Badge total de no leídos Instagram (rosa) | `InstagramSidebar.js:165-175` | Instagram | estado | Col-C | Sí — `totalesNoLeidos.instagram` | bajo |
| IG-20 | Buscador "nombre, @usuario o mensaje" | `InstagramSidebar.js:181-213` | Instagram | botón | Col-C | Sí — `InboxFilterBar.js:62-95` | bajo |
| IG-21 | Pestaña **Todos** | `InstagramSidebar.js:223-236` | Instagram | botón | Col-C | Sí | bajo |
| IG-22 | Pestaña **No Leídos** + contador | `InstagramSidebar.js:238-263` | Instagram | botón | Col-C | Sí | bajo |
| IG-23 | Fila IG: avatar con **aro de historia** si hay no leídos | `InstagramSidebar.js:305-313` | Instagram | estado | Col-C | **Sí (LOTE B7b)** — `InboxConversationRow.js:15,143-160` pinta el avatar LEGACY `InstagramAvatar` con `hasStoryRing={noLeidos>0}` (Col-C) y `InboxThread.js:813-827` lo repite en la cabecera | bajo |
| IG-24 | **Insignia verificada** (`fa-check-circle`) | `InstagramSidebar.js:347-351` | Instagram | estado | Col-C | **Sí (LOTE B7b)** — `InboxConversationRow.js:212-224` (`perfil.verificado` → `fa-check-circle text-sky-500`, `data-testid="ig-verificado"`); en la cabecera del hilo, `InboxThread.js:840-853` | bajo |
| IG-25 | **Badge de anuncio** (`fa-bullhorn`) | `InstagramSidebar.js:352-358` | Instagram | estado | Col-C | Sí — `InboxConversationRow.js:163-168` | bajo |
| IG-26 | Nombre completo || `@username` || "Usuario de Instagram" | `InstagramSidebar.js:336-346` | Instagram | estado | Col-C | Sí — `nombreVisible`/`username` | bajo |
| IG-27 | Hora relativa (`Ayer`, mes/día) | `InstagramSidebar.js:12-24,361-372` | Instagram | estado | Col-C | Sí — `InboxConversationRow.js:34-45` | bajo |
| IG-28 | Preview "**@username:** mensaje" | `InstagramSidebar.js:384-407` | Instagram | estado | Col-C | **Sí (LOTE B7b)** — `InboxConversationRow.js:102-113,290` antepone `@username:` al preview de las filas de Instagram (con el color rosa de la marca) | bajo |
| IG-29 | Pill de no leídos con gradiente IG | `InstagramSidebar.js:408-418` | Instagram | estado | Col-C | **Sí (LOTE B7b)** — `InboxConversationRow.js:39,362` usa `CANAL_META[canal].pill` (IG = `from-[#E1306C] to-[#833AB4]`); la hora con no leídos también toma el color del canal | bajo |
| IG-30 | Estado vacío "No se encontraron conversaciones" | `InstagramSidebar.js:276-287` | Instagram | estado | Col-C | Sí — `InboxSidebar.js:149-192` | bajo |

### 1.L — Consola Instagram — `InstagramHeader.js` (181) y `InstagramAvatar.js` (101)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| IG-31 | Botón **Volver** (móvil) | `InstagramHeader.js:36-47` | Instagram | botón | Col-H | Sí — `InboxThread.js:192-203` | bajo |
| IG-32 | Avatar + nombre + **insignia verificada** en cabecera | `InstagramHeader.js:49-87` | Instagram | estado | Col-H | **Sí (LOTE B7b)** — `InboxThread.js:813-827` (avatar legacy) y `:840-853` (insignia `fa-check-circle`, `data-testid="ig-verificado-header"`) | bajo |
| IG-33 | Fila meta `@username • Instagram` | `InstagramHeader.js:88-108` | Instagram | estado | Col-H | **Sí (LOTE B7b)** — `InboxThread.js:885` intercala `Instagram · ` en la fila meta cuando el canal es Instagram | bajo |
| IG-34 | Botón **Modo Bot/Manual** (`Bot Activo` / `Modo Manual`) | `InstagramHeader.js:119-143` | Instagram | botón | Col-H | Sí — `InboxThread.js:256-279` | bajo |
| IG-35 | Badge de canal "Direct" | `InstagramHeader.js:145-157` | Instagram | estado | Col-H | Sí — chip de canal `InboxThread.js:222-233` | bajo |
| IG-36 | Botón **Ficha del contacto** (info) | `InstagramHeader.js:159-174` | Instagram | botón | Col-H | **Sí (LOTE B7b)** — `InboxThread.js:1004-1031` (`data-testid="ig-info-btn"`, `aria-label="Información del perfil de Instagram"`, `fas fa-info`), visible solo con canal Instagram; abre el drawer `InboxConsole.js:1678-1691` | alto |
| IG-37 | **InstagramAvatar**: fallback a iniciales sobre gradiente + `onError` | `InstagramAvatar.js:13-77` | Instagram | automático | Col-C × Col-H | **Sí (LOTE B7b) — componente LEGACY REUTILIZADO** — `public/src/features/instagram/components/InstagramAvatar.js` importado tal cual (`?v=4`, misma instancia que la consola legacy) desde `InboxConversationRow.js:15` y `InboxThread.js:813`; iniciales + `onError` verificados en el harness | bajo |
| IG-38 | Aro de historia, punto **online**, `aria-label` | `InstagramAvatar.js:79-98` | Instagram | estado | Col-C | **Sí (LOTE B7b)** — el mismo `InstagramAvatar` recibe `hasStoryRing`/`online` (aro de historia y punto verde) y su `aria-label`/`title` con el nombre viven en el componente legacy | bajo |

### 1.M — Consola Instagram — `InstagramMessageList.js` (251), `InstagramInput.js` (124), `InstagramQuickReplyBar.js` (113)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| IG-39 | Banner "Conversación de Instagram Direct" | `InstagramMessageList.js:99-121` | Instagram | estado | Col-H | **Sí (LOTE B7b)** — `InboxThread.js:1131-1155` pinta la píldora centrada con el icono en gradiente y el texto literal del legacy (`data-testid="ig-canal-banner"`), solo con canal Instagram | bajo |
| IG-40 | **Separadores de fecha** (Hoy/Ayer/fecha larga) | `InstagramMessageList.js:18-33,128-147` | Instagram | estado | Col-H | Sí — `InboxThread.js:52-62,397-411` | bajo |
| IG-41 | Avatar del cliente en mensajes entrantes | `InstagramMessageList.js:159-167` | Instagram | estado | Col-H | Sí — `InboxThread.js:440-448` | bajo |
| IG-42 | Burbuja saliente con gradiente IG | `InstagramMessageList.js:170-179` | Instagram | estado | Col-H | Sí — `CANAL_META.instagram.saliente` (`InboxThread.js:22-23`) | bajo |
| IG-43 | Reproductor de **audio** en burbuja | `InstagramMessageList.js:182-192` | Instagram | estado | Col-H | Sí — `InboxThread.js:473-483` | bajo |
| IG-44 | Imagen → `window.open` en pestaña nueva | `InstagramMessageList.js:194-205` | Instagram | botón | Col-H | Sí — `InboxThread.js:494` | bajo |
| IG-45 | **Formato de texto** (*negritas* / _itálicas_) y `whitespace-pre-wrap` | `InstagramMessageList.js:35-77,207-217` | Instagram | automático | Col-H | Sí — `InboxThread.js:82-103` | bajo |
| IG-46 | Hora + check de "Entregado por Instagram Direct" | `InstagramMessageList.js:219-239` | Instagram | estado | Col-H | **Sí (LOTE B7b)** — `InboxThread.js:338` (`STATUS_IG_SALIENTE`) + `:1110-1115`: si el servidor no aporta `status` (IG no emite estados por webhook), el saliente cae al doble check con `title="Entregado por Instagram Direct"` | bajo |
| IG-47 | Composer: botón adjuntar imagen (`accept="image/*"`) | `InstagramInput.js:70-83` | Instagram | botón | Col-H | Sí — `InboxThread.js:154,582-597` | bajo |
| IG-48 | Composer: textarea `rows=3` + placeholder + **Enter/Shift+Enter** + send con gradiente + refoco tras enviar | `InstagramInput.js:85-117` | Instagram | botón | Col-H | **Sí (LOTE B7b)** — `rows=3` desde B7a (WA-76); `InboxThread.js:1840-1850` usa `meta.enviar` (gradiente oficial en Instagram) y `:758-767` reenfoca el textarea tras el envío (origen `InstagramInput.js:20-26`) | bajo |
| IG-49 | **Barra + bottom sheet de Respuestas Rápidas de IG** (reusa `QuickReplyBottomSheet` y `parseTemplate`) | `InstagramQuickReplyBar.js:28-108` | Instagram | botón | Col-H | Sí (LOTE B2) — la barra de Respuestas Rápidas del inbox se monta en el hilo para TODOS los canales (`InboxThread.js:1490`), reutilizando `QuickReplyBottomSheet` + `parseTemplate` del legacy | alto |

### 1.N — Consola Instagram — `InstagramCustomerDrawer.js` (358)

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe en el inbox nuevo? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| IG-50 | Drawer de perfil IG (cabecera + cerrar) | `InstagramCustomerDrawer.js:29-62` | Instagram | modal | Col-H | **Sí (LOTE B7b) — componente LEGACY REUTILIZADO** — `InstagramCustomerDrawer.js` importado tal cual (`?v=4`) y montado en `InboxConsole.js:1678-1691`; lo abre el botón ℹ️ (`InboxThread.js:1004-1031`). Se mapea el objeto unificado a su prop `contact` (`InboxConsole.js:1477-1501`), sin editar el legacy | alto |
| IG-51 | Avatar grande con aro IG + nombre + **@username** + **seguidores** | `InstagramCustomerDrawer.js:69-113` | Instagram | estado | Col-H | **Sí (LOTE B7b)** — el drawer reutilizado pinta el avatar (`InstagramAvatar size="xl" hasStoryRing`), el nombre y `@username`; los SEGUIDORES salen de la extensión `perfil` del contrato (§6.2) que aporta `instagramAdapter.ts:85,193` desde `EtiquetaIg.metadata` | medio |
| IG-52 | **Bio** del usuario | `InstagramCustomerDrawer.js:116-126` | Instagram | estado | Col-H | **Sí (LOTE B7b)** — `perfil.bio` (`instagramAdapter.ts:85-96` → `normalizarPerfil` en `normalizar.ts:284`); el drawer la omite si viene `null`, igual que el legacy | medio |
| IG-53 | **Control individual del bot** (switch + textos dinámicos) | `InstagramCustomerDrawer.js:128-228` | Instagram | botón | Col-H | **Sí (LOTE B7b)** — el drawer reutilizado trae el switch con sus textos; su `onToggleBotMode(id, next)` se cablea a `cambiarModo(modoDeseado)` (`InboxConsole.js:1342,1688`) por `POST /inbox/modo` | bajo |
| IG-54 | **Badge "Vino de un anuncio"** | `InstagramCustomerDrawer.js:230-245` | Instagram | estado | Col-H | **Sí (LOTE B7b)** — `contact.origen` se mapea desde el objeto unificado (`InboxConsole.js:1489`), así que el badge del drawer se enciende con `origen === "anuncio"` | bajo |
| IG-55 | Stats: **Canal (Direct/Meta)** y **Estado (en línea / última conexión)** | `InstagramCustomerDrawer.js:247-312` | Instagram | estado | Col-H | **Sí (LOTE B7b)** — stat «Canal · Direct (Meta)» del drawer; el estado usa `perfil.online`/`perfil.lastSeen` (`InboxConsole.js:1494-1500`), con la misma caída a «Desconectado» del legacy | bajo |
| IG-56 | Botón **Ver perfil en Instagram** (`instagram.com/<username>` en pestaña nueva) | `InstagramCustomerDrawer.js:318-333` | Instagram | botón | Col-H | **Sí (LOTE B7b)** — lo aporta el drawer reutilizado; `contact.username` viene del objeto unificado, así que el enlace es `https://instagram.com/<username>` con `target="_blank"` | medio |
| IG-57 | Botón **Crear Pedido desde Chat** (placeholder "fase 2") | `InstagramCustomerDrawer.js:334-349` | Instagram | botón | Col-H | **Sí (LOTE B7b)** — lo aporta el drawer reutilizado, con su toast de «fase 2»; sigue siendo un placeholder (decisión abierta en §6.6 AMB-01) | bajo |

### 1.O — Inbox nuevo — lo que la V3 DEBE preservar (`public/src/features/inbox/`)

> Estas 45 filas **ya viven en el inbox nuevo** y son el mínimo que la migración a V3 no puede romper. La columna "¿Ya existe?" es `Sí` por definición; el valor real está en "Dónde debe vivir en la V3".

| ID | Función | Archivo:línea origen | Canal(es) | Tipo | Dónde debe vivir en la V3 | ¿Ya existe? | Riesgo si se pierde |
|---|---|---|---|---|---|---|---|
| IN-01 | `leerMute()` con fallback `pachi_muted_inbox` → `pachi_muted` | `InboxConsole.js:48-56` | Todos | automático | Raíl/Global | Sí | medio |
| IN-02 | `playNotificationTone` (mensaje / pago) | `InboxConsole.js:59-94` | Todos | automático | Global | Sí | alto |
| IN-03 | `detectarAlertas` (detecta noLeidos↑, evita avisar de la activa visible, distingue pago) | `InboxConsole.js:218-241` | Todos | automático | Global | Sí | alto |
| IN-04 | `cargarLista` con `?canal=&limite=100&buscar=&noLeidos=&modo=&atencion=&conPedido=` | `InboxConsole.js:243-279` | Todos | automático | Col-C | Sí | alto |
| IN-05 | Manejo de errores 404/403/genérico + aviso de backend no desplegado | `InboxConsole.js:262-275` | Todos | estado | Col-C | Sí | medio |
| IN-06 | `cargarHilo` paginado + `fusionarMensajes` (dedupe temporales) | `InboxConsole.js:283-315,157-185` | Todos | automático | Col-H | Sí | alto |
| IN-07 | `useInboxSocket`: `inbox_actualizado` + 10 eventos legacy normalizados + debounce 800 ms | `useInboxSocket.js:16-123` | Todos | automático | Global | Sí | alto |
| IN-08 | Debounce de 300 ms al cambiar filtros/búsqueda | `InboxConsole.js:333-345` | Todos | automático | Col-C | Sí | bajo |
| IN-09 | Listener `refreshChatList` (paridad con el botón del sidebar WA) | `InboxConsole.js:348-356` | Todos | atajo | Col-C | Sí | medio |
| IN-10 | Sincronización de la conversación activa con el store | `InboxConsole.js:359-368` | Todos | automático | Col-H | Sí | bajo |
| IN-11 | Listener `pachi_mute_toggled` | `InboxConsole.js:371-375` | Todos | automático | Global | Sí | bajo |
| IN-12 | Ocultar `#global-sidebar` en móvil con conversación activa | `InboxConsole.js:378-394` | Todos | automático | Col-H | Sí | alto |
| IN-13 | `marcarLeido` optimista → `/inbox/leido` | `InboxConsole.js:397-410` | Todos | automático | Col-H | Sí | alto |
| IN-14 | `abrirConversacion` (limpia hilo, marca leído, carga página 1) | `InboxConsole.js:412-421` | Todos | botón | Col-C→Col-H | Sí | alto |
| IN-15 | `cerrarConversacion` (botón volver móvil) | `InboxConsole.js:423-428` | Todos | botón | Col-H | Sí | medio |
| IN-16 | `cargarMasMensajes` (paginación desde el banner de pedido/hilo) | `InboxConsole.js:430-437` | Todos | botón | Col-H | Sí | medio |
| IN-17 | `enviarMensaje` optimista `temp-` + dedupe + rollback `failed` + toast | `InboxConsole.js:439-509` | Todos | botón | Col-H | Sí | alto |
| IN-18 | `enviarAdjunto` (imagen/documento + preview local) | `InboxConsole.js:511-562` | Todos | botón | Col-H | Sí | alto |
| IN-19 | `cambiarModo` optimista + rollback + toasts manual/bot | `InboxConsole.js:564-598` | Todos | botón | Col-H | Sí | alto |
| IN-20 | `resetBot` → `/inbox/reset` con confirmación por toast | `InboxConsole.js:600-622` | WhatsApp | botón | Col-H | Sí | alto |
| IN-21 | `toggleMute` (persiste `pachi_muted_inbox`, emite evento, toast) | `InboxConsole.js:624-634` | Todos | botón | Raíl | Sí | medio |
| IN-22 | Borradores **por conversación** (`borradores[clave]`) que persisten al cambiar de chat | `InboxConsole.js:200,640-646` | Todos | estado | Col-H | Sí | medio |
| IN-23 | `construirParams` / `normalizarLista` / `ordenarConversaciones` defensivos | `InboxConsole.js:118-154` | Todos | automático | — | Sí | bajo |
| IN-24 | Estado vacío "Inbox unificado" + rol de sesión | `InboxConsole.js:688-735` | Todos | estado | Col-H | Sí | bajo |
| IN-25 | Sidebar: cabecera con total de conversaciones y no leídos globales | `InboxSidebar.js:44-117` | Todos | estado | Col-C | Sí | bajo |
| IN-26 | **Botón mute del inbox** (`fa-bell` / `fa-bell-slash`) | `InboxSidebar.js:97-115` | Todos | botón | Raíl | Sí | medio |
| IN-27 | Estado de **error** de lista con mensaje accionable | `InboxSidebar.js:136-148` | Todos | estado | Col-C | Sí | bajo |
| IN-28 | Estado vacío con **Limpiar filtros** | `InboxSidebar.js:149-192` | Todos | botón | Col-C | Sí | bajo |
| IN-29 | Filas de conversación (delegación a `InboxConversationRow`) | `InboxSidebar.js:193-200` | Todos | estado | Col-C | Sí | bajo |
| IN-30 | Buscador unificado + limpiar | `InboxFilterBar.js:60-95` | Todos | botón | Col-C | Sí | bajo |
| IN-31 | Chips de canal `Todos·WhatsApp·Instagram·Messenger` con conteo + punto de no leídos; Messenger deshabilitado si total 0 | `InboxFilterBar.js:10-36,97-147` | Todos | botón | **Raíl** (V3 los mueve al raíl) | Sí | alto |
| IN-32 | Toggles **No leídos / Modo manual / Atención / Con pedido** con contadores | `InboxFilterBar.js:149-223` | Todos | botón | Col-C | Sí | medio |
| IN-33 | Botón **Actualizar lista** (`onRefresh`) | `InboxFilterBar.js:224-239` | Todos | botón | Col-C | Sí | bajo |
| IN-34 | Fila: avatar + **badge de canal** + **badge de modo manual** | `InboxConversationRow.js:96-134` | Todos | estado | Col-C | Sí | medio |
| IN-35 | Fila: nombre + iconos de **atención / estancado / anuncio** | `InboxConversationRow.js:140-192` | Todos | estado | Col-C | Sí | bajo |
| IN-36 | Fila: preview con prefijo "Tú:" si el último es saliente | `InboxConversationRow.js:207-220` | Todos | estado | Col-C | Sí | bajo |
| IN-37 | Fila: chips de **canal + paso + pedido + bloqueado** | `InboxConversationRow.js:222-280` | Todos | estado | Col-C | Sí | bajo |
| IN-38 | Fila: **pill de no leídos** | `InboxConversationRow.js:282-293` | Todos | estado | Col-C | Sí | bajo |
| IN-39 | Fila: navegación por teclado + `aria-label` | `InboxConversationRow.js:77-95` | Todos | atajo | Col-C | Sí | bajo |
| IN-40 | Cabecera de hilo: volver + **chip de canal** + origen anuncio + `pasoLabel` | `InboxThread.js:182-254` | Todos | estado | Col-H | Sí | medio |
| IN-41 | Botones: **Modo manual/Bot ON**, **Reset bot (unlock, solo WA)**, **Consola (no Messenger)** | `InboxThread.js:255-309` | Todos | botón | Col-H | Sí | alto |
| IN-42 | **Banner de pedido** (correlativo, estado, nº pedidos) + "Verificar pago / despacho" | `InboxThread.js:314-346` | WhatsApp | estado | Col-H | Sí | alto |
| IN-43 | Hilo: burbujas con status (`enviando/sent/delivered/read/failed`), audio, imagen, documento, cita, fecha | `InboxThread.js:348-556` | Todos | estado | Col-H | Sí | alto |
| IN-44 | Composer: adjuntar (`accept` por canal) + textarea + enviar + `Enter/Shift+Enter` | `InboxThread.js:558-630` | Todos | botón | Col-H | Sí | alto |
| IN-45 | Auto-scroll con preservación de altura al paginar | `InboxThread.js:126-140,157-160` | Todos | automático | Col-H | Sí | medio |

---

## 2. Inventario de endpoints consumidos por cada consola

### 2.1 WhatsApp (`WhatsAppConsole.js` y sus componentes)

| Método | Ruta | Payload / query | Función en el cliente | ¿Contrato unificado? (§6.3) |
|---|---|---|---|---|
| GET | `/api/admin/historial` | — (modo lista) | `fetchChatList` | **Sí** → `GET /api/admin/inbox` (§6.1) |
| GET | `/api/admin/historial?telefono=&page=&limit=20` | query | `fetchChatHistory` | **Sí** → `GET /api/admin/inbox/hilo` (§6.3) |
| GET | `/api/admin/modos` | — | `fetchModes` | **Sí** → `modo` inline (§6.2) |
| GET | `/api/admin/chat-context?telefono=` | query | `fetchChatContext` (CRM) | **Sí** → `GET /api/admin/inbox/contexto` (§6.3) — **no consumido aún** |
| GET | `/api/admin/pedidos-historial?telefono=` | query | `fetchPurchases` | **No** hay equivalente en §6.3 (el `pedido` del objeto unificado es un resumen) → **el inbox lo CONSUME tal cual** desde el LOTE B7c (`InboxConsole.cargarCompras`), solo para WhatsApp: es una lectura por contacto, no una acción de chat, así que no se unifica |
| PATCH | `/api/admin/orders/:id/repartidor` | `{ repartidor }` | `handleAssignDriver` | **Sí** → `PATCH /api/admin/inbox/whatsapp/pedido/:id/repartidor` (§6.3) — **no consumido aún** |
| POST | `/api/admin/confirmar_pago` | `{ telefono }` | `handleConfirmPayment` | **Sí** → `POST /api/admin/inbox/whatsapp/pago/confirmar` (§6.3) — **no consumido aún** |
| PATCH | `/api/admin/orders/:id/status` | `{ estado, telefono }` | `handleUpdateStatus` | **Sí** → `PATCH /api/admin/inbox/whatsapp/pedido/:id/estado` (§6.3) — **no consumido aún** |
| POST | `/api/admin/chats/modo` | `{ telefono, modo }` | `handleToggleMode` | **Sí** → `POST /api/admin/inbox/modo` (§6.3) |
| POST | `/api/admin/chat/upload` | multipart `file,to,caption?,replyToMid?,replyToText?` | adjunto | **Sí** → `POST /api/admin/inbox/adjunto` (§6.3) |
| GET | `/api/admin/quick-replies` | — | `QuickReplyBar` | **No** está en §6.3 (endpoint de catálogo, no de acción por chat) — el inbox no lo consume |
| PUT | `/api/admin/quick-replies/:id` | `{ usageCount }` | registrar uso | **No** en §6.3 |
| GET | `/api/admin/whatsapp/profile` | — | `WhatsAppProfileModal` | **No** en §6.3 (es un ajuste de canal, no una acción de chat) |
| POST | `/api/admin/whatsapp/profile` | `{ about,address,description,email,websites,vertical }` | guardar perfil | **No** en §6.3 |
| POST | `/api/admin/whatsapp/profile-picture` | multipart `file` | cambiar foto | **No** en §6.3 |
| GET | `/api/admin/products` | — | catálogo para venta manual | **No** en §6.3 |
| GET | `/api/admin/payments` | — | métodos de pago | **No** en §6.3 |
| POST | `/api/admin/chat/extract-order` | `{ telefono }` | copiloto IA | **No** en §6.3 |
| POST | `/api/admin/manual-sale` | multipart `data + comprobante` | venta manual | **No** en §6.3 |
| — | Socket `enviar_desde_panel` | `{ to,text,replyToMid?,replyToText?,retryMsgId?,retryWamid? }` | enviar/reintentar | **Sí** → `POST /api/admin/inbox/mensaje` (delega transporte al servidor) |
| — | Socket `refreshChatList` (evento de ventana) | — | refresco | **Sí** — reemplazado por `onRefresh` de la UI |

### 2.2 Instagram (`InstagramConsole.js` y sus componentes)

| Método | Ruta | Payload / query | Función en el cliente | ¿Contrato unificado? (§6.3) |
|---|---|---|---|---|
| GET | `/api/admin/ig/historial` | — (modo lista) | `fetchConversations` | **Sí** → `GET /api/admin/inbox` |
| GET | `/api/admin/ig/historial?usuario=` | query | `fetchMessagesForActiveContact` | **Sí** → `GET /api/admin/inbox/hilo` |
| GET | `/api/admin/ig/bot-toggle` | — | `fetchBotToggle` | **Sí** → `GET /api/admin/inbox/instagram/bot-toggle` (§6.3) — **no consumido aún** |
| POST | `/api/admin/ig/bot-toggle` | `{ enabled }` | `handleToggleBot` | **Sí** → `POST /api/admin/inbox/instagram/bot-toggle` (§6.3) — **no consumido aún** |
| POST | `/api/admin/inbox/leido` | `{ canal:"instagram", usuarioId }` | `marcarLeidoEnServidor` | **Ya unificado** — el cliente IG ya usa el endpoint nuevo |
| POST | `/api/admin/ig/modo` | `{ usuarioIgId, modo }` | `handleToggleContactBotMode` | **Sí** → `POST /api/admin/inbox/modo` |
| POST | `/api/admin/ig/enviar` | `{ usuarioIgId, texto }` | `handleSend` | **Sí** → `POST /api/admin/inbox/mensaje` |
| POST | `/api/admin/ig/enviar-imagen` | multipart `usuarioIgId, file` | `handleSendImage` | **Sí** → `POST /api/admin/inbox/adjunto` |
| GET | `/api/admin/quick-replies` | — | `InstagramQuickReplyBar` | **No** en §6.3 |
| PUT | `/api/admin/quick-replies/:id` | `{ usageCount }` | registrar uso | **No** en §6.3 |
| — | Socket `ig_bot_toggle` | `{ enabled }` | sincronizar switch global | **Sí** (evento de canal; `useInboxSocket` no lo escucha → brecha) |

> **Asimetría documentada (contrato §5.2):** WhatsApp envía texto por socket; Instagram por REST. El contrato unificado lo neutraliza con `POST /inbox/mensaje`, que el inbox nuevo ya usa. **La consola de WhatsApp NO se migró a ese endpoint** — sigue emitiendo `enviar_desde_panel`.

---

## 3. Funciones específicas de un solo canal y su comportamiento en la vista de 3 columnas

Con el **canal activo fijo en el raíl**, estas funciones deben **mostrarse u ocultarse según el canal activo** (no deben desaparecer del producto, pero tampoco contaminar los canales que no las soportan). La regla recomendada es la de `capacidades` del contrato (§6.5) + el canal del raíl.

| Función | Canal | Dónde debe vivir en la V3 | Regla de visibilidad recomendada |
|---|---|---|---|
| Perfil de WhatsApp Business (modal: About, descripción, vertical, dirección, email, web, foto) | WhatsApp | **Raíl**, al pie/sección de acciones del canal WhatsApp | Visible **solo** con el raíl en WhatsApp. Es un ajuste de canal, no de conversación. |
| Silenciar (mute) | Ambos (claves distintas) | **Raíl** (mute del inbox) **+** acción de canal en la cabecera de la Col-C | El mute de WhatsApp (`pachi_muted`) y el del inbox (`pachi_muted_inbox`) deben convivir y sincronizados por `pachi_mute_toggled`. |
| Bot global ON/OFF de Instagram | Instagram | **Raíl**, sección del canal Instagram | Visible solo con IG activo. Hoy **no existe** en el inbox. |
| Comanda PDF / venta manual (copiloto IA) | WhatsApp | **Col-H** (acción de la conversación) | Visible solo en conversaciones WhatsApp. Hoy mitigado por «Consola». |
| Confirmar pago / Despachar / Entregado (banners de acción) | WhatsApp | **Col-H** (banner sobre el composer, como hoy) | `capacidades.pago`/`pedidos` → solo WhatsApp con pedido activo. |
| Repartidor (asignar) + comprobante con zoom + GPS/Google Maps | WhatsApp | **Col-H** en la ficha del cliente | Solo WhatsApp. La ficha debe seguir existiendo en la V3 (hoy se sale a la consola). |
| Ficha CRM (LTV, compras, carrito en vivo, cédula) | WhatsApp | **Col-H** (drawer/bottom-sheet) | Solo WhatsApp. |
| Quick replies | WA + IG (comparten bottom-sheet) | **Col-H**, sobre el composer | Universal, con `chatContext` por canal (IG hoy pasa `items: []`). |
| Bot-toggle global de Instagram vs. modo por conversación | Instagram | Raíl (global) + Col-H (por chat) | Son **dos** controles distintos; no confundir. |
| Respuestas rápidas con tokens (`{items}`, `{totalUSD}`) | WhatsApp (con datos de carrito) / IG (sin carrito) | **Col-H** | En IG los tokens de carrito caen a "tu pedido"; documentar. |
| Presencia / typing | WhatsApp | **Col-H** (subtítulo de la cabecera) | Solo WhatsApp (`capacidades.presencia`). |
| Bloqueado / anti-spam | Instagram (y Messenger) | **Col-C** (chip) | Solo IG/Messenger. |
| Origen de anuncio | Todos (distinto detalle) | **Col-C** + cabecera | Universal; `detalleOrigen` por canal. |
| Presencia online + aro de historia + seguidores + bio + "Ver perfil en Instagram" | Instagram | **Col-H** (ficha IG) | Solo Instagram. |
| "Crear Pedido desde Chat" (IG) | Instagram | **Col-H** (ficha IG) | Es un **placeholder de fase 2**; documentar como no-funcional. |
| Mock/demo IG (`ig_user_*`) | Instagram | — | **RETIRADO en el LOTE B7b** (decisión de producto): el inbox consume solo el endpoint real y no tiene modo demo, para que no pueda filtrarse a producción. `mockData.js` queda intacto porque `features/instagram/**` no se toca. |

---

## 4. Comportamientos automáticos y de entorno

> **Nota de vigencia (LOTE B7c, 2026-09-13):** esta tabla se redactó ANTES de los lotes B2–B7c. Las filas **E-04, E-10, E-14 y E-20** quedaron **CERRADAS en B7c** (WA-04, WA-11/17/21/30/41, X-03/07/15) y varias observaciones antiguas (E-02, E-03, E-11, E-12, E-15) ya fueron superadas por B3/B5/B7a (mute sincronizado, Escape en los overlays reutilizados, ticks en vivo). La fuente de verdad sigue siendo la columna «¿Ya existe en el inbox nuevo?» de §1.

| # | Comportamiento | Origen | Estado en el inbox nuevo | Observación |
|---|---|---|---|---|
| E-01 | **Sonido de notificación** (Web Audio, tonos mensaje y pago) | `WhatsAppConsole.js:25-65` | **Replicado** (`InboxConsole.js:59-94`) | El inbox usa su propio `playNotificationTone`; el global del `index.html` usa `<audio>` con cash/alert/success. |
| E-02 | Silencio persistente | `pachi_muted` (WA/global) · `pachi_muted_inbox` (inbox) | **Parcial** | El inbox lee con fallback a `pachi_muted` (`InboxConsole.js:48-56`) y escribe `pachi_muted_inbox`. **Bug potencial: silenciar desde el inbox NO silencia el pitido global del `index.html`** (que solo mira `pachi_muted`). |
| E-03 | Sonido solo en modo manual o pestaña oculta | `WhatsAppConsole.js:518-522` | **Simplificado** — el inbox suena ante cualquier incremento de no leídos de una conversación no activa/oculta | Puede sonar más veces de lo deseado; documentar. |
| E-04 | **Badge `(N)` en el título** de la pestaña | `WhatsAppConsole.js:743-753,784-801` · `index.html:270-292` | **CERRADO (LOTE B7c)** | El inbox SÍ escribe `document.title` con los no leídos del **canal activo** (`InboxConsole.js:1225-1250`) y el contador global de push se inhibe mientras el inbox está montado (`index.html:275-284`). |
| E-05 | **Badge de no leídos** en el raíl/nav | `index.html:768-774` (`inboxUnread`) | **Sí** (global) | El raíl V3 necesita el desglose por canal. |
| E-06 | **Scroll automático** al último mensaje | `WhatsAppConsole.js:388-396` · `MessageList.js` | **Sí** (`InboxThread.js:130-140`) | Conserva altura al paginar. |
| E-07 | **Agrupación por fecha** (Hoy/Ayer/fecha larga es-VE) | `MessageList.js:6-21` · `InstagramMessageList.js:18-33` | **Sí** (`InboxThread.js:52-62,397-411`) | Fechas largas en `es-VE`. |
| E-08 | **Auto-ocultar el navbar global en móvil** con chat activo | `WhatsAppConsole.js:398-416` · `InstagramConsole.js:168-186` | **Sí** (`InboxConsole.js:378-394`) | Restaura al desmontar. |
| E-09 | **Persistencia en localStorage** | `pachi_muted` · `pachi_muted_inbox` · `theme` | **Parcial** | Ver E-02. `theme` es global y no se toca. |
| E-10 | **sessionStorage** | `pachi_inbox_deeplink` · `checklist_dismissed_session` · `audio_enabled_session` | **CERRADO (LOTE B7c)** | El deep-link ya se **consume**: el inbox lee y borra `pachi_inbox_deeplink` al montar (TTL 30 s) y abre la conversación (`InboxConsole.js:1275-1312`). `audio_enabled_session` sigue sin consultarlo el inbox (E-13). |
| E-11 | **Atajos de teclado** | Enter/Shift+Enter (composers), Escape (modales), doble-clic (citar) | **Parcial** | El inbox tiene Enter/Shift+Enter; **falta Escape** en todos los overlays (no hay lightbox ni modales propios) y **falta el doble-clic para citar**. |
| E-12 | **Cierre con Escape** | `ImageLightboxModal`, `QuickReplyBottomSheet`, `CustomerCardDrawer` | **No** | El inbox no tiene overlays con Escape (ni lightbox, ni bottom-sheet, ni ficha). |
| E-13 | **Permiso de audio / overlay "Activar Alertas"** | `index.html:1000-1073` + `audioEnabled` | **No consumido por el inbox** | El inbox reproduce Web Audio sin consultar `audioEnabled` (solo `pachi_muted*`). |
| E-14 | **Notificación de escritorio (Notification + SW)** | `index.html:236-262` | **CERRADO (LOTE B7c)** | El inbox la usa para los mensajes que entran por socket cuando la pestaña está oculta, con el canal en el título/cuerpo (`InboxConsole.js:985-995`); `sendPushNotification` queda endurecida (`index.html:241`). |
| E-15 | **Estado de entrega** (sent/delivered/read/failed) | `MessageBubble.js:136-207` | **Parcial** | El inbox pinta el vocabulario cerrado, pero **`mensaje_status_actualizado` no está en `useInboxSocket`** → los ticks no se refrescan en vivo. |
| E-16 | **Reacciones** | — | **No aplica** | No existen reacciones ni en WhatsApp ni en Instagram (ni emoji-reactions ni stickers interactivos). *Ambigüedad documentada:* los "stickers" solo aparecen como valor de `tipo` en el contrato, sin UI. |
| E-17 | **Drafts/buffer por conversación** | `WhatsAppConsole.js:118,132-141` · `InboxConsole.js:200,640-646` | **Sí** | El inbox los conserva al cambiar de chat. |
| E-18 | **Dedupe de mensajes optimistas** | `recentlySentRef` (WA) · `processedMsgKeysRef` (WA) · `fusionarMensajes` (inbox) | **Sí** | El inbox generaliza el patrón por canal. |
| E-19 | **Alertas de pago / stuck globales** (toasts flotantes + sonidos) | `index.html:475-533,679-736` | **Sí** (global) | Siguen activas independientemente del inbox. |
| E-20 | **Deep-link de conversación** (`pachi:focus-conversacion`) | `index.html:665-694` | **CONSUMIDO (LOTE B7c)** | El inbox escucha `pachi:focus-conversacion` y fija el raíl en el canal + abre la conversación (`InboxConsole.js:1131-1150`, `:1313-1327`). Las consolas legacy siguen sin escucharlo (no se tocan); el «Consola» abre la pestaña y, al volver al inbox, la conversación queda enfocada. |

---

## 5. Tabla de BRECHAS (lo más importante del documento)

Ordenada por severidad. **"Se pierde hoy si se migra a la V3 sin trabajo adicional"** = el elemento no existe en el inbox nuevo **y** nada lo cubre desde la V3. **"Mitigado"** = el botón «Consola» del hilo abre la consola legacy, que contiene la función (pero la convivencia de las 3 columnas la degrada: se sale del flujo).

### 5.1 Las 5 brechas más críticas (por severidad)

> **Nota de vigencia (LOTE B7a, 2026-09-13):** esta sección se redactó ANTES de los lotes B2–B7a. La fuente de verdad del estado actual es la columna «¿Ya existe en el inbox nuevo?» de §1 (verificada fila por fila contra el código en el LOTE B7a); usa lo de aquí solo para el análisis de severidad, no como inventario de pendientes.

| # | Brecha | Qué se pierde | Por qué es crítica | Mitigación mínima |
|---|---|---|---|---|
| **1** | **Quick Replies ausentes en el inbox** (WA-107..117, IG-49) | Toda la operativa de respuestas rápidas: bottom-sheet, buscador, categorías, favoritas, tokens `{nombre}{items}{totalUSD}{totalBS}{total}`, registro de uso, envío directo por socket/API | Es el acelerador #1 del operador. Existe en **ambas** consolas y es transversal a los 3 canales; el inbox no lo tiene en absoluto | Portar `QuickReplyBar` + `QuickReplyBottomSheet` + `parseTemplate` a `InboxThread` (Col-H), alimentando `chatContext` desde el objeto unificado/contexto |
| **2** | **Citar/responder y reintentar mensajes** (WA-74/92/93/94, WA-33/34) | Cita previa en el composer, botón Responder al hover, doble-clic para citar, auto-focus al citar, y botón **Reintentar** en mensajes fallidos | El inbox **sí renderiza** `replyToText` de mensajes citados (lee) pero **no permite citar** (escribe). Un mensaje fallido queda irrecuperable desde el inbox. Rompe el ciclo completo de conversación | Añadir `onReply`/`replyToMid`/`replyToText` a `InboxConsole.enviarMensaje` y `enviarAdjunto`, exponer `/inbox/mensaje` con esos campos, y botón de reintento sobre `status:"failed"` |
| **3** | **Acciones de pedido/pago/despacho desde el hilo** (WA-14/15/35/36/37, WA-13/128) | Confirmar Pago y Enviar Comandas · Despachar (En Ruta) · Marcar Entregado · Asignar Repartidor | Son el corazón del negocio (verificación de comprobante → despacho). Hoy dependen por completo de salir a la consola legacy vía «Consola». En la V3 de 3 columnas eso es una regresión de flujo | Reutilizar `POST /inbox/whatsapp/pago/confirmar` y `PATCH /inbox/whatsapp/pedido/:id/estado` (§6.3, ya contratados) + banner de acciones en Col-H |
| **4** | **Visor de comprobante de pago con zoom** (WA-126/127) | Ver el comprobante con Zoom +/−/reset y cerrar | El comprobante es el **insumo de la decisión de pago**. Verlo mal o no verlo bloquea la verificación. El inbox no tiene visor y el comprobante tampoco aparece en el hilo como adjunto garantizado | Integrar un visor de imagen con zoom (reutilizar `ImageLightboxModal`) accesible desde el banner de pedido y desde la ficha |
| **5** | **Perfil de WhatsApp Business + Bot global de Instagram en el raíl** (WA-45/39, IG-01/18/02) | Modal de perfil de WhatsApp Business (About/descripción/vertical/dirección/email/web/foto) y el switch global Bot ON/OFF de Instagram | El dueño los pidió **expresamente** ("administrador de perfil de WhatsApp"). El de IG además ya existe como endpoint en el contrato (§6.3) y queda huérfano si se retira la pestaña Instagram | Añadir ambos al raíl de canales, visibles según el canal activo |

### 5.2 Tabla completa de brechas por severidad

> **Nota de vigencia (LOTE B8, 2026-09-13):** esta tabla es el ANÁLISIS DE SEVERIDAD original (pre-lotes). **Todas las filas que aparecen aquí están CERRADAS o retiradas** tras B2–B8: las de Instagram en B2–B7b, las transversales en B7c (X-03/07/15 y WA-04/11/17/19/20/21/23/27/28/30/41) y **las dos últimas abiertas (X-13/X-14, NavButton de WhatsApp e Instagram) en B8**. No queda ninguna fila abierta. Ver la columna «¿Ya existe en el inbox nuevo?» de §1 para el estado real.

| Sev. | ID(s) | Brecha | ¿Nada la cubre? |
|---|---|---|---|
| **ALTO** | WA-107..117, IG-49 | Quick replies (barra + bottom sheet + tokens + uso) | Sí |
| **ALTO** | WA-74, WA-92, WA-93, WA-34 | Citar/responder (composer + hover + doble-clic) | Sí |
| **ALTO** | WA-33 | Reintentar mensaje fallido | Sí |
| **ALTO** | WA-14, WA-35 | Confirmar Pago desde el hilo | Mitigado por «Consola» |
| **ALTO** | WA-15, WA-36, WA-37 | Despachar / Entregado desde el hilo | Mitigado por «Consola» |
| **ALTO** | WA-13, WA-128 | Asignar repartidor | Mitigado por «Consola»/ficha |
| **ALTO** | WA-126, WA-127 | Ver comprobante con zoom | Sí |
| **ALTO** | WA-39, WA-45 | Perfil de WhatsApp Business (modal + botón) | Sí |
| **ALTO** | IG-01, IG-02, IG-18 | Bot global ON/OFF de Instagram | Sí |
| **ALTO** | WA-40, WA-70, WA-131 | Copiloto Venta Manual IA | Mitigado por «Consola» |
| **ALTO** | WA-12, WA-32, WA-38, WA-69, WA-118..125 | Ficha CRM (chat-context, drawer, LTV, carrito, cédula, dirección) | Mitigado por «Consola» |
| **ALTO** | WA-01, WA-02, WA-03, IN-02, IN-12 | Tonos y ocultar navbar móvil (base del inbox) | **Sí (ya cubierto)** — se listan aquí como "no romper" |
| **ALTO** | WA-04, X-03, E-04 | Badge de no leídos en el título de la pestaña | Sí (parcial: solo vía push) |
| **ALTO** | WA-18, WA-95, E-15 | Ticks de estado en vivo (delivered/read) | Sí |
| **ALTO** | X-15, E-20 | Deep-link enfoca la conversación | Sí (solo cambia de pestaña) |
| **ALTO** | X-12 | Pestaña `inbox` vs. layout V3 | Sí (label del raíl) |
| **ALTO** | IN-31 | Chips de canal deben moverse al raíl (no duplicarse) | Sí |
| **ALTO** | IN-41, IN-42 | Botones de cabecera y banner de pedido (preservar) | **Sí (ya cubierto)** |
| **ALTO** | E-02, E-13 | Silencio coherente entre inbox y pitidos globales; `audioEnabled` | Sí (parcial) |
| **MEDIO** | WA-11, WA-123 | Historial de compras en la ficha | Mitigado por «Consola» |
| **MEDIO** | WA-71 | Picker de emojis | Sí |
| **MEDIO** | WA-68, WA-19, WA-20, WA-29 | Presencia / typing | Sí |
| **MEDIO** | WA-72, WA-73 | Adjunto con caption + replyTo | Sí (parcial) |
| **MEDIO** | WA-88, WA-97..106 | Lightbox de imagen con zoom | Sí |
| **MEDIO** | WA-81, WA-83 | Banner de modo manual en el hilo / tarjetas de pedido en timeline | Sí |
| **MEDIO** | WA-91 | Ubicación compartida (Google Maps en el hilo) | Sí |
| **MEDIO** | WA-85, WA-90 | Tipo de documento con iconos / heurística multimedia | Sí (parcial) |
| **MEDIO** | WA-48 | Variantes de teléfono/cédula en búsqueda (58/0) | Sí (delegado al servidor) |
| **MEDIO** | WA-44, E-02, E-09 | Silencio por canal / claves de mute | Sí (parcial) |
| **MEDIO** | IG-16 | Banner global "bot pausado" | Sí |
| **MEDIO** | IG-36, IG-50, IG-51, IG-52, IG-56 | Ficha de perfil IG (bio, seguidores, ver perfil) | Sí |
| **MEDIO** | IG-23, IG-24, IG-33, IG-38 | Aro de historia, verificado, "• Instagram", online | Sí (parcial) |
| **MEDIO** | WA-30 | No leídos al volver a la pestaña | Sí (parcial) |
| **MEDIO** | WA-01..03 etc. | (ya cubierto) | — |
| **MEDIO** | IN-01, IN-26 | Mute del inbox y su persistencia | **Sí (ya cubierto)** |
| **MEDIO** | IN-09, IN-22 | Refresco y borradores | **Sí (ya cubierto)** |
| **MEDIO** | IN-23, IN-29, IN-36..39, IN-45 | Piezas de fila/hilo | **Sí (ya cubierto)** |
| **BAJO** | WA-41, WA-84 | Estética WhatsApp (doodle/colas) | Sí |
| **BAJO** | WA-54, WA-61, WA-62, WA-64 | Densidad y chips de fila | Sí |
| **BAJO** | WA-99, WA-100, WA-103, WA-104, WA-105, WA-106 | Detalles del lightbox (zoom−, reset, foco, scroll) | Sí |
| **BAJO** | WA-25, WA-26, WA-28 | Eventos socket puntuales (pedido_actualizado, bot_destrabado, alerta_orden_estancada) | Sí (parcial) |
| **BAJO** | IG-15 | Datos mock de IG | Sí |
| **BAJO** | IG-28, IG-29, IG-32, IG-39, IG-46, IG-55, IG-57 | Detalles visuales IG y placeholder de pedido | Sí |

---

## 6. Checklist de aceptación (verificable función por función)

> **Nota de vigencia (LOTE B7a, 2026-09-13):** esta sección se redactó ANTES de los lotes B2–B7a. La fuente de verdad del estado actual es la columna «¿Ya existe en el inbox nuevo?» de §1 (verificada fila por fila contra el código en el LOTE B7a); usa lo de aquí solo para el análisis de severidad, no como inventario de pendientes.

### 6.1 Estructura V3

- [ ] **A-01** El raíl lateral lista los 3 canales (WhatsApp · Instagram · Messenger) y fija el canal activo; el filtro de canal de la Col-C **no duplica** el raíl.
- [ ] **A-02** La Col-C muestra solo las conversaciones del canal activo y conserva buscador + toggles (no leídos · manual · atención · con pedido) + refresh.
- [ ] **A-03** La Col-H muestra el hilo de la conversación seleccionada con cabecera, hilo y composer.
- [ ] **A-04** En móvil: la Col-C se oculta con hilo abierto y `#global-sidebar` se auto-oculta; el botón volver cierra la conversación.
- [x] **A-05** Las pestañas legacy `chat` e `instagram` **no se eliminan** (siguen siendo el detalle por canal) y el deep-link desde el raíl/V3 las alcanza. → **CERRADO en el LOTE B8**: los NavButton se retiran del nav (`index.html:807-819` documenta el bloque retirado) pero los imports (`index.html:118-119`), el render condicional (`index.html:994-995`) y el deep-link `openCanalConsole` (`index.html:682-702` → botón «Consola» de `InboxThread.js:1053-1067`) siguen intactos; verificado montando el `App` real en el harness de render (la pestaña `chat` monta `WhatsAppConsole` y la `instagram` monta `InstagramConsole`).

### 6.2 Paridad WhatsApp (operatividad por chat — requisito textual del dueño)

- [ ] **A-10** Botón **Modo Manual / Bot ON** por conversación (optimista + rollback + toast).
- [ ] **A-11** Botón **Reset/Destrabar bot** (solo WhatsApp, con confirmación).
- [ ] **A-12** Banner de pedido con correlativo, estado y nº de pedidos.
- [ ] **A-13** Banner de acciones **Confirmar Pago y Enviar Comandas** cuando el estado es `pendiente_verificacion`/`verificar*`.
- [ ] **A-14** Banner **Despachar Pedido (En Ruta)** cuando `verificado`/`confirmado`.
- [ ] **A-15** Banner **Marcar como Entregado** cuando `en_ruta`.
- [ ] **A-16** **Citar/responder** un mensaje (botón hover + doble-clic + barra de cita cancelable + auto-focus) y que el envío lleve `replyToMid`/`replyToText`.
- [ ] **A-17** **Reintentar** un mensaje fallido con reconciliación in-place.
- [ ] **A-18** **Adjuntar** imagen, PDF y audio con `caption` opcional y `replyTo*` cuando hay cita.
- [ ] **A-19** **Emojis** (picker flotante).
- [ ] **A-20** **Quick Replies** en el hilo: barra + bottom sheet con buscador, categorías, favoritas, tokens resueltos con el contexto del chat y registro de uso.
- [ ] **A-21** **Ficha del cliente** (drawer desktop / bottom-sheet móvil): nombre, cédula, dirección, historial de compras, LTV, carrito en vivo con tasa BCV.
- [ ] **A-22** Botón **Abrir en Google Maps** con la dirección del cliente.
- [ ] **A-23** **Asignar repartidor** (selector + guardar + indicador del asignado).
- [ ] **A-24** **Ver comprobante con zoom** (imagen, +/−, reset, cerrar).
- [ ] **A-25** **Copiloto Venta Manual** (analizar chat, nombre/cédula/dirección, ítems con cantidad, notas, método de pago, comprobante extraído o subido, confirmar).
- [ ] **A-26** **Perfil de WhatsApp Business** accesible desde el raíl (About 139, descripción 512, vertical, dirección 256, email, 2 webs, foto ≤5 MB).
- [ ] **A-27** **Silenciar** notificaciones desde el raíl, coherente con el pitido global y el overlay de audio.
- [ ] **A-28** **Ticks de estado** en vivo (enviando/enviado/entregado/leído/falló) por `mensaje_status_actualizado`.
- [ ] **A-29** **Presencia/typing** en la cabecera del hilo.
- [ ] **A-30** **Ubicación compartida** abre Google Maps; **documento** descargable con icono por tipo; **audio** con reproductor; **imagen** con lightbox y zoom.

### 6.3 Paridad Instagram

> **CERRADO por el LOTE B7b (2026-09-13)** — los 9 ítems quedan verificados. ✅

- [x] **A-40** **Bot global ON/OFF** de Instagram en el raíl (estado de canal, con socket `ig_bot_toggle`). → LOTE B6 (`InboxChannelSettings.js` + `useInboxSocket.js:36`) + banner global en el hilo (IG-16, `InboxThread.js:1057`).
- [x] **A-41** **Modo por conversación** (automático/manual) desde la cabecera y desde la ficha. → `InboxThread.js:862-886` (cabecera) y el switch del drawer `InstagramCustomerDrawer` → `InboxConsole.js:1342,1688` (IG-53).
- [x] **A-42** **Ficha del contacto IG**: avatar, nombre + verificado, @username, seguidores, bio, estado online, "Ver perfil en Instagram". → drawer legacy reutilizado montado en `InboxConsole.js:1678-1691` (IG-50..57); alimentado por la extensión `perfil` (`instagramAdapter.ts:85,193`).
- [x] **A-43** **Origen de anuncio** visible (fila + cabecera + ficha). → `InboxConversationRow.js`, `InboxThread.js:900-907` y el badge del drawer (IG-54).
- [x] **A-44** **Enviar imagen** (solo imagen por canal, `accept` dinámico). → `InboxThread.js:507,1571` (`accept = canal === "whatsapp" ? … : "image/*"`).
- [x] **A-45** **Quick Replies** compartidas (ya cubierto por A-20). → LOTE B2 (`InboxQuickReplyBar` + `QuickReplyBottomSheet` reused, IG-49).
- [x] **A-46** En el hilo IG: banner de canal, separadores de fecha, avatar del cliente, formato *negrita* _itálica_, audio, imagen. → `InboxThread.js:1131-1155` (IG-39) + IG-40/41/42/43/44/45 y el check de entrega IG (IG-46).
- [x] **A-47** Chip/indicador de **bloqueado (anti-spam)** para IG/Messenger. → `InboxConversationRow.js:339-350`.
- [x] **A-48** El canal Messenger queda con `capacidades` mínimas (sin pedidos/pago/repartidor) y muestra avatar/perfil si el contrato los aporta. → `instagramAdapter.ts` (capacidades vacías) + `perfil` también para Messenger (`normalizar.ts:406`).

### 6.4 Comportamientos automáticos y de entorno

> **Nota de vigencia (LOTE B7c, 2026-09-13):** §6.1 y §6.2 se redactaron ANTES de los lotes B2–B7a (A-10..A-30 quedaron cubiertos por B2..B7b; verificado también el checklist de §6.3). **§6.4 se cierra con B7c en A-62/A-63/A-74/A-75**; el resto de §6.4 (A-60/61/64..73) estaba ya cubierto por B3–B7a. La fuente de verdad del pendiente es la columna «¿Ya existe en el inbox nuevo?» de §1.

- [ ] **A-60** Sonido de mensaje y de pago (distinguibles) con respeto al mute.
- [ ] **A-61** El mute del inbox y el mute de WhatsApp están sincronizados (o el raíl expone ambos claramente).
- [x] **A-62** Badge de no leídos en el título de la pestaña y en el raíl/nav, con desglose por canal. → **LOTE B7c (WA-04)**: `document.title` = `(N) BASE` con N de `totalesNoLeidos[canalActivo]` (`InboxConsole.js:1225-1250`) + badge del raíl por canal (`InboxChannelRail.js`) y `inboxUnread` global (`index.html:791-797`, alimentado por `fetchInboxUnread`).
- [x] **A-63** Notificación de escritorio (Notification/SW) cuando la pestaña está oculta. → **LOTE B7c (X-03)**: `window.sendPushNotification` invocada desde el canal de mensajes del socket con el canal en el título (`InboxConsole.js:985-995`); SW registrado en `index.html:468-473`.
- [ ] **A-64** Auto-scroll al último mensaje con preservación de altura al paginar (20 por página).
- [ ] **A-65** Agrupación por fecha (Hoy/Ayer/fecha larga es-VE).
- [ ] **A-66** Marcado de leído optimista + `POST /inbox/leido` idempotente; no marcar leído al previsualizar.
- [ ] **A-67** `Escape` cierra todos los overlays (lightbox, ficha, bottom-sheet, modales).
- [ ] **A-68** Enter envía / Shift+Enter nueva línea en el composer.
- [ ] **A-69** Doble-clic cita el mensaje.
- [ ] **A-70** Borradores por conversación persistentes al cambiar de chat.
- [ ] **A-71** `#global-sidebar` oculto en móvil con hilo abierto y restaurado al salir.
- [ ] **A-72** Debounce de refresco ante ráfagas de socket (una invalidación por lote).
- [ ] **A-73** Dedupe de temporales (mensaje optimista no duplica al llegar el real).
- [x] **A-74** Eventos legacy consumidos sin romper las consolas viejas (`nuevo_mensaje`, `mensaje_status_actualizado`, `cliente_presencia`, `cliente_typing`, `pago_enviado_cliente`, `order_status_changed`, `pago_confirmado`, `pedido_actualizado`, `bot_destrabado`, `estado_actualizado`, `alerta_orden_estancada`, `mensaje_ig`, `ig_actualizado`, `ig_bot_toggle`, `ig_modo_actualizado`, `mensaje_messenger`, `messenger_actualizado`). → **CERRADO en B7c**: los 17 eventos (más `whatsapp_message` y `inbox_actualizado`) están suscritos en `useInboxSocket.js` sin tocar las consolas legacy (`git diff --stat public/src/features/{whatsapp,instagram}/` VACÍO); verificado con el harness (suscripciones + socket mudo + socket nulo).
- [x] **A-75** Deep-link: al pulsar «Consola» la conversación **correcta** queda enfocada en la consola de destino (hoy no ocurre). → **CERRADO en B7c (X-15)**: el inbox consume `pachi_inbox_deeplink`/`pachi:focus-conversacion` y abre esa conversación (`InboxConsole.js:1131-1150`, `:1275-1327`); las consolas legacy, que no se pueden editar, siguen ignorándolo (queda documentado).
- [ ] **A-76** Sin regresiones de accesibilidad: `aria-label`/`title` en botones y navegación por teclado en las filas.

### 6.5 Endpoints y contrato

- [ ] **A-80** El inbox consume el contrato unificado §6.3 (`/inbox`, `/inbox/hilo`, `/inbox/mensaje`, `/inbox/adjunto`, `/inbox/modo`, `/inbox/leido`, `/inbox/reset`, `/inbox/contexto`, `/inbox/whatsapp/*`, `/inbox/instagram/bot-toggle`) sin romper los legacy mientras las consolas sigan montadas.
- [ ] **A-81** `/inbox/mensaje` y `/inbox/adjunto` aceptan y propagan `replyToMid`/`replyToText`/`caption`.
- [ ] **A-82** `GET /inbox/hilo` no tiene efectos secundarios (no resetea no leídos).
- [ ] **A-83** `GET /inbox/contexto` alimenta la ficha del cliente y el `chatContext` de las quick replies.
- [ ] **A-84** `POST /inbox/reset` solo para WhatsApp (`409` en IG/Messenger).

### 6.6 Ambigüedades documentadas (a resolver con el dueño antes de cerrar la migración)

- [ ] **AMB-01** "Crear Pedido desde Chat" (IG) es un **placeholder de fase 2** — ¿entra en el alcance de la V3?
- [ ] **AMB-02** ¿El perfil de WhatsApp Business y el bot global de IG son ajustes **de canal** (raíl) o **globales** (Config)? Hoy son accesos de consola.
- [x] **AMB-03** ¿Se retiran las pestañas `chat`/`instagram` del nav principal al llegar la V3, o se mantienen como deep-link? → **RESUELTO en el LOTE B8 (2026-09-13)**: se retiran **los NavButton** del nav principal (decisión del dueño: «el inbox es el punto de entrada, las consolas siguen siendo el detalle») pero **se conservan las pestañas y sus consolas** como vista de detalle por canal, accesibles por el deep-link `openCanalConsole` desde el botón «Consola» del hilo (`index.html:682-702`, `index.html:994-995`, `InboxThread.js:1053-1067`).
- [ ] **AMB-04** ¿La migración conserva `pachi_muted` o unifica el silencio bajo `pachi_muted_inbox`?
- [ ] **AMB-05** El contrato define `tipo:"sticker"` pero **no hay UI de stickers/reacciones** en ningún canal; confirmar que no se espera.

---

## Anexo — Veredicto rápido por bloque (cifras verificadas con script)

> **Actualizado por el LOTE B8 (2026-09-13)** con un script sobre la propia matriz (IDs únicos, sin duplicados). Sustituye el recálculo de B7c (que daba 209 Sí / 2 Parcial); el recuento real de §1 es **212 filas** de consolas + entorno (ver la corrección de recuento de B7b) y **257** con el inbox nativo.

| Sección | Bloque | Filas | Sí | Parcial | No | N/A |
|---|---|---|---|---|---|---|
| 1.A | Transversales / entorno (`X-`) | 16 | 16 | 0 | 0 | 0 |
| 1.B | WhatsApp · orquestador | 42 | 42 | 0 | 0 | 0 |
| 1.C | WhatsApp · sidebar + ContactCard | 22 | 22 | 0 | 0 | 0 |
| 1.D | WhatsApp · header + input | 15 | 15 | 0 | 0 | 0 |
| 1.E | WhatsApp · MessageList + MessageBubble | 17 | 17 | 0 | 0 | 0 |
| 1.F | WhatsApp · ImageLightboxModal | 10 | 10 | 0 | 0 | 0 |
| 1.G | WhatsApp · QuickReply (bar + sheet + parseTemplate) | 11 | 11 | 0 | 0 | 0 |
| 1.H | WhatsApp · CustomerCardDrawer | 13 | 13 | 0 | 0 | 0 |
| 1.I | WhatsApp · ChatManualOrderModal | 9 | 9 | 0 | 0 | 0 |
| — | **Subtotal consolas + entorno** | **212** | **211** | **0** | **0** | **1** |
| 1.J | Instagram · orquestador | 16 | 15 | 0 | 0 | 1 |
| 1.K | Instagram · sidebar | 14 | 14 | 0 | 0 | 0 |
| 1.L | Instagram · header + avatar | 8 | 8 | 0 | 0 | 0 |
| 1.M | Instagram · messageList + input + quickReply | 11 | 11 | 0 | 0 | 0 |
| 1.N | Instagram · CustomerDrawer | 8 | 8 | 0 | 0 | 0 |
| 1.O | Inbox nuevo (a preservar, no perder) | 45 | 45 | 0 | 0 | 0 |
| | **TOTAL** | **257** | **256** | **0** | **0** | **1** |

*(Los 57 de Instagram están repartidos entre 1.J–1.N: 56 «Sí» + 1 «N/A» (IG-15, retirado por decisión de producto en B7b). Las 2 filas que estaban «Parcial» eran **X-13** y **X-14** (los NavButton de WhatsApp e Instagram): **cerradas en el LOTE B8** al retirarlos del nav principal, conservando pestañas y consolas como vista de detalle. Riesgo de las filas no-Sí: 0 alto · 0 medio · 1 bajo.)*

> **Conclusión (actualizada en B8):** la conclusión original («el inbox cubre el triage pero no la capa operativa, 91 brechas») está **superada**. Tras B2–B8, el inbox unificado cubre **las 212 funciones** de las consolas + entorno (211 «Sí» + 1 «N/A» retirado por producto; **0 brechas, 0 parciales**) y el Inbox es el punto de entrada único de los 3 canales. Dos matices honestos: (1) **WA-19/WA-20 son «Sí» solo a nivel de cliente** porque el backend no emite `cliente_presencia`/`cliente_typing` (brecha de backend, idéntica en el legacy), y (2) el foco del atajo X-15 solo lo consume el INBOX; las consolas legacy (intocables en todos los lotes) siguen ignorando `pachi:focus-conversacion`, de modo que **abren la vista de detalle pero no enfocan la conversación** — se llega a ellas por el botón «Consola» del hilo y se vuelve con el NavButton «Inbox».

---

### Trazabilidad de esta auditoría

- Archivos leídos íntegramente: **30 `.js`** (`whatsapp/` 1 + 11 componentes, `instagram/` 1 + 7 componentes + 1 mock, `inbox/` 1 + 4 componentes + 1 hook) + `public/index.html` (1092) + `docs/inbox-unificado-contrato.md` (1044).
- Greps ejecutados: `onClick`, `onChange`, `onSubmit`, `onKeyDown`, `onDoubleClick`, `title=`, `aria-label`, `placeholder`, `showToast`, `Modal`, `useEffect`, `addEventListener`, `socket.on/emit/off`, `localStorage`, `sessionStorage`, `Notification`, `Audio`, `apiClient.*`, `scale(`.
- Sin `git add/commit/push/stash/reset` ni arranque de servidor. Ninguna edición al código de producción.
