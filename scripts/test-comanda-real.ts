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
  const ubicacionDir = "Av. Francisco de Miranda, Edificio Centro Empresarial, Chacao";
  const ubicacionLat = 10.4936;
  const ubicacionLon = -66.8519;

  let adminMsg =
    `✅ *COMANDA DE PAGO VERIFICADO (#024)*\n` +
    `   Hora y Fecha: ${horaStr}\n` +
    `👤 Cliente: Maria Carolina Ronpedrique\n` +
    `🆔 Cédula: 5406823\n` +
    `📞 Teléfono: 17864263138\n` +
    `📦 Pedido: D Pollo con Maiz Dulce x1\n` +
    `💰 Total: $15.00 USD\n` +
    `🧾 Monto Bs: Bs. 12.711,66 (Tasa: 847.4442)\n`;

  if (ubicacionLat && ubicacionLon) {
    adminMsg += `📍 Dirección: ${ubicacionDir}\n   Mapa: https://www.google.com/maps?q=${ubicacionLat},${ubicacionLon}\n`;
  } else {
    adminMsg += `📍 Dirección: ${ubicacionDir}\n`;
  }
  adminMsg += `   Notas: Sin cebolla\n`;

  console.log("-> Enviando comanda real corregida...");
  await notificarAdminConFallback(
    adminPhone,
    adminMsg,
    "order_notification",
    [{ type: "text", text: adminMsg.substring(0, 1000).replace(/\n/g, " ") }]
  );

  console.log("✅ ¡Prueba enviada!");
})();
