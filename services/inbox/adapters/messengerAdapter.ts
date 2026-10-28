/**
 * services/inbox/adapters/messengerAdapter.ts
 * Adaptador del canal Facebook Messenger del Inbox Unificado (§6.5).
 *
 * Reutiliza el adaptador de Instagram con el discriminador `{ canal: "messenger" }`
 * porque ambos canales comparten el modelo `EtiquetaIg`/`MensajeIg` y el mismo
 * flujo conversacional (services/instagramFlowService.ts). Lo único que cambia
 * es el namespace del id (PSID de Facebook ≠ IGSID de Instagram), el cliente
 * HTTP saliente y los eventos de socket.
 */

const { crearAdaptadorIgLike } = require("./instagramAdapter");

module.exports = crearAdaptadorIgLike("messenger");
