import dotenv from 'dotenv';
dotenv.config();
import { notificarAdminConFallback, enviarUbicacion } from '../services/whatsapp';
import { getCaracasTime } from '../utils/helpers';

(async () => {
  const adminPhone = process.env.ADMIN_PHONE_NUMBER;
  if (!adminPhone) {
    console.error("No se encontró ADMIN_PHONE_NUMBER en .env");
    process.exit(1);
  }

  const horaStr = getCaracasTime().toLocaleString("es-VE");
  const ubicacionDir = "Ubicación GPS";
  const ubicacionLat = 10.442856788635;
  const ubicacionLon = -66.81778717041;
  const notas = "Pago en efectivo. Tengo dos billetes de 20.";

  let adminMsg =
    `🧾 COMANDA DE PAGO VERIFICADO (TEST-042)\n` +
    `   Hora y Fecha: ${horaStr}\n` +
    `👤 Cliente: Paola Pacheco Sequera\n` +
    `🆔 Cédula: N/A\n` +
    `📞 Teléfono: ${adminPhone}\n` +
    `📦 Pedido: D Cerdo y Cebolla Verdeo x1, D Cerdo y Maíz Dulce x1\n` +
    `💰 Total: $30.00 USD\n` +
    `🧾 Monto Bs: Bs. 25.771,89 (Tasa: 859.0629)\n`;

  if (ubicacionLat && ubicacionLon) {
    adminMsg += `📍 Dirección: ${ubicacionDir}\n   Mapa: https://www.google.com/maps?q=${ubicacionLat},${ubicacionLon}\n`;
  } else {
    adminMsg += `📍 Dirección: ${ubicacionDir}\n`;
  }
  
  if (notas) {
    adminMsg += `📝 Notas: ${notas}\n`;
  }

  console.log("-> Enviando comanda de muestra al Admin...");
  await notificarAdminConFallback(
    adminPhone,
    adminMsg,
    "order_notification",
    [{ type: "text", text: adminMsg.substring(0, 1000).replace(/\n/g, " ") }]
  );

  console.log("✅ ¡Muestra enviada con éxito!");
  process.exit(0);
})();
