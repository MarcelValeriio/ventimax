let Etiqueta = require("../models/Etiqueta");
let Mensaje = require("../models/Mensaje");

// Soporte para Pruebas de Integración (Mock con Persistencia Compartida)
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("./dbLocal");
  Etiqueta = dbLocal.getEtiquetaModel();
  Mensaje = dbLocal.getMensajeModel();
}

const orderService = require("./orderService");
const { enviarTexto, enviarPlantilla } = require("./whatsapp");
const configManager = require("./configManager");

// Pasos monitoreados para reactivación:
// - Menú / Exploración: 60 min primer aviso, 120 min segundo (asesoría suave de menú/productos).
// - Carrito Abandonado: 15 min primer aviso, 30 min segundo (alta intención).
// - Checkout: 15/30 min primer aviso, doble el segundo (alta intención).
const PASOS_ALTA_INTENCION = {
  // Pasos de Menú / Exploración (Baja/Media intención)
  inicio: { label: "nuestro menú", minutos: 60, tipo: "exploracion" },
  esperando_seleccion: { label: "las categorías del menú", minutos: 60, tipo: "exploracion" },
  esperando_producto: { label: "la selección de productos", minutos: 60, tipo: "exploracion" },

  // Carrito Abandonado (Alta intención)
  esperando_cantidad: { label: "la cantidad de tu producto", minutos: 15, tipo: "carrito" },
  preguntando_mas: { label: "tu carrito de compras", minutos: 15, tipo: "carrito" },

  // Pasos de Checkout (Alta intención)
  esperando_datos_cliente: { label: "tus datos", minutos: 15 },
  esperando_cedula: { label: "tu cédula", minutos: 15 },
  esperando_ubicacion: { label: "tu dirección", minutos: 15 },
  esperando_confirmacion_datos: { label: "la confirmación", minutos: 15 },
  esperando_pago_metodo: { label: "el método de pago", minutos: 15 },
  esperando_efectivo_opcion: { label: "la opción de pago", minutos: 15 },
  esperando_efectivo_monto: { label: "el monto en efectivo", minutos: 15 },
  esperando_comprobante: { label: "el comprobante de pago", minutos: 30 },
};

const TEMPLATE_REACTIVACION =
  process.env.WHATSAPP_TEMPLATE_REACTIVACION || "reactivacion_checkout";

const armarMensaje = (conf, esSegundo) => {
  const label = typeof conf === "string" ? conf : conf.label;
  const tipo = typeof conf === "object" ? conf.tipo : null;
  const brandEmoji = configManager.get("settings.brandEmoji") || configManager.get("settings.categoryEmoji") || "✨";

  if (tipo === "exploracion") {
    if (esSegundo) {
      return (
        configManager.get("settings.messages.reactivationNotice") ||
        `¡Hola! 😊 Si deseas ver de nuevo nuestro catálogo de productos, escribe "menú" en cualquier momento. ¡Estamos a tu orden! ${brandEmoji}`
      );
    }
    return `Hola 👋, ¿tuviste alguna duda consultando ${label}? Si buscas una recomendación de nuestros productos estrella, dime y te ayudo al instante. ${brandEmoji}`;
  }

  if (tipo === "carrito") {
    if (esSegundo) {
      return `Hola de nuevo 😊, tus productos siguen reservados en tu carrito. Si deseas completar tu pedido o necesitas asesoría, responde aquí o escribe "menú". ${brandEmoji}`;
    }
    return `Hola 👋, vimos que dejaste pendiente ${label}. ¿Deseas continuar con tu pedido? Responde con tu elección y con gusto te atendemos. ${brandEmoji}`;
  }

  if (esSegundo) {
    return `Hola de nuevo 😊, sigues en el paso de ${label}. Si prefieres, escribe "ayuda" y te conecto con una persona.`;
  }
  return `Hola 👋, quedaste en el paso de ${label}. ¿Seguimos? Responde y te ayudo al instante.`;
};

async function enviarRecordatorio(telefono, conf, esSegundo, io = null, textoAlternativo = null) {
  const label = typeof conf === "string" ? conf : conf.label;
  const texto = textoAlternativo || armarMensaje(conf, esSegundo);
  let enviado = false;

  try {
    const ok = await enviarTexto(telefono, texto);
    if (ok) enviado = true;
  } catch (err) {
    console.error(`❌ [Reactivation] Error en enviarTexto a ${telefono}:`, err.message);
  }

  if (!enviado) {
    try {
      const ok = await enviarPlantilla(telefono, TEMPLATE_REACTIVACION, "es", [{ type: "text", text: label }]);
      if (ok) enviado = true;
    } catch (err) {
      console.error(`❌ [Reactivation] Error en enviarPlantilla a ${telefono}:`, err.message);
    }
  }

  if (enviado) {
    try {
      await orderService.emitirYGuardar(telefono, texto, "bot", io);
    } catch (err) {
      console.error(`⚠️ [Reactivation] Error guardando/emitiendo mensaje de reactivación para ${telefono}:`, err.message);
    }
    return true;
  }

  return false;
}

async function checkAndReactivate(arg1 = null, arg2 = false) {
  let io = null;
  let dryRun = false;

  if (typeof arg1 === "boolean") {
    dryRun = arg1;
    io = null;
  } else {
    io = arg1;
    dryRun = Boolean(arg2);
  }

  let candidatos = 0;
  let enviados = 0;

  try {
    const etiquetas = await Etiqueta.find({
      paso: { $in: Object.keys(PASOS_ALTA_INTENCION) },
      modo: { $ne: "manual" },
    }).lean();

    for (const e of etiquetas) {
      const conf = PASOS_ALTA_INTENCION[e.paso];
      if (!conf) continue;

      const lastMsg = await Mensaje.findOne({ telefono: e.telefono }).sort({ timestamp: -1 });

      let baseTime = null;
      if (lastMsg && lastMsg.timestamp) {
        baseTime = new Date(lastMsg.timestamp).getTime();
      } else if (e.updatedAt) {
        baseTime = new Date(e.updatedAt).getTime();
      } else if (e.lastInteraction) {
        baseTime = new Date(e.lastInteraction).getTime();
      } else if (e.createdAt) {
        baseTime = new Date(e.createdAt).getTime();
      }

      if (!baseTime || isNaN(baseTime)) continue;

      const idleMin = (Date.now() - baseTime) / 60000;
      // Ignorar conversaciones con más de 24 horas de inactividad (evita reactivar chats históricos/antiguos)
      if (idleMin > 24 * 60) continue;

      const tieneReactivacionPrevia = e.ultimaReactivacion?.paso === e.paso && e.ultimaReactivacion?.at;
      const reactivacionAt = tieneReactivacionPrevia ? new Date(e.ultimaReactivacion.at).getTime() : 0;
      const yaEsSegundo = tieneReactivacionPrevia && Boolean(e.ultimaReactivacion?.esSegundo);

      // Si ya se envió el segundo recordatorio y no hubo actividad nueva del usuario, omitir
      if (yaEsSegundo && (!lastMsg || new Date(lastMsg.timestamp).getTime() <= reactivacionAt)) {
        continue;
      }

      let esSegundo = false;

      // Caso 1: No se ha enviado recordatorio para este paso (o hubo nueva actividad del usuario posterior a la última reactivación)
      if (!tieneReactivacionPrevia || (lastMsg && lastMsg.direccion === "user" && new Date(lastMsg.timestamp).getTime() > reactivacionAt)) {
        if (idleMin >= conf.minutos) {
          esSegundo = false;
        } else {
          continue;
        }
      }
      // Caso 2: Ya se envió el 1er recordatorio y esperamos el tiempo para el 2do recordatorio
      else if (tieneReactivacionPrevia && !yaEsSegundo) {
        const minDesdePrimerAviso = (Date.now() - reactivacionAt) / 60000;
        if (minDesdePrimerAviso >= conf.minutos || idleMin >= conf.minutos) {
          esSegundo = true;
        } else {
          continue;
        }
      } else {
        continue;
      }

      candidatos++;

      if (dryRun) {
        console.log(
          `[Reactivation] (dryRun) enviaría a ${e.telefono} paso ${e.paso} idle ${Math.round(idleMin)}min (aviso: ${esSegundo ? "segundo" : "primer"})`
        );
        continue;
      }

      // -- INICIO EVALUACION CON IA (DEEPSEEK) --
      const contextMsgs = await Mensaje.find({ telefono: e.telefono })
        .sort({ timestamp: -1 })
        .limit(8)
        .lean();
      
      const { evaluarReactivacionConIA } = require("./ai");
      // Los mensajes deben ir en orden cronológico para la IA
      const evalResult = await evaluarReactivacionConIA(e.paso, contextMsgs.reverse());

      if (!evalResult.requiere_retoma) {
        console.log(`🧠 [Reactivation IA] Omitiendo retoma para ${e.telefono}. Motivo: ${evalResult.motivo}`);
        // Lo marcamos como "segundo" aviso para que no vuelva a molestar en el futuro, cerrando este ciclo.
        await Etiqueta.updateOne(
          { telefono: e.telefono },
          {
            ultimaReactivacion: {
              at: new Date(),
              paso: e.paso,
              esSegundo: true,
            },
          }
        );
        continue; // Saltamos este cliente, no necesita mensaje.
      }
      
      const mensajeAEnviar = evalResult.mensaje;
      // -- FIN EVALUACION CON IA --

      const ok = await enviarRecordatorio(e.telefono, conf, esSegundo, io, mensajeAEnviar);
      if (ok) {
        await Etiqueta.updateOne(
          { telefono: e.telefono },
          {
            ultimaReactivacion: {
              at: new Date(),
              paso: e.paso,
              esSegundo,
            },
          }
        );
        console.log(
          `✅ [Reactivation] Recordatorio (${esSegundo ? "segundo" : "primer"}) enviado a ${e.telefono} (paso: ${e.paso})`
        );
        enviados++;
      }
    }
  } catch (err) {
    console.error("❌ [Reactivation] Error en checkAndReactivate:", err);
  }

  return { candidatos, enviados };
}

module.exports = {
  checkAndReactivate,
  PASOS_ALTA_INTENCION,
  armarMensaje,
  enviarRecordatorio,
};
