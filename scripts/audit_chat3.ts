import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
const Mensaje = require('./models/Mensaje');
const Etiqueta = require('./models/Etiqueta');
const Pedido = require('./models/Pedido');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const phone = "4249431417";
    
    const etiquetas = await Etiqueta.find({ whatsappId: { $regex: phone } });
    console.log("=== ETIQUETAS ENCONTRADAS ===");
    console.log(etiquetas.map(e => e.whatsappId));

    const mensajes = await Mensaje.find({ usuarioId: { $regex: phone } }).sort({ timestamp: -1 }).limit(10);
    console.log(`\n=== MENSAJES ENCONTRADOS: ${mensajes.length} ===`);
    console.log(mensajes.map(m => m.usuarioId));

    const pedidos = await Pedido.find({ "cliente.telefono": { $regex: phone } });
    console.log("\n=== PEDIDOS ENCONTRADOS ===");
    console.log(pedidos.map(p => p.cliente.telefono));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
