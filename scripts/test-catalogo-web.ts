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
import { debeMostrarAyuda, textoAyuda, armarEnlaceAyuda } from "../catalogo/js/ayuda.js";
import { ajustarIndice, indiceDesdeScroll } from "../catalogo/js/galeria.js";
import { empresasDe, logoEmpresa } from "../catalogo/js/entrega.js";

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
      // Enlace para ver la ubicación de entrega en el mapa (F2c): se abre en otra pestaña, no se carga en la página
      const esEnlaceMapa = jsFile === "entrega.js" && url.startsWith("https://maps.google.com/?q=");
      const esLocal = url.includes("localhost") || url.includes("127.0.0.1");
      // El espacio de nombres SVG es un identificador de XML (createElementNS), no un recurso que se descarga
      const esEspacioSvg = url === "http://www.w3.org/2000/svg";
      // Aviso de licencia de Lucide en la cabecera del archivo generado (comentario, no se carga)
      const esLicenciaLucide = jsFile === "lucide.js" && url.startsWith("https://lucide.dev");
      assert.ok(
        esCloudinary || esEnlaceWhatsApp || esEnlaceMapa || esLocal || esEspacioSvg || esLicenciaLucide,
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

  // Formato actual de los Blueprints de Render: los sitios estáticos son type: web con runtime: static
  assert.ok(renderYamlContent.includes("runtime: static"), "render.yaml debe definir el sitio estático (runtime: static)");
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

  // Test 10: sin imágenes rotas y botón que sigue a la cantidad (fallos vistos por el dueño en producción)
  console.log("\n▶ Test 10: Foto de respaldo y texto del botón Agregar...");
  assert.ok(!appSrc.includes('"data:,"'), "No usar src vacío: el navegador muestra el ícono de imagen rota");
  assert.ok(appSrc.includes("img-sin-foto") && appSrc.includes('addEventListener("error"'), "Recuadro 'Sin foto' si falta la foto o no carga");
  assert.ok((appSrc.match(/actualizarTextoAgregar\(\)/g) || []).length >= 2, "El texto del botón se actualiza con + y −");
  console.log("  ✅ Test 10 superado (recuadro 'Sin foto' y botón con la cantidad elegida)");

  // Test 11: botón flotante de ayuda por WhatsApp
  console.log("\n▶ Test 11: Botón flotante de ayuda por WhatsApp...");
  assert.strictEqual(debeMostrarAyuda("#/"), true);
  assert.strictEqual(debeMostrarAyuda("#/producto/fortunne-n04"), false, "la ficha ya tiene «Preguntar por WhatsApp»");
  assert.strictEqual(debeMostrarAyuda("#/categoria/mesa"), true);
  assert.strictEqual(debeMostrarAyuda("#/carrito"), false, "el carrito ya tiene su botón de WhatsApp");
  assert.strictEqual(debeMostrarAyuda("#/confirmacion/VM-ABCDE"), false);
  const ayuda = { whatsapp: "584125550101", texto: "Hola, tengo una pregunta", textoProducto: "Hola, pregunta sobre {{producto}}" };
  assert.strictEqual(textoAyuda(ayuda, null), "Hola, tengo una pregunta");
  assert.strictEqual(textoAyuda(ayuda, 'Turbo Fan 10"'), 'Hola, pregunta sobre Turbo Fan 10"');
  assert.strictEqual(textoAyuda(null, "x"), "");
  assert.strictEqual(
    armarEnlaceAyuda("+58 412-555-0101", "Hola & chao"),
    "https://wa.me/584125550101?text=Hola%20%26%20chao",
  );
  assert.strictEqual(armarEnlaceAyuda("584125550101", ""), "https://wa.me/584125550101");
  assert.strictEqual(armarEnlaceAyuda("123", "x"), "", "número inválido: sin botón");
  assert.strictEqual(armarEnlaceAyuda(null, "x"), "");
  assert.ok(fs.existsSync(path.join(__dirname, "..", "catalogo", "img", "whatsapp.svg")), "ícono como archivo (CSP)");
  assert.ok(appSrc.includes('rel: "noopener noreferrer"') && appSrc.includes('"aria-label"'), "enlace accesible y sin opener");
  const cssSrc = fs.readFileSync(path.join(__dirname, "..", "catalogo", "css", "style.css"), "utf8");
  assert.ok(cssSrc.includes("safe-area-inset-bottom") && cssSrc.includes("prefers-reduced-motion"), "zona segura y movimiento reducido");
  console.log("  ✅ Test 11 superado (botón de ayuda: vistas, texto, enlace y accesibilidad)");

  // Test 12: carrusel de fotos del producto (deslizar, flechas, puntos)
  console.log("\n▶ Test 12: Carrusel de fotos del producto...");
  assert.strictEqual(ajustarIndice(-1, 3), 0, "no pasa de la primera");
  assert.strictEqual(ajustarIndice(5, 3), 2, "no pasa de la última");
  assert.strictEqual(ajustarIndice(1, 0), 0);
  assert.strictEqual(indiceDesdeScroll(0, 400, 3), 0);
  assert.strictEqual(indiceDesdeScroll(390, 400, 3), 1, "a mitad de deslizamiento redondea a la más cercana");
  assert.strictEqual(indiceDesdeScroll(800, 400, 3), 2);
  assert.strictEqual(indiceDesdeScroll(5000, 400, 3), 2);
  assert.strictEqual(indiceDesdeScroll(100, 0, 3), 0, "sin ancho medido");
  assert.ok(appSrc.includes("carrusel-flecha--anterior") && appSrc.includes("carrusel-punto"), "flechas y puntos");
  assert.ok(appSrc.includes('"aria-label": "Foto anterior"') && appSrc.includes('"ArrowRight"'), "accesible con lector y teclado");
  assert.ok(/if \(total < 2\) return galeria;/.test(appSrc), "con una sola foto no hay controles");
  assert.ok(cssSrc.includes("scroll-snap-type: x mandatory"), "deslizar con el dedo usa scroll-snap");
  console.log("  ✅ Test 12 superado (carrusel: límites, índice por desplazamiento, controles accesibles)");

  // Test 13: íconos solo de Lucide (módulo generado), sin emojis ni glifos como íconos
  console.log("\n▶ Test 13: Íconos de Lucide...");
  const lucideSrc = fs.readFileSync(path.join(__dirname, "..", "catalogo", "js", "lucide.js"), "utf8");
  assert.ok(/Lucide v\d+\.\d+\.\d+/.test(lucideSrc) && lucideSrc.includes("ISC"), "lucide.js con versión y licencia");
  const iconosSrc = fs.readFileSync(path.join(__dirname, "..", "catalogo", "js", "iconos.js"), "utf8");
  assert.ok(iconosSrc.includes('from "./lucide.js"'), "iconos.js dibuja con los datos de Lucide");
  for (const nombre of iconosSrc.match(/:\s*"([a-z0-9-]+)",/g) || []) {
    const clave = nombre.replace(/[:\s",]/g, "");
    assert.ok(lucideSrc.includes(`"${clave}":`), `ícono ${clave} presente en lucide.js`);
  }
  const textoTienda = appSrc + fs.readFileSync(path.join(__dirname, "..", "catalogo", "index.html"), "utf8");
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(textoTienda), "sin emojis como íconos en la tienda");
  console.log("  ✅ Test 13 superado (íconos de Lucide, sin emojis)");

  // Test 14: empresas de envío con logo (F2f): nombres desde strings u objetos, logo solo de Cloudinary
  console.log("\n▶ Test 14: Empresas de envío con logo...");
  const metodoMixto = {
    id: "m1",
    tipo: "envio_nacional",
    empresas: ["MRW", { nombre: "Zoom", logoUrl: "https://res.cloudinary.com/demo/image/upload/zoom.png", logoPublicId: "x" }, { nombre: "Otra", logoUrl: "https://ejemplo.com/logo.png" }],
  };
  assert.deepStrictEqual(empresasDe(metodoMixto), ["MRW", "Zoom", "Otra"], "empresasDe devuelve nombres (strings y objetos)");
  assert.deepStrictEqual(empresasDe({ tipo: "retiro", empresas: ["MRW"] }), [], "retiro no tiene empresas");
  assert.deepStrictEqual(empresasDe({ tipo: "envio_nacional", empresas: [{ nombre: "" }, null] }), [], "empresas sin nombre se descartan");
  assert.strictEqual(logoEmpresa(metodoMixto, "Zoom"), "https://res.cloudinary.com/demo/image/upload/zoom.png", "logo de Cloudinary se usa");
  assert.strictEqual(logoEmpresa(metodoMixto, "Otra"), "", "URL que no es de Cloudinary → sin logo");
  assert.strictEqual(logoEmpresa(metodoMixto, "MRW"), "", "empresa como string → sin logo");
  assert.strictEqual(logoEmpresa(metodoMixto, "Inexistente"), "", "empresa desconocida → sin logo");
  assert.strictEqual(logoEmpresa(null, "Zoom"), "", "sin método → sin logo");
  const appSrcEmpresas = fs.readFileSync(path.join(__dirname, "..", "catalogo", "js", "app.js"), "utf8");
  assert.ok(appSrcEmpresas.includes("logoEmpresa") && appSrcEmpresas.includes('name: "empresa-envio"'), "app.js pinta tarjetas con logo y una sola selección");
  assert.ok(!fs.readFileSync(path.join(__dirname, "..", "catalogo", "css", "style.css"), "utf8").includes("entrega-chip"), "estilos de chips retirados");
  console.log("  ✅ Test 14 superado (empresas de envío: nombres desde strings u objetos, logo solo de Cloudinary)");

  // Test 15 (F2g): cintillo y descuentos. Se comprueba el código, no el aspecto: pinta con el(), sin innerHTML,
  // y la animación del pulso queda dentro de un bloque que se desactiva con prefers-reduced-motion.
  console.log("\n▶ Test 15: Cintillo promocional y descuentos (F2g)...");
  assert.ok(/function crearCintillo\(banner\)/.test(appSrc), "crearCintillo existe");
  const cuerpoCintillo = appSrc.slice(appSrc.indexOf("function crearCintillo(banner)"), appSrc.indexOf("function pasosCompra()"));
  assert.ok(cuerpoCintillo.includes("el(") && !cuerpoCintillo.includes("innerHTML"), "cintillo se pinta con el(), sin innerHTML");
  assert.ok(cuerpoCintillo.includes("`#/producto/${encodeURIComponent(item.productoId)}`"), "cintillo con producto enlaza a su ficha");
  assert.ok(cuerpoCintillo.includes('icono("siguiente", "cintillo-flecha")') && cuerpoCintillo.includes('"Ver"'), "enlace termina en 'Ver' con flecha");
  assert.ok(appSrc.includes("crearCintillo(state.info?.banner)"), "el catálogo pinta el cintillo debajo del buscador");
  assert.ok(appSrc.includes('if (state.vista === "catalogo") renderizarCatalogo();'), "al llegar la información se vuelve a pintar el catálogo");
  assert.ok(appSrc.includes('className: "insignia-descuento"') && appSrc.includes("insigniaDescuento(prod)"), "insignia -X% sobre la foto");
  assert.ok(appSrc.includes('el("s", { className: "precio-antes" }') && appSrc.includes("formatearUsd(antes)"), "precio anterior tachado con formatearUsd");
  assert.ok(appSrc.includes('"tarjeta-descuento"') && appSrc.includes("ficha-compra-descuento"), "tarjeta y ficha marcan el descuento");
  // Bloque de movimiento reducido: cualquier @media (prefers-reduced-motion) cuyo cuerpo contenga el pulso
  const bloques: string[] = [];
  const inicioMedia = /@media \(prefers-reduced-motion: reduce\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = inicioMedia.exec(cssSrc)) !== null) {
    let profundidad = 1;
    let i = m.index + m[0].length;
    while (i < cssSrc.length && profundidad > 0) {
      if (cssSrc[i] === "{") profundidad++;
      if (cssSrc[i] === "}") profundidad--;
      i++;
    }
    bloques.push(cssSrc.slice(m.index, i));
  }
  const bloquePulso = bloques.find((b) => b.includes(".tarjeta-descuento::after"));
  assert.ok(bloquePulso, "el pulso tiene un bloque prefers-reduced-motion propio");
  assert.ok(/display:\s*none/.test(bloquePulso!) && /animation:\s*none/.test(bloquePulso!), "el bloque desactiva el pulso");
  const reglaPulso = cssSrc.match(/\.tarjeta-descuento::after\s*\{[^}]*\}/);
  assert.ok(reglaPulso && reglaPulso[0].includes("animation: pulso-descuento 2.4s ease-out infinite") && reglaPulso[0].includes("pointer-events: none"), "pulso de 2.4 s, ease-out, sin captar toques");
  assert.ok(cssSrc.includes("@keyframes pulso-descuento") && !bloquePulso!.includes("@keyframes"), "keyframes fuera del bloque de movimiento reducido");
  assert.ok(cssSrc.includes(".cintillo {") && cssSrc.includes("min-height: 48px") && cssSrc.includes("var(--accion)"), "cintillo con altura mínima 48 px y color de acción");
  // La banda fija, la insignia y el precio tachado no se animan (la cinta sí, y va en su propia regla)
  assert.ok(!/\.(cintillo|insignia-descuento|precio-antes)(?![-\w])[^{]*\{[^}]*animation/.test(cssSrc), "cintillo fijo, insignia y precio tachado sin animación");
  console.log("  ✅ Test 15 superado (cintillo con el(), insignia y precio tachado, pulso solo en un bloque que se desactiva con reducir movimiento)");

  // Test 16 (F2g-2): cinta en movimiento del cintillo con varios productos
  console.log("\n▶ Test 16: Cinta en movimiento del cintillo (F2g-2)...");
  assert.ok(cssSrc.includes("@keyframes cintillo-desplazar") && cssSrc.includes("translateX(-50%)"), "la cinta se traslada de 0 a -50% en bucle");
  assert.ok(/\.cintillo-cinta:hover[^{]*\{[^}]*animation-play-state:\s*paused/.test(cssSrc), "la cinta se detiene con :hover");
  assert.ok(/\.cintillo-cinta:focus-within[^{]*\{[^}]*animation-play-state:\s*paused/.test(cssSrc), "la cinta se detiene con :focus-within");
  const bloqueCinta = bloques.find((b) => b.includes(".cintillo-grupo[aria-hidden"));
  assert.ok(bloqueCinta, "la cinta tiene su bloque prefers-reduced-motion");
  assert.ok(/animation:\s*none/.test(bloqueCinta!) && /display:\s*none/.test(bloqueCinta!) && /overflow-x:\s*auto/.test(bloqueCinta!), "sin animación, se desplaza con el dedo y se oculta la copia");
  assert.ok(appSrc.includes('"aria-hidden": "true"') && appSrc.includes('tabindex: repaso ? "-1" : null'), "la copia de repaso va oculta a lectores y fuera del orden de tabulación");
  assert.ok(appSrc.includes('role: "region"') && appSrc.includes('"aria-label": "Ofertas"'), "la cinta es una región con nombre");
  assert.ok(appSrc.includes('setProperty("--cintillo-duracion"'), "la duración se pasa a la pista según la cantidad de items");
  assert.ok(appSrc.includes("items.length === 1") && appSrc.includes("crearCintilloUnico(items[0])"), "un solo item conserva la banda fija");
  assert.ok(cssSrc.includes("min-height: 44px") && cssSrc.includes(".cintillo-item-enlace:focus-visible"), "tamaño táctil de 44 px y foco visible en los items");
  console.log("  ✅ Test 16 superado (cinta con animación infinita, pausa en hover y foco, reducir movimiento y copia oculta)");

  console.log("\n================================================================================");
  console.log("🎉 TODOS LOS TESTS DEL CATÁLOGO WEB PASARON EXITOSAMENTE (16/16)");
  console.log("================================================================================\n");
}

runTests().catch((err) => {
  console.error("❌ Falló la suite test-catalogo-web.ts:", err);
  process.exit(1);
});
