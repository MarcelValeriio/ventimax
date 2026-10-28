/**
 * scripts/test-envios.ts
 * Suite de pruebas automatizadas para la tarea F0-5:
 * Métodos de envío administrables desde el panel, WhatsApp y venta manual.
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const { authorize } = require("../middlewares/auth");
const PERMISSIONS: Record<string, string[]> = require("../data/permissions");
const shippingController = require("../controllers/shippingController");
const inboxController = require("../controllers/inboxController");
const chatFlowController = require("../controllers/chatFlowController");
const chatFlowService = require("../services/chatFlowService");
const orderService = require("../services/orderService");
const adminController = require("../controllers/adminController");

/** Auxiliar para mockear req y res de Express */
function mockReqRes(options: {
  body?: any;
  params?: any;
  query?: any;
  user?: any;
} = {}) {
  const req: any = {
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
    user: options.user,
  };
  let statusCode = 200;
  let responseData: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    },
    send: (data: any) => {
      responseData = data;
      return res;
    },
    getStatus: () => statusCode,
    getData: () => responseData,
  };

  return { req, res };
}

/** Ejecuta un middleware de autorización y retorna true si llamó a next() */
function testAuthorize(requiredPermissions: string | string[], user?: any): { status: number; nextCalled: boolean; data: any } {
  let nextCalled = false;
  let status = 200;
  let data: any = null;

  const req: any = { user };
  const res: any = {
    status: (s: number) => {
      status = s;
      return res;
    },
    json: (d: any) => {
      data = d;
      return res;
    },
  };
  const next = () => {
    nextCalled = true;
  };

  const middleware = authorize(requiredPermissions);
  middleware(req, res, next);

  return { status, nextCalled, data };
}

async function runTests() {
  console.log("================================================================================");
  console.log("🚚 SUITE DE PRUEBAS: MÉTODOS DE ENVÍO ADMINISTRABLES (F0-5)");
  console.log("================================================================================");

  // 1. Limpiar colección de métodos de envío en dbLocal
  const MetodoEnvio = dbLocal.getMetodoEnvioModel();
  await MetodoEnvio.deleteMany({});

  // --------------------------------------------------------------------------
  // TEST 1: Permisos de acceso por rol y autorización granular
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 1: Permisos y autorización granular (401 sin sesión, 403 repartidor, cajero vs admin)...");

  // 1.1 Sin sesión o sin permisos
  const authSinUser = testAuthorize("shipping_method:view", undefined);
  assert.strictEqual(authSinUser.nextCalled, false, "Sin usuario no debe llamar next");
  assert.strictEqual(authSinUser.status, 401, "Sin usuario debe responder 401");

  // 1.2 Repartidor (no tiene shipping_method:*)
  const repartidorUser = { role: "repartidor", permissions: PERMISSIONS["repartidor"] || [] };
  const authRepartidorView = testAuthorize("shipping_method:view", repartidorUser);
  assert.strictEqual(authRepartidorView.nextCalled, false);
  assert.strictEqual(authRepartidorView.status, 403, "Repartidor debe recibir 403 al ver envíos");

  const authRepartidorCreate = testAuthorize("shipping_method:create", repartidorUser);
  assert.strictEqual(authRepartidorCreate.status, 403, "Repartidor debe recibir 403 al crear envíos");

  // 1.3 Cajero (tiene view, create, edit; NO tiene delete)
  const cajeroUser = { role: "cajero", permissions: PERMISSIONS["cajero"] || [] };
  const authCajeroView = testAuthorize("shipping_method:view", cajeroUser);
  assert.strictEqual(authCajeroView.nextCalled, true, "Cajero debe poder ver envíos");

  const authCajeroCreate = testAuthorize("shipping_method:create", cajeroUser);
  assert.strictEqual(authCajeroCreate.nextCalled, true, "Cajero debe poder crear envíos");

  const authCajeroEdit = testAuthorize("shipping_method:edit", cajeroUser);
  assert.strictEqual(authCajeroEdit.nextCalled, true, "Cajero debe poder editar envíos");

  const authCajeroDelete = testAuthorize("shipping_method:delete", cajeroUser);
  assert.strictEqual(authCajeroDelete.nextCalled, false, "Cajero NO debe poder eliminar envíos");
  assert.strictEqual(authCajeroDelete.status, 403, "Cajero debe recibir 403 al borrar envíos");

  // 1.4 Administrador (tiene view, create, edit, delete)
  const adminUser = { role: "admin", permissions: PERMISSIONS["admin"] || [] };
  const authAdminDelete = testAuthorize("shipping_method:delete", adminUser);
  assert.strictEqual(authAdminDelete.nextCalled, true, "Admin debe poder borrar envíos");

  console.log("  ✅ Test 1 superado (Matriz de permisos de roles comprobada)");

  // --------------------------------------------------------------------------
  // TEST 2: Validaciones de entrada en la API (shippingController)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 2: Validaciones de entrada (nombre vacío, tipo inválido, costoTipo inválido, costo negativo)...");

  // 2.1 Nombre vacío
  const { req: r1, res: res1 } = mockReqRes({ body: { nombre: "  ", tipo: "delivery_local", costoTipo: "fijo", costo: 5 } });
  await shippingController.createShippingMethod(r1, res1);
  assert.strictEqual(res1.getStatus(), 400);
  assert.strictEqual(res1.getData().success, false);

  // 2.2 Tipo inválido
  const { req: r2, res: res2 } = mockReqRes({ body: { nombre: "Dron", tipo: "dron_espacial", costoTipo: "fijo", costo: 5 } });
  await shippingController.createShippingMethod(r2, res2);
  assert.strictEqual(res2.getStatus(), 400);

  // 2.3 costoTipo inválido
  const { req: r3, res: res3 } = mockReqRes({ body: { nombre: "Envío", tipo: "delivery_local", costoTipo: "gratis_total", costo: 5 } });
  await shippingController.createShippingMethod(r3, res3);
  assert.strictEqual(res3.getStatus(), 400);

  // 2.4 Costo fijo negativo
  const { req: r4, res: res4 } = mockReqRes({ body: { nombre: "Envío", tipo: "delivery_local", costoTipo: "fijo", costo: -10 } });
  await shippingController.createShippingMethod(r4, res4);
  assert.strictEqual(res4.getStatus(), 400);

  console.log("  ✅ Test 2 superado (Todas las validaciones de entrada rechazadas estrictamente)");

  // --------------------------------------------------------------------------
  // TEST 3: CRUD completo en /api/admin/shipping
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 3: CRUD completo (Crear, Listar, Editar, Borrar)...");

  // Crear 1: Delivery Caracas (a convenir)
  const { req: rCreate1, res: resCreate1 } = mockReqRes({
    body: {
      nombre: "Delivery Caracas",
      tipo: "delivery_local",
      descripcion: "Costo según zona en Gran Caracas",
      costoTipo: "a_convenir",
      costo: 0,
      pideDatos: "direccion",
      activo: true,
      orden: 1,
    },
    user: adminUser,
  });
  await shippingController.createShippingMethod(rCreate1, resCreate1);
  assert.strictEqual(resCreate1.getStatus(), 201);
  const created1 = resCreate1.getData().data;
  assert(created1._id, "Debe retornar el ID del método creado");
  assert.strictEqual(created1.nombre, "Delivery Caracas");

  // Crear 2: Envío Nacional (fijo $5.00)
  const { req: rCreate2, res: resCreate2 } = mockReqRes({
    body: {
      nombre: "Envío Nacional MRW",
      tipo: "envio_nacional",
      costoTipo: "fijo",
      costo: 5,
      pideDatos: "agencia",
      activo: true,
      orden: 2,
    },
    user: adminUser,
  });
  await shippingController.createShippingMethod(rCreate2, resCreate2);
  assert.strictEqual(resCreate2.getStatus(), 201);
  const created2 = resCreate2.getData().data;

  // Listar métodos
  const { req: rList, res: resList } = mockReqRes();
  await shippingController.getShippingMethods(rList, resList);
  assert.strictEqual(resList.getStatus(), 200);
  assert.strictEqual(resList.getData().data.length, 2);

  // Editar método 1 (cambiar orden y descripción)
  const { req: rEdit, res: resEdit } = mockReqRes({
    params: { id: created1._id },
    body: { descripcion: "Actualizado: entrega rápida", orden: 10 },
    user: adminUser,
  });
  await shippingController.updateShippingMethod(rEdit, resEdit);
  assert.strictEqual(resEdit.getStatus(), 200);
  assert.strictEqual(resEdit.getData().data.descripcion, "Actualizado: entrega rápida");

  // Borrar método 2
  const { req: rDel, res: resDel } = mockReqRes({
    params: { id: created2._id },
    user: adminUser,
  });
  await shippingController.deleteShippingMethod(rDel, resDel);
  assert.strictEqual(resDel.getStatus(), 200);

  // Verificar que quedó solo 1
  const { req: rList2, res: resList2 } = mockReqRes();
  await shippingController.getShippingMethods(rList2, resList2);
  assert.strictEqual(resList2.getData().data.length, 1);

  console.log("  ✅ Test 3 superado (CRUD completo verificado exitosamente)");

  // --------------------------------------------------------------------------
  // TEST 4: Métodos desactivados (no se ofrecen en bot ni en inbox)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 4: Métodos inactivos (no ofrecidos en inbox ni bot)...");

  // Crear un método inactivo
  const { req: rInactivo, res: resInactivo } = mockReqRes({
    body: {
      nombre: "Método Inactivo",
      tipo: "otro",
      costoTipo: "a_convenir",
      activo: false,
    },
    user: adminUser,
  });
  await shippingController.createShippingMethod(rInactivo, resInactivo);
  assert.strictEqual(resInactivo.getStatus(), 201);

  // Consultar endpoint de inbox
  const { req: rInbox, res: resInbox } = mockReqRes();
  await inboxController.getShippingInbox(rInbox, resInbox);
  assert.strictEqual(resInbox.getStatus(), 200);
  const inboxMethods = resInbox.getData().data;
  assert.strictEqual(
    inboxMethods.some((m: any) => m.nombre === "Método Inactivo"),
    false,
    "El endpoint de inbox no debe incluir métodos inactivos"
  );
  assert.strictEqual(
    inboxMethods.some((m: any) => m.nombre === "Delivery Caracas"),
    true,
    "El endpoint de inbox debe incluir métodos activos"
  );

  console.log("  ✅ Test 4 superado (Métodos inactivos filtrados correctamente)");

  // --------------------------------------------------------------------------
  // TEST 5: Cálculo de Total USD (fijo suma al total vs a convenir sin recargo)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 5: Cálculo de total USD (fijo suma al total vs a convenir sin recargo)...");

  const itemsPrueba = [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }];

  // 5.1 Método con costo fijo ($5)
  const envioFijo = {
    metodoId: "env-fijo-001",
    nombre: "Delivery Fijo",
    tipo: "delivery_local",
    costo: 5,
    aConvenir: false,
  };

  await orderService.crearPedidoInicial("584129995501", {
    nombre: "Cliente Fijo",
    items: itemsPrueba,
    ubicacion: { direccion: "Av. Principal 123" },
    pago: { metodo: "Pago Móvil" },
    envio: envioFijo,
  });

  const pedidoFijo = await orderService.finalizarPedidoConComprobante(
    "584129995501",
    {
      items: itemsPrueba,
      nombre: "Cliente Fijo",
      pagoNombre: "Pago Móvil",
      envio: envioFijo,
    },
    "media-fijo-001",
    "https://comprobante.url/fijo.jpg"
  );
  assert.strictEqual(pedidoFijo.pago.montoUSD, 45, "Total debe sumar $40 de producto + $5 de envío = $45");
  assert.strictEqual(pedidoFijo.envio.nombre, "Delivery Fijo");

  // 5.2 Método a convenir ($0 en costo y flag aConvenir: true)
  const envioConvenir = {
    metodoId: "env-conv-001",
    nombre: "Delivery Caracas",
    tipo: "delivery_local",
    costo: 0,
    aConvenir: true,
  };

  await orderService.crearPedidoInicial("584129995502", {
    nombre: "Cliente Convenir",
    items: itemsPrueba,
    ubicacion: { direccion: "Av. Libertador" },
    pago: { metodo: "Pago Móvil" },
    envio: envioConvenir,
  });

  const pedidoConvenir = await orderService.finalizarPedidoConComprobante(
    "584129995502",
    {
      items: itemsPrueba,
      nombre: "Cliente Convenir",
      pagoNombre: "Pago Móvil",
      envio: envioConvenir,
    },
    "media-conv-001",
    "https://comprobante.url/conv.jpg"
  );
  assert.strictEqual(pedidoConvenir.pago.montoUSD, 40, "Total no debe sumar recargo en envío a convenir");
  assert.strictEqual(pedidoConvenir.envio.nombre, "Delivery Caracas");

  // 5.3 Texto de confirmación en chatFlowController
  const whatsapp = require("../services/whatsapp");
  const origEnviarBotones = whatsapp.enviarBotones;
  let textoConfirmacion = "";
  whatsapp.enviarBotones = async (to: string, text: string, buttons: any) => {
    textoConfirmacion = text;
    return true;
  };

  const fakeCarritoConvenir = {
    nombre: "Cliente Convenir",
    cedula: "12345678",
    items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
    direccion_manual: "Av. Libertador",
    envio: envioConvenir,
  };
  const mockIo = { emit: () => {} };
  await chatFlowController.solicitarConfirmacionDatos("584129995502", fakeCarritoConvenir, mockIo);
  whatsapp.enviarBotones = origEnviarBotones;

  assert(
    textoConfirmacion.includes("a convenir con el asesor") || textoConfirmacion.includes("A convenir"),
    "El resumen debe indicar que el envío es a convenir con el asesor"
  );
  assert(
    textoConfirmacion.includes("Delivery Caracas"),
    "El resumen debe incluir el nombre del método de envío"
  );

  console.log("  ✅ Test 5 superado (Cálculos de total USD y aclaratoria de envío a convenir correctos)");

  // --------------------------------------------------------------------------
  // TEST 6: Instrucciones de pago y flujo de efectivo con envío fijo vs a convenir
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 6: Instrucciones de pago y efectivo (Monto en $ y Bs sobre $45, Monto Exacto y Vuelto)...");

  // 6.1 Instrucciones de Pago con envío fijo ($40 + $5 = $45)
  const carritoPagoFijo = {
    items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
    pago: "pm_movil_test",
    envio: envioFijo,
  };
  const dMock = dbLocal.read();
  dMock.metodosPago = [
    {
      _id: "pm_movil_test",
      tipo: "pago_movil",
      nombre: "Pago Móvil Banesco",
      activo: true,
      detalles: { banco: "Banesco", telefono: "04121234567", cedula: "12345678" },
    },
  ];
  dbLocal.write(dMock);

  await orderService.crearPedidoInicial("584129995503", {
    items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
    cliente: { nombre: "Cliente Test 6 Fijo" },
    envio: envioFijo,
  });

  const msgInstruccionesFijo = await orderService.generarInstruccionesPago("584129995503", carritoPagoFijo);
  assert(msgInstruccionesFijo, "Debe generar instrucciones de pago");
  assert(
    msgInstruccionesFijo.includes("$45.00 USD") || msgInstruccionesFijo.includes("$45"),
    "Las instrucciones deben pedir $45.00 USD (suma de $40 de producto + $5 de envío fijo)"
  );
  // Verificar que el pedido actualizado en DB tenga $45
  const pedidoDBPagoFijo = await dbLocal.getPedidoModel().findOne({ whatsappId: "584129995503" });
  assert.strictEqual(pedidoDBPagoFijo.pago.montoUSD, 45, "En la base de datos el montoUSD debe ser 45");

  // 6.2 Instrucciones de Pago con envío a convenir ($40 + $0 = $40)
  const carritoPagoConvenir = {
    items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
    pago: "pm_movil_test",
    envio: envioConvenir,
  };
  await orderService.crearPedidoInicial("584129995504", {
    items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
    cliente: { nombre: "Cliente Test 6 Convenir" },
    envio: envioConvenir,
  });
  const msgInstruccionesConvenir = await orderService.generarInstruccionesPago("584129995504", carritoPagoConvenir);
  assert(
    msgInstruccionesConvenir.includes("$40.00 USD") || msgInstruccionesConvenir.includes("$40"),
    "Las instrucciones para envío a convenir deben pedir $40.00 USD (sin sumar recargo)"
  );

  // 6.3 Efectivo - Monto Exacto sobre $45
  let estadoEfectivoExacto: any = {
    paso: "esperando_efectivo_opcion",
    carrito: {
      items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
      envio: envioFijo,
    },
  };
  await chatFlowService.handleEsperandoEfectivoOpcion({
    from: "584129995505",
    low: "efectivo_exacto",
    io: mockIo,
    estado: estadoEfectivoExacto,
  });
  const estadoPostExacto = await orderService.getEstado("584129995505");
  assert.strictEqual(estadoPostExacto.carrito.pagoCon, 45, "Efectivo exacto debe fijar pagoCon en $45");
  assert.strictEqual(estadoPostExacto.carrito.vuelto, 0, "Efectivo exacto debe fijar vuelto en 0");

  // 6.4 Efectivo - Vuelto con billete de $50 sobre total de $45 -> Vuelto $5
  let estadoEfectivoVuelto: any = {
    paso: "esperando_efectivo_monto",
    meta: "vuelto",
    carrito: {
      items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
      envio: envioFijo,
    },
  };
  await chatFlowService.handleEsperandoEfectivoMonto({
    from: "584129995506",
    low: "50",
    io: mockIo,
    estado: estadoEfectivoVuelto,
  });
  const estadoPostVuelto = await orderService.getEstado("584129995506");
  assert.strictEqual(estadoPostVuelto.carrito.pagoCon, 50, "Debe registrar pago con $50");
  assert.strictEqual(estadoPostVuelto.carrito.vuelto, 5, "El vuelto debe ser exactamente $5 ($50 - $45)");

  // 6.5 Efectivo con envío a convenir -> Total base $40
  const totalConvenirCalc = orderService.calcularTotalCarrito({
    items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
    envio: envioConvenir,
  });
  assert.strictEqual(totalConvenirCalc, 40, "calcularTotalCarrito para envío a convenir debe dar exactamente $40");

  console.log("  ✅ Test 6 superado (Instrucciones en $ y Bs, Monto Exacto y Vuelto calculados sobre $45)");

  // --------------------------------------------------------------------------
  // TEST 7: WhatsApp - Auto-selección con 1 método vs Lista con 2+ vs 0 métodos
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 7: WhatsApp (auto-selección con 1 método vs lista interactiva con 2+ vs 0 métodos)...");

  // 6.1 Con 0 métodos activos
  await MetodoEnvio.deleteMany({});
  const carritoZero = { items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }] };
  await chatFlowService.solicitarPasoTrasDatosPersonales("584129995510", carritoZero, mockIo);
  const estadoZero = await orderService.getEstado("584129995510");
  assert.strictEqual(estadoZero.paso, "esperando_ubicacion", "Con 0 métodos debe continuar sin error a pedir ubicación");

  // 6.2 Con 1 método activo -> Auto-selección
  await MetodoEnvio.create({
    nombre: "Único Delivery",
    tipo: "delivery_local",
    costoTipo: "fijo",
    costo: 3,
    pideDatos: "direccion",
    activo: true,
  });

  const carritoUno = { items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }] };
  await chatFlowService.solicitarPasoTrasDatosPersonales("584129995511", carritoUno, mockIo);
  const estadoUno = await orderService.getEstado("584129995511");
  assert.strictEqual(estadoUno.paso, "esperando_ubicacion", "Con 1 método debe auto-seleccionar y pasar a ubicación");
  assert(estadoUno.carrito.envio, "Debe tener asignado el método seleccionado");
  assert.strictEqual(estadoUno.carrito.envio.nombre, "Único Delivery");
  assert.strictEqual(estadoUno.carrito.envio.costo, 3);

  // 6.3 Con 2 métodos activos -> Lista interactiva y paso esperando_metodo_envio
  await MetodoEnvio.create({
    nombre: "Envío Nacional Zoom",
    tipo: "envio_nacional",
    costoTipo: "a_convenir",
    pideDatos: "agencia",
    activo: true,
  });

  const carritoDos = { items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }] };
  await chatFlowService.solicitarPasoTrasDatosPersonales("584129995512", carritoDos, mockIo);
  const estadoDos = await orderService.getEstado("584129995512");
  assert.strictEqual(estadoDos.paso, "esperando_metodo_envio", "Con 2+ métodos debe desplegar lista y pasar a esperando_metodo_envio");

  // 6.4 Selección en el paso esperando_metodo_envio
  // Selección válida: escribe "Zoom"
  await chatFlowService.handleEsperandoMetodoEnvio({
    from: "584129995512",
    text: "Zoom",
    listReplyId: undefined,
    io: mockIo,
    estado: estadoDos,
  });
  const estadoSeleccionado = await orderService.getEstado("584129995512");
  assert.strictEqual(estadoSeleccionado.paso, "esperando_ubicacion", "Al seleccionar método válido debe avanzar a ubicación");
  assert.strictEqual(estadoSeleccionado.carrito.envio.nombre, "Envío Nacional Zoom");
  assert.strictEqual(estadoSeleccionado.carrito.envio.aConvenir, true);

  console.log("  ✅ Test 7 superado (Flujo interactivo de WhatsApp y auto-selección verificados)");

  // --------------------------------------------------------------------------
  // TEST 8: Venta manual desde el Inbox con método de envío (costo de BD y validación)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 8: Venta manual (costo de la BD, rechazo de costo alterado e IDs inválidos/inactivos)...");

  // Asegurar producto en catálogo local
  const Producto = dbLocal.getProductoModel();
  const prodExistente = await Producto.findOne({ name: "Fortunne Turbo Fan 10\"" });
  if (!prodExistente) {
    await Producto.create({
      name: "Fortunne Turbo Fan 10\"",
      price: 40,
      stock: 10,
      trackStock: false,
    });
  }

  // 8.1 Crear método real en BD con costo de $6
  await MetodoEnvio.create({
    _id: "env-manual-001",
    nombre: "Delivery Caracas Express",
    tipo: "delivery_local",
    costoTipo: "fijo",
    costo: 6,
    activo: true,
  });

  // Crear método inactivo en BD
  await MetodoEnvio.create({
    _id: "env-inactivo-002",
    nombre: "Delivery Desactivado",
    tipo: "delivery_local",
    costoTipo: "fijo",
    costo: 10,
    activo: false,
  });

  // 8.2 Venta manual con costo alterado en el cuerpo ($999 en vez de $6) -> debe tomar los $6 de la BD
  const { req: rManualAlterado, res: resManualAlterado } = mockReqRes({
    body: {
      whatsappId: "584129995577",
      cliente: {
        nombre: "María Venta Manual",
        cedula: "20123456",
        telefono: "584129995577",
        direccion: "Urb. Altamira Calle 2",
      },
      items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 2 }],
      envio: {
        metodoId: "env-manual-001",
        nombre: "Nombre Falso del Navegador",
        costo: 999, // Costo manipulado en cliente
      },
      pago: {
        metodo: "Pago Móvil",
      },
    },
    user: adminUser,
  });

  await adminController.postManualSale(rManualAlterado, resManualAlterado);
  assert.strictEqual(resManualAlterado.getStatus(), 201, "postManualSale debe responder 201 (Created)");
  const pedidoCreado = resManualAlterado.getData().data;
  assert(pedidoCreado, "Debe retornar el pedido creado");
  assert.strictEqual(
    pedidoCreado.pago.montoUSD,
    86,
    "El total debe ser $86 ($40 x 2 = $80 + $6 de la base de datos), ignorando los $999 enviados en el cuerpo"
  );
  assert.strictEqual(pedidoCreado.envio.costo, 6, "El costo de envío guardado debe ser $6 (el de la base)");
  assert.strictEqual(pedidoCreado.envio.nombre, "Delivery Caracas Express", "El nombre de envío debe ser el de la base");

  // 8.3 Venta manual con metodoId inexistente -> 400
  const { req: rManualInexistente, res: resManualInexistente } = mockReqRes({
    body: {
      whatsappId: "584129995578",
      cliente: { nombre: "Cliente Inexistente", cedula: "20123456" },
      items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
      envio: { metodoId: "metodo-inexistente-999", costo: 5 },
      pago: { metodo: "Efectivo" },
    },
    user: adminUser,
  });
  await adminController.postManualSale(rManualInexistente, resManualInexistente);
  assert.strictEqual(resManualInexistente.getStatus(), 400, "Método inexistente debe responder 400");
  assert.strictEqual(resManualInexistente.getData().success, false);

  // 8.4 Venta manual con metodoId inactivo -> 400
  const { req: rManualInactivo, res: resManualInactivo } = mockReqRes({
    body: {
      whatsappId: "584129995579",
      cliente: { nombre: "Cliente Inactivo", cedula: "20123456" },
      items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
      envio: { metodoId: "env-inactivo-002", costo: 10 },
      pago: { metodo: "Efectivo" },
    },
    user: adminUser,
  });
  await adminController.postManualSale(rManualInactivo, resManualInactivo);
  assert.strictEqual(resManualInactivo.getStatus(), 400, "Método inactivo debe responder 400");
  assert.strictEqual(resManualInactivo.getData().success, false);

  console.log("  ✅ Test 8 superado (Venta manual con costo de base de datos y validación de IDs)");

  // --------------------------------------------------------------------------
  // TEST 9: Ficha del cliente en Inbox (getChatContext suma total con envío fijo)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 9: Ficha del cliente en Inbox (getChatContext incluye costo fijo de envío en totalUSD y totalBS)...");

  // 9.1 Cliente con carrito activo que tiene envío fijo ($40 + $5 = $45)
  const telInboxFijo = "584129995580";
  const dInbox = dbLocal.read();
  dInbox.etiquetas[telInboxFijo] = {
    telefono: telInboxFijo,
    paso: "esperando_pago_metodo",
    carrito: {
      items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
      envio: envioFijo,
      nombre: "Cliente Inbox Fijo",
    },
  };
  dbLocal.write(dInbox);

  const { req: rContextFijo, res: resContextFijo } = mockReqRes({
    query: { telefono: telInboxFijo },
    user: adminUser,
  });
  await adminController.getChatContext(rContextFijo, resContextFijo);
  assert.strictEqual(resContextFijo.getStatus(), 200);
  const dataContextFijo = resContextFijo.getData().data;
  assert.strictEqual(dataContextFijo.totalUSD, 45, "En la ficha del cliente totalUSD debe sumar el envío fijo ($45)");
  assert(dataContextFijo.totalBS != null, "Debe calcular totalBS en base al total con envío");

  // 9.2 Cliente con carrito activo que tiene envío a convenir ($40 + $0 = $40)
  const telInboxConv = "584129995581";
  const dInboxConv = dbLocal.read();
  dInboxConv.etiquetas[telInboxConv] = {
    telefono: telInboxConv,
    paso: "esperando_pago_metodo",
    carrito: {
      items: [{ producto: "Fortunne Turbo Fan 10\"", price: 40, cantidad: 1 }],
      envio: envioConvenir,
      nombre: "Cliente Inbox Convenir",
    },
  };
  dbLocal.write(dInboxConv);

  const { req: rContextConv, res: resContextConv } = mockReqRes({
    query: { telefono: telInboxConv },
    user: adminUser,
  });
  await adminController.getChatContext(rContextConv, resContextConv);
  assert.strictEqual(resContextConv.getStatus(), 200);
  const dataContextConv = resContextConv.getData().data;
  assert.strictEqual(dataContextConv.totalUSD, 40, "En la ficha del cliente para envío a convenir totalUSD debe ser $40");

  console.log("  ✅ Test 9 superado (Ficha del cliente en Inbox suma total con envío fijo)");

  // Limpiar métodos creados y datos de prueba para no afectar tests posteriores
  await MetodoEnvio.deleteMany({});
  const dbDataFin = dbLocal.read();
  if (dbDataFin.pedidos) {
    dbDataFin.pedidos = dbDataFin.pedidos.filter((p: any) => !String(p.whatsappId).startsWith("5841299955"));
  }
  if (dbDataFin.etiquetas) {
    for (const key of Object.keys(dbDataFin.etiquetas)) {
      if (key.startsWith("5841299955")) delete dbDataFin.etiquetas[key];
    }
  }
  dbLocal.write(dbDataFin);

  console.log("\n================================================================================");
  console.log("🎉 TODOS LOS TESTS DE MÉTODOS DE ENVÍO (F0-5) PASARON EXITOSAMENTE (9/9)");
  console.log("================================================================================");
}

runTests().catch(async (err) => {
  const MetodoEnvio = dbLocal.getMetodoEnvioModel();
  await MetodoEnvio.deleteMany({}).catch(() => {});
  const dbDataFin = dbLocal.read();
  if (dbDataFin.pedidos) {
    dbDataFin.pedidos = dbDataFin.pedidos.filter((p: any) => !String(p.whatsappId).startsWith("5841299955"));
  }
  if (dbDataFin.etiquetas) {
    for (const key of Object.keys(dbDataFin.etiquetas)) {
      if (key.startsWith("5841299955")) delete dbDataFin.etiquetas[key];
    }
  }
  dbLocal.write(dbDataFin);
  console.error("❌ Fallo en la suite de pruebas de métodos de envío:", err);
  process.exit(1);
});
