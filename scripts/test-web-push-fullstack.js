/**
 * scripts/test-web-push-fullstack.js
 * 
 * Validación automatizada de la Integración Nativa de Web Push API:
 * 1. pushService (VAPID config, graceful degradation, saveSubscription, removeSubscription).
 * 2. SuscripcionPush model & mock en dbLocal.
 * 3. Endpoints de suscripción en adminController (subscribe, unsubscribe, test).
 * 4. Exposición de vapidPublicKey en /api/config.
 * 5. Service Worker (public/sw.js) listeners ('push', 'notificationclick').
 * 6. Frontend pushManager.js y SettingsPanel.js.
 * 7. Disparadores en chatFlowService y adminController.
 */

process.env.NODE_ENV = "test";
process.env.VAPID_PUBLIC_KEY = "BN1MOCK_PUBLIC_KEY_1234567890abcdefghijklmnopqrstuvwxyz";
process.env.VAPID_PRIVATE_KEY = "MOCK_PRIVATE_KEY_1234567890";
process.env.VAPID_EMAIL = "mailto:soporte@test.com";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

async function runTests() {
  console.log("==========================================================");
  console.log("🧪 TEST: INTEGRACIÓN NATIVA DE WEB PUSH API");
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

  try {
    const swPath = path.join(__dirname, "../public/sw.js");
    const pushManagerPath = path.join(__dirname, "../public/src/services/pushManager.js");
    const pushServicePath = path.join(__dirname, "../services/pushService.ts");
    const modelPath = path.join(__dirname, "../models/SuscripcionPush.ts");
    const configCtrlPath = path.join(__dirname, "../controllers/configController.js");
    const adminCtrlPath = path.join(__dirname, "../controllers/adminController.js");
    const adminRoutesPath = path.join(__dirname, "../routes/adminRoutes.ts");
    const chatFlowPath = path.join(__dirname, "../services/chatFlowService.ts");
    const settingsPath = path.join(__dirname, "../public/src/features/dashboard/SettingsPanel.js");

    assert(fs.existsSync(swPath), "public/sw.js existe");
    assert(fs.existsSync(pushManagerPath), "public/src/services/pushManager.js existe");
    assert(fs.existsSync(pushServicePath), "services/pushService.ts existe");
    assert(fs.existsSync(modelPath), "models/SuscripcionPush.ts existe");

    // -------------------------------------------------------------------------
    // 1. pushService unit tests
    // -------------------------------------------------------------------------
    console.log("\n👉 1. Validando servicio backend pushService.ts...");
    const pushService = require("../services/pushService");
    assert(typeof pushService.saveSubscription === "function", "pushService.saveSubscription es una función");
    assert(typeof pushService.removeSubscription === "function", "pushService.removeSubscription es una función");
    assert(typeof pushService.sendToAllAdmins === "function", "pushService.sendToAllAdmins es una función");
    assert(typeof pushService.sendToUser === "function", "pushService.sendToUser es una función");

    const mockSubscription = {
      endpoint: "https://fcm.googleapis.com/fcm/send/mock-token-12345",
      keys: {
        p256dh: "BMockP256dhKey12345",
        auth: "MockAuthKey12345",
      },
    };

    const saved = await pushService.saveSubscription(mockSubscription, "user-admin-1", "admin", "Mozilla/5.0 Test");
    assert(saved && saved.endpoint === mockSubscription.endpoint, "saveSubscription guarda en DB mock exitosamente");

    const removed = await pushService.removeSubscription(mockSubscription.endpoint);
    assert(removed === true, "removeSubscription elimina de DB mock exitosamente");

    // -------------------------------------------------------------------------
    // 2. Endpoints en adminController.js
    // -------------------------------------------------------------------------
    console.log("\n👉 2. Validando controladores en adminController.js...");
    const adminCtrl = require("../controllers/adminController");
    assert(typeof adminCtrl.postPushSubscribe === "function", "adminController.postPushSubscribe exportado");
    assert(typeof adminCtrl.postPushUnsubscribe === "function", "adminController.postPushUnsubscribe exportado");
    assert(typeof adminCtrl.postPushTest === "function", "adminController.postPushTest exportado");

    // Mock Req/Res para postPushSubscribe
    let subResponseData = null;
    const reqSubscribe = {
      body: { subscription: mockSubscription },
      user: { _id: "user-test-99", role: "admin" },
      headers: { "user-agent": "TestBrowser/1.0" },
    };
    const resSubscribe = {
      json: (data) => { subResponseData = data; return resSubscribe; },
      status: () => resSubscribe,
    };

    await adminCtrl.postPushSubscribe(reqSubscribe, resSubscribe);
    assert(subResponseData && subResponseData.success === true, "postPushSubscribe responde 200 con success: true");

    // Mock Req/Res para postPushTest
    let testResponseData = null;
    const reqTest = {
      user: { _id: "user-test-99", role: "admin" },
    };
    const resTest = {
      json: (data) => { testResponseData = data; return resTest; },
      status: () => resTest,
    };
    await adminCtrl.postPushTest(reqTest, resTest);
    assert(testResponseData && testResponseData.success === true, "postPushTest procesa y responde success: true");

    // -------------------------------------------------------------------------
    // 3. Rutas en adminRoutes.ts
    // -------------------------------------------------------------------------
    console.log("\n👉 3. Validando definición de rutas en adminRoutes.ts...");
    const adminRoutesContent = fs.readFileSync(adminRoutesPath, "utf8");
    assert(adminRoutesContent.includes('"/push/subscribe"'), "Ruta POST /push/subscribe registrada");
    assert(adminRoutesContent.includes('"/push/unsubscribe"'), "Ruta POST /push/unsubscribe registrada");
    assert(adminRoutesContent.includes('"/push/test"'), "Ruta POST /push/test registrada");

    // -------------------------------------------------------------------------
    // 4. Exposición de clave pública VAPID en configController
    // -------------------------------------------------------------------------
    console.log("\n👉 4. Validando exposición de vapidPublicKey en /api/config...");
    const configCtrl = require("../controllers/configController");
    let configResponse = null;
    const resConfig = {
      json: (data) => { configResponse = data; return resConfig; },
      status: () => resConfig,
    };
    configCtrl.getConfig({}, resConfig);
    assert(configResponse && configResponse.vapidPublicKey !== undefined, "/api/config incluye vapidPublicKey");

    // -------------------------------------------------------------------------
    // 5. Service Worker public/sw.js
    // -------------------------------------------------------------------------
    console.log("\n👉 5. Validando Service Worker (public/sw.js)...");
    const swContent = fs.readFileSync(swPath, "utf8");
    assert(swContent.includes('addEventListener("push"'), "sw.js escucha evento 'push'");
    assert(swContent.includes('addEventListener("notificationclick"'), "sw.js escucha evento 'notificationclick'");
    assert(swContent.includes("showNotification"), "sw.js invoca showNotification");
    assert(swContent.includes("vibrate"), "sw.js define patrón de vibración");

    // -------------------------------------------------------------------------
    // 6. Frontend pushManager.js y SettingsPanel.js
    // -------------------------------------------------------------------------
    console.log("\n👉 6. Validando pushManager.js y SettingsPanel.js...");
    const pushManagerContent = fs.readFileSync(pushManagerPath, "utf8");
    assert(pushManagerContent.includes("subscribeToWebPush"), "pushManager exporta subscribeToWebPush");
    assert(pushManagerContent.includes("unsubscribeFromWebPush"), "pushManager exporta unsubscribeFromWebPush");
    assert(pushManagerContent.includes("urlBase64ToUint8Array"), "pushManager implementa urlBase64ToUint8Array");

    const settingsContent = fs.readFileSync(settingsPath, "utf8");
    assert(settingsContent.includes("Notificaciones push activadas"), "SettingsPanel permite activar las notificaciones push");
    assert(settingsContent.includes("subscribeToWebPush"), "SettingsPanel conecta con subscribeToWebPush");

    // -------------------------------------------------------------------------
    // 7. Disparadores en chatFlowService
    // -------------------------------------------------------------------------
    console.log("\n👉 7. Validando disparadores en chatFlowService.ts...");
    const chatFlowContent = fs.readFileSync(chatFlowPath, "utf8");
    assert(chatFlowContent.includes("pushService"), "chatFlowService importa pushService");
    assert(/pushService\s*\.sendToAllAdmins/.test(chatFlowContent), "chatFlowService dispara pushService.sendToAllAdmins");

    // -------------------------------------------------------------------------
    // 8. Sintaxis JS
    // -------------------------------------------------------------------------
    console.log("\n👉 8. Validando sintaxis de archivos frontend...");
    const testFiles = [swPath, pushManagerPath, settingsPath];
    for (const file of testFiles) {
      const content = fs.readFileSync(file, "utf8")
        .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, "// import")
        .replace(/export\s+default\s+/g, "")
        .replace(/export\s+const\s+/g, "const ");
      try {
        new vm.Script(content, { filename: path.basename(file) });
        assert(true, `Sintaxis válida: ${path.basename(file)}`);
      } catch (err) {
        assert(false, `Error sintaxis en ${path.basename(file)}: ${err.message}`);
      }
    }

    console.log("\n==========================================================");
    console.log(`📊 RESULTADOS: ${passed} pruebas superadas, ${failed} fallidas.`);
    console.log("==========================================================\n");

    process.exit(failed > 0 ? 1 : 0);
  } catch (error) {
    console.error("💥 Error en suite test-web-push-fullstack:", error);
    process.exit(1);
  }
}

runTests();
