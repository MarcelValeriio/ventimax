import mongoose, { Schema } from "mongoose";
import { IMetodoEnvio } from "../types/models";

const MetodoEnvioSchema = new Schema<IMetodoEnvio>(
  {
    nombre: { type: String, required: true, trim: true },
    tipo: {
      type: String,
      required: true,
      enum: ["delivery_local", "envio_nacional", "retiro", "otro"],
    },
    descripcion: { type: String, default: "" },
    costoTipo: {
      type: String,
      required: true,
      enum: ["fijo", "a_convenir"],
      default: "a_convenir",
    },
    costo: { type: Number, default: 0 },
    pideDatos: { type: String, default: "" },
    activo: { type: Boolean, default: true },
    orden: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MetodoEnvioSchema.index({ activo: 1, orden: 1 });

module.exports = mongoose.model<IMetodoEnvio>("MetodoEnvio", MetodoEnvioSchema);
