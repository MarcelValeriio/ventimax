let Setting = require("../models/Setting");
if (process.env.NODE_ENV === "test") {
  Setting = require("./dbLocal").getSettingModel();
}

// Editables desde el panel: cambiarlas no rompe el envío de mensajes ni las integraciones.
// Se leen con getConfig() en cada uso, así que el cambio aplica sin reiniciar.
export const EDITABLE_KEYS = [
  "ADMIN_PHONE_NUMBER",
  "ADMIN_PHONE_NUMBER_2",
  "DELIVERY_PHONE_NUMBER",
  "WEBHOOK_DEBOUNCE_MS",
] as const;

// Visibles en el panel como solo lectura. Un valor mal escrito rompería integraciones
// (IDs de Meta, plantillas) o el código aún lee process.env directo (ver docs/validacion-variables.md).
export const READONLY_KEYS = [
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_BUSINESS_ACCOUNT_ID",
  "WHATSAPP_TEMPLATE_ORDER",
  "WHATSAPP_TEMPLATE_REACTIVACION",
  "IG_ACCOUNT_ID",
  "FB_PAGE_ID",
  "META_PIXEL_ID",
  "META_DATASET_ID",
  "META_CAPI_TEST_EVENT_CODE",
  "VAPID_EMAIL",
] as const;

export const SECRET_KEYS = [
  "WHATSAPP_TOKEN",
  "DEEPSEEK_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GLADIA_API_KEY",
  "DEEPGRAM_API_KEY",
  "IG_ACCESS_TOKEN",
  "FB_PAGE_ACCESS_TOKEN",
  "META_CAPI_TOKEN",
  "WHATSAPP_APP_SECRET",
  "IG_APP_SECRET",
  "FB_APP_SECRET",
  "APP_SECRET",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "CLOUDINARY_API_SECRET",
  "CLOUDINARY_API_KEY",
  "JWT_SECRET",
  "SESSION_SECRET",
  "ADMIN_PASS",
  "MONGODB_URI",
  "VERIFY_TOKEN",
  "IG_VERIFY_TOKEN",
  "FB_VERIFY_TOKEN",
  "ADMIN_USER",
] as const;

export const HIDDEN_KEYS = [
  "PORT",
  "NODE_ENV",
  "TZ",
  "FORCE_CLEAN_SEED",
  "META_APP_ID",
  "APP_ID",
  "CLOUDINARY_CLOUD_NAME",
  "BRAND_NAME",
] as const;

export type EditableKey = typeof EDITABLE_KEYS[number];
export type SecretKey = typeof SECRET_KEYS[number];

class ConfigStore {
  private cache: Map<string, any> = new Map();
  private initialized = false;

  public async init(): Promise<void> {
    try {
      if (process.env.NODE_ENV === "test") {
        Setting = require("./dbLocal").getSettingModel();
      } else {
        Setting = require("../models/Setting");
      }

      if (Setting && typeof Setting.find === "function") {
        const docs = await Setting.find({});
        if (Array.isArray(docs)) {
          for (const doc of docs) {
            if (doc && doc.key && (EDITABLE_KEYS as readonly string[]).includes(doc.key)) {
              this.cache.set(doc.key, doc.value);
            }
          }
        }
      }
      this.initialized = true;
    } catch (err: any) {
      console.error("⚠️ [ConfigStore] Error precargando configuración desde MongoDB (modo degradado a process.env):", err?.message || err);
      // No lanzamos: el sistema sigue funcionando con process.env
    }
  }

  public getConfig(key: string): any {
    // 1. Alias legacy especiales
    if (key === "WHATSAPP_PHONE") {
      if (process.env.WHATSAPP_PHONE !== undefined && process.env.WHATSAPP_PHONE !== "") {
        return process.env.WHATSAPP_PHONE;
      }
      return this.getConfig("ADMIN_PHONE_NUMBER");
    }
    if (key === "PHONE_NUMBER_ID") {
      return this.getConfig("WHATSAPP_PHONE_NUMBER_ID");
    }

    // 2. Revisar caché en memoria
    if (this.cache.has(key)) {
      const val = this.cache.get(key);
      if (val !== undefined && val !== null && val !== "") {
        return val;
      }
    }

    // 3. Fallback a process.env
    const envVal = process.env[key];
    if (envVal !== undefined && envVal !== "") {
      return envVal;
    }

    // Fallback específico para WHATSAPP_PHONE_NUMBER_ID a PHONE_NUMBER_ID
    if (key === "WHATSAPP_PHONE_NUMBER_ID") {
      return process.env.PHONE_NUMBER_ID;
    }

    return undefined;
  }

  public async setConfig(key: string, value: any): Promise<void> {
    if ((SECRET_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Seguridad: La variable '${key}' es un secreto y no puede ser editada desde el panel.`);
    }

    if (!(EDITABLE_KEYS as readonly string[]).includes(key)) {
      throw new Error(`La variable '${key}' no está en la lista de variables editables permitidas.`);
    }

    if (process.env.NODE_ENV === "test") {
      Setting = require("./dbLocal").getSettingModel();
    } else {
      Setting = require("../models/Setting");
    }

    const trimmedValue = typeof value === "string" ? value.trim() : value;

    await Setting.findOneAndUpdate(
      { key },
      { key, value: trimmedValue },
      { upsert: true, returnDocument: "after" }
    );

    this.cache.set(key, trimmedValue);
  }

  public async getAllConfig(): Promise<{
    editables: Record<string, any>;
    lectura: Record<string, any>;
    estadoSecretos: Record<string, boolean>;
  }> {
    const editables: Record<string, any> = {};
    for (const k of EDITABLE_KEYS) {
      editables[k] = this.getConfig(k) ?? "";
    }

    // Solo lectura: valor efectivo que usa el código (las claves no editables nunca se cachean, así que salen de process.env)
    const lectura: Record<string, any> = {};
    for (const k of READONLY_KEYS) {
      lectura[k] = this.getConfig(k) ?? "";
    }

    const estadoSecretos: Record<string, boolean> = {};
    for (const k of SECRET_KEYS) {
      estadoSecretos[k] = Boolean(process.env[k] && String(process.env[k]).trim().length > 0);
    }

    return {
      editables,
      lectura,
      estadoSecretos,
    };
  }

  public invalidateCache(): void {
    this.cache.clear();
    this.initialized = false;
  }
}

export const configStore = new ConfigStore();
export const getConfig = (key: string) => configStore.getConfig(key);
export const setConfig = (key: string, value: any) => configStore.setConfig(key, value);

module.exports = {
  configStore,
  getConfig,
  setConfig,
  EDITABLE_KEYS,
  READONLY_KEYS,
  SECRET_KEYS,
  HIDDEN_KEYS,
};
