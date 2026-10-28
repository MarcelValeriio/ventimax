#!/usr/bin/env npx tsx
/**
 * scripts/test-catalogo-web.ts
 * Suite de pruebas para las páginas de la tienda (sitio estático) - F2-3.
 * Verifica la lógica del carrito, sanitización estricta, estructura HTML,
 * ausencia de innerHTML, ausencia de marcas en código y cabeceras en render.yaml.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

import {
  agregarProducto,
  actualizarCantidad,
  eliminarProducto,
  vaciarCarrito,
  obtenerTotalUnidades,
  armarCuerpoPedido,
  serializarCarrito,
  deserializarCarrito,
  cargarCarritoDesdeStorage,
  guardarCarritoEnStorage,
  limpiarCarritoEnStorage,
  MIN_CANTIDAD_POR_LINEA,
  MAX_CANTIDAD_POR_LINEA,
  MAX_LINEAS_CARRITO,
} from "../catalogo/js/carrito.js";

async function runTests() {
  console.log("================================================================================");
  console.log("🌐 SUITE DE PRUEBAS: PÁGINAS DEL CATÁLOGO WEB ESTÁTICO (F2-3)");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // TEST 1: Lógica del carrito en catalogo/js/carrito.js
  // --------------------------------------------------------------------------
  console.log("▶ Test 1: Lógica del carrito (agregar, actualizar, eliminar, límites)...");

  // 1a: Agregar producto
  let items: any[] = [];
  items = agregarProducto(items, "prod-01", 2);
  assert.strictEqual(items.length, 1);
  assert.strictEqual(items[0].productoId, "prod-01");
  assert.strictEqual(items[0].cantidad, 2);

  // 1b: Sumar al mismo producto
  items = agregarProducto(items, "prod-01", 3);
  assert.strictEqual(items.length, 1, "No debe duplicar la línea");
  assert.strictEqual(items[0].cantidad, 5, "Debe sumar las cantidades");

  // 1c: Límite superior por línea (máximo 50)
  items = agregarProducto(items, "prod-01", 100);
  assert.strictEqual(items[0].cantidad, MAX_CANTIDAD_POR_LINEA, "Debe topar la cantidad en 50");

  // 1d: Límite inferior por línea (mínimo 1)
  items = agregarProducto(items, "prod-02", -5);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[1].cantidad, MIN_CANTIDAD_POR_LINEA, "Cantidad negativa se normaliza a 1");

  // 1e: Límite máximo de líneas distintas (máximo 20)
  let items20: any[] = [];
  for (let i = 1; i <= 20; i++) {
    items20 = agregarProducto(items20, `prod-${i}`, 1);
  }
  assert.strictEqual(items20.length, MAX_LINEAS_CARRITO, "Debe permitir hasta 20 líneas");

  // Intentar agregar la línea 21
  const items21 = agregarProducto(items20, "prod-21", 1);
  assert.strictEqual(items21.length, MAX_LINEAS_CARRITO, "No debe permitir más de 20 líneas");

  // 1f: Actualizar cantidad
  items = actualizarCantidad(items, "prod-01", 10);
  assert.strictEqual(items.find((i) => i.productoId === "prod-01")?.cantidad, 10);

  // Actualizar a 0 elimina el producto
  items = actualizarCantidad(items, "prod-01", 0);
  assert.strictEqual(items.find((i) => i.productoId === "prod-01"), undefined);

  // 1g: Eliminar producto
  items = eliminarProducto(items, "prod-02");
  assert.strictEqual(items.length, 0);

  // 1h: Vaciar carrito y total de unidades
  let itemsContar = [
    { productoId: "p1", cantidad: 4 },
    { productoId: "p2", cantidad: 6 },
  ];
  assert.strictEqual(obtenerTotalUnidades(itemsContar), 10);
  itemsContar = vaciarCarrito();
  assert.strictEqual(itemsContar.length, 0);
  assert.strictEqual(obtenerTotalUnidades(itemsContar), 0);

  console.log("  ✅ Test 1 superado (Lógica del carrito y límites 1-50 / 20 líneas)");

  // --------------------------------------------------------------------------
  // TEST 2: Cuerpo del POST (armarCuerpoPedido) sin precios ni otros campos
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 2: armarCuerpoPedido genera payload estricto sin precios...");
  const itemsConPreciosFalsos = [
    { productoId: "item-01", cantidad: 2, precio: 99.99, nombre: "Hacker Item", total: 199.98 },
    { productoId: "item-02", cantidad: 1, discount: "50%", clientNote: "free shipping" },
  ];

  const payload = armarCuerpoPedido(itemsConPreciosFalsos as any, "");
  assert.ok(payload.items, "Debe tener propiedad items");
  assert.strictEqual(typeof payload.website, "string", "Debe tener propiedad website");
  assert.strictEqual(payload.website, "", "website debe ser string vacío");

  const keysPayload = Object.keys(payload);
  assert.strictEqual(keysPayload.length, 2, "El payload debe contener EXACTAMENTE 2 campos (items, website)");

  for (const it of payload.items) {
    const itemKeys = Object.keys(it);
    assert.strictEqual(itemKeys.length, 2, "Cada item debe tener exactamente 2 campos (productoId, cantidad)");
    assert.strictEqual(typeof it.productoId, "string");
    assert.strictEqual(typeof it.cantidad, "number");
    assert.strictEqual((it as any).precio, undefined, "Prohibido enviar precio");
    assert.strictEqual((it as any).nombre, undefined, "Prohibido enviar nombre");
    assert.strictEqual((it as any).total, undefined, "Prohibido enviar total");
  }

  // Honeypot en el payload
  const payloadHoneypot = armarCuerpoPedido(itemsConPreciosFalsos as any, "https://spam.com");
  assert.strictEqual(payloadHoneypot.website, "https://spam.com", "Debe incluir el valor del honeypot");

  console.log("  ✅ Test 2 superado (armarCuerpoPedido genera payload limpio de precios)");

  // --------------------------------------------------------------------------
  // TEST 3: Serialización y deserialización para localStorage
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 3: Serialización, deserialización y mock storage...");
  const rawItems = [{ productoId: "prod-x", cantidad: 3 }];
  const jsonStr = serializarCarrito(rawItems);
  assert.strictEqual(jsonStr, JSON.stringify(rawItems));

  const parsed = deserializarCarrito(jsonStr);
  assert.deepStrictEqual(parsed, rawItems);

  // Manejo de JSON corrupto
  assert.deepStrictEqual(deserializarCarrito("not a json"), []);
  assert.deepStrictEqual(deserializarCarrito(""), []);
  assert.deepStrictEqual(deserializarCarrito("{ not: an array }"), []);

  // Sanitización de datos adulterados en localStorage
  const tamperedJson = JSON.stringify([
    { productoId: "hacked", cantidad: 9999, price: 0.01, isAdmin: true },
  ]);
  const parsedTampered = deserializarCarrito(tamperedJson);
  assert.strictEqual(parsedTampered.length, 1);
  assert.strictEqual(parsedTampered[0].productoId, "hacked");
  assert.strictEqual(parsedTampered[0].cantidad, MAX_CANTIDAD_POR_LINEA, "Cantidad adulterada se topará en 50");
  assert.strictEqual((parsedTampered[0] as any).price, undefined);
  assert.strictEqual((parsedTampered[0] as any).isAdmin, undefined);

  // Mock Storage
  const mockStorageStore: Record<string, string> = {};
  const mockStorage = {
    getItem: (key: string) => mockStorageStore[key] || null,
    setItem: (key: string, val: string) => {
      mockStorageStore[key] = val;
    },
    removeItem: (key: string) => {
      delete mockStorageStore[key];
    },
  };

  guardarCarritoEnStorage(rawItems, mockStorage as any);
  const cargado = cargarCarritoDesdeStorage(mockStorage as any);
  assert.deepStrictEqual(cargado, rawItems);
  limpiarCarritoEnStorage(mockStorage as any);
  assert.deepStrictEqual(cargarCarritoDesdeStorage(mockStorage as any), []);

  console.log("  ✅ Test 3 superado (Persistencia sanitizada en storage)");

  // --------------------------------------------------------------------------
  // TEST 4: Verificación estricta de HTML (sin scripts en línea ni on*=)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 4: Integridad HTML (sin scripts en línea ni eventos on*=)...");
  const catalogoDir = path.resolve(__dirname, "../catalogo");
  const filesInCatalogo = fs.readdirSync(catalogoDir);
  const htmlFiles = filesInCatalogo.filter((f) => f.endsWith(".html"));

  assert.ok(htmlFiles.length >= 1, "Debe existir al menos index.html en catalogo/");

  for (const htmlFile of htmlFiles) {
    const htmlContent = fs.readFileSync(path.join(catalogoDir, htmlFile), "utf8");

    // Verificar que todo <script> tenga src
    const scriptTagRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    let match: RegExpExecArray | null;
    while ((match = scriptTagRegex.exec(htmlContent)) !== null) {
      const attrs = match[1];
      const inlineCode = match[2].trim();
      assert.ok(
        attrs.includes("src="),
        `En ${htmlFile}: se encontró etiqueta <script> sin atributo src`
      );
      assert.strictEqual(
        inlineCode,
        "",
        `En ${htmlFile}: se encontró código en línea dentro de <script>`
      );
    }

    // Verificar ausencia de manejadores en línea on* (onclick, onload, onchange, etc.)
    const inlineHandlerRegex = /\son[a-z]+=["'][^"']*["']/gi;
    const inlineMatches = htmlContent.match(inlineHandlerRegex);
    assert.strictEqual(
      inlineMatches,
      null,
      `En ${htmlFile}: se encontraron manejadores de eventos en línea: ${JSON.stringify(inlineMatches)}`
    );

    // Meta viewport presente
    assert.ok(htmlContent.includes('name="viewport"'), `En ${htmlFile}: debe incluir meta viewport`);
  }

  console.log("  ✅ Test 4 superado (HTML limpio de scripts y eventos en línea)");

  // --------------------------------------------------------------------------
  // TEST 5: Auditoría estática en catalogo/js/ (0 innerHTML, URLs externas y marcas)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 5: Auditoría de código en catalogo/js/ (0 innerHTML, URLs, marcas)...");
  const jsDir = path.join(catalogoDir, "js");
  const jsFiles = fs.readdirSync(jsDir).filter((f) => f.endsWith(".js"));

  for (const jsFile of jsFiles) {
    const jsContent = fs.readFileSync(path.join(jsDir, jsFile), "utf8");

    // 5a: Prohibido innerHTML
    assert.ok(
      !jsContent.includes("innerHTML"),
      `En catalogo/js/${jsFile}: Prohibido el uso de innerHTML [R13]`
    );

    // 5b: Ninguna URL externa salvo Cloudinary
    const urlMatches = jsContent.match(/https?:\/\/[^\s"'\`]+/g) || [];
    for (const url of urlMatches) {
      const esCloudinary = url.includes("res.cloudinary.com");
      // wa.me es el destino del enlace "Abrir WhatsApp" (validado en app.js), no un recurso que se carga
      const esEnlaceWhatsApp = url.startsWith("https://wa.me/");
      const esLocal = url.includes("localhost") || url.includes("127.0.0.1");
      assert.ok(
        esCloudinary || esEnlaceWhatsApp || esLocal,
        `En catalogo/js/${jsFile}: URL externa no permitida: ${url}`
      );
    }
  }

  // 5c: Ningún texto de marca (VentiMax, Fortunne, Pachi) en catalogo/
  function scanDirForBrands(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDirForBrands(fullPath);
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".html") || entry.name.endsWith(".js") || entry.name.endsWith(".css"))
      ) {
        // Excluir config.js generado si existe
        if (entry.name === "config.js") continue;
        const fileContent = fs.readFileSync(fullPath, "utf8");
        const lower = fileContent.toLowerCase();
        assert.ok(!lower.includes("ventimax"), `En ${fullPath}: se encontró la marca "ventimax"`);
        assert.ok(!lower.includes("fortunne"), `En ${fullPath}: se encontró la marca "fortunne"`);
        assert.ok(!lower.includes("mrpachi"), `En ${fullPath}: se encontró la marca "mrpachi"`);
        assert.ok(!lower.includes("pachi"), `En ${fullPath}: se encontró la marca "pachi"`);
      }
    }
  }
  scanDirForBrands(catalogoDir);

  console.log("  ✅ Test 5 superado (0 innerHTML, sin URLs externas no autorizadas y 0 marcas escritas)");

  // --------------------------------------------------------------------------
  // TEST 6: Generador de configuración (catalogo/build.js)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 6: Generador catalogo/build.js...");
  const testApiUrl = "https://tienda-test.ventimax.com";
  execSync(`API_URL="${testApiUrl}" node catalogo/build.js`, { stdio: "pipe" });

  const configGenerated = fs.readFileSync(path.join(catalogoDir, "config.js"), "utf8");
  assert.ok(
    configGenerated.includes(`apiUrl: "${testApiUrl}"`),
    "catalogo/config.js debe reflejar la API_URL especificada"
  );

  // Restaurar a local
  execSync(`API_URL="http://localhost:3000" node catalogo/build.js`, { stdio: "pipe" });
  console.log("  ✅ Test 6 superado (catalogo/build.js genera config.js correctamente)");

  // --------------------------------------------------------------------------
  // TEST 7: Cabeceras del sitio estático en render.yaml
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 7: Cabeceras de seguridad del sitio estático en render.yaml...");
  const renderYamlContent = fs.readFileSync(path.resolve(__dirname, "../render.yaml"), "utf8");

  assert.ok(renderYamlContent.includes("type: static"), "render.yaml debe definir un servicio type: static");
  assert.ok(renderYamlContent.includes("staticPublishPath: catalogo"), "Debe publicar la carpeta catalogo");
  assert.ok(renderYamlContent.includes("Content-Security-Policy"), "Debe configurar cabecera CSP");
  assert.ok(renderYamlContent.includes("Strict-Transport-Security"), "Debe configurar cabecera HSTS");
  assert.ok(renderYamlContent.includes("X-Content-Type-Options"), "Debe configurar X-Content-Type-Options: nosniff");
  assert.ok(renderYamlContent.includes("Referrer-Policy"), "Debe configurar Referrer-Policy");

  // Validación de directivas de la CSP en render.yaml
  assert.ok(renderYamlContent.includes("default-src 'self'"), "CSP debe incluir default-src 'self'");
  assert.ok(renderYamlContent.includes("script-src 'self'"), "CSP debe incluir script-src 'self'");
  assert.ok(renderYamlContent.includes("style-src 'self'"), "CSP debe incluir style-src 'self'");
  assert.ok(renderYamlContent.includes("object-src 'none'"), "CSP debe incluir object-src 'none'");
  assert.ok(renderYamlContent.includes("frame-ancestors 'none'"), "CSP debe incluir frame-ancestors 'none'");
  assert.ok(renderYamlContent.includes("base-uri 'self'"), "CSP debe incluir base-uri 'self'");

  console.log("  ✅ Test 7 superado (render.yaml contiene directivas de seguridad CSP/HSTS)");

  // --------------------------------------------------------------------------
  // TEST 8: Script local scripts/catalogo-local.sh
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 8: Script scripts/catalogo-local.sh...");
  const scriptPath = path.resolve(__dirname, "catalogo-local.sh");
  assert.ok(fs.existsSync(scriptPath), "scripts/catalogo-local.sh debe existir");

  // Verificar permisos de ejecución
  try {
    fs.accessSync(scriptPath, fs.constants.X_OK);
  } catch (_e) {
    assert.fail("scripts/catalogo-local.sh debe tener permisos de ejecución");
  }

  const scriptContent = fs.readFileSync(scriptPath, "utf8");
  assert.ok(scriptContent.includes("5173"), "Debe referenciar el puerto 5173");
  assert.ok(
    scriptContent.includes("CATALOGO_ORIGEN=http://localhost:5173 ./scripts/dev-local.sh"),
    "Debe indicar la instrucción para arrancar el backend con CATALOGO_ORIGEN"
  );

  console.log("  ✅ Test 8 superado (scripts/catalogo-local.sh configurado)");

  // Test 9: solo /assets se puede cargar desde otro origen; el panel y la API mantienen same-origin
  console.log("\n▶ Test 9: Cross-Origin-Resource-Policy limitado a /assets...");
  const indexSrc = fs.readFileSync(path.join(__dirname, "..", "index.ts"), "utf8");
  assert.ok(
    !/crossOriginResourcePolicy\s*:/.test(indexSrc),
    "helmet no debe relajar crossOriginResourcePolicy para todo el servidor",
  );
  assert.ok(
    /app\.use\(\s*"\/assets",[\s\S]{0,200}Cross-Origin-Resource-Policy", "cross-origin"/.test(indexSrc),
    "/assets debe enviar Cross-Origin-Resource-Policy: cross-origin (logo del catálogo)",
  );
  const appSrc = fs.readFileSync(path.join(__dirname, "..", "catalogo", "js", "app.js"), "utf8");
  assert.ok(appSrc.includes('startsWith("https://wa.me/")'), "solo se abren enlaces de wa.me");
  assert.ok(appSrc.includes('"noopener"'), "window.open con noopener");
  console.log("  ✅ Test 9 superado (CORP solo en /assets, enlace de WhatsApp validado)");

  console.log("\n================================================================================");
  console.log("🎉 TODOS LOS TESTS DEL CATÁLOGO WEB PASARON EXITOSAMENTE (9/9)");
  console.log("================================================================================\n");
}

runTests().catch((err) => {
  console.error("❌ Falló la suite test-catalogo-web.ts:", err);
  process.exit(1);
});
