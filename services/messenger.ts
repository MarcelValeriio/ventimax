/**
 * services/messenger.ts
 * Cliente HTTP para Meta Graph API (Facebook Messenger Platform)
 * Utiliza axios para todas las peticiones (sin fetch nativo)
 *
 * Nota de arquitectura: la llamada saliente de Messenger es idéntica en forma
 * a la de Instagram (`POST /{version}/{PAGE_ID}/messages` con Bearer token);
 * lo único que cambia es el token (Page Access Token) y el id de cuenta.
 * Por eso este cliente es un clon deliberado de services/instagram.ts y NO
 * comparte código con él, para no arriesgar el canal de Instagram.
 */

const axios = require("axios");

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_HOST = "https://graph.facebook.com";

/**
 * Token y nodo saliente del canal.
 * FB_PAGE_ACCESS_TOKEN debe ser un token de System User (larga duración) o un
 * Page Access Token extendido; los tokens generados a mano en el dashboard
 * caducan en ~1 hora.
 */
function getPageToken() {
  return process.env.FB_PAGE_ACCESS_TOKEN || null;
}

function getApiBase() {
  return `${GRAPH_API_HOST}/${GRAPH_API_VERSION}`;
}

function getTargetNode(pageId) {
  return pageId || process.env.FB_PAGE_ID || "me";
}

/**
 * Traduce los errores de la Graph API a mensajes accionables.
 * Se lanza un Error únicamente cuando el envío falla; el llamador (flujo) ya
 * maneja el fallo de forma resiliente y sin abrir circuit breakers 4xx.
 */
function buildSendError(err, contexto) {
  const errorDetails = err.response?.data?.error || err.message;
  const code = err.response?.data?.error?.code;
  const subcode = err.response?.data?.error?.error_subcode;

  console.error(`❌ [FB] Error ${contexto}:`, JSON.stringify(errorDetails));

  let mensaje = err.response?.data?.error?.message || "Error al enviar mensaje a Facebook Messenger";
  if (code === 190) {
    mensaje = "Token de Facebook Messenger inválido o mal configurado (código 190). Revisa FB_PAGE_ACCESS_TOKEN.";
  } else if (code === 3) {
    mensaje = "La app de Meta no tiene capacidad de enviar mensajes (código 3). Pon la app en modo Live y configura Messenger / Advanced Access de pages_messaging.";
  } else if (code === 10 && subcode === 2018278) {
    mensaje = "Fuera de la ventana de 24 horas de Messenger (código 10/2018278). Solo se puede responder dentro de las 24h posteriores al último mensaje del usuario o con message tags aprobados.";
  } else if (code === 100 && subcode === 2018001) {
    mensaje = "Destinatario no encontrado en Messenger (código 100/2018001). Verifica que la página esté suscrita a la app y el PSID sea válido.";
  } else if (code === 551) {
    mensaje = "El destinatario no está disponible en Messenger (código 551). El usuario puede haber bloqueado la página o no ser contactable por la API.";
  } else if (code === 613) {
    mensaje = "Límite de llamadas de Messenger alcanzado (código 613). Reintenta más tarde.";
  }

  const outErr: any = new Error(mensaje);
  outErr.statusCode = (code === 10 && subcode === 2018278) ? 409 : 502;
  outErr.codigoProveedor = subcode || code;
  outErr.proveedor = "meta";
  outErr.canal = "messenger";
  return outErr;
}

/**
 * Envía un mensaje de texto plano a un usuario de Facebook Messenger
 * @param {string} pageId - ID de la página de Facebook del negocio (recipient.id del webhook)
 * @param {string} userId - PSID del usuario (sender.id del webhook)
 * @param {string} text - Texto del mensaje a enviar
 */
async function enviarTextoMessenger(pageId, userId, text) {
  const targetNode = getTargetNode(pageId);
  const token = getPageToken();

  if (process.env.NODE_ENV === "test" || !token) {
    console.log(
      `📡 [MOCK FB] Mensaje a ${userId} (Desde Página: ${targetNode}): ${text?.substring(0, 80).replace(/\n/g, " ") || ""}`,
    );
    return {
      recipient_id: userId,
      message_id: `mock_fbmessenger_mid_${Date.now()}`,
    };
  }

  try {
    const url = `${getApiBase()}/${targetNode}/messages`;
    const payload = {
      recipient: { id: userId },
      messaging_type: "RESPONSE",
      message: { text },
    };

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log(`✅ [FB] Mensaje enviado a ${userId} (MID: ${res.data?.message_id})`);
    return res.data;
  } catch (err) {
    throw buildSendError(err, `enviando mensaje a ${userId}`);
  }
}

/**
 * Envía una imagen por URL a un usuario de Facebook Messenger
 * @param {string} pageId - ID de la página de Facebook del negocio
 * @param {string} userId - PSID del usuario
 * @param {string} imageUrl - URL pública permanente de la imagen (Cloudinary)
 */
async function enviarImagenMessenger(pageId, userId, imageUrl) {
  const targetNode = getTargetNode(pageId);
  const token = getPageToken();

  if (process.env.NODE_ENV === "test" || !token) {
    console.log(
      `📡 [MOCK FB] Imagen enviada a ${userId} (Desde Página: ${targetNode}): ${imageUrl}`,
    );
    return {
      recipient_id: userId,
      message_id: `mock_fbmessenger_img_${Date.now()}`,
    };
  }

  try {
    const url = `${getApiBase()}/${targetNode}/messages`;
    const payload = {
      recipient: { id: userId },
      messaging_type: "RESPONSE",
      message: {
        attachment: {
          type: "image",
          payload: {
            url: imageUrl,
            is_reusable: true,
          },
        },
      },
    };

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    });

    console.log(`✅ [FB] Imagen enviada a ${userId} (MID: ${res.data?.message_id})`);
    return res.data;
  } catch (err) {
    throw buildSendError(err, `enviando imagen a ${userId}`);
  }
}

/**
 * Envía un mensaje con botones interactivos (Quick Replies) a Facebook Messenger
 * @param {string} pageId - ID de la página de Facebook del negocio
 * @param {string} userId - PSID del usuario
 * @param {string} text - Texto que acompaña a las opciones
 * @param {Array<{content_type: string, title: string, payload: string}>} quickReplies - Lista de botones (máx 13, título máx 20 caracteres)
 */
async function enviarQuickRepliesMessenger(pageId, userId, text, quickReplies = []) {
  const targetNode = getTargetNode(pageId);
  const token = getPageToken();

  // Sanitizar y validar límite de 20 caracteres en los títulos (límite de Meta)
  const formattedReplies = quickReplies.map((qr) => ({
    content_type: qr.content_type || "text",
    title: String(qr.title || "").substring(0, 20),
    payload: qr.payload || qr.title || "QUICK_REPLY",
  }));

  if (process.env.NODE_ENV === "test" || !token) {
    const titles = formattedReplies.map((r) => `[${r.title}]`).join(" ");
    console.log(
      `📡 [MOCK FB] Quick Replies a ${userId} (Desde Página: ${targetNode}): "${text?.substring(0, 60) || ""}" Opciones: ${titles}`,
    );
    return {
      recipient_id: userId,
      message_id: `mock_fbmessenger_qr_${Date.now()}`,
    };
  }

  try {
    const url = `${getApiBase()}/${targetNode}/messages`;
    const payload = {
      recipient: { id: userId },
      messaging_type: "RESPONSE",
      message: {
        text,
        quick_replies: formattedReplies,
      },
    };

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log(`✅ [FB] Quick Replies enviados a ${userId} (MID: ${res.data?.message_id})`);
    return res.data;
  } catch (err) {
    throw buildSendError(err, `enviando Quick Replies a ${userId}`);
  }
}

/**
 * Consulta el perfil público del usuario de Messenger (first_name, last_name, profile_pic).
 * Devuelve la MISMA forma que instagram.getUserIgProfile para que el flujo
 * conversacional pueda consumirlo sin ramas adicionales.
 * @param {string} userId - PSID del usuario
 */
async function getUserMessengerProfile(userId) {
  const token = getPageToken();

  if (process.env.NODE_ENV === "test" || !token) {
    const sufijo = String(userId || "").slice(-4);
    return {
      id: userId,
      username: null,
      name: `Messenger ${sufijo}`,
      profilePic: null,
    };
  }

  let rawData = null;
  for (const fields of ["first_name,last_name,profile_pic", "first_name,last_name", "first_name"]) {
    try {
      const url = `${getApiBase()}/${userId}?fields=${fields}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      });
      if (res.data && (res.data.first_name || res.data.last_name || res.data.profile_pic)) {
        rawData = res.data;
        break;
      }
    } catch (err) {
      // Campos restringidos por permisos: continuar con la siguiente combinación
      continue;
    }
  }

  if (!rawData) {
    console.warn(`⚠️ [FB] No se pudo obtener el perfil de Messenger para ${userId}`);
    return { id: userId, username: null, name: null, profilePic: null };
  }

  const fullName = [rawData.first_name, rawData.last_name].filter(Boolean).join(" ").trim();

  return {
    id: userId,
    username: null,
    name: fullName || null,
    profilePic: rawData.profile_pic || null,
  };
}

module.exports = {
  enviarTextoMessenger,
  enviarImagenMessenger,
  enviarQuickRepliesMessenger,
  getUserMessengerProfile,
  GRAPH_API_VERSION,
};
