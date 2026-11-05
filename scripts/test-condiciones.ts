/**
 * scripts/test-condiciones.ts
 * Las condiciones del servicio salen de la marca activa, sin datos de otro negocio y escapando el HTML.
 * Uso: NODE_ENV=test npx tsx scripts/test-condiciones.ts
 */
import assert from "node:assert";

process.env.NODE_ENV = "test";

function cargar(marca: string) {
  process.env.BRAND_NAME = marca;
  for (const m of ["configManager", "paginaPrivacidad", "paginaCondiciones"]) delete require.cache[require.resolve(`../services/${m}`)];
  const configManager = require("../services/configManager");
  const { generarPaginaCondiciones } = require("../services/paginaCondiciones");
  return { configManager, generarPaginaCondiciones };
}

let ok = 0;
const prueba = (nombre: string, fn: () => void) => {
  fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
};

console.log("🚀 Suite de condiciones del servicio");

const { configManager, generarPaginaCondiciones } = cargar("ventimax");
const settings = configManager.get("settings");

prueba("VentiMax: nombra la marca, enlaza la privacidad y no menciona otros negocios", () => {
  const html = generarPaginaCondiciones();
  assert(html.includes("VentiMax"));
  assert(html.includes("Condiciones del Servicio"));
  assert(html.includes('href="/privacidad"'));
  assert(!/pachi|dumpling|asiátic|mr_pachi/i.test(html), "no debe quedar nada de Mr. Pachi");
});

prueba("Declara precios en USD, tasa BCV, pago verificado y cobro a destino", () => {
  const html = generarPaginaCondiciones();
  for (const t of ["USD", "BCV", "verifican", "a destino", "3 días"]) assert(html.includes(t), `falta: ${t}`);
});

prueba("Con datos legales y contacto: los muestra", () => {
  const legal = settings.legal, contact = settings.contact;
  settings.legal = { razonSocial: "Inversiones Prueba, C.A.", rif: "J-00000000-0", direccion: "Calle 1" };
  settings.contact = { email: "hola@prueba.test", website: "", instagram: "" };
  try {
    const html = generarPaginaCondiciones();
    assert(html.includes("Inversiones Prueba, C.A.") && html.includes("RIF J-00000000-0"));
    assert(html.includes("mailto:hola@prueba.test"));
  } finally {
    settings.legal = legal;
    settings.contact = contact;
  }
});

prueba("Escapa el HTML que venga de la configuración", () => {
  const legal = settings.legal;
  settings.legal = { razonSocial: '<script>alert("x")</script>' };
  try {
    const html = generarPaginaCondiciones();
    assert(!html.includes("<script>alert"));
    assert(html.includes("&lt;script&gt;"));
  } finally {
    settings.legal = legal;
  }
});

console.log(`🎉 ${ok} pruebas de condiciones del servicio superadas.`);
