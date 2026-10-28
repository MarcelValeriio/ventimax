# /add-rate-limit — Rate Limiting global por tipo de ruta

## Objetivo
Implementar `express-rate-limit` con límites diferenciados: webhook (100 req/min), login (5 req/min), API admin (60 req/min por usuario autenticado). Actualmente no hay NINGÚN rate limiting, dejando el servidor vulnerable a abuso y fuerza bruta.

## Paso 1: Instalar dependencia
```bash
npm install express-rate-limit
```

## Paso 2: Crear archivo de configuración de rate limits

Crear `middlewares/rateLimiter.js` con el siguiente contenido:

```js
const rateLimit = require("express-rate-limit");

// Rate limit para webhook de WhatsApp (Meta puede mandar ráfagas)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100,                 // máximo 100 requests por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones al webhook. Intenta de nuevo más tarde." },
  keyGenerator: (req) => req.ip, // Por IP (Meta usa IPs fijas)
});

// Rate limit estricto para login (anti fuerza bruta)
const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 5,                    // máximo 5 intentos de login por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de inicio de sesión. Espera un minuto." },
  keyGenerator: (req) => req.ip,
});

// Rate limit general para API de admin
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 60,                   // máximo 60 requests por minuto
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas peticiones a la API. Reduce la frecuencia." },
  keyGenerator: (req) => {
    // Si el usuario está autenticado, limitar por user ID; sino por IP
    return req.user?.id || req.ip;
  },
});

module.exports = { webhookLimiter, loginLimiter, apiLimiter };
```

## Paso 3: Integrar en index.js

### 3a. Añadir el require al principio (junto a los otros requires de middlewares)

Buscar la línea:
```js
const { isAuthenticated } = require("./middlewares/auth");
```

Añadir DESPUÉS:
```js
const { webhookLimiter, loginLimiter, apiLimiter } = require("./middlewares/rateLimiter");
```

### 3b. Aplicar rate limit al webhook

Buscar la línea:
```js
app.use("/webhook", webhookRoutes(io));
```

Reemplazar por:
```js
app.use("/webhook", webhookLimiter, webhookRoutes(io));
```

### 3c. Aplicar rate limit al login POST

Buscar la línea:
```js
app.post("/login", async (req, res) => {
```

Reemplazar por:
```js
app.post("/login", loginLimiter, async (req, res) => {
```

### 3d. Aplicar rate limit a las rutas de admin

Buscar la línea:
```js
app.use("/api/admin", adminRoutes(io));
```

Reemplazar por:
```js
app.use("/api/admin", apiLimiter, adminRoutes(io));
```

## Verificación

Ejecutar el servidor en modo desarrollo:
```bash
node index.js
```

Luego en otra terminal, probar el rate limit de login:
```bash
# 6 intentos rápidos de login (el 6to debe ser bloqueado)
for i in {1..6}; do curl -s -X POST http://localhost:3000/login -H "Content-Type: application/json" -d '{"usuario":"test","password":"wrong"}' | head -c 100; echo; done
```

El 6to request debe devolver `{"error":"Demasiados intentos de inicio de sesión..."}`.

## Notas importantes
- Los rate limits usan memoria en proceso (no Redis). Si usas múltiples instancias en Render, cada una tiene su propio contador. Para producción multi-instancia se necesitaría `rate-limit-redis`.
- `trust proxy` ya está configurado como `1` en index.js, necesario para que funcione detrás del proxy de Render.
- Los límites son conservadores. Se pueden ajustar hacia arriba si ves falsos positivos en producción.
