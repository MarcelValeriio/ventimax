/**
 * scripts/test-zoom-codigos.ts
 *
 * Suite del aviso de códigos de oficina de Zoom (F1-8): comparador, revisión (fallo de red sin alarma, aviso sin
 * repetir), extracción de la respuesta de getOficinas y job (solo con empresas zoom y una vez por semana).
 * Sin red real: se mockean axios.get y pushService.sendToAllAdmins. Sin esperas reales.
 * Uso: NODE_ENV=test BRAND_NAME=ventimax npx tsx scripts/test-zoom-codigos.ts
 */
import assert from "node:assert";
import axios from "axios";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.JWT_SECRET = "x".repeat(40);

const dbLocal = require("../services/dbLocal");
const pushService = require("../services/pushService");
const { CODIGO_CIUDAD_POR_OFICINA_ZOOM } = require("../services/zoomCiudades");
const comp = require("../services/zoomCiudadesComparacion");
const mon = require("../services/zoomCiudadesMonitor");

let n = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  n++;
  originalLog(`  ✅ ${nombre}`);
}

const sinEsperas = async () => {};
const MS_DIA = 24 * 60 * 60 * 1000;

// --- Mocks de red y de avisos --------------------------------------------------------------------------------
const originalGet = axios.get;
const originalPush = pushService.sendToAllAdmins;
const originalWarn = console.warn;
const originalError = console.error;
const originalLog = console.log;

// Oficinas que "Zoom lista hoy", por codciudad. Por defecto, igual que la tabla.
let zoomLista: Record<string, string[]> = {};
let zoomFallaEn: string | null = null; // codciudad que da error de red
let llamadasGet: string[] = [];
let pushes: any[] = [];
let avisosWarn: string[] = [];

function tablaComoZoom(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  Object.keys(CODIGO_CIUDAD_POR_OFICINA_ZOOM).forEach((o) => {
    const c = String(CODIGO_CIUDAD_POR_OFICINA_ZOOM[o]);
    (out[c] = out[c] || []).push(o);
  });
  return out;
}

function instalarMocks() {
  (axios as any).get = async (url: string) => {
    llamadasGet.push(url);
    const m = /codciudad=(\d+)/.exec(url);
    if (!m) throw new Error("URL inesperada " + url);
    if (zoomFallaEn === m[1]) throw new Error("red caída simulada");
    const lista = zoomLista[m[1]];
    if (!lista || lista.length === 0) {
      return { data: { codResponse: null, entidadRespuesta: "NO HAY OFICINAS PARA MOSTRAR" } };
    }
    return { data: { codrespuesta: "COD_000", entidadRespuesta: lista.map((o) => ({ codoficina: Number(o), nombre: "x" })) } };
  };
  pushService.sendToAllAdmins = async (payload: any) => {
    pushes.push(payload);
    return undefined;
  };
  console.warn = (...a: any[]) => {
    avisosWarn.push(a.map(String).join(" "));
  };
  console.error = () => {};
  console.log = () => {};
}
function restaurarMocks() {
  (axios as any).get = originalGet;
  pushService.sendToAllAdmins = originalPush;
  console.warn = originalWarn;
  console.error = originalError;
  console.log = originalLog;
}
function resetMocks() {
  zoomLista = tablaComoZoom();
  zoomFallaEn = null;
  llamadasGet = [];
  pushes = [];
  avisosWarn = [];
}

function limpiarRevisionGuardada() {
  const data = dbLocal.read();
  if (data.settings) delete data.settings[mon.CLAVE_REVISION_ZOOM];
  dbLocal.write(data);
}

function sembrarMetodos(conZoom: boolean) {
  const data = dbLocal.read();
  data.metodosEnvio = [
    {
      _id: "t-zoom-metodo",
      id: "t-zoom-metodo",
      nombre: "Envío nacional",
      tipo: "envio_nacional",
      costoTipo: "a_convenir",
      costo: 0,
      cobroADestino: true,
      activo: true,
      orden: 1,
      empresas: conZoom ? [{ nombre: "Zoom", cotizador: "zoom", slug: "zoom" }] : [{ nombre: "MRW", cotizador: "mrw" }],
    },
  ];
  dbLocal.write(data);
}

async function runTests() {
  console.log("🧪 Suite: aviso de códigos de oficina de Zoom (F1-8)\n");
  instalarMocks();
  resetMocks();

  // --- Comparador (puro) ------------------------------------------------------------------------------------
  await prueba("comparador: sin cambios no marca nada", () => {
    const r = comp.compararTablaZoom({ "2": 25, "3": 24 }, { "25": ["2"], "24": ["3"] });
    assert.deepStrictEqual(r, { cambiadas: [], desaparecidas: [], nuevas: [] });
  });

  await prueba("comparador: oficina que Zoom lista en otra ciudad es cambiada", () => {
    const r = comp.compararTablaZoom({ "2": 25 }, { "30": ["2"], "25": [] });
    assert.deepStrictEqual(r.cambiadas, [{ oficina: "2", antes: "25", ahora: "30" }]);
    assert.deepStrictEqual(r.desaparecidas, []);
  });

  await prueba("comparador: oficina que ya no aparece es desaparecida", () => {
    const r = comp.compararTablaZoom({ "2": 25, "3": 24 }, { "25": ["2"], "24": [] });
    assert.deepStrictEqual(r.desaparecidas, ["3"]);
    assert.deepStrictEqual(r.cambiadas, []);
  });

  await prueba("comparador: oficina nueva solo se informa", () => {
    const r = comp.compararTablaZoom({ "2": 25 }, { "25": ["2"], "44": ["9999"] });
    assert.deepStrictEqual(r.nuevas, [{ oficina: "9999", codciudad: "44" }]);
    assert.deepStrictEqual(r.cambiadas, []);
    assert.deepStrictEqual(r.desaparecidas, []);
  });

  await prueba("comparador: si la oficina sigue en su ciudad, no es cambio aunque haya otras", () => {
    const r = comp.compararTablaZoom({ "2": 25 }, { "25": ["2"], "30": ["2"] });
    assert.deepStrictEqual(r.cambiadas, []);
  });

  // --- Respuesta de getOficinas -----------------------------------------------------------------------------
  await prueba("respuesta: ciudad sin oficinas (texto) es lista vacía", () => {
    assert.deepStrictEqual(comp.extraerOficinasZoom({ codResponse: null, entidadRespuesta: "NO HAY OFICINAS PARA MOSTRAR" }), []);
  });

  await prueba("respuesta: lista de oficinas se devuelve como texto de código", () => {
    const data = { codrespuesta: "COD_000", entidadRespuesta: [{ codoficina: 2 }, { codoficina: 2252 }] };
    assert.deepStrictEqual(comp.extraerOficinasZoom(data), ["2", "2252"]);
  });

  await prueba("respuesta: error de Zoom o texto desconocido lanza (no vacía la tabla)", () => {
    assert.throws(() => comp.extraerOficinasZoom({ codrespuesta: "COD_500", entidadRespuesta: [] }));
    assert.throws(() => comp.extraerOficinasZoom({ entidadRespuesta: "ERROR INTERNO" }));
    assert.throws(() => comp.extraerOficinasZoom({ entidadRespuesta: null }));
  });

  // --- Revisión ----------------------------------------------------------------------------------------------
  limpiarRevisionGuardada();
  resetMocks();

  await prueba("revisión sin cambios: ok, sin aviso ni push, una consulta por codciudad", async () => {
    const r = await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: new Date("2026-11-04T12:00:00Z") });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.firma, "");
    assert.strictEqual(pushes.length, 0);
    assert.strictEqual(avisosWarn.length, 0);
    const codciudades = new Set(Object.values(CODIGO_CIUDAD_POR_OFICINA_ZOOM).map(String));
    assert.strictEqual(llamadasGet.length, codciudades.size);
    const guardado = await mon.leerRevisionZoom();
    assert.strictEqual(guardado.ok, true);
  });

  await prueba("revisión con cambio: log de aviso y una notificación push", async () => {
    resetMocks();
    // La oficina "2" pasa a la codciudad 30 y la "3" desaparece.
    zoomLista = tablaComoZoom();
    zoomLista["25"] = zoomLista["25"].filter((o) => o !== "2");
    zoomLista["30"] = [...(zoomLista["30"] || []), "2"];
    zoomLista["24"] = zoomLista["24"].filter((o) => o !== "3");
    const r = await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: new Date("2026-11-11T12:00:00Z") });
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.cambiadas, [{ oficina: "2", antes: "25", ahora: "30" }]);
    assert.ok(r.desaparecidas.includes("3"));
    assert.strictEqual(pushes.length, 1);
    assert.ok(avisosWarn.some((l) => l.includes("⚠️ [Cotizador] Zoom cambió códigos de oficina: 1 cambiadas, 1 desaparecidas. Regenerar services/zoomCiudades.ts")));
  });

  await prueba("el mismo resultado no vuelve a avisar (ni push ni log)", async () => {
    const pushAntes = pushes.length;
    const warnAntes = avisosWarn.length;
    const r = await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: new Date("2026-11-18T12:00:00Z") });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(pushes.length, pushAntes);
    assert.strictEqual(avisosWarn.length, warnAntes);
  });

  await prueba("fallo de red: no cuenta como cambio, no alarma y conserva la firma", async () => {
    const firmaAntes = (await mon.leerRevisionZoom()).firma;
    assert.ok(firmaAntes, "debe quedar la firma del último aviso");
    const pushAntes = pushes.length;
    zoomFallaEn = "44";
    const r = await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: new Date("2026-11-19T12:00:00Z") });
    assert.strictEqual(r.ok, false);
    assert.ok(r.error && r.error.includes("codciudad 44"));
    assert.deepStrictEqual(r.cambiadas, []);
    assert.deepStrictEqual(r.desaparecidas, []);
    assert.strictEqual(r.firma, firmaAntes);
    assert.strictEqual(pushes.length, pushAntes);
    assert.strictEqual((await mon.leerRevisionZoom()).ok, false);
  });

  await prueba("tras el fallo, volver a un resultado limpio y luego al mismo cambio sí avisa de nuevo", async () => {
    resetMocks();
    const r1 = await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: new Date("2026-11-20T12:00:00Z") });
    assert.strictEqual(r1.ok, true);
    assert.strictEqual(r1.firma, "");
    const pushAntes = pushes.length;
    zoomLista = tablaComoZoom();
    zoomLista["25"] = zoomLista["25"].filter((o) => o !== "2");
    zoomLista["30"] = [...(zoomLista["30"] || []), "2"];
    zoomLista["24"] = zoomLista["24"].filter((o) => o !== "3");
    await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: new Date("2026-11-27T12:00:00Z") });
    assert.strictEqual(pushes.length, pushAntes + 1);
  });

  await prueba("oficina nueva sola: se informa en log, no genera push ni alarma", async () => {
    resetMocks();
    limpiarRevisionGuardada();
    zoomLista = tablaComoZoom();
    zoomLista["44"] = [...(zoomLista["44"] || []), "9999"];
    const r = await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: new Date("2026-12-01T12:00:00Z") });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.nuevas.length, 1);
    assert.strictEqual(r.firma, "");
    assert.strictEqual(pushes.length, 0);
    assert.strictEqual(avisosWarn.length, 0);
  });

  // --- Job ----------------------------------------------------------------------------------------------------
  await prueba("job: decide cada semana si todo estaba bien y al día siguiente si falló", () => {
    const base = Date.parse("2026-12-10T00:00:00Z");
    assert.strictEqual(mon.debeRevisarZoom(null, base), true);
    assert.strictEqual(mon.debeRevisarZoom({ ok: true, ejecutadaEn: base } as any, base + 3 * MS_DIA), false);
    assert.strictEqual(mon.debeRevisarZoom({ ok: true, ejecutadaEn: base } as any, base + 7 * MS_DIA), true);
    assert.strictEqual(mon.debeRevisarZoom({ ok: false, ejecutadaEn: base } as any, base + MS_DIA / 2), false);
    assert.strictEqual(mon.debeRevisarZoom({ ok: false, ejecutadaEn: base } as any, base + MS_DIA), true);
  });

  await prueba("job: no consulta a Zoom si ninguna empresa usa cotizador zoom", async () => {
    limpiarRevisionGuardada();
    sembrarMetodos(false);
    resetMocks();
    await mon.ejecutarRevisionZoomSemanal(new Date("2026-12-14T12:00:00Z"), { espera: sinEsperas });
    assert.strictEqual(llamadasGet.length, 0);
    assert.strictEqual(await mon.leerRevisionZoom(), null);
  });

  await prueba("job: con empresa zoom revisa y guarda; no lanza aunque Zoom falle", async () => {
    sembrarMetodos(true);
    resetMocks();
    zoomFallaEn = "25";
    await mon.ejecutarRevisionZoomSemanal(new Date("2026-12-14T12:00:00Z"), { espera: sinEsperas });
    assert.ok(llamadasGet.length > 0);
    const rev = await mon.leerRevisionZoom();
    assert.strictEqual(rev.ok, false);
  });

  await prueba("job: no vuelve a consultar antes de una semana tras una revisión correcta", async () => {
    limpiarRevisionGuardada();
    sembrarMetodos(true);
    resetMocks();
    await mon.ejecutarRevisionZoomSemanal(new Date("2026-12-14T12:00:00Z"), { espera: sinEsperas });
    const despues = llamadasGet.length;
    assert.ok(despues > 0);
    resetMocks();
    await mon.ejecutarRevisionZoomSemanal(new Date("2026-12-16T12:00:00Z"), { espera: sinEsperas });
    assert.strictEqual(llamadasGet.length, 0);
  });

  // --- Racha de fallos ---------------------------------------------------------------------------------------
  limpiarRevisionGuardada();
  resetMocks();
  const avisosFallo = () => avisosWarn.filter((l) => l.includes("No se pudieron revisar los códigos de Zoom")).length;
  const fechaDia = (d: number) => new Date(Date.parse("2026-12-20T12:00:00Z") + d * MS_DIA);

  await prueba("racha de fallos: 2 fallos seguidos no avisan", async () => {
    zoomFallaEn = "44";
    await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: fechaDia(0) });
    await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: fechaDia(1) });
    assert.strictEqual((await mon.leerRevisionZoom()).fallosSeguidos, 2);
    assert.strictEqual(pushes.length, 0);
    assert.strictEqual(avisosFallo(), 0);
  });

  await prueba("racha de fallos: el tercer fallo seguido avisa una vez (log y push)", async () => {
    await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: fechaDia(2) });
    assert.strictEqual((await mon.leerRevisionZoom()).fallosSeguidos, 3);
    assert.strictEqual(pushes.length, 1);
    assert.strictEqual(avisosFallo(), 1);
    assert.ok(avisosWarn.some((l) => l.includes("No se pudieron revisar los códigos de Zoom 3 días seguidos: codciudad 44")));
  });

  await prueba("racha de fallos: el cuarto y quinto fallo no repiten el aviso", async () => {
    await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: fechaDia(3) });
    await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: fechaDia(4) });
    assert.strictEqual((await mon.leerRevisionZoom()).fallosSeguidos, 5);
    assert.strictEqual(pushes.length, 1);
    assert.strictEqual(avisosFallo(), 1);
  });

  await prueba("racha de fallos: una revisión ok reinicia el contador", async () => {
    zoomFallaEn = null;
    const r = await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: fechaDia(5) });
    assert.strictEqual(r.ok, true);
    assert.strictEqual((await mon.leerRevisionZoom()).fallosSeguidos, 0);
  });

  await prueba("racha de fallos: tras un ok, una nueva racha de 3 vuelve a avisar", async () => {
    zoomFallaEn = "44";
    await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: fechaDia(6) });
    await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: fechaDia(7) });
    assert.strictEqual(pushes.length, 1);
    await mon.revisarCodigosZoom({ espera: sinEsperas, ahora: fechaDia(8) });
    assert.strictEqual(pushes.length, 2);
    assert.strictEqual(avisosFallo(), 2);
    zoomFallaEn = null;
  });

  // --- Cableado -----------------------------------------------------------------------------------------------
  await prueba("agenda: el job semanal está registrado y pasa por el monitor", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const txt = fs.readFileSync(path.join(__dirname, "..", "services", "agendaService.ts"), "utf8");
    assert.ok(txt.includes('agenda.define("cotizador zoom codigos"'));
    assert.ok(txt.includes('agenda.every("1 day", "cotizador zoom codigos"'));
  });

  restaurarMocks();
  limpiarRevisionGuardada();
  console.log("\n================================================================================");
  console.log(`🎉 TODAS LAS PRUEBAS DEL AVISO DE CÓDIGOS ZOOM PASARON: ${n}`);
  console.log("================================================================================");
}

runTests().catch((err) => {
  restaurarMocks();
  console.error("\n❌ FALLO:", err);
  process.exit(1);
});
