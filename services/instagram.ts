/**
 * services/instagram.js
 * Cliente HTTP para Meta Graph API (Instagram Messaging)
 * Utiliza axios para todas las peticiones (sin fetch nativo)
 */

const axios = require("axios");
const cloudinaryService = require("./cloudinaryService");
const { getConfig } = require("./configStore");

const GRAPH_API_VERSION = "v21.0";

/**
 * Obtiene la URL base de la API según el tipo de token:
 * - Tokens que inician con 'IG' (Instagram Login / Basic Display) -> graph.instagram.com
 * - Tokens que inician con 'EAA' (Meta / Page tokens) -> graph.facebook.com
 */
function getApiBase(token) {
  if (token && token.startsWith("IG")) {
    return `https://graph.instagram.com/${GRAPH_API_VERSION}`;
  }
  return `https://graph.facebook.com/${GRAPH_API_VERSION}`;
}

/**
 * Envía un mensaje de texto plano a un usuario de Instagram Direct
 * @param {string} igAccountId - ID de la cuenta/página de Instagram del negocio
 * @param {string} userId - ID del usuario de Instagram (sender.id del webhook)
 * @param {string} text - Texto del mensaje a enviar
 */
async function enviarTextoIg(igAccountId, userId, text) {
  const accountId = igAccountId || getConfig("IG_ACCOUNT_ID");
  const token = process.env.IG_ACCESS_TOKEN;

  if (process.env.NODE_ENV === "test" || !token) {
    console.log(
      `📡 [MOCK IG] Mensaje a ${userId} (Desde IG: ${accountId || "Default"}): ${text?.substring(0, 80).replace(/\n/g, " ") || ""}`,
    );
    return {
      recipient_id: userId,
      message_id: `mock_mid_${Date.now()}`,
    };
  }

  try {
    const apiBase = getApiBase(token);
    const targetNode = accountId || "me";
    const url = `${apiBase}/${targetNode}/messages`;
    const payload = {
      recipient: { id: userId },
      message: { text },
    };

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log(`✅ [IG] Mensaje enviado a ${userId} (MID: ${res.data?.message_id})`);
    return res.data;
  } catch (err) {
    const errorDetails = err.response?.data?.error || err.message;
    const errorCode = err.response?.data?.error?.code;
    const errorSubcode = err.response?.data?.error?.error_subcode;
    console.error(`❌ [IG] Error enviando mensaje a ${userId}:`, JSON.stringify(errorDetails));

    if (errorCode === 190) {
      throw new Error(
        "Token de Instagram inválido o mal configurado (código 190). Revisa IG_ACCESS_TOKEN.",
      );
    }

    if (errorCode === 3) {
      throw new Error(
        "La app de Meta no tiene capacidad de enviar mensajes (código 3). Pon la app en modo Live y configura Instagram Messaging / Advanced Access de instagram_manage_messages.",
      );
    }

    if (errorCode === 100 && (errorSubcode === 2534014 || errorSubcode === 2534017)) {
      throw new Error(
        "Destinatario no encontrado o cuenta no configurada para mensajería en Instagram (código 100/2534014). Verifica que la cuenta @mr_pachi_ve esté conectada en la app de Meta.",
      );
    }

    throw new Error(
      err.response?.data?.error?.message || "Error al enviar mensaje a Instagram",
    );
  }
}

/**
 * Envía una imagen por URL a un usuario de Instagram Direct
 * @param {string} igAccountId - ID de la cuenta/página de Instagram del negocio
 * @param {string} userId - ID del usuario de Instagram (sender.id)
 * @param {string} imageUrl - URL pública permanente de la imagen (Cloudinary)
 */
async function enviarImagenIg(igAccountId, userId, imageUrl) {
  const accountId = igAccountId || getConfig("IG_ACCOUNT_ID");
  const token = process.env.IG_ACCESS_TOKEN;

  if (process.env.NODE_ENV === "test" || !token) {
    console.log(
      `📡 [MOCK IG] Imagen enviada a ${userId} (Desde IG: ${accountId || "Default"}): ${imageUrl}`,
    );
    return {
      recipient_id: userId,
      message_id: `mock_mid_img_${Date.now()}`,
    };
  }

  try {
    const apiBase = getApiBase(token);
    const targetNode = accountId || "me";
    const url = `${apiBase}/${targetNode}/messages`;
    const payload = {
      recipient: { id: userId },
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

    console.log(`✅ [IG] Imagen enviada a ${userId} (MID: ${res.data?.message_id})`);
    return res.data;
  } catch (err) {
    const errorDetails = err.response?.data?.error || err.message;
    console.error(`❌ [IG] Error enviando imagen a ${userId}:`, JSON.stringify(errorDetails));
    throw new Error(
      err.response?.data?.error?.message || "Error al enviar imagen a Instagram",
    );
  }
}

/**
 * Consulta el perfil público del usuario de Instagram (username, name, profile_pic)
 * @param {string} userId - ID de Instagram del usuario (IGSID)
 */
async function getUserIgProfile(userId) {
  const token = process.env.IG_ACCESS_TOKEN;
  if (process.env.NODE_ENV === "test" || !token) {
    return { id: userId, username: `usuario_${userId.slice(-4)}` };
  }

  const apiBase = getApiBase(token);

  // Lista de combinaciones de campos en orden de preferencia descendente
  const fieldCombinations = [
    "username,name,profile_pic",
    "username,profile_pic",
    "name,profile_pic",
    "username,name,profile_picture_url",
    "username,profile_picture_url",
    "username,name",
    "username",
    "name",
  ];

  let rawData = null;

  for (const fields of fieldCombinations) {
    try {
      const url = `${apiBase}/${userId}?fields=${fields}`;
      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      });
      if (res.data && (res.data.username || res.data.name || res.data.profile_pic || res.data.profile_picture_url)) {
        rawData = res.data;
        break;
      }
    } catch (err) {
      // Si falla por campos restringidos por la app o permisos, continuar con la siguiente combinación
      continue;
    }
  }

  if (!rawData) {
    console.warn(`⚠️ [IG] No se pudo obtener ningún campo de perfil de Meta para ${userId}`);
    return { id: userId, username: null, name: null, profilePic: null };
  }

  let profilePic =
    rawData.profile_pic ||
    rawData.profile_picture_url ||
    rawData.profile_pic_url ||
    null;

  // Si Meta retorna una URL de foto de perfil, persistirla en Cloudinary para evitar enlaces temporales rotos
  if (profilePic && typeof profilePic === "string") {
    try {
      const imgRes = await axios.get(profilePic, {
        responseType: "arraybuffer",
        timeout: 8000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (imgRes.data) {
        const buffer = Buffer.from(imgRes.data);
        const permanentUrl = await cloudinaryService.uploadFromBuffer(
          buffer,
          "ig_profiles",
        );
        if (permanentUrl) {
          profilePic = permanentUrl;
          console.log(`✅ [IG] Foto de perfil subida a Cloudinary para ${userId}: ${permanentUrl}`);
        }
      }
    } catch (imgErr) {
      console.warn(
        `⚠️ [IG] No se pudo subir foto de perfil a Cloudinary para ${userId} (${imgErr.message}). Manteniendo URL original.`,
      );
    }
  }

  return {
    id: userId,
    username: rawData.username || null,
    name: rawData.name || null,
    profilePic,
  };
}

/**
 * Envía un mensaje con botones interactivos (Quick Replies) a Instagram Direct
 * @param {string} igAccountId - ID de la cuenta/página de Instagram del negocio
 * @param {string} userId - ID del usuario de Instagram (sender.id)
 * @param {string} text - Texto que acompaña a las opciones
 * @param {Array<{content_type: string, title: string, payload: string}>} quickReplies - Lista de botones (máx 13, título máx 20 caracteres)
 */
async function enviarQuickRepliesIg(igAccountId, userId, text, quickReplies = []) {
  const accountId = igAccountId || getConfig("IG_ACCOUNT_ID");
  const token = process.env.IG_ACCESS_TOKEN;

  // Sanitizar y validar límite de 20 caracteres en los títulos
  const formattedReplies = quickReplies.map((qr) => ({
    content_type: qr.content_type || "text",
    title: String(qr.title || "").substring(0, 20),
    payload: qr.payload || qr.title || "QUICK_REPLY",
  }));

  if (process.env.NODE_ENV === "test" || !token) {
    const titles = formattedReplies.map((r) => `[${r.title}]`).join(" ");
    console.log(
      `📡 [MOCK IG] Quick Replies a ${userId} (Desde IG: ${accountId || "Default"}): "${text?.substring(0, 60) || ""}" Opciones: ${titles}`,
    );
    return {
      recipient_id: userId,
      message_id: `mock_mid_qr_${Date.now()}`,
    };
  }

  try {
    const apiBase = getApiBase(token);
    const targetNode = accountId || "me";
    const url = `${apiBase}/${targetNode}/messages`;
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

    console.log(`✅ [IG] Quick Replies enviados a ${userId} (MID: ${res.data?.message_id})`);
    return res.data;
  } catch (err) {
    const errorDetails = err.response?.data?.error || err.message;
    console.error(`❌ [IG] Error enviando Quick Replies a ${userId}:`, JSON.stringify(errorDetails));
    throw new Error(
      err.response?.data?.error?.message || "Error al enviar Quick Replies a Instagram",
    );
  }
}

module.exports = {
  enviarTextoIg,
  enviarImagenIg,
  enviarQuickRepliesIg,
  getUserIgProfile,
};
