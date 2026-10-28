/**
 * types/webhooks.d.ts
 * Definiciones de tipos para el Webhook de Meta Cloud API (WhatsApp & Instagram).
 * Basado en controllers/webhookController.js.
 */

// ==========================================
// Tipos Básicos y Mensajes de WhatsApp
// ==========================================

export type WhatsAppMessageType =
  | "text"
  | "interactive"
  | "audio"
  | "voice"
  | "image"
  | "document"
  | "location"
  | "sticker"
  | "button"
  | "contacts"
  | "unknown"
  | string;

export type WhatsAppInteractiveType = "button_reply" | "list_reply" | string;

export type WhatsAppMessageStatus = "sent" | "delivered" | "read" | "failed";

export interface IWhatsAppInteractiveButtonReply {
  id: string;
  title: string;
}

export interface IWhatsAppInteractiveListReply {
  id: string;
  title: string;
  description?: string;
}

export interface IWhatsAppInteractive {
  type: WhatsAppInteractiveType;
  button_reply?: IWhatsAppInteractiveButtonReply;
  list_reply?: IWhatsAppInteractiveListReply;
}

export interface IWhatsAppMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
}

export interface IWhatsAppLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface IWhatsAppContext {
  forwarded?: boolean;
  frequently_forwarded?: boolean;
  from?: string;
  id?: string;
}

export interface IWhatsAppReferral {
  source_url?: string;
  source_type?: string;
  source_id?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  image_url?: string;
  video_url?: string;
  thumbnail_url?: string;
  ctwa_clid?: string;
}

export interface IWhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: WhatsAppMessageType;
  text?: {
    body: string;
  };
  interactive?: IWhatsAppInteractive;
  audio?: IWhatsAppMedia;
  voice?: IWhatsAppMedia;
  image?: IWhatsAppMedia;
  document?: IWhatsAppMedia;
  location?: IWhatsAppLocation;
  context?: IWhatsAppContext;
  referral?: IWhatsAppReferral;
}

// ==========================================
// Estados de Entrega / Lectura (Statuses)
// ==========================================

export interface IWhatsAppStatusError {
  code: number;
  title: string;
  message?: string;
  error_data?: {
    details: string;
  };
}

export interface IWhatsAppStatusPricing {
  billable: boolean;
  pricing_model: string;
  category: string;
}

export interface IWhatsAppStatusConversation {
  id: string;
  expiration_timestamp?: string;
  origin?: {
    type: string;
  };
}

export interface IWhatsAppStatus {
  id: string; // wamid
  status: WhatsAppMessageStatus;
  timestamp: string;
  recipient_id: string;
  pricing?: IWhatsAppStatusPricing;
  conversation?: IWhatsAppStatusConversation;
  errors?: IWhatsAppStatusError[] | null;
}

// ==========================================
// Contactos y Metadatos del Webhook
// ==========================================

export interface IWhatsAppContact {
  profile: {
    name: string;
  };
  wa_id: string;
}

export interface IWhatsAppWebhookValue {
  messaging_product: "whatsapp" | string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: IWhatsAppContact[];
  messages?: IWhatsAppMessage[];
  statuses?: IWhatsAppStatus[];
}

export interface IMetaWebhookChange {
  field: string;
  value: IWhatsAppWebhookValue;
}

export interface IMetaWebhookEntry {
  id: string;
  time?: number;
  changes?: IMetaWebhookChange[];
  messaging?: any[]; // Soporte para formato clásico de Instagram Direct
}

export interface IMetaWebhookPayload {
  object: "whatsapp_business_account" | "instagram" | string;
  entry: IMetaWebhookEntry[];
}

// ==========================================
// Tipos Parseados para Servicios Internos
// ==========================================

export interface IParsedLocation {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface IIncomingMessageOptions {
  contactName?: string | null;
  ctwaClid?: string | null;
  [key: string]: any;
}
