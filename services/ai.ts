// services/ai.js
const axios = require("axios");
const { createBreaker } = require("./circuitBreaker");
const configManager = require("./configManager");
const { precioVigente, descuentoVigente } = require("./precios");
const Producto = require("../models/Producto");
const { obtenerTasaUSD } = require("./bcv");
const { formatBs, formatUsd } = require("../utils/helpers");

// ─── Circuit Breaker para DeepSeek ───
let _deepseekBreaker = null;
function getDeepseekBreaker() {
  if (!_deepseekBreaker) {
    _deepseekBreaker = createBreaker("deepseek", async (config) => {
      return await axios.post("https://api.deepseek.com/v1/chat/completions", config.data, config.options);
    }, { timeout: 15000 });
  }
  return _deepseekBreaker;
}

async function consultarAsistenteVentas(mensajeUsuario) {
  // Soporte para Pruebas de Integración (Mock)
  if (process.env.NODE_ENV === "test") {
    const brandName = configManager.get("settings.brandName") || "VentiMax";
    const botIdentity = configManager.get("settings.botIdentity") || "Yuri-Bot";
    const businessDesc = configManager.get("settings.businessDescription") || (brandName === "Mr. Pachi" ? "Ofrecemos deliciosa comida asiática congelada en Caracas." : "");
    const low = mensajeUsuario.toLowerCase();
    if (low.includes("hola")) return `¡Hola! Soy ${botIdentity}, el asistente de ${brandName}.${businessDesc ? ` ${businessDesc}` : ""} ¿Deseas ver nuestro catálogo?`;
    if (low.includes("pachi familiar")) return "El Combo Pachi Familiar cuesta $25 y es uno de nuestros favoritos. ¿Deseas agregarlo al carrito?";
    return "Entiendo. ¿Deseas ver el catálogo o realizar un pedido?";
  }

  if (!process.env.DEEPSEEK_API_KEY) return "🤖 Modo básico activado.";

  try {
    const brandName = configManager.get("settings.brandName");
    const basePrompt = configManager.format("ai_prompt", { brandName });

    // 1. Obtener contexto REAL de MongoDB
    const productosDB = await Producto.find({
      activo: true,
      $or: [{ trackStock: { $ne: true } }, { stock: { $gt: 0 } }],
    }).sort({ name: 1 });
    const tasaRes = await obtenerTasaUSD();
    const tasa = tasaRes?.tasa || 0;

    // 2. Formatear lista de productos para la IA
    let contextoproductos = "";
    if (productosDB.length > 0) {
      contextoproductos = productosDB.map(p => lineaProductoParaIA(p, tasa)).join("\n");
    } else {
      contextoproductos = "No hay productos disponibles en este momento.";
    }

    // 3. Construir System Prompt dinámico blindado
    const systemPrompt = `${basePrompt}\n\n` +
      `### INVENTARIO REAL EN TIEMPO REAL (MONGODB):\n${contextoproductos}\n\n` +
      `### REGLAS ABSOLUTAS DE INVENTARIO Y FORMATO:\n` +
      `1. RESPONDE ÚNICAMENTE usando los productos listados arriba.\n` +
      `2. Muestra precios siempre en $ y Bs usando la tasa de ${formatBs(tasa)} Bs si el cliente te pregunta por un producto específico.\n` +
      `3. Si el producto no está en la lista de arriba, NO existe.\n` +
      `4. REGLA DE INTERFAZ CRÍTICA: Está TERMINANTEMENTE PROHIBIDO listar todos los productos disponibles en formato de viñetas, guiones o texto largo. No dupliques el catálogo. Si el cliente quiere ver las opciones o desea comprar, mantén tu respuesta conversacional muy corta y dile explícitamente que escriba la palabra 'Menú' (entre comillas simples) para que el sistema le despliegue el catálogo interactivo oficial de WhatsApp.`;

    const response = await getDeepseekBreaker().fire({
      data: {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: mensajeUsuario },
        ],
        temperature: 0.2,
      },
      options: {
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        timeout: 15000,
      },
    });
    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("❌ Error en IA (Sincronización MongoDB):", error.message);
    return "🤖 Presento intermitencia. Por favor elige una opción del menú.";
  }
}

async function evaluarReactivacionConIA(paso, mensajesContexto) {
  if (process.env.NODE_ENV === "test") {
    return { requiere_retoma: true, mensaje: "¿Deseas continuar tu pedido?" };
  }

  if (!process.env.DEEPSEEK_API_KEY) {
    return { requiere_retoma: true, mensaje: `Hola 👋, vimos que quedaste pendiente en tu pedido. ¿Seguimos?` };
  }

  try {
    const chatLog = mensajesContexto.map(m => `[${m.direccion === 'user' || m.direccion === 'cliente' ? 'Cliente' : 'Bot/Admin'}]: ${m.texto}`).join("\n");

    const brandName = configManager.get("settings.brandName") || "la empresa";
    const businessDesc = configManager.get("settings.businessDescription");
    const descText = businessDesc ? ` (${businessDesc})` : "";
    const systemPrompt = `Eres un analista de ventas de ${brandName}${descText}. Tu trabajo es leer los últimos mensajes del chat y decidir si corresponde enviar un mensaje para retomar una venta o carrito abandonado.
El sistema indica que el usuario se quedó en el paso: "${paso}".

REGLAS ABSOLUTAS:
1. Si el cliente YA completó su compra, envió comprobante de pago, o la conversación concluyó con éxito, la retoma NO es necesaria (requiere_retoma: false).
2. Si un administrador ya le dio respuesta final al cliente y cerraron la interacción, NO envíes mensaje.
3. Si el cliente dejó una pregunta en el aire, se quedó a la mitad del menú o abandonó el carrito, SÍ debes retomarlo (requiere_retoma: true).
4. El "mensaje_sugerido" debe ser MUY CORTO (máximo 2 líneas), amable, nada redundante, e invitar a continuar.

RESPUESTA OBLIGATORIA EN FORMATO JSON ESTRICTO con esta estructura:
{
  "requiere_retoma": boolean,
  "mensaje_sugerido": string | null,
  "motivo": string
}`;

    const response = await getDeepseekBreaker().fire({
      data: {
        model: "deepseek-chat", // DeepSeek-V3 es el modelo recomendado y más económico
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Historial de chat reciente:\n${chatLog}` },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      },
      options: {
        headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
        timeout: 15000,
      },
    });

    const content = response.data.choices[0].message.content;
    try {
      const parsed = JSON.parse(content);
      return {
        requiere_retoma: Boolean(parsed.requiere_retoma),
        mensaje: parsed.mensaje_sugerido || null,
        motivo: parsed.motivo || "Analizado por IA"
      };
    } catch (parseError) {
      console.error("❌ Error parseando JSON de DeepSeek en retoma:", content);
      return { requiere_retoma: false, mensaje: null, motivo: "Error parseando JSON" };
    }
  } catch (error) {
    console.error("❌ Error en evaluarReactivacionConIA:", error.message);
    return { requiere_retoma: false, mensaje: null, motivo: "Fallo conexión API DeepSeek" };
  }
}

/**
 * Línea del catálogo que recibe la IA (F2g). Usa el precio VIGENTE del producto; con descuento lo indica.
 */
function lineaProductoParaIA(p: any, tasa: number): string {
  const precioVig = precioVigente(p);
  const pct = descuentoVigente(p);
  const precioBs = tasa > 0 ? formatBs(precioVig * tasa) : "N/A";
  const descuentoTxt = pct > 0 ? ` (con ${pct}% de descuento)` : "";
  return `- ${p.name}: ${p.description || "Sin descripción"}. Precio: $${formatUsd(precioVig)}${descuentoTxt} / ${precioBs} Bs.`;
}

module.exports = { consultarAsistenteVentas, evaluarReactivacionConIA, lineaProductoParaIA };
