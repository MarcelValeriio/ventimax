/**
 * services/inbox/normalizar.ts
 * Normalización al objeto `ConversacionUnificada` / `MensajeUnificado`.
 *
 * Implementa la tabla de brechas §7 del contrato del Inbox Unificado
 * (docs/inbox-unificado-contrato.md):
 *   fila 1  → clave = "<canal>:<usuarioId>"
 *   fila 2  → nombreVisible (nunca vacío) + nombre (sin placeholders)
 *   fila 3  → username (null para WhatsApp)
 *   fila 9  → stuck default false
 *   fila 11 → requiereAtencion con la definición ÚNICA de §6.2.1
 *   fila 12 → bloqueado (false en WhatsApp)
 *   fila 13 → lastInteraction (epoch ms)
 *   fila 16 → direccion "cliente" → "entrante" · "bot"/"admin" → "saliente"
 *   fila 17 → status: entrantes → null · salientes → vocabulario cerrado
 *   fila 20 → cedula (null fuera de WhatsApp)
 *
 * IMPORTANTE: este módulo NO require modelos ni controladores (solo
 * utils/pasoEmbudo.js). Así `controllers/adminController.ts` puede consumir la
 * definición única de `requiereAtencion` sin crear un ciclo de requires.
 */

import type {
  ConversacionUnificada,
  MensajeUnificado,
  TipoMensajeUnificado,
  DireccionUnificada,
  CanalInbox,
  PerfilUnificado,
} from "../../types/inbox";

const { getPasoLabel } = require("../../utils/pasoEmbudo");

export const CANALES: CanalInbox[] = ["whatsapp", "instagram", "messenger"];

/**
 * Pasos del embudo que exigen intervención humana por ser parte del cobro.
 * §6.2.1: derivado de utils/pasoEmbudo.js + los estados de confirmarPago
 * (adminController.ts:1447-1452).
 */
export const PASOS_DE_PAGO = new Set([
  "esperando_pago_metodo",
  "esperando_efectivo_opcion",
  "esperando_efectivo_monto",
  "esperando_comprobante",
  "pendiente_verificacion",
]);

/** Valores de status que pertenecen al vocabulario cerrado de entrega (§7 fila 17). */
const STATUS_VALIDOS = new Set(["enviando", "sent", "delivered", "read", "failed"]);

/**
 * Nombres que NO son un nombre real: se normalizan a `null` para que
 * `nombreVisible` caiga al handle o al id (§7 fila 2).
 */
const NOMBRES_PLACEHOLDER = new Set([
  "sin nombre",
  "sin cedula",
  "sin cédula",
  "sin telefono",
  "sin teléfono",
  "usuario de instagram",
  "usuario de messenger",
  "usuario de facebook",
  "desconocido",
]);

/** Mapeo de tipos de mensaje del canal al enum del contrato (§6.2). */
const TIPOS_CONOCIDOS: Record<string, TipoMensajeUnificado> = {
  texto: "texto",
  text: "texto",
  interactive: "texto",
  button: "texto",
  botones: "texto",
  lista: "texto",
  image: "imagen",
  imagen: "imagen",
  foto: "imagen",
  audio: "audio",
  voice: "audio",
  nota_voz: "audio",
  video: "video",
  document: "documento",
  documento: "documento",
  file: "documento",
  sticker: "sticker",
  location: "otro",
  ubicacion: "otro",
  share: "otro",
  reel: "otro",
  contacto: "otro",
};

const PLACEHOLDERS_TEXTO: Record<TipoMensajeUnificado, string> = {
  texto: "",
  imagen: "[Foto]",
  audio: "[Audio]",
  video: "[Video]",
  documento: "[Documento]",
  sticker: "[Sticker]",
  otro: "[Adjunto]",
};

/** Convierte cualquier valor de fecha/epoch/string a epoch ms. */
export function aEpochMs(valor: any): number {
  if (valor === null || valor === undefined) return 0;
  if (valor instanceof Date) return valor.getTime();
  if (typeof valor === "number") return valor;
  const parsed = new Date(valor).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** `cliente` → `entrante`; `bot` | `admin` → `saliente` (§7 fila 16). */
export function normalizarDireccion(direccion: any): DireccionUnificada {
  const valor = String(direccion || "").toLowerCase();
  return valor === "cliente" ? "entrante" : "saliente";
}

/** Normaliza el tipo de mensaje al enum cerrado del contrato (§7 fila 14). */
export function normalizarTipo(tipo: any): TipoMensajeUnificado {
  const valor = String(tipo || "").toLowerCase();
  return TIPOS_CONOCIDOS[valor] || "otro";
}

/** Texto visible del último mensaje: si no hay texto, un placeholder por tipo. */
export function textoVisible(texto: any, tipo: TipoMensajeUnificado): string {
  const limpio = typeof texto === "string" ? texto.trim() : "";
  if (limpio) return limpio;
  return PLACEHOLDERS_TEXTO[tipo] || "[Adjunto]";
}

/** Status normalizado: los entrantes no tienen estado de entrega → null (§7 fila 17). */
export function normalizarStatus(status: any, direccion: DireccionUnificada): string | null {
  if (direccion !== "saliente") return null;
  const valor = status === null || status === undefined ? "" : String(status);
  if (!valor) return null;
  if (valor === "received") return null;
  return STATUS_VALIDOS.has(valor) ? valor : null;
}

/** Descarta nombres placeholder; devuelve el nombre real o `null` (§7 fila 2). */
export function normalizarNombre(nombre: any): string | null {
  if (typeof nombre !== "string") return null;
  const limpio = nombre.trim();
  if (!limpio) return null;
  if (NOMBRES_PLACEHOLDER.has(limpio.toLowerCase())) return null;
  return limpio;
}

/** @handle sin arroba (§7 fila 3). */
export function normalizarUsername(username: any): string | null {
  if (typeof username !== "string") return null;
  const limpio = username.trim().replace(/^@+/, "");
  return limpio || null;
}

/** Clave única de conversación: "<canal>:<usuarioId>" (§7 fila 1). */
export function construirClave(canal: CanalInbox, usuarioId: any): string {
  return `${canal}:${String(usuarioId)}`;
}

/** Payload del evento socket unificado `inbox_actualizado` (§6.4). */
export function construirPayloadInbox(
  canal: CanalInbox,
  usuarioId: any,
  tipo: string,
): { canal: CanalInbox; usuarioId: string; clave: string; tipo: string } {
  return {
    canal,
    usuarioId: String(usuarioId),
    clave: construirClave(canal, usuarioId),
    tipo,
  };
}

/**
 * DEFINICIÓN ÚNICA de `requiereAtencion` (§6.2.1 del contrato).
 *
 *   requiereAtencion = (modo === "manual")
 *                    || stuck
 *                    || bloqueado
 *                    || origen === "anuncio"
 *                    || (paso ∈ PASOS_DE_PAGO)
 *                    || (canal === "whatsapp" && pedido.ultimoEstado === "pendiente_verificacion")
 *
 * Esta es la única implementación en el servidor: la usan el adaptador de
 * WhatsApp, el de Instagram/Messenger, el inbox unificado y el historial
 * legacy de Instagram (`adminController.getInstagramHistorial`).
 */
export function computarRequiereAtencion(conv: {
  modo?: string | null;
  stuck?: boolean | null;
  bloqueado?: boolean | null;
  origen?: string | null;
  paso?: string | null;
  canal?: string | null;
  pedido?: { ultimoEstado?: string | null } | null;
}): boolean {
  if (!conv) return false;
  if (conv.modo === "manual") return true;
  if (conv.stuck === true) return true;
  if (conv.bloqueado === true) return true;
  if (conv.origen === "anuncio") return true;
  if (conv.paso && PASOS_DE_PAGO.has(conv.paso)) return true;
  if (
    conv.canal === "whatsapp" &&
    conv.pedido &&
    conv.pedido.ultimoEstado === "pendiente_verificacion"
  ) {
    return true;
  }
  return false;
}

/**
 * Normaliza un mensaje crudo del canal (o el resumen de un mensaje ya
 * normalizado por los endpoints legacy) al `MensajeUnificado` del contrato.
 */
export function normalizarMensaje(mensaje: any): MensajeUnificado {
  const tipo = normalizarTipo(mensaje?.tipo);
  const direccion = normalizarDireccion(mensaje?.direccion ?? mensaje?.direction);

  // idExterno: `wamid` (WhatsApp) o `mid` (Instagram/Messenger) + su nombre original
  let idExterno = mensaje?.wamid ?? mensaje?.mid ?? null;
  let claveFuente = mensaje?.wamid ? "wamid" : mensaje?.mid ? "mid" : null;
  if (!idExterno && mensaje?.fuente) {
    if (mensaje.fuente.wamid) {
      idExterno = mensaje.fuente.wamid;
      claveFuente = "wamid";
    } else if (mensaje.fuente.mid) {
      idExterno = mensaje.fuente.mid;
      claveFuente = "mid";
    }
  }

  let mediaUrl = mensaje?.mediaUrl || null;
  const mediaId = mensaje?.mediaId || null;
  if (!mediaUrl && mediaId) {
    mediaUrl = tipo === "audio" ? `/api/admin/audio/${mediaId}` : `/api/admin/media/${mediaId}`;
  }

  return {
    _id: mensaje?._id ?? null,
    idExterno: idExterno || null,
    status: normalizarStatus(mensaje?.status, direccion),
    texto: textoVisible(mensaje?.texto ?? mensaje?.text, tipo),
    caption: mensaje?.caption ?? null,
    fileName: mensaje?.fileName ?? null,
    mediaUrl,
    mediaType: mensaje?.mediaType ?? null,
    mimeType: mensaje?.mimeType ?? null,
    tipo,
    direccion,
    timestamp: aEpochMs(mensaje?.timestamp),
    replyToId: mensaje?.replyToId ?? mensaje?.replyToMid ?? null,
    replyToText: mensaje?.replyToText ?? null,
    fuente: claveFuente ? { [claveFuente]: idExterno } : null,
  };
}

/** Normaliza el "último mensaje" al `UltimoMensajeUnificado` del contrato (§6.2). */
export function normalizarUltimoMensaje(resumen: any): ConversacionUnificada["ultimoMensaje"] {
  if (!resumen) return null;
  const tipo = normalizarTipo(resumen?.tipo);
  const direccion = normalizarDireccion(resumen?.direccion ?? resumen?.direction);

  let mediaUrl = resumen?.mediaUrl || null;
  const mediaId = resumen?.mediaId || null;
  if (!mediaUrl && mediaId) {
    mediaUrl = tipo === "audio" ? `/api/admin/audio/${mediaId}` : `/api/admin/media/${mediaId}`;
  }

  return {
    texto: textoVisible(resumen?.texto ?? resumen?.text, tipo),
    tipo,
    direccion,
    timestamp: aEpochMs(resumen?.timestamp),
    status: normalizarStatus(resumen?.status, direccion),
    mediaUrl,
  };
}

/**
 * LOTE B7b — PERFIL de los canales sin CRM (Instagram/Messenger).
 *
 * Fuente de los campos: `EtiquetaIg.metadata` (Mixed). El endpoint público de
 * Instagram (`services/instagram.ts:150-236`) solo devuelve
 * `username/name/profile_pic`, así que estos extras son OPCIONALES: si no
 * están, los campos quedan `null`/`false` y la ficha IG simplemente no los
 * pinta (el legacy `InstagramCustomerDrawer.js` hace exactamente esa
 * comprobación condicional: `contact.followers && …`, `contact.bio && …`).
 *
 * Se aceptan varias grafías porque la metadata es un cajón de sastre y puede
 * llegar con los nombres de la Graph API (`followers_count`, `is_verified`) o
 * con los que usa el mock del legacy (`followers`, `verified`).
 */
export function normalizarPerfil(perfil: any): PerfilUnificado | null {
  if (!perfil || typeof perfil !== "object") {
    return {
      bio: null,
      followers: null,
      verificado: false,
      online: null,
      lastSeen: null,
      referral: null,
    };
  }
  const bio = perfil.bio ?? perfil.biography ?? null;
  const followers =
    perfil.followers ?? perfil.followersCount ?? perfil.followers_count ?? null;
  const online =
    typeof perfil.online === "boolean"
      ? perfil.online
      : typeof perfil.is_online === "boolean"
        ? perfil.is_online
        : null;
  const lastSeen = perfil.lastSeen ?? perfil.last_seen ?? null;
  return {
    bio: typeof bio === "string" && bio.trim() ? bio.trim() : null,
    followers:
      followers === null || followers === undefined || followers === ""
        ? null
        : followers,
    verificado:
      perfil.verificado === true || perfil.verified === true || perfil.is_verified === true,
    online,
    lastSeen: typeof lastSeen === "string" && lastSeen.trim() ? lastSeen.trim() : null,
    referral: perfil.referral || null,
  };
}

/**
 * Construye el objeto `ConversacionUnificada` completo a partir de los campos
 * crudos que aporta cada adaptador. Todos los campos del contrato quedan
 * garantizados (nunca `undefined`) y `requiereAtencion` se computa con la
 * definición única de §6.2.1.
 */
export function construirConversacion(input: {
  canal: CanalInbox;
  usuarioId: any;
  nombre?: any;
  username?: any;
  avatar?: any;
  ultimoMensaje?: any;
  noLeidos?: any;
  paso?: any;
  modo?: any;
  stuck?: any;
  bloqueado?: any;
  origen?: any;
  detalleOrigen?: any;
  lastInteraction?: any;
  totalMensajes?: any;
  pedido?: {
    tienePedido?: any;
    pedidosCount?: any;
    ultimoEstado?: any;
    ultimoCorrelativo?: any;
  } | null;
  cedula?: any;
  /** LOTE B7b — perfil público de IG/Messenger (§1.N: IG-50..57). */
  perfil?: any;
  fuente?: any;
}): ConversacionUnificada {
  const canal = input.canal;
  const usuarioId = String(input.usuarioId);
  const nombre = normalizarNombre(input.nombre);
  const username = normalizarUsername(input.username);
  const ultimoMensaje = normalizarUltimoMensaje(input.ultimoMensaje);
  const paso = input.paso ? String(input.paso) : null;

  // La extensión `pedido` solo existe para WhatsApp (§7 fila 18)
  const pedido =
    canal === "whatsapp"
      ? {
          tienePedido: Boolean(input.pedido?.tienePedido),
          pedidosCount: Number(input.pedido?.pedidosCount || 0),
          ultimoEstado: input.pedido?.ultimoEstado
            ? String(input.pedido.ultimoEstado)
            : null,
          ultimoCorrelativo: input.pedido?.ultimoCorrelativo
            ? String(input.pedido.ultimoCorrelativo)
            : null,
        }
      : null;

  const lastInteraction =
    input.lastInteraction !== null && input.lastInteraction !== undefined
      ? aEpochMs(input.lastInteraction)
      : ultimoMensaje
        ? ultimoMensaje.timestamp
        : null;

  const conv: ConversacionUnificada = {
    clave: construirClave(canal, usuarioId),
    canal,
    usuarioId,
    nombreVisible: nombre || (username ? `@${username}` : usuarioId),
    nombre,
    username,
    avatar: input.avatar || null,
    ultimoMensaje,
    noLeidos: Math.max(0, Number(input.noLeidos) || 0),
    requiereAtencion: false,
    paso,
    pasoLabel: paso ? getPasoLabel(paso) : null,
    modo: input.modo === "manual" ? "manual" : "automatico",
    stuck: input.stuck === true,
    bloqueado: input.bloqueado === true,
    origen: input.origen === "anuncio" ? "anuncio" : "directo",
    detalleOrigen: input.detalleOrigen || null,
    lastInteraction,
    totalMensajes: Math.max(0, Number(input.totalMensajes) || 0),
    pedido,
    cedula: canal === "whatsapp" ? input.cedula || null : null,
    // LOTE B7b — el PERFIL es la extensión espejo de `pedido`: existe solo en
    // los canales sin CRM (Instagram/Messenger) y siempre es un objeto (con
    // `null`s) para que la ficha IG pueda montarse sin comprobaciones extra.
    perfil: canal === "whatsapp" ? null : normalizarPerfil(input.perfil),
    fuente: input.fuente === undefined ? null : input.fuente,
  };

  conv.requiereAtencion = computarRequiereAtencion(conv);
  return conv;
}

module.exports = {
  CANALES,
  PASOS_DE_PAGO,
  aEpochMs,
  normalizarDireccion,
  normalizarTipo,
  textoVisible,
  normalizarStatus,
  normalizarNombre,
  normalizarUsername,
  construirClave,
  construirPayloadInbox,
  computarRequiereAtencion,
  normalizarMensaje,
  normalizarUltimoMensaje,
  normalizarPerfil,
  construirConversacion,
};
