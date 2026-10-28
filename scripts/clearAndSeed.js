/**
 * scripts/clearAndSeed.js
 * Script de emergencia para purgar datos corruptos en MongoDB Atlas
 * y establecer el catálogo real de comida asiática.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Producto = require("../models/Producto");

const REAL_PRODUCTS = [
  {
    id: "prod-001",
    name: "Combo Pachi Familiar",
    price: 25.0,
    description:
      "Combo completo para toda la familia: 12 dumplings artesanales y 4 bao buns rellenos.",
    emoji: "🥡",
    categoria: "Combos",
    activo: true,
  },
  {
    id: "prod-002",
    name: "Pachi Dog Clásico",
    price: 5.0,
    description:
      "El original de la casa: Pan artesanal al vapor con salchicha premium y toppings asiáticos.",
    emoji: "🌭",
    categoria: "Individual",
    activo: true,
  },
  {
    id: "prod-003",
    name: "Kit Dumplings (12 und)",
    price: 15.0,
    description:
      "Docena de dumplings congelados listos para cocinar al vapor o fritos.",
    emoji: "🥟",
    categoria: "Congelados",
    activo: true,
  },
  {
    id: "prod-004",
    name: "Kit Bao Buns (4 und)",
    price: 18.0,
    description:
      "4 panes bao artesanales con relleno de cerdo char siu o vegetales.",
    emoji: "🥠",
    categoria: "Congelados",
    activo: true,
  },
];

async function runMigration() {
  try {
    console.log("🚀 Iniciando purga de base de datos en MongoDB Atlas...");

    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI no definida en las variables de entorno.");
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conexión establecida con la nube.");

    // 1. Purga Absoluta
    console.log("🧹 Borrando rastro de juguetes, ropa y peluches antiguos...");
    const deleteRes = await Producto.deleteMany({});
    console.log(
      `🗑️ Se eliminaron ${deleteRes.deletedCount} registros antiguos de la colección de Productos.`,
    );

    // 2. Carga del Menú Real
    console.log("🥟 Insertando catálogo real de comida asiática...");
    const insertRes = await Producto.insertMany(REAL_PRODUCTS);
    console.log(
      `✨ ¡Éxito! Se insertaron ${insertRes.length} productos reales.`,
    );

    console.log("\n--- RESUMEN DEL MENÚ CARGADO ---");
    insertRes.forEach((p) =>
      console.log(`- [${p.id}] ${p.name} ($${p.price})`),
    );

    console.log("\n✅ Migración completada. Ya puedes reiniciar el servidor.");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error crítico durante la migración:", error.message);
    process.exit(1);
  }
}

runMigration();
