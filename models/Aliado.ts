import mongoose, { Schema } from "mongoose";
import { IAliado } from "../types/models";
const configManager = require("../services/configManager");

const AliadoSchema = new Schema<IAliado>(
  {
    nombre: { type: String, required: true, trim: true, maxlength: 60 },
    descripcion: { type: String, required: true, trim: true, maxlength: 400 },
    logoUrl: { type: String, default: "", trim: true },
    logoPublicId: { type: String, default: "", trim: true },
    orden: { type: Number, default: 0 },
    activo: { type: Boolean, default: true },
    brand: {
      type: String,
      default: () => {
        try {
          return configManager.getBrand();
        } catch {
          return "default";
        }
      },
    },
  },
  { timestamps: true }
);

AliadoSchema.index({ brand: 1, activo: 1, orden: 1 });

module.exports = mongoose.model<IAliado>("Aliado", AliadoSchema);
