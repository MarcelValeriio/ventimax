const Agenda = require("agenda");
const mongoose = require("mongoose");

let agenda;

const initAgenda = async (io = null) => {
  if (!agenda) {
    agenda = new Agenda({ db: { address: process.env.MONGODB_URI, collection: 'agendaJobs' } });
    
    // Placeholder job to ensure it's working
    agenda.define("dummy task", async (job) => {
      console.log("Dummy task executed");
    });

    const { generateImageJob } = require('./aiStudioService');
    const { checkAndReactivate } = require('./reactivationService');
    
    agenda.define('generate ai image', async (job) => {
      const { generationId, prompt } = job.attrs.data;
      await generateImageJob(generationId, prompt);
    });

    agenda.define("reactivacion checkout", async (job) => {
      const res = await checkAndReactivate(io);
      console.log(
        `[Reactivation] Candidatos: ${res.candidatos}, enviados: ${res.enviados}`
      );
    });

    // Cotizador de envío (F1-8): tabla diaria de MRW 60 min antes de la apertura (el job decide si toca)
    const cotizadorEnvio = require('./cotizadorEnvio');
    agenda.define("cotizador mrw diario", async () => {
      await cotizadorEnvio.ejecutarJobMrw();
    });
    // Códigos de oficina de Zoom (services/zoomCiudades.ts): revisión semanal que solo avisa (el job decide)
    const zoomCiudadesMonitor = require('./zoomCiudadesMonitor');
    agenda.define("cotizador zoom codigos", async () => {
      await zoomCiudadesMonitor.ejecutarRevisionZoomSemanal();
    });

    await agenda.start();
    await agenda.every("5 minutes", "reactivacion checkout");
    await agenda.every("10 minutes", "cotizador mrw diario");
    await agenda.every("1 day", "cotizador zoom codigos");
    // Arranque: si la tabla de MRW tiene más de 24 h, se actualiza (no bloquea el arranque)
    cotizadorEnvio.iniciarCotizadorEnvio().catch(() => {});
  }
  return agenda;
};

const getAgenda = () => {
  if (!agenda) throw new Error("Agenda not initialized");
  return agenda;
};

const stopAgenda = async () => {
  if (agenda) await agenda.stop();
};

module.exports = { initAgenda, getAgenda, stopAgenda };
