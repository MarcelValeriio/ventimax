/**
 * services/instagramFlowService.js
 * Orquestador del flujo conversacional del bot de Instagram
 * Alcance: Captación de prospectos, resolución de FAQs y derivación a WhatsApp oficial
 */

let EtiquetaIg = require("../models/EtiquetaIg");
let MensajeIg = require("../models/MensajeIg");
let FAQ = require("../models/FAQ");
let Setting = require("../models/Setting");
const axios = require("axios");
const cloudinaryService = require("./cloudinaryService");
const { buscarFAQ, getSaboresEnStock, getMenuDinamico } = require("./faqMatcher");
const instagram = require("./instagram");
const messenger = require("./messenger");
const configManager = require("./configManager");
const { getConfig } = require("./configStore");

function buildWaLink(waPhone: string, etiqueta: any, baseText: string = "pedir") {
  let adTag = "";
  const ref = etiqueta?.referralData?.referral || etiqueta?.metadata?.referral;
  if (ref && ref.ad_id) {
    adTag = ` [IGAD-${ref.ad_id}]`;
  } else if (etiqueta?.referralData?.origen === "anuncio") {
    adTag = ` [IGAD-unknown]`;
  }
  return `https://wa.me/${waPhone}?text=${encodeURIComponent(baseText + adTag)}`;
}


if (process.env.NODE_ENV === "test") {
  const dbLocal = require("./dbLocal");
  EtiquetaIg = dbLocal.getEtiquetaIgModel();
  MensajeIg = dbLocal.getMensajeIgModel();
  FAQ = dbLocal.getFAQModel();
  Setting = dbLocal.getSettingModel();
}

/**
 * Canales soportados por este flujo conversacional compartido.
 * El canal por defecto es Instagram: si un webhook no envía canal, el
 * comportamiento es IDÉNTICO al histórico.
 */
const CANAL_IG = "instagram";
const CANAL_MESSENGER = "messenger";

/**
 * Ruteo de entrada/salida por canal.
 * Instagram conserva exactamente sus mismas funciones y eventos; Messenger usa
 * su propio cliente HTTP (misma forma de llamada, otro token y otra página).
 * Los payloads de las Quick Replies son los mismos en ambos canales porque el
 * flujo evalúa las acciones por payload (IG_ACTION_*).
 */
const SALIDA_POR_CANAL: Record<string, any> = {
  [CANAL_IG]: {
    texto: instagram.enviarTextoIg,
    quickReplies: instagram.enviarQuickRepliesIg,
    perfil: instagram.getUserIgProfile,
    midPrefix: "igmid",
    eventos: { mensaje: "mensaje_ig", actualizado: "ig_actualizado" },
  },
  [CANAL_MESSENGER]: {
    texto: messenger.enviarTextoMessenger,
    quickReplies: messenger.enviarQuickRepliesMessenger,
    perfil: messenger.getUserMessengerProfile,
    midPrefix: "fbmid",
    eventos: { mensaje: "mensaje_messenger", actualizado: "messenger_actualizado" },
  },
};

/**
 * Configuración efectiva de canal (fallback a Instagram ante valores desconocidos).
 */
function getCanalConfig(canal) {
  return SALIDA_POR_CANAL[canal] || SALIDA_POR_CANAL[CANAL_IG];
}

/**
 * Prefijo dinámico para logs según el canal.
 * Devuelve "[Messenger Flow]" para canal messenger, o "[IG Flow]" para instagram (default).
 */
function getFlowPrefix(canal?: string): string {
  return canal === CANAL_MESSENGER ? "[Messenger Flow]" : "[IG Flow]";
}

/**
 * Filtro de conversación por canal, retrocompatible.
 * - Instagram: se conserva el filtro histórico `{ usuarioIgId }` para seguir
 *   encontrando documentos antiguos que no tienen el campo `canal`.
 * - Messenger: se exige el discriminador propio para no mezclar identidades
 *   (PSID de Facebook ≠ IGSID de Instagram).
 */
function getFiltroUsuario(canal, userId) {
  return canal === CANAL_MESSENGER
    ? { usuarioIgId: userId, canal: CANAL_MESSENGER }
    : { usuarioIgId: userId };
}

/**
 * Campos de canal a persistir: solo Messenger se marca explícitamente para que
 * los documentos de Instagram sigan naciendo con el default del esquema.
 */
function camposCanal(canal) {
  return canal === CANAL_MESSENGER ? { canal: CANAL_MESSENGER } : {};
}

/**
 * Emite el evento de "mensaje nuevo" del canal correspondiente.
 * Para Instagram el payload es exactamente el histórico (sin campo `canal`);
 * Messenger publica eventos propios para no intervenir la consola de Instagram.
 */
function emitirMensajeCanal(io, canal, usuarioId, mensajeDoc, etiquetaDoc = undefined) {
  if (!io) return;
  const payload: Record<string, any> = { usuarioIgId: usuarioId, mensaje: mensajeDoc };
  if (etiquetaDoc !== undefined) payload.etiqueta = etiquetaDoc;
  if (canal === CANAL_MESSENGER) payload.canal = CANAL_MESSENGER;
  io.emit(getCanalConfig(canal).eventos.mensaje, payload);

  // INBOX UNIFICADO (Fase 2A): evento de invalidación único (contrato §6.4).
  // Emitido desde inboxService; los eventos legacy del canal se mantienen.
  try {
    const inboxService = require("./inboxService"); // lazy: evita ciclos
    inboxService.emitirInboxActualizado(io, canal, usuarioId, "mensaje_nuevo");
  } catch (err) {
    console.error("⚠️ [Inbox] Error emitiendo inbox_actualizado:", err.message);
  }
}

/**
 * Emite el evento de "contacto actualizado" (refresco de la lista de chats).
 */
function emitirActualizadoCanal(io, canal, usuarioId) {
  if (!io) return;
  io.emit(
    getCanalConfig(canal).eventos.actualizado,
    canal === CANAL_MESSENGER
      ? { usuarioIgId: usuarioId, canal: CANAL_MESSENGER }
      : { usuarioIgId: usuarioId },
  );

  // INBOX UNIFICADO (Fase 2A, contrato §6.4)
  try {
    const inboxService = require("./inboxService"); // lazy: evita ciclos
    inboxService.emitirInboxActualizado(io, canal, usuarioId, "estado");
  } catch (err) {
    console.error("⚠️ [Inbox] Error emitiendo inbox_actualizado:", err.message);
  }
}

/**
 * 🎛️ FEATURE FLAG DE ROLLBACK / RESTAURACIÓN:
 * Si es `true`, envía botones nativos (Quick Replies) y maneja sus acciones interactivas.
 * Si es `false`, ejecuta el flujo 100% en texto plano original.
 */
const ENABLE_IG_QUICK_REPLIES = true;

/**
 * Botones de navegación principal en Instagram (límite estricto de Meta: 20 caracteres por título)
 */
function getIgMainQuickReplies() {
  const brandEmoji = configManager.get("settings.brandEmoji") || "📦";
  return [
    {
      content_type: "text",
      title: "📲 Hacer pedido", // 15 chars
      payload: "IG_ACTION_ORDER",
    },
    {
      content_type: "text",
      title: `${brandEmoji} Ver catálogo`, // 14 chars
      payload: "IG_ACTION_CATALOG",
    },
    {
      content_type: "text",
      title: "❓ Dudas frecuentes", // 18 chars UTF-16
      payload: "IG_ACTION_FAQ",
    },
  ];
}

/**
 * Consulta si el bot de Instagram está habilitado globalmente (default: true)
 */
async function isIgBotEnabled(canal = CANAL_IG) {
  try {
    const doc = await Setting.findOne({ key: "instagram.botEnabled" });
    if (doc && typeof doc.value === "boolean") {
      return doc.value;
    }
    return true;
  } catch (err) {
    console.warn(`⚠️ ${getFlowPrefix(canal)} Error leyendo Setting instagram.botEnabled:`, err.message);
    return true;
  }
}

/**
 * Obtiene el número de WhatsApp oficial configurado
 */
function getWhatsAppPhoneNumber() {
  const phone =
    getConfig("WHATSAPP_PHONE") ||
    configManager.get("settings.whatsappPhone") ||
    getConfig("ADMIN_PHONE_NUMBER") ||
    "584122781982";
  return phone.replace(/[^0-9]/g, "");
}

/**
 * Detecta si el mensaje expresa intención de compra o solicitud de WhatsApp
 * @param {string} text
 * @returns {boolean}
 */
function hasPurchaseOrWhatsAppIntent(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const purchaseKeywords = [
    "pedir",
    "pedido",
    "comprar",
    "compra",
    "ordenar",
    "orden",
    "precio",
    "precios",
    "catalogo",
    "whatsapp",
    "ws",
    "wa",
    "wapp",
    "numero",
    "telefono",
    "contacto",
    "delivery",
    "envio",
    "costo",
    "hacer pedido",
    "quiero pedir",
    "quiero comprar",
  ];

  return purchaseKeywords.some((kw) => {
    const regex = new RegExp(`(^|\\s|[^a-z0-9])${kw}($|\\s|[^a-z0-9])`, "i");
    return regex.test(clean);
  });
}

function isOrderAction(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  if (text === "IG_ACTION_ORDER" || clean.includes("hacer pedido")) return true;
  return hasPurchaseOrWhatsAppIntent(text);
}

function isCatalogAction(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return (
    text === "IG_ACTION_CATALOG" ||
    clean === "ver catalogo" ||
    clean.includes("ver catalogo") ||
    clean === "catalogo"
  );
}

function isLocationAction(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return (
    text === "IG_ACTION_LOCATION" ||
    clean === "ubicacion/horarios" ||
    clean === "ubicacion" ||
    clean === "horarios" ||
    clean === "horario" ||
    clean.includes("donde estan") ||
    clean.includes("donde quedan") ||
    clean.includes("ubicacion y horario")
  );
}

function isFaqAction(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return (
    text === "IG_ACTION_FAQ" ||
    clean === "preguntas frecuentes" ||
    clean.includes("preguntas frecuentes") ||
    clean === "faq" ||
    clean === "faqs"
  );
}

function isResetOrMenuAction(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const resetKeywords = [
    "cancelar",
    "menu",
    "menu principal",
    "salir",
    "reiniciar",
    "empezar",
    "inicio",
    "volver",
    "0",
    "reset",
  ];
  return text === "IG_ACTION_MENU" || resetKeywords.includes(clean);
}

/**
 * Construye el menú de texto con las FAQs disponibles
 * @param {Array} faqs
 * @returns {string}
 */
function buildFaqMenuText(faqs = []) {
  if (!faqs || faqs.length === 0) {
    return (
      configManager.format("settings.messages.faqFallbackMenu") ||
      "1. Catálogo y productos disponibles\n" +
      "2. Métodos de pago y envíos\n" +
      "3. Horarios de atención y delivery"
    );
  }

  const activeFaqs = faqs.filter((f) => f.activo !== false);
  return activeFaqs
    .map((f, idx) => `${idx + 1}. ${f.pregunta}`)
    .join("\n");
}

/**
 * Obtiene el nombre amigable o username para personalizar la interacción
 * Prioridad: 1. Primer nombre, 2. @username, 3. Cadena vacía
 */
function getFriendlyName(etiqueta) {
  if (!etiqueta) return "";
  if (etiqueta.nombre && typeof etiqueta.nombre === "string" && etiqueta.nombre.trim()) {
    const clean = etiqueta.nombre.trim();
    const firstName = clean.split(/\s+/)[0];
    if (
      firstName &&
      firstName.toLowerCase() !== "null" &&
      firstName.toLowerCase() !== "undefined"
    ) {
      return firstName;
    }
  }
  if (etiqueta.username && typeof etiqueta.username === "string" && etiqueta.username.trim()) {
    const cleanUser = etiqueta.username.trim();
    if (
      cleanUser &&
      cleanUser.toLowerCase() !== "null" &&
      cleanUser.toLowerCase() !== "undefined"
    ) {
      return `@${cleanUser.replace(/^@/, "")}`;
    }
  }
  return "";
}

const WEBHOOK_DEBOUNCE_MS_DEFAULT = 1200;

function getDebounceMs() {
  const debounceVal = getConfig("WEBHOOK_DEBOUNCE_MS");
  if (debounceVal !== undefined) {
    const val = parseInt(debounceVal, 10);
    return isNaN(val) ? 0 : val;
  }
  return process.env.NODE_ENV === "test" ? 0 : WEBHOOK_DEBOUNCE_MS_DEFAULT;
}

class InstagramFlowService {
  userQueues: Map<string, any>;

  constructor() {
    this.userQueues = new Map();
  }

  /**
   * Procesa mensajes salientes (echos) enviados manualmente por agentes desde Meta Business Suite
   * para que se reflejen en la consola en tiempo real
   * @param {object} options - Opciones adicionales ({ canal })
   */
  async handleEcho(userId, text, mid, io, options: Record<string, any> = {}) {
    const canal = options?.canal || CANAL_IG;
    try {
      const canalCfg = getCanalConfig(canal);
      const userFilter = getFiltroUsuario(canal, userId);
      const esMessenger = canal === CANAL_MESSENGER;

      if (!userId || !text) return;

      // 1. Evitar duplicar el eco si es un mensaje que el bot o el operador acaba de enviar
      // (ya que el webhook recibe un echo de los mensajes salientes que disparamos nosotros mismos)
      const isDuplicated = await MensajeIg.findOne({
        ...userFilter,
        $or: [
          ...(mid ? [{ mid: mid }] : []),
          {
            direccion: { $in: ["bot", "admin"] },
            texto: text,
            timestamp: { $gte: new Date(Date.now() - 15000) }, // Hace menos de 15 segundos
          },
        ],
      });

      if (isDuplicated) {
        // Actualizamos el MID real en la DB por si teníamos un MID temporal
        if (mid && (!isDuplicated.mid || isDuplicated.mid.startsWith(`${canalCfg.midPrefix}_`))) {
          isDuplicated.mid = mid;
          if (typeof isDuplicated.save === "function") {
            await isDuplicated.save();
          }
        }
        return; // No emitir ni guardar duplicado
      }

      // Si no es duplicado (ej. enviado manualmente por un agente desde Meta Business Suite)
      const outgoingMsg = await MensajeIg.create({
        usuarioIgId: userId,
        ...camposCanal(canal),
        direccion: "bot", // o "admin", ya que viene del negocio
        texto: text,
        tipo: "texto",
        mid: mid || `${canalCfg.midPrefix}_echo_${Date.now()}`,
        status: "sent",
        timestamp: new Date(),
      });

      emitirMensajeCanal(io, canal, userId, outgoingMsg);
      console.log(`✅ ${getFlowPrefix(canal)} Echo registrado para ${userId} desde Meta Business${esMessenger ? " [canal=messenger]" : ""}`);
    } catch (err) {
      console.error(`❌ ${getFlowPrefix(canal)} Error en handleEcho para ${userId}:`, err.message);
    }
  }

  /**
   * Manejador central de mensajes entrantes desde el webhook de Instagram
   * @param {string} userId - ID del usuario de Instagram (IGSID)
   * @param {string} igAccountId - ID de la cuenta de Instagram del negocio
   * @param {string} text - Texto del mensaje enviado por el cliente
   * @param {string} mid - ID único del mensaje en Meta
   * @param {object} io - Instancia de Socket.IO para tiempo real
   * @param {object} referralData - Origen y datos de anuncio ({ origen, referral })
   * @param {object} options - Opciones adicionales (ej. debounceMs, canal)
   */
  async handleIncomingMessage(
    userId,
    igAccountId,
    text,
    mid,
    io = null,
    referralData: Record<string, any> = {},
    options: Record<string, any> = {},
  ) {
    // Canal por defecto: Instagram (comportamiento histórico intacto).
    const canal = options?.canal || referralData?.canal || CANAL_IG;
    try {
      if (!userId) {
        console.warn(`⚠️ ${getFlowPrefix(canal)} Mensaje ignorado: userId indefinido`);
        return;
      }

      const canalCfg = getCanalConfig(canal);
      const userFilter = getFiltroUsuario(canal, userId);
      const esMessenger = canal === CANAL_MESSENGER;
      const canalSufijo = esMessenger ? " [canal=messenger]" : "";

      const payload = referralData?.payload || options?.payload || null;
      const mediaType = options?.mediaType || referralData?.mediaType || null;
      const mediaUrl = options?.mediaUrl || referralData?.mediaUrl || null;

      console.log(`📡 ${getFlowPrefix(canal)} Mensaje recibido de ${userId}: "${text || ""}"${payload ? ` (Payload: ${payload})` : ""}${canalSufijo}`);

      const isFromAd = referralData?.origen === "anuncio";
      let wokeUpFromAd = false;

      // 1. Obtener o crear estado del usuario
      let isNew = false;
      let etiqueta = await EtiquetaIg.findOne(userFilter);

      // Verificación temprana: Si el usuario ya está bloqueado, ignorar silenciosamente
      if (etiqueta && etiqueta.bloqueado) {
        console.log(`🚫 [IG Spam] Mensaje ignorado: Usuario ${userId} está bloqueado.`);
        return;
      }

      if (!etiqueta) {
        let username = null;
        let nombre = null;
        let profilePic = null;
        try {
          const profile = await canalCfg.perfil(userId);
          if (profile) {
            username = profile.username || null;
            nombre = profile.name || null;
            profilePic = profile.profilePic || null;
          }
        } catch (e) {
          // No bloqueante
        }

        try {
          etiqueta = await EtiquetaIg.create({
            usuarioIgId: userId,
            ...camposCanal(canal),
            username,
            nombre,
            profilePic,
            paso: "inicio",
            modo: isFromAd ? "manual" : "automatico",
            origen: isFromAd ? "anuncio" : "directo",
            bloqueado: false,
            metadata: referralData?.referral ? { referral: referralData.referral } : {},
            unreadCount: 1,
            lastInteraction: new Date(),
          });
          isNew = true;
        } catch (error) {
          if (error.code === 11000) {
            // Documento creado concurrentemente
            etiqueta = await EtiquetaIg.findOne(userFilter);
            if (!etiqueta) {
              throw new Error("EtiquetaIg no encontrada tras error E11000");
            }
            if (etiqueta.bloqueado) {
              return;
            }
          } else {
            throw error;
          }
        }
      }

      // Detección de Spam por Llamada (audio_call, video_call, unsupported, o texto alusivo de Meta)
      const callTypes = ["audio_call", "video_call", "call", "unsupported"];
      const isCallType = typeof mediaType === "string" && callTypes.includes(mediaType.toLowerCase());
      const isCallPayload = typeof payload === "string" && 
        (payload === "audio_call" || payload === "video_call" || payload.toLowerCase().includes("call"));
      const metaCallRegex = /(?:llamada de (?:audio|video)|llamada perdida|inici[oó] una llamada|\b(?:audio|video)[ _]call\b|(?:missed|started|ended) (?:an? )?(?:audio |video )?call)/i;
      const isCallText = typeof text === "string" && metaCallRegex.test(text);

      if (isCallType || isCallPayload || isCallText) {
        console.log(`🚫 [IG Spam] Llamada detectada de ${userId} (tipo: ${mediaType}, payload: ${payload}, texto: "${text}"). Bloqueando usuario.`);
        await EtiquetaIg.findOneAndUpdate(
          userFilter,
          { $set: { bloqueado: true } }
        );
        etiqueta.bloqueado = true;
        return;
      }

      // Detección de Spam por Reel (en primer contacto o paso 'inicio' con <= 1 interacción)
      const esPrimerContacto = isNew || (etiqueta.paso === "inicio" && (etiqueta.unreadCount || 0) <= 1);
      const reelUrlPattern = /(?:instagram\.com|instagr\.am)\/(?:reel|reels)\//i;
      const esReel =
        mediaType === "share" ||
        mediaType === "reel" ||
        mediaType === "ig_reel" ||
        (typeof text === "string" && reelUrlPattern.test(text)) ||
        (typeof mediaUrl === "string" && reelUrlPattern.test(mediaUrl));

      if (esPrimerContacto && esReel) {
        console.log(`🚫 [IG Spam] Reel spam detectado en primer contacto de ${userId} (tipo: ${mediaType}, texto: "${text}"). Bloqueando usuario.`);
        await EtiquetaIg.findOneAndUpdate(
          userFilter,
          { $set: { bloqueado: true } }
        );
        etiqueta.bloqueado = true;
        return;
      }
      
      if (!isNew && etiqueta) {
        const prevLastInteraction = etiqueta.lastInteraction;
        etiqueta.unreadCount = (etiqueta.unreadCount || 0) + 1;
        etiqueta.lastInteraction = new Date();
        const updateFields: Record<string, any> = {
          lastInteraction: etiqueta.lastInteraction,
        };

        // Si viene de un anuncio y no estaba marcado como anuncio, actualizar a manual
        if (isFromAd && etiqueta.origen !== "anuncio") {
          etiqueta.origen = "anuncio";
          etiqueta.modo = "manual";
          updateFields.origen = "anuncio";
          updateFields.modo = "manual";
          if (referralData?.referral) {
            updateFields["metadata.referral"] = referralData.referral;
          }
        }

        // Si el mensaje actual es tipeado libremente (!isFromAd)
        // Y el usuario venía de un anuncio (origen === "anuncio")
        // Y han pasado más de 3 minutos desde el último mensaje del anuncio...
        if (!isFromAd && etiqueta.origen === "anuncio" && prevLastInteraction) {
          const msSinceLastInteraction = Date.now() - new Date(prevLastInteraction).getTime();
          if (msSinceLastInteraction > 3 * 60 * 1000) {
            console.log(`🤖 ${getFlowPrefix(canal)} Reactivando bot para ${userId}. Han pasado 3+ mins desde el anuncio.`);
            etiqueta.modo = "automatico";
            updateFields.modo = "automatico";
            wokeUpFromAd = true;
          }
        }

        // Si el usuario no tenía username o foto guardada (o su foto es un enlace temporal de Meta), intentar refrescarlo ahora
        const isCloudinaryPic =
          etiqueta.profilePic && etiqueta.profilePic.includes("cloudinary.com");
        const hasTemporaryMetaPic =
          etiqueta.profilePic && (!isCloudinaryPic || etiqueta.profilePic.includes("scontent") || etiqueta.profilePic.includes("fbcdn") || etiqueta.profilePic.includes("fbsbx"));

        if (!etiqueta.username || !etiqueta.profilePic || hasTemporaryMetaPic) {
          try {
            const profile = await canalCfg.perfil(userId);
            if (profile) {
              if (profile.username && (!etiqueta.username || etiqueta.username !== profile.username)) {
                etiqueta.username = profile.username;
                updateFields.username = profile.username;
              }
              if (profile.name && (!etiqueta.nombre || etiqueta.nombre !== profile.name)) {
                etiqueta.nombre = profile.name;
                updateFields.nombre = profile.name;
              }
              if (profile.profilePic && (!etiqueta.profilePic || hasTemporaryMetaPic || etiqueta.profilePic !== profile.profilePic)) {
                etiqueta.profilePic = profile.profilePic;
                updateFields.profilePic = profile.profilePic;
              }
            }
          } catch (e) {
            // No bloqueante
          }
        }

        const updatedDoc = await EtiquetaIg.findOneAndUpdate(
          userFilter,
          {
            $set: updateFields,
            $inc: { unreadCount: 1 },
          },
          { returnDocument: "after" }
        );
        if (updatedDoc) {
          etiqueta = updatedDoc;
        }
      }

      // 2. Persistir mensaje entrante (cliente)
      let permanentMediaUrl = mediaUrl;
      // mediaType ya fue extraído al inicio

      if (permanentMediaUrl && typeof permanentMediaUrl === "string" && !permanentMediaUrl.includes("cloudinary.com")) {
        try {
          if (process.env.NODE_ENV === "test") {
            permanentMediaUrl = `https://res.cloudinary.com/test-cloud/raw/upload/v12345/ig_media/media_${Date.now()}.${mediaType === "audio" ? "mp4" : "jpg"}`;
          } else {
            const mediaRes = await axios.get(permanentMediaUrl, {
              responseType: "arraybuffer",
              timeout: 10000,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              },
            });
            if (mediaRes.data) {
              const buffer = Buffer.from(mediaRes.data);
              const uploadedUrl = await cloudinaryService.uploadFromBuffer(
                buffer,
                "ig_media",
              );
              if (uploadedUrl) {
                permanentMediaUrl = uploadedUrl;
                console.log(`✅ ${getFlowPrefix(canal)} Media de ${userId} subida a Cloudinary: ${permanentMediaUrl}`);
              }
            }
          }
        } catch (mediaErr) {
          console.warn(`⚠️ ${getFlowPrefix(canal)} No se pudo subir media a Cloudinary para ${userId}:`, mediaErr.message);
        }
      }

      const incomingMsg = await MensajeIg.create({
        usuarioIgId: userId,
        ...camposCanal(canal),
        direccion: "cliente",
        texto: text || (mediaType === "audio" ? "[Nota de voz]" : (mediaType === "image" ? "[Foto]" : "[Archivo multimedia]")),
        tipo: mediaType || "texto",
        mediaUrl: permanentMediaUrl,
        mediaType: mediaType,
        mid: mid || `${canalCfg.midPrefix}_${Date.now()}`,
        status: "received",
        timestamp: new Date(),
      });

      // Notificar al frontend vía Socket.IO
      emitirMensajeCanal(io, canal, userId, incomingMsg, etiqueta);
      emitirActualizadoCanal(io, canal, userId);

      // 3. Debounce y encolado serial por remitente (userId)
      const debounceMs =
        options.debounceMs !== undefined ? options.debounceMs : getDebounceMs();

      // cola serial aislada por CANAL + remitente (un PSID y un IGSID podrían coincidir)
      const queueKey = `${canal}:${userId}`;

      return new Promise((resolve, reject) => {
        let q = this.userQueues.get(queueKey);
        if (!q) {
          q = {
            timer: null,
            messages: [],
            queuePromise: Promise.resolve(),
          };
          this.userQueues.set(queueKey, q);
        }

        q.messages.push({
          userId,
          igAccountId,
          text,
          mid,
          io,
          referralData,
          payload,
          canal,
          wokeUpFromAd,
          resolve,
          reject,
        });

        if (debounceMs > 0) {
          if (q.timer) {
            clearTimeout(q.timer);
          }
          q.timer = setTimeout(() => {
            q.timer = null;
            this._flushUserQueue(queueKey);
          }, debounceMs);
        } else {
          this._flushUserQueue(queueKey);
        }
      });
    } catch (err) {
      console.error(`❌ ${getFlowPrefix(canal)} Error en handleIncomingMessage para ${userId}:`, err);
    }
  }

  /**
   * Procesa la cola de mensajes acumulados para un usuario de forma serial y atómica.
   * @param {string} queueKey - Clave de cola (`{canal}:{userId}`)
   */
  _flushUserQueue(queueKey) {
    const q = this.userQueues.get(queueKey);
    if (!q) return Promise.resolve();

    if (q.timer) {
      clearTimeout(q.timer);
      q.timer = null;
    }

    const run = async () => {
      const batch = q.messages.splice(0, q.messages.length);
      if (batch.length === 0) return;

      // El userId real del lote (la clave de cola es `canal:userId`)
      const userId = batch[batch.length - 1].userId;
      const canal = batch[0]?.canal || (queueKey?.startsWith(CANAL_MESSENGER) ? CANAL_MESSENGER : CANAL_IG);

      try {
        await this._processBatch(userId, batch);
        batch.forEach((item) => item.resolve && item.resolve(true));
      } catch (err) {
        console.error(
          `❌ ${getFlowPrefix(canal)} Error procesando lote para ${queueKey}:`,
          err.message,
        );
        batch.forEach((item) => item.reject && item.reject(err));
      } finally {
        if (q.messages.length === 0 && !q.timer) {
          this.userQueues.delete(queueKey);
        }
      }
    };

    q.queuePromise = q.queuePromise.then(run, run);
    return q.queuePromise;
  }

  /**
   * Procesa el lote consolidado de mensajes
   */
  async _processBatch(userId, batch) {
    if (!batch || batch.length === 0) return;

    const lastItem = batch[batch.length - 1];
    const igAccountId = lastItem.igAccountId;
    const io = lastItem.io;
    const lastMid = lastItem.mid;
    // Todos los mensajes del lote pertenecen al mismo canal (la cola es por canal + remitente)
    const canal = lastItem.canal || CANAL_IG;

    // Concatenar todos los mensajes de texto del lote separados por un espacio
    let combinedText = batch
      .map((item) => (item.text || "").trim())
      .filter(Boolean)
      .join(" ");

    // Memoria a corto plazo al despertar: si algún mensaje del lote reactivó el bot tras el anuncio
    const wokeUpItem = batch.find((item) => item.wokeUpFromAd === true);
    if (wokeUpItem) {
      try {
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentClientMsgs = await MensajeIg.find({
          ...getFiltroUsuario(canal, userId),
          direccion: "cliente",
          timestamp: { $gte: fiveMinutesAgo },
        })
          .sort({ timestamp: 1 })
          .limit(5);

        if (recentClientMsgs && recentClientMsgs.length > 0) {
          const recentTexts = recentClientMsgs
            .map((m) => (m.texto || "").trim())
            .filter(Boolean);

          const allTexts = [...recentTexts];
          if (combinedText && !allTexts.includes(combinedText)) {
            allTexts.push(combinedText);
          }
          const uniqueTexts = [...new Set(allTexts)];
          combinedText = uniqueTexts.join(" ");
        }
      } catch (memErr) {
        console.warn(
          `⚠️ ${getFlowPrefix(canal)} Error recuperando memoria reciente de mensajes para ${userId}:`,
          memErr.message,
        );
      }
    }

    // Si algún mensaje contenía referralData con anuncio, preservarlo
    const adReferralItem = batch.find(
      (item) => item.referralData?.origen === "anuncio",
    );
    const lastPayload = lastItem.payload || batch.map((item) => item.payload).filter(Boolean).pop() || null;
    const combinedReferralData = adReferralItem
      ? { ...(adReferralItem.referralData || {}), payload: lastPayload }
      : { ...(lastItem.referralData || {}), payload: lastPayload };

    await this._processSingleUnifiedMessage(
      userId,
      igAccountId,
      combinedText,
      lastMid,
      io,
      combinedReferralData,
      lastPayload,
      canal,
    );
  }

  /**
   * Ejecución de la lógica de negocio para un mensaje consolidado
   * @param {string} canal - Canal de la conversación ("instagram" | "messenger"). Default: instagram.
   */
  async _processSingleUnifiedMessage(
    userId,
    igAccountId,
    text,
    mid,
    io = null,
    referralData: Record<string, any> = {},
    payload = null,
    canal = CANAL_IG,
  ) {
    // Si el bot está desactivado globalmente, registrar pero no responder
    if (!(await isIgBotEnabled(canal))) {
      console.log(`🛑 ${getFlowPrefix(canal)} Bot de IG desactivado globalmente. No se responde a ${userId}.`);
      return;
    }

    const etiqueta = await EtiquetaIg.findOne(getFiltroUsuario(canal, userId));
    if (!etiqueta) return;

    // Canal efectivo de la conversación: si el documento ya está marcado como
    // Messenger (ej. cuando el watchdog retoma el lead sin canal explícito),
    // se respeta el canal persistido para no responder por Instagram.
    const canalEfectivo = etiqueta.canal === CANAL_MESSENGER ? CANAL_MESSENGER : canal;
    const canalCfg = getCanalConfig(canalEfectivo);
    const userFilter = getFiltroUsuario(canalEfectivo, userId);
    const nombreCanal = canalEfectivo === CANAL_MESSENGER ? "Messenger" : "Instagram";

    // Si la conversación está en modo manual, no auto-responder
    if (etiqueta.modo === "manual") {
      console.log(`🛑 ${getFlowPrefix(canalEfectivo)} Conversación con ${userId} en modo manual. No responde bot.`);
      return;
    }

    // 3. Cargar FAQs activas
    let faqs = [];
    try {
      faqs = await FAQ.find({ brand: "default", activo: true }).sort({ order: 1 });
    } catch (err) {
      console.warn(`⚠️ ${getFlowPrefix(canalEfectivo)} Error cargando FAQs:`, err.message);
    }

    const waPhone = getWhatsAppPhoneNumber();
    let botReplyText = "";
    let nuevoPaso = etiqueta.paso || "inicio";
    let shouldSendQuickReplies = false;

    // Determinar la clave de acción a evaluar (preferir payload si está presente)
    const effectivePayload = payload || referralData?.payload || null;
    const actionKey = effectivePayload || text;

    // 4. Evaluar intenciones y estado conversacional
    // Interceptor temprano: Comandos globales de reinicio / menú (CANCELAR, MENU, INICIO)
    if (isResetOrMenuAction(actionKey)) {
      const friendlyName = getFriendlyName(etiqueta);
      const greetingPrefix = friendlyName ? `¡Hola, ${friendlyName}! 👋` : `¡Hola! 👋`;
      const brandName = configManager.get("settings.brandName");
      const brandEmoji = configManager.get("settings.brandEmoji") || configManager.get("settings.categoryEmoji") || "📦";
      if (ENABLE_IG_QUICK_REPLIES) {
        botReplyText =
          `${brandEmoji} *${greetingPrefix} Menú Principal ${brandName}.*\n\n` +
          `Soy tu asistente virtual en Instagram. ¿Cómo podemos ayudarte hoy?\n\n` +
          `Toca uno de los botones abajo o escríbenos tu consulta:\n\n` +
          `📲 *Para hacer tu pedido directo por WhatsApp:*\n` +
          `👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
        nuevoPaso = "en_faq";
        shouldSendQuickReplies = true;
      } else {
        const faqMenu = buildFaqMenuText(faqs);
        botReplyText =
          `${brandEmoji} *${greetingPrefix} Menú Principal ${brandName}.*\n\n` +
          `Aquí puedes consultar nuestras preguntas frecuentes:\n\n` +
          `${faqMenu}\n\n` +
          `_Escribe el número o el tema de tu consulta para ver la información._\n\n` +
          `📲 *Nota:* Todos los pedidos y pagos se coordinan exclusivamente a través de nuestro WhatsApp oficial:\n` +
          `👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
        nuevoPaso = "en_faq";
      }
    } else if (!ENABLE_IG_QUICK_REPLIES) {
      // =========================================================================
      // MODO TEXTO PLANO ORIGINAL (PUNTO DE RESTAURACIÓN / ROLLBACK)
      // =========================================================================
      const isPurchaseIntent = hasPurchaseOrWhatsAppIntent(actionKey);

      if (isPurchaseIntent) {
        const brandEmoji = configManager.get("settings.brandEmoji") || configManager.get("settings.categoryEmoji") || "📦";
        botReplyText =
          `${brandEmoji} *¡Hola! Qué gusto saludarte.*\n\n` +
          `Para realizar tu pedido, elegir tus productos, coordinar el delivery y procesar tu pago de forma directa y rápida, por favor escríbenos a nuestro WhatsApp oficial:\n\n` +
          `👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}\n\n` +
          `¡Te esperamos por allá para despacharte de inmediato! 🙌✨`;
        nuevoPaso = "derivado";
      } else if (etiqueta.paso === "inicio") {
        const friendlyName = getFriendlyName(etiqueta);
        const greetingPrefix = friendlyName ? `¡Hola, ${friendlyName}! 👋` : `¡Hola! 👋`;
        const brandName = configManager.get("settings.brandName");
        const brandEmoji = configManager.get("settings.brandEmoji") || configManager.get("settings.categoryEmoji") || "📦";
        const faqMenu = buildFaqMenuText(faqs);
        botReplyText =
          `${brandEmoji} *${greetingPrefix} Bienvenido a ${brandName}.*\n\n` +
          `Soy tu asistente virtual en Instagram. Aquí puedo responder tus dudas y preguntas frecuentes:\n\n` +
          `${faqMenu}\n\n` +
          `_Escribe el número o el tema de tu consulta para ver la información._\n\n` +
          `📲 *Nota:* Todos los pedidos y pagos se coordinan exclusivamente a través de nuestro WhatsApp oficial:\n` +
          `👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
        nuevoPaso = "en_faq";
      } else {
        let matchedFaq = null;
        const numSelection = parseInt((text || "").trim(), 10);
        if (!isNaN(numSelection) && numSelection >= 1 && numSelection <= faqs.length) {
          matchedFaq = faqs[numSelection - 1];
        } else {
          matchedFaq = buscarFAQ(text, faqs);
        }

        if (matchedFaq) {
          if (matchedFaq.type === "dinamica") {
            if (matchedFaq.dynamicKey === "sabores") {
              const saboresText = await getSaboresEnStock();
              botReplyText = `${saboresText}\n\n_¿Quieres hacer tu pedido? Escríbenos por nuestro WhatsApp oficial:_\n👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
            } else if (matchedFaq.dynamicKey === "menu") {
              const menuText = await getMenuDinamico();
              botReplyText = `${menuText}\n\n_¿Quieres hacer tu pedido? Escríbenos por nuestro WhatsApp oficial:_\n👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
            }
          } else {
            botReplyText = `${matchedFaq.respuesta}\n\n_¿Quieres hacer tu pedido? Escríbenos por nuestro WhatsApp oficial:_\n👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
          }
          nuevoPaso = "en_faq";
        } else {
          const friendlyName = getFriendlyName(etiqueta);
          const greetingPrefix = friendlyName ? `¡Hola, ${friendlyName}! 👋` : `¡Hola! 👋`;
          const faqMenu = buildFaqMenuText(faqs);
          botReplyText =
            `${greetingPrefix} Encantado de saludarte. Para poder ayudarte mejor, elige una de estas opciones o escríbeme tu duda:\n\n` +
            `${faqMenu}\n\n` +
            `📲 Si deseas hacer tu pedido, escríbenos por nuestro WhatsApp oficial:\n` +
            `👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
          nuevoPaso = "en_faq";
        }
      }
    } else {
      // =========================================================================
      // NUEVO FLUJO CON BOTONES INTERACTIVOS (QUICK REPLIES)
      // =========================================================================
      if (isOrderAction(actionKey)) {
        // 1. ACCIÓN: PEDIDO / WHATSAPP
        const brandEmoji = configManager.get("settings.brandEmoji") || configManager.get("settings.categoryEmoji") || "📦";
        botReplyText =
          `${brandEmoji} *¡Hola! Qué gusto saludarte.*\n\n` +
          `Para realizar tu pedido, elegir tus productos, coordinar el delivery y procesar tu pago de forma directa y rápida, por favor escríbenos a nuestro WhatsApp oficial:\n\n` +
          `👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}\n\n` +
          `¡Te esperamos por allá para despacharte de inmediato! 🙌✨`;
        nuevoPaso = "derivado";
        shouldSendQuickReplies = false;
      } else if (isCatalogAction(actionKey)) {
        // 2. ACCIÓN: CATÁLOGO Y PRODUCTOS
        const brandEmoji = configManager.get("settings.brandEmoji") || configManager.get("settings.categoryEmoji") || "📦";
        const menuText = await getMenuDinamico();
        const catalogHeader =
          configManager.format("settings.messages.igCatalogHeader", { brandEmoji }) ||
          `${brandEmoji} *Catálogo y Productos Disponibles:*`;
        botReplyText =
          `${catalogHeader}\n\n` +
          `${menuText}\n\n` +
          `📲 *Para hacer tu pedido y coordinar delivery, escríbenos por WhatsApp oficial:*\n` +
          `👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
        nuevoPaso = "en_faq";
        shouldSendQuickReplies = true;
      } else if (isLocationAction(actionKey)) {
        // 3. ACCIÓN: UBICACIÓN Y HORARIOS
        let locationFaq = buscarFAQ("horarios y ubicacion", faqs) || buscarFAQ("horario", faqs) || buscarFAQ("ubicacion", faqs);
        const locationBody = locationFaq?.respuesta || (
          `📍 *Ubicación y Cobertura:*\n` +
          `Contamos con servicio de delivery en toda Caracas (Las Mercedes, Chacao, Altamira, El Cafetal, Baruta, El Hatillo y zonas aledañas).\n\n` +
          `🕒 *Horario de Atención:*\n` +
          `Lunes a Sábado de 9:00 AM a 6:00 PM.`
        );
        botReplyText =
          `${locationBody}\n\n` +
          `📲 *Para coordinar tu entrega:* 👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
        nuevoPaso = "en_faq";
        shouldSendQuickReplies = true;
      } else if (isFaqAction(actionKey)) {
        // 4. ACCIÓN: PREGUNTAS FRECUENTES
        const faqMenu = buildFaqMenuText(faqs);
        botReplyText =
          `❓ *Preguntas Frecuentes:*\n\n` +
          `${faqMenu}\n\n` +
          `_Escribe el número o el tema de tu consulta para ver la información._\n\n` +
          `📲 *Para hacer pedidos directos por WhatsApp:*\n` +
          `👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
        nuevoPaso = "en_faq";
        shouldSendQuickReplies = true;
      } else if (etiqueta.paso === "inicio") {
        // PRIMER CONTACTO CON BOTONES
        const friendlyName = getFriendlyName(etiqueta);
        const greetingPrefix = friendlyName ? `¡Hola, ${friendlyName}! 👋` : `¡Hola! 👋`;
        const brandName = configManager.get("settings.brandName");
        const brandEmoji = configManager.get("settings.brandEmoji") || configManager.get("settings.categoryEmoji") || "📦";
        botReplyText =
          `${brandEmoji} *${greetingPrefix} Bienvenido a ${brandName}.*\n\n` +
          `Soy tu asistente virtual en Instagram. ¿Cómo podemos ayudarte hoy?\n\n` +
          `Toca uno de los botones abajo o escríbenos tu consulta:\n\n` +
          `📲 *Para hacer tu pedido directo por WhatsApp:*\n` +
          `👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
        nuevoPaso = "en_faq";
        shouldSendQuickReplies = true;
      } else {
        // Búsqueda de FAQ específica por número o texto
        let matchedFaq = null;
        const numSelection = parseInt((text || "").trim(), 10);
        if (!isNaN(numSelection) && numSelection >= 1 && numSelection <= faqs.length) {
          matchedFaq = faqs[numSelection - 1];
        } else {
          matchedFaq = buscarFAQ(text, faqs);
        }

        if (matchedFaq) {
          if (matchedFaq.type === "dinamica") {
            if (matchedFaq.dynamicKey === "sabores") {
              const saboresText = await getSaboresEnStock();
              botReplyText = `${saboresText}\n\n_¿Quieres hacer tu pedido? Escríbenos por nuestro WhatsApp oficial:_\n👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
            } else if (matchedFaq.dynamicKey === "menu") {
              const menuText = await getMenuDinamico();
              botReplyText = `${menuText}\n\n_¿Quieres hacer tu pedido? Escríbenos por nuestro WhatsApp oficial:_\n👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
            }
          } else {
            botReplyText = `${matchedFaq.respuesta}\n\n_¿Quieres hacer tu pedido? Escríbenos por nuestro WhatsApp oficial:_\n👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
          }
          nuevoPaso = "en_faq";
          shouldSendQuickReplies = true;
        } else {
          // Consulta no reconocida
          const friendlyName = getFriendlyName(etiqueta);
          const greetingPrefix = friendlyName ? `¡Hola, ${friendlyName}! 👋` : `¡Hola! 👋`;
          botReplyText =
            `${greetingPrefix} Encantado de saludarte. Para poder ayudarte mejor, selecciona una de las siguientes opciones o escríbenos tu duda:\n\n` +
            `📲 Si deseas hacer tu pedido, escríbenos por nuestro WhatsApp oficial:\n` +
            `👉 ${buildWaLink(waPhone, etiqueta, 'pedir')}`;
          nuevoPaso = "en_faq";
          shouldSendQuickReplies = true;
        }
      }
    }

    // 5. Actualizar estado
    await EtiquetaIg.findOneAndUpdate(
      userFilter,
      { $set: { paso: nuevoPaso, lastInteraction: new Date() } },
    );

    // 6. Enviar respuesta por el canal correspondiente (try/catch resiliente con fallback a texto plano)
    let sendSuccess = false;
    let sendErrorMsg = null;
    try {
      if (ENABLE_IG_QUICK_REPLIES && shouldSendQuickReplies) {
        try {
          await canalCfg.quickReplies(igAccountId, userId, botReplyText, getIgMainQuickReplies());
        } catch (qrErr) {
          console.warn(`⚠️ ${getFlowPrefix(canalEfectivo)} Falló el envío de Quick Replies a ${userId}, ejecutando fallback a texto plano:`, qrErr.message);
          await canalCfg.texto(igAccountId, userId, botReplyText);
        }
      } else {
        await canalCfg.texto(igAccountId, userId, botReplyText);
      }
      sendSuccess = true;
    } catch (sendErr) {
      sendErrorMsg = sendErr.message;
      console.error(`❌ ${getFlowPrefix(canalEfectivo)} Falló el envío de respuesta automática a ${userId}:`, sendErr.message);
    }

    // 7. Persistir mensaje saliente del bot
    const outgoingMsg = await MensajeIg.create({
      usuarioIgId: userId,
      ...camposCanal(canalEfectivo),
      direccion: "bot",
      texto: botReplyText,
      tipo: "texto",
      mid: `${canalCfg.midPrefix}_bot_${Date.now()}`,
      status: sendSuccess ? "sent" : "failed",
      error: sendErrorMsg,
      timestamp: new Date(),
    });

    // 8. Emitir evento en tiempo real para el SaaS (eventos propios por canal)
    emitirMensajeCanal(io, canalEfectivo, userId, outgoingMsg, {
      ...(etiqueta.toObject?.() || etiqueta),
      paso: nuevoPaso,
    });
    emitirActualizadoCanal(io, canalEfectivo, userId);

    console.log(`✅ ${getFlowPrefix(canalEfectivo)} Flujo procesado para ${userId}. Paso actual: ${nuevoPaso}${sendSuccess ? "" : " (Envío fallido registrado)"}${canalEfectivo === CANAL_MESSENGER ? " [canal=messenger]" : ""}`);
  }
}

module.exports = new InstagramFlowService();
