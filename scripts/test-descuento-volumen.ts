/**
 * scripts/test-descuento-volumen.ts
 *
 * Suite del descuento por volumen (F1-9). Sin red: el BCV está en modo test y todo va contra dbLocal.
 *
 * Cubre los casos del punto 7 de docs/AGENTS (F1-9):
 * - Tramos 4 -> 0 %, 5 -> 3 %, 9 -> 3 %, 10 -> 5 %.
 * - Productos en oferta no cuentan ni reciben el descuento.
 * - Cantidades negativas, decimales, texto, NaN o más de 50 -> 400 (pedido web) o 0 unidades (función pura).
 * - Precio o descuento enviados por el cliente: nunca se usan (el esquema estricto responde 400).
 * - IDs repetidos en el mismo pedido se suman antes de contar.
 * - Configuración inválida, apagada o sin tramos -> sin descuento.
 * - Bot: el pedido web reclamado recibe el descuento; quitar productos lo quita (se recalcula, no se guarda).
 * - Venta manual: selector apagado -> sin descuento; encendido -> con descuento; el precio del cliente se ignora.
 * - Redondeo a centavos una sola vez sobre el subtotal elegible.
 * - Lista blanca de /api/public/info y validación de la configuración.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
// Número de prueba para el enlace de WhatsApp del pedido web (solo existe en esta suite)
process.env.WHATSAPP_PHONE = process.env.WHATSAPP_PHONE || "584120000000";

const bcvModule = require("../services/bcv");
const horarioService = require("../services/horarioService");
const dbLocal = require("../services/dbLocal");
const orderService = require("../services/orderService");
const chatFlowService = require("../services/chatFlowService");
const publicController = require("../controllers/publicController");
const adminController = require("../controllers/adminController");
const configAdminController = require("../controllers/configAdminController");
const descuento = require("../services/descuentoVolumen");
const descuentoService = require("../services/descuentoVolumenService");

const RAIZ = path.resolve(__dirname, "..");

// Suite determinista: sin interrupciones por día no laborable
horarioService.setHorarioEnMemoria({
  zonaHoraria: "America/Caracas",
  dias: [0, 1, 2, 3, 4, 5, 6],
  apertura: "00:00",
  cierre: "23:59",
});

let pruebas = 0;
let superadas = 0;

async function caso(nombre: string, fn: () => unknown | Promise<unknown>) {
  pruebas++;
  try {
    await fn();
    superadas++;
    console.log(`  ✅ ${nombre}`);
  } catch (err: any) {
    console.log(`  ❌ ${nombre}`);
    console.log(`     ${err?.message || err}`);
    process.exitCode = 1;
  }
}

function resMock() {
  const r: any = { statusCode: 200, body: null, headers: {} };
  r.status = (c: number) => {
    r.statusCode = c;
    return r;
  };
  r.json = (b: any) => {
    r.body = b;
    return r;
  };
  r.setHeader = (k: string, v: string) => {
    r.headers[k] = v;
  };
  return r;
}

const TRAMOS = [
  { minUnidades: 5, pct: 3 },
  { minUnidades: 10, pct: 5 },
];

function linea(precioBase: number, descuentoProductoPct: number, cantidad: unknown) {
  return { precioBase, descuentoProductoPct, cantidad };
}

function configActiva() {
  return { activo: true, tramos: TRAMOS };
}

function resetDb() {
  const data = dbLocal.read();
  data.carritosWeb = [];
  data.pedidos = [];
  data.etiquetas = {};
  data.productos = [
    { _id: "prod-n21", id: "fortunne-n21", name: "Fortunne Mini Jumbo 6\"", price: 25, activo: true, trackStock: false, stock: 0, descuentoPct: 0 },
    { _id: "prod-n22", id: "fortunne-n22", name: "Fortunne High Velocity Fan 8\"", price: 35, activo: true, trackStock: false, stock: 0, descuentoPct: 20 },
    { _id: "prod-n20", id: "fortunne-n20", name: "Fortunne Turbo Fan 12\"", price: 46, activo: true, trackStock: false, stock: 0, descuentoPct: 0 },
  ];
  dbLocal.write(data);
}

async function runTests() {
  console.log("================================================================================");
  console.log("🏷️  SUITE: DESCUENTO POR VOLUMEN (F1-9)");
  console.log("================================================================================");

  // Tasa de cambio fija en modo test (no hay red)
  bcvModule.obtenerTasaUSD = async () => ({ tasa: 36, fecha: "test" });

  // ---------------------------------------------------------------------------
  console.log("\n▶ Tramos y elegibilidad (función pura)");
  await caso("4 unidades -> 0 %", () => {
    const r = descuento.calcularDescuentoVolumen([linea(25, 0, 4)], configActiva());
    assert.strictEqual(r.pct, 0);
    assert.strictEqual(r.montoUsd, 0);
  });
  await caso("5 unidades -> 3 %", () => {
    const r = descuento.calcularDescuentoVolumen([linea(25, 0, 5)], configActiva());
    assert.strictEqual(r.pct, 3);
    assert.strictEqual(r.montoUsd, 3.75);
  });
  await caso("9 unidades -> 3 %", () => {
    assert.strictEqual(descuento.calcularDescuentoVolumen([linea(25, 0, 9)], configActiva()).pct, 3);
  });
  await caso("10 unidades -> 5 % (tramo más alto, no suma)", () => {
    const r = descuento.calcularDescuentoVolumen([linea(25, 0, 10)], configActiva());
    assert.strictEqual(r.pct, 5);
    assert.strictEqual(r.montoUsd, 12.5);
  });
  await caso("4 en oferta + 2 normales = 2 unidades -> sin descuento", () => {
    const r = descuento.calcularDescuentoVolumen([linea(35, 20, 4), linea(25, 0, 2)], configActiva());
    assert.strictEqual(r.unidadesElegibles, 2);
    assert.strictEqual(r.pct, 0);
    assert.strictEqual(r.montoUsd, 0);
  });
  await caso("productos en oferta no cuentan ni reciben: 4 normales + 6 en oferta -> sin descuento", () => {
    const r = descuento.calcularDescuentoVolumen([linea(25, 0, 4), linea(35, 20, 6)], configActiva());
    assert.strictEqual(r.unidadesElegibles, 4);
    assert.strictEqual(r.montoUsd, 0, "el monto solo sale del subtotal elegible");
  });
  await caso("5 normales + 6 en oferta -> 3 % solo sobre los 5 normales", () => {
    const r = descuento.calcularDescuentoVolumen([linea(25, 0, 5), linea(35, 20, 6)], configActiva());
    assert.strictEqual(r.unidadesElegibles, 5);
    assert.strictEqual(r.subtotalElegible, 125);
    assert.strictEqual(r.montoUsd, 3.75);
  });
  await caso("descuento propio ausente o no entero no hace elegible la línea", () => {
    const r = descuento.calcularDescuentoVolumen(
      [{ precioBase: 25, descuentoProductoPct: undefined, cantidad: 3 }, linea(25, "0" as any, 3), linea(25, null as any, 3)],
      configActiva(),
    );
    assert.strictEqual(r.unidadesElegibles, 0);
  });
  await caso("cantidades negativas, decimales, texto, NaN o más de 50 cuentan 0", () => {
    const r = descuento.calcularDescuentoVolumen(
      [linea(25, 0, -2), linea(25, 0, 2.5), linea(25, 0, "4"), linea(25, 0, NaN), linea(25, 0, 51), linea(25, 0, 0)],
      configActiva(),
    );
    assert.strictEqual(r.unidadesElegibles, 0);
    assert.strictEqual(r.pct, 0);
  });
  await caso("IDs repetidos: las líneas se suman antes de contar (3 + 3 = 6 unidades)", () => {
    const r = descuento.calcularDescuentoVolumen([linea(25, 0, 3), linea(25, 0, 3)], configActiva());
    assert.strictEqual(r.unidadesElegibles, 6);
    assert.strictEqual(r.pct, 3);
  });
  await caso("redondeo a centavos una sola vez sobre el subtotal (166.65 * 3 % = 5.00)", () => {
    const r = descuento.calcularDescuentoVolumen([linea(33.33, 0, 5)], configActiva());
    assert.strictEqual(r.subtotalElegible, 166.65);
    assert.strictEqual(r.montoUsd, 5);
  });

  // ---------------------------------------------------------------------------
  console.log("\n▶ Configuración inválida, apagada o vacía (nunca cobra un descuento inventado)");
  await caso("config apagada -> sin descuento aunque haya unidades", () => {
    const r = descuento.calcularDescuentoVolumen([linea(25, 0, 10)], { activo: false, tramos: TRAMOS });
    assert.strictEqual(r.pct, 0);
    assert.strictEqual(r.montoUsd, 0);
  });
  await caso("config nula, sin tramos o con tramos inválidos -> sin descuento", () => {
    for (const cfg of [null, undefined, { activo: true, tramos: [] }, { activo: true, tramos: [{ minUnidades: 5, pct: 99 }] }]) {
      assert.strictEqual(descuento.calcularDescuentoVolumen([linea(25, 0, 10)], cfg).pct, 0);
    }
  });
  await caso("validación: activo booleano, 1 a 5 tramos, unidades 2-500 y porcentaje 1-50 crecientes", () => {
    assert.strictEqual(descuento.validarConfigDescuentoVolumen(configActiva()).ok, true);
    assert.strictEqual(descuento.validarConfigDescuentoVolumen({ activo: "si", tramos: TRAMOS }).ok, false);
    assert.strictEqual(descuento.validarConfigDescuentoVolumen({ activo: true, tramos: [] }).ok, false);
    assert.strictEqual(
      descuento.validarConfigDescuentoVolumen({ activo: true, tramos: [1, 2, 3, 4, 5, 6].map((n) => ({ minUnidades: n + 1, pct: n })) }).ok,
      false,
      "seis tramos",
    );
    assert.strictEqual(descuento.validarConfigDescuentoVolumen({ activo: true, tramos: [{ minUnidades: 1, pct: 3 }] }).ok, false);
    assert.strictEqual(descuento.validarConfigDescuentoVolumen({ activo: true, tramos: [{ minUnidades: 501, pct: 3 }] }).ok, false);
    assert.strictEqual(descuento.validarConfigDescuentoVolumen({ activo: true, tramos: [{ minUnidades: 5, pct: 0 }] }).ok, false);
    assert.strictEqual(descuento.validarConfigDescuentoVolumen({ activo: true, tramos: [{ minUnidades: 5, pct: 51 }] }).ok, false);
    assert.strictEqual(descuento.validarConfigDescuentoVolumen({ activo: true, tramos: [{ minUnidades: 5, pct: 3.5 }] }).ok, false);
    assert.strictEqual(
      descuento.validarConfigDescuentoVolumen({ activo: true, tramos: [{ minUnidades: 10, pct: 5 }, { minUnidades: 5, pct: 3 }] }).ok,
      false,
      "unidades decrecientes",
    );
    assert.strictEqual(
      descuento.validarConfigDescuentoVolumen({ activo: true, tramos: [{ minUnidades: 5, pct: 5 }, { minUnidades: 10, pct: 5 }] }).ok,
      false,
      "porcentaje que no sube",
    );
  });

  // ---------------------------------------------------------------------------
  console.log("\n▶ Configuración guardada (panel) y lectura síncrona");
  resetDb();
  await caso("guardar una configuración válida la deja en la caché de los totales", async () => {
    const guardado = await descuentoService.setConfigDescuentoVolumen({ activo: true, tramos: TRAMOS });
    assert.strictEqual(guardado.activo, true);
    assert.deepStrictEqual(descuentoService.getConfigDescuentoVolumenSync().tramos, TRAMOS);
  });
  await caso("guardar una configuración inválida lanza error y no cambia la caché", async () => {
    await descuentoService.setConfigDescuentoVolumen({ activo: true, tramos: TRAMOS });
    await assert.rejects(() => descuentoService.setConfigDescuentoVolumen({ activo: true, tramos: [] }));
    assert.strictEqual(descuentoService.getConfigDescuentoVolumenSync().activo, true);
  });
  await caso("controlador PUT: inválido -> 400; válido -> 200 con auditoría sin romper", async () => {
    const malo = resMock();
    await configAdminController.updateDescuentoVolumenConfig({ body: { activo: true, tramos: [{ minUnidades: 1, pct: 3 }] }, user: { nombre: "test" } }, malo);
    assert.strictEqual(malo.statusCode, 400);
    const bueno = resMock();
    await configAdminController.updateDescuentoVolumenConfig({ body: { activo: true, tramos: TRAMOS }, user: { nombre: "test" } }, bueno);
    assert.strictEqual(bueno.statusCode, 200);
    assert.strictEqual(bueno.body.config.activo, true);
  });
  await caso("ruta: GET y PUT /config/descuento-volumen exigen config:manage", () => {
    const rutas = fs.readFileSync(path.join(RAIZ, "routes/adminRoutes.ts"), "utf8");
    const bloque = rutas.slice(rutas.indexOf('"/config/descuento-volumen"') - 40, rutas.indexOf('"/config/descuento-volumen"') + 400);
    assert.ok(bloque.includes('authorize(["config:manage"])'));
    assert.strictEqual((rutas.match(/"\/config\/descuento-volumen"/g) || []).length, 2);
  });

  // ---------------------------------------------------------------------------
  console.log("\n▶ Tienda web: POST /api/public/pedidos");
  await descuentoService.setConfigDescuentoVolumen(configActiva());

  async function pedidoWeb(items: any[], extra: any = {}) {
    const res = resMock();
    await publicController.postPedidoWeb({ body: { items, ...extra } }, res);
    return res;
  }

  await caso("5 unidades: total 121.25 (125 - 3 %), desglose del servidor en la respuesta y en CarritoWeb", async () => {
    resetDb();
    const res = await pedidoWeb([{ productoId: "fortunne-n21", cantidad: 5 }]);
    assert.strictEqual(res.statusCode, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.totalUsd, 121.25);
    assert.deepStrictEqual(res.body.descuentoVolumen, { pct: 3, montoUsd: 3.75, unidadesElegibles: 5 });
    const cw = await dbLocal.getCarritoWebModel().findOne({ codigo: res.body.codigo });
    assert.strictEqual(cw.total, 121.25);
    assert.strictEqual(cw.descuentoVolumen.pct, 3);
  });
  await caso("4 unidades: sin descuento", async () => {
    resetDb();
    const res = await pedidoWeb([{ productoId: "fortunne-n21", cantidad: 4 }]);
    assert.strictEqual(res.body.totalUsd, 100);
    assert.strictEqual(res.body.descuentoVolumen.pct, 0);
  });
  await caso("9 unidades: 3 %; 10 unidades: 5 %", async () => {
    resetDb();
    const r9 = await pedidoWeb([{ productoId: "fortunne-n21", cantidad: 9 }]);
    assert.strictEqual(r9.body.descuentoVolumen.pct, 3);
    const r10 = await pedidoWeb([{ productoId: "fortunne-n21", cantidad: 10 }]);
    assert.strictEqual(r10.body.descuentoVolumen.pct, 5);
    assert.strictEqual(r10.body.totalUsd, 237.5);
  });
  await caso("mezcla con oferta: 6 en oferta (-20 %) + 4 normales -> sin descuento, la oferta sigue igual", async () => {
    resetDb();
    const res = await pedidoWeb([
      { productoId: "fortunne-n22", cantidad: 6 },
      { productoId: "fortunne-n21", cantidad: 4 },
    ]);
    assert.strictEqual(res.body.descuentoVolumen.pct, 0);
    assert.strictEqual(res.body.totalUsd, 268, "6 x 28 (precio de oferta) + 4 x 25");
  });
  await caso("IDs repetidos en el mismo pedido se suman antes de contar (3 + 3 = 6 -> 3 %, sin duplicar)", async () => {
    resetDb();
    const res = await pedidoWeb([
      { productoId: "fortunne-n21", cantidad: 3 },
      { productoId: "fortunne-n21", cantidad: 3 },
    ]);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(res.body.descuentoVolumen, { pct: 3, montoUsd: 4.5, unidadesElegibles: 6 });
    assert.strictEqual(res.body.totalUsd, 145.5);
  });
  await caso("cantidades inválidas -> 400 (negativa, decimal, texto, NaN, más de 50)", async () => {
    resetDb();
    for (const cantidad of [-1, 0, 1.5, "3", NaN, 51]) {
      const res = await pedidoWeb([{ productoId: "fortunne-n21", cantidad }]);
      assert.strictEqual(res.statusCode, 400, `cantidad ${String(cantidad)} debe responder 400`);
    }
  });
  await caso("precio o descuento enviados por el cliente: nunca se usan (esquema estricto responde 400)", async () => {
    resetDb();
    const cwAntes = await dbLocal.getCarritoWebModel().countDocuments({});
    const conPrecio = await pedidoWeb([{ productoId: "fortunne-n21", cantidad: 5, precio: 1 }]);
    assert.strictEqual(conPrecio.statusCode, 400);
    const conDescuento = await pedidoWeb([{ productoId: "fortunne-n21", cantidad: 5, descuentoPct: 90 }]);
    assert.strictEqual(conDescuento.statusCode, 400);
    const conDescuentoVolumen = await pedidoWeb([{ productoId: "fortunne-n21", cantidad: 5 }], { descuentoVolumen: { pct: 50 } });
    assert.strictEqual(conDescuentoVolumen.statusCode, 400);
    assert.strictEqual(await dbLocal.getCarritoWebModel().countDocuments({}), cwAntes, "no se guarda ningún carrito");
  });
  await caso("precio del servidor: el pedido usa el precio de la base aunque la tienda muestre otro", async () => {
    resetDb();
    const res = await pedidoWeb([{ productoId: "fortunne-n21", cantidad: 5 }]);
    assert.strictEqual(res.body.totalUsd, 121.25);
  });
  await caso("configuración apagada: 5 unidades sin descuento", async () => {
    resetDb();
    await descuentoService.setConfigDescuentoVolumen({ activo: false, tramos: TRAMOS });
    const res = await pedidoWeb([{ productoId: "fortunne-n21", cantidad: 5 }]);
    assert.strictEqual(res.body.totalUsd, 125);
    assert.strictEqual(res.body.descuentoVolumen.pct, 0);
    await descuentoService.setConfigDescuentoVolumen(configActiva());
  });

  // ---------------------------------------------------------------------------
  console.log("\n▶ Bot: pedido web reclamado con código");
  const tel = "584123330001";
  const telDos = "584123330002";

  await caso("reclamar un código de 5 unidades: el carrito recibe el descuento y el total lo resta", async () => {
    resetDb();
    const cw = dbLocal.getCarritoWebModel();
    await cw.create({
      codigo: "VM-7K3Q9",
      items: [{ productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo 6\"", precio: 25, cantidad: 5 }],
      total: 121.25,
      descuentoVolumen: { pct: 3, montoUsd: 3.75, unidadesElegibles: 5 },
      estado: "pendiente",
      telefono: null,
      creadoEn: new Date(),
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });
    await chatFlowService._processBatch(tel, [{ from: tel, text: "Hola, quiero confirmar mi pedido web VM-7K3Q9", tipo: "text", io: null }]);
    const est = await orderService.getEstado(tel);
    assert.strictEqual(est.carrito.aplicaDescuentoVolumen, true);
    assert.strictEqual(est.carrito.descuentoVolumen.pct, 3);
    assert.strictEqual(orderService.calcularTotalCarrito(est.carrito), 121.25);
  });

  await caso("quitar productos en WhatsApp y bajar de 5 unidades: el descuento desaparece (se recalcula)", async () => {
    const est = await orderService.getEstado(tel);
    const sinDescuento = {
      ...est.carrito,
      items: est.carrito.items.map((it: any) => ({ ...it, cantidad: 4 })),
    };
    assert.strictEqual(orderService.calcularTotalCarrito(sinDescuento), 100);
    // Volver a subir a 5 vuelve a dar el descuento: no hay monto guardado que quede pegado
    const conCinco = { ...est.carrito, items: est.carrito.items.map((it: any) => ({ ...it, cantidad: 5 })) };
    assert.strictEqual(orderService.calcularTotalCarrito(conCinco), 121.25);
  });

  await caso("carrito que no viene de la web (sin aplicaDescuentoVolumen) no recibe descuento", async () => {
    const carrito = { items: [{ id: "fortunne-n21", price: 25, cantidad: 10, descuentoProductoPct: 0 }] };
    assert.strictEqual(orderService.calcularTotalCarrito(carrito), 250);
  });

  await caso("ítems sin descuentoProductoPct (datos antiguos) no cuentan: nunca se cobra de más", async () => {
    const carrito = { aplicaDescuentoVolumen: true, items: [{ id: "x", price: 25, cantidad: 10 }] };
    assert.strictEqual(orderService.calcularTotalCarrito(carrito), 250);
  });

  await caso("reclamo con la configuración apagada: el carrito queda sin descuento y el pedido guarda pct 0", async () => {
    resetDb();
    await descuentoService.setConfigDescuentoVolumen({ activo: false, tramos: TRAMOS });
    await dbLocal.getCarritoWebModel().create({
      codigo: "VM-2XWHM",
      items: [{ productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo 6\"", precio: 25, cantidad: 5 }],
      total: 125,
      descuentoVolumen: { pct: 3, montoUsd: 3.75, unidadesElegibles: 5 },
      estado: "pendiente",
      telefono: null,
      creadoEn: new Date(),
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });
    await chatFlowService._processBatch(telDos, [{ from: telDos, text: "VM-2XWHM", tipo: "text", io: null }]);
    const est = await orderService.getEstado(telDos);
    assert.strictEqual(orderService.calcularTotalCarrito(est.carrito), 125);
    const pedido = await orderService.crearPedidoInicial(telDos, est.carrito, null);
    assert.strictEqual(pedido.descuentoVolumen.pct, 0);
    await descuentoService.setConfigDescuentoVolumen(configActiva());
  });

  await caso("pedido creado desde el carrito reclamado guarda el bloque descuentoVolumen", async () => {
    resetDb();
    await dbLocal.getCarritoWebModel().create({
      codigo: "VM-AB2CD",
      items: [{ productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo 6\"", precio: 25, cantidad: 5 }],
      total: 121.25,
      descuentoVolumen: { pct: 3, montoUsd: 3.75, unidadesElegibles: 5 },
      estado: "pendiente",
      telefono: null,
      creadoEn: new Date(),
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });
    const telTres = "584123330003";
    await chatFlowService._processBatch(telTres, [{ from: telTres, text: "VM-AB2CD", tipo: "text", io: null }]);
    const est = await orderService.getEstado(telTres);
    const pedido = await orderService.crearPedidoInicial(telTres, est.carrito, null);
    assert.deepStrictEqual(pedido.descuentoVolumen, { pct: 3, montoUsd: 3.75, unidadesElegibles: 5 });
  });

  // ---------------------------------------------------------------------------
  console.log("\n▶ Venta manual (copiloto / venta rápida)");
  async function ventaManual(body: any) {
    const res = resMock();
    await adminController.postManualSale({ body: { cliente: { nombre: "Cliente prueba" }, pago: { metodo: "Efectivo" }, ...body } }, res, null);
    return res;
  }

  await caso("selector apagado: sin descuento", async () => {
    resetDb();
    const res = await ventaManual({ items: [{ id: "fortunne-n21", cantidad: 5 }] });
    assert.strictEqual(res.statusCode, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.data.pago.montoUSD, 125);
    assert.strictEqual(res.body.data.descuentoVolumen.pct, 0);
  });
  await caso("selector encendido con 5 unidades: 3 % aplicado y auditado en el pedido", async () => {
    resetDb();
    const res = await ventaManual({ items: [{ id: "fortunne-n21", cantidad: 5 }], aplicarDescuentoVolumen: true });
    assert.strictEqual(res.statusCode, 201);
    assert.strictEqual(res.body.data.pago.montoUSD, 121.25);
    assert.deepStrictEqual(res.body.data.descuentoVolumen, { pct: 3, montoUsd: 3.75, unidadesElegibles: 5 });
  });
  await caso("selector encendido sin llegar al tramo: sin descuento", async () => {
    resetDb();
    const res = await ventaManual({ items: [{ id: "fortunne-n21", cantidad: 4 }], aplicarDescuentoVolumen: true });
    assert.strictEqual(res.body.data.pago.montoUSD, 100);
    assert.strictEqual(res.body.data.descuentoVolumen.pct, 0);
  });
  await caso("selector encendido con la configuración apagada: sin descuento", async () => {
    resetDb();
    await descuentoService.setConfigDescuentoVolumen({ activo: false, tramos: TRAMOS });
    const res = await ventaManual({ items: [{ id: "fortunne-n21", cantidad: 5 }], aplicarDescuentoVolumen: true });
    assert.strictEqual(res.body.data.pago.montoUSD, 125);
    await descuentoService.setConfigDescuentoVolumen(configActiva());
  });
  await caso("el precio y el descuento que envía el navegador se ignoran en la venta manual", async () => {
    resetDb();
    const res = await ventaManual({
      items: [{ id: "fortunne-n21", cantidad: 5, price: 1, descuentoProductoPct: 90 }],
      aplicarDescuentoVolumen: true,
      pago: { metodo: "Efectivo", montoUSD: 1 },
    });
    assert.strictEqual(res.body.data.items[0].price, 25);
    assert.strictEqual(res.body.data.pago.montoUSD, 121.25);
  });
  await caso("venta manual con el selector en texto ('true') no aplica: solo el booleano true cuenta", async () => {
    resetDb();
    const res = await ventaManual({ items: [{ id: "fortunne-n21", cantidad: 5 }], aplicarDescuentoVolumen: "true" });
    assert.strictEqual(res.body.data.descuentoVolumen.pct, 0);
  });

  // ---------------------------------------------------------------------------
  console.log("\n▶ Lista blanca de /api/public/info");
  await caso("descuentoVolumen expone solo activo y tramos (sin ids ni campos internos)", async () => {
    resetDb();
    await descuentoService.setConfigDescuentoVolumen(configActiva());
    const res = resMock();
    await publicController.getInfo({}, res);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(Object.keys(res.body.descuentoVolumen).sort(), ["activo", "tramos"]);
    assert.strictEqual(res.body.descuentoVolumen.activo, true);
    assert.deepStrictEqual(res.body.descuentoVolumen.tramos, TRAMOS);
    assert.ok(!JSON.stringify(res.body.descuentoVolumen).includes("_id"));
  });
  await caso("con la configuración apagada, /info dice activo false y sin tramos", async () => {
    await descuentoService.setConfigDescuentoVolumen({ activo: false, tramos: TRAMOS });
    const res = resMock();
    await publicController.getInfo({}, res);
    assert.deepStrictEqual(res.body.descuentoVolumen, { activo: false, tramos: [] });
    await descuentoService.setConfigDescuentoVolumen(configActiva());
  });

  // ---------------------------------------------------------------------------
  console.log("\n▶ Arranque y marca");
  await caso("la marca trae la configuración inicial apagada con los tramos del dueño", () => {
    const marca = JSON.parse(fs.readFileSync(path.join(RAIZ, "config/brand/ventimax/settings.json"), "utf8"));
    assert.strictEqual(marca.descuentoVolumen.activo, false);
    assert.deepStrictEqual(marca.descuentoVolumen.tramos, [
      { minUnidades: 5, pct: 3 },
      { minUnidades: 10, pct: 5 },
    ]);
  });
  await caso("la configuración de la marca se lee como válida", () => {
    const d = descuentoService.getDefaultConfigDescuentoVolumen();
    assert.strictEqual(d.tramos.length, 2);
  });

  // ---------------------------------------------------------------------------
  console.log("\n▶ Estáticos: sin marca escrita, sin innerHTML, íconos y permisos");
  const archivosNuevos = [
    "services/descuentoVolumen.ts",
    "services/descuentoVolumenService.ts",
  ];
  await caso("código nuevo sin texto de marca (Caracas, Fortunne, VentiMax, Yuri)", () => {
    for (const rel of archivosNuevos) {
      const txt = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      assert.ok(!/Caracas|Fortunne|VentiMax|Yuri|Pachi/i.test(txt), `${rel} contiene texto de marca`);
    }
  });
  await caso("panel y tienda: sin innerHTML en el código tocado", () => {
    for (const rel of [
      "public/src/features/dashboard/SettingsPanel.js",
      "public/src/features/inbox/components/InboxManualOrderModal.js",
      "catalogo/js/app.js",
    ]) {
      const txt = fs.readFileSync(path.join(RAIZ, rel), "utf8");
      assert.ok(!txt.includes("innerHTML"), `${rel} usa innerHTML`);
    }
  });
  await caso("interruptor de la venta manual y sección del panel presentes", () => {
    const modal = fs.readFileSync(path.join(RAIZ, "public/src/features/inbox/components/InboxManualOrderModal.js"), "utf8");
    assert.ok(modal.includes("aplicarDescuentoVolumen: aplicaDescuentoVolumen"));
    const panel = fs.readFileSync(path.join(RAIZ, "public/src/features/dashboard/SettingsPanel.js"), "utf8");
    assert.ok(panel.includes("/api/admin/config/descuento-volumen"));
  });

  console.log("\n================================================================================");
  console.log(`Resultado: ${superadas}/${pruebas} pruebas superadas`);
  if (superadas === pruebas) {
    console.log("🎉 TODOS LOS TESTS DE DESCUENTO POR VOLUMEN (F1-9) PASARON EXITOSAMENTE.");
  } else {
    console.log("❌ HAY PRUEBAS FALLIDAS DE DESCUENTO POR VOLUMEN (F1-9).");
  }
  console.log("================================================================================");
}

runTests()
  .then(() => {
    process.exit(process.exitCode || 0);
  })
  .catch((err) => {
    console.error("Error inesperado en la suite de descuento por volumen:", err);
    process.exit(1);
  });
