require("dotenv").config();
const mongoose = require("mongoose");
const EtiquetaIg = require("../dist/models/EtiquetaIg");
const Pedido = require("../dist/models/Pedido");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const idStr = "28711549578440592";
  
  const et = await EtiquetaIg.findOne({ usuarioIgId: idStr });
  console.log("EtiquetaIg:", et ? { 
    id: et.usuarioIgId, 
    metadata: et.metadata, 
    origen: et.origen,
    canal: et.canal 
  } : "No encontrada");
  
  const ped = await Pedido.findOne({ whatsappId: idStr });
  console.log("Pedido (whatsappId == idStr):", ped ? ped.correlativo : "No encontrado");
  
  const peds = await Pedido.find({ "cliente.telefono": idStr });
  console.log("Pedidos (cliente.telefono == idStr):", peds.map(p => p.correlativo));

  process.exit(0);
}
run();
