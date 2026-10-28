import mongoose, { Schema } from "mongoose";
import { ICarritoWeb } from "../types/models";

const CarritoWebItemSchema = new Schema(
  {
    productoId: { type: String, required: true },
    nombre: { type: String, required: true },
    precio: { type: Number, required: true },
    cantidad: { type: Number, required: true },
  },
  { _id: false }
);

const CarritoWebSchema = new Schema<ICarritoWeb>(
  {
    codigo: { type: String, required: true, unique: true, uppercase: true, trim: true },
    items: { type: [CarritoWebItemSchema], required: true },
    total: { type: Number, required: true },
    estado: { type: String, enum: ["pendiente", "vinculado"], default: "pendiente" },
    telefono: { type: String, default: null },
    pedidoId: { type: Schema.Types.ObjectId, ref: "Pedido", default: null },
    creadoEn: { type: Date, default: Date.now },
    expiraEn: { type: Date, required: true },
  },
  { timestamps: true }
);

// Índice TTL: MongoDB borra automáticamente los documentos cuya fecha expiraEn haya pasado
CarritoWebSchema.index({ expiraEn: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model<ICarritoWeb>("CarritoWeb", CarritoWebSchema);
