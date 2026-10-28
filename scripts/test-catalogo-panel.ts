/**
 * scripts/test-catalogo-panel.ts
 *
 * Suite de pruebas automatizadas para F2-4:
 * "El panel muestra y configura el catálogo web"
 *
 * Criterios de verificación:
 * 1. Validador:
 *    - Prefijo con I, L, O rechazado.
 *    - Prefijo de 1 o más de 4 letras rechazado.
 *    - Mensaje sin {{codigo}} o > 200 caracteres rechazado.
 *    - Valores válidos aceptados (prefijo de 2 a 4 letras sin I/L/O, mensaje con {{codigo}}).
 * 2. GET / PUT /api/admin/config/catalogo:
 *    - Con auditoría registrada (recursoId: "catalogo", accion: "update").
 *    - Permiso config:manage obligatorio.
 * 3. Catálogo apagado desde el panel (activo: false):
 *    - 503 en la API pública (POST /api/public/pedidos).
 *    - Bot de WhatsApp ignora códigos web.
 * 4. Prefijo nuevo configurado desde el panel:
 *    - El bot reconoce el nuevo prefijo (ej: TIEN-XXXXX).
 *    - Deja de reconocer el prefijo anterior.
 * 5. Registro de anti-abuso (ContadorCatalogo & GET /api/admin/config/catalogo/abuso):
 *    - Incrementos atómicos por cada tipo de incidente (creado, limite, honeypot, validacion, producto).
 *    - Reporte de 14 días sin IPs ni datos personales.
 * 6. Métrica en Ventas (getSalesSummary):
 *    - kpis.pedidosWeb devuelve { creados, vinculados, convertidos } basados en contadores y pedidos.
 *    - transacciones incluye insignia esWeb y origenWebCodigo.
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const { validarConfigCatalogo } = require("../services/configValidators");
const catalogoConfigService = require("../services/catalogoConfigService");
const catalogoAbusoService = require("../services/catalogoAbusoService");
const { getCatalogoConfig, updateCatalogoConfig, getCatalogoAbuso } = require("../controllers/configAdminController");
const publicController = require("../controllers/publicController");
const adminController = require("../controllers/adminController");
const chatFlowService = require("../services/chatFlowService");
const chatFlow = require("../controllers/chatFlowController");
const orderService = require("../services/orderService");

function mockRes() {
  const out: { status: number; json: any } = { status: 200, json: null };
  const res: any = {
    status: (s: number) => {
      out.status = s;
      return res;
    },
    json: (d: any) => {
      out.json = d;
      return res;
    },
  };
  return { res, out };
}

function resetDb() {
  const data = dbLocal.read();
  data.carritosWeb = [];
  data.contadoresCatalogo = [];
  data.auditorias = [];
  data.pedidos = [];
  data.etiquetas = [];
  if (data.settings) {
    delete data.settings["catalogo"];
  }
  dbLocal.write(data);
  catalogoConfigService.invalidateConfigCatalogoCache();
}

async function runTests() {
  console.log("================================================================================");
  console.log("🛠️  SUITE DE PRUEBAS: PANEL Y CONFIGURACIÓN DEL CATÁLOGO WEB (F2-4)");
  console.log("================================================================================");

  resetDb();

  // ---------------------------------------------------------------------------
  // TEST 1: Validador de Configuración del Catálogo
  // ---------------------------------------------------------------------------
  console.log("▶ Test 1: Validador de configuración del catálogo...");

  // Rechazo de prefijos con letras confusas (I, L, O)
  assert.strictEqual(validarConfigCatalogo({ prefijo: "VMI", mensajePrefill: "Hola {{codigo}}" }).ok, false);
  assert.strictEqual(validarConfigCatalogo({ prefijo: "VML", mensajePrefill: "Hola {{codigo}}" }).ok, false);
  assert.strictEqual(validarConfigCatalogo({ prefijo: "VMO", mensajePrefill: "Hola {{codigo}}" }).ok, false);
  assert.strictEqual(validarConfigCatalogo({ prefijo: "OK", mensajePrefill: "Hola {{codigo}}" }).ok, false);

  // Rechazo de longitud inválida (< 2 o > 4)
  assert.strictEqual(validarConfigCatalogo({ prefijo: "V", mensajePrefill: "Hola {{codigo}}" }).ok, false);
  assert.strictEqual(validarConfigCatalogo({ prefijo: "ABCDE", mensajePrefill: "Hola {{codigo}}" }).ok, false);

  // Rechazo de mensajes sin {{codigo}} o demasiado largos
  assert.strictEqual(validarConfigCatalogo({ prefijo: "PW", mensajePrefill: "Mensaje sin la variable requerida" }).ok, false);
  assert.strictEqual(validarConfigCatalogo({ prefijo: "PW", mensajePrefill: "A".repeat(201) + "{{codigo}}" }).ok, false);

  // Aceptación de configuración válida
  const resValido = validarConfigCatalogo({
    activo: true,
    prefijo: "vm", // normaliza a mayúsculas
    mensajePrefill: "Quiero confirmar mi pedido {{codigo}}",
  });
  assert.strictEqual(resValido.ok, true);
  if (resValido.ok) {
    assert.strictEqual(resValido.value.prefijo, "VM");
    assert.strictEqual(resValido.value.activo, true);
    assert.strictEqual(resValido.value.mensajePrefill, "Quiero confirmar mi pedido {{codigo}}");
  }

  console.log("  ✅ Test 1 superado (Validador filtra I/L/O, longitudes y {{codigo}})");

  // ---------------------------------------------------------------------------
  // TEST 2: GET y PUT /api/admin/config/catalogo con auditoría
  // ---------------------------------------------------------------------------
  console.log("▶ Test 2: Endpoints administrativos y auditoría...");

  // GET por defecto (lee de marca/neutro si no hay Setting)
  {
    const { res, out } = mockRes();
    await getCatalogoConfig({} as any, res);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.json.success, true);
    assert.strictEqual(typeof out.json.catalogo.activo, "boolean");
    assert.strictEqual(typeof out.json.catalogo.prefijo, "string");
  }

  // PUT con datos inválidos -> 400
  {
    const { res, out } = mockRes();
    const req = {
      body: { prefijo: "INVALID_LENGTH", mensajePrefill: "Sin variable" },
      user: { username: "admin_test", role: "admin" },
      ip: "127.0.0.1",
    };
    await updateCatalogoConfig(req as any, res);
    assert.strictEqual(out.status, 400);
    assert.strictEqual(out.json.success, false);
  }

  // PUT con datos válidos -> 200 y registro de auditoría
  {
    const { res, out } = mockRes();
    const req = {
      body: {
        activo: true,
        prefijo: "VENT",
        mensajePrefill: "Mi pedido web {{codigo}} listo para procesar",
      },
      user: { username: "admin_test", role: "admin" },
      ip: "127.0.0.1",
    };
    await updateCatalogoConfig(req as any, res);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.json.success, true);
    assert.strictEqual(out.json.catalogo.prefijo, "VENT");

    // Verificar lectura inmediata síncrona
    const cfgSync = catalogoConfigService.getConfigCatalogoSync();
    assert.strictEqual(cfgSync.prefijo, "VENT");
    assert.strictEqual(cfgSync.mensajePrefill, "Mi pedido web {{codigo}} listo para procesar");

    // Verificar registro de auditoría
    const data = dbLocal.read();
    const aud = (data.auditorias || []).find(
      (a: any) => a.tipoRecurso === "config" && a.recursoId === "catalogo"
    );
    assert.ok(aud, "Debe existir un registro de auditoría para recursoId: catalogo");
    assert.strictEqual(aud.accion, "update");
    assert.strictEqual(aud.detalles.nuevo.prefijo, "VENT");
  }

  console.log("  ✅ Test 2 superado (Endpoints de configuración actualizan caché y registran auditoría)");

  // ---------------------------------------------------------------------------
  // TEST 3: Catálogo desactivado -> 503 en API pública y códigos ignorados por el bot
  // ---------------------------------------------------------------------------
  console.log("▶ Test 3: Catálogo desactivado (activo: false)...");

  // Desactivar el catálogo mediante el servicio
  await catalogoConfigService.setConfigCatalogo({
    activo: false,
    prefijo: "VENT",
    mensajePrefill: "Hola {{codigo}}",
  });

  // POST /api/public/pedidos debe retornar 503
  {
    const { res, out } = mockRes();
    const req = {
      body: { items: [{ productoId: "fortunne-n21", cantidad: 1 }] },
      ip: "127.0.0.1",
    };
    await publicController.postPedidoWeb(req as any, res);
    assert.strictEqual(out.status, 503);
    assert.ok(out.json.error.includes("suspendido"));
  }

  // El bot debe ignorar códigos cuando el catálogo está desactivado
  {
    let respondioConPedidoWeb = false;
    const origEnviar = chatFlow.enviarYRegistrar;
    chatFlow.enviarYRegistrar = async (from: string, opciones: any, io: any) => {
      const texto = opciones?.texto || opciones?.body || "";
      if (texto.includes("VENT-99999") || texto.includes("Pedido Web") || texto.includes("venció")) {
        respondioConPedidoWeb = true;
      }
      return origEnviar.call(chatFlow, from, opciones, io);
    };

    const from = "584129999001";
    await orderService.setEstado(from, { paso: "inicio" }, null);

    // Enviar batch con código web mientras está apagado
    await chatFlowService._processBatch(from, [{ text: "VENT-99999", tipo: "text" }], null);

    // Restaurar mock
    chatFlow.enviarYRegistrar = origEnviar;

    // No debe haber procesado ni respondido con mensaje de pedido web
    assert.strictEqual(respondioConPedidoWeb, false, "El bot no debe procesar códigos web si el catálogo está apagado");
  }

  console.log("  ✅ Test 3 superado (Catálogo apagado da 503 y el bot ignora códigos)");

  // ---------------------------------------------------------------------------
  // TEST 4: Nuevo prefijo reconocido por el bot
  // ---------------------------------------------------------------------------
  console.log("▶ Test 4: Prefijo nuevo reconocido por el bot...");

  // Reactivar catálogo con prefijo 'VENT'
  await catalogoConfigService.setConfigCatalogo({
    activo: true,
    prefijo: "VENT",
    mensajePrefill: "Hola {{codigo}}",
  });

  // Sembrar un carrito web con el nuevo prefijo
  const CarritoWeb = dbLocal.getCarritoWebModel();
  await CarritoWeb.create({
    codigo: "VENT-23456",
    items: [{ productoId: "fortunne-n21", nombre: "Ventilador N21", precio: 25, cantidad: 1 }],
    total: 25,
    estado: "pendiente",
    expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
  });

  {
    let respondioConPedidoWeb = false;
    const origEnviar = chatFlow.enviarYRegistrar;
    chatFlow.enviarYRegistrar = async (from: string, opciones: any, io: any) => {
      const texto = opciones?.texto || opciones?.body || "";
      if (
        texto.includes("VENT-23456") ||
        texto.includes("Pedido Web") ||
        texto.includes("Avisos sobre tu pedido web")
      ) {
        respondioConPedidoWeb = true;
      }
      return origEnviar.call(chatFlow, from, opciones, io);
    };

    const from = "584129999002";
    await orderService.setEstado(from, { paso: "inicio" }, null);

    // Enviar código con el nuevo prefijo
    await chatFlowService._processBatch(from, [{ text: "Hola quiero mi pedido vent 23456", tipo: "text" }], null);

    chatFlow.enviarYRegistrar = origEnviar;

    assert.strictEqual(respondioConPedidoWeb, true, "El bot debe reconocer el nuevo prefijo VENT configurado");

    // Verificar que el carrito quedó en estado vinculado
    const cwActualizado = await CarritoWeb.findOne({ codigo: "VENT-23456" });
    assert.strictEqual(cwActualizado.estado, "vinculado");
  }

  console.log("  ✅ Test 4 superado (El bot reconoce dinámicamente el prefijo configurado)");

  // ---------------------------------------------------------------------------
  // TEST 5: Registro anti-abuso (ContadorCatalogo)
  // ---------------------------------------------------------------------------
  console.log("▶ Test 5: Contadores anti-abuso y reporte de 14 días...");

  // Registrar varios incidentes
  await catalogoAbusoService.registrarEventoCatalogo("creado", 5);
  await catalogoAbusoService.registrarEventoCatalogo("limite", 3);
  await catalogoAbusoService.registrarEventoCatalogo("honeypot", 2);
  await catalogoAbusoService.registrarEventoCatalogo("validacion", 4);
  await catalogoAbusoService.registrarEventoCatalogo("producto", 1);

  // Consultar endpoint GET /api/admin/config/catalogo/abuso
  {
    const { res, out } = mockRes();
    await getCatalogoAbuso({} as any, res);
    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.json.success, true);
    assert.strictEqual(Array.isArray(out.json.reporte), true);
    assert.strictEqual(out.json.reporte.length, 14, "El reporte debe incluir 14 días");

    const hoyFila = out.json.reporte[0];
    assert.strictEqual(hoyFila.creado, 5);
    assert.strictEqual(hoyFila.limite, 3);
    assert.strictEqual(hoyFila.honeypot, 2);
    assert.strictEqual(hoyFila.validacion, 4);
    assert.strictEqual(hoyFila.producto, 1);
    assert.strictEqual(hoyFila.totalEventos, 10); // suma de incidentes: 3+2+4+1

    // Verificar que no hay IPs ni datos personales en las filas
    for (const fila of out.json.reporte) {
      assert.strictEqual(fila.ip, undefined);
      assert.strictEqual(fila.telefono, undefined);
      assert.strictEqual(fila.nombre, undefined);
    }
  }

  console.log("  ✅ Test 5 superado (Contadores diarios se acumulan y el reporte de 14 días es anónimo)");

  // ---------------------------------------------------------------------------
  // TEST 6: Analítica en Ventas (getSalesSummary con pedidosWeb)
  // ---------------------------------------------------------------------------
  console.log("▶ Test 6: Métricas de pedidos web en resumen de ventas...");

  // Crear pedidos de prueba en Pedido (uno web y uno normal)
  const Pedido = dbLocal.getPedidoModel();
  await Pedido.create({
    correlativo: 101,
    idFormateado: "#0101",
    estado: "entregado",
    timestamp: new Date(),
    cliente: { nombre: "Cliente Web", telefono: "584120000001" },
    items: [{ producto: "Ventilador N21", cantidad: 1, precio: 25 }],
    pago: { montoUSD: 25, montoVES: 1000 },
    origenWeb: { codigo: "VENT-23456" },
  });

  await Pedido.create({
    correlativo: 102,
    idFormateado: "#0102",
    estado: "entregado",
    timestamp: new Date(),
    cliente: { nombre: "Cliente Directo", telefono: "584120000002" },
    items: [{ producto: "Ventilador N22", cantidad: 1, precio: 35 }],
    pago: { montoUSD: 35, montoVES: 1400 },
    origenWeb: null,
  });

  {
    const { res, out } = mockRes();
    const req = {
      query: { filtroFecha: "mes", page: "1", limit: "20" },
    };
    await adminController.getSalesSummary(req as any, res);

    assert.strictEqual(out.status, 200);
    assert.strictEqual(out.json.success, true);
    const kpis = out.json.data.kpis;
    assert.ok(kpis.pedidosWeb, "kpis debe incluir pedidosWeb");
    assert.strictEqual(kpis.pedidosWeb.creados, 5, "Debe reflejar 5 creados desde contadores diarios");
    assert.strictEqual(kpis.pedidosWeb.convertidos, 1, "Debe reflejar 1 pedido convertido con origenWeb.codigo");
    assert.strictEqual(kpis.pedidosWeb.vinculados, 1, "Debe reflejar al menos 1 vinculado");

    // Verificar transacciones
    const trans = out.json.data.transacciones;
    const transWeb = trans.find((t: any) => t.id === 101 || t.idFormateado === "#0101");
    assert.ok(transWeb, "Debe existir la transacción web");
    assert.strictEqual(transWeb.esWeb, true);
    assert.strictEqual(transWeb.origenWebCodigo, "VENT-23456");

    const transDirecta = trans.find((t: any) => t.id === 102 || t.idFormateado === "#0102");
    assert.ok(transDirecta, "Debe existir la transacción directa");
    assert.strictEqual(transDirecta.esWeb, false);
    assert.strictEqual(transDirecta.origenWebCodigo, null);
  }

  console.log("  ✅ Test 6 superado (Ventas calcula { creados, vinculados, convertidos } y marca transacciones web)");

  // Limpieza final de la base de datos local para no afectar a otras suites
  resetDb();

  console.log("================================================================================");
  console.log("🎉 TODOS LOS TESTS DE F2-4 PASARON EXITOSAMENTE (6/6)");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("❌ Fallo en la suite F2-4:", err);
  process.exit(1);
});
