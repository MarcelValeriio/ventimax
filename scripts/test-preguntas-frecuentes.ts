/**
 * scripts/test-preguntas-frecuentes.ts — F2b
 * Preguntas frecuentes de la tienda editables desde el panel y datos públicos (/api/public/info).
 *
 *  - Validador: máximo 12, longitudes (pregunta 3-120, respuesta 0-600), repetidas sin distinguir
 *    mayúsculas, claves extra descartadas, respuesta vacía permitida.
 *  - Sin nada guardado se usan las preguntas de la marca (respuesta vacía).
 *  - GET/PUT /api/admin/config/preguntas-frecuentes: 400 con el motivo, auditoría, solo config:manage.
 *  - GET /api/public/info: lista blanca (sin _id ni datos de cuenta), preguntas vacías ocultas,
 *    retiro con dirección y horario (o horario de atención), a convenir con costo null y Cache-Control.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-preguntas-frecuentes.ts
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.JWT_SECRET = "x".repeat(40);

const express = require("express");
const fs = require("node:fs");
const path = require("node:path");
const dbLocal = require("../services/dbLocal");
const { validarPreguntasFrecuentes } = require("../services/configValidators");
const preguntasService = require("../services/preguntasFrecuentesService");
const { getPreguntasFrecuentesConfig, updatePreguntasFrecuentesConfig } = require("../controllers/configAdminController");
const { authorize } = require("../middlewares/auth");
const PERMISSIONS = require("../data/permissions");
const { formatearHorarioAtencion } = require("../services/horarioService");

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

function limpiarSetting(key: string) {
  const data = dbLocal.read();
  if (data.settings) {
    delete data.settings[key];
    dbLocal.write(data);
  }
}

/** App Express con el router público montado igual que en index.ts (trust proxy 1). */
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

const SECRETO_CUENTA = "0102-SECRETO-99887766";
const SECRETO_CORREO = "pagos-privados@ejemplo.test";

async function run() {
  console.log("================================================================================");
  console.log("❓ SUITE DE PRUEBAS: PREGUNTAS FRECUENTES DE LA TIENDA (F2b)");
  console.log("================================================================================");

  limpiarSetting("preguntasFrecuentes");
  preguntasService.invalidatePreguntasFrecuentesCache();

  // --------------------------------------------------------------------------
  await prueba("Validador: rechaza más de 12, longitudes, repetidas y formatos incorrectos", () => {
    const pregunta = (texto: string, respuesta = "") => ({ pregunta: texto, respuesta });
    const doce = Array.from({ length: 12 }, (_, i) => pregunta(`Pregunta número ${i + 1}`));
    assert.strictEqual(validarPreguntasFrecuentes({ items: doce }).ok, true, "12 preguntas deben ser válidas");

    const trece = [...doce, pregunta("Pregunta número 13")];
    const malos: any[] = [
      null,
      [],
      { items: "no es lista" },
      { items: trece },
      { items: [pregunta("ab")] },
      { items: [pregunta("x".repeat(121))] },
      { items: [pregunta("¿Hay garantía?", "x".repeat(601))] },
      { items: [pregunta("¿Hay garantía?"), pregunta("¿HAY GARANTÍA?".toLowerCase())] },
      { items: [pregunta("¿Hay garantía?"), pregunta("  ¿hay garantía?  ")] },
      { items: [123] },
      { items: [{ pregunta: 55, respuesta: "" }] },
      { items: [{ pregunta: "¿Cuánto tarda?", respuesta: 7 }] },
    ];
    for (const m of malos) {
      assert.strictEqual(validarPreguntasFrecuentes(m).ok, false, `debería rechazar ${JSON.stringify(m)}`);
    }
  });

  await prueba("Validador: descarta claves extra, recorta espacios y permite respuesta vacía", () => {
    const r = validarPreguntasFrecuentes({
      items: [
        { pregunta: "  ¿Entregan factura?  ", respuesta: " Sí, nota de entrega. ", _id: "abc", extra: 1 },
        { pregunta: "¿Hay garantía?", respuesta: "" },
      ],
    });
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(Object.keys(r.value.items[0]).sort(), ["pregunta", "respuesta"]);
    assert.strictEqual(r.value.items[0].pregunta, "¿Entregan factura?");
    assert.strictEqual(r.value.items[0].respuesta, "Sí, nota de entrega.");
    assert.strictEqual(r.value.items[1].respuesta, "");
  });

  await prueba("Sin nada guardado se usan las 3 preguntas de la marca, con respuesta vacía", async () => {
    const pf = await preguntasService.getPreguntasFrecuentes();
    assert.deepStrictEqual(
      pf.items.map((i: any) => i.pregunta),
      ["¿Los ventiladores tienen garantía?", "¿Cuánto tarda la entrega?", "¿Entregan factura o nota de entrega?"],
    );
    assert.ok(pf.items.every((i: any) => i.respuesta === ""));
  });

  await prueba("GET /api/admin/config/preguntas-frecuentes devuelve la lista", async () => {
    const { res, out } = mockRes();
    await getPreguntasFrecuentesConfig({} as any, res);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.json.success, true);
    assert.strictEqual(out.json.preguntas.items.length, 3);
  });

  await prueba("PUT inválido devuelve 400 con el motivo y no guarda", async () => {
    const antes = preguntasService.getPreguntasFrecuentesSync().items.length;
    const { res, out } = mockRes();
    await updatePreguntasFrecuentesConfig({
      body: { items: [{ pregunta: "¿Hay garantía?" }, { pregunta: "¿hay GARANTÍA?" }] },
      user: { user: "admin", role: "admin" },
    } as any, res);
    assert.strictEqual(out.status, 400);
    assert.ok(String(out.json.error).includes("repetida"), out.json.error);
    assert.strictEqual(preguntasService.getPreguntasFrecuentesSync().items.length, antes);
  });

  await prueba("PUT válido guarda, registra auditoría y se lee sin reiniciar", async () => {
    const Auditoria = dbLocal.getAuditoriaModel();
    const antes = (await Auditoria.find({ recursoId: "preguntasFrecuentes" })).length;
    const { res, out } = mockRes();
    await updatePreguntasFrecuentesConfig({
      body: {
        items: [
          { pregunta: "¿Los ventiladores tienen garantía?", respuesta: "Sí, 6 meses por defecto de fábrica." },
          { pregunta: "¿Cuánto tarda la entrega?", respuesta: "" },
        ],
      },
      user: { user: "admin", role: "admin" },
    } as any, res);
    assert.strictEqual(out.status, 200, JSON.stringify(out.json));
    assert.strictEqual(out.json.preguntas.items.length, 2);
    const despues = (await Auditoria.find({ recursoId: "preguntasFrecuentes" })).length;
    assert.strictEqual(despues, antes + 1, "debe quedar una entrada de auditoría");
    assert.strictEqual(preguntasService.getPreguntasFrecuentesSync().items[0].respuesta, "Sí, 6 meses por defecto de fábrica.");
  });

  await prueba("Solo config:manage puede leer o cambiar las preguntas", () => {
    const probar = (user: any) => {
      let status = 200;
      let siguio = false;
      const res: any = { status: (s: number) => { status = s; return res; }, json: () => res };
      authorize(["config:manage"])({ user } as any, res, () => { siguio = true; });
      return { status, siguio };
    };
    const conRol = (role: string) => ({ user: role, role, permissions: PERMISSIONS[role] });
    assert.strictEqual(probar(conRol("admin")).siguio, true);
    assert.strictEqual(probar(conRol("cajero")).status, 403);
    assert.strictEqual(probar(conRol("repartidor")).status, 403);
    assert.strictEqual(probar(undefined).status, 401);

    const rutas = fs.readFileSync(path.join(__dirname, "../routes/adminRoutes.ts"), "utf8");
    assert.ok(rutas.includes('"/config/preguntas-frecuentes"'), "la ruta debe existir en adminRoutes");
    const bloque = rutas.slice(rutas.indexOf('"/config/preguntas-frecuentes"'), rutas.indexOf('"/config/preguntas-frecuentes"') + 400);
    assert.ok(bloque.includes('authorize(["config:manage"])'), "las dos rutas deben exigir config:manage");
  });

  // --------------------------------------------------------------------------
  // Datos para /api/public/info
  // --------------------------------------------------------------------------
  const data = dbLocal.read();
  data.metodosPago = [
    { _id: "pago-1", tipo: "transferencia", nombre: "Transferencia", detalles: { cuenta: SECRETO_CUENTA, correo: SECRETO_CORREO }, notaAdicional: "", activo: true },
    { _id: "pago-2", tipo: "pago_movil", nombre: "Pago Móvil", detalles: { telefono: "0414-0000000", cedula: "V-1" }, notaAdicional: "", activo: true },
    { _id: "pago-3", tipo: "zelle", nombre: "Zelle (inactivo)", detalles: { correo: SECRETO_CORREO }, notaAdicional: "", activo: false },
  ];
  data.metodosEnvio = [
    { _id: "env-1", nombre: "Delivery Caracas", tipo: "delivery_local", descripcion: "El costo depende de la zona", costoTipo: "a_convenir", costo: 0, pideDatos: "", direccion: "", horario: "", activo: true, orden: 1, createdAt: new Date(1) },
    { _id: "env-2", nombre: "Envío nacional", tipo: "envio_nacional", descripcion: "Por agencia", costoTipo: "fijo", costo: 5, pideDatos: "", direccion: "", horario: "", activo: true, orden: 2, createdAt: new Date(2) },
    { _id: "env-3", nombre: "Retiro en Catia", tipo: "retiro", descripcion: "En persona", costoTipo: "fijo", costo: 0, pideDatos: "", direccion: "Av. Sucre de Catia", horario: "", activo: true, orden: 3, createdAt: new Date(3) },
    { _id: "env-4", nombre: "Retiro con horario", tipo: "retiro", descripcion: "", costoTipo: "fijo", costo: 0, pideDatos: "", direccion: "Punto alterno", horario: "Sábados de 10 am a 2 pm", activo: true, orden: 4, createdAt: new Date(4) },
    { _id: "env-5", nombre: "Otro desactivado", tipo: "otro", descripcion: "", costoTipo: "fijo", costo: 9, pideDatos: "", direccion: "", horario: "", activo: false, orden: 0, createdAt: new Date(0) },
  ];
  dbLocal.write(data);

  await preguntasService.setPreguntasFrecuentes({
    items: [
      { pregunta: "¿Los ventiladores tienen garantía?", respuesta: "Sí, 6 meses." },
      { pregunta: "¿Cuánto tarda la entrega?", respuesta: "" },
      { pregunta: "¿Entregan factura o nota de entrega?", respuesta: "Entregamos nota de entrega." },
    ],
  });

  await conServidor(async (baseUrl) => {
    await prueba("GET /api/public/info: cabecera Cache-Control y lista blanca exacta", async () => {
      const res = await fetch(`${baseUrl}/api/public/info`);
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("cache-control"), "public, max-age=300");
      const json = await res.json();
      assert.deepStrictEqual(Object.keys(json), ["preguntas", "pagos", "envios", "horario"]);
    });

    await prueba("Preguntas: solo las que tienen respuesta, en orden", async () => {
      const json = await (await fetch(`${baseUrl}/api/public/info`)).json();
      assert.deepStrictEqual(json.preguntas, [
        { pregunta: "¿Los ventiladores tienen garantía?", respuesta: "Sí, 6 meses." },
        { pregunta: "¿Entregan factura o nota de entrega?", respuesta: "Entregamos nota de entrega." },
      ]);
    });

    await prueba("Pagos: solo nombres de métodos activos, sin cuentas, cédulas ni correos", async () => {
      const json = await (await fetch(`${baseUrl}/api/public/info`)).json();
      assert.deepStrictEqual(json.pagos, ["Transferencia", "Pago Móvil"]);
      const texto = JSON.stringify(json);
      assert.ok(!texto.includes(SECRETO_CUENTA), "no debe salir el número de cuenta");
      assert.ok(!texto.includes(SECRETO_CORREO), "no debe salir el correo de cobro");
      assert.ok(!texto.includes("0414-0000000"), "no debe salir el teléfono de Pago Móvil");
      assert.ok(!texto.includes("cedula") && !texto.includes("V-1"), "no debe salir la cédula");
    });

    await prueba("Envíos: activos por orden, a convenir con costo null, fijo con costo, sin _id", async () => {
      const json = await (await fetch(`${baseUrl}/api/public/info`)).json();
      assert.strictEqual(json.envios.length, 4, "el método desactivado no sale");
      assert.deepStrictEqual(json.envios.map((m: any) => m.nombre), ["Delivery Caracas", "Envío nacional", "Retiro en Catia", "Retiro con horario"]);
      for (const m of json.envios) {
        // id: para que la tienda envíe el método elegido (F2c, el servidor lo revalida); pideDatos: etiqueta del campo
        assert.deepStrictEqual(Object.keys(m).sort(), ["aConvenir", "cobroADestino", "costo", "descripcion", "direccion", "empresas", "horario", "id", "nombre", "pideDatos", "tipo"].sort());
      }
      const delivery = json.envios[0];
      assert.strictEqual(delivery.aConvenir, true);
      assert.strictEqual(delivery.costo, null);
      assert.strictEqual(delivery.direccion, null, "solo los retiros tienen dirección");
      assert.strictEqual(delivery.horario, null);
      const nacional = json.envios[1];
      assert.strictEqual(nacional.aConvenir, false);
      assert.strictEqual(nacional.costo, 5);
      assert.ok(!JSON.stringify(json).includes('"_id"'), "sin _id");
    });

    await prueba("Retiro: dirección del punto; horario vacío usa el de atención; horario propio se muestra", async () => {
      const json = await (await fetch(`${baseUrl}/api/public/info`)).json();
      const horarioAtencion = formatearHorarioAtencion();
      assert.strictEqual(horarioAtencion, "Lunes a Viernes de 9:00 am a 5:00 pm");
      assert.strictEqual(json.envios[2].direccion, "Av. Sucre de Catia");
      assert.strictEqual(json.envios[2].horario, horarioAtencion);
      assert.strictEqual(json.envios[3].horario, "Sábados de 10 am a 2 pm");
      assert.strictEqual(json.horario, horarioAtencion);
    });
  });

  await prueba("Sin preguntas con respuesta, la lista pública queda vacía", async () => {
    await preguntasService.setPreguntasFrecuentes({ items: [{ pregunta: "¿Hay garantía?", respuesta: "" }] });
    await conServidor(async (baseUrl) => {
      const json = await (await fetch(`${baseUrl}/api/public/info`)).json();
      assert.deepStrictEqual(json.preguntas, []);
    });
  });

  // Dejar la base de prueba como estaba
  limpiarSetting("preguntasFrecuentes");
  preguntasService.invalidatePreguntasFrecuentesCache();

  console.log("================================================================================");
  console.log(`🎉 ${superadas} pruebas de preguntas frecuentes superadas.`);
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("❌ Falló la suite de preguntas frecuentes:", err);
  process.exit(1);
});
