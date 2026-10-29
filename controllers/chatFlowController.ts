const ProductoOriginal = require("../models/Producto");
const PedidoOriginal = require("../models/Pedido");
const EtiquetaOriginal = require("../models/Etiqueta");
const MetodoPagoOriginal = require("../models/MetodoPago");
const MetodoEnvioOriginal = require("../models/MetodoEnvio");
const CategoriaOriginal = require("../models/Categoria");

let Producto = ProductoOriginal;
let Pedido = PedidoOriginal;
let Etiqueta = EtiquetaOriginal;
let MetodoPago = MetodoPagoOriginal;
let MetodoEnvio = MetodoEnvioOriginal;
let Categoria = CategoriaOriginal;

// Soporte para Pruebas de Integración (Mock)
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("../services/dbLocal");
  Producto = dbLocal.getProductoModel();
  Pedido = dbLocal.getPedidoModel();
  Etiqueta = dbLocal.getEtiquetaModel();
  MetodoPago = dbLocal.getMetodoPagoModel();
  if (typeof dbLocal.getMetodoEnvioModel === "function") {
    MetodoEnvio = dbLocal.getMetodoEnvioModel();
  }
  if (typeof dbLocal.getCategoriaModel === "function") {
    Categoria = dbLocal.getCategoriaModel();
  }
}

const configManager = require("../services/configManager");
const { nombreEnvio, detalleCostoEnvio } = require("../services/envioTexto");
const orderService = require("../services/orderService");
const whatsappService = require("../services/whatsapp");
const { obtenerTasaUSD } = require("../services/bcv");
const { formatBs, formatUsd, getCaracasTime } = require("../utils/helpers");
const { filtroPorCategoria } = require("../services/catalogQuery");
const {
  formatearHorarioAtencion,
  getProximoDiaHabil,
  getHoraAperturaFormateada,
} = require("../services/horarioService");
const { getFlujoNoLaborableSync } = require("../services/flujoNoLaborableService");

/**
 * Orquestador de las interfaces de conversación (Vistas de WhatsApp)
 * UI Refactored for Dynamic Categories and Meta Character Limits
 */
class ChatFlowController {
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
    replyToText = null
  ) {
    return await orderService.emitirYGuardar(
      tel,
      txt,
      dir,
      io,
      tipo,
      mediaId,
      wamid,
      status,
      mimeType,
      mediaUrl,
      fileName,
      caption,
      replyToMid,
      replyToText
    );
  }

  /**
   * Centraliza el envío de mensajes por WhatsApp del bot y su registro en el Inbox.
   * Envía (texto, botones o lista), captura el wamid si Meta lo devuelve y asigna status: "sent",
   * o si WhatsApp devuelve false / falla, asigna status: "failed" y registra una advertencia ⚠️.
   * No lanza error si el envío falla para no interrumpir el flujo del usuario.
   */
  async enviarYRegistrar(
    to: string,
    opciones: {
      tipo?: "texto" | "botones" | "lista" | "imagen";
      texto: string;
      textoGuardar?: string;
      buttons?: Array<{ id: string; title: string }>;
      buttonText?: string;
      sections?: any[];
      headerText?: string | null;
      footerText?: string | null;
      replyToMid?: string | null;
      mediaUrl?: string | null;
      caption?: string | null;
    },
    io: any
  ) {
    const tipo = opciones.tipo || "texto";
    const texto = opciones.texto;
    const textoGuardar = opciones.textoGuardar || texto;
    let resultadoEnvio: any = false;

    try {
      if (tipo === "botones" && Array.isArray(opciones.buttons) && opciones.buttons.length > 0) {
        resultadoEnvio = await whatsappService.enviarBotones(to, texto, opciones.buttons);
      } else if (tipo === "lista" && Array.isArray(opciones.sections) && opciones.sections.length > 0) {
        resultadoEnvio = await whatsappService.enviarLista(
          to,
          texto,
          opciones.buttonText || "Ver Opciones",
          opciones.sections,
          opciones.headerText || null,
          opciones.footerText || null
        );
      } else if (tipo === "imagen" && opciones.mediaUrl) {
        resultadoEnvio = await whatsappService.enviarImagenPorUrl(
          to,
          opciones.mediaUrl,
          opciones.caption || texto,
          null,
          opciones.replyToMid || null
        );
      } else {
        resultadoEnvio = await whatsappService.enviarTexto(to, texto, null, opciones.replyToMid || null);
      }
    } catch (err: any) {
      console.warn(`⚠️ [WhatsApp] Excepción enviando ${tipo} a ${to}:`, err?.message || err);
      resultadoEnvio = false;
    }

    const exito = Boolean(resultadoEnvio);
    const wamid = typeof resultadoEnvio === "string" ? resultadoEnvio : null;
    const status = exito ? "sent" : "failed";

    if (!exito) {
      console.warn(`⚠️ [WhatsApp] Falló el envío de ${tipo} a ${to}. Registrando como fallido.`);
    }

    await this.emitirYGuardar(
      to,
      textoGuardar,
      "bot",
      io,
      tipo === "imagen" ? "image" : "texto",
      null,
      wamid,
      status,
      null,
      opciones.mediaUrl || null,
      null,
      opciones.caption || null,
      opciones.replyToMid || null
    );

    return resultadoEnvio;
  }

  async enviarMenu(to, io) {
    const now = new Date();
    // Ajuste a hora de Caracas (UTC-4)
    const caracasHour = (now.getUTCHours() - 4 + 24) % 24;

    let timeGreeting = "¡Hola! 👋";
    if (caracasHour >= 5 && caracasHour < 12) timeGreeting = "¡Buenos días! ☀️";
    else if (caracasHour >= 12 && caracasHour < 18)
      timeGreeting = "¡Buenas tardes! 👋";
    else if (caracasHour >= 18 || caracasHour < 5)
      timeGreeting = "¡Buenas noches! 🌙";

    const brandName = configManager.get("settings.brandName");
    const botIdentity = configManager.get("settings.botIdentity") || "Asistente virtual";
    const businessDescription = configManager.get("settings.businessDescription") || "";

    const welcomeMsg = configManager.format("settings.messages.welcomeDetailed", {
      saludo: timeGreeting,
      brandName,
      botIdentity,
      businessDescription,
    }) || `${timeGreeting}\nBienvenido a *${brandName}* (asistente *${botIdentity}*).`;

    await this.enviarYRegistrar(to, { tipo: "texto", texto: welcomeMsg }, io);

    // Enviar directamente el menú de categorías para acortar el flujo
    return await this.mostrarCategorias(to, io);
  }

  /**
   * Muestra el submenú de categorías antes de los productos.
   * Realiza consulta directa a MongoDB para evitar problemas de caché.
   */
  async mostrarCategorias(to, io, padreId = null) {
    try {
      // Consulta fresca a DB excluyendo la categoría 'general' en la raíz
      const query: Record<string, any> = { padre: padreId };
      if (!padreId) query.slug = { $ne: "general" };

      const categorias = await Categoria.find(query).sort({ nombre: 1 });

      if (!categorias || categorias.length === 0) {
        if (padreId) {
          // Si no tiene subcategorías, mostramos productos de esa categoría
          return await this.mostrarProductos(to, io, null, padreId);
        }
        const noMenuMsg =
          "⚠️ Lo sentimos, el menú no está disponible en este momento.";
        await this.enviarYRegistrar(to, { tipo: "texto", texto: noMenuMsg }, io);
        return false;
      }

      const sections = [
        {
          title: "Variedades Disponibles",
          rows: categorias.slice(0, 10).map((c) => ({
            id: `category_${c.slug}`,
            title: c.nombre.substring(0, 24),
            description: `Explorar ${c.nombre}`.substring(0, 72),
          })),
        },
      ];

      const categoryEmoji = configManager.get("settings.categoryEmoji") || "🥢";
      const headerText = padreId ? "Subcategorías" : `${categoryEmoji} Nuestro Menú`;
      const footerText = configManager.get("settings.messages.menuFooter") || configManager.get("settings.brandName") || "Menú";
      const bodyText =
        "Selecciona una de las opciones de la lista para ver los detalles:";

      const enviado = await this.enviarYRegistrar(
        to,
        {
          tipo: "lista",
          texto: bodyText,
          buttonText: "Ver Opciones 📂",
          sections,
          headerText,
          footerText,
        },
        io
      );
      return enviado;
    } catch (error) {
      console.error(`❌ Error en mostrarCategorias para ${to}:`, error.message);
      const errMsg = "⚠️ Hubo un error al cargar el menú.";
      await this.enviarYRegistrar(to, { tipo: "texto", texto: errMsg }, io);
      return false;
    }
  }

  /**
   * Genera el catálogo de productos filtrado por categoría.
   * Realiza consulta directa a MongoDB.
   */
  async mostrarProductos(to, io, categoriaSlug = null, categoryId = null) {
    try {
      let catDoc = null;

      if (categoryId) {
        catDoc = await Categoria.findById(categoryId);
      } else if (categoriaSlug) {
        catDoc = await Categoria.findOne({ slug: categoriaSlug });
      }

      const conditions: any[] = [
        { activo: true },
        { $or: [{ trackStock: { $ne: true } }, { stock: { $gt: 0 } }] },
      ];
      if (catDoc) {
        conditions.push(filtroPorCategoria(catDoc._id));
      }
      const filter = { $and: conditions };

      // Consulta fresca a DB
      const products = await Producto.find(filter)
        .populate("categoria")
        .sort({ name: 1 })
        .limit(10);

      if (!products || products.length === 0) {
        const noProdMsg =
          "⚠️ No hay productos disponibles en esta sección actualmente.";
        await this.enviarYRegistrar(to, { tipo: "texto", texto: noProdMsg }, io);
        return false;
      }

      const tasaRes = await obtenerTasaUSD();
      const tasa = tasaRes?.tasa || 0;

      const sanitizeTitle = (name) => (name || "Producto").substring(0, 24);
      const formatDescription = (p, tasa) => {
        const descShort = (p.description || "").substring(0, 30);
        const priceUSD = p.price || 0;
        const priceVESRaw = priceUSD * tasa;
        const priceVES = priceVESRaw > 0 ? formatBs(priceVESRaw) : "N/A";
        return `${descShort} | $${formatUsd(priceUSD)} / Bs. ${priceVES}`.substring(
          0,
          72,
        );
      };

      const brandName = configManager.get("settings.brandName");
      const brandEmoji = configManager.get("settings.brandEmoji") || "📦";
      const sections = [
        {
          title: catDoc?.nombre || (brandName ? `Catálogo ${brandName}` : "Nuestros Productos"),
          rows: products.slice(0, 10).map((p) => ({
            id: p.id || "unknown",
            title: sanitizeTitle(p.name),
            description: formatDescription(p, tasa),
          })),
        },
      ];

      const bodyText = `Explora nuestra selección de *${catDoc?.nombre || "especialidades"}*. \n\n Recuerda que procesamos pedidos de un día para otro:`;
      const listTitle = catDoc ? `Menú: ${catDoc.nombre}` : (configManager.format("settings.messages.menuTitle", { brandName }) || `Menú ${brandName}`);

      const enviado = await this.enviarYRegistrar(
        to,
        {
          tipo: "lista",
          texto: bodyText,
          textoGuardar: `Catálogo de ${catDoc?.nombre || "productos"} enviado`,
          buttonText: `Seleccionar ${brandEmoji}`,
          sections,
          headerText: listTitle,
          footerText: "📍 Entregas en Caracas",
        },
        io
      );
      return enviado;
    } catch (error) {
      console.error(`❌ Error en mostrarProductos para ${to}:`, error.message);
      const errProdMsg = "⚠️ Hubo un error al cargar los productos.";
      await this.enviarYRegistrar(to, { tipo: "texto", texto: errProdMsg }, io);
      return false;
    }
  }

  async mostrarPreguntarMas(to, io) {
    const msg = "¿Deseas agregar algo más a tu pedido o prefieres finalizar?";
    const sections = [
      {
        title: "Opciones de Pedido",
        rows: [
          { id: "completar", title: "✅ Completar Pedido" },
          { id: "productos", title: "➕ Agregar más" },
          { id: "vaciar", title: "🗑️ Vaciar Carrito" },
        ],
      },
    ];
    return await this.enviarYRegistrar(
      to,
      {
        tipo: "lista",
        texto: msg,
        buttonText: "Elegir Opción",
        sections,
      },
      io
    );
  }

  async solicitarNombre(to, io) {
    const msg =
      configManager.get("settings.messages.promptPersonalData") ||
      "📝 Por favor, indícanos tu *Nombre, Apellido y Cédula* para registrar tu pedido (máx. 40 caracteres para el nombre):\n\n_Ejemplo: Juan Pérez 12345678_\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._";
    return await this.enviarYRegistrar(to, { tipo: "texto", texto: msg }, io);
  }

  async solicitarCedula(to, io) {
    const msg =
      "🆔 Ahora, por favor introduce tu *Cédula de Identidad o RIF*, indicando la letra si no es venezolano o es empresa (ej: 12345678, V-12345678, E-12345678 o J-123456789):\n\n💡 _Si deseas reiniciar tu pedido, escribe *CANCELAR*._";
    return await this.enviarYRegistrar(to, { tipo: "texto", texto: msg }, io);
  }

  async solicitarMetodoEnvio(to, metodos, io) {
    try {
      const prompt =
        "🚚 *Método de Entrega*\n\n" +
        "Por favor, selecciona cómo deseas recibir tu compra:\n\n" +
        "💡 _Si deseas cancelar o empezar desde cero, escribe *CANCELAR*._";

      const sections = [
        {
          title: "Opciones de Entrega",
          rows: metodos.map((m) => {
            const costoDesc =
              m.costoTipo === "a_convenir"
                ? "Costo a convenir"
                : `$${formatUsd(m.costo || 0)}`;
            const desc = m.descripcion
              ? `${m.descripcion} (${costoDesc})`
              : costoDesc;
            return {
              id: `envio_${m._id}`,
              title: m.nombre.substring(0, 24),
              description: desc.substring(0, 72),
            };
          }),
        },
      ];

      const enviado = await this.enviarYRegistrar(
        to,
        {
          tipo: "lista",
          texto: prompt,
          textoGuardar: "Opciones de entrega enviadas",
          buttonText: "Ver opciones",
          sections,
        },
        io
      );
      return enviado;
    } catch (error) {
      console.error(`❌ Error en solicitarMetodoEnvio para ${to}:`, error.message);
      return false;
    }
  }

  async solicitarUbicacion(to, io) {
    const msg =
      "📍 ¡Excelente!\n\n ▪ Por favor comparte tu dirección actual *(GPS)*.\n\n ▪ O envía tu dirección escrita.\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._";
    return await this.enviarYRegistrar(to, { tipo: "texto", texto: msg }, io);
  }

  async solicitarNotas(to, io) {
    const msg =
      "📝 ¿Deseas agregar alguna nota adicional para el repartidor? (Ej: Código de acceso, dejar en garita).\n\n💡 Si no tienes ninguna, escribe *NINGUNA* (o escribe *CANCELAR* para empezar de nuevo).";
    return await this.enviarYRegistrar(to, { tipo: "texto", texto: msg }, io);
  }

  async solicitarMetodoPago(to, io) {
    try {
      const msg =
        configManager.get("settings.messages.promptPayment") ||
        "💳 ¿Cómo deseas realizar el pago?\n\n💡 _Si deseas empezar de nuevo, escribe *CANCELAR*._";

      const paymentMethods = await MetodoPago.find({ activo: true }).sort({
        nombre: 1,
      });

      if (!paymentMethods || paymentMethods.length === 0) {
        console.error(
          "❌ [ChatFlowController] Error: No se encontraron métodos de pago activos en la DB.",
        );
        const noPayMsg =
          "⚠️ Lo sentimos, no hay métodos de pago disponibles en este momento. Por favor, intenta más tarde.";
        await this.enviarYRegistrar(to, { tipo: "texto", texto: noPayMsg }, io);
        return false;
      }

      const sections = [
        {
          title: "Métodos de Pago",
          rows: paymentMethods.map((m) => ({
            id: m.tipo === "efectivo" ? "efectivo" : m._id.toString(),
            title: m.nombre,
            description:
              m.tipo === "efectivo"
                ? "Pago exacto o con vuelto al recibir"
                : `Instrucciones para ${m.nombre}`,
          })),
        },
      ];
      const enviado = await this.enviarYRegistrar(
        to,
        {
          tipo: "lista",
          texto: msg,
          textoGuardar: "Métodos de pago enviados",
          buttonText: "Elegir Método",
          sections,
        },
        io
      );
      return enviado;
    } catch (error) {
      console.error(
        `❌ Error en solicitarMetodoPago para ${to}:`,
        error.message,
      );
      const errPayMsg = "⚠️ Hubo un error al cargar los métodos de pago.";
      await this.enviarYRegistrar(to, { tipo: "texto", texto: errPayMsg }, io);
      return false;
    }
  }

  async solicitarComprobante(to, msgInstrucciones, io) {
    return await this.enviarYRegistrar(to, { tipo: "texto", texto: msgInstrucciones }, io);
  }

  async solicitarConfirmacionDatos(to, carrito, io) {
    try {
      const {
        items = [],
        nombre = "No especificado",
        cedula = "No especificada",
        ubicacion = {},
        direccion_manual,
        envio,
        notas,
      } = carrito;
      const esRetiro = envio?.tipo === "retiro";
      const direccion = esRetiro
        ? (envio.direccion || "Punto de retiro")
        : (direccion_manual ||
          ubicacion?.direccion ||
          ubicacion?.address ||
          "Ubicación GPS");
      const notaFinal = notas ? `\n📝 *Notas:* ${notas}` : "";

      let envioTexto = "";
      if (envio && envio.nombre) {
        if (esRetiro) {
          envioTexto = `\n🏪 *Modalidad:* ${envio.nombre} (Sin costo)`;
        } else if (envio.cobroADestino) {
          envioTexto = `\n🚚 *Envío:* ${nombreEnvio(envio)} (cobro a destino: lo pagas al recibirlo)`;
        } else if (envio.costoAcordado) {
          const costoEnvio = Number(envio.costo) || 0;
          envioTexto = `\n🚚 *Envío:* ${nombreEnvio(envio)} ($${formatUsd(costoEnvio)}, acordado con el asesor)`;
        } else if (envio.aConvenir) {
          envioTexto = `\n🚚 *Envío:* ${nombreEnvio(envio)} (a convenir con el asesor)`;
        } else {
          const costoEnvio = Number(envio.costo) || 0;
          envioTexto = `\n🚚 *Envío:* ${nombreEnvio(envio)} ($${formatUsd(costoEnvio)})`;
        }
      }

      const totalUSD = orderService.calcularTotalCarrito(carrito);
      const tasaRes = await obtenerTasaUSD();
      const tasa = tasaRes?.tasa || 0;
      const totalVESRaw = totalUSD * tasa;
      const totalVES = totalVESRaw > 0 ? formatBs(totalVESRaw) : "N/A";

      const itemsString = items
        .map((i) => `${i.producto} x${i.cantidad}`)
        .join("\n");

      const etiquetaDir = esRetiro ? "📍 *Punto de retiro:*" : "📍 *Dirección:*";

      const msg =
        `📝 *Resumen de tu Pedido*\n` +
        `🕒 *Fecha:* ${getCaracasTime().toLocaleString("es-VE")}\n\n` +
        `👤 *Cliente:* ${nombre}\n` +
        `🆔 *Cédula:* ${cedula}\n` +
        `${etiquetaDir} ${direccion}${envioTexto}${notaFinal}\n\n` +
        `📦 *Items:* \n${itemsString}\n\n` +
        `💰 *Total a pagar:* $${formatUsd(totalUSD)} / Bs. ${totalVES}\n\n` +
        `¿Tus datos son correctos?\n\n` +
        `💡 _Si deseas cancelar o empezar desde cero, escribe *CANCELAR*._`;

      const buttons = [
        { id: "datos_correctos", title: "✅ Todo Correcto" },
        { id: "modificar_datos", title: "✏️ Modificar Datos" },
      ];

      const enviado = await this.enviarYRegistrar(
        to,
        {
          tipo: "botones",
          texto: msg,
          textoGuardar: "Resumen de datos enviado",
          buttons,
        },
        io
      );
      return enviado;
    } catch (error) {
      console.error(
        `❌ Error en solicitarConfirmacionDatos para ${to}:`,
        error.message,
      );
      return false;
    }
  }

  async mostrarOpcionesEdicion(to, io) {
    const msg =
      "Selecciona el dato que deseas corregir:\n\n💡 _Escribe *CANCELAR* si prefieres empezar de nuevo._";
    const sections = [
      {
        title: "Campos de Facturación/Envío",
        rows: [
          {
            id: "editar_nombre",
            title: "👤 Editar Nombre",
            description: "Cambiar nombre del cliente",
          },
          {
            id: "editar_cedula",
            title: "🆔 Editar Cédula",
            description: "Cambiar número de identidad",
          },
          {
            id: "editar_envio",
            title: "🚚 Editar Envío",
            description: "Cambiar método de entrega",
          },
          {
            id: "editar_direccion",
            title: "📍 Editar Dirección",
            description: "Cambiar dirección o GPS",
          },
          {
            id: "editar_pedido",
            title: "🛒 Modificar Productos",
            description: "Cambiar platos o cantidades",
          },
          {
            id: "cancelar_edicion",
            title: "🔙 Volver al Resumen",
            description: "Regresar sin cambios",
          },
        ],
      },
    ];
    return await this.enviarYRegistrar(
      to,
      {
        tipo: "lista",
        texto: msg,
        textoGuardar: "Opciones de edición enviadas",
        buttonText: "Elegir Campo",
        sections,
        headerText: "Edición de Datos",
      },
      io
    );
  }

  async solicitarOpcionesEfectivo(to, io, totalUsd) {
    const msg = `💵 *Pago en Efectivo ($${formatUsd(totalUsd)})*\n\n¿Cómo deseas gestionar tu pago?`;

    const sections = [
      {
        title: "Opciones Disponibles",
        rows: [
          {
            id: "efectivo_exacto",
            title: "✅ Monto Exacto",
            description: "Pagaré el monto completo en efectivo",
          },
          {
            id: "efectivo_mixto",
            title: "🌓 Pago Mixto",
            description:
              "Una parte en efectivo y el resto en Bs. (Recomendado)",
          },
          {
            id: "efectivo_vuelto",
            title: "⚖️ Requiere Vuelto",
            description: "Pagaré con un monto mayor y necesito cambio",
          },
        ],
      },
    ];

    return await this.enviarYRegistrar(
      to,
      {
        tipo: "lista",
        texto: msg,
        textoGuardar: "Opciones de efectivo enviadas",
        buttonText: "Elegir Opción",
        sections,
        headerText: "💵 Gestión de Efectivo",
      },
      io
    );
  }

  async solicitarMontoEfectivoParcial(to, io, totalUsd) {
    const msg = `🌓 *Pago Mixto*\n\nTu total es de *$${formatUsd(totalUsd)}*.\n\nPor favor, indica cuánto vas a cancelar en *Efectivo* (solo el número).\n\n_Ejemplo: Si vas a pagar $20 en billete y el resto en Pago Móvil, escribe 20._`;
    return await this.enviarYRegistrar(to, { tipo: "texto", texto: msg }, io);
  }

  async informarPendienteVerificacion(to, io) {
    const msg =
      "⏳ Hemos recibido tu comprobante. Tu pedido ha sido enviado a revisión.\n\nNuestro equipo verificará el pago y te notificaremos por esta vía cuando sea aprobado. ¡Gracias por tu compra!";
    return await this.enviarYRegistrar(to, { tipo: "texto", texto: msg }, io);
  }
  async solicitarOpcionFinDeSemana(to, nombre = "", io) {
    const greetingPrefix = nombre ? `¡Hola, ${nombre}! 👋` : `¡Hola! 👋`;
    const brandName = configManager.get("settings.brandName");
    const horarioTexto = formatearHorarioAtencion();
    const proximoDiaHabil = getProximoDiaHabil();
    const horaApertura = getHoraAperturaFormateada();
    const flujo = getFlujoNoLaborableSync();

    const msg =
      configManager.format("settings.messages.weekendGreeting", {
        greetingPrefix,
        brandName,
        horarioTexto,
        horarioAtencion: horarioTexto,
        proximoDiaHabil,
        horaApertura,
      }) ||
      `${greetingPrefix} Bienvenido a *${brandName}* ✨\n\n` +
      `Hoy no estamos despachando (horario habitual: *${horarioTexto}*).\n\n` +
      `¿Cómo deseas continuar?`;

    const buttons = [];

    // Modalidad 1: Entrega diferida (activo por defecto salvo apagado explícito)
    if (flujo.entregaDiferida?.activo !== false) {
      const rawTitle = configManager.format("settings.messages.weekendButtonPedir", {
        proximoDiaHabil,
      });
      const title = (rawTitle || `🛵 Pedir ${proximoDiaHabil}`).slice(0, 20);
      buttons.push({ id: "fin_semana_pedir_lunes", title });
    }

    // Modalidad 2: Retiro en Punto Aliado / Pick Up
    if (flujo.retiroEnPunto?.activo) {
      const rawTitle = configManager.get("settings.messages.weekendButtonPuntoAliado");
      const title = (rawTitle || "🏪 Punto Aliado").slice(0, 20);
      buttons.push({ id: "fin_semana_punto_aliado", title });
    }

    if (buttons.length > 0) {
      return await this.enviarYRegistrar(to, { tipo: "botones", texto: msg, buttons }, io);
    } else {
      return await this.enviarYRegistrar(to, { tipo: "texto", texto: msg }, io);
    }
  }

  async enviarInfoPuntoAliado(to, io) {
    const brandName = configManager.get("settings.brandName");
    const flujo = getFlujoNoLaborableSync();
    const proximoDiaHabil = getProximoDiaHabil();
    const nombrePunto = flujo.retiroEnPunto?.nombre || `Punto Aliado — ${brandName}`;
    const direccionPunto = flujo.retiroEnPunto?.direccion || "";
    const horarioPunto = flujo.retiroEnPunto?.horario || "";

    const msg =
      configManager.format("settings.messages.puntoAliadoInfo", {
        brandName,
        nombrePunto,
        direccionPunto,
        horarioPunto,
        proximoDiaHabil,
      }) ||
      `🏪 *${nombrePunto}*\n\n` +
      (direccionPunto ? `📍 *Ubicación:* ${direccionPunto}\n` : "") +
      (horarioPunto ? `🕒 *Horario:* ${horarioPunto}\n\n` : "\n") +
      `💡 _Si prefieres registrar tu pedido para el ${proximoDiaHabil}, escribe *pedir* o *menu*._`;

    return await this.enviarYRegistrar(to, { tipo: "texto", texto: msg }, io);
  }
}

module.exports = new ChatFlowController();
