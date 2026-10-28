import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
const Mensaje = require('./models/Mensaje.ts');
const Etiqueta = require('./models/Etiqueta.ts');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const phone = "584249431417";
    
    console.log("=== ESTADO ACTUAL ===");
    const etiqueta = await Etiqueta.findOne({ whatsappId: phone });
    console.log(JSON.stringify(etiqueta, null, 2));

    console.log("\n=== HISTORIAL (Últimos 50) ===");
    const mensajes = await Mensaje.find({ usuarioId: phone }).sort({ timestamp: -1 }).limit(50);
    
    mensajes.reverse().forEach(m => {
      const date = new Date(m.timestamp).toLocaleString("es-VE", { timeZone: "America/Caracas" });
      const dir = m.direccion === 'inbound' ? '👤 Usuario' : '🤖 Bot';
      console.log(`[${date}] ${dir}: ${m.texto}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
