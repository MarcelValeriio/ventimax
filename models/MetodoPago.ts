import mongoose, { Schema } from "mongoose";
import { IMetodoPago } from "../types/models";

const MetodoPagoSchema = new Schema<IMetodoPago>(
  {
    tipo: {
      type: String,
      required: true,
      enum: ["transferencia", "pago_movil", "zelle", "binance", "efectivo", "otro"],
    },
    nombre: { type: String, required: true },
    detalles: { type: Object, default: {} },
    notaAdicional: { type: String, default: "" },
    activo: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model<IMetodoPago>("MetodoPago", MetodoPagoSchema);
