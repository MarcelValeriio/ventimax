/**
 * types/inbox.d.ts
 * Contrato de datos del INBOX UNIFICADO (Fase 2A).
 *
 * Fuente de verdad: docs/inbox-unificado-contrato.md
 *   §6.1 lista/endpoints de lectura · §6.2 objeto ConversacionUnificada
 *   §6.2.1 definición única de `requiereAtencion` · §6.3 endpoints de acción
 *   §6.4 socket `inbox_actualizado` · §6.5 módulo y adaptadores por canal
 */

// ==========================================
// Enums del contrato unificado
// ==========================================

export type CanalInbox = "whatsapp" | "instagram" | "messenger";

/** Valor aceptado por el filtro `?canal=` (`todos` = sin filtro). */
export type CanalFiltro = "todos" | CanalInbox;

export type DireccionUnificada = "entrante" | "saliente";

export type TipoMensajeUnificado =
  | "texto"
  | "imagen"
  | "audio"
  | "video"
  | "documento"
  | "sticker"
  | "otro";

export type OrigenUnificado = "anuncio" | "directo";

/** `ctwa` (WhatsApp) · `ig_ads` (Instagram) · `mme` (Messenger) */
export type DetalleOrigenInbox = "ctwa" | "ig_ads" | "mme" | null;

export type TipoEventoInbox = "mensaje_nuevo" | "modo" | "estado" | "pedido" | "leido";

export type CapacidadCanal =
  | "pedidos"
  | "pago"
  | "repartidor"
  | "reset"
  | "adjunto_documento";

// ==========================================
// Mensaje unificado (§7 filas 14, 15, 16, 17)
// ==========================================

export interface MensajeUnificado {
  _id: string | any;
  /** `wamid` en WhatsApp · `mid` en Instagram/Messenger */
  idExterno: string | null;
  status: string | null;
  texto: string;
  caption: string | null;
  fileName: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  mimeType: string | null;
  tipo: TipoMensajeUnificado;
  direccion: DireccionUnificada;
  timestamp: number;
  replyToId: string | null;
  replyToText: string | null;
  /** Nombre original del id externo en el canal (`wamid` | `mid`) — §7 fila 15 */
  fuente: Record<string, any> | null;
}

export interface PaginacionUnificada {
  total: number;
  page: number;
  pages: number;
  hasMore: boolean;
}

// ==========================================
// Extensión específica de WhatsApp (§7 filas 18, 19, 23)
// ==========================================

export interface PedidoUnificado {
  tienePedido: boolean;
  pedidosCount: number;
  ultimoEstado: string | null;
  ultimoCorrelativo: string | null;
}

/**
 * LOTE B7b — Extensión de PERFIL para los canales SIN CRM (Instagram/Messenger).
 *
 * Espejo de `PedidoUnificado` en el otro sentido: `pedido` es exclusivo de
 * WhatsApp y `perfil` lo es de Instagram/Messenger (WhatsApp → `null`).
 *
 * Origen funcional: la ficha/`InstagramCustomerDrawer` del legacy
 * (`InstagramCustomerDrawer.js:69-113,116-126,247-312`) muestra avatar + nombre
 * + `@username` + SEGUIDORES + BIO + estado (en línea / última conexión) + la
 * insignia verificada, campos que en la consola legacy salían de su `mockData`.
 * El backend público de Instagram (`services/instagram.ts:150-236`) solo trae
 * `username/name/profile_pic`, así que estos extras se leen de
 * `EtiquetaIg.metadata` (Mixed) con claves tolerantes: si no existen la ficha
 * simplemente NO los pinta (mismo comportamiento condicional que el legacy).
 */
export interface PerfilUnificado {
  bio: string | null;
  /** Puede venir como número (12400) o como texto formateado ("12.4k"). */
  followers: string | number | null;
  /** Insignia `fa-check-circle` de cuenta verificada (IG-24 · IG-32 · IG-51). */
  verificado: boolean;
  /** `null` = desconocido → el drawer cae a `lastSeen`/"Desconectado". */
  online: boolean | null;
  lastSeen: string | null;
  /** `metadata.referral` del anuncio (el badge de anuncio usa `origen`). */
  referral: Record<string, any> | null;
}

export interface UltimoMensajeUnificado {
  texto: string;
  tipo: TipoMensajeUnificado;
  direccion: DireccionUnificada;
  timestamp: number;
  status: string | null;
  mediaUrl: string | null;
}

// ==========================================
// Objeto normalizado por conversación (§6.2)
// ==========================================

export interface ConversacionUnificada {
  // ── Identidad ────────────────────────────────────────────────
  clave: string;
  canal: CanalInbox;
  usuarioId: string;
  nombreVisible: string;
  nombre: string | null;
  username: string | null;
  avatar: string | null;

  // ── Último mensaje ───────────────────────────────────────────
  ultimoMensaje: UltimoMensajeUnificado | null;

  // ── Estado de la conversación ────────────────────────────────
  noLeidos: number;
  requiereAtencion: boolean;
  paso: string | null;
  pasoLabel: string | null;
  modo: "manual" | "automatico";
  stuck: boolean;
  bloqueado: boolean;
  origen: OrigenUnificado;
  detalleOrigen: DetalleOrigenInbox;
  lastInteraction: number | null;
  totalMensajes: number;

  // ── Extensión por canal ──────────────────────────────────────
  /** WhatsApp: resumen del pedido · Instagram/Messenger: `null` */
  pedido: PedidoUnificado | null;
  /** WhatsApp: de Etiqueta.carrito/Pedido · Instagram/Messenger: `null` */
  cedula: string | null;
  /** Instagram/Messenger: perfil público (IG-50..57) · WhatsApp: `null` */
  perfil: PerfilUnificado | null;

  // ── Escape hatch ─────────────────────────────────────────────
  fuente: Record<string, any> | null;
}

// ==========================================
// Peticiones / respuestas del servicio (§6.1, §6.3)
// ==========================================

export interface OpcionesListaInbox {
  canal?: CanalFiltro;
  limite?: number;
  buscar?: string;
  noLeidos?: boolean;
  modo?: "manual" | "automatico";
  atencion?: boolean;
  conPedido?: boolean;
}

export interface RespuestaListaInbox {
  success: true;
  generadoEn: number;
  canal: CanalFiltro;
  totales: Record<"todos" | CanalInbox, number>;
  totalesNoLeidos: Record<"todos" | CanalInbox, number>;
  capacidades: Record<CanalInbox, CapacidadCanal[]>;
  data: ConversacionUnificada[];
}

export interface ContextoInbox {
  canal: CanalInbox;
  usuarioId: string;
  [campo: string]: any;
}

// ==========================================
// Estado de CANAL (no de chat) — §6.3
// ==========================================

/** `GET/POST /api/admin/inbox/instagram/bot-toggle` (IG-01 · IG-18). */
export interface RespuestaBotToggleInstagram {
  success: true;
  data: { canal: "instagram"; enabled: boolean };
}

/**
 * Perfil público de WhatsApp Business (WA-45 · WA-39).
 * Mismo shape que devuelve la Graph API (`/whatsapp_business_profile`).
 */
export interface PerfilWhatsAppBusiness {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_url?: string;
  websites?: string[];
  vertical?: string;
}

/** `GET /api/admin/inbox/whatsapp/profile` (WA-39). */
export interface RespuestaPerfilWhatsApp {
  success: true;
  data: { canal: "whatsapp"; perfil: PerfilWhatsAppBusiness };
}

/** `POST /api/admin/inbox/whatsapp/profile` — body plano sin `canal` (WA-39). */
export interface PayloadPerfilWhatsApp {
  canal?: "whatsapp";
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  websites?: string[];
  vertical?: string;
}

/** `POST /api/admin/inbox/whatsapp/profile-picture` (multipart `canal`+`file`). */
export interface RespuestaFotoPerfilWhatsApp {
  success: true;
  data: { canal: "whatsapp"; profile_picture_url: string | null };
}

// ==========================================
// Adaptador por canal (§6.5)
// ==========================================

export interface OpcionesEnvioInbox {
  replyToMid?: string | null;
  replyToText?: string | null;
  caption?: string | null;
  io?: any;
  /**
   * LOTE B3 (WA-33) — REINTENTO con reconciliación in-place.
   *
   * `retryMsgId` = `_id` interno del mensaje fallido (lo expone el objeto
   * `MensajeUnificado`). Si llega y NO es un id temporal (`temp-…`), el adaptador
   * ACTUALIZA ese documento (status `enviando`→`sent`/`failed`, nuevo `wamid`,
   * `timestamp`) en vez de crear otro: es lo que evita la burbuja duplicada.
   * Campo de reconciliación = `_id`; `idExterno`/`wamid` no sirven como clave
   * porque el mensaje fallido puede no tener wamid (`null`).
   *
   * Solo WhatsApp: es el único canal con estados de entrega y `wamid`
   * (Instagram/Messenger → `409`, ver inboxService.enviarMensaje).
   */
  retryMsgId?: string | null;
  /** `wamid`/`mid` del mensaje que se reintenta (informativo; se ecoa en el evento). */
  retryWamid?: string | null;
}

export interface CanalAdapter {
  canal: CanalInbox;
  capacidades: Set<CapacidadCanal>;
  listarConversaciones(opts: OpcionesListaInbox): Promise<ConversacionUnificada[]>;
  leerHilo(
    usuarioId: string,
    page?: number,
    limite?: number,
  ): Promise<{ data: MensajeUnificado[]; pagination: PaginacionUnificada }>;
  enviarTexto(
    usuarioId: string,
    texto: string,
    opts?: OpcionesEnvioInbox,
  ): Promise<MensajeUnificado>;
  enviarAdjunto(
    usuarioId: string,
    file: any,
    opts?: OpcionesEnvioInbox,
  ): Promise<MensajeUnificado>;
  setModo(usuarioId: string, modo: "manual" | "automatico", opts?: OpcionesEnvioInbox): Promise<void>;
  /** Devuelve cuántos mensajes no leídos se limpiaron (0 si ya estaba leído) */
  marcarLeido(usuarioId: string): Promise<number>;
  contexto(usuarioId: string): Promise<Record<string, any>>;
  existe(usuarioId: string): Promise<boolean>;
}
