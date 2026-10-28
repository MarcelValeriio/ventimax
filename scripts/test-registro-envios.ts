/**
 * scripts/test-registro-envios.ts
 *
 * Suite de pruebas automatizadas para M-1:
 * "Los mensajes del bot registran si llegaron"
 *
 * Criterios de verificación:
 * 1) Envío exitoso guarda con wamid y status "sent".
 * 2) Envío fallido (devuelve false o lanza error) guarda con status "failed" y el bot no lanza error.
 * 3) Webhook de status actualiza el mensaje a "delivered" y "read".
 * 4) Verificación estática (grep check): no quedan llamadas sueltas a enviarTexto,
 *    enviarBotones ni enviarLista seguidas de emitirYGuardar en chatFlowService.ts ni chatFlowController.ts.
 * 5) Verificación de interactivos (botones y listas) a través de enviarYRegistrar.
 * 6) Verificación de chatFlowService._sendYGuardar delegando a enviarYRegistrar.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const chatFlow = require("../controllers/chatFlowController");
const chatFlowService = require("../services/chatFlowService");
const orderService = require("../services/orderService");
const whatsappService = require("../services/whatsapp");

async function runTests() {
  console.log("================================================================================");
  console.log("📡 SUITE DE PRUEBAS: REGISTRO DE ENVÍOS DEL BOT (M-1)");
  console.log("================================================================================");

  // Limpiar mensajes locales
  const dbData = dbLocal.read();
  dbData.mensajes = [];
  dbLocal.write(dbData);

  const originalEnviarTexto = whatsappService.enviarTexto;
  const originalEnviarBotones = whatsappService.enviarBotones;
  const originalEnviarLista = whatsappService.enviarLista;

  try {
    // --------------------------------------------------------------------------
    // TEST 1: Envío exitoso con wamid string -> guarda con wamid y status "sent"
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 1: Envío exitoso guarda con wamid y status 'sent'...");
    const testTel1 = "584121111111";
    const testWamid1 = "wamid.HBgLMTEwMDAwMDAwMDFVAA==";

    whatsappService.enviarTexto = async () => testWamid1;

    const res1 = await chatFlow.enviarYRegistrar(
      testTel1,
      { tipo: "texto", texto: "¡Hola! Tu pedido ha sido recibido." },
      null
    );

    assert.strictEqual(res1, testWamid1, "enviarYRegistrar debe retornar el resultado de WhatsApp (wamid)");

    const msgGuardado1 = await dbLocal.getMensajeModel().findOne({ wamid: testWamid1 });
    assert.ok(msgGuardado1, "El mensaje debe encontrarse en la BD local por su wamid");
    assert.strictEqual(msgGuardado1.wamid, testWamid1, "El wamid debe coincidir");
    assert.strictEqual(msgGuardado1.status, "sent", "El status debe ser 'sent'");
    assert.strictEqual(msgGuardado1.direccion, "bot", "La dirección debe ser 'bot'");
    assert.strictEqual(msgGuardado1.telefono, testTel1, "El teléfono debe coincidir");
    console.log("  ✅ Test 1 superado (Mensaje con wamid y status 'sent' registrado correctamente)");

    // --------------------------------------------------------------------------
    // TEST 2: Envío fallido (devuelve false) -> guarda con status "failed", sin wamid, no lanza error
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 2: Envío fallido (false) guarda con status 'failed' y no interrumpe el flujo...");
    const testTel2 = "584122222222";
    const testTextoFallido = "Mensaje que fallará en la API de Meta";

    whatsappService.enviarTexto = async () => false;

    let errorLanzado = false;
    let res2;
    try {
      res2 = await chatFlow.enviarYRegistrar(
        testTel2,
        { tipo: "texto", texto: testTextoFallido },
        null
      );
    } catch (err) {
      errorLanzado = true;
    }

    assert.strictEqual(errorLanzado, false, "enviarYRegistrar no debe lanzar error si el envío falla");
    assert.strictEqual(res2, false, "enviarYRegistrar debe retornar false cuando el envío falla");

    const dataDespues2 = dbLocal.read();
    const msgGuardado2 = (dataDespues2.mensajes || []).find(
      (m: any) => m.telefono === testTel2 && m.texto === testTextoFallido
    );
    assert.ok(msgGuardado2, "El mensaje fallido debe haberse registrado en la BD");
    assert.strictEqual(msgGuardado2.status, "failed", "El status debe ser 'failed'");
    assert.strictEqual(msgGuardado2.direccion, "bot", "La dirección debe ser 'bot'");
    assert.ok(!msgGuardado2.wamid, "Un envío fallido no debe tener wamid");
    console.log("  ✅ Test 2 superado (Envío fallido registrado con status 'failed' sin lanzar error)");

    // --------------------------------------------------------------------------
    // TEST 3: Envío con excepción no controlada en WhatsApp -> capturada, retorna false, status "failed"
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 3: Excepción no controlada en cliente de WhatsApp es capturada y registrada...");
    const testTel3 = "584123333333";
    const testTextoCrash = "Mensaje con caída de conexión";

    whatsappService.enviarTexto = async () => {
      throw new Error("ETIMEDOUT: Connection lost to graph.facebook.com");
    };

    let errorLanzado3 = false;
    let res3;
    try {
      res3 = await chatFlow.enviarYRegistrar(
        testTel3,
        { tipo: "texto", texto: testTextoCrash },
        null
      );
    } catch (err) {
      errorLanzado3 = true;
    }

    assert.strictEqual(errorLanzado3, false, "enviarYRegistrar debe atrapar excepciones de red sin relanzarlas");
    assert.strictEqual(res3, false, "Debe retornar false ante excepción de red");

    const dataDespues3 = dbLocal.read();
    const msgGuardado3 = (dataDespues3.mensajes || []).find(
      (m: any) => m.telefono === testTel3 && m.texto === testTextoCrash
    );
    assert.ok(msgGuardado3, "El mensaje debe registrarse a pesar de la excepción de red");
    assert.strictEqual(msgGuardado3.status, "failed", "Status debe ser 'failed' tras excepción");
    console.log("  ✅ Test 3 superado (Excepción atrapada y guardada como status 'failed')");

    // --------------------------------------------------------------------------
    // TEST 4: Webhook de status actualiza el mensaje a "delivered" y luego a "read"
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 4: Webhook de status actualiza el mensaje a 'delivered' y 'read'...");
    const testWamidWebhook = "wamid.HBgLMTEwMDAwMDAwMDRVAA==";
    whatsappService.enviarTexto = async () => testWamidWebhook;

    await chatFlow.enviarYRegistrar(
      "584124444444",
      { tipo: "texto", texto: "Mensaje para tracking de webhook" },
      null
    );

    // Estado inicial: sent
    let msgWebhook = await dbLocal.getMensajeModel().findOne({ wamid: testWamidWebhook });
    assert.strictEqual(msgWebhook.status, "sent", "El estado inicial debe ser 'sent'");

    // Llega webhook: delivered
    await orderService.actualizarEstadoMensaje(testWamidWebhook, "delivered");
    msgWebhook = await dbLocal.getMensajeModel().findOne({ wamid: testWamidWebhook });
    assert.strictEqual(msgWebhook.status, "delivered", "El status debe haberse actualizado a 'delivered'");

    // Llega webhook: read
    await orderService.actualizarEstadoMensaje(testWamidWebhook, "read");
    msgWebhook = await dbLocal.getMensajeModel().findOne({ wamid: testWamidWebhook });
    assert.strictEqual(msgWebhook.status, "read", "El status debe haberse actualizado a 'read'");
    console.log("  ✅ Test 4 superado (Transición de status sent -> delivered -> read comprobada)");

    // --------------------------------------------------------------------------
    // TEST 5: Interactivos (botones y listas) a través de enviarYRegistrar
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 5: Envío de interactivos (botones y listas) registra wamid y status...");
    const testWamidBotones = "wamid.HBgLMTEwMDAwMDAwMDVWAA==";
    const testWamidLista = "wamid.HBgLMTEwMDAwMDAwMDZWAA==";

    whatsappService.enviarBotones = async () => testWamidBotones;
    whatsappService.enviarLista = async () => testWamidLista;

    await chatFlow.enviarYRegistrar(
      "584125555555",
      {
        tipo: "botones",
        texto: "¿Deseas continuar?",
        buttons: [{ id: "si", title: "Sí" }, { id: "no", title: "No" }],
      },
      null
    );

    const msgBotones = await dbLocal.getMensajeModel().findOne({ wamid: testWamidBotones });
    assert.ok(msgBotones, "Mensaje de botones debe guardarse con su wamid");
    assert.strictEqual(msgBotones.status, "sent", "Status de botones debe ser 'sent'");

    await chatFlow.enviarYRegistrar(
      "584125555555",
      {
        tipo: "lista",
        texto: "Selecciona una categoría",
        textoGuardar: "Catálogo de productos enviado",
        sections: [{ title: "Sección 1", rows: [{ id: "r1", title: "Fila 1" }] }],
      },
      null
    );

    const msgLista = await dbLocal.getMensajeModel().findOne({ wamid: testWamidLista });
    assert.ok(msgLista, "Mensaje de lista debe guardarse con su wamid");
    assert.strictEqual(msgLista.texto, "Catálogo de productos enviado", "Debe guardar textoGuardar");
    assert.strictEqual(msgLista.status, "sent", "Status de lista debe ser 'sent'");
    console.log("  ✅ Test 5 superado (Botones y listas registran wamid y status correctamente)");

    // --------------------------------------------------------------------------
    // TEST 6: chatFlowService._sendYGuardar delega correctamente en enviarYRegistrar
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 6: chatFlowService._sendYGuardar delega en enviarYRegistrar...");
    const testWamidSend = "wamid.HBgLMTEwMDAwMDAwMDdWAA==";
    whatsappService.enviarTexto = async () => testWamidSend;

    await chatFlowService._sendYGuardar("584126666666", "Mensaje enviado via _sendYGuardar", null);

    const msgSend = await dbLocal.getMensajeModel().findOne({ wamid: testWamidSend });
    assert.ok(msgSend, "Mensaje enviado con _sendYGuardar debe tener wamid");
    assert.strictEqual(msgSend.status, "sent", "Mensaje enviado con _sendYGuardar debe tener status 'sent'");
    console.log("  ✅ Test 6 superado (_sendYGuardar delega y registra con wamid y status)");

    // --------------------------------------------------------------------------
    // TEST 7: Verificación estática (grep check): no quedan llamadas sueltas a enviarTexto
    //         ni pares enviar+emitirYGuardar en chatFlowService ni chatFlowController
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 7: Verificación estática de código (grep check)...");
    const chatFlowServicePath = path.resolve(__dirname, "../services/chatFlowService.ts");
    const chatFlowControllerPath = path.resolve(__dirname, "../controllers/chatFlowController.ts");

    const contentCFS = fs.readFileSync(chatFlowServicePath, "utf-8");
    const contentCFC = fs.readFileSync(chatFlowControllerPath, "utf-8");

    // En chatFlowService.ts no debe haber llamadas directas a enviarTexto, enviarBotones o enviarLista
    const cfsDirectCalls = contentCFS.match(/\b(enviarTexto|enviarBotones|enviarLista)\s*\(/g);
    assert.strictEqual(
      cfsDirectCalls,
      null,
      `chatFlowService.ts no debe tener llamadas directas a enviarTexto, enviarBotones o enviarLista (encontradas: ${cfsDirectCalls?.length || 0})`
    );

    // En chatFlowController.ts las únicas llamadas a enviarBotones, enviarLista o enviarTexto deben estar dentro de enviarYRegistrar
    // Comprobamos que fuera del bloque de enviarYRegistrar no existan llamadas directas
    const cfcLines = contentCFC.split("\n");
    let inEnviarYRegistrar = false;
    const looseCallsInCFC: { line: number; text: string }[] = [];

    cfcLines.forEach((line, idx) => {
      if (line.includes("async enviarYRegistrar(")) {
        inEnviarYRegistrar = true;
      }
      if (inEnviarYRegistrar && line.startsWith("  async enviarMenu(")) {
        inEnviarYRegistrar = false;
      }
      if (!inEnviarYRegistrar) {
        if (/\b(enviarTexto|enviarBotones|enviarLista)\s*\(/.test(line)) {
          looseCallsInCFC.push({ line: idx + 1, text: line.trim() });
        }
      }
    });

    assert.strictEqual(
      looseCallsInCFC.length,
      0,
      `chatFlowController.ts contiene llamadas sueltas fuera de enviarYRegistrar: ${JSON.stringify(looseCallsInCFC)}`
    );

    // Comprobamos que ningún archivo contenga el patrón: enviar*(...) seguido de emitirYGuardar(...)
    const patternLoosePair = /enviar(?:Texto|Botones|Lista)\s*\([^)]*\)[\s\S]{0,80}emitirYGuardar\s*\(/g;
    const loosePairsCFS = contentCFS.match(patternLoosePair);
    const loosePairsCFC = contentCFC.match(patternLoosePair);

    assert.strictEqual(
      loosePairsCFS,
      null,
      `chatFlowService.ts tiene pares enviar+emitirYGuardar sueltos: ${loosePairsCFS?.length || 0}`
    );
    assert.strictEqual(
      loosePairsCFC,
      null,
      `chatFlowController.ts tiene pares enviar+emitirYGuardar sueltos: ${loosePairsCFC?.length || 0}`
    );

    console.log("  ✅ Test 7 superado (0 llamadas sueltas detectadas en chatFlowService ni chatFlowController)");

    console.log("\n================================================================================");
    console.log("🎉 TODOS LOS TESTS DE M-1 PASARON EXITOSAMENTE (7/7)");
    console.log("================================================================================\n");
  } finally {
    // Restaurar funciones originales
    whatsappService.enviarTexto = originalEnviarTexto;
    whatsappService.enviarBotones = originalEnviarBotones;
    whatsappService.enviarLista = originalEnviarLista;
  }
}

runTests().catch((err) => {
  console.error("❌ Falló la suite test-registro-envios.ts:", err);
  process.exit(1);
});
