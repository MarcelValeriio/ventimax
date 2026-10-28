// scripts/migrate-payments.js
require("dotenv").config();
const mongoose = require("mongoose");
const MetodoPago = require("../models/MetodoPago");
const configManager = require("../services/configManager");

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  const payments = configManager.get("payments");

  if (!payments) {
    console.log("No payments found in config to migrate.");
    process.exit(0);
  }

  for (const [key, data] of Object.entries(payments)) {
    const exists = await MetodoPago.findOne({ nombre: data.nombre });
    if (!exists) {
      let tipo = 'otro';
      const keyLower = key.toLowerCase();
      if (keyLower.includes('transferencia')) tipo = 'transferencia';
      else if (keyLower.includes('pago movil') || keyLower.includes('pagomovil')) tipo = 'pago_movil';
      else if (keyLower.includes('zelle')) tipo = 'zelle';
      else if (keyLower.includes('usdt') || keyLower.includes('binance')) tipo = 'binance';     
      else if (keyLower.includes('efectivo')) tipo = 'efectivo';

      await MetodoPago.create({
        tipo,
        nombre: data.nombre,
        detalles: { instruccionesDePago: data.instrucciones }, // For later manual split
        activo: true
      });
      console.log(`Migrated: ${data.nombre}`);
    } else {
      console.log(`Already exists: ${data.nombre}`);
    }
  }
  console.log("Migration complete.");
  process.exit(0);
}
migrate().catch(console.error);
