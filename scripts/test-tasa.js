// test-tasa.js - Prueba de obtención de tasa BCV
const axios = require("axios");
const https = require("https");
const cheerio = require("cheerio");

// ==================== FUNCIÓN A PROBAR ====================
async function obtenerTasaUSD() {
  const metodos = [
    // Método 1: XPath directo al BCV (con Cheerio)
    async () => {
      console.log("🔍 Probando método 1: scraping BCV con Cheerio...");
      const response = await axios.get("https://www.bcv.org.ve/", {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      const $ = cheerio.load(response.data);
      // Buscar el elemento con id="dolar" y luego strong dentro de centrado
      let tasaText = $("#dolar .centrado strong").first().text().trim();
      if (!tasaText) {
        tasaText = $("#dolar strong").first().text().trim();
      }
      if (tasaText) {
        let limpio = tasaText.replace(/\./g, "").replace(",", ".");
        const tasa = parseFloat(limpio);
        if (!isNaN(tasa) && tasa > 0) return tasa;
      }
      throw new Error("No se encontró la tasa en el BCV");
    },
    // Método 2: API gratuita de respaldo (ve.dolarapi.com)
    async () => {
      console.log("🔍 Probando método 2: API ve.dolarapi.com...");
      const response = await axios.get(
        "https://ve.dolarapi.com/v1/dolares/bcv",
        { timeout: 5000 },
      );
      if (response.data && response.data.precio) {
        const tasa = parseFloat(response.data.precio);
        if (!isNaN(tasa) && tasa > 0) return tasa;
      }
      throw new Error("API de respaldo no retornó tasa");
    },
    // Método 3: Valor estático de emergencia
    async () => {
      console.log("🔍 Probando método 3: tasa fija de emergencia...");
      console.warn(
        "Usando tasa de emergencia fija (490.04). Revisar conexión.",
      );
      return 490.04;
    },
  ];

  for (let i = 0; i < metodos.length; i++) {
    try {
      const tasa = await metodos[i]();
      console.log(`✅ Tasa obtenida (método ${i + 1}): 1 USD = ${tasa} VES`);
      return tasa;
    } catch (err) {
      console.error(`❌ Método ${i + 1} falló: ${err.message}`);
    }
  }
  return null;
}

// ==================== EJECUTAR PRUEBA ====================
async function main() {
  console.log("🏁 Iniciando prueba de tasa BCV...\n");
  const tasa = await obtenerTasaUSD();
  if (tasa) {
    console.log(`\n🎉 Éxito: Tasa actual = ${tasa} VES por USD`);
  } else {
    console.log("\n💥 Todos los métodos fallaron. No se pudo obtener la tasa.");
  }
}

main();
