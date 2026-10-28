const axios = require("axios");
const { createBreaker } = require("./circuitBreaker");
const { getConfig } = require("./configStore");
const configManager = require("./configManager");

// Sanitización estricta de números según estándar de Meta (Solo dígitos)
const sanitizeNumber = (number) => {
  if (!number) return "";
  return number.toString().replace(/[^\d]/g, "");
};

const api = (phoneId = null) => {
  const client = axios.create({
    baseURL: `https://graph.facebook.com/v20.0/${phoneId || getConfig("WHATSAPP_PHONE_NUMBER_ID") || process.env.PHONE_NUMBER_ID}`,
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  
  // Envolver post con circuit breaker
  const _originalPost = client.post;
  client.post = async function(url, data, config) {
    // Endpoints administrativos no deben tumbar el circuit breaker por errores 4xx (validación)
    if (url.includes("/whatsapp_business_profile") || url.includes("/uploads")) {
      return await _originalPost.call(client, url, data, config);
    }
    try {
      return await getWhatsappBreaker().fire(() => _originalPost.call(client, url, data, config));
    } catch (error) {
      throw error; // Re-lanzar para que withRetry lo maneje
    }
  };
  
  return client;
};

// Función auxiliar para reintentos
async function withRetry(fn, context, maxRetries = 2) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await fn();
      console.log(`✅ [${context}] Enviado correctamente (intento ${attempt})`);
      return { success: true, result };
    } catch (error) {
      lastError = error;
      const errorDetail = error.response?.data?.error?.message || error.message;
      const errorData = error.response?.data ? JSON.stringify(error.response.data) : "";
      console.error(
        `❌ [${context}] Falla en intento ${attempt}: ${errorDetail} ${errorData}`,
      );
      if (attempt <= maxRetries) {
        const delay = 1000 * attempt; // 1s, 2s
        console.log(`⏳ Reintentando en ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error(`❌ [${context}] Falló después de ${maxRetries + 1} intentos`);
  return { success: false, error: lastError };
}

function isValidWamid(id) {
  if (!id || typeof id !== "string") return false;
  // Debe ser un wamid válido de Meta y NUNCA un ObjectId de Mongo ni ID temporal
  if (/^[0-9a-fA-F]{24}$/.test(id)) return false; // ObjectId Mongo de 24 hex
  if (id.startsWith("temp-") || id.startsWith("msg-")) return false;
  return id.startsWith("wamid.") || id.length >= 15;
}

async function enviarTexto(to, text, phoneId = null, replyToMid = null) {
  const cleanTo = sanitizeNumber(to);
  const validMid = isValidWamid(replyToMid) ? replyToMid : null;
  if (process.env.NODE_ENV === "test") {
    console.log(`📡 [MOCK WHATSAPP] Texto a ${cleanTo} (Desde: ${phoneId || 'Default'})${validMid ? ` [Cita: ${validMid}]` : ''}: ${text?.substring(0, 50).replace(/\n/g, " ") || ""}`);
    return true;
  }

  const payload: Record<string, any> = {
    messaging_product: "whatsapp",
    to: cleanTo,
    type: "text",
    text: { body: text },
  };

  if (validMid) {
    payload.context = { message_id: validMid };
  }

  console.log(`[DEBUG WhatsApp] Enviando texto a ${cleanTo}:`, JSON.stringify(payload));

  const result = await withRetry(
    () => api(phoneId).post("/messages", payload),
    `texto a ${cleanTo}`,
  );
  if (result.success) {
    return result.result?.data?.messages?.[0]?.id || true;
  }
  return false;
}

async function enviarBotones(to, text, buttons, phoneId = null) {
  const cleanTo = sanitizeNumber(to);
  if (process.env.NODE_ENV === "test") {
    console.log(`📡 [MOCK WHATSAPP] Botones a ${cleanTo} (Desde: ${phoneId || 'Default'}): ${text?.substring(0, 50).replace(/\n/g, " ") || ""}`);
    return true;
  }
  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: text },
      action: {
        buttons: buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title.substring(0, 20) },
        })),
      },
    },
  };
  const result = await withRetry(
    () => api(phoneId).post("/messages", payload),
    `botones a ${cleanTo}`,
  );
  if (result.success) {
    return result.result?.data?.messages?.[0]?.id || true;
  }
  return false;
}

async function enviarLista(to, text, buttonText, sections, headerText = null, footerText = null, phoneId = null) {
  const cleanTo = sanitizeNumber(to);
  if (process.env.NODE_ENV === "test") {
    console.log(`📡 [MOCK WHATSAPP] Lista a ${cleanTo} (Desde: ${phoneId || 'Default'}): ${text?.substring(0, 50).replace(/\n/g, " ") || ""}`);
    return true;
  }

  // 1. Sanitizar el texto del botón (Límite estricto de 20 caracteres)
  const sanitizedButtonText = (buttonText || "Ver Opciones").substring(0, 20);

  // 2. Sanitizar las secciones y filas (Máximo 10 filas totales)
  let totalRows = 0;
  const sanitizedSections = (sections || []).map(section => {
    const rows = (section.rows || [])
      .filter(() => totalRows < 10)
      .map(row => {
        totalRows++;
        const r: Record<string, any> = {
          id: row.id || `row-${totalRows}`,
          title: (row.title || "Opción").substring(0, 24)
        };
        if (row.description && row.description.trim().length > 0) {
          r.description = row.description.substring(0, 72);
        }
        return r;
      });
    
    return {
      title: section.title ? section.title.substring(0, 24) : "Opciones",
      rows
    };
  }).filter(s => s.rows.length > 0);

  if (sanitizedSections.length === 0) {
    console.error("⚠️ Intentando enviar una lista sin filas. Abortando.");
    return false;
  }

  const interactive: Record<string, any> = {
    type: "list",
    body: { text: (text || "Selecciona una opción:").substring(0, 1024) },
    action: {
      button: sanitizedButtonText,
      sections: sanitizedSections
    }
  };

  if (headerText) {
    interactive.header = { type: "text", text: headerText.substring(0, 60) };
  }
  if (footerText) {
    interactive.footer = { text: footerText.substring(0, 60) };
  }

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "interactive",
    interactive
  };

  const result = await withRetry(
    () => api(phoneId).post("/messages", payload),
    `lista a ${cleanTo}`,
  );
  if (result.success) {
    return result.result?.data?.messages?.[0]?.id || true;
  }
  return false;
}

async function enviarImagenPorMediaId(to, mediaId, phoneId = null) {
  const cleanTo = sanitizeNumber(to);
  if (process.env.NODE_ENV === "test") {
    console.log(`📡 [MOCK WHATSAPP] Imagen a ${cleanTo} (Desde: ${phoneId || 'Default'}): ${mediaId}`);
    return true;
  }
  const result = await withRetry(
    () =>
      api(phoneId).post("/messages", {
        messaging_product: "whatsapp",
        to: cleanTo,
        type: "image",
        image: { id: mediaId },
      }),
    `imagen a ${cleanTo}`,
  );
  if (result.success) {
    return result.result?.data?.messages?.[0]?.id || true;
  }
  return false;
}

async function descargarMedia(mediaId) {
  try {
    // 1. Obtener URL de descarga
    const response = await axios.get(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    });
    const downloadUrl = response.data.url;

    // 2. Descargar el buffer
    const mediaResponse = await axios.get(downloadUrl, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    });
    
    return Buffer.from(mediaResponse.data);
  } catch (error) {
    console.error(`❌ Error descargando media ${mediaId}:`, error.message);
    return null;
  }
}

async function enviarImagenPorUrl(to, url, caption = "", phoneId = null, replyToMid = null) {
  const cleanTo = sanitizeNumber(to);
  const validMid = isValidWamid(replyToMid) ? replyToMid : null;
  if (process.env.NODE_ENV === "test") {
    console.log(`📡 [MOCK WHATSAPP] Imagen (URL) a ${cleanTo} (Desde: ${phoneId || 'Default'})${validMid ? ` [Cita: ${validMid}]` : ''}: ${url}`);
    return true;
  }
  
  const imageObj: Record<string, any> = { link: url };
  if (caption && typeof caption === "string" && caption.trim().length > 0) {
    imageObj.caption = caption.trim();
  }

  const payload: Record<string, any> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "image",
    image: imageObj,
  };
  if (validMid) {
    payload.context = { message_id: validMid };
  }
  const result = await withRetry(
    () => api(phoneId).post("/messages", payload),
    `imagen (URL) a ${cleanTo}`,
  );
  if (result.success) {
    return result.result?.data?.messages?.[0]?.id || true;
  }
  return false;
}

async function enviarDocumentoPorUrl(to, url, filename = "", caption = "", phoneId = null, replyToMid = null) {
  const cleanTo = sanitizeNumber(to);
  const validMid = isValidWamid(replyToMid) ? replyToMid : null;
  if (process.env.NODE_ENV === "test") {
    console.log(`📡 [MOCK WHATSAPP] Documento (URL) a ${cleanTo} (Desde: ${phoneId || 'Default'})${validMid ? ` [Cita: ${validMid}]` : ''}: ${url}`);
    return true;
  }

  const docObj: Record<string, any> = { link: url };
  if (filename && typeof filename === "string" && filename.trim().length > 0) {
    docObj.filename = filename.trim();
  }
  if (caption && typeof caption === "string" && caption.trim().length > 0) {
    docObj.caption = caption.trim();
  }

  const payload: Record<string, any> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "document",
    document: docObj,
  };
  if (validMid) {
    payload.context = { message_id: validMid };
  }
  const result = await withRetry(
    () => api(phoneId).post("/messages", payload),
    `documento (URL) a ${cleanTo}`,
  );
  if (result.success) {
    return result.result?.data?.messages?.[0]?.id || true;
  }
  return false;
}

async function enviarAudioPorUrl(to, url, phoneId = null, replyToMid = null) {
  const cleanTo = sanitizeNumber(to);
  const validMid = isValidWamid(replyToMid) ? replyToMid : null;
  if (process.env.NODE_ENV === "test") {
    console.log(`📡 [MOCK WHATSAPP] Audio (URL) a ${cleanTo}: ${url}`);
    return true;
  }
  const payload: Record<string, any> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "audio",
    audio: { link: url },
  };
  if (validMid) {
    payload.context = { message_id: validMid };
  }
  const result = await withRetry(
    () => api(phoneId).post("/messages", payload),
    `audio (URL) a ${cleanTo}`,
  );
  if (result.success) {
    return result.result?.data?.messages?.[0]?.id || true;
  }
  return false;
}

async function enviarVideoPorUrl(to, url, caption = "", phoneId = null, replyToMid = null) {
  const cleanTo = sanitizeNumber(to);
  const validMid = isValidWamid(replyToMid) ? replyToMid : null;
  if (process.env.NODE_ENV === "test") {
    console.log(`📡 [MOCK WHATSAPP] Video (URL) a ${cleanTo}: ${url}`);
    return true;
  }
  const videoObj: Record<string, any> = { link: url };
  if (caption && typeof caption === "string" && caption.trim().length > 0) {
    videoObj.caption = caption.trim();
  }
  const payload: Record<string, any> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "video",
    video: videoObj,
  };
  if (validMid) {
    payload.context = { message_id: validMid };
  }
  const result = await withRetry(
    () => api(phoneId).post("/messages", payload),
    `video (URL) a ${cleanTo}`,
  );
  if (result.success) {
    return result.result?.data?.messages?.[0]?.id || true;
  }
  return false;
}

async function enviarUbicacion(to, latitude, longitude, name = "", address = "", phoneId = null, replyToMid = null) {
  const cleanTo = sanitizeNumber(to);
  const validMid = isValidWamid(replyToMid) ? replyToMid : null;
  if (process.env.NODE_ENV === "test") {
    console.log(`📡 [MOCK WHATSAPP] Ubicación a ${cleanTo}: lat=${latitude}, lng=${longitude}, name=${name}, address=${address}`);
    return true;
  }

  const locationObj: Record<string, any> = {
    latitude: String(latitude),
    longitude: String(longitude),
  };
  if (name && typeof name === "string" && name.trim().length > 0) {
    locationObj.name = name.trim();
  }
  if (address && typeof address === "string" && address.trim().length > 0) {
    locationObj.address = address.trim();
  }

  const payload: Record<string, any> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "location",
    location: locationObj,
  };

  if (validMid) {
    payload.context = { message_id: validMid };
  }

  const result = await withRetry(
    () => api(phoneId).post("/messages", payload),
    `ubicacion a ${cleanTo}`,
  );
  if (result.success) {
    return result.result?.data?.messages?.[0]?.id || true;
  }
  return false;
}

// ─── Circuit Breaker para WhatsApp ───
let _whatsappBreaker = null;
function getWhatsappBreaker() {
  if (!_whatsappBreaker) {
    _whatsappBreaker = createBreaker("whatsapp", async (fn) => {
      return await fn();
    }, { 
      timeout: 15000,
      errorFilter: (err) => {
        if (err.response && err.response.status >= 400 && err.response.status < 500) {
          return true; // Ignorar errores 4xx (ej. ventana 24h, validación) para no abrir el breaker
        }
        return false;
      },
    });
  }
  return _whatsappBreaker;
}

// ─── Plantillas de Mensaje (Message Templates) ───

/**
 * Envía un mensaje de plantilla pre-aprobada de WhatsApp.
 * Las plantillas NO requieren la ventana de 24h y permiten iniciar conversaciones.
 * 
 * @param {string} to - Número de teléfono del destinatario
 * @param {string} templateName - Nombre de la plantilla aprobada en Meta Business Manager
 * @param {string} languageCode - Código de idioma (default: "es")
 * @param {Array} bodyParams - Array de { type: "text", text: "valor" } para el cuerpo
 * @param {string} phoneId - ID del teléfono de WhatsApp (opcional)
 * @returns {Promise<boolean|string>}
 */
async function enviarPlantilla(to, templateName, languageCode = "es", bodyParams = [], phoneId = null) {
  const cleanTo = sanitizeNumber(to);
  if (process.env.NODE_ENV === "test") {
    console.log(`📡 [MOCK WHATSAPP] Plantilla "${templateName}" a ${cleanTo}`);
    return true;
  }

  const components = [];
  if (bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParams,
    });
  }

  const payload: Record<string, any> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanTo,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    },
  };

  // Solo agregar components si hay parámetros
  if (components.length > 0) {
    (payload.template as any).components = components;
  }

  console.log(`[DEBUG WhatsApp] Enviando plantilla "${templateName}" a ${cleanTo}`);

  const result = await withRetry(
    () => api(phoneId).post("/messages", payload),
    `plantilla "${templateName}" a ${cleanTo}`,
  );
  if (result.success) {
    return result.result?.data?.messages?.[0]?.id || true;
  }
  return false;
}

// ─── Reintento por plantilla cuando Meta marca "failed" un texto a admin (ventana 24h) ───
const ADMIN_PENDIENTES_TTL_MS = 10 * 60 * 1000;
const _adminPendientes = new Map<string, any>();

function registrarNotificacionAdminPendiente(wamid, ctx) {
  _adminPendientes.set(wamid, { ...ctx, ts: Date.now() });
  const ahora = Date.now();
  for (const [k, v] of _adminPendientes) {
    if (ahora - v.ts > ADMIN_PENDIENTES_TTL_MS) _adminPendientes.delete(k);
  }
}

/**
 * Llamado desde el webhook de estados. Si el wamid corresponde a una notificación
 * de admin que Meta marcó como fallida, la reenvía usando la plantilla.
 */
async function reintentarAdminFallidoPorPlantilla(wamid, errors = null) {
  const ctx = _adminPendientes.get(wamid);
  if (!ctx) return false;
  _adminPendientes.delete(wamid);

  const codigo = errors?.[0]?.code;
  console.warn(
    `⚠️ [WhatsApp] Texto a admin ${ctx.adminPhone} marcado como failed por Meta (código ${codigo ?? "?"}). Reenviando por plantilla...`,
  );
  const templateNameFinal =
    ctx.templateName || getConfig("WHATSAPP_TEMPLATE_ORDER") || "order_notification";
  const params =
    ctx.bodyParams?.length > 0
      ? ctx.bodyParams
      : [{ type: "text", text: ctx.mensajeLibre.substring(0, 200).replace(/\n/g, " ") }];
  const ok = await enviarPlantilla(ctx.adminPhone, templateNameFinal, "es", params);
  if (ok) {
    console.log(`✅ [WhatsApp] Plantilla "${templateNameFinal}" reenviada a admin ${ctx.adminPhone} tras fallo de ventana 24h`);
  } else {
    console.error(`❌ [WhatsApp] Falló también la plantilla de rescate para admin ${ctx.adminPhone}`);
  }
  return !!ok;
}

/**
 * Notifica al administrador con estrategia de fallback:
 * 1. Intenta enviar texto libre (más rico en formato)
 * 2. Si falla (típicamente ventana de 24h cerrada), usa plantilla
 *
 * @param {string} adminPhone - Número del admin
 * @param {string} mensajeLibre - Texto completo con formato para cuando hay ventana abierta
 * @param {string} templateName - Nombre de la plantilla de fallback
 * @param {Array} bodyParams - Parámetros de la plantilla
 * @returns {Promise<boolean>}
 */
async function notificarAdminConFallback(adminPhone, mensajeLibre, templateName, bodyParams = []) {
  if (!adminPhone) {
    console.warn("⚠️ [WhatsApp] notificarAdminConFallback: No se proporcionó teléfono de admin.");
    return false;
  }

  // 1. Intentar texto libre primero (más informativo, con formato)
  const textoEnviado = await enviarTexto(adminPhone, mensajeLibre);
  if (textoEnviado) {
    console.log(`✅ [WhatsApp] Notificación de texto libre enviada a admin ${adminPhone}`);
    // Meta acepta el POST (200) aunque la ventana de 24h esté cerrada y marca el fallo
    // después vía webhook de estado: guardamos el contexto para reenviar por plantilla.
    if (typeof textoEnviado === "string") {
      registrarNotificacionAdminPendiente(textoEnviado, {
        adminPhone,
        mensajeLibre,
        templateName,
        bodyParams,
      });
    }
    return true;
  }

  // 2. Fallback: usar plantilla (siempre funciona, no depende de ventana 24h)
  console.log(`⚠️ [WhatsApp] Texto libre falló para ${adminPhone}, intentando plantilla "${templateName}"...`);
  
  const templateNameFinal = templateName || getConfig("WHATSAPP_TEMPLATE_ORDER") || "order_notification";
  const params = bodyParams.length > 0 ? bodyParams : [
    { type: "text", text: mensajeLibre.substring(0, 200).replace(/\n/g, " ") }
  ];

  const plantillaEnviada = await enviarPlantilla(adminPhone, templateNameFinal, "es", params);
  if (plantillaEnviada) {
    console.log(`✅ [WhatsApp] Plantilla "${templateNameFinal}" enviada a admin ${adminPhone}`);
    return true;
  }

  console.error(`❌ [WhatsApp] Falló tanto texto libre como plantilla para admin ${adminPhone}`);
  return false;
}

/**
 * Consulta el perfil público actual de WhatsApp Business
 * @param {string} phoneId - ID del número de teléfono (opcional)
 */
async function getWhatsAppBusinessProfile(phoneId = null) {
  if (process.env.NODE_ENV === "test") {
    const brandName = configManager.get("settings.brandName") || "Mr. Pachi";
    const isPachi = brandName === "Mr. Pachi";
    const businessDesc = configManager.get("settings.businessDescription") || (isPachi ? "Comida asiática congelada" : "");
    const contactEmail = configManager.get("settings.contact.email") || (isPachi ? "contacto@mrpachi.com" : "");
    const website = configManager.get("settings.contact.website") || (isPachi ? "https://mrpachi.com" : "");
    const instagram = configManager.get("settings.contact.instagram") || (isPachi ? "https://instagram.com/mr_pachi_ve" : "");
    const websites = [];
    if (website) websites.push(website);
    if (instagram) websites.push(instagram);

    return {
      about: businessDesc ? `${brandName} - ${businessDesc}`.substring(0, 139) : brandName,
      address: "Caracas, Venezuela",
      description: isPachi
        ? "Deliciosos dumplings, wantanes y comida asiática congelada listos para preparar en casa."
        : (businessDesc || brandName),
      email: contactEmail,
      profile_picture_url: "https://res.cloudinary.com/test-cloud/image/upload/v12345/wa_profile.jpg",
      websites,
      vertical: isPachi ? "RESTAURANT" : "OTHER",
    };
  }

  try {
    const res = await api(phoneId).get(
      "/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical",
    );
    return res.data?.data?.[0] || res.data || {};
  } catch (err) {
    const errorDetails = err.response?.data?.error || err.message;
    console.error("❌ [WhatsApp] Error consultando perfil de WhatsApp Business:", JSON.stringify(errorDetails));
    throw new Error(
      err.response?.data?.error?.message || "Error al consultar perfil de WhatsApp Business",
    );
  }
}

/**
 * Actualiza los campos de texto del perfil de WhatsApp Business
 * @param {object} profileData - Campos a actualizar ({ about, address, description, email, websites, vertical })
 * @param {string} phoneId - ID del número de teléfono (opcional)
 */
async function updateWhatsAppBusinessProfile(profileData, phoneId = null) {
  if (process.env.NODE_ENV === "test") {
    console.log("📡 [MOCK WHATSAPP] Perfil de WhatsApp Business actualizado:", profileData);
    return { success: true };
  }

  try {
    const payload = {
      messaging_product: "whatsapp",
      ...profileData,
    };

    const res = await api(phoneId).post("/whatsapp_business_profile", payload);
    console.log("✅ [WhatsApp] Perfil de WhatsApp Business actualizado exitosamente.");
    return res.data;
  } catch (err) {
    const errorDetails = err.response?.data?.error || err.message;
    console.error("❌ [WhatsApp] Error actualizando perfil de WhatsApp Business:", JSON.stringify(errorDetails));
    throw new Error(
      err.response?.data?.error?.message || "Error al actualizar perfil de WhatsApp Business",
    );
  }
}

/**
 * Actualiza la foto de perfil de WhatsApp Business usando el flujo de Resumable Upload de Meta
 * @param {Buffer} fileBuffer - Buffer binario de la imagen
 * @param {string} mimetype - Tipo MIME de la imagen (ej: "image/jpeg", "image/png")
 * @param {string} phoneId - ID del número de teléfono (opcional)
 */
async function updateWhatsAppBusinessProfilePicture(fileBuffer, mimetype, phoneId = null) {
  if (process.env.NODE_ENV === "test") {
    console.log("📡 [MOCK WHATSAPP] Foto de perfil de WhatsApp Business actualizada.");
    return {
      success: true,
      profile_picture_url: "https://res.cloudinary.com/test-cloud/image/upload/v12345/new_wa_profile.jpg",
    };
  }

  const appId = process.env.META_APP_ID || process.env.APP_ID;
  const token = process.env.WHATSAPP_TOKEN;
  const phone = phoneId || getConfig("WHATSAPP_PHONE_NUMBER_ID") || process.env.PHONE_NUMBER_ID;

  if (!appId) {
    throw new Error(
      "Variable META_APP_ID no configurada en las variables de entorno (.env). Requerida para subir fotos de perfil a Meta.",
    );
  }

  try {
    // Paso 1: Crear sesión de subida en Graph API
    const sessionRes = await axios.post(
      `https://graph.facebook.com/v20.0/${appId}/uploads?file_length=${fileBuffer.length}&file_type=${encodeURIComponent(mimetype)}&access_token=${token}`,
      {},
      { timeout: 15000 },
    );

    const uploadSessionId = sessionRes.data?.id;
    if (!uploadSessionId) {
      throw new Error("No se pudo iniciar la sesión de subida de imagen en Meta");
    }

    // Paso 2: Subir el binario de la imagen
    const uploadRes = await axios.post(
      `https://graph.facebook.com/v20.0/${uploadSessionId}`,
      fileBuffer,
      {
        headers: {
          Authorization: `OAuth ${token}`,
          file_offset: 0,
          "Content-Type": "application/octet-stream",
        },
        timeout: 30000,
      },
    );

    const handle = uploadRes.data?.h;
    if (!handle) {
      throw new Error("No se recibió el handle de imagen de Meta Resumable Upload");
    }

    // Paso 3: Asociar el handle de la imagen al perfil de WhatsApp Business
    const profileRes = await axios.post(
      `https://graph.facebook.com/v20.0/${phone}/whatsapp_business_profile`,
      {
        messaging_product: "whatsapp",
        profile_picture_handle: handle,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      },
    );

    console.log("✅ [WhatsApp] Foto de perfil de WhatsApp Business actualizada exitosamente.");
    return profileRes.data;
  } catch (err) {
    const errorDetails = err.response?.data?.error || err.message;
    console.error("❌ [WhatsApp] Error actualizando foto de perfil de WhatsApp Business:", JSON.stringify(errorDetails));
    throw new Error(
      err.response?.data?.error?.message || "Error al actualizar foto de perfil en WhatsApp Business",
    );
  }
}

module.exports = {
  enviarTexto,
  enviarBotones,
  enviarLista,
  enviarImagenPorMediaId,
  descargarMedia,
  enviarImagenPorUrl,
  enviarDocumentoPorUrl,
  enviarAudioPorUrl,
  enviarVideoPorUrl,
  enviarUbicacion,
  enviarPlantilla,
  notificarAdminConFallback,
  reintentarAdminFallidoPorPlantilla,
  getWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfile,
  updateWhatsAppBusinessProfilePicture,
};
