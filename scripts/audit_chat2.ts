import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
const Mensaje = require('./models/Mensaje');
const Etiqueta = require('./models/Etiqueta');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const phone = "584249431417";
    
    const etiquetas = await Etiqueta.find({ whatsappId: { $regex: phone } });
    console.log("=== ETIQUETAS ENCONTRADAS ===");
    console.log(etiquetas);

    const mensajes = await Mensaje.find({ usuarioId: { $regex: phone } }).sort({ timestamp: -1 }).limit(100);
    console.log(`\n=== MENSAJES ENCONTRADOS: ${mensajes.length} ===`);
    
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
