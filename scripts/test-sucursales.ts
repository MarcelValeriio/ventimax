/**
 * scripts/test-sucursales.ts
 *
 * Suite de pruebas exhaustiva para la funcionalidad de Sucursales de envío nacional (F2n).
 * Uso: NODE_ENV=test BRAND_NAME=ventimax npx tsx scripts/test-sucursales.ts
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.WHATSAPP_PHONE = "584120000000";

const dbLocal = require("../services/dbLocal");
const {
  normalizarZoom,
  normalizarMrw,
  normalizarTealca,
  sincronizarEmpresa,
  limpiarHtml,
  extraerTelefonoTealca,
  esBaseLocal,
  validarPermisoEjecucion,
} = require("./sync-sucursales");
const { normalizarNombreEstado, estadoDeCiudadZoom } = require("../services/estadosVenezuela");
const publicController = require("../controllers/publicController");
const {
  empresaTieneSucursales,
  slugEmpresa,
  validarSucursalId,
  formatearOpcionEstado,
  formatearOpcionSucursal,
  formatearDetalleSucursal,
  limpiarCascadaAlCambiarEmpresa,
  limpiarCascadaAlCambiarEstado,
  entregaConSucursalCompleta,
} = require("../catalogo/js/sucursales");
const { armarEntrega, entregaCompleta } = require("../catalogo/js/entrega");
const chatFlowService = require("../services/chatFlowService");
const configManager = require("../services/configManager");

function mockRes() {
  const out: { status: number; json: any; headers: Record<string, string> } = {
    status: 200,
    json: null,
    headers: {},
  };
  const res: any = {
    status: (s: number) => {
      out.status = s;
      return res;
    },
    json: (j: any) => {
      out.json = j;
      return res;
    },
    setHeader: (k: string, v: string) => {
      out.headers[k.toLowerCase()] = v;
      return res;
    },
  };
  return { res, out };
}

async function runTests() {
  console.log("🧪 Iniciando suite de pruebas: test-sucursales.ts (F2n)\n");

  const Sucursal = dbLocal.getSucursalModel();
  const MetodoEnvio = dbLocal.getMetodoEnvioModel();
  const CarritoWeb = dbLocal.getCarritoWebModel();
  const Producto = dbLocal.getProductoModel();

  // Limpiar BD mock
  await Sucursal.deleteMany({});
  await MetodoEnvio.deleteMany({});
  await CarritoWeb.deleteMany({});
  await Producto.deleteMany({});

  /* ==============================================================================
   * 1. Normalizadores con muestras reales recortadas
   * ============================================================================== */
  console.log("1. Normalizadores con muestras reales");

  // Zoom: normalización, días/horas, omisión de ciudad desconocida o internacional
  const muestraZoom = [
    {
      id: "101",
      sku: "ZOOM-101",
      title: "Agencia Bellas Artes",
      city: "CARACAS",
      street: "Av. México, Edif. Bellas Artes",
      phone: "+58-212-5550000",
      days_str: "Lun a Vie",
      open_hours: '{"mon":["08:00 - 17:00"]}',
      lat: "10.5001",
      lng: "-66.9002",
    },
    {
      id: "102",
      sku: "ZOOM-MIA",
      title: "Zoom Miami",
      city: "MIAMI",
      street: "NW 25th St",
      phone: "1-800-ZOOM",
      days_str: "Mon-Fri",
      open_hours: "",
      lat: "25.7617",
      lng: "-80.1918",
    },
    {
      id: "103",
      sku: "ZOOM-DESC",
      title: "Zoom Ficticio",
      city: "CIUDAD_INEXISTENTE_XYZ",
      street: "Calle 1",
      phone: "",
      days_str: "Lun a Vie",
      open_hours: "",
      lat: null,
      lng: null,
    },
  ];

  const normZoom = normalizarZoom(muestraZoom);
  assert.strictEqual(normZoom.length, 1, "Zoom debe omitir ciudades internacionales y desconocidas");
  assert.strictEqual(normZoom[0].codigo, "ZOOM-101");
  assert.strictEqual(normZoom[0].estado, "Distrito Capital");
  assert.strictEqual(normZoom[0].horario, "Lun a Vie 08:00 - 17:00");
  assert.strictEqual(normZoom[0].lat, 10.5001);
  assert.strictEqual(normZoom[0].lng, -66.9002);
  console.log("  ✅ Zoom: normaliza correctamente y omite ciudades sin estado venezolano");

  // MRW: normalización de estado, sin ciudad, horario por defecto
  const muestraMrw = [
    {
      codigo: "MRW-01",
      nombre: "Agencia Chacao",
      estado: "D.Capital",
      direccion: "Av. Francisco de Miranda, Chacao",
      latitud: "10.4900",
      longitud: "-66.8500",
    },
    {
      codigo: "MRW-02",
      nombre: "Agencia Maiquetía",
      estado: "Vargas",
      direccion: "Calle Los Baños",
      latitud: 10.6000,
      longitud: -66.9500,
    },
  ];

  const normMrw = normalizarMrw(muestraMrw);
  assert.strictEqual(normMrw.length, 2);
  assert.strictEqual(normMrw[0].estado, "Distrito Capital");
  assert.strictEqual(normMrw[1].estado, "La Guaira");
  assert.strictEqual(normMrw[0].horario, "Lun a Vie 8:00 AM - 5:00 PM");
  console.log("  ✅ MRW: normaliza estados alternativos (D.Capital, Vargas) a nombres estándar");

  // Tealca: extracción de teléfono, coordenadas desde url_google_map, HTML limpio
  const muestraTealca = [
    {
      post: { name: "Tealca Puerto La Cruz" },
      state: "Anzoátegui",
      city: "", // Caso sin ciudad
      fields: {
        code: "TEA-001",
        url_google_map: "https://maps.google.com/?q=10.2155,-64.6300",
        acerca_de: "<p>Oficina principal. &nbsp; Teléfono de contacto: <strong>0414-1234567</strong>. Frente a plaza.</p>",
      },
    },
  ];

  const normTealca = normalizarTealca(muestraTealca);
  assert.strictEqual(normTealca.length, 1);
  assert.strictEqual(normTealca[0].codigo, "TEA-001");
  assert.strictEqual(normTealca[0].estado, "Anzoátegui");
  assert.strictEqual(normTealca[0].lat, 10.2155);
  assert.strictEqual(normTealca[0].lng, -64.63);
  assert.strictEqual(normTealca[0].telefono, "04141234567");
  assert.strictEqual(normTealca[0].direccion, "Oficina principal. Teléfono de contacto: 0414-1234567. Frente a plaza.");
  console.log("  ✅ Tealca: limpia HTML, extrae teléfono y parsea coordenadas de url_google_map");

  /* ==============================================================================
   * 2. Sincronización con mock: upsert, desactivación, umbral < 50%, --simular
   * ============================================================================== */
  console.log("\n2. Sincronización con mock y protecciones");

  // Primera sincronización
  const itemsS1 = [
    {
      empresa: "zoom",
      codigo: "Z1",
      nombre: "Zoom Centro",
      estado: "Distrito Capital",
      ciudad: "Caracas",
      direccion: "Av. Baralt",
      telefono: "02120000000",
      horario: "8-5",
      lat: 10.5,
      lng: -66.9,
      activa: true,
    },
    {
      empresa: "zoom",
      codigo: "Z2",
      nombre: "Zoom Este",
      estado: "Miranda",
      ciudad: "Petare",
      direccion: "Redoma",
      telefono: "02121111111",
      horario: "8-5",
      lat: 10.48,
      lng: -66.8,
      activa: true,
    },
  ];

  const resS1 = await sincronizarEmpresa("zoom", itemsS1, Sucursal, false);
  assert.strictEqual(resS1.activasGuardadas, 2);
  let totalBd = await Sucursal.countDocuments({ empresa: "zoom", activa: true });
  assert.strictEqual(totalBd, 2, "Debe haber 2 sucursales activas");

  // Upsert sin duplicar y desactivación de ausentes
  const itemsS2 = [
    {
      empresa: "zoom",
      codigo: "Z1",
      nombre: "Zoom Centro Modificada",
      estado: "Distrito Capital",
      ciudad: "Caracas",
      direccion: "Av. Baralt Nueva",
      telefono: "02120000000",
      horario: "8-5",
      lat: 10.5,
      lng: -66.9,
      activa: true,
    },
    // Z2 ya no viene; debe desactivarse
  ];

  const resS2 = await sincronizarEmpresa("zoom", itemsS2, Sucursal, false);
  assert.strictEqual(resS2.desactivadas, 1, "Debe desactivar Z2");
  totalBd = await Sucursal.countDocuments({ empresa: "zoom", activa: true });
  assert.strictEqual(totalBd, 1, "Debe quedar 1 activa");
  const docZ2 = await Sucursal.findOne({ empresa: "zoom", codigo: "Z2" });
  assert.strictEqual(docZ2.activa, false, "Z2 debe estar inactiva");
  const docZ1 = await Sucursal.findOne({ empresa: "zoom", codigo: "Z1" });
  assert.strictEqual(docZ1.nombre, "Zoom Centro Modificada", "Z1 debe actualizarse sin duplicar");

  // Umbral de seguridad: respuesta vacía no toca la BD
  const resVacia = await sincronizarEmpresa("zoom", [], Sucursal, false);
  assert.strictEqual(resVacia.omitidaPorError, true);
  totalBd = await Sucursal.countDocuments({ empresa: "zoom", activa: true });
  assert.strictEqual(totalBd, 1, "No debe alterar BD ante respuesta vacía");

  // Umbral de seguridad: respuesta con menos de la mitad previa
  // Insertemos 10 sucursales previas para probar umbral
  await Sucursal.deleteMany({});
  for (let i = 1; i <= 10; i++) {
    await Sucursal.findOneAndUpdate(
      { empresa: "mrw", codigo: `M${i}` },
      { $set: { empresa: "mrw", codigo: `M${i}`, activa: true, estado: "Zulia" } },
      { upsert: true }
    );
  }
  const itemsPocos = [
    {
      empresa: "mrw",
      codigo: "M1",
      nombre: "M1",
      estado: "Zulia",
      ciudad: "MCBO",
      direccion: "Dir",
      telefono: "",
      horario: "",
      lat: null,
      lng: null,
      activa: true,
    },
    {
      empresa: "mrw",
      codigo: "M2",
      nombre: "M2",
      estado: "Zulia",
      ciudad: "MCBO",
      direccion: "Dir",
      telefono: "",
      horario: "",
      lat: null,
      lng: null,
      activa: true,
    },
  ];
  // 2 es menos de la mitad de 10 (5)
  const resPocos = await sincronizarEmpresa("mrw", itemsPocos, Sucursal, false);
  assert.strictEqual(resPocos.omitidaPorError, true, "Debe abortar si viene menos del 50%");
  const activasMrw = await Sucursal.countDocuments({ empresa: "mrw", activa: true });
  assert.strictEqual(activasMrw, 10, "Las 10 sucursales previas deben seguir activas");

  // Modo --simular no escribe
  const itemsSimular = [{ empresa: "tealca", codigo: "T1", nombre: "T1", estado: "Lara", ciudad: "BQTO", direccion: "Dir", telefono: "", horario: "", lat: null, lng: null, activa: true }];
  const resSim = await sincronizarEmpresa("tealca", itemsSimular, Sucursal, true);
  assert.strictEqual(resSim.omitidaPorError, false);
  const countTealca = await Sucursal.countDocuments({ empresa: "tealca" });
  assert.strictEqual(countTealca, 0, "--simular no debe escribir registros en BD");

  // Protección contra escritura remota sin --confirmar (Claude, F2n corrección y bypass fix)
  assert.strictEqual(esBaseLocal("mongodb://127.0.0.1:27017/ventimax"), true);
  assert.strictEqual(esBaseLocal("mongodb://localhost:27017/ventimax"), true);
  assert.strictEqual(esBaseLocal("mongodb://127.0.0.1:27017/x"), true);
  assert.strictEqual(esBaseLocal("mongodb://localhost/x"), true);
  assert.strictEqual(esBaseLocal("mongodb+srv://admin:pass@atlas.mongodb.net/ventimax"), false);
  assert.strictEqual(esBaseLocal("mongodb://servidor-remoto.com:27017/ventimax"), false);

  // Casos de bypass prevenidos (Claude, 2026-11-01):
  assert.strictEqual(
    esBaseLocal("mongodb+srv://u:localhost@cluster.mongodb.net/ventimax"),
    false,
    "localhost en password/user no debe considerarse local"
  );
  assert.strictEqual(
    esBaseLocal("mongodb+srv://u:p@cluster.mongodb.net/ventimax?appName=localhost"),
    false,
    "localhost en query param no debe considerarse local"
  );
  assert.strictEqual(
    esBaseLocal("mongodb+srv://u:p@cluster.mongodb.net/ventimax?x=127.0.0.1"),
    false,
    "127.0.0.1 en query param no debe considerarse local"
  );
  assert.strictEqual(
    esBaseLocal("mongodb://u@evil.com@localhost/x"),
    false,
    "Múltiples @ en la autoridad es ambiguo y debe ser false"
  );

  const permisoLocal = validarPermisoEjecucion({ uri: "mongodb://127.0.0.1:27017/ventimax", simular: false, confirmar: false });
  assert.strictEqual(permisoLocal.ok, true, "Base local no requiere flag confirmar");

  const permisoRemotoSimular = validarPermisoEjecucion({ uri: "mongodb+srv://atlas.mongodb.net/ventimax", simular: true, confirmar: false });
  assert.strictEqual(permisoRemotoSimular.ok, true, "Modo simular no escribe y se permite en cualquier base");

  const permisoRemotoSinConfirmar = validarPermisoEjecucion({ uri: "mongodb+srv://atlas.mongodb.net/ventimax", simular: false, confirmar: false });
  assert.strictEqual(permisoRemotoSinConfirmar.ok, false, "Base remota sin confirmar debe ser rechazada");
  assert.match(permisoRemotoSinConfirmar.motivo || "", /--confirmar/, "Motivo debe indicar que falta --confirmar");

  const permisoRemotoConfirmado = validarPermisoEjecucion({ uri: "mongodb+srv://atlas.mongodb.net/ventimax", simular: false, confirmar: true });
  assert.strictEqual(permisoRemotoConfirmado.ok, true, "Base remota con flag confirmar debe ser permitida");

  // Prueba CLI en subproceso: ejecutar sync-sucursales contra base remota sin --confirmar aborta con código 1 sin escribir
  const { execSync } = require("node:child_process");
  try {
    execSync("npx tsx scripts/sync-sucursales.ts", {
      env: { ...process.env, MONGODB_URI: "mongodb+srv://cluster-fake.mongodb.net/ventimax_prod" },
      stdio: "pipe",
    });
    assert.fail("Debió fallar la ejecución contra base remota sin flag --confirmar");
  } catch (err: any) {
    assert.strictEqual(err.status, 1, "Debe salir con código de error 1");
    const stderr = err.stderr ? err.stderr.toString("utf8") : "";
    assert.match(stderr, /--confirmar/, "El stderr debe indicar que se exige --confirmar");
  }
  console.log("  ✅ Salvaguarda remota: exige --confirmar para cualquier URI no local (aborta antes de conectar)");
  console.log("  ✅ Sincronización: upsert, preservación de datos, desactivación y protección contra caídas");

  /* ==============================================================================
   * 3. API pública: GET /api/public/sucursales/estados y GET /api/public/sucursales
   * ============================================================================== */
  console.log("\n3. Endpoints de la API pública");

  // Preparar sucursales de prueba
  await Sucursal.deleteMany({});
  await Sucursal.create([
    {
      empresa: "zoom",
      codigo: "Z-01",
      nombre: "Oficina Bella Vista",
      estado: "Zulia",
      ciudad: "Maracaibo",
      direccion: "Av. Bella Vista",
      telefono: "02611111111",
      horario: "8am - 5pm",
      lat: 10.65,
      lng: -71.62,
      activa: true,
    },
    {
      empresa: "zoom",
      codigo: "Z-02",
      nombre: "Oficina 5 de Julio",
      estado: "Zulia",
      ciudad: "Maracaibo",
      direccion: "Calle 77",
      telefono: "02612222222",
      horario: "8am - 5pm",
      lat: 10.66,
      lng: -71.61,
      activa: true,
    },
    {
      empresa: "zoom",
      codigo: "Z-03",
      nombre: "Oficina Sabana Grande",
      estado: "Distrito Capital",
      ciudad: "Caracas",
      direccion: "Bulevar Sabana Grande",
      telefono: "02123333333",
      horario: "8am - 5pm",
      lat: 10.49,
      lng: -66.87,
      activa: true,
    },
    {
      empresa: "zoom",
      codigo: "Z-04",
      nombre: "Oficina Inactiva",
      estado: "Zulia",
      ciudad: "Cabimas",
      direccion: "Cerrada",
      telefono: "",
      horario: "",
      lat: 10.4,
      lng: -71.4,
      activa: false, // inactiva
    },
  ]);

  // GET /api/public/sucursales/estados?empresa=zoom
  {
    const { res, out } = mockRes();
    await publicController.getSucursalesEstados({ query: { empresa: "zoom" } }, res);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.headers["cache-control"], "public, max-age=3600");
    assert.deepStrictEqual(out.json, [
      { estado: "Distrito Capital", cantidad: 1 },
      { estado: "Zulia", cantidad: 2 },
    ]);
  }

  // GET /api/public/sucursales/estados con empresa desconocida -> 400
  {
    const { res, out } = mockRes();
    await publicController.getSucursalesEstados({ query: { empresa: "dhl" } }, res);
    assert.strictEqual(out.status, 400);
  }

  // GET /api/public/sucursales?empresa=zoom&estado=Zulia
  {
    const { res, out } = mockRes();
    await publicController.getSucursales({ query: { empresa: "zoom", estado: "Zulia" } }, res);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.headers["cache-control"], "public, max-age=3600");
    assert.strictEqual(out.json.length, 2, "Solo debe devolver las 2 activas");

    const primera = out.json[0];
    assert.strictEqual(primera.id, "zoom-Z-02"); // Ordenado por ciudad y nombre
    assert.strictEqual(primera.codigo, "Z-02");
    assert.strictEqual(primera.nombre, "Oficina 5 de Julio");
    assert.strictEqual(primera.ciudad, "Maracaibo");
    assert.strictEqual(primera.direccion, "Calle 77");
    assert.strictEqual(primera.telefono, "02612222222");
    assert.strictEqual(primera.horario, "8am - 5pm");

    // Verificación de lista blanca: SIN _id, SIN coordenadas
    assert.strictEqual(primera._id, undefined, "Lista blanca: no debe exponer _id");
    assert.strictEqual(primera.lat, undefined, "Lista blanca: no debe exponer lat");
    assert.strictEqual(primera.lng, undefined, "Lista blanca: no debe exponer lng");
  }

  // GET /api/public/sucursales con estado o empresa inválidos -> 400
  {
    const { res, out } = mockRes();
    await publicController.getSucursales({ query: { empresa: "zoom", estado: "EstadoInventado" } }, res);
    assert.strictEqual(out.status, 400);
  }

  // GET /api/public/info: conSucursales solo si hay activas
  {
    await MetodoEnvio.deleteMany({});
    await MetodoEnvio.create({
      _id: "507f1f77bcf86cd799439011",
      nombre: "Envíos Nacionales",
      tipo: "envio_nacional",
      activo: true,
      empresas: [
        { nombre: "Zoom Envíos", logoUrl: "https://res.cloudinary.com/test/zoom.png", slug: "zoom" },
        { nombre: "MRW Express", logoUrl: "https://res.cloudinary.com/test/mrw.png", slug: "mrw" }, // MRW no tiene sucursales activas en BD
        { nombre: "Domesa", logoUrl: "", slug: "" }, // Sin slug
      ],
    });

    const { res, out } = mockRes();
    await publicController.getInfo({}, res);
    assert.strictEqual(out.status, 200);
    const mEnvio = out.json.envios.find((m: any) => m.tipo === "envio_nacional");
    assert(mEnvio, "Debe existir método envio_nacional");

    const zoomOpt = mEnvio.empresas.find((e: any) => e.nombre === "Zoom Envíos");
    assert.strictEqual(zoomOpt.slug, "zoom");
    assert.strictEqual(zoomOpt.conSucursales, true, "Zoom debe tener conSucursales: true");

    const mrwOpt = mEnvio.empresas.find((e: any) => e.nombre === "MRW Express");
    assert.strictEqual(mrwOpt.conSucursales, undefined, "MRW sin sucursales activas no debe tener conSucursales");
    assert.strictEqual(mrwOpt.slug, undefined, "MRW sin sucursales activas no debe exponer slug");
  }
  console.log("  ✅ API pública: estados, sucursales (whitelist sin _id ni coords) y conSucursales en /info");

  /* ==============================================================================
   * 4. Pedido: validación en POST /api/public/pedidos
   * ============================================================================== */
  console.log("\n4. Validación de sucursal en pedidos web");

  const prod1 = await Producto.create({
    id: "prod-test-01",
    name: "Ventilador N21",
    price: 25,
    activo: true,
    stock: 10,
    categoria: "Mesa",
  });

  const mNacional = await MetodoEnvio.findOne({ tipo: "envio_nacional" });

  // Caso 1: Empresa con sucursales sin enviar sucursalId -> 400
  {
    const { res, out } = mockRes();
    await publicController.postPedidoWeb(
      {
        body: {
          items: [{ productoId: String(prod1.id), cantidad: 1 }],
          website: "",
          entrega: {
            metodoId: String(mNacional._id),
            empresa: "Zoom Envíos",
            // Falta sucursalId
          },
        },
      },
      res
    );
    assert.strictEqual(out.status, 400);
    assert(out.json.error.includes("sucursal"), "Debe exigir sucursal");
  }

  // Caso 2: Sucursal inexistente o inactiva -> 400
  {
    const { res, out } = mockRes();
    await publicController.postPedidoWeb(
      {
        body: {
          items: [{ productoId: String(prod1.id), cantidad: 1 }],
          website: "",
          entrega: {
            metodoId: String(mNacional._id),
            empresa: "Zoom Envíos",
            sucursalId: "zoom-Z-04", // Es la inactiva
          },
        },
      },
      res
    );
    assert.strictEqual(out.status, 400);
  }

  // Caso 3: Sucursal de otra empresa -> 400
  {
    await Sucursal.create({
      empresa: "tealca",
      codigo: "T-99",
      nombre: "Tealca San Cristóbal",
      estado: "Táchira",
      ciudad: "San Cristóbal",
      direccion: "Av. Carabobo",
      activa: true,
    });

    const { res, out } = mockRes();
    await publicController.postPedidoWeb(
      {
        body: {
          items: [{ productoId: String(prod1.id), cantidad: 1 }],
          website: "",
          entrega: {
            metodoId: String(mNacional._id),
            empresa: "Zoom Envíos",
            sucursalId: "tealca-T-99", // Empresa no coincide
          },
        },
      },
      res
    );
    assert.strictEqual(out.status, 400);
    assert(out.json.error.includes("no pertenece a la empresa"), "Debe rechazar sucursal cruzada");
  }

  // Caso 4: Sucursal válida -> guarda CarritoWeb.entrega.sucursal y genera prefill con sucursal
  {
    const { res, out } = mockRes();
    await publicController.postPedidoWeb(
      {
        body: {
          items: [{ productoId: String(prod1.id), cantidad: 1 }],
          website: "",
          entrega: {
            metodoId: String(mNacional._id),
            empresa: "Zoom Envíos",
            sucursalId: "zoom-Z-01",
            direccion: "Dirección falsa enviada por navegador para hackear",
          },
        },
      },
      res
    );
    assert.strictEqual(out.status, 200);
    assert(out.json.codigo);

    const cw = await CarritoWeb.findOne({ codigo: out.json.codigo });
    assert(cw, "Debe existir CarritoWeb guardado");
    assert.strictEqual(cw.entrega.sucursal.codigo, "Z-01");
    assert.strictEqual(cw.entrega.sucursal.nombre, "Oficina Bella Vista");
    assert.strictEqual(cw.entrega.sucursal.ciudad, "Maracaibo");
    assert.strictEqual(cw.entrega.sucursal.estado, "Zulia");
    assert.strictEqual(
      cw.entrega.direccion,
      "Av. Bella Vista",
      "Debe usar la dirección oficial de la sucursal ignorando la del navegador"
    );

    // Enlace de WhatsApp
    const waUrl = decodeURIComponent(out.json.enlaceWhatsApp);
    assert(waUrl.includes("Sucursal: ZOOM Z-01 — Oficina Bella Vista, Maracaibo (Zulia)"));
    assert(waUrl.includes("Dirección: Av. Bella Vista"));
  }
  console.log("  ✅ Pedido: validación estricta de empresa-sucursal, guarda oficial y arma WhatsApp prefill");

  /* ==============================================================================
   * 5. Bot WhatsApp: procesar pedido web con sucursal
   * ============================================================================== */
  console.log("\n5. Flujo del bot de WhatsApp");

  const cwGuardado = await CarritoWeb.findOne({ "entrega.sucursal.codigo": "Z-01" });

  // Bot con sucursal activa: no vuelve a pedir la ubicación ni la empresa
  {
    const carritoTest: any = { items: [] };
    const lineas = await chatFlowService.aplicarEntregaWeb(
      carritoTest,
      cwGuardado.entrega,
      "584120000000",
      null
    );

    assert(lineas.some((l: string) => l.includes("ZOOM Z-01 — Oficina Bella Vista")));
    assert.strictEqual(carritoTest.envio.sucursal.codigo, "Z-01");
    assert.strictEqual(carritoTest.envio.desdeWeb, true, "desdeWeb debe ser true si la sucursal es válida");
    assert.strictEqual(carritoTest.direccion_manual, "Av. Bella Vista");
  }

  // Bot con sucursal que fue desactivada después de crear el carrito web:
  {
    // Desactivar Z-01
    await Sucursal.updateOne({ empresa: "zoom", codigo: "Z-01" }, { $set: { activa: false } });

    let msgEnviado = "";
    const mockChatFlow = Object.create(chatFlowService);
    mockChatFlow.enviarYRegistrar = async (_to: string, payload: any) => {
      msgEnviado = payload.texto;
    };

    const carritoDesactivado: any = { items: [] };
    const lineasDesc = await mockChatFlow.aplicarEntregaWeb(
      carritoDesactivado,
      cwGuardado.entrega,
      "584120000000",
      null
    );

    assert(msgEnviado.includes("ya no está disponible"), "Debe notificar al cliente");
    assert.strictEqual(carritoDesactivado.envio.desdeWeb, false, "desdeWeb debe ser false para pedir datos");
    assert.strictEqual(carritoDesactivado.envio.sucursal, null, "sucursal debe ser null");
  }
  console.log("  ✅ Bot: retiene sucursal si está activa; si fue desactivada avisa y pide datos al cliente");

  /* ==============================================================================
   * 6. Lógica pura de sucursales en la tienda (sucursales.js y entrega.js)
   * ============================================================================== */
  console.log("\n6. Lógica de la tienda (sucursales.js y entrega.js)");

  const metodoTienda = {
    id: "m-nac",
    tipo: "envio_nacional",
    empresas: [
      { nombre: "Zoom", conSucursales: true, slug: "zoom" },
      { nombre: "Domesa", conSucursales: false },
    ],
  };

  assert.strictEqual(empresaTieneSucursales(metodoTienda, "Zoom"), true);
  assert.strictEqual(empresaTieneSucursales(metodoTienda, "Domesa"), false);
  assert.strictEqual(slugEmpresa(metodoTienda, "Zoom"), "zoom");
  assert.strictEqual(slugEmpresa(metodoTienda, "Domesa"), "");

  assert.strictEqual(validarSucursalId("zoom-1234"), true);
  assert.strictEqual(validarSucursalId("tealca-T-01"), true);
  assert.strictEqual(validarSucursalId("Invalida!"), false);
  assert.strictEqual(validarSucursalId(""), false);

  assert.strictEqual(formatearOpcionEstado("Zulia", 45), "Zulia (45)");
  assert.strictEqual(
    formatearOpcionSucursal({ codigo: "101", nombre: "Centro", ciudad: "Caracas" }),
    "101 · Centro — Caracas"
  );
  assert.strictEqual(
    formatearDetalleSucursal({ codigo: "101", nombre: "Centro", ciudad: "Caracas", direccion: "Av. Principal" }),
    "101 · Centro (Av. Principal)"
  );

  const stateEntrega = {
    estadoSucursal: "Zulia",
    sucursalId: "zoom-101",
    sucursal: { id: "zoom-101" },
    sucursalesFallo: false,
  };
  limpiarCascadaAlCambiarEstado(stateEntrega);
  assert.strictEqual(stateEntrega.sucursalId, "");
  assert.strictEqual(stateEntrega.sucursal, null);
  assert.strictEqual(stateEntrega.estadoSucursal, "Zulia");

  limpiarCascadaAlCambiarEmpresa(stateEntrega);
  assert.strictEqual(stateEntrega.estadoSucursal, "");

  // Validación de completitud
  const seleccionIncompleta: any = {
    metodo: metodoTienda,
    empresa: "Zoom",
    sucursalId: "",
  };
  assert.strictEqual(entregaConSucursalCompleta(seleccionIncompleta), false);
  assert.strictEqual(entregaCompleta(seleccionIncompleta), false);

  const seleccionCompleta: any = {
    metodo: metodoTienda,
    empresa: "Zoom",
    sucursalId: "zoom-101",
    sucursal: { id: "zoom-101", nombre: "Oficina 101" },
    direccion: "Av. Principal",
  };
  assert.strictEqual(entregaConSucursalCompleta(seleccionCompleta), true);
  assert.strictEqual(entregaCompleta(seleccionCompleta), true);

  const payloadArmado = armarEntrega(seleccionCompleta);
  assert.strictEqual(payloadArmado.sucursalId, "zoom-101");
  assert.strictEqual(payloadArmado.empresa, "Zoom");

  // Fallo de API -> permite continuar con texto libre >= 8 chars
  const seleccionConFallo: any = {
    metodo: metodoTienda,
    empresa: "Zoom",
    sucursalesFallo: true,
    direccion: "Av. Las Delicias frente al banco",
  };
  assert.strictEqual(entregaConSucursalCompleta(seleccionConFallo), true);
  assert.strictEqual(entregaCompleta(seleccionConFallo), true);
  console.log("  ✅ Tienda: funciones sin DOM, cascada, validación y fallback ante fallo de API");

  /* ==============================================================================
   * 7. Verificación de integridad del código (sin innerHTML con datos, sin marcas escritas)
   * ============================================================================== */
  console.log("\n7. Verificación de integridad y seguridad");

  const contenidoAppJs = fs.readFileSync(path.join(__dirname, "../catalogo/js/app.js"), "utf8");
  const contenidoSucursalesJs = fs.readFileSync(path.join(__dirname, "../catalogo/js/sucursales.js"), "utf8");

  assert(!contenidoSucursalesJs.includes("innerHTML"), "sucursales.js no debe manipular DOM");

  // Verificar que ningún texto de marca concreta quede como respaldo en sucursales.js
  const regexMarca = /VentiMax|Mr\. Pachi|Yuri-Bot/i;
  assert(!regexMarca.test(contenidoSucursalesJs), "sucursales.js no debe contener nombres de marcas");

  console.log("  ✅ Código limpio: sin innerHTML con datos dinámicos ni marcas fijas en código");

  console.log("\n🎉 TODOS LOS TESTS DE SUCURSALES (F2N) PASARON EXITOSAMENTE.");
}

runTests().catch((err) => {
  console.error("❌ Error en suite test-sucursales.ts:", err);
  process.exit(1);
});
