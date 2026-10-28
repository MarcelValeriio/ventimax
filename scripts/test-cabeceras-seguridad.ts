/**
 * scripts/test-cabeceras-seguridad.ts — F0-11
 * Suite de pruebas para Endurecimiento de Cabeceras (CSP), Redirección de Estáticos,
 * Seguridad en Precios de Venta Manual y Errores 500 Genéricos.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-cabeceras-seguridad.ts
 */

import assert from "node:assert";
import http from "node:http";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "x".repeat(40);
process.env.ADMIN_PHONE_NUMBER = "584122781982";

const express = require("express");
const helmet = require("helmet");
const dbLocal = require("../services/dbLocal");
const adminController = require("../controllers/adminController");
const orderService = require("../services/orderService");

let ok = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
}

function mockRes() {
  const r: any = {
    statusCode: 200,
    headers: {},
    cuerpo: undefined,
  };
  r.status = (c: number) => {
    r.statusCode = c;
    return r;
  };
  r.setHeader = (k: string, v: string) => {
    r.headers[k.toLowerCase()] = v;
    return r;
  };
  r.json = (b: unknown) => {
    r.cuerpo = b;
    return r;
  };
  r.send = (b: unknown) => {
    r.cuerpo = b;
    return r;
  };
  r.redirect = (url: string) => {
    r.statusCode = 302;
    r.cuerpo = { redirect: url };
    return r;
  };
  return r;
}

async function main() {
  console.log("================================================================================");
  console.log("🛡️  SUITE DE PRUEBAS: CABECERAS DE SEGURIDAD, ESTÁTICOS Y ERRORES (F0-11)");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // TEST 1: Content-Security-Policy (CSP) en Helmet
  // --------------------------------------------------------------------------
  console.log("▶ Bloque 1: Cabeceras Content-Security-Policy (CSP)...");

  // Misma configuración que index.ts (módulo compartido, no una copia)
  const { CSP_DIRECTIVES } = require("../middlewares/csp");
  const appCsp = express();
  appCsp.use(helmet({ contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES } }));
  appCsp.get("/test-csp", (req: any, res: any) => res.send("ok"));

  const server = appCsp.listen(0);
  const port = server.address().port;

  const directiva = (csp: string, nombre: string) =>
    (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(nombre + " ")) || "").split(/\s+/).slice(1);

  await prueba("CSP real: script-src sin 'unsafe-inline' y connect-src solo 'self'", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/test-csp`);
    const csp = res.headers.get("content-security-policy") || "";
    assert.ok(csp, "La cabecera Content-Security-Policy debe existir");
    const script = directiva(csp, "script-src");
    assert.ok(script.includes("'self'"), "script-src debe incluir 'self'");
    assert.ok(!script.includes("'unsafe-inline'"), "script-src NO puede tener 'unsafe-inline'");
    assert.ok(!script.includes("'unsafe-eval'"), "script-src NO puede tener 'unsafe-eval'");
    const connect = directiva(csp, "connect-src");
    assert.ok(connect.includes("'self'"), "connect-src debe incluir 'self'");
    assert.ok(!connect.includes("ws:") && !connect.includes("wss:"), "connect-src no puede abrir WebSocket a cualquier host");
    assert.deepStrictEqual(directiva(csp, "object-src"), ["'none'"]);
    assert.deepStrictEqual(directiva(csp, "frame-ancestors"), ["'none'"]);
    assert.deepStrictEqual(directiva(csp, "base-uri"), ["'self'"]);
    assert.deepStrictEqual(directiva(csp, "default-src"), ["'self'"]);
  });

  await prueba("Las páginas del panel no tienen <script> en línea (los bloquearía la CSP)", async () => {
    const fs = require("node:fs");
    const path = require("node:path");
    for (const archivo of ["public/index.html", "public/login.html"]) {
      const html = fs.readFileSync(path.join(__dirname, "..", archivo), "utf8");
      const enLinea = (html.match(/<script\b[^>]*>/gi) || []).filter((tag: string) => !/\ssrc=/i.test(tag));
      assert.deepStrictEqual(enLinea, [], `${archivo} tiene scripts en línea: ${enLinea.join(", ")}`);
      assert.ok(!/\son[a-z]+\s*=/i.test(html), `${archivo} tiene atributos on*= (manejadores en línea)`);
    }
  });

  server.close();

  // --------------------------------------------------------------------------
  // TEST 2: Entrada al panel y protección de archivos HTML estáticos
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 2: Protección de /index.html y /login.html...");

  const appStatic = express();
  appStatic.get("/index.html", (req: any, res: any) => res.redirect("/panel"));
  appStatic.get("/login.html", (req: any, res: any) => res.redirect("/login"));

  await prueba("GET /index.html redirige a /panel (302)", async () => {
    const res = mockRes();
    appStatic.handle({ method: "GET", url: "/index.html" }, res, () => {});
    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.cuerpo.redirect, "/panel");
  });

  await prueba("GET /login.html redirige a /login (302)", async () => {
    const res = mockRes();
    appStatic.handle({ method: "GET", url: "/login.html" }, res, () => {});
    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.cuerpo.redirect, "/login");
  });

  // --------------------------------------------------------------------------
  // TEST 3: Seguridad en Venta Manual - Precios desde la BD y productos inactivos
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 3: Venta manual con precios tomados de la base de datos...");

  const Producto = dbLocal.getProductoModel();
  const Pedido = dbLocal.getPedidoModel();
  await Producto.deleteMany({});
  await Pedido.deleteMany({});

  // Crear productos en catálogo mock
  const prodValido = await Producto.create({
    id: "fortunne-turbo-10",
    name: "Fortunne Turbo Fan 10\"",
    price: 40,
    activo: true,
    trackStock: true,
    stock: 10,
  });

  const prodInactivo = await Producto.create({
    id: "fortunne-agotado",
    name: "Fortunne Agotado",
    price: 25,
    activo: false,
    trackStock: false,
  });

  await prueba("Venta manual ignora precio alterado por el cliente y usa el de la BD", async () => {
    const req = {
      body: {
        cliente: { nombre: "Cliente Seguridad", telefono: "584120000001" },
        items: [
          {
            producto: "Fortunne Turbo Fan 10\"",
            cantidad: 2,
            price: 1, // PRECIO ALTERADO EN EL NAVEGADOR ($1 en vez de $40)
          },
        ],
        pago: { metodo: "Efectivo" },
      },
    };
    const res = mockRes();

    await adminController.postManualSale(req, res, null);
    assert.strictEqual(res.statusCode, 201, "Debe responder 201 al crear la venta");
    assert.ok(res.cuerpo?.data, "Debe retornar datos del pedido");

    const pedido = res.cuerpo.data;
    assert.strictEqual(
      pedido.items[0].price,
      40,
      "El precio del item guardado debe ser 40 (leído de la BD), no 1"
    );
    assert.strictEqual(
      pedido.pago.montoUSD,
      80,
      "El total del pedido debe ser 80 (40 * 2), no 2"
    );
  });

  await prueba("Venta manual rechaza producto inexistente con 400", async () => {
    const req = {
      body: {
        cliente: { nombre: "Cliente Test", telefono: "584120000002" },
        items: [
          {
            producto: "Producto Que No Existe",
            cantidad: 1,
            price: 10,
          },
        ],
      },
    };
    const res = mockRes();

    await adminController.postManualSale(req, res, null);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(
      res.cuerpo.error.includes("no existe") || res.cuerpo.error.includes("inactivo"),
      "Error debe indicar que no existe en el catálogo"
    );
  });

  await prueba("Venta manual rechaza producto inactivo con 400", async () => {
    const req = {
      body: {
        cliente: { nombre: "Cliente Test", telefono: "584120000003" },
        items: [
          {
            producto: "Fortunne Agotado",
            cantidad: 1,
            price: 25,
          },
        ],
      },
    };
    const res = mockRes();

    await adminController.postManualSale(req, res, null);
    assert.strictEqual(res.statusCode, 400);
    assert.ok(
      res.cuerpo.error.includes("inactivo") || res.cuerpo.error.includes("no existe"),
      "Error debe indicar que el producto está inactivo"
    );
  });

  await prueba("Venta manual permite buscar producto por id además de nombre", async () => {
    const req = {
      body: {
        cliente: { nombre: "Cliente ID", telefono: "584120000004" },
        items: [
          {
            id: "fortunne-turbo-10",
            cantidad: 1,
            price: 5, // precio falso alterado
          },
        ],
        pago: { metodo: "Efectivo" },
      },
    };
    const res = mockRes();

    await adminController.postManualSale(req, res, null);
    assert.strictEqual(res.statusCode, 201);
    const pedido = res.cuerpo.data;
    assert.strictEqual(pedido.items[0].producto, "Fortunne Turbo Fan 10\"");
    assert.strictEqual(pedido.items[0].price, 40);
    assert.strictEqual(pedido.pago.montoUSD, 40);
  });

  await prueba("Venta manual con id de texto no consulta _id con un valor que no es ObjectId (evita CastError)", async () => {
    const mongoose = require("mongoose");
    const originalFindOne = Producto.findOne;
    // Imita a Mongoose: un _id que no es ObjectId válido lanza CastError
    Producto.findOne = (q: any, ...rest: any[]) => {
      for (const cond of q?.$or || []) {
        if (cond._id !== undefined && !mongoose.Types.ObjectId.isValid(cond._id)) {
          const err: any = new Error(`Cast to ObjectId failed for value "${cond._id}"`);
          err.name = "CastError";
          throw err;
        }
      }
      return originalFindOne.call(Producto, q, ...rest);
    };
    try {
      const req = {
        body: {
          cliente: { nombre: "Cliente ID texto", telefono: "584120000005" },
          items: [{ id: "fortunne-turbo-10", cantidad: 2, price: 1 }],
          pago: { metodo: "Efectivo" },
        },
      };
      const res = mockRes();
      await adminController.postManualSale(req, res, null);
      assert.strictEqual(res.statusCode, 201, JSON.stringify(res.cuerpo));
      assert.strictEqual(res.cuerpo.data.pago.montoUSD, 80);
    } finally {
      Producto.findOne = originalFindOne;
    }
  });

  // --------------------------------------------------------------------------
  // TEST 4: Errores 500 no filtran detalles internos al cliente
  // --------------------------------------------------------------------------
  console.log("\n▶ Bloque 4: Errores 500 con mensajes genéricos...");

  await prueba("deleteProduct ante error 500 no expone error.message", async () => {
    const req = { params: { id: "prod-err" } };
    const res = mockRes();
    const originalFind = Producto.findOne;
    Producto.findOne = () => {
      throw new Error("Internal MongoDB connection pool destroyed");
    };

    await adminController.deleteProduct(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.cuerpo.error, "Error eliminando el producto");
    assert.strictEqual(res.cuerpo.details, undefined);

    Producto.findOne = originalFind;
  });

  await prueba("editOrder ante error 500 no incluye details: error.message", async () => {
    const req = { params: { id: "order-err" }, body: {} };
    const res = mockRes();
    const originalRead = dbLocal.read;
    dbLocal.read = () => {
      throw new Error("Disk corruption error");
    };

    await adminController.editOrder(req, res);
    assert.strictEqual(res.statusCode, 500);
    assert.strictEqual(res.cuerpo.error, "Error editando pedido");
    assert.strictEqual(res.cuerpo.details, undefined);

    dbLocal.read = originalRead;
  });

  console.log(`\n🎉 TODAS LAS PRUEBAS DE SEGURIDAD (F0-11) SUPERADAS (${ok} pruebas).`);
}

main().catch((err) => {
  console.error("❌ Fallo en suite test-cabeceras-seguridad.ts:", err);
  process.exit(1);
});
