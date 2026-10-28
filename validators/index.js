const { z } = require("zod");

// ─── Producto ───
const productoSchema = z.object({
  id: z.string().min(1, "El ID del producto es obligatorio"),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  price: z.coerce.number().positive("El precio debe ser un número positivo"),
  stock: z.coerce.number().int().min(0).optional().default(0),
  trackStock: z.coerce.boolean().optional().default(false),
  description: z.string().max(500).optional().default(""),
  categoria: z.string().regex(/^[a-f\d]{24}$/, "ID de categoría inválido"),
  activo: z.boolean().optional().default(true),
});

const productoUpdateSchema = productoSchema.partial().extend({
  categoria: z.string().regex(/^[a-f\d]{24}$/, "ID de categoría inválido").optional(),
});

// ─── Categoría ───
const categoriaSchema = z.object({
  nombre: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(50),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/, "Slug solo permite minúsculas, números y guiones"),
  padre: z.string().regex(/^[a-f\d]{24}$/).nullable().optional(),
});

// ─── Usuario ───
const usuarioSchema = z.object({
  username: z.string().min(3).max(30),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
  nombre: z.string().min(2).max(100),
  role: z.enum(["admin", "repartidor", "cajero"]).optional().default("admin"),
  activo: z.boolean().optional().default(true),
});

const usuarioUpdateSchema = usuarioSchema.partial().omit({ password: true });

// ─── Método de Pago ───
const metodoPagoSchema = z.object({
  tipo: z.enum(["transferencia", "pago_movil", "zelle", "binance", "efectivo", "otro"]),
  nombre: z.string().min(2).max(100),
  detalles: z.record(z.any()).optional().default({}),
  notaAdicional: z.string().max(500).optional().default(""),
  activo: z.boolean().optional().default(true),
});

// ─── Login ───
const loginSchema = z.object({
  usuario: z.string().min(1, "Usuario es obligatorio"),
  password: z.string().min(1, "Contraseña es obligatoria"),
});

// ─── Middleware de validación ───
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = (result.error?.errors || []).map(e => ({
        campo: e.path?.join(".") || "desconocido",
        mensaje: e.message || "Error de validación",
      }));
      return res.status(400).json({ success: false, error: "Datos inválidos", details: errors });
    }
    req.body = result.data; // Datos ya validados y con defaults
    next();
  };
}

module.exports = {
  productoSchema,
  productoUpdateSchema,
  categoriaSchema,
  usuarioSchema,
  usuarioUpdateSchema,
  metodoPagoSchema,
  loginSchema,
  validate,
};
