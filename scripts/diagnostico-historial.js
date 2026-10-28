/**
 * scripts/diagnostico-historial.js
 * 
 * Diagnóstico de rendimiento y consumo de memoria del endpoint getHistorial (lista de chats de WhatsApp).
 * 
 * Mide:
 * 1. Volumetría actual de la base de datos (Mensajes, Etiquetas, Pedidos, Chats únicos).
 * 2. Tiempo de ejecución (ms) del aggregate y consultas actuales.
 * 3. Tamaño del payload JSON resultante (Bytes / KB).
 * 4. Documentos cargados en memoria por colección.
 * 5. Comparativa con la consulta optimizada (proyección + límite).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Mensaje = require('../models/Mensaje');
const Etiqueta = require('../models/Etiqueta');
const Pedido = require('../models/Pedido');
const { getPasoLabel } = require('../utils/pasoEmbudo');

async function runDiagnostic() {
  console.log('===============================================================');
  console.log('🔍 DIAGNÓSTICO DE RENDIMIENTO: getHistorial (LISTA DE CHATS)');
  console.log('===============================================================\n');

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ MONGODB_URI no está definido en el archivo .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri, { family: 4, serverSelectionTimeoutMS: 10000 });
    console.log('📡 Conexión a MongoDB establecida exitosamente.\n');

    // -------------------------------------------------------------------------
    // 1. VOLUMETRÍA ACTUAL DE LA BASE DE DATOS
    // -------------------------------------------------------------------------
    console.log('📊 1. Volumetría en Base de Datos:');
    const startCounts = performance.now();
    const [totalMensajes, totalEtiquetas, totalPedidos, distinctTelefonos] = await Promise.all([
      Mensaje.countDocuments(),
      Etiqueta.countDocuments(),
      Pedido.countDocuments(),
      Mensaje.distinct('telefono')
    ]);
    const endCounts = performance.now();

    console.log(`   • Total Mensajes:     ${totalMensajes.toLocaleString()}`);
    console.log(`   • Total Etiquetas:    ${totalEtiquetas.toLocaleString()}`);
    console.log(`   • Total Pedidos:      ${totalPedidos.toLocaleString()}`);
    console.log(`   • Conversaciones:     ${distinctTelefonos.length.toLocaleString()} chats únicos`);
    console.log(`   • Tiempo de conteo:   ${(endCounts - startCounts).toFixed(2)} ms\n`);

    // -------------------------------------------------------------------------
    // 2. EJECUCIÓN ACTUAL DE getHistorial (Sin optimización)
    // -------------------------------------------------------------------------
    console.log('⏱️  2. Medición del flujo ACTUAL de getHistorial:');
    
    // Paso A: Aggregate actual ($sort + $group con $$ROOT)
    const t0 = performance.now();
    const agregadosActual = await Mensaje.aggregate([
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$telefono",
          ultimoMensaje: { $first: "$$ROOT" },
          totalMensajes: { $sum: 1 },
        },
      },
    ]);
    const t1 = performance.now();
    const tiempoAggregateActual = (t1 - t0).toFixed(2);

    // Paso B: Construcción de mapa en memoria
    const resultadoActual = {};
    for (const ag of agregadosActual) {
      resultadoActual[ag._id] = {
        resumen: {
          _id: ag.ultimoMensaje._id,
          wamid: ag.ultimoMensaje.wamid || null,
          status:
            ag.ultimoMensaje.status ||
            (ag.ultimoMensaje.direccion === "bot" ? "sent" : null),
          text: ag.ultimoMensaje.texto,
          caption: ag.ultimoMensaje.caption || null,
          fileName: ag.ultimoMensaje.fileName || null,
          mediaUrl: ag.ultimoMensaje.mediaUrl || null,
          timestamp:
            ag.ultimoMensaje.timestamp instanceof Date
              ? ag.ultimoMensaje.timestamp.getTime()
              : new Date(ag.ultimoMensaje.timestamp).getTime(),
          direction: ag.ultimoMensaje.direccion,
          tipo: ag.ultimoMensaje.tipo || "texto",
          mediaId: ag.ultimoMensaje.mediaId || null,
          mimeType: ag.ultimoMensaje.mimeType || null,
        },
        totalMensajes: ag.totalMensajes,
      };
    }

    const telefonos = Object.keys(resultadoActual);
    let etiquetasCargadas = 0;
    let pedidosCargados = 0;

    // Paso C: Carga masiva de Etiquetas y Pedidos sin proyección ni límites
    if (telefonos.length > 0) {
      const ets = await Etiqueta.find({
        telefono: { $in: telefonos },
      }).lean();
      etiquetasCargadas = ets.length;

      const peds = await Pedido.find({ whatsappId: { $in: telefonos } })
        .sort({ timestamp: -1 })
        .lean();
      pedidosCargados = peds.length;

      for (const et of ets) {
        if (resultadoActual[et.telefono]) {
          resultadoActual[et.telefono].paso = et.paso || null;
          resultadoActual[et.telefono].pasoLabel = et.paso
            ? getPasoLabel(et.paso)
            : null;
          resultadoActual[et.telefono].stuck = et.stuck || false;
          resultadoActual[et.telefono].nombre = et.carrito?.nombre || null;
          resultadoActual[et.telefono].cedula = et.carrito?.cedula || null;
        }
      }

      for (const ped of peds) {
        if (resultadoActual[ped.whatsappId] && !resultadoActual[ped.whatsappId].nombre) {
          if (
            ped.cliente?.nombre &&
            ped.cliente.nombre.trim() !== "Sin nombre"
          ) {
            resultadoActual[ped.whatsappId].nombre = ped.cliente.nombre.trim();
          }
        }
        if (resultadoActual[ped.whatsappId] && !resultadoActual[ped.whatsappId].cedula) {
          resultadoActual[ped.whatsappId].cedula = ped.cliente?.cedula || null;
        }
      }
    }
    const t2 = performance.now();
    const tiempoTotalActual = (t2 - t0).toFixed(2);

    const jsonPayloadActual = JSON.stringify({ success: true, data: resultadoActual });
    const bytesActual = Buffer.byteLength(jsonPayloadActual, 'utf8');
    const kbActual = (bytesActual / 1024).toFixed(2);

    console.log(`   • Tiempo Aggregate ($$ROOT):    ${tiempoAggregateActual} ms`);
    console.log(`   • Tiempo Total getHistorial:    ${tiempoTotalActual} ms`);
    console.log(`   • Conversaciones devueltas:     ${Object.keys(resultadoActual).length}`);
    console.log(`   • Etiquetas procesadas:         ${etiquetasCargadas}`);
    console.log(`   • Pedidos procesados:           ${pedidosCargados}`);
    console.log(`   • Tamaño Payload JSON:          ${bytesActual.toLocaleString()} Bytes (${kbActual} KB)\n`);

    // -------------------------------------------------------------------------
    // 3. COMPARATIVA: SIMULACIÓN DE FLUJO OPTIMIZADO
    // -------------------------------------------------------------------------
    console.log('⚡ 3. Medición del flujo OPTIMIZADO (Proyección + Límite 300):');
    
    const LIMIT_CONVERSACIONES = 300;
    const tOpt0 = performance.now();
    
    const agregadosOpt = await Mensaje.aggregate([
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: "$telefono",
          ultimoMensaje: {
            $first: {
              _id: "$_id",
              wamid: "$wamid",
              status: "$status",
              texto: "$texto",
              caption: "$caption",
              fileName: "$fileName",
              mediaUrl: "$mediaUrl",
              timestamp: "$timestamp",
              direccion: "$direccion",
              tipo: "$tipo",
              mediaId: "$mediaId",
              mimeType: "$mimeType",
            },
          },
          totalMensajes: { $sum: 1 },
        },
      },
      { $sort: { "ultimoMensaje.timestamp": -1 } },
      { $limit: LIMIT_CONVERSACIONES },
    ]);
    const tOpt1 = performance.now();
    const tiempoAggregateOpt = (tOpt1 - tOpt0).toFixed(2);

    const resultadoOpt = {};
    for (const ag of agregadosOpt) {
      resultadoOpt[ag._id] = {
        resumen: {
          _id: ag.ultimoMensaje._id,
          wamid: ag.ultimoMensaje.wamid || null,
          status:
            ag.ultimoMensaje.status ||
            (ag.ultimoMensaje.direccion === "bot" ? "sent" : null),
          text: ag.ultimoMensaje.texto,
          caption: ag.ultimoMensaje.caption || null,
          fileName: ag.ultimoMensaje.fileName || null,
          mediaUrl: ag.ultimoMensaje.mediaUrl || null,
          timestamp:
            ag.ultimoMensaje.timestamp instanceof Date
              ? ag.ultimoMensaje.timestamp.getTime()
              : new Date(ag.ultimoMensaje.timestamp).getTime(),
          direction: ag.ultimoMensaje.direccion,
          tipo: ag.ultimoMensaje.tipo || "texto",
          mediaId: ag.ultimoMensaje.mediaId || null,
          mimeType: ag.ultimoMensaje.mimeType || null,
        },
        totalMensajes: ag.totalMensajes,
        tienePedido: false,
        pedidosCount: 0,
      };
    }

    const telefonosOpt = Object.keys(resultadoOpt);
    let etiquetasOptCount = 0;
    let pedidosOptCount = 0;

    if (telefonosOpt.length > 0) {
      const etsOpt = await Etiqueta.find(
        { telefono: { $in: telefonosOpt } },
        { telefono: 1, paso: 1, stuck: 1, "carrito.nombre": 1, "carrito.cedula": 1 }
      ).lean();
      etiquetasOptCount = etsOpt.length;

      // Pedidos últimos 60 días
      const cutoffDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const pedsOpt = await Pedido.find(
        { whatsappId: { $in: telefonosOpt }, timestamp: { $gte: cutoffDate } },
        { whatsappId: 1, "cliente.nombre": 1, "cliente.cedula": 1, timestamp: 1 }
      )
        .sort({ timestamp: -1 })
        .lean();
      pedidosOptCount = pedsOpt.length;

      for (const et of etsOpt) {
        if (resultadoOpt[et.telefono]) {
          resultadoOpt[et.telefono].paso = et.paso || null;
          resultadoOpt[et.telefono].pasoLabel = et.paso
            ? getPasoLabel(et.paso)
            : null;
          resultadoOpt[et.telefono].stuck = et.stuck || false;
          resultadoOpt[et.telefono].nombre = et.carrito?.nombre || null;
          resultadoOpt[et.telefono].cedula = et.carrito?.cedula || null;
        }
      }

      for (const ped of pedsOpt) {
        if (resultadoOpt[ped.whatsappId]) {
          resultadoOpt[ped.whatsappId].tienePedido = true;
          resultadoOpt[ped.whatsappId].pedidosCount = (resultadoOpt[ped.whatsappId].pedidosCount || 0) + 1;
          
          if (!resultadoOpt[ped.whatsappId].nombre && ped.cliente?.nombre && ped.cliente.nombre.trim() !== "Sin nombre") {
            resultadoOpt[ped.whatsappId].nombre = ped.cliente.nombre.trim();
          }
          if (!resultadoOpt[ped.whatsappId].cedula && ped.cliente?.cedula) {
            resultadoOpt[ped.whatsappId].cedula = ped.cliente.cedula;
          }
        }
      }
    }
    const tOpt2 = performance.now();
    const tiempoTotalOpt = (tOpt2 - tOpt0).toFixed(2);

    const jsonPayloadOpt = JSON.stringify({ success: true, data: resultadoOpt });
    const bytesOpt = Buffer.byteLength(jsonPayloadOpt, 'utf8');
    const kbOpt = (bytesOpt / 1024).toFixed(2);

    console.log(`   • Tiempo Aggregate Optimizado:  ${tiempoAggregateOpt} ms`);
    console.log(`   • Tiempo Total Optimizado:      ${tiempoTotalOpt} ms`);
    console.log(`   • Conversaciones devueltas:     ${Object.keys(resultadoOpt).length}`);
    console.log(`   • Etiquetas procesadas:         ${etiquetasOptCount}`);
    console.log(`   • Pedidos procesados:           ${pedidosOptCount}`);
    console.log(`   • Tamaño Payload JSON:          ${bytesOpt.toLocaleString()} Bytes (${kbOpt} KB)\n`);

    // -------------------------------------------------------------------------
    // 4. TABLA COMPARATIVA Y CONCLUSIÓN
    // -------------------------------------------------------------------------
    console.log('📋 4. Tabla Comparativa:');
    console.table([
      {
        Métrica: 'Tiempo Total (ms)',
        'Actual (Sin Optimizar)': `${tiempoTotalActual} ms`,
        'Optimizado (Propuesto)': `${tiempoTotalOpt} ms`,
        Mejora: `${Math.round(((tiempoTotalActual - tiempoTotalOpt) / tiempoTotalActual) * 100)}% más rápido`,
      },
      {
        Métrica: 'Payload JSON',
        'Actual (Sin Optimizar)': `${kbActual} KB`,
        'Optimizado (Propuesto)': `${kbOpt} KB`,
        Mejora: `${Math.round(((kbActual - kbOpt) / kbActual) * 100)}% menor transferencia`,
      },
      {
        Métrica: 'Campos proyectados en aggregate',
        'Actual (Sin Optimizar)': '$$ROOT (Documento entero)',
        'Optimizado (Propuesto)': '12 campos seleccionados',
        Mejora: 'Menor memoria en MongoDB',
      },
      {
        Métrica: 'Límite de conversaciones',
        'Actual (Sin Optimizar)': 'Ilimitado (todas)',
        'Optimizado (Propuesto)': `Top ${LIMIT_CONVERSACIONES} recientes`,
        Mejora: 'Escalable a miles de chats',
      },
    ]);

    console.log('\n💡 CONCLUSIÓN:');
    console.log('   La optimización reduce significativamente la transferencia de red y el uso de memoria en MongoDB.');
    console.log('   Además habilita los metadatos necesarios (tienePedido / pedidosCount) para los nuevos filtros.');
    console.log('===============================================================\n');

  } catch (err) {
    console.error('❌ Error en el diagnóstico:', err);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('🔌 Conexión a MongoDB cerrada.');
    }
  }
}

runDiagnostic();
