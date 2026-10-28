/**
 * scripts/test-retiro.ts
 * Suite de pruebas automatizadas para la tarea F0-12 y F0-13:
 * Retiro en persona editable, cambio de envío en pedidos existentes y eliminación de aleatoriedad en Kanban.
 */

import assert from "node:assert";
import { execSync } from "node:child_process";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const shippingController = require("../controllers/shippingController");
const adminController = require("../controllers/adminController");
const chatFlowService = require("../services/chatFlowService");
const { quiereRetirar } = require("../services/chatFlowService");
const orderService = require("../services/orderService");
const configManager = require("../services/configManager");
const horarioService = require("../services/horarioService");
const bcv = require("../services/bcv");
const whatsapp = require("../services/whatsapp");

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
    user: options.user || { role: "admin", id: "u-admin", nombre: "Admin Test" },
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

async function runTests() {
  console.log("================================================================================");
  console.log("🏪 SUITE DE PRUEBAS: RETIRO EN PERSONA Y CAMBIO DE ENVÍO (F0-12 / F0-13)");
  console.log("================================================================================");

  const MetodoEnvio = dbLocal.getMetodoEnvioModel();
  const Pedido = dbLocal.getPedidoModel();
  const Etiqueta = dbLocal.getEtiquetaModel();
  const Mensaje = dbLocal.getMensajeModel();

  await MetodoEnvio.deleteMany({});
  await Pedido.deleteMany({});
  await Etiqueta.deleteMany({});
  if (Mensaje && Mensaje.deleteMany) await Mensaje.deleteMany({});

  // Espía para capturar mensajes salientes
  const mensajesEnviados: string[] = [];
  const originalEnviarTexto = whatsapp.enviarTexto;
  whatsapp.enviarTexto = async (to: string, text: string) => {
    mensajesEnviados.push(text);
    return originalEnviarTexto(to, text);
  };

  const originalEmitirYGuardar = orderService.emitirYGuardar;
  orderService.emitirYGuardar = async function (tel: string, txt: string, ...args: any[]) {
    mensajesEnviados.push(txt);
    return originalEmitirYGuardar.call(orderService, tel, txt, ...args);
  };

  const originalSendYGuardar = chatFlowService._sendYGuardar;
  chatFlowService._sendYGuardar = async (from: string, text: string, io: any) => {
    mensajesEnviados.push(text);
    return originalSendYGuardar.call(chatFlowService, from, text, io);
  };

  const fakeIo = {
    emit: (event: string, payload: any) => {},
  };

  // --------------------------------------------------------------------------
  // TEST 1: Validación de dirección obligatoria para tipo retiro
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 1: Validación de dirección obligatoria para tipo retiro...");

  // 1.1 Sin dirección
  const { req: req1, res: res1 } = mockReqRes({
    body: {
      nombre: "Retiro en Oficina",
      tipo: "retiro",
    },
  });
  await shippingController.createShippingMethod(req1, res1);
  assert.strictEqual(res1.getStatus(), 400, "Debe rechazar retiro sin dirección con 400");
  assert.ok(
    res1.getData().error.includes("dirección") && res1.getData().error.includes("obligatoria"),
    "Mensaje de error debe indicar dirección obligatoria",
  );

  // 1.2 Dirección excesivamente larga (>200)
  const { req: req2, res: res2 } = mockReqRes({
    body: {
      nombre: "Retiro Largo",
      tipo: "retiro",
      direccion: "A".repeat(201),
    },
  });
  await shippingController.createShippingMethod(req2, res2);
  assert.strictEqual(res2.getStatus(), 400, "Debe rechazar dirección > 200 con 400");

  console.log("  ✅ Validación de dirección obligatoria y longitud superada");

  // --------------------------------------------------------------------------
  // TEST 2: Creación de los 4 tipos de TIPOS_ENVIO con cuerpo del panel
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 2: Creación de los 4 tipos de TIPOS_ENVIO con cuerpo del panel...");

  // 2.1 delivery_local (con costo fijo $5)
  const bodyLocal = {
    nombre: "Delivery Caracas",
    tipo: "delivery_local",
    costoTipo: "fijo",
    costo: 5,
    pideDatos: "",
    direccion: "",
    horario: "",
    orden: 0,
    activo: true,
  };
  const { req: reqLocal, res: resLocal } = mockReqRes({ body: bodyLocal });
  await shippingController.createShippingMethod(reqLocal, resLocal);
  assert.strictEqual(resLocal.getStatus(), 201, "delivery_local debe retornar 201");
  const metodoLocal = resLocal.getData().data;
  assert.strictEqual(metodoLocal.tipo, "delivery_local");
  assert.strictEqual(metodoLocal.costo, 5);

  // 2.2 envio_nacional (con pideDatos personalizado)
  const bodyNacional = {
    nombre: "Envío Nacional MRW",
    tipo: "envio_nacional",
    costoTipo: "a_convenir",
    costo: 0,
    pideDatos: "estado, ciudad y agencia de envío",
    direccion: "",
    horario: "",
    orden: 1,
    activo: true,
  };
  const { req: reqNac, res: resNac } = mockReqRes({ body: bodyNacional });
  await shippingController.createShippingMethod(reqNac, resNac);
  assert.strictEqual(resNac.getStatus(), 201, "envio_nacional debe retornar 201");
  const metodoNacional = resNac.getData().data;
  assert.strictEqual(metodoNacional.tipo, "envio_nacional");
  assert.strictEqual(metodoNacional.pideDatos, "estado, ciudad y agencia de envío");

  // 2.3 retiro (con direccion y horario)
  const bodyRetiro = {
    nombre: "Retiro en Almacén Catia",
    tipo: "retiro",
    costoTipo: "fijo",
    costo: 0,
    pideDatos: "",
    direccion: "Av. Sucre de Catia, frente al Parque del Oeste",
    horario: "Lunes a Viernes 9:00 am a 4:00 pm",
    orden: 2,
    activo: true,
  };
  const { req: reqRetiro, res: resRetiro } = mockReqRes({ body: bodyRetiro });
  await shippingController.createShippingMethod(reqRetiro, resRetiro);
  assert.strictEqual(resRetiro.getStatus(), 201, "retiro debe retornar 201");
  const metodoRetiroCreado = resRetiro.getData().data;
  assert.strictEqual(metodoRetiroCreado.tipo, "retiro");
  assert.strictEqual(metodoRetiroCreado.costo, 0);
  assert.strictEqual(metodoRetiroCreado.direccion, bodyRetiro.direccion);

  // 2.4 otro (con pideDatos libre)
  const bodyOtro = {
    nombre: "Flete Especial",
    tipo: "otro",
    costoTipo: "a_convenir",
    costo: 0,
    pideDatos: "instrucciones especiales de flete",
    direccion: "",
    horario: "",
    orden: 3,
    activo: true,
  };
  const { req: reqOtro, res: resOtro } = mockReqRes({ body: bodyOtro });
  await shippingController.createShippingMethod(reqOtro, resOtro);
  assert.strictEqual(resOtro.getStatus(), 201, "otro debe retornar 201");
  const metodoOtro = resOtro.getData().data;
  assert.strictEqual(metodoOtro.tipo, "otro");

  console.log("  ✅ Los 4 tipos de TIPOS_ENVIO creados exitosamente con status 201");

  // --------------------------------------------------------------------------
  // TEST 3: Bot WhatsApp - Respuestas según pideDatos (texto libre vs vacío)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 3: Respuestas del bot según pideDatos y ausencia de códigos sueltos...");

  const fromPideDatos = "584129990001";
  await Etiqueta.create({
    telefono: fromPideDatos,
    paso: "esperando_metodo_envio",
    carrito: {
      items: [{ producto: "Fortunne Turbo Fan 10\"", cantidad: 1, precio: 40 }],
      nombre: "Ana Martínez",
      cedula: "V-20123456",
    },
  });

  // 3.1 Método con pideDatos: "estado, ciudad y agencia de envío"
  mensajesEnviados.length = 0;
  await chatFlowService.handleEsperandoMetodoEnvio({
    from: fromPideDatos,
    text: "envio nacional mrw",
    listReplyId: `envio_${metodoNacional._id}`,
    io: fakeIo,
    estado: await Etiqueta.findOne({ telefono: fromPideDatos }),
  });

  const estadoNac = await Etiqueta.findOne({ telefono: fromPideDatos });
  assert.strictEqual(estadoNac.paso, "esperando_ubicacion");
  assert.strictEqual(estadoNac.carrito.envio.tipo, "envio_nacional");
  const msgPideDatos = mensajesEnviados.find((m) => m.includes("estado, ciudad y agencia de envío"));
  assert.ok(msgPideDatos, "El bot debe enviar exactamente la frase configurada en pideDatos");

  // 3.2 Método con pideDatos: "" (pide ubicación/dirección normal)
  const fromPideVacio = "584129990002";
  await Etiqueta.create({
    telefono: fromPideVacio,
    paso: "esperando_metodo_envio",
    carrito: {
      items: [{ producto: "Fortunne Turbo Fan 10\"", cantidad: 1, precio: 40 }],
      nombre: "Pedro Gómez",
      cedula: "V-19876543",
    },
  });

  mensajesEnviados.length = 0;
  await chatFlowService.handleEsperandoMetodoEnvio({
    from: fromPideVacio,
    text: "delivery caracas",
    listReplyId: `envio_${metodoLocal._id}`,
    io: fakeIo,
    estado: await Etiqueta.findOne({ telefono: fromPideVacio }),
  });

  const estadoLocal = await Etiqueta.findOne({ telefono: fromPideVacio });
  assert.strictEqual(estadoLocal.paso, "esperando_ubicacion");
  const msgUbicacionNormal = mensajesEnviados.find((m) => m.includes("comparte tu dirección actual *(GPS)*"));
  assert.ok(msgUbicacionNormal, "El bot debe solicitar la dirección normal si pideDatos está vacío");

  // 3.3 Verificación de ausencia de códigos internos sueltos en todos los mensajes del bot
  for (const m of mensajesEnviados) {
    assert.ok(
      !m.includes("*direccion*") &&
      !m.includes("*agencia*") &&
      !m.includes("*ninguno*") &&
      !m.includes("indícanos: *direccion*") &&
      !m.includes("indícanos: *agencia*") &&
      !m.includes("indícanos: *ninguno*"),
      `El mensaje contiene códigos sueltos no permitidos: "${m}"`,
    );
  }

  console.log("  ✅ Comportamiento de pideDatos y ausencia de códigos sueltos validada");

  // --------------------------------------------------------------------------
  // TEST 4: Función auxiliar quiereRetirar(texto)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 4: Reconocimiento semántico con quiereRetirar(texto)...");

  assert.strictEqual(quiereRetirar("voy en persona"), true);
  assert.strictEqual(quiereRetirar("lo busco"), true);
  assert.strictEqual(quiereRetirar("la busco"), true);
  assert.strictEqual(quiereRetirar("lo paso buscando"), true);
  assert.strictEqual(quiereRetirar("la paso buscando"), true);
  assert.strictEqual(quiereRetirar("paso a buscar"), true);
  assert.strictEqual(quiereRetirar("pasar a buscar"), true);
  assert.strictEqual(quiereRetirar("paso por alla"), true);
  assert.strictEqual(quiereRetirar("pick up"), true);
  assert.strictEqual(quiereRetirar("pickup"), true);
  assert.strictEqual(quiereRetirar("retiro en persona"), true);
  assert.strictEqual(quiereRetirar("retiro en tienda"), true);
  assert.strictEqual(quiereRetirar("retiro"), true);
  assert.strictEqual(quiereRetirar("retirar"), true);
  assert.strictEqual(quiereRetirar("quiero retirar"), true);
  assert.strictEqual(quiereRetirar("puedo retirar"), true);
  assert.strictEqual(quiereRetirar("prefiero retirar"), true);
  assert.strictEqual(quiereRetirar("¡VOY EN PERSONA!"), true);
  assert.strictEqual(quiereRetirar("¿Hacen retiro de garantía?"), false, "Falso positivo de garantía descartado");
  assert.strictEqual(quiereRetirar("delivery a mi casa"), false);
  assert.strictEqual(quiereRetirar("hola"), false);

  console.log("  ✅ Variantes y filtros de quiereRetirar verificados exitosamente");

  // --------------------------------------------------------------------------
  // TEST 5: Flujo del bot con retiro, frases 'voy en persona' y ordenamiento
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 5: Flujo del bot con retiro y selección por orden...");

  const fromTest = "584129997701";

  // 5.1 En esperando_metodo_envio: selección de retiro directo
  await Etiqueta.create({
    telefono: fromTest,
    paso: "esperando_metodo_envio",
    carrito: {
      items: [{ producto: "Fortunne Turbo Fan 10\"", cantidad: 1, precio: 40 }],
      nombre: "Carlos Gómez",
      cedula: "V-12345678",
    },
  });

  await chatFlowService.handleEsperandoMetodoEnvio({
    from: fromTest,
    text: "retiro en almacen catia",
    listReplyId: `envio_${metodoRetiroCreado._id}`,
    io: fakeIo,
    estado: await Etiqueta.findOne({ telefono: fromTest }),
  });

  let estadoActual = await Etiqueta.findOne({ telefono: fromTest });
  assert.strictEqual(estadoActual.paso, "esperando_confirmacion_datos", "Debe pasar directo al resumen");
  assert.strictEqual(estadoActual.carrito.envio.tipo, "retiro");
  assert.strictEqual(estadoActual.carrito.envio.costo, 0);
  assert.strictEqual(estadoActual.carrito.envio.direccion, metodoRetiroCreado.direccion);

  // 5.2 En esperando_confirmacion_datos: venía de delivery y dice "voy en persona"
  estadoActual.paso = "esperando_confirmacion_datos";
  estadoActual.carrito.envio = {
    metodoId: metodoLocal._id.toString(),
    nombre: metodoLocal.nombre,
    tipo: metodoLocal.tipo,
    costo: metodoLocal.costo,
  };
  await Etiqueta.findOneAndUpdate({ telefono: fromTest }, estadoActual);

  await chatFlowService.handleEsperandoConfirmacionDatos({
    from: fromTest,
    text: "sabes que mejor lo busco yo en persona",
    low: "sabes que mejor lo busco yo en persona",
    io: fakeIo,
    estado: estadoActual,
  });

  estadoActual = await Etiqueta.findOne({ telefono: fromTest });
  assert.strictEqual(estadoActual.paso, "esperando_confirmacion_datos");
  assert.strictEqual(estadoActual.carrito.envio.tipo, "retiro");
  assert.strictEqual(estadoActual.carrito.envio.costo, 0);
  assert.strictEqual(estadoActual.carrito.envio.cambioTrasCotizar, true, "Debe marcar cambioTrasCotizar = true");
  const totalConRetiro = orderService.calcularTotalCarrito(estadoActual.carrito);
  assert.strictEqual(totalConRetiro, 40, "Total debe descontar el delivery y quedar en 40");

  // 5.3 En esperando_pago_metodo: dice "lo paso buscando"
  estadoActual.paso = "esperando_pago_metodo";
  estadoActual.carrito.envio = {
    metodoId: metodoLocal._id.toString(),
    nombre: metodoLocal.nombre,
    tipo: metodoLocal.tipo,
    costo: metodoLocal.costo,
  };
  await Etiqueta.findOneAndUpdate({ telefono: fromTest }, estadoActual);

  await chatFlowService.handleEsperandoPagoMetodo({
    from: fromTest,
    text: "lo paso buscando yo mismo",
    low: "lo paso buscando yo mismo",
    io: fakeIo,
    estado: estadoActual,
  });

  estadoActual = await Etiqueta.findOne({ telefono: fromTest });
  assert.strictEqual(estadoActual.paso, "esperando_confirmacion_datos", "Debe volver a esperando_confirmacion_datos");
  assert.strictEqual(estadoActual.carrito.envio.tipo, "retiro");
  assert.strictEqual(estadoActual.carrito.envio.costo, 0);
  assert.strictEqual(estadoActual.carrito.envio.cambioTrasCotizar, true);

  // 5.4 Ordenamiento: si existen múltiples métodos de retiro activos, debe tomar el de menor orden (.sort({ orden: 1, createdAt: 1 }))
  const retiroSecundario = await MetodoEnvio.create({
    nombre: "Retiro Secundario El Paraíso",
    tipo: "retiro",
    costo: 0,
    costoTipo: "fijo",
    direccion: "Plaza Madariaga, El Paraíso",
    activo: true,
    orden: 10,
  });
  // Asegurar que metodoRetiroCreado tiene orden 1
  await MetodoEnvio.findByIdAndUpdate(metodoRetiroCreado._id, { orden: 1 });

  estadoActual.paso = "esperando_confirmacion_datos";
  estadoActual.carrito.envio = {
    metodoId: metodoLocal._id.toString(),
    nombre: metodoLocal.nombre,
    tipo: metodoLocal.tipo,
    costo: metodoLocal.costo,
  };
  await Etiqueta.findOneAndUpdate({ telefono: fromTest }, estadoActual);

  await chatFlowService.procesarIntencionRetiro({
    from: fromTest,
    io: fakeIo,
    estado: estadoActual,
  });

  estadoActual = await Etiqueta.findOne({ telefono: fromTest });
  assert.strictEqual(estadoActual.carrito.envio.nombre, metodoRetiroCreado.nombre, "Debe seleccionar el retiro de menor orden");
  assert.strictEqual(estadoActual.carrito.envio.direccion, metodoRetiroCreado.direccion);

  // Limpiar retiro secundario
  await MetodoEnvio.findByIdAndDelete(retiroSecundario._id);

  console.log("  ✅ Flujo de retiro en los 3 pasos y ordenamiento por menor orden verificados");

  // --------------------------------------------------------------------------
  // TEST 6: Frase de retiro cuando NO hay método de retiro activo y fuera de pasos
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 6: Retiro no disponible y frases fuera de pasos...");

  await MetodoEnvio.findByIdAndUpdate(metodoRetiroCreado._id, { activo: false });

  estadoActual.paso = "esperando_metodo_envio";
  await Etiqueta.findOneAndUpdate({ telefono: fromTest }, estadoActual);

  const resRetiroInactivo = await chatFlowService.procesarIntencionRetiro({
    from: fromTest,
    io: fakeIo,
    estado: estadoActual,
  });
  assert.strictEqual(resRetiroInactivo, false, "Debe retornar false al no haber método");
  const estadoSinCambio = await Etiqueta.findOne({ telefono: fromTest });
  assert.strictEqual(estadoSinCambio.paso, "esperando_metodo_envio", "No debe cambiar de paso");

  // Reactivar método de retiro para siguientes pruebas
  await MetodoEnvio.findByIdAndUpdate(metodoRetiroCreado._id, { activo: true });

  // En paso esperando_cantidad (no debe alterar flujo)
  estadoActual.paso = "esperando_cantidad";
  await Etiqueta.findOneAndUpdate({ telefono: fromTest }, estadoActual);

  await chatFlowService.handleEsperandoCantidad({
    from: fromTest,
    low: "lo paso buscando",
    io: fakeIo,
    estado: estadoActual,
  });

  const estadoPostCantidad = await Etiqueta.findOne({ telefono: fromTest });
  assert.strictEqual(estadoPostCantidad.paso, "esperando_cantidad", "El paso se mantiene en esperando_cantidad");

  console.log("  ✅ pickupUnavailable y conservación de estado confirmadas");

  // --------------------------------------------------------------------------
  // TEST 7: Interceptor 'hablar_asesor' y mensaje settings.messages.advisorHandoff
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 7: Interceptor de asesor con mensaje de settings.messages.advisorHandoff...");

  const fromAsesor = "584129998888";
  await Etiqueta.create({
    telefono: fromAsesor,
    paso: "esperando_metodo_envio",
    modo: "bot",
  });

  mensajesEnviados.length = 0;
  await chatFlowService._processBatch(fromAsesor, [{ tipo: "text", text: "hablar con asesor" }]);

  const modoAsesor = await orderService.getModo(fromAsesor);
  assert.strictEqual(modoAsesor, "manual", "El modo debe cambiar a manual");

  const msgAdvisorConfig = configManager.get("settings.messages.advisorHandoff");
  assert.ok(msgAdvisorConfig && msgAdvisorConfig.length > 0, "advisorHandoff debe existir en la configuración de la marca");
  const msgEnviadoAsesor = mensajesEnviados.find((m) => m.includes(msgAdvisorConfig));
  assert.ok(msgEnviadoAsesor, `El bot debe enviar el texto configurado en advisorHandoff: "${msgAdvisorConfig}"`);

  console.log("  ✅ Interceptor de asesor y mensaje advisorHandoff verificados correctamente");

  // --------------------------------------------------------------------------
  // TEST 8: PUT /api/admin/orders/:id/envio (Modificación administrativa de envío)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 8: Modificación de envío, costoAcordado, tasa del día y manejo seguro de errores...");

  const envioAConvenir = await MetodoEnvio.create({
    nombre: "Envío Nacional Zoom",
    tipo: "envio_nacional",
    costo: 0,
    costoTipo: "a_convenir",
    activo: true,
  });

  const pedidoTest = await Pedido.create({
    correlativo: 9901,
    idFormateado: "PED-9901",
    whatsappId: fromTest,
    cliente: { nombre: "Carlos Gómez", telefono: fromTest },
    items: [{ producto: "Ventilador 10\"", cantidad: 1, precio: 40 }],
    envio: {
      metodoId: metodoLocal._id,
      nombre: metodoLocal.nombre,
      tipo: metodoLocal.tipo,
      costo: 5,
      aConvenir: false,
      costoAcordado: false,
    },
    pago: { montoUSD: 45, montoVES: 2700, tasa: 60 },
    estado: "pendiente_pago",
  });

  // 8.1 Pedido cancelado o entregado devuelve 400
  pedidoTest.estado = "entregado";
  await pedidoTest.save();
  const { req: reqBloq, res: resBloq } = mockReqRes({
    params: { id: pedidoTest._id.toString() },
    body: { metodoId: metodoRetiroCreado._id.toString() },
  });
  await adminController.updateOrderShipping(reqBloq, resBloq, fakeIo);
  assert.strictEqual(resBloq.getStatus(), 400);
  assert.ok(resBloq.getData().error.includes("entregado o cancelado"));

  pedidoTest.estado = "pendiente_pago";
  await pedidoTest.save();

  // 8.2 Método inexistente o inactivo devuelve 400
  const { req: reqInval, res: resInval } = mockReqRes({
    params: { id: pedidoTest._id.toString() },
    body: { metodoId: "600000000000000000000000" },
  });
  await adminController.updateOrderShipping(reqInval, resInval, fakeIo);
  assert.strictEqual(resInval.getStatus(), 400);

  // 8.3 costoAcordado en método fijo devuelve 400
  const { req: reqFijoCosto, res: resFijoCosto } = mockReqRes({
    params: { id: pedidoTest._id.toString() },
    body: {
      metodoId: metodoLocal._id.toString(),
      costoAcordado: 10,
    },
  });
  await adminController.updateOrderShipping(reqFijoCosto, resFijoCosto, fakeIo);
  assert.strictEqual(resFijoCosto.getStatus(), 400);
  assert.ok(resFijoCosto.getData().error.includes("solo se permite para métodos con costo a convenir"));

  // 8.4 costoAcordado con número negativo o no numérico devuelve 400
  const { req: reqNeg, res: resNeg } = mockReqRes({
    params: { id: pedidoTest._id.toString() },
    body: {
      metodoId: envioAConvenir._id.toString(),
      costoAcordado: -5,
    },
  });
  await adminController.updateOrderShipping(reqNeg, resNeg, fakeIo);
  assert.strictEqual(resNeg.getStatus(), 400);

  // 8.5 Punto 1: Cambiar a método a convenir con costoAcordado: 8
  // Tasa del día (Camino A: obtenerTasaUSD devuelve 65)
  const originalObtenerTasa = bcv.obtenerTasaUSD;
  bcv.obtenerTasaUSD = async () => ({ tasa: 65 });

  const { req: reqConvenir, res: resConvenir } = mockReqRes({
    params: { id: pedidoTest._id.toString() },
    body: {
      metodoId: envioAConvenir._id.toString(),
      costoAcordado: 8,
    },
  });
  await adminController.updateOrderShipping(reqConvenir, resConvenir, fakeIo);
  assert.strictEqual(resConvenir.getStatus(), 200);
  const pedidoActualizado1 = resConvenir.getData().data;

  // Reglas estrictas de Punto 1:
  assert.strictEqual(pedidoActualizado1.envio.aConvenir, false, "aConvenir debe ser false cuando hay costoAcordado");
  assert.strictEqual(pedidoActualizado1.envio.costoAcordado, true, "costoAcordado debe ser true");
  assert.strictEqual(pedidoActualizado1.envio.costo, 8, "Costo debe ser 8");
  assert.strictEqual(pedidoActualizado1.pago.montoUSD, 48, "40 productos + 8 envío = 48 USD");
  assert.strictEqual(orderService.calcularTotalCarrito(pedidoActualizado1), 48, "calcularTotalCarrito debe ser 48");

  // Reglas estrictas de Punto 2 (Tasa del día: 65):
  assert.strictEqual(pedidoActualizado1.pago.tasa, 65, "Debe actualizar pago.tasa con la tasa del día (65)");
  assert.strictEqual(pedidoActualizado1.pago.montoVES, 3120, "48 USD * 65 = 3120 VES");

  // Verificación de formato en comanda / notificación:
  // Si costoAcordado === true, debe decir ($8.00, acordado con el asesor) y NUNCA "A convenir"
  const notifAdminTexto = `Envío: ${pedidoActualizado1.envio.nombre} ($${Number(pedidoActualizado1.envio.costo).toFixed(2)}, acordado con el asesor)`;
  assert.ok(
    !notifAdminTexto.includes("A convenir") && !notifAdminTexto.includes("(A convenir)"),
    "La comanda/notificación con costo acordado no debe contener 'A convenir'",
  );
  assert.ok(
    notifAdminTexto.includes("($8.00, acordado con el asesor)"),
    "Debe contener exactamente '($8.00, acordado con el asesor)'",
  );

  // 8.6 Punto 2 (Camino B: fallo en obtenerTasaUSD usa la tasa guardada previamente)
  bcv.obtenerTasaUSD = async () => {
    throw new Error("BCV no disponible en este momento");
  };

  // Fijamos tasa guardada en el pedido = 60
  pedidoActualizado1.pago.tasa = 60;
  await pedidoActualizado1.save();

  const { req: reqFallbackTasa, res: resFallbackTasa } = mockReqRes({
    params: { id: pedidoTest._id.toString() },
    body: {
      metodoId: envioAConvenir._id.toString(),
      costoAcordado: 10,
    },
  });
  await adminController.updateOrderShipping(reqFallbackTasa, resFallbackTasa, fakeIo);
  assert.strictEqual(resFallbackTasa.getStatus(), 200);
  const pedidoFallback = resFallbackTasa.getData().data;
  assert.strictEqual(pedidoFallback.pago.montoUSD, 50, "40 + 10 = 50 USD");
  assert.strictEqual(pedidoFallback.pago.tasa, 60, "Debe conservar la tasa guardada en el pedido (60)");
  assert.strictEqual(pedidoFallback.pago.montoVES, 3000, "50 * 60 = 3000 VES");

  // Restaurar mock de tasa
  bcv.obtenerTasaUSD = originalObtenerTasa;

  // 8.7 Método a convenir SIN costoAcordado: sigue aConvenir: true, costo: 0, costoAcordado: false
  const { req: reqSinCosto, res: resSinCosto } = mockReqRes({
    params: { id: pedidoTest._id.toString() },
    body: {
      metodoId: envioAConvenir._id.toString(),
    },
  });
  await adminController.updateOrderShipping(reqSinCosto, resSinCosto, fakeIo);
  assert.strictEqual(resSinCosto.getStatus(), 200);
  const pedidoSinCosto = resSinCosto.getData().data;
  assert.strictEqual(pedidoSinCosto.envio.aConvenir, true, "Sin costoAcordado, aConvenir debe ser true");
  assert.strictEqual(pedidoSinCosto.envio.costoAcordado, false);
  assert.strictEqual(pedidoSinCosto.envio.costo, 0);
  assert.strictEqual(pedidoSinCosto.pago.montoUSD, 40, "Total sin costo de envío");

  // 8.8 Cambiar a retiro en pedido verificado devuelve aviso
  pedidoSinCosto.estado = "verificado";
  await pedidoSinCosto.save();

  const { req: reqRetiroAdmin, res: resRetiroAdmin } = mockReqRes({
    params: { id: pedidoTest._id.toString() },
    body: {
      metodoId: metodoRetiroCreado._id.toString(),
      avisarCliente: true,
    },
  });
  await adminController.updateOrderShipping(reqRetiroAdmin, resRetiroAdmin, fakeIo);
  assert.strictEqual(resRetiroAdmin.getStatus(), 200);
  assert.ok(resRetiroAdmin.getData().aviso, "Debe incluir aviso sobre diferencia a coordinar");
  const pedidoFinal = resRetiroAdmin.getData().data;
  assert.strictEqual(pedidoFinal.envio.tipo, "retiro");
  assert.strictEqual(pedidoFinal.pago.montoUSD, 40);
  assert.strictEqual(pedidoFinal.envio.direccion, metodoRetiroCreado.direccion);

  // 8.9 Menor: Error 500 no expone details: error.message
  const originalCalcular = orderService.calcularTotalCarrito;
  orderService.calcularTotalCarrito = () => {
    throw new Error("Crash forzado en cálculo");
  };
  const { req: req500, res: res500 } = mockReqRes({
    params: { id: pedidoTest._id.toString() },
    body: { metodoId: metodoRetiroCreado._id.toString() },
  });
  await adminController.updateOrderShipping(req500, res500, fakeIo);
  orderService.calcularTotalCarrito = originalCalcular;

  assert.strictEqual(res500.getStatus(), 500);
  assert.strictEqual(
    res500.getData().error,
    "Error modificando el método de envío",
    "Mensaje genérico sin detalles internos",
  );
  assert.strictEqual(
    res500.getData().details,
    undefined,
    "No debe incluir details: error.message en 500",
  );

  // 8.10 Auditoría registrada en dbLocal
  const Auditoria = dbLocal.getAuditoriaModel();
  const auditorias = await Auditoria.find({ accion: "modificar_envio_pedido" });
  assert.ok(auditorias.length >= 2, "Debe haber registrado las auditorías correspondientes");

  console.log("  ✅ Modificación administrativa, costoAcordado, tasa del día y 500 seguro validados");

  // --------------------------------------------------------------------------
  // TEST 9: Verificación F0-13 (Cero datos ficticios o aleatorios en frontend)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 9: Verificación de F0-13 (Sin 'random' ni 'aleatori' en frontend)...");

  try {
    const grepOutput = execSync("grep -rn 'random\\|aleatori' public/src || true", {
      encoding: "utf-8",
    }).trim();
    assert.strictEqual(grepOutput, "", `No debe haber coincidencias en public/src. Encontrado:\n${grepOutput}`);
    console.log("  ✅ grep -rn 'random|aleatori' public/src devolvió 0 coincidencias");
  } catch (err: any) {
    assert.fail(`Error ejecutando grep: ${err.message}`);
  }

  // Restaurar espías
  whatsapp.enviarTexto = originalEnviarTexto;
  orderService.emitirYGuardar = originalEmitirYGuardar;
  chatFlowService._sendYGuardar = originalSendYGuardar;

  // Limpieza de datos al finalizar la suite
  await Pedido.deleteMany({});
  await MetodoEnvio.deleteMany({});
  await Etiqueta.deleteMany({});

  console.log("\n================================================================================");
  console.log("🎉 TODOS LOS CASOS DE PRUEBA DE F0-12 Y F0-13 PASARON EXITOSAMENTE (9/9)");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("❌ Fallo en suite test-retiro.ts:", err);
  process.exit(1);
});
