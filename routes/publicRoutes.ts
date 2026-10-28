import express from "express";
const router = express.Router();
const publicController = require("../controllers/publicController");
const rateLimit = require("express-rate-limit");

// 1. CORS para CATALOGO_ORIGEN y cabecera Vary: Origin [R12]
router.use((req: any, res: any, next: any) => {
  res.setHeader("Vary", "Origin");
  const catalogoOrigen = process.env.CATALOGO_ORIGEN;
  const reqOrigin = req.headers.origin;
  if (catalogoOrigen && catalogoOrigen.trim() !== "" && reqOrigin === catalogoOrigen) {
    res.setHeader("Access-Control-Allow-Origin", catalogoOrigen);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

// 2. Parser JSON dedicado con límite estricto de 5 KB
router.use(express.json({ limit: "5kb" }));

// 3. Manejador de errores del parser (413 si excede 5kb, 400 si JSON mal formado)
router.use((err: any, req: any, res: any, next: any) => {
  if (err?.status === 413 || err?.type === "entity.too.large") {
    return res.status(413).json({ error: "El cuerpo de la petición excede el límite permitido de 5 KB" });
  }
  if (err?.status === 400) {
    return res.status(400).json({ error: "Formato de petición inválido" });
  }
  next(err);
});

// 4. Rate Limiting por IP (con trust proxy 1, req.ip es la IP real del cliente) [R9]
const publicGetLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 120, // 120 peticiones por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones. Intenta de nuevo más tarde." },
});

const pedidosWebLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 5, // 5 carritos por IP cada 10 minutos
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: any, res: any) => {
    console.warn(`⚠️ [Catálogo] POST /api/public/pedidos: límite excedido para IP ${req.ip}`);
    res.status(429).json({
      error: "Has creado varios carritos recientemente. Por favor, espera unos minutos antes de intentar de nuevo.",
    });
  },
});

// 5. Rutas públicas
router.get("/marca", publicGetLimiter, publicController.getMarca);
router.get("/catalogo", publicGetLimiter, publicController.getCatalogo);
router.post("/pedidos", pedidosWebLimiter, publicController.postPedidoWeb);

// 6. Rechazo de cualquier otra ruta bajo /api/public (ej. GET /pedidos/:codigo no existe)
router.use((req: any, res: any) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

module.exports = router;
