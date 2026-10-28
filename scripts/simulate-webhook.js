/**
 * Script de Simulación de Webhook (Prueba de Integración E2E Mocked)
 * Simula el flujo de un usuario en WhatsApp y verifica la persistencia en DB.
 */
require("dotenv").config();
process.env.NODE_ENV = "test"; // Activa el Mock de IA

const axios = require("axios");
const mongoose = require("mongoose");
const Etiqueta = require("../models/Etiqueta");

const SERVER_URL = `http://localhost:${process.env.PORT || 3000}/webhook`;
const TEST_PHONE = "584120000000";

async function sendWebhookMessage(text) {
  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "123456789", phone_number_id: "987654321" },
              contacts: [{ profile: { name: "Usuario Test" }, wa_id: TEST_PHONE }],
              messages: [
                {
                  from: TEST_PHONE,
                  id: "MSG_ID_" + Date.now(),
                  timestamp: Math.floor(Date.now() / 1000),
                  text: { body: text },
                  type: "text"
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  try {
    await axios.post(SERVER_URL, payload);
  } catch (error) {
    console.error(`❌ Error enviando mensaje "${text}":`, error.response?.data || error.message);
  }
}

async function getStatus() {
  let EtiquetaModel = Etiqueta;
  if (process.env.NODE_ENV === "test") {
    const dbLocal = require("../services/dbLocal");
    EtiquetaModel = dbLocal.getEtiquetaModel();
  }
  const doc = await EtiquetaModel.findOne({ telefono: TEST_PHONE });
  return doc ? { paso: doc.paso, items: doc.carrito?.items?.length || 0 } : { paso: "N/A", items: 0 };
}

async function runSimulation() {
  console.log("==========================================");
  console.log("🧪 INICIANDO SIMULACIÓN DE FLUJO");
  console.log("==========================================\n");

  let EtiquetaModel = Etiqueta;

  if (process.env.NODE_ENV === "test") {
    console.log("🟡 Usando DbLocal para persistencia compartida en test.");
    const dbLocal = require("../services/dbLocal");
    EtiquetaModel = dbLocal.getEtiquetaModel();
  } else {
    try {
      const mongoUri = process.env.MONGODB_URI;
      await mongoose.connect(mongoUri, { family: 4, serverSelectionTimeoutMS: 5000 });
      console.log("✅ Conectado a MongoDB Atlas.");
    } catch (e) {
      console.error("❌ Error conectando a MongoDB.");
      process.exit(1);
    }
  }
  
  // Limpiar estado previo
  await EtiquetaModel.deleteOne({ telefono: TEST_PHONE });
  console.log(`\n🧹 Estado previo de ${TEST_PHONE} eliminado.\n`);

  const messages = [
    { text: "Hola", label: "SALUDO INICIAL" },
    { text: "1", label: "SELECCIÓN DE PRODUCTOS (Menú 1)" },
    { text: "prod-001", label: "SELECCIÓN DE COMBO FAMILIAR" },
    { text: "2", label: "CANTIDAD (2 Unidades)" },
    { text: "no", label: "FINALIZAR ADICIÓN (Ir al pago)" }
  ];

  for (const step of messages) {
    console.log(`👉 Enviando: "${step.text}" (${step.label})`);
    await sendWebhookMessage(step.text);
    
    // Esperar un momento para que el servidor procese
    await new Promise(r => setTimeout(r, 1000));
    
    const status = await getStatus();
    console.log(`📊 Estado en DB: [Paso: ${status.paso}] | [Items en Carrito: ${status.items}]`);
    console.log("------------------------------------------");
  }

  console.log("\n✅ SIMULACIÓN FINALIZADA CON ÉXITO.");
  await mongoose.disconnect();
}

runSimulation().catch(err => {
  console.error("💥 Error en la simulación:", err);
  process.exit(1);
});
