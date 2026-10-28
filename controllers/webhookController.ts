const chatFlowService = require("../services/chatFlowService");
const orderService = require("../services/orderService");
const { getConfig } = require("../services/configStore");

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// ============================================================================
// CACHÉ EN MEMORIA PARA DEDUPLICACIÓN DE MENSAJES (TTL: 10 minutos)
// ============================================================================
const processedMessageIds = new Map<string, number>();
const DEDUP_TTL_MS = 10 * 60 * 1000; // 10 minutos

/**
 * Verifica si un mensaje ya fue procesado recientemente para evitar duplicados por reintentos de Meta.
 */
function isDuplicateMessage(messageId: string): boolean {
  if (!messageId) return false;
  const now = Date.now();

  // Limpieza preventiva si el mapa crece
  if (processedMessageIds.size > 2000) {
    for (const [id, timestamp] of processedMessageIds.entries()) {
      if (now - timestamp > DEDUP_TTL_MS) {
        processedMessageIds.delete(id);
      }
    }
  }

  if (processedMessageIds.has(messageId)) {
    return true;
  }

  processedMessageIds.set(messageId, now);
  return false;
}

/**
 * Validador del token de suscripción de WhatsApp (Meta Challenge)
 */
const verifyWebhook = (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // Sin token configurado no se verifica nada; el challenge vuelve como texto plano (nunca HTML).
  if (mode === "subscribe" && Boolean(VERIFY_TOKEN) && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado correctamente.");
    res.status(200).type("text/plain").send(String(challenge ?? ""));
  } else {
    if (!VERIFY_TOKEN) console.error("❌ [Webhook] VERIFY_TOKEN no configurado: verificación rechazada.");
    res.sendStatus(403);
  }
};

/**
 * Receptor de eventos de WhatsApp.
 * Responde 200 OK de inmediato a Meta y procesa de forma asíncrona todos los entries, changes y messages.
 */
const handleWebhook = (req, res, io) => {
  const body = req.body;

  // 1. Responder inmediatamente para evitar reintentos de Meta por latencia
  res.status(200).send("EVENT_RECEIVED");

  // 2. Validación estructural básica
  if (!body || body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) {
    return;
  }

  // 3. Procesamiento asíncrono
  (async () => {
    try {
      for (const entry of body.entry) {
        const changes = Array.isArray(entry.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change.value;
          if (!value) continue;

          // 3.1. Procesar confirmaciones de estado de WhatsApp (sent, delivered, read, failed)
          if (Array.isArray(value.statuses) && value.statuses.length > 0) {
            for (const st of value.statuses) {
              const wamid = st.id;
              const status = st.status; // "sent" | "delivered" | "read" | "failed"
              const errors = st.errors || null;
              orderService.actualizarEstadoMensaje(wamid, status, errors, io).catch((err) => {
                console.error(`❌ Error procesando status webhook (${wamid}):`, err.message);
              });
            }
          }

          // 3.2. Procesar mensajes entrantes si existen
          if (!Array.isArray(value.messages) || value.messages.length === 0) {
            continue;
          }

          for (const message of value.messages) {
            const from = message.from;
            const tipo = message.type;
            const messageId = message.id;

            // --- FILTRO DE DEDUPLICACIÓN ---
            if (messageId && isDuplicateMessage(messageId)) {
              console.log(`⚠️ [WhatsApp Webhook] Mensaje duplicado ignorado (wamid: ${messageId})`);
              continue;
            }

            let text = null;
            let interactiveTitle = null;
            let mediaId = null;
            let mimeType = null;
            let location = null;
            let tipoNormalizado = tipo;
            let caption = null;
            let fileName = null;

            // Extracción de contenido según tipo
            if (tipo === "text") {
              text = message.text?.body || null;
            } else if (tipo === "interactive") {
              const interactive = message.interactive;
              if (interactive?.type === "button_reply") {
                text = interactive.button_reply.id;
                interactiveTitle = interactive.button_reply.title;
              } else if (interactive?.type === "list_reply") {
                text = interactive.list_reply.id;
                interactiveTitle = interactive.list_reply.title;
              } else if (interactive?.type === "nfm_reply") {
                text = interactive.nfm_reply?.response_json;
                interactiveTitle = "Respuesta de Formulario Flow";
              }
            } else if (tipo === "button") {
              // Respuesta rápida de plantilla de Meta (Quick Reply)
              text = message.button?.payload || message.button?.text || null;
              interactiveTitle = message.button?.text || message.button?.payload || null;
              tipoNormalizado = "interactive"; // Normalizado para compatibilidad con chatFlowService
            } else if (tipo === "audio" || tipo === "voice") {
              mediaId = message.audio?.id || message.voice?.id;
              mimeType = message.audio?.mime_type || message.voice?.mime_type || "audio/ogg";
            } else if (tipo === "image" || tipo === "document" || tipo === "video" || tipo === "sticker") {
              const mediaObj = message[tipo];
              mediaId = mediaObj?.id;
              mimeType = mediaObj?.mime_type;
              caption = mediaObj?.caption || null;
              fileName = mediaObj?.filename || null;
              if (!text && caption) {
                text = caption;
              }
            } else if (tipo === "location") {
              location = {
                latitude: message.location?.latitude,
                longitude: message.location?.longitude,
                name: message.location?.name,
                address: message.location?.address,
              };
            }

            const contactName = value.contacts?.[0]?.profile?.name || null;
            let ctwaClid = message.referral?.ctwa_clid || null;
            
            // Si viene referral (es un ad) pero no trae ctwa_clid (puede pasar según el origen), generamos uno para que el Dashboard lo cuente
            if (!ctwaClid && message.referral) {
               ctwaClid = message.referral.source_id ? `ad_${message.referral.source_id}` : `ad_ref_${Date.now()}`;
            }
            // Puente Cross-App: Detectar tag IGAD en el texto
            if (!ctwaClid && text) {
               const igadMatch = text.match(/\[IGAD-([a-zA-Z0-9_-]+)\]/i);
               if (igadMatch) {
                 ctwaClid = `igad_${igadMatch[1]}`;
               }
            }

            const replyToMid = message.context?.id || null;

            if (ctwaClid) {
              console.log(`🎯 [CTWA] Click-to-WhatsApp detectado para ${from}: ctwa_clid=${ctwaClid}`);
            }

            // --- INTERCEPCIÓN DE CÓDIGOS DE VERIFICACIÓN DE META ---
            // Se evalúa únicamente el cuerpo del texto para evitar falsos positivos con CTWA Ads o URLs
            const textToEvaluate = (text || "").trim();
            const isVerificationCode = 
              /(?:código de verificación|verification code|tu código de|security code|v_code)\b.*?\b\d{4,8}\b/i.test(textToEvaluate) ||
              from === "12485302707";

            if (isVerificationCode) {
              const messageString = JSON.stringify(message);
              console.log(`🚨 [INTERCEPCIÓN META] Código de verificación recibido de ${from}. Texto: "${textToEvaluate}"`);

              const codeMatch = textToEvaluate.match(/\b(\d{4,8})\b/g) || messageString.match(/\b(\d{4,8})\b/g);
              const possibleCodes = codeMatch ? codeMatch.join(", ") : "No detectado";

              const adminPhone = getConfig("ADMIN_PHONE_NUMBER");
              if (adminPhone) {
                const whatsappAPI = require("../services/whatsapp");
                whatsappAPI
                  .notificarAdminConFallback(
                    adminPhone,
                    `🔐 *Código Interceptado*\nDe: ${from}\nPosibles códigos: *${possibleCodes}*\n(Revisa el panel de control)`
                  )
                  .catch((e) => console.error("Error reenviando código al admin:", e));
              }

              // Guardar con dirección "cliente" para que se muestre correctamente en el panel
              const rawText = text || `[Mensaje de Meta estructurado] - JSON: ${messageString}`;
              orderService
                .emitirYGuardar(
                  from,
                  rawText,
                  "cliente", // Corregido: "cliente" para que sea visible como mensaje entrante
                  io,
                  "texto",
                  null,
                  messageId,
                  "received"
                )
                .catch((e) => console.error("Error guardando mensaje interceptado:", e));

              continue; // No pasarlo al bot conversacional
            }

            console.log(
              `📩 [WhatsApp Webhook] Mensaje recibido de ${from} (${tipoNormalizado}): "${(interactiveTitle || text || tipo).substring(0, 40)}" [wamid: ${messageId}]`
            );

            // --- DELEGACIÓN AL SERVICIO DE FLUJO CONVERSACIONAL ---
            chatFlowService
              .handleIncomingMessage(
                from,
                tipoNormalizado,
                text,
                interactiveTitle,
                mediaId,
                io,
                null,
                location,
                mimeType,
                messageId,
                { contactName, ctwaClid, replyToMid, caption, fileName }
              )
              .catch((error) => {
                console.error(`❌ [Critical] Error procesando mensaje de ${from}:`, error.message, error.stack);
              });
          }
        }
      }
    } catch (err) {
      console.error("❌ [WhatsApp Webhook] Error no controlado en procesamiento background:", err);
    }
  })();
};

module.exports = { verifyWebhook, handleWebhook };
