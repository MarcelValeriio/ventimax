/**
 * scripts/seed-pagination-test.js
 * Crea 25 pedidos de prueba para verificar la paginación del Sales Dashboard.
 */
const mongoose = require("mongoose");
const Pedido = require("../models/Pedido");
const Counter = require("../models/Counter");
require("dotenv").config();

async function seed() {
  try {
    console.log("🌱 Conectando a la base de datos para sembrar datos de prueba...");
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost/reply-bot-pachi");
    
    // 1. Limpiar pedidos de prueba anteriores si existen (opcional, pero mejor para claridad)
    // await Pedido.deleteMany({ whatsappId: "TEST_PAGINATION" });

    console.log("📝 Generando 25 pedidos de prueba...");
    const baseDate = new Date();
    const pedidos = [];

    for (let i = 1; i <= 25; i++) {
      // Variar las fechas para que no todos salgan hoy
      const date = new Date(baseDate);
      date.setHours(baseDate.getHours() - i); // Un pedido por hora hacia atrás

      pedidos.push({
        whatsappId: "TEST_PAGINATION",
        correlativo: `TEST-${1000 + i}`,
        cliente: {
          nombre: `Cliente de Prueba ${i}`,
          cedula: `1234567${i}`
        },
        items: [
          { producto: "Empanada Gallega", cantidad: 1, price: 10, subtotal: 10 }
        ],
        pago: {
          metodo: "efectivo",
          montoUSD: 10,
          montoVES: 550,
          tasa: 55,
          confirmado: true
        },
        estado: "entregado",
        timestamp: date,
        verifiedAt: date,
        deliveredAt: new Date(date.getTime() + 30 * 60000) // 30 mins después
      });
    }

    await Pedido.insertMany(pedidos);
    console.log(`✅ ¡Éxito! Se han insertado 25 pedidos con el prefijo TEST-XXXX.`);
    console.log("Ahora puedes refrescar el Sales Dashboard para ver la paginación en acción.");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error sembrando datos:", error);
    process.exit(1);
  }
}

seed();
