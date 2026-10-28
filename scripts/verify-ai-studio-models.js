/**
 * scripts/verify-ai-studio-models.js
 * Script de verificación para asegurar que los modelos y servicios de AI Studio están correctamente implementados.
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function verify() {
  console.log('🔍 Iniciando verificación de AI Studio...');

  try {
    // 1. Verificar Modelos
    console.log('--- Verificando Modelos ---');
    const AIDestination = require('../models/AIDestination');
    const AIGeneration = require('../models/AIGeneration');
    
    console.log('✅ Modelo AIDestination cargado');
    console.log('✅ Modelo AIGeneration cargado');

    // 2. Verificar Servicios
    console.log('\n--- Verificando Servicios ---');
    const aiStudioService = require('../services/aiStudioService');
    const agendaService = require('../services/agendaService');
    
    if (typeof aiStudioService.generateImageJob === 'function' && typeof aiStudioService.generateCopy === 'function') {
      console.log('✅ aiStudioService tiene los métodos necesarios');
    } else {
      throw new Error('aiStudioService no tiene los métodos esperados');
    }

    if (typeof agendaService.initAgenda === 'function' && typeof agendaService.getAgenda === 'function') {
      console.log('✅ agendaService tiene los métodos necesarios');
    } else {
      throw new Error('agendaService no tiene los métodos esperados');
    }

    // 3. Verificar Controladores
    console.log('\n--- Verificando Controladores ---');
    const aiStudioController = require('../controllers/aiStudioController');
    if (aiStudioController.requestImageGeneration && aiStudioController.broadcastContent) {
      console.log('✅ aiStudioController cargado con métodos de generación');
    }

    console.log('\n✨ Verificación de estructura COMPLETADA con éxito.');
  } catch (error) {
    console.error('\n❌ ERROR en la verificación:', error.message);
    process.exit(1);
  }
}

verify();
