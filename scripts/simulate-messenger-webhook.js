/**
 * scripts/simulate-messenger-webhook.js
 *
 * Pruebas del canal Facebook Messenger (backend) — SIN tocar WhatsApp ni Instagram:
 *  1. Verificación GET del webhook (/webhook/messenger) con hub.challenge y token inválido.
 *  2. Recepción POST (object: "page") con respuesta inmediata 200 "EVENT_RECEIVED".
 *  3. Flujo conversacional en el canal Messenger: paso 'inicio' -> 'en_faq'.
 *  4. Respuesta a FAQ, intención de compra (derivación a WhatsApp), quick_reply y postback.
 *  5. Adjuntos (imagen), ecos (is_echo), deduplicación por mid.
 *  6. Eventos no-mensaje (delivery/read/standby) y objetos ajenos ("instagram") ignorados.
 *  7. Aislamiento de canal: conversaciones y eventos de socket separados por canal.
 *  8. Regresión de Instagram: el mismo flujo sigue respondiendo y persistiendo como Instagram.
 *  9. Cliente HTTP de Messenger: URL, token, payload y mapeo de errores (axios interceptado, sin red).
 * 10. Firma HMAC de Meta con FB_APP_SECRET (acepta firma válida, rechaza inválida).
 */

process.env.NODE_ENV = "test";
process.env.FB_VERIFY_TOKEN = "test_fb_verify_token_12345";
process.env.VERIFY_TOKEN = "test_fb_verify_token_12345";
process.env.FB_APP_SECRET = "test_fb_secret_12345";
process.env.WEBHOOK_DEBOUNCE_MS = "0";
delete process.env.FB_PAGE_ACCESS_TOKEN; // Fuerza el modo mock del cliente saliente

const crypto = require("crypto");
const express = require("express");
const http = require("http");
const axios = require("axios");
const dbLocal = require("../services/dbLocal");
const instagramFlowService = require("../services/instagramFlowService");
const messenger = require("../services/messenger");
const messengerWebhookRoutes = require("../routes/messengerWebhookRoutes");
const instagramWebhookRoutes = require("../routes/instagramWebhookRoutes");

const PSID = "fb_psid_sim_001";
const PSID_ECHO = "fb_psid_echo_001";
const PSID_ATTACH = "fb_psid_attach_001";
const IGSID = "ig_user_sim_messenger_regression";
const PAGE_ID = "page_1001";

async function runSimulation() {
  console.log("==========================================================");
  console.log("🧪 TEST Y SIMULACIÓN: CANAL FACEBOOK MESSENGER (BACKEND)");
  console.log("==========================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`   ✅ ${message}`);
      passed++;
    } else {
      console.error(`   ❌ FALLÓ: ${message}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------- Semillas
  const data = dbLocal.read();
  data.etiquetasIg = {};
  data.mensajesIg = [];
  data.faqs = [
    {
      _id: "faq_sabores",
      pregunta: "Sabores y rellenos disponibles",
      keywords: ["sabores", "rellenos", "dumplings"],
      respuesta: "🥟 Dumplings de Cerdo y Cebollín, Pollo y Vegetarianos.",
      type: "dinamica",
      dynamicKey: "sabores",
      activo: true,
      order: 1,
      brand: "default",
    },
    {
      _id: "faq_pagos",
      pregunta: "¿Cuáles son los métodos de pago?",
      keywords: ["pagos", "pago", "zelle", "efectivo"],
      respuesta: "Aceptamos Pago Móvil, Zelle, Efectivo USD y Transferencia.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 2,
      brand: "default",
    },
  ];
  data.productos = [
    { id: "prod_cerdo", nombre: "Dumplings de Cerdo", activo: true, stock: 10 },
    { id: "prod_pollo", nombre: "Dumplings de Pollo", activo: true, stock: 15 },
  ];
  dbLocal.write(data);

  // ------------------------------------------------------------- Servidor
  const app = express();
  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf.toString();
      },
    }),
  );
  const server = http.createServer(app);

  // Espía de eventos de socket para verificar el aislamiento por canal
  let eventos = [];
  const mockIo = {
    emit: (event, payload) => {
      eventos.push({ event, payload });
    },
  };

  app.use("/webhook/messenger", messengerWebhookRoutes(mockIo));
  app.use("/webhook/instagram", instagramWebhookRoutes(mockIo));

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  const msgsDe = (usuarioId) =>
    dbLocal.read().mensajesIg.filter((m) => m.usuarioIgId === usuarioId);

  try {
    // -------------------------------------------------------------------
    // 1. Verificación GET
    // -------------------------------------------------------------------
    console.log("👉 1. Verificación GET del webhook de Messenger...");
    const verifyRes = await axios.get(`${baseUrl}/webhook/messenger`, {
      params: {
        "hub.mode": "subscribe",
        "hub.verify_token": "test_fb_verify_token_12345",
        "hub.challenge": "fb_challenge_555",
      },
    });
    assert(
      verifyRes.status === 200 && String(verifyRes.data) === "fb_challenge_555",
      "GET /webhook/messenger responde 200 y devuelve exactamente hub.challenge",
    );

    try {
      await axios.get(`${baseUrl}/webhook/messenger`, {
        params: {
          "hub.mode": "subscribe",
          "hub.verify_token": "token_incorrecto",
          "hub.challenge": "1",
        },
      });
      assert(false, "Token inválido debe ser rechazado con 403");
    } catch (err) {
      assert(err.response?.status === 403, "Token inválido rechazado con 403");
    }

    // -------------------------------------------------------------------
    // 2. Primer mensaje entrante (paso 'inicio') en el canal Messenger
    // -------------------------------------------------------------------
    console.log("\n👉 2. Primer mensaje entrante (object: 'page') y creación de contacto...");
    eventos = [];
    const resInicio = await axios.post(`${baseUrl}/webhook/messenger`, {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          time: Date.now(),
          messaging: [
            {
              sender: { id: PSID },
              recipient: { id: PAGE_ID },
              timestamp: Date.now(),
              message: { mid: "fbmid_test_001", text: "¡Hola! Buenas tardes" },
            },
          ],
        },
      ],
    });
    assert(
      resInicio.status === 200 && resInicio.data === "EVENT_RECEIVED",
      "POST responde 200 'EVENT_RECEIVED' inmediatamente a Meta",
    );

    await esperar(200);

    const etiquetaMsg = dbLocal.read().etiquetasIg[PSID];
    assert(etiquetaMsg !== undefined, "Se crea el contacto (EtiquetaIg) para el PSID de Messenger");
    assert(
      etiquetaMsg && etiquetaMsg.canal === "messenger",
      "El contacto queda marcado con canal: 'messenger'",
    );
    assert(
      etiquetaMsg && etiquetaMsg.paso === "en_faq",
      "El usuario avanza de 'inicio' a 'en_faq' en el canal Messenger",
    );

    const msgsInicio = msgsDe(PSID);
    assert(msgsInicio.length === 2, "Se registran 2 mensajes (cliente + bot) en Messenger");
    assert(
      msgsInicio.every((m) => m.canal === "messenger"),
      "Todos los mensajes de la conversación quedan con canal: 'messenger'",
    );
    assert(
      msgsInicio[1].texto.includes("Bienvenido a Mr. Pachi"),
      "El bot responde con el saludo institucional compartido del flujo",
    );
    assert(
      msgsInicio[1].texto.includes("¡Hola, Messenger"),
      "Se personaliza el saludo usando el perfil de Messenger (first_name vía API/mock)",
    );
    assert(
      msgsInicio[1].mid.startsWith("fbmid_"),
      `El mensaje saliente del bot usa prefijo de mid de Messenger (${msgsInicio[1].mid})`,
    );

    const evMsg = eventos.filter((e) => e.event === "mensaje_messenger");
    const evIg = eventos.filter((e) => e.event === "mensaje_ig");
    assert(evMsg.length >= 1, "Se emiten eventos socket 'mensaje_messenger' (canal propio)");
    assert(
      evMsg.every((e) => e.payload.canal === "messenger"),
      "Los eventos de Messenger llevan canal: 'messenger' en el payload",
    );
    assert(
      evIg.length === 0,
      "Los eventos de Messenger NO se publican como 'mensaje_ig' (la consola de Instagram no se contamina)",
    );
    assert(
      eventos.some((e) => e.event === "messenger_actualizado"),
      "Se emite 'messenger_actualizado' para refrescar la lista del canal",
    );

    // -------------------------------------------------------------------
    // 3. FAQ en paso 'en_faq'
    // -------------------------------------------------------------------
    console.log("\n👉 3. Respuesta a FAQ en el canal Messenger...");
    await axios.post(`${baseUrl}/webhook/messenger`, {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          messaging: [
            {
              sender: { id: PSID },
              recipient: { id: PAGE_ID },
              timestamp: Date.now(),
              message: { mid: "fbmid_test_002", text: "¿Cuáles son los métodos de pago?" },
            },
          ],
        },
      ],
    });
    await esperar(200);

    const msgsFaq = msgsDe(PSID);
    assert(msgsFaq.length === 4, "Se registran 4 mensajes totales tras la FAQ");
    assert(
      msgsFaq[3].texto.includes("Pago Móvil") || msgsFaq[3].texto.includes("Zelle"),
      "El bot responde el contenido de la FAQ solicitada",
    );

    // -------------------------------------------------------------------
    // 4. Intención de compra -> derivación a WhatsApp
    // -------------------------------------------------------------------
    console.log("\n👉 4. Intención de compra (derivación a WhatsApp)...");
    await axios.post(`${baseUrl}/webhook/messenger`, {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          messaging: [
            {
              sender: { id: PSID },
              recipient: { id: PAGE_ID },
              timestamp: Date.now(),
              message: { mid: "fbmid_test_003", text: "Quiero hacer un pedido de 2 cajas" },
            },
          ],
        },
      ],
    });
    await esperar(200);

    assert(
      dbLocal.read().etiquetasIg[PSID].paso === "derivado",
      "El paso cambia a 'derivado' ante intención de compra",
    );
    const msgsCompra = msgsDe(PSID);
    assert(
      msgsCompra[msgsCompra.length - 1].texto.includes("https://wa.me/"),
      "El bot entrega el enlace oficial de WhatsApp (misma máquina de estados que Instagram)",
    );

    // -------------------------------------------------------------------
    // 5. Quick Reply y Postback de Messenger
    // -------------------------------------------------------------------
    console.log("\n👉 5. Quick Reply y Postback de Messenger...");
    await axios.post(`${baseUrl}/webhook/messenger`, {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          messaging: [
            {
              sender: { id: PSID },
              recipient: { id: PAGE_ID },
              timestamp: Date.now(),
              message: {
                mid: "fbmid_test_004",
                text: "📲 Hacer pedido",
                quick_reply: { payload: "IG_ACTION_ORDER" },
              },
            },
          ],
        },
      ],
    });
    await esperar(200);
    const msgsQr = msgsDe(PSID);
    assert(
      msgsQr[msgsQr.length - 1].texto.includes("https://wa.me/"),
      "El payload de quick_reply de Messenger es interpretado por el flujo (acción de pedido)",
    );

    await axios.post(`${baseUrl}/webhook/messenger`, {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          messaging: [
            {
              sender: { id: PSID },
              recipient: { id: PAGE_ID },
              timestamp: Date.now(),
              postback: { mid: "fbmid_test_005", title: "❓ Dudas frecuentes", payload: "IG_ACTION_FAQ" },
            },
          ],
        },
      ],
    });
    await esperar(200);
    const msgsPostback = msgsDe(PSID);
    const ultimoPostback = msgsPostback[msgsPostback.length - 1].texto;
    assert(
      ultimoPostback.includes("Preguntas Frecuentes"),
      "El postback de Messenger dispara la acción correspondiente del flujo",
    );
    assert(
      dbLocal.read().etiquetasIg[PSID].paso === "en_faq",
      "El postback también actualiza el paso del contacto",
    );

    // -------------------------------------------------------------------
    // 6. Adjuntos (imagen)
    // -------------------------------------------------------------------
    console.log("\n👉 6. Mensaje con adjunto (imagen)...");
    await axios.post(`${baseUrl}/webhook/messenger`, {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          messaging: [
            {
              sender: { id: PSID_ATTACH },
              recipient: { id: PAGE_ID },
              timestamp: Date.now(),
              message: {
                mid: "fbmid_attach_001",
                attachments: [
                  { type: "image", payload: { url: "https://example.com/foto.jpg" } },
                ],
              },
            },
          ],
        },
      ],
    });
    await esperar(200);
    const msgsAttach = msgsDe(PSID_ATTACH);
    assert(
      msgsAttach.length >= 1 && msgsAttach[0].tipo === "image",
      "El adjunto se persiste con tipo 'image'",
    );
    assert(
      msgsAttach[0].texto === "[Foto]",
      "Se aplica el mismo placeholder de media que en Instagram ('[Foto]')",
    );
    assert(
      msgsAttach[0].canal === "messenger",
      "El adjunto queda marcado con canal 'messenger'",
    );

    // -------------------------------------------------------------------
    // 7. Ecos (is_echo) y deduplicación por mid
    // -------------------------------------------------------------------
    console.log("\n👉 7. Ecos (is_echo) y deduplicación...");
    const payloadEcho = {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          messaging: [
            {
              sender: { id: PAGE_ID },
              recipient: { id: PSID_ECHO },
              timestamp: Date.now(),
              message: {
                mid: "fbmid_echo_001",
                text: "Respuesta escrita por un agente en la Página",
                is_echo: true,
              },
            },
          ],
        },
      ],
    };
    await axios.post(`${baseUrl}/webhook/messenger`, payloadEcho);
    await esperar(200);
    const msgsEcho1 = msgsDe(PSID_ECHO);
    assert(msgsEcho1.length === 1, "El eco del negocio se registra una sola vez en Messenger");
    assert(
      msgsEcho1[0].direccion === "bot" && msgsEcho1[0].canal === "messenger",
      "El eco se guarda como mensaje saliente del canal Messenger",
    );

    await axios.post(`${baseUrl}/webhook/messenger`, payloadEcho);
    await esperar(200);
    assert(
      msgsDe(PSID_ECHO).length === 1,
      "Reenviar el mismo eco (mismo mid) no duplica el mensaje",
    );

    // -------------------------------------------------------------------
    // 8. Eventos no-mensaje, standby y objetos ajenos
    // -------------------------------------------------------------------
    console.log("\n👉 8. Eventos no-mensaje, standby y objetos ajenos...");
    const totalPsidAntesDeEventos = msgsDe(PSID).length;
    const resDelivery = await axios.post(`${baseUrl}/webhook/messenger`, {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          messaging: [
            { sender: { id: PSID }, recipient: { id: PAGE_ID }, delivery: { mids: ["fbmid_test_001"] } },
            { sender: { id: PSID }, recipient: { id: PAGE_ID }, read: { watermark: Date.now() } },
          ],
        },
      ],
    });
    await esperar(200);
    assert(
      resDelivery.status === 200 && resDelivery.data === "EVENT_RECEIVED",
      "Eventos de delivery/read se aceptan con 200 'EVENT_RECEIVED'",
    );
    assert(
      msgsDe(PSID).length === totalPsidAntesDeEventos,
      `Los eventos de delivery/read NO generan mensajes (total: ${msgsDe(PSID).length})`,
    );

    await axios.post(`${baseUrl}/webhook/messenger`, {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          standby: [
            {
              sender: { id: "fb_psid_standby_001" },
              recipient: { id: PAGE_ID },
              message: { mid: "fbmid_standby_001", text: "hola desde standby" },
            },
          ],
        },
      ],
    });
    await esperar(200);
    assert(
      msgsDe("fb_psid_standby_001").length === 0,
      "Los eventos 'standby' (handover a humano) se ignoran y no crean mensajes",
    );

    await axios.post(`${baseUrl}/webhook/messenger`, {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          messaging: [
            {
              sender: { id: "ig_user_que_no_debe_entrar" },
              recipient: { id: "ig_page_1001" },
              message: { mid: "igmid_obj_ajeno", text: "no debe procesarse aquí" },
            },
          ],
        },
      ],
    });
    await esperar(200);
    assert(
      dbLocal.read().etiquetasIg["ig_user_que_no_debe_entrar"] === undefined,
      "Un payload de Instagram enviado al webhook de Messenger es ignorado (canales separados)",
    );

    // -------------------------------------------------------------------
    // 9. Regresión: Instagram sigue funcionando igual
    // -------------------------------------------------------------------
    console.log("\n👉 9. Regresión de Instagram (no romper el canal existente)...");
    eventos = [];
    await axios.post(`${baseUrl}/webhook/instagram`, {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          messaging: [
            {
              sender: { id: IGSID },
              recipient: { id: "ig_page_1001" },
              timestamp: Date.now(),
              message: { mid: "igmid_reg_001", text: "Hola desde Instagram" },
            },
          ],
        },
      ],
    });
    await esperar(200);

    const etiquetaIg = dbLocal.read().etiquetasIg[IGSID];
    assert(etiquetaIg !== undefined && etiquetaIg.paso === "en_faq", "Instagram sigue saludando y avanzando a 'en_faq'");
    assert(
      !etiquetaIg.canal || etiquetaIg.canal === "instagram",
      "El contacto de Instagram NO queda marcado como Messenger",
    );
    const msgsIg = msgsDe(IGSID);
    assert(msgsIg.length === 2, "Instagram sigue persistiendo 2 mensajes (cliente + bot)");
    assert(
      msgsIg[1].mid.startsWith("igmid_"),
      `Instagram conserva su prefijo de mid histórico (${msgsIg[1].mid})`,
    );
    const evIgReg = eventos.filter((e) => e.event === "mensaje_ig");
    assert(evIgReg.length >= 1, "Instagram sigue emitiendo 'mensaje_ig'");
    assert(
      evIgReg.every((e) => e.payload.canal === undefined),
      "El payload de socket de Instagram se mantiene EXACTAMENTE como antes (sin campo 'canal')",
    );
    assert(
      eventos.filter((e) => e.event === "mensaje_messenger").length === 0,
      "Una conversación de Instagram no publica eventos de Messenger",
    );
    assert(
      eventos.some((e) => e.event === "ig_actualizado"),
      "Instagram sigue emitiendo 'ig_actualizado'",
    );

    // Aislamiento entre canales con el mismo flujo
    const antesMsg = msgsDe(PSID).length;
    await axios.post(`${baseUrl}/webhook/instagram`, {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          messaging: [
            {
              sender: { id: IGSID },
              recipient: { id: "ig_page_1001" },
              message: { mid: "igmid_reg_002", text: "otra consulta de instagram" },
            },
          ],
        },
      ],
    });
    await esperar(200);
    assert(
      msgsDe(PSID).length === antesMsg,
      "La actividad de Instagram no altera la conversación de Messenger",
    );
    assert(
      msgsDe(IGSID).every((m) => !m.canal || m.canal === "instagram"),
      "Ningún mensaje de Instagram quedó marcado con canal 'messenger'",
    );

    // -------------------------------------------------------------------
    // 10. Cliente HTTP de Messenger (axios interceptado, sin red)
    // -------------------------------------------------------------------
    console.log("\n👉 10. Cliente HTTP de Messenger (URL, token, payload y errores)...");
    const nodeEnvOriginal = process.env.NODE_ENV;
    const axiosPostOriginal = axios.post;
    const axiosGetOriginal = axios.get;
    const llamadas = [];

    process.env.FB_PAGE_ACCESS_TOKEN = "EAAtestPageToken123";
    process.env.NODE_ENV = "production"; // desactiva el corto-circuito de mock del cliente

    try {
      axios.post = async (url, payload, config) => {
        llamadas.push({ metodo: "POST", url, payload, auth: config?.headers?.Authorization });
        return { data: { recipient_id: payload?.recipient?.id, message_id: "mid_real_sim" } };
      };
      axios.get = async (url, config) => {
        llamadas.push({ metodo: "GET", url, auth: config?.headers?.Authorization });
        return { data: { first_name: "Ana", last_name: "Perez", profile_pic: "https://example.com/p.jpg" } };
      };

      await messenger.enviarTextoMessenger(PAGE_ID, "PSID_HTTP_1", "Hola desde el test");
      const callTexto = llamadas[llamadas.length - 1];
      assert(
        callTexto.url === "https://graph.facebook.com/v21.0/page_1001/messages",
        `POST de texto apunta a la URL correcta de Messenger (${callTexto.url})`,
      );
      assert(
        callTexto.auth === "Bearer EAAtestPageToken123",
        "Usa el Page Access Token (FB_PAGE_ACCESS_TOKEN) en el header Authorization",
      );
      assert(
        callTexto.payload.recipient.id === "PSID_HTTP_1" &&
          callTexto.payload.message.text === "Hola desde el test" &&
          callTexto.payload.messaging_type === "RESPONSE",
        "El payload usa recipient.id + message.text + messaging_type RESPONSE",
      );

      await messenger.enviarQuickRepliesMessenger(PAGE_ID, "PSID_HTTP_2", "Elige", [
        { content_type: "text", title: "Un título larguísimo de más de 20 caracteres", payload: "IG_ACTION_ORDER" },
      ]);
      const callQr = llamadas[llamadas.length - 1];
      assert(
        callQr.url === "https://graph.facebook.com/v21.0/page_1001/messages" &&
          Array.isArray(callQr.payload.message.quick_replies),
        "El POST de Quick Replies usa el mismo endpoint /messages con quick_replies",
      );
      assert(
        callQr.payload.message.quick_replies[0].title.length === 20 &&
          callQr.payload.message.quick_replies[0].payload === "IG_ACTION_ORDER",
        "Los títulos se recortan a 20 caracteres (límite de Meta) y el payload se preserva",
      );

      const perfil = await messenger.getUserMessengerProfile("PSID_HTTP_3");
      const callPerfil = llamadas[llamadas.length - 1];
      assert(
        callPerfil.url === "https://graph.facebook.com/v21.0/PSID_HTTP_3?fields=first_name,last_name,profile_pic",
        `El perfil se consulta en graph.facebook.com con fields de Messenger (${callPerfil.url})`,
      );
      assert(
        perfil.name === "Ana Perez" && perfil.profilePic === "https://example.com/p.jpg",
        "El perfil se normaliza a { name, profilePic } igual que Instagram",
      );

      axios.post = async () => {
        const err = new Error("Request failed with status code 400");
        err.response = { data: { error: { code: 10, error_subcode: 2018278, message: "outside window" } } };
        throw err;
      };
      let errorMapeado = null;
      try {
        await messenger.enviarTextoMessenger(PAGE_ID, "PSID_HTTP_4", "fuera de ventana");
      } catch (e) {
        errorMapeado = e.message;
      }
      assert(
        typeof errorMapeado === "string" && errorMapeado.includes("24 horas"),
        `El error 10/2018278 (fuera de ventana de 24h) se traduce a un mensaje accionable: "${errorMapeado}"`,
      );
    } finally {
      axios.post = axiosPostOriginal;
      axios.get = axiosGetOriginal;
      delete process.env.FB_PAGE_ACCESS_TOKEN;
      process.env.NODE_ENV = nodeEnvOriginal;
    }

    const resMock = await messenger.enviarTextoMessenger(PAGE_ID, "PSID_HTTP_5", "sin token");
    assert(
      String(resMock.message_id).startsWith("mock_fbmessenger_mid_"),
      "Sin FB_PAGE_ACCESS_TOKEN el cliente degrada a mock (sin llamadas de red)",
    );

    // -------------------------------------------------------------------
    // 11. Firma HMAC de Meta (FB_APP_SECRET)
    // -------------------------------------------------------------------
    console.log("\n👉 11. Validación de firma HMAC con FB_APP_SECRET...");
    const payloadHmac = {
      object: "page",
      entry: [
        {
          id: PAGE_ID,
          messaging: [
            {
              sender: { id: "fb_psid_hmac_001" },
              recipient: { id: PAGE_ID },
              message: { mid: "fbmid_hmac_001", text: "Hola con firma válida" },
            },
          ],
        },
      ],
    };
    const cuerpo = JSON.stringify(payloadHmac);
    const firmaValida =
      "sha256=" + crypto.createHmac("sha256", process.env.FB_APP_SECRET).update(cuerpo, "utf8").digest("hex");

    process.env.NODE_ENV = "production";
    try {
      const resFirma = await axios.post(`${baseUrl}/webhook/messenger`, payloadHmac, {
        headers: { "X-Hub-Signature-256": firmaValida, "Content-Type": "application/json" },
      });
      await esperar(200);
      assert(resFirma.status === 200, "Con firma HMAC válida (FB_APP_SECRET) el webhook acepta el POST");
      assert(
        dbLocal.read().etiquetasIg["fb_psid_hmac_001"] !== undefined,
        "El mensaje firmado se procesa y crea el contacto",
      );

      const firmaInvalida = "sha256=" + crypto.createHmac("sha256", "otro_secreto").update(cuerpo, "utf8").digest("hex");
      try {
        await axios.post(`${baseUrl}/webhook/messenger`, payloadHmac, {
          headers: { "X-Hub-Signature-256": firmaInvalida, "Content-Type": "application/json" },
        });
        assert(false, "Una firma inválida debe ser rechazada con 403");
      } catch (err) {
        assert(
          err.response?.status === 403,
          "Con firma HMAC inválida el webhook responde 403 (rechazo de spoofing)",
        );
      }
    } finally {
      process.env.NODE_ENV = nodeEnvOriginal;
    }

    console.log("\n==========================================================");
    console.log(`📊 RESULTADOS: ${passed} pruebas superadas, ${failed} fallidas.`);
    console.log("==========================================================\n");

    server.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("💥 Error en simulación del Webhook de Messenger:", err);
    server.close();
    process.exit(1);
  }
}

runSimulation();
