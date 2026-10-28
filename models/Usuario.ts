import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { IUsuario, RolUsuario } from "../types/models";

const UsuarioSchema = new Schema<IUsuario>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  nombre: { type: String, required: true },
  role: { 
    type: String, 
    enum: ["admin", "repartidor", "cajero"], 
    default: "admin" 
  },
  activo: { type: Boolean, default: true },
  ultimoLogin: { type: Date }
});

// Hash password before saving
UsuarioSchema.pre("save", async function() {
  if (!this.isModified("password")) return;
  if (this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
});

// Method to compare password
UsuarioSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model<IUsuario>("Usuario", UsuarioSchema);
