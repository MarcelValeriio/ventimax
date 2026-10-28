/**
 * scripts/migrate-orders.js
 * Script de Migración para normalizar la estructura de Pedidos.
 * - Corrige el doble hash '##' en IDs.
 * - Asegura la existencia de objetos anidados (pago, cliente, ubicacion).
 * - Mueve campos planos (dot notation) a su ubicación correcta.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const Pedido = require("../models/Pedido");

async function migrate() {
  try {
    console.log("🚀 Iniciando migración de datos...");
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error("No se encontró la variable MONGODB_URI o MONGO_URI en el archivo .env");
    
    await mongoose.connect(uri);
    console.log("✅ Conectado a MongoDB Atlas.");

    const pedidos = await Pedido.find({});
    console.log(`📦 Procesando ${pedidos.length} pedidos...`);

    let actualizados = 0;

    for (const doc of pedidos) {
      let modificado = false;

      // 1. Corregir Doble Hash en idFormateado y correlativo
      if (doc.idFormateado && doc.idFormateado.startsWith("##")) {
        doc.idFormateado = doc.idFormateado.replace("##", "#");
        modificado = true;
      }
      if (doc.correlativo && doc.correlativo.startsWith("##")) {
        doc.correlativo = doc.correlativo.replace("##", "#");
        modificado = true;
      }

      // 2. Normalizar objeto 'pago'
      if (!doc.pago) {
        doc.pago = {
          metodo: "No especificado",
          montoUSD: doc["pago.montoUSD"] || 0,
          montoVES: doc["pago.montoVES"] || 0,
          tasa: doc["pago.tasa"] || 0,
          comprobanteMediaId: doc["pago.comprobanteMediaId"],
          comprobanteUrl: doc["pago.comprobanteUrl"]
        };
        modificado = true;
      } else {
        if (doc.pago.metodo === undefined) doc.pago.metodo = "No especificado";
        if (doc.pago.montoUSD === undefined) doc.pago.montoUSD = doc["pago.montoUSD"] || 0;
        modificado = true;
      }

      // 3. Normalizar objeto 'cliente'
      if (!doc.cliente) {
        doc.cliente = {
          nombre: doc["cliente.nombre"] || "Sin nombre",
          cedula: doc["cliente.cedula"] || "Sin cédula"
        };
        modificado = true;
      }

      // 4. Normalizar objeto 'ubicacion'
      if (!doc.ubicacion) {
        doc.ubicacion = {
          direccion: doc["ubicacion.direccion"] || "Retiro por tienda",
          latitud: doc["ubicacion.latitud"],
          longitud: doc["ubicacion.longitud"]
        };
        modificado = true;
      } else if (!doc.ubicacion.direccion) {
        doc.ubicacion.direccion = doc["ubicacion.direccion"] || "Retiro por tienda";
        modificado = true;
      }

      // 5. Normalizar arreglo 'items'
      if (!doc.items || !Array.isArray(doc.items)) {
        doc.items = [];
        modificado = true;
      }

      if (modificado) {
        // Limpiar campos planos si existen (para evitar basura en el doc)
        const flatFields = [
          "pago.montoUSD", "pago.montoVES", "pago.tasa", 
          "pago.comprobanteMediaId", "pago.comprobanteUrl",
          "cliente.nombre", "cliente.cedula",
          "ubicacion.direccion", "ubicacion.latitud", "ubicacion.longitud"
        ];
        flatFields.forEach(f => {
          if (doc[f] !== undefined) doc[f] = undefined;
        });

        await doc.save();
        actualizados++;
      }
    }

    console.log(`✨ Migración completada con éxito.`);
    console.log(`📊 Total pedidos: ${pedidos.length}`);
    console.log(`✅ Pedidos normalizados: ${actualizados}`);
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error crítico en la migración:", error);
    process.exit(1);
  }
}

migrate();
