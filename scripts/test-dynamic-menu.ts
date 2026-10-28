/**
 * scripts/test-dynamic-menu.ts
 * Suite de validación para Menú Dinámico basado en inventario real:
 * - FAQs dinámicas con dynamicKey: "menu" y getMenuDinamico()
 * - Filtro estricto de stock: solo productos activos y con stock disponible
 * - Agrupación por categoría y conversión de precios USD / Bs. (tasa BCV)
 * - Respuestas Rápidas (parseTemplate) con token {menu} y contexto del Inbox
 */

process.env.NODE_ENV = "test";
import assert from "node:assert";
import parseTemplate from "../public/src/features/whatsapp/components/parseTemplate.js";

const dbLocal = require("../services/dbLocal");
const { getMenuDinamico, getSaboresEnStock, buscarFAQ } = require("../services/faqMatcher");

async function runTests() {
  console.log("🧪 Iniciando pruebas de Menú Dinámico e Inventario...\n");

  // 1. Preparar datos de prueba en temp_db.json
  const data = dbLocal.read();
  
  const catDumplingsId = "cat_dumplings_123";
  const catBebidasId = "cat_bebidas_456";

  data.categorias = [
    { _id: catDumplingsId, nombre: "Dumplings Artesanales", slug: "dumplings" },
    { _id: catBebidasId, nombre: "Bebidas y Acompañantes", slug: "bebidas" },
  ];

  data.productos = [
    {
      _id: "prod_1",
      id: "prod-cerdo",
      name: "Dumplings de Cerdo y Cebollín",
      price: 15.0,
      description: "Caja de 25 unidades",
      categoria: catDumplingsId,
      activo: true,
      trackStock: true,
      stock: 10, // DISPONIBLE
    },
    {
      _id: "prod_2",
      id: "prod-pollo",
      name: "Dumplings de Pollo",
      price: 15.0,
      description: "Caja de 25 unidades con vegetales",
      categoria: catDumplingsId,
      activo: true,
      trackStock: true,
      stock: 0, // AGOTADO -> NO debe aparecer
    },
    {
      _id: "prod_3",
      id: "prod-veg",
      name: "Dumplings Vegetarianos",
      price: 14.0,
      description: "Caja de 25 unidades veganas",
      categoria: catDumplingsId,
      activo: false, // INACTIVO -> NO debe aparecer
      trackStock: false,
      stock: 100,
    },
    {
      _id: "prod_4",
      id: "prod-te",
      name: "Té Verde Jazmín Frío",
      price: 3.5,
      description: "Botella 500ml",
      categoria: catBebidasId,
      activo: true,
      trackStock: false, // Venta ilimitada -> DISPONIBLE
      stock: 0,
    },
  ];

  data.faqs = [
    {
      _id: "faq_menu",
      pregunta: "¿Cuál es el menú?",
      keywords: ["menu", "menú", "carta", "catalogo", "productos", "que tienen"],
      respuesta: "Consultando menú...",
      type: "dinamica",
      dynamicKey: "menu",
      activo: true,
      order: 1,
      brand: "default",
    },
  ];

  dbLocal.write(data);

  // ── TEST 1: getMenuDinamico filtra agotados e inactivos ────────────────
  console.log("▶ Test 1: getMenuDinamico() incluye solo productos disponibles y con stock...");
  const menuText = await getMenuDinamico();
  assert(typeof menuText === "string", "El menú debe ser un string");
  assert(menuText.includes("Dumplings de Cerdo y Cebollín"), "Debe incluir producto disponible en stock");
  assert(menuText.includes("Té Verde Jazmín Frío"), "Debe incluir producto de venta ilimitada");
  assert(!menuText.includes("Dumplings de Pollo"), "NO debe incluir producto agotado (stock: 0 con trackStock: true)");
  assert(!menuText.includes("Dumplings Vegetarianos"), "NO debe incluir producto inactivo (activo: false)");
  assert(menuText.includes("$15.00"), "Debe mostrar el precio en USD");
  assert(menuText.includes("Dumplings Artesanales"), "Debe agrupar por categoría");
  assert(menuText.includes("Bebidas y Acompañantes"), "Debe mostrar segunda categoría");
  console.log("✅ Test 1 superado.");

  // ── TEST 2: Fallback cuando todo está agotado ───────────────────────────
  console.log("▶ Test 2: getMenuDinamico() muestra mensaje amigable cuando no hay stock...");
  const dataVacia = dbLocal.read();
  dataVacia.productos.forEach((p: any) => { p.stock = 0; p.trackStock = true; });
  dbLocal.write(dataVacia);

  const menuVacio = await getMenuDinamico();
  assert.strictEqual(menuVacio, "En este momento no hay productos disponibles en el menú.");
  console.log("✅ Test 2 superado.");

  // Restaurar stock
  dataVacia.productos[0].stock = 5;
  dbLocal.write(dataVacia);

  // ── TEST 3: FAQ Matching con dynamicKey: 'menu' ────────────────────────
  console.log("▶ Test 3: buscarFAQ reconoce palabras clave de menú...");
  const faqMatch = buscarFAQ("hola tienen el menu disponible?", data.faqs);
  assert(faqMatch !== null, "Debe hacer match con el FAQ de menú");
  assert.strictEqual(faqMatch.type, "dinamica");
  assert.strictEqual(faqMatch.dynamicKey, "menu");
  console.log("✅ Test 3 superado.");

  // ── TEST 4: parseTemplate con token {menu} ─────────────────────────────
  console.log("▶ Test 4: parseTemplate sustituye {menu} correctamente...");
  const plantillaMenu = "¡Hola {nombre}! 🥢 Este es nuestro menú hoy:\n\n{menu}\n\n¿Qué deseas ordenar?";
  const parsed = parseTemplate(plantillaMenu, {
    customerName: "Carlos",
    menuTexto: "• Dumplings Cerdo - $15.00",
  });

  assert(parsed.includes("¡Hola Carlos!"), "Debe sustituir {nombre}");
  assert(parsed.includes("• Dumplings Cerdo - $15.00"), "Debe sustituir {menu}");
  assert(!parsed.includes("{menu}"), "No deben quedar tokens {menu} sin sustituir");
  console.log("✅ Test 4 superado.");

  // ── TEST 5: parseTemplate con variables vacías y fallback ─────────────
  console.log("▶ Test 5: parseTemplate maneja fallback cuando {menu} no tiene datos...");
  const plantillaVacia = "Menú disponible:\n{menu}";
  const parsedVacio = parseTemplate(plantillaVacia, { customerName: "Carlos" });
  assert(parsedVacio.includes("En este momento no hay productos disponibles en el menú."));
  console.log("✅ Test 5 superado.");

  // ── TEST 6: Verificación de contrato en InboxQuickReplyBar.js ───────────
  console.log("▶ Test 6: Verificación de contrato y tokens en InboxQuickReplyBar.js...");
  const fs = require("node:fs");
  const path = require("node:path");
  const inboxCode = fs.readFileSync(
    path.join(__dirname, "../public/src/features/inbox/components/InboxQuickReplyBar.js"),
    "utf-8"
  );
  assert(inboxCode.includes("const TOKEN_RE = /\\{(nombre|totalUSD|totalBS|total|items|menu)\\}/;"));
  assert(inboxCode.includes("menu: d.menuTexto || d.menu || null"));
  assert(inboxCode.includes("textoParcial.replace(/\\{menu\\}/g, ctx.menuTexto || ctx.menu)"));
  console.log("✅ Test 6 superado.");

  console.log("\n🎉 ¡TODAS LAS PRUEBAS DE MENÚ DINÁMICO PASARON EXITOSAMENTE (6/6)!\n");
}

runTests().catch((err) => {
  console.error("❌ Error en prueba:", err);
  process.exit(1);
});
