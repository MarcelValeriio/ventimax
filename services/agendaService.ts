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

    await agenda.start();
    await agenda.every("5 minutes", "reactivacion checkout");
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
