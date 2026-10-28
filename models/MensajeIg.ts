import mongoose, { Schema } from "mongoose";
import { IMensajeIg } from "../types/models";

const MensajeIgSchema = new Schema<IMensajeIg>(
  {
    usuarioIgId: {
      type: String,
      required: true,
      index: true,
    },
    // Canal de la conversación. Retrocompatible: los documentos antiguos
    // (creados antes de Messenger) no tienen el campo y equivalen a "instagram".
    canal: {
      type: String,
      default: "instagram",
      index: true,
    },
    direccion: {
      type: String,
      enum: ["cliente", "bot", "admin"],
      required: true,
    },
    texto: {
      type: String,
      default: "",
    },
    tipo: {
      type: String,
      default: "texto",
    },
    mid: {
      type: String,
      default: null,
      index: true,
    },
    replyToMid: {
      type: String,
      default: null,
    },
    replyToText: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      default: "sent",
    },
    mediaUrl: {
      type: String,
      default: null,
    },
    mediaType: {
      type: String,
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// TTL: auto-borrar mensajes de Instagram después de 90 días (7,776,000 segundos)
MensajeIgSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 });

module.exports = mongoose.model<IMensajeIg>("MensajeIg", MensajeIgSchema);
