/**
 * scripts/test-preguntas-frecuentes.ts — F2h
 * Lista única de preguntas frecuentes para el bot y la tienda web (colección FAQ).
 *
 *  - keywordsDePregunta: palabras de 5+ letras, sin tildes, sin palabras vacías, máximo 5; en la migración se
 *    descartan las del catálogo y las que comparten dos preguntas (el bot responde con cualquier coincidencia).
 *  - Migración única desde el Setting "preguntasFrecuentes": crea FAQ (estáticas, activas, en la tienda),
 *    no duplica preguntas (sin mayúsculas ni tildes), no se repite en el segundo arranque, no borra el Setting.
 *  - listarPreguntasTienda y GET /api/public/info: solo estáticas activas con mostrarEnTienda y respuesta, en orden,
 *    de la marca; las dinámicas nunca salen.
 *  - createFaq/updateFaq aceptan mostrarEnTienda; las dinámicas se guardan con false.
 *  - Los endpoints viejos /api/admin/config/preguntas-frecuentes ya no existen.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-preguntas-frecuentes.ts
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.JWT_SECRET = "x".repeat(40);

const express = require("express");
const dbLocal = require("../services/dbLocal");
const preguntasService = require("../services/preguntasFrecuentesService");
const adminController = require("../controllers/adminController");
const configAdminController = require("../controllers/configAdminController");

let superadas = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  superadas++;
  console.log(`  ✅ ${nombre}`);
}

function mockRes() {
  const out: { status: number; json: any } = { status: 200, json: null };
  const res: any = {
    status: (s: number) => { out.status = s; return res; },
    json: (d: any) => { out.json = d; return res; },
  };
  return { res, out };
}

function limpiar() {
  const data = dbLocal.read();
  data.faqs = [];
  if (data.settings) {
    delete data.settings["preguntasFrecuentes"];
    delete data.settings["preguntasFrecuentesMigradas"];
  }
  dbLocal.write(data);
}

function faqModel() {
  return dbLocal.getFAQModel();
}

function settingModel() {
  return dbLocal.getSettingModel();
}

async function todasLasFaq(): Promise<any[]> {
  return (await faqModel().find({})) || [];
}

/** App Express con el router público montado igual que en index.ts. */
function crearApp() {
  delete require.cache[require.resolve("../routes/publicRoutes")];
  delete require.cache[require.resolve("../controllers/publicController")];
  const publicRoutes = require("../routes/publicRoutes");
  const app = express();
  app.set("trust proxy", 1);
  app.use("/api/public", publicRoutes);
  return app;
}

async function conServidor(fn: (baseUrl: string) => Promise<void>) {
  const server = crearApp().listen(0);
  const port = (server.address() as any).port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function run() {
  console.log("================================================================================");
  console.log("❓ SUITE DE PRUEBAS: LISTA ÚNICA DE PREGUNTAS FRECUENTES (F2h)");
  console.log("================================================================================");

  limpiar();

  // --------------------------------------------------------------------------
  await prueba("keywordsDePregunta: 5+ letras, sin tildes, sin palabras vacías, máximo 5, sin repetir, con exclusiones", () => {
    assert.deepStrictEqual(preguntasService.keywordsDePregunta("¿Los ventiladores tienen garantía?"), ["ventiladores", "garantia"]);
    assert.deepStrictEqual(preguntasService.keywordsDePregunta("¿Cuánto tarda la entrega?"), ["tarda", "entrega"]);
    assert.deepStrictEqual(preguntasService.keywordsDePregunta("¿Entregan factura o nota de entrega?"), ["entregan", "factura", "entrega"], "\"nota\" (4 letras) aparece dentro de otras palabras");
    assert.deepStrictEqual(preguntasService.keywordsDePregunta("¿Los ventiladores tienen garantía?", ["venti"]), ["garantia"], "una raíz del catálogo se excluye");
    assert.deepStrictEqual(preguntasService.keywordsDePregunta("¿Hacen envíos a Maracaibo, Valencia, Barquisimeto y Mérida?"), ["envios", "maracaibo", "valencia", "barquisimeto", "merida"]);
    assert.deepStrictEqual(preguntasService.keywordsDePregunta("¿Y eso es?"), []);
  });

  // --------------------------------------------------------------------------
  await prueba("Migración: crea FAQ de la tienda, no duplica (sin mayúsculas ni tildes), deja el Setting y no se repite", async () => {
    // Ya existe una FAQ con la misma pregunta escrita distinta (mayúsculas y tilde): no debe duplicarse
    await faqModel().create({ pregunta: "¿CUANTO TARDA LA ENTREGA?", respuesta: "Ya existente", type: "estatica", activo: true, order: 0, brand: "default" });

    await settingModel().findOneAndUpdate(
      { key: "preguntasFrecuentes" },
      {
        key: "preguntasFrecuentes",
        value: {
          items: [
            { pregunta: "¿Los ventiladores tienen garantía?", respuesta: "Sí, 6 meses." },
            { pregunta: "¿Cuánto tarda la entrega?", respuesta: "Entre 1 y 3 días hábiles." },
            { pregunta: "¿Entregan factura o nota de entrega?", respuesta: "Entregamos nota de entrega." },
            { pregunta: "¿Tienen otra cosa?", respuesta: "" },
          ],
        },
      },
      { upsert: true },
    );

    // Un producto con "Ventilador" en el nombre: esa palabra no puede quedar como palabra clave de la garantía
    await require("../services/dbLocal").getProductoModel().create({ id: "prueba-vent", name: "Ventilador de pared 16", price: 30, activo: true });

    const creadas = await preguntasService.migrarPreguntasTienda();
    assert.strictEqual(creadas, 2, "garantía y factura; la de entrega ya existía y la vacía se descarta");

    const faqs = await todasLasFaq();
    assert.strictEqual(faqs.length, 3, "1 existente + 2 migradas");
    const garantia = faqs.find((f) => f.pregunta === "¿Los ventiladores tienen garantía?");
    assert.ok(garantia, "la FAQ de garantía existe");
    assert.strictEqual(garantia.brand, "default");
    assert.strictEqual(garantia.type, "estatica");
    assert.strictEqual(garantia.activo, true);
    assert.strictEqual(garantia.mostrarEnTienda, true);
    assert.strictEqual(garantia.respuesta, "Sí, 6 meses.");
    assert.deepStrictEqual(garantia.keywords, ["garantia"], "\"ventiladores\" está en el catálogo: respondería la garantía a cualquier consulta de productos");
    assert.strictEqual(garantia.order, 1, "después de la existente (order 0)");

    const factura = faqs.find((f) => f.pregunta === "¿Entregan factura o nota de entrega?");
    assert.deepStrictEqual(factura.keywords, ["factura"], "\"entrega\" la comparte con otra pregunta migrada");
    assert.strictEqual(factura.order, 2);

    assert.ok(await settingModel().findOne({ key: "preguntasFrecuentes" }), "el Setting viejo no se borra");
    const bandera = await settingModel().findOne({ key: "preguntasFrecuentesMigradas" });
    assert.strictEqual(bandera.value, true);

    // Segundo arranque: no hace nada
    const segunda = await preguntasService.migrarPreguntasTienda();
    assert.strictEqual(segunda, null);
    assert.strictEqual((await todasLasFaq()).length, 3, "no se duplica nada");
  });

  await prueba("Migración: sin Setting no marca nada (se reintenta al siguiente arranque)", async () => {
    const data = dbLocal.read();
    delete data.settings["preguntasFrecuentes"];
    delete data.settings["preguntasFrecuentesMigradas"];
    dbLocal.write(data);
    assert.strictEqual(await preguntasService.migrarPreguntasTienda(), null);
    assert.strictEqual(await settingModel().findOne({ key: "preguntasFrecuentesMigradas" }), null);
  });

  // --------------------------------------------------------------------------
  // Lista para la tienda: solo estáticas activas con mostrarEnTienda y respuesta, en orden, de la marca
  limpiar();
  await faqModel().create({ pregunta: "Pregunta C tercera", respuesta: "C", type: "estatica", activo: true, mostrarEnTienda: true, order: 9, brand: "default" });
  await faqModel().create({ pregunta: "Pregunta A primera", respuesta: "A", type: "estatica", activo: true, mostrarEnTienda: true, order: 1, brand: "default" });
  await faqModel().create({ pregunta: "Pregunta B dinámica", respuesta: "", type: "dinamica", dynamicKey: "sabores", activo: true, mostrarEnTienda: true, order: 2, brand: "default" });
  await faqModel().create({ pregunta: "Pregunta D sin marcar", respuesta: "D", type: "estatica", activo: true, mostrarEnTienda: false, order: 3, brand: "default" });
  await faqModel().create({ pregunta: "Pregunta E inactiva", respuesta: "E", type: "estatica", activo: false, mostrarEnTienda: true, order: 4, brand: "default" });
  await faqModel().create({ pregunta: "Pregunta F sin respuesta", respuesta: "", type: "estatica", activo: true, mostrarEnTienda: true, order: 5, brand: "default" });
  await faqModel().create({ pregunta: "Pregunta G otra marca", respuesta: "G", type: "estatica", activo: true, mostrarEnTienda: true, order: 6, brand: "otra" });

  await prueba("listarPreguntasTienda: solo estáticas activas marcadas con respuesta, en orden y de la marca", async () => {
    const lista = await preguntasService.listarPreguntasTienda();
    assert.deepStrictEqual(lista, [
      { pregunta: "Pregunta A primera", respuesta: "A" },
      { pregunta: "Pregunta C tercera", respuesta: "C" },
    ]);
  });

  await prueba("GET /api/public/info trae la misma lista en 'preguntas' y sigue sin datos de cuenta", async () => {
    await conServidor(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/public/info`);
      assert.strictEqual(res.status, 200);
      const json: any = await res.json();
      assert.deepStrictEqual(Object.keys(json), ["preguntas", "pagos", "envios", "horario", "banner"]);
      assert.deepStrictEqual(json.preguntas, [
        { pregunta: "Pregunta A primera", respuesta: "A" },
        { pregunta: "Pregunta C tercera", respuesta: "C" },
      ]);
    });
  });

  // --------------------------------------------------------------------------
  await prueba("createFaq: mostrarEnTienda se guarda en estáticas y se fuerza a false en dinámicas", async () => {
    const { res, out } = mockRes();
    await adminController.createFaq({ body: { pregunta: "¿Hacen retiro?", respuesta: "Sí, en Catia.", type: "estatica", mostrarEnTienda: true } } as any, res);
    assert.strictEqual(out.status, 201, JSON.stringify(out.json));
    assert.strictEqual(out.json.data.mostrarEnTienda, true);

    const r2 = mockRes();
    await adminController.createFaq({ body: { pregunta: "¿Qué sabores hay?", type: "dinamica", mostrarEnTienda: true } } as any, r2.res);
    assert.strictEqual(r2.out.status, 201, JSON.stringify(r2.out.json));
    assert.strictEqual(r2.out.json.data.mostrarEnTienda, false);
  });

  await prueba("updateFaq: cambiar a dinámica quita la marca; mostrarEnTienda se puede cambiar en estáticas", async () => {
    const creada = await faqModel().create({ pregunta: "¿Hay garantía de fábrica?", respuesta: "Sí.", type: "estatica", mostrarEnTienda: true, order: 7, brand: "default" });
    const id = String(creada._id);

    const r1 = mockRes();
    await adminController.updateFaq({ params: { id }, body: { mostrarEnTienda: false } } as any, r1.res);
    assert.strictEqual(r1.out.json.data.mostrarEnTienda, false);

    const r2 = mockRes();
    await adminController.updateFaq({ params: { id }, body: { type: "dinamica", dynamicKey: "sabores" } } as any, r2.res);
    assert.strictEqual(r2.out.json.data.type, "dinamica");
    assert.strictEqual(r2.out.json.data.mostrarEnTienda, false);
  });

  // --------------------------------------------------------------------------
  await prueba("Los endpoints viejos /api/admin/config/preguntas-frecuentes ya no existen", () => {
    const crearRouter = require("../routes/adminRoutes");
    const io: any = { on() {}, emit() {}, to() { return io; }, use() {} };
    const router = crearRouter(io);
    const rutas = (router.stack || [])
      .filter((layer: any) => layer.route)
      .map((layer: any) => layer.route.path);
    assert.ok(!rutas.includes("/config/preguntas-frecuentes"), "la ruta vieja no debe existir");
    assert.ok(rutas.includes("/faqs"), "la lista única de FAQ sigue en el panel");
    assert.strictEqual(typeof (configAdminController as any).getPreguntasFrecuentesConfig, "undefined");
    assert.strictEqual(typeof (configAdminController as any).updatePreguntasFrecuentesConfig, "undefined");
  });

  limpiar();

  console.log("================================================================================");
  console.log(`🎉 ${superadas} pruebas de la lista única de preguntas frecuentes superadas.`);
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("❌ Falló la suite de preguntas frecuentes:", err);
  process.exit(1);
});
