import mongoose, { Schema } from "mongoose";
import { IMensaje } from "../types/models";

const MensajeSchema = new Schema<IMensaje>({
  telefono: { type: String },
  // Canal por el que circuló el mensaje. Retrocompatible: los documentos
  // antiguos no tienen el campo y equivalen a "whatsapp".
  canal: { type: String, default: "whatsapp", index: true },
  texto: { type: String },
  direccion: { type: String },
  timestamp: { type: Date },
  tipo: { type: String, default: "texto" },
  mediaId: { type: String },
  mediaUrl: { type: String, default: null },
  fileName: { type: String, default: null },
  caption: { type: String, default: null },
  mimeType: { type: String, default: null },
  wamid: { type: String, index: true },
  replyToMid: { type: String, default: null },
  replyToText: { type: String, default: null },
  status: { type: String, default: "sent" }, // "enviando", "sent", "delivered", "read", "failed"
  error: { type: String, default: null },
});

// Índice compuesto para historial de chat
MensajeSchema.index({ telefono: 1, timestamp: -1 });
// TTL: auto-borrar mensajes después de 90 días (7,776,000 segundos)
MensajeSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model<IMensaje>("Mensaje", MensajeSchema);
