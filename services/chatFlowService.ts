let ProductoOriginal = require("../models/Producto");

let Producto = ProductoOriginal;

// Soporte para Pruebas de Integración (Mock)
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("./dbLocal");
  Producto = dbLocal.getProductoModel();
}

let MetodoPagoOriginal = require("../models/MetodoPago");
let MetodoPago = MetodoPagoOriginal;

const PedidoOriginal = require("../models/Pedido");
let Pedido = PedidoOriginal;

let FAQOriginal = require("../models/FAQ");
let FAQ = FAQOriginal;

let CategoriaOriginal = require("../models/Categoria");
let Categoria = CategoriaOriginal;
let MetodoEnvioOriginal = require("../models/MetodoEnvio");
let MetodoEnvio = MetodoEnvioOriginal;
let CarritoWebOriginal = require("../models/CarritoWeb");
let CarritoWeb = CarritoWebOriginal;

// Soporte para Pruebas de Integración (Mock)
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("./dbLocal");
  Producto = dbLocal.getProductoModel();
  Pedido = dbLocal.getPedidoModel();
  MetodoPago = dbLocal.getMetodoPagoModel();
  if (typeof dbLocal.getMetodoEnvioModel === "function") {
    MetodoEnvio = dbLocal.getMetodoEnvioModel();
  }
  if (typeof dbLocal.getFAQModel === "function") {
    FAQ = dbLocal.getFAQModel();
  }
  if (typeof dbLocal.getCategoriaModel === "function") {
    Categoria = dbLocal.getCategoriaModel();
  }
  if (typeof dbLocal.getCarritoWebModel === "function") {
    CarritoWeb = dbLocal.getCarritoWebModel();
  }
}
const configManager = require("./configManager");
const { getConfigCatalogoSync } = require("./catalogoConfigService");
const orderService = require("./orderService");
const chatFlow = require("../controllers/chatFlowController");
const { isAskingForBCVRate } = require("./intentClassifier");
const { buscarFAQ, getSaboresEnStock, getMenuDinamico } = require("./faqMatcher");
const { obtenerTasaUSD } = require("./bcv");
const whatsapp = require("./whatsapp");
const {
  enviarImagenPorUrl,
  notificarAdminConFallback,
} = whatsapp;
const {
  formatBs,
  formatUsd,
  getCaracasTime,
  esFinDeSemanaCaracas,
  parseDocumentoIdentidad,
} = require("../utils/helpers");
const pushService = require("./pushService");
const { filtroPorCategoria } = require("./catalogQuery");
const { getFlujoNoLaborableSync } = require("./flujoNoLaborableService");
const { nombresEmpresas } = require("./empresasEnvio");
const { precioVigente, etiquetaPrecio, descuentoVigente } = require("./precios");
const {
  getProximoDiaHabil,
  getHoraAperturaFormateada,
  formatearHorarioAtencion,
} = require("./horarioService");
const axios = require("axios");
const { getConfig } = require("./configStore");

/**
 * Detecta si el texto del usuario expresa intención de retirar el pedido en persona.
 */
function quiereRetirar(texto: string): boolean {
  if (!texto || typeof texto !== "string") return false;
  const normalizado = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalizado) return false;

  // Evitar falsos positivos como trámites de garantía o devolución
  if (normalizado.includes("garantia") || normalizado.includes("devolucion")) {
    return false;
  }

  const frases = [
    "voy en persona",
    "lo busco",
    "la busco",
    "lo paso buscando",
    "la paso buscando",
    "paso a buscar",
    "pasar a buscar",
    "paso por alla",
    "pick up",
    "pickup",
    "retiro en persona",
    "retiro en tienda",
    "quiero retirar",
    "puedo retirar",
    "prefiero retirar",
    "lo retiro",
    "la retiro",
    "retiro yo",
    "voy a buscar",
    "voy a retirar",
  ];

  for (const frase of frases) {
    if (normalizado.includes(frase)) return true;
  }

  if (/\b(retiro|retirar)\b/.test(normalizado)) {
    return true;
  }

  return false;
}

const WEBHOOK_DEBOUNCE_MS_DEFAULT = 1200;

function getDebounceMs() {
  const debounceVal = getConfig("WEBHOOK_DEBOUNCE_MS");
  if (debounceVal !== undefined) {
    const val = parseInt(debounceVal, 10);
    return isNaN(val) ? 0 : val;
  }
  return process.env.NODE_ENV === "test" ? 0 : WEBHOOK_DEBOUNCE_MS_DEFAULT;
}

/**
 * Lógica de negocio del flujo de conversación (Estado del Bot)
 * Modalidad: Delivery Exclusivo
 * Refactored using Strategy Pattern for better maintainability.
 */
/** Empresas de envío de un método (envío nacional); vacía si no tiene o es retiro. */
function empresasDeEnvio(metodo: any): string[] {
  if (!metodo || metodo.tipo === "retiro") return [];
  return nombresEmpresas(metodo.empresas);
}

class ChatFlowService {
  handlers: Record<string, Function>;
  userQueues: Map<string, any>;

  constructor() {
    this.handlers = {
      inicio: this.handleInicio.bind(this),
      fin_semana_opciones: this.handleFinDeSemanaOpciones.bind(this),
      en_faq: this.handleEnFaq.bind(this),
      esperando_seleccion: this.handleEsperandoSeleccion.bind(this),
      esperando_producto: this.handleEsperandoProducto.bind(this),
      esperando_cantidad: this.handleEsperandoCantidad.bind(this),
      preguntando_mas: this.handlePreguntandoMas.bind(this),
      esperando_datos_cliente: this.handleEsperandoDatosCliente.bind(this),
      esperando_cedula: this.handleEsperandoCedula.bind(this),
      esperando_metodo_envio: this.handleEsperandoMetodoEnvio.bind(this),
      esperando_empresa_envio: this.handleEsperandoEmpresaEnvio.bind(this),
      esperando_ubicacion: this.handleEsperandoUbicacion.bind(this),
      esperando_notas: this.handleEsperandoNotas.bind(this),
      esperando_confirmacion_datos:
        this.handleEsperandoConfirmacionDatos.bind(this),
      esperando_pago_metodo: this.handleEsperandoPagoMetodo.bind(this),
      esperando_efectivo_opcion: this.handleEsperandoEfectivoOpcion.bind(this),
      esperando_efectivo_monto: this.handleEsperandoEfectivoMonto.bind(this),
      esperando_comprobante: this.handlePendienteComprobante.bind(this),
      pendiente_verificacion: this.handlePendienteVerificacion.bind(this),
      esperando_confirmacion_web:
        this.handleEsperandoConfirmacionWeb.bind(this),
      esperando_reemplazo_web:
        this.handleEsperandoReemplazoWeb.bind(this),
    };

    // Mapa de colas y debounce en memoria indexado por número de WhatsApp (from)
    this.userQueues = new Map();
  }

  async handleIncomingMessage(
    from,
    tipo,
    text,
    interactiveTitle,
    mediaId,
    io,
    _modosOperacion,
    location,
    mimeType = null,
    messageId = null,
    options: Record<string, any> = {},
  ) {
    // 0. Verificación anti-spam: Si el usuario está bloqueado, ignorar silenciosamente
    try {
      let Etiqueta = require("../models/Etiqueta");
      if (process.env.NODE_ENV === "test") {
        Etiqueta = require("./dbLocal").getEtiquetaModel();
      }
      const estado = await Etiqueta.findOne({ telefono: from }).lean();
      if (estado && estado.bloqueado) {
        console.log(`🚫 [WhatsApp Spam] Mensaje ignorado silenciosamente: Usuario ${from} está bloqueado.`);
        return;
      }
    } catch (err) {
      console.warn("⚠️ Error verificando bloqueo de usuario:", err.message);
    }

    // 1. Registro de mensajes en BD y Socket.IO (SIEMPRE de inmediato para el operador)
    if (tipo === "text" || tipo === "interactive") {
      await orderService.emitirYGuardar(
        from,
        interactiveTitle || text,
        "cliente",
        io,
        "texto",
        null,
        messageId,
        null,
        null,
      );
    } else if (tipo === "location") {
      const mapsUrl = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
      await orderService.emitirYGuardar(
        from,
        `📍 Ubicación recibida`,
        "cliente",
        io,
        "location",
        null,
        messageId,
        null,
        null,
        mapsUrl,
      );
    }

    let mediaUrl = null;
    if (mediaId) {
      try {
        const { descargarMedia } = require("./whatsapp");
        const { uploadFromBuffer } = require("./cloudinaryService");
        const buffer = await descargarMedia(mediaId);
        if (buffer) {
          const folder = tipo === "audio" || tipo === "voice" ? "wa_audio" : "wa_media";
          mediaUrl = await uploadFromBuffer(buffer, folder);
        }
      } catch (e) {
        console.warn(`⚠️ [ChatFlow] No se pudo subir media a Cloudinary (${mediaId}):`, e.message);
      }
    }

    if (tipo === "audio" || tipo === "voice") {
      await orderService.emitirYGuardar(
        from,
        options.caption || `🎤 Nota de voz`,
        "cliente",
        io,
        "audio",
        mediaId,
        messageId,
        null,
        mimeType,
        mediaUrl,
        options.fileName || null,
        options.caption || null,
      );
    } else if (tipo === "image") {
      await orderService.emitirYGuardar(
        from,
        options.caption || `📷 Imagen recibida`,
        "cliente",
        io,
        "image",
        mediaId,
        messageId,
        null,
        mimeType,
        mediaUrl,
        options.fileName || null,
        options.caption || null,
      );
    } else if (mediaId) {
      await orderService.emitirYGuardar(
        from,
        options.caption || `📎 Multimedia recibida`,
        "cliente",
        io,
        tipo || "media",
        mediaId,
        messageId,
        null,
        mimeType,
        mediaUrl,
        options.fileName || null,
        options.caption || null,
      );
    }

    // 1.5. Persistir nombre de perfil de WhatsApp si está disponible y no se ha registrado nombre
    if (
      options.contactName &&
      typeof options.contactName === "string" &&
      options.contactName.trim()
    ) {
      try {
        const estadoActual = await orderService.getEstado(from);
        if (!estadoActual?.carrito?.nombre) {
          await orderService.setEstado(
            from,
            {
              carrito: {
                ...(estadoActual?.carrito || {}),
                nombre: options.contactName.trim(),
              },
            },
            io,
          );
        }
      } catch (e) {
        console.warn(
          `⚠️ [ChatFlow] No se pudo guardar contactName para ${from}:`,
          e.message,
        );
      }
    }

    // 1.6. Persistir ctwaClid si proviene de un anuncio Click-to-WhatsApp (CTWA)
    if (
      options.ctwaClid &&
      typeof options.ctwaClid === "string" &&
      options.ctwaClid.trim()
    ) {
      try {
        const clid = options.ctwaClid.trim();
        const estadoActual = await orderService.getEstado(from);
        await orderService.setEstado(
          from,
          {
            ctwaClid: clid,
            carrito: {
              ...(estadoActual?.carrito || {}),
              ctwaClid: clid,
            },
          },
          io,
        );
        console.log(`🎯 [CTWA] ctwaClid guardado para ${from}: ${clid}`);
      } catch (e: any) {
        console.warn(
          `⚠️ [ChatFlow] No se pudo guardar ctwaClid para ${from}:`,
          e.message,
        );
      }
    }

    // 2. Debounce y encolado serial por remitente (from)
    const debounceMs =
      options.debounceMs !== undefined ? options.debounceMs : getDebounceMs();

    return new Promise((resolve, reject) => {
      let q = this.userQueues.get(from);
      if (!q) {
        q = {
          timer: null,
          messages: [],
          queuePromise: Promise.resolve(),
        };
        this.userQueues.set(from, q);
      }

      q.messages.push({
        from,
        tipo,
        text,
        interactiveTitle,
        mediaId,
        io,
        location,
        mimeType,
        messageId,
        resolve,
        reject,
      });

      if (debounceMs > 0) {
        if (q.timer) {
          clearTimeout(q.timer);
        }
        q.timer = setTimeout(() => {
          q.timer = null;
          this._flushUserQueue(from);
        }, debounceMs);
      } else {
        this._flushUserQueue(from);
      }
    });
  }

  /**
   * Procesa la cola de mensajes acumulados para un usuario de forma serial y atómica.
   */
  _flushUserQueue(from) {
    const q = this.userQueues.get(from);
    if (!q) return Promise.resolve();

    if (q.timer) {
      clearTimeout(q.timer);
      q.timer = null;
    }

    const run = async () => {
      const batch = q.messages.splice(0, q.messages.length);
      if (batch.length === 0) return;

      try {
        await this._processBatch(from, batch);
        batch.forEach((item) => item.resolve && item.resolve(true));
      } catch (err) {
        console.error(
          `❌ [ChatFlowService] Error procesando lote para ${from}:`,
          err.message,
        );
        batch.forEach((item) => item.reject && item.reject(err));
      } finally {
        // Liberar memoria si no hay nuevos mensajes ni timer pendiente
        if (q.messages.length === 0 && !q.timer) {
          this.userQueues.delete(from);
        }
      }
    };

    q.queuePromise = q.queuePromise.then(run, run);
    return q.queuePromise;
  }

  /**
   * Ejecución de la máquina de estados con el lote de mensajes consolidado.
   */
  async _processBatch(from, batch) {
    if (!batch || batch.length === 0) return;

    const io = batch[batch.length - 1].io;

    // 0. VERIFICACIÓN DE CONTROL: ¿Debe responder el bot?
    const ultimoPedido = await Pedido.findOne({ whatsappId: from }).sort({
      timestamp: -1,
    });

    const estadoLimpio = (ultimoPedido?.estado || ultimoPedido?.status || "")
      .toLowerCase()
      .trim();
    const estadosFinales = ["entregado", "cancelado", "anulado"];

    const tienePedidoActivo =
      ultimoPedido && !estadosFinales.includes(estadoLimpio);
    const estaEnManosHumanas =
      tienePedidoActivo && estadoLimpio !== "pendiente_pago";
    const esModoManual = (await orderService.getModo(from)) === "manual";

    // 0.5. BYPASS DE RECOBRO (Prioridad Ultra)
    const restartItem = batch.find((item) => {
      const clean = (item.text || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return [
        "menu",
        "inicio",
        "reiniciar",
        "reset",
        "empezar",
        "comenzar",
      ].includes(clean);
    });

    if (restartItem) {
      const clean = (restartItem.text || "").trim().toLowerCase();
      console.log(
        `[Bot] Comando de recobro detectado en lote: ${clean}. Reseteando para ${from}`,
      );
      await orderService.setEstado(
        from,
        {
          paso: "inicio",
          reintentosFallidos: 0,
          carrito: { items: [] },
          categoria: null,
        },
        io,
      );
      await this.handleInicio({ from, io });
      return;
    }

    if (esModoManual || estaEnManosHumanas) {
      console.log(
        `[Bot] Salto de respuesta automática para ${from}. Motivo: ${esModoManual ? "Modo Manual" : "Pedido en curso (" + estadoLimpio + ")"}`,
      );
      if (estaEnManosHumanas && !esModoManual) {
        const estadoObj = await orderService.getEstado(from);
        await this.registrarReintentoFallido(from, estadoObj, io, (batch[batch.length - 1]?.text) || "");
      }
      return;
    }

    // Comandos globales de salida (cancelar, salir, 0, vaciar)
    const exitItem = batch.find((item) => {
      const low = (item.text || "").toLowerCase().trim();
      return ["salir", "cancelar", "0"].includes(low) || low === "vaciar";
    });

    if (exitItem) {
      await orderService.setEstado(
        from,
        { paso: "inicio", reintentosFallidos: 0, carrito: { items: [] } },
        io,
      );
      await orderService.cancelarPedidoActivo(from, io);
      await this._sendYGuardar(
        from,
        "🔄 Carrito vaciado y pedido cancelado. Puedes empezar de nuevo cuando desees.",
        io,
      );
      await this.handleInicio({ from, io });
      return;
    }

    // Solicitud explícita de hablar con un asesor o botón hablar_asesor
    const asesorItem = batch.find((item) => {
      const l = (item.text || "").toLowerCase().trim();
      const clean = l.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return (
        l === "hablar_asesor" ||
        clean === "asesor" ||
        clean === "humano" ||
        clean === "hablar con asesor" ||
        clean === "agente"
      );
    });

    if (asesorItem) {
      await orderService.setModo(from, "manual", io);
      const msgAsesor =
        configManager.get("settings.messages.advisorHandoff") ||
        "👨‍💼 Un asesor se comunicará contigo a la brevedad. Por favor déjanos tu consulta.";
      await this._sendYGuardar(from, msgAsesor, io);
      return;
    }

    // Intercepción de código de pedido web (F2-2, F2-4)
    // Solo si el catálogo está activo (por defecto true)
    const configCatalogo = getConfigCatalogoSync();
    if (configCatalogo.activo !== false) {
      const prefijo = (configCatalogo.prefijo || "PW").trim();
      const escapedPrefijo = prefijo.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const webOrderRegex = new RegExp(`\\b${escapedPrefijo}[-\\s]?([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5})\\b`, "i");

      let codigoNormalizado: string | null = null;
      for (const item of batch) {
        if (item.text) {
          const match = String(item.text).match(webOrderRegex);
          if (match) {
            codigoNormalizado = `${prefijo.toUpperCase()}-${match[1].toUpperCase()}`;
            break;
          }
        }
      }

      if (codigoNormalizado) {
        await this.procesarCodigoPedidoWeb({
          from,
          codigo: codigoNormalizado,
          io,
        });
        return;
      }
    }

    // Tasa BCV
    for (const item of batch) {
      if (
        (item.tipo === "text" || item.tipo === "interactive") &&
        (await isAskingForBCVRate(item.text))
      ) {
        const tasaInfo = await obtenerTasaUSD();
        if (tasaInfo && tasaInfo.tasa) {
          const res = `💱 *Tasa BCV*\n🇺🇸 1 USD = ${formatBs(tasaInfo.tasa)} Bs.`;
          await this.enviarYRegistrar(from, { tipo: "texto", texto: res }, io);
        }
        return;
      }
    }

    const estado = await orderService.getEstado(from);
    let paso = estado.paso;

    // Seleccionar el item más representativo del lote según el paso actual
    let primaryItem = batch[batch.length - 1];

    // 1. AUTOCORRECCIÓN Y PRIORIZACIÓN DE MENSAJES EN LOTE
    // Prioridad máxima: toques interactivos (list_reply / button_reply) son acciones explícitas
    const interactiveItem = batch.find((item) => item.tipo === "interactive");
    const categoryItem = batch.find((item) => {
      const low = (item.text || "").toLowerCase().trim();
      return low.startsWith("category_") || low.startsWith("cat_");
    });

    if (categoryItem) {
      paso = "esperando_seleccion";
      primaryItem = categoryItem;
    } else if (interactiveItem) {
      primaryItem = interactiveItem;
    } else if (paso === "esperando_datos_cliente") {
      const combinedText = batch
        .map((m) => (m.text || "").trim())
        .filter(Boolean)
        .join(" ");
      primaryItem = {
        ...primaryItem,
        text: combinedText || primaryItem.text,
      };
    } else if (paso === "esperando_ubicacion") {
      const locItem = batch.find(
        (m) => m.tipo === "location" || (m.text && m.text.trim().length > 3),
      );
      if (locItem) primaryItem = locItem;
    } else if (paso === "esperando_comprobante") {
      const imgItem = batch.find((m) => m.tipo === "image" && m.mediaId);
      if (imgItem) primaryItem = imgItem;
    } else if (paso === "esperando_cantidad") {
      const numItem = batch.find(
        (m) =>
          !isNaN(parseInt((m.text || "").trim())) &&
          parseInt((m.text || "").trim()) > 0,
      );
      if (numItem) primaryItem = numItem;
    }

    const text = primaryItem.text;
    const tipo = primaryItem.tipo;
    const interactiveTitle = primaryItem.interactiveTitle;
    const mediaId = primaryItem.mediaId;
    const location = primaryItem.location;
    const mimeType = primaryItem.mimeType;
    const messageId = primaryItem.messageId;
    const low = text ? text.toLowerCase().trim() : "";
    const cleanText = (text || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // 2. DETECCIÓN Y RESPUESTA DE FAQS DURANTE EL FLUJO (Sin alterar paso ni carrito)
    const esNumeroPuro = /^\d+$/.test(cleanText);
    const esPayloadInteractivo =
      low.startsWith("category_") ||
      low.startsWith("cat_") ||
      low.startsWith("product_") ||
      low.startsWith("prod_") ||
      low.startsWith("faq_") ||
      low.startsWith("pago_") ||
      low.startsWith("metodo_") ||
      low.startsWith("btn_") ||
      low.startsWith("datos_correctos") ||
      low.startsWith("cambiar_") ||
      low.startsWith("confirmar_") ||
      low.startsWith("efectivo_");
    const esComando = [
      "menu",
      "inicio",
      "reiniciar",
      "reset",
      "salir",
      "cancelar",
      "0",
      "vaciar",
      "pedir",
      "hacer pedido",
      "comprar",
      "pedido",
      "ordenar",
      "orden",
      "compras",
      "si",
      "no",
    ].includes(cleanText);

    // En lote (debounce), verificar si hay un mensaje de flujo prioritario
    const hayNumeroEnLote =
      paso === "esperando_cantidad" &&
      batch.some((m) => /^\d+$/.test((m.text || "").trim()));
    const haySeleccionEnLote = batch.some((m) => {
      if (m.tipo === "interactive") return true;
      const t = (m.text || "").toLowerCase().trim();
      return (
        t.startsWith("category_") ||
        t.startsWith("cat_") ||
        t.startsWith("product_") ||
        t.startsWith("prod_") ||
        t.startsWith("faq_") ||
        t.startsWith("pago_") ||
        t.startsWith("metodo_") ||
        t.startsWith("btn_") ||
        t.startsWith("datos_correctos") ||
        t.startsWith("cambiar_") ||
        t.startsWith("confirmar_") ||
        t.startsWith("efectivo_")
      );
    });

    // 1.5. DETECCIÓN DE TRANSICIÓN: Fin de semana -> Día hábil
    // Si el usuario quedó en estado exclusivo de fin de semana pero ya es día de semana
    // o el flujo de día no laborable fue desactivado desde el panel (o ambas modalidades apagadas),
    // sacarlo de ese estado, actualizar la etiqueta y enrutarlo al flujo normal de día laboral.
    const flujoNoLab = getFlujoNoLaborableSync();
    const modalidadesActivas = Boolean(
      flujoNoLab.activo && (flujoNoLab.entregaDiferida?.activo || flujoNoLab.retiroEnPunto?.activo)
    );

    if (paso === "fin_semana_opciones" && (!esFinDeSemanaCaracas() || !modalidadesActivas)) {
      console.log(
        `[Bot] Transición fin de semana -> día laboral (o flujo inactivo) detectada para ${from}. Sacando de fin_semana_opciones.`
      );

      const proximoDiaTrans = getProximoDiaHabil();
      const diaNormTrans = proximoDiaTrans.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const diaConAcentoTrans = proximoDiaTrans.toLowerCase();
      const normText = cleanText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

      const esPedir =
        low === "fin_semana_pedir_lunes" ||
        low === "fin_semana_pedir_diferido" ||
        cleanText === "faq_pedir" ||
        cleanText === "1" ||
        cleanText === "pedir" ||
        cleanText === "hacer pedido" ||
        cleanText === "comprar" ||
        cleanText === "ordenar" ||
        cleanText === "lunes" ||
        cleanText === "delivery" ||
        cleanText === "pedir lunes" ||
        cleanText === "pedir para el lunes" ||
        normText === "lunes" ||
        normText === "pedir lunes" ||
        normText === "pedir para el lunes" ||
        cleanText === diaConAcentoTrans ||
        cleanText === `pedir ${diaConAcentoTrans}` ||
        cleanText === `pedir para el ${diaConAcentoTrans}` ||
        normText === diaNormTrans ||
        normText === `pedir ${diaNormTrans}` ||
        normText === `pedir para el ${diaNormTrans}`;

      const esPuntoAliado =
        low === "fin_semana_punto_aliado" ||
        cleanText === "2" ||
        cleanText === "punto aliado" ||
        cleanText === "aliado" ||
        cleanText === "hoy" ||
        cleanText === "pickup" ||
        cleanText === "pick up" ||
        cleanText === "tienda" ||
        cleanText === "retirar" ||
        cleanText === "presencial" ||
        cleanText === "donde comprar";

      if (esPedir) {
        await orderService.setEstado(from, { paso: "esperando_seleccion" }, io);
        await chatFlow.mostrarCategorias(from, io);
        return;
      }

      if (esPuntoAliado) {
        await orderService.setEstado(from, { paso: "en_faq" }, io);
        await chatFlow.enviarInfoPuntoAliado(from, io);
        return;
      }

      // Cualquier otro mensaje (saludo, consulta o texto libre):
      // Sacar de fin_semana_opciones, resetear a 'inicio' y mostrar bienvenida de día hábil
      await orderService.setEstado(
        from,
        { paso: "inicio", reintentosFallidos: 0 },
        io
      );
      await this.handleInicio({ from, io });
      return;
    }

    // 1.6. DETECCIÓN DE TRANSICIÓN: Día hábil -> Fin de semana
    // Si es fin de semana y el usuario no está en inicio, fin de semana u orden de pago,
    // reiniciar su estado a inicio para que ingrese limpiamente al flujo de fin de semana.
    const estadosExcluidosFinSemana = [
      "inicio",
      "fin_semana_opciones",
      "esperando_pago_metodo",
      "esperando_efectivo_opcion",
      "esperando_efectivo_monto",
      "esperando_comprobante",
      "pendiente_verificacion",
    ];

    if (
      esFinDeSemanaCaracas() &&
      modalidadesActivas &&
      !estadosExcluidosFinSemana.includes(paso) &&
      !estado?.carrito?.esFinDeSemana
    ) {
      console.log(
        `[Bot] Transición día laboral -> fin de semana detectada para ${from}. Reiniciando flujo.`
      );
      await orderService.setEstado(
        from,
        { paso: "inicio", carrito: {}, reintentosFallidos: 0 },
        io
      );
      return this.handleInicio({ from, io });
    }

    // 2. DETECCIÓN Y RESPUESTA DE FAQS (Únicamente fuera de un flujo de compra activo)
    // Para blindar el checkout y evitar interrupciones por falsos positivos (ej: palabras como "dirección", "delivery", etc. en notas o dirección),
    // las FAQs por palabras clave NUNCA deben dispararse si el usuario está en medio de un pedido.
    // Solo se evalúan en estados informativos/menú ('inicio' y 'en_faq').
    const esPasoInformativo = paso === "inicio" || paso === "en_faq";

    if (
      esPasoInformativo &&
      tipo === "text" &&
      !esNumeroPuro &&
      !esPayloadInteractivo &&
      !esComando &&
      !hayNumeroEnLote &&
      !haySeleccionEnLote
    ) {
      let faqs = [];
      try {
        faqs = await FAQ.find({ brand: "default", activo: true });
      } catch (err) {
        faqs = [];
      }

      const faqMatch = buscarFAQ(cleanText, faqs);
      if (faqMatch) {
        let respuesta = faqMatch.respuesta;
        if (faqMatch.type === "dinamica") {
          if (faqMatch.dynamicKey === "sabores") {
            respuesta = await getSaboresEnStock();
          } else if (faqMatch.dynamicKey === "menu") {
            respuesta = await getMenuDinamico();
          }
        }
        if (!respuesta) {
          respuesta =
            "En este momento no hay información disponible para esta consulta.";
        }

        const hint = this.getContinuationHint(paso);
        const fullText = `${respuesta}\n\n_${hint}_`;

        await this.enviarYRegistrar(from, { tipo: "texto", texto: fullText }, io);
        return;
      }
    }

    // Despacho al Handler correspondiente
    const handler = this.handlers[paso];
    const context = {
      from,
      tipo,
      text,
      interactiveTitle,
      mediaId,
      io,
      location,
      estado,
      low,
      cleanText,
      mimeType,
      messageId,
    };

    if (handler) {
      await handler(context);
    } else {
      await this.enviarMenuFaq(from, io);
      await orderService.setEstado(from, { paso: "en_faq" }, io);
    }
  }

  /**
   * Delega el envío de WhatsApp y registro centralizado a ChatFlowController.
   */
  async enviarYRegistrar(from, opciones, io) {
    return await chatFlow.enviarYRegistrar(from, opciones, io);
  }

  // Helper para enviar a WhatsApp y emitir/guardar en tiempo real en el SaaS
  async _sendYGuardar(from, text, io) {
    return await this.enviarYRegistrar(from, { tipo: "texto", texto: text }, io);
  }

  // Helper Anti-Stuck: Incrementa fallos sucesivos y emite alerta si supera el umbral (>= 3 intentos)
  async registrarReintentoFallido(from, estado, io, text = "") {
    const newCount = (estado.reintentosFallidos || 0) + 1;
    const threshold = 3;
    const update: Record<string, any> = { reintentosFallidos: newCount };

    if (newCount >= threshold) {
      update.stuck = true;
    }
    await orderService.setEstado(from, update, io);

    if (newCount >= threshold) {
      if (io) {
        io.emit("alerta_cliente_trabado", {
          telefono: from,
          estado: estado.paso,
          paso: estado.paso,
          reintentos: newCount,
          mensaje: text,
        });
      }
      console.warn(
        `🚨 [Anti-Stuck] Cliente ${from} marcado como stuck tras ${newCount} reintentos fallidos en paso "${estado.paso}".`,
      );

      // Fallback de Emergencia a Modo Manual
      const saludo =
        configManager.get("settings.messages.manualOrderRequest") ||
        `¡Hola! Para agilizar tu atención y tomar tu pedido de inmediato de forma manual, por favor envíanos los siguientes datos en un solo mensaje:\n\n👤 Nombre:\n🪪 Cédula de identidad:\n📦 Tu pedido y cantidad:\n📍 Dirección exacta de entrega o Ubicación GPS:\n🛵 Nota para la entrega (opcional):\n\nEn cuanto nos envíes esta información, procesamos tu pedido al instante. ¡Muchas gracias! ✨`;
      await this._sendYGuardar(from, saludo, io);
      await orderService.setModo(from, "manual", io);
    }
    return newCount;
  }

  // --- Hints de continuación para FAQs en flujo ---

  getContinuationHint(paso) {
    switch (paso) {
      case "fin_semana_opciones": {
        const proximoDia = getProximoDiaHabil();
        const flujo = getFlujoNoLaborableSync();
        if (flujo.entregaDiferida?.activo !== false && flujo.retiroEnPunto?.activo) {
          return `Para continuar, elige *Pedir para el ${proximoDia}* o ver la info del *Punto Aliado* (o escribe *CANCELAR* para reiniciar).`;
        }
        if (flujo.retiroEnPunto?.activo) {
          return "Para continuar, consulta la info del *Punto Aliado* (o escribe *CANCELAR* para reiniciar).";
        }
        return `Para continuar, elige *Pedir para el ${proximoDia}* (o escribe *CANCELAR* para reiniciar).`;
      }
      case "esperando_cantidad": {
        const unitPlural = configManager.get("settings.sales.unitPlural") || "unidades";
        return `Para continuar tu pedido, escribe la cantidad de *${unitPlural}* que deseas (ej: 1, 2, 3...) o escribe *CANCELAR* para reiniciar.`;
      }
      case "preguntando_mas":
        return "Para continuar, escribe *SI* para agregar más productos o *NO* para finalizar tu pedido (o escribe *CANCELAR* para reiniciar).";
      case "esperando_seleccion":
        return "Para continuar, escribe el *nombre del producto* que deseas o *CANCELAR* para reiniciar.";
      case "esperando_producto":
        return "Para continuar, escribe el *nombre del producto* del catálogo o *CANCELAR* para reiniciar.";
      case "esperando_datos_cliente":
        return "Para continuar, escribe tu *Nombre y Cédula* (máx. 40 caracteres, ej: Juan Pérez 12345678) o *CANCELAR* para reiniciar.";
      case "esperando_cedula":
        return "Para continuar, escribe tu *Cédula o RIF* (ej: 12345678, E-12345678 o J-123456789) o *CANCELAR* para reiniciar.";
      case "esperando_metodo_envio":
        return "Para continuar, selecciona tu *método de entrega* de la lista o escribe tu opción (o escribe *CANCELAR* para reiniciar).";
      case "esperando_empresa_envio":
        return "Para continuar, elige la *empresa de envío* de la lista o escribe su nombre (o escribe *CANCELAR* para reiniciar).";
      case "esperando_ubicacion":
        return "Para continuar, escribe tu *dirección* o envía tu ubicación (o escribe *CANCELAR* para reiniciar).";
      case "esperando_notas":
        return "Para continuar, escribe tus notas adicionales o *NINGUNA* (o escribe *CANCELAR* para reiniciar).";
      case "esperando_confirmacion_datos":
        return "Para continuar, escribe *SI* para confirmar tus datos o *CANCELAR* para reiniciar.";
      case "esperando_pago_metodo":
        return "Para continuar, escribe tu *método de pago* (ej: pago móvil, efectivo, tarjeta) o *CANCELAR* para reiniciar.";
      case "esperando_efectivo_opcion":
      case "esperando_efectivo_monto":
        return "Para continuar, escribe el *monto* o la opción de efectivo que te indicamos (o *CANCELAR* para reiniciar).";
      case "esperando_comprobante":
        return "Para continuar, envía la *foto del comprobante* de tu pago o escribe *CANCELAR* para reiniciar.";
      case "pendiente_verificacion":
        return "Tu pago está en verificación; si necesitas algo, escribe *menu*.";
      default:
        return "Para continuar tu compra, escribe *menu* o escribe *CANCELAR* para empezar de nuevo.";
    }
  }

  // --- Construcción y Envío del Menú de FAQs ---

  async construirMenuFaq() {
    let FAQ = require("../models/FAQ");
    if (process.env.NODE_ENV === "test") {
      const dbLocal = require("./dbLocal");
      if (typeof dbLocal.getFAQModel === "function")
        FAQ = dbLocal.getFAQModel();
    }

    const faqs = await FAQ.find({ brand: "default", activo: true }).sort({
      order: 1,
      createdAt: 1,
    });

    const activeFaqs = Array.isArray(faqs) ? faqs : [];
    const rows = activeFaqs.map((f, idx) => ({
      id: `faq_${idx}`,
      title: f.pregunta,
      description: "Ver respuesta",
    }));
    rows.unshift({
      id: "faq_pedir",
      title: "Hacer Pedido",
      description: "Ir al catálogo de productos",
    });

    const sections = [{ title: "Preguntas Frecuentes", rows }];
    const bodyText = "Selecciona una opción de la lista para ver la respuesta:";

    return { faqs: activeFaqs, sections, bodyText };
  }

  async enviarMenuFaq(from, io) {
    const { bodyText, sections } = await this.construirMenuFaq();
    const botIdentity = configManager.get("settings.botIdentity") || "Asistente virtual";
    return await this.enviarYRegistrar(
      from,
      {
        tipo: "lista",
        texto: bodyText,
        buttonText: "Ver Opciones",
        sections,
        headerText: botIdentity,
        footerText: "Preguntas Frecuentes",
      },
      io
    );
  }

  // --- Handlers ---

  async handleInicio({ from, io }) {
    const estado = await orderService.getEstado(from);
    const nombre = estado?.carrito?.nombre ? estado.carrito.nombre.trim() : "";

    // Intercepción de Fines de Semana / Días No Laborables
    const flujo = getFlujoNoLaborableSync();
    const flujoOperativo = Boolean(
      flujo.activo && (flujo.entregaDiferida?.activo || flujo.retiroEnPunto?.activo)
    );
    if (esFinDeSemanaCaracas() && flujoOperativo) {
      await chatFlow.solicitarOpcionFinDeSemana(from, nombre, io);
      await orderService.setEstado(from, { paso: "fin_semana_opciones" }, io);
      return;
    }

    const greetingPrefix = nombre ? `¡Hola, ${nombre}! 👋` : `¡Hola! 👋`;

    const saludoAmigable = `${greetingPrefix} Encantado de saludarte. \n\n Para poder ayudarte mejor, selecciona una de las siguientes opciones:\n\n\n📲 Si deseas hacer tu pedido, escribe *Hacer Pedido*:`;
    await this._sendYGuardar(from, saludoAmigable, io);

    await this.enviarMenuFaq(from, io);
    await orderService.setEstado(from, { paso: "en_faq" }, io);
  }

  async handleFinDeSemanaOpciones({ from, cleanText, low, io, estado }) {
    const flujo = getFlujoNoLaborableSync();
    const flujoOperativo = Boolean(
      flujo.activo && (flujo.entregaDiferida?.activo || flujo.retiroEnPunto?.activo)
    );

    // Salvaguarda: si ya es día laboral o el flujo está inactivo (o sin modalidades), redirigir al flujo normal
    if (!esFinDeSemanaCaracas() || !flujoOperativo) {
      console.log(
        `[Bot] handleFinDeSemanaOpciones invocado fuera de día no laborable o con flujo inactivo para ${from}. Redirigiendo a inicio normal.`
      );
      await orderService.setEstado(
        from,
        { paso: "inicio", reintentosFallidos: 0 },
        io
      );
      await this.handleInicio({ from, io });
      return;
    }

    const proximoDiaHabil = getProximoDiaHabil();
    const horaApertura = getHoraAperturaFormateada();
    const diaNorm = proximoDiaHabil.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const diaConAcento = proximoDiaHabil.toLowerCase();
    const normText = cleanText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Opción 1: Entrega diferida (próximo día hábil)
    const esPedirDiferido =
      low === "fin_semana_pedir_lunes" ||
      low === "fin_semana_pedir_diferido" ||
      cleanText === "faq_pedir" ||
      cleanText === "1" ||
      cleanText === "pedir" ||
      cleanText === "hacer pedido" ||
      cleanText === "comprar" ||
      cleanText === "ordenar" ||
      cleanText === "delivery" ||
      cleanText === "lunes" ||
      cleanText === "pedir lunes" ||
      cleanText === "pedir para el lunes" ||
      normText === "lunes" ||
      normText === "pedir lunes" ||
      normText === "pedir para el lunes" ||
      cleanText === diaConAcento ||
      cleanText === `pedir ${diaConAcento}` ||
      cleanText === `pedir para el ${diaConAcento}` ||
      normText === diaNorm ||
      normText === `pedir ${diaNorm}` ||
      normText === `pedir para el ${diaNorm}`;

    // Opción 2: Punto aliado (comprar hoy en pickup)
    const esPuntoAliado =
      low === "fin_semana_punto_aliado" ||
      cleanText === "2" ||
      cleanText === "punto aliado" ||
      cleanText === "aliado" ||
      cleanText === "hoy" ||
      cleanText === "pickup" ||
      cleanText === "pick up" ||
      cleanText === "tienda" ||
      cleanText === "retirar" ||
      cleanText === "presencial" ||
      cleanText === "donde comprar";

    if (flujo.entregaDiferida?.activo !== false && esPedirDiferido) {
      const textoModalidad = flujo.entregaDiferida?.texto || "Delivery";
      const confirmMsg =
        configManager.format("settings.messages.weekendDeliveryConfirm", {
          proximoDiaHabil,
          horaApertura,
          textoModalidad,
        }) ||
        `🎉 ¡Excelente! Tu pedido será registrado con *${textoModalidad}* para el día *${proximoDiaHabil}* a partir de las ${horaApertura} 🛵`;

      await this._sendYGuardar(from, confirmMsg, io);
      await orderService.setEstado(
        from,
        {
          paso: "esperando_seleccion",
          carrito: { ...(estado?.carrito || {}), esFinDeSemana: true },
        },
        io,
      );
      await chatFlow.mostrarCategorias(from, io);
      return;
    }

    if (flujo.retiroEnPunto?.activo && esPuntoAliado) {
      await chatFlow.enviarInfoPuntoAliado(from, io);
      return;
    }

    const esSaludo = [
      "hola",
      "buenas",
      "buenos dias",
      "buenas tardes",
      "buenas noches",
      "buen dia",
      "epa",
      "epale",
      "menu",
      "inicio",
      "reiniciar",
    ].includes(cleanText);

    if (esSaludo) {
      await this.handleInicio({ from, io });
      return;
    }

    // Si el usuario escribe algo no reconocido, re-enviar opciones
    const aviso =
      "⚠️ Por favor selecciona una de las opciones disponibles:\n\n💡 _Si deseas empezar desde cero, escribe *CANCELAR*._";
    await this._sendYGuardar(from, aviso, io);
    const nombre = estado?.carrito?.nombre ? estado.carrito.nombre.trim() : "";
    await chatFlow.solicitarOpcionFinDeSemana(from, nombre, io);
  }

  async handleEnFaq({ from, cleanText, io }) {
    const esSaludoOReinicio =
      [
        "hola",
        "buenas",
        "buenos dias",
        "buenas tardes",
        "buenas noches",
        "buen dia",
        "buena tarde",
        "buena noche",
        "saludos",
        "saludo",
        "epa",
        "epale",
        "epaa",
        "epalee",
        "que tal",
        "q tal",
        "que mas",
        "q mas",
        "que hubo",
        "quiubo",
        "hey",
        "hello",
        "hi",
        "alo",
        "oli",
        "olis",
        "inicio",
        "empezar",
        "comenzar",
        "reiniciar",
        "reset",
        "menu",
      ].includes(cleanText) ||
      /^(hola+|buenas+|saludos+|epa+|epal+e+|hey+|alo+|q\s*mas|que\s*mas|q\s*tal|que\s*tal|buen\s*dia|buenos\s*dias|buenas\s*tardes|buenas\s*noches)[\s!.,?]*$/i.test(
        cleanText || "",
      );

    if (esSaludoOReinicio) {
      await this.handleInicio({ from, io });
      return;
    }

    const { faqs } = await this.construirMenuFaq();
    const num = parseInt(cleanText, 10);

    const esHacerPedido =
      cleanText === "faq_pedir" ||
      [
        "pedir",
        "hacer pedido",
        "comprar",
        "pedido",
        "ordenar",
        "orden",
        "compras",
      ].includes(cleanText) ||
      (!isNaN(num) && num === 1);

    if (esHacerPedido) {
      await orderService.setEstado(from, { paso: "esperando_seleccion" }, io);
      await chatFlow.mostrarCategorias(from, io);
      return;
    }

    let faqIndex = null;
    const matchLista = /^faq_(\d+)$/.exec(cleanText);
    if (matchLista) {
      faqIndex = parseInt(matchLista[1], 10);
    } else if (!isNaN(num) && num >= 2 && num <= faqs.length + 1) {
      faqIndex = num - 2;
    }

    if (faqIndex !== null && faqIndex >= 0 && faqIndex < faqs.length) {
      const faq = faqs[faqIndex];
      let respuesta = faq.respuesta;
      if (faq.type === "dinamica") {
        if (faq.dynamicKey === "sabores") {
          respuesta = await getSaboresEnStock();
        } else if (faq.dynamicKey === "menu") {
          respuesta = await getMenuDinamico();
        }
      }
      if (!respuesta) {
        respuesta =
          "En este momento no hay información disponible para esta consulta.";
      }

      const hint =
        "\n\n_Escribe *pedir* para hacer tu pedido o *menu* para ver las preguntas de nuevo._";
      const fullText = `${respuesta}${hint}`;

      await this.enviarYRegistrar(from, { tipo: "texto", texto: fullText }, io);
      return;
    }

    // Entrada inválida: re-enviar menú de FAQs
    const errorMsg =
      "⚠️ Opción no reconocida. Por favor elige una opción de la lista o escribe *pedir* para hacer tu pedido.\n\n💡 _Escribe *CANCELAR* si deseas volver al inicio._";
    await this.enviarYRegistrar(from, { tipo: "texto", texto: errorMsg }, io);
    await this.enviarMenuFaq(from, io);
  }

  async handleEsperandoSeleccion({ from, low, text, io, estado }) {
    if (low.startsWith("category_") || low.startsWith("cat_")) {
      const slug = low.replace("category_", "").replace("cat_", "");
      const catDoc = await Categoria.findOne({ slug });

      if (!catDoc) {
        await this._sendYGuardar(
          from,
          "⚠️ Categoría no encontrada. Escribe 'menu' para ver las opciones disponibles o *CANCELAR* para reiniciar.",
          io,
        );
        return;
      }

      const subcategorias = await Categoria.find({ padre: catDoc._id }).sort({
        nombre: 1,
      });

      if (subcategorias.length > 0) {
        await chatFlow.mostrarCategorias(from, io, catDoc._id);
      } else {
        const productsInCat = await Producto.find({
          $and: [
            { activo: true },
            { $or: [{ trackStock: { $ne: true } }, { stock: { $gt: 0 } }] },
            filtroPorCategoria(catDoc._id),
          ],
        });
        if (productsInCat.length > 0) {
          const success = await chatFlow.mostrarProductos(
            from,
            io,
            null,
            catDoc._id,
          );
          if (success)
            await orderService.setEstado(
              from,
              { paso: "esperando_producto", categoria: slug },
              io,
            );
        } else {
          await this._sendYGuardar(
            from,
            "✨ Próximamente añadiremos más delicias aquí. Escribe 'menu' para ver otras opciones.",
            io,
          );
        }
      }
    } else if (low === "menu" || low === "menú") {
      await chatFlow.mostrarCategorias(from, io);
    } else {
      const prodDirecto = await Producto.findOne({
        activo: true,
        $and: [
          { $or: [{ id: text }, { name: new RegExp(`^${text}$`, "i") }] },
          { $or: [{ trackStock: { $ne: true } }, { stock: { $gt: 0 } }] },
        ],
      });
      if (prodDirecto) {
        let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];
        // Precio VIGENTE (F2g): es el que se agrega al carrito
        carrito.producto_actual = {
          id: prodDirecto.id,
          name: prodDirecto.name,
          price: precioVigente(prodDirecto),
        };
        await orderService.setEstado(
          from,
          { paso: "esperando_cantidad", carrito },
          io,
        );

        await this.enviarFotoProducto(from, prodDirecto, io);

        const unitPlural = configManager.get("settings.sales.unitPlural") || "unidades";
        const promptQtyDirect =
          configManager.format("settings.messages.promptQuantityDirect", {
            name: prodDirecto.name,
            price: precioVigente(prodDirecto),
            unitPlural,
          }) ||
          `¿Cuántas *${unitPlural}* deseas agregar? 📦 (Escribe solo el número):`;
        await this._sendYGuardar(
          from,
          `✅ Elegiste *${prodDirecto.name}* (${etiquetaPrecio(prodDirecto)}).\n\n${promptQtyDirect}`,
          io,
        );
      } else {
        await chatFlow.mostrarCategorias(from, io);
      }
    }
  }

  async handleEsperandoProducto({ from, text, low, io, estado }) {
    const producto = await Producto.findOne({
      activo: true,
      $and: [
        { $or: [{ id: text }, { id: low }, { name: new RegExp(`^${text}$`, "i") }] },
        { $or: [{ trackStock: { $ne: true } }, { stock: { $gt: 0 } }] },
      ],
    });

    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];

    if (producto) {
      // Precio VIGENTE (F2g): es el que se agrega al carrito
      carrito.producto_actual = {
        id: producto.id,
        name: producto.name,
        price: precioVigente(producto),
      };
      await orderService.setEstado(
        from,
        { paso: "esperando_cantidad", carrito },
        io,
      );

      await this.enviarFotoProducto(from, producto, io);

      const unitPlural = configManager.get("settings.sales.unitPlural") || "unidades";
      const promptQty =
        configManager.format("settings.messages.promptQuantity", {
          name: producto.name,
          price: precioVigente(producto),
          unitPlural,
        }) ||
        `¿Cuántas *${unitPlural}* deseas agregar? 📦 \n\n (Escribe solo el número):`;
      await this._sendYGuardar(
        from,
        `✅ Elegiste *${producto.name}* (${etiquetaPrecio(producto)}).\n\n${promptQty}`,
        io,
      );
    } else if (low === "volver" || low === "atras") {
      await chatFlow.mostrarCategorias(from, io);
      await orderService.setEstado(from, { paso: "esperando_seleccion" }, io);
    } else {
      await this._sendYGuardar(
        from,
        "⚠️ Producto no encontrado. Por favor, selecciona uno de la lista:\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._",
        io,
      );
      const currentCat = estado.categoria;
      await chatFlow.mostrarProductos(from, io, currentCat);
    }
  }

  async handleEsperandoCantidad({ from, low, io, estado }) {
    const cantidad = parseInt(low);
    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];

    if (!isNaN(cantidad) && cantidad > 0) {
      const prod = carrito.producto_actual;
      if (prod) {
        // VERIFICACIÓN DE STOCK ATÓMICA (solo si trackStock está activo)
        if (prod.id) {
          const productInDb = await Producto.findOne({
            id: prod.id,
            activo: true,
          });
          if (productInDb && productInDb.trackStock) {
            // Verificar que hay suficiente stock
            const alreadyInCart = carrito.items
              .filter((i) => i.producto === prod.name)
              .reduce((sum, i) => sum + i.cantidad, 0);
            const totalRequested = alreadyInCart + cantidad;

            if (totalRequested > productInDb.stock) {
              const disponible = productInDb.stock - alreadyInCart;
              if (disponible <= 0) {
                await this._sendYGuardar(
                  from,
                  `⚠️ *${prod.name}* está agotado. Por favor elige otro producto.`,
                  io,
                );
                await chatFlow.mostrarCategorias(from, io);
                return;
              }
              await this._sendYGuardar(
                from,
                `⚠️ Solo quedan *${disponible}* unidades de *${prod.name}*. Por favor ajusta la cantidad.`,
                io,
              );
              return;
            }
          }
        }

        const existingItem = carrito.items.find(
          (i) => i.producto === prod.name || (prod.id && i.id === prod.id)
        );
        if (existingItem) {
          existingItem.cantidad += cantidad;
          if (prod.price !== undefined) existingItem.price = prod.price;
        } else {
          carrito.items.push({
            id: prod.id,
            producto: prod.name,
            price: prod.price,
            cantidad,
          });
        }
        carrito.producto_actual = null;
        await orderService.setEstado(
          from,
          { paso: "preguntando_mas", carrito },
          io,
        );
        await chatFlow.mostrarPreguntarMas(from, io);
      } else {
        await orderService.setEstado(from, { paso: "esperando_seleccion" }, io);
        await chatFlow.mostrarCategorias(from, io);
      }
    } else {
      await this._sendYGuardar(
        from,
        "⚠️ Por favor, introduce una cantidad válida (número mayor a 0).\n\n💡 _Si deseas cancelar o empezar de nuevo, escribe *CANCELAR*._",
        io,
      );
    }
  }

  /**
   * Ruta compartida para avanzar hacia la confirmación de datos (si el cliente ya es conocido)
   * o solicitar nombre/apellido/cédula (si faltan datos). Reutilizada por completar y pedido web (F2-2).
   */
  async avanzarAConfirmacionODatosCliente({ from, carrito, io }) {
    if (
      carrito.nombre &&
      carrito.cedula &&
      (carrito.ubicacion || carrito.direccion_manual || carrito.envio?.tipo === "retiro")
    ) {
      await orderService.setEstado(
        from,
        { paso: "esperando_confirmacion_datos", carrito },
        io,
      );
      return await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
    } else {
      await orderService.setEstado(
        from,
        { paso: "esperando_datos_cliente", carrito },
        io,
      );
      return await chatFlow.solicitarNombre(from, io);
    }
  }

  async handlePreguntandoMas({ from, low, io, estado }) {
    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];

    if (low === "productos") {
      await chatFlow.mostrarCategorias(from, io);
      await orderService.setEstado(from, { paso: "esperando_seleccion" }, io);
    } else if (
      low === "completar" ||
      low === "finalizar" ||
      low === "web_confirmar" ||
      low === "confirmar"
    ) {
      await this.avanzarAConfirmacionODatosCliente({ from, carrito, io });
    } else {
      await chatFlow.mostrarPreguntarMas(from, io);
    }
  }

  async handleEsperandoDatosCliente({ from, text, io, estado }) {
    const rawText = (text || "").trim();
    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];

    // 1. Validar que no contenga URLs / enlaces web
    const urlRegex =
      /(https?:\/\/|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|net|org|io|co|ve|me|xyz|app|site)\b)/i;
    if (urlRegex.test(rawText)) {
      const msgReintento =
        "⚠️ Por favor, ingresa solo tu *Nombre y Apellido* sin enlaces ni páginas web (máx. 40 caracteres).\n\n_Ejemplo: Juan Pérez 12345678 o Juan Pérez_\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._";
      await this._sendYGuardar(from, msgReintento, io);
      return;
    }

    if (rawText.length < 3) {
      const msgReintento =
        "⚠️ Por favor, introduce tu *Nombre y Apellido* (mínimo 3 letras).\n\n_Ejemplo: Juan Pérez 12345678 o Juan Pérez_\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._";
      await this._sendYGuardar(from, msgReintento, io);
      return;
    }

    // 2. Detección de Cédula (7 a 9 dígitos): Buscar si incluyó la cédula en el mismo mensaje
    const cleanTextForId = rawText.replace(/[\.\-\s]/g, "");
    const idMatch = cleanTextForId.match(/\d{7,9}/);
    let detectedId = null;
    let cleanedName = rawText;

    if (idMatch) {
      detectedId = idMatch[0];
      // Letra de documento pegada al número: V, E, J (RIF), G o P. Sin letra => V.
      const letraDoc = rawText.match(/\b([vejgp])[\s:\-\.]*(?=\d[\d\.\-\s]*\d)/i);
      // Remover el ID y prefijos comunes (CI, V, E, Cédula, DNI) del nombre original
      cleanedName = rawText
        .replace(
          /(?:\b(?:c[eé]dula|dni)\b[:\-\s\.]*|\bc\s*\.?\s*i\s*\.?\b[:\-\s\.]*|\b[vejgp][:\-\s\.]*)?\d[\d\.\-\s]*\d/gi,
          "",
        )
        .replace(detectedId, "")
        .replace(
          /(?:\b(?:c[eé]dula|dni)\b[:\-\s\.]*|\bc\s*\.?\s*i\s*\.?\b[:\-\s\.]*|\b[vejgp]\b[:,\-\s\.]*)/gi,
          "",
        )
        .replace(/[:,\.\-_/]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      carrito.cedula = `${(letraDoc?.[1] || "V").toUpperCase()}-${detectedId}`;
    }

    // Normalizar espacios intermedios
    cleanedName = cleanedName.replace(/\s+/g, " ").trim();

    // 3. Validar que no queden números en el nombre
    if (/\d/.test(cleanedName)) {
      const msgReintento =
        "⚠️ Por favor, ingresa un nombre válido sin números adicionales.\n\n_Ejemplo: Juan Pérez 12345678 o Juan Pérez_\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._";
      await this._sendYGuardar(from, msgReintento, io);
      return;
    }

    // 4. Validar longitud mínima y máxima (3 a 40 caracteres)
    if (cleanedName.length < 3) {
      const msgReintento =
        "⚠️ Por favor, introduce tu *Nombre y Apellido* completo (mínimo 3 letras).\n\n_Ejemplo: Juan Pérez 12345678 o Juan Pérez_\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._";
      await this._sendYGuardar(from, msgReintento, io);
      return;
    }

    if (cleanedName.length > 40) {
      const msgReintento =
        "⚠️ El nombre ingresado es muy largo (máximo 40 caracteres). Por favor, ingresa solo tu *Nombre y Apellido*.\n\n_Ejemplo: Juan Pérez_\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._";
      await this._sendYGuardar(from, msgReintento, io);
      return;
    }

    // 5. Validar caracteres permitidos: solo letras (incluyendo acentos, diéresis y ñ) y espacios
    const regexSoloLetras = /^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/;
    if (!regexSoloLetras.test(cleanedName)) {
      const msgReintento =
        "⚠️ Por favor ingresa solo tu *Nombre y Apellido*, sin caracteres especiales, símbolos ni emojis (máx. 40 caracteres).\n\n_Ejemplo: Juan Pérez 12345678 o Juan Pérez_\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._";
      await this._sendYGuardar(from, msgReintento, io);
      return;
    }

    carrito.nombre = cleanedName;

    if (carrito.cedula) {
      try {
        await orderService.crearPedidoInicial(from, carrito, io);
        await this.solicitarPasoTrasDatosPersonales(from, carrito, io);
      } catch (err) {
        console.error(`❌ Error creando pedido:`, err.message);
        await this._sendYGuardar(
          from,
          "⚠️ Error técnico al registrar tu orden. Escribe *Menú* para intentar de nuevo.",
          io,
        );
      }
    } else {
      await orderService.setEstado(
        from,
        { paso: "esperando_cedula", carrito },
        io,
      );
      await chatFlow.solicitarCedula(from, io);
    }
  }

  async solicitarPasoTrasDatosPersonales(from, carrito, io) {
    // Entrega ya elegida en la tienda (F2c): directo a confirmar, sin volver a preguntarla
    if (carrito.envio?.desdeWeb && (carrito.envio.tipo === "retiro" || carrito.ubicacion || carrito.direccion_manual)) {
      await orderService.setEstado(from, { paso: "esperando_confirmacion_datos", carrito }, io);
      await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
      return;
    }

    let metodos = [];
    try {
      metodos = await MetodoEnvio.find({ activo: true }).sort({ orden: 1, createdAt: 1 });
    } catch (err) {
      console.error("❌ Error consultando métodos de envío:", err.message);
    }

    if (!metodos || metodos.length === 0) {
      if (carrito.ubicacion || carrito.direccion_manual) {
        await orderService.setEstado(
          from,
          { paso: "esperando_confirmacion_datos", carrito },
          io,
        );
        await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
      } else {
        await orderService.setEstado(
          from,
          { paso: "esperando_ubicacion", carrito },
          io,
        );
        await chatFlow.solicitarUbicacion(from, io);
      }
    } else if (metodos.length === 1) {
      const m = metodos[0];
      const esRetiro = m.tipo === "retiro";
      carrito.envio = {
        metodoId: m._id ? m._id.toString() : undefined,
        nombre: m.nombre,
        tipo: m.tipo,
        costo: esRetiro ? 0 : (m.costoTipo === "fijo" ? (Number(m.costo) || 0) : 0),
        costoTipo: esRetiro ? "fijo" : m.costoTipo,
        aConvenir: esRetiro ? false : (m.costoTipo === "a_convenir"),
        // Cobro a destino: el cliente le paga el envío a la empresa al recibirlo (no suma al total)
        ...(!esRetiro && m.cobroADestino === true ? { cobroADestino: true, aConvenir: false, costo: 0 } : {}),
        empresa: "",
        direccion: m.direccion || "",
        horario: m.horario || "",
      };
      await orderService.actualizarPedido(from, { envio: carrito.envio });

      if (esRetiro) {
        const horarioTexto =
          m.horario && m.horario.trim()
            ? m.horario.trim()
            : formatearHorarioAtencion();
        const msgRetiro = `📍 *Punto de retiro:* ${m.direccion || "Dirección de retiro"}\n⏰ *Horario de entrega:* ${horarioTexto}`;
        await this._sendYGuardar(from, msgRetiro, io);
        await orderService.setEstado(
          from,
          { paso: "esperando_confirmacion_datos", carrito },
          io,
        );
        await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
        return;
      }

      // Envío nacional con empresas configuradas: el cliente elige una antes de los datos de entrega
      if (empresasDeEnvio(m).length) {
        await this.pedirEmpresaEnvio(from, carrito, m, io);
        return;
      }

      if (carrito.ubicacion || carrito.direccion_manual) {
        await orderService.setEstado(
          from,
          { paso: "esperando_confirmacion_datos", carrito },
          io,
        );
        await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
      } else {
        await orderService.setEstado(
          from,
          { paso: "esperando_ubicacion", carrito },
          io,
        );
        if (m.pideDatos && m.pideDatos.trim()) {
          const msg = `📍 Por favor indícanos: *${m.pideDatos.trim()}*\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._`;
          await this._sendYGuardar(from, msg, io);
        } else {
          await chatFlow.solicitarUbicacion(from, io);
        }
      }
    } else {
      await orderService.setEstado(
        from,
        { paso: "esperando_metodo_envio", carrito },
        io,
      );
      await chatFlow.solicitarMetodoEnvio(from, metodos, io);
    }
  }

  /** Pide al cliente la empresa de envío (lista de WhatsApp) y avisa si el envío es cobro a destino. */
  async pedirEmpresaEnvio(from, carrito, metodo, io) {
    await orderService.setEstado(from, { paso: "esperando_empresa_envio", carrito }, io);
    const empresas = empresasDeEnvio(metodo);
    const aviso = metodo.cobroADestino
      ? "\n\n💡 Todos los envíos son *cobro a destino*: el costo del envío lo pagas al recibirlo o retirarlo en la agencia."
      : "";
    await this.enviarYRegistrar(
      from,
      {
        tipo: "lista",
        texto: `📦 *Empresa de envío*\n\n¿Con qué empresa prefieres que te lo enviemos?${aviso}`,
        textoGuardar: "Empresas de envío enviadas",
        buttonText: "Ver empresas",
        sections: [
          {
            title: "Empresas",
            rows: empresas.map((nombre, i) => ({ id: `empresa_${i}`, title: nombre.substring(0, 24) })),
          },
        ],
      },
      io
    );
  }

  /** Paso esperando_empresa_envio: guarda la empresa elegida (de la lista o escrita) y sigue con los datos de entrega. */
  async handleEsperandoEmpresaEnvio({ from, text, listReplyId, io, estado }) {
    const carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];
    let metodo = null;
    try {
      metodo = carrito.envio?.metodoId ? await MetodoEnvio.findById(carrito.envio.metodoId) : null;
    } catch (err) {
      console.warn("⚠️ [Envío] No se pudo consultar el método de envío:", err.message);
    }
    const empresas = empresasDeEnvio(metodo);
    // El método cambió o ya no tiene empresas: seguir sin preguntar
    if (!metodo || metodo.activo === false || empresas.length === 0) {
      return this.solicitarPasoTrasDatosPersonales(from, { ...carrito, envio: undefined }, io);
    }

    let elegida = "";
    if (listReplyId && /^empresa_\d+$/.test(listReplyId)) {
      elegida = empresas[Number(listReplyId.replace("empresa_", ""))] || "";
    }
    if (!elegida && text) {
      const norm = text.trim().toLowerCase();
      elegida = empresas.find((e) => e.toLowerCase() === norm) || empresas.find((e) => norm.includes(e.toLowerCase())) || "";
    }
    if (!elegida) {
      await this._sendYGuardar(from, "⚠️ Por favor, elige una empresa de la lista.\n\n💡 _Si deseas cancelar o empezar desde cero, escribe *CANCELAR*._", io);
      return this.pedirEmpresaEnvio(from, carrito, metodo, io);
    }

    carrito.envio = { ...carrito.envio, empresa: elegida };
    await orderService.actualizarPedido(from, { envio: carrito.envio });

    if (carrito.ubicacion || carrito.direccion_manual) {
      await orderService.setEstado(from, { paso: "esperando_confirmacion_datos", carrito }, io);
      return chatFlow.solicitarConfirmacionDatos(from, carrito, io);
    }
    await orderService.setEstado(from, { paso: "esperando_ubicacion", carrito }, io);
    if (metodo.pideDatos && metodo.pideDatos.trim()) {
      return this._sendYGuardar(
        from,
        `📍 Por favor indícanos: *${metodo.pideDatos.trim()}*\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._`,
        io
      );
    }
    return chatFlow.solicitarUbicacion(from, io);
  }

  async handleEsperandoCedula({ from, text, io, estado }) {
    const rawText = text ? text.trim() : "";
    const documentoId = parseDocumentoIdentidad(rawText);
    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];

    if (documentoId) {
      carrito.cedula = documentoId;
      try {
        await orderService.crearPedidoInicial(from, carrito, io);
        await this.solicitarPasoTrasDatosPersonales(from, carrito, io);
      } catch (err) {
        console.error(`❌ Error en flujo:`, err.message);
        await this._sendYGuardar(
          from,
          "⚠️ Error técnico al registrar tus datos.",
          io,
        );
      }
    } else {
      await this._sendYGuardar(
        from,
        "⚠️ Cédula inválida. Por favor, introduce tu documento con su letra si aplica (7 a 9 dígitos, ej: V-12345678, E-12345678 o J-123456789).\n\n💡 Si deseas reiniciar este proceso, escribe *CANCELAR* para volver al menú.",
        io,
      );
    }
  }

  /**
   * Envía la foto principal del producto antes de pedir la cantidad (F0-9).
   * Solo si tiene foto y settings.features.sendProductImage no es false. Si falla, el flujo sigue.
   */
  async enviarFotoProducto(from, producto, io) {
    const url = producto?.imagenes?.[0]?.url;
    if (!url || configManager.get("settings.features.sendProductImage") === false) return;
    const desc = producto.description ? `\n${producto.description}` : "";
    const pct = descuentoVigente(producto);
    const etiqueta = `$${formatUsd(precioVigente(producto))}${pct > 0 ? ` (-${pct}%)` : ""}`;
    const caption = `${producto.name} — ${etiqueta}${desc}`;
    try {
      // enviarImagenPorUrl devuelve false si WhatsApp rechaza el envío (no lanza)
      const enviado = await whatsapp.enviarImagenPorUrl(from, url, caption);
      if (!enviado) {
        console.warn(`⚠️ No se pudo enviar la foto del producto (${producto.name}); se sigue sin ella.`);
        return;
      }
      const wamid = typeof enviado === "string" ? enviado : null;
      if (orderService.emitirYGuardar) {
        await orderService.emitirYGuardar(from, caption, "bot", io, "image", null, wamid, "sent", null, url);
      }
    } catch (imgErr: any) {
      console.warn(`⚠️ Error enviando la foto del producto (${producto.name}):`, imgErr.message);
    }
  }

  async procesarIntencionRetiro({ from, io, estado }) {
    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];

    const metodoRetiro = await MetodoEnvio.findOne({
      tipo: "retiro",
      activo: true,
    }).sort({ orden: 1, createdAt: 1 });
    if (!metodoRetiro) {
      const msgNoDisponible =
        configManager.get("settings.messages.pickupUnavailable") ||
        "Actualmente no disponemos de punto de retiro físico activo. Todas nuestras entregas se coordinan por delivery o envío nacional. Si tienes alguna duda, un asesor puede atenderte.";
      const buttons = [{ id: "hablar_asesor", title: "💬 Hablar con Asesor" }];
      await this.enviarYRegistrar(
        from,
        {
          tipo: "botones",
          texto: msgNoDisponible,
          buttons,
        },
        io
      );
      return false;
    }

    const tipoAnterior = carrito.envio?.tipo;
    const cambioTrasCotizar = Boolean(tipoAnterior && tipoAnterior !== "retiro");

    carrito.envio = {
      metodoId: metodoRetiro._id ? metodoRetiro._id.toString() : undefined,
      nombre: metodoRetiro.nombre,
      tipo: "retiro",
      costo: 0,
      costoTipo: "fijo",
      aConvenir: false,
      direccion: metodoRetiro.direccion || "",
      horario: metodoRetiro.horario || "",
      cambioTrasCotizar,
    };

    await orderService.actualizarPedido(from, { envio: carrito.envio });

    const horarioTexto =
      metodoRetiro.horario && metodoRetiro.horario.trim()
        ? metodoRetiro.horario.trim()
        : formatearHorarioAtencion();
    const msgRetiro = `📍 *Punto de retiro:* ${metodoRetiro.direccion || "Dirección de retiro"}\n⏰ *Horario de entrega:* ${horarioTexto}`;
    await this._sendYGuardar(from, msgRetiro, io);

    await orderService.setEstado(
      from,
      { paso: "esperando_confirmacion_datos", carrito },
      io,
    );
    await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
    return true;
  }

  async handleEsperandoMetodoEnvio({ from, text, listReplyId, io, estado }) {
    try {
      let carrito = estado.carrito || { items: [] };
      if (!carrito.items) carrito.items = [];

      // Interceptar si el usuario escribe una frase de retiro
      if (text && quiereRetirar(text)) {
        await this.procesarIntencionRetiro({ from, io, estado });
        return;
      }

      const metodos = await MetodoEnvio.find({ activo: true }).sort({ orden: 1, createdAt: 1 });
      if (!metodos || metodos.length === 0) {
        return this.solicitarPasoTrasDatosPersonales(from, carrito, io);
      }

      let seleccionado = null;
      if (listReplyId && listReplyId.startsWith("envio_")) {
        const idTarget = listReplyId.replace(/^envio_/, "");
        seleccionado = metodos.find((m) => String(m._id) === idTarget);
      }

      if (!seleccionado && text) {
        const norm = text.toLowerCase().trim();
        seleccionado = metodos.find(
          (m) =>
            String(m._id) === norm ||
            (m.nombre && m.nombre.toLowerCase() === norm),
        );
        if (!seleccionado) {
          seleccionado = metodos.find(
            (m) =>
              (m.nombre && m.nombre.toLowerCase().includes(norm)) ||
              (m.tipo && m.tipo.toLowerCase().includes(norm)),
          );
        }
      }

      if (!seleccionado) {
        const msgError =
          "⚠️ Por favor, selecciona una opción de la lista de métodos de entrega.\n\n" +
          "💡 _Si deseas cancelar o empezar desde cero, escribe *CANCELAR*._";
        await this._sendYGuardar(from, msgError, io);
        await chatFlow.solicitarMetodoEnvio(from, metodos, io);
        return;
      }

      const esRetiro = seleccionado.tipo === "retiro";
      const tipoAnterior = carrito.envio?.tipo;
      const cambioTrasCotizar = Boolean(
        tipoAnterior && tipoAnterior !== seleccionado.tipo,
      );

      carrito.envio = {
        metodoId: seleccionado._id ? seleccionado._id.toString() : undefined,
        nombre: seleccionado.nombre,
        tipo: seleccionado.tipo,
        costo: esRetiro
          ? 0
          : seleccionado.costoTipo === "fijo"
            ? Number(seleccionado.costo) || 0
            : 0,
        costoTipo: esRetiro ? "fijo" : seleccionado.costoTipo,
        aConvenir: esRetiro ? false : seleccionado.costoTipo === "a_convenir",
        // Cobro a destino: el cliente le paga el envío a la empresa al recibirlo (no suma al total)
        ...(!esRetiro && seleccionado.cobroADestino === true ? { cobroADestino: true, aConvenir: false, costo: 0 } : {}),
        empresa: "",
        direccion: seleccionado.direccion || "",
        horario: seleccionado.horario || "",
        cambioTrasCotizar,
      };

      await orderService.actualizarPedido(from, { envio: carrito.envio });

      if (esRetiro) {
        const horarioTexto =
          seleccionado.horario && seleccionado.horario.trim()
            ? seleccionado.horario.trim()
            : formatearHorarioAtencion();
        const msgRetiro = `📍 *Punto de retiro:* ${seleccionado.direccion || "Dirección de retiro"}\n⏰ *Horario de entrega:* ${horarioTexto}`;
        await this._sendYGuardar(from, msgRetiro, io);
        await orderService.setEstado(
          from,
          { paso: "esperando_confirmacion_datos", carrito },
          io,
        );
        await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
        return;
      }

      // Envío nacional con empresas configuradas: el cliente elige una antes de los datos de entrega
      if (empresasDeEnvio(seleccionado).length) {
        await this.pedirEmpresaEnvio(from, carrito, seleccionado, io);
        return;
      }

      if (carrito.ubicacion || carrito.direccion_manual) {
        await orderService.setEstado(
          from,
          { paso: "esperando_confirmacion_datos", carrito },
          io,
        );
        await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
      } else {
        await orderService.setEstado(
          from,
          { paso: "esperando_ubicacion", carrito },
          io,
        );
        if (seleccionado.pideDatos && seleccionado.pideDatos.trim()) {
          const msg = `📍 Por favor indícanos: *${seleccionado.pideDatos.trim()}*\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._`;
          await this._sendYGuardar(from, msg, io);
        } else {
          await chatFlow.solicitarUbicacion(from, io);
        }
      }
    } catch (err) {
      console.error("❌ Error en handleEsperandoMetodoEnvio:", err.message);
      await this._sendYGuardar(
        from,
        "⚠️ Error procesando método de entrega. Escribe *CANCELAR* para intentar de nuevo.",
        io,
      );
    }
  }

  async handleEsperandoUbicacion({ from, tipo, location, text, io, estado }) {
    try {
      let updatedInfo: any = {};
      let carrito = estado.carrito || { items: [] };
      if (!carrito.items) carrito.items = [];

      if (tipo === "location" && location) {
        let textStr = "";
        const locParts = [];
        if (location.name) locParts.push(location.name);
        if (location.address) locParts.push(location.address);

        if (locParts.length > 0) {
          textStr = locParts.join(" - ");
        } else if (location.latitude && location.longitude) {
          try {
            const brandName = configManager.get("settings.brandName") || "ReplyBot";
            const contactEmail = require("./datosNegocioService").getDatosNegocioSync().contacto.email;
            const userAgent = contactEmail ? `${brandName}/1.0 (${contactEmail})` : `${brandName}/1.0`;
            const geoRes = await axios.get(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.latitude}&lon=${location.longitude}`,
              {
                headers: { "User-Agent": userAgent },
                timeout: 2500,
              }
            );
            if (geoRes.data) {
              if (geoRes.data.address) {
                const a = geoRes.data.address;
                const parts = [
                  a.road || a.pedestrian || a.street,
                  a.suburb || a.neighbourhood || a.residential || a.quarter,
                  a.county || a.city || a.town,
                ].filter(Boolean);
                const uniqueParts = [...new Set(parts)];
                if (uniqueParts.length > 0) {
                  textStr = uniqueParts.join(", ");
                }
              }
              if (!textStr && geoRes.data.display_name) {
                textStr = geoRes.data.display_name.split(", ").slice(0, 3).join(", ");
              }
            }
          } catch (geoErr) {
            console.warn("⚠️ [Nominatim] Geocoding inverso no disponible:", geoErr.message);
          }
        }

        if (!textStr) {
          textStr = "Ubicación GPS";
        }

        carrito.ubicacion = {
          ...location,
          direccion: textStr,
        };

        updatedInfo = {
          "ubicacion.latitud": location.latitude,
          "ubicacion.longitud": location.longitude,
          "ubicacion.direccion": textStr,
        };
      } else if (tipo === "text" && text) {
        carrito.direccion_manual = text;
        updatedInfo = {
          "ubicacion.direccion": text,
          "ubicacion.latitud": null,
          "ubicacion.longitud": null,
        };
      }

      if (Object.keys(updatedInfo).length > 0) {
        await orderService.actualizarPedido(from, updatedInfo);
        await orderService.setEstado(
          from,
          { paso: "esperando_notas", carrito },
          io,
        );
        await chatFlow.solicitarNotas(from, io);
      } else {
        await this._sendYGuardar(
          from,
          "📍 Por favor, envía tu *ubicación actual* (pin) o *escribe tu dirección completa* manualmente.\n\n💡 _Si deseas empezar de nuevo en cualquier momento, escribe *CANCELAR*._",
          io,
        );
      }
    } catch (err) {
      console.error(`❌ Error guardando ubicación:`, err.message);
      await this._sendYGuardar(
        from,
        "⚠️ Hubo un error al guardar tu dirección.",
        io,
      );
    }
  }

  async handleEsperandoNotas({ from, text, io, estado }) {
    try {
      let carrito = estado.carrito || { items: [] };
      if (!carrito.items) carrito.items = [];
      const noteText = text ? text.trim() : "";

      if (noteText.toUpperCase() !== "NINGUNA") {
        carrito.notas = noteText;
        const updatePayload: any = { notas: noteText };

        await orderService.actualizarPedido(from, updatePayload);
      }

      await orderService.setEstado(
        from,
        { paso: "esperando_confirmacion_datos", carrito },
        io,
      );
      await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
    } catch (err) {
      console.error(`❌ Error guardando notas:`, err.message);
      await this._sendYGuardar(
        from,
        "⚠️ Hubo un error al procesar tu nota. Intenta de nuevo.",
        io,
      );
    }
  }

  async handleEsperandoConfirmacionDatos({ from, text, low, io, estado }) {
    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];

    // Si el usuario expresa intención de retirar en persona tras haber cotizado delivery
    if (quiereRetirar(text || low)) {
      await this.procesarIntencionRetiro({ from, io, estado });
      return;
    }

    if (low === "datos_correctos") {
      await orderService.setEstado(from, { paso: "esperando_pago_metodo" }, io);
      await chatFlow.solicitarMetodoPago(from, io);
    } else if (low === "modificar_datos") {
      await chatFlow.mostrarOpcionesEdicion(from, io);
    } else if (low === "editar_nombre") {
      await orderService.setEstado(
        from,
        { paso: "esperando_datos_cliente" },
        io,
      );
      await chatFlow.solicitarNombre(from, io);
    } else if (low === "editar_cedula") {
      await orderService.setEstado(from, { paso: "esperando_cedula" }, io);
      await chatFlow.solicitarCedula(from, io);
    } else if (low === "editar_envio") {
      let metodos = [];
      try {
        metodos = await MetodoEnvio.find({ activo: true }).sort({ orden: 1, createdAt: 1 });
      } catch (_) {}
      if (metodos && metodos.length > 1) {
        await orderService.setEstado(
          from,
          { paso: "esperando_metodo_envio", carrito },
          io,
        );
        await chatFlow.solicitarMetodoEnvio(from, metodos, io);
      } else {
        const nombreMetodo = (metodos && metodos[0] && metodos[0].nombre) || "Entrega estándar";
        await this._sendYGuardar(
          from,
          `ℹ️ Solo hay un método de entrega disponible (*${nombreMetodo}*).`,
          io,
        );
        await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
      }
    } else if (low === "editar_direccion") {
      await orderService.setEstado(from, { paso: "esperando_ubicacion" }, io);
      await chatFlow.solicitarUbicacion(from, io);
    } else if (low === "editar_pedido") {
      carrito.items = [];
      await orderService.setEstado(
        from,
        { paso: "esperando_producto", carrito },
        io,
      );
      await chatFlow.mostrarProductos(from, io);
    } else {
      await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
    }
  }

  async handleEsperandoPagoMetodo({ from, text, low, io, estado }) {
    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];

    // Si el usuario en el paso de pago decide retirar en persona
    if (quiereRetirar(text || low)) {
      await this.procesarIntencionRetiro({ from, io, estado });
      return;
    }

    const totalUsd = orderService.calcularTotalCarrito(carrito);

    if (low === "efectivo") {
      carrito.pago = "efectivo";
      await orderService.setEstado(
        from,
        { paso: "esperando_efectivo_opcion", carrito },
        io,
      );
      await chatFlow.solicitarOpcionesEfectivo(from, io, totalUsd);
      return;
    }

    let selectedMethod = null;
    const mongoose = require("mongoose");
    if (mongoose.Types.ObjectId.isValid(low)) {
      selectedMethod = await MetodoPago.findById(low);
    } else {
      selectedMethod = await MetodoPago.findOne({ tipo: low, activo: true });
    }

    if (selectedMethod) {
      carrito.pago = selectedMethod._id.toString();
      carrito.pagoNombre =
        selectedMethod.nombre || selectedMethod.tipo || "Pago Digital";
      try {
        const msgInstrucciones = await orderService.generarInstruccionesPago(
          from,
          carrito,
        );
        await orderService.setEstado(
          from,
          { paso: "esperando_comprobante", carrito },
          io,
        );
        await chatFlow.solicitarComprobante(from, msgInstrucciones, io);
      } catch (err) {
        console.error(`❌ Error procesando método de pago:`, err.message);
        await this._sendYGuardar(
          from,
          "⚠️ Error técnico al procesar el pago.",
          io,
        );
      }
    } else {
      await this._sendYGuardar(
        from,
        "⚠️ Opción de pago no reconocida. Selecciona una opción válida.\n\n💡 _Si deseas cancelar tu pedido o empezar de nuevo, escribe *CANCELAR*._",
        io,
      );
      await chatFlow.solicitarMetodoPago(from, io);
    }
  }

  async handleEsperandoEfectivoOpcion({ from, low, io, estado }) {
    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];
    const totalUsd = orderService.calcularTotalCarrito(carrito);

    if (low === "efectivo_exacto") {
      carrito.pagoCon = totalUsd;
      carrito.vuelto = 0;
      await orderService.setEstado(
        from,
        { paso: "esperando_comprobante", carrito },
        io,
      );
      const msg = `💵 Elegiste *Monto Exacto* ($${formatUsd(totalUsd)}).\n\nPor favor, ten el dinero listo al recibir tu pedido. Para finalizar, envía una *foto* de los billetes o una confirmación visual.`;
      await this._sendYGuardar(from, msg, io);
    } else if (low === "efectivo_mixto") {
      await orderService.setEstado(
        from,
        { paso: "esperando_efectivo_monto", carrito, meta: "mixto" },
        io,
      );
      await chatFlow.solicitarMontoEfectivoParcial(from, io, totalUsd);
    } else if (low === "efectivo_vuelto") {
      await orderService.setEstado(
        from,
        { paso: "esperando_efectivo_monto", carrito, meta: "vuelto" },
        io,
      );
      const msg = `⚖️ *Pago con Vuelto*\n\n¿Cuanto sera tu monto a entregar? (Ejemplo: 20, 50, 100).\n\nCalcularemos tu vuelto de inmediato.`;
      await this._sendYGuardar(from, msg, io);
    }
  }

  async handleEsperandoEfectivoMonto({ from, low, io, estado }) {
    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];
    const orderTotal = orderService.calcularTotalCarrito(carrito);
    const montoIngresado = parseFloat(low.replace(/[^0-9.]/g, ""));
    const modo = estado.meta; // "mixto" o "vuelto"

    if (!modo) {
      console.warn(
        `[Bot] Meta missing for ${from} in esperando_efectivo_monto.`,
      );
      await this._sendYGuardar(
        from,
        "⚠️ Lo siento, perdí el hilo de la conversación. Por favor, selecciona nuevamente tu método de pago.",
        io,
      );
      await orderService.setEstado(from, { paso: "esperando_pago_metodo" }, io);
      await chatFlow.solicitarMetodoPago(from, io);
      return;
    }

    if (isNaN(montoIngresado) || montoIngresado <= 0) {
      await this._sendYGuardar(
        from,
        "⚠️ Por favor, introduce un número válido.\n\n💡 _Escribe *CANCELAR* si deseas empezar de nuevo._",
        io,
      );
      return;
    }

    if (modo === "mixto") {
      if (montoIngresado >= orderTotal) {
        const errorMsg = `⚠️ El monto ingresado ($${formatUsd(montoIngresado)}) cubre el total ($${formatUsd(orderTotal)}). Para pagar todo en efectivo elige "Monto Exacto".`;
        await this._sendYGuardar(from, errorMsg, io);
        return;
      }

      const restoUSD = orderTotal - montoIngresado;
      const tasaRes = await obtenerTasaUSD();
      const tasa = tasaRes?.tasa || 0;
      const restoVES = Math.round(restoUSD * tasa * 100) / 100;

      const nuevoCarrito = { ...carrito };
      nuevoCarrito.pagoEfectivo = montoIngresado;
      nuevoCarrito.pagoDigitalUSD = restoUSD;
      nuevoCarrito.pagoDigitalVES = restoVES;
      nuevoCarrito.pago = "Pago Mixto"; // Identificador para el administrador

      await orderService.setEstado(
        from,
        { paso: "esperando_comprobante", carrito: nuevoCarrito },
        io,
      );

      const successMsg =
        `🌓 *Pago Mixto Configurado*\n\n` +
        `💵 *Efectivo: a Entregar* $${formatUsd(montoIngresado)}\n` +
        `💰 *Restante en USD:* $${formatUsd(restoUSD)}\n` +
        `💳 *Restante a Cancelar en Bs:* Bs. ${formatBs(restoVES)} (Tasa: ${tasa})\n\n` +
        `Por favor, realiza el *Pago Móvil* por el monto en Bs. y envía el *comprobante* por aquí para finalizar.`;

      await this._sendYGuardar(from, successMsg, io);
    } else if (modo === "vuelto") {
      if (montoIngresado < orderTotal) {
        const errorMsg = `⚠️ El monto indicado ($${formatUsd(montoIngresado)}) es menor al total ($${formatUsd(orderTotal)}).`;
        await this._sendYGuardar(from, errorMsg, io);
      } else {
        carrito.pagoCon = montoIngresado;
        carrito.vuelto = Math.round((montoIngresado - orderTotal) * 100) / 100;
        await orderService.setEstado(
          from,
          { paso: "esperando_comprobante", carrito },
          io,
        );
        const successMsg = `✅ ¡Entendido! Pagas con $${formatUsd(montoIngresado)}.\n\n💰 *Tu vuelto será de:* $${formatUsd(carrito.vuelto)} USD.\n\nPara finalizar, envía una *foto* de los billetes o una confirmación visual.`;
        await this._sendYGuardar(from, successMsg, io);
      }
    }
  }

  async handlePendienteComprobante({ from, tipo, mediaId, io, estado }) {
    if (tipo === "image" && mediaId) {
      const { descargarMedia } = require("./whatsapp");
      const { uploadFromBuffer } = require("./cloudinaryService");
      let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];

      let permanentUrl = null;
      try {
        const buffer = await descargarMedia(mediaId);
        if (buffer) {
          permanentUrl = await uploadFromBuffer(buffer, "vouchers");
          console.log(`✅ [Cloudinary] Comprobante subido: ${permanentUrl}`);
        }
      } catch (error) {
        console.error("❌ Error Cloudinary:", error.message);
      }

      try {
        const finalDoc = await orderService.finalizarPedidoConComprobante(
          from,
          carrito,
          mediaId,
          permanentUrl,
          io,
        );
        if (finalDoc) {
          await orderService.setEstado(
            from,
            { paso: "pendiente_verificacion", etiqueta: "comprado" },
            io,
          );
          
          // Entrar en modo manual inmediatamente al subir comprobante
          await orderService.setModo(from, "manual", io);

          await chatFlow.informarPendienteVerificacion(from, io);

          // Notificación de nuevo pago al Administrador (Soporta múltiples números)
          const adminPhones = [
            getConfig("ADMIN_PHONE_NUMBER"),
            getConfig("ADMIN_PHONE_NUMBER_2"),
          ].filter(Boolean);

          if (adminPhones.length > 0) {
            try {
              const idForm =
                finalDoc.idFormateado || finalDoc.correlativo || finalDoc._id;

              // Notificación Push Móvil a Administradores (solo panel web/pwa)
              pushService
                .sendToAllAdmins({
                  title: "💰 Nuevo Comprobante Recibido",
                  body: `Pedido #${idForm} de ${finalDoc.cliente?.nombre || finalDoc.whatsappId} listo para verificar.`,
                  url: "/panel",
                  tag: `receipt-${idForm}`,
                })
                .catch((e) =>
                  console.warn("Error enviando push notification:", e.message),
                );
            } catch (errAdmin) {
              console.error(
                `❌ Error procesando notificaciones de admin (Push):`,
                errAdmin.message,
              );
            }
          }
        } else {
          await this._sendYGuardar(
            from,
            "⚠️ Ya hemos registrado un comprobante para este pedido. Nuestro equipo lo está verificando.",
            io,
          );
        }
      } catch (err) {
        console.error(`❌ Error finalizando pedido:`, err.message);
        // Solo mostrar error al cliente si el pedido NO fue registrado en absoluto
        // (si fue reclamado parcialmente, orderService ya lo maneja y retorna el doc)
        await this._sendYGuardar(
          from,
          "⚠️ Hubo un problema al registrar tu comprobante. Por favor intenta enviarlo nuevamente o contacta al administrador.",
          io,
        );
      }
    } else {
      await this._sendYGuardar(
        from,
        "📷 Por favor, envía la foto del comprobante de pago.\n\n💡 _Si deseas cancelar o empezar de nuevo, escribe *CANCELAR*._",
        io,
      );
    }
  }

  async handlePendienteVerificacion({ from, tipo, text, io, estado }) {
    if (tipo === "text" || tipo === "interactive") {
      const newCount = (estado.mensajesEnEsperaCount || 0) + 1;
      await orderService.setEstado(
        from,
        { mensajesEnEsperaCount: newCount },
        io,
      );

      if (newCount >= 5) {
        const Etiqueta = require("../models/Etiqueta");
        await Etiqueta.findOneAndUpdate({ telefono: from }, { stuck: true });
        if (io) {
          io.emit("alerta_cliente_trabado", {
            telefono: from,
            estado: "pendiente_verificacion",
            mensaje: text,
          });
        }
      }
    }
    console.log(
      `[Bot] ${from} espera verificación manual. (Msgs: ${estado.mensajesEnEsperaCount || 0})`,
    );
  }

  /**
   * Procesa la intercepción de un código de pedido web (F2-2).
   * Maneja los 6 casos del diseño (§3 de docs/f2-catalogo-web.md) con reclamo atómico en CarritoWeb.
   */
  async procesarCodigoPedidoWeb({ from, codigo, io, forzarReemplazo = false }: { from: string; codigo: string; io: any; forzarReemplazo?: boolean }) {
    const estado = await orderService.getEstado(from);
    const pasoActual = estado?.paso || "inicio";

    // 1. Si está en un paso de pago o verificación: no carga nada y avisa
    const pasosPago = [
      "esperando_pago_metodo",
      "esperando_efectivo_opcion",
      "esperando_efectivo_monto",
      "esperando_comprobante",
      "pendiente_verificacion",
    ];

    if (pasosPago.includes(pasoActual)) {
      const msgBusy =
        configManager.get("settings.messages.webOrderBusy") ||
        "⚠️ Ya tienes un pedido en proceso de pago o verificación. Por favor completa tu pedido actual o escribe *CANCELAR* si deseas empezar desde cero.";
      await this.enviarYRegistrar(from, { tipo: "texto", texto: msgBusy }, io);
      return;
    }

    // 2. Si ya tiene un carrito a medias en el chat con productos y es un código distinto
    const carritoActual = estado?.carrito || { items: [] };
    const itemsEnCarrito = Array.isArray(carritoActual.items) ? carritoActual.items : [];

    if (!forzarReemplazo && itemsEnCarrito.length > 0 && carritoActual.codigoWeb !== codigo) {
      const brandName = configManager.get("settings.brandName");
      const itemsCount = itemsEnCarrito.reduce(
        (acc: number, it: any) => acc + (Number(it.cantidad) || 1),
        0
      );
      const msgReplace =
        configManager.format("settings.messages.webOrderReplaceAsk", {
          codigo,
          itemsCount,
          brandName,
        }) ||
        `🛒 Ya tienes un pedido en preparación en el chat con ${itemsCount} productos.\n\n¿Deseas reemplazar tu carrito actual por el pedido web *${codigo}*?`;

      const buttons = [
        { id: "web_reemplazar", title: "🔄 Reemplazar" },
        { id: "web_mantener", title: "✋ Mantener actual" },
      ];

      await orderService.setEstado(
        from,
        { paso: "esperando_reemplazo_web", codigoWebPendiente: codigo },
        io
      );

      await this.enviarYRegistrar(
        from,
        {
          tipo: "botones",
          texto: msgReplace,
          buttons,
        },
        io
      );
      return;
    }

    // 3. Reclamo atómico: CarritoWeb.findOneAndUpdate
    const ahora = new Date();
    let cwDoc = await CarritoWeb.findOneAndUpdate(
      {
        codigo,
        estado: "pendiente",
        expiraEn: { $gt: ahora },
      },
      {
        $set: {
          estado: "vinculado",
          telefono: from,
        },
      },
      { returnDocument: "after" }
    );

    if (cwDoc && typeof cwDoc.toObject === "function") {
      cwDoc = cwDoc.toObject();
    }

    // 4. Si no se obtuvo documento en el findOneAndUpdate atómico:
    if (!cwDoc) {
      let existing = await CarritoWeb.findOne({ codigo });
      if (existing && typeof existing.toObject === "function") {
        existing = existing.toObject();
      }

      // Caso A: Inexistente o expirado
      if (!existing || new Date(existing.expiraEn).getTime() <= ahora.getTime()) {
        const catalogoOrigen = process.env.CATALOGO_ORIGEN || "";
        const catalogoUrlTexto = catalogoOrigen
          ? `Puedes armarlo de nuevo en ${catalogoOrigen}\n\n`
          : "";
        const msgNotFound =
          configManager.format("settings.messages.webOrderNotFound", {
            codigo,
            catalogoUrl: catalogoOrigen,
            catalogoUrlTexto,
          }) ||
          `⚠️ No encontramos el pedido web *${codigo}* o ya venció (tienen una validez de 3 días).\n\n${catalogoUrlTexto}Puedes explorar nuestro catálogo escribiendo *Menú*.`;

        await this.enviarYRegistrar(from, { tipo: "texto", texto: msgNotFound }, io);
        return;
      }

      // Caso B: Código ya vinculado
      if (existing.estado === "vinculado") {
        // Vinculado por OTRO teléfono
        if (existing.telefono && existing.telefono !== from) {
          const msgUsed =
            configManager.format("settings.messages.webOrderUsed", { codigo }) ||
            `⚠️ El código de pedido web *${codigo}* ya fue vinculado y utilizado anteriormente.\n\nSi necesitas asistencia o deseas realizar una nueva compra, escribe *Menú*.`;
          await this.enviarYRegistrar(from, { tipo: "texto", texto: msgUsed }, io);
          return;
        }

        // Vinculado por este MISMO teléfono y ya convertido en pedido: no se vuelve a cargar
        // (evita un segundo pedido con el mismo carrito web)
        if (existing.pedidoId) {
          const msgYaRegistrado =
            configManager.format("settings.messages.webOrderUsed", { codigo }) ||
            `⚠️ El código de pedido web *${codigo}* ya fue utilizado.`;
          await this.enviarYRegistrar(from, { tipo: "texto", texto: msgYaRegistrado }, io);
          return;
        }

        // Vinculado por este MISMO teléfono (reenvió el código): recargar sin duplicar
        cwDoc = existing;
      }
    }

    // 5. Verificación de cada línea en la BD con precios y stock actuales (sin consultar _id con texto)
    const itemsCargados: Array<{
      id: string;
      producto: string;
      price: number;
      cantidad: number;
    }> = [];
    const avisosCambios: string[] = [];

    for (const it of cwDoc.items || []) {
      const prod = await Producto.findOne({ id: it.productoId });

      if (!prod || prod.activo === false) {
        avisosCambios.push(`• *${it.nombre || it.productoId}* ya no está disponible.`);
        continue;
      }

      const cantidad = Number(it.cantidad) || 1;
      if (prod.trackStock === true) {
        const stockDisponible = Number(prod.stock) || 0;
        if (stockDisponible < cantidad) {
          if (stockDisponible <= 0) {
            avisosCambios.push(`• *${prod.name}* se agotó.`);
          } else {
            // Nunca se dice el stock exacto (R4); solo que no alcanza
            avisosCambios.push(`• *${prod.name}* no tiene disponibilidad suficiente para ${cantidad} ${configManager.get("settings.sales.unitPlural") || "unidades"}.`);
          }
          continue;
        }
      }

      // Precio VIGENTE de la base (F2g); el carrito web se cobra con el que hay hoy
      const precioActual = precioVigente(prod);
      const precioOriginal = Number(it.precio) || 0;

      if (precioActual !== precioOriginal) {
        avisosCambios.push(
          `• *${prod.name}* ahora cuesta $${formatUsd(precioActual)} (antes $${formatUsd(precioOriginal)}).`
        );
      }

      itemsCargados.push({
        id: prod.id,
        producto: prod.name,
        price: precioActual,
        cantidad,
      });
    }

    // 6. Si no queda ninguna línea tras quitar agotados/inactivos:
    if (itemsCargados.length === 0) {
      let msgEmpty =
        configManager.get("settings.messages.webOrderEmpty") ||
        "⚠️ Los productos de tu pedido web ya no se encuentran disponibles en este momento. Te invitamos a consultar nuestro catálogo actualizado escribiendo *Menú*.";
      if (avisosCambios.length > 0) {
        msgEmpty = `ℹ️ *Avisos sobre tu pedido web:*\n${avisosCambios.join("\n")}\n\n${msgEmpty}`;
      }
      await this.enviarYRegistrar(from, { tipo: "texto", texto: msgEmpty }, io);
      return;
    }

    // 7. Si hubo avisos de cambios, enviar aviso informativo
    if (avisosCambios.length > 0) {
      const msgChanged =
        configManager.format("settings.messages.webOrderChanged", {
          cambios: avisosCambios.join("\n"),
        }) || `ℹ️ *Avisos sobre tu pedido web:*\n${avisosCambios.join("\n")}`;
      await this.enviarYRegistrar(from, { tipo: "texto", texto: msgChanged }, io);
    }

    // 8. Cargar líneas en carrito del estado y mostrar resumen
    const nuevoCarrito: any = {
      ...(estado.carrito || {}),
      items: itemsCargados,
      codigoWeb: codigo,
      origenWeb: { codigo },
    };

    // 8b. Entrega elegida en la tienda (F2c): si el método sigue activo, el bot no vuelve a preguntarla
    const lineasEntrega = await this.aplicarEntregaWeb(nuevoCarrito, cwDoc.entrega, from, io);

    const totalUSD = orderService.calcularTotalCarrito(nuevoCarrito);
    const tasaRes = await obtenerTasaUSD();
    const tasa = tasaRes?.tasa || 0;
    const totalVESRaw = totalUSD * tasa;
    const totalVES = totalVESRaw > 0 ? formatBs(totalVESRaw) : "N/A";

    const brandName = configManager.get("settings.brandName");
    const resumenItems =
      itemsCargados.map((i) => `• ${i.producto} x${i.cantidad} — $${formatUsd(i.price * i.cantidad)}`).join("\n") +
      (lineasEntrega.length ? `\n\n${lineasEntrega.join("\n")}` : "");

    const msgLoaded =
      configManager.format("settings.messages.webOrderLoaded", {
        codigo,
        resumen: resumenItems,
        totalUSD: formatUsd(totalUSD),
        totalVES,
        brandName,
      }) ||
      `🛒 *Pedido Web ${codigo} Recibido*\n\n${resumenItems}\n\n💰 *Total:* $${formatUsd(totalUSD)} / Bs. ${totalVES}\n\n¿Deseas confirmar tu pedido?`;

    const buttons = [
      { id: "web_confirmar", title: "✅ Confirmar" },
      { id: "web_agregar_mas", title: "➕ Agregar más" },
    ];

    await orderService.setEstado(
      from,
      {
        paso: "esperando_confirmacion_web",
        carrito: nuevoCarrito,
      },
      io
    );

    await this.enviarYRegistrar(
      from,
      {
        tipo: "botones",
        texto: msgLoaded,
        buttons,
      },
      io
    );
  }

  /**
   * Pasa al carrito del chat la entrega que el cliente eligió en la tienda (F2c): el método (revalidado: debe
   * seguir activo; el costo sale de la base) y la ubicación GPS o la dirección escrita. Devuelve las líneas
   * para el resumen. Si el método ya no está activo, avisa y el bot lo pedirá como siempre.
   */
  async aplicarEntregaWeb(carrito: any, entrega: any, from: string, io: any): Promise<string[]> {
    if (!entrega || !entrega.metodoId) return [];
    let metodo: any = null;
    try {
      metodo = await MetodoEnvio.findById(entrega.metodoId);
    } catch (err) {
      console.warn("⚠️ [Pedido web] No se pudo consultar el método de entrega:", err.message);
    }
    if (!metodo || metodo.activo === false) {
      await this.enviarYRegistrar(
        from,
        { tipo: "texto", texto: `ℹ️ La forma de entrega que elegiste (${entrega.nombre || "entrega"}) ya no está disponible. Te pediremos otra antes de confirmar.` },
        io
      );
      return [];
    }

    const esRetiro = metodo.tipo === "retiro";
    const aConvenir = !esRetiro && metodo.costoTipo === "a_convenir";
    const cobroADestino = !esRetiro && metodo.cobroADestino === true;
    // La empresa elegida en la tienda vale si sigue en la lista del método; si no, el bot la pregunta
    const empresas = empresasDeEnvio(metodo);
    const empresa = empresas.find((e) => e.toLowerCase() === String(entrega.empresa || "").toLowerCase()) || "";
    carrito.envio = {
      metodoId: String(metodo._id),
      nombre: metodo.nombre,
      tipo: metodo.tipo,
      costo: esRetiro || aConvenir || cobroADestino ? 0 : Number(metodo.costo) || 0,
      costoTipo: esRetiro ? "fijo" : metodo.costoTipo,
      aConvenir: aConvenir && !cobroADestino,
      cobroADestino,
      empresa,
      direccion: metodo.direccion || "",
      horario: metodo.horario || "",
      // Sin la empresa (si el método la pide), el bot no salta los pasos de entrega
      desdeWeb: empresas.length === 0 || Boolean(empresa),
    };

    const lineas = [`🚚 *Entrega:* ${metodo.nombre}${cobroADestino ? " (cobro a destino)" : ""}`];
    if (empresa) lineas.push(`📦 *Empresa de envío:* ${empresa}`);
    if (esRetiro) {
      const horario = metodo.horario && metodo.horario.trim() ? metodo.horario.trim() : formatearHorarioAtencion();
      lineas.push(`📍 *Punto de retiro:* ${metodo.direccion || "Dirección de retiro"}`, `⏰ *Horario:* ${horario}`);
      return lineas;
    }

    // La ubicación de la tienda reemplaza la que hubiera quedado de una compra anterior
    if (typeof entrega.latitud === "number" && typeof entrega.longitud === "number") {
      delete carrito.direccion_manual;
      carrito.ubicacion = {
        latitude: entrega.latitud,
        longitude: entrega.longitud,
        direccion: entrega.direccion || "Ubicación GPS",
      };
      lineas.push(`📍 *Ubicación:* https://maps.google.com/?q=${entrega.latitud.toFixed(6)},${entrega.longitud.toFixed(6)}`);
      if (entrega.direccion) lineas.push(`🏠 *Referencia:* ${entrega.direccion}`);
    } else if (entrega.direccion) {
      delete carrito.ubicacion;
      carrito.direccion_manual = entrega.direccion;
      lineas.push(`🏠 *Dirección:* ${entrega.direccion}`);
    }
    return lineas;
  }

  async handleEsperandoConfirmacionWeb({ from, low, text, io, estado }: any) {
    let carrito = estado.carrito || { items: [] };
    if (!carrito.items) carrito.items = [];

    const clean = (low || "").trim();

    if (
      clean === "web_confirmar" ||
      clean === "confirmar" ||
      clean === "si" ||
      clean === "sí" ||
      clean === "completar" ||
      clean === "finalizar"
    ) {
      await this.avanzarAConfirmacionODatosCliente({ from, carrito, io });
    } else if (
      clean === "web_agregar_mas" ||
      clean === "agregar más" ||
      clean === "agregar mas" ||
      clean === "productos" ||
      clean === "modificar"
    ) {
      await chatFlow.mostrarPreguntarMas(from, io);
      await orderService.setEstado(from, { paso: "preguntando_mas" }, io);
    } else {
      const totalUSD = orderService.calcularTotalCarrito(carrito);
      const tasaRes = await obtenerTasaUSD();
      const tasa = tasaRes?.tasa || 0;
      const totalVESRaw = totalUSD * tasa;
      const totalVES = totalVESRaw > 0 ? formatBs(totalVESRaw) : "N/A";
      const brandName = configManager.get("settings.brandName");
      const resumenItems = (carrito.items || [])
        .map((i: any) => `• ${i.producto} x${i.cantidad} — $${formatUsd(i.price * i.cantidad)}`)
        .join("\n");

      const msgLoaded =
        configManager.format("settings.messages.webOrderLoaded", {
          codigo: carrito.codigoWeb || "",
          resumen: resumenItems,
          totalUSD: formatUsd(totalUSD),
          totalVES,
          brandName,
        }) ||
        `🛒 *Pedido Web ${carrito.codigoWeb || ""}*\n\n${resumenItems}\n\n💰 *Total:* $${formatUsd(totalUSD)} / Bs. ${totalVES}\n\n¿Deseas confirmar tu pedido?`;

      const buttons = [
        { id: "web_confirmar", title: "✅ Confirmar" },
        { id: "web_agregar_mas", title: "➕ Agregar más" },
      ];

      await this.enviarYRegistrar(
        from,
        {
          tipo: "botones",
          texto: msgLoaded,
          buttons,
        },
        io
      );
    }
  }

  async handleEsperandoReemplazoWeb({ from, low, io, estado }: any) {
    const clean = (low || "").trim();
    const codigo = estado.codigoWebPendiente;

    if (
      clean === "web_reemplazar" ||
      clean === "reemplazar" ||
      clean === "si" ||
      clean === "sí" ||
      clean === "cambiar"
    ) {
      await orderService.setEstado(from, { codigoWebPendiente: null }, io);
      await this.procesarCodigoPedidoWeb({
        from,
        codigo,
        io,
        forzarReemplazo: true,
      });
    } else if (
      clean === "web_mantener" ||
      clean === "mantener" ||
      clean === "no" ||
      clean === "conservar"
    ) {
      await orderService.setEstado(from, { paso: "preguntando_mas", codigoWebPendiente: null }, io);
      await chatFlow.mostrarPreguntarMas(from, io);
    } else {
      const itemsCount = (estado.carrito?.items || []).reduce(
        (acc: number, it: any) => acc + (Number(it.cantidad) || 1),
        0
      );
      const brandName = configManager.get("settings.brandName");
      const msgReplace =
        configManager.format("settings.messages.webOrderReplaceAsk", {
          codigo,
          itemsCount,
          brandName,
        }) ||
        `🛒 Ya tienes un pedido en preparación en el chat con ${itemsCount} productos.\n\n¿Deseas reemplazar tu carrito actual por el pedido web *${codigo}*?`;

      const buttons = [
        { id: "web_reemplazar", title: "🔄 Reemplazar" },
        { id: "web_mantener", title: "✋ Mantener actual" },
      ];

      await this.enviarYRegistrar(
        from,
        {
          tipo: "botones",
          texto: msgReplace,
          buttons,
        },
        io
      );
    }
  }
}

const chatFlowServiceInstance = new ChatFlowService();
(chatFlowServiceInstance as any).quiereRetirar = quiereRetirar;
module.exports = chatFlowServiceInstance;
module.exports.quiereRetirar = quiereRetirar;
