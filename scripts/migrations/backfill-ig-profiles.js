/**
 * scripts/backfill-ig-profiles.js
 * 
 * Script de backfill para consultar y actualizar los perfiles reales de Instagram
 * en los documentos de EtiquetaIg que no tienen username registrado.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const EtiquetaIg = require("../models/EtiquetaIg");
const { getUserIgProfile } = require("../services/instagram");

async function runBackfill() {
  console.log("==========================================================");
  console.log("🔄 BACKFILL DE PERFILES REALES DE INSTAGRAM");
  console.log("==========================================================\n");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI no configurado en el entorno.");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 5000 });
    console.log("✅ Conectado a MongoDB Atlas\n");

    const pendientes = await EtiquetaIg.find({
      $or: [
        { username: null },
        { username: "" },
        { username: { $exists: false } },
        { profilePic: null },
        { profilePic: "" },
        { profilePic: { $exists: false } },
      ],
    });

    console.log(`📋 Encontradas ${pendientes.length} etiquetas de Instagram sin username o sin avatar.\n`);

    let actualizados = 0;
    let fallidos = 0;

    for (const et of pendientes) {
      console.log(`🔍 Consultando perfil para usuario: ${et.usuarioIgId}...`);
      try {
        const profile = await getUserIgProfile(et.usuarioIgId);
        if (profile && (profile.username || profile.profilePic)) {
          if (profile.username) et.username = profile.username;
          if (profile.name) et.nombre = profile.name;
          if (profile.profilePic) {
            et.profilePic = profile.profilePic;
            et.metadata = et.metadata || {};
            et.metadata.profilePic = profile.profilePic;
          }
          await et.save();
          console.log(`   ✅ Actualizado -> @${et.username || "sin_username"} (${et.nombre || "sin nombre"}) [Avatar: ${et.profilePic ? "Cloudinary" : "N/A"}]`);
          actualizados++;
        } else {
          console.log(`   ⚠️ No se pudo obtener perfil para ${et.usuarioIgId} (token o permisos de API)`);
          fallidos++;
        }
      } catch (err) {
        console.error(`   ❌ Error consultando ${et.usuarioIgId}:`, err.message);
        fallidos++;
      }
    }

    console.log("\n==========================================================");
    console.log(`📊 RESULTADO BACKFILL: ${actualizados} actualizados, ${fallidos} sin cambios.`);
    console.log("==========================================================\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("💥 Error en backfill de Instagram:", error);
    process.exit(1);
  }
}

runBackfill();
