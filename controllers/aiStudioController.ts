const AIDestination = require('../models/AIDestination');
const AIGeneration = require('../models/AIGeneration');
const { getAgenda } = require('../services/agendaService');
const { generateCopy } = require('../services/aiStudioService');
const whatsappService = require('../services/whatsapp');

// Destinations CRUD
exports.getDestinations = async (req, res) => {
  try {
    const dests = await AIDestination.find();
    res.json({ success: true, data: dests });
  } catch (error) {
    console.error("❌ Error en getDestinations:", error);
    res.status(500).json({ success: false, error: "Error al obtener destinos" });
  }
};

exports.addDestination = async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || !phone) return res.status(400).json({ success: false, error: "Missing fields" });
    const cleanPhone = phone.replace(/[^\d]/g, "");
    const dest = await AIDestination.create({ name, phone: cleanPhone });
    res.json({ success: true, data: dest });
  } catch (error) {
    console.error("❌ Error en addDestination:", error);
    res.status(500).json({ success: false, error: "Error al agregar destino" });
  }
};

exports.deleteDestination = async (req, res) => {
  try {
    await AIDestination.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("❌ Error en deleteDestination:", error);
    res.status(500).json({ success: false, error: "Error al eliminar destino" });
  }
};

// Generations
exports.getHistory = async (req, res) => {
  try {
    const history = await AIGeneration.find().sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: history });
  } catch (error) {
    console.error("❌ Error en getHistory:", error);
    res.status(500).json({ success: false, error: "Error al obtener historial" });
  }
};

exports.requestImageGeneration = async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ success: false, error: "Prompt required" });
    
    const generation = await AIGeneration.create({ imagePrompt: prompt, status: 'pending' });
    
    const agenda = getAgenda();
    await agenda.now('generate ai image', { generationId: generation._id, prompt });
    
    res.json({ success: true, data: generation });
  } catch (error) {
    console.error("❌ Error en requestImageGeneration:", error);
    res.status(500).json({ success: false, error: "Error al solicitar generación de imagen" });
  }
};

exports.requestCopyGeneration = async (req, res) => {
  try {
    const { extraPrompt, generationId } = req.body;
    const generation = await AIGeneration.findById(generationId);
    if (!generation) return res.status(404).json({ success: false, error: "Generation not found" });

    const copy = await generateCopy(extraPrompt, generation.imagePrompt);
    
    generation.copyText = copy;
    await generation.save();

    res.json({ success: true, data: copy });
  } catch (error) {
    console.error("❌ Error en requestCopyGeneration:", error);
    res.status(500).json({ success: false, error: "Error al generar copy" });
  }
};

exports.broadcastContent = async (req, res) => {
  try {
    const { generationId } = req.body;
    const generation = await AIGeneration.findById(generationId);
    const destinations = await AIDestination.find();

    if (!generation || !generation.imageUrl) return res.status(400).json({ success: false, error: "Invalid generation" });
    if (generation.copyText && generation.copyText.length > 1024) return res.status(400).json({ success: false, error: "Caption too long" });

    let successCount = 0;
    for (const dest of destinations) {
      const success = await whatsappService.enviarImagenPorUrl(dest.phone, generation.imageUrl, generation.copyText || "");
      if (success) successCount++;
    }

    res.json({ success: true, sent: successCount, total: destinations.length });
  } catch (error) {
    console.error("❌ Error en broadcastContent:", error);
    res.status(500).json({ success: false, error: "Error en la difusión de contenido" });
  }
};
