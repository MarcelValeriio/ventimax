/**
 * scripts/test-privacidad.ts
 * La política de privacidad se genera desde la marca activa, sin datos de otro negocio,
 * con los datos legales cuando existen y escapando el HTML de la configuración.
 * Uso: NODE_ENV=test npx tsx scripts/test-privacidad.ts
 */
import assert from "node:assert";

process.env.NODE_ENV = "test";

function cargar(marca: string) {
  process.env.BRAND_NAME = marca;
  delete require.cache[require.resolve("../services/configManager")];
  delete require.cache[require.resolve("../services/paginaPrivacidad")];
  const configManager = require("../services/configManager");
  const { generarPaginaPrivacidad } = require("../services/paginaPrivacidad");
  return { configManager, generarPaginaPrivacidad };
}

let ok = 0;
const prueba = (nombre: string, fn: () => void) => {
  fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
};

console.log("🚀 Suite de política de privacidad");

const { configManager, generarPaginaPrivacidad } = cargar("ventimax");
const settings = configManager.get("settings");

prueba("VentiMax: nombra la marca y no menciona otros negocios", () => {
  const html = generarPaginaPrivacidad();
  assert(html.includes("VentiMax"), "debe nombrar VentiMax");
  assert(!/pachi|dumpling|asiátic|mr_pachi/i.test(html), "no debe quedar nada de Mr. Pachi");
  assert(html.includes('id="eliminacion-de-datos"'), "debe tener la sección de eliminación para Meta");
});

prueba("No promete que CANCELAR borra los datos", () => {
  const html = generarPaginaPrivacidad();
  assert(html.includes("no borra tus datos"), "debe aclarar que CANCELAR no borra datos");
  assert(html.includes("DeepSeek"), "debe declarar el proveedor de IA");
  assert(html.includes("90 días"), "debe declarar la retención de mensajes");
});

prueba("Sin datos legales ni contacto: usa la marca y no inventa nada", () => {
  // La marca puede traer su Instagram; esta prueba necesita el caso sin ningún contacto
  const contactOriginal = settings.contact;
  settings.contact = { email: "", website: "", instagram: "" };
  try {
    const html = generarPaginaPrivacidad();
    assert(!html.includes("RIF"), "sin RIF configurado no debe aparecer");
    assert(!html.includes("Última actualización"), "sin fecha no debe aparecer");
    assert(html.includes("Escríbenos por el mismo chat"), "sin contactos debe indicar el chat");
  } finally {
    settings.contact = contactOriginal;
  }
});

prueba("Con datos legales y contacto: los muestra", () => {
  const legalOriginal = settings.legal;
  const contactOriginal = settings.contact;
  settings.legal = { razonSocial: "Inversiones Prueba, C.A.", rif: "J-00000000-0", direccion: "Caracas", fechaActualizacion: "1 de enero de 2027" };
  settings.contact = { email: "hola@prueba.test", website: "", instagram: "@prueba" };
  try {
    const html = generarPaginaPrivacidad();
    assert(html.includes("Inversiones Prueba, C.A."));
    assert(html.includes("RIF J-00000000-0"));
    assert(html.includes("1 de enero de 2027"));
    assert(html.includes("mailto:hola@prueba.test"));
    assert(html.includes("@prueba"));
  } finally {
    settings.legal = legalOriginal;
    settings.contact = contactOriginal;
  }
});

prueba("Escapa el HTML que venga de la configuración", () => {
  const legalOriginal = settings.legal;
  settings.legal = { razonSocial: '<script>alert("x")</script>' };
  try {
    const html = generarPaginaPrivacidad();
    assert(!html.includes("<script>alert"), "no debe inyectar etiquetas");
    assert(html.includes("&lt;script&gt;"));
  } finally {
    settings.legal = legalOriginal;
  }
});

prueba("Marca default (sin clave legal) también genera la página", () => {
  const { generarPaginaPrivacidad: gen } = cargar("default");
  const html = gen();
  assert(html.includes("Mr. Pachi"));
  assert(html.includes("Política de Privacidad"));
});

console.log(`🎉 ${ok} pruebas de política de privacidad superadas.`);
