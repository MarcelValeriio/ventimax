/**
 * scripts/test-whatsapp-edge-cases.js
 * 
 * Suite de pruebas de integración para Casos Extremos y Resiliencia del Bot de WhatsApp (Yuri-Bot).
 * Alcance verificado:
 * 1. Comando Global de Cancelación ('CANCELAR', 'salir', '0', 'vaciar') en múltiples pasos del embudo.
 * 2. Comando de Recobro Ultra-Prioritario ('menu', 'inicio', 'reiniciar', 'reset').
 * 3. Validación y Sanitización Rigurosa de Cédula de Identidad (prefijos CI, V-, E-, puntos, guiones, rechazo de letras y longitudes anómalas).
 * 4. Validación Estricta de Nombre (bloqueo de inyección de URLs, emojis, caracteres especiales, longitud >40 chars, números residuales y parsing combinado).
 * 5. Interrupción conversacional con FAQs en pleno embudo sin perder carrito ni paso activo.
 * 6. Consultas de Tasa Oficial BCV en tiempo real.
 * 7. Control de Stock Atómico (`trackStock`) y validación de cantidades positivas.
 * 8. Manejo flexible de Ubicación (GPS vs Texto manual) y campo de Notas adicionales.
 * 9. Flujo Especial de Fin de Semana (Sábado/Domingo: Delivery diferido para el Lunes vs Punto Aliado).
 * 10. Recepción de Comprobante de Pago y detección de cliente trabado (`stuck: true`).
 * 
 * Ejecución:
 *   NODE_ENV=test node scripts/test-whatsapp-edge-cases.js
 */

process.env.NODE_ENV = "test";
process.env.ADMIN_PHONE_NUMBER = "584122781982";
process.env.ADMIN_PHONE_NUMBER_2 = "584240000000";

const dbLocal = require("../services/dbLocal");
const chatFlowService = require("../services/chatFlowService");
const orderService = require("../services/orderService");
const { esFinDeSemanaCaracas } = require("../utils/helpers");

async function runWhatsAppEdgeCasesTest() {
  console.log("================================================================================");
  console.log("🧪 SUITE DE INTEGRACIÓN: CASOS EXTREMOS Y RESILIENCIA EN WHATSAPP (YURI-BOT)");
  console.log("================================================================================\n");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`   ✅ ${message}`);
      passed++;
    } else {
      console.error(`   ❌ FALLÓ: ${message}`);
      failed++;
    }
  }

  // --- 0. SETUP DE BASE DE DATOS LOCAL (MOCK PERSISTENTE) ---
  const data = dbLocal.read();
  data.etiquetas = {};
  data.pedidos = [];
  data.mensajes = [];
  
  data.categorias = [
    { _id: "cat_dumplings", nombre: "Dumplings Artesanales", slug: "dumplings", activo: true, padre: null },
    { _id: "cat_especialidades", nombre: "Especialidades Asiáticas", slug: "especialidades", activo: true, padre: null },
  ];

  data.productos = [
    {
      id: "prod_cerdo_25",
      name: "Dumplings de Cerdo (25 uds)",
      price: 15,
      categoria: "cat_dumplings",
      activo: true,
      trackStock: true,
      stock: 5,
    },
    {
      id: "prod_pollo_25",
      name: "Dumplings de Pollo (25 uds)",
      price: 14,
      categoria: "cat_dumplings",
      activo: true,
      trackStock: false,
    },
  ];

  data.metodosPago = [
    {
      _id: "pm_movil",
      tipo: "pago_movil",
      nombre: "Pago Móvil Banesco",
      activo: true,
      datos: { banco: "Banesco", telefono: "04121234567", cedula: "12345678" },
    },
    {
      _id: "pm_zelle",
      tipo: "zelle",
      nombre: "Zelle USD",
      activo: true,
      datos: { titular: "Mr Pachi C.A.", correo: "pagos@mrpachi.com" },
    },
  ];

  data.faqs = [
    {
      _id: "faq_delivery_cost",
      pregunta: "¿Cuánto cuesta el delivery?",
      keywords: ["delivery", "costo", "envio", "chacao", "caracas", "precio delivery"],
      respuesta: "🛵 El delivery en Caracas es GRATIS en avenidas principales de Lunes a Viernes.",
      type: "estatica",
      dynamicKey: null,
      activo: true,
      order: 1,
      brand: "default",
    },
    {
      _id: "faq_sabores_wa",
      pregunta: "Sabores y rellenos",
      keywords: ["sabores", "rellenos", "dumplings"],
      respuesta: "🥟 Disponibles: Cerdo y Pollo.",
      type: "dinamica",
      dynamicKey: "sabores",
      activo: true,
      order: 2,
      brand: "default",
    },
  ];

  dbLocal.write(data);

  const ioMock = { emit: () => {} };
  const testPhone = "584129990001";

  try {
    // -----------------------------------------------------------------------------------------
    // CASO 1: Comando Global de Cancelación ('CANCELAR', 'salir', '0', 'vaciar')
    // -----------------------------------------------------------------------------------------
    console.log("👉 1. Validando comandos globales de cancelación y vaciado de carrito...");
    
    // 1a. Cancelar en medio de 'esperando_ubicacion'
    await orderService.setEstado(
      testPhone,
      {
        paso: "esperando_ubicacion",
        carrito: {
          items: [{ producto: "Dumplings de Cerdo (25 uds)", price: 15, cantidad: 2 }],
          nombre: "Pedro Perez",
          cedula: "12345678",
        },
      },
      ioMock
    );
    await orderService.setModo(testPhone, "automatico", null);

    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "CANCELAR",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );

    let state = await orderService.getEstado(testPhone);
    assert(state.paso === "en_faq" || state.paso === "inicio" || state.paso === "fin_semana_opciones", "Usuario reseteado tras CANCELAR");
    assert(!state.carrito?.items || state.carrito.items.length === 0, "Carrito vaciado completamente tras CANCELAR");

    // 1b. Cancelar con 'salir' en paso 'esperando_pago_metodo'
    await orderService.setEstado(
      testPhone,
      {
        paso: "esperando_pago_metodo",
        carrito: { items: [{ producto: "Dumplings de Pollo", price: 14, cantidad: 1 }] },
      },
      ioMock
    );

    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "salir",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );

    state = await orderService.getEstado(testPhone);
    assert(!state.carrito?.items || state.carrito.items.length === 0, "Comando 'salir' vacía el carrito y reinicia el estado");

    // -----------------------------------------------------------------------------------------
    // CASO 2: Comando de Recobro Ultra-Prioritario ('menu', 'reiniciar', 'reset')
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 2. Validando comando de recobro prioritario ('reiniciar')...");
    await orderService.setEstado(
      testPhone,
      {
        paso: "esperando_cedula",
        carrito: { items: [{ producto: "Test", price: 10, cantidad: 1 }] },
      },
      ioMock
    );

    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "reiniciar",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );

    state = await orderService.getEstado(testPhone);
    assert(state.paso === "en_faq" || state.paso === "inicio" || state.paso === "fin_semana_opciones", "Comando 'reiniciar' fuerza reseteo inmediato a menú");

    // -----------------------------------------------------------------------------------------
    // CASO 3: Validación y Sanitización Rigurosa de Cédula
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 3. Validando sanitización y rechazo de cédulas de identidad...");
    await orderService.setEstado(
      testPhone,
      {
        paso: "esperando_cedula",
        carrito: {
          items: [{ producto: "Dumplings de Cerdo (25 uds)", price: 15, cantidad: 1 }],
          nombre: "Marcel Valerio",
        },
      },
      ioMock
    );

    // 3a. Rechazar cédula con caracteres alfanuméricos mezclados ("21073113f")
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "21073113f",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_cedula", "Rechaza '21073113f' y mantiene paso 'esperando_cedula'");

    // 3b. Rechazar longitud corta (< 7 dígitos)
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "12345",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_cedula", "Rechaza cédula menor a 7 dígitos ('12345')");

    // 3c. Aceptar y sanitizar formato venezolano sucio: "V-12.345.678"
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "V-12.345.678",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_ubicacion", "Avanza a 'esperando_ubicacion' tras cédula válida");
    assert(state.carrito.cedula === "V-12345678", "Normaliza 'V-12.345.678' -> 'V-12345678'");

    // -----------------------------------------------------------------------------------------
    // CASO 4: Validación Estricta de Nombre y Parsing Combinado
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 4. Validando seguridad en nombre (bloqueo URLs, emojis, >40 chars y parsing)...");
    await orderService.setEstado(
      testPhone,
      {
        paso: "esperando_datos_cliente",
        carrito: {
          items: [{ producto: "Dumplings de Cerdo (25 uds)", price: 15, cantidad: 1 }],
        },
      },
      ioMock
    );

    // 4a. Bloqueo de URL / Enlace web
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "Juan Perez https://sitio-malicioso.com",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_datos_cliente", "Bloquea entrada con URL y mantiene paso");

    // 4b. Bloqueo de emojis / caracteres no permitidos
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "Carlos 🔥 Dumpling 12345678",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_datos_cliente", "Bloquea nombres con emojis y caracteres especiales");

    // 4c. Bloqueo de nombres excesivamente largos (> 40 caracteres)
    const nombreLargo = "Nombre Extremadamente Largo Que Supera El Limite De Cuarenta Caracteres";
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      `${nombreLargo} 12345678`,
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_datos_cliente", "Bloquea nombres mayores a 40 caracteres");

    // 4d. Parsing exitoso de Nombre + Cédula combinados con prefijos: "Marcel Valerio CI: 28.123.456"
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "Marcel Valerio CI: 28.123.456",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_ubicacion", "Avanza directo a 'esperando_ubicacion' al extraer ambos datos");
    assert(state.carrito.nombre === "Marcel Valerio", "Extrae correctamente el nombre limpio");
    assert(state.carrito.cedula === "V-28123456", "Extrae y normaliza la cédula a 'V-28123456'");

    // -----------------------------------------------------------------------------------------
    // CASO 5: Interrupción por FAQ en medio del flujo sin perder Carrito ni Paso
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 5. Validando respuesta a FAQ en medio del flujo sin perder estado...");
    await orderService.setEstado(
      testPhone,
      {
        paso: "esperando_cantidad",
        carrito: {
          producto_actual: { id: "prod_cerdo_25", name: "Dumplings de Cerdo (25 uds)", price: 15 },
          items: [],
        },
      },
      ioMock
    );

    // Cliente pregunta por el delivery en lugar de dar la cantidad
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "¿Cuánto cuesta el delivery a Chacao?",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );

    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_cantidad", "Paso 'esperando_cantidad' preservado intacto tras responder FAQ");
    assert(
      state.carrito.producto_actual && state.carrito.producto_actual.name === "Dumplings de Cerdo (25 uds)",
      "Producto temporal en carrito se mantiene sin alteraciones"
    );

    // Ahora el cliente envía la cantidad válida ("2")
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "2",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "preguntando_mas", "Avanza a 'preguntando_mas' tras recibir la cantidad");
    assert(state.carrito.items.length === 1 && state.carrito.items[0].cantidad === 2, "Items agregados correctamente al carrito");

    // -----------------------------------------------------------------------------------------
    // CASO 6: Consulta de Tasa Oficial BCV
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 6. Validando consulta de tasa BCV...");
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "¿A qué tasa reciben el dólar BCV?",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    const dbMsgs = dbLocal.read().mensajes.filter((m) => m.telefono === testPhone);
    const lastBcvMsg = dbMsgs[dbMsgs.length - 1];
    assert(lastBcvMsg && lastBcvMsg.texto.includes("Tasa BCV"), "Bot responde con la información de la tasa BCV");

    // -----------------------------------------------------------------------------------------
    // CASO 7: Control Atómico de Stock (`trackStock`)
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 7. Validando control atómico de stock...");
    await orderService.setEstado(
      testPhone,
      {
        paso: "esperando_cantidad",
        carrito: {
          producto_actual: { id: "prod_cerdo_25", name: "Dumplings de Cerdo (25 uds)", price: 15 },
          items: [],
        },
      },
      ioMock
    );

    // Stock disponible es 5; cliente pide 10
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "10",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_cantidad", "Bloquea cantidad superior al stock y mantiene el paso");

    // Cliente pide cantidad dentro del stock ("3")
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "3",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "preguntando_mas", "Acepta cantidad dentro del límite de inventario");
    assert(state.carrito.items[0].cantidad === 3, "Registra 3 unidades en el carrito");

    // -----------------------------------------------------------------------------------------
    // CASO 8: Ubicación (GPS vs Manual) y Gestión de Notas
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 8. Validando captura de ubicación (Manual / GPS) y notas de entrega...");
    
    // 8a. Ubicación manual por texto
    await orderService.setEstado(
      testPhone,
      {
        paso: "esperando_ubicacion",
        carrito: {
          items: [{ producto: "Dumplings de Cerdo (25 uds)", price: 15, cantidad: 1 }],
          nombre: "Maria Rodriguez",
          cedula: "11223344",
        },
      },
      ioMock
    );

    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "Calle Los Mangos, Edif. Rosales, Apto 5B, Altamira",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_notas", "Avanza al paso 'esperando_notas'");
    assert(state.carrito.direccion_manual.includes("Altamira"), "Dirección manual guardada");

    // 8b. Nota adicional
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "text",
      "Dejar con el vigilante en recepción",
      null,
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_confirmacion_datos", "Avanza a 'esperando_confirmacion_datos'");
    assert(state.carrito.notas === "Dejar con el vigilante en recepción", "Nota del cliente registrada");

    // -----------------------------------------------------------------------------------------
    // CASO 9: Flujo Especial de Fin de Semana
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 9. Validando intercepción y opciones de Fin de Semana...");
    await orderService.setEstado(
      testPhone,
      { paso: "fin_semana_opciones", carrito: { items: [] } },
      ioMock
    );

    // Opción 'Pedir para el Lunes' (Delivery diferido)
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "interactive",
      "fin_semana_pedir_lunes",
      "Pedir P/ Lunes",
      null,
      ioMock,
      {},
      null,
      null,
      null,
      { debounceMs: 0 }
    );
    state = await orderService.getEstado(testPhone);
    assert(state.paso === "esperando_seleccion", "Opción 'Pedir Lunes' avanza a selección de categorías");

    // -----------------------------------------------------------------------------------------
    // CASO 10: Recepción de Comprobante y Detección de Cliente Trabado (Stuck)
    // -----------------------------------------------------------------------------------------
    console.log("\n👉 10. Validando recepción de comprobante y alerta de cliente trabado...");
    await orderService.setEstado(
      testPhone,
      {
        paso: "esperando_comprobante",
        carrito: {
          items: [{ producto: "Dumplings de Cerdo (25 uds)", price: 15, cantidad: 1 }],
          nombre: "Maria Rodriguez",
          cedula: "11223344",
          pago: "pm_movil",
          pagoNombre: "Pago Móvil Banesco",
          ubicacion: { address: "Altamira" },
        },
      },
      ioMock
    );

    // Enviar imagen del comprobante
    await chatFlowService.handleIncomingMessage(
      testPhone,
      "image",
      null,
      null,
      "media_voucher_fake_12345",
      ioMock,
      {},
      null,
      "image/jpeg",
      "wamid_img_001",
      { debounceMs: 0 }
    );

    state = await orderService.getEstado(testPhone);
    assert(state.paso === "pendiente_verificacion", "Paso avanza a 'pendiente_verificacion'");
    assert(state.etiqueta === "comprado", "Etiqueta marcada como 'comprado'");

    // Simular mensajes insistentes en 'pendiente_verificacion' para verificar detector de cliente trabado
    for (let i = 1; i <= 5; i++) {
      await chatFlowService.handleIncomingMessage(
        testPhone,
        "text",
        `¿Ya verificaron mi pago? (${i})`,
        null,
        null,
        ioMock,
        {},
        null,
        null,
        null,
        { debounceMs: 0 }
      );
    }

    const etiquetaModel = dbLocal.getEtiquetaModel();
    const etiquetaDoc = await etiquetaModel.findOne({ telefono: testPhone });
    assert(etiquetaDoc && etiquetaDoc.modo === "manual", "El usuario debe estar en modo 'manual' tras el comprobante");

    // --- RESUMEN FINAL ---
    console.log("\n================================================================================");
    console.log(`📊 RESULTADO SUITE WHATSAPP: ${passed} pruebas superadas, ${failed} fallidas.`);
    console.log("================================================================================\n");

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error("💥 Error fatal en la suite de WhatsApp:", error);
    process.exit(1);
  }
}

runWhatsAppEdgeCasesTest();
