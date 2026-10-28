require("dotenv").config({ path: "C:/Proyectos/reply-bot-pachi/.env" });
const mongoose = require("mongoose");
const path = require("path");

const basePath = "C:/Proyectos/reply-bot-pachi";
const Producto = require(path.join(basePath, "models/Producto"));
const Pedido = require(path.join(basePath, "models/Pedido"));
const Etiqueta = require(path.join(basePath, "models/Etiqueta"));
const Mensaje = require(path.join(basePath, "models/Mensaje"));
const Counter = require(path.join(basePath, "models/Counter"));

const CUSTOMER_PHONE = "584243308244";
const CUSTOMER_NAME = "María García";
const CUSTOMER_CEDULA = "6433140";
const PRODUCT_QUERY = "D Cerdo y Repollo Chino";
const QUANTITY = 1;
const PRICE_USD = 15;
const MONTO_VES = 11869.87;
const DIRECCION = "La trinidad (Urb escampadero. Res la Colina. Código acceso 125*. Cerca de Avepane y donde cargan los camiones cisternas de agua)";
const METODO_PAGO = "Pago Móvil";

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  await mongoose.connect(mongoUri, { family: 4, serverSelectionTimeoutMS: 10000 });

  try {
    let producto = await Producto.findOne({ name: { $regex: /cerdo.*repollo/i } });
    const productName = producto ? producto.name : PRODUCT_QUERY;
    const productPrice = producto ? producto.price : PRICE_USD;

    const imgMsg = await Mensaje.findOne({ telefono: CUSTOMER_PHONE, tipo: "image" }).sort({ timestamp: -1 });

    let counterDoc = await Counter.findOneAndUpdate({ _id: "pedidoId" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" });
    const correlativo = `#${String(counterDoc.seq || 1).padStart(3, "0")}`;

    const pedidoData = {
      whatsappId: CUSTOMER_PHONE,
      cliente: { nombre: CUSTOMER_NAME, cedula: CUSTOMER_CEDULA, telefono: CUSTOMER_PHONE },
      items: [{ producto: productName, price: productPrice, cantidad: QUANTITY }],
      ubicacion: { direccion: DIRECCION },
      pago: {
        metodo: METODO_PAGO,
        montoUSD: productPrice * QUANTITY,
        montoVES: MONTO_VES,
        tasa: Math.round((MONTO_VES / (productPrice * QUANTITY)) * 100) / 100,
        comprobanteMediaId: imgMsg ? imgMsg.mediaId : null,
        comprobanteUrl: imgMsg ? imgMsg.mediaUrl : null,
        pagoCon: 0, vuelto: 0, pagoEfectivo: 0, pagoDigitalVES: MONTO_VES,
      },
      idFormateado: correlativo,
      correlativo: correlativo,
      estado: "pendiente_verificacion",
      timestamp: new Date(),
    };

    let pedidoExistente = await Pedido.findOne({ whatsappId: CUSTOMER_PHONE, estado: { $in: ["pendiente_pago", "pendiente_verificacion"] } });
    if (pedidoExistente) {
      if (pedidoExistente.idFormateado) pedidoData.idFormateado = pedidoExistente.idFormateado;
      await Pedido.findByIdAndUpdate(pedidoExistente._id, { $set: pedidoData });
    } else {
      await Pedido.create(pedidoData);
    }

    if (producto && producto.trackStock) await Producto.findOneAndUpdate({ _id: producto._id, trackStock: true }, { $inc: { stock: -QUANTITY } });

    await Etiqueta.findOneAndUpdate(
      { telefono: CUSTOMER_PHONE },
      { $set: { paso: "inicio", etiqueta: "comprado", stuck: false, carrito: { items: [], producto_actual: null, nombre: CUSTOMER_NAME, cedula: CUSTOMER_CEDULA, direccion: DIRECCION, ubicacion: null, pago: null, pedido: null }, mensajesEnEsperaCount: 0 } },
      { upsert: true }
    );
    console.log("SUCCESS");
  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}
run();
