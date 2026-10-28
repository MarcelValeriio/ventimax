const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Rate limit para webhook de WhatsApp (Meta puede mandar ráfagas)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100,                 // máximo 100 requests por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones al webhook. Intenta de nuevo más tarde." }
});

// Rate limit estricto para login (anti fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 5,                    // máximo 5 intentos de login por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de inicio de sesión. Espera un minuto." }
});

// Rate limit general para API de admin
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 60,                   // máximo 60 requests por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones a la API. Reduce la frecuencia." },
  // ipKeyGenerator agrupa las IPv6 por subred: sin él, un cliente IPv6 cambia de dirección y salta el límite
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
});

module.exports = { webhookLimiter, loginLimiter, apiLimiter };
