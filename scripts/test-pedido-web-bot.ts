/**
 * scripts/test-pedido-web-bot.ts
 *
 * Suite de pruebas automatizadas para F2-2:
 * "El bot reconoce el código del pedido web"
 *
 * Criterios de verificación:
 * 1) Los 6 casos del diseño (§3 docs/f2-catalogo-web.md).
 * 2) Precio cambiado y producto agotado / inactivo con avisos.
 * 3) Carrito vacío tras quitar productos agotados -> webOrderEmpty sin cambiar de paso.
 * 4) Dos teléfonos con el mismo código en paralelo -> uno solo lo obtiene (atómico).
 * 5) Modo manual y pasos de pago -> no carga.
 * 6) Variantes del código (vm7k3q9, VM 7K3Q9, dentro de una frase).
 * 7) "Confirmar" lleva al mismo paso que "completar" (avanzarAConfirmacionODatosCliente).
 * 8) origenWeb en Pedido y pedidoId en CarritoWeb guardados al crear el pedido.
 * 9) Catálogo apagado (settings.catalogo.activo: false) -> bot ignora códigos y POST responde 503.
 * 10) Todos los envíos con enviarYRegistrar y textos de settings.messages.
 */

import assert from "node:assert";
import express from "express";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const chatFlowService = require("../services/chatFlowService");
const chatFlow = require("../controllers/chatFlowController");
const orderService = require("../services/orderService");
const configManager = require("../services/configManager");
const whatsappService = require("../services/whatsapp");
const publicRoutes = require("../routes/publicRoutes");

async function runTests() {
  console.log("================================================================================");
  console.log("🌐 SUITE DE PRUEBAS: EL BOT RECONOCE EL CÓDIGO DEL PEDIDO WEB (F2-2)");
  console.log("================================================================================");

  // Espías de mensajes enviados
  const mensajesEnviados: Array<{ to: string; opciones: any }> = [];
  const origEnviarYRegistrar = chatFlow.enviarYRegistrar;
  chatFlow.enviarYRegistrar = async (to: string, opciones: any, io: any) => {
    mensajesEnviados.push({ to, opciones });
    return origEnviarYRegistrar.call(chatFlow, to, opciones, io);
  };

  // Helper para resetear base de datos local
  function resetDb() {
    const data = dbLocal.read();
    data.carritosWeb = [];
    data.pedidos = [];
    data.mensajes = [];
    data.etiquetas = {};
    data.productos = [
      {
        _id: "prod-n21",
        id: "fortunne-n21",
        name: "Fortunne Mini Jumbo 6\"",
        price: 25,
        activo: true,
        trackStock: false,
        stock: 10,
      },
      {
        _id: "prod-n22",
        id: "fortunne-n22",
        name: "Fortunne High Velocity Fan 8\"",
        price: 35,
        activo: true,
        trackStock: true,
        stock: 5,
      },
      {
        _id: "prod-n04",
        id: "fortunne-n04",
        name: "Fortunne Turbo Fan 10\"",
        price: 40,
        activo: true,
        trackStock: true,
        stock: 0, // Agotado
      },
      {
        _id: "prod-n20",
        id: "fortunne-n20",
        name: "Fortunne Turbo Fan 12\"",
        price: 46,
        activo: false, // Inactivo
        trackStock: false,
        stock: 5,
      },
    ];
    dbLocal.write(data);
    mensajesEnviados.length = 0;
  }

  try {
    // --------------------------------------------------------------------------
    // TEST 1: Caso Válido / Happy Path (código pendiente y vigente)
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 1: Código válido pendiente y vigente...");
    resetDb();

    const CarritoWeb = dbLocal.getCarritoWebModel();
    const codigoValido = "VM-7K3Q9";
    await CarritoWeb.create({
      codigo: codigoValido,
      items: [
        { productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo 6\"", precio: 25, cantidad: 2 },
      ],
      total: 50,
      estado: "pendiente",
      telefono: null,
      creadoEn: new Date(),
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });

    const tel1 = "584121111111";
    await chatFlowService._processBatch(tel1, [
      { from: tel1, text: `Hola, quiero confirmar mi pedido web ${codigoValido}`, tipo: "text", io: null },
    ]);

    // Comprobar que CarritoWeb quedó vinculado a tel1
    const cw1 = await CarritoWeb.findOne({ codigo: codigoValido });
    assert.strictEqual(cw1.estado, "vinculado", "CarritoWeb debe pasar a estado 'vinculado'");
    assert.strictEqual(cw1.telefono, tel1, "CarritoWeb debe registrar el teléfono del reclamante");

    // Comprobar estado del bot para tel1
    const est1 = await orderService.getEstado(tel1);
    assert.strictEqual(est1.paso, "esperando_confirmacion_web", "Paso debe ser esperando_confirmacion_web");
    assert.strictEqual(est1.carrito.codigoWeb, codigoValido, "El carrito debe registrar codigoWeb");
    assert.strictEqual(est1.carrito.origenWeb.codigo, codigoValido, "El carrito debe registrar origenWeb");
    assert.strictEqual(est1.carrito.items.length, 1, "Debe tener 1 producto cargado");
    assert.strictEqual(est1.carrito.items[0].id, "fortunne-n21");
    assert.strictEqual(est1.carrito.items[0].cantidad, 2);

    // Comprobar mensaje enviado
    const ultimoMsg1 = mensajesEnviados[mensajesEnviados.length - 1];
    assert.strictEqual(ultimoMsg1.to, tel1);
    assert.strictEqual(ultimoMsg1.opciones.tipo, "botones");
    assert.ok(ultimoMsg1.opciones.texto.includes("VM-7K3Q9"), "El mensaje debe incluir el código");
    assert.ok(ultimoMsg1.opciones.texto.includes("$50"), "El mensaje debe incluir el total de $50");
    console.log("  ✅ Test 1 superado (Código válido vinculado y resumen enviado)");

    // --------------------------------------------------------------------------
    // TEST 2: Confirmar ("Confirmar" lleva al mismo paso que "completar")
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 2: 'Confirmar' reutiliza la lógica de 'completar'...");
    // 2a: Cliente nuevo (sin datos) -> pide nombre (esperando_datos_cliente)
    await chatFlowService._processBatch(tel1, [
      { from: tel1, text: "web_confirmar", tipo: "interactive", io: null },
    ]);
    const est2a = await orderService.getEstado(tel1);
    assert.strictEqual(est2a.paso, "esperando_datos_cliente", "Cliente nuevo pasa a esperando_datos_cliente");

    // 2b: Cliente con datos completos -> pasa directo a esperando_confirmacion_datos
    const tel2 = "584122222222";
    await orderService.setEstado(tel2, {
      paso: "esperando_confirmacion_web",
      carrito: {
        items: [{ id: "fortunne-n21", producto: "Fortunne Mini Jumbo 6\"", price: 25, cantidad: 1 }],
        nombre: "María Pérez",
        cedula: "V-12345678",
        direccion_manual: "Los Cortijos, Caracas",
        codigoWeb: "VM-7K3Q9",
        origenWeb: { codigo: "VM-7K3Q9" },
      },
    }, null);

    await chatFlowService._processBatch(tel2, [
      { from: tel2, text: "web_confirmar", tipo: "interactive", io: null },
    ]);
    const est2b = await orderService.getEstado(tel2);
    assert.strictEqual(est2b.paso, "esperando_confirmacion_datos", "Cliente con datos conocidos pasa a esperando_confirmacion_datos");
    console.log("  ✅ Test 2 superado ('Confirmar' bifurca correctamente según datos conocidos)");

    // --------------------------------------------------------------------------
    // TEST 3: Rastro del origen (Pedido.origenWeb y CarritoWeb.pedidoId)
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 3: Rastro del origen al crear el pedido inicial...");
    const pedidoCreado = await orderService.crearPedidoInicial(tel2, est2b.carrito, null);
    assert.ok(pedidoCreado, "Pedido debe haberse creado");
    assert.ok(pedidoCreado.origenWeb, "Pedido debe tener campo origenWeb");
    assert.strictEqual(pedidoCreado.origenWeb.codigo, "VM-7K3Q9", "Pedido.origenWeb.codigo debe coincidir");

    const cwAsociado = await CarritoWeb.findOne({ codigo: "VM-7K3Q9" });
    assert.strictEqual(
      String(cwAsociado.pedidoId),
      String(pedidoCreado._id),
      "CarritoWeb.pedidoId debe quedar vinculado al _id del Pedido"
    );
    console.log("  ✅ Test 3 superado (Pedido.origenWeb y CarritoWeb.pedidoId vinculados)");

    // --------------------------------------------------------------------------
    // TEST 4: Reenviar código por el MISMO teléfono
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 4: Reenvío del código por el mismo teléfono no duplica líneas...");
    mensajesEnviados.length = 0;
    await chatFlowService._processBatch(tel1, [
      { from: tel1, text: `VM-7K3Q9`, tipo: "text", io: null },
    ]);
    const est4 = await orderService.getEstado(tel1);
    assert.strictEqual(est4.carrito.items.length, 1, "No debe duplicar líneas del carrito");
    const msgReenvio = mensajesEnviados[mensajesEnviados.length - 1];
    assert.ok(msgReenvio.opciones.texto.includes("VM-7K3Q9"), "Debe reenviar el resumen del pedido web");
    console.log("  ✅ Test 4 superado (Mismo teléfono recibe resumen sin duplicación)");

    // --------------------------------------------------------------------------
    // TEST 5: Reenviar código por OTRO teléfono (código ya usado)
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 5: Reenvío por otro teléfono informa código usado sin revelar productos...");
    mensajesEnviados.length = 0;
    const telOtro = "584128888888";
    await chatFlowService._processBatch(telOtro, [
      { from: telOtro, text: `VM-7K3Q9`, tipo: "text", io: null },
    ]);
    const ultimoMsgOtro = mensajesEnviados[mensajesEnviados.length - 1];
    assert.ok(
      ultimoMsgOtro.opciones.texto.includes("ya fue vinculado y utilizado"),
      "Debe avisar que el código ya fue usado"
    );
    assert.ok(
      !ultimoMsgOtro.opciones.texto.includes("Fortunne Mini Jumbo"),
      "Prohibido revelar el contenido del carrito de otro usuario"
    );
    console.log("  ✅ Test 5 superado (Otro teléfono bloqueado sin filtración de datos)");

    // --------------------------------------------------------------------------
    // TEST 5b: El mismo teléfono reenvía un código que ya se convirtió en pedido
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 5b: Código ya convertido en pedido no se vuelve a cargar...");
    await CarritoWeb.create({
      codigo: "VM-PDD22",
      items: [{ productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo", precio: 25, cantidad: 1 }],
      total: 25,
      estado: "vinculado",
      telefono: telOtro,
      pedidoId: "65f0000000000000000000aa",
      expiraEn: new Date(Date.now() + 3600000),
    });
    await orderService.setEstado(telOtro, { paso: "inicio", carrito: { items: [] } }, null);
    mensajesEnviados.length = 0;
    await chatFlowService._processBatch(telOtro, [
      { from: telOtro, text: "VM-PDD22", tipo: "text", io: null },
    ]);
    const est5b = await orderService.getEstado(telOtro);
    assert.strictEqual((est5b.carrito?.items || []).length, 0, "No debe cargar otra vez un carrito que ya es pedido");
    assert.ok(
      mensajesEnviados[mensajesEnviados.length - 1].opciones.texto.includes("ya fue vinculado y utilizado"),
      "Debe avisar que el código ya se usó",
    );
    console.log("  ✅ Test 5b superado (Sin segundo pedido con el mismo código)");

    // --------------------------------------------------------------------------
    // TEST 6: Código inexistente o vencido
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 6: Código inexistente o vencido...");
    // 6a: Inexistente
    mensajesEnviados.length = 0;
    await chatFlowService._processBatch(telOtro, [
      { from: telOtro, text: "VM-99999", tipo: "text", io: null },
    ]);
    const msgInexistente = mensajesEnviados[mensajesEnviados.length - 1];
    assert.ok(
      msgInexistente.opciones.texto.includes("No encontramos el pedido web"),
      "Debe avisar que no se encontró el pedido"
    );

    // 6b: Vencido
    await CarritoWeb.create({
      codigo: "VM-EXP99",
      items: [{ productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo", precio: 25, cantidad: 1 }],
      total: 25,
      estado: "pendiente",
      expiraEn: new Date(Date.now() - 3600000), // Venció hace 1 hora
    });
    mensajesEnviados.length = 0;
    await chatFlowService._processBatch(telOtro, [
      { from: telOtro, text: "VM-EXP99", tipo: "text", io: null },
    ]);
    const msgVencido = mensajesEnviados[mensajesEnviados.length - 1];
    assert.ok(
      msgVencido.opciones.texto.includes("No encontramos el pedido web") || msgVencido.opciones.texto.includes("venció"),
      "Debe avisar que el pedido venció o no se encontró"
    );
    console.log("  ✅ Test 6 superado (Inexistente y vencido rechazados con mensaje amable)");

    // --------------------------------------------------------------------------
    // TEST 7: Variantes del código (sin guion, minúsculas, espacios, en frase)
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 7: Variantes del código (vm7k3q9, VM 7K3Q9, dentro de una frase)...");
    await CarritoWeb.create({
      codigo: "VM-VAR22",
      items: [{ productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo", precio: 25, cantidad: 1 }],
      total: 25,
      estado: "pendiente",
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });

    const telVar = "584123333333";
    // Minúsculas y sin guion: vmvar22
    await chatFlowService._processBatch(telVar, [
      { from: telVar, text: "Buenas tardes mi código es vmvar22 gracias", tipo: "text", io: null },
    ]);
    const cwVar = await CarritoWeb.findOne({ codigo: "VM-VAR22" });
    assert.strictEqual(cwVar.estado, "vinculado", "Debe reconocer 'vmvar22' sin guion ni mayúsculas");
    assert.strictEqual(cwVar.telefono, telVar);

    // Espacio en lugar de guion: VM VAR33
    await CarritoWeb.create({
      codigo: "VM-VAR33",
      items: [{ productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo", precio: 25, cantidad: 1 }],
      total: 25,
      estado: "pendiente",
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });
    const telVar2 = "584124444444";
    await chatFlowService._processBatch(telVar2, [
      { from: telVar2, text: "vm var33", tipo: "text", io: null },
    ]);
    const cwVar2 = await CarritoWeb.findOne({ codigo: "VM-VAR33" });
    assert.strictEqual(cwVar2.estado, "vinculado", "Debe reconocer 'vm var33' con espacio");
    console.log("  ✅ Test 7 superado (Todas las variantes de código reconocidas)");

    // --------------------------------------------------------------------------
    // TEST 8: Reclamo concurrente por dos teléfonos en paralelo (Atómico)
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 8: Reclamo concurrente por dos teléfonos en paralelo...");
    await CarritoWeb.create({
      codigo: "VM-RACE2",
      items: [{ productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo", precio: 25, cantidad: 1 }],
      total: 25,
      estado: "pendiente",
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });

    const telA = "584125555551";
    const telB = "584125555552";

    // Disparar simultáneamente
    await Promise.all([
      chatFlowService.procesarCodigoPedidoWeb({ from: telA, codigo: "VM-RACE2", io: null }),
      chatFlowService.procesarCodigoPedidoWeb({ from: telB, codigo: "VM-RACE2", io: null }),
    ]);

    const cwRace = await CarritoWeb.findOne({ codigo: "VM-RACE2" });
    assert.strictEqual(cwRace.estado, "vinculado", "Debe quedar vinculado");
    assert.ok(
      cwRace.telefono === telA || cwRace.telefono === telB,
      "Uno de los dos teléfonos debe ser el ganador exacto"
    );

    const estA = await orderService.getEstado(telA);
    const estB = await orderService.getEstado(telB);

    if (cwRace.telefono === telA) {
      assert.strictEqual(estA.paso, "esperando_confirmacion_web", "Ganador A debe tener el pedido cargado");
      assert.notStrictEqual(estB.paso, "esperando_confirmacion_web", "Perdedor B no debe tener el pedido cargado");
    } else {
      assert.strictEqual(estB.paso, "esperando_confirmacion_web", "Ganador B debe tener el pedido cargado");
      assert.notStrictEqual(estA.paso, "esperando_confirmacion_web", "Perdedor A no debe tener el pedido cargado");
    }
    console.log("  ✅ Test 8 superado (Reclamo atómico: solo uno se lo queda)");

    // --------------------------------------------------------------------------
    // TEST 9: Modificaciones de catálogo (precio cambiado, inactivo, agotado)
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 9: Precios actualizados y avisos de cambios / agotados...");
    // fortunne-n21: precio base 25 -> en carrito web tenía 20 (cambió)
    // fortunne-n22: activo con stock 5 -> en carrito pide 2 (válido)
    // fortunne-n04: stock 0 -> se agota
    // fortunne-n20: activo: false -> inactivo
    await CarritoWeb.create({
      codigo: "VM-DFF22",
      items: [
        { productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo 6\"", precio: 20, cantidad: 1 },
        { productoId: "fortunne-n22", nombre: "Fortunne High Velocity Fan 8\"", precio: 35, cantidad: 2 },
        { productoId: "fortunne-n04", nombre: "Fortunne Turbo Fan 10\"", precio: 40, cantidad: 1 },
        { productoId: "fortunne-n20", nombre: "Fortunne Turbo Fan 12\"", precio: 46, cantidad: 1 },
      ],
      total: 176,
      estado: "pendiente",
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });

    mensajesEnviados.length = 0;
    const telDiff = "584126666666";
    await chatFlowService.procesarCodigoPedidoWeb({ from: telDiff, codigo: "VM-DFF22", io: null });

    const estDiff = await orderService.getEstado(telDiff);
    assert.strictEqual(estDiff.carrito.items.length, 2, "Solo deben quedar los 2 productos disponibles");
    // fortunne-n21 debe tener precio actual de 25 (no 20)
    const it21 = estDiff.carrito.items.find((i: any) => i.id === "fortunne-n21");
    assert.strictEqual(it21.price, 25, "El precio debe actualizarse al de la base de datos");

    // Verificar avisos enviados
    const avisosMsg = mensajesEnviados.find((m) => m.opciones.texto.includes("Avisos sobre tu pedido web"));
    assert.ok(avisosMsg, "Debe enviar mensaje con avisos de cambios");
    assert.ok(avisosMsg.opciones.texto.includes("ahora cuesta $25"), "Debe avisar cambio de precio");
    assert.ok(avisosMsg.opciones.texto.includes("se agotó"), "Debe avisar producto agotado");
    assert.ok(avisosMsg.opciones.texto.includes("ya no está disponible"), "Debe avisar producto inactivo");
    console.log("  ✅ Test 9 superado (Precios actualizados y avisos de stock/inactivos)");

    // --------------------------------------------------------------------------
    // TEST 10: Carrito vacío tras quitar agotados/inactivos
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 10: Carrito vacío tras quitar productos agotados...");
    await CarritoWeb.create({
      codigo: "VM-VAC22",
      items: [
        { productoId: "fortunne-n04", nombre: "Fortunne Turbo Fan 10\"", precio: 40, cantidad: 1 },
      ],
      total: 40,
      estado: "pendiente",
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });

    mensajesEnviados.length = 0;
    const telAllOut = "584127777777";
    await orderService.setEstado(telAllOut, { paso: "inicio" }, null);
    await chatFlowService.procesarCodigoPedidoWeb({ from: telAllOut, codigo: "VM-VAC22", io: null });

    const estAllOut = await orderService.getEstado(telAllOut);
    assert.strictEqual(estAllOut.paso, "inicio", "No debe cambiar de paso si el carrito queda vacío");
    const msgEmpty = mensajesEnviados[mensajesEnviados.length - 1];
    assert.ok(
      msgEmpty.opciones.texto.includes("ya no se encuentran disponibles"),
      "Debe enviar webOrderEmpty"
    );
    console.log("  ✅ Test 10 superado (Carrito vacío envía webOrderEmpty sin cambiar de paso)");

    // --------------------------------------------------------------------------
    // TEST 11: Carrito a medias en el chat (pregunta reemplazar o mantener)
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 11: Carrito a medias en el chat (reemplazar / mantener)...");
    await CarritoWeb.create({
      codigo: "VM-REP22",
      items: [{ productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo", precio: 25, cantidad: 1 }],
      total: 25,
      estado: "pendiente",
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });

    const telRepl = "584129999991";
    // Carrito con 3 unidades en el chat
    await orderService.setEstado(telRepl, {
      paso: "preguntando_mas",
      carrito: {
        items: [{ id: "fortunne-n22", producto: "Fortunne High Velocity", price: 35, cantidad: 3 }],
      },
    }, null);

    mensajesEnviados.length = 0;
    await chatFlowService._processBatch(telRepl, [
      { from: telRepl, text: "VM-REP22", tipo: "text", io: null },
    ]);

    const estRepl1 = await orderService.getEstado(telRepl);
    assert.strictEqual(estRepl1.paso, "esperando_reemplazo_web", "Debe pasar a esperando_reemplazo_web");
    assert.strictEqual(estRepl1.codigoWebPendiente, "VM-REP22");
    // El CarritoWeb NO debe haberse vinculado todavía
    const cwReplAntes = await CarritoWeb.findOne({ codigo: "VM-REP22" });
    assert.strictEqual(cwReplAntes.estado, "pendiente", "CarritoWeb debe seguir pendiente mientras decide");

    // 11a: Usuario elige "Mantener"
    await chatFlowService._processBatch(telRepl, [
      { from: telRepl, text: "web_mantener", tipo: "interactive", io: null },
    ]);
    const estReplMantener = await orderService.getEstado(telRepl);
    assert.strictEqual(estReplMantener.paso, "preguntando_mas", "Debe regresar a preguntando_mas");
    assert.strictEqual(estReplMantener.carrito.items[0].id, "fortunne-n22", "Debe mantener items anteriores");
    const cwReplDespues = await CarritoWeb.findOne({ codigo: "VM-REP22" });
    assert.strictEqual(cwReplDespues.estado, "pendiente", "CarritoWeb NO debe haberse vinculado");

    // 11b: Usuario envía de nuevo el código y elige "Reemplazar"
    await chatFlowService._processBatch(telRepl, [
      { from: telRepl, text: "VM-REP22", tipo: "text", io: null },
    ]);
    await chatFlowService._processBatch(telRepl, [
      { from: telRepl, text: "web_reemplazar", tipo: "interactive", io: null },
    ]);
    const estReplFin = await orderService.getEstado(telRepl);
    assert.strictEqual(estReplFin.paso, "esperando_confirmacion_web", "Debe avanzar a confirmación web");
    assert.strictEqual(estReplFin.carrito.items[0].id, "fortunne-n21", "Items deben ser los del pedido web");
    const cwReplVinculado = await CarritoWeb.findOne({ codigo: "VM-REP22" });
    assert.strictEqual(cwReplVinculado.estado, "vinculado", "CarritoWeb ahora sí debe estar vinculado");
    console.log("  ✅ Test 11 superado (Pregunta de reemplazo respetada según elección)");

    // --------------------------------------------------------------------------
    // TEST 12: Modo manual y pasos de pago no cargan pedidos web
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 12: Modo manual y pasos de pago no cargan pedidos web...");
    await CarritoWeb.create({
      codigo: "VM-PAG22",
      items: [{ productoId: "fortunne-n21", nombre: "Fortunne Mini Jumbo", precio: 25, cantidad: 1 }],
      total: 25,
      estado: "pendiente",
      expiraEn: new Date(Date.now() + 72 * 3600 * 1000),
    });

    // 12a: Modo manual
    const telManual = "584129999992";
    await orderService.setModo(telManual, "manual", null);
    mensajesEnviados.length = 0;
    await chatFlowService._processBatch(telManual, [
      { from: telManual, text: "VM-PAG22", tipo: "text", io: null },
    ]);
    assert.strictEqual(mensajesEnviados.length, 0, "Bot en modo manual no debe responder ni cargar nada");
    const cwManual = await CarritoWeb.findOne({ codigo: "VM-PAG22" });
    assert.strictEqual(cwManual.estado, "pendiente", "CarritoWeb sigue pendiente");

    // 12b: Paso de pago (esperando_pago_metodo)
    const telPago = "584129999993";
    await orderService.setModo(telPago, "auto", null);
    await orderService.setEstado(telPago, { paso: "esperando_pago_metodo" }, null);
    mensajesEnviados.length = 0;
    await chatFlowService._processBatch(telPago, [
      { from: telPago, text: "VM-PAG22", tipo: "text", io: null },
    ]);
    const msgBusy = mensajesEnviados[mensajesEnviados.length - 1];
    assert.ok(
      msgBusy.opciones.texto.includes("proceso de pago o verificación"),
      "Debe avisar webOrderBusy"
    );
    const cwPago = await CarritoWeb.findOne({ codigo: "VM-PAG22" });
    assert.strictEqual(cwPago.estado, "pendiente", "CarritoWeb sigue pendiente en paso de pago");
    console.log("  ✅ Test 12 superado (Modo manual y paso de pago bloquean carga de pedido web)");

    // --------------------------------------------------------------------------
    // TEST 13: Catálogo apagado (settings.catalogo.activo: false)
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 13: Catálogo apagado (settings.catalogo.activo: false)...");
    const origGet = configManager.get;
    configManager.get = (key: string) => {
      if (key === "settings.catalogo.activo") return false;
      return origGet.call(configManager, key);
    };

    // 13a: El bot ignora los códigos de pedido web
    mensajesEnviados.length = 0;
    const telApagado = "584129999994";
    await orderService.setEstado(telApagado, { paso: "inicio" }, null);
    await chatFlowService._processBatch(telApagado, [
      { from: telApagado, text: "VM-PAG22", tipo: "text", io: null },
    ]);
    // El bot no debe haber procesado el código web (enviarMenuFaq o similar)
    const cwApagado = await CarritoWeb.findOne({ codigo: "VM-PAG22" });
    assert.strictEqual(cwApagado.estado, "pendiente", "CarritoWeb no debe vincularse si catálogo está apagado");

    // 13b: POST /api/public/pedidos responde 503
    const app = express();
    app.use("/api/public", publicRoutes);

    const server = app.listen(0);
    const port = (server.address() as any).port;
    try {
      const res503 = await fetch(`http://127.0.0.1:${port}/api/public/pedidos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ productoId: "fortunne-n21", cantidad: 1 }] }),
      });

      assert.strictEqual(res503.status, 503, "POST /api/public/pedidos debe responder 503 cuando el catálogo está apagado");
      const json503 = await res503.json();
      assert.ok(json503.error, "Debe incluir mensaje de error 503");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    configManager.get = origGet;
    console.log("  ✅ Test 13 superado (Catálogo apagado ignora códigos y responde 503)");

    // --------------------------------------------------------------------------
    // TEST 14: Opción 'Agregar más' desde esperando_confirmacion_web
    // --------------------------------------------------------------------------
    console.log("\n▶ Test 14: Opción 'Agregar más' desde esperando_confirmacion_web...");
    const telMas = "584129999995";
    await orderService.setEstado(telMas, {
      paso: "esperando_confirmacion_web",
      carrito: {
        items: [{ id: "fortunne-n21", producto: "Fortunne Mini Jumbo", price: 25, cantidad: 1 }],
      },
    }, null);

    await chatFlowService._processBatch(telMas, [
      { from: telMas, text: "web_agregar_mas", tipo: "interactive", io: null },
    ]);
    const estMas = await orderService.getEstado(telMas);
    assert.strictEqual(estMas.paso, "preguntando_mas", "Debe pasar a preguntando_mas");
    console.log("  ✅ Test 14 superado ('Agregar más' lleva a flujo habitual de productos)");

    console.log("\n================================================================================");
    console.log("🎉 TODOS LOS TESTS DE F2-2 PASARON EXITOSAMENTE (14/14)");
    console.log("================================================================================\n");
  } finally {
    chatFlow.enviarYRegistrar = origEnviarYRegistrar;
  }
}

runTests().catch((err) => {
  console.error("❌ Falló la suite test-pedido-web-bot.ts:", err);
  process.exit(1);
});
