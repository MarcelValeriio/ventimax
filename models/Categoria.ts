import mongoose, { Schema } from "mongoose";
import { ICategoria } from "../types/models";

const CategoriaSchema = new Schema<ICategoria>(
  {
    nombre: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    padre: { type: Schema.Types.ObjectId, ref: "Categoria", default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model<ICategoria>("Categoria", CategoriaSchema);
