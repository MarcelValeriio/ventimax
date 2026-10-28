const mongoose = require("mongoose");
require("dotenv").config();
const { initAgenda, getAgenda } = require("../services/agendaService");

async function verify() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Conectado a MongoDB");

    const agenda = await initAgenda();
    console.log("✅ Agenda inicializada");

    if (getAgenda()) {
      console.log("✅ getAgenda() devuelve la instancia correctamente");
    }

    // Esperar un momento para ver si arranca
    setTimeout(async () => {
      await agenda.stop();
      await mongoose.disconnect();
      console.log("✅ Prueba finalizada correctamente");
      process.exit(0);
    }, 2000);

  } catch (error) {
    console.error("❌ Error en verificación:", error);
    process.exit(1);
  }
}

verify();
