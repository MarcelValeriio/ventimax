/**
 * scripts/test-receipt-notification.js
 * Script para probar específicamente la notificación sonora y visual del panel.
 * Simula la recepción de una imagen (comprobante) de un cliente.
 * REQUISITO: El servidor debe estar corriendo (npm start o node index.js)
 */
require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");
const Etiqueta = require("../models/Etiqueta");
const Pedido = require("../models/Pedido");

const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}/webhook`;
const TEST_PHONE = "584120000000";

async function setupOrder() {
  console.log("🛠️ Preparando estado del cliente y pedido ficticio...");
  
  try {
    // Conectar a MongoDB
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    await mongoose.connect(uri);
    
    // 1. Forzar estado del bot
    await Etiqueta.findOneAndUpdate(
      { telefono: TEST_PHONE },
      { 
        telefono: TEST_PHONE,
        paso: "esperando_comprobante", 
        carrito: { 
          items: [{ producto: "Combo Test", price: 10, cantidad: 1 }],
          pago: "pago_movil",
          nombre: "Cliente de Prueba",
          cedula: "12345678"
        } 
      },
      { upsert: true }
    );

    // 2. Crear pedido pendiente
    await Pedido.findOneAndUpdate(
      { whatsappId: TEST_PHONE, estado: "pendiente_pago" },
      {
        whatsappId: TEST_PHONE,
        items: [{ producto: "Combo Test", price: 10, cantidad: 1 }],
        cliente: { nombre: "Cliente de Prueba", cedula: "12345678" },
        pago: { metodo: "Pago Móvil", montoUSD: 10, montoVES: 500, tasa: 50 },
        estado: "pendiente_pago",
        timestamp: new Date()
      },
      { upsert: true }
    );

    console.log("✅ Entorno de prueba en DB listo.\n");
  } catch (err) {
    console.error("❌ Error preparando DB:", err.message);
  }
}

async function simulateReceipt() {
  console.log("==========================================");
  console.log("🔔 PROBANDO NOTIFICACIÓN DE COMPROBANTE");
  console.log("==========================================\n");

  await setupOrder();

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
              contacts: [{ profile: { name: "Cliente de Prueba" }, wa_id: TEST_PHONE }],
              messages: [
                {
                  from: TEST_PHONE,
                  id: "MSG_ID_RECEIPT_" + Date.now(),
                  timestamp: Math.floor(Date.now() / 1000),
                  type: "image",
                  image: {
                    id: "mock-media-id-123",
                    mime_type: "image/jpeg",
                    sha256: "dummy-sha"
                  }
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
    const crypto = require("crypto");
    const appSecret = process.env.WHATSAPP_APP_SECRET || process.env.IG_APP_SECRET;
    const signature = appSecret 
      ? "sha256=" + crypto.createHmac("sha256", appSecret).update(JSON.stringify(payload)).digest("hex")
      : "";

    console.log(`🚀 Enviando imagen simulada a ${SERVER_URL}...`);
    const response = await axios.post(SERVER_URL, payload, {
      headers: { "x-hub-signature-256": signature }
    });
    
    if (response.status === 200) {
      console.log("\n✅ ¡ÉXITO! El servidor recibió el comprobante.");
      console.log("Mira tu panel administrativo o tu teléfono:");
      console.log("1. Deberías recibir la notificación push.");
      console.log("2. Deberías escuchar el sonido de caja registradora.\n");
      
      console.log("⏳ Esperando 15 segundos para dar tiempo a que lleguen las notificaciones push...");
      await new Promise(r => setTimeout(r, 15000));

      console.log("🧹 Limpiando base de datos (eliminando pedido de prueba)...");
      await Pedido.deleteMany({ whatsappId: TEST_PHONE });
      await Etiqueta.deleteMany({ telefono: TEST_PHONE });
      console.log("✨ Base de datos limpia. El pedido de prueba no ensuciará tus métricas reales.");
      console.log("   (Refresca el navegador si el pedido ficticio aún aparece en el Kanban).");
    } else {
      console.error(`\n❌ Error: El servidor respondió con status ${response.status}`);
    }
  } catch (error) {
    console.error(`\n💥 Error enviando el webhook:`, error.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

simulateReceipt();
