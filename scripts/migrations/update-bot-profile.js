/**
 * scripts/update-bot-profile.js
 * Script para actualizar el perfil público de WhatsApp Business.
 * Permite cambiar descripción, dirección, categoría, etc.
 */
require("dotenv").config();
const axios = require("axios");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_ID =
  process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;

// Configuración del perfil que deseas establecer
const PROFILE_DATA = {
  messaging_product: "whatsapp",
  description:
    "🍜 Comida asiática artesanal y congelada en Caracas. Dumplings. \n ¡Haz tu pedido ahora!",
  address: "Caracas, Venezuela",
  email: "pachikid2026@gmail.com",
  vertical: "RESTAURANT", // Opciones: UNDEFINED, OTHER, AUTO, BEAUTY, CLOTHING, EDUCATION, ENTERTAIN, EVENT_PLAN, FINANCE, GROCERY, HEALTH, HOTEL, NONPROFIT, PROF_SERVICES, RETAIL, TRAVEL, RESTAURANT
  websites: [""],
};

async function updateProfile() {
  console.log("==========================================");
  console.log("🛠️ ACTUALIZANDO PERFIL DE WHATSAPP BUSINESS");
  console.log("==========================================\n");

  if (!WHATSAPP_TOKEN || !PHONE_ID) {
    console.error(
      "❌ ERROR: Faltan WHATSAPP_TOKEN o PHONE_NUMBER_ID en el .env",
    );
    process.exit(1);
  }

  const url = `https://graph.facebook.com/v20.0/${PHONE_ID}/whatsapp_business_profile`;

  try {
    console.log(`🚀 Enviando actualización a Meta (Phone ID: ${PHONE_ID})...`);

    const response = await axios.post(url, PROFILE_DATA, {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    if (response.data.success) {
      console.log("\n✅ ¡ÉXITO! El perfil ha sido actualizado correctamente.");
      console.log(
        "Los cambios pueden tardar unos minutos en reflejarse en los teléfonos de los clientes.",
      );
    } else {
      console.error("\n❌ Error inesperado:", response.data);
    }
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error(`\n💥 FALLO EN LA ACTUALIZACIÓN: ${detail}`);

    if (error.response?.data) {
      console.log(
        "Detalles técnicos:",
        JSON.stringify(error.response.data, null, 2),
      );
    }
  } finally {
    process.exit(0);
  }
}

updateProfile();
