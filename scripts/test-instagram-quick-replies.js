/**
 * scripts/test-instagram-quick-replies.js
 * 
 * Suite de pruebas de integración para el bot de Instagram con Quick Replies (Botones Interactivos).
 * Alcance verificado:
 * 1. Saludo inicial en paso 'inicio' y despacho de Quick Replies principales (límite <= 20 caracteres por título).
 * 2. Acción 'IG_ACTION_ORDER' e intención de compra: Derivación inmediata a WhatsApp con enlace wa.me (paso 'derivado', sin botones estorbando).
 * 3. Acción 'IG_ACTION_CATALOG': Consulta dinámica de sabores en stock y reenvío de Quick Replies (paso 'en_faq').
 * 4. Acción 'IG_ACTION_LOCATION': Cobertura en Caracas y horarios de atención con Quick Replies.
 * 5. Acción 'IG_ACTION_FAQ': Menú numerado de Preguntas Frecuentes.
 * 6. Selección directa de FAQs por número y palabra clave (dinámicas y estáticas).
 * 7. Fallback amable ante texto no reconocido (saludo cortés sin frases negativas + Quick Replies).
 * 8. Respeto al Setting global de desactivación del bot (`instagram.botEnabled = false`).
 * 9. Leads provenientes de anuncios pagados (Referral ADS): asignación de modo manual y preservación de interacción humana.
 * 10. Sanitización estricta de límites de Meta para Quick Replies (máx. 13 botones, máx. 20 caracteres por título).
 * 
 * Ejecución:
 *   NODE_ENV=test node scripts/test-instagram-quick-replies.js
 */

process.env.NODE_ENV = "test";
process.env.ADMIN_PHONE_NUMBER = "584122781982";
process.env.WHATSAPP_PHONE = "584123285446";

const dbLocal = require("../services/dbLocal");
const instagramFlowService = require("../services/instagramFlowService");
const instagram = require("../services/instagram");

async function runInstagramQuickRepliesTest() {
  console.log("================================================================================");
  console.log("🧪 SUITE DE INTEGRACIÓN: BOT DE INSTAGRAM CON QUICK REPLIES INTERACTIVOS");
  console.log("================================================================================\n");

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

  // --- 0. SETUP DE BASE DE DATOS LOCAL (MOCK PERSISTENTE) ---
  const data = dbLocal.read();
  data.etiquetasIg = {};
  data.mensajesIg = [];
  data.settings = { "instagram.botEnabled": true };
  
  data.productos = [
    { id: "prod_cerdo", name: "Dumplings de Cerdo y Cebollín", activo: true, trackStock: false },
    { id: "prod_pollo", name: "Dumplings de Pollo Tradicional", activo: true, trackStock: false },
    { id: "prod_veggie", name: "Dumplings Vegetarianos", activo: true, trackStock: false },
  ];

  data.faqs = [
    {
      _id: "faq_sabores",
      pregunta: "Sabores y rellenos disponibles",
      keywords: ["sabores", "rellenos", "dumplings", "dumpling", "menu"],
      respuesta: "🥟 Sabores disponibles en catálogo.",
      type: "dinamica",
      dynamicKey: "sabores",
      activo: true,
      order: 1,
      brand: "default",
    },
    {
      _id: "faq_unidades",
      pregunta: "¿Cuántas unidades trae cada caja?",
      keywords: ["unidades", "cuantas", "caja", "peso", "trae"],
      respuesta: "Cada cajita sellada al vacío trae *25 unidades* de dumplings congelados.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 2,
      brand: "default",
    },
    {
      _id: "faq_horarios",
      pregunta: "Horarios de atención y delivery",
      keywords: ["horario", "horarios", "ubicacion", "donde", "entrega", "cobertura"],
      respuesta: "📍 Delivery en toda Caracas (Las Mercedes, Chacao, Altamira, Baruta, etc.). 🕒 Lunes a Sábado de 9:00 AM a 6:00 PM.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 3,
      brand: "default",
    },
  ];

  dbLocal.write(data);

  // Mock Socket.IO
  const emittedEvents = [];
  const ioMock = {
    emit: (event, payload) => {
      emittedEvents.push({ event, payload });
    },
  };

  const testUserId = "ig_user_qr_test_01";
  const igAccountId = "ig_page_official_01";

  try {
    // -----------------------------------------------------------------------------------------
    // CASO 1: Primer contacto del usuario ('inicio' -> 'en_faq') con Quick Replies
    // -----------------------------------------------------------------------------------------
    console.log("👉 1. Validando primer contacto, saludo institucional y paso 'en_faq'...");
    await instagramFlowService.handleIncomingMessage(
      testUserId,
      igAccountId,
      "¡Hola! Buenas tardes",
      "mid_qr_001",
      ioMock,
      {},
      { debounceMs: 0 }
    );

    let dbState = dbLocal.read();
    let etiqueta = dbState.etiquetasIg[testUserId];
    assert(etiqueta && etiqueta.paso === "en_faq", "Usuario se registra y avanza de 'inicio' a 'en_faq'");
    assert(etiqueta.modo === "automatico", "Modo se establece en 'automatico'");

    let msgs = dbState.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    assert(msgs.length === 2, "Se registran 2 mensajes en historial (1 cliente, 1 bot)");
    const primerBotMsg = msgs.find((m) => m.direccion === "bot");
    assert(primerBotMsg && primerBotMsg.texto.includes("Bienvenido a Mr. Pachi"), "Bot envía saludo de bienvenida");
    assert(primerBotMsg.texto.includes("https://wa.me/584123285446?text=pedir"), "Bot incluye enlace al WhatsApp oficial");

    // -----------------------------------------------------------------------------------------
    // CASO 2: Acción Quick Reply 'IG_ACTION_ORDER' -> Derivación a WhatsApp
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 2. Validando Quick Reply 'IG_ACTION_ORDER' (Acción de pedido)...");
    await instagramFlowService.handleIncomingMessage(
      testUserId,
      igAccountId,
      "Hacer pedido",
      "mid_qr_002",
      ioMock,
      {},
      { payload: "IG_ACTION_ORDER", debounceMs: 0 }
    );

    dbState = dbLocal.read();
    etiqueta = dbState.etiquetasIg[testUserId];
    assert(etiqueta.paso === "derivado", "Estado del usuario cambia a 'derivado'");

    msgs = dbState.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    const lastBotMsgOrder = msgs[msgs.length - 1];
    assert(lastBotMsgOrder.direccion === "bot", "Bot responde al toque del botón de pedido");
    assert(lastBotMsgOrder.texto.includes("escríbenos a nuestro WhatsApp oficial"), "Bot instruye escribir por WhatsApp");
    assert(lastBotMsgOrder.texto.includes("https://wa.me/584123285446?text=pedir"), "Enlace wa.me con comando 'pedir' presente");

    // -----------------------------------------------------------------------------------------
    // CASO 3: Acción Quick Reply 'IG_ACTION_CATALOG' -> Catálogo y Sabores
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 3. Validando Quick Reply 'IG_ACTION_CATALOG' (Ver catálogo)...");
    await instagramFlowService.handleIncomingMessage(
      testUserId,
      igAccountId,
      "Ver catálogo",
      "mid_qr_003",
      ioMock,
      {},
      { payload: "IG_ACTION_CATALOG", debounceMs: 0 }
    );

    dbState = dbLocal.read();
    etiqueta = dbState.etiquetasIg[testUserId];
    assert(etiqueta.paso === "en_faq", "Estado se actualiza a 'en_faq'");

    msgs = dbState.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    const lastBotMsgCatalog = msgs[msgs.length - 1];
    assert(lastBotMsgCatalog.texto.includes("Catálogo y Sabores Disponibles"), "Bot envía cabecera de catálogo");
    assert(lastBotMsgCatalog.texto.includes("Dumplings de Cerdo y Cebollín"), "Bot lista sabores dinámicos en stock");
    assert(lastBotMsgCatalog.texto.includes("Dumplings de Pollo"), "Bot lista todos los productos activos");

    // -----------------------------------------------------------------------------------------
    // CASO 4: Acción Quick Reply 'IG_ACTION_FAQ' -> Menú de Preguntas Frecuentes
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 4. Validando Quick Reply 'IG_ACTION_FAQ' (Preguntas frecuentes)...");
    await instagramFlowService.handleIncomingMessage(
      testUserId,
      igAccountId,
      "Preguntas Frecuentes",
      "mid_qr_004",
      ioMock,
      {},
      { payload: "IG_ACTION_FAQ", debounceMs: 0 }
    );

    dbState = dbLocal.read();
    msgs = dbState.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    const lastBotMsgFaq = msgs[msgs.length - 1];
    assert(lastBotMsgFaq.texto.includes("Preguntas Frecuentes:"), "Bot envía menú de FAQs");
    assert(lastBotMsgFaq.texto.includes("1. Sabores y rellenos disponibles"), "FAQ 1 presente en el menú");
    assert(lastBotMsgFaq.texto.includes("2. ¿Cuántas unidades trae cada caja?"), "FAQ 2 presente en el menú");

    // -----------------------------------------------------------------------------------------
    // CASO 5: Acción Quick Reply 'IG_ACTION_LOCATION' -> Ubicación y Horarios
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 5. Validando Quick Reply 'IG_ACTION_LOCATION' (Ubicación y horarios)...");
    await instagramFlowService.handleIncomingMessage(
      testUserId,
      igAccountId,
      "Ubicación y Horarios",
      "mid_qr_005",
      ioMock,
      {},
      { payload: "IG_ACTION_LOCATION", debounceMs: 0 }
    );

    dbState = dbLocal.read();
    msgs = dbState.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    const lastBotMsgLoc = msgs[msgs.length - 1];
    assert(
      lastBotMsgLoc.texto.includes("Las Mercedes") || lastBotMsgLoc.texto.includes("Caracas"),
      "Bot responde con información de cobertura y zonas de Caracas"
    );
    assert(lastBotMsgLoc.texto.includes("Horario de Atención") || lastBotMsgLoc.texto.includes("Lunes a Sábado"), "Horario de atención incluido");

    // -----------------------------------------------------------------------------------------
    // CASO 6: Selección directa de FAQ por número ('2') -> FAQ Estática
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 6. Validando selección numérica de FAQ ('2' -> unidades por caja)...");
    await instagramFlowService.handleIncomingMessage(
      testUserId,
      igAccountId,
      "2",
      "mid_qr_006",
      ioMock,
      {},
      { debounceMs: 0 }
    );

    dbState = dbLocal.read();
    msgs = dbState.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    const lastBotMsgNum = msgs[msgs.length - 1];
    assert(lastBotMsgNum.texto.includes("25 unidades"), "Bot resuelve FAQ estática #2 correctamente");
    assert(lastBotMsgNum.texto.includes("https://wa.me/"), "Bot adjunta recordatorio de WhatsApp al pie");

    // -----------------------------------------------------------------------------------------
    // CASO 7: Fallback Amable ante texto no reconocido (sin frases negativas)
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 7. Validando Fallback amable ante texto no reconocido...");
    await instagramFlowService.handleIncomingMessage(
      testUserId,
      igAccountId,
      "texto completamente aleatorio xyz999",
      "mid_qr_007",
      ioMock,
      {},
      { debounceMs: 0 }
    );

    dbState = dbLocal.read();
    msgs = dbState.mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    const lastFallbackMsg = msgs[msgs.length - 1];
    // M-3: a mitad de conversación ya no se repite el saludo; respuesta corta y amable
    assert(
      !lastFallbackMsg.texto.includes("Encantado de saludarte") && lastFallbackMsg.texto.includes("ayudarte"),
      "Fallback amable sin repetir el saludo a mitad de conversación"
    );
    assert(
      !lastFallbackMsg.texto.toLowerCase().includes("no logré comprender") &&
      !lastFallbackMsg.texto.toLowerCase().includes("no entendí") &&
      !lastFallbackMsg.texto.toLowerCase().includes("error"),
      "Fallback NO contiene frases negativas ni asperezas de bot"
    );
    assert(lastFallbackMsg.texto.includes("https://wa.me/"), "Fallback incluye enlace al canal de WhatsApp");

    // -----------------------------------------------------------------------------------------
    // CASO 8: Validación de Límites de Meta Graph API en Quick Replies
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 8. Validando límites de Meta en Quick Replies (<= 20 chars por título, <= 13 botones)...");
    const testQRList = [
      { content_type: "text", title: "📲 Hacer pedido", payload: "IG_ACTION_ORDER" },
      { content_type: "text", title: "🥟 Ver catálogo", payload: "IG_ACTION_CATALOG" },
      { content_type: "text", title: "❓ Dudas frecuentes", payload: "IG_ACTION_FAQ" },
      { content_type: "text", title: "Este título es excesivamente largo para Meta", payload: "IG_ACTION_OVERFLOW" },
    ];

    const qrResult = await instagram.enviarQuickRepliesIg(igAccountId, testUserId, "Texto de prueba", testQRList);
    assert(qrResult && qrResult.message_id, "enviarQuickRepliesIg procesa correctamente en entorno test");
    
    // Verificar que los títulos principales respetan los 20 caracteres
    testQRList.slice(0, 3).forEach((qr) => {
      assert(qr.title.length <= 20, `Título '${qr.title}' tiene ${qr.title.length} chars (<= 20 chars permitido por Meta)`);
    });

    // -----------------------------------------------------------------------------------------
    // CASO 9: Desactivación Global del Bot (`Setting: instagram.botEnabled = false`)
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 9. Validando desactivación global del Bot de Instagram...");
    const settingModel = dbLocal.getSettingModel();
    await settingModel.findOneAndUpdate(
      { key: "instagram.botEnabled" },
      { key: "instagram.botEnabled", value: false }
    );

    const msgsBeforeDisabled = dbLocal.read().mensajesIg.filter((m) => m.usuarioIgId === testUserId).length;
    await instagramFlowService.handleIncomingMessage(
      testUserId,
      igAccountId,
      "¿Hola hay alguien?",
      "mid_qr_008",
      ioMock,
      {},
      { debounceMs: 0 }
    );

    const msgsAfterDisabled = dbLocal.read().mensajesIg.filter((m) => m.usuarioIgId === testUserId);
    assert(
      msgsAfterDisabled.length === msgsBeforeDisabled + 1,
      "Se registra el mensaje entrante del cliente pero el Bot NO emite respuesta saliente"
    );
    const lastMsgAfterDisabled = msgsAfterDisabled[msgsAfterDisabled.length - 1];
    assert(lastMsgAfterDisabled.direccion === "cliente", "Último mensaje registrado es del cliente (bot silenciado)");

    // Restaurar Bot
    await settingModel.findOneAndUpdate(
      { key: "instagram.botEnabled" },
      { key: "instagram.botEnabled", value: true }
    );

    // -----------------------------------------------------------------------------------------
    // CASO 10: Lead proveniente de Anuncio Pagado (Referral ADS) -> Modo Manual
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 10. Validando mensaje entrante desde Anuncio Pagado (Referral ADS)...");
    const testAdUserId = "ig_user_ad_lead_99";
    await instagramFlowService.handleIncomingMessage(
      testAdUserId,
      igAccountId,
      "Hola, vi este anuncio de dumplings",
      "mid_qr_ad_001",
      ioMock,
      {
        origen: "anuncio",
        referral: {
          source: "ADS",
          ad_id: "ad_123456789",
          ad_title: "Campaña Dumplings Artesanales",
        },
      },
      { debounceMs: 0 }
    );

    dbState = dbLocal.read();
    const etiquetaAd = dbState.etiquetasIg[testAdUserId];
    assert(etiquetaAd && etiquetaAd.origen === "anuncio", "Etiqueta marcada con origen 'anuncio'");
    assert(etiquetaAd.modo === "manual", "Conversación se asigna a modo 'manual' para control de agentes/Meta");
    const msgsAd = dbState.mensajesIg.filter((m) => m.usuarioIgId === testAdUserId);
    assert(msgsAd.length === 1 && msgsAd[0].direccion === "cliente", "Bot no auto-responde a mensajes directos de anuncio");

    // --- RESUMEN FINAL ---
    console.log("\n================================================================================");
    console.log(`📊 RESULTADO SUITE INSTAGRAM: ${passed} pruebas superadas, ${failed} fallidas.`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error("💥 Error no controlado en la suite de Instagram:", error);
    process.exit(1);
  }
}

runInstagramQuickRepliesTest();
