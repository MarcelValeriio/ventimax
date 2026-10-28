/**
 * services/inbox/adapters/whatsappAdapter.ts
 * Adaptador del canal WhatsApp para el Inbox Unificado (§6.5).
 *
 * Reutiliza el endpoint legacy `getHistorial` (adminController) para que el
 * inbox vea EXACTAMENTE la misma conversación que la consola de WhatsApp, y
 * completa lo que ese endpoint no devuelve (`modo`, `unreadCount`, `ctwaClid`,
 * estado del último pedido) con consultas directas a `Etiqueta`/`Pedido`.
 *
 * Efectos secundarios: NINGUNO en lectura (leer la lista/hilo no marca leído).
 * El marcado de leído es explícito vía `marcarLeido()`.
 */

import type { ConversacionUnificada, MensajeUnificado, CapacidadCanal } from "../../../types/inbox";

let Etiqueta = require("../../../models/Etiqueta");
let Mensaje = require("../../../models/Mensaje");
let Pedido = require("../../../models/Pedido");

// Soporte para Pruebas de Integración (mock con persistencia compartida)
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("../../dbLocal");
  Etiqueta = dbLocal.getEtiquetaModel();
  Mensaje = dbLocal.getMensajeModel();
  Pedido = dbLocal.getPedidoModel();
}

const {
  construirConversacion,
  normalizarMensaje,
  aEpochMs,
} = require("../normalizar");

const CANAL = "whatsapp";
const LIMITE_DEFAULT = 100;
const LIMITE_MAXIMO = 300;

/**
 * Capacidades del canal (lo que la UI puede mostrar/ocultar sin hardcodear el
 * canal en el JSX — §6.5).
 */
const capacidades = new Set<CapacidadCanal>([
  "pedidos",
  "pago",
  "repartidor",
  "reset",
  "adjunto_documento",
]);

function normalizarLimite(limite: any, defecto = LIMITE_DEFAULT): number {
  const num = parseInt(String(limite), 10);
  if (!Number.isFinite(num) || num <= 0) return defecto;
  return Math.min(num, LIMITE_MAXIMO);
}

/**
 * Invoca un handler legacy de adminController (que habla HTTP) recolectando la
 * respuesta JSON. Se hace así para no duplicar la lógica de consulta y evitar
 * que el inbox y la consola de WhatsApp diverjan.
 */
function invocarHandlerLegacy(handler: any, query: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = { query };
    const res = {
      json: (payload: any) => resolve(payload),
      status: (code: number) => ({
        json: (payload: any) => {
          const err: any = new Error(
            payload?.error || `Error consultando el historial de ${CANAL}`,
          );
          err.statusCode = code || 500;
          reject(err);
        },
      }),
    };
    Promise.resolve(handler(req, res)).catch(reject);
  });
}

/** `GET /api/admin/historial` en modo lista → objeto-map por teléfono. */
async function pedirHistorialLista(limite: number): Promise<Record<string, any>> {
  const adminController = require("../../../controllers/adminController"); // lazy: evita ciclos
  const respuesta = await invocarHandlerLegacy(adminController.getHistorial, {
    limit: String(limite),
  });
  if (!respuesta || respuesta.success !== true || !respuesta.data) return {};
  return respuesta.data;
}

/**
 * Enriquecimiento de campos que `getHistorial` no expone:
 * `modo`, `unreadCount`, `ctwaClid`, nombre/cédula del carrito y estado del
 * último pedido.
 */
async function enriquecerConversaciones(
  telefonos: string[],
): Promise<{
  etiquetas: Map<string, any>;
  pedidos: Map<string, any>;
}> {
  const etiquetas = new Map<string, any>();
  const pedidos = new Map<string, any>();
  if (!telefonos.length) return { etiquetas, pedidos };

  try {
    const ets = await Etiqueta.find(
      { telefono: { $in: telefonos } },
      {
        telefono: 1,
        paso: 1,
        modo: 1,
        stuck: 1,
        bloqueado: 1,
        ctwaClid: 1,
        unreadCount: 1,
        etiqueta: 1,
        "carrito.nombre": 1,
        "carrito.cedula": 1,
      },
    ).lean();
    for (const et of ets || []) {
      if (et && et.telefono) etiquetas.set(String(et.telefono), et);
    }
  } catch (err: any) {
    console.error("⚠️ [Inbox WA] Error consultando Etiqueta:", err.message);
  }

  try {
    const peds = await Pedido.find({ whatsappId: { $in: telefonos } })
      .sort({ timestamp: -1 })
      .lean();
    for (const ped of peds || []) {
      const clave = String(ped?.whatsappId || "");
      if (clave && !pedidos.has(clave)) pedidos.set(clave, ped); // el más reciente primero
    }
  } catch (err: any) {
    console.error("⚠️ [Inbox WA] Error consultando Pedido:", err.message);
  }

  return { etiquetas, pedidos };
}

/** Correlativo legible del pedido (`#008`, `#12`...). */
function correlativoDe(pedido: any): string | null {
  if (!pedido) return null;
  if (pedido.idFormateado) return String(pedido.idFormateado);
  if (pedido.correlativo) return String(pedido.correlativo);
  if (pedido._id) return `#${String(pedido._id).slice(-4)}`;
  return null;
}

async function listarConversaciones(opts: any = {}): Promise<ConversacionUnificada[]> {
  const limite = normalizarLimite(opts.limite);
  const base = await pedirHistorialLista(limite);
  const telefonos = Object.keys(base);
  if (!telefonos.length) return [];

  const { etiquetas, pedidos } = await enriquecerConversaciones(telefonos);

  const conversaciones: ConversacionUnificada[] = telefonos.map((telefono) => {
    const item = base[telefono] || {};
    const et = etiquetas.get(telefono) || null;
    const pedido = pedidos.get(telefono) || null;

    const ctwaClid = et?.ctwaClid || pedido?.ctwaClid || null;
    const esAnuncio = Boolean(ctwaClid && String(ctwaClid).trim());

    return construirConversacion({
      canal: CANAL,
      usuarioId: telefono,
      nombre: et?.carrito?.nombre || item.nombre || null,
      username: null, // WhatsApp no expone handle (§7 fila 3)
      avatar: null, // el frontend conserva su fallback DiceBear (§7 fila 4)
      ultimoMensaje: item.resumen || null,
      noLeidos: et?.unreadCount || 0,
      paso: et?.paso || item.paso || null,
      modo: et?.modo || "automatico",
      stuck: et?.stuck || item.stuck || false,
      bloqueado: et?.bloqueado || false,
      origen: esAnuncio ? "anuncio" : "directo",
      detalleOrigen: esAnuncio ? "ctwa" : null,
      lastInteraction: item.resumen?.timestamp ?? null,
      totalMensajes: item.totalMensajes || 0,
      pedido: {
        tienePedido: item.tienePedido === true,
        pedidosCount: item.pedidosCount || 0,
        ultimoEstado: pedido?.estado || null,
        ultimoCorrelativo: correlativoDe(pedido),
      },
      cedula: et?.carrito?.cedula || item.cedula || null,
      fuente: item, // escape hatch: payload legacy exacto de /api/admin/historial
    });
  });

  // Orden por último mensaje DESC (§6.1) y cupo por canal
  conversaciones.sort(
    (a, b) => (b.ultimoMensaje?.timestamp || 0) - (a.ultimoMensaje?.timestamp || 0),
  );
  return conversaciones.slice(0, limite);
}

async function leerHilo(
  usuarioId: string,
  page: any = 1,
  limite: any = 20,
): Promise<{ data: MensajeUnificado[]; pagination: any }> {
  const adminController = require("../../../controllers/adminController"); // lazy
  const pageNum = parseInt(String(page), 10) > 0 ? parseInt(String(page), 10) : 1;
  const limitNum = normalizarLimite(limite, 20);

  const respuesta = await invocarHandlerLegacy(adminController.getHistorial, {
    telefono: usuarioId,
    page: String(pageNum),
    limit: String(limitNum),
  });

  if (!respuesta || respuesta.success !== true || !Array.isArray(respuesta.data)) {
    return { data: [], pagination: { total: 0, page: pageNum, pages: 0, hasMore: false } };
  }

  return {
    data: respuesta.data.map((m: any) => normalizarMensaje(m)),
    pagination: respuesta.pagination || {
      total: respuesta.data.length,
      page: pageNum,
      pages: 1,
      hasMore: false,
    },
  };
}

/**
 * Envía un texto por WhatsApp y lo persiste.
 *
 * LOTE B3 (WA-33) — REINTENTO con reconciliación in-place:
 *   Si `opts.retryMsgId` llega y NO es un id temporal (`temp-…`), el mensaje
 *   existente se ACTUALIZA (status → `sent`/`failed`, nuevo `wamid`, `timestamp`)
 *   en lugar de crear uno nuevo, y se emite `status_actualizado` para las
 *   consolas legacy. Es exactamente el comportamiento del socket
 *   `enviar_desde_panel` (index.ts:277-298), trasladado al endpoint unificado,
 *   con la mejora de conservar el `replyToMid` original del mensaje si el
 *   cliente no lo reenvía.
 *
 *   Clave de reconciliación = `_id` del mensaje (`MensajeUnificado._id`, que el
 *   adaptador NO descarta: `leerHilo` → `normalizarMensaje` conserva `_id`).
 *   No se usa `mid`/`wamid` porque un mensaje fallido puede tener `wamid: null`.
 *
 * Sin `retryMsgId` el comportamiento es el de siempre (crear un mensaje nuevo):
 * retrocompatibilidad total.
 */
async function enviarTexto(
  usuarioId: string,
  texto: string,
  opts: any = {},
): Promise<MensajeUnificado> {
  const { enviarTexto: enviarTextoWa } = require("../../whatsapp");
  const orderService = require("../../orderService");

  // Un id temporal (`temp-…`, burbuja optimista del panel) NO es reconciliable:
  // cae al camino normal y crea un mensaje real (igual que el legacy).
  const retryMsgId =
    opts.retryMsgId && !String(opts.retryMsgId).startsWith("temp-")
      ? String(opts.retryMsgId)
      : null;

  // WA-33: al reintentar se conserva la cita original del mensaje si el cliente
  // no la reenvía (mejor que el legacy, que perdía el contexto de la cita).
  let replyToMid = opts.replyToMid || null;
  let replyToText = opts.replyToText || null;
  if (retryMsgId && !replyToMid) {
    try {
      const original = await Mensaje.findOne({ _id: retryMsgId });
      if (original) {
        replyToMid = original.replyToMid || null;
        replyToText = replyToText || original.replyToText || null;
      }
    } catch (err: any) {
      // Best-effort: si no se puede leer el original, se reintenta sin cita.
    }
  }

  const enviado = await enviarTextoWa(usuarioId, texto, null, replyToMid);
  const wamid = typeof enviado === "string" ? enviado : null;
  const status = enviado ? "sent" : "failed";

  if (retryMsgId) {
    // ── RECONCILIACIÓN IN-PLACE: NUNCA se crea un mensaje nuevo ──────────────
    await Mensaje.findByIdAndUpdate(retryMsgId, {
      status,
      wamid: wamid || undefined,
      timestamp: new Date(),
    });

    if (opts.io && typeof opts.io.emit === "function") {
      // Evento legacy de la consola de WhatsApp (mismos ticks de estado).
      opts.io.emit("status_actualizado", {
        _id: retryMsgId,
        telefono: usuarioId,
        wamid,
        status,
      });
    }

    const doc = await Mensaje.findOne({ telefono: usuarioId }).sort({ timestamp: -1 });
    return normalizarMensaje(
      doc || {
        _id: retryMsgId,
        texto,
        direccion: "bot",
        timestamp: new Date(),
        tipo: "texto",
        status,
        wamid,
        replyToMid,
        replyToText,
      },
    );
  }

  // Persiste + emite el evento legacy `nuevo_mensaje` de la consola de WhatsApp
  await orderService.emitirYGuardar(
    usuarioId,
    texto,
    "bot",
    opts.io || null,
    "texto",
    null,
    wamid,
    status,
    null,
    null,
    null,
    null,
    opts.replyToMid || null,
    opts.replyToText || null,
  );

  const doc = await Mensaje.findOne({ telefono: usuarioId }).sort({ timestamp: -1 });
  return normalizarMensaje(
    doc || {
      texto,
      direccion: "bot",
      timestamp: new Date(),
      tipo: "texto",
      status,
      wamid,
    },
  );
}

async function enviarAdjunto(
  usuarioId: string,
  file: any,
  opts: any = {},
): Promise<MensajeUnificado> {
  const { uploadFromBuffer } = require("../../cloudinaryService");
  const {
    enviarImagenPorUrl,
    enviarDocumentoPorUrl,
    enviarAudioPorUrl,
    enviarVideoPorUrl,
  } = require("../../whatsapp");
  const orderService = require("../../orderService");

  const caption = (opts.caption || "").trim();
  const url = await uploadFromBuffer(file.buffer, "panel_uploads");

  const isImage = String(file.mimetype || "").startsWith("image/");
  const isAudio = String(file.mimetype || "").startsWith("audio/");
  const isVideo = String(file.mimetype || "").startsWith("video/");
  const tipo = isImage ? "image" : isAudio ? "audio" : isVideo ? "video" : "document";

  let sendResult: any = null;
  if (isImage) {
    sendResult = await enviarImagenPorUrl(usuarioId, url, caption, null, opts.replyToMid || null);
  } else if (isAudio) {
    sendResult = await enviarAudioPorUrl(usuarioId, url, null, opts.replyToMid || null);
  } else if (isVideo) {
    sendResult = await enviarVideoPorUrl(usuarioId, url, caption, null, opts.replyToMid || null);
  } else {
    sendResult = await enviarDocumentoPorUrl(
      usuarioId,
      url,
      file.originalname,
      caption,
      null,
      opts.replyToMid || null,
    );
  }

  if (!sendResult) {
    const err: any = new Error("Error al enviar el adjunto por WhatsApp");
    err.statusCode = 502;
    err.proveedor = "meta";
    err.canal = CANAL;
    throw err;
  }

  const wamid = typeof sendResult === "string" ? sendResult : null;
  await orderService.emitirYGuardar(
    usuarioId,
    caption || (isImage ? "[Foto]" : isAudio ? "[Audio]" : isVideo ? "[Video]" : file.originalname),
    "bot",
    opts.io || null,
    tipo,
    null,
    wamid,
    "sent",
    file.mimetype,
    url,
    file.originalname,
    caption || null,
    opts.replyToMid || null,
    opts.replyToText || null,
  );

  const doc = await Mensaje.findOne({ telefono: usuarioId }).sort({ timestamp: -1 });
  return normalizarMensaje(
    doc || {
      texto: caption,
      direccion: "bot",
      timestamp: new Date(),
      tipo,
      status: "sent",
      mediaUrl: url,
      fileName: file.originalname,
      caption,
      wamid,
    },
  );
}

async function setModo(usuarioId: string, modo: string, opts: any = {}): Promise<void> {
  const orderService = require("../../orderService");
  await orderService.setModo(usuarioId, modo, opts.io || null);
}

/** Marca leído el chat. Idempotente: devuelve cuántos no leídos se limpiaron. */
async function marcarLeido(usuarioId: string): Promise<number> {
  const et = await Etiqueta.findOne({ telefono: usuarioId });
  const previos = Number(et?.unreadCount || 0);
  if (previos <= 0) return 0;

  // Se pasa el update plano (sin `$set`): es equivalente en Mongoose y lo
  // soporta también el mock de pruebas (services/dbLocal.ts).
  await Etiqueta.findOneAndUpdate({ telefono: usuarioId }, { unreadCount: 0 });
  return previos;
}

/** Ficha CRM + LTV + tokens: reutiliza el handler legacy `getChatContext`. */
async function contexto(usuarioId: string): Promise<Record<string, any>> {
  const adminController = require("../../../controllers/adminController"); // lazy
  const data = await invocarHandlerLegacy(adminController.getChatContext, {
    telefono: usuarioId,
  });
  if (!data || data.success !== true) return {};
  return data.data || {};
}

/** Reset del bot de WhatsApp (borra paso/carrito/stuck). */
async function resetear(usuarioId: string, opts: any = {}): Promise<void> {
  // Update plano + upsert: misma semántica que adminController.resetBot
  await Etiqueta.findOneAndUpdate(
    { telefono: usuarioId },
    {
      paso: "inicio",
      modo: "automatico",
      carrito: { items: [] },
      mensajesEnEsperaCount: 0,
      stuck: false,
    },
    { upsert: true },
  );

  if (opts.io) {
    opts.io.emit("modo_actualizado", { telefono: usuarioId, modo: "automatico" });
    opts.io.emit("estado_actualizado", { telefono: usuarioId, paso: "inicio" });
    opts.io.emit("bot_destrabado", usuarioId);
  }
}

/** ¿Existe la conversación en este canal? (mensajes o etiqueta) */
async function existe(usuarioId: string): Promise<boolean> {
  try {
    const et = await Etiqueta.findOne({ telefono: usuarioId });
    if (et) return true;
  } catch (err: any) {
    /* continúa con el conteo de mensajes */
  }
  try {
    const total = await Mensaje.countDocuments({ telefono: usuarioId });
    return Number(total) > 0;
  } catch (err: any) {
    return false;
  }
}

module.exports = {
  canal: CANAL,
  capacidades,
  listarConversaciones,
  leerHilo,
  enviarTexto,
  enviarAdjunto,
  setModo,
  marcarLeido,
  setLeido: marcarLeido,
  contexto,
  resetear,
  reset: resetear,
  existe,
};
