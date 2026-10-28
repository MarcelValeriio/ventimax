// services/bcv.js
const axios = require("axios");
const https = require("https");
const cheerio = require("cheerio");

let cachedRates = { USD: null, EUR: null };
let cachedDate = null;
let lastFetchTime = 0;
const THREE_HOURS = 3 * 60 * 60 * 1000;

async function fetchAndUpdateRate() {
  const metodos = [
    async () => {
      const response = await axios.get("https://www.bcv.org.ve/", {
        timeout: 15000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      const $ = cheerio.load(response.data);
      
      const getTasa = (id) => {
        const text = $(`#${id} .centrado strong, #${id} strong`).first().text().trim();
        if (!text) return null;
        const num = parseFloat(text.replace(/\./g, "").replace(",", "."));
        return isNaN(num) || num <= 0 ? null : num;
      };

      const usd = getTasa("dolar");
      const eur = getTasa("euro");

      if (usd) return { USD: usd, EUR: eur };
      throw new Error("No se encontró la tasa USD en el BCV");
    },
    async () => {
      const [usdRes, eurRes] = await Promise.all([
        axios.get("https://ve.dolarapi.com/v1/dolares/bcv", { timeout: 5000 }).catch(() => null),
        axios.get("https://ve.dolarapi.com/v1/monedas/euro", { timeout: 5000 }).catch(() => null)
      ]);
      
      const usd = usdRes?.data?.precio ? parseFloat(usdRes.data.precio) : null;
      const eur = eurRes?.data?.precio ? parseFloat(eurRes.data.precio) : null;

      if (usd) return { USD: usd, EUR: eur };
      throw new Error("API de respaldo no retornó tasa USD");
    },
  ];

  for (const metodo of metodos) {
    try {
      const rates = await metodo();
      cachedRates = rates;
      cachedDate = new Date().toLocaleDateString("es-VE", {
        timeZone: "America/Caracas",
      });
      lastFetchTime = Date.now();
      console.log(
        `✅ Tasas actualizadas: 1 USD = ${rates.USD}, 1 EUR = ${rates.EUR} (${cachedDate})`,
      );
      return { rates, fecha: cachedDate };
    } catch (err) {
      console.warn(`Método falló: ${err.message}`);
    }
  }
  return null;
}

// Actualización periódica cada 3 horas (Solo si no estamos en test)
if (process.env.NODE_ENV !== "test") {
  setInterval(fetchAndUpdateRate, THREE_HOURS);
  fetchAndUpdateRate(); // primera carga
}

async function obtenerTasas() {
  if (!cachedRates.USD || Date.now() - lastFetchTime > THREE_HOURS) {
    const nuevo = await fetchAndUpdateRate();
    if (nuevo) return nuevo;
  }
  if (cachedRates.USD) {
    return { rates: cachedRates, fecha: cachedDate };
  }
  return null;
}

module.exports = {
  obtenerTasas,
  obtenerTasaUSD: async () => {
    // Mock para pruebas: evita llamadas de red al BCV
    if (process.env.NODE_ENV === "test") {
      return {
        tasa: 36.0,
        fecha: new Date().toLocaleDateString("es-VE", {
          timeZone: "America/Caracas",
        }),
      };
    }
    const r = await obtenerTasas();
    return r ? { tasa: r.rates.USD, fecha: r.fecha } : null;
  },
};
