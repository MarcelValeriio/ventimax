require("dotenv").config();
const { notificarAdminConFallback } = require("../services/whatsapp");

async function run() {
  const adminPhones = [
    process.env.ADMIN_PHONE_NUMBER,
    process.env.ADMIN_PHONE_NUMBER_2,
  ].filter(Boolean);

  console.log("Admin phones:", adminPhones);

  const miniComandaText = `🧾 *NUEVO PAGO RECIBIDO (PRUEBA)*\n\n*Pedido:* #ORD-TEST\n*Cliente:* Prueba\n*Total:* $99\n*Dirección:* Caracas\n\n_Revisa el comprobante para verificar._`;

  for (const phone of adminPhones) {
    console.log(`Sending to ${phone}...`);
    try {
      const success = await notificarAdminConFallback(
        phone,
        miniComandaText,
        "order_notification",
        [
          { type: "text", text: `#ORD-TEST — PAGO RECIBIDO` },
          { type: "text", text: `Prueba` },
          { type: "text", text: `Pago de $99 pendiente de verificación.` },
        ]
      );
      console.log(`Result for ${phone}:`, success);
    } catch(e) {
      console.error(`Error for ${phone}:`, e.message);
    }
  }
}

run().then(() => process.exit(0));
