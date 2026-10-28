/**
 * scripts/test-horario.ts
 * Suite de pruebas para Horario de Atención comercial editable desde el panel (F0-3).
 *
 * Criterios de cierre:
 *  - Días configurados y detección de día laborable / no laborable.
 *  - Sábado laborable (al incluir 6 en dias).
 *  - Validaciones rechazadas (duplicados, apertura >= cierre, horas inválidas).
 *  - Cambio de días y horas se refleja de forma inmediata sin reiniciar el proceso.
 *  - Endpoints GET y PUT /api/admin/config/horario.
 *  - Mensaje dinámico del bot reflejando el horario configurado.
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const {
  getHorario,
  getHorarioSync,
  setHorario,
  invalidateHorarioCache,
  esDiaNoLaborable,
  formatearDias,
  formatearHorarioAtencion,
} = require("../services/horarioService");
const { validarHorarioAtencion } = require("../services/configValidators");
const { esFinDeSemanaCaracas } = require("../utils/helpers");
const { getHorarioConfig, updateHorarioConfig } = require("../controllers/configAdminController");
const chatFlowController = require("../controllers/chatFlowController");

async function runHorarioTests() {
  console.log("================================================================================");
  console.log("🕒 SUITE DE PRUEBAS: HORARIO DE ATENCIÓN COMERCIAL (F0-3)");
  console.log("================================================================================\n");

  // Limpiar BD local antes de empezar
  const data = dbLocal.read();
  if (data.settings) {
    delete data.settings["horarioAtencion"];
    dbLocal.write(data);
  }
  invalidateHorarioCache();

  // Fechas fijas para pruebas (Caracas UTC-4)
  // 2026-10-28 es Miércoles (día 3) a las 14:00 UTC (10:00 AM Caracas)
  const fechaMiercoles = new Date("2026-10-28T14:00:00.000Z");
  // 2026-10-31 es Sábado (día 6) a las 15:00 UTC (11:00 AM Caracas)
  const fechaSabado = new Date("2026-10-31T15:00:00.000Z");
  // 2026-11-01 es Domingo (día 0) a las 15:00 UTC (11:00 AM Caracas)
  const fechaDomingo = new Date("2026-11-01T15:00:00.000Z");
  // 2026-10-30 es Viernes (día 5) a las 15:00 UTC (11:00 AM Caracas)
  const fechaViernes = new Date("2026-10-30T15:00:00.000Z");

  console.log("▶ Test 1: Fallback por defecto de marca (sin Setting en BD)...");
  const horarioDefecto = await getHorario();
  assert.strictEqual(horarioDefecto.zonaHoraria, "America/Caracas");
  assert.deepStrictEqual(horarioDefecto.dias, [1, 2, 3, 4, 5]);
  assert.strictEqual(horarioDefecto.apertura, "09:00");
  assert.strictEqual(horarioDefecto.cierre, "17:00");
  assert.strictEqual(formatearHorarioAtencion(horarioDefecto), "Lunes a Viernes de 9:00 am a 5:00 pm");
  console.log("  ✅ Test 1 superado (Fallback VentiMax: Lunes a Viernes de 9:00 am a 5:00 pm)");

  console.log("▶ Test 2: Detección de días laborables vs no laborables y alias legacy...");
  assert.strictEqual(esDiaNoLaborable(fechaMiercoles), false, "Miércoles debe ser día laborable");
  assert.strictEqual(esDiaNoLaborable(fechaSabado), true, "Sábado debe ser no laborable por defecto");
  assert.strictEqual(esDiaNoLaborable(fechaDomingo), true, "Domingo debe ser no laborable por defecto");
  assert.strictEqual(esFinDeSemanaCaracas(fechaSabado), true, "Alias esFinDeSemanaCaracas debe retornar true en sábado");
  assert.strictEqual(esFinDeSemanaCaracas(fechaMiercoles), false, "Alias esFinDeSemanaCaracas debe retornar false en miércoles");
  console.log("  ✅ Test 2 superado (esDiaNoLaborable y alias esFinDeSemanaCaracas operan correctamente)");

  console.log("▶ Test 3: Sábado laborable (configuración con días [1, 2, 3, 4, 5, 6])...");
  await setHorario({
    zonaHoraria: "America/Caracas",
    dias: [1, 2, 3, 4, 5, 6],
    apertura: "09:00",
    cierre: "18:00",
  });
  assert.strictEqual(esDiaNoLaborable(fechaSabado), false, "Sábado ahora debe ser día laborable");
  assert.strictEqual(esDiaNoLaborable(fechaDomingo), true, "Domingo sigue siendo día no laborable");
  assert.strictEqual(formatearDias([1, 2, 3, 4, 5, 6]), "Lunes a Sábado");
  assert.strictEqual(formatearHorarioAtencion(), "Lunes a Sábado de 9:00 am a 6:00 pm");
  console.log("  ✅ Test 3 superado (Sábado configurado como laborable exitosamente)");

  console.log("▶ Test 4: Cambio dinámico en memoria sin reinicio...");
  await setHorario({
    zonaHoraria: "America/Caracas",
    dias: [1, 2, 3, 4],
    apertura: "08:30",
    cierre: "16:30",
  });
  // Viernes ahora no es laborable
  assert.strictEqual(esDiaNoLaborable(fechaViernes), true, "Viernes ahora es día no laborable sin reiniciar");
  assert.strictEqual(esDiaNoLaborable(fechaMiercoles), false, "Miércoles sigue siendo laborable");
  assert.strictEqual(formatearHorarioAtencion(), "Lunes a Jueves de 8:30 am a 4:30 pm");
  console.log("  ✅ Test 4 superado (Cambio dinámico inmediato sin reinicio de proceso)");

  console.log("▶ Test 5: Validaciones rechazadas en validarHorarioAtencion...");
  const casosRechazados = [
    { payload: null, desc: "Payload nulo" },
    { payload: "no-objeto", desc: "Payload no objeto" },
    { payload: { dias: [], apertura: "09:00", cierre: "17:00" }, desc: "Array de días vacío" },
    { payload: { dias: [1, 2, 2, 3], apertura: "09:00", cierre: "17:00" }, desc: "Días con duplicados" },
    { payload: { dias: [7], apertura: "09:00", cierre: "17:00" }, desc: "Día 7 fuera de rango (0-6)" },
    { payload: { dias: [-1], apertura: "09:00", cierre: "17:00" }, desc: "Día negativo fuera de rango" },
    { payload: { dias: ["1"], apertura: "09:00", cierre: "17:00" }, desc: "Día como string no entero" },
    { payload: { dias: [1, 2], apertura: "9:00", cierre: "17:00" }, desc: "Apertura sin leading zero" },
    { payload: { dias: [1, 2], apertura: "25:00", cierre: "17:00" }, desc: "Hora de apertura > 23" },
    { payload: { dias: [1, 2], apertura: "09:65", cierre: "17:00" }, desc: "Minuto de apertura > 59" },
    { payload: { dias: [1, 2], apertura: "17:00", cierre: "09:00" }, desc: "Apertura mayor que cierre" },
    { payload: { dias: [1, 2], apertura: "10:00", cierre: "10:00" }, desc: "Apertura igual a cierre" },
    { payload: { dias: [1, 2], apertura: "09:00", cierre: "17:00", zonaHoraria: "Zona/Invalida_XYZ" }, desc: "Zona horaria inválida" },
  ];

  for (const caso of casosRechazados) {
    const res = validarHorarioAtencion(caso.payload);
    assert.strictEqual(res.ok, false, `Caso '${caso.desc}' debió ser rechazado pero fue aceptado.`);
  }
  console.log(`  ✅ Test 5 superado (${casosRechazados.length} validaciones incorrectas rechazadas estrictamente)`);

  console.log("▶ Test 6: Endpoints administrativos (GET y PUT /api/admin/config/horario)...");
  // Simular GET
  let statusGet = 200;
  let jsonGet: any = null;
  const mockReqGet: any = {};
  const mockResGet: any = {
    status: (s: number) => { statusGet = s; return mockResGet; },
    json: (data: any) => { jsonGet = data; return mockResGet; },
  };
  await getHorarioConfig(mockReqGet, mockResGet);
  assert.strictEqual(statusGet, 200);
  assert.strictEqual(jsonGet.success, true);
  assert.strictEqual(jsonGet.texto, "Lunes a Jueves de 8:30 am a 4:30 pm");

  // Simular PUT inválido
  let statusPutBad = 200;
  let jsonPutBad: any = null;
  const mockReqPutBad: any = {
    body: { dias: [1], apertura: "18:00", cierre: "09:00" },
  };
  const mockResPutBad: any = {
    status: (s: number) => { statusPutBad = s; return mockResPutBad; },
    json: (data: any) => { jsonPutBad = data; return mockResPutBad; },
  };
  await updateHorarioConfig(mockReqPutBad, mockResPutBad);
  assert.strictEqual(statusPutBad, 400);
  assert.strictEqual(jsonPutBad.success, false);
  assert(jsonPutBad.error.includes("anterior"));

  // Simular PUT válido (Lunes a Viernes de 9:00 am a 5:00 pm)
  let statusPutOk = 200;
  let jsonPutOk: any = null;
  const mockReqPutOk: any = {
    body: {
      horario: {
        dias: [1, 2, 3, 4, 5],
        apertura: "09:00",
        cierre: "17:00",
      },
    },
    user: { user: "admin", role: "admin" },
  };
  const mockResPutOk: any = {
    status: (s: number) => { statusPutOk = s; return mockResPutOk; },
    json: (data: any) => { jsonPutOk = data; return mockResPutOk; },
  };
  await updateHorarioConfig(mockReqPutOk, mockResPutOk);
  assert.strictEqual(statusPutOk, 200);
  assert.strictEqual(jsonPutOk.success, true);
  assert.strictEqual(jsonPutOk.texto, "Lunes a Viernes de 9:00 am a 5:00 pm");
  console.log("  ✅ Test 6 superado (Endpoints GET y PUT con autorización y validación)");

  console.log("▶ Test 7: Mensaje dinámico de fin de semana en chatFlowController...");
  let mensajeEnviado = "";
  const originalEmitirYGuardar = chatFlowController.emitirYGuardar;
  chatFlowController.emitirYGuardar = async (tel: string, txt: string) => {
    mensajeEnviado = txt;
    return true;
  };

  try {
    // Configurar un horario específico
    await setHorario({
      zonaHoraria: "America/Caracas",
      dias: [1, 2, 3, 4, 5, 6],
      apertura: "08:00",
      cierre: "18:00",
    });

    await chatFlowController.solicitarOpcionFinDeSemana("584120000000", "Carlos");
    assert(
      mensajeEnviado.includes("Lunes a Sábado de 8:00 am a 6:00 pm"),
      `El mensaje enviado debe incluir el horario dinámico. Mensaje: ${mensajeEnviado}`
    );
    console.log("  ✅ Test 7 superado (Mensaje del bot incluye dinámicamente el horario configurado)");
  } finally {
    chatFlowController.emitirYGuardar = originalEmitirYGuardar;
  }

  console.log("\n================================================================================");
  console.log("🎉 TODOS LOS TESTS DE HORARIO COMERCIAL PASARON EXITOSAMENTE (7/7)");
  console.log("================================================================================\n");
}

runHorarioTests().catch((err) => {
  console.error("❌ Fallo en suite test-horario.ts:", err);
  process.exit(1);
});
