/**
 * scripts/test-entrega-web.ts — F2c
 * El cliente elige en la tienda cómo recibe el pedido (retiro, delivery con la ubicación del teléfono o dirección
 * escrita, envío nacional). El servidor valida el método contra la base y toma el costo de ahí; la entrega viaja
 * en el mensaje de WhatsApp y el bot la carga con el código, sin volver a preguntarla.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-entrega-web.ts
 */
import assert from "node:assert";
import express from "express";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.WHATSAPP_PHONE = "584120000000";

const dbLocal = require("../services/dbLocal");
const chatFlowService = require("../services/chatFlowService");
const chatFlow = require("../controllers/chatFlowController");
const orderService = require("../services/orderService");
const publicRoutes = require("../routes/publicRoutes");

import { entregaCompleta, armarEntrega, costoEntrega, enlaceMapa, redondearCoordenada } from "../catalogo/js/entrega.js";
import { armarCuerpoPedido } from "../catalogo/js/carrito.js";

const ID_DELIVERY = "65f0000000000000000000d1";
const ID_RETIRO = "65f0000000000000000000d2";
const ID_NACIONAL = "65f0000000000000000000d3";
const ID_INACTIVO = "65f0000000000000000000d4";
const ID_FIJO = "65f0000000000000000000d5";

let ok = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
}

function sembrar() {
  const data = dbLocal.read();
  data.carritosWeb = [];
  data.pedidos = [];
  data.mensajes = [];
  data.etiquetas = {};
  data.productos = [
    { _id: "prod-n21", id: "fortunne-n21", name: 'Fortunne Mini Jumbo 6"', price: 25, activo: true, trackStock: false, stock: 10 },
  ];
  data.metodosEnvio = [
    { _id: ID_DELIVERY, nombre: "Delivery Caracas", tipo: "delivery_local", costoTipo: "a_convenir", costo: 0, activo: true, orden: 1 },
    { _id: ID_RETIRO, nombre: "Retiro en tienda", tipo: "retiro", costoTipo: "fijo", costo: 0, direccion: "Av. de prueba 123", horario: "", activo: true, orden: 2 },
    { _id: ID_NACIONAL, nombre: "Envío nacional", tipo: "envio_nacional", costoTipo: "a_convenir", costo: 0, pideDatos: "estado, ciudad y agencia", activo: true, orden: 3 },
    { _id: ID_INACTIVO, nombre: "Moto exprés", tipo: "delivery_local", costoTipo: "fijo", costo: 3, activo: false, orden: 4 },
    { _id: ID_FIJO, nombre: "Delivery zona centro", tipo: "delivery_local", costoTipo: "fijo", costo: 5, activo: true, orden: 5 },
  ];
  dbLocal.write(data);
}

async function conServidor(fn: (base: string) => Promise<void>) {
  const app = express();
  app.set("trust proxy", 1);
  app.use("/api/public", publicRoutes);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

async function pedir(base: string, cuerpo: any, ip: string) {
  const res = await fetch(`${base}/api/public/pedidos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
    body: JSON.stringify(cuerpo),
  });
  return { status: res.status, json: await res.json() };
}

const items = [{ productoId: "fortunne-n21", cantidad: 2 }];

async function run() {
  console.log("================================================================================");
  console.log("🚚 SUITE DE PRUEBAS: ENTREGA ELEGIDA EN LA TIENDA (F2c)");
  console.log("================================================================================");

  await prueba("Tienda: lógica de entrega sin DOM", () => {
    assert.strictEqual(entregaCompleta({ metodo: null }), false);
    assert.strictEqual(entregaCompleta({ metodo: { id: "a", tipo: "retiro" } }), true, "retiro no pide nada más");
    assert.strictEqual(entregaCompleta({ metodo: { id: "a", tipo: "delivery_local" }, direccion: "corta" }), false);
    assert.strictEqual(entregaCompleta({ metodo: { id: "a", tipo: "delivery_local" }, direccion: "Calle 4, casa 12" }), true);
    assert.strictEqual(entregaCompleta({ metodo: { id: "a", tipo: "delivery_local" }, gps: { latitud: 10.5, longitud: -66.9 } }), true);
    assert.strictEqual(entregaCompleta({ metodo: { id: "a", tipo: "delivery_local" }, gps: { latitud: 200, longitud: 0 } }), false);
    // GPS tomado con delivery y luego cambio a envío nacional: hacen falta los datos escritos, y no se manda el GPS
    const nacional = { metodo: { id: ID_NACIONAL, tipo: "envio_nacional" }, gps: { latitud: 10.5, longitud: -66.9 }, direccion: "" };
    assert.strictEqual(entregaCompleta(nacional), false, "el GPS no reemplaza los datos del envío nacional");
    assert.deepStrictEqual(armarEntrega({ ...nacional, direccion: "Carabobo, Valencia, MRW" }), { metodoId: ID_NACIONAL, direccion: "Carabobo, Valencia, MRW" });

    assert.deepStrictEqual(armarEntrega({ metodo: { id: ID_RETIRO, tipo: "retiro" }, gps: { latitud: 1, longitud: 1 }, direccion: "x" }), { metodoId: ID_RETIRO }, "el retiro no manda ubicación");
    const conGps = armarEntrega({ metodo: { id: ID_DELIVERY, tipo: "delivery_local", costo: 99 }, gps: { latitud: 10.4806123456, longitud: -66.9036789 }, direccion: " Piso 3 " });
    assert.deepStrictEqual(conGps, { metodoId: ID_DELIVERY, latitud: 10.480612, longitud: -66.903679, direccion: "Piso 3" });
    assert.ok(!("costo" in conGps) && !("nombre" in conGps), "nunca manda costo ni nombre");
    assert.strictEqual(redondearCoordenada(10.12345678), 10.123457);
    assert.strictEqual(enlaceMapa({ latitud: 10.5, longitud: -66.9 }), "https://maps.google.com/?q=10.500000,-66.900000");
    assert.deepStrictEqual(costoEntrega({ aConvenir: true, costo: null }), { tipo: "a_convenir", monto: 0 });
    assert.deepStrictEqual(costoEntrega({ aConvenir: false, costo: 5 }), { tipo: "fijo", monto: 5 });
    assert.deepStrictEqual(costoEntrega({ aConvenir: false, costo: 0 }), { tipo: "gratis", monto: 0 });

    const cuerpo = armarCuerpoPedido([{ productoId: "fortunne-n21", cantidad: 1, precio: 1 } as any], "", conGps);
    assert.deepStrictEqual(Object.keys(cuerpo).sort(), ["entrega", "items", "website"]);
    assert.deepStrictEqual(Object.keys(armarCuerpoPedido(items, "")).sort(), ["items", "website"], "sin entrega, el cuerpo de siempre");
  });

  sembrar();
  await conServidor(async (base) => {
    await prueba("API: /api/public/info da el id del método y los datos a pedir", async () => {
      const info = await (await fetch(`${base}/api/public/info`)).json();
      const delivery = info.envios.find((e: any) => e.nombre === "Delivery Caracas");
      assert.strictEqual(delivery.id, ID_DELIVERY);
      assert.strictEqual(info.envios.find((e: any) => e.tipo === "envio_nacional").pideDatos, "estado, ciudad y agencia");
      assert.ok(!info.envios.some((e: any) => e.nombre === "Moto exprés"), "los inactivos no salen");
    });

    await prueba("API: delivery con GPS → guardado, enlace de mapa en WhatsApp", async () => {
      const r = await pedir(base, { items, entrega: { metodoId: ID_DELIVERY, latitud: 10.480612, longitud: -66.903679, direccion: "Piso 3" } }, "10.1.0.1");
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      const texto = decodeURIComponent(r.json.enlaceWhatsApp.split("text=")[1]);
      assert.ok(texto.includes(r.json.codigo));
      assert.ok(texto.includes("Entrega: Delivery Caracas"), texto);
      assert.ok(texto.includes("Ubicación: https://maps.google.com/?q=10.480612,-66.903679"), texto);
      assert.ok(texto.includes("Dirección: Piso 3"), texto);
      assert.strictEqual(r.json.totalUsd, 50, "a convenir no suma");
      const cw = await dbLocal.getCarritoWebModel().findOne({ codigo: r.json.codigo });
      assert.strictEqual(String(cw.entrega.metodoId), ID_DELIVERY);
      assert.strictEqual(cw.entrega.latitud, 10.480612);
    });

    await prueba("API: el costo fijo sale de la base, no del navegador", async () => {
      const r = await pedir(base, { items, entrega: { metodoId: ID_FIJO, direccion: "Calle 4, casa 12, La Candelaria" } }, "10.1.0.2");
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.totalUsd, 55, "50 de productos + 5 de envío fijo");
      const conCosto = await pedir(base, { items, entrega: { metodoId: ID_FIJO, direccion: "Calle 4, casa 12", costo: 0 } }, "10.1.0.3");
      assert.strictEqual(conCosto.status, 400, "un costo en el cuerpo se rechaza (Zod estricto)");
    });

    await prueba("API: retiro no guarda ubicación aunque se mande", async () => {
      const r = await pedir(base, { items, entrega: { metodoId: ID_RETIRO, latitud: 10.5, longitud: -66.9, direccion: "mi casa" } }, "10.1.0.4");
      assert.strictEqual(r.status, 200);
      const cw = await dbLocal.getCarritoWebModel().findOne({ codigo: r.json.codigo });
      assert.strictEqual(cw.entrega.latitud, null);
      assert.strictEqual(cw.entrega.direccion, "");
      assert.ok(!decodeURIComponent(r.json.enlaceWhatsApp).includes("Ubicación:"));
    });

    await prueba("API: rechazos (sin datos, método inactivo o inexistente, coordenadas incompletas)", async () => {
      assert.strictEqual((await pedir(base, { items, entrega: { metodoId: ID_DELIVERY } }, "10.1.0.5")).status, 400, "delivery sin GPS ni dirección");
      assert.strictEqual((await pedir(base, { items, entrega: { metodoId: ID_INACTIVO, direccion: "Calle 4, casa 12" } }, "10.1.0.6")).status, 400);
      assert.strictEqual((await pedir(base, { items, entrega: { metodoId: "65f0000000000000000000ff", direccion: "Calle 4, casa 12" } }, "10.1.0.7")).status, 400);
      assert.strictEqual((await pedir(base, { items, entrega: { metodoId: "no-es-id", direccion: "Calle 4, casa 12" } }, "10.1.0.8")).status, 400);
      assert.strictEqual((await pedir(base, { items, entrega: { metodoId: ID_DELIVERY, latitud: 10.5 } }, "10.1.0.9")).status, 400);
      const nacionalSoloGps = await pedir(base, { items, entrega: { metodoId: ID_NACIONAL, latitud: 10.5, longitud: -66.9 } }, "10.1.0.11");
      assert.strictEqual(nacionalSoloGps.status, 400, "envío nacional sin los datos escritos");
    });

    await prueba("API: sin entrega, el pedido funciona como siempre", async () => {
      const r = await pedir(base, { items }, "10.1.0.10");
      assert.strictEqual(r.status, 200);
      assert.ok(!decodeURIComponent(r.json.enlaceWhatsApp).includes("Entrega:"));
    });
  });

  await prueba("Bot: carga envío y ubicación del código y no los vuelve a preguntar", async () => {
    sembrar();
    const CarritoWeb = dbLocal.getCarritoWebModel();
    await CarritoWeb.create({
      codigo: "VM-ENTR2",
      items: [{ productoId: "fortunne-n21", nombre: 'Fortunne Mini Jumbo 6"', precio: 25, cantidad: 2 }],
      total: 50,
      entrega: { metodoId: ID_DELIVERY, nombre: "Delivery Caracas", tipo: "delivery_local", costo: 0, aConvenir: true, latitud: 10.480612, longitud: -66.903679, direccion: "Piso 3" },
      estado: "pendiente",
      creadoEn: new Date(),
      expiraEn: new Date(Date.now() + 3600 * 1000),
    });
    const tel = "584127770001";
    await chatFlowService._processBatch(tel, [{ from: tel, text: "Hola, quiero confirmar mi pedido web VM-ENTR2", tipo: "text", io: null }]);
    let estado = await orderService.getEstado(tel);
    assert.strictEqual(estado.paso, "esperando_confirmacion_web");
    assert.strictEqual(estado.carrito.envio.metodoId, ID_DELIVERY);
    assert.strictEqual(estado.carrito.envio.desdeWeb, true);
    assert.strictEqual(estado.carrito.ubicacion.latitude, 10.480612);

    // Cliente nuevo: Confirmar → nombre → cédula → directo a confirmar datos (sin preguntar envío ni ubicación)
    await chatFlowService._processBatch(tel, [{ from: tel, text: "web_confirmar", buttonReplyId: "web_confirmar", tipo: "interactive", io: null }]);
    await chatFlowService._processBatch(tel, [{ from: tel, text: "Ana Pérez", tipo: "text", io: null }]);
    await chatFlowService._processBatch(tel, [{ from: tel, text: "V-12345678", tipo: "text", io: null }]);
    estado = await orderService.getEstado(tel);
    assert.strictEqual(estado.paso, "esperando_confirmacion_datos", `paso: ${estado.paso}`);

    const pedido = (dbLocal.read().pedidos || []).find((p: any) => p.whatsappId === tel || p.cliente?.telefono === tel);
    assert.ok(pedido, "pedido inicial creado");
    assert.strictEqual(pedido.ubicacion.latitud, 10.480612, "la ubicación de la tienda queda en el pedido");
    assert.strictEqual(pedido.envio.nombre, "Delivery Caracas");
  });

  await prueba("Bot: retiro elegido en la tienda → cliente conocido va directo a confirmar", async () => {
    const CarritoWeb = dbLocal.getCarritoWebModel();
    await CarritoWeb.create({
      codigo: "VM-ENTR3",
      items: [{ productoId: "fortunne-n21", nombre: 'Fortunne Mini Jumbo 6"', precio: 25, cantidad: 1 }],
      total: 25,
      entrega: { metodoId: ID_RETIRO, nombre: "Retiro en tienda", tipo: "retiro", costo: 0, aConvenir: false, latitud: null, longitud: null, direccion: "" },
      estado: "pendiente",
      creadoEn: new Date(),
      expiraEn: new Date(Date.now() + 3600 * 1000),
    });
    const tel = "584127770002";
    await orderService.setEstado(tel, { paso: "inicio", carrito: { items: [], nombre: "Luis Gómez", cedula: "V-87654321" } }, null);
    await chatFlowService._processBatch(tel, [{ from: tel, text: "VM-ENTR3", tipo: "text", io: null }]);
    await chatFlowService._processBatch(tel, [{ from: tel, text: "web_confirmar", buttonReplyId: "web_confirmar", tipo: "interactive", io: null }]);
    const estado = await orderService.getEstado(tel);
    assert.strictEqual(estado.paso, "esperando_confirmacion_datos", `paso: ${estado.paso}`);
    assert.strictEqual(estado.carrito.envio.tipo, "retiro");
  });

  await prueba("Bot: método desactivado después de pedir → avisa y lo pide como siempre", async () => {
    const data = dbLocal.read();
    data.metodosEnvio.find((m: any) => m._id === ID_DELIVERY).activo = false;
    dbLocal.write(data);
    const CarritoWeb = dbLocal.getCarritoWebModel();
    await CarritoWeb.create({
      codigo: "VM-ENTR4",
      items: [{ productoId: "fortunne-n21", nombre: 'Fortunne Mini Jumbo 6"', precio: 25, cantidad: 1 }],
      total: 25,
      entrega: { metodoId: ID_DELIVERY, nombre: "Delivery Caracas", tipo: "delivery_local", costo: 0, aConvenir: true, latitud: 10.5, longitud: -66.9, direccion: "" },
      estado: "pendiente",
      creadoEn: new Date(),
      expiraEn: new Date(Date.now() + 3600 * 1000),
    });
    const enviados: string[] = [];
    const original = chatFlow.enviarYRegistrar;
    chatFlow.enviarYRegistrar = async (to: string, opciones: any, io: any) => {
      enviados.push(opciones.texto || "");
      return original.call(chatFlow, to, opciones, io);
    };
    const tel = "584127770003";
    try {
      await chatFlowService._processBatch(tel, [{ from: tel, text: "VM-ENTR4", tipo: "text", io: null }]);
    } finally {
      chatFlow.enviarYRegistrar = original;
    }
    const estado = await orderService.getEstado(tel);
    assert.ok(!estado.carrito.envio, "sin envío cargado");
    assert.ok(enviados.some((t) => /ya no está disponible/.test(t)), "avisa al cliente");
  });

  console.log("================================================================================");
  console.log(`🎉 ${ok} pruebas de entrega en la tienda superadas.`);
  console.log("================================================================================");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ Falló la suite test-entrega-web.ts:", err);
  process.exit(1);
});
