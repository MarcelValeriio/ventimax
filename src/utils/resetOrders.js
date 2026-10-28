require("dotenv").config();
const mongoose = require("mongoose");
const Pedido = require("../../models/Pedido");
const Counter = require("../../models/Counter");

/**
 * Script de Utilidad: Reinicio de Pedidos y Contadores
 * Garantiza el vaciado absoluto de la colección mediante Mongoose y el reset del correlativo a #001.
 */
const resetOrders = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI no encontrada en las variables de entorno (.env).");
    }

    console.log("-----------------------------------------");
    console.log("🔍 Conectando a MongoDB para limpieza profunda...");
    
    await mongoose.connect(mongoUri, { 
      family: 4, 
      serverSelectionTimeoutMS: 5000 
    });
    
    console.log("✅ Conexión establecida exitosamente.");

    // 1. Vaciado Absoluto mediante el Modelo de Mongoose
    // Se utiliza el modelo directamente para que Mongoose use la colección mapeada correctamente.
    console.log("🧹 Iniciando vaciado de la colección de pedidos...");
    const result = await Pedido.deleteMany({});
    console.log(`✅ Colección limpia. Se eliminaron ${result.deletedCount} registros.`);

    // 2. Reinicio del Contador Correlativo
    // Seteamos seq a 0 para que el próximo incremento ($inc: 1) resulte en 1 (#001).
    console.log("🔢 Reiniciando el contador de comandas ('pedidoId')...");
    await Counter.updateOne(
      { _id: "pedidoId" },
      { $set: { seq: 0 } },
      { upsert: true }
    );
    console.log("✅ Contador reseteado exitosamente a cero.");

    console.log("🚀 Base de datos en cero absoluto y lista para operar.");
    console.log("-----------------------------------------");
  } catch (error) {
    console.error("❌ ERROR CRÍTICO DURANTE EL RESET:", error.message);
  } finally {
    // 3. Desconexión Limpia de Mongoose
    await mongoose.disconnect();
    console.log("🔌 Conexión a MongoDB cerrada.");
    process.exit(0);
  }
};

// Ejecución del procedimiento asíncrono
resetOrders();
