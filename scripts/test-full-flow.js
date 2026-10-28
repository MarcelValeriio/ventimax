/**
 * Script de prueba para el flujo de delivery (Aislado)
 * Ejecución: node scripts/test-delivery-flow.js
 */
process.env.NODE_ENV = 'test';

const chatFlowService = require('../services/chatFlowService');
const orderService = require('../services/orderService');
const mongoose = require('mongoose');

// Cada comprobación fallida imprime "❌ Error: …"; se cuentan para terminar con código 1 (CI).
let fallos = 0;
const errorOriginal = console.error;
console.error = (...args) => {
    if (typeof args[0] === "string" && args[0].startsWith("❌ Error:")) fallos++;
    errorOriginal(...args);
};

async function runTest() {
    const from = "584120000000"; // Número de prueba
    console.log("🚀 Iniciando Simulación de Flujo de Delivery...\n");

    try {
        // 0. Preparar un estado previo (simulamos que el usuario ya dio su nombre)
        await orderService.setModo(from, "automatico", null);
        const dbLocal = require("../services/dbLocal");
        const data = dbLocal.read();
        if (data.pedidos) {
            data.pedidos = data.pedidos.filter(p => p.whatsappId !== from);
        }
        data.metodosPago = [
            { _id: 'pm_001', tipo: 'pago_movil', nombre: 'Pago Móvil', activo: true, datos: { banco: 'Banesco', telefono: '04121234567', cedula: '12345678' } }
        ];
        data.metodosEnvio = [];
        dbLocal.write(data);
        await orderService.setEstado(from, {
            paso: 'esperando_cedula',
            carrito: { 
                items: [{ producto: 'Hamburguesa Triple', price: 12, cantidad: 1 }],
                nombre: 'Juan Pelusa' 
            }
        });
        console.log("✅ [Setup] Pedidos previos limpiados. Usuario en paso 'esperando_cedula' y modo 'automatico'");

        // 1. Escenario: Texto inválido (Reportado: '21073113f')
        console.log("\n--- ESCENARIO 1: Cédula Inválida (Reportado) ---");
        const msgReportado = "21073113f";
        console.log(`Mensaje enviado: "${msgReportado}"`);
        
        await chatFlowService.handleIncomingMessage(from, 'text', msgReportado, null, null, null, {});
        
        let estado = await orderService.getEstado(from);
        console.log(`Estado resultante: paso='${estado.paso}'`);
        
        if (estado.paso === 'esperando_cedula') {
            console.log("✔️  Éxito: El sistema rechazó la cédula con letras y mantuvo el paso.");
        } else {
            console.error("❌ Error: El sistema aceptó una cédula inválida.");
        }

        // 1b. Escenario: Texto inválido (Puntos y letras)
        console.log("\n--- ESCENARIO 1b: Cédula Inválida (Puntos y letras) ---");
        const msgInvalido = "V-12.abc.345";
        console.log(`Mensaje enviado: "${msgInvalido}"`);
        
        await chatFlowService.handleIncomingMessage(from, 'text', msgInvalido, null, null, null, {});
        
        estado = await orderService.getEstado(from);
        console.log(`Estado resultante: paso='${estado.paso}'`);
        
        if (estado.paso === 'esperando_cedula') {
            console.log("✔️  Éxito: El sistema rechazó la cédula inválida y mantuvo el paso.");
        } else {
            console.error("❌ Error: El sistema debería haber mantenido el paso 'esperando_cedula'.");
        }

        // 2. Escenario: Cédula válida pero sucia
        console.log("\n--- ESCENARIO 2: Cédula Válida (Sucia) ---");
        const msgSucio = "V-12.345.678";
        console.log(`Mensaje enviado: "${msgSucio}"`);
        
        await chatFlowService.handleIncomingMessage(from, 'text', msgSucio, null, null, null, {});
        
        estado = await orderService.getEstado(from);
        console.log(`Estado resultante: paso='${estado.paso}', cedula='${estado.carrito.cedula}'`);
        
        if (estado.paso === 'esperando_ubicacion' && estado.carrito.cedula === 'V-12345678') {
            console.log("✔️  Éxito: Cédula sanitizada correctamente y avanzado al paso 'esperando_ubicacion'.");
        } else {
            console.error("❌ Error: Falló la sanitización o el avance de paso.");
        }

        // 3. Escenario: Dirección manual (texto) en paso ubicación
        console.log("\n--- ESCENARIO 3: Dirección Manual (Texto) ---");
        const msgDireccion = "Calle 123, Av. Libertador, Edif. Altamira, Apto 4B";
        console.log(`Mensaje enviado: "${msgDireccion}"`);
        
        await chatFlowService.handleIncomingMessage(from, 'text', msgDireccion, null, null, null, {});
        
        estado = await orderService.getEstado(from);
        console.log(`Estado resultante: paso='${estado.paso}', direccion='${estado.carrito.direccion_manual}'`);
        
        if (estado.paso === 'esperando_notas' && estado.carrito.direccion_manual === msgDireccion) {
            console.log("✔️  Éxito: Dirección manual aceptada y avanzado al paso 'esperando_notas'.");
        } else {
            console.error("❌ Error: Falló la aceptación de dirección manual o el avance de paso.");
        }

        // 3.5. Escenario: Notas Adicionales
        console.log("\n--- ESCENARIO 3.5: Notas Adicionales ---");
        const msgNotas = "Sin cebolla por favor";
        console.log(`Mensaje enviado: "${msgNotas}"`);
        
        await chatFlowService.handleIncomingMessage(from, 'text', msgNotas, null, null, null, {});
        
        estado = await orderService.getEstado(from);
        console.log(`Estado resultante: paso='${estado.paso}', notas='${estado.carrito.notas}'`);
        
        if (estado.paso === 'esperando_confirmacion_datos') {
            console.log("✔️  Éxito: Notas aceptadas y avanzado al paso 'esperando_confirmacion_datos'.");
        } else {
            console.error("❌ Error: Falló la aceptación de notas o el avance de paso.");
        }

        // 3b. Escenario: Confirmar Datos (Todo Correcto)
        console.log("\n--- ESCENARIO 3b: Confirmación de Datos (Todo Correcto) ---");
        const msgConfirmar = "datos_correctos";
        console.log(`Mensaje enviado: "${msgConfirmar}"`);
        
        await chatFlowService.handleIncomingMessage(from, 'text', msgConfirmar, null, null, null, {});
        
        estado = await orderService.getEstado(from);
        console.log(`Estado resultante: paso='${estado.paso}'`);
        
        if (estado.paso === 'esperando_pago_metodo') {
            console.log("✔️  Éxito: Datos confirmados y avanzado al paso 'esperando_pago_metodo'.");
        } else {
            console.error("❌ Error: Falló la confirmación de datos o el avance de paso.");
        }

        // 4. Escenario: Método de Pago Inválido
        console.log("\n--- ESCENARIO 4: Método de Pago Inválido ---");
        const msgPagoInvalido = "efectivo_en_marte";
        console.log(`Mensaje enviado: "${msgPagoInvalido}"`);
        
        await chatFlowService.handleIncomingMessage(from, 'text', msgPagoInvalido, null, null, null, {});
        
        estado = await orderService.getEstado(from);
        console.log(`Estado resultante: paso='${estado.paso}'`);
        
        if (estado.paso === 'esperando_pago_metodo') {
            console.log("✔️  Éxito: El sistema rechazó el pago inválido y mantuvo el paso.");
        } else {
            console.error("❌ Error: El sistema aceptó un pago inexistente.");
        }

        // 5. Escenario: Método de Pago Válido (Pago Móvil)
        console.log("\n--- ESCENARIO 5: Método de Pago Válido ---");
        const msgPagoValido = "pago_movil";
        console.log(`Mensaje enviado: "${msgPagoValido}"`);
        
        await chatFlowService.handleIncomingMessage(from, 'text', msgPagoValido, null, null, null, {});
        
        estado = await orderService.getEstado(from);
        console.log(`Estado resultante: paso='${estado.paso}', pago='${estado.carrito.pago}'`);
        
        if (estado.paso === 'esperando_comprobante') {
            console.log("✔️  Éxito: Pago móvil aceptado y avanzado al paso 'esperando_comprobante'.");
        } else {
            console.error("❌ Error: Falló la aceptación del pago o el avance de paso.");
        }

        // 6. Escenario: Recepción de Comprobante (Imagen)
        console.log("\n--- ESCENARIO 6: Recepción de Comprobante ---");
        // Configurar números admin ficticios para verificar el envío de comanda
        process.env.ADMIN_PHONE_NUMBER = "584240000000";
        process.env.ADMIN_PHONE_NUMBER_2 = "584122781982";
        const mediaIdFake = "media_id_12345";
        await chatFlowService.handleIncomingMessage(from, 'image', null, null, mediaIdFake, null, {});
        
        estado = await orderService.getEstado(from);
        console.log(`Estado resultante: paso='${estado.paso}', etiqueta='${estado.etiqueta}'`);
        
        if (estado.paso === 'pendiente_verificacion' && estado.etiqueta === 'comprado') {
            console.log("✔️  Éxito: Comprobante recibido, paso avanzado a 'pendiente_verificacion'.");
        } else {
            console.error("❌ Error: Falló el cambio de estado tras recibir la imagen.");
        }

        // 7. Escenario: Confirmación de Pago (Admin)
        console.log("\n--- ESCENARIO 7: Confirmación de Pago (Admin) ---");
        // Simulamos la llamada al controlador que haría el frontend
        const resMock = { 
            status: function(code) { 
                console.log(`📦 Status API Admin: ${code}`); 
                return this; 
            },
            json: function(data) { 
                console.log("📦 Respuesta API Admin:", data); 
                return this;
            } 
        };
        const reqMock = { body: { telefono: from } };
        
        const adminController = require("../controllers/adminController");
        await adminController.confirmarPago(reqMock, resMock, null, {});

        estado = await orderService.getEstado(from);
        console.log(`Estado final del usuario: paso='${estado.paso}', etiqueta='${estado.etiqueta}'`);
        
        if (estado.paso === 'inicio' && estado.etiqueta === 'compra_realizada') {
            console.log("✔️  Éxito: Ciclo completado. Usuario reiniciado a 'inicio'.");
        } else {
            console.error("❌ Error: El usuario no regresó al estado inicial.");
        }

        console.log("\n✨ Prueba de flujo de delivery completada.");

    } catch (error) {
        fallos++;
        console.error("\n💀 Error fatal en la prueba:", error);
    } finally {
        // 3. Cerrar conexiones
        if (mongoose.connection.readyState !== 0) {
            await mongoose.disconnect();
            console.log("\n🔌 Conexión a DB cerrada.");
        }
        console.log(fallos ? `\n❌ ${fallos} comprobación/es fallida/s.` : "\n✅ Todas las comprobaciones superadas.");
        process.exit(fallos ? 1 : 0);
    }
}

runTest();
