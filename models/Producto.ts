import mongoose, { Schema } from "mongoose";
import { IProducto } from "../types/models";
import { LIMITES, validarProductoAmpliado } from "../services/productoAmpliado";

// Subesquemas sin _id (F1-1): son filas de datos, no documentos
const atributoSchema = new Schema(
  {
    nombre: { type: String, trim: true, maxlength: 40 },
    valor: { type: String, trim: true, default: "", maxlength: 120 },
  },
  { _id: false }
);

const compatibilidadSchema = new Schema(
  {
    marca: { type: String, trim: true, required: true, maxlength: 60 },
    modelo: { type: String, trim: true, required: true, maxlength: 60 },
    marcaNorm: { type: String, default: "" }, // lo calcula services/productoAmpliado.ts
    modeloNorm: { type: String, default: "" },
    anioDesde: { type: Number, min: 1950, max: 2100 },
    anioHasta: { type: Number, min: 1950, max: 2100 },
    motor: { type: String, trim: true, default: "", maxlength: 20 },
    version: { type: String, trim: true, default: "", maxlength: 40 },
    nota: { type: String, trim: true, default: "", maxlength: 120 },
  },
  { _id: false }
);

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
  trackStock: { type: Boolean, default: false },  // true = control de stock activo, false = venta ilimitada
  // Campos ampliados (F1-1). Todos opcionales; normalización y límites en services/productoAmpliado.ts
  sku: { type: String, trim: true, uppercase: true, maxlength: LIMITES.sku },
  marcaFabricante: { type: String, trim: true, default: "", maxlength: LIMITES.marcaFabricante },
  codigosOEM: { type: [String], default: [] },
  atributos: { type: [atributoSchema], default: [] },
  grupoEquivalencia: { type: String, trim: true, default: "", maxlength: LIMITES.grupoEquivalencia },
  compatibilidad: { type: [compatibilidadSchema], default: [] },
  // Peso y medidas de la caja (F1-7). Opcionales: null = sin dato. Reglas en services/medidasProducto.ts
  pesoKg: { type: Number, min: 0, max: 1000, default: null },
  altoCm: { type: Number, min: 0, max: 500, default: null },
  anchoCm: { type: Number, min: 0, max: 500, default: null },
  profundidadCm: { type: Number, min: 0, max: 500, default: null },
}, { timestamps: true });

// pre("validate"): normaliza los campos ampliados antes de guardar y rechaza los inválidos.
// Solo toca los campos que el documento trae (undefined = no tocado). Un SKU vacío se guarda sin valor
// para que el índice único disperso no choque entre productos sin SKU.
productoSchema.pre("validate", function () {
  const doc: any = this;
  const entrada: Record<string, any> = {};
  for (const campo of ["sku", "marcaFabricante", "codigosOEM", "atributos", "grupoEquivalencia", "compatibilidad"]) {
    const v = doc.get(campo);
    if (v !== undefined) entrada[campo] = v === null ? null : (typeof v.toObject === "function" ? v.toObject() : v);
  }
  const r = validarProductoAmpliado(entrada);
  if (!r.ok) throw new Error(r.errores.join(" "));
  for (const [campo, valor] of Object.entries(r.valor)) {
    if (campo === "sku" && valor === "") doc.set("sku", undefined);
    else doc.set(campo, valor);
  }
});

// Índices para catálogo activo por categoría y multicategoría
productoSchema.index({ activo: 1, categoria: 1, name: 1 });
productoSchema.index({ activo: 1, categorias: 1 });
// Campos ampliados (F1-1): SKU único pero disperso (productos sin SKU no cuentan), búsqueda por vehículo y por OEM
productoSchema.index({ sku: 1 }, { unique: true, sparse: true });
productoSchema.index({ "compatibilidad.marcaNorm": 1, "compatibilidad.modeloNorm": 1 });
productoSchema.index({ codigosOEM: 1 });

module.exports = mongoose.model<IProducto>("Producto", productoSchema);
