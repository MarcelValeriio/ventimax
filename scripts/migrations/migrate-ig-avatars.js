/**
 * scripts/migrate-ig-avatars.js
 * 
 * Script de migración para actualizar y forzar la persistencia en Cloudinary
 * de todos los avatares temporales (scontent / fbcdn) o ausentes de Instagram.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const EtiquetaIg = require("../models/EtiquetaIg");
const { getUserIgProfile } = require("../services/instagram");

async function runMigration() {
  console.log("==========================================================");
  console.log("🔄 MIGRACIÓN Y REFRESCO DE AVATARES DE INSTAGRAM (CLOUDINARY)");
  console.log("==========================================================\n");

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI no configurado en las variables de entorno.");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, { family: 4, serverSelectionTimeoutMS: 5000 });
    console.log("✅ Conectado a MongoDB Atlas\n");

    const query = {
      $or: [
        { profilePic: null },
        { profilePic: "" },
        { profilePic: { $exists: false } },
        { profilePic: { $regex: /scontent|fbcdn|fbsbx|lookaside/i } },
        { "metadata.profilePic": { $regex: /scontent|fbcdn|fbsbx|lookaside/i } },
        { profilePic: { $not: /cloudinary/i } },
      ],
    };

    const pendientes = await EtiquetaIg.find(query);
    console.log(`📋 Encontradas ${pendientes.length} etiquetas de Instagram con avatar pendiente o no-Cloudinary.\n`);

    if (pendientes.length === 0) {
      console.log("✨ Todos los perfiles de Instagram ya tienen fotos permanentes en Cloudinary o no tienen pendientes.");
      await mongoose.disconnect();
      process.exit(0);
    }

    let actualizados = 0;
    let omitidos = 0;
    let fallidos = 0;

    for (const et of pendientes) {
      console.log(`🔍 Procesando @${et.username || "sin_username"} (ID: ${et.usuarioIgId})...`);
      try {
        const profile = await getUserIgProfile(et.usuarioIgId);
        if (profile) {
          let modified = false;
          if (profile.username && et.username !== profile.username) {
            et.username = profile.username;
            modified = true;
          }
          if (profile.name && et.nombre !== profile.name) {
            et.nombre = profile.name;
            modified = true;
          }
          if (profile.profilePic && et.profilePic !== profile.profilePic) {
            et.profilePic = profile.profilePic;
            et.metadata = et.metadata || {};
            et.metadata.profilePic = profile.profilePic;
            modified = true;
          }

          if (modified) {
            await et.save();
            console.log(`   ✅ Actualizado -> @${et.username} (${et.nombre || "sin nombre"}) [Avatar: ${et.profilePic?.includes("cloudinary") ? "Cloudinary ✅" : et.profilePic || "N/A"}]`);
            actualizados++;
          } else {
            console.log(`   ℹ️ Sin cambios en el perfil.`);
            omitidos++;
          }
        } else {
          console.log(`   ⚠️ No se obtuvo perfil para ${et.usuarioIgId}`);
          omitidos++;
        }
      } catch (err) {
        console.error(`   ❌ Error en ${et.usuarioIgId}:`, err.message);
        fallidos++;
      }
    }

    console.log("\n==========================================================");
    console.log(`📊 RESULTADO DE MIGRACIÓN:`);
    console.log(`   - Actualizados: ${actualizados}`);
    console.log(`   - Omitidos/Sin cambios: ${omitidos}`);
    console.log(`   - Fallidos: ${fallidos}`);
    console.log("==========================================================\n");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("💥 Error en migración de avatares de Instagram:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigration();
}

module.exports = { runMigration };
