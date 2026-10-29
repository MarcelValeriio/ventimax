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
    direccion: { type: String, default: "", trim: true, maxlength: 200 },
    horario: { type: String, default: "", trim: true, maxlength: 100 },
    // Envío nacional: empresas entre las que elige el cliente (MRW, Zoom…) y si el envío se paga al recibirlo
    // Formato F2f: [{ nombre, logoUrl, logoPublicId }]. Las filas viejas con strings se leen con services/empresasEnvio
    empresas: { type: Schema.Types.Mixed, default: () => [] },
    cobroADestino: { type: Boolean, default: false },
    activo: { type: Boolean, default: true },
    orden: { type: Number, default: 0 },
  },
  { timestamps: true }
);

MetodoEnvioSchema.index({ activo: 1, orden: 1 });

module.exports = mongoose.model<IMetodoEnvio>("MetodoEnvio", MetodoEnvioSchema);
