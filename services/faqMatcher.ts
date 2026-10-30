/**
 * services/faqMatcher.js
 * Detección y coincidencia de Preguntas Frecuentes (FAQs) por palabras clave locales.
 * Cero llamadas a la API de IA.
 */

/**
 * Normaliza una cadena de texto a minúsculas, sin tildes/diacríticos y sin espacios redundantes.
 * @param {string} str 
 * @returns {string}
 */
function normalizeText(str) {
  if (!str || typeof str !== "string") return "";
  return str
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Busca si algún FAQ activo coincide con las palabras clave en el texto del usuario.
 * @param {string} userMessage - Mensaje enviado por el usuario.
 * @param {Array} faqs - Lista de objetos FAQ { pregunta, keywords, respuesta, activo, ... }
 * @returns {Object|null} - El primer FAQ que coincida, o null si ninguno coincide.
 */
function buscarFAQ(userMessage, faqs = []) {
  if (!userMessage || !Array.isArray(faqs) || faqs.length === 0) return null;

  const normalizedMsg = normalizeText(userMessage);
  if (!normalizedMsg) return null;

  for (const faq of faqs) {
    if (faq.activo === false) continue;
    const keywords = Array.isArray(faq.keywords) ? faq.keywords : [];
    for (const kw of keywords) {
      const normalizedKw = normalizeText(kw);
      if (normalizedKw && normalizedMsg.includes(normalizedKw)) {
        return faq;
      }
    }
  }

  return null;
}

const { obtenerTasaUSD } = require("./bcv");
const { formatBs, formatUsd } = require("../utils/helpers");
const configManager = require("./configManager");
const { precioVigente, descuentoVigente } = require("./precios");

/**
 * Consulta los sabores/productos en stock desde la base de datos y formatea la respuesta.
 * @returns {Promise<string>}
 */
async function getSaboresEnStock() {
  let Producto = require("../models/Producto");
  if (process.env.NODE_ENV === "test") {
    const dbLocal = require("./dbLocal");
    if (typeof dbLocal.getProductoModel === "function") {
      Producto = dbLocal.getProductoModel();
    }
  }

  const productos = await Producto.find({
    activo: true,
    $or: [{ trackStock: { $ne: true } }, { stock: { $gt: 0 } }],
  });
  const lista = Array.isArray(productos) ? productos : [];
  const disponibles = lista.filter((p) => {
    if (!p.activo) return false;
    if (p.trackStock) {
      return (Number(p.stock) || 0) > 0;
    }
    return true; // trackStock === false o no configurado -> venta ilimitada
  });

  if (disponibles.length === 0) {
    return (
      configManager.format("settings.messages.stockEmpty") ||
      "En este momento no hay productos disponibles."
    );
  }

  const lineas = disponibles.map((p) => `• ${p.name || p.nombre || "Producto"}`);
  const header =
    configManager.format("settings.messages.stockHeader") ||
    "📦 *Productos Disponibles para hoy:*";
  return `${header}\n\n${lineas.join("\n")}`;
}

/**
 * Consulta el menú completo con productos en stock agrupados por categoría,
 * con precios en USD y Bs. según la tasa oficial BCV.
 * @returns {Promise<string>}
 */
async function getMenuDinamico() {
  let Producto = require("../models/Producto");
  let Categoria = require("../models/Categoria");
  if (process.env.NODE_ENV === "test") {
    const dbLocal = require("./dbLocal");
    if (typeof dbLocal.getProductoModel === "function") {
      Producto = dbLocal.getProductoModel();
    }
    if (typeof dbLocal.getCategoriaModel === "function") {
      Categoria = dbLocal.getCategoriaModel();
    }
  }

  const productos = await Producto.find({
    activo: true,
    $or: [{ trackStock: { $ne: true } }, { stock: { $gt: 0 } }],
  });
  const lista = Array.isArray(productos) ? productos : [];
  const disponibles = lista.filter((p) => {
    if (!p.activo) return false;
    if (p.trackStock) {
      return (Number(p.stock) || 0) > 0;
    }
    return true;
  });

  if (disponibles.length === 0) {
    return "En este momento no hay productos disponibles en el menú.";
  }

  let categoriasMap = new Map();
  try {
    const categorias = await Categoria.find({});
    if (Array.isArray(categorias)) {
      for (const cat of categorias) {
        if (cat._id) categoriasMap.set(String(cat._id), cat.nombre);
        if (cat.slug) categoriasMap.set(cat.slug, cat.nombre);
        if (cat.nombre) categoriasMap.set(cat.nombre, cat.nombre);
      }
    }
  } catch (err) {
    // Si falla consultar categorías, continúa con el fallback
  }

  let tasa = 0;
  try {
    const tasaRes = await obtenerTasaUSD();
    tasa = Number(tasaRes?.tasa) || 0;
  } catch (err) {
    tasa = 0;
  }

  const grupos = new Map();
  for (const p of disponibles) {
    const catKeys = [];
    if (p.categoria) catKeys.push(p.categoria);
    if (Array.isArray(p.categorias)) {
      for (const c of p.categorias) {
        if (c) catKeys.push(c);
      }
    }

    const matchedCatNames = new Set();
    for (const c of catKeys) {
      if (typeof c === "object" && c.nombre) {
        matchedCatNames.add(c.nombre);
      } else {
        const idStr = String(c._id || c);
        if (categoriasMap.has(idStr)) {
          matchedCatNames.add(categoriasMap.get(idStr));
        } else if (typeof c === "string" && !idStr.match(/^[0-9a-fA-F]{24}$/)) {
          matchedCatNames.add(c);
        }
      }
    }

    const categoryEmoji = configManager.get("settings.categoryEmoji") || "📦";
    if (matchedCatNames.size === 0) {
      matchedCatNames.add(`${categoryEmoji} Nuestros Productos`);
    }

    for (const catNombre of matchedCatNames) {
      if (!grupos.has(catNombre)) {
        grupos.set(catNombre, []);
      }
      grupos.get(catNombre).push(p);
    }
  }

  const secciones = [];
  const defaultCategoryEmoji = configManager.get("settings.categoryEmoji") || "📦";
  for (const [catNombre, prods] of grupos.entries()) {
    const emojiHeader = defaultCategoryEmoji;
    const header = `${emojiHeader} *${catNombre.trim()}:*`;
    const prodsTexto = prods.map((p) => {
      const emojiProd = p.emoji ? `${p.emoji} ` : "• ";
      const nombre = (p.name || p.nombre || "Producto").trim();
      // Precio VIGENTE (F2g) y, con descuento, el porcentaje
      const precioUSD = precioVigente(p);
      const pct = descuentoVigente(p);
      const usdFormatted = `$${formatUsd(precioUSD)}${pct > 0 ? ` (-${pct}%)` : ""}`;
      let precioTexto = usdFormatted;
      if (tasa > 0) {
        const bsFormatted = formatBs(precioUSD * tasa);
        precioTexto = `${usdFormatted} (Bs. ${bsFormatted})`;
      }
      let linea = `${emojiProd}${nombre} - ${precioTexto}`;
      if (p.description && typeof p.description === "string" && p.description.trim()) {
        linea += `\n  _${p.description.trim()}_`;
      }
      return linea;
    }).join("\n");

    secciones.push(`${header}\n${prodsTexto}`);
  }

  const pie = "\n\n💡 _Precios en Bolívares calculados a tasa oficial BCV del día._";
  return `🥢 *Menú y Precios Disponibles:*\n\n${secciones.join("\n\n")}${pie}`;
}

module.exports = {
  buscarFAQ,
  normalizeText,
  getSaboresEnStock,
  getMenuDinamico,
};
