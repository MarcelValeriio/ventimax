# /validate-with-zod — Capa de validación tipada con Zod

## Objetivo
Instalar Zod y crear schemas de validación para todas las entidades del sistema. Actualmente las validaciones son manuales e inconsistentes: algunas rutas usan `if (!nombre) return 400`, otras confían en Mongoose. Zod da validación runtime + mensajes de error claros.

## Paso 1: Instalar dependencia
```bash
npm install zod
```

## Paso 2: Crear carpeta y schemas

Crear `validators/index.js`:

```js
const { z } = require("zod");

// ─── Producto ───
const productoSchema = z.object({
  id: z.string().min(1, "El ID del producto es obligatorio"),
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").max(100),
  price: z.number().positive("El precio debe ser un número positivo"),
  stock: z.number().int().min(0).optional().default(0),
  description: z.string().max(500).optional().default(""),
  emoji: z.string().max(10).optional().default("🍱"),
  categoria: z.string().regex(/^[a-f\d]{24}$/, "ID de categoría inválido"),
  activo: z.boolean().optional().default(true),
});

const productoUpdateSchema = productoSchema.partial(); // Todos los campos opcionales

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
      const errors = result.error.errors.map(e => ({
        campo: e.path.join("."),
        mensaje: e.message,
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
```

## Paso 3: Integrar en rutas

En `routes/adminRoutes.js`, añadir al principio:
```js
const { validate, productoSchema, productoUpdateSchema, categoriaSchema, usuarioSchema, usuarioUpdateSchema, metodoPagoSchema } = require("../validators");
```

Luego modificar las rutas para usar el middleware `validate`:

```js
// Productos
router.post("/products", isAuthenticated, authorize(["product:create"]), validate(productoSchema), adminController.postProduct);
router.put("/products/:id", isAuthenticated, authorize(["product:edit"]), validate(productoUpdateSchema), adminController.updateProduct);

// Categorías
router.post("/categorias", isAuthenticated, authorize(["category:create"]), validate(categoriaSchema), adminController.postCategoria);
router.put("/categorias/:id", isAuthenticated, authorize(["category:edit"]), validate(categoriaSchema.partial()), adminController.updateCategoria);

// Usuarios
router.post("/users", isAuthenticated, authorize(["user:create"]), validate(usuarioSchema), adminController.postUser);
router.patch("/users/:id", isAuthenticated, authorize(["user:edit"]), validate(usuarioUpdateSchema), adminController.patchUser);

// Métodos de Pago
router.post("/payments", isAuthenticated, authorize(["payment_method:create"]), validate(metodoPagoSchema), paymentController.createPayment);
router.put("/payments/:id", isAuthenticated, authorize(["payment_method:edit"]), validate(metodoPagoSchema.partial()), paymentController.updatePayment);
```

## Paso 4: Integrar en login

En `index.js`, buscar:
```js
app.post("/login", loginLimiter, async (req, res) => {
```

Y añadir validación:
```js
const { validate, loginSchema } = require("./validators");
app.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
```

## Verificación

```bash
# Probar validación de producto sin nombre
curl -X POST http://localhost:3000/api/admin/products \
  -H "Content-Type: application/json" \
  -H "Cookie: token=TU_TOKEN" \
  -d '{"price": -5}'

# Debe responder:
# {"success":false,"error":"Datos inválidos","details":[{"campo":"id","mensaje":"El ID del producto es obligatorio"},{"campo":"name","mensaje":"Required"},{"campo":"price","mensaje":"El precio debe ser un número positivo"},{"campo":"categoria","mensaje":"ID de categoría inválido"}]}
```

## Notas importantes
- Zod reemplaza los datos de `req.body` con la versión validada (incluyendo defaults).
- Las validaciones corren ANTES de llegar al controlador. Si fallan, el controlador nunca se ejecuta.
- Los mensajes de error están en español para que el frontend los muestre directamente.
- `.partial()` en los schemas de update hace que todos los campos sean opcionales.
