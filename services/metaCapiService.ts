import axios from "axios";

/**
 * Servicio de integración con Meta Conversions API (CAPI) para eventos de WhatsApp / CTWA.
 */

interface CustomData {
  currency: string;
  value: number;
  order_id?: string;
  [key: string]: any;
}

interface UserData {
  ctwa_clid?: string;
  [key: string]: any;
}

interface CapiEvent {
  event_name: string;
  event_time: number;
  event_id?: string;
  action_source: "business_messaging";
  messaging_channel: "whatsapp";
  user_data: UserData;
  custom_data: CustomData;
}

interface CapiPayload {
  data: CapiEvent[];
  test_event_code?: string;
}

/**
 * Envía el evento 'Purchase' a Meta Conversions API para pedidos originados en Click-to-WhatsApp (CTWA).
 * 
 * @param pedido Documento de Mongoose o plano con los datos del pedido verificado.
 * @returns Promesa con la respuesta de Meta o null si se omite.
 */
async function enviarEventoCompra(pedido: any): Promise<any> {
  try {
    const pixelId = process.env.META_PIXEL_ID || process.env.META_DATASET_ID;
    const capiToken = process.env.META_CAPI_TOKEN;

    if (!pixelId || !capiToken) {
      console.warn("⚠️ [Meta CAPI] No se pudo enviar evento de compra: META_PIXEL_ID o META_CAPI_TOKEN no configurados en .env.");
      return null;
    }

    if (!pedido) {
      console.warn("⚠️ [Meta CAPI] Objeto pedido no proporcionado a enviarEventoCompra.");
      return null;
    }

    // Resolver ctwaClid: directo del pedido o con fallback a la Etiqueta del cliente
    let ctwaClid = pedido.ctwaClid;
    if (!ctwaClid && pedido.whatsappId) {
      try {
        const Etiqueta = require("../models/Etiqueta");
        const etiqueta = await Etiqueta.findOne({ telefono: pedido.whatsappId }).lean();
        if (etiqueta?.ctwaClid) {
          ctwaClid = etiqueta.ctwaClid;
        }
      } catch (e: any) {
        console.warn("⚠️ [Meta CAPI] Error en fallback de búsqueda de Etiqueta:", e.message);
      }
    }

    if (!ctwaClid) {
      console.log(`ℹ️ [Meta CAPI] Pedido ${pedido.correlativo || pedido.idFormateado || pedido._id} sin 'ctwaClid'. No originado en anuncio CTWA. Omitiendo CAPI.`);
      return null;
    }

    // Determinar valor monetario y moneda
    let currency = "USD";
    let value = Number(pedido.pago?.montoUSD) || 0;

    // Si el monto en USD no está en pago, calcular usando helper
    if (!value && Array.isArray(pedido.items)) {
      const orderService = require("./orderService");
      value = orderService.calcularTotalCarrito(pedido);
    }

    // Si el método de pago indica bolívares y existe montoVES positivo, registrar en VES
    const metodo = (typeof pedido.pago?.metodo === "string" ? pedido.pago.metodo : "").toLowerCase();
    if (
      (metodo.includes("movil") || metodo.includes("móvil") || metodo.includes("ves") || metodo.includes("boliv")) &&
      Number(pedido.pago?.montoVES) > 0
    ) {
      currency = "VES";
      value = Number(pedido.pago.montoVES);
    }

    // Normalizar valor a 2 decimales
    value = Number(value.toFixed(2));

    const eventTime = Math.floor(
      (pedido.verifiedAt ? new Date(pedido.verifiedAt).getTime() : Date.now()) / 1000
    );
    const orderId = (pedido.correlativo || pedido.idFormateado || pedido._id?.toString() || `ORD-${Date.now()}`).toString();

    // Meta Graph API rechaza ctwa_clid que no sigan su formato exacto. 
    // Filtramos los generados internamente (ad_ o igad_) para no romper la petición.
    let validCtwaClid = ctwaClid;
    if (ctwaClid && (ctwaClid.startsWith("ad_") || ctwaClid.startsWith("igad_"))) {
      validCtwaClid = undefined;
    }

    const payload: CapiPayload = {
      data: [
        {
          event_name: "Purchase",
          event_time: eventTime,
          event_id: orderId,
          action_source: "business_messaging",
          messaging_channel: "whatsapp",
          user_data: {
            ctwa_clid: validCtwaClid,
            whatsapp_business_account_id: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || undefined,
          },
          custom_data: {
            currency,
            value,
            order_id: orderId,
          },
        },
      ],
    };

    // Soporte opcional para depuración con código de prueba en Meta Events Manager
    if (process.env.META_CAPI_TEST_EVENT_CODE) {
      payload.test_event_code = process.env.META_CAPI_TEST_EVENT_CODE;
    }

    console.log(`📡 [Meta CAPI] Enviando evento 'Purchase' para pedido ${orderId} (${currency} ${value}) con ctwa_clid=${validCtwaClid || 'omitido_por_invalido'}...`);

    const response = await axios.post(
      `https://graph.facebook.com/v20.0/${pixelId}/events`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${capiToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log(`✅ [Meta CAPI] Evento Purchase registrado exitosamente en Meta. FbTraceId: ${response.data?.fbtrace_id || "N/A"}`);
    return response.data;
  } catch (error: any) {
    const errorDetails = error.response?.data?.error || error.response?.data || error.message;
    console.error("❌ [Meta CAPI] Error enviando evento Purchase a Meta Graph API:", JSON.stringify(errorDetails));
    // No relanzamos el error para no interrumpir el flujo administrativo del pedido
    return null;
  }
}

module.exports = {
  enviarEventoCompra,
};
