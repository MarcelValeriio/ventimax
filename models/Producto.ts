import mongoose, { Schema } from "mongoose";
import { IProducto } from "../types/models";

const productoSchema = new Schema<IProducto>({
  id: { type: String, required: true, unique: true }, // Cambiado a String para soportar 'prod-001'
  name: { type: String, required: true }, // Cambiado de 'nombre' a 'name'
  price: { type: Number, required: true }, // Precio BASE. El vigente lo calcula services/precios.ts
  // Descuento por producto (F2g): entero de 0 a 90. 0 = sin descuento
  descuentoPct: { type: Number, min: 0, max: 90, default: 0 },
  description: { type: String }, // Nuevo campo
  emoji: { type: String },
  imagenes: {
    type: [
      {
        url: { type: String, required: true },
        publicId: { type: String, default: "" },
      },
    ],
    default: [],
    validate: [
      (val: any[]) => !val || val.length <= 5,
      "{PATH} no puede tener más de 5 imágenes",
    ],
  },
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
