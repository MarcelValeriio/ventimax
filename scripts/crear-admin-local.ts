/**
 * Crea el primer usuario administrador en el MongoDB LOCAL de Docker.
 * Uso: npx tsx scripts/crear-admin-local.ts <usuario> <contraseña>
 *
 * Se niega a correr contra una base que no sea 127.0.0.1/localhost y no hace nada si ya existe
 * algún usuario. No carga el .env.
 */
import mongoose from "mongoose";

const Usuario = require("../models/Usuario");

const URI = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/ventimax_local";

async function main() {
  const [username, password] = process.argv.slice(2);

  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URI)) {
    console.error("❌ Este script solo trabaja con la base local (127.0.0.1 o localhost).");
    process.exit(1);
  }
  if (!username || !password) {
    console.error("Uso: npx tsx scripts/crear-admin-local.ts <usuario> <contraseña>");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("❌ La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  await mongoose.connect(URI, { serverSelectionTimeoutMS: 3000 });
  try {
    const existentes = await Usuario.countDocuments();
    if (existentes > 0) {
      console.log(`ℹ️ Ya hay ${existentes} usuario(s) en la base local; no se crea ninguno.`);
      return;
    }
    await Usuario.create({ username, password, nombre: "Administrador", role: "admin" });
    console.log(`✅ Administrador '${username}' creado en la base local.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ No se pudo crear el administrador:", err.message);
  console.error("   ¿Está levantado MongoDB? docker compose -f docker-compose.local.yml up -d");
  process.exit(1);
});
