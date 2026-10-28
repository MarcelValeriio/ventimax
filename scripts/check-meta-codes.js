require('dotenv').config();
const mongoose = require('mongoose');
const Mensaje = require('../models/Mensaje');

async function checkMetaCodes() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Conectado a MongoDB");

    // Buscar mensajes que contengan palabras clave de códigos de verificación
    const regex = /(facebook|meta|whatsapp|código de verificación|verification code).*?\b\d{4,8}\b/i;
    
    const mensajes = await Mensaje.find({
      texto: { $regex: regex }
    }).sort({ timestamp: -1 }).limit(10);

    if (mensajes.length === 0) {
      console.log("No se encontraron códigos de Meta en la base de datos.");
    } else {
      console.log(`Se encontraron ${mensajes.length} posibles códigos de Meta:`);
      mensajes.forEach(msg => {
        console.log(`- [${msg.timestamp.toLocaleString()}] De: ${msg.telefono} | Mensaje: ${msg.texto}`);
      });
    }

    process.exit(0);
  } catch (err) {
    console.error("Error conectando o consultando BD:", err);
    process.exit(1);
  }
}

checkMetaCodes();
