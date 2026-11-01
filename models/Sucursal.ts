import mongoose, { Schema } from "mongoose";
import { ISucursal } from "../types/models";

const SucursalSchema = new Schema<ISucursal>(
  {
    empresa: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      enum: ["zoom", "mrw", "tealca"],
    },
    codigo: {
      type: String,
      required: true,
      trim: true,
    },
    nombre: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    estado: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    ciudad: {
      type: String,
      default: "",
      trim: true,
      maxlength: 60,
    },
    direccion: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    telefono: {
      type: String,
      default: "",
      trim: true,
      maxlength: 30,
    },
    horario: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    lat: {
      type: Number,
      default: null,
    },
    lng: {
      type: Number,
      default: null,
    },
    activa: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Índice único por empresa y código oficial
SucursalSchema.index({ empresa: 1, codigo: 1 }, { unique: true });

// Índice para consultas por estado en la API pública de la tienda
SucursalSchema.index({ empresa: 1, estado: 1, activa: 1 });

module.exports = mongoose.model<ISucursal>("Sucursal", SucursalSchema);
