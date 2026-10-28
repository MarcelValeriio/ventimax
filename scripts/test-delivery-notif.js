/**
 * Test quirúrgico para la notificación del repartidor.
 * Verifica que el número en DELIVERY_PHONE_NUMBER reciba mensajes.
 */
require("dotenv").config();
const { enviarTexto } = require("../services/whatsapp");

async function testDeliveryNotif() {
  const deliveryPhone = process.env.DELIVERY_PHONE_NUMBER;
  
  if (!deliveryPhone) {
    console.error("❌ ERROR: La variable DELIVERY_PHONE_NUMBER no está definida en el .env");
    process.exit(1);
  }

  console.log(`\n🚀 Enviando COMANDA DE PRUEBA al repartidor...`);
  console.log(`📱 Destinatario (Repartidor): ${deliveryPhone}`);
  
  const testMsg = 
    `🚚 *NUEVA ENTREGA ASIGNADA (#TEST-001)*\n\n` +
    `👤 *Cliente:* Juan Pelusa\n` +
    `🆔 *Cédula:* 12.345.678\n` +
    `📞 *Teléfono:* 584120000000\n` +
    `📦 *Pedido:* 2x Hamburguesa Triple, 1x Papas Fritas, 1x Refresco Familiar\n` +
    `💰 *Total:* $35,00 USD (Bs. 20.559,20)\n\n` +
    `🧾 *Registro Contable:*\n` +
    ` - Ingreso Caja ($): $10,00\n` +
    ` - Ingreso Banco (Bs): Bs. 14.685,14 (Tasa: 587.40)\n\n` +
    `📍 *Mapa:* https://www.google.com/maps?q=10.4806,-66.8983\n` +
    `🏠 *Dirección:* Av. Francisco de Miranda, Edif. Galipán, Chacao.`;

  try {
    const success = await enviarTexto(deliveryPhone, testMsg);
    
    if (success) {
      console.log("\n✅ ¡ÉXITO! El mensaje fue procesado por el servicio de WhatsApp.");
      console.log("Si el bot está en producción, el repartidor debería recibirlo en segundos.");
    } else {
      console.error("\n❌ ERROR: El servicio de WhatsApp devolvió un fallo.");
    }
  } catch (error) {
    console.error("\n💥 ERROR CRÍTICO:", error.message);
  } finally {
    process.exit(0);
  }
}

testDeliveryNotif();
