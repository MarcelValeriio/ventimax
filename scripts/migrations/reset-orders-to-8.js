const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Pedido = require('../models/Pedido');
  const Counter = require('../models/Counter');
  
  const pedidosAltos = await Pedido.find({
    correlativo: { $nin: [null, undefined, ''] }
  });
  
  const paraBorrar = pedidosAltos.filter(p => {
     const num = parseInt(p.correlativo.replace(/\D/g, ''), 10);
     return num > 8;
  });
  
  console.log('Pedidos a borrar:', paraBorrar.length);
  paraBorrar.forEach(p => console.log(p.correlativo, p.cliente?.nombre, p.estado));
  
  for (const p of paraBorrar) {
      await Pedido.findByIdAndDelete(p._id);
  }
  console.log('Borrados con exito.');
  
  await Counter.findByIdAndUpdate('pedidoId', { seq: 8 });
  console.log('Contador seteado a 8.');
  
  mongoose.disconnect();
}
run();
