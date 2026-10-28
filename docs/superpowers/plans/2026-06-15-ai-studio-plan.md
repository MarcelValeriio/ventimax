# AI Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the AI Studio module to generate images with DALL-E 3, copy with DeepSeek, and distribute content via WhatsApp using Agenda for background processing.

**Architecture:** We will create two new MongoDB models (`AIDestination`, `AIGeneration`), a new service (`aiStudioService.js`) to handle external APIs, and a set of Express routes. Background tasks for image generation and uploading will be managed by `Agenda`. The frontend will be a new React component integrated into the existing dashboard.

**Tech Stack:** Node.js, Express, MongoDB (Mongoose), Agenda, React (pure JS/CDN), TailwindCSS, DALL-E 3 API, DeepSeek API, Cloudinary.

---

### Task 1: Database Models

**Files:**
- Create: `models/AIDestination.js`
- Create: `models/AIGeneration.js`

- [ ] **Step 1: Write the AIDestination model**

```javascript
// models/AIDestination.js
const mongoose = require('mongoose');

const aiDestinationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true }
});

module.exports = mongoose.model('AIDestination', aiDestinationSchema);
```

- [ ] **Step 2: Write the AIGeneration model**

```javascript
// models/AIGeneration.js
const mongoose = require('mongoose');

const aiGenerationSchema = new mongoose.Schema({
  imagePrompt: { type: String, required: true },
  imageUrl: { type: String }, // Can be null initially while generating
  copyText: { type: String },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AIGeneration', aiGenerationSchema);
```

- [ ] **Step 3: Commit**

```bash
git add models/AIDestination.js models/AIGeneration.js
git commit -m "feat(ai-studio): create mongoose models for destinations and generations"
```

---

### Task 2: Setup Agenda for Background Jobs

**Files:**
- Create: `services/agendaService.js`
- Modify: `index.js`
- Modify: `package.json`

- [ ] **Step 1: Install Agenda**

```bash
npm install agenda
```

- [ ] **Step 2: Create the Agenda service**

```javascript
// services/agendaService.js
const Agenda = require('agenda');
const mongoose = require('mongoose');

let agenda;

const initAgenda = () => {
  if (!agenda) {
    agenda = new Agenda({ mongo: mongoose.connection });
    
    agenda.define('dummy task', async (job) => {
      console.log('Dummy task executed');
    });

    agenda.start();
  }
  return agenda;
};

const getAgenda = () => {
  if (!agenda) throw new Error("Agenda not initialized");
  return agenda;
};

module.exports = { initAgenda, getAgenda };
```

- [ ] **Step 3: Initialize Agenda in index.js**

Modify `index.js` to initialize Agenda after MongoDB connects. Add this inside the `mongoose.connect().then(...)` block, around line 54.

```javascript
    const { initAgenda } = require("./services/agendaService");
    initAgenda();
    console.log("✅ Agenda iniciada");
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json services/agendaService.js index.js
git commit -m "chore(ai-studio): install and initialize agenda for background jobs"
```

---

### Task 3: AI Studio Backend Service

**Files:**
- Create: `services/aiStudioService.js`
- Modify: `services/agendaService.js`

- [ ] **Step 1: Implement AI Studio Service (DeepSeek & DALL-E wrapper)**

```javascript
// services/aiStudioService.js
const axios = require('axios');
const cloudinaryService = require('./cloudinaryService');
const AIGeneration = require('../models/AIGeneration');
const { getAgenda } = require('./agendaService');

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
    const systemPrompt = "Eres un experto copywriter para la marca Pachi-Kid (ropa infantil). Escribe textos atractivos, cortos (max 500 chars), con emojis y hashtags. NUNCA excedas los 1024 caracteres.";
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
```

- [ ] **Step 2: Register Job in Agenda**

Modify `services/agendaService.js` to define the job:

```javascript
// Add to services/agendaService.js, inside initAgenda() before agenda.start()
    const { generateImageJob } = require('./aiStudioService');
    
    agenda.define('generate ai image', async (job) => {
      const { generationId, prompt } = job.attrs.data;
      await generateImageJob(generationId, prompt);
    });
```

- [ ] **Step 3: Commit**

```bash
git add services/aiStudioService.js services/agendaService.js
git commit -m "feat(ai-studio): implement DALL-E and DeepSeek api wrappers and agenda job"
```

---

### Task 4: API Routes and Controller

**Files:**
- Create: `controllers/aiStudioController.js`
- Create: `routes/aiStudioRoutes.js`
- Modify: `index.js`

- [ ] **Step 1: Create the Controller**

```javascript
// controllers/aiStudioController.js
const AIDestination = require('../models/AIDestination');
const AIGeneration = require('../models/AIGeneration');
const { getAgenda } = require('../services/agendaService');
const { generateCopy } = require('../services/aiStudioService');
const whatsappService = require('../services/whatsapp');

// Destinations CRUD
exports.getDestinations = async (req, res) => {
  const dests = await AIDestination.find();
  res.json({ success: true, data: dests });
};

exports.addDestination = async (req, res) => {
  const { name, phone } = req.body;
  const cleanPhone = phone.replace(/[^\d]/g, "");
  const dest = await AIDestination.create({ name, phone: cleanPhone });
  res.json({ success: true, data: dest });
};

exports.deleteDestination = async (req, res) => {
  await AIDestination.findByIdAndDelete(req.params.id);
  res.json({ success: true });
};

// Generations
exports.getHistory = async (req, res) => {
  const history = await AIGeneration.find().sort({ createdAt: -1 }).limit(20);
  res.json({ success: true, data: history });
};

exports.requestImageGeneration = async (req, res) => {
  const { prompt } = req.body;
  const generation = await AIGeneration.create({ imagePrompt: prompt, status: 'pending' });
  
  const agenda = getAgenda();
  await agenda.now('generate ai image', { generationId: generation._id, prompt });
  
  res.json({ success: true, data: generation });
};

exports.requestCopyGeneration = async (req, res) => {
  const { extraPrompt, generationId } = req.body;
  const generation = await AIGeneration.findById(generationId);
  if (!generation) return res.status(404).json({ error: "Generation not found" });

  const copy = await generateCopy(extraPrompt, generation.imagePrompt);
  
  generation.copyText = copy;
  await generation.save();

  res.json({ success: true, data: copy });
};

exports.broadcastContent = async (req, res) => {
  const { generationId } = req.body;
  const generation = await AIGeneration.findById(generationId);
  const destinations = await AIDestination.find();

  if (!generation || !generation.imageUrl) return res.status(400).json({ error: "Invalid generation" });
  if (generation.copyText && generation.copyText.length > 1024) return res.status(400).json({ error: "Caption too long" });

  let successCount = 0;
  for (const dest of destinations) {
    const success = await whatsappService.enviarImagenPorUrl(dest.phone, generation.imageUrl, generation.copyText || "");
    if (success) successCount++;
  }

  res.json({ success: true, sent: successCount, total: destinations.length });
};
```

- [ ] **Step 2: Create Routes**

```javascript
// routes/aiStudioRoutes.js
const express = require('express');
const router = express.Router();
const controller = require('../controllers/aiStudioController');
const { verifyToken, isAdmin } = require('../middlewares/auth');

router.use(verifyToken, isAdmin);

router.get('/destinations', controller.getDestinations);
router.post('/destinations', controller.addDestination);
router.delete('/destinations/:id', controller.deleteDestination);

router.get('/history', controller.getHistory);
router.post('/generate-image', controller.requestImageGeneration);
router.post('/generate-copy', controller.requestCopyGeneration);
router.post('/broadcast', controller.broadcastContent);

module.exports = router;
```

- [ ] **Step 3: Mount Routes in index.js**

Add to `index.js` around line 35 (with other routes):
```javascript
const aiStudioRoutes = require("./routes/aiStudioRoutes");
app.use("/api/admin/ai-studio", aiStudioRoutes);
```

- [ ] **Step 4: Commit**

```bash
git add controllers/aiStudioController.js routes/aiStudioRoutes.js index.js
git commit -m "feat(ai-studio): implement controllers and routes for AI Studio"
```

---

### Task 5: Frontend Component Implementation

**Files:**
- Create: `public/src/features/dashboard/AIStudio.js`
- Modify: `public/index.html`

- [ ] **Step 1: Create the AIStudio React Component**

```javascript
// public/src/features/dashboard/AIStudio.js
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js";

const e = React.createElement;

const AIStudio = () => {
  const [destinations, setDestinations] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedGen, setSelectedGen] = useState(null);
  
  const [newDestName, setNewDestName] = useState("");
  const [newDestPhone, setNewDestPhone] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [copyPrompt, setCopyPrompt] = useState("");
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const fetchDestinations = async () => {
    const { data } = await apiClient.get('/api/admin/ai-studio/destinations');
    if (data.success) setDestinations(data.data);
  };

  const fetchHistory = async () => {
    const { data } = await apiClient.get('/api/admin/ai-studio/history');
    if (data.success) {
      setHistory(data.data);
      if (!selectedGen && data.data.length > 0) setSelectedGen(data.data[0]);
    }
  };

  useEffect(() => {
    fetchDestinations();
    fetchHistory();
    // Poll history to update status of pending images
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const addDestination = async () => {
    if (!newDestName || !newDestPhone) return;
    await apiClient.post('/api/admin/ai-studio/destinations', { name: newDestName, phone: newDestPhone });
    setNewDestName(""); setNewDestPhone("");
    fetchDestinations();
  };

  const deleteDestination = async (id) => {
    await apiClient.delete(`/api/admin/ai-studio/destinations/${id}`);
    fetchDestinations();
  };

  const generateImage = async () => {
    if (!imagePrompt) return;
    setIsGeneratingImg(true);
    try {
      await apiClient.post('/api/admin/ai-studio/generate-image', { prompt: imagePrompt });
      window.showToast("Generación iniciada en segundo plano", "success");
      setImagePrompt("");
      fetchHistory();
    } catch(err) {
      window.showToast("Error iniciando generación", "error");
    } finally {
      setIsGeneratingImg(false);
    }
  };

  const generateCopy = async () => {
    if (!selectedGen) return;
    setIsGeneratingCopy(true);
    try {
      const { data } = await apiClient.post('/api/admin/ai-studio/generate-copy', { 
        generationId: selectedGen._id, 
        extraPrompt: copyPrompt 
      });
      if (data.success) {
        setSelectedGen({...selectedGen, copyText: data.data});
        setCopyPrompt("");
        fetchHistory();
      }
    } catch(err) {
      window.showToast("Error generando texto", "error");
    } finally {
      setIsGeneratingCopy(false);
    }
  };

  const broadcast = async () => {
    if (!selectedGen || !selectedGen.imageUrl) return;
    setIsBroadcasting(true);
    try {
      const { data } = await apiClient.post('/api/admin/ai-studio/broadcast', { generationId: selectedGen._id });
      window.showToast(`Enviado a ${data.sent} de ${data.total} contactos`, "success");
    } catch(err) {
      window.showToast(err.response?.data?.error || "Error enviando difusión", "error");
    } finally {
      setIsBroadcasting(false);
    }
  };

  const isCopyTooLong = selectedGen?.copyText?.length > 1024;

  return e("div", { className: "flex flex-col h-full bg-gray-50 dark:bg-gray-900 font-sans" },
    // Header
    e("div", { className: "p-6 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center shrink-0" },
      e("div", null, 
        e("h1", { className: "text-2xl font-black text-gray-800 dark:text-white tracking-tighter uppercase italic" }, "AI Studio ", e("span", { className: "text-emerald-500 text-sm" }, "PRO")),
        e("p", { className: "text-gray-400 text-[10px] font-black uppercase tracking-widest" }, "Generador de Copy Bajo Demanda")
      )
    ),

    e("div", { className: "flex-1 flex overflow-hidden" },
      // Sidebar
      e("div", { className: "w-80 bg-white dark:bg-gray-800 border-r dark:border-gray-700 p-6 overflow-y-auto space-y-8 shrink-0" },
        // Destinatarios
        e("div", { className: "space-y-4" },
          e("h3", { className: "text-[10px] font-black uppercase text-gray-400 tracking-widest" }, "Envío Directo"),
          e("div", { className: "flex flex-col gap-2 bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl" },
            e("input", { 
              value: newDestName, onChange: (ev) => setNewDestName(ev.target.value),
              placeholder: "Nombre", className: "p-2 rounded text-xs border dark:bg-gray-800 dark:border-gray-700 dark:text-white" 
            }),
            e("input", { 
              value: newDestPhone, onChange: (ev) => setNewDestPhone(ev.target.value),
              placeholder: "Teléfono", className: "p-2 rounded text-xs border dark:bg-gray-800 dark:border-gray-700 dark:text-white" 
            }),
            e("button", { onClick: addDestination, className: "bg-emerald-100 text-emerald-700 py-1 rounded font-bold text-xs" }, "Agregar")
          ),
          e("div", { className: "space-y-2" }, 
            destinations.map(d => e("div", { key: d._id, className: "flex items-center gap-3 bg-emerald-50 dark:bg-emerald-500/10 p-3 rounded-2xl border border-emerald-100 dark:border-emerald-500/20" },
              e("div", { className: "w-8 h-8 bg-emerald-500 text-white rounded-xl flex items-center justify-center text-xs" }, e("i", { className: "fab fa-whatsapp" })),
              e("div", { className: "flex-1" },
                e("p", { className: "text-[10px] font-black dark:text-emerald-400" }, d.name),
                e("p", { className: "text-[9px] text-emerald-600/60 font-medium" }, d.phone)
              ),
              e("button", { onClick: () => deleteDestination(d._id), className: "text-red-400 hover:text-red-600" }, e("i", { className: "fas fa-trash-alt text-[10px]" }))
            ))
          )
        ),
        
        // Generador de Imagen
        e("div", { className: "space-y-4" },
          e("h3", { className: "text-[10px] font-black uppercase text-gray-400 tracking-widest" }, "Prompt de Imagen (DALL-E 3)"),
          e("textarea", { 
            value: imagePrompt, onChange: (ev) => setImagePrompt(ev.target.value),
            className: "w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl p-4 text-sm focus:ring-2 ring-emerald-500 h-32 resize-none dark:text-white", 
            placeholder: "Describe la imagen..." 
          }),
          e("button", { 
            onClick: generateImage, disabled: isGeneratingImg || !imagePrompt,
            className: "w-full bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50" 
          }, e("i", { className: `fas ${isGeneratingImg ? 'fa-spinner fa-spin' : 'fa-image'} mr-2` }), isGeneratingImg ? "Iniciando..." : "Generar Arte")
        )
      ),

      // Central Area
      e("div", { className: "flex-1 p-6 bg-gray-50 dark:bg-gray-900 flex flex-col space-y-6 overflow-hidden" },
        // Galería
        e("div", { className: "flex flex-col space-y-3 shrink-0" },
          e("h4", { className: "text-[10px] font-black uppercase text-gray-400 tracking-widest" }, "Historial de Creaciones"),
          e("div", { className: "flex gap-4 overflow-x-auto pb-4 scrollbar-hide" },
            history.map(item => e("div", { 
              key: item._id, 
              onClick: () => setSelectedGen(item),
              className: `flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden cursor-pointer transition-all border-2 ${selectedGen?._id === item._id ? 'ring-2 ring-emerald-500 ring-offset-4 border-white' : 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0 border-transparent'}`
            }, 
              item.status === 'pending' ? e("div", { className: "w-full h-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center animate-pulse" }, e("i", { className: "fas fa-spinner fa-spin text-gray-400" })) :
              item.status === 'failed' ? e("div", { className: "w-full h-full bg-red-100 flex items-center justify-center text-red-500" }, e("i", { className: "fas fa-exclamation-triangle" })) :
              e("img", { src: item.imageUrl, className: "w-full h-full object-cover" })
            ))
          )
        ),

        // Preview & Copy
        e("div", { className: "flex-1 flex flex-col md:flex-row gap-6 overflow-hidden" },
          e("div", { className: "flex-1 flex flex-col items-center justify-center" },
            e("div", { className: "w-full max-w-sm aspect-square bg-white dark:bg-gray-800 rounded-[3rem] shadow-2xl overflow-hidden relative border-4 border-white dark:border-gray-800" },
              selectedGen?.imageUrl ? e("img", { src: selectedGen.imageUrl, className: "w-full h-full object-cover" }) :
              e("div", { className: "w-full h-full flex flex-col items-center justify-center text-gray-400 gap-4" },
                e("i", { className: "fas fa-image text-4xl" }),
                e("span", { className: "text-xs font-bold uppercase tracking-widest" }, selectedGen?.status === 'pending' ? "Generando..." : "Sin Selección")
              )
            )
          ),

          e("div", { className: "flex-1 flex flex-col justify-center max-w-md w-full shrink-0" },
            e("div", { className: "bg-white dark:bg-gray-800 rounded-[2rem] p-6 shadow-xl border border-gray-100 dark:border-gray-700 space-y-4" },
              e("div", { className: "flex justify-between items-center" },
                e("h3", { className: "text-[10px] font-black uppercase text-emerald-600 tracking-widest" }, "Generador de Copy"),
                e("span", { className: "text-[9px] bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full text-gray-500 font-bold" }, "DeepSeek")
              ),
              
              e("div", { className: "space-y-3" },
                e("label", { className: "block text-xs font-bold text-gray-500" }, "Instrucciones extra (Opcional)"),
                e("input", { 
                  value: copyPrompt, onChange: (ev) => setCopyPrompt(ev.target.value),
                  className: "w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl p-3 text-sm focus:ring-2 ring-emerald-500 dark:text-white", 
                  placeholder: 'Ej: "Hazlo más divertido"' 
                }),
                e("button", { 
                  onClick: generateCopy, disabled: !selectedGen || selectedGen.status !== 'completed' || isGeneratingCopy,
                  className: "w-full bg-blue-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50" 
                }, e("i", { className: `fas ${isGeneratingCopy ? 'fa-spinner fa-spin' : 'fa-pen-nib'}` }), isGeneratingCopy ? "Escribiendo..." : "Escribir Texto")
              ),

              e("hr", { className: "border-gray-100 dark:border-gray-700 my-4 border-dashed" }),

              selectedGen?.copyText && e("div", null,
                e("div", { className: "flex justify-between items-center mb-2" },
                  e("span", { className: "text-[9px] font-bold text-gray-400 uppercase" }, "Resultado"),
                  e("span", { className: `text-[10px] font-bold ${isCopyTooLong ? 'text-red-500' : 'text-gray-400'}` }, `${selectedGen.copyText.length}/1024`)
                ),
                e("div", { className: `p-4 rounded-xl text-sm italic ${isCopyTooLong ? 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 border border-red-200' : 'bg-emerald-50 dark:bg-emerald-900/10 text-gray-700 dark:text-gray-300'}` },
                  selectedGen.copyText
                )
              ),

              e("div", { className: "pt-4 mt-4 border-t dark:border-gray-700" },
                e("button", { 
                  onClick: broadcast, disabled: isBroadcasting || !selectedGen || !selectedGen.imageUrl || isCopyTooLong,
                  className: "w-full bg-gray-900 dark:bg-emerald-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50" 
                }, e("i", { className: `fab ${isBroadcasting ? 'fa-spinner fa-spin' : 'fa-whatsapp'} text-lg` }), isBroadcasting ? "Enviando..." : "Enviar Combo a WhatsApp"),
                e("p", { className: "text-center text-[9px] text-gray-400 mt-2 font-bold uppercase" }, isCopyTooLong ? "Texto excede 1024 caracteres" : "Enviará Imagen + Copy a destinatarios")
              )
            )
          )
        )
      )
    )
  );
};

export default AIStudio;
```

- [ ] **Step 2: Mount AIStudio in App Sidebar**

Modify `public/index.html` to add the button in the sidebar and register the component.

```javascript
// In index.html, import AIStudio:
import AIStudio from "./src/features/dashboard/AIStudio.js";

// Inside App(), add the NavButton before Config:
            (!user || user.role === "admin") &&
              e(NavButton, {
                tab: "aistudio",
                icon: "fa-magic",
                title: "AI Studio",
              }),
            (!user || user.role === "admin") &&
              e(NavButton, {
                tab: "config",
                icon: "fa-cog",
                title: "Config",
              }),

// In the conditional rendering area below:
            activeTab === "audit" && e(AuditLogs, { onBack: () => setActiveTab("config") }),
            activeTab === "aistudio" && e(AIStudio),
            activeTab === "config" && e(SettingsPanel, { isDark, setIsDark, setActiveTab, user }),
```

- [ ] **Step 3: Commit**

```bash
git add public/src/features/dashboard/AIStudio.js public/index.html
git commit -m "feat(ai-studio): implement react ui and integrate into dashboard"
```

---