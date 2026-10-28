import mongoose, { Schema } from "mongoose";
import { IContadorCatalogo } from "../types/models";

const ContadorCatalogoSchema = new Schema<IContadorCatalogo>(
  {
    fecha: { type: String, required: true, index: true },
    tipo: {
      type: String,
      required: true,
      enum: ["creado", "limite", "honeypot", "validacion", "producto"],
      index: true,
    },
    cantidad: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ContadorCatalogoSchema.index({ fecha: 1, tipo: 1 }, { unique: true });

module.exports = mongoose.model<IContadorCatalogo>("ContadorCatalogo", ContadorCatalogoSchema);
