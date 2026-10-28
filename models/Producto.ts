import mongoose, { Schema } from "mongoose";
import { IProducto } from "../types/models";

const productoSchema = new Schema<IProducto>({
  id: { type: String, required: true, unique: true }, // Cambiado a String para soportar 'prod-001'
  name: { type: String, required: true }, // Cambiado de 'nombre' a 'name'
  price: { type: Number, required: true }, // Cambiado de 'precio' a 'price'
  description: { type: String }, // Nuevo campo
  emoji: { type: String },
  categoria: { type: Schema.Types.ObjectId, ref: "Categoria", required: true },
  categorias: [{ type: Schema.Types.ObjectId, ref: "Categoria", default: [] }],
  activo: { type: Boolean, default: true },
  stock: { type: Number, default: 0 },
  trackStock: { type: Boolean, default: false }  // true = control de stock activo, false = venta ilimitada
}, { timestamps: true });

// Índices para catálogo activo por categoría y multicategoría
productoSchema.index({ activo: 1, categoria: 1, name: 1 });
productoSchema.index({ activo: 1, categorias: 1 });

module.exports = mongoose.model<IProducto>("Producto", productoSchema);
