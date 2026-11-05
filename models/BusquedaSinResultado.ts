import mongoose, { Schema } from "mongoose";

/**
 * Búsquedas por vehículo que no tuvieron piezas (F1-5). Solo se registran; el análisis es F3.
 * El índice TTL borra los registros a los 365 días.
 */
const busquedaSinResultadoSchema = new Schema(
  {
    canal: { type: String, enum: ["whatsapp"], default: "whatsapp" },
    usuarioId: { type: String, required: true, trim: true, maxlength: 60 },
    marca: { type: String, trim: true, default: "", maxlength: 60 },
    modelo: { type: String, trim: true, default: "", maxlength: 60 },
    anio: { type: Number, min: 1950, max: 2100 },
    motor: { type: String, trim: true, default: "", maxlength: 20 },
    fecha: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

busquedaSinResultadoSchema.index({ fecha: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

module.exports = mongoose.model("BusquedaSinResultado", busquedaSinResultadoSchema);
