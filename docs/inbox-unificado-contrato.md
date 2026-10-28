# Contrato de datos — Inbox Unificado (WhatsApp · Instagram · Messenger)

**Estado:** propuesta de diseño. No se ha modificado código de producción.
**Fecha:** 2026-09-13
**Alcance:** definir el contrato de datos para un INBOX UNIFICADO con filtros por canal en el panel admin.

> **Nota de cambios durante la redacción:** el canal **Messenger** aterrizó en el árbol de
> trabajo (sin commitear) mientras se producía este informe: `services/messenger.ts`,
> `controllers/messengerWebhookController.ts`, `routes/messengerWebhookRoutes.ts`, el campo
> `canal` en los 4 modelos, el ruteo por canal en `instagramFlowService.ts` y el montaje del
> webhook en `index.ts`. El documento fue revisado y actualizado contra ese árbol en dos pasadas.
> Ver §1 para el estado pieza por pieza.
> **Los archivos de producción no fueron tocados por esta tarea.**

> **Método:** todos los campos documentados abajo fueron extraídos leyendo el código real
> (`controllers/adminController.ts`, `routes/adminRoutes.ts`, `index.ts`, `models/*.ts`,
> `utils/pasoEmbudo.js`, `public/src/features/**`). Cada afirmación lleva referencia de línea.
> Los campos que **no** se devuelven hoy están señalados explícitamente como *"no presente"*,
> no como suposición.

---

## Índice

1. [Mapa de superficie actual](#1-mapa-de-superficie-actual)
2. [Shape exacto — WhatsApp](#2-shape-exacto--whatsapp)
3. [Shape exacto — Instagram](#3-shape-exacto--instagram)
4. [Contrato de tiempo real (Socket.IO)](#4-contrato-de-tiempo-real-socketio)
5. [Acciones del panel: método + payload](#5-acciones-del-panel-método--payload)
6. [Contrato unificado propuesto](#6-contrato-unificado-propuesto)
7. [Tabla de brechas](#7-tabla-de-brechas)
8. [Notas de implementación frontend](#8-notas-de-implementación-frontend)
9. [Prerrequisitos y riesgos](#9-prerrequisitos-y-riesgos)

---

## 1. Mapa de superficie actual

### Endpoints de lectura

| Canal | Método | Ruta | Handler | Línea |
|---|---|---|---|---|
| WhatsApp | GET | `/api/admin/historial` | `getHistorial` | `adminController.ts:509` |
| WhatsApp | GET | `/api/admin/modos` | `getModos` | `adminController.ts:1658` |
| WhatsApp | GET | `/api/admin/chat-context` | `getChatContext` | `adminController.ts:1088` |
| WhatsApp | GET | `/api/admin/pedidos-historial` | `getPedidosHistorial` | `adminController.ts:1248` |
| WhatsApp | GET | `/api/admin/etiquetas` | `getEtiquetas` | `adminController.ts:1267` |
| Instagram | GET | `/api/admin/ig/historial` | `getInstagramHistorial` | `adminController.ts:668` |
| Instagram | GET | `/api/admin/ig/bot-toggle` | `getInstagramBotToggle` | `adminController.ts:999` |

Todas las rutas pasan por `isAuthenticated` y `authorize(["chat:manage"])`
(`routes/adminRoutes.ts:152-213`). **No existe hoy ningún endpoint `/api/admin/inbox`.**

### Colecciones / modelos implicados

| Canal | Mensajes | Estado de conversación | Pedidos |
|---|---|---|---|
| WhatsApp | `models/Mensaje.ts` (clave `telefono`, `canal` default `"whatsapp"`) | `models/Etiqueta.ts` (clave `telefono`, `canal` default `"whatsapp"`) | `models/Pedido.ts` (clave `whatsappId`) |
| Instagram | `models/MensajeIg.ts` (clave `usuarioIgId`, `canal` default `"instagram"`) | `models/EtiquetaIg.ts` (clave `usuarioIgId`, `canal` default `"instagram"`) | — |
| Messenger | `models/MensajeIg.ts` con `canal: "messenger"`, clave `usuarioIgId` = **PSID** | `models/EtiquetaIg.ts` con `canal: "messenger"` | — |

#### Estado real del canal Messenger (verificado en el árbol de trabajo)

> ⚠️ **Este frente avanzó mientras se redactaba este documento.** La versión inicial de este
> informe decía que Messenger no existía; ya no es cierto. Estado a la fecha de verificación:

| Pieza | Estado | Evidencia |
|---|---|---|
| Tipo `CanalMensajeria = "whatsapp" \| "instagram" \| "messenger"` | **Existe** | `types/models.d.ts:24-30` |
| Campo `canal` en `Etiqueta`, `EtiquetaIg`, `Mensaje`, `MensajeIg` | **Existe** (defaults `"whatsapp"`/`"instagram"`, `index: true`) | diffs sin commitear en los 4 modelos |
| Cliente Graph API de Messenger | **Existe** — `enviarTextoMessenger`, `enviarImagenMessenger`, `enviarQuickRepliesMessenger`, `getUserMessengerProfile` | `services/messenger.ts` (296 líneas, sin trackear) |
| Ruteo por canal en el flujo conversacional | **Existe** — `SALIDA_POR_CANAL`, `getCanalConfig`, `getFiltroUsuario`, `camposCanal`, `emitirMensajeCanal`, `emitirActualizadoCanal` | `services/instagramFlowService.ts:26-109` |
| Eventos socket de Messenger | **Existe** — `mensaje_messenger`, `messenger_actualizado` | `instagramFlowService.ts:50` |
| Prefijo de MID | `igmid` (IG) · `fbmid` (Messenger) | `instagramFlowService.ts:45,49` |
| **Webhook de entrada** | **EXISTE** — `GET/POST /webhook/messenger` con `validateMetaHmac`, montado en `index.ts` con `webhookLimiter` | `routes/messengerWebhookRoutes.ts` · `controllers/messengerWebhookController.ts` (237 líneas) |
| Detección de origen (Click to Messenger) | **EXISTE** — `detectReferralData()` (`source === "ADS"` \| `ad_id` \| `OPEN_THREAD`) | `messengerWebhookController.ts:60-75` |
| **Endpoints admin** | **NO EXISTE** — nada bajo `/api/admin/*/messenger` | — |
| **UI** | **NO EXISTE** — ningún componente consume `mensaje_messenger`/`messenger_actualizado` | — |

Variables de entorno del canal: `FB_PAGE_ACCESS_TOKEN`, `FB_PAGE_ID`, `FB_VERIFY_TOKEN`
(con fallback a `VERIFY_TOKEN`) — ver `services/messenger.ts:24-34` y
`messengerWebhookController.ts:40`.

> **Messenger está completo de punta a punta en el backend de conversación** (webhook → flujo →
> persistencia → Graph API → eventos socket). Lo único que falta es **la capa admin y la UI**.
> Es decir: el inbox unificado no es solo una mejora de UX para Messenger — **es su primera
> interfaz**, porque hoy no hay forma de ver ni responder esas conversaciones desde el panel.


Nombre del campo de identidad: Messenger **reutiliza `usuarioIgId`** para almacenar el PSID y se
distingue por `canal`. No hay un campo `usuarioMessengerId`. Esto es deliberado
(`instagramFlowService.ts:64-76`: *"PSID de Facebook ≠ IGSID de Instagram"*) y es la razón por
la que el filtro de Messenger **sí** exige el discriminador mientras el de Instagram lo omite
por retrocompatibilidad.

**Consecuencia directa para el inbox unificado — bug latente de fuga de canal:**
`getInstagramHistorial` agrupa por `$usuarioIgId` y consulta `EtiquetaIg.find({ usuarioIgId: { $in: userIds } })`
**sin filtrar por `canal`** (`adminController.ts:719-742` y `790-792`). En cuanto el webhook de
Messenger empiece a escribir documentos con `canal: "messenger"`, esas conversaciones
**aparecerán dentro de la consola de Instagram**. Lo mismo aplica a `postInstagramModo`
(`adminController.ts:1056-1060`), `postInstagramEnviar` (`:840-848`) y
`postInstagramEnviarImagen` (`:905-915`), que filtran solo por `usuarioIgId`.
**Corregir esto es prerrequisito del inbox** (§9).


### Consumidores frontend

| Archivo | Líneas | Rol |
|---|---|---|
| `public/src/features/whatsapp/WhatsAppConsole.js` | 1127 | Orquestador consola WhatsApp |
| `public/src/features/whatsapp/components/WhatsAppSidebar.js` | 509 | Lista de chats + filtros |
| `public/src/features/whatsapp/components/ContactCard.js` | 169 | Fila de la lista |
| `public/src/features/whatsapp/components/WhatsAppInput.js` | 273 | Composer (texto por socket, archivos por REST) |
| `public/src/features/instagram/InstagramConsole.js` | 665 | Orquestador consola Instagram |
| `public/src/features/instagram/components/InstagramSidebar.js` | — | Lista + filtros (`all` \| `unread`) |
| `public/src/services/apiClient.js` | 61 | Axios centralizado (`withCredentials`, JWT cookie) |

---

## 2. Shape exacto — WhatsApp

### 2.1 `GET /api/admin/historial` — **modo lista** (sin `?telefono`)

Query params: `limit` (número de **conversaciones**, default `300`, `adminController.ts:556`).

```jsonc
{
  "success": true,
  "data": {
    "+584121234567": {                       // ← la CLAVE del map es el teléfono
      // --- siempre presente ---
      "resumen": {
        "_id":            "ObjectId (string)",
        "wamid":          "string | null",
        "status":         "string | null",   // fallback: "sent" si direccion==="bot", si no null
        "text":           "string",          // viene de m.texto (nombre de campo distinto al modelo)
        "caption":        "string | null",
        "fileName":       "string | null",
        "mediaUrl":       "string | null",
        "timestamp":      "number (epoch ms)",
        "direction":      "string",          // valor crudo de m.direccion: "cliente" | "bot"
        "tipo":           "string",          // default "texto"
        "mediaId":        "string | null",
        "mimeType":       "string | null"
      },
      "totalMensajes":  "number",
      "tienePedido":    "boolean",           // init false; true si hay Pedido ≤30 días
      "pedidosCount":   "number",            // init 0

      // --- SOLO si existe un doc Etiqueta para ese teléfono ---
      "paso":           "string | null",
      "pasoLabel":      "string | null",     // getPasoLabel(paso) — ver §2.3
      "stuck":          "boolean",           // et.stuck || false
      "nombre":         "string | null",     // et.carrito.nombre, con fallback a Pedido.cliente.nombre
      "cedula":         "string | null"
    }
  }
}
```

Referencias: agregación `adminController.ts:557-583`; construcción del objeto `586-610`;
enriquecimiento con `Etiqueta` `613-636`; enriquecimiento con `Pedido` `619-656`.

Notas de fidelidad:

- **El endpoint cambia de forma según la query.** Sin `telefono` → objeto-map indexado por
  teléfono. Con `?telefono=` → array de mensajes. El frontend lo trata defensivamente
  (`WhatsAppConsole.js:158-166`).
- `totalMensajes` se calcula sobre **todo** el historial del teléfono (no respeta paginación);
  el TTL de `Mensaje` es 90 días (`models/Mensaje.ts:25`), así que es el conteo de 90 días.
- `tienePedido` / `pedidosCount` solo cuentan pedidos con `timestamp >= now - 30 días`
  (`adminController.ts:618`).
- **`modo` NO viene en esta respuesta.** Se obtiene por separado (§2.2).
- **`avatar` NO existe.** El frontend lo genera con DiceBear a partir del teléfono
  (`ContactCard.js:55`).
- **`username` NO existe** para WhatsApp (no aplica).
- **`unreadCount` NO existe en el backend.** Es 100% estado de cliente (§2.4).
- **`origen` / `lastInteraction` / `requiresAttention` NO existen** en esta respuesta.
- **`etiqueta`** (el campo `Etiqueta.etiqueta`, p. ej. `"nuevo"`, `"compra_realizada"`) **no se
  devuelve** aquí; sí lo devuelve `GET /api/admin/etiquetas` (`adminController.ts:1272-1276`),
  pero ese endpoint lo consume **solo** `public/index.html:204-217` para la alerta global de
  clientes estancados, no la consola. `WhatsAppSidebar.js:55` lee `conv.etiqueta` como fallback
  de `stuck`, pero ese campo **nunca llega** desde `getHistorial` → siempre `undefined`.

### 2.2 `GET /api/admin/modos`

```jsonc
{ "success": true, "data": { "+584121234567": "manual" } }
```

`adminController.ts:1658-1670`. Devuelve **únicamente** los teléfonos cuyo `Etiqueta.modo === "manual"`.
Ausencia de clave = `"automatico"`. Es un mapa parcial, no exhaustivo — el frontend aplica el
default `"automatico"` (`WhatsAppConsole.js:340`).

### 2.3 `GET /api/admin/historial?telefono=X&page=1&limit=20` — **modo hilo**

```jsonc
{
  "success": true,
  "data": [
    {
      "_id":        "ObjectId (string)",
      "wamid":      "string | null",
      "status":     "string | null",
      "text":       "string",
      "caption":    "string | null",
      "fileName":   "string | null",
      "mediaUrl":   "string | null",
      "timestamp":  "number (epoch ms)",
      "direction":  "string",          // "cliente" | "bot"
      "tipo":       "string",          // "texto" | "imagen" | "audio" | "documento" | ...
      "mediaId":    "string | null",
      "mimeType":   "string | null",
      "replyToMid": "string | null",   // ← solo en modo hilo
      "replyToText":"string | null"    // ← solo en modo hilo
    }
  ],
  "pagination": { "total": "number", "page": "number", "pages": "number", "hasMore": "boolean" }
}
```

`adminController.ts:516-554`. Se devuelven en orden cronológico ascendente (`mensajes.reverse()`, línea 525).

**Efecto colateral crítico:** este endpoint **no marca leído nada**. No hay mutación de estado.

### 2.4 `pasoLabel` — catálogo canónico

`utils/pasoEmbudo.js` es la fuente única. `getPasoLabel(paso) => PASO_LABELS[paso] || paso`.

Pasos reales: `inicio`, `fin_semana_opciones`, `esperando_seleccion`, `esperando_producto`,
`esperando_cantidad`, `preguntando_mas`, `esperando_datos_cliente`, `esperando_cedula`,
`esperando_ubicacion`, `esperando_confirmacion_datos`, `esperando_pago_metodo`,
`esperando_efectivo_opcion`, `esperando_efectivo_monto`, `esperando_comprobante`,
`pendiente_verificacion`.
Alias legacy: `menu`, `carrito`, `ubicacion`, `pago`, `confirmacion_pago`, `esperando_verificacion`.

> Instagram **no tiene** este mapeo. `EtiquetaIg.paso` se devuelve crudo (§3.1).

### 2.5 No leídos en WhatsApp — **estado volátil de cliente**

No hay persistencia. `WhatsAppConsole.js` mantiene `unreadPerPhone` en `useState` y lo
incrementa en el handler de socket cuando `document.hidden || activePhone !== phone`
(`WhatsAppConsole.js:510-516`). Al recargar la página el contador vuelve a cero.

Existe además `Etiqueta.mensajesEnEsperaCount` (`models/Etiqueta.ts:12`) pero **es un campo
distinto** usado por el flujo del bot (mensajes encolados durante modo manual), no es un
contador de no leídos, y **no se devuelve en `getHistorial`**.

---

## 3. Shape exacto — Instagram

> **Aviso (Messenger):** `getInstagramHistorial` **no filtra por `canal`**, así que hoy es de
> facto el historial del *family* Instagram+Messenger. Cuando el webhook de Messenger entre en
> producción, estas mismas respuestas incluirán conversaciones de Messenger con
> `usuarioIgId` = PSID. Ver §1 y §9.

### 3.1 `GET /api/admin/ig/historial` — **modo lista** (sin `?usuario`)

Query params: `limit` = número de conversaciones (default `300`, `adminController.ts:718`).

```jsonc
{
  "success": true,
  "data": {
    "17841400000000000": {                    // ← CLAVE = usuarioIgId (IGSID)
      "id":              "string",            // === usuarioIgId (duplicado)
      "usuarioIgId":     "string",
      "username":        "string | null",     // @handle sin la arroba
      "fullName":        "string",            // default "Usuario de Instagram"; luego nombre || `@username`
      "avatar":          "string | null",     // profilePic || metadata.profilePic
      "paso":            "string",            // default "inicio"
      "modo":            "string",            // "manual" | "automatico"
      "operationMode":   "string",            // espejo exacto de modo
      "origen":          "string",            // "anuncio" | "directo"
      "stuck":           "boolean",
      "unreadCount":     "number",
      "requiresAttention":"boolean",          // modo==="manual" || stuck || origen==="anuncio"
      "resumen": {
        "_id":       "ObjectId (string)",
        "mid":       "string | null",
        "status":    "string",                // fallback: "sent" si bot, si no "received"
        "text":      "string",                // viene de m.texto
        "timestamp": "number (epoch ms)",
        "direction": "string",                // valor crudo de m.direccion
        "tipo":      "string",                // default "texto"
        "mediaUrl":  "string | null",
        "mediaType": "string | null"
      },
      "lastMessage": {                        // objeto ADICIONAL sólo en IG
        "text":      "string",
        "timestamp": "number (epoch ms)",
        "direction": "string"
      },
      "totalMensajes": "number"
      // ⚠️ NO existe "tienePedido" ni "pedidosCount" ni "cedula" ni "pasoLabel"
      // ⚠️ NO se devuelve "lastInteraction" aunque el modelo lo tiene
      // ⚠️ NO se devuelve "bloqueado" aunque el modelo lo tiene
    }
  }
}
```

Referencias: agregación `adminController.ts:719-742`; defaults endurecidos `748-785`;
merge con `EtiquetaIg` `790-814`.

Detalle importante de los defaults (`adminController.ts:748-760`): `paso`, `modo`,
`operationMode`, `origen`, `stuck`, `unreadCount`, `requiresAttention` **se rellenan siempre**
con hardcodes, incluso si no existe doc `EtiquetaIg`. WhatsApp, en cambio, omite esas claves
si no hay `Etiqueta`. Es una asimetría de contrato que el inbox unificado debe neutralizar.

`requiresAttention` (`adminController.ts:811-812`) es el único campo de "atención" ya
normalizado entre canales conceptualmente, pero **no existe para WhatsApp**.

`avatar`: puede ser una URL temporal de Meta (`scontent`/`fbcdn`/`fbsbx`) y el servicio intenta
refrescarla a Cloudinary (`instagramFlowService.ts:471-497`). El frontend debe tolerar 403/expiración.

### 3.2 `GET /api/admin/ig/historial?usuario=X` — **modo hilo**

```jsonc
{
  "success": true,
  "data": [
    {
      "_id":       "ObjectId (string)",
      "mid":       "string | null",
      "status":    "string",          // fallback bot->"sent", resto->"received"
      "text":      "string",
      "timestamp": "number (epoch ms)",
      "direction": "string",          // "cliente" | "bot" | "admin"
      "tipo":      "string",
      "mediaUrl":  "string | null",
      "mediaType": "string | null"
      // ⚠️ NO devuelve replyToMid / replyToText (sí existen en el modelo y en WhatsApp)
      // ⚠️ NO devuelve caption / fileName / mimeType / mediaId
    }
  ],
  "pagination": { "total": "number", "page": "number", "pages": "number", "hasMore": "boolean" }
}
```

`adminController.ts:692-716`. Orden ascendente (`mensajes.reverse()`, línea 692).

**Efecto colateral (importante):** antes de responder, resetea `unreadCount` a 0:

```js
await EtiquetaIg.findOneAndUpdate({ usuarioIgId: usuario }, { $set: { unreadCount: 0 } })
```

`adminController.ts:684-687`, dentro de un `try/catch` no bloqueante.

> **En Instagram "marcar leído" es un efecto secundario implícito de leer el hilo.**
> Es un `GET` con semántica de escritura — mal diseño REST y, para el inbox unificado, un
> problema real: si el inbox quiere previsualizar mensajes o hacer polling del hilo activo,
> borrará el contador sin que el operador haya leído. **Requiere endpoint explícito** (§6.3).

### 3.3 `GET /api/admin/ig/bot-toggle`

```jsonc
{ "success": true, "data": { "enabled": true } }
```

`adminController.ts:999-1008`. Lee `Setting.findOne({ key: "instagram.botEnabled" })`,
default `true`. **Es un interruptor GLOBAL del canal**, no por conversación — no pertenece al
modelo de acciones por chat.

---

## 4. Contrato de tiempo real (Socket.IO)

`index.ts:218-314`. Los eventos se emiten de forma **asimétrica**: WhatsApp usa un canal
genérico (`nuevo_mensaje`, `whatsapp_message`, `modo_actualizado`, `estado_actualizado`…),
Instagram usa canales prefijados (`mensaje_ig`, `ig_actualizado`, `ig_modo_actualizado`).

### Eventos que consumen las consolas

| Evento | Emisor | Payload | Consumido en |
|---|---|---|---|
| `nuevo_mensaje` | backend | `{_id, telefono, text/texto, direction, timestamp, status, wamid}` | `WhatsAppConsole.js:711` |
| `whatsapp_message` | backend | idem | `WhatsAppConsole.js:712` |
| `mensaje_status_actualizado` | backend | `{_id, telefono, wamid, status, error}` | `WhatsAppConsole.js:713` |
| `modo_actualizado` | backend | `{telefono, modo}` | `WhatsAppConsole.js:718` |
| `estado_actualizado` | backend | `{telefono, paso}` | `WhatsAppConsole.js:722` |
| `pago_enviado_cliente` | backend | objeto `Pedido` | `WhatsAppConsole.js:716` |
| `order_status_changed` | backend | `{...pedido}` | `WhatsAppConsole.js:717` |
| `pago_confirmado` | backend | objeto `Pedido` | `WhatsAppConsole.js:719` |
| `bot_destrabado` | backend | `telefono` (string suelto) | `WhatsAppConsole.js:721` |
| `mensaje_ig` | backend | `{usuarioIgId, mensaje: {_id, mid, status, texto, direccion, tipo, mediaUrl, mediaType, timestamp}, etiqueta?}` | `InstagramConsole.js:253` |
| `ig_actualizado` | backend | `{usuarioIgId}` | `InstagramConsole.js:254` |
| `ig_bot_toggle` | backend | `{enabled}` | `InstagramConsole.js:255` |
| `ig_modo_actualizado` | backend | `{usuarioIgId, modo}` | `InstagramConsole.js:256` |
| `mensaje_messenger` | backend | `{usuarioIgId, canal: "messenger", mensaje, etiqueta?}` | `instagramFlowService.ts:91-96` (**sin consumidor**) |
| `messenger_actualizado` | backend | `{usuarioIgId, canal: "messenger"}` | `instagramFlowService.ts:102-109` (**sin consumidor**) |

> Los eventos de Messenger ya se emiten pero **nadie los escucha**: no hay UI. El inbox unificado
> es su primer consumidor natural.


### Eventos que emite el cliente

| Evento | Dirección | Payload | Definido en |
|---|---|---|---|
| `enviar_desde_panel` | cliente → servidor | `{to, text, replyToMid?, replyToText?, retryMsgId?, retryWamid?}` | `index.ts:263` |
| `enviar_desde_panel_ig` | cliente → servidor | `{usuarioIgId, text}` | `index.ts:240` |
| `cambiar_modo` | cliente → servidor | `{telefono, modo}` | `index.ts:219` |
| `cambiar_modo_ig` | cliente → servidor | `{usuarioIgId, modo}` | `index.ts:225` |

> El inbox unificado necesita **un único evento de invalidación** (`inbox_actualizado`)
> emitido desde un solo punto, para no replicar 13 suscripciones (ver §6.4).

---

## 5. Acciones del panel: método + payload

### 5.1 WhatsApp

| Acción | Transporte | Payload exacto | Ref |
|---|---|---|---|
| Enviar **texto** | **Socket.IO** `enviar_desde_panel` | `{ to: string, text: string, replyToMid?: string\|null, replyToText?: string\|null }` | `WhatsAppConsole.js:842-847` · `index.ts:263-313` |
| Reintentar fallido | **Socket.IO** `enviar_desde_panel` | `{ to, text, retryMsgId, retryWamid }` | `WhatsAppConsole.js:887-892` |
| Enviar **imagen/archivo** | `POST /api/admin/chat/upload` (multipart) | `file` (binary, máx 10 MB), `to`, `caption?`, `replyToMid?`, `replyToText?` | `WhatsAppInput.js:85-107` · `adminRoutes.ts:232-238` · `adminController.ts:2588` |
| Cambiar modo | `POST /api/admin/chats/modo` | `{ telefono: string, modo: "manual" \| "automatico" }` | `WhatsAppConsole.js:344-347` · `adminController.ts:1700-1729` |
| Reactivar bot (emergencia) | `POST /api/admin/chats/reactivar` | `{ telefono: string }` | `adminController.ts:1672-1698` |
| Reset / destrabar bot | `POST /api/admin/reset-bot` | `{ telefono: string }` | `adminController.ts:1731-1773` |
| Confirmar pago | `POST /api/admin/confirmar_pago` | `{ telefono: string }` | `WhatsAppConsole.js:299-301` · `adminController.ts:1439` |
| Cambiar estado pedido | `PATCH /api/admin/orders/:id/status` | `{ estado: string, telefono: string }` | `WhatsAppConsole.js:318-323` · `adminController.ts:1775` |
| Asignar repartidor | `PATCH /api/admin/orders/:id/repartidor` | `{ repartidor: string }` | `WhatsAppConsole.js:282-284` · `adminController.ts:2014` |
| Obtener contexto/CRM | `GET /api/admin/chat-context?telefono=` | — | `adminController.ts:1088` |
| Obtener compras | `GET /api/admin/pedidos-historial?telefono=` | — | `adminController.ts:1248` |
| **Marcar leído** | — | **NO EXISTE** | — |
| Etiquetar | `POST /api/admin/etiqueta` | `{ telefono, ... }` | `adminController.ts:1287` |
| Copiloto venta manual | `POST /api/admin/chat/extract-order` | `{ telefono }` | `adminController.ts:3475` |
| Venta manual | `POST /api/admin/manual-sale` (multipart) | `{cliente, items, pago, ubicacion}` + `comprobante` | `adminController.ts:2665` |

`estado` válidos en `updateOrderStatus`: `pendiente_verificacion`, `verificado`, `en_ruta`,
`confirmado`, `entregado`, `cancelado`, `pendiente_pago` (`adminController.ts:1779-1785` +
`models/Pedido.ts:42`).

### 5.2 Instagram

| Acción | Transporte | Payload exacto | Ref |
|---|---|---|---|
| Enviar **texto** | `POST /api/admin/ig/enviar` | `{ usuarioIgId: string, texto: string }` | `InstagramConsole.js:377-380` · `adminController.ts:827-865` |
| Enviar **texto** (alt) | Socket.IO `enviar_desde_panel_ig` | `{ usuarioIgId, text }` | `index.ts:240-262` |
| Enviar **imagen** | `POST /api/admin/ig/enviar-imagen` (multipart) | `usuarioIgId`, `file` | `InstagramConsole.js:459-465` · `adminController.ts:867-933` |
| Cambiar modo | `POST /api/admin/ig/modo` | `{ usuarioIgId: string, modo: "manual" \| "automatico" }` | `InstagramConsole.js:300-303` · `adminController.ts:1038-1086` |
| Cambiar modo (alt) | Socket.IO `cambiar_modo_ig` | `{ usuarioIgId, modo }` | `index.ts:225-239` |
| **Bot global ON/OFF** | `POST /api/admin/ig/bot-toggle` | `{ enabled: boolean }` | `InstagramConsole.js:67` · `adminController.ts:1010-1036` |
| Leer hilo (= marcar leído) | `GET /api/admin/ig/historial?usuario=` | — | `adminController.ts:676-690` |
| **Marcar leído explícito** | — | **NO EXISTE** | — |
| Pedidos / pago / repartidor | — | **NO EXISTE** (sin modelo de pedidos) | — |

**Asimetrías accionables clave:**

- WhatsApp envía **texto por socket**; Instagram lo envía por **REST** (y por socket como alternativa).
- WhatsApp no marca leído; Instagram marca leído implícitamente al leer el hilo.
- Instagram tiene un toggle **global** de bot; WhatsApp no tiene equivalente global.
- El nombre de parámetro del destinatario difiere: `to`/`telefono` vs `usuarioIgId`.
- El campo de texto difiere en el transporte: `text` (socket WA), `texto` (REST IG), `caption` (multipart WA).

---

## 6. Contrato unificado propuesto

### 6.1 Lista de conversaciones

```
GET /api/admin/inbox?canal=todos|whatsapp|instagram|messenger
                    &limite=100
                    &buscar=<texto libre>
                    &noLeidos=true|false
                    &modo=manual|automatico
                    &atencion=true|false
```

- `canal` — default `todos`. Valor fuera del enum → `400`.
- `limite` — por canal (no global), cap recomendado `300`, default `100`.
- `buscar` — substring contra `nombreVisible`, `usuarioId`, `username`, `ultimoMensaje.texto`.
- Los filtros booleanos son **del servidor**, no del cliente: hoy WhatsApp e Instagram
  filtran en memoria sobre listas de hasta 300 elementos (`WhatsAppSidebar.js:96-153`,
  `InstagramSidebar.js:47`); con 3 canales eso no escala.

**Respuesta:**

```jsonc
{
  "success": true,
  "generadoEn": 1757800000000,
  "canal": "todos",                       // eco del filtro aplicado
  "totales":     { "todos": 143, "whatsapp": 120, "instagram": 21, "messenger": 2 },
  "totalesNoLeidos": { "todos": 9, "whatsapp": 0, "instagram": 7, "messenger": 2 },
  "data": [ /* ConversacionUnificada[] — ordenadas por ultimoMensaje.timestamp DESC */ ]
}
```

### 6.2 Objeto normalizado por conversación

```ts
type Canal = "whatsapp" | "instagram" | "messenger";
type Direccion = "entrante" | "saliente";
type Modo = "manual" | "automatico";
type Origen = "anuncio" | "directo";

interface ConversacionUnificada {
  // ── Identidad ────────────────────────────────────────────────
  clave:          string;        // "whatsapp:+584121234567" | "instagram:1784..." | "messenger:PSID"
  canal:          Canal;
  usuarioId:      string;        // id CRUDO del canal: telefono | usuarioIgId | psid
  nombreVisible:  string;        // nombre || username con @ || usuarioId  (NUNCA vacío)
  nombre:         string | null; // nombre real declarado, sin placeholders ("Sin nombre" → null)
  username:       string | null; // @handle. WhatsApp → null
  avatar:         string | null; // URL real. WhatsApp → null (el frontend decide el fallback)

  // ── Último mensaje ───────────────────────────────────────────
  ultimoMensaje: {
    texto:     string;           // "[Foto]" / "[Audio]" si no hay texto
    tipo:      "texto" | "imagen" | "audio" | "video" | "documento" | "sticker" | "otro";
    direccion: Direccion;        // normalizado desde "cliente"/"bot"/"admin"
    timestamp: number;           // epoch ms — SIEMPRE number
    status:    string | null;    // "sent"|"delivered"|"read"|"failed" — solo saliente
    mediaUrl:  string | null;
  } | null;

  // ── Estado de la conversación ────────────────────────────────
  noLeidos:          number;     // ≥0 siempre (WhatsApp: ver §9 prerrequisito)
  requiereAtencion:  boolean;    // computado por el servidor, definición ÚNICA (§6.2.1)
  paso:              string | null;   // clave cruda del embudo
  pasoLabel:         string | null;   // getPasoLabel(paso) — también para Instagram
  modo:              Modo;            // default "automatico"
  stuck:             boolean;         // default false
  bloqueado:         boolean;         // IG: anti-spam; WhatsApp: siempre false
  origen:            Origen;          // default "directo"
  detalleOrigen:     string | null;   // "ctwa" (WA) | "ig_ads" (IG) | null
  lastInteraction:   number | null;   // epoch ms; WA: derivado de ultimoMensaje — ver §7
  totalMensajes:     number;

  // ── Extensiones específicas de canal (null si no aplica) ─────
  pedido: {
    tienePedido:      boolean;
    pedidosCount:     number;
    ultimoEstado:     string | null;  // enum de Pedido.estado
    ultimoCorrelativo:string | null;  // "#12"
  } | null;                            // WhatsApp: objeto · Instagram/Messenger: null

  cedula: string | null;               // WhatsApp: de Etiqueta.carrito o Pedido.cliente · IG: null

  // ── Extensión espejo para los canales SIN CRM (LOTE B7b) ────
  // Simétrica de `pedido`: `pedido` es de WhatsApp y `perfil` de IG/Messenger.
  // `null` en WhatsApp. La ficha de perfil IG (InstagramCustomerDrawer) la usa.
  perfil: {
    bio:        string | null;   // EtiquetaIg.metadata.bio / .biography
    followers:  string | number | null; // .followers / .followers_count
    verificado: boolean;         // .verified / .is_verified  → insignia fa-check-circle
    online:     boolean | null;  // null = desconocido → cae a lastSeen / "Desconectado"
    lastSeen:   string | null;
    referral:   Record<string, any> | null; // metadata.referral (origen de anuncio)
  } | null;

  // ── Escape hatch ─────────────────────────────────────────────
  // Campos crudos del canal para no perder información en la migración.
  // El frontend NUEVO no debe leer de aquí; existe para las consolas existentes.
  fuente: Record<string, any> | null;
}
```

> **LOTE B7b (`perfil`).** Añadido el 2026-09-13 al cerrar la paridad de Instagram: el
> endpoint público de Instagram (`services/instagram.ts`) solo devuelve
> `username/name/profile_pic`, así que bio/seguidores/verificado/estado se leen —si
> existen— de `EtiquetaIg.metadata` (Mixed). Todos los campos son opcionales: si faltan,
> la ficha IG simplemente no los pinta (mismo comportamiento condicional que el
> `InstagramCustomerDrawer` legacy). `GET /api/admin/inbox/contexto` de IG expone los
> mismos campos dentro de `data.perfil`. Es ADITIVO y retrocompatible con las consolas
> legacy (el adaptador de WhatsApp sigue devolviendo `perfil: null`).

#### 6.2.1 Definición única de `requiereAtencion`

Hoy hay **tres** definiciones incompatibles:

| Canal | Definición | Ref |
|---|---|---|
| Instagram (servidor) | `modo === "manual" \|\| stuck \|\| origen === "anuncio"` | `adminController.ts:811-812` |
| Instagram (cliente, socket) | idéntica, recalculada | `InstagramConsole.js:246` |
| WhatsApp (cliente) | `paso ∈ estadosDePago \|\| stuck \|\| pasoLabel contiene "pago"/"comprobante"/"verificar"/"estancado"` | `WhatsAppSidebar.js:52-76` |

**Definición propuesta (única, servidor):**

```
requiereAtencion = (modo === "manual")
                || stuck
                || bloqueado
                || origen === "anuncio"
                || (paso ∈ PASOS_DE_PAGO)          // WA
                || (canal === "whatsapp" && pedido?.ultimoEstado === "pendiente_verificacion")
```

con `PASOS_DE_PAGO = { esperando_pago_metodo, esperando_efectivo_opcion, esperando_efectivo_monto,
esperando_comprobante, pendiente_verificacion }` (derivado de `utils/pasoEmbudo.js` + los
estados de `confirmarPago`, `adminController.ts:1447-1452`).

### 6.3 Endpoints de acción unificados

**Recomendación fuerte: `canal` y `usuarioId` en el BODY, no en el path.**
`usuarioId` de WhatsApp puede contener `+` y los IGSID son numéricos de 17 dígitos; meterlos
en el path obliga a doble encoding y rompe el `PATCH`/`DELETE` idempotente. El path se reserva
al canal cuando es fijo.

| Acción | Método | Ruta | Body / multipart | Notas |
|---|---|---|---|---|
| Leer hilo | `GET` | `/api/admin/inbox/hilo` | query `canal`, `usuarioId`, `page`, `limite` | **Sin efectos secundarios** |
| Enviar mensaje | `POST` | `/api/admin/inbox/mensaje` | `{ canal, usuarioId, texto, replyToMid?, replyToText? }` | WA→socket server-side · IG→`enviarTextoIg` |
| Enviar adjunto | `POST` | `/api/admin/inbox/adjunto` | multipart `canal`, `usuarioId`, `file`, `caption?` | WA: 10 MB, img/doc/audio · IG: solo imagen (`enviarImagenIg`) |
| Cambiar modo | `POST` | `/api/admin/inbox/modo` | `{ canal, usuarioId, modo }` | `400` si `modo ∉ {manual, automatico}` |
| **Marcar leído** | `POST` | `/api/admin/inbox/leido` | `{ canal, usuarioId }` | **NUEVO.** Idempotente. Ver §7 |
| Reset bot | `POST` | `/api/admin/inbox/reset` | `{ canal, usuarioId }` | WA: borra `paso`/`carrito`/`stuck` · IG: `501`/`409` |
| Contexto/CRM | `GET` | `/api/admin/inbox/contexto` | query `canal`, `usuarioId` | WA: ficha + LTV + tokens · IG: perfil + `origen` |
| Confirmar pago | `POST` | `/api/admin/inbox/whatsapp/pago/confirmar` | `{ usuarioId }` | canal en path: **exclusivo de WhatsApp** |
| Estado de pedido | `PATCH` | `/api/admin/inbox/whatsapp/pedido/:id/estado` | `{ estado, usuarioId }` | exclusivo de WhatsApp |
| Asignar repartidor | `PATCH` | `/api/admin/inbox/whatsapp/pedido/:id/repartidor` | `{ repartidor }` | exclusivo de WhatsApp |
| Bot global del canal | `GET`/`POST` | `/api/admin/inbox/instagram/bot-toggle` | `{ enabled: boolean }` | **estado de canal, no de chat** |
| Perfil de WhatsApp Business | `GET` | `/api/admin/inbox/whatsapp/profile` | query `canal?` (por defecto `whatsapp`) | **estado de canal.** Equivalente unificado de `/api/admin/whatsapp/profile` (legacy intacto) |
| Actualizar perfil WA | `POST` | `/api/admin/inbox/whatsapp/profile` | `{ canal?, about?, address?, description?, email?, websites?[], vertical? }` | `400` si ningún campo; `409` si `canal ≠ whatsapp` |
| Foto de perfil WA | `POST` | `/api/admin/inbox/whatsapp/profile-picture` | multipart `canal?` + `file` (jpg/png ≤ 5 MB) | `400` sin archivo. Resumable Upload de Meta |

**Regla de error unificada:** `400` payload inválido · `403` sin `chat:manage` ·
`404` conversación inexistente · `409` acción no soportada en ese canal (p. ej. confirmar
pago en Instagram) · `502` fallo del proveedor (Meta) con `{ error, proveedor, canal }`.

### 6.4 Contrato de tiempo real unificado

Un solo evento de invalidación, emitido desde `inboxService`:

```jsonc
// servidor → cliente
"inbox_actualizado": {
  "canal": "whatsapp",
  "usuarioId": "+584121234567",
  "clave": "whatsapp:+584121234567",
  "tipo": "mensaje_nuevo" | "modo" | "estado" | "pedido" | "leido"
}
```

El cliente reacciona con un `refresh` debounced de la lista + append optimista si ya tiene el
hilo abierto. Los eventos legacy (`nuevo_mensaje`, `mensaje_ig`, `ig_actualizado`, …) se
mantienen durante la transición para no romper las consolas viejas.

### 6.5 Módulo backend sugerido

```
services/inboxService.ts
  ├── type CanalAdapter = {
  │     listarConversaciones(opts): Promise<ConversacionUnificada[]>
  │     leerHilo(usuarioId, page, limite): Promise<MensajeUnificado[]>
  │     enviarTexto(usuarioId, texto, replyToMid?): Promise<MensajeUnificado>
  │     enviarAdjunto(usuarioId, file, caption?): Promise<MensajeUnificado>
  │     setModo(usuarioId, modo): Promise<void>
  │     marcarLeido(usuarioId): Promise<number>
  │     contexto(usuarioId): Promise<Record<string, any>>
  │     capacidades: Set<"pedidos"|"pago"|"repartidor"|"reset"|"adjunto_documento">
  │   }
  ├── adapters/whatsappAdapter.ts   ← getHistorial + getModos + Pedido
  ├── adapters/instagramAdapter.ts  ← getInstagramHistorial + EtiquetaIg
  ├── adapters/messengerAdapter.ts  ← reutiliza instagramAdapter con filtro `{ canal: "messenger" }`
  └── normalizar()                  ← aplica la tabla de brechas §7
```

`capacidades` es lo que permite que el frontend oculte el banner de pedido/repartidor cuando
`canal !== "whatsapp"` sin hardcodear el canal en el JSX.

---

## 7. Tabla de brechas

Leyenda de resolución: **N** = normalizado en el objeto unificado · **E** = extensión anidada
(`pedido`) · **F** = campo opcional relleno con default · **X** = no representable, se omite.

| # | Concepto | WhatsApp (hoy) | Instagram (hoy) | ¿Comparable? | Resolución en el objeto unificado |
|---|---|---|---|---|---|
| 1 | Clave de conversación | clave del map = `telefono` | clave del map = `usuarioIgId` | **No** | **N** → `clave = "<canal>:<usuarioId>"`; `usuarioId` conserva el valor crudo |
| 2 | Nombre visible | `nombre` = `Etiqueta.carrito.nombre`, fallback `Pedido.cliente.nombre`; puede ser `null` → el frontend cae al teléfono | `fullName` default `"Usuario de Instagram"`, luego `nombre` \|\| `@username` | **No** | **N** → `nombreVisible: string` (nunca vacío) + `nombre: string \| null` (sin placeholders: `"Sin nombre"` → `null`) |
| 3 | Handle/handle social | **no existe** | `username` | **No** | **F** → `username: null` para WhatsApp. Messenger tampoco lo aporta: `getUserMessengerProfile` siempre devuelve `username: null` (`services/messenger.ts:284`) — la API de FB no expone handle. Solo Instagram puebla este campo |
| 4 | Avatar | **no existe**; el cliente genera DiceBear con el teléfono (`ContactCard.js:55`) | `profilePic`, puede ser URL temporal de Meta | **No** | **N** → `avatar: string \| null`. Messenger **sí** aporta avatar vía `getUserMessengerProfile().profilePic`, aunque puede ser `null` si faltan permisos (`services/messenger.ts:258-287`). **Decisión de producto pendiente:** ¿el backend genera el DiceBear de WhatsApp o el frontend mantiene el fallback? Se propone backend para que la UI sea tonta; mientras tanto `null` y el frontend decide |
| 5 | No leídos | **volátil en el cliente** (`WhatsAppConsole.js:513-516`), se pierde al recargar. No hay campo en `Etiqueta` | **persistido**: `EtiquetaIg.unreadCount`, incrementado en `instagramFlowService.ts:441,503` | **No (bloqueante)** | **N** → `noLeidos: number`. Requiere prerrequisito backend: añadir `unreadCount` a `models/Etiqueta.ts` y resetearlo en `POST /api/admin/inbox/leido` (§9) |
| 6 | Marcar leído | **no existe endpoint** | efecto secundario implícito de `GET ig/historial?usuario=` (`adminController.ts:684-687`) | **No** | **N** → `POST /api/admin/inbox/leido`. Y **eliminar** el efecto secundario del GET de IG (es un GET que escribe) |
| 7 | Modo bot/manual | fuera de banda: `GET /api/admin/modos` devuelve solo los `"manual"`; ausencia = automático | inline en la lista: `modo` + `operationMode` (duplicados) | **Parcial** | **N** → `modo: "manual" \| "automatico"` con default explícito. Se elimina `operationMode` (duplicado exacto) |
| 8 | Paso del embudo | `paso` + `pasoLabel`; **omitidos** si no hay `Etiqueta` | `paso` default `"inicio"`, **sin** label | **Parcial** | **N** → `paso` + `pasoLabel` para ambos, aplicando `getPasoLabel()` también a Instagram (`utils/pasoEmbudo.js`) |
| 9 | Estancado | `stuck` (`Etiqueta`), omitido si no hay doc | `stuck` default `false` | **Sí** | **N** → `stuck: boolean` con default `false` en ambos |
| 10 | Origen anuncio/directo | **no se devuelve en el historial.** Se infiere de `Etiqueta.ctwaClid` / `Pedido.ctwaClid` (CTWA); señalado como `esAd` solo en analítica (`adminController.ts:2314`) | campo explícito `origen: "anuncio" \| "directo"` (`EtiquetaIg`), seteado en `instagramFlowService.ts:448-452` | **No** | **N** + **E** → `origen` (`"anuncio"` si `ctwaClid` no vacío en WA) + `detalleOrigen: "ctwa" \| "ig_ads" \| "mme" \| null`. Messenger ya detecta el referral en el webhook (`detectReferralData`, `messengerWebhookController.ts:60-75`) y lo inyecta al mismo campo `origen` |
| 11 | Requiere atención | solo en el cliente, con reglas propias de pago | `requiresAttention` en el servidor | **No** | **N** → `requiereAtencion` con la definición única de §6.2.1 |
| 12 | Bloqueado (anti-spam) | **no existe** | `bloqueado` en el modelo, **no devuelto** por el historial | **No** | **F** → `bloqueado: boolean`, `false` en WhatsApp; sí exponerlo para IG |
| 13 | Última interacción | derivable de `resumen.timestamp` | `lastInteraction` en el modelo (`EtiquetaIg.ts:54`), **NO devuelto** | **Parcial** | **N** → `lastInteraction: number \| null` = `EtiquetaIg.lastInteraction` para IG, `ultimoMensaje.timestamp` para WA. Documentar que en WA es una aproximación (no hay campo dedicado) |
| 14 | Mensajes: campos | `_id, wamid, status, text, caption, fileName, mediaUrl, mediaId, mimeType, tipo, direction, timestamp, replyToMid, replyToText` | `_id, mid, status, text, tipo, mediaUrl, mediaType, direction, timestamp` (sin `caption`/`fileName`/`mimeType`/`mediaId`/`replyTo*`) | **Parcial** | **N** → `MensajeUnificado` con unión de campos, `null` donde no aplique: `{_id, idExterno, status, texto, caption, fileName, mediaUrl, mediaType, mimeType, tipo, direccion, timestamp, replyToId, replyToText}` |
| 15 | ID externo del mensaje | `wamid` | `mid` | **No** | **N** → unificar bajo `idExterno`, conservando el nombre original dentro de `fuente` |
| 16 | Dirección | `"cliente"` \| `"bot"` (+ `"admin"` posible) | enum `["cliente","bot","admin"]` (`models/MensajeIg.ts:13`) | **Sí (semántica)** | **N** → `entrante` (cliente) / `saliente` (bot, admin) |
| 17 | Status | `"enviando" \| "sent" \| "delivered" \| "read" \| "failed"` (`models/Mensaje.ts:18`) | libre, default `"sent"`; fallback `"received"` para entrantes | **Parcial** | **N** → vocabulario cerrado; `"received"` se mapea a `null` (los entrantes no tienen status de entrega) |
| 18 | Pedidos | `tienePedido` + `pedidosCount` (ventana 30 días) | **no existe modelo de pedidos** | **No** | **E** → `pedido: {...} \| null`; `null` para IG/Messenger. La UI oculta el bloque vía `capacidades` |
| 19 | Estado de despacho | `Pedido.estado` (`pendiente_pago`, `pendiente_verificacion`, `verificado`, `en_ruta`, `confirmado`, `entregado`, `cancelado`) | **no existe** | **No** | **E** → `pedido.ultimoEstado` / `pedido.ultimoCorrelativo` |
| 20 | Cédula | `Etiqueta.carrito.cedula` \|\| `Pedido.cliente.cedula` | **no existe** | **No** | **F** → `cedula: string \| null` (`null` en IG) |
| 21 | Cerrar/eliminar conversación | `DELETE /api/admin/orders/:id` (borra pedido, borra orden, no conversación) | **no existe** | **No** | **X** — no se unifica. `deleteOrder` es dominio del Kanban, no del inbox |
| 22 | Bot global del canal | **no existe** | `Setting.instagram.botEnabled` | **No** | **X** (fuera del objeto) → se expone como estado de canal en `/api/admin/inbox/instagram/bot-toggle` |
| 23 | Comprobante de pago | `Pedido.pago.comprobanteMediaId` / `comprobanteUrl` | **no existe** | **No** | **E** dentro de `pedido` |
| 24 | TTL de datos | 90 días en `Mensaje` | 90 días en `MensajeIg` | **Sí** | **N** — iguales; `totalMensajes` ya es comparable |
| 25 | Presencia / typing | `cliente_presencia`, `cliente_typing` (socket) | **no existe** | **No** | **X** — solo WhatsApp. El inbox debe tolerar su ausencia |
| 26 | Discriminador de canal | `Etiqueta.canal` default `"whatsapp"` (nuevo, sin backfill) | `EtiquetaIg.canal` default `"instagram"`; Messenger escribe `"messenger"` explícitamente | **Sí (nuevo)** | **N** → es la base del filtro `?canal=`. **Ojo:** el default solo aplica a documentos nuevos o a los leídos vía Mongoose; los documentos ya existentes en MongoDB **no tienen el campo**, así que todo filtro debe ser tolerante: `{ $or: [{ canal: "instagram" }, { canal: { $exists: false } }] }` |
| 27 | Campo de identidad en DB | `telefono` | `usuarioIgId` (IGSID) | `usuarioIgId` (PSID) — **mismo campo, otro namespace** | **No (riesgo)** | **N** → el objeto unificado separa `canal` + `usuarioId`, pero la persistencia comparte `usuarioIgId`. Cualquier query sobre `EtiquetaIg`/`MensajeIg` **debe** llevar el discriminador de canal o Instagram y Messenger se mezclan (ver §9, bug latente) |

**Resumen de la brecha estructural:** WhatsApp aporta la dimensión **operativa**
(pedidos, pago, despacho, cédula, CTWA); Instagram aporta la dimensión **de perfil y triage**
(username, avatar real, `origen` explícito, `unreadCount` persistido, `requiresAttention`,
`bloqueado`); Messenger aporta **casi nada propio** — comparte el modelo y el flujo de Instagram,
solo cambia el cliente HTTP y el namespace del PSID. Ninguno de los tres tiene lo de los otros.
El objeto unificado resuelve esto con **campos obligatorios comunes + una extensión `pedido`
nullable + `fuente` como escape hatch**, y con un set de `capacidades` por canal para que la UI
sepa qué ocultar.

**Ventaja de secuencia:** como Messenger ya reutiliza `EtiquetaIg`/`MensajeIg` + el flujo de
Instagram, el inbox puede entregarse en dos pasos: (1) WhatsApp + Instagram con el contrato
completo, y (2) Messenger como un tercer valor de `canal` cuando aterrice el webhook — sin
tocar el shape.

---

## 8. Notas de implementación frontend

### 8.1 Punto de entrada

`public/index.html` (SPA React 18, JSX compilado en runtime con Babel standalone, imports con
cache-busting `?v=N`):

| Qué | Línea actual | Cambio |
|---|---|---|
| Import de consolas | `116-126` (`?v=5`) | Añadir `import InboxConsole from "./src/features/inbox/InboxConsole.js?v=6"` y **bump de `?v=5` → `?v=6` en todos los imports** (`:116-126`) |
| NavButton WhatsApp | `699-709` | Reemplazar por un único NavButton `tab: "inbox"`, icono `fa-inbox`, título "Inbox", con badge de no leídos |
| NavButton Instagram | `710-722` | Ídem — se retira de la barra principal |
| Render condicional | `887-890` | `activeTab === "inbox" && e(InboxConsole, { socket, userRole: user?.role })` |

**Decisión recomendada:** mantener `activeTab === "chat"` y `"instagram"` montados como
"espacios de trabajo por canal" (deep-link desde la fila del inbox), **no borrarlos**. Razón:
`WhatsAppConsole.js` (1127 líneas) contiene la UI de pedidos/pago/repartidor/CRM que no tiene
equivalente en Instagram; eliminarla obligaría a portar ~400 líneas antes de tener el inbox
usable. La migración a un inbox único debe ser incremental: **el inbox es el punto de entrada,
las consolas siguen siendo el detalle**.

### 8.2 Estructura de archivos propuesta

```
public/src/features/inbox/
├── InboxConsole.js          # orquestador: fetch unificado + socket + estado activo
├── components/
│   ├── InboxSidebar.js      # lista + buscador + chips de filtro
│   ├── InboxFilterBar.js    # canal (todos|wa|ig|msgr) + no leídos + manual + atención + con pedido
│   ├── InboxConversationRow.js  # ← evolución de ContactCard.js con badge de canal
│   └── InboxThread.js       # reutiliza el render de burbujas, props normalizadas
└── hooks/
    └── useInboxSocket.js    # suscripción a `inbox_actualizado` + debounce de refresh
```

`InboxConversationRow` puede adaptarse de `ContactCard.js` (169 líneas) añadiendo un badge de
canal; hoy `ContactCard` recibe `phone/nombre/resumen/operationMode/pasoLabel/stuck/unreadCount`
y pasa a recibir el objeto `ConversacionUnificada` completo.

### 8.3 Qué se reutiliza y qué se reescribe

| Pieza existente | Veredicto |
|---|---|
| `WhatsAppSidebar.js:39-49` `normalizeDigits` / `getPhoneVariants` | **Reutilizar** — subir a `public/src/utils/telefono.js`. Es lógica no trivial (58 / 0 inicial) y ya está resuelta |
| `WhatsAppSidebar.js:52-76` `isRequiresAttention` | **Eliminar del cliente** → reemplazar por `conv.requiereAtencion` del servidor |
| `WhatsAppSidebar.js:78-80` `hasOrder` | **Reemplazar** por `conv.pedido?.tienePedido === true` |
| `WhatsAppSidebar.js:14` `filterTab` (all/unread/manual/payment/orders) | **Generalizar** a `canal + noLeidos + modo + atencion + pedido`. Las 5 pestañas actuales son específicas de WhatsApp y se solapan con el filtro de canal |
| `InstagramSidebar.js:36-47` (`all`/`unread`) | **Absorber** en la barra de filtros general |
| `InstagramConsole.js:98-106` merge que preserva `messages`/`unreadCount` locales | **Reescribir** el `useState` como store plano `{[clave]: ConversacionUnificada}` en vez de array + `.find()` |
| `WhatsAppConsole.js:154-188` `fetchChatList` con ramas defensivas (`Array.isArray` → reagrupar) | **Eliminar** — con el contrato unificado `data` es siempre un array. Toda esa rama `167-184` existe solo por la ambigüedad del endpoint actual |
| `WhatsAppConsole.js:190-197` `fetchModes` | **Eliminar** — `modo` viene inline en el objeto unificado |
| `InstagramConsole.js:104` preservación de `unreadCount` local | **Simplificar** — con `POST /inbox/leido` el servidor es la fuente de verdad |
| `InstagramConsole.js:218` incremento optimista de `unreadCount` | **Mantener** pero como append desde `inbox_actualizado` |
| `WhatsAppConsole.js:827-893` `handleSend` vía socket | **Reescribir** contra `POST /api/admin/inbox/mensaje` (deja al servidor elegir socket vs REST) |
| `WhatsAppConsole.js:842-847` / `887-892` dedupe `recentlySentRef` | **Mantener el patrón**, generalizado por canal |

### 8.4 Estado y ordenamiento

- Estado: `{[clave]: ConversacionUnificada}` indexado por `clave`, no arrays.
- Orden: siempre por `ultimoMensaje.timestamp` DESC — **lo garantiza el servidor**
  (hoy WhatsApp lo ordena en cliente, `WhatsAppSidebar.js:156-160`).
- `conversacionActiva` como `clave` (string), no como id desnudo — necesario para convivir
  con tres canales que podrían colisionar en valores numéricos.
- Paginación del hilo por canal: WA pagina con `page`/`limit=20`; IG con `page`/`limit=20`.
  El contrato unificado conserva `page`/`limit`/`hasMore` — **no hace falta cursor** salvo que
  se quiera merges exactos en tiempo real.

### 8.5 Filtros de la UI

| Filtro | Valores | Backend |
|---|---|---|
| Canal | `todos` · `whatsapp` · `instagram` · `messenger` | `?canal=` |
| No leídos | toggle | `?noLeidos=true` |
| Modo manual | toggle | `?modo=manual` |
| Requiere atención | toggle | `?atencion=true` |
| Con pedido | toggle | requiere param nuevo `?conPedido=true` (solo WA devuelve resultados) |
| Búsqueda | texto libre | `?buscar=` |

Badges en cada chip: usar `totales` / `totalesNoLeidos` del payload (hoy se cuentan en cliente:
`WhatsAppSidebar.js:82-93`, `InstagramSidebar.js:39-43`).

Chip `messenger`: renderizar siempre, deshabilitado con contador `0` mientras el canal no
exista, para que la UI no cambie cuando se despliegue.

### 8.6 Consideraciones de UX/persistencia

- `localStorage.pachi_muted` (`WhatsAppSidebar.js:19`) es específico de WhatsApp —
  generalizar a `pachi_muted_<canal>` o a un mute global del inbox.
- El sonido de notificación se dispara solo en modo manual o pestaña oculta
  (`WhatsAppConsole.js:518-522`). Con 3 canales, replicar ese comportamiento por canal.
- Mobile: las consolas existentes ocultan `#global-sidebar` cuando hay chat activo
  (`WhatsAppConsole.js:398-416`, `InstagramConsole.js:151-169`). Replicar idéntico en InboxConsole.
- El composer de IG **no soporta adjuntos no-imagen** (solo `enviarImagenIg`); el de WhatsApp
  sí (imagen/doc/audio). El botón de adjuntar debe leer `capacidades` para filtrar
  `accept=""` dinámicamente.

---

## 9. Prerrequisitos y riesgos

### Bloqueantes

1. **`unreadCount` no existe para WhatsApp.** Añadir `unreadCount: { type: Number, default: 0 }`
   a `models/Etiqueta.ts`, incrementarlo en el webhook de WhatsApp (equivalente a
   `instagramFlowService.ts:441`), y resetearlo en `POST /api/admin/inbox/leido`.
   **Sin esto el filtro "No leídos" del inbox muestra 0 para WhatsApp en cada recarga.**
2. **`GET /api/admin/ig/historial?usuario=` escribe estado.** Debe dejar de resetear
   `unreadCount` (`adminController.ts:684-687`) antes de que el inbox lo use para previsualizar,
   o el contador morirá en cada refresco.
3. **Fuga de canal en el historial de Instagram — bloqueante ACTIVO, no latente.**
   El webhook de Messenger (`POST /webhook/messenger`) ya está montado, así que en cuanto llegue
   el primer mensaje de una página de Facebook se escribirán documentos con `canal: "messenger"`
   en `EtiquetaIg`/`MensajeIg`. `getInstagramHistorial` no filtra por `canal`
   (`adminController.ts:719-742`, `790-792`), y tampoco lo hacen `postInstagramModo`
   (`:1056-1060`), `postInstagramEnviar` (`:840-848`) ni `postInstagramEnviarImagen`
   (`:905-915`). Consecuencias:
   (a) las conversaciones de Messenger aparecerán en la consola de Instagram;
   (b) responder desde la consola de Instagram a un PSID usará `IG_ACCOUNT_ID` y el token de
   Instagram → el envío fallará o irá al usuario equivocado;
   (c) el adapter de Instagram del inbox reportará conversaciones de Messenger como Instagram.
   **Solución:** aplicar el mismo patrón tolerante ya introducido en
   `instagramFlowService.ts:72-76` (`getFiltroUsuario`) a todas las queries de `adminController`
   sobre `EtiquetaIg`/`MensajeIg`:
   Instagram → `{ $or: [{ canal: "instagram" }, { canal: { $exists: false } }] }`;
   Messenger → `{ canal: "messenger" }`.
4. **Sin backfill, `canal` no existe en los documentos históricos.** Los defaults
   `"whatsapp"`/`"instagram"` solo se materializan al escribir o al leer con Mongoose. Todo
   filtro de agregación (`$match`) debe ser `$exists`-tolerante o ejecutar un backfill
   `updateMany({ canal: { $exists: false } }, { $set: { canal: ... } })` por colección antes
   de exponer `?canal=`.
5. **Messenger no tiene capa admin ni UI.** El backend conversacional está completo (webhook,
   flujo, persistencia, Graph API, eventos) pero no hay ni un endpoint `/api/admin/*messenger*`
   ni un componente que escuche `mensaje_messenger`. **Hasta que el inbox exista, esas
   conversaciones llegan, se contestan con el bot y no hay forma de intervenirlas desde el
   panel.** El inbox es, para Messenger, un requisito funcional, no una mejora.

### Riesgos de rendimiento

6. **`getHistorial` (modo lista) hace `$sort` global antes del `$group`** sobre toda la
   colección `Mensaje` (`adminController.ts:557-558`). Con el inbox consultando los 3 canales
   en paralelo, esto se convierte en el cuello de botella. Mitigar con índice
   `{ telefono: 1, timestamp: -1 }` (ya existe, `models/Mensaje.ts:23`) y evaluar
   `$sort` + `$group` con `allowDiskUse`, o una colección de "último mensaje" desnormalizada.
7. **Sin paginación real en el modo lista.** Ambos endpoints usan `limit` como "número de
   conversaciones" y devuelven **todo** el historial agregado en memoria. A 300 conversaciones
   x N mensajes la agregación crece linealmente. El inbox debería introducir cursor
   (`?antes=<epoch>`).
8. **`totalMensajes` ignora la ventana de 30 días** que sí aplican `tienePedido`/`pedidosCount`
   (`adminController.ts:618`). Documentar la inconsistencia o alinearla.

### Riesgos de contrato

9. **`getHistorial` tiene dos formas de respuesta** según la query. El contrato unificado debe
   **no repetir** ese patrón: rutas separadas para lista (`/inbox`) e hilo (`/inbox/hilo`).
10. **`operationMode` es duplicado exacto de `modo`** en Instagram (`adminController.ts:797-798`)
   y el frontend escribe en ambos (`InstagramConsole.js:316`). El contrato unificado expone
   solo `modo`.
11. **Server-side rendering de labels:** mover `getPasoLabel()` al servidor para Instagram
   elimina la asimetría de `pasoLabel`, pero endurece el contrato — si se añade un paso nuevo
   a `PASO_LABELS` hay que redesplegar el backend (lo cual ya es cierto para WhatsApp).

### Fuera de alcance (explícito)

- No se propone migrar datos históricos: los adapters leen las colecciones actuales
  (salvo el backfill de `canal` descrito en §9.4, que sí es necesario).
- No se propone eliminar `WhatsAppConsole`/`InstagramConsole` (ver §8.1).
- No se define el webhook de entrada de Messenger ni su suscripción de página: el adapter
  consume lo que el flujo de Instagram ya persiste bajo `canal: "messenger"`.
- No se cubren las particularidades de la ventana de 24 h de Messenger (error `10/2018278`,
  `services/messenger.ts:60-64`) más allá de propagar el error del proveedor.

---

## Anexo A — Referencias de línea consolidadas

```
controllers/adminController.ts
  getHistorial ....................... 509   (lista 555-659 · hilo 516-554)
  getInstagramHistorial .............. 668   (hilo 675-716 · lista 717-818 · reset unread 684-687)
  postInstagramEnviar ................ 827
  postInstagramEnviarImagen .......... 867
  getInstagramBotToggle .............. 999
  postInstagramBotToggle ............. 1010
  postInstagramModo .................. 1038
  getChatContext ..................... 1088
  getPedidosHistorial ................ 1248
  getEtiquetas ....................... 1267
  postEtiqueta ....................... 1287
  confirmarPago ...................... 1439
  getModos ........................... 1658
  reactivarBot ....................... 1672
  setModoChat ........................ 1700
  resetBot ........................... 1731
  updateOrderStatus .................. 1775  (estados válidos 1779-1785)
  assignRepartidor ................... 2014
  deleteOrder ........................ 2046
  uploadAndSendFile .................. 2588
  postManualSale ..................... 2665
  extractOrderFromChat ............... 3475

index.ts (Socket.IO) ............... 218-314
  montaje webhook messenger ........  (app.use "/webhook/messenger" con webhookLimiter)
routes/adminRoutes.ts .............. 152-213 (chats) · 359-382 (modos/reset)
routes/messengerWebhookRoutes.ts ... 1-18   (GET verify · POST con validateMetaHmac)
controllers/messengerWebhookController.ts .. 1-237
  verifyWebhook .................... 34-55
  detectReferralData ............... 60-75
  procesarEventoMessaging .......... 80-162
  handleWebhook .................... 168-232

models/Mensaje.ts .................. 4-20   (TTL 25 · campo canal nuevo)
models/Etiqueta.ts ................. 4-20   (campo canal nuevo)
models/MensajeIg.ts ................ 4-57   (enum direccion 13 · TTL 60 · campo canal nuevo)
models/EtiquetaIg.ts ............... 4-66   (origen 35-40 · unreadCount 50 · lastInteraction 54 · campo canal nuevo)
models/Pedido.ts ................... 4-48   (enum estado 42)
types/models.d.ts .................. CanalMensajeria 24-30 · IEtiqueta 119 · IEtiquetaIg 145 · IMensaje 233 · IMensajeIg 263
utils/pasoEmbudo.js ................ 7-40

services/messenger.ts .............. 1-296  (cliente Graph FB · sin trackear en git)
  getPageToken/getTargetNode ....... 24-34
  enviarTextoMessenger ............. 95-130
  enviarImagenMessenger ............ 138-181
  enviarQuickRepliesMessenger ...... 190-236
  getUserMessengerProfile .......... 244-288
services/instagramFlowService.ts ... ruteo por canal 26-109
  SALIDA_POR_CANAL ................. 40-56   (midPrefix igmid/fbmid · eventos por canal)
  getCanalConfig ................... 61-63
  getFiltroUsuario ................. 72-76   ← patrón tolerante a canal ausente
  camposCanal ...................... 82-84
  emitirMensajeCanal ............... 91-96
  emitirActualizadoCanal ........... 102-109
  handleEcho (canal-aware) ......... 342-395
  procesarMensajeEntrante .......... 408-660

public/index.html .................. 110-126 imports · 694-722 NavButtons · 887-890 render
public/src/services/apiClient.js .... 7-38
public/src/features/whatsapp/WhatsAppConsole.js .. 152-375 fetch/acciones · 711-723 sockets · 827-893 envío
public/src/features/whatsapp/components/WhatsAppSidebar.js .. 14 filtros · 52-93 contadores · 96-160 filtrado
public/src/features/whatsapp/components/ContactCard.js ...... 12-24 props · 55 avatar DiceBear
public/src/features/whatsapp/components/WhatsAppInput.js .... 85-107 adjunto multipart
public/src/features/instagram/InstagramConsole.js ........... 49-137 fetch · 253-263 sockets · 300/377/463 acciones
```

## Anexo B — Ejemplo de respuesta del contrato unificado

```jsonc
{
  "success": true,
  "generadoEn": 1757800000000,
  "canal": "todos",
  "totales":         { "todos": 3, "whatsapp": 1, "instagram": 1, "messenger": 1 },
  "totalesNoLeidos": { "todos": 2, "whatsapp": 1, "instagram": 1, "messenger": 0 },
  "data": [
    {
      "clave": "whatsapp:+584121234567",
      "canal": "whatsapp",
      "usuarioId": "+584121234567",
      "nombreVisible": "María García",
      "nombre": "María García",
      "username": null,
      "avatar": null,
      "ultimoMensaje": {
        "texto": "Ya envié el comprobante",
        "tipo": "imagen",
        "direccion": "entrante",
        "timestamp": 1757799000000,
        "status": null,
        "mediaUrl": "https://res.cloudinary.com/.../comprobante.jpg"
      },
      "noLeidos": 1,
      "requiereAtencion": true,
      "paso": "pendiente_verificacion",
      "pasoLabel": "⏳ Verificación",
      "modo": "manual",
      "stuck": false,
      "bloqueado": false,
      "origen": "anuncio",
      "detalleOrigen": "ctwa",
      "lastInteraction": 1757799000000,
      "totalMensajes": 84,
      "pedido": {
        "tienePedido": true,
        "pedidosCount": 2,
        "ultimoEstado": "pendiente_verificacion",
        "ultimoCorrelativo": "#13"
      },
      "cedula": "V-12345678",
      "fuente": null
    },
    {
      "clave": "instagram:17841400000000000",
      "canal": "instagram",
      "usuarioId": "17841400000000000",
      "nombreVisible": "@maria.g",
      "nombre": "María G.",
      "username": "maria.g",
      "avatar": "https://scontent-mia3-2.cdninstagram.com/...",
      "ultimoMensaje": {
        "texto": "Hola, vi el anuncio 👋",
        "tipo": "texto",
        "direccion": "entrante",
        "timestamp": 1757798000000,
        "status": null,
        "mediaUrl": null
      },
      "noLeidos": 1,
      "requiereAtencion": true,
      "paso": "inicio",
      "pasoLabel": "👋 Inicio",
      "modo": "manual",
      "stuck": false,
      "bloqueado": false,
      "origen": "anuncio",
      "detalleOrigen": "ig_ads",
      "lastInteraction": 1757798000000,
      "totalMensajes": 3,
      "pedido": null,
      "cedula": null,
      "fuente": null
    },
    {
      "clave": "messenger:6700000000000000",
      "canal": "messenger",
      "usuarioId": "6700000000000000",
      "nombreVisible": "Cliente FB",
      "nombre": null,
      "username": null,
      "avatar": null,
      "ultimoMensaje": null,
      "noLeidos": 0,
      "requiereAtencion": false,
      "paso": null,
      "pasoLabel": null,
      "modo": "automatico",
      "stuck": false,
      "bloqueado": false,
      "origen": "directo",
      "detalleOrigen": null,
      "lastInteraction": null,
      "totalMensajes": 0,
      "pedido": null,
      "cedula": null,
      "fuente": null
    }
  ]
}
```
