/**
 * services/inbox/adapters/instagramAdapter.ts
 * Adaptador del canal Instagram (y fábrica reutilizada por Messenger) del
 * Inbox Unificado (§6.5).
 *
 * Aislamiento de canal (§9.3 del contrato): Instagram y Messenger comparten
 * `EtiquetaIg`/`MensajeIg`, por lo que TODA consulta lleva el discriminador:
 *   Instagram → { $or: [{ canal: "instagram" }, { canal: { $exists: false } }] }
 *   Messenger → { canal: "messenger" }
 * Los documentos históricos (sin `canal`) se siguen sirviendo como Instagram.
 *
 * Efectos secundarios: `listarConversaciones` y `leerHilo` NO escriben nada
 * (antes, `GET /api/admin/ig/historial?usuario=` reseteaba `unreadCount`).
 */

import type { ConversacionUnificada, MensajeUnificado, CapacidadCanal } from "../../../types/inbox";

let EtiquetaIg = require("../../../models/EtiquetaIg");
let MensajeIg = require("../../../models/MensajeIg");
let Setting = require("../../../models/Setting");

if (process.env.NODE_ENV === "test") {
  const dbLocal = require("../../dbLocal");
  EtiquetaIg = dbLocal.getEtiquetaIgModel();
  MensajeIg = dbLocal.getMensajeIgModel();
  Setting = dbLocal.getSettingModel();
}

const { construirConversacion, normalizarMensaje, aEpochMs } = require("../normalizar");
const { getConfig } = require("../../configStore");

const LIMITE_DEFAULT = 100;
const LIMITE_MAXIMO = 300;

/** Eventos legacy por canal (§4 del contrato) — se mantienen durante la transición. */
const EVENTOS_POR_CANAL: Record<string, any> = {
  instagram: {
    mensaje: "mensaje_ig",
    actualizado: "ig_actualizado",
    modo: "ig_modo_actualizado",
    midPrefix: "igmid_admin",
  },
  messenger: {
    mensaje: "mensaje_messenger",
    actualizado: "messenger_actualizado",
    modo: null, // Messenger no tenía evento de modo propio en su canal
    midPrefix: "fbmid_admin",
  },
};

export function filtroCanalEtiqueta(canal: string): Record<string, any> {
  return canal === "messenger"
    ? { canal: "messenger" }
    : { $or: [{ canal: "instagram" }, { canal: { $exists: false } }] };
}

export function filtroCanalMensajes(canal: string): Record<string, any> {
  return filtroCanalEtiqueta(canal);
}

/** Canal efectivo de una conversación (tolerante a documentos sin `canal`). */
function canalEfectivoDe(etiqueta: any, resumen: any): string {
  return String(etiqueta?.canal || resumen?.canal || "instagram");
}

function normalizarLimite(limite: any, defecto = LIMITE_DEFAULT): number {
  const num = parseInt(String(limite), 10);
  if (!Number.isFinite(num) || num <= 0) return defecto;
  return Math.min(num, LIMITE_MAXIMO);
}

function detalleOrigenDe(canal: string, origen: any): string | null {
  if (origen !== "anuncio") return null;
  return canal === "messenger" ? "mme" : "ig_ads";
}

/**
 * LOTE B7b — PERFIL público del contacto IG/Messenger (§1.N: IG-50..57).
 *
 * El endpoint público de Instagram (`services/instagram.ts:150-236`) solo trae
 * `username/name/profile_pic`; el resto (bio, seguidores, verificado, estado)
 * vive —si existe— en `EtiquetaIg.metadata` (Mixed), que es el mismo cajón que
 * ya guarda `metadata.referral` (`services/instagramFlowService.ts:494,568`).
 * Se aceptan las grafías de la Graph API y las del mock del legacy.
 */
function perfilDeEtiqueta(et: any): Record<string, any> {
  const md = (et && et.metadata) || {};
  return {
    bio: md.bio ?? md.biography ?? null,
    followers: md.followers ?? md.followersCount ?? md.followers_count ?? null,
    verificado:
      md.verificado === true || md.verified === true || md.is_verified === true,
    online:
      typeof md.online === "boolean"
        ? md.online
        : typeof md.is_online === "boolean"
          ? md.is_online
          : null,
    lastSeen: md.lastSeen ?? md.last_seen ?? null,
    referral: md.referral ?? null,
  };
}

export function crearAdaptadorIgLike(canal: string) {
  const capacidades = new Set<CapacidadCanal>(); // sin pedidos/pago/repartidor/reset
  const eventos = EVENTOS_POR_CANAL[canal] || EVENTOS_POR_CANAL.instagram;

  /**
   * Lista de conversaciones. Agregado de `MensajeIg` (último mensaje + total)
   * enriquecido con `EtiquetaIg` (perfil, paso, modo, origen, no leídos).
   */
  async function listarConversaciones(opts: any = {}): Promise<ConversacionUnificada[]> {
    const limite = normalizarLimite(opts.limite);

    const agregados = await MensajeIg.aggregate([
      { $match: filtroCanalMensajes(canal) },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$usuarioIgId",
          ultimoMensaje: {
            $first: {
              _id: "$_id",
              mid: "$mid",
              status: "$status",
              texto: "$texto",
              timestamp: "$timestamp",
              direccion: "$direccion",
              tipo: "$tipo",
              mediaUrl: "$mediaUrl",
              mediaType: "$mediaType",
              canal: "$canal",
            },
          },
          totalMensajes: { $sum: 1 },
        },
      },
      { $sort: { "ultimoMensaje.timestamp": -1 } },
      { $limit: limite },
    ]);

    const filas = Array.isArray(agregados) ? agregados : [];
    const ids = filas.map((f: any) => f._id).filter(Boolean);
    const etiquetas = new Map<string, any>();

    if (ids.length) {
      try {
        const ets = await EtiquetaIg.find({
          usuarioIgId: { $in: ids },
        }).lean();
        for (const et of ets || []) {
          if (et?.usuarioIgId) etiquetas.set(String(et.usuarioIgId), et);
        }
      } catch (err: any) {
        console.error(`⚠️ [Inbox ${canal}] Error consultando EtiquetaIg:`, err.message);
      }
    }

    const conversaciones: ConversacionUnificada[] = [];
    for (const fila of filas) {
      const usuarioId = String(fila?._id || "");
      if (!usuarioId) continue;
      const resumen = fila.ultimoMensaje || null;
      const et = etiquetas.get(usuarioId) || null;

      // Aislamiento de canal: el filtro de DB se repite en JS para los mocks y
      // para documentos cuyo `canal` no pudo filtrarse en el pipeline.
      const canalDeLaConversacion = canalEfectivoDe(et, resumen);
      if (canalDeLaConversacion !== canal) continue;

      conversaciones.push(
        construirConversacion({
          canal: canal as any,
          usuarioId,
          nombre: et?.nombre || null,
          username: et?.username || null,
          avatar: et?.profilePic || et?.metadata?.profilePic || null,
          ultimoMensaje: resumen,
          noLeidos: et?.unreadCount || 0,
          paso: et?.paso || null,
          modo: et?.modo || "automatico",
          stuck: et?.stuck || false,
          bloqueado: et?.bloqueado || false,
          origen: et?.origen || "directo",
          detalleOrigen: detalleOrigenDe(canal, et?.origen),
          lastInteraction: et?.lastInteraction
            ? aEpochMs(et.lastInteraction)
            : resumen?.timestamp || null,
          totalMensajes: fila?.totalMensajes || 0,
          pedido: null, // Instagram/Messenger no tienen modelo de pedidos (§7 fila 18)
          cedula: null,
          // LOTE B7b — perfil público para la ficha IG (IG-50..57) y para la
          // insignia verificada de fila/cabecera (IG-24/IG-32).
          perfil: perfilDeEtiqueta(et),
          fuente: { resumen, etiqueta: et || null },
        }),
      );
    }

    conversaciones.sort(
      (a, b) => (b.ultimoMensaje?.timestamp || 0) - (a.ultimoMensaje?.timestamp || 0),
    );
    return conversaciones.slice(0, limite);
  }

  /** Hilo de mensajes — SIN efectos secundarios (el GET legacy sí reseteaba no leídos). */
  async function leerHilo(
    usuarioId: string,
    page: any = 1,
    limite: any = 20,
  ): Promise<{ data: MensajeUnificado[]; pagination: any }> {
    const pageNum = parseInt(String(page), 10) > 0 ? parseInt(String(page), 10) : 1;
    const limitNum = normalizarLimite(limite, 20);
    const skip = (pageNum - 1) * limitNum;

    const filtro = { usuarioIgId: usuarioId, ...filtroCanalMensajes(canal) };
    const mensajes = await MensajeIg.find(filtro)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limitNum);
    const total = await MensajeIg.countDocuments(filtro);

    const lista = (Array.isArray(mensajes) ? mensajes : []).reverse();
    return {
      data: lista.map((m: any) => normalizarMensaje(m)),
      pagination: {
        total,
        page: pageNum,
        pages: Math.ceil(total / limitNum),
        hasMore: skip + limitNum < total,
      },
    };
  }

  async function enviarTexto(
    usuarioId: string,
    texto: string,
    opts: any = {},
  ): Promise<MensajeUnificado> {
    let enviar: any;
    if (canal === "messenger") {
      const messenger = require("../../messenger");
      enviar = await messenger.enviarTextoMessenger(
        getConfig("FB_PAGE_ID"),
        usuarioId,
        texto,
      );
    } else {
      const { enviarTextoIg } = require("../../instagram");
      enviar = await enviarTextoIg(getConfig("IG_ACCOUNT_ID"), usuarioId, texto);
    }

    const doc = await MensajeIg.create({
      usuarioIgId: usuarioId,
      ...(canal === "messenger" ? { canal: "messenger" } : {}),
      direccion: "bot",
      texto,
      tipo: "texto",
      replyToMid: opts.replyToMid || null,
      replyToText: opts.replyToText || null,
      mid: `${eventos.midPrefix}_${Date.now()}`,
      status: "sent",
      timestamp: new Date(),
    });

    if (opts.io) {
      opts.io.emit(eventos.mensaje, { usuarioIgId: usuarioId, mensaje: doc });
      opts.io.emit(eventos.actualizado, { usuarioIgId: usuarioId });
    }

    return normalizarMensaje(doc);
  }

  async function enviarAdjunto(
    usuarioId: string,
    file: any,
    opts: any = {},
  ): Promise<MensajeUnificado> {
    const esImagen = String(file?.mimetype || "").startsWith("image/");
    if (!esImagen) {
      // Instagram/Messenger solo soportan adjuntos de imagen (§6.3)
      const err: any = new Error(
        `El canal ${canal} solo admite adjuntos de imagen (se recibió "${file?.mimetype || "desconocido"}")`,
      );
      err.statusCode = 409;
      err.canal = canal;
      throw err;
    }

    const cloudinaryService = require("../../cloudinaryService");
    const mediaUrl = await cloudinaryService.uploadFromBuffer(file.buffer, "ig_media");
    if (!mediaUrl) {
      const err: any = new Error("Error al subir la imagen a Cloudinary");
      err.statusCode = 500;
      throw err;
    }

    if (canal === "messenger") {
      const messenger = require("../../messenger");
      await messenger.enviarImagenMessenger(
        getConfig("FB_PAGE_ID"),
        usuarioId,
        mediaUrl,
      );
    } else {
      const { enviarImagenIg } = require("../../instagram");
      await enviarImagenIg(getConfig("IG_ACCOUNT_ID"), usuarioId, mediaUrl);
    }

    const caption = opts.caption || "";
    const doc = await MensajeIg.create({
      usuarioIgId: usuarioId,
      ...(canal === "messenger" ? { canal: "messenger" } : {}),
      direccion: "bot",
      texto: caption || "[Foto]",
      tipo: "imagen",
      mediaUrl,
      mediaType: "image",
      mid: `${eventos.midPrefix}_img_${Date.now()}`,
      status: "sent",
      timestamp: new Date(),
    });

    if (opts.io) {
      opts.io.emit(eventos.mensaje, { usuarioIgId: usuarioId, mensaje: doc });
      opts.io.emit(eventos.actualizado, { usuarioIgId: usuarioId });
    }

    return normalizarMensaje(doc);
  }

  async function setModo(usuarioId: string, modo: string, opts: any = {}): Promise<void> {
    await EtiquetaIg.findOneAndUpdate(
      { usuarioIgId: usuarioId, ...filtroCanalEtiqueta(canal) },
      { modo },
      { upsert: true, returnDocument: "after" },
    );
    if (opts.io) {
      if (eventos.modo) opts.io.emit(eventos.modo, { usuarioIgId: usuarioId, modo });
      opts.io.emit(eventos.actualizado, { usuarioIgId: usuarioId });
    }
  }

  /** Marca leído. Idempotente: devuelve cuántos no leídos se limpiaron. */
  async function marcarLeido(usuarioId: string): Promise<number> {
    const et = await EtiquetaIg.findOne({ usuarioIgId: usuarioId });
    const previos = Number(et?.unreadCount || 0);
    if (previos <= 0) return 0;

    // Update plano: equivalente en Mongoose y soportado por el mock de pruebas
    await EtiquetaIg.findOneAndUpdate({ usuarioIgId: usuarioId }, { unreadCount: 0 });
    return previos;
  }

  /** Perfil + origen del contacto (§6.3: "IG: perfil + origen"). */
  async function contexto(usuarioId: string): Promise<Record<string, any>> {
    const et = await EtiquetaIg.findOne({ usuarioIgId: usuarioId });
    let totalMensajes = 0;
    try {
      totalMensajes = await MensajeIg.countDocuments({ usuarioIgId: usuarioId });
    } catch (err: any) {
      totalMensajes = 0;
    }

    const perfil = perfilDeEtiqueta(et);

    return {
      perfil: {
        usuarioId,
        nombre: et?.nombre || null,
        username: et?.username || null,
        avatar: et?.profilePic || et?.metadata?.profilePic || null,
        // LOTE B7b — extras de la ficha IG (§1.N: IG-51/52/55). Aditivo y
        // retrocompatible: si la metadata no los tiene, quedan null y la ficha
        // los omite (mismo comportamiento condicional que el legacy).
        bio: perfil.bio,
        followers: perfil.followers,
        verificado: perfil.verificado,
        online: perfil.online,
        lastSeen: perfil.lastSeen,
      },
      origen: et?.origen || "directo",
      detalleOrigen: detalleOrigenDe(canal, et?.origen),
      paso: et?.paso || null,
      modo: et?.modo || "automatico",
      bloqueado: et?.bloqueado === true,
      stuck: et?.stuck === true,
      noLeidos: Number(et?.unreadCount || 0),
      lastInteraction: et?.lastInteraction ? aEpochMs(et.lastInteraction) : null,
      totalMensajes,
      menuTexto: await (async () => {
        try {
          const { getMenuDinamico } = require("../../faqMatcher");
          return await getMenuDinamico();
        } catch (e) {
          return "";
        }
      })(),
    };
  }

  /** Bot global del canal (`Setting.instagram.botEnabled`) — estado de canal, no de chat. */
  async function getBotToggle(): Promise<boolean> {
    const setting = await Setting.findOne({ key: "instagram.botEnabled" });
    return setting ? setting.value !== false : true;
  }

  async function setBotToggle(enabled: boolean): Promise<boolean> {
    await Setting.findOneAndUpdate(
      { key: "instagram.botEnabled" },
      { key: "instagram.botEnabled", value: enabled },
      { upsert: true },
    );
    return enabled;
  }

  async function existe(usuarioId: string): Promise<boolean> {
    try {
      const et = await EtiquetaIg.findOne({ usuarioIgId: usuarioId });
      // Un contacto de otro canal con el mismo id NO es esta conversación
      if (et) return canalEfectivoDe(et, null) === canal;
    } catch (err: any) {
      /* continúa con el conteo de mensajes */
    }
    try {
      const total = await MensajeIg.countDocuments({ usuarioIgId: usuarioId });
      return Number(total) > 0;
    } catch (err: any) {
      return false;
    }
  }

  return {
    canal,
    capacidades,
    eventos,
    listarConversaciones,
    leerHilo,
    enviarTexto,
    enviarAdjunto,
    setModo,
    marcarLeido,
    setLeido: marcarLeido,
    contexto,
    getBotToggle,
    setBotToggle,
    existe,
  };
}

module.exports = {
  crearAdaptadorIgLike,
  filtroCanalEtiqueta,
  filtroCanalMensajes,
  instagramAdapter: crearAdaptadorIgLike("instagram"),
};
