import mongoose, { Schema } from "mongoose";
import { IEtiquetaIg } from "../types/models";

const EtiquetaIgSchema = new Schema<IEtiquetaIg>(
  {
    usuarioIgId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Canal de la conversación. Retrocompatible: los documentos antiguos
    // (creados antes de Messenger) no tienen el campo y equivalen a "instagram".
    canal: {
      type: String,
      default: "instagram",
      index: true,
    },
    username: {
      type: String,
      default: null,
    },
    nombre: {
      type: String,
      default: null,
    },
    profilePic: {
      type: String,
      default: null,
    },
    paso: {
      type: String,
      default: "inicio",
      index: true,
    },
    modo: {
      type: String,
      enum: ["automatico", "manual"],
      default: "automatico",
      index: true,
    },
    origen: {
      type: String,
      enum: ["anuncio", "directo"],
      default: "directo",
      index: true,
    },
    bloqueado: {
      type: Boolean,
      default: false,
      index: true,
    },
    stuck: {
      type: Boolean,
      default: false,
    },
    unreadCount: {
      type: Number,
      default: 0,
    },
    lastInteraction: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    // Memoria corta del bot social (M-3): última respuesta, cuándo y qué variantes de frase usó
    social: {
      type: Schema.Types.Mixed,
      default: {},
    },
    vehiculo: {
      type: new Schema(
        {
          marca: { type: String, trim: true, maxlength: 60, default: "" },
          modelo: { type: String, trim: true, maxlength: 60, default: "" },
          anio: { type: Number, min: 1950, max: 2100, default: null },
          motor: { type: String, trim: true, maxlength: 20, default: "" },
          version: { type: String, trim: true, maxlength: 40, default: "" },
          marcaNorm: { type: String, trim: true, maxlength: 60, default: "" },
          modeloNorm: { type: String, trim: true, maxlength: 60, default: "" },
        },
        { _id: false }
      ),
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Normalización automática de marcaNorm y modeloNorm (F1-4)
EtiquetaIgSchema.pre("validate", function () {
  if (this.vehiculo) {
    const { normalizarTexto } = require("../services/productoAmpliado");
    this.vehiculo.marcaNorm = normalizarTexto(this.vehiculo.marca || "");
    this.vehiculo.modeloNorm = normalizarTexto(this.vehiculo.modelo || "");
  }
});

module.exports = mongoose.model<IEtiquetaIg>("EtiquetaIg", EtiquetaIgSchema);
