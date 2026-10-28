// Solo con mocks: sin esta línea los servicios usarían los modelos reales de MongoDB.
process.env.NODE_ENV = 'test';

const chatFlowService = require('../services/chatFlowService');
const orderService = require('../services/orderService');
const dbLocal = require('../services/dbLocal');

async function testCashFlow() {
    try {
        console.log('🧪 Iniciando prueba de flujo de EFECTIVO ($175)...');
        const from = '584120000077'; // teléfono exclusivo de esta suite (no compartir con otras)
        
        // 1. Setup: Pedido de $175 en paso 'esperando_pago_metodo'
        const mockCarrito = {
            items: [
                { producto: "Combo Premium", price: 175, cantidad: 1 }
            ],
            nombre: "Juan Prueba",
            cedula: "12345678",
            ubicacion: { address: "Calle Falsa 123" }
        };
        
        // Otra suite puede dejar a este cliente en modo manual (tras recibir un comprobante): volver a automático
        await orderService.setModo(from, 'automatico', null);

        // Métodos de pago propios de la prueba (otras suites dejan solo "Pago Móvil" en el mock)
        const datosMock = dbLocal.read();
        datosMock.metodosPago = [
            { _id: 'pm_efectivo', tipo: 'efectivo', nombre: 'Efectivo', activo: true, detalles: {} },
            { _id: 'pm_movil', tipo: 'pago_movil', nombre: 'Pago Móvil', activo: true, detalles: {} }
        ];
        dbLocal.write(datosMock);

        await orderService.setEstado(from, { 
            paso: 'esperando_pago_metodo', 
            carrito: mockCarrito 
        });
        console.log('✅ Setup: Pedido de $175 listo.');

        // 2. Acción: Cliente elige "efectivo"
        console.log('📤 Cliente envía: "efectivo"');
        await chatFlowService.handleIncomingMessage(from, 'text', 'efectivo', null, null, null, {}, null);
        
        let state = await orderService.getEstado(from);
        console.log('📍 Paso tras elegir efectivo:', state.paso); // Debería ser esperando_efectivo_opcion

        // 3. Acción: Cliente elige "Pago con vuelto" (botón efectivo_vuelto) e indica que paga con $200
        console.log('📤 Cliente pulsa botón: "Pago con vuelto" (efectivo_vuelto)');
        await chatFlowService.handleIncomingMessage(from, 'interactive', 'efectivo_vuelto', 'Pago con vuelto', null, null, {}, null);
        state = await orderService.getEstado(from);
        console.log('📍 Paso tras elegir vuelto:', state.paso); // Debería ser esperando_efectivo_monto

        console.log('📤 Cliente envía: "200"');
        await chatFlowService.handleIncomingMessage(from, 'text', '200', null, null, null, {}, null);

        // 4. Verificación final
        state = await orderService.getEstado(from);
        console.log('📍 Paso final:', state.paso); // Debería ser esperando_comprobante
        console.log('💰 Pago con:', state.carrito.pagoCon);
        console.log('⚖️ Vuelto calculado:', state.carrito.vuelto);

        if (state.carrito.pagoCon === 200 && state.carrito.vuelto === 25) {
            console.log('🚀 TEST PASSED: El sistema calculó el vuelto de $25 correctamente.');
        } else {
            console.error('❌ TEST FAILED: Vuelto incorrecto.');
            process.exit(1);
        }

        process.exit(0);
    } catch (error) {
        console.error('💥 Error en el test:', error);
        process.exit(1);
    }
}

testCashFlow();