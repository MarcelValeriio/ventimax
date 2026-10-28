import mongoose, { Schema } from "mongoose";
import { IPedido, EstadoPedido } from "../types/models";

const PedidoSchema = new Schema<IPedido>({
  whatsappId: { type: String, required: true },
  cliente: {
    nombre: { type: String },
    cedula: { type: String },
    telefono: { type: String }
  },
  items: [
    {
      producto: { type: String, required: true },
      price: { type: Number, required: true },
      cantidad: { type: Number, required: true }
    }
  ],
  ubicacion: {
    latitud: { type: Number },
    longitud: { type: Number },
    direccion: { type: String }
  },
  envio: {
    metodoId: { type: Schema.Types.ObjectId, ref: "MetodoEnvio" },
    nombre: { type: String },
    tipo: { type: String },
    costo: { type: Number, default: 0 },
    aConvenir: { type: Boolean, default: false }
  },
  notas: { type: String, default: null },
  pago: {
    metodo: { type: String },
    montoUSD: { type: Number },
    montoVES: { type: Number },
    tasa: { type: Number },
    comprobanteMediaId: { type: String },
    comprobanteUrl: { type: String },
    pagoCon: { type: Number, default: 0 },
    vuelto: { type: Number, default: 0 },
    pagoEfectivo: { type: Number, default: 0 },
    pagoDigitalVES: { type: Number, default: 0 }
  },
  ctwaClid: { type: String, default: null },
  idFormateado: { type: String },
  correlativo: { type: String },
  repartidor: { type: String, default: null },
  estado: { 
    type: String, 
    enum: ["pendiente_pago", "pendiente_verificacion", "verificado", "en_ruta", "confirmado", "entregado", "cancelado"],
    default: "pendiente_pago"
  },
  timestamp: { type: Date, default: Date.now },
  verifiedAt: { type: Date },
  deliveredAt: { type: Date }
});

// Índices para consultas frecuentes
PedidoSchema.index({ whatsappId: 1, estado: 1 });          // Búsqueda de pedido activo por usuario
PedidoSchema.index({ estado: 1, timestamp: -1 });           // Kanban: filtrar por estado ordenado por fecha
PedidoSchema.index({ correlativo: 1 }, { unique: true, sparse: true }); // Búsqueda por #pedido
PedidoSchema.index({ "cliente.cedula": 1 });                // Búsqueda por cédula
PedidoSchema.index({ "pago.metodo": 1 });                   // Reportes por método de pago

module.exports = mongoose.model<IPedido>("Pedido", PedidoSchema);
