require("dotenv").config();
const mongoose = require("mongoose");
const Pedido = require("../dist/models/Pedido");
const Etiqueta = require("../dist/models/Etiqueta");
const EtiquetaIg = require("../dist/models/EtiquetaIg");

async function audit() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB. Iniciando auditoría...");

    // Buscar pedidos manuales sin ctwaClid
    const pedidos = await Pedido.find({ 
      manual: true,
      $or: [
        { ctwaClid: { $exists: false } },
        { ctwaClid: null },
        { ctwaClid: "" }
      ]
    }).lean();

    console.log(`Se encontraron ${pedidos.length} pedidos manuales sin atribución de Ads.`);
    
    let perdidos = 0;
    const detalles = [];

    for (const p of pedidos) {
      const chatID = p.whatsappId || (p.cliente && p.cliente.telefono) || null;
      if (!chatID) continue;

      let encontradoClid = null;

      // Buscar en Etiqueta (WhatsApp)
      const waEtq = await Etiqueta.findOne({ telefono: chatID }).lean();
      if (waEtq && waEtq.ctwaClid) {
        encontradoClid = waEtq.ctwaClid;
      } else {
        // Buscar en EtiquetaIg (Instagram/Messenger)
        const igEtq = await EtiquetaIg.findOne({ 
          $or: [{ usuarioIgId: chatID }, { username: chatID }] 
        }).lean();
        
        if (igEtq && igEtq.metadata && igEtq.metadata.referral && igEtq.metadata.referral.ad_id) {
          encontradoClid = `igad_${igEtq.metadata.referral.ad_id}`;
        }
      }

      if (encontradoClid) {
        perdidos++;
        detalles.push({
          pedido: p.correlativo || p._id,
          cliente: p.cliente?.nombre || "Desconocido",
          chatID: chatID,
          ad_id: encontradoClid,
          fecha: p.timestamp || p.createdAt
        });
        
        // OPCIONAL: Podríamos actualizarlo directamente aquí si quisiéramos
        // await Pedido.updateOne({ _id: p._id }, { $set: { ctwaClid: encontradoClid } });
      }
    }

    console.log(`\n=== RESULTADO ===`);
    console.log(`Ventas manuales recuperables (provenían de Ads pero se perdió el ID): ${perdidos}`);
    if (perdidos > 0) {
      console.log(JSON.stringify(detalles, null, 2));
    }

    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
}

audit();
