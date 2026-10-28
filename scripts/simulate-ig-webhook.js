/**
 * scripts/simulate-ig-webhook.js
 * 
 * Simulación y prueba integral del Webhook y Flujo del Bot de Instagram:
 * 1. Verificación GET con hub.challenge y hub.verify_token.
 * 2. Recepción POST y respuesta inmediata 200 "EVENT_RECEIVED".
 * 3. Flujo en paso 'inicio': Saludo inicial + Menú de FAQs numeradas.
 * 4. Flujo en paso 'en_faq': Respuesta a preguntas frecuentes (estáticas y dinámicas).
 * 5. Intención de compra: Derivación a WhatsApp con enlace wa.me y paso 'derivado'.
 * 6. Historial administrativo: GET /api/admin/ig/historial y POST /api/admin/ig/enviar.
 */

process.env.NODE_ENV = "test";
process.env.IG_VERIFY_TOKEN = "test_ig_verify_token_12345";
process.env.VERIFY_TOKEN = "test_ig_verify_token_12345";
process.env.WHATSAPP_APP_SECRET = "test_secret_12345";

const express = require("express");
const http = require("http");
const axios = require("axios");
const dbLocal = require("../services/dbLocal");
const instagramFlowService = require("../services/instagramFlowService");
const instagramWebhookRoutes = require("../routes/instagramWebhookRoutes");
const adminController = require("../controllers/adminController");

async function runSimulation() {
  console.log("==========================================================");
  console.log("🧪 TEST Y SIMULACIÓN: WEBHOOK Y BOT DE INSTAGRAM DIRECT");
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

  // 1. Limpiar base de datos local para pruebas
  const data = dbLocal.read();
  data.etiquetasIg = {};
  data.mensajesIg = [];
  data.faqs = [
    {
      _id: "faq_sabores",
      pregunta: "Sabores y rellenos disponibles",
      keywords: ["sabores", "rellenos", "dumplings", "dumpling", "wantan"],
      respuesta: "🥟 Dumplings de Cerdo y Cebollín, Pollo y Vegetarianos.",
      type: "dinamica",
      dynamicKey: "sabores",
      activo: true,
      order: 1,
      brand: "default",
    },
    {
      _id: "faq_unidades",
      pregunta: "¿Cuántas unidades trae cada caja?",
      keywords: ["unidades", "cuantas", "caja", "peso", "pesan"],
      respuesta: "Cada cajita trae *25 unidades* selladas al vacío.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 2,
      brand: "default",
    },
    {
      _id: "faq_precios",
      pregunta: "¿Cuál es el precio por caja?",
      keywords: ["precio", "costo", "cuanto", "vale", "cajas"],
      respuesta: "Cada caja de 25 unidades cuesta $15 USD.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 3,
      brand: "default",
    },
    {
      _id: "faq_salsas",
      pregunta: "¿Tienen salsas o aderezos?",
      keywords: ["salsa", "salsas", "soya", "picante", "agridulce"],
      respuesta: "Incluimos salsa de soya especial con cada pedido.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 4,
      brand: "default",
    },
    {
      _id: "faq_coccion",
      pregunta: "¿Cómo se cocinan los dumplings?",
      keywords: ["cocinar", "preparar", "hervir", "vapor", "sarten"],
      respuesta: "Puedes cocinarlos al vapor (8 min) o a la plancha (potstickers).",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 5,
      brand: "default",
    },
    {
      _id: "faq_delivery",
      pregunta: "¿Hacen delivery y cuál es el costo?",
      keywords: ["delivery", "envio", "despacho", "costo", "caracas"],
      respuesta: "Contamos con delivery en Caracas con costo según la zona.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 6,
      brand: "default",
    },
    {
      _id: "faq_pagos",
      pregunta: "¿Cuáles son los métodos de pago?",
      keywords: ["pagos", "pago", "pago movil", "zelle", "efectivo"],
      respuesta: "Aceptamos Pago Móvil, Zelle, Efectivo USD y Transferencia.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 7,
      brand: "default",
    },
    {
      _id: "faq_ubicacion",
      pregunta: "¿Dónde están ubicados?",
      keywords: ["ubicacion", "tienda", "local", "retiro", "pickup"],
      respuesta: "Somos dark kitchen en Caracas con servicio de pickup y delivery.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 8,
      brand: "default",
    },
    {
      _id: "faq_vegetariano",
      pregunta: "¿Tienen opción vegetariana?",
      keywords: ["vegetariano", "vegano", "sin carne", "verduras"],
      respuesta: "Sí, tenemos dumplings rellenos de vegetales frescos y hongos.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 9,
      brand: "default",
    },
  ];
  data.productos = [
    {
      id: "prod_cerdo",
      nombre: "Dumplings de Cerdo",
      activo: true,
      stock: 10,
    },
    {
      id: "prod_pollo",
      nombre: "Dumplings de Pollo",
      activo: true,
      stock: 15,
    },
  ];
  dbLocal.write(data);

  // 2. Levantar servidor Express en puerto efímero de prueba
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);

  const mockIo = {
    emit: (event, payload) => {
      // Mock Socket.IO emit
    },
  };

  app.use("/webhook/instagram", instagramWebhookRoutes(mockIo));
  app.get("/api/admin/ig/historial", adminController.getInstagramHistorial);
  app.post("/api/admin/ig/enviar", (req, res) =>
    adminController.postInstagramEnviar(req, res, mockIo),
  );

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // -----------------------------------------------------------------------
    // CASO 1: Verificación GET Webhook (hub.challenge)
    // -----------------------------------------------------------------------
    console.log("👉 1. Validando verificación GET del Webhook de Meta...");
    const verifyRes = await axios.get(`${baseUrl}/webhook/instagram`, {
      params: {
        "hub.mode": "subscribe",
        "hub.verify_token": "test_ig_verify_token_12345",
        "hub.challenge": "challenge_token_987654",
      },
    });
    assert(
      verifyRes.status === 200 && String(verifyRes.data) === "challenge_token_987654",
      "Webhook GET responde 200 y devuelve exactamente hub.challenge",
    );

    try {
      await axios.get(`${baseUrl}/webhook/instagram`, {
        params: {
          "hub.mode": "subscribe",
          "hub.verify_token": "token_invalido",
          "hub.challenge": "123",
        },
      });
      assert(false, "Token inválido debe ser rechazado con 403");
    } catch (err) {
      assert(err.response?.status === 403, "Token inválido rechazado con 403");
    }

    // -----------------------------------------------------------------------
    // CASO 2: Recepción POST y primer mensaje ('inicio')
    // -----------------------------------------------------------------------
    console.log("\n👉 2. Validando primer mensaje entrante (Paso 'inicio')...");
    const testUserId = "ig_user_sim_001";
    const postPayload = {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          time: Date.now(),
          messaging: [
            {
              sender: { id: testUserId },
              recipient: { id: "ig_page_1001" },
              timestamp: Date.now(),
              message: {
                mid: "mid_test_001",
                text: "¡Hola! Buenas tardes",
              },
            },
          ],
        },
      ],
    };

    const postRes = await axios.post(`${baseUrl}/webhook/instagram`, postPayload);
    assert(postRes.status === 200, "POST responde status 200 inmediatamente a Meta");

    // Esperar procesamiento asíncrono
    await new Promise((r) => setTimeout(r, 150));

    const dbAfterInicio = dbLocal.read();
    const etiquetaUser = dbAfterInicio.etiquetasIg[testUserId];
    assert(etiquetaUser && etiquetaUser.paso === "en_faq", "Usuario avanza de 'inicio' a 'en_faq'");

    const mensajesUser = dbAfterInicio.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    assert(mensajesUser.length === 2, "Se registraron 2 mensajes (cliente + bot)");
    assert(
      mensajesUser[1].texto.includes("Bienvenido a Mr. Pachi"),
      "Bot responde con saludo institucional y opciones interactivas",
    );
    assert(
      mensajesUser[1].texto.includes("WhatsApp") || mensajesUser[1].texto.includes("opciones"),
      "Mensaje de bienvenida guía al usuario a opciones o WhatsApp oficial",
    );
    assert(
      mensajesUser[1].texto.length < 1000,
      `Longitud de texto (${mensajesUser[1].texto.length} chars) respeta límites de Meta/Instagram (<1000)`,
    );

    // -----------------------------------------------------------------------
    // CASO 3: Pregunta Frecuente (Paso 'en_faq')
    // -----------------------------------------------------------------------
    console.log("\n👉 3. Validando respuesta a FAQ en paso 'en_faq'...");
    const faqPayload = {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          time: Date.now(),
          messaging: [
            {
              sender: { id: testUserId },
              recipient: { id: "ig_page_1001" },
              timestamp: Date.now(),
              message: {
                mid: "mid_test_002",
                text: "¿Cuáles son los sabores de dumplings?",
              },
            },
          ],
        },
      ],
    };

    await axios.post(`${baseUrl}/webhook/instagram`, faqPayload);
    await new Promise((r) => setTimeout(r, 150));

    const dbAfterFaq = dbLocal.read();
    const mensajesFaq = dbAfterFaq.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    assert(mensajesFaq.length === 4, "Se registraron 4 mensajes totales");
    const lastFaqReply = mensajesFaq[3].texto;
    assert(
      lastFaqReply.includes("Dumplings de Cerdo") || lastFaqReply.includes("Sabores"),
      "Bot responde con la información de sabores en stock",
    );
    assert(
      dbAfterFaq.etiquetasIg[testUserId].paso === "en_faq",
      "Estado se mantiene en 'en_faq' tras responder la duda",
    );

    // -----------------------------------------------------------------------
    // CASO 4: Intención de Compra y Derivación a WhatsApp
    // -----------------------------------------------------------------------
    console.log("\n👉 4. Validando derivación a WhatsApp ante intención de compra...");
    const buyPayload = {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          time: Date.now(),
          messaging: [
            {
              sender: { id: testUserId },
              recipient: { id: "ig_page_1001" },
              timestamp: Date.now(),
              message: {
                mid: "mid_test_003",
                text: "Quiero hacer un pedido de 2 cajas por favor",
              },
            },
          ],
        },
      ],
    };

    await axios.post(`${baseUrl}/webhook/instagram`, buyPayload);
    await new Promise((r) => setTimeout(r, 150));

    const dbAfterBuy = dbLocal.read();
    const etiquetaDerivada = dbAfterBuy.etiquetasIg[testUserId];
    assert(
      etiquetaDerivada.paso === "derivado",
      "Paso cambia a 'derivado' ante intención de compra",
    );

    const mensajesBuy = dbAfterBuy.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    const lastBuyReply = mensajesBuy[mensajesBuy.length - 1].texto;
    assert(
      lastBuyReply.includes("https://wa.me/584123285446?text=pedir"),
      "Bot envía enlace wa.me con número oficial y comando precargado 'pedir'",
    );

    // -----------------------------------------------------------------------
    // CASO 4B: Formato Instagram Login (entry[].changes[].value) + Eco
    // -----------------------------------------------------------------------
    console.log("\n👉 4B. Validando formato Instagram Login (entry[].changes[].value)...");
    const testChangesUserId = "ig_user_changes_001";
    const changesPayload = {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          time: Date.now(),
          changes: [
            // Mensaje entrante real
            {
              field: "messages",
              value: {
                sender: { id: testChangesUserId },
                recipient: { id: "ig_page_1001" },
                message: {
                  mid: "mid_chg_001",
                  text: "Hola desde formato changes",
                  is_echo: false,
                },
                time: Date.now(),
              },
            },
            // Eco saliente del negocio (debe ignorarse)
            {
              field: "messages",
              value: {
                sender: { id: "ig_page_1001" },
                recipient: { id: testChangesUserId },
                message: {
                  mid: "mid_chg_echo",
                  text: "Respuesta del bot",
                  is_echo: true,
                },
                time: Date.now(),
              },
            },
          ],
        },
      ],
    };

    await axios.post(`${baseUrl}/webhook/instagram`, changesPayload);
    await new Promise((r) => setTimeout(r, 150));

    const dbAfterChanges = dbLocal.read();
    assert(
      dbAfterChanges.etiquetasIg[testChangesUserId] !== undefined,
      "Se crea contacto EtiquetaIg para formato changes[].value",
    );
    const msgsChanges = dbAfterChanges.mensajesIg.filter((m) => m.usuarioIgId === testChangesUserId);
    assert(
      msgsChanges.length >= 2,
      "Se procesó el mensaje entrante y la respuesta del bot para formato changes",
    );
    assert(
      msgsChanges.some((m) => m.texto.includes("Bienvenido a Mr. Pachi")),
      "Bot respondió con el saludo inicial ante formato changes[].value",
    );

    // -----------------------------------------------------------------------
    // CASO 4C: Fallback Amable (Sin frases negativas) y Personalización de Nombre
    // -----------------------------------------------------------------------
    console.log("\n👉 4C. Validando Fallback amable y Personalización de nombre...");
    const fallbackPayload = {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          time: Date.now(),
          messaging: [
            {
              sender: { id: testUserId },
              recipient: { id: "ig_page_1001" },
              timestamp: Date.now(),
              message: {
                mid: "mid_test_004",
                text: "asdfghjk texto incomprensible",
              },
            },
          ],
        },
      ],
    };

    await axios.post(`${baseUrl}/webhook/instagram`, fallbackPayload);
    await new Promise((r) => setTimeout(r, 150));

    const dbAfterFallback = dbLocal.read();
    const msgsFallback = dbAfterFallback.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    const lastFallbackReply = msgsFallback[msgsFallback.length - 1].texto;
    // M-3: a mitad de conversación ya no se repite el saludo; respuesta corta y amable
    assert(
      !lastFallbackReply.includes("Encantado de saludarte") && lastFallbackReply.includes("ayudarte"),
      "Fallback amable y corto, sin repetir el saludo a mitad de conversación",
    );
    assert(
      !lastFallbackReply.includes("No logré comprender") &&
        !lastFallbackReply.includes("no entendí"),
      "Fallback NO contiene frases negativas ni 'no logré comprender'",
    );
    assert(
      lastFallbackReply.includes("https://wa.me/584123285446"),
      "Fallback incluye enlace directo a WhatsApp",
    );
    assert(
      lastFallbackReply.includes("opciones") || lastFallbackReply.includes("asesor") || lastFallbackReply.includes("1. Sabores y rellenos disponibles"),
      "Fallback presenta opciones interactivas de ayuda al usuario",
    );

    // -----------------------------------------------------------------------
    // CASO 4D: Mensaje desde Anuncio de Instagram (Referral ADS) -> Bot Callado
    // -----------------------------------------------------------------------
    console.log("\n👉 4D. Validando mensaje proveniente de ANUNCIO (Referral ADS)...");
    const testAdUserId = "ig_user_ad_lead_001";
    const adPayload = {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          time: Date.now(),
          messaging: [
            {
              sender: { id: testAdUserId },
              recipient: { id: "ig_page_1001" },
              timestamp: Date.now(),
              message: {
                mid: "mid_test_ad_001",
                text: "Hola, vi su anuncio en Instagram",
                referral: {
                  source: "ADS",
                  type: "OPEN_THREAD",
                  ad_id: "ad_1234567890",
                  ad_title: "Campaña Dumplings Agosto",
                },
              },
            },
          ],
        },
      ],
    };

    await axios.post(`${baseUrl}/webhook/instagram`, adPayload);
    await new Promise((r) => setTimeout(r, 150));

    const dbAfterAd = dbLocal.read();
    const etiquetaAd = dbAfterAd.etiquetasIg[testAdUserId];
    assert(
      etiquetaAd && etiquetaAd.origen === "anuncio",
      "Etiqueta marcada con origen 'anuncio'",
    );
    assert(
      etiquetaAd && etiquetaAd.modo === "manual",
      "Conversación queda en modo 'manual' automático",
    );

    const msgsAd = dbAfterAd.mensajesIg.filter((m) => m.usuarioIgId === testAdUserId);
    assert(
      msgsAd.length === 1 && msgsAd[0].direccion === "cliente",
      "Mensaje del anuncio se persiste pero el bot NO auto-responde (deja a Meta)",
    );

    // -----------------------------------------------------------------------
    // CASO 4E: Reactivación automática del bot de IG tras 3 min de inactividad
    // -----------------------------------------------------------------------
    console.log("\n👉 4E. Validando reactivación automática para leads de anuncios tras 3 mins...");
    
    // 4E.1: Mensaje antes de 3 minutos -> Bot sigue en modo manual y NO responde
    await axios.post(`${baseUrl}/webhook/instagram`, {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          messaging: [
            {
              sender: { id: testAdUserId },
              recipient: { id: "ig_page_1001" },
              timestamp: Date.now(),
              message: {
                mid: "mid_test_ad_002",
                text: "Mensaje rápido antes de los 3 minutos",
              },
            },
          ],
        },
      ],
    });
    await new Promise((r) => setTimeout(r, 150));

    let dbCheck = dbLocal.read();
    let etiquetaAdCheck = dbCheck.etiquetasIg[testAdUserId];
    assert(
      etiquetaAdCheck && etiquetaAdCheck.modo === "manual",
      "Lead de anuncio permanece en modo manual si han pasado menos de 3 minutos",
    );
    let msgsAdCheck = dbCheck.mensajesIg.filter((m) => m.usuarioIgId === testAdUserId);
    assert(
      msgsAdCheck.length === 2 && msgsAdCheck.every((m) => m.direccion === "cliente"),
      "Bot NO responde a mensaje enviado antes de 3 minutos",
    );

    // 4E.2: Simular paso de 4 minutos (> 3 mins) en lastInteraction
    dbCheck.etiquetasIg[testAdUserId].lastInteraction = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    dbLocal.write(dbCheck);

    // 4E.3: Mensaje tras 4 minutos -> Bot se reactiva automáticamente y responde
    await axios.post(`${baseUrl}/webhook/instagram`, {
      object: "instagram",
      entry: [
        {
          id: "ig_page_1001",
          messaging: [
            {
              sender: { id: testAdUserId },
              recipient: { id: "ig_page_1001" },
              timestamp: Date.now(),
              message: {
                mid: "mid_test_ad_003",
                text: "Hola, me gustaría saber los precios",
              },
            },
          ],
        },
      ],
    });
    await new Promise((r) => setTimeout(r, 150));

    dbCheck = dbLocal.read();
    etiquetaAdCheck = dbCheck.etiquetasIg[testAdUserId];
    assert(
      etiquetaAdCheck && etiquetaAdCheck.modo === "automatico",
      "Lead de anuncio se reactiva a modo 'automatico' tras 3+ minutos de inactividad",
    );
    assert(
      etiquetaAdCheck && etiquetaAdCheck.origen === "anuncio",
      "Origen 'anuncio' se preserva para métricas",
    );

    msgsAdCheck = dbCheck.mensajesIg.filter((m) => m.usuarioIgId === testAdUserId);
    assert(
      msgsAdCheck.some((m) => m.direccion === "bot"),
      "Bot responde automáticamente al reactivarse",
    );

    // -----------------------------------------------------------------------
    // CASO 5: Endpoints Administrativos para el Panel
    // -----------------------------------------------------------------------
    console.log("\n👉 5. Validando endpoints administrativos de Instagram...");
    const histRes = await axios.get(`${baseUrl}/api/admin/ig/historial`);
    assert(histRes.data.success === true, "GET /api/admin/ig/historial responde success: true");
    assert(
      histRes.data.data[testUserId] !== undefined,
      "Historial incluye la conversación simulada de Instagram",
    );
    assert(
      histRes.data.data[testAdUserId]?.origen === "anuncio" &&
        histRes.data.data[testAdUserId]?.requiresAttention === true,
      "Historial expone origen='anuncio' y requiresAttention=true para leads de campaña",
    );

    const userMsgsRes = await axios.get(
      `${baseUrl}/api/admin/ig/historial?usuario=${testUserId}`,
    );
    assert(
      userMsgsRes.data.success === true && Array.isArray(userMsgsRes.data.data),
      "GET /api/admin/ig/historial?usuario=X devuelve lista de mensajes",
    );
    assert(
      userMsgsRes.data.data.length >= 8,
      `Mensajes del usuario devueltos correctamente (total: ${userMsgsRes.data.data.length})`,
    );

    const sendAdminRes = await axios.post(`${baseUrl}/api/admin/ig/enviar`, {
      usuarioIgId: testUserId,
      texto: "Mensaje de prueba enviado manualmente desde el panel SaaS",
    });
    assert(
      sendAdminRes.data.success === true && sendAdminRes.data.data.direccion === "bot",
      "POST /api/admin/ig/enviar permite enviar mensajes desde el panel",
    );

    // -----------------------------------------------------------------------
    // CASO 6: Filtrado de Comentarios en Posts y Deduplicación de Echo
    // -----------------------------------------------------------------------
    console.log("\n👉 6. Validando filtrado de comentarios en posts y deduplicación de echo...");
    
    // 6.1 Enviar payload con field: "comments" (no debe procesarse ni guardarse como DM)
    const commentPayload = {
      object: "instagram",
      entry: [
        {
          id: "ig_page_100",
          time: Date.now(),
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_id_999",
                text: "Hermosa foto! Qué precio tienen?",
                from: { id: "user_commenter_888", username: "fan_de_pachi" },
              },
            },
          ],
        },
      ],
    };
    const commentRes = await axios.post(`${baseUrl}/webhook/instagram`, commentPayload);
    assert(
      commentRes.status === 200 && commentRes.data === "EVENT_RECEIVED",
      "Webhook responde 200 EVENT_RECEIVED ante eventos de comments/post sin romper",
    );
    const dbPostComment = dbLocal.read();
    const commentUser = dbPostComment.mensajesIg.find((m) => m.usuarioIgId === "user_commenter_888");
    assert(!commentUser, "Comentario de post (field: 'comments') es ignorado y NO se crea como DM en el chat");

    // 6.2 Validar deduplicación de Echo en handleEcho
    const totalMsgsBefore = dbLocal.read().mensajesIg.length;
    await instagramFlowService.handleEcho(testUserId, "Mensaje de prueba enviado manualmente desde el panel SaaS", "mid_test_echo_duplicate", null);
    const totalMsgsAfter = dbLocal.read().mensajesIg.length;
    assert(totalMsgsBefore === totalMsgsAfter, "handleEcho detecta mensaje saliente reciente y NO duplica el mensaje en base de datos");

    console.log("\n==========================================================");
    console.log(`📊 RESULTADOS: ${passed} pruebas superadas, ${failed} fallidas.`);
    console.log("==========================================================\n");

    server.close();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("💥 Error en simulación de Instagram Webhook:", err);
    server.close();
    process.exit(1);
  }
}

runSimulation();
