/**
 * scripts/seed-faqs.js — Siembra FAQs iniciales en MongoDB (idempotente por order).
 * Actualiza en sitio por `order` para no duplicar si se re-ejecuta con preguntas acortadas.
 * Ejecutar: node scripts/seed-faqs.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const FAQ = require("../models/FAQ");

// Lista de FAQs a sembrar con preguntas cortas (<= 24 caracteres para WhatsApp List).
const FAQS = [
  {
    pregunta: "¿Qué sabores hay?",
    keywords: [
      "sabores",
      "sabor",
      "relleno",
      "rellenos",
      "de que estan",
      "ingredientes",
      "que sabores hay",
      "sabores disponibles",
      "que sabores tienen",
      "cuales sabores",
    ],
    respuesta: "Consultando sabores disponibles...",
    type: "dinamica",
    dynamicKey: "sabores",
    order: 0,
  },
  {
    pregunta: "¿Cuántas unidades?",
    keywords: [
      "unidades",
      "cuantas trae",
      "cuantas unidades",
      "por racion",
      "por paquete",
      "por cajita",
      "cuantos dumplings",
      "cuantas vienen",
    ],
    respuesta: "Cada cajita trae *25 unidades*.",
    order: 1,
  },
  {
    pregunta: "¿Cuánto cuesta?",
    keywords: [
      "precio",
      "precios",
      "cuanto cuesta",
      "cuanto valen",
      "costo",
      "vale",
      "cuesta",
    ],
    respuesta:
      "El precio de cada cajita es *$15* (calculado a tasa BCV del día).",
    order: 2,
  },
  {
    pregunta: "¿Qué tamaño tienen?",
    keywords: [
      "tamano",
      "tamaño",
      "medida",
      "cuanto mide",
      "diametro",
      "que tamano",
      "grande",
      "centimetros",
      "cm",
    ],
    respuesta:
      "Nuestros dumplings miden aproximadamente *6 cm* de diámetro cada uno.",
    order: 3,
  },
  {
    pregunta: "¿Cuánto pesa la caja?",
    keywords: [
      "peso",
      "pesa",
      "cuanto pesa",
      "gramos",
      "gramo",
      "peso de la caja",
      "cuanto trae",
    ],
    respuesta: "Cada caja pesa *650 gramos* (650 gr).",
    order: 4,
  },
  {
    pregunta: "¿Dónde están?",
    keywords: [
      "ubicacion",
      "donde",
      "direccion",
      "tienda",
      "local",
      "ubicados",
      "donde estan",
      "sede",
      "fisica",
    ],
    respuesta:
      "No somos tienda física. Hacemos delivery en Caracas o puedes hacer pick up comprando directamente en nuestro punto aliado:\n\n📍 *Ubicación:* Club Social Chino, Av. Principal de El Bosque (Chacaíto) Lunes a Domingo de 8:30am a 6:30pm.\n\n🏪 *Local:* Kelly Bakery (dentro del mercado, al fondo en la planta baja).\n\nPuedes acercarte sin inconvenientes ¡Te esperamos! 🥟✨",
    order: 5,
  },
  {
    pregunta: "¿Hacen delivery?",
    keywords: [
      "delivery",
      "pickup",
      "retiro",
      "recoger",
      "presencial",
      "tienda fisica",
      "envios",
      "domicilio",
    ],
    respuesta:
      "No somos tienda física. Hacemos delivery en Caracas o puedes hacer pick up comprando directamente en nuestro punto aliado:\n\n📍 *Ubicación:* Club Social Chino, Av. Principal de El Bosque (Chacaíto) Lunes a Domingo de 8:30am a 6:30pm.\n\n🏪 *Local:* Kelly Bakery (dentro del mercado, al fondo en la planta baja).\n\nPuedes acercarte sin inconvenientes ¡Te esperamos! 🥟✨",
    order: 6,
  },
  {
    pregunta: "¿Cuál es el horario?",
    keywords: [
      "horario",
      "hora",
      "abren",
      "abierto",
      "abiertos",
      "cierran",
      "atienden",
      "que dias",
    ],
    respuesta: "Nuestro horario es *Lunes a Viernes de 10:00 am a 5:00 pm*.",
    order: 7,
  },
  {
    pregunta: "¿Las cajitas son mixtas?",
    keywords: [
      "mixto",
      "mixta",
      "mixtos",
      "mixtas",
      "variado",
      "variada",
      "surtido",
      "surtidos",
      "varios sabores",
      "un solo empaque",
      "mezclar sabores",
    ],
    respuesta:
      "No, cada cajita es de *un solo sabor*. No hacemos pedidos mixtos en un mismo empaque.",
    order: 8,
  },
  {
    pregunta: "¿Cuál es el menú?",
    keywords: [
      "menu",
      "menú",
      "carta",
      "catalogo",
      "catálogo",
      "lista de precios",
      "que tienen",
      "que venden",
      "productos",
      "platos",
    ],
    respuesta: "Consultando menú disponible...",
    type: "dinamica",
    dynamicKey: "menu",
    order: 9,
  },
];

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI no definida en .env");
    process.exit(1);
  }

  await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 15000 });
  console.log("✅ Conectado a MongoDB.\n");

  for (const faq of FAQS) {
    const existing = await FAQ.findOneAndUpdate(
      { order: faq.order, brand: "default" },
      { $set: { ...faq, brand: "default", activo: true } },
      { upsert: true, returnDocument: "after" },
    );
    console.log(
      `📌 FAQ [order ${faq.order}] "${faq.pregunta}" → ${existing._id ? "actualizada/creada" : "error"} (id: ${existing._id})`,
    );
  }

  const total = await FAQ.countDocuments({ brand: "default" });
  console.log(`\n✅ Total de FAQs en la base: ${total}`);

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
