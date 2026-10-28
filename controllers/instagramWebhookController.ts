/**
 * controllers/instagramWebhookController.js
 * Controlador para la verificación y recepción de eventos de Instagram Direct (Meta)
 */

const instagramFlowService = require("../services/instagramFlowService");

/**
 * GET /webhook/instagram
 * Verificación del Webhook por parte de Meta
 */
const verifyWebhook = (req, res) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    const verifyToken = process.env.IG_VERIFY_TOKEN || process.env.VERIFY_TOKEN;

    if (mode === "subscribe" && Boolean(verifyToken) && token === verifyToken) {
      console.log("✅ [IG Webhook] Webhook verificado exitosamente por Meta.");
      return res.status(200).type("text/plain").send(String(challenge ?? ""));
    } else {
      // Nunca se registran los tokens: el esperado es un secreto.
      console.error(
        `❌ [IG Webhook] Fallo de verificación${verifyToken ? "" : " (IG_VERIFY_TOKEN/VERIFY_TOKEN no configurado)"}.`,
      );
      return res.sendStatus(403);
    }
  } catch (err) {
    console.error("❌ [IG Webhook] Error en verifyWebhook:", err);
    return res.sendStatus(500);
  }
};

/**
 * Detecta si el mensaje proviene de un anuncio pagado de Meta/Instagram
 */
function detectReferralData(rawReferral) {
  if (!rawReferral || typeof rawReferral !== "object") {
    return { origen: "directo", referral: null };
  }
  const source = (rawReferral.source || "").toUpperCase();
  const adId = rawReferral.ad_id || rawReferral.adId || null;
  const isAd = source === "ADS" || Boolean(adId) || (rawReferral.type === "OPEN_THREAD" && Boolean(rawReferral.ad_title));

  return {
    origen: isAd ? "anuncio" : "directo",
    referral: rawReferral,
  };
}

/**
 * POST /webhook/instagram
 * Recepción asíncrona de eventos de mensajería de Instagram
 * Soporta formato clásico (entry[].messaging[]) y formato Instagram Login (entry[].changes[].value)
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
    `📥 [IG Webhook] POST recibido. object="${body.object}" entries=${entries.length} keys=[${uniqueKeys}]`,
  );

  if (body.object !== "instagram" && body.object !== "page") {
    console.warn(`⚠️ [IG Webhook] Objeto ignorado: "${body.object}"`);
    return;
  }

  // 2. Procesar el payload de forma asíncrona
  (async () => {
    try {
      const processedMids = new Set();

      if (entries.length === 0) {
        console.log("ℹ️ [IG Webhook] POST recibido sin entries.");
        return;
      }

      await Promise.all(
        entries.map(async (entry) => {
          const hasMessaging = Array.isArray(entry.messaging) && entry.messaging.length > 0;
          const hasChanges = Array.isArray(entry.changes) && entry.changes.length > 0;

          if (!hasMessaging && !hasChanges) {
            console.log(
              `ℹ️ [IG Webhook] Entry ${entry.id || "N/A"} no contiene 'messaging' ni 'changes'. Llaves: [${Object.keys(entry).join(", ")}]`,
            );
          }

          // --- FORMATO 1: Clásico (entry[].messaging[]) ---
          const messagingList = Array.isArray(entry.messaging) ? entry.messaging : [];
          const messagingPromises = messagingList.map(async (event, i) => {
            const senderId = event.sender?.id || event.from?.id;
            const recipientId = event.recipient?.id || event.to?.id;
            const message = event.message;
            const postback = event.postback;
            const hasMessage = !!message || !!postback;
            const isEcho = !!(message?.is_echo || event?.is_echo);
            const mid = message?.mid || postback?.mid || event?.mid || `igmid_${Date.now()}_${i}`;
            const rawText = message?.text || postback?.title || message?.quick_reply?.payload || postback?.payload || "";
            const payload = message?.quick_reply?.payload || postback?.payload || null;
            const textPreview =
              rawText.length > 60 ? rawText.substring(0, 57) + "..." : rawText;

            const referralObj = message?.referral || postback?.referral || event.referral;
            const { origen, referral } = detectReferralData(referralObj);

            let accion = "procesar";
            if (!senderId) {
              accion = "skip_sin_sender";
            } else if (!hasMessage) {
              accion = "skip_sin_message (read/delivery/reaction)";
            } else if (processedMids.has(mid)) {
              accion = "skip_duplicado_mid";
            } else if (isEcho) {
              accion = "procesar_echo"; // Ya no se hace skip, lo guardamos para el panel
            }

            console.log(
              `📡 [IG Webhook] event#${i} sender=${senderId || "N/A"} recip=${recipientId || "N/A"} origen=${origen} is_echo=${isEcho} has_message=${hasMessage} mid=${mid} text="${textPreview}"${payload ? ` payload="${payload}"` : ""} accion=${accion}`,
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
                text = mediaType === "audio" ? "[Nota de voz]" : (mediaType === "image" ? "[Foto]" : "[Archivo multimedia]");
              }
            }

            if (accion === "procesar_echo") {
              // El senderId aquí es la página, y recipientId es el cliente.
              // Para mantener consistencia con IG, enviamos el userId del cliente (recipientId)
              await instagramFlowService.handleEcho(recipientId, text, mid, io);
            } else {
              await instagramFlowService.handleIncomingMessage(
                senderId,
                recipientId,
                text,
                mid,
                io,
                { origen, referral, mediaUrl, mediaType, payload },
              );
            }
          });

          // --- FORMATO 2: Instagram API con Instagram Login (entry[].changes[].value) ---
          const changesList = Array.isArray(entry.changes) ? entry.changes : [];
          const changesPromises = changesList.map(async (change, j) => {
            const field = change.field || "N/A";
            const val = change.value || {};

            const senderId = val.sender?.id || val.from?.id;
            const recipientId = val.recipient?.id || val.to?.id;
            const message = val.message || (val.text ? val : null);
            const postback = val.postback;
            const hasMessage = !!(val.message || val.text || val.postback);
            const isEcho = !!(message?.is_echo || val?.is_echo);
            const mid = message?.mid || postback?.mid || val?.mid || val?.id || `igmid_chg_${Date.now()}_${j}`;
            const rawText = message?.text || postback?.title || val?.text || message?.quick_reply?.payload || postback?.payload || "";
            const payload = message?.quick_reply?.payload || postback?.payload || null;
            const textPreview =
              rawText.length > 60 ? rawText.substring(0, 57) + "..." : rawText;

            const referralObj = val.message?.referral || postback?.referral || val.referral;
            const { origen, referral } = detectReferralData(referralObj);

            let accion = "procesar";
            if (field === "comments" || field === "feed" || field === "story_insights" || field === "mention") {
              accion = `skip_comentario_post (${field})`;
            } else if (field !== "messages" && !val.message && !val.text) {
              accion = `skip_field_no_mensajeria (${field})`;
            } else if (!senderId) {
              accion = "skip_sin_sender";
            } else if (!hasMessage) {
              accion = "skip_sin_message (read/delivery/reaction)";
            } else if (processedMids.has(mid)) {
              accion = "skip_duplicado_mid";
            } else if (isEcho) {
              accion = "procesar_echo";
            }

            console.log(
              `📡 [IG Webhook Chg] event#${j} sender=${senderId || "N/A"} recip=${recipientId || "N/A"} origen=${origen} is_echo=${isEcho} has_message=${hasMessage} mid=${mid} text="${textPreview}"${payload ? ` payload="${payload}"` : ""} accion=${accion}`,
            );

            if (accion !== "procesar" && accion !== "procesar_echo") {
              return;
            }

            processedMids.add(mid);

            let text = rawText;
            let mediaUrl = null;
            let mediaType = null;
            const attachments = message?.attachments || val.attachments;
            if (Array.isArray(attachments) && attachments.length > 0) {
              const att = attachments[0];
              mediaType = att.type || "file";
              mediaUrl = att.payload?.url || null;
              if (!text) {
                text = mediaType === "audio" ? "[Nota de voz]" : (mediaType === "image" ? "[Foto]" : "[Archivo multimedia]");
              }
            }

            if (accion === "procesar_echo") {
              await instagramFlowService.handleEcho(recipientId, text, mid, io);
            } else {
              await instagramFlowService.handleIncomingMessage(
                senderId,
                recipientId,
                text,
                mid,
                io,
                { origen, referral, mediaUrl, mediaType, payload },
              );
            }
          });

          await Promise.all([...messagingPromises, ...changesPromises]);
        }),
      );
    } catch (err) {
      console.error("❌ [IG Webhook] Error procesando evento en background:", err);
    }
  })();
};

module.exports = {
  verifyWebhook,
  handleWebhook,
};
