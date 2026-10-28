// Solo con mocks: sin esta línea los servicios usarían los modelos reales de MongoDB.
process.env.NODE_ENV = 'test';

const chatFlowService = require('../services/chatFlowService');
const orderService = require('../services/orderService');
const dbLocal = require('../services/dbLocal');
const { obtenerTasaUSD } = require('../services/bcv');

async function testMixedPayment() {
    try {
        console.log('🧪 Iniciando prueba de PAGO MIXTO ($175 total)...');
        const from = '584120000001'; // Nuevo ID para evitar colisiones
        
        // 1. Setup: Pedido de $175
        const mockCarrito = {
            items: [{ producto: "Cena Familiar", price: 175, cantidad: 1 }],
            nombre: "Maria Mixta",
            cedula: "99888777",
            ubicacion: { address: "Av. Principal Caracas" }
        };
        
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
        console.log('✅ Setup: Pedido listo.');

        // 2. Acción: Elige Efectivo
        console.log('📤 Cliente elige: "efectivo"');
        await chatFlowService.handleIncomingMessage(from, 'text', 'efectivo', null, null, null, {}, null);
        console.log('--- Handle Efectivo done ---');

        // 3. Acción: Elige Pago Mixto (efectivo_mixto)
        console.log('📤 Cliente elige: "🌓 Pago Mixto"');
        await chatFlowService.handleIncomingMessage(from, 'interactive', 'efectivo_mixto', 'Pago Mixto', null, null, {}, null);
        console.log('--- Handle Mixto button done ---');

        // 4. Acción: Indica que paga $100 en efectivo
        console.log('📤 Cliente escribe monto efectivo: "100"');
        await chatFlowService.handleIncomingMessage(from, 'text', '100', null, null, null, {}, null);
        console.log('--- Handle Amount done ---');

        // 5. Verificación
        const state = await orderService.getEstado(from);
        const tasaRes = await obtenerTasaUSD();
        const tasa = tasaRes?.tasa || 0;
        const esperadoBs = Math.round((175 - 100) * tasa * 100) / 100;

        console.log('📍 Paso final:', state.paso);
        console.log('💵 Efectivo registrado:', state.carrito.pagoEfectivo);
        console.log('💳 Restante USD:', state.carrito.pagoDigitalUSD);
        console.log('🇻🇪 Restante Bs:', state.carrito.pagoDigitalVES);
        console.log('📊 Tasa usada:', tasa);

        if (state.carrito.pagoEfectivo === 100 && state.carrito.pagoDigitalVES === esperadoBs) {
            console.log(`🚀 TEST PASSED: El bot calculó correctamente Bs. ${state.carrito.pagoDigitalVES} de remanente.`);
            process.exit(0);
        } else {
            console.error('❌ TEST FAILED: Cálculo de remanente incorrecto.');
            process.exit(1);
        }

    } catch (error) {
        console.error('💥 Error en el test:', error);
        process.exit(1);
    }
}

testMixedPayment();