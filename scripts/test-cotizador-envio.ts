/**
 * scripts/test-cotizador-envio.ts
 *
 * Suite de F1-8: cotizador de envío nacional (MRW por tabla diaria, Zoom en vivo) con estimado en el carrito.
 * Sin red real: se mockean axios.get/axios.post. Todos los envíos son cobro a destino y retiro en agencia.
 * Uso: NODE_ENV=test BRAND_NAME=ventimax npx tsx scripts/test-cotizador-envio.ts
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import axios from "axios";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.JWT_SECRET = "x".repeat(40);

const raiz = path.join(__dirname, "..");
const leer = (rel: string) => fs.readFileSync(path.join(raiz, rel), "utf8");

const dbLocal = require("../services/dbLocal");
const cot = require("../services/cotizadorEnvio");
const empresas = require("../services/empresasEnvio");
const ctrl = require("../controllers/publicController");
const cotCtrl = require("../controllers/cotizadorController");
const shipping = require("../controllers/shippingController");
const bcv = require("../services/bcv");
const PERMISSIONS = require("../data/permissions");

function mockRes() {
  const out: any = { status: 200, json: null, headers: {} };
  const res: any = {
    status: (s: number) => ((out.status = s), res),
    json: (d: any) => ((out.json = d), res),
    setHeader: (k: string, v: string) => ((out.headers[k] = v), res),
  };
  return { res, out };
}

let n = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  console.log(`  ✅ ${nombre}`);
}

// --- Mocks de red ------------------------------------------------------------------------------------------
const originalGet = axios.get;
const originalPost = axios.post;
let llamadasGet: string[] = [];
let llamadasPost: any[] = [];
let fallarMrwEn: number | null = null; // kg en el que MRW falla (null = no falla)
let zoomTotal = "22.150,58";
let zoomFalla = false;

function instalarMocks() {
  (axios as any).post = async (url: string, body: any) => {
    llamadasPost.push({ url, body });
    if (url !== "https://mrwve.com/api/calculo-envio") throw new Error("URL inesperada");
    if (fallarMrwEn !== null && body.peso === fallarMrwEn) throw new Error("timeout simulado");
    return { data: { Pago_en_Origen: 1000 + body.peso * 100, Cantidad_de_Cupones: 1, Tipo_de_envio: "Retiro" } };
  };
  (axios as any).get = async (url: string) => {
    llamadasGet.push(url);
    if (zoomFalla) throw new Error("red caída simulada");
    if (url.includes("/getCiudades")) {
      return {
        data: [
          { codciudad: 101, nombre_ciudad: "Caracas", nombre_estado: "Distrito Capital" },
          { codciudad: 202, nombre_ciudad: "Maracaibo", nombre_estado: "Zulia" },
          { codciudad: 303, nombre_ciudad: "San Cristóbal", nombre_estado: "Táchira" },
        ],
      };
    }
    if (url.includes("/CalcularTarifa")) {
      return { data: { entidadRespuesta: { total: zoomTotal, tasa: 36 } } };
    }
    throw new Error("URL inesperada " + url);
  };
}
function restaurarMocks() {
  (axios as any).get = originalGet;
  (axios as any).post = originalPost;
}
function resetMocks() {
  llamadasGet = [];
  llamadasPost = [];
  fallarMrwEn = null;
  zoomTotal = "22.150,58";
  zoomFalla = false;
}

const sinEsperas = async () => {};

function sembrarBase() {
  const data = dbLocal.read();
  data.metodosEnvio = [
    {
      _id: "t-f18-metodo-nacional",
      id: "t-f18-metodo-nacional",
      nombre: "Envío nacional",
      tipo: "envio_nacional",
      costoTipo: "a_convenir",
      costo: 0,
      cobroADestino: true,
      activo: true,
      orden: 1,
      empresas: [
        { nombre: "MRW", cotizador: "mrw" },
        { nombre: "Zoom", cotizador: "zoom", slug: "zoom" },
        { nombre: "Tealca" },
      ],
    },
    {
      _id: "t-f18-metodo-sin-cobro",
      id: "t-f18-metodo-sin-cobro",
      nombre: "Envío sin cobro a destino",
      tipo: "envio_nacional",
      costoTipo: "a_convenir",
      costo: 0,
      cobroADestino: false,
      activo: true,
      orden: 2,
      empresas: [{ nombre: "MRW", cotizador: "mrw" }],
    },
  ];
  data.productos = [
    { _id: "t-f18-p1", id: "t-f18-p1", name: "Ventilador A", price: 25, descuentoPct: 0, activo: true, pesoKg: 1.2, trackStock: false, stock: 0, imagenes: [], categorias: [] },
    { _id: "t-f18-p2", id: "t-f18-p2", name: "Ventilador B", price: 40, descuentoPct: 0, activo: true, pesoKg: 2.5, trackStock: false, stock: 0, imagenes: [], categorias: [] },
    { _id: "t-f18-p3", id: "t-f18-p3", name: "Pieza sin peso", price: 10, descuentoPct: 0, activo: true, pesoKg: null, trackStock: false, stock: 0, imagenes: [], categorias: [] },
  ];
  data.sucursales = [
    { _id: "t-f18-s1", empresa: "zoom", codigo: "1234", nombre: "Zoom Maracaibo", ciudad: "Maracaibo", estado: "Zulia", activa: true },
  ];
  dbLocal.write(data);
}

function precargarTablaMrw(retiroBase = 1000) {
  cot._resetParaPruebas();
  const retiro: Record<string, number> = {};
  for (let kg = 1; kg <= 80; kg++) retiro[String(kg)] = retiroBase + kg * 100;
  dbLocal.read();
  const data = dbLocal.read();
  data.settings = data.settings || {};
  data.settings.cotizadorMrw = { fecha: "2026-11-03", actualizadaEn: Date.now(), retiro };
  dbLocal.write(data);
  return retiro;
}

async function runTests() {
  console.log("================================================================================");
  console.log("🚚 SUITE DE PRUEBAS: COTIZADOR DE ENVÍO NACIONAL (F1-8)");
  console.log("================================================================================");
  instalarMocks();
  sembrarBase();

  console.log("\n1. Funciones puras");
  await prueba("parsearBs: formato venezolano, punto decimal, y valores inválidos", () => {
    assert.strictEqual(cot.parsearBs("22.150,58"), 22150.58);
    assert.strictEqual(cot.parsearBs("22150.58"), 22150.58);
    assert.strictEqual(cot.parsearBs(1234.5), 1234.5);
    assert.strictEqual(cot.parsearBs("0"), null);
    assert.strictEqual(cot.parsearBs(""), null);
    assert.strictEqual(cot.parsearBs("abc"), null);
    assert.strictEqual(cot.parsearBs(null), null);
    assert.strictEqual(cot.parsearBs(-5), null);
  });

  await prueba("pesoPedido suma pesoKg × cantidad", () => {
    const r = cot.pesoPedido([
      { pesoKg: 1.2, cantidad: 2 },
      { pesoKg: 2.5, cantidad: 1 },
    ]);
    assert.deepStrictEqual(r, { ok: true, kg: 4.9 });
  });

  await prueba("pesoPedido: un producto sin peso → sin estimado", () => {
    assert.deepStrictEqual(cot.pesoPedido([{ pesoKg: 1, cantidad: 1 }, { pesoKg: null, cantidad: 1 }]), { ok: false });
    assert.deepStrictEqual(cot.pesoPedido([{ pesoKg: 0, cantidad: 1 }]), { ok: false });
  });

  await prueba("redondeo de kg hacia arriba para la tabla de MRW", () => {
    assert.strictEqual(cot.kgRedondeoArriba(0.2), 1);
    assert.strictEqual(cot.kgRedondeoArriba(1), 1);
    assert.strictEqual(cot.kgRedondeoArriba(1.001), 2);
    assert.strictEqual(cot.kgRedondeoArriba(4.9), 5);
    assert.strictEqual(cot.kgRedondeoArriba(80), 80);
  });

  await prueba("Bs → USD con la tasa, dos decimales", () => {
    assert.strictEqual(cot.bsAUsd(3600, 36), 100);
    assert.strictEqual(cot.bsAUsd(1000, 36), 27.78);
  });

  await prueba("URL de Zoom: siempre retiro en oficina (modalidad_tarifa=1), sin domicilio", () => {
    const url: string = cot.urlTarifaZoom({ ciudadOrigen: "101", ciudadDestino: "202", oficina: "1234", kg: 3, montoBs: 500 });
    const q = new URL(url).searchParams;
    assert.strictEqual(q.get("modalidad_tarifa"), "1");
    assert.strictEqual(q.get("ciudad_remitente"), "101");
    assert.strictEqual(q.get("ciudad_destinatario"), "202");
    assert.strictEqual(q.get("oficina_retirar"), "1234");
    assert.strictEqual(q.get("peso"), "3");
    assert.strictEqual(q.get("valor_declarado"), "0");
    assert.ok(!url.includes("modalidad=2") && !url.includes("modalidad_tarifa=2"));
  });

  await prueba("ciudades de Zoom: búsqueda sin acentos ni mayúsculas, y lista desde entidadRespuesta", () => {
    const lista = cot.extraerListaZoom({ entidadRespuesta: [{ codciudad: 9, nombre_ciudad: "San Cristóbal" }] });
    assert.strictEqual(cot.buscarCiudadZoom(lista, "SAN CRISTOBAL"), "9");
    assert.strictEqual(cot.buscarCiudadZoom(lista, "Mérida"), null);
    assert.deepStrictEqual(cot.extraerListaZoom({ otra: 1 }), []);
  });

  await prueba("tabla diaria de MRW: corre 60 min antes de la apertura, un día laborable, una vez", () => {
    const lunes = new Date("2026-11-02T12:30:00Z"); // 08:30 en Caracas, apertura 09:00
    const lunesAntes = new Date("2026-11-02T11:00:00Z"); // 07:00
    const sabado = new Date("2026-11-07T12:30:00Z");
    const base = { apertura: "09:00", esNoLaborable: false, tablaFecha: null, ultimoIntento: null };
    assert.strictEqual(cot.debeActualizarMrw({ ...base, ahora: lunes }), true);
    assert.strictEqual(cot.debeActualizarMrw({ ...base, ahora: lunesAntes }), false);
    assert.strictEqual(cot.debeActualizarMrw({ ...base, ahora: lunes, esNoLaborable: true }), false);
    assert.strictEqual(cot.debeActualizarMrw({ ...base, ahora: sabado, esNoLaborable: true }), false);
    assert.strictEqual(cot.debeActualizarMrw({ ...base, ahora: lunes, tablaFecha: "2026-11-02" }), false);
    assert.strictEqual(cot.debeActualizarMrw({ ...base, ahora: lunes, ultimoIntento: lunes.getTime() - 10 * 60 * 1000 }), false);
    assert.strictEqual(cot.tablaVieja(null, Date.now()), true);
    assert.strictEqual(cot.tablaVieja({ fecha: "x", actualizadaEn: Date.now() - 25 * 3600 * 1000, retiro: {} }, Date.now()), true);
  });

  console.log("\n2. MRW: tabla diaria");
  await prueba("actualiza 80 kg en MRW solo retiro, espaciado, y guarda la tabla en Setting", async () => {
    resetMocks();
    cot._resetParaPruebas();
    const r = await cot.actualizarTablaMrw({ espera: sinEsperas });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(llamadasPost.length, 80);
    assert.ok(llamadasPost.every((l) => l.body.retiro === 0), "todas las consultas son de retiro");
    assert.strictEqual(llamadasPost[0].body.peso, 1);
    assert.strictEqual(llamadasPost[79].body.peso, 80);
    const guardada = dbLocal.read().settings.cotizadorMrw;
    assert.ok(guardada && Object.keys(guardada.retiro).length === 80);
    assert.strictEqual(guardada.retiro["1"], 1100);
  });

  await prueba("estimado MRW: el peso se redondea hacia arriba y sale de la tabla", async () => {
    const r = await cot.cotizarEnvio({ cotizador: "mrw", kg: 2.1 });
    assert.strictEqual(r.montoBs, 1300); // 3 kg
    assert.ok(r.fecha);
    assert.strictEqual(await cot.cotizarEnvio({ cotizador: "mrw", kg: 81 }), null);
  });

  await prueba("fallo de MRW a mitad: no se guarda nada, queda la última tabla buena y se registra el error", async () => {
    cot._resetParaPruebas();
    await cot.cargarTablaMrw();
    const anterior = cot.getTablaMrw().retiro["5"];
    resetMocks();
    fallarMrwEn = 50;
    const r = await cot.actualizarTablaMrw({ espera: sinEsperas });
    assert.strictEqual(r.ok, false);
    assert.ok(cot.getUltimoErrorMrw());
    assert.strictEqual(cot.getTablaMrw().retiro["5"], anterior);
    const r2 = await cot.cotizarEnvio({ cotizador: "mrw", kg: 5 });
    assert.strictEqual(r2.montoBs, anterior);
  });

  await prueba("sin tabla de MRW no hay estimado (sin lanzar)", async () => {
    cot._resetParaPruebas();
    const data = dbLocal.read();
    delete data.settings.cotizadorMrw;
    dbLocal.write(data);
    assert.strictEqual(await cot.cotizarEnvio({ cotizador: "mrw", kg: 1 }), null);
  });

  await prueba("job MRW sin empresas MRW configuradas no llama a la red", async () => {
    resetMocks();
    cot._resetParaPruebas();
    const data = dbLocal.read();
    const guardados = data.metodosEnvio;
    data.metodosEnvio = [{ _id: "t-sin-mrw", id: "t-sin-mrw", nombre: "X", tipo: "envio_nacional", activo: true, cobroADestino: true, empresas: [{ nombre: "Zoom", cotizador: "zoom" }] }];
    dbLocal.write(data);
    await cot.ejecutarJobMrw(new Date("2026-11-02T12:30:00Z"));
    assert.strictEqual(llamadasPost.length, 0);
    const d2 = dbLocal.read();
    d2.metodosEnvio = guardados;
    dbLocal.write(d2);
  });

  console.log("\n3. Zoom: tarifa al momento");
  await prueba("Zoom: ciudad del mapa de la marca y de la sucursal, tarifa en Bs convertida", async () => {
    resetMocks();
    cot._resetParaPruebas();
    const r = await cot.cotizarEnvio({ cotizador: "zoom", kg: 2.5, ciudadDestino: "Maracaibo", oficina: "1234", montoMercanciaBs: 1000 });
    assert.strictEqual(r.montoBs, 22150.58);
    const tarifa = llamadasGet.find((u) => u.includes("CalcularTarifa"));
    assert.ok(tarifa, "llama a CalcularTarifa");
    const q = new URL(tarifa!).searchParams;
    assert.strictEqual(q.get("ciudad_destinatario"), "202");
    assert.strictEqual(q.get("modalidad_tarifa"), "1");
    assert.strictEqual(q.get("oficina_retirar"), "1234");
    assert.strictEqual(q.get("peso"), "2.5");
  });

  await prueba("Zoom: caché del día (misma ciudad, kg y oficina no vuelve a consultar la tarifa)", async () => {
    const antes = llamadasGet.filter((u) => u.includes("CalcularTarifa")).length;
    await cot.cotizarEnvio({ cotizador: "zoom", kg: 2.5, ciudadDestino: "Maracaibo", oficina: "1234", montoMercanciaBs: 1000 });
    assert.strictEqual(llamadasGet.filter((u) => u.includes("CalcularTarifa")).length, antes);
  });

  await prueba("Zoom: ciudad no encontrada, o fallo de red → null sin lanzar", async () => {
    assert.strictEqual(await cot.cotizarEnvio({ cotizador: "zoom", kg: 1, ciudadDestino: "Ciudad Inexistente", oficina: "", montoMercanciaBs: 10 }), null);
    cot._resetParaPruebas();
    zoomFalla = true;
    assert.strictEqual(await cot.cotizarEnvio({ cotizador: "zoom", kg: 1, ciudadDestino: "Maracaibo", oficina: "", montoMercanciaBs: 10 }), null);
    zoomFalla = false;
  });

  await prueba("cotizador 'ninguno' o desconocido → null", async () => {
    assert.strictEqual(await cot.cotizarEnvio({ cotizador: "ninguno", kg: 1 }), null);
    assert.strictEqual(await cot.cotizarEnvio({ cotizador: "tealca", kg: 1 }), null);
  });

  console.log("\n4. Panel: campo cotizador por empresa");
  await prueba("normalizarEmpresas conserva cotizador válido y descarta 'ninguno' o desconocido", () => {
    const r = empresas.normalizarEmpresas([
      { nombre: "MRW", cotizador: "mrw" },
      { nombre: "Zoom", cotizador: "ZOOM" },
      { nombre: "Otra", cotizador: "ninguno" },
      { nombre: "Rara", cotizador: "fedex" },
    ]);
    assert.strictEqual(r[0].cotizador, "mrw");
    assert.strictEqual(r[1].cotizador, "zoom");
    assert.strictEqual(r[2].cotizador, undefined);
    assert.strictEqual(r[3].cotizador, undefined);
  });

  await prueba("crear método: cotizador inválido → 400; con cotizador sin config:manage → 403", async () => {
    const usuarioSinConfig = { user: "op", role: "operador", permissions: ["shipping_method:create"] };
    const usuarioConfig = { user: "adm", role: "admin", permissions: PERMISSIONS["admin"] };
    const base = { nombre: "Nuevo envío", tipo: "envio_nacional", costoTipo: "a_convenir", cobroADestino: true };

    const a = mockRes();
    await shipping.createShippingMethod({ user: usuarioSinConfig, body: { ...base, empresas: [{ nombre: "MRW", cotizador: "fedex" }] } }, a.res);
    assert.strictEqual(a.out.status, 400);

    const b = mockRes();
    await shipping.createShippingMethod({ user: usuarioSinConfig, body: { ...base, empresas: [{ nombre: "MRW", cotizador: "mrw" }] } }, b.res);
    assert.strictEqual(b.out.status, 403);

    const c = mockRes();
    await shipping.createShippingMethod({ user: usuarioConfig, body: { ...base, empresas: [{ nombre: "MRW", cotizador: "mrw" }] } }, c.res);
    assert.strictEqual(c.out.status, 201);
    assert.strictEqual(c.out.json.data.empresas[0].cotizador, "mrw");
  });

  await prueba("editar: cambiar un cotizador sin config:manage → 403; sin tocarlo, se permite", async () => {
    const data = dbLocal.read();
    const metodo = data.metodosEnvio.find((m: any) => m.id === "t-f18-metodo-nacional");
    const usuarioSinConfig = { user: "op", role: "operador", permissions: ["shipping_method:edit"] };
    const a = mockRes();
    await shipping.updateShippingMethod({ user: usuarioSinConfig, params: { id: metodo._id }, body: { empresas: [{ nombre: "MRW", cotizador: "ninguno" }, { nombre: "Zoom", cotizador: "zoom" }] } }, a.res);
    assert.strictEqual(a.out.status, 403);
    const b = mockRes();
    await shipping.updateShippingMethod({ user: usuarioSinConfig, params: { id: metodo._id }, body: { empresas: [{ nombre: "MRW", cotizador: "mrw" }, { nombre: "Zoom", cotizador: "zoom", slug: "zoom" }, { nombre: "Tealca" }] } }, b.res);
    assert.strictEqual(b.out.status, 200);
  });

  console.log("\n5. API pública");
  await prueba("GET info: la empresa expone cotizador solo si lo tiene", async () => {
    const { res, out } = mockRes();
    await ctrl.getInfo({ query: {} }, res);
    const envio = out.json.envios.find((m: any) => m.id === "t-f18-metodo-nacional");
    assert.strictEqual(envio.empresas.find((e: any) => e.nombre === "MRW").cotizador, "mrw");
    assert.ok(!("cotizador" in envio.empresas.find((e: any) => e.nombre === "Tealca")));
  });

  await prueba("POST cotizar-envio: MRW, peso de la base (no del cliente), lista blanca exacta", async () => {
    precargarTablaMrw();
    resetMocks();
    const { res, out } = mockRes();
    await cotCtrl.postCotizarEnvio(
      {
        body: {
          items: [
            { id: "t-f18-p1", cantidad: 2, pesoKg: 0.001 },
            { id: "t-f18-p2", cantidad: 1 },
          ],
          metodoId: "t-f18-metodo-nacional",
          empresaId: "MRW",
        },
      },
      res,
    );
    assert.strictEqual(out.status, 200);
    // 2×1.2 + 2.5 = 4.9 kg → 5 kg → 1000 + 5×100 = 1500 Bs; tasa 36 en pruebas
    assert.deepStrictEqual(Object.keys(out.json).sort(), ["disponible", "estimado", "fecha", "montoBs", "montoUsd"]);
    assert.strictEqual(out.json.disponible, true);
    assert.strictEqual(out.json.montoBs, 1500);
    assert.strictEqual(out.json.montoUsd, 41.67);
    assert.strictEqual(out.json.estimado, true);
    assert.strictEqual(llamadasPost.length, 0, "MRW sale de la tabla, no consulta en vivo");
  });

  await prueba("POST cotizar-envio: Zoom con sucursal (ciudad y oficina de la base)", async () => {
    resetMocks();
    cot._resetParaPruebas();
    const { res, out } = mockRes();
    await cotCtrl.postCotizarEnvio(
      { body: { items: [{ id: "t-f18-p2", cantidad: 1 }], metodoId: "t-f18-metodo-nacional", empresaId: "Zoom", sucursalId: "zoom-1234" } },
      res,
    );
    assert.strictEqual(out.json.disponible, true);
    assert.strictEqual(out.json.montoBs, 22150.58);
    const tarifa = llamadasGet.find((u) => u.includes("CalcularTarifa"))!;
    const q = new URL(tarifa).searchParams;
    assert.strictEqual(q.get("ciudad_destinatario"), "202");
    assert.strictEqual(q.get("oficina_retirar"), "1234");
    assert.strictEqual(q.get("peso"), "2.5");
  });

  await prueba("POST cotizar-envio: sin estimado → { disponible: false } (producto sin peso, empresa sin cotizador, sin cobro a destino, fallo externo)", async () => {
    const casos: any[] = [
      { items: [{ id: "t-f18-p3", cantidad: 1 }], metodoId: "t-f18-metodo-nacional", empresaId: "MRW" },
      { items: [{ id: "t-f18-p1", cantidad: 1 }], metodoId: "t-f18-metodo-nacional", empresaId: "Tealca" },
      { items: [{ id: "t-f18-p1", cantidad: 1 }], metodoId: "t-f18-metodo-sin-cobro", empresaId: "MRW" },
      { items: [{ id: "t-f18-p1", cantidad: 1 }], metodoId: "id-inexistente", empresaId: "MRW" },
      { items: [{ id: "no-existe", cantidad: 1 }], metodoId: "t-f18-metodo-nacional", empresaId: "MRW" },
    ];
    for (const body of casos) {
      const { res, out } = mockRes();
      await cotCtrl.postCotizarEnvio({ body }, res);
      assert.strictEqual(out.status, 200);
      assert.deepStrictEqual(out.json, { disponible: false });
    }
    resetMocks();
    cot._resetParaPruebas();
    zoomFalla = true;
    const { res, out } = mockRes();
    await cotCtrl.postCotizarEnvio({ body: { items: [{ id: "t-f18-p1", cantidad: 1 }], metodoId: "t-f18-metodo-nacional", empresaId: "Zoom", sucursalId: "zoom-1234" } }, res);
    assert.deepStrictEqual(out.json, { disponible: false });
    zoomFalla = false;
  });

  await prueba("POST cotizar-envio: entrada inválida → 400 sin detalles internos", async () => {
    for (const body of [{}, { items: [] }, { items: [{ id: "t-f18-p1", cantidad: 0 }], metodoId: "x", empresaId: "MRW" }, { items: [{ id: "t-f18-p1", cantidad: 51 }] }]) {
      const { res, out } = mockRes();
      await cotCtrl.postCotizarEnvio({ body }, res);
      assert.strictEqual(out.status, 400);
      assert.deepStrictEqual(Object.keys(out.json), ["error"]);
    }
  });

  await prueba("rutas: cotizar-envio tiene límite propio por IP", () => {
    const r = leer("routes/publicRoutes.ts");
    assert.ok(/cotizadorLimiter\s*=\s*rateLimit\(\{[\s\S]*?max:\s*30/.test(r));
    assert.ok(r.includes('router.post("/cotizar-envio", cotizadorLimiter, cotizadorController.postCotizarEnvio)'));
  });

  console.log("\n6. Regla de marca y sin domicilio");
  await prueba("ningún texto de marca ni de ciudad escrito en el código nuevo", () => {
    for (const rel of ["services/cotizadorEnvio.ts", "catalogo/js/api.js"]) {
      const s = leer(rel);
      assert.ok(!/caracas|ventimax|fortunne|yuri/i.test(s), `${rel} no debe nombrar la marca ni la ciudad`);
    }
    const app = leer("catalogo/js/app.js");
    assert.ok(!/Caracas/.test(app.slice(app.indexOf("actualizarEstimadoEnvio"), app.indexOf("actualizarEstimadoEnvio") + 2000)));
  });

  await prueba("sin domicilio: el cotizador no tiene modalidad ni tabla de domicilio", () => {
    const s = leer("services/cotizadorEnvio.ts");
    assert.ok(!/domicilio/i.test(s));
    assert.ok(!/modalidad_tarifa=2|modalidad=2/.test(s));
    const bloque = leer("controllers/cotizadorController.ts");
    assert.ok(!/modalidad/.test(bloque), "la API pública no recibe modalidad");
  });

  await prueba("carrito: texto del estimado y sin innerHTML con datos", () => {
    const app = leer("catalogo/js/app.js");
    assert.ok(app.includes("se paga al retirar en la agencia"));
    const bloque = app.slice(app.indexOf("async function actualizarEstimadoEnvio"), app.indexOf("async function actualizarEstimadoEnvio") + 2000);
    assert.ok(!/innerHTML/.test(bloque));
  });

  await prueba("panel: select cotizador por empresa, sin innerHTML", () => {
    const m = leer("public/src/features/inventory/components/ShippingNacionalModal.js");
    assert.ok(m.includes("Cotizador de envío (estimado)"));
    assert.ok(m.includes("cotizador: x.cotizador"));
    assert.ok(!/innerHTML/.test(m));
  });

  // --- Regresión: el peso del producto y la sincronía con la BD --------------------------------------
  await prueba("regresión: la suite de envíos y el método sin cotizador no cambian la entrega", () => {
    const e = empresas.normalizarEmpresas([{ nombre: "Tealca" }]);
    assert.deepStrictEqual(e, [{ nombre: "Tealca", logoUrl: "", logoPublicId: "" }]);
  });

  restaurarMocks();
  console.log("\n================================================================================");
  console.log(`🎉 TODAS LAS PRUEBAS DEL COTIZADOR DE ENVÍO (F1-8) PASARON: ${n}`);
  console.log("================================================================================");
}

runTests().catch((err) => {
  restaurarMocks();
  console.error("\n❌ FALLO:", err);
  process.exit(1);
});
