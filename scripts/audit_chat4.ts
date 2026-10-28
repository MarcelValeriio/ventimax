import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
const Pedido = require('./models/Pedido');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const phone = "584249431417";
    
    const pedidos = await Pedido.find({ "cliente.telefono": { $regex: phone } });
    console.log(JSON.stringify(pedidos, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
