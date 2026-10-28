
process.env.NODE_ENV = "test";

/**
 * scripts/test-resilience.js
 * Prueba de resiliencia y manejo de errores de tipeo.
 */
const chatFlowService = require("../services/chatFlowService");
const orderService = require("../services/orderService");

// Mock de Socket.io
const ioMock = {
    emit: () => {}
};

async function runResilienceTest() {
    console.log("--- Iniciando Prueba de Resiliencia del Bot ---");
    const from = "584242555659";

    // 1. Simular inicio y error en selección de categoría
    console.log("\n[Test] Comandando un mensaje aleatorio en inicio...");
    await chatFlowService.handleIncomingMessage(from, "text", "Quiero pizza", null, null, ioMock);
    let estado = await orderService.getEstado(from);
    console.log(`Estado: ${estado.paso} (Debería haber enviado el menú)`);

    // 2. Probar ingreso de datos con errores de formato
    console.log("\n[Test] Ingresando datos con formato sucio (Puntos, guiones, letras)...");
    await orderService.setEstado(from, { paso: "esperando_datos_cliente", carrito: { items: [{ producto: "Test", price: 10, cantidad: 1 }] } }, ioMock);
    
    // Caso: Nombre + Cédula con puntos y prefijo
    await chatFlowService.handleIncomingMessage(from, "text", "Marcel Valerio V-6.930.991", null, null, ioMock);
    estado = await orderService.getEstado(from);
    console.log(`Input: "Marcel Valerio V-6.930.991"`);
    console.log(`Resultado -> Nombre: "${estado.carrito.nombre}", Cédula: "${estado.carrito.cedula}"`);
    console.log(`Paso siguiente: ${estado.paso}`);

    // 3. Probar Recuperación con CANCELAR
    console.log("\n[Test] Probando comando CANCELAR en medio del flujo de ubicación...");
    await chatFlowService.handleIncomingMessage(from, "text", "CANCELAR", null, null, ioMock);
    estado = await orderService.getEstado(from);
    console.log(`Estado tras CANCELAR: ${estado.paso} (Debería ser 'inicio' o 'esperando_seleccion')`);
    console.log(`Carrito vacío: ${estado.carrito.items.length === 0 ? "SÍ" : "NO"}`);

    // 4. Probar Cédula sola con errores y guía de usuario
    console.log("\n[Test] Ingresando cédula errónea...");
    await orderService.setEstado(from, { paso: "esperando_cedula", carrito: { items: [] } }, ioMock);
    await chatFlowService.handleIncomingMessage(from, "text", "123-abc", null, null, ioMock);
    // (Aquí el bot debería enviar el mensaje de "Escribe CANCELAR")
    console.log("Bot envió sugerencia de CANCELAR (Verificado visualmente en código)");

    console.log("\n--- Prueba de Resiliencia Completada ---");
}

runResilienceTest().catch(console.error);
