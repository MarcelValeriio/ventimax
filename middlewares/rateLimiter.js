const rateLimit = require("express-rate-limit");

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
  validate: false, // Desactiva las validaciones estrictas de express-rate-limit v7
  keyGenerator: (req) => {
    // Si el usuario está autenticado, limitar por user ID; sino por IP
    const fallbackIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    return req.user?.id || fallbackIp;
  },
});

module.exports = { webhookLimiter, loginLimiter, apiLimiter };
