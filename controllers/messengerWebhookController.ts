/**
 * controllers/messengerWebhookController.ts
 * Controlador para la verificación y recepción de eventos de Facebook Messenger (Meta)
 *
 * Formato de Meta: object = "page", entry[].messaging[] con
 * { sender.id (PSID), recipient.id (Página), message/postback/quick_reply/attachments }.
 * El parser de Instagram NO se reutiliza aquí: este controlador es propio del canal
 * para poder trazar, depurar y evolucionar Messenger sin tocar el de Instagram.
 */

const instagramFlowService = require("../services/instagramFlowService");

/** Canal declarado por este controlador al flujo conversacional compartido */
const CANAL_MESSENGER = "messenger";

/**
 * Eventos de Messenger que NO son mensajes del cliente y deben ignorarse
 * (entrega, lectura, reacciones y control de hilo/agente).
 */
const EVENTOS_IGNORADOS = [
  "delivery",
  "read",
  "reaction",
  "pass_thread_control",
  "take_thread_control",
  "request_thread_control",
  "app_roles",
];

/**
 * GET /webhook/messenger
 * Verificación del Webhook por parte de Meta (hub.mode / hub.verify_token / hub.challenge)
 */
const verifyWebhook = (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const verifyToken = process.env.FB_VERIFY_TOKEN || process.env.VERIFY_TOKEN;

    if (mode === "subscribe" && Boolean(verifyToken) && token === verifyToken) {
      console.log("✅ [FB Webhook] Webhook de Messenger verificado exitosamente por Meta.");
      return res.status(200).type("text/plain").send(String(challenge ?? ""));
    }

    // Nunca se registran los tokens: el esperado es un secreto.
    console.error(
      `❌ [FB Webhook] Fallo de verificación${verifyToken ? "" : " (FB_VERIFY_TOKEN/VERIFY_TOKEN no configurado)"}.`,
    );
    return res.sendStatus(403);
  } catch (err) {
    console.error("❌ [FB Webhook] Error en verifyWebhook:", err);
    return res.sendStatus(500);
  }
};

/**
 * Detecta si el mensaje proviene de un anuncio pagado de Meta (m.me / Click to Messenger)
 */
function detectReferralData(rawReferral) {
  if (!rawReferral || typeof rawReferral !== "object") {
    return { origen: "directo", referral: null };
  }
  const source = (rawReferral.source || "").toUpperCase();
  const adId = rawReferral.ad_id || rawReferral.adId || null;
  const isAd =
    source === "ADS" ||
    Boolean(adId) ||
    (rawReferral.type === "OPEN_THREAD" && Boolean(rawReferral.ad_title));

  return {
    origen: isAd ? "anuncio" : "directo",
    referral: rawReferral,
  };
}

/**
 * Procesa un único elemento de entry[].messaging[] de Messenger
 */
async function procesarEventoMessaging(event, i, entry, processedMids, io) {
  const pageId = event.recipient?.id || entry.id || process.env.FB_PAGE_ID || null;
  const senderId = event.sender?.id;
  const recipientId = event.recipient?.id || entry.id || pageId;

  const message = event.message;
  const postback = event.postback;
  const hasMessage = !!message || !!postback;
  const isEcho = !!(message?.is_echo || event.is_echo);
  const mid = message?.mid || postback?.mid || event.mid || `fbmid_${Date.now()}_${i}`;
  const rawText =
    message?.text ||
    postback?.title ||
    message?.quick_reply?.payload ||
    postback?.payload ||
    "";
  const payload = message?.quick_reply?.payload || postback?.payload || null;
  const textPreview = rawText.length > 60 ? rawText.substring(0, 57) + "..." : rawText;

  const referralObj = message?.referral || postback?.referral || event.referral;
  const { origen, referral } = detectReferralData(referralObj);

  const tipoEventoIgnorado = EVENTOS_IGNORADOS.find((k) => event[k] !== undefined);

  let accion = "procesar";
  if (!senderId) {
    accion = "skip_sin_sender";
  } else if (tipoEventoIgnorado) {
    accion = `skip_evento_no_mensaje (${tipoEventoIgnorado})`;
  } else if (!hasMessage) {
    accion = "skip_sin_message";
  } else if (processedMids.has(mid)) {
    accion = "skip_duplicado_mid";
  } else if (isEcho) {
    accion = "procesar_echo"; // Se guarda para que el eco se refleje en la consola
  }

  console.log(
    `📡 [FB Webhook] event#${i} page=${pageId || "N/A"} sender=${senderId || "N/A"} recip=${recipientId || "N/A"} origen=${origen} is_echo=${isEcho} has_message=${hasMessage} mid=${mid} text="${textPreview}"${payload ? ` payload="${payload}"` : ""} accion=${accion}`,
  );

  if (accion !== "procesar" && accion !== "procesar_echo") {
    return;
  }

  processedMids.add(mid);

  let text = rawText;
  let mediaUrl = null;
  let mediaType = null;
  if (Array.isArray(message?.attachments) && message.attachments.length > 0) {
    const att = message.attachments[0];
    mediaType = att.type || "file";
    mediaUrl = att.payload?.url || null;
    if (!text) {
      text =
        mediaType === "audio"
          ? "[Nota de voz]"
          : mediaType === "image"
            ? "[Foto]"
            : mediaType === "video"
              ? "[Video]"
              : "[Archivo multimedia]";
    }
  }

  if (accion === "procesar_echo") {
    // En los ecos el sender es la Página y el recipient es el cliente (PSID)
    await instagramFlowService.handleEcho(recipientId, text, mid, io, {
      canal: CANAL_MESSENGER,
    });
  } else {
    await instagramFlowService.handleIncomingMessage(
      senderId,
      recipientId,
      text,
      mid,
      io,
      { origen, referral, mediaUrl, mediaType, payload },
      { canal: CANAL_MESSENGER, payload, mediaUrl, mediaType },
    );
  }
}

/**
 * POST /webhook/messenger
 * Recepción asíncrona de eventos de mensajería de Facebook Messenger
 */
const handleWebhook = (req, res, io = null) => {
  // 1. Responder 200 INMEDIATAMENTE a Meta para evitar reintentos y timeouts
  res.status(200).send("EVENT_RECEIVED");

  const body = req.body;
  if (!body) return;

  const entries = Array.isArray(body.entry) ? body.entry : [];
  const entryKeys = entries
    .map((e) => Object.keys(e).filter((k) => k !== "id" && k !== "time"))
    .flat();
  const uniqueKeys = [...new Set(entryKeys)].join(", ");

  console.log(
    `📥 [FB Webhook] POST recibido. object="${body.object}" entries=${entries.length} keys=[${uniqueKeys}]`,
  );

  if (body.object !== "page") {
    console.warn(
      `⚠️ [FB Webhook] Objeto ignorado: "${body.object}" (este endpoint solo atiende "page" de Messenger)`,
    );
    return;
  }

  // 2. Procesar el payload de forma asíncrona (sin bloquear la respuesta a Meta)
  (async () => {
    try {
      const processedMids = new Set();

      if (entries.length === 0) {
        console.log("ℹ️ [FB Webhook] POST recibido sin entries.");
        return;
      }

      for (const entry of entries) {
        const messagingList = Array.isArray(entry.messaging) ? entry.messaging : [];
        const standbyList = Array.isArray(entry.standby) ? entry.standby : [];

        if (messagingList.length === 0 && standbyList.length === 0) {
          console.log(
            `ℹ️ [FB Webhook] Entry ${entry.id || "N/A"} no contiene 'messaging' ni 'standby'. Llaves: [${Object.keys(entry).join(", ")}]`,
          );
        }

        if (standbyList.length > 0) {
          console.log(
            `ℹ️ [FB Webhook] Entry ${entry.id || "N/A"} trae ${standbyList.length} evento(s) 'standby' (handover a agente). Se ignoran.`,
          );
        }

        for (let i = 0; i < messagingList.length; i++) {
          await procesarEventoMessaging(
            messagingList[i],
            i,
            entry,
            processedMids,
            io,
          );
        }
      }
    } catch (err) {
      console.error("❌ [FB Webhook] Error procesando evento en background:", err);
    }
  })();
};

module.exports = {
  verifyWebhook,
  handleWebhook,
};
