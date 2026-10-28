const Pedido = require("../models/Pedido");
const { notificarAdminConFallback } = require("./whatsapp");
const axios = require("axios");
const mongoose = require("mongoose");
const configManager = require("./configManager");
const { getConfig } = require("./configStore");

/**
 * WatchdogService: Monitoreo proactivo de estabilidad y pedidos.
 */
class WatchdogService {
  io: any;
  checkInterval: number;
  stuckThreshold: number;
  notifiedOrders: Set<string>;
  notifiedVerifiedOrders: Set<string>;
  lastWhatsappReminder: number;
  lastWhatsappReminderVerificado: number;
  lastLogVerificado?: number;
  lastErrorAlert: number;
  errorThrottleMs: number;
  suppressedErrorsCount: number;
  isErrorCatcherInitialized: boolean;

  constructor() {
    this.io = null;
    this.checkInterval = 5 * 60 * 1000; // Cada 5 minutos
    this.stuckThreshold = 15 * 60 * 1000; // 15 minutos
    this.notifiedOrders = new Set(); // Cache temporal de órdenes ya notificadas en esta sesión
    this.notifiedVerifiedOrders = new Set(); // Cache para evitar spam de pedidos verificados
    this.lastWhatsappReminder = 0;
    this.lastLogVerificado = 0;

    // Anti-spam y control de errores no capturados
    this.lastErrorAlert = 0;
    this.errorThrottleMs = 5 * 60 * 1000; // 5 minutos anti-spam
    this.suppressedErrorsCount = 0;
    this.isErrorCatcherInitialized = false;
  }

  isAlertAllowed() {
    const now = new Date();
    const caracasDateStr = now.toLocaleString("en-US", { timeZone: "America/Caracas" });
    const caracasTime = new Date(caracasDateStr);
    
    const currentDay = caracasTime.getDay();
    const currentHour = caracasTime.getHours();
    const currentMinute = caracasTime.getMinutes();

    const disabledDays = configManager.get("settings.watchdog.disabledDays") || [];
    const startHourStr = configManager.get("settings.watchdog.startHour") || "00:00";
    const endHourStr = configManager.get("settings.watchdog.endHour") || "23:59";

    if (disabledDays.includes(currentDay)) return false;

    const [sH, sM] = startHourStr.split(":").map(Number);
    const [eH, eM] = endHourStr.split(":").map(Number);

    const currentMinutesOfDay = currentHour * 60 + currentMinute;
    const startMinutesOfDay = sH * 60 + (sM || 0);
    const endMinutesOfDay = eH * 60 + (eM || 0);

    return currentMinutesOfDay >= startMinutesOfDay && currentMinutesOfDay <= endMinutesOfDay;
  }

  async init(io) {
    this.io = io;
    this.initErrorCatcher();
    
    // Restaurar configuración desde MongoDB (evita reinicios de File System efímero)
    try {
      const Setting = require("../models/Setting");
      const savedConfig = await Setting.findOne({ key: "watchdog_config" });
      if (savedConfig && savedConfig.value) {
        configManager.updateWatchdogSettings(savedConfig.value);
        console.log("✅ Configuración de Watchdog restaurada desde la Base de Datos.");
      }
    } catch (dbError) {
      console.error("⚠️ Error restaurando Watchdog config desde DB:", dbError.message);
    }

    console.log("🐕 Watchdog Service inicializado.");
    
    // Iniciar monitoreo de órdenes estancadas
    setInterval(() => this.checkStuckOrders(), this.checkInterval);
    
    // Recordatorio cada 1 minuto si hay pagos pendientes o verificados sin despachar
    setInterval(() => this.checkPendingReminders(), 60 * 1000);
    setInterval(() => this.checkVerifiedOrders(), 60 * 1000);

    // Fallback de rescate para leads de anuncios en Instagram sin respuesta tras 5 minutos
    setInterval(() => this.checkIgAdFallback(), 60 * 1000);
    
    // Primera ejecución inmediata
    setTimeout(() => this.checkStuckOrders(), 10000);
    setTimeout(() => this.checkPendingReminders(), 15000);
    setTimeout(() => this.checkVerifiedOrders(), 20000);
    setTimeout(() => this.checkIgAdFallback(), 25000);
  }

  async checkPendingReminders() {
    try {
      const count = await Pedido.countDocuments({ estado: "pendiente_verificacion" });
      if (count > 0) {
        const { getCaracasTime } = require("../utils/helpers");
        const nowStr = getCaracasTime().toLocaleString();
        console.log(`🔔 [Watchdog] [${nowStr}] Enviando recordatorio: ${count} pagos pendientes.`);
        
        if (this.io) {
          this.io.emit("recordatorio_pago_pendiente", { count, time: nowStr });
        }

        // Alerta por WhatsApp cada 5 minutos
        const now = Date.now();
        if (now - this.lastWhatsappReminder >= 5 * 60 * 1000) {
          this.lastWhatsappReminder = now;
          
          if (this.isAlertAllowed()) {
            const adminPhones = [
              getConfig("ADMIN_PHONE_NUMBER"),
              getConfig("ADMIN_PHONE_NUMBER_2")
            ].filter(Boolean);

            if (adminPhones.length > 0) {
              const msg = `🔔 *RECORDATORIO DE PAGO PENDIENTE*\n\nTienes *${count}* pago(s) pendiente(s) de verificación en el sistema. Por favor, ingresa al panel para validarlo(s).`;
              for (const phone of adminPhones) {
                await notificarAdminConFallback(phone, msg);
              }
            }
          }
        }
      } else {
        // Resetear el temporizador si no hay pendientes, para que la primera alerta del próximo pago sea inmediata
        this.lastWhatsappReminder = 0;
      }
    } catch (error) {
      console.error("❌ Error en Watchdog (checkPendingReminders):", error.message);
    }
  }

  /**
   * Alerta si hay pedidos en estado 'verificado' que no han pasado a 'en_ruta' o 'entregado'.
   * Notifica al Kanban por socket y por WhatsApp cada 5 minutos.
   */
  async checkVerifiedOrders() {
    try {
      const orders = await Pedido.find({ estado: "verificado" });
      const count = orders.length;
      if (count > 0) {
        const { getCaracasTime } = require("../utils/helpers");
        const nowStr = getCaracasTime().toLocaleString();
        
        // Controlar spam en logs (cada 10 minutos)
        const currentMs = Date.now();
        if (currentMs - (this.lastLogVerificado || 0) >= 10 * 60 * 1000) {
          console.log(`🚚 [Watchdog] [${nowStr}] ${count} pedido(s) verificado(s) sin despachar.`);
          this.lastLogVerificado = currentMs;
        }

        // Alerta al Dashboard Kanban vía Sockets
        if (this.io) {
          this.io.emit("alerta_pedido_verificado", { count, time: nowStr });
        }

        // Filtramos pedidos sobre los que aún no hemos notificado por WhatsApp
        const unnotified = orders.filter(o => !this.notifiedVerifiedOrders.has(o._id.toString()));

        if (unnotified.length > 0) {
          if (this.isAlertAllowed()) {
            const adminPhones = [
              getConfig("ADMIN_PHONE_NUMBER"),
              getConfig("ADMIN_PHONE_NUMBER_2")
            ].filter(Boolean);

            if (adminPhones.length > 0) {
              const msg = `🚚 *PEDIDO(S) LISTO(S) PARA DESPACHO*\n\nTienes *${count}* pedido(s) en estado *Verificado* que aún no han sido marcado(s) como En Ruta o Entregado.\n\nPor favor, asigna el despacho desde el panel.`;
              for (const phone of adminPhones) {
                await notificarAdminConFallback(phone, msg);
              }
            }
            
            // Marcar todos los verificados actuales como notificados
            unnotified.forEach(o => this.notifiedVerifiedOrders.add(o._id.toString()));
          }
        }
      } else {
        // Si no hay pedidos verificados, limpiamos el set para liberar memoria
        if (this.notifiedVerifiedOrders && this.notifiedVerifiedOrders.size > 0) {
          this.notifiedVerifiedOrders.clear();
        }
      }
    } catch (error) {
      console.error("❌ Error en Watchdog (checkVerifiedOrders):", error.message);
    }
  }

  async checkStuckOrders() {
    try {
      const now = new Date();
      const fifteenMinsAgo = new Date(now.getTime() - this.stuckThreshold);

      // Buscar pedidos en verificación que no han sido actualizados en 15 minutos
      const stuckOrders = await Pedido.find({
        estado: "pendiente_verificacion",
        timestamp: { $lt: fifteenMinsAgo }
      });

      if (stuckOrders.length > 0) {
        console.log(`🚨 [Watchdog] Detectados ${stuckOrders.length} pedidos estancados.`);
        
        for (const order of stuckOrders) {
          // Marcar como stuck en DB independientemente de si se notificó en esta sesión
          const Etiqueta = require("../models/Etiqueta");
          await Etiqueta.findOneAndUpdate({ telefono: order.whatsappId }, { stuck: true });

          if (!this.notifiedOrders.has(order._id.toString())) {
            const adminPhones = [
              getConfig("ADMIN_PHONE_NUMBER"),
              getConfig("ADMIN_PHONE_NUMBER_2")
            ].filter(Boolean);

            const msg = `⚠️ *ALERTA WATCHDOG*\n\nEl pedido #${order.correlativo || order._id} de *${order.cliente?.nombre || 'Cliente'}* lleva más de 15 minutos esperando verificación.\n\nPor favor, revisa el panel administrativo.`;
            
            // 2. Notificar al Dashboard vía Sockets
            if (this.io) {
              this.io.emit("alerta_orden_estancada", {
                id: order._id,
                correlativo: order.correlativo,
                cliente: order.cliente?.nombre,
                telefono: order.whatsappId,
                minutos: Math.floor((now.getTime() - (order.timestamp ? new Date(order.timestamp).getTime() : now.getTime())) / 60000)
              });
            }

            this.notifiedOrders.add(order._id.toString());
          }
        }
      }
    } catch (error) {
      console.error("❌ Error en Watchdog (checkStuckOrders):", error.message);
    }
  }

  /**
   * Rutina de fallback/rescate para leads de anuncios en Instagram.
   * Si un usuario interactúa a través de un anuncio y tras 5 minutos no ha recibido respuesta
   * (ni de Meta ni de un agente administrador), reactiva el bot a modo automático y genera la respuesta.
   */
  async checkIgAdFallback() {
    try {
      const EtiquetaIg = require("../models/EtiquetaIg");
      const MensajeIg = require("../models/MensajeIg");
      const instagramFlowService = require("./instagramFlowService");

      const now = Date.now();
      const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);

      // Buscar leads de anuncio en modo manual sin interacción reciente (>5m y <2h)
      const etiquetasStuck = await EtiquetaIg.find({
        modo: "manual",
        origen: "anuncio",
        lastInteraction: { $lt: fiveMinutesAgo, $gte: twoHoursAgo },
      });

      if (!etiquetasStuck || etiquetasStuck.length === 0) {
        return;
      }

      for (const et of etiquetasStuck) {
        try {
          // Buscar el último mensaje de la conversación
          const lastMsg = await MensajeIg.findOne({ usuarioIgId: et.usuarioIgId })
            .sort({ timestamp: -1, _id: -1 });

          // Si el último mensaje es del cliente, ni Meta ni el admin respondieron
          if (lastMsg && lastMsg.direccion === "cliente") {
            console.log(
              `🤖 [Watchdog IG Fallback] Rescatando lead ${et.usuarioIgId}. Sin respuesta tras >5 min. Reactivando bot a automático.`
            );

            // 1. Cambiar a modo automático en DB
            await EtiquetaIg.updateOne(
              { _id: et._id },
              { $set: { modo: "automatico" } }
            );

            // 2. Notificar cambio en tiempo real al panel vía sockets
            if (this.io) {
              this.io.emit("ig_modo_actualizado", {
                usuarioIgId: et.usuarioIgId,
                modo: "automatico",
              });
              this.io.emit("ig_actualizado", { usuarioIgId: et.usuarioIgId });
            }

            // 3. Invocar flujo unificado para responder retroactivamente
            await instagramFlowService._processSingleUnifiedMessage(
              et.usuarioIgId,
              null,
              lastMsg.texto,
              lastMsg.mid,
              this.io,
              { origen: "directo" },
              null
            );
          }
        } catch (itemErr) {
          console.error(
            `❌ Error en Watchdog (checkIgAdFallback) para usuario ${et.usuarioIgId}:`,
            itemErr.message
          );
        }
      }
    } catch (error) {
      console.error("❌ Error en Watchdog (checkIgAdFallback):", error.message);
    }
  }

  /**
   * Verifica la salud de las conexiones externas (versión expandida)
   */
  async getHealthStatus() {
    const status: Record<string, any> = {
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
      const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
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

    // 3. Espacio en disco
    try {
      const { execSync } = require("child_process");
      const isWindows = process.platform === "win32";
      if (isWindows) {
        // Windows: usar wmic
        const wmic = execSync("wmic logicaldisk get size,freespace,caption", { stdio: ["pipe", "pipe", "ignore"] }).toString();
        status.disk = { raw: wmic.trim().substring(0, 200) };
      } else {
        const df = execSync("df -h / | tail -1").toString();
        const parts = df.trim().split(/\s+/);
        status.disk = { total: parts[1], used: parts[2], available: parts[3], usePercent: parts[4] };
      }
    } catch (e) {
      status.disk = "not_available";
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

  /**
   * Inicializa la captura global de excepciones y promesas no manejadas.
   * Idempotente: puede llamarse al inicio de index.js para captura temprana.
   */
  initErrorCatcher() {
    if (this.isErrorCatcherInitialized) return;
    this.isErrorCatcherInitialized = true;

    process.on("uncaughtException", (err: any, origin) => {
      if (err && err.code === "EPIPE") return;
      this.handleProcessError("uncaughtException", err, origin);
    });

    process.on("unhandledRejection", (reason, promise) => {
      this.handleProcessError("unhandledRejection", reason, promise);
    });

    console.log("🛡️ [Watchdog] Monitor global de fallos críticos activado de forma exitosa.");
  }

  /**
   * Procesa y notifica al admin sobre errores no controlados, con mecanismo anti-spam (throttle 5m).
   */
  async handleProcessError(type, err, origin = null) {
    try {
      try {
        // 1. Siempre registrar en consola/logs de Render con hora local
        console.error(`🚨 [Watchdog Error Catcher] [${type}]:`, err);
      } catch (logErr) {
        // Ignorar errores de escritura (ej. EPIPE) para evitar loops infinitos
      }

      // 2. Anti-spam: Verificar ventana de enfriamiento (5 minutos)
      const now = Date.now();
      if (now - this.lastErrorAlert < this.errorThrottleMs) {
        this.suppressedErrorsCount++;
        try {
          console.warn(
            `⏳ [Watchdog] Alerta de WhatsApp silenciada por anti-spam (5m). Silenciados acumulados: ${this.suppressedErrorsCount}`
          );
        } catch (logErr) {}
        return;
      }

      // 3. Resetear contador y registrar timestamp inmediatamente (previene condiciones de carrera)
      const suppressed = this.suppressedErrorsCount;
      this.suppressedErrorsCount = 0;
      this.lastErrorAlert = now;

      // 4. Si estamos en entorno de pruebas, no disparar llamadas a Meta API
      if (process.env.NODE_ENV === "test") {
        return;
      }

      // 5. Formatear detalle del error y stack trace de forma compacta y segura
      let errorMsg = "Error desconocido";
      let stackSnippet = "";

      if (err instanceof Error) {
        errorMsg = err.message || err.toString();
        if (err.stack) {
          stackSnippet = err.stack
            .split("\n")
            .slice(0, 3)
            .map((line) => line.trim())
            .join("\n");
        }
      } else if (typeof err === "string") {
        errorMsg = err;
      } else if (err && typeof err === "object") {
        try {
          errorMsg = err.message || JSON.stringify(err);
        } catch (_) {
          errorMsg = String(err);
        }
      } else if (err !== undefined && err !== null) {
        errorMsg = String(err);
      }

      // Truncar para cumplir estrictamente con límites de WhatsApp y Meta Graph API
      if (errorMsg.length > 500) {
        errorMsg = errorMsg.substring(0, 500) + "...";
      }
      if (stackSnippet.length > 350) {
        stackSnippet = stackSnippet.substring(0, 350) + "...";
      }

      // Analizar el error para dar un contexto humano
      const m = errorMsg.toLowerCase();
      let contextoHumano = "Error inesperado en el servidor. Alguna función ha fallado y requiere revisión técnica.";
      if (m.includes("econnrefused") || m.includes("etimedout") || m.includes("network")) {
        contextoHumano = "Problema de conexión. El bot intentó hablar con un servicio externo (Meta, Mongo, etc.) y no hubo respuesta.";
      } else if (m.includes("mongo") || err?.name === "MongoServerError") {
        contextoHumano = "Fallo de base de datos. MongoDB rechazó una operación o se desconectó.";
      } else if (err?.name === "ValidationError" || m.includes("validation")) {
        contextoHumano = "Datos inválidos. Se intentó guardar información incompleta o incorrecta.";
      } else if (err?.name === "TypeError" || m.includes("is not a function") || m.includes("undefined")) {
        contextoHumano = "Fallo interno de código. El bot intentó usar una variable que estaba vacía o con un formato que no esperaba.";
      } else if (err?.name === "SyntaxError" || m.includes("json")) {
        contextoHumano = "Error leyendo datos. El bot intentó interpretar una respuesta (probablemente JSON) que venía mal formateada.";
      } else if (m.includes("rate limit") || m.includes("429") || m.includes("too many")) {
        contextoHumano = "Demasiadas peticiones. WhatsApp u otra API externa nos bloqueó temporalmente por hacer muchas consultas rápidas.";
      }

      const { getCaracasTime } = require("../utils/helpers");
      const horaStr = getCaracasTime();

      let msg = `🚨 *ALERTA CRÍTICA: ERROR EN SERVIDOR*\n\n` +
                `💡 *¿Qué significa?:* ${contextoHumano}\n\n` +
                `📌 *Tipo:* \`${type}\`\n` +
                `🕒 *Hora:* ${horaStr}\n` +
                `❌ *Detalle:* ${errorMsg}`;

      if (stackSnippet) {
        msg += `\n\n📍 *Stack:*\n\`\`\`\n${stackSnippet}\n\`\`\``;
      }

      if (suppressed > 0) {
        msg += `\n\n🔇 *(+${suppressed} error(es) silenciados en los últimos 5 min por anti-spam)*`;
      }

      // 6. Notificar al panel administrativo vía WebSocket en tiempo real si está conectado
      if (this.io) {
        this.io.emit("alerta_error_servidor", {
          type,
          message: errorMsg,
          time: horaStr,
        });
      }

      // 7. Enviar vía WhatsApp con fallback automático a plantilla (exclusivo para el desarrollador)
      const devPhone = getConfig("ADMIN_PHONE_NUMBER");

      if (!devPhone) {
        console.warn("⚠️ [Watchdog] No hay teléfono de desarrollador configurado en ADMIN_PHONE_NUMBER.");
        return;
      }

      await notificarAdminConFallback(devPhone, msg);
    } catch (notifyError) {
      console.error("❌ [Watchdog] Error interno intentando notificar error al admin vía WhatsApp:", notifyError.message);
    }
  }
}

module.exports = new WatchdogService();
