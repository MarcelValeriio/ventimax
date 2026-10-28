/**
 * scripts/production-cleanup.js
 * Script definitivo para preparar el entorno de producción (Barrido de Datos).
 * Limpia pedidos, mensajes, etiquetas (estados de chat), auditoría y resetea contadores.
 * Mantiene intactos: Productos, Categorías, Usuarios y Métodos de Pago.
 */
require("dotenv").config();
const mongoose = require("mongoose");

// Importar Modelos
const Pedido = require("../models/Pedido");
const Mensaje = require("../models/Mensaje");
const Etiqueta = require("../models/Etiqueta");
const Auditoria = require("../models/Auditoria");
const Counter = require("../models/Counter");

async function runCleanup() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGO_URI o MONGODB_URI no definida en .env");
    }

    console.log("--------------------------------------------------");
    console.log("🚀 INICIANDO BARRIDO DE DATOS PARA PRODUCCIÓN...");
    console.log("--------------------------------------------------");

    await mongoose.connect(mongoUri);
    console.log("✅ Conexión establecida con la base de datos.");

    // 1. Limpieza de Pedidos
    console.log("\n📦 Limpiando colección de Pedidos...");
    const resPedidos = await Pedido.deleteMany({});
    console.log(`   - Eliminados: ${resPedidos.deletedCount} registros.`);

    // 2. Limpieza de Mensajería
    console.log("\n💬 Limpiando historial de Mensajes...");
    const resMensajes = await Mensaje.deleteMany({});
    console.log(`   - Eliminados: ${resMensajes.deletedCount} registros.`);

    // 3. Reset de Estados de Chat (Etiquetas)
    console.log("\n🔄 Reseteando flujos de chat (Etiquetas)...");
    const resEtiquetas = await Etiqueta.deleteMany({});
    console.log(`   - Eliminados: ${resEtiquetas.deletedCount} estados de chat.`);

    // 4. Limpieza de Auditoría
    console.log("\n📜 Limpiando bitácora de Auditoría...");
    const resAuditoria = await Auditoria.deleteMany({});
    console.log(`   - Eliminados: ${resAuditoria.deletedCount} registros.`);

    // 5. Reinicio de Contadores Correlativos
    console.log("\n🔢 Reiniciando contador de pedidos a #001...");
    const resCounter = await Counter.updateOne(
      { _id: "pedidoId" },
      { $set: { seq: 0 } },
      { upsert: true }
    );
    console.log("   - Contador reseteado exitosamente.");

    console.log("\n--------------------------------------------------");
    console.log("✨ ¡BARRIDO COMPLETADO EXITOSAMENTE!");
    console.log("El sistema está limpio y listo para producción.");
    console.log("Se conservaron Productos, Categorías, Usuarios y Métodos de Pago.");
    console.log("--------------------------------------------------");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ ERROR CRÍTICO DURANTE EL BARRIDO:", error.message);
    process.exit(1);
  }
}

runCleanup();
