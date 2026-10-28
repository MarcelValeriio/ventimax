/**
 * scripts/migrate-shorten-faqs.js
 * 
 * Migración en sitio para acortar las preguntas de las FAQs existentes en MongoDB
 * según su campo `order` (0..8), asegurando que todas midan <= 24 caracteres
 * para encajar perfectamente en las filas de las listas interactivas de WhatsApp.
 * 
 * Ejecución manual (cuando se indique):
 * node scripts/migrate-shorten-faqs.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const FAQ = require("../models/FAQ");

const SHORT_QUESTIONS_BY_ORDER = {
  0: "¿Qué sabores hay?",         // 17 chars
  1: "¿Cuántas unidades?",        // 18 chars
  2: "¿Cuánto cuesta?",           // 15 chars
  3: "¿Qué tamaño tienen?",       // 19 chars
  4: "¿Cuánto pesa la caja?",     // 21 chars
  5: "¿Dónde están?",             // 13 chars
  6: "¿Hacen delivery?",          // 16 chars
  7: "¿Cuál es el horario?",      // 20 chars
  8: "¿Las cajitas son mixtas?",  // 24 chars
};

async function runMigration() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI no definida en variables de entorno");
    process.exit(1);
  }

  console.log("🔄 Conectando a MongoDB...");
  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 15000 });
  console.log("✅ Conectado a MongoDB.\n");

  let updatedCount = 0;

  for (const [orderStr, shortQuestion] of Object.entries(SHORT_QUESTIONS_BY_ORDER)) {
    const order = Number(orderStr);
    const existing = await FAQ.findOne({ order, brand: "default" });

    if (existing) {
      const oldTitle = existing.pregunta;
      existing.pregunta = shortQuestion;
      await existing.save();
      console.log(`✅ [Order ${order}] Actualizado: "${oldTitle}" (${oldTitle.length} chars) → "${shortQuestion}" (${shortQuestion.length} chars)`);
      updatedCount++;
    } else {
      console.log(`⚠️ [Order ${order}] No se encontró FAQ previa con este order. Creándola...`);
      await FAQ.create({
        pregunta: shortQuestion,
        order,
        brand: "default",
        activo: true,
        type: order === 0 ? "dinamica" : "estatica",
        dynamicKey: order === 0 ? "sabores" : null,
      });
      updatedCount++;
    }
  }

  console.log(`\n🎉 Migración completada exitosamente. Total FAQs procesadas: ${updatedCount}`);
  await mongoose.connection.close();
}

if (require.main === module) {
  runMigration().catch((err) => {
    console.error("💀 Error fatal durante la migración:", err.message);
    process.exit(1);
  });
}

module.exports = { SHORT_QUESTIONS_BY_ORDER, runMigration };
