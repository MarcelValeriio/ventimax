/**
 * services/pushService.js
 * Servicio Centralizado de Web Push Notifications (VAPID)
 * Permite enviar notificaciones push en segundo plano a administradores y operadores.
 */

const webpush = require("web-push");
let SuscripcionPush = require("../models/SuscripcionPush");
const configManager = require("./configManager");

if (process.env.NODE_ENV === "test") {
  const dbLocal = require("./dbLocal");
  SuscripcionPush = dbLocal.getSuscripcionPushModel();
}

class PushService {
  configured: boolean;

  constructor() {
    this.configured = false;
    this.initVapid();
  }

  /**
   * Inicializa las claves VAPID con degradación segura si no están presentes en .env
   */
  initVapid() {
    const publicKey = process.env.VAPID_PUBLIC_KEY ? process.env.VAPID_PUBLIC_KEY.trim() : null;
    const privateKey = process.env.VAPID_PRIVATE_KEY ? process.env.VAPID_PRIVATE_KEY.trim() : null;
    const contactEmail = configManager.get("settings.contact.email");
    const email =
      process.env.VAPID_EMAIL ||
      (contactEmail ? `mailto:${contactEmail}` : "mailto:admin@localhost");

    if (publicKey && privateKey) {
      try {
        webpush.setVapidDetails(email, publicKey, privateKey);
        this.configured = true;
        console.log("✅ [WebPush] Servicio VAPID configurado correctamente.");
      } catch (err) {
        console.warn("⚠️ [WebPush] Error configurando VAPID keys:", err.message);
        this.configured = false;
      }
    } else {
      console.warn("⚠️ [WebPush] VAPID keys no encontradas en variables de entorno. Notificaciones push móviles en modo degradado.");
      this.configured = false;
    }
  }

  isConfigured() {
    return this.configured;
  }

  getPublicKey() {
    return process.env.VAPID_PUBLIC_KEY || "";
  }

  /**
   * Guarda o actualiza una suscripción Push en la base de datos
   */
  async saveSubscription(subscription, usuarioId = null, role = "admin", userAgent = "") {
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      throw new Error("Objeto de suscripción push inválido");
    }

    const { endpoint, keys } = subscription;
    if (!keys.p256dh || !keys.auth) {
      throw new Error("Claves p256dh o auth faltantes en la suscripción");
    }

    const doc = await SuscripcionPush.findOneAndUpdate(
      { endpoint },
      {
        usuarioId: usuarioId || null,
        role: role || "admin",
        endpoint,
        keys: {
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
        userAgent: userAgent || "",
        updatedAt: new Date(),
      },
      { upsert: true, returnDocument: "after" }
    );

    return doc;
  }

  /**
   * Elimina una suscripción Push por endpoint
   */
  async removeSubscription(endpoint) {
    if (!endpoint) return false;
    await SuscripcionPush.deleteOne({ endpoint });
    return true;
  }

  /**
   * Envía una notificación a una suscripción específica
   */
  async sendNotification(subscription, payload: Record<string, any> = {}) {
    if (!this.configured) {
      return { success: false, reason: "VAPID no configurado" };
    }

    const pushPayload = JSON.stringify({
      title: payload.title || "Notificación de Panel",
      body: payload.body || "",
      icon: payload.icon || "/assets/favicon.svg",
      badge: payload.badge || "/assets/badge.png",
      tag: payload.tag || "panel-alert",
      url: payload.url || "/",
      timestamp: Date.now(),
      data: payload.data || {},
    });

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys?.p256dh,
        auth: subscription.keys?.auth,
      },
    };

    try {
      await webpush.sendNotification(pushSubscription, pushPayload);
      return { success: true };
    } catch (err) {
      // Si la suscripción expiró (404 o 410 Gone), eliminar de la DB
      if (err.statusCode === 404 || err.statusCode === 410) {
        console.log(`🧹 [WebPush] Eliminando suscripción expirada (${err.statusCode}): ${subscription.endpoint.slice(0, 35)}...`);
        await this.removeSubscription(subscription.endpoint);
      } else {
        console.error("❌ [WebPush] Error enviando notificación push:", err.message);
      }
      return { success: false, error: err.message, statusCode: err.statusCode };
    }
  }

  /**
   * Envía una notificación a todos los administradores registrados
   */
  async sendToAllAdmins(payload = {}) {
    try {
      const subs = await SuscripcionPush.find({ role: "admin" });
      if (!subs || subs.length === 0) return { total: 0, sent: 0 };

      const results = await Promise.allSettled(
        subs.map((sub) => this.sendNotification(sub, payload))
      );

      const successful = results.filter((r) => r.status === "fulfilled" && r.value?.success).length;
      return { total: subs.length, sent: successful };
    } catch (err) {
      console.error("❌ [WebPush] Error en sendToAllAdmins:", err.message);
      return { total: 0, sent: 0, error: err.message };
    }
  }

  /**
   * Envía una notificación a todas las suscripciones sin importar rol
   */
  async sendToAll(payload = {}) {
    try {
      const subs = await SuscripcionPush.find({});
      if (!subs || subs.length === 0) return { total: 0, sent: 0 };

      const results = await Promise.allSettled(
        subs.map((sub) => this.sendNotification(sub, payload))
      );

      const successful = results.filter((r) => r.status === "fulfilled" && r.value?.success).length;
      return { total: subs.length, sent: successful };
    } catch (err) {
      console.error("❌ [WebPush] Error en sendToAll:", err.message);
      return { total: 0, sent: 0, error: err.message };
    }
  }

  /**
   * Envía una notificación a un usuario específico por su ObjectId
   */
  async sendToUser(usuarioId, payload = {}) {
    try {
      const subs = await SuscripcionPush.find({ usuarioId });
      if (!subs || subs.length === 0) return { total: 0, sent: 0 };

      const results = await Promise.allSettled(
        subs.map((sub) => this.sendNotification(sub, payload))
      );

      const successful = results.filter((r) => r.status === "fulfilled" && r.value?.success).length;
      return { total: subs.length, sent: successful };
    } catch (err) {
      console.error("❌ [WebPush] Error en sendToUser:", err.message);
      return { total: 0, sent: 0, error: err.message };
    }
  }
}

module.exports = new PushService();
