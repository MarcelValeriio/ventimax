/**
 * scripts/test-flujo-no-laborable.ts
 * Suite de pruebas automatizadas para la tarea F0-4:
 * Flujo de días no laborables configurable desde el panel administrativo.
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const configManager = require("../services/configManager");
const dbLocal = require("../services/dbLocal");
const { validarFlujoNoLaborable } = require("../services/configValidators");
const horarioService = require("../services/horarioService");
const flujoService = require("../services/flujoNoLaborableService");
const chatFlowController = require("../controllers/chatFlowController");
const chatFlowService = require("../services/chatFlowService");
const orderService = require("../services/orderService");
const configAdminController = require("../controllers/configAdminController");

async function runTests() {
  console.log("================================================================================");
  console.log("🌙 SUITE DE PRUEBAS: FLUJO DE DÍAS NO LABORABLES (F0-4)");
  console.log("================================================================================");

  // Limpiar base de datos local y cachés
  flujoService.invalidateFlujoCache();
  horarioService.invalidateHorarioCache();
  const data = dbLocal.read();
  if (data.settings) {
    delete data.settings.flujoNoLaborable;
    delete data.settings.horarioAtencion;
    dbLocal.write(data);
  }

  // --------------------------------------------------------------------------
  // TEST 1: Fallback por defecto de marca y respaldo neutro (Punto 3 de Claude)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 1: Fallback por defecto de marca y respaldo neutro...");
  const def = flujoService.getDefaultFlujoNoLaborable();
  assert.strictEqual(def.activo, true, "Por defecto el flujo debe estar activo");
  assert.strictEqual(def.entregaDiferida.activo, true, "Entrega diferida debe estar activa por defecto");
  assert.strictEqual(typeof def.entregaDiferida.texto, "string", "Texto de entrega diferida debe ser string");
  assert.strictEqual(def.retiroEnPunto.activo, false, "En ventimax retiroEnPunto debe ser false por defecto");

  // Verificar que el respaldo neutro en el código sea "Entrega en día hábil" (nunca promesas comerciales engañosas)
  const origGet = configManager.get;
  configManager.get = (k: string) => undefined;
  flujoService.invalidateFlujoCache();
  const defSinConfig = flujoService.getDefaultFlujoNoLaborable();
  configManager.get = origGet;
  flujoService.invalidateFlujoCache();

  assert.strictEqual(
    defSinConfig.entregaDiferida.texto,
    "Entrega en día hábil",
    "El respaldo en código debe ser neutro ('Entrega en día hábil'), sin 'Delivery Gratis'"
  );
  console.log("  ✅ Test 1 superado (Fallback ventimax y respaldo neutro verificados)");

  // --------------------------------------------------------------------------
  // TEST 2: Validaciones de esquema en validarFlujoNoLaborable (Puntos 1 y 2 de Claude)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 2: Validaciones de esquema (rechazo de modalidades apagadas y límites)...");
  
  // 2.1 Tipos inválidos básicos
  const invalidos = [
    null,
    undefined,
    "string",
    123,
    [],
    { activo: "si" }, // activo no booleano
    { activo: true, entregaDiferida: null },
    { activo: true, entregaDiferida: { activo: "si" } },
    { activo: true, entregaDiferida: { activo: true, texto: 123 } },
    { activo: true, entregaDiferida: { activo: true }, retiroEnPunto: null },
    { activo: true, entregaDiferida: { activo: true }, retiroEnPunto: { activo: "no" } },
    { activo: true, entregaDiferida: { activo: true }, retiroEnPunto: { activo: true, nombre: 99 } },
  ];

  for (const inv of invalidos) {
    const res = validarFlujoNoLaborable(inv);
    assert.strictEqual(res.ok, false, `Debió fallar validación para: ${JSON.stringify(inv)}`);
  }

  // 2.2 Ambas modalidades apagadas con activo: true
  const resAmbasApagadas = validarFlujoNoLaborable({
    activo: true,
    entregaDiferida: { activo: false, texto: "" },
    retiroEnPunto: { activo: false, nombre: "", direccion: "", horario: "" },
  });
  assert.strictEqual(resAmbasApagadas.ok, false, "Debe rechazar ambas modalidades apagadas con activo: true");
  assert.strictEqual(
    (resAmbasApagadas as any).error,
    "Activa al menos una modalidad o apaga el flujo de días no laborables",
    "El mensaje de error debe coincidir exactamente con el requerido"
  );

  // 2.3 Retiro en punto activo pero sin nombre o sin dirección
  const resRetiroSinNombre = validarFlujoNoLaborable({
    activo: true,
    entregaDiferida: { activo: true, texto: "Entrega" },
    retiroEnPunto: { activo: true, nombre: "   ", direccion: "Calle 1", horario: "8am" },
  });
  assert.strictEqual(resRetiroSinNombre.ok, false, "Debe rechazar retiro activo con nombre vacío");
  assert(
    (resRetiroSinNombre as any).error.includes("nombre del punto de retiro es obligatorio"),
    "Mensaje debe indicar que el nombre es obligatorio"
  );

  const resRetiroSinDir = validarFlujoNoLaborable({
    activo: true,
    entregaDiferida: { activo: true, texto: "Entrega" },
    retiroEnPunto: { activo: true, nombre: "Punto Central", direccion: "", horario: "8am" },
  });
  assert.strictEqual(resRetiroSinDir.ok, false, "Debe rechazar retiro activo con dirección vacía");
  assert(
    (resRetiroSinDir as any).error.includes("dirección del punto de retiro es obligatoria"),
    "Mensaje debe indicar que la dirección es obligatoria"
  );

  // 2.4 Límites de longitud máxima
  const resTextoLargo = validarFlujoNoLaborable({
    activo: true,
    entregaDiferida: { activo: true, texto: "A".repeat(61) },
    retiroEnPunto: { activo: false },
  });
  assert.strictEqual(resTextoLargo.ok, false, "Debe rechazar texto de entrega > 60 caracteres");

  const resNombreLargo = validarFlujoNoLaborable({
    activo: true,
    entregaDiferida: { activo: true, texto: "Entrega" },
    retiroEnPunto: { activo: true, nombre: "B".repeat(61), direccion: "Calle 1" },
  });
  assert.strictEqual(resNombreLargo.ok, false, "Debe rechazar nombre de punto > 60 caracteres");

  const resDirLarga = validarFlujoNoLaborable({
    activo: true,
    entregaDiferida: { activo: true, texto: "Entrega" },
    retiroEnPunto: { activo: true, nombre: "Punto", direccion: "C".repeat(201) },
  });
  assert.strictEqual(resDirLarga.ok, false, "Debe rechazar dirección > 200 caracteres");

  const resHorarioLargo = validarFlujoNoLaborable({
    activo: true,
    entregaDiferida: { activo: true, texto: "Entrega" },
    retiroEnPunto: { activo: true, nombre: "Punto", direccion: "Calle 1", horario: "D".repeat(101) },
  });
  assert.strictEqual(resHorarioLargo.ok, false, "Debe rechazar horario > 100 caracteres");

  // 2.5 Payload válido
  const valido = validarFlujoNoLaborable({
    activo: true,
    entregaDiferida: { activo: true, texto: "Entrega en día hábil" },
    retiroEnPunto: { activo: true, nombre: "Punto Aliado", direccion: "Chacao", horario: "8am a 6pm" },
  });
  assert.strictEqual(valido.ok, true, "Payload válido debe ser aceptado");
  console.log("  ✅ Test 2 superado (Rechazo estricto de modalidades apagadas, campos requeridos y límites)");

  // --------------------------------------------------------------------------
  // TEST 3: Endpoints administrativos GET y PUT
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 3: Endpoints administrativos (GET y PUT)...");
  let mockResJson: any = null;
  let mockResStatus: number = 200;

  const mockRes = {
    status(code: number) {
      mockResStatus = code;
      return this;
    },
    json(data: any) {
      mockResJson = data;
      return this;
    },
  };

  // GET
  await configAdminController.getFlujoNoLaborableConfig({} as any, mockRes as any);
  assert.strictEqual(mockResJson.success, true);
  assert.strictEqual(mockResJson.flujo.activo, true);

  // PUT válido
  const reqPut = {
    body: {
      flujo: {
        activo: true,
        entregaDiferida: { activo: true, texto: "Entrega diferida especial" },
        retiroEnPunto: { activo: true, nombre: "Tienda Principal", direccion: "Bello Monte", horario: "9 a 5" },
      },
    },
    usuario: { id: "admin-1", username: "admin", role: "admin" },
  };
  await configAdminController.updateFlujoNoLaborableConfig(reqPut as any, mockRes as any);
  assert.strictEqual(mockResJson.success, true);
  assert.strictEqual(mockResJson.flujo.entregaDiferida.texto, "Entrega diferida especial");
  assert.strictEqual(mockResJson.flujo.retiroEnPunto.nombre, "Tienda Principal");

  // PUT inválido (ambas modalidades apagadas)
  const reqPutInv = {
    body: {
      flujo: {
        activo: true,
        entregaDiferida: { activo: false },
        retiroEnPunto: { activo: false },
      },
    },
    usuario: { id: "admin-1", username: "admin", role: "admin" },
  };
  await configAdminController.updateFlujoNoLaborableConfig(reqPutInv as any, mockRes as any);
  assert.strictEqual(mockResStatus, 400);
  assert.strictEqual(mockResJson.success, false);
  assert.strictEqual(mockResJson.error, "Activa al menos una modalidad o apaga el flujo de días no laborables");
  console.log("  ✅ Test 3 superado (Endpoints GET y PUT funcionando con validación y persistencia)");

  // --------------------------------------------------------------------------
  // TEST 4: Variables dinámicas desde horarioService
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 4: Variables dinámicas desde horarioService (proximoDiaHabil y horaApertura)...");
  horarioService.setHorarioEnMemoria({
    zonaHoraria: "America/Caracas",
    dias: [1, 2, 3, 4, 5],
    apertura: "09:00",
    cierre: "17:00",
  });

  const fechaDomingo = new Date("2026-10-25T12:00:00-04:00");
  const proxDomingo = horarioService.getProximoDiaHabil(fechaDomingo);
  assert.strictEqual(proxDomingo, "Lunes", "Si es domingo, el próximo día hábil debe ser Lunes");

  const fechaSabado = new Date("2026-10-24T12:00:00-04:00");
  const proxSabado = horarioService.getProximoDiaHabil(fechaSabado);
  assert.strictEqual(proxSabado, "Lunes", "Si es sábado y Lun-Vie son hábiles, el próximo debe ser Lunes");

  horarioService.setHorarioEnMemoria({
    zonaHoraria: "America/Caracas",
    dias: [1, 2, 3, 4, 5, 6],
    apertura: "08:30",
    cierre: "18:00",
  });
  const horaAp = horarioService.getHoraAperturaFormateada();
  assert.strictEqual(horaAp, "8:30 am", "Hora de apertura formateada debe ser 8:30 am");
  console.log("  ✅ Test 4 superado (getProximoDiaHabil y getHoraAperturaFormateada operan correctamente)");

  // --------------------------------------------------------------------------
  // TEST 5: Bot en día no laborable con flujo APAGADO (activo: false)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 5: Bot en día no laborable con flujo APAGADO (activo: false)...");
  const caracasNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Caracas" }));
  const hoyDia = caracasNow.getDay();
  const mananaDia = (hoyDia + 1) % 7;
  horarioService.setHorarioEnMemoria({
    zonaHoraria: "America/Caracas",
    dias: [mananaDia], // Solo mañana es laborable, HOY es no laborable
    apertura: "09:00",
    cierre: "17:00",
  });

  flujoService.setFlujoEnMemoria({
    activo: false,
    entregaDiferida: { activo: true, texto: "Delivery" },
    retiroEnPunto: { activo: false },
  });

  const testPhone5 = "584129990051";
  await orderService.setEstado(testPhone5, { paso: "inicio", carrito: {} });

  const ioMock = {
    emit: (event: string, data: any) => {},
  };

  await chatFlowService.handleInicio({ from: testPhone5, io: ioMock });
  const estado5 = await orderService.getEstado(testPhone5);
  assert.strictEqual(
    estado5.paso,
    "en_faq",
    "Con flujo apagado, el bot debe avanzar a en_faq (flujo normal de bienvenida)"
  );
  console.log("  ✅ Test 5 superado (Con activo: false el bot opera el flujo normal en días no laborables)");

  // --------------------------------------------------------------------------
  // TEST 5b: Defensa contra cliente atascado (ambas modalidades apagadas)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 5b: Defensa contra cliente atascado (ambas modalidades false en BD)...");
  // Forzar en memoria activo: true pero ambas modalidades apagadas (como si viniera de BD corrupta)
  flujoService._setFlujoDirectoParaTest({
    activo: true,
    entregaDiferida: { activo: false, texto: "" },
    retiroEnPunto: { activo: false, nombre: "", direccion: "", horario: "" },
  });

  const testPhone5b = "584129990052";
  await orderService.setEstado(testPhone5b, { paso: "inicio", carrito: {} });

  await chatFlowService.handleInicio({ from: testPhone5b, io: ioMock });
  const estado5b = await orderService.getEstado(testPhone5b);
  assert.strictEqual(
    estado5b.paso,
    "en_faq",
    "Si ambas modalidades están apagadas, el bot NO debe meter al cliente en fin_semana_opciones (evita atasco)"
  );
  console.log("  ✅ Test 5b superado (Defensa activa: el bot atiende con flujo normal y nunca deja al cliente atascado)");

  // --------------------------------------------------------------------------
  // TEST 6: Bot con SOLO ENTREGA DIFERIDA activa (retiroEnPunto: false)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 6: Bot con SOLO ENTREGA DIFERIDA activa (retiroEnPunto: false)...");
  flujoService.setFlujoEnMemoria({
    activo: true,
    entregaDiferida: { activo: true, texto: "Despacho próximo día hábil" },
    retiroEnPunto: { activo: false, nombre: "", direccion: "", horario: "" },
  });

  const testPhone6 = "584129990061";
  await orderService.setEstado(testPhone6, { paso: "inicio", carrito: {} });

  let botonesEnviados: any[] = [];
  const whatsappService = require("../services/whatsapp");
  const originalEnviarBotones = whatsappService.enviarBotones;
  whatsappService.enviarBotones = async (to: string, text: string, btns: any[]) => {
    botonesEnviados = btns;
    return true;
  };

  try {
    await chatFlowService.handleInicio({ from: testPhone6, io: ioMock });
    const estado6 = await orderService.getEstado(testPhone6);
    assert.strictEqual(estado6.paso, "fin_semana_opciones", "Debe entrar a fin_semana_opciones");
    assert.strictEqual(botonesEnviados.length, 1, "Debe enviar exactamente 1 botón");
    assert.strictEqual(botonesEnviados[0].id, "fin_semana_pedir_lunes", "El botón debe ser el de entrega diferida");

    let msgConfirmacion = "";
    const origSendYGuardar = chatFlowService._sendYGuardar;
    chatFlowService._sendYGuardar = async (from: string, msg: string) => {
      msgConfirmacion = msg;
      return true;
    };

    try {
      await chatFlowService.handleIncomingMessage(
        testPhone6,
        "interactive",
        "fin_semana_pedir_lunes",
        "Pedir",
        null,
        ioMock,
        {},
        null,
        null,
        null,
        { debounceMs: 0 }
      );

      const estado6b = await orderService.getEstado(testPhone6);
      assert.strictEqual(estado6b.paso, "esperando_seleccion", "Avanza a selección de productos");
      assert.strictEqual(estado6b.carrito.esFinDeSemana, true, "Marca el carrito como pedido de fin de semana");
      assert(
        msgConfirmacion.includes("Despacho próximo día hábil") || msgConfirmacion.includes("Lunes"),
        `El mensaje de confirmación debe incluir la modalidad o el día hábil: ${msgConfirmacion}`
      );
    } finally {
      chatFlowService._sendYGuardar = origSendYGuardar;
    }
  } finally {
    whatsappService.enviarBotones = originalEnviarBotones;
  }
  console.log("  ✅ Test 6 superado (Solo entrega diferida envía 1 botón y confirma sin textos fijos)");

  // --------------------------------------------------------------------------
  // TEST 7: Bot con SOLO RETIRO EN PUNTO ALIADO activo (entregaDiferida: false)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 7: Bot con SOLO RETIRO EN PUNTO ALIADO activo (entregaDiferida: false)...");
  flujoService.setFlujoEnMemoria({
    activo: true,
    entregaDiferida: { activo: false, texto: "" },
    retiroEnPunto: {
      activo: true,
      nombre: "Sucursal Chacao (Pick Up)",
      direccion: "Av. Francisco de Miranda, Torre Delta PB",
      horario: "Lunes a Domingo 9:00 am a 6:00 pm",
    },
  });

  const testPhone7 = "584129990071";
  await orderService.setEstado(testPhone7, { paso: "inicio", carrito: {} });

  botonesEnviados = [];
  whatsappService.enviarBotones = async (to: string, text: string, btns: any[]) => {
    botonesEnviados = btns;
    return true;
  };

  try {
    await chatFlowService.handleInicio({ from: testPhone7, io: ioMock });
    const estado7 = await orderService.getEstado(testPhone7);
    assert.strictEqual(estado7.paso, "fin_semana_opciones", "Debe entrar a fin_semana_opciones");
    assert.strictEqual(botonesEnviados.length, 1, "Debe enviar exactamente 1 botón (retiro)");
    assert.strictEqual(botonesEnviados[0].id, "fin_semana_punto_aliado", "El botón debe ser el de punto aliado");

    let textoInfoPunto = "";
    const origEnviarTexto = whatsappService.enviarTexto;
    whatsappService.enviarTexto = async (to: string, msg: string) => {
      textoInfoPunto = msg;
      return true;
    };

    try {
      await chatFlowService.handleIncomingMessage(
        testPhone7,
        "interactive",
        "fin_semana_punto_aliado",
        "Punto Aliado",
        null,
        ioMock,
        {},
        null,
        null,
        null,
        { debounceMs: 0 }
      );

      assert(
        textoInfoPunto.includes("Sucursal Chacao"),
        `La info enviada debe contener el nombre del punto: ${textoInfoPunto}`
      );
      assert(
        textoInfoPunto.includes("Torre Delta PB"),
        `La info enviada debe contener la dirección: ${textoInfoPunto}`
      );
    } finally {
      whatsappService.enviarTexto = origEnviarTexto;
    }
  } finally {
    whatsappService.enviarBotones = originalEnviarBotones;
  }
  console.log("  ✅ Test 7 superado (Solo retiro envía 1 botón y muestra la información del punto aliado)");

  // --------------------------------------------------------------------------
  // TEST 8: Transición dinámica al desactivar flujo en memoria
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 8: Transición inmediata al desactivar flujo en memoria...");
  const testPhone8 = "584129990081";
  await orderService.setEstado(testPhone8, { paso: "fin_semana_opciones", carrito: {} });

  flujoService.setFlujoEnMemoria({
    activo: false,
    entregaDiferida: { activo: false },
    retiroEnPunto: { activo: false },
  });

  await chatFlowService.handleIncomingMessage(
    testPhone8,
    "text",
    "hola",
    null,
    null,
    ioMock,
    {},
    null,
    null,
    null,
    { debounceMs: 0 }
  );

  const estado8 = await orderService.getEstado(testPhone8);
  assert.strictEqual(
    estado8.paso,
    "en_faq",
    "El usuario debe ser sacado de fin_semana_opciones y pasar a en_faq"
  );
  console.log("  ✅ Test 8 superado (Transición inmediata de fin_semana_opciones a en_faq al desactivar flujo)");

  // --------------------------------------------------------------------------
  // TEST 9: Cliente escribe a mano con día hábil dinámico ("pedir sábado" con/sin tilde)
  // (Punto 4 de Claude)
  // --------------------------------------------------------------------------
  console.log("\n▶ Test 9: Reconocimiento de texto 'pedir <día>' con día hábil dinámico (sábado con/sin tilde)...");
  // Configurar horario donde el próximo día hábil sea Sábado (6)
  // Asumiendo que hoy es viernes o cualquier día donde el próximo hábil en la lista sea 6:
  horarioService.setHorarioEnMemoria({
    zonaHoraria: "America/Caracas",
    dias: [6], // Solo Sábado es hábil
    apertura: "09:00",
    cierre: "17:00",
  });

  flujoService.setFlujoEnMemoria({
    activo: true,
    entregaDiferida: { activo: true, texto: "Entrega sábado" },
    retiroEnPunto: { activo: false },
  });

  const testPhone9 = "584129990091";
  await orderService.setEstado(testPhone9, { paso: "fin_semana_opciones", carrito: {} });

  // 9.1 Cliente escribe "pedir sábado" (con tilde)
  await chatFlowService.handleIncomingMessage(
    testPhone9,
    "text",
    "pedir sábado",
    null,
    null,
    ioMock,
    {},
    null,
    null,
    null,
    { debounceMs: 0 }
  );

  let estado9 = await orderService.getEstado(testPhone9);
  assert.strictEqual(
    estado9.paso,
    "esperando_seleccion",
    "Escribir 'pedir sábado' (con tilde) debe avanzar a esperando_seleccion"
  );
  assert.strictEqual(estado9.carrito?.esFinDeSemana, true);

  // 9.2 Cliente escribe "pedir sabado" (sin tilde)
  const testPhone9b = "584129990092";
  await orderService.setEstado(testPhone9b, { paso: "fin_semana_opciones", carrito: {} });

  await chatFlowService.handleIncomingMessage(
    testPhone9b,
    "text",
    "pedir sabado",
    null,
    null,
    ioMock,
    {},
    null,
    null,
    null,
    { debounceMs: 0 }
  );

  estado9 = await orderService.getEstado(testPhone9b);
  assert.strictEqual(
    estado9.paso,
    "esperando_seleccion",
    "Escribir 'pedir sabado' (sin tilde) debe avanzar a esperando_seleccion"
  );

  // 9.3 Compatibilidad histórica: "lunes" o "pedir lunes" también sigue siendo aceptado
  const testPhone9c = "584129990093";
  await orderService.setEstado(testPhone9c, { paso: "fin_semana_opciones", carrito: {} });

  await chatFlowService.handleIncomingMessage(
    testPhone9c,
    "text",
    "pedir lunes",
    null,
    null,
    ioMock,
    {},
    null,
    null,
    null,
    { debounceMs: 0 }
  );

  estado9 = await orderService.getEstado(testPhone9c);
  assert.strictEqual(
    estado9.paso,
    "esperando_seleccion",
    "Escribir 'pedir lunes' sigue siendo aceptado por compatibilidad"
  );
  console.log("  ✅ Test 9 superado ('pedir sábado' con y sin tilde reconocido dinámicamente y avanza a compra)");

  console.log("\n================================================================================");
  console.log("🎉 TODOS LOS TESTS DE FLUJO DE DÍAS NO LABORABLES PASARON CON ÉXITO (9/9)");
  console.log("================================================================================");
}

runTests().catch((err) => {
  console.error("❌ Error ejecutando suite test-flujo-no-laborable:", err);
  process.exit(1);
});
