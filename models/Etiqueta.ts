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
}, { timestamps: true });

// Índice para búsqueda de clientes estancados
EtiquetaSchema.index({ stuck: 1, updatedAt: -1 });
// Índice para filtrar por paso actual
EtiquetaSchema.index({ paso: 1 });

module.exports = mongoose.model<IEtiqueta>("Etiqueta", EtiquetaSchema);
