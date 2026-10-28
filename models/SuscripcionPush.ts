import mongoose, { Schema } from "mongoose";
import { ISuscripcionPush } from "../types/models";

const SuscripcionPushSchema = new Schema<ISuscripcionPush>({
  usuarioId: {
    type: Schema.Types.ObjectId,
    ref: "Usuario",
    required: false,
  },
  role: {
    type: String,
    enum: ["admin", "repartidor", "cajero"],
    default: "admin",
  },
  endpoint: {
    type: String,
    required: true,
    unique: true,
  },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  userAgent: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});


SuscripcionPushSchema.index({ usuarioId: 1 });
SuscripcionPushSchema.index({ role: 1 });

module.exports = mongoose.model<ISuscripcionPush>("SuscripcionPush", SuscripcionPushSchema);
