/**
 * scripts/test-api-publica.ts — F2-1
 * Suite de pruebas para la API pública del catálogo y carrito web.
 *
 * Verificaciones:
 * 1. Lista blanca estricta en GET /api/public/catalogo (sin _id, stock, publicId, trackStock).
 * 2. Producto inactivo ausente y producto agotado con disponible: false.
 * 3. GET /api/public/marca (Cache-Control 600, Vary: Origin, formato { brandName, theme }).
 * 4. Cabecera Vary: Origin presente en respuestas públicas para evitar envenenamiento de CDN [R12].
 * 5. POST /api/public/pedidos:
 *    - Validación estricta Zod (precio en el cuerpo -> 400, cantidad 0/51 -> 400, 21 líneas -> 400).
 *    - Precios de la base de datos (descarte de precios manipulados).
 *    - Líneas duplicadas del mismo producto consolidadas.
 *    - Producto inexistente, inactivo o sin stock suficiente -> 400 sin filtrar número de stock.
 *    - Cuerpo mayor a 5 KB -> 413.
 *    - Campo trampa honeypot:
 *      * Cuerpo válido -> 200 con total, tasa y enlaceWhatsApp reales, pero nada guardado en BD.
 *      * Cuerpo inválido -> 400 igual que cualquier petición.
 *    - Sin número de WhatsApp disponible -> 503.
 *    - Rate limiting estricto [R9]:
 *      * Con trust proxy 1, peticiones con "X-Forwarded-For: <IP distinta>, 10.0.0.9" no pueden
 *        burlar el límite: la 6ta petición responde 429.
 * 6. Código seguro: 200 códigos únicos con formato ^VM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$.
 * 7. Ausencia de ruta pública para leer pedidos: GET /api/public/pedidos/:codigo -> 404.
 * 8. CarritoWeb con índice TTL en expiraEn (expireAfterSeconds: 0).
 * 9. CORS restringido a CATALOGO_ORIGEN.
 * 10. X-Robots-Tag: noindex en /panel, /login y /api/admin/*.
 * 11. Simulación de CastError de Mongoose para asegurar consulta estricta por id de texto.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-api-publica.ts
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.JWT_SECRET = "x".repeat(40);
process.env.ADMIN_PHONE_NUMBER = "584122781982";

const express = require("express");
const mongoose = require("mongoose");
const dbLocal = require("../services/dbLocal");
const { generarCodigoRandom } = require("../controllers/publicController");
const CarritoWebModel = require("../models/CarritoWeb");

let ok = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
}

/**
 * Crea una app Express limpia con trust proxy 1 y router /api/public aislado.
 * Permite aislar el almacenamiento de memoria de rateLimit entre bloques de prueba.
 */
function crearTestApp() {
  delete require.cache[require.resolve("../routes/publicRoutes")];
  delete require.cache[require.resolve("../controllers/publicController")];
  const publicRoutes = require("../routes/publicRoutes");
  const app = express();
  app.set("trust proxy", 1);

  // Middleware X-Robots-Tag (mismo montaje que index.ts)
  app.use(["/panel", "/login", "/api/admin"], (req: any, res: any, next: any) => {
    res.setHeader("X-Robots-Tag", "noindex");
    next();
  });
  app.get("/panel", (req: any, res: any) => res.send("OK panel"));
  app.get("/login", (req: any, res: any) => res.send("OK login"));
  app.get("/api/admin/pedidos", (req: any, res: any) => res.json({ ok: true }));

  // API pública montada antes del express.json global
  app.use("/api/public", publicRoutes);
  return app;
}

/**
 * Ejecuta una función de prueba contra una instancia de servidor aislada.
 */
async function withServer(fn: (baseUrl: string) => Promise<void>) {
  const app = crearTestApp();
  const server = app.listen(0);
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function main() {
  console.log("================================================================================");
  console.log("🌐 SUITE DE PRUEBAS: API PÚBLICA DEL CATÁLOGO Y CARRITO WEB (F2-1)");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // Setup de datos semilla en dbLocal
  // --------------------------------------------------------------------------
  const data = dbLocal.read();
  data.categorias = [
    { _id: "cat-mesa", nombre: "Mesa", slug: "mesa", activo: true, padre: null },
    { _id: "cat-pared", nombre: "Pared", slug: "pared", activo: true, padre: null },
    { _id: "cat-inactiva", nombre: "Inactiva", slug: "inactiva", activo: false, padre: null },
  ];
  data.productos = [
    {
      _id: "prod-001",
      id: "fortunne-n04",
      name: "Fortunne Turbo Fan 10\"",
      price: 40,
      description: "2 en 1 mesa y pared",
      categoria: "cat-mesa",
      categorias: ["cat-pared"],
      activo: true,
      trackStock: false,
      stock: 0,
      imagenes: [{ url: "https://res.cloudinary.com/demo/image/upload/v1/n04.jpg", publicId: "n04" }],
    },
    {
      _id: "prod-002",
      id: "fortunne-n20",
      name: "Fortunne Turbo Fan 12\"",
      price: 46,
      description: "Mesa alta potencia",
      categoria: "cat-mesa",
      activo: true,
      trackStock: true,
      stock: 0, // Agotado
      imagenes: [],
    },
    {
      _id: "prod-003",
      id: "fortunne-n21",
      name: "Fortunne Mini Jumbo 6\"",
      price: 25,
      description: "Mesa compacto",
      categoria: "cat-mesa",
      activo: true,
      trackStock: true,
      stock: 10, // Con stock
      imagenes: [],
    },
    {
      _id: "prod-004",
      id: "fortunne-n22",
      name: "Fortunne High Velocity 8\"",
      price: 35,
      description: "Mesa inactivo",
      categoria: "cat-mesa",
      activo: false, // Inactivo
      trackStock: false,
      stock: 5,
      imagenes: [],
    },
  ];
  data.carritosWeb = [];
  dbLocal.write(data);

  // --------------------------------------------------------------------------
  // TEST 1: GET /api/public/marca
  // --------------------------------------------------------------------------
  console.log("▶ Bloque 1: GET /api/public/marca...");
  await withServer(async (baseUrl) => {
    await prueba("Cabecera Cache-Control, Vary: Origin y formato limpio { brandName, theme }", async () => {
      const res = await fetch(`${baseUrl}/api/public/marca`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("cache-control"), "public, max-age=600");
      assert.ok((res.headers.get("vary") || "").includes("Origin"), "Debe incluir Vary: Origin [R12]");

      const json = await res.json();
      assert.strictEqual(json.brandName, "VentiMax");
      assert.deepStrictEqual(Object.keys(json).sort(), ["ayuda", "brandName", "theme"]);
      assert.deepStrictEqual(
        Object.keys(json.theme).sort(),
        ["logoUrl", "primaryColor", "productBrandLogoUrl", "secondaryColor"].sort()
      );
      assert.strictEqual(json.theme.primaryColor, "#1E8C88");
      assert.strictEqual(json.theme.secondaryColor, "#5CC0BB");
      assert.strictEqual(json.theme.productBrandLogoUrl, "/assets/brand/ventimax/fortunne-logo.png");
    });

    await prueba("Botón de ayuda: número público del negocio, nunca el del administrador", async () => {
      const antes = { wa: process.env.WHATSAPP_PHONE, admin: process.env.ADMIN_PHONE_NUMBER };
      // Sin Setting guardado, los datos del negocio salen de la marca, que no trae número
      assert.ok(!require("../services/datosNegocioService").getDatosNegocioSync()?.contacto?.whatsapp);
      try {
        delete process.env.WHATSAPP_PHONE;
        process.env.ADMIN_PHONE_NUMBER = "584149999999";
        let json = await (await fetch(`${baseUrl}/api/public/marca`)).json();
        assert.strictEqual(json.ayuda, null, "solo con el número del administrador no hay botón");
        assert.ok(!JSON.stringify(json).includes("584149999999"), "el número del administrador no se publica");

        process.env.WHATSAPP_PHONE = "+58 412-555-0101";
        json = await (await fetch(`${baseUrl}/api/public/marca`)).json();
        assert.strictEqual(json.ayuda.whatsapp, "584125550101");
        assert.ok(json.ayuda.texto.length > 0);
        assert.ok(json.ayuda.textoProducto.includes("{{producto}}"));
      } finally {
        if (antes.wa === undefined) delete process.env.WHATSAPP_PHONE; else process.env.WHATSAPP_PHONE = antes.wa;
        if (antes.admin === undefined) delete process.env.ADMIN_PHONE_NUMBER; else process.env.ADMIN_PHONE_NUMBER = antes.admin;
      }
    });
  });

  // --------------------------------------------------------------------------
  // TEST 2: GET /api/public/catalogo (Lista blanca estricta)
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 2: GET /api/public/catalogo (Lista blanca estricta)...");
  await withServer(async (baseUrl) => {
    await prueba("Lista blanca estricta: sin _id, stock, publicId ni trackStock", async () => {
      const res = await fetch(`${baseUrl}/api/public/catalogo`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("cache-control"), "public, max-age=120");
      assert.ok((res.headers.get("vary") || "").includes("Origin"), "Debe incluir Vary: Origin [R12]");
      const json = await res.json();

      assert.strictEqual(typeof json.tasa, "number");
      assert.ok(json.fechaTasa, "fechaTasa debe estar presente");
      assert.ok(Array.isArray(json.categorias), "categorias debe ser un array");
      assert.ok(Array.isArray(json.productos), "productos debe ser un array");

      // Categorías: solo nombre y slug, inactiva excluida
      assert.ok(json.categorias.length >= 2);
      for (const cat of json.categorias) {
        const keys = Object.keys(cat).sort();
        assert.deepStrictEqual(keys, ["nombre", "slug"], `Campos inesperados en categoría: ${keys.join(", ")}`);
        assert.notStrictEqual(cat.slug, "inactiva", "Categoría inactiva no debe aparecer");
      }
      // Toda categoría publicada tiene al menos un producto (una vacía sería un botón sin nada)
      for (const cat of json.categorias) {
        assert.ok(
          json.productos.some((p: any) => p.categorias.includes(cat.slug)),
          `La categoría '${cat.slug}' aparece sin productos`,
        );
      }

      // Productos: lista blanca estricta
      const whitelistKeys = [
        "categorias",
        "descripcion",
        "disponible",
        "id",
        "imagenes",
        "nombre",
        "precioBs",
        "precioUsd",
      ].sort();

      for (const prod of json.productos) {
        const keys = Object.keys(prod).sort();
        assert.deepStrictEqual(
          keys,
          whitelistKeys,
          `Campos del producto no coinciden con la lista blanca: ${keys.join(", ")}`
        );
        assert.strictEqual(prod._id, undefined, "_id de Mongo no debe exponerse");
        assert.strictEqual(prod.stock, undefined, "stock no debe exponerse");
        assert.strictEqual(prod.trackStock, undefined, "trackStock no debe exponerse");
        assert.strictEqual(prod.publicId, undefined, "publicId no debe exponerse");
      }

      // Inactivo ausente
      const inactivo = json.productos.find((p: any) => p.id === "fortunne-n22");
      assert.strictEqual(inactivo, undefined, "Producto inactivo no debe aparecer en el catálogo");

      // Agotado con disponible: false
      const agotado = json.productos.find((p: any) => p.id === "fortunne-n20");
      assert.ok(agotado, "Producto agotado debe mostrarse");
      assert.strictEqual(agotado.disponible, false, "Producto agotado debe tener disponible: false");

      // Con stock con disponible: true
      const conStock = json.productos.find((p: any) => p.id === "fortunne-n21");
      assert.ok(conStock, "Producto con stock debe mostrarse");
      assert.strictEqual(conStock.disponible, true, "Producto con stock debe tener disponible: true");

      // Multicategoría e imágenes limpias
      const n04 = json.productos.find((p: any) => p.id === "fortunne-n04");
      assert.ok(n04);
      assert.deepStrictEqual(n04.categorias.sort(), ["mesa", "pared"].sort());
      assert.deepStrictEqual(n04.imagenes, ["https://res.cloudinary.com/demo/image/upload/v1/n04.jpg"]);
      assert.strictEqual(typeof n04.precioBs, "number");
    });
  });

  // --------------------------------------------------------------------------
  // TEST 3: POST /api/public/pedidos (Validaciones Zod y seguridad)
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 3: POST /api/public/pedidos (Validación y reglas)...");

  await withServer(async (baseUrl) => {
    await prueba("Rechazo de campo 'precio' inyectado en el cuerpo (Zod .strict())", async () => {
      const res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productoId: "fortunne-n04", cantidad: 1, precio: 5 }],
        }),
      });
      assert.strictEqual(res.status, 400);
      assert.ok((res.headers.get("vary") || "").includes("Origin"), "Debe incluir Vary: Origin [R12]");
      const json = await res.json();
      assert.ok(json.error, "Debe rechazar propiedades no reconocidas");
    });
  });

  await withServer(async (baseUrl) => {
    await prueba("Rechazo de carrito vacío y cantidades fuera de rango (0, 51, 21 líneas)", async () => {
      // 0 items
      let res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [] }),
      });
      assert.strictEqual(res.status, 400);

      // cantidad: 0
      res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ productoId: "fortunne-n04", cantidad: 0 }] }),
      });
      assert.strictEqual(res.status, 400);

      // cantidad: 51
      res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ productoId: "fortunne-n04", cantidad: 51 }] }),
      });
      assert.strictEqual(res.status, 400);

      // 21 líneas
      const lineas = Array.from({ length: 21 }, () => ({ productoId: "fortunne-n04", cantidad: 1 }));
      res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lineas }),
      });
      assert.strictEqual(res.status, 400);
    });
  });

  await withServer(async (baseUrl) => {
    await prueba("Rechazo de cuerpo superior a 5 KB con código HTTP 413", async () => {
      const padding = "x".repeat(6 * 1024);
      const res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productoId: "fortunne-n04", cantidad: 1 }],
          website: padding,
        }),
      });
      assert.strictEqual(res.status, 413);
      const json = await res.json();
      assert.ok(json.error.includes("5 KB"), JSON.stringify(json));
    });
  });

  await withServer(async (baseUrl) => {
    await prueba("Honeypot: respuesta indistinguible (total, Bs y WhatsApp reales) sin guardar en BD", async () => {
      const cuentaAntes = await dbLocal.getCarritoWebModel().countDocuments();
      const res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productoId: "fortunne-n04", cantidad: 1 }],
          website: "http://bot-spammer.xyz",
        }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.ok(/^VM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(json.codigo));
      assert.strictEqual(json.totalUsd, 40, "Honeypot debe devolver totalUsd real de los items");
      assert.strictEqual(typeof json.totalBs, "number", "Honeypot debe devolver totalBs real");
      assert.ok(json.totalBs > 0);
      assert.ok(json.enlaceWhatsApp.includes("https://wa.me/"), "Honeypot debe incluir enlace WhatsApp real");
      assert.ok(json.enlaceWhatsApp.includes(json.codigo));
      assert.ok(new Date(json.expira).getTime() > Date.now());

      const cuentaDespues = await dbLocal.getCarritoWebModel().countDocuments();
      assert.strictEqual(cuentaDespues, cuentaAntes, "No debe guardarse nada en la base con honeypot");

      // Honeypot con Zod inválido debe dar 400 igual que cualquier petición
      const resInvalido = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ productoId: "fortunne-n04", cantidad: 0 }],
          website: "http://bot-spammer.xyz",
        }),
      });
      assert.strictEqual(resInvalido.status, 400, "Honeypot con cuerpo inválido debe responder 400");
    });
  });

  // --------------------------------------------------------------------------
  // TEST 4: Verificación de productos y creación de pedidos
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 4: Verificación de productos y creación exitosa...");
  await withServer(async (baseUrl) => {
    await prueba("Rechazo de producto inexistente, inactivo o agotado (sin exponer stock)", async () => {
      // Inexistente
      let res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ productoId: "id-fantasma", cantidad: 1 }] }),
      });
      assert.strictEqual(res.status, 400);
      let json = await res.json();
      assert.ok(json.error.includes("id-fantasma"));

      // Inactivo
      res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ productoId: "fortunne-n22", cantidad: 1 }] }),
      });
      assert.strictEqual(res.status, 400);

      // Agotado
      res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ productoId: "fortunne-n20", cantidad: 1 }] }),
      });
      assert.strictEqual(res.status, 400);
      json = await res.json();
      assert.ok(json.error.includes("Fortunne Turbo Fan 12\""));
      assert.ok(!json.error.includes("0"), "No debe exponer el número de stock en el mensaje");
    });

    await prueba("Creación exitosa de CarritoWeb con total recalculado desde la base y consolidación", async () => {
      const res = await fetch(`${baseUrl}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { productoId: "fortunne-n04", cantidad: 1 },
            { productoId: "fortunne-n04", cantidad: 2 }, // Duplicado: se consolidan en 3
            { productoId: "fortunne-n21", cantidad: 2 }, // $25 * 2 = $50
          ],
        }),
      });
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.ok(/^VM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(json.codigo));
      // Total: 3 * 40 + 2 * 25 = 120 + 50 = $170
      assert.strictEqual(json.totalUsd, 170);
      assert.strictEqual(json.totalBs, 170 * 36);
      assert.ok(json.enlaceWhatsApp.includes("https://wa.me/"));
      assert.ok(json.enlaceWhatsApp.includes(json.codigo));
      assert.ok(new Date(json.expira).getTime() > Date.now());

      // Verificación en base de datos
      const guardado = await dbLocal.getCarritoWebModel().findOne({ codigo: json.codigo });
      assert.ok(guardado);
      assert.strictEqual(guardado.total, 170);
      assert.strictEqual(guardado.items.length, 2);
      const itemN04 = guardado.items.find((it: any) => it.productoId === "fortunne-n04");
      assert.strictEqual(itemN04.cantidad, 3);
      assert.strictEqual(itemN04.precio, 40);
      assert.strictEqual(guardado.estado, "pendiente");
      assert.strictEqual(guardado.telefono, null);
      assert.strictEqual(guardado.pedidoId, null);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 5: Simulación de CastError de Mongoose (Garantía de consulta por id de texto)
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 5: Simulación de CastError de Mongoose...");
  await withServer(async (baseUrl) => {
    await prueba("Búsqueda de producto no consulta _id con string arbitrario", async () => {
      const ProductoModel = dbLocal.getProductoModel();
      const originalFindOne = ProductoModel.findOne;

      // Imita a Mongoose: si la consulta incluye _id con un valor no válido para ObjectId, lanza CastError
      ProductoModel.findOne = (query: any) => {
        if (query && query._id !== undefined && !mongoose.Types.ObjectId.isValid(query._id)) {
          const err: any = new Error(`Cast to ObjectId failed for value "${query._id}"`);
          err.name = "CastError";
          throw err;
        }
        if (query && Array.isArray(query.$or)) {
          for (const sub of query.$or) {
            if (sub && sub._id !== undefined && !mongoose.Types.ObjectId.isValid(sub._id)) {
              const err: any = new Error(`Cast to ObjectId failed for value "${sub._id}"`);
              err.name = "CastError";
              throw err;
            }
          }
        }
        return originalFindOne.call(ProductoModel, query);
      };

      try {
        const res = await fetch(`${baseUrl}/api/public/pedidos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ productoId: "fortunne-n04", cantidad: 1 }],
          }),
        });
        assert.strictEqual(res.status, 200, "Debe responder 200 sin provocar CastError");
      } finally {
        ProductoModel.findOne = originalFindOne;
      }
    });
  });

  // --------------------------------------------------------------------------
  // TEST 6: Sin número de WhatsApp disponible -> 503
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 6: Sin número de WhatsApp disponible...");
  await withServer(async (baseUrl) => {
    await prueba("Sin número en datosNegocio, WHATSAPP_PHONE ni ADMIN_PHONE_NUMBER -> 503", async () => {
      const prevAdmin = process.env.ADMIN_PHONE_NUMBER;
      const prevWa = process.env.WHATSAPP_PHONE;
      const datosNegocioService = require("../services/datosNegocioService");
      const prevCache = datosNegocioService.getDatosNegocioSync();

      try {
        delete process.env.ADMIN_PHONE_NUMBER;
        delete process.env.WHATSAPP_PHONE;
        datosNegocioService.invalidateDatosNegocioCache();
        // Mock momentáneo que vacía whatsapp en datosNegocio
        const originalGet = datosNegocioService.getDatosNegocioSync;
        datosNegocioService.getDatosNegocioSync = () => ({
          ...prevCache,
          contacto: { ...prevCache?.contacto, whatsapp: "" },
        });

        const res = await fetch(`${baseUrl}/api/public/pedidos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ productoId: "fortunne-n04", cantidad: 1 }],
          }),
        });
        assert.strictEqual(res.status, 503);
        const json = await res.json();
        assert.strictEqual(json.error, "Los pedidos web no están disponibles por ahora");

        datosNegocioService.getDatosNegocioSync = originalGet;
      } finally {
        if (prevAdmin) process.env.ADMIN_PHONE_NUMBER = prevAdmin;
        if (prevWa) process.env.WHATSAPP_PHONE = prevWa;
      }
    });
  });

  // --------------------------------------------------------------------------
  // TEST 7: Generador de códigos y rutas no existentes
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 7: Formato de códigos únicos y rutas inexistentes...");
  await prueba("200 códigos generados, todos únicos y con formato ^VM-[2-9A-HJKMNP-Z]{5}$", () => {
    const codigos = new Set<string>();
    const regex = /^VM-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/;
    for (let i = 0; i < 200; i++) {
      const c = generarCodigoRandom("VM");
      assert.ok(regex.test(c), `Código ${c} no cumple el patrón`);
      codigos.add(c);
    }
    assert.strictEqual(codigos.size, 200, "Debe generar 200 códigos únicos");
  });

  await withServer(async (baseUrl) => {
    await prueba("GET /api/public/pedidos/:codigo responde 404", async () => {
      const res = await fetch(`${baseUrl}/api/public/pedidos/VM-7K3Q9`);
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.error, "Ruta no encontrada");
    });
  });

  // --------------------------------------------------------------------------
  // TEST 8: Índice TTL y CORS
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 8: TTL Index y CORS...");
  await prueba("CarritoWeb define índice TTL en expiraEn con expireAfterSeconds: 0", () => {
    const indexes = CarritoWebModel.schema.indexes();
    const ttl = indexes.find(
      ([fields, opts]: any) => fields && fields.expiraEn !== undefined && opts?.expireAfterSeconds === 0
    );
    assert.ok(ttl, "Debe existir un índice en expiraEn con expireAfterSeconds: 0");
  });

  await withServer(async (baseUrl) => {
    await prueba("CORS solo permite el origen de CATALOGO_ORIGEN", async () => {
      process.env.CATALOGO_ORIGEN = "https://tienda.ventimax.com";
      try {
        // Origen autorizado
        let res = await fetch(`${baseUrl}/api/public/marca`, {
          headers: { Origin: "https://tienda.ventimax.com" },
        });
        assert.strictEqual(res.headers.get("access-control-allow-origin"), "https://tienda.ventimax.com");

        // Origen no autorizado
        res = await fetch(`${baseUrl}/api/public/marca`, {
          headers: { Origin: "https://sitio-malicioso.com" },
        });
        assert.strictEqual(res.headers.get("access-control-allow-origin"), null);

        // Sin CATALOGO_ORIGEN (vacío)
        process.env.CATALOGO_ORIGEN = "";
        res = await fetch(`${baseUrl}/api/public/marca`, {
          headers: { Origin: "https://tienda.ventimax.com" },
        });
        assert.strictEqual(res.headers.get("access-control-allow-origin"), null);
      } finally {
        delete process.env.CATALOGO_ORIGEN;
      }
    });
  });

  // --------------------------------------------------------------------------
  // TEST 9: X-Robots-Tag: noindex en panel, login y admin
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 9: Cabecera X-Robots-Tag...");
  await withServer(async (baseUrl) => {
    await prueba("X-Robots-Tag: noindex presente en /panel, /login y /api/admin", async () => {
      let res = await fetch(`${baseUrl}/panel`);
      assert.strictEqual(res.headers.get("x-robots-tag"), "noindex");

      res = await fetch(`${baseUrl}/login`);
      assert.strictEqual(res.headers.get("x-robots-tag"), "noindex");

      res = await fetch(`${baseUrl}/api/admin/pedidos`);
      assert.strictEqual(res.headers.get("x-robots-tag"), "noindex");

      // En catálogo público NO debe haber noindex
      res = await fetch(`${baseUrl}/api/public/catalogo`);
      assert.strictEqual(res.headers.get("x-robots-tag"), null);
    });
  });

  // --------------------------------------------------------------------------
  // TEST 10: Rate limiting estricto y protección anti-spoofing [R9]
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 10: Rate Limiting y anti-spoofing de IP...");
  await withServer(async (baseUrl) => {
    await prueba(
      "Anti-spoofing con trust proxy 1: X-Forwarded-For falsificado (<IP distinta>, 10.0.0.9) da 429 a la 6ta",
      async () => {
        // Un atacante envía IPs falsas a la izquierda, pero el proxy (Render) agrega la IP real a la derecha (10.0.0.9).
        // Express con trust proxy 1 toma 10.0.0.9 como req.ip en todas las peticiones.
        for (let i = 1; i <= 5; i++) {
          const fakeClientIp = `198.51.100.${i}`;
          const res = await fetch(`${baseUrl}/api/public/pedidos`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Forwarded-For": `${fakeClientIp}, 10.0.0.9`,
            },
            body: JSON.stringify({
              items: [{ productoId: "fortunne-n04", cantidad: 1 }],
            }),
          });
          assert.strictEqual(res.status, 200, `Intento ${i} debió responder 200`);
        }

        // 6ta petición con otra IP falsificada a la izquierda, misma IP real a la derecha
        const res6 = await fetch(`${baseUrl}/api/public/pedidos`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": "203.0.113.99, 10.0.0.9",
          },
          body: JSON.stringify({
            items: [{ productoId: "fortunne-n04", cantidad: 1 }],
          }),
        });
        assert.strictEqual(res6.status, 429, "La 6ta petición debe retornar HTTP 429");
        const json6 = await res6.json();
        assert.ok(json6.error.includes("varios carritos"), JSON.stringify(json6));
      }
    );
  });

  console.log("\n================================================================================");
  console.log(`🎉 TODOS LOS TESTS DE LA API PÚBLICA (F2-1) PASARON EXITOSAMENTE (${ok}/${ok})`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("❌ Fallo en suite test-api-publica.ts:", err);
  process.exit(1);
});
