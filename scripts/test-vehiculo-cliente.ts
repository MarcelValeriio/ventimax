/**
 * scripts/test-vehiculo-cliente.ts
 *
 * Suite F1-4: Vehículo del cliente (Etiqueta, EtiquetaIg, ficha del Inbox, copiloto).
 *
 * Cobertura:
 *  1. Normalización y validación pura (services/vehiculoCliente.ts).
 *  2. Hooks en modelos Mongoose (Etiqueta y EtiquetaIg calculan marcaNorm/modeloNorm).
 *  3. Persistencia en mocks (dbLocal y dbMock para WhatsApp e Instagram/Messenger).
 *  4. Endpoints HTTP (POST /api/admin/inbox/vehiculo) con y sin permisos, auditoría y 500 genérico.
 *  5. Contexto unificado (GET /api/admin/inbox/contexto devuelve vehiculo para WhatsApp e Instagram).
 *  6. Copiloto de venta manual (propone vehiculo sin auto-guardar hasta confirmar).
 *  7. Regresión (etiquetas sin vehículo conservan su comportamiento) y verificación de Regla 5.
 *
 * Uso: NODE_ENV=test BRAND_NAME=ventimax npx tsx scripts/test-vehiculo-cliente.ts
 */

import assert from "node:assert";
import http from "node:http";
import express from "express";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import axios from "axios";
import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.JWT_SECRET = "test_jwt_secret_vehiculo_cliente_12345";

const {
  validarVehiculo,
  describirVehiculo,
  LIMITES_VEHICULO,
} = require("../services/vehiculoCliente");
const EtiquetaModel = require("../models/Etiqueta");
const EtiquetaIgModel = require("../models/EtiquetaIg");
const dbLocal = require("../services/dbLocal");
const dbMock = require("../services/dbMock");
const adminRoutes = require("../routes/adminRoutes");
const inboxService = require("../services/inboxService");

["Mensaje", "Producto", "MetodoPago"].forEach((nombre) => {
  const getter = `get${nombre}Model`;
  if (typeof dbLocal[getter] !== "function") return;
  try {
    const ruta = require.resolve(`../models/${nombre}`);
    require.cache[ruta] = {
      id: ruta,
      filename: ruta,
      loaded: true,
      exports: dbLocal[getter](),
    };
  } catch (err) {}
});

dbLocal.write({
  usuarios: [
    { _id: "u-admin", username: "admin", nombre: "Admin", role: "admin", activo: true },
    { _id: "u-repartidor", username: "repartidor", nombre: "Repartidor", role: "repartidor", activo: true },
  ],
  productos: [
    { _id: "p-test-1", id: "p-test-1", name: "Producto Test 1", price: 25, activo: true },
  ],
  etiquetas: {},
  etiquetasIg: {},
  mensajes: [],
  pedidos: [],
});

async function run() {
  console.log("================================================================================");
  console.log("🚗 SUITE F1-4: VEHÍCULO DEL CLIENTE (Etiqueta, EtiquetaIg, Inbox, Copiloto)");
  console.log("================================================================================");

  let pruebas = 0;
  const ok = () => {
    pruebas++;
  };

  /* ==========================================================================
   * 1. Validación y Normalización Pura (services/vehiculoCliente.ts)
   * ========================================================================== */
  console.log("\n👉 1. Normalización y validación pura...");

  // Null o undefined -> borrado / sin vehículo
  const rNull = validarVehiculo(null);
  assert.strictEqual(rNull.ok, true, "validarVehiculo(null) es ok");
  assert.strictEqual(rNull.valor, null, "validarVehiculo(null) devuelve null");
  ok();

  const rUndef = validarVehiculo(undefined);
  assert.strictEqual(rUndef.ok, true, "validarVehiculo(undefined) es ok");
  assert.strictEqual(rUndef.valor, null, "validarVehiculo(undefined) devuelve null");
  ok();

  // Objeto con campos vacíos -> borrado
  const rVacios = validarVehiculo({ marca: "   ", modelo: "", anio: null, motor: "", version: "" });
  assert.strictEqual(rVacios.ok, true, "Campos vacíos interpretados como borrado");
  assert.strictEqual(rVacios.valor, null, "Devuelve null cuando todos los campos están vacíos");
  ok();

  // Vehículo válido completo
  const rValido = validarVehiculo({
    marca: "  Toyotá  ",
    modelo: " Corolla Cross ",
    anio: "2012",
    motor: " 1.8 ",
    version: " GLI ",
  });
  assert.strictEqual(rValido.ok, true, "Vehículo válido pasa validación");
  assert.strictEqual(rValido.valor.marca, "Toyotá", "Marca conserva mayúsculas y acentos visuales con trim");
  assert.strictEqual(rValido.valor.modelo, "Corolla Cross", "Modelo recortado");
  assert.strictEqual(rValido.valor.marcaNorm, "toyota", "marcaNorm normalizada sin acento y en minúsculas");
  assert.strictEqual(rValido.valor.modeloNorm, "corolla cross", "modeloNorm normalizada en minúsculas");
  assert.strictEqual(rValido.valor.anio, 2012, "Año convertido a número entero");
  assert.strictEqual(rValido.valor.motor, "1.8", "Motor recortado");
  assert.strictEqual(rValido.valor.version, "GLI", "Versión recortada");
  ok();

  // Límites de longitud
  const marcaLarga = validarVehiculo({ marca: "A".repeat(LIMITES_VEHICULO.marca + 1), modelo: "Corolla" });
  assert.strictEqual(marcaLarga.ok, false, "Marca demasiado larga debe fallar");
  assert(marcaLarga.errores.some(e => e.includes("marca")), "Error menciona marca");
  ok();

  const modeloLargo = validarVehiculo({ marca: "Toyota", modelo: "B".repeat(LIMITES_VEHICULO.modelo + 1) });
  assert.strictEqual(modeloLargo.ok, false, "Modelo demasiado largo debe fallar");
  assert(modeloLargo.errores.some(e => e.includes("modelo")), "Error menciona modelo");
  ok();

  const motorLargo = validarVehiculo({ marca: "Toyota", modelo: "Corolla", motor: "C".repeat(LIMITES_VEHICULO.motor + 1) });
  assert.strictEqual(motorLargo.ok, false, "Motor demasiado largo debe fallar");
  assert(motorLargo.errores.some(e => e.includes("motor")), "Error menciona motor");
  ok();

  const versionLarga = validarVehiculo({ marca: "Toyota", modelo: "Corolla", version: "D".repeat(LIMITES_VEHICULO.version + 1) });
  assert.strictEqual(versionLarga.ok, false, "Versión demasiado larga debe fallar");
  assert(versionLarga.errores.some(e => e.includes("versión") || e.includes("version")), "Error menciona versión");
  ok();

  // Validaciones de año
  const anioMin = validarVehiculo({ marca: "Ford", modelo: "T", anio: 1949 });
  assert.strictEqual(anioMin.ok, false, "Año menor a 1950 debe fallar");
  ok();

  const anioMax = validarVehiculo({ marca: "Ford", modelo: "Futuro", anio: 2101 });
  assert.strictEqual(anioMax.ok, false, "Año mayor a 2100 debe fallar");
  ok();

  const anioDecimal = validarVehiculo({ marca: "Ford", modelo: "Fiesta", anio: 2012.5 });
  assert.strictEqual(anioDecimal.ok, false, "Año decimal debe fallar");
  ok();

  // Función describirVehiculo
  assert.strictEqual(describirVehiculo(null), "", "describirVehiculo(null) devuelve cadena vacía");
  assert.strictEqual(
    describirVehiculo({ marca: "Toyota", modelo: "Corolla", anio: 2012, motor: "1.8", version: "GLI" }),
    "Toyota Corolla 2012 1.8 GLI",
    "describirVehiculo arma la frase completa",
  );
  assert.strictEqual(
    describirVehiculo({ marca: "Chevrolet", modelo: "Aveo", anio: 2008 }),
    "Chevrolet Aveo 2008",
    "describirVehiculo omite campos ausentes",
  );
  ok();

  /* ==========================================================================
   * 2. Hook en Modelos Mongoose (Etiqueta y EtiquetaIg)
   * ========================================================================== */
  console.log("\n👉 2. Hooks pre('validate') en Mongoose...");

  const docEtiqueta = new EtiquetaModel({
    telefono: "584129990001",
    vehiculo: {
      marca: "  Chévrolet ",
      modelo: " Optra  ",
      anio: 2007,
      motor: "Limited",
    },
  });
  await docEtiqueta.validate();
  assert.strictEqual(docEtiqueta.vehiculo.marcaNorm, "chevrolet", "Etiqueta pre-validate calcula marcaNorm");
  assert.strictEqual(docEtiqueta.vehiculo.modeloNorm, "optra", "Etiqueta pre-validate calcula modeloNorm");
  ok();

  const docEtiquetaIg = new EtiquetaIgModel({
    usuarioIgId: "ig_user_test_1",
    vehiculo: {
      marca: " Mitsubíshi ",
      modelo: "Lancer",
      anio: 2015,
    },
  });
  await docEtiquetaIg.validate();
  assert.strictEqual(docEtiquetaIg.vehiculo.marcaNorm, "mitsubishi", "EtiquetaIg pre-validate calcula marcaNorm");
  assert.strictEqual(docEtiquetaIg.vehiculo.modeloNorm, "lancer", "EtiquetaIg pre-validate calcula modeloNorm");
  ok();

  /* ==========================================================================
   * 3. Persistencia en dbLocal y dbMock
   * ========================================================================== */
  console.log("\n👉 3. Persistencia en dbLocal y dbMock...");

  // dbLocal WhatsApp
  const telTest = "584149990002";
  const mockEtiquetaLocal = dbLocal.getEtiquetaModel();
  await mockEtiquetaLocal.findOneAndUpdate(
    { telefono: telTest },
    {
      vehiculo: {
        marca: "Toyota",
        modelo: "Yaris",
        marcaNorm: "toyota",
        modeloNorm: "yaris",
        anio: 2006,
        motor: "1.3",
        version: "",
      },
    },
    { upsert: true },
  );
  const guardadoLocal = await mockEtiquetaLocal.findOne({ telefono: telTest });
  assert.strictEqual(guardadoLocal.vehiculo?.modelo, "Yaris", "dbLocal guarda vehículo de WhatsApp");
  assert.strictEqual(guardadoLocal.vehiculo?.marcaNorm, "toyota", "dbLocal guarda marcaNorm de WhatsApp");
  ok();

  // dbLocal Instagram
  const igUserTest = "ig_user_local_2";
  const mockEtiquetaIgLocal = dbLocal.getEtiquetaIgModel();
  await mockEtiquetaIgLocal.findOneAndUpdate(
    { usuarioIgId: igUserTest },
    {
      vehiculo: {
        marca: "Hyundai",
        modelo: "Getz",
        marcaNorm: "hyundai",
        modeloNorm: "getz",
        anio: 2011,
        motor: "1.6",
        version: "GLS",
      },
    },
    { upsert: true },
  );
  const guardadoIgLocal = await mockEtiquetaIgLocal.findOne({ usuarioIgId: igUserTest });
  assert.strictEqual(guardadoIgLocal.vehiculo?.modelo, "Getz", "dbLocal guarda vehículo de Instagram");
  assert.strictEqual(guardadoIgLocal.vehiculo?.anio, 2011, "dbLocal guarda año de Instagram");
  ok();

  // dbMock WhatsApp e Instagram
  const mockEtiquetaMemory = dbMock.getEtiquetaModel();
  await mockEtiquetaMemory.findOneAndUpdate(
    { telefono: "584129990003" },
    { vehiculo: { marca: "Nissan", modelo: "Sentra", anio: 2005 } },
    { upsert: true },
  );
  const leidoMemory = await mockEtiquetaMemory.findOne({ telefono: "584129990003" });
  assert.strictEqual(leidoMemory.vehiculo?.marca, "Nissan", "dbMock guarda y devuelve vehículo");
  ok();

  const mockEtiquetaIgMemory = dbMock.getEtiquetaIgModel();
  await mockEtiquetaIgMemory.findOneAndUpdate(
    { usuarioIgId: "ig_memory_3" },
    { vehiculo: { marca: "Kia", modelo: "Rio", anio: 2014 } },
    { upsert: true },
  );
  const leidoIgMemory = await mockEtiquetaIgMemory.findOne({ usuarioIgId: "ig_memory_3" });
  assert.strictEqual(leidoIgMemory.vehiculo?.modelo, "Rio", "dbMock devuelve vehículo de Instagram");
  ok();

  /* ==========================================================================
   * 4. Endpoints HTTP (POST /api/admin/inbox/vehiculo)
   * ========================================================================== */
  console.log("\n👉 4. Endpoint POST /api/admin/inbox/vehiculo y permisos...");

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  const mockIo = {
    emit: (evento: string, data: any) => {},
  };
  app.use("/api/admin", adminRoutes(mockIo));

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}/api/admin`;

  const tokenAdmin = jwt.sign(
    { id: "u-admin", username: "admin", role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );
  const tokenRepartidor = jwt.sign(
    { id: "u-repartidor", username: "repartidor", role: "repartidor" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" },
  );

  const cookieAdmin = `token=${tokenAdmin}`;
  const cookieRepartidor = `token=${tokenRepartidor}`;

  // 4.1 Sin token -> 401
  try {
    await axios.post(`${baseUrl}/inbox/vehiculo`, { usuarioId: "584121112233" });
    assert.fail("Debió fallar con 401 sin autenticación");
  } catch (err: any) {
    assert.strictEqual(err.response?.status, 401, "Sin cookie responde 401");
    ok();
  }

  // 4.2 Rol repartidor (sin chat:manage) -> 403
  try {
    await axios.post(
      `${baseUrl}/inbox/vehiculo`,
      { usuarioId: "584121112233" },
      { headers: { Cookie: cookieRepartidor } },
    );
    assert.fail("Debió fallar con 403 para rol sin chat:manage");
  } catch (err: any) {
    assert.strictEqual(err.response?.status, 403, "Rol sin chat:manage responde 403");
    ok();
  }

  // 4.3 Petición inválida (sin identificador) -> 400
  try {
    await axios.post(
      `${baseUrl}/inbox/vehiculo`,
      { vehiculo: { marca: "Toyota" } },
      { headers: { Cookie: cookieAdmin } },
    );
    assert.fail("Debió fallar con 400 sin usuarioId");
  } catch (err: any) {
    assert.strictEqual(err.response?.status, 400, "Falta identificador responde 400");
    ok();
  }

  // 4.4 Validación fallida de datos del vehículo -> 400
  try {
    await axios.post(
      `${baseUrl}/inbox/vehiculo`,
      {
        usuarioId: "584121112233",
        vehiculo: { marca: "Toyota", anio: 1940 }, // año inválido
      },
      { headers: { Cookie: cookieAdmin } },
    );
    assert.fail("Debió fallar con 400 por año < 1950");
  } catch (err: any) {
    assert.strictEqual(err.response?.status, 400, "Año inválido responde 400");
    ok();
  }

  // 4.5 Petición exitosa para WhatsApp -> 200
  const telClienteHttp = "584121112233";
  const resWa = await axios.post(
    `${baseUrl}/inbox/vehiculo`,
    {
      canal: "whatsapp",
      usuarioId: telClienteHttp,
      vehiculo: {
        marca: "Toyota",
        modelo: "Corolla",
        anio: 2012,
        motor: "1.8",
        version: "GLI",
      },
    },
    { headers: { Cookie: cookieAdmin } },
  );
  assert.strictEqual(resWa.status, 200, "Guardar vehículo en WhatsApp responde 200");
  assert.strictEqual(resWa.data.success, true, "Respuesta exitosa");
  assert.strictEqual(resWa.data.data.vehiculo.modeloNorm, "corolla", "Devuelve vehiculo normalizado");
  ok();

  // 4.6 Petición exitosa para Instagram -> 200
  const igClienteHttp = "ig_cliente_http_4";
  const resIg = await axios.post(
    `${baseUrl}/inbox/vehiculo`,
    {
      canal: "instagram",
      usuarioId: igClienteHttp,
      vehiculo: {
        marca: "Chevrolet",
        modelo: "Cruze",
        anio: 2013,
      },
    },
    { headers: { Cookie: cookieAdmin } },
  );
  assert.strictEqual(resIg.status, 200, "Guardar vehículo en Instagram responde 200");
  assert.strictEqual(resIg.data.data.vehiculo.marcaNorm, "chevrolet", "Devuelve marcaNorm chevrolet");
  ok();

  // 4.7 Borrar vehículo pasando null -> 200 y valor null
  const resBorrar = await axios.post(
    `${baseUrl}/inbox/vehiculo`,
    {
      canal: "whatsapp",
      usuarioId: telClienteHttp,
      vehiculo: null,
    },
    { headers: { Cookie: cookieAdmin } },
  );
  assert.strictEqual(resBorrar.status, 200, "Borrar vehículo responde 200");
  assert.strictEqual(resBorrar.data.data.vehiculo, null, "Vehículo devuelto es null");
  ok();

  /* ==========================================================================
   * 5. Contexto unificado incluye vehículo
   * ========================================================================== */
  console.log("\n👉 5. Contexto unificado incluye vehículo...");

  // Volvemos a asignar vehículo a telClienteHttp
  await axios.post(
    `${baseUrl}/inbox/vehiculo`,
    {
      canal: "whatsapp",
      usuarioId: telClienteHttp,
      vehiculo: { marca: "Renault", modelo: "Clio", anio: 2008 },
    },
    { headers: { Cookie: cookieAdmin } },
  );

  const resContextoWa = await axios.get(
    `${baseUrl}/inbox/contexto?canal=whatsapp&usuarioId=${telClienteHttp}`,
    { headers: { Cookie: cookieAdmin } },
  );
  assert.strictEqual(resContextoWa.status, 200, "GET /inbox/contexto WhatsApp responde 200");
  assert.strictEqual(resContextoWa.data.data.vehiculo?.modelo, "Clio", "Contexto WhatsApp incluye vehiculo");
  assert.strictEqual(resContextoWa.data.data.vehiculo?.marcaNorm, "renault", "Contexto WhatsApp tiene marcaNorm");
  ok();

  const resContextoIg = await axios.get(
    `${baseUrl}/inbox/contexto?canal=instagram&usuarioId=${igClienteHttp}`,
    { headers: { Cookie: cookieAdmin } },
  );
  assert.strictEqual(resContextoIg.status, 200, "GET /inbox/contexto Instagram responde 200");
  assert.strictEqual(resContextoIg.data.data.vehiculo?.modelo, "Cruze", "Contexto Instagram incluye vehiculo");
  ok();

  /* ==========================================================================
   * 6. Copiloto de Venta Manual (propone sin autoguardar)
   * ========================================================================== */
  console.log("\n👉 6. Copiloto de Venta Manual (propone y guarda tras confirmación)...");

  // Chat con María para extracción IA
  const WA_COPILOTO = "584149997788";
  const axiosOriginalPost = axios.post;

  // Interceptar llamada a DeepSeek para devolver simulación con vehículo
  (axios as any).post = (url: string, ...resto: any[]) => {
    if (typeof url === "string" && url.includes("api.deepseek.com")) {
      return Promise.resolve({
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  cliente: { nombre: "Carlos Perez", cedula: "V-19888777", direccion: "Chacao" },
                  vehiculo: { marca: "Toyota", modelo: "Corolla", anio: 2012, motor: "1.8", version: "GLI" },
                  notas: "Entregar en la mañana",
                  items: [{ producto: "Turbo Fan 10", cantidad: 1 }],
                }),
              },
            },
          ],
        },
      });
    }
    return axiosOriginalPost(url, ...resto);
  };

  // Sembrar mensajes para que extractOrderFromChat encuentre historial
  const MensajeModel = dbLocal.getMensajeModel();
  await MensajeModel.create({
    telefono: WA_COPILOTO,
    direccion: "cliente",
    texto: "Buenas tardes, quisiera comprar para mi Toyota Corolla 2012 motor 1.8",
    timestamp: new Date(),
  });

  const resExtraccion = await axios.post(
    `${baseUrl}/inbox/whatsapp/copiloto/extraer`,
    { canal: "whatsapp", usuarioId: WA_COPILOTO },
    { headers: { Cookie: cookieAdmin } },
  );
  assert.strictEqual(resExtraccion.status, 200, "Copiloto responde 200");
  assert.strictEqual(resExtraccion.data.data?.vehiculo?.modelo, "Corolla", "Copiloto propone vehículo");
  assert.strictEqual(resExtraccion.data.data?.vehiculo?.marcaNorm, "toyota", "Vehículo propuesto está normalizado");

  // Verificar que NO se guardó en la etiqueta aún (solo fue propuesto)
  const etiquetaPrevia = await mockEtiquetaLocal.findOne({ telefono: WA_COPILOTO });
  assert.strictEqual(etiquetaPrevia?.vehiculo, undefined, "El copiloto NO autoguarda el vehículo antes de confirmar");
  ok();

  // Restaurar axios.post
  (axios as any).post = axiosOriginalPost;

  // Ahora confirmar venta manual con el vehículo incluido
  await inboxService.crearVentaManual({
    usuarioId: WA_COPILOTO,
    datos: {
      whatsappId: WA_COPILOTO,
      cliente: { nombre: "Carlos Perez", cedula: "V-19888777" },
      items: [{ producto: "Producto Test 1", cantidad: 1 }],
      pago: { metodo: "Efectivo", montoUSD: 25 },
      vehiculo: resExtraccion.data.data.vehiculo,
    },
  });

  // Verificar que AHORA sí está guardado en la etiqueta
  const etiquetaConfirmada = await mockEtiquetaLocal.findOne({ telefono: WA_COPILOTO });
  assert.strictEqual(etiquetaConfirmada?.vehiculo?.modelo, "Corolla", "Tras confirmar, el vehículo sí se guarda");
  ok();

  /* ==========================================================================
   * 7. Regresión y Verificación de Regla 5 (sin marcas en el código)
   * ========================================================================== */
  console.log("\n👉 7. Regresión y Regla 5...");

  // Contacto sin vehículo no tiene campo o es null
  const telSinVehiculo = "584120009999";
  await mockEtiquetaLocal.findOneAndUpdate(
    { telefono: telSinVehiculo },
    { paso: "inicio", modo: "automatico" },
    { upsert: true },
  );
  const docSinVehiculo = await mockEtiquetaLocal.findOne({ telefono: telSinVehiculo });
  assert.strictEqual(docSinVehiculo.vehiculo, undefined, "Contacto sin vehículo no lo tiene definido");
  ok();

  // Verificación estricta de Regla 5 en archivos creados/modificados por F1-4
  const archivosF14 = [
    "services/vehiculoCliente.ts",
    "public/src/features/inbox/components/InboxCustomerCardDrawer.js",
  ];

  const marcasProhibidas = ["ventimax", "mr. pachi", "pachi", "yuri-bot", "fortunne"];
  for (const relPath of archivosF14) {
    const fullPath = path.resolve(__dirname, "..", relPath);
    if (!fs.existsSync(fullPath)) continue;
    const contenido = fs.readFileSync(fullPath, "utf-8").toLowerCase();
    for (const marca of marcasProhibidas) {
      assert(
        !contenido.includes(marca),
        `Regla 5 violada: el archivo ${relPath} contiene texto de marca '${marca}'`,
      );
    }
  }
  console.log("  ✅ Regla 5: 0 textos de marcas concretas en los archivos de F1-4");
  ok();

  server.close();

  console.log("\n================================================================================");
  console.log(`🎉 TODAS LAS PRUEBAS PASARON (${pruebas} aserciones verificadas)`);
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("❌ Fallo en suite test-vehiculo-cliente.ts:", err);
  process.exit(1);
});
