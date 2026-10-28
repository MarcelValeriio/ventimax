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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.deleteDestination = async (req, res) => {
  try {
    await AIDestination.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Generations
exports.getHistory = async (req, res) => {
  try {
    const history = await AIGeneration.find().sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
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
    res.status(500).json({ success: false, error: error.message });
  }
};
