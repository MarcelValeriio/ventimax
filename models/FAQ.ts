import mongoose, { Schema } from "mongoose";
import { IFAQ } from "../types/models";

/**
 * models/FAQ.ts
 * Modelo para Preguntas Frecuentes (FAQs) con respuesta automática por palabras clave.
 */
const FAQSchema = new Schema<IFAQ>(
  {
    pregunta: { type: String, required: true, trim: true },
    keywords: [{ type: String, trim: true }],
    respuesta: { type: String, default: "", trim: true },
    type: { type: String, enum: ["estatica", "dinamica"], default: "estatica" },
    dynamicKey: { type: String, default: null, trim: true },
    activo: { type: Boolean, default: true },
    // Solo las estáticas activas con este interruptor salen en la tienda web (F2h)
    mostrarEnTienda: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    brand: { type: String, default: "default" },
  },
  { timestamps: true }
);

FAQSchema.index({ brand: 1, activo: 1, order: 1 });

module.exports = mongoose.model<IFAQ>("FAQ", FAQSchema);
