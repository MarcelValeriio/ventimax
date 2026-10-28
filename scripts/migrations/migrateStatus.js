/**
 * scripts/migrateStatus.js
 * Script para migrar estados antiguos 'en_cocina' o 'confirmado' a 'verificado'
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Pedido = require("../models/Pedido");

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado a MongoDB Atlas.");

    const res = await Pedido.updateMany(
      { estado: { $in: ["en_cocina", "confirmado"] } },
      { $set: { estado: "verificado" } }
    );

    console.log(`✨ Migración completada. ${res.modifiedCount} pedidos actualizados a 'verificado'.`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error en migración:", error);
    process.exit(1);
  }
}

migrate();
