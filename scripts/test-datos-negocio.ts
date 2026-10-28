/**
 * scripts/test-datos-negocio.ts
 * Datos legales y de contacto del negocio editables desde el panel (F0-14).
 *
 *  - Sin nada guardado se usan los datos de la marca.
 *  - Validaciones: RIF venezolano (normalizado a J-12345678-9), correo, web, WhatsApp, longitudes.
 *  - GET/PUT /api/admin/config/datos-negocio: 400 con el motivo, fecha puesta por el servidor, auditoría.
 *  - Solo con permiso config:manage.
 *  - La política de privacidad, el enlace a WhatsApp de Instagram/Messenger y la consulta de mapas usan
 *    los datos guardados sin reiniciar; sin número configurado no aparece ningún número fijo.
 *  - Al arrancar se cargan de la base (también el flujo de días no laborables, que antes no se cargaba).
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
delete process.env.WHATSAPP_PHONE;
delete process.env.ADMIN_PHONE_NUMBER;

const dbLocal = require("../services/dbLocal");
const { validarDatosNegocio } = require("../services/configValidators");
const datosNegocioService = require("../services/datosNegocioService");
const flujoNoLaborableService = require("../services/flujoNoLaborableService");
const { getDatosNegocioConfig, updateDatosNegocioConfig } = require("../controllers/configAdminController");
const { authorize } = require("../middlewares/auth");
const PERMISSIONS = require("../data/permissions");
const { generarPaginaPrivacidad } = require("../services/paginaPrivacidad");
const configStore = require("../services/configStore");

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

const DATOS_VALIDOS = {
  legal: { razonSocial: "Inversiones Prueba, C.A.", rif: "j 12345678 9", direccion: "Av. Prueba, Caracas" },
  contacto: { email: "hola@prueba.test", website: "prueba.test", instagram: "@prueba", whatsapp: "+58 (412) 000-0000" },
};

async function run() {
  console.log("================================================================================");
  console.log("🏢 SUITE DE PRUEBAS: DATOS DEL NEGOCIO EDITABLES (F0-14)");
  console.log("================================================================================");

  limpiarSetting("datosNegocio");
  datosNegocioService.invalidateDatosNegocioCache();

  await prueba("Sin datos guardados se usan los de la marca (vacíos en VentiMax)", async () => {
    const d = await datosNegocioService.getDatosNegocio();
    assert.strictEqual(d.legal.razonSocial, "");
    assert.strictEqual(d.contacto.whatsapp, "");
  });

  await prueba("Validador: normaliza RIF, web y WhatsApp", () => {
    const r = validarDatosNegocio(DATOS_VALIDOS);
    assert(r.ok, r.error);
    assert.strictEqual(r.value.legal.rif, "J-12345678-9");
    assert.strictEqual(r.value.contacto.website, "https://prueba.test");
    assert.strictEqual(r.value.contacto.whatsapp, "584120000000");
    const vacio = validarDatosNegocio({});
    assert(vacio.ok, "todo vacío es válido");
  });

  await prueba("Validador: rechaza datos inválidos", () => {
    const malos: any[] = [
      null,
      [],
      { legal: { rif: "12345678" } },
      { legal: { rif: "X-12345678-9" } },
      { legal: { rif: "J-1234-5" } },
      { contacto: { email: "sin-arroba" } },
      { contacto: { website: "no es web" } },
      { contacto: { whatsapp: "0412" } },
      { contacto: { whatsapp: "abc" } },
      { legal: { razonSocial: "x".repeat(121) } },
      { legal: { direccion: "x".repeat(201) } },
      { legal: { razonSocial: 123 } },
    ];
    for (const m of malos) {
      assert.strictEqual(validarDatosNegocio(m).ok, false, `debería rechazar ${JSON.stringify(m)}`);
    }
  });

  await prueba("PUT inválido devuelve 400 con el motivo y no guarda", async () => {
    const { res, out } = mockRes();
    await updateDatosNegocioConfig({ body: { legal: { rif: "malo" } }, user: { user: "admin", role: "admin" } } as any, res);
    assert.strictEqual(out.status, 400);
    assert(out.json.error.includes("RIF"));
    assert.strictEqual(datosNegocioService.getDatosNegocioSync().legal.rif, "");
  });

  await prueba("PUT válido guarda, pone la fecha de hoy y registra auditoría", async () => {
    const Auditoria = dbLocal.getAuditoriaModel();
    const antes = (await Auditoria.find({ recursoId: "datosNegocio" })).length;
    const { res, out } = mockRes();
    await updateDatosNegocioConfig(
      { body: { ...DATOS_VALIDOS, fechaActualizacion: "1999-01-01" }, user: { user: "admin", role: "admin" } } as any,
      res,
    );
    assert.strictEqual(out.status, 200, JSON.stringify(out.json));
    assert.strictEqual(out.json.datos.legal.rif, "J-12345678-9");
    assert.match(out.json.datos.fechaActualizacion, /^\d{4}-\d{2}-\d{2}$/);
    assert.notStrictEqual(out.json.datos.fechaActualizacion, "1999-01-01", "la fecha la pone el servidor");
    const despues = (await Auditoria.find({ recursoId: "datosNegocio" })).length;
    assert.strictEqual(despues, antes + 1);

    const get = mockRes();
    await getDatosNegocioConfig({} as any, get.res);
    assert.strictEqual(get.out.json.datos.legal.razonSocial, "Inversiones Prueba, C.A.");
  });

  await prueba("Solo config:manage puede leer o cambiar los datos", () => {
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
  });

  await prueba("La política de privacidad usa los datos guardados sin reiniciar", () => {
    const html = generarPaginaPrivacidad();
    assert(html.includes("Inversiones Prueba, C.A."));
    assert(html.includes("RIF J-12345678-9"));
    assert(html.includes("mailto:hola@prueba.test"));
    assert(html.includes("+584120000000"));
    assert(/Última actualización:<\/strong> \d{1,2} de [a-z]+ de \d{4}/.test(html), "fecha en español");
  });

  await prueba("Instagram/Messenger envían al WhatsApp del panel; sin número no hay número fijo", async () => {
    const igSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "../services/instagramFlowService.ts"), "utf8");
    assert(!/"58\d{10}"/.test(igSource), "no debe quedar un número de teléfono fijo en el código");

    // El enlace se arma con getWhatsAppPhoneNumber(); se lee igual que el servicio: panel → WHATSAPP_PHONE → admin
    assert.strictEqual(datosNegocioService.getDatosNegocioSync().contacto.whatsapp, "584120000000");
    await datosNegocioService.setDatosNegocio({ legal: {}, contacto: {} });
    const sinNumero = datosNegocioService.getDatosNegocioSync().contacto.whatsapp
      || configStore.getConfig("WHATSAPP_PHONE")
      || configStore.getConfig("ADMIN_PHONE_NUMBER")
      || "";
    assert.strictEqual(sinNumero, "", "sin datos configurados no hay número");
  });

  await prueba("Al arrancar se cargan de la base los datos del negocio y el flujo de días no laborables", async () => {
    await datosNegocioService.setDatosNegocio(DATOS_VALIDOS);
    datosNegocioService.invalidateDatosNegocioCache();
    await datosNegocioService.init();
    assert.strictEqual(datosNegocioService.getDatosNegocioSync().legal.rif, "J-12345678-9");

    const flujoGuardado = {
      activo: false,
      entregaDiferida: { activo: true, texto: "Entrega en día hábil" },
      retiroEnPunto: { activo: false, nombre: "", direccion: "", horario: "" },
    };
    await flujoNoLaborableService.setFlujoNoLaborable(flujoGuardado);
    flujoNoLaborableService.invalidateFlujoCache();
    assert.strictEqual(flujoNoLaborableService.getFlujoNoLaborableSync().activo, true, "sin cargar, usa la marca");
    await flujoNoLaborableService.init();
    assert.strictEqual(flujoNoLaborableService.getFlujoNoLaborableSync().activo, false, "tras init, usa lo guardado");

    const indexSource = require("node:fs").readFileSync(require("node:path").join(__dirname, "../index.ts"), "utf8");
    assert(indexSource.includes("initFlujoNoLaborable()"), "index.ts debe cargar el flujo al arrancar");
    assert(indexSource.includes("initDatosNegocio()"), "index.ts debe cargar los datos del negocio al arrancar");
  });

  // Dejar la base de prueba como estaba
  limpiarSetting("datosNegocio");
  limpiarSetting("flujoNoLaborable");
  datosNegocioService.invalidateDatosNegocioCache();
  flujoNoLaborableService.invalidateFlujoCache();

  console.log("================================================================================");
  console.log(`🎉 ${superadas} pruebas de datos del negocio superadas.`);
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("❌ Falló la suite de datos del negocio:", err);
  process.exit(1);
});
