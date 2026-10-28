# /add-health-endpoint — Health check completo para monitoreo externo

## Objetivo
Expandir el health check actual con: espacio en disco, latencia MongoDB, estado circuit breaker, último webhook recibido, estado de Agenda, y hacerlo accesible sin autenticación para herramientas como UptimeRobot.

## Paso 1: Modificar services/watchdogService.js

Reemplazar el método `getHealthStatus()` completo por esta versión expandida:

```js
async getHealthStatus() {
  const status = {
    status: "ok",       // "ok" | "degraded" | "down"
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: "disconnected",
    whatsapp: "unknown",
    disk: "unknown",
    lastWebhook: null,
    agenda: "unknown",
  };

  // 1. MongoDB
  try {
    const start = Date.now();
    await mongoose.connection.db.admin().ping();
    const latency = Date.now() - start;
    status.mongodb = { state: "connected", latencyMs: latency };
  } catch (e) {
    status.mongodb = { state: "disconnected", error: e.message };
    status.status = "down";
  }

  // 2. WhatsApp
  try {
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
    if (WHATSAPP_TOKEN && PHONE_NUMBER_ID) {
      const start = Date.now();
      const response = await axios.get(
        `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}`,
        { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, timeout: 10000 }
      );
      status.whatsapp = { state: "connected", latencyMs: Date.now() - start };
    } else {
      status.whatsapp = { state: "not_configured" };
    }
  } catch (e) {
    status.whatsapp = { state: "error", error: e.response?.data?.error?.message || e.message };
    status.status = status.status === "down" ? "down" : "degraded";
  }

  // 3. Espacio en disco (solo en entornos Unix/Linux)
  try {
    const { execSync } = require("child_process");
    const df = execSync("df -h / | tail -1").toString();
    const parts = df.trim().split(/\s+/);
    status.disk = { total: parts[1], used: parts[2], available: parts[3], usePercent: parts[4] };
  } catch (e) {
    status.disk = "not_available_on_windows";
  }

  // 4. Último webhook recibido
  const Mensaje = require("../models/Mensaje");
  try {
    const lastMsg = await Mensaje.findOne({ direccion: "cliente" })
      .sort({ timestamp: -1 })
      .select("timestamp")
      .lean();
    if (lastMsg) {
      const minutesAgo = Math.round((Date.now() - new Date(lastMsg.timestamp).getTime()) / 60000);
      status.lastWebhook = { timestamp: lastMsg.timestamp, minutesAgo };
      if (minutesAgo > 30) {
        status.lastWebhook.warning = "Más de 30 minutos sin mensajes entrantes";
      }
    } else {
      status.lastWebhook = null;
    }
  } catch (e) {
    status.lastWebhook = { error: "No se pudo consultar" };
  }

  // 5. Agenda
  try {
    const { getAgenda } = require("./agendaService");
    const agenda = getAgenda();
    const running = await agenda._collection?.countDocuments({ lockedAt: { $exists: true } }) || 0;
    status.agenda = { state: "active", runningJobs: running };
  } catch (e) {
    status.agenda = { state: "not_initialized" };
  }

  return status;
}
```

## Paso 2: Añadir endpoint público en index.js

En `index.js`, buscar la sección de rutas y añadir ANTES de los middlewares de auth:

```js
// Endpoint público de health check (sin auth, para monitoreo externo)
app.get("/health", async (req, res) => {
  try {
    const watchdogService = require("./services/watchdogService");
    const health = await watchdogService.getHealthStatus();
    const httpStatus = health.status === "down" ? 503 : health.status === "degraded" ? 200 : 200;
    res.status(httpStatus).json(health);
  } catch (error) {
    res.status(500).json({ status: "error", error: error.message });
  }
});
```

## Paso 3: Mantener el endpoint autenticado para el panel

El endpoint existente `/api/admin/health` (protegido por JWT) se mantiene sin cambios para uso del panel admin. El nuevo `/health` es para herramientas externas.

## Verificación

```bash
# Probar el health check público
curl http://localhost:3000/health | jq .

# Debe devolver algo como:
# {
#   "status": "ok",
#   "timestamp": "2026-07-13T...",
#   "uptime": 12345.6,
#   "mongodb": { "state": "connected", "latencyMs": 2 },
#   "whatsapp": { "state": "connected", "latencyMs": 450 },
#   "disk": { "total": "50G", "used": "12G", "available": "36G", "usePercent": "24%" },
#   "lastWebhook": { "timestamp": "...", "minutesAgo": 3 },
#   "agenda": { "state": "active", "runningJobs": 0 }
# }
```

## Integración con UptimeRobot (opcional)
1. Crear cuenta gratuita en uptimerobot.com
2. Añadir monitor HTTP para `https://tudominio.com/health`
3. Configurar alerta si el status no es 200
4. UptimeRobot chequeará cada 5 minutos y te notificará por email/Telegram si algo falla

## Notas importantes
- El endpoint `/health` es PÚBLICO (sin auth). Solo expone metadatos, no datos sensibles.
- En Windows, `df` no existe, por eso el fallback `"not_available_on_windows"`.
- Si el health check de WhatsApp falla repetidamente, puede consumir rate limit de Meta. El timeout de 10s evita bloqueos largos.
