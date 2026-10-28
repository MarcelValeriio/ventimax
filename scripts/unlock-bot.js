require("dotenv").config();
const mongoose = require("mongoose");

// Tu número real que está en las capturas
const MI_NUMERO = "584242555659";

async function run() {
  try {
    console.log("🔄 Conectando a MongoDB Atlas...");

    const baseUri = process.env.MONGO_URI || process.env.MONGODB_URI;

    // 🚨 Nos conectamos explícitamente a la base de datos de tus capturas: whatsapp_bot
    await mongoose.connect(baseUri, {
      dbName: "whatsapp_bot",
    });
    console.log("✅ Conexión exitosa a la base de datos real.");

    const db = mongoose.connection.db;
    console.log(`📂 Base de Datos activa: "${mongoose.connection.name}"`);

    // Listamos tus colecciones reales para comprobar el puente
    const collections = await db.listCollections().toArray();
    const listaNombres = collections.map((c) => c.name);
    console.log("📋 Colecciones reales encontradas:", listaNombres);

    console.log(
      `\n⚡ Buscando pedidos pendientes para el número: ${MI_NUMERO}...`,
    );

    // 1. Buscamos y actualizamos el pedido en la colección 'pedidos' que estaba en Kanban
    // Cambiamos el estado a 'entregado' para cerrar el ciclo viejo si quedó colgado
    const resultPedidos = await db
      .collection("pedidos")
      .updateMany(
        { $or: [{ telefono: MI_NUMERO }, { customerNumber: MI_NUMERO }] },
        { $set: { status: "entregado", estado: "entregado" } },
      );
    console.log(
      `🔹 Colección 'pedidos': Se actualizaron ${resultPedidos.modifiedCount} registros.`,
    );

    // 2. Si manejas un estado global de "intervencionHumana" o "botActive", lo limpiamos en todas tus tablas operativas
    for (const nombreCol of listaNombres) {
      if (["pedidos", "counters", "productos"].includes(nombreCol)) continue; // Evitamos tablas rígidas

      await db
        .collection(nombreCol)
        .updateMany(
          { $or: [{ telefono: MI_NUMERO }, { customerNumber: MI_NUMERO }] },
          {
            $set: {
              botActive: true,
              botActivo: true,
              intervencionHumana: false,
            },
          },
        );
    }

    console.log(
      "\n🎉 ¡Proceso de restauración completado! El entorno quedó alineado.",
    );
  } catch (error) {
    console.error("❌ Error ejecutando el script:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Conexión cerrada.");
    process.exit(0);
  }
}

run();
