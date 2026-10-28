/**
 * scripts/analyze-faqs.js — ANÁLISIS DE SOLO LECTURA
 * Lee los mensajes de clientes (direccion: "cliente") de MongoDB y agrupa
 * las preguntas más frecuentes por tema y por texto. NO escribe nada.
 */
require("dotenv").config();
const mongoose = require("mongoose");

const normalize = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

// Temas de FAQ con sus keywords (todas en minúsculas y sin tildes)
const TOPICS = [
  {
    topic: "Precio / costo",
    kw: [
      "precio",
      "costo",
      "cuanto",
      "cuanto cuesta",
      "precios",
      "vale",
      "cuesta",
      "barato",
      "economico",
    ],
  },
  {
    topic: "Envío / delivery",
    kw: [
      "envio",
      "envios",
      "delivery",
      "domicilio",
      "envian",
      "envia",
      "reparto",
      "entrega",
      "entregas",
      "costo de envio",
    ],
  },
  {
    topic: "Tiempo de entrega",
    kw: [
      "demora",
      "tarda",
      "tardan",
      "cuanto tarda",
      "tiempo",
      "llegada",
      "cuando llega",
      "cuando llegan",
    ],
  },
  {
    topic: "Pago / método",
    kw: [
      "pago",
      "pagos",
      "metodo",
      "metodos",
      "efectivo",
      "pago movil",
      "transferencia",
      "tarjeta",
      "zelle",
      "divisa",
      "pagar",
    ],
  },
  {
    topic: "Ubicación / dirección",
    kw: [
      "ubicacion",
      "donde",
      "direccion",
      "ubicados",
      "donde estan",
      "direccion del local",
      "sede",
    ],
  },
  {
    topic: "Horario",
    kw: [
      "horario",
      "hora",
      "abren",
      "abierto",
      "abiertos",
      "cierran",
      "horarios",
      "atienden",
    ],
  },
  {
    topic: "Menú / productos",
    kw: [
      "menu",
      "catalogo",
      "productos",
      "que tienen",
      "que venden",
      "que ofrecen",
      "opciones",
      "platos",
      "comida",
    ],
  },
  {
    topic: "Zona de cobertura",
    kw: [
      "zona",
      "cobertura",
      "llegan a",
      "entregan en",
      "envian a",
      "hacen envio a",
    ],
  },
  {
    topic: "Comprobante / recibo",
    kw: ["comprobante", "recibo", "factura", "captura", "foto del pago"],
  },
  {
    topic: "Redes / Instagram",
    kw: ["instagram", "redes", "facebook", "tiktok", "whatsapp"],
  },
];

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI no definida en .env");
    process.exit(1);
  }

  await mongoose.connect(uri, {
    family: 4,
    serverSelectionTimeoutMS: 15000,
  });
  console.log("✅ Conectado (solo lectura).\n");

  const db = mongoose.connection.db;
  const col = db.collection("mensajes");

  // Mensajes de clientes, tipo texto
  const cursor = col.find(
    { direccion: "cliente" },
    { projection: { texto: 1, tipo: 1, timestamp: 1 } },
  );

  const topicCount = {};
  const questionFreq = {};
  let total = 0;
  let questions = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    const raw = (doc.texto || "").trim();
    if (!raw) continue;
    total++;
    const norm = normalize(raw);

    // Contar temas
    for (const t of TOPICS) {
      if (t.kw.some((k) => norm.includes(normalize(k)))) {
        topicCount[t.topic] = (topicCount[t.topic] || 0) + 1;
      }
    }

    // Detectar si es pregunta
    const isQuestion =
      raw.includes("?") ||
      /^(cuanto|cuanta|como|donde|cuando|que|cual|cuales|tienen|hay|aceptan|hacen|entregan|envian|puedo|pueden|precio|costo|metodo|formas|horario)/.test(
        norm,
      );

    if (isQuestion) {
      questions++;
      const key = norm.replace(/\s+/g, " ").trim();
      if (key.length >= 4) {
        questionFreq[key] = (questionFreq[key] || 0) + 1;
      }
    }
  }

  console.log(`📊 Total mensajes de clientes analizados: ${total}`);
  console.log(`❓ Mensajes detectados como preguntas: ${questions}\n`);

  console.log("=".repeat(60));
  console.log("🧭 FRECUENCIA POR TEMA (preguntas frecuentes)");
  console.log("=".repeat(60));
  const sortedTopics = Object.entries(topicCount).sort((a, b) => b[1] - a[1]);
  for (const [topic, count] of sortedTopics) {
    console.log(`${String(count).padStart(5)}  ${topic}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log("💬 PREGUNTAS LITERALES MÁS FRECUENTES (top 40)");
  console.log("=".repeat(60));
  const sortedQ = Object.entries(questionFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40);
  for (const [q, count] of sortedQ) {
    console.log(`${String(count).padStart(5)}  ${q}`);
  }

  await mongoose.connection.close();
  console.log("\n✅ Análisis completado (sin escrituras).");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
