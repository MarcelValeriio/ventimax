import mongoose, { Schema } from "mongoose";
import { IEtiqueta, ModoOperacion } from "../types/models";

const EtiquetaSchema = new Schema<IEtiqueta>({
  telefono: { type: String, unique: true },
  // Canal de origen de la conversación. Retrocompatible: los documentos
  // antiguos no tienen el campo y equivalen a "whatsapp".
  canal: { type: String, default: "whatsapp", index: true },
  etiqueta: { type: String, default: "nuevo" },
  paso: { type: String, default: "inicio" },
  modo: { type: String, enum: ["automatico", "manual"], default: "automatico" },
  carrito: { type: Object, default: {} },
  meta: { type: String, default: null },
  ctwaClid: { type: String, default: null },
  mensajesEnEsperaCount: { type: Number, default: 0 },
  // Contador de mensajes entrantes sin leer del inbox unificado (§9.1 del
  // contrato). Se incrementa al recibir un mensaje del cliente y se resetea
  // sólo con POST /api/admin/inbox/leido (marcado explícito).
  unreadCount: { type: Number, default: 0 },
  reintentosFallidos: { type: Number, default: 0 },
  stuck: { type: Boolean, default: false },
  bloqueado: { type: Boolean, default: false },
  ultimaReactivacion: {
    at: { type: Date, default: null },
    paso: { type: String, default: null },
    esSegundo: { type: Boolean, default: false },
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
}, { timestamps: true });

// Normalización automática de marcaNorm y modeloNorm (F1-4)
EtiquetaSchema.pre("validate", function () {
  if (this.vehiculo) {
    const { normalizarTexto } = require("../services/productoAmpliado");
    this.vehiculo.marcaNorm = normalizarTexto(this.vehiculo.marca || "");
    this.vehiculo.modeloNorm = normalizarTexto(this.vehiculo.modelo || "");
  }
});

// Índice para búsqueda de clientes estancados
EtiquetaSchema.index({ stuck: 1, updatedAt: -1 });
// Índice para filtrar por paso actual
EtiquetaSchema.index({ paso: 1 });

module.exports = mongoose.model<IEtiqueta>("Etiqueta", EtiquetaSchema);
