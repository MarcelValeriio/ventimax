/**
 * controllers/inboxController.ts
 * Endpoints del INBOX UNIFICADO (Fase 2A) — §6.1 y §6.3 del contrato.
 *
 * Todas las rutas se montan en routes/adminRoutes.ts bajo /api/admin/inbox y
 * pasan por `isAuthenticated` + `authorize([...])`. Los endpoints legacy
 * (/api/admin/historial, /api/admin/ig/*, /api/admin/chats/modo, …) NO se
 * modifican: el inbox convive con ellos.
 *
 * Regla de error unificada (§6.3):
 *   400 payload inválido · 403 sin permiso (middleware) · 404 conversación
 *   inexistente · 409 acción no soportada en ese canal · 501 acción no
 *   implementada para ese canal · 502 fallo del proveedor (Meta).
 */

const inboxService = require("../services/inboxService");
const { registrarAuditoria } = require("../services/auditService");

/** Interpreta un flag booleano de query string (`true`/`1`). */
function parseFlag(valor: any): boolean | undefined {
  if (valor === undefined || valor === null || valor === "") return undefined;
  const texto = String(valor).toLowerCase();
  if (["true", "1", "si", "sí", "yes"].includes(texto)) return true;
  if (["false", "0", "no"].includes(texto)) return false;
  return undefined;
}

/** Respuesta de error normalizada con el código HTTP del servicio. */
function responderError(res: any, err: any): any {
  let status = Number(err?.statusCode);
  if (!Number.isFinite(status) || status < 400 || status > 599) {
    // Errores de axios/Meta → 502 fallo del proveedor
    status = err?.isAxiosError || err?.response ? 502 : 500;
  }
  const payload: Record<string, any> = {
    success: false,
    error: status >= 500 && status !== 502 ? "Error interno del servidor" : (err?.message || "Error en el inbox unificado"),
  };
  if (err?.canal) payload.canal = err.canal;
  if (status === 502) {
    payload.proveedor = err?.proveedor || "meta";
    if (!payload.canal && err?.canal) payload.canal = err.canal;
  }
  if (err?.codigoProveedor) payload.codigoProveedor = err.codigoProveedor;

  if (status >= 500) {
    console.error("❌ [Inbox] Error:", err?.message || err);
  }
  return res.status(status).json(payload);
}

/**
 * GET /api/admin/inbox
 * Lista unificada con filtros de servidor (§6.1) y totales por canal.
 */
const getInbox = async (req: any, res: any) => {
  try {
    const { canal, limite, buscar, noLeidos, modo, atencion, conPedido } = req.query;

    let modoFiltro;
    if (modo !== undefined && modo !== null && modo !== "") {
      if (!["manual", "automatico"].includes(String(modo))) {
        return res.status(400).json({
          success: false,
          error: "Modo inválido. Debe ser 'manual' o 'automatico'",
        });
      }
      modoFiltro = String(modo);
    }

    const respuesta = await inboxService.listarConversaciones({
      canal,
      limite,
      buscar: buscar ? String(buscar) : undefined,
      noLeidos: parseFlag(noLeidos),
      modo: modoFiltro,
      atencion: parseFlag(atencion),
      conPedido: parseFlag(conPedido),
    });
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * GET /api/admin/inbox/hilo?canal=&usuarioId=&page=&limite=
 * Hilo de mensajes. GET SIN efectos secundarios (no marca leído).
 */
const getHilo = async (req: any, res: any) => {
  try {
    const { canal, usuarioId, page, limite } = req.query;
    const respuesta = await inboxService.leerHilo({ canal, usuarioId, page, limite });
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * POST /api/admin/inbox/mensaje
 * Body: { canal, usuarioId, texto, replyToMid?, replyToText?,
 *         retryMsgId?, retryWamid? }
 *
 * LOTE B3:
 *   · replyToMid/replyToText → mensaje CON CITA (WA-34).
 *   · retryMsgId/retryWamid → REINTENTO con reconciliación in-place (WA-33);
 *     solo WhatsApp (409 en otros canales). Sin estos campos el comportamiento
 *     es el de siempre (crear un mensaje nuevo).
 */
const postMensaje = async (req: any, res: any, io: any = null) => {
  try {
    const { canal, usuarioId, texto, replyToMid, replyToText, retryMsgId, retryWamid } =
      req.body || {};
    const respuesta = await inboxService.enviarMensaje({
      canal,
      usuarioId,
      texto,
      replyToMid,
      replyToText,
      retryMsgId,
      retryWamid,
      io,
    });
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * POST /api/admin/inbox/adjunto (multipart)
 * Campos: canal, usuarioId, file, caption?
 */
const postAdjunto = async (req: any, res: any, io: any = null) => {
  try {
    const { canal, usuarioId, caption, replyToMid, replyToText } = req.body || {};
    const respuesta = await inboxService.enviarAdjunto({
      canal,
      usuarioId,
      file: req.file,
      caption,
      replyToMid,
      replyToText,
      io,
    });
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * POST /api/admin/inbox/modo
 * Body: { canal, usuarioId, modo }
 */
const postModo = async (req: any, res: any, io: any = null) => {
  try {
    const { canal, usuarioId, modo } = req.body || {};
    const respuesta = await inboxService.cambiarModo({ canal, usuarioId, modo, io });

    try {
      await registrarAuditoria(req, {
        recursoId: String(usuarioId),
        tipoRecurso: "usuario",
        accion: modo === "manual" ? "activar_modo_manual" : "activar_modo_automatico",
        detalles: `Operador cambió modo a "${modo}" para ${canal}:${usuarioId} (inbox unificado)`,
      });
    } catch (auditErr: any) {
      // No bloqueante
    }

    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * POST /api/admin/inbox/leido
 * Body: { canal, usuarioId } — NUEVO (§6.3) e IDEMPOTENTE.
 */
const postLeido = async (req: any, res: any, io: any = null) => {
  try {
    const { canal, usuarioId } = req.body || {};
    const respuesta = await inboxService.marcarLeido({ canal, usuarioId, io });
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * GET /api/admin/inbox/contexto?canal=&usuarioId=
 * WhatsApp: ficha CRM + LTV + tokens · Instagram/Messenger: perfil + origen.
 */
const getContexto = async (req: any, res: any) => {
  try {
    const { canal, usuarioId } = req.query;
    const respuesta = await inboxService.obtenerContexto({ canal, usuarioId });
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * POST /api/admin/inbox/reset
 * Body: { canal, usuarioId } — exclusivo de WhatsApp (501 en otros canales).
 */
const postReset = async (req: any, res: any, io: any = null) => {
  try {
    const { canal, usuarioId } = req.body || {};
    const respuesta = await inboxService.resetearBot({ canal, usuarioId, io });

    try {
      await registrarAuditoria(req, {
        recursoId: String(usuarioId),
        tipoRecurso: "usuario",
        accion: "reset_bot",
        detalles: `Bot reseteado a cero para ${canal}:${usuarioId} (inbox unificado)`,
      });
    } catch (auditErr: any) {
      // No bloqueante
    }

    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * POST /api/admin/inbox/whatsapp/pago/confirmar
 * Body: { usuarioId } — canal fijo en el path (exclusivo de WhatsApp).
 * Delega en el handler legacy `confirmarPago` para no duplicar la lógica.
 *
 * LOTE B4: además de la delegación se emite `inbox_actualizado` (§6.4,
 * `tipo: "pedido"`). Es ADITIVO y no toca el legacy: el handler legacy sigue
 * emitiendo sus eventos (`pago_confirmado`, `pedido_actualizado`) y las consolas
 * viejas no se enteran de este nuevo evento.
 */
const postWhatsappConfirmarPago = async (req: any, res: any, io: any = null) => {
  try {
    inboxService.exigirCanalWhatsApp((req.body || {}).canal || "whatsapp");
    const { usuarioId, pedidoId } = req.body || {};
    if (!usuarioId) {
      return res
        .status(400)
        .json({ success: false, error: "Falta el parámetro requerido: usuarioId" });
    }
    // El handler legacy opera por `telefono`
    req.body.telefono = String(usuarioId);
    if (pedidoId) req.body.pedidoId = pedidoId;
    const adminController = require("./adminController");
    const respuesta = await adminController.confirmarPago(req, res, io);
    inboxService.emitirInboxActualizado(io, "whatsapp", String(usuarioId), "pedido");
    return respuesta;
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * PATCH /api/admin/inbox/whatsapp/pedido/:id/estado
 * Body: { estado, usuarioId } — exclusivo de WhatsApp.
 *
 * LOTE B4: emite `inbox_actualizado` (`tipo: "pedido"`) para que el inbox
 * refresque el chip de pedido y el banner de acciones (WA-15/36/37).
 */
const patchWhatsappPedidoEstado = async (req: any, res: any, io: any = null) => {
  try {
    inboxService.exigirCanalWhatsApp((req.body || {}).canal || "whatsapp");
    const { usuarioId } = req.body || {};
    if (!usuarioId) {
      return res
        .status(400)
        .json({ success: false, error: "Falta el parámetro requerido: usuarioId" });
    }
    req.body.telefono = String(usuarioId);
    const adminController = require("./adminController");
    const respuesta = await adminController.updateOrderStatus(req, res, io);
    inboxService.emitirInboxActualizado(io, "whatsapp", String(usuarioId), "pedido");
    return respuesta;
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * PATCH /api/admin/inbox/whatsapp/pedido/:id/repartidor
 * Body: { repartidor } — exclusivo de WhatsApp.
 *
 * LOTE B4: acepta OPCIONALMENTE `usuarioId` (retrocompatible: el handler legacy
 * lo ignora) solo para propagar la invalidación unificada `inbox_actualizado`
 * (`tipo: "pedido"`), que alimenta la ficha y el chip de repartidor.
 */
const patchWhatsappPedidoRepartidor = async (req: any, res: any, io: any = null) => {
  try {
    inboxService.exigirCanalWhatsApp((req.body || {}).canal || "whatsapp");
    const { usuarioId } = req.body || {};
    const adminController = require("./adminController");
    const respuesta = await adminController.assignRepartidor(req, res, io);
    if (usuarioId) {
      inboxService.emitirInboxActualizado(io, "whatsapp", String(usuarioId), "pedido");
    }
    return respuesta;
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * GET /api/admin/inbox/instagram/bot-toggle
 * Estado global del bot de Instagram (estado de canal, no de chat).
 */
const getInstagramBotToggle = async (req: any, res: any) => {
  try {
    const canal = (req.query || {}).canal || "instagram";
    const respuesta = await inboxService.obtenerBotToggle(canal);
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * POST /api/admin/inbox/instagram/bot-toggle
 * Body: { enabled }
 */
const postInstagramBotToggle = async (req: any, res: any, io: any = null) => {
  try {
    const { enabled } = req.body || {};
    const canal = (req.body || {}).canal || "instagram";
    const respuesta = await inboxService.cambiarBotToggle({ canal, enabled, io });
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * LOTE B6 · PERFIL DE WHATSAPP BUSINESS (WA-45 / WA-39) — estado de canal.
 *
 * GET  /api/admin/inbox/whatsapp/profile          ?canal=whatsapp (opcional)
 * POST /api/admin/inbox/whatsapp/profile          { canal?, about, address, description, email, websites, vertical }
 * POST /api/admin/inbox/whatsapp/profile-picture  multipart { canal?, file }
 *
 * Rutas unificadas equivalentes a las legacy `/api/admin/whatsapp/profile*`
 * (que siguen intactas para la consola de WhatsApp).
 */
const getWhatsappProfile = async (req: any, res: any) => {
  try {
    const canal = (req.query || {}).canal;
    const respuesta = await inboxService.obtenerPerfilWhatsApp(canal);
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

const postWhatsappProfile = async (req: any, res: any) => {
  try {
    const canal = (req.body || {}).canal;
    const respuesta = await inboxService.actualizarPerfilWhatsApp({
      canal,
      datos: req.body || {},
    });
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

const postWhatsappProfilePicture = async (req: any, res: any) => {
  try {
    const canal = (req.body || {}).canal;
    const respuesta = await inboxService.actualizarFotoPerfilWhatsApp({
      canal,
      file: req.file,
    });
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * LOTE B7a · COPILOTO DE VENTA MANUAL (WA-131..139) — endpoints unificados.
 *
 * GET  /api/admin/inbox/products                        catálogo (WA-135)
 * GET  /api/admin/inbox/payments                        métodos de pago (WA-135)
 * POST /api/admin/inbox/whatsapp/copiloto/extraer       { usuarioId } → IA (WA-132)
 * POST /api/admin/inbox/whatsapp/venta-manual           multipart data+comprobante (WA-139)
 *
 * Los dos últimos son EXCLUSIVOS de WhatsApp (409 en Instagram/Messenger): el
 * copiloto crea pedidos y el modelo de pedidos no existe fuera de WhatsApp.
 * Delegan en los handlers legacy, que quedan intactos.
 */
const getProductsInbox = async (req: any, res: any) => {
  try {
    const respuesta = await inboxService.listarCatalogoInbox();
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

const getPaymentsInbox = async (req: any, res: any) => {
  try {
    const respuesta = await inboxService.listarMetodosPagoInbox();
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

const getShippingInbox = async (req: any, res: any) => {
  try {
    const respuesta = await inboxService.listarMetodosEnvioInbox();
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

const postCopilotoExtraer = async (req: any, res: any) => {
  try {
    const { usuarioId, telefono, canal } = req.body || {};
    const respuesta = await inboxService.extraerOrdenDesdeChat({
      canal: canal || "whatsapp",
      usuarioId: usuarioId || telefono,
    });
    return res.json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * WA-139 — guardar la venta manual. El comprobante (opcional) viaja en el campo
 * multipart `comprobante` y el payload de la venta en `data` (JSON string), igual
 * que el endpoint legacy. Tras crearla se emite `inbox_actualizado`
 * (`tipo: "pedido"`) para que la lista y el hilo reflejen el pedido nuevo.
 */
const postVentaManual = async (req: any, res: any, io: any = null) => {
  try {
    const { usuarioId, canal } = req.body || {};
    inboxService.exigirCanalWhatsApp(canal || "whatsapp");
    const respuesta = await inboxService.crearVentaManual({
      usuarioId,
      datos: (req.body || {}).data,
      file: req.file,
      io,
    });
    if (usuarioId) {
      inboxService.emitirInboxActualizado(io, "whatsapp", String(usuarioId), "pedido");
    }
    return res.status(201).json(respuesta);
  } catch (err: any) {
    return responderError(res, err);
  }
};

/**
 * POST /api/admin/inbox/bloquear
 * Body: { canal, usuarioId, bloqueado: boolean }
 */
const postBloquear = async (req: any, res: any, io: any = null) => {
  try {
    const { canal, usuarioId, bloqueado } = req.body || {};
    const success = await inboxService.bloquearUsuario({ canal, usuarioId, bloqueado, io });
    
    try {
      await registrarAuditoria(req, {
        recursoId: String(usuarioId),
        tipoRecurso: "usuario",
        accion: bloqueado ? "bloquear_usuario" : "desbloquear_usuario",
        detalles: `Usuario ${canal}:${usuarioId} ${bloqueado ? 'bloqueado' : 'desbloqueado'}`,
      });
    } catch (auditErr: any) {
      // No bloqueante
    }

    if (success) {
      return res.json({ success: true, bloqueado });
    } else {
      return res.status(404).json({ success: false, error: "Usuario no encontrado o canal no soportado" });
    }
  } catch (err: any) {
    return responderError(res, err);
  }
};

module.exports = {
  parseFlag,
  responderError,
  getInbox,
  getHilo,
  postMensaje,
  postAdjunto,
  postModo,
  postLeido,
  getContexto,
  postReset,
  postBloquear,
  postWhatsappConfirmarPago,
  patchWhatsappPedidoEstado,
  patchWhatsappPedidoRepartidor,
  getInstagramBotToggle,
  postInstagramBotToggle,
  getWhatsappProfile,
  postWhatsappProfile,
  postWhatsappProfilePicture,
  getProductsInbox,
  getPaymentsInbox,
  getShippingInbox,
  postCopilotoExtraer,
  postVentaManual,
};
