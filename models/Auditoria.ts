import mongoose, { Schema } from "mongoose";
import { IAuditoria } from "../types/models";

const AuditoriaSchema = new Schema<IAuditoria>({
  usuarioId: { type: Schema.Types.ObjectId, ref: "Usuario" }, // Ahora opcional
  usuarioNombre: { type: String },
  pedidoId: { type: Schema.Types.ObjectId, ref: "Pedido" }, // Opcional para acciones de inventario
  correlativoPedido: { type: String },
  recursoId: { type: String }, // ID del producto, categoria, etc.
  tipoRecurso: {
    type: String,
    enum: ["pedido", "producto", "categoria", "usuario", "config", "metodo_pago", "metodo_envio"],
  },
  accion: { type: String, required: true },
  estadoAnterior: { type: String },
  estadoNuevo: { type: String },
  detalles: { type: String },
  timestamp: { type: Date, default: Date.now },
});

// Índice para consultas de auditoría por pedido
AuditoriaSchema.index({ pedidoId: 1, timestamp: -1 });
// Índice para filtrar por tipo de recurso
AuditoriaSchema.index({ tipoRecurso: 1, timestamp: -1 });
// Índice para historial de acciones de un usuario
AuditoriaSchema.index({ usuarioId: 1, timestamp: -1 });

module.exports = mongoose.model<IAuditoria>("Auditoria", AuditoriaSchema);
