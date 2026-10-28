/**
 * scripts/test-mensajes-marca.ts
 * Valida que todas las claves de mensajes usadas en el backend existan en settings.json
 * de ambas marcas (default y ventimax) y que devuelvan texto no vacío al ser consultadas
 * vía configManager.get("settings.messages.X") y configManager.format("settings.messages.X").
 */

import assert from "node:assert";
import path from "node:path";

// Lista exhaustiva de claves de mensajes referenciadas en controllers, services y jobs:
const CLAVES_MENSAJES = [
  "welcomeDetailed",
  "menuFooter",
  "menuTitle",
  "promptPersonalData",
  "promptPayment",
  "promptQuantity",
  "promptQuantityDirect",
  "weekendGreeting",
  "puntoAliadoInfo",
  "paymentInstructionsHeader",
  "orderDispatched",
  "orderDelivered",
  "botStarted",
  "botStopped",
  "reactivationNotice",
  "manualOrderRequest",
  "stockEmpty",
  "stockHeader",
  "faqFallbackMenu",
  "igCatalogHeader",
  "weekendDeliveryConfirm",
  "weekendButtonPedir",
  "weekendButtonPuntoAliado",
  "pickupUnavailable",
  "advisorHandoff",
];

function testMarca(brandNameTarget: string) {
  console.log(`\n▶ Validando mensajes para marca: ${brandNameTarget}...`);
  process.env.BRAND_NAME = brandNameTarget;
  process.env.NODE_ENV = "test";

  // Limpiar caché de require para recargar configManager con la marca correspondiente
  const cmPath = path.resolve(__dirname, "../services/configManager.ts");
  delete require.cache[require.resolve("../services/configManager")];
  const configManager = require("../services/configManager");

  const brandName = configManager.get("settings.brandName");
  assert(brandName, `settings.brandName debe estar definido para ${brandNameTarget}`);
  console.log(`  🏢 Marca cargada: ${brandName}`);

  for (const clave of CLAVES_MENSAJES) {
    const rawVal = configManager.get(`settings.messages.${clave}`);
    assert(
      typeof rawVal === "string" && rawVal.trim().length > 0,
      `[${brandNameTarget}] La clave settings.messages.${clave} debe existir y no estar vacía. Recibido: ${rawVal}`
    );

    const formattedVal = configManager.format(`settings.messages.${clave}`, {
      saludo: "¡Hola! 👋",
      pid: 12345,
      id: "#001",
      direccion: "Calle Principal",
      metodo: "Pago Móvil",
      unitPlural: "unidades",
    });

    assert(
      typeof formattedVal === "string" && formattedVal.trim().length > 0,
      `[${brandNameTarget}] configManager.format('settings.messages.${clave}') debe devolver texto no vacío.`
    );
  }

  // Verificación específica de bienvenida
  const bienvenida = configManager.format("settings.messages.welcomeDetailed", {
    saludo: "¡Hola! 👋",
  });
  if (brandNameTarget === "ventimax") {
    assert(
      bienvenida.includes("VentiMax"),
      `[ventimax] El mensaje de bienvenida debe incluir 'VentiMax'. Obtenido: ${bienvenida}`
    );
  } else if (brandNameTarget === "default") {
    assert(
      bienvenida.includes("Mr. Pachi"),
      `[default] El mensaje de bienvenida debe incluir 'Mr. Pachi'. Obtenido: ${bienvenida}`
    );
  }

  // Verificación de botStarted y botStopped con pid
  const botStarted = configManager.format("settings.messages.botStarted", { pid: 999 });
  assert(
    botStarted.includes("999"),
    `[${brandNameTarget}] botStarted debe contener el pid interpolado. Obtenido: ${botStarted}`
  );

  console.log(`  ✅ Todas las ${CLAVES_MENSAJES.length} claves de mensajes verificadas con éxito para ${brandNameTarget}.`);
}

async function run() {
  console.log("🧪 Iniciando test-mensajes-marca...");

  // 1. Probar ventimax
  testMarca("ventimax");

  // 2. Probar default
  testMarca("default");

  console.log("\n🎉 TODAS LAS PRUEBAS DE MENSAJES DE MARCA PASARON CON ÉXITO.\n");
}

run();
