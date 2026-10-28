const axios = require('axios');
const cloudinaryService = require('./cloudinaryService');
const AIGeneration = require('../models/AIGeneration');
const configManager = require('./configManager');

const generateImageJob = async (generationId, prompt) => {
  try {
    // 1. Call DALL-E 3
    const response = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model: "dall-e-3",
        prompt: prompt,
        n: 1,
        size: "1024x1024"
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const temporaryUrl = response.data.data[0].url;

    // 2. Upload to Cloudinary for persistence
    const cloudinaryUrl = await cloudinaryService.uploadImageFromUrl(temporaryUrl);

    // 3. Update DB
    await AIGeneration.findByIdAndUpdate(generationId, {
      imageUrl: cloudinaryUrl,
      status: 'completed'
    });

  } catch (error) {
    console.error("Error generating image:", error.response?.data || error.message);
    await AIGeneration.findByIdAndUpdate(generationId, { status: 'failed' });
  }
};

const generateCopy = async (prompt, imageContext) => {
  try {
    const brandName = configManager.get("settings.brandName") || "nuestra marca";
    const desc = configManager.get("settings.businessDescription");
    const descText = desc ? ` (${desc})` : "";
    const systemPrompt = `Eres un experto copywriter para la marca ${brandName}${descText}. Escribe textos atractivos, cortos (max 500 chars), con emojis y hashtags. NUNCA excedas los 1024 caracteres.`;
    const userPrompt = `Contexto de la imagen: ${imageContext}. Instrucciones extra: ${prompt || "Escribe un copy vendedor para Instagram y WhatsApp."}`;

    const response = await axios.post(
      'https://api.deepseek.com/v1/chat/completions',
      {
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.choices[0].message.content;
  } catch (error) {
    console.error("Error generating copy with DeepSeek:", error.response?.data || error.message);
    throw new Error("Failed to generate copy");
  }
};

module.exports = { generateImageJob, generateCopy };