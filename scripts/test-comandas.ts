import dotenv from 'dotenv';
dotenv.config();
import { notificarAdminConFallback, enviarUbicacion } from '../services/whatsapp';

(async () => {
  const adminPhone = process.env.ADMIN_PHONE_NUMBER;
  if (!adminPhone) {
    console.error("No se encontró ADMIN_PHONE_NUMBER en .env");
    process.exit(1);
  }

  console.log(`Enviando pruebas al administrador 1: ${adminPhone}`);

  try {
    // 1. Prueba de "Recepción de pago" (mini comanda de orderService.ts)
    const miniComandaText = `🧾 *NUEVO PAGO RECIBIDO (PRUEBA)*\n\n*Pedido:* TEST-001\n*Cliente:* Usuario de Prueba\n*Total:* $15.00\n*Dirección:* Coordenadas GPS adjuntas\n\n_Revisa el comprobante para verificar._`;
    
    console.log("-> Enviando mini comanda de recepción de pago...");
    await notificarAdminConFallback(
      adminPhone,
      miniComandaText,
      "order_notification",
      [{ type: "text", text: miniComandaText.substring(0, 1000).replace(/\n/g, " ") }]
    );
    
    // Ubicación (Ejemplo: Plaza Altamira)
    console.log("-> Enviando ubicación nativa (GPS)...");
    await enviarUbicacion(adminPhone, 10.4965, -66.8488, "Ubicación del Cliente", "Plaza Francia, Altamira");

    // Pausa de 3 segundos
    await new Promise(r => setTimeout(r, 3000));

    // 2. Prueba de "Pago verificado" (comanda completa de adminController.ts)
    const adminMsg = `✅ *COMANDA DE PAGO VERIFICADO (PRUEBA TEST-002)*\n📞 Teléfono: ${adminPhone}\n📦 Pedido: 1x Lumpias Tradicionales, 1x Costillas Sal y Pimienta\n💰 Total: $15.00 USD\n🧾 Monto Bs: Bs. 600.00 (Tasa: 40.00)\n📍 Mapa: https://www.google.com/maps?q=10.4965,-66.8488\n`;

    console.log("-> Enviando comanda de pago verificado...");
    await notificarAdminConFallback(
      adminPhone,
      adminMsg,
      "order_notification",
      [{ type: "text", text: adminMsg.substring(0, 1000).replace(/\n/g, " ") }]
    );

    console.log("-> Enviando ubicación nativa (GPS)...");
    await enviarUbicacion(adminPhone, 10.4965, -66.8488, "Ubicación del Cliente", "Plaza Francia, Altamira");

    console.log("✅ ¡Pruebas enviadas exitosamente!");
  } catch (error) {
    console.error("❌ Error durante la prueba:", error.message);
  }
})();
