let Etiqueta = require("../models/Etiqueta");
let Mensaje = require("../models/Mensaje");
let Pedido = require("../models/Pedido");
let Counter = require("../models/Counter");
let Producto = require("../models/Producto");
const MetodoPagoOriginal = require("../models/MetodoPago");
let MetodoPago = MetodoPagoOriginal;

// Soporte para Pruebas de Integración (Mock con Persistencia Compartida)
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("./dbLocal");
  Etiqueta = dbLocal.getEtiquetaModel();
  Mensaje = dbLocal.getMensajeModel();
  Pedido = dbLocal.getPedidoModel();
  Counter = dbLocal.getCounterModel();
  Producto = dbLocal.getProductoModel();
  MetodoPago = dbLocal.getMetodoPagoModel();
}

const configManager = require("./configManager");
const { nombreEnvio, detalleCostoEnvio } = require("./envioTexto");
const { obtenerTasaUSD } = require("./bcv");
const { getCaracasTime, formatBs, formatUsd } = require("../utils/helpers");
const { enviarTexto } = require("./whatsapp");
const { getPasoLabel } = require("../utils/pasoEmbudo");
const { getConfig } = require("./configStore");

/**
 * Helper único para calcular el total en USD de un carrito o pedido.
 * Suma el costo de todos los productos más el costo de envío si es fijo.
 * Si el envío es 'a convenir' o no hay método de envío seleccionado, el recargo de envío es 0.
 *
 * @param {Object} carrito - Carrito o pedido con estructura { items: Array, envio?: Object }
 * @returns {number} Total en USD redondeado a dos decimales.
 */
function calcularTotalCarrito(carrito: any): number {
  if (!carrito) return 0;
  const items = Array.isArray(carrito)
    ? carrito
    : Array.isArray(carrito.items)
    ? carrito.items
    : [];

  const subtotal = items.reduce((sum: number, item: any) => {
    const precio = Number(item?.price !== undefined ? item.price : item?.precio) || 0;
    const cantidad = Number(item?.cantidad) || 0;
    return sum + (precio * cantidad);
  }, 0);

  const envio = !Array.isArray(carrito) ? carrito?.envio : null;
  let costoEnvio = 0;
  if (envio && !envio.aConvenir && Number(envio.costo) > 0) {
    costoEnvio = Number(envio.costo);
  }

  return Math.round((subtotal + costoEnvio) * 100) / 100;
}

class OrderService {
  calcularTotalCarrito(carrito: any): number {
    return calcularTotalCarrito(carrito);
  }
  async getEstado(tel) {
    try {
      let doc = await Etiqueta.findOne({ telefono: tel });
      if (!doc) {
        doc = await Etiqueta.create({
          telefono: tel,
          paso: "inicio",
          carrito: {
            items: [],
            producto_actual: null,
            nombre: "",
            cedula: "",
            direccion: "",
            ubicacion: null,
            pago: null,
            pedido: null,
          },
        });
      }
      return doc;
    } catch (error) {
      if (error.code === 11000) {
        // Race condition: another request just created the document.
        return await Etiqueta.findOne({ telefono: tel });
      }
      throw error;
    }
  }

  async getModo(tel) {
    const doc = await this.getEstado(tel);
    return doc.modo || "automatico";
  }

  async setModo(tel, modo, io = null) {
    const doc = await this.setEstado(tel, { modo }, io);
    if (io) {
      io.emit("modo_actualizado", { telefono: tel, modo: doc.modo });
    }
    return doc;
  }

  async setEstado(tel, update, io = null) {
    let doc;
    try {
      doc = await Etiqueta.findOneAndUpdate({ telefono: tel }, update, {
        returnDocument: "after",
        upsert: true,
      });
    } catch (error) {
      if (error.code === 11000) {
        // Race condition en upsert, intentar de nuevo
        doc = await Etiqueta.findOneAndUpdate({ telefono: tel }, update, {
          returnDocument: "after",
          upsert: true,
        });
      } else {
        throw error;
      }
    }
    
    if (io && doc) {
      io.emit("estado_actualizado", {
        telefono: tel,
        paso: doc.paso,
        pasoLabel: doc.paso ? getPasoLabel(doc.paso) : null,
        etiqueta: doc.etiqueta,
      });
    }
    return doc;
  }

  async crearPedidoInicial(tel, carrito, io = null) {
    try {
      console.log(
        `[OrderService] Intentando crear pedido inicial para ${tel}...`,
      );

      const docEtiqueta = await Etiqueta.findOne({ telefono: tel }).lean();
      const ctwaClid = carrito?.ctwaClid || docEtiqueta?.ctwaClid || null;

      const pedidoInicial = {
        whatsappId: tel,
        items: Array.isArray(carrito?.items) ? carrito.items : [],
        cliente: {
          nombre: carrito?.nombre || "Sin nombre",
          cedula: carrito?.cedula || "Sin cédula",
          telefono: tel,
        },
        pago: {
          metodo: "Pendiente",
          montoUSD: 0,
          montoVES: 0,
          tasa: 0,
        },
        // Ubicación ya conocida (p. ej. elegida en la tienda, F2c); si no, se define más adelante en el chat
        ubicacion:
          typeof carrito?.ubicacion?.latitude === "number"
            ? {
                direccion: carrito.ubicacion.direccion || carrito.ubicacion.address || "Ubicación GPS",
                latitud: carrito.ubicacion.latitude,
                longitud: carrito.ubicacion.longitude,
              }
            : carrito?.direccion_manual
              ? { direccion: carrito.direccion_manual, latitud: null, longitud: null }
              : { direccion: "Pendiente de definir", latitud: null, longitud: null },
        ...(carrito?.envio ? { envio: carrito.envio } : {}),
        ...(carrito?.origenWeb?.codigo
          ? { origenWeb: { codigo: carrito.origenWeb.codigo } }
          : carrito?.codigoWeb
            ? { origenWeb: { codigo: carrito.codigoWeb } }
            : {}),
        ctwaClid: ctwaClid,
        estado: "pendiente_pago",
        timestamp: new Date(),
      };

      console.log(
        "[OrderService] Estructura pedido inicial:",
        JSON.stringify(pedidoInicial, null, 2),
      );

      // Usamos findOneAndUpdate con upsert para evitar duplicados en estado pendiente_pago
      const doc = await Pedido.findOneAndUpdate(
        { whatsappId: tel, estado: "pendiente_pago" },
        { $set: pedidoInicial },
        { upsert: true, returnDocument: "after", runValidators: false },
      );

      if (doc) {
        console.log(
          `✅ [OrderService] Pedido DB Creado/Actualizado: ${doc._id} para ${tel}`,
        );

        // Si el pedido proviene de un código de catálogo web, asociamos pedidoId en CarritoWeb (F2-2)
        if (doc.origenWeb?.codigo) {
          try {
            const CarritoWebModel =
              process.env.NODE_ENV === "test"
                ? require("./dbLocal").getCarritoWebModel()
                : require("../models/CarritoWeb");
            await CarritoWebModel.findOneAndUpdate(
              { codigo: doc.origenWeb.codigo },
              { $set: { pedidoId: doc._id } }
            );
          } catch (cwErr: any) {
            console.error("⚠️ Error vinculando pedidoId a CarritoWeb:", cwErr.message);
          }
        }

        // NOTIFICACIÓN AL PANEL
        if (io) {
          console.log(
            `[OrderService] Emitiendo 'pago_enviado_cliente' para ${tel}`,
          );
          io.emit("pago_enviado_cliente", doc);
        }
      } else {
        console.error(
          "[OrderService] Error: findOneAndUpdate no devolvió un documento.",
        );
      }

      return doc;
    } catch (error) {
      console.error("❌ ERROR CRÍTICO EN crearPedidoInicial:", error.message);
      console.error(error.stack);
      throw error;
    }
  }

  async actualizarPedido(tel, update) {
    try {
      const doc = await Pedido.findOneAndUpdate(
        { whatsappId: tel, estado: "pendiente_pago" },
        update,
        { returnDocument: "after", runValidators: true },
      );

      if (!doc) {
        console.warn(
          `⚠️ Intento de actualizar pedido inexistente para ${tel} (Estado: pendiente_pago)`,
        );
      } else {
        console.log(
          `✅ Pedido actualizado para ${tel}. Campos: ${Object.keys(update).join(", ")}`,
        );
      }

      return doc;
    } catch (error) {
      console.error(
        `❌ ERROR CRÍTICO AL ACTUALIZAR PEDIDO (${tel}):`,
        error.message,
      );
      if (error.errors) {
        console.error(
          "🔍 Detalles de validación:",
          Object.keys(error.errors)
            .map((key) => `${key}: ${error.errors[key].message}`)
            .join(", "),
        );
      }
      throw error;
    }
  }

  async cancelarPedidoActivo(tel, io = null) {
    try {
      const doc = await Pedido.findOneAndUpdate(
        {
          whatsappId: tel,
          estado: { $nin: ["entregado", "cancelado", "anulado"] },
        },
        { estado: "cancelado" },
        { returnDocument: "after" },
      );
      if (doc) {
        console.log(
          `🚫 [OrderService] Pedido ${doc.idFormateado || doc._id} cancelado por cliente (${tel})`,
        );
        if (io) io.emit("order_status_changed", doc);
      }
      return doc;
    } catch (error) {
      console.error(
        `❌ Error al cancelar pedido activo para ${tel}:`,
        error.message,
      );
      return null;
    }
  }

  async guardarMsg(
    tel,
    txt,
    dir,
    tipo = "texto",
    mediaId = null,
    wamid = null,
    status = null,
    mimeType = null,
    mediaUrl = null,
    fileName = null,
    caption = null,
    replyToMid = null,
    replyToText = null,
  ) {
    if (!txt && !mediaId && !mediaUrl) return null;

    const msgStatus = status || (dir === "bot" ? "sent" : null);
    const updateData = {
      telefono: tel,
      texto: txt || "",
      direccion: dir,
      timestamp: new Date(),
      tipo,
      mediaId,
      mediaUrl: mediaUrl || null,
      fileName: fileName || null,
      caption: caption || null,
      mimeType: mimeType || null,
      replyToMid: replyToMid || null,
      replyToText: replyToText || null,
    };

    if (wamid) {
      const doc = await Mensaje.findOneAndUpdate(
        { wamid },
        { 
          $set: updateData,
          $setOnInsert: { status: msgStatus, wamid: wamid }
        },
        { upsert: true, returnDocument: "after" }
      );
      return doc;
    } else {
      const doc = await Mensaje.create({ ...updateData, status: msgStatus });
      return doc;
    }
  }

  /**
   * Incrementa el contador de mensajes no leídos del canal WhatsApp
   * (`Etiqueta.unreadCount`) — prerrequisito bloqueante §9.1 del contrato del
   * Inbox Unificado. No bloqueante: nunca interrumpe la persistencia del mensaje.
   */
  async incrementarNoLeidos(tel, cantidad = 1) {
    try {
      await Etiqueta.findOneAndUpdate(
        { telefono: tel },
        { $inc: { unreadCount: cantidad } },
        { upsert: true },
      );
    } catch (error) {
      if (error && error.code === 11000) return; // carrera de upsert: otro proceso creó el doc
      console.error(`⚠️ Error incrementando no leídos de ${tel}:`, error.message);
    }
  }

  /**
   * Centraliza la persistencia y la notificación en tiempo real de mensajes.
   */
  async emitirYGuardar(
    tel,
    txt,
    dir,
    io,
    tipo = "texto",
    mediaId = null,
    wamid = null,
    status = null,
    mimeType = null,
    mediaUrl = null,
    fileName = null,
    caption = null,
    replyToMid = null,
    replyToText = null,
  ) {
    try {
      const msgStatus = status || (dir === "bot" ? "sent" : null);
      const doc = await this.guardarMsg(
        tel,
        txt,
        dir,
        tipo,
        mediaId,
        wamid,
        msgStatus,
        mimeType,
        mediaUrl,
        fileName,
        caption,
        replyToMid,
        replyToText,
      );

      const data = {
        _id: doc?._id,
        from: tel,
        text: txt,
        caption: caption || doc?.caption || null,
        fileName: fileName || doc?.fileName || null,
        mediaUrl: mediaUrl || doc?.mediaUrl || null,
        timestamp: Date.now(),
        direction: dir,
        tipo,
        mediaId,
        mimeType: mimeType || doc?.mimeType || null,
        wamid: wamid || null,
        replyToMid: replyToMid || doc?.replyToMid || null,
        replyToText: replyToText || doc?.replyToText || null,
        status: doc?.status || msgStatus,
      };

      // 2. Emisión vía Socket.io para actualización inmediata del Panel
      if (io) {
        io.emit("nuevo_mensaje", data);
      }

      // 3. INBOX UNIFICADO (Fase 2A, contrato §9.1 y §6.4):
      //    - Los mensajes ENTRANTES incrementan el contador de no leídos del
      //      canal WhatsApp (antes sólo existía en Instagram).
      //    - Se publica el evento de invalidación `inbox_actualizado` desde el
      //      ÚNICO punto de emisión (services/inboxService).
      if (dir === "cliente") {
        await this.incrementarNoLeidos(tel);
      }
      if (io) {
        try {
          const inboxService = require("./inboxService"); // lazy: evita ciclos
          inboxService.emitirInboxActualizado(io, "whatsapp", tel, "mensaje_nuevo");
        } catch (inboxErr) {
          console.error("⚠️ Error emitiendo inbox_actualizado:", inboxErr.message);
        }
      }

      return data;
    } catch (error) {
      console.error(`⚠️ Error en emitirYGuardar para ${tel}:`, error.message);
      // No relanzamos para no bloquear el flujo principal de la orden
    }
  }

  /**
   * Actualiza el estado de entrega (sent, delivered, read, failed) vía webhooks de Meta.
   */
  async actualizarEstadoMensaje(wamid, status, errors = null, io = null) {
    try {
      if (!wamid) return;
      const errorMsg =
        errors && errors.length > 0
          ? errors[0].message || JSON.stringify(errors[0])
          : null;

      if (status === "failed") {
        console.warn(`⚠️ [WhatsApp] Mensaje ${wamid} falló: ${errorMsg || "sin detalle"}`);
        try {
          await require("./whatsapp").reintentarAdminFallidoPorPlantilla(wamid, errors);
        } catch (e) {
          console.error("⚠️ Error en reintento por plantilla:", e.message);
        }
      }

      const updateData: Record<string, any> = { status };
      if (errorMsg) updateData.error = errorMsg;

      const doc = await Mensaje.findOneAndUpdate(
        { wamid },
        { 
          $set: updateData,
          $setOnInsert: { wamid }
        },
        { upsert: true, returnDocument: "after" }
      );

      if (doc && io) {
        io.emit("mensaje_status_actualizado", {
          _id: doc._id,
          wamid: doc.wamid,
          telefono: doc.telefono,
          status: doc.status,
          error: doc.error,
        });
      }
    } catch (err) {
      console.error(
        `❌ Error actualizando status de mensaje ${wamid}:`,
        err.message,
      );
    }
  }

  async getNextOrderNumber() {
    // 1. Intentar reutilizar atómicamente un correlativo liberado previamente (menor disponible)
    const reused = await Counter.findOneAndUpdate(
      { _id: "pedidoId", "available_seqs.0": { $exists: true } },
      { $pop: { available_seqs: -1 } },
      { returnDocument: "before" },
    );

    if (
      reused &&
      Array.isArray(reused.available_seqs) &&
      reused.available_seqs.length > 0 &&
      reused.available_seqs[0] !== undefined &&
      reused.available_seqs[0] !== null
    ) {
      return `#${String(reused.available_seqs[0]).padStart(3, "0")}`;
    }

    // 2. Si no hay correlativos liberados, incrementar el contador global habitual
    const contador = await Counter.findOneAndUpdate(
      { _id: "pedidoId" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    return `#${String(contador.seq || 0).padStart(3, "0")}`;
  }

  async finalizarPedidoConComprobante(
    from,
    carrito,
    mediaId,
    permanentUrl,
    io,
  ) {
    try {
      console.log(`[OrderService] Finalizando pedido para ${from}...`);

      // 1. INTENTO DE BLOQUEO RESILIENTE: Buscamos el pedido más reciente que NO esté finalizado
      // Esto previene fallos si el estado ya era 'pendiente_verificacion' por un doble envío
      const pedidoReclamado = await Pedido.findOneAndUpdate(
        {
          whatsappId: from,
          estado: { $nin: ["entregado", "cancelado", "anulado"] },
        },
        { estado: "pendiente_verificacion" },
        { returnDocument: "after", sort: { timestamp: -1 } },
      );

      if (!pedidoReclamado) {
        console.warn(
          `[OrderService] Abortando finalización: No se encontró ningún pedido activo para ${from}.`,
        );
        return null;
      }

      console.log(
        `[OrderService] Pedido reclamado (${pedidoReclamado.estado}): ${pedidoReclamado._id}`,
      );

      // 2. Obtener ID correlativo atómico (solo si no tiene uno ya)
      let idFormateado =
        pedidoReclamado.idFormateado || pedidoReclamado.correlativo;
      if (!idFormateado) {
        idFormateado = await this.getNextOrderNumber();
      }

      // 3. Calcular totales del carrito de la sesión usando helper unificado
      const envioInfo = carrito.envio || pedidoReclamado.envio;
      const carritoCalculo = {
        ...carrito,
        envio: envioInfo,
      };
      const totalUSD =
        Array.isArray(carrito.items) && carrito.items.length > 0
          ? calcularTotalCarrito(carritoCalculo)
          : pedidoReclamado.pago?.montoUSD || 0;

      // Recuperar tasa actual de forma segura
      const tasaRes = await obtenerTasaUSD();
      const tasa =
        tasaRes?.tasa ||
        (typeof tasaRes === "number"
          ? tasaRes
          : pedidoReclamado.pago?.tasa || 0);
      const totalVES = Math.round(totalUSD * tasa * 100) / 100;

      // 3b. Resolver nombre legible del método de pago
      let nombreMetodoPago = carrito.pagoNombre || null;
      if (!nombreMetodoPago) {
        const metodoPagoId = carrito.pago || pedidoReclamado.pago?.metodo;
        const mongoose = require("mongoose");
        if (metodoPagoId && mongoose.Types.ObjectId.isValid(metodoPagoId)) {
          try {
            const metodoDB = await MetodoPago.findById(metodoPagoId).lean();
            nombreMetodoPago =
              metodoDB?.nombre || metodoDB?.tipo || metodoPagoId;
          } catch (_) {
            nombreMetodoPago = metodoPagoId;
          }
        } else {
          nombreMetodoPago = metodoPagoId || "No especificado";
        }
      }

      const datosFinales = {
        idFormateado: idFormateado,
        correlativo: idFormateado,
        ctwaClid: carrito?.ctwaClid || pedidoReclamado.ctwaClid || null,
        cliente: {
          nombre:
            carrito.nombre || pedidoReclamado.cliente?.nombre || "Sin nombre",
          cedula:
            carrito.cedula || pedidoReclamado.cliente?.cedula || "Sin cédula",
          telefono:
            from ||
            pedidoReclamado.cliente?.telefono ||
            pedidoReclamado.whatsappId,
        },
        items:
          Array.isArray(carrito.items) && carrito.items.length > 0
            ? carrito.items
            : pedidoReclamado.items,
        ...(envioInfo ? { envio: envioInfo } : {}),
        ubicacion: {
          direccion:
            carrito.direccion_manual ||
            carrito.ubicacion?.address ||
            pedidoReclamado.ubicacion?.direccion ||
            "Retiro por tienda",
          latitud:
            carrito.ubicacion?.latitude ||
            pedidoReclamado.ubicacion?.latitud ||
            null,
          longitud:
            carrito.ubicacion?.longitude ||
            pedidoReclamado.ubicacion?.longitud ||
            null,
        },
        pago: {
          metodo: nombreMetodoPago,
          montoUSD: totalUSD,
          montoVES: totalVES,
          tasa: tasa,
          comprobanteMediaId: mediaId,
          comprobanteUrl: permanentUrl || pedidoReclamado.pago?.comprobanteUrl,
          pagoCon: carrito.pagoCon || pedidoReclamado.pago?.pagoCon || 0,
          vuelto: carrito.vuelto || pedidoReclamado.pago?.vuelto || 0,
          pagoEfectivo:
            carrito.pagoEfectivo || pedidoReclamado.pago?.pagoEfectivo || 0,
          pagoDigitalVES:
            carrito.pagoDigitalVES || pedidoReclamado.pago?.pagoDigitalVES || 0,
        },
        timestamp: pedidoReclamado.timestamp || new Date(),
      };

      // 4. PERSISTENCIA FINAL
      let doc;
      try {
        doc = await Pedido.findByIdAndUpdate(
          pedidoReclamado._id,
          { $set: datosFinales },
          { returnDocument: "after", runValidators: true },
        );
        console.log(
          `✅ [DB] Pedido finalizado exitosamente: ${idFormateado} (${from})`,
        );
      } catch (updateError) {
        // El pedido ya fue reclamado (estado = pendiente_verificacion) pero falló la actualización de datos.
        // Retornamos el documento original para que el cliente sea informado correctamente
        // y el admin reciba la notificación. El admin podrá ver el pedido en el panel.
        console.error(
          "⚠️ [OrderService] Error al actualizar datos del pedido, pero ya fue reclamado:",
          updateError.message,
        );
        if (updateError.errors) {
          console.error(
            "🔍 Fallos de validación:",
            Object.keys(updateError.errors)
              .map((key) => `${key}: ${updateError.errors[key].message}`)
              .join(", "),
          );
        }
        doc = pedidoReclamado; // Usar el doc original del findOneAndUpdate
      }

      // 3.5. NOTIFICAR AL ADMIN (Mini Comanda + Comprobante)
      try {
        const adminPhones = [
          getConfig("ADMIN_PHONE_NUMBER"),
          getConfig("ADMIN_PHONE_NUMBER_2"),
        ].filter(Boolean);

        const rawDir =
          doc.ubicacion?.direccion ||
          (doc.ubicacion?.latitud ? "Ubicación GPS" : "Retiro por tienda");
        let cleanDir =
          rawDir.split("\nMapa:")[0].replace(/Mapa:.*$/m, "").trim() ||
          (doc.ubicacion?.latitud ? "Ubicación GPS" : "Retiro por tienda");

        let ubicacionTexto =
          doc.ubicacion?.latitud && doc.ubicacion?.longitud
            ? `${cleanDir}\n*Mapa:* https://www.google.com/maps?q=${doc.ubicacion.latitud},${doc.ubicacion.longitud}`
            : cleanDir;
        
        if (doc.notas) {
          ubicacionTexto += `\n*Notas:* ${doc.notas}`;
        }
        const nombreCliente = doc.cliente?.nombre || carrito.nombre || "Cliente";
        const totalPagadoUsd = doc.pago?.montoUSD || totalUSD;
        
        let envioTexto = "";
        if (doc.envio?.nombre) {
          envioTexto = `\n*Envío:* ${nombreEnvio(doc.envio)}${detalleCostoEnvio(doc.envio)}`;
        }

        const miniComandaText = `🧾 *NUEVO PAGO RECIBIDO*\n\n` +
          `*Pedido:* ${idFormateado}\n` +
          `*Cliente:* ${nombreCliente}\n` +
          `*Total:* $${totalPagadoUsd}\n` +
          `*Dirección:* ${ubicacionTexto}${envioTexto}\n\n` +
          `_Revisa el comprobante para verificar._`;

        const whatsappAPI = require("./whatsapp");

        for (const phone of adminPhones) {
          // Intentar enviar la imagen si hay mediaId o URL
          if (mediaId) {
            await whatsappAPI.enviarImagenPorMediaId(phone, mediaId).catch(() => {});
          } else if (permanentUrl) {
            await whatsappAPI.enviarImagenPorUrl(phone, permanentUrl, miniComandaText).catch(() => {});
          }
          
          // Enviar texto estructurado con fallback de seguridad (1 solo parámetro para compatibilidad con plantilla)
          await whatsappAPI.notificarAdminConFallback(
            phone,
            miniComandaText,
            "order_notification",
            [
              { type: "text", text: miniComandaText.substring(0, 1000).replace(/\n/g, " ") },
            ]
          ).catch((e) => console.error("Error enviando mini comanda fallback:", e.message));

          // Enviar ubicación nativa de WhatsApp si el cliente compartió coordenadas
          if (doc.ubicacion?.latitud && doc.ubicacion?.longitud) {
            await whatsappAPI.enviarUbicacion(
              phone,
              doc.ubicacion.latitud,
              doc.ubicacion.longitud,
              "Ubicación del Cliente",
              cleanDir,
            ).catch((e) => console.error("Error enviando ubicación nativa al admin:", e.message));
          }
        }
      } catch (adminNotifError) {
        console.error("⚠️ Error enviando mini comanda al admin:", adminNotifError.message);
      }

      // 4. TIEMPO REAL: Notificar al Dashboard/Kanban
      if (io) {
        io.emit("pago_enviado_cliente", doc);
        io.emit("pedido_actualizado", {
          _id: doc._id,
          estado: "pendiente_verificacion",
        });
      }

      // 5. DESCONTAR STOCK de productos con trackStock activo
      try {
        const items = doc.items || [];
        for (const item of items) {
          const prodName = item.producto || item.name || "";
          const cantidad = item.cantidad || 1;
          if (prodName && cantidad > 0) {
            const result = await Producto.findOneAndUpdate(
              { name: prodName, trackStock: true, stock: { $gte: cantidad } },
              { $inc: { stock: -cantidad } },
            );
            if (result) {
              console.log(
                `📦 Stock descontado: "${prodName}" -${cantidad} (${result.stock - cantidad} restantes)`,
              );
            }
          }
        }
      } catch (stockError) {
        console.error("⚠️ Error descontando stock:", stockError.message);
        // No bloqueamos el flujo por error de stock
      }

      return doc;
    } catch (error) {
      console.error(
        "🚨 ERROR REAL DE MONGO AL FINALIZAR PEDIDO:",
        error.message,
      );
      if (error.errors) {
        console.error(
          "🔍 Fallos de validación:",
          Object.keys(error.errors)
            .map((key) => `${key}: ${error.errors[key].message}`)
            .join(", "),
        );
      }
      throw error;
    }
  }

  async generarInstruccionesPago(to, carrito) {
    const { items, pago } = carrito;
    if (!items?.length) return null;

    let totalUSD = calcularTotalCarrito(carrito);
    let tasaRes = await obtenerTasaUSD();
    let tasa = tasaRes?.tasa || (typeof tasaRes === "number" ? tasaRes : null);
    let totalVES = tasa ? Math.round(totalUSD * tasa * 100) / 100 : null;

    // Buscar el método en la DB
    const mongoose = require("mongoose");
    let metodo = null;
    if (mongoose.Types.ObjectId.isValid(pago)) {
      metodo = await MetodoPago.findById(pago);
    } else {
      metodo = await MetodoPago.findOne({ tipo: pago, activo: true });
    }

    let msgCliente = "";
    if (metodo) {
      let instrucciones = "";
      if (metodo.detalles?.instruccionesDePago) {
        instrucciones = metodo.detalles.instruccionesDePago;
      } else {
        // Formateo dinámico basado en tipo
        const d = metodo.detalles || {};
        switch (metodo.tipo) {
          case "pago_movil":
            instrucciones = `📱 *Pago Móvil*\n🏦 Banco: ${d.banco || "N/A"}\n👤 CI: ${d.cedula || "N/A"}\n📞 Telf: ${d.telefono || "N/A"}`;
            break;
          case "transferencia":
            instrucciones = `🏦 *Transferencia*\n🏦 Banco: ${d.banco || "N/A"}\n👤 Titular: ${d.titular || "N/A"}\n🆔 Cuenta: ${d.numeroCuenta || "N/A"}\n📄 Tipo: ${d.tipoCuenta || "Corriente"}`;
            break;
          case "zelle":
            instrucciones = `💵 *Zelle*\n📧 Email: ${d.email || "N/A"}\n👤 Titular: ${d.titular || "N/A"}`;
            break;
          case "binance":
            instrucciones = `🔶 *Binance Pay*\n🆔 Binance ID: ${d.binanceId || "N/A"}\n📧 Email: ${d.email || "N/A"}`;
            break;
          case "efectivo":
            instrucciones = `💵 *Efectivo*\n${metodo.notaAdicional || "Favor tener el monto exacto."}`;
            break;
          default:
            instrucciones =
              metodo.notaAdicional || "Siga las instrucciones del asesor.";
        }
      }

      msgCliente =
        configManager.format("settings.messages.paymentInstructionsHeader", {
          metodo: metodo.nombre,
        }) + `\n\n${instrucciones}\n\n🛒 Total: $${formatUsd(totalUSD)} USD`;
    } else {
      msgCliente = `🔗 Pago: $${formatUsd(totalUSD)} USD`;
    }

    if (totalVES) msgCliente += ` (Bs. ${formatBs(totalVES)})`;
    msgCliente += `\n\n✅ Cuando pagues, envía una *captura* a este chat para procesar tu pedido.`;

    // Actualizamos el pedido en la base de datos con los totales
    await this.actualizarPedido(to, {
      "pago.metodo": metodo?.nombre || pago,
      "pago.montoUSD": totalUSD,
      "pago.montoVES": totalVES,
      "pago.tasa": tasa,
    });

    return msgCliente;
  }
}

const orderServiceInstance = new OrderService();
(orderServiceInstance as any).calcularTotalCarrito = calcularTotalCarrito;

module.exports = orderServiceInstance;
(module.exports as any).calcularTotalCarrito = calcularTotalCarrito;
