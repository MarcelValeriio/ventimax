/**
 * public/src/features/inbox/hooks/useInboxSocket.js
 * Suscripción de tiempo real del Inbox Unificado (§6.4 del contrato).
 *
 * - Consume el evento unificado `inbox_actualizado` (servidor → cliente).
 * - Mientras el backend no emita ese evento, escucha también los eventos legacy
 *   (§4: nuevo_mensaje, mensaje_ig, mensaje_messenger, ig_actualizado, …) y los
 *   normaliza al mismo shape, para que la UI funcione durante la transición sin
 *   acoplarse a 13 eventos distintos en el orquestador.
 * - Agrupa (debounce) las ráfagas de eventos en una sola invalidación para no
 *   disparar un refresh por mensaje.
 */

import { useEffect, useRef } from "https://cdn.skypack.dev/react";

const EVENTOS_UNIFICADOS = ["inbox_actualizado"];

/**
 * LOTE B5 · WA-95 — eventos de ESTADO de mensaje (ticks enviado/entregado/leído).
 * Se entregan por un canal aparte, SIN debounce, para pintar el tick en el momento:
 *   · `mensaje_status_actualizado` → webhook de Meta
 *     (controllers/webhookController.ts:82 → services/orderService.ts:397).
 *   · `status_actualizado` → reintento in-place del LOTE B3
 *     (services/inbox/adapters/whatsappAdapter.ts:295).
 */
const EVENTOS_STATUS = ["mensaje_status_actualizado", "status_actualizado"];

/**
 * LOTE B6 · IG-02 — el switch GLOBAL del bot de Instagram se sincroniza entre
 * dispositivos por el evento `ig_bot_toggle`:
 *   · lo emite `inboxService.cambiarBotToggle` (services/inboxService.ts:471) y
 *     el handler legacy `postInstagramBotToggle` (controllers/adminController.ts:1073).
 * Va por su propio canal, sin debounce: no invalida listas, solo refleja el
 * estado del switch (payload `{ enabled: boolean }`).
 */
const EVENTO_BOT_TOGGLE = "ig_bot_toggle";

/**
 * LOTE B7a · WA-68 — eventos de PRESENCIA / ESCRITURA de WhatsApp.
 *
 * OJO (documentado en el doc de paridad WA-19/20): hoy el backend NO emite estos
 * eventos — solo la consola de WhatsApp los ESCUCHA (WhatsAppConsole.js:714-715),
 * así que son un canal «listo pero sin productor». El inbox implementa la misma
 * suscripción + TTL que el legacy para que, en cuanto exista el emisor (Meta
 * presence/typing), la cabecera del hilo muestre «escribiendo…» / «en línea» /
 * «desconectado» sin tocar nada más (paridad de comportamiento).
 *
 * Va sin debounce: no invalida listas, solo alimenta el estado del contacto.
 */
// P-02: Desactivado. El backend nunca emite cliente_presencia ni cliente_typing
// (la API de Meta / WhatsApp Cloud no provee eventos de presencia/escritura de clientes).
const EVENTOS_PRESENCIA = []; // ["cliente_presencia", "cliente_typing"]

/**
 * LOTE B7b · IG-07 — MENSAJE ENTRANTE EN SITIO (append + dedupe de temporales).
 *
 * La consola de Instagram pintaba el mensaje AL INSTANTE con el payload del
 * socket `mensaje_ig` (`InstagramConsole.js:192-241,270`: append, dedupe del
 * temporal que coincide en texto, actualización del preview y `+1` de no leídos
 * si el hilo no está abierto). El inbox lo resolvía con una INVALIDACIÓN
 * debounced (recarga), lo que en la práctica retrasaba hasta 800 ms la
 * aparición de la burbuja.
 *
 * Estos eventos van por su propio canal, SIN debounce, y el orquestador aplica
 * el mismo algoritmo. La recarga sigue vigente (el servidor es la fuente de
 * verdad): el append es un adelanto optimista y `fusionarMensajes` evita
 * duplicados por `_id`/mid.
 *
 * LOTE B7c · WA-17 — por aquí entra también `whatsapp_message`.
 *
 * El backend emite `nuevo_mensaje` (`services/orderService.ts:349`) pero **NO emite `whatsapp_message`**
 * (0 emisores en el árbol; verificado con grep sobre `services/`, `controllers/`
 * y `routes/`). El legacy lo suscribía junto a `nuevo_mensaje`
 * (`WhatsAppConsole.js:711-712`) por si algún emisor antiguo seguía vivo, así que
 * el inbox hace lo mismo de forma DEFENSIVA: si nunca llega, no pasa nada; si
 * algún día llega, el append y la deduplicación son idénticos.
 *
 * WhatsApp (`nuevo_mensaje`) entra por el mismo canal: el append es igual de
 * válido y la deduplicación es idéntica.
 */
const EVENTOS_MENSAJE = [
  "mensaje_ig",
  "mensaje_messenger",
  "nuevo_mensaje",
  "whatsapp_message",
];

/**
 * LOTE B7b · IG-09 — CAMBIO DE MODO POR SOCKET EN SITIO.
 *
 * `ig_modo_actualizado` (`InstagramConsole.js:253-268,273`) trae `{usuarioIgId,
 * modo}` y el legacy parcheaba el modo + recalculaba `requiresAttention` EN EL
 * CLIENTE (`modo === "manual" || stuck || origen === "anuncio"`). El inbox solo
 * recargaba. Aquí se replica el parcheo inmediato (la recarga sigue).
 */
const EVENTOS_MODO = ["ig_modo_actualizado", "modo_actualizado"];

/**
 * LOTE B7c · WA-21 — PAGO DEL CLIENTE (comprobante) EN SITIO.
 *
 * `pago_enviado_cliente` SÍ tiene emisor: `services/orderService.ts:152` (alta
 * del pedido con comprobante) y `:622` (mini-comanda), más
 * `controllers/adminController.ts:2892`. El payload es el documento `Pedido`
 * completo (`whatsappId`, `_id`, `idFormateado`, `correlativo`, `cliente`), y el
 * modelo `Pedido` es EXCLUSIVO de WhatsApp (§6.2: IG/Messenger no tienen pedido),
 * así que el canal derivado es siempre `whatsapp`.
 *
 * El legacy (`WhatsAppConsole.js:547-592`) actualizaba `purchaseHistory` y el
 * resumen del sidebar sin HTTP, tocaba el tono de pago y avisaba por toast. El
 * inbox solo lo detectaba al recargar la lista (`detectarAlertas`).
 */
const EVENTOS_PAGO_CLIENTE = ["pago_enviado_cliente"];

/**
 * LOTE B7c · WA-28 — ORDEN ESTANCADA EN SITIO.
 *
 * `alerta_orden_estancada` SÍ tiene emisor: `services/watchdogService.ts:225`
 * (único punto del árbol) con payload
 * `{id, correlativo, cliente, telefono, minutos}`. El legacy
 * (`WhatsAppConsole.js:668-676`) marcaba `stuck: true` en la fila; el inbox solo
 * leía `stuck` del API.
 */
const EVENTOS_ALERTA_ESTANCADA = ["alerta_orden_estancada"];

/**
 * LOTE B7c · WA-27 — PASO/ETIQUETA DEL EMBUDO EN SITIO.
 *
 * `estado_actualizado` SÍ tiene emisor: `services/orderService.ts:88`,
 * `controllers/adminController.ts:1811` y
 * `whatsappAdapter.ts:469`, con payload `{telefono, paso, pasoLabel, etiqueta}`.
 * El legacy (`WhatsAppConsole.js:652-666`) parcheaba esos campos en la fila. El
 * inbox lo tenía solo dentro de `EVENTOS_LEGACY` (invalidación + recarga), así
 * que el chip del embudo tardaba hasta 800 ms en cambiar.
 */
const EVENTOS_ESTADO_EMBUDO = ["estado_actualizado"];

/** Canal efectivo de un evento legacy por su nombre (§4 del contrato). */
const canalDeEvento = (evento) => {
  if (evento === "mensaje_ig" || evento === "ig_actualizado" || evento === "ig_modo_actualizado") {
    return "instagram";
  }
  if (evento === "mensaje_messenger" || evento === "messenger_actualizado") {
    return "messenger";
  }
  return "whatsapp";
};

/**
 * Normaliza presencia/typing a `{ canal, usuarioId, clave, tipo, … }`.
 * TTL por defecto: 15 s presencia / 8 s typing (mismos valores del legacy
 * WhatsAppConsole.js:683,699).
 */
const normalizarPresencia = (evento, data) => {
  const payload = data && typeof data === "object" ? data : {};
  const telefono = payload.telefono || payload.phone || payload.usuarioId || null;
  if (!telefono) return null;
  const usuarioId = String(telefono);
  const base = { evento, canal: "whatsapp", usuarioId, clave: `whatsapp:${usuarioId}` };
  if (evento === "cliente_typing") {
    return Object.assign(base, {
      tipo: "typing",
      isTyping: payload.isTyping !== false,
      ttlMs: Number(payload.ttlMs) || 8000,
      timestamp: Date.now(),
    });
  }
  return Object.assign(base, {
    tipo: "presencia",
    presence: ["online", "offline", "unknown"].includes(payload.presence)
      ? payload.presence
      : "unknown",
    ttlMs: Number(payload.ttlMs) || 15000,
    timestamp: Date.now(),
  });
};

const EVENTOS_LEGACY = [
  "nuevo_mensaje",
  "whatsapp_message",
  "mensaje_status_actualizado",
  "mensaje_ig",
  "ig_actualizado",
  "mensaje_messenger",
  "messenger_actualizado",
  "modo_actualizado",
  "ig_modo_actualizado",
  "estado_actualizado",
  // LOTE B4: eventos de pedido/pago/despacho. Sin ellos, confirmar el pago o
  // cambiar el estado del pedido desde OTRO dispositivo no refrescaba ni la lista
  // (chip de pedido) ni el CRM del hilo abierto (brechas WA-22/24/25/26).
  "pago_confirmado",
  "order_status_changed",
  "pedido_actualizado",
  "bot_destrabado",
];

/**
 * Normaliza cualquier payload (unificado o legacy) al shape §6.4:
 * { canal, usuarioId, clave, tipo }
 */
const normalizarEvento = (evento, data) => {
  const payload = data && typeof data === "object" ? data : {};

  let canal = typeof payload.canal === "string" ? payload.canal : null;
  let usuarioId =
    payload.usuarioId ||
    payload.usuarioIgId ||
    payload.telefono ||
    // LOTE B4: los eventos de pedido emiten el documento `Pedido`, cuya clave de
    // contacto es `whatsappId` (p. ej. `order_status_changed`, `pago_confirmado`,
    // `pedido_actualizado`).
    payload.whatsappId ||
    (typeof data === "string" ? data : null) ||
    null;

  if (!canal) {
    if (
      evento === "mensaje_ig" ||
      evento === "ig_actualizado" ||
      evento === "ig_modo_actualizado"
    ) {
      canal = "instagram";
    } else if (
      evento === "mensaje_messenger" ||
      evento === "messenger_actualizado"
    ) {
      canal = "messenger";
    } else {
      canal = "whatsapp";
    }
  }

  const clave =
    payload.clave || (canal && usuarioId ? `${canal}:${usuarioId}` : null);

  return {
    evento,
    tipo: payload.tipo || evento,
    canal,
    usuarioId,
    clave,
  };
};

/**
 * Normaliza un evento de estado a `{canal, usuarioId, clave, _id, idExterno, status}`.
 * El vocabulario de `status` es el cerrado del contrato (§7 fila 17):
 * `enviando | sent | delivered | read | failed`.
 */
const normalizarEstado = (evento, data) => {
  const payload = data && typeof data === "object" ? data : {};
  const canal =
    typeof payload.canal === "string"
      ? payload.canal
      : evento === "mensaje_ig"
        ? "instagram"
        : evento === "mensaje_messenger"
          ? "messenger"
          : "whatsapp";
  const usuarioId =
    payload.usuarioId || payload.telefono || payload.usuarioIgId || payload.whatsappId || null;
  const idExterno = payload.wamid || payload.mid || null;
  return {
    evento,
    canal,
    usuarioId: usuarioId ? String(usuarioId) : null,
    clave:
      payload.clave || (canal && usuarioId ? `${canal}:${String(usuarioId)}` : null),
    _id: payload._id ? String(payload._id) : null,
    idExterno: idExterno ? String(idExterno) : null,
    status: payload.status || null,
    error: payload.error || null,
  };
};

/**
 * LOTE B7b · IG-07 — normaliza un evento de mensaje nuevo a
 * `{evento, canal, usuarioId, clave, mensaje}`. El `mensaje` se entrega CRUDO
 * (es el documento del canal): el orquestador lo adapta con la misma tolerancia
 * de nombres que `InstagramConsole.js:196-206`.
 *
 * LOTE B7c · WA-17 — OJO con la ASIMETRÍA de payloads (descubierta al cerrar el
 * append de WhatsApp):
 *   · `mensaje_ig` / `mensaje_messenger` ANIDAN el mensaje:
 *     `{usuarioIgId|psid, mensaje}` (`adminController.ts:897,969`,
 *     `instagramAdapter.ts:266,324`).
 *   · `nuevo_mensaje` (WhatsApp) es PLANO: es el propio mensaje
 *     `{from, text, direction, tipo, timestamp, wamid, …}`
 *     (`services/orderService.ts:325-352`), sin campo `mensaje` ni `usuarioId`.
 * Si no hubiera anidado, el normalizador devolvía `null` y el append de WhatsApp
 * NUNCA ocurría (solo la recarga). Aquí se acepta el payload plano como mensaje y
 * se toma `from` como contacto.
 */
const normalizarMensajeEntrante = (evento, data) => {
  const payload = data && typeof data === "object" ? data : {};
  const anidado =
    payload.mensaje && typeof payload.mensaje === "object"
      ? payload.mensaje
      : payload.message && typeof payload.message === "object"
        ? payload.message
        : null;
  const mensaje = anidado || payload;
  const usuarioId =
    payload.usuarioIgId ||
    payload.psid ||
    payload.usuarioId ||
    payload.telefono ||
    // `from` es la clave del payload PLANO de WhatsApp (`orderService.ts:326`).
    payload.from ||
    payload.whatsappId ||
    null;
  if (!usuarioId || typeof mensaje !== "object") return null;
  const canal = typeof payload.canal === "string" ? payload.canal : canalDeEvento(evento);
  return {
    evento,
    canal,
    usuarioId: String(usuarioId),
    clave: payload.clave || `${canal}:${String(usuarioId)}`,
    mensaje,
  };
};

/**
 * LOTE B7b · IG-09 — normaliza `ig_modo_actualizado`/`modo_actualizado` a
 * `{evento, canal, usuarioId, clave, modo}`.
 */
const normalizarModo = (evento, data) => {
  const payload = data && typeof data === "object" ? data : {};
  const usuarioId =
    payload.usuarioIgId || payload.usuarioId || payload.telefono || payload.whatsappId || null;
  const modo = payload.modo || payload.operationMode || null;
  if (!usuarioId || (modo !== "manual" && modo !== "automatico")) return null;
  const canal = typeof payload.canal === "string" ? payload.canal : canalDeEvento(evento);
  return {
    evento,
    canal,
    usuarioId: String(usuarioId),
    clave: payload.clave || `${canal}:${String(usuarioId)}`,
    modo,
  };
};

/**
 * LOTE B7c · WA-21 — normaliza `pago_enviado_cliente` a
 * `{evento, canal, usuarioId, clave, pedido}`. El `pedido` se entrega CRUDO (es
 * el documento `Pedido`): el orquestador lo usa para el historial de compras
 * (WA-11) y el resumen del sidebar. `Pedido` es exclusivo de WhatsApp, así que el
 * canal cae a `whatsapp` salvo que el payload declare otro (defensivo).
 */
const normalizarPagoCliente = (evento, data) => {
  const payload = data && typeof data === "object" ? data : {};
  const usuarioId =
    payload.whatsappId || payload.telefono || payload.usuarioId || null;
  if (!usuarioId) return null;
  const canal = typeof payload.canal === "string" ? payload.canal : "whatsapp";
  return {
    evento,
    canal,
    usuarioId: String(usuarioId),
    clave: payload.clave || `${canal}:${String(usuarioId)}`,
    pedido: payload,
  };
};

/**
 * LOTE B7c · WA-28 — normaliza `alerta_orden_estancada` a
 * `{evento, canal, usuarioId, clave, alerta}` (payload
 * `{id, correlativo, cliente, telefono, minutos}`).
 */
const normalizarAlertaEstancada = (evento, data) => {
  const payload = data && typeof data === "object" ? data : {};
  const usuarioId =
    payload.telefono || payload.whatsappId || payload.usuarioId || null;
  if (!usuarioId) return null;
  const canal = typeof payload.canal === "string" ? payload.canal : "whatsapp";
  return {
    evento,
    canal,
    usuarioId: String(usuarioId),
    clave: payload.clave || `${canal}:${String(usuarioId)}`,
    alerta: payload,
  };
};

/**
 * LOTE B7c · WA-27 — normaliza `estado_actualizado` a
 * `{evento, canal, usuarioId, clave, paso, pasoLabel, etiqueta}`. Solo se exige
 * el contacto: si el payload no trae campos del embudo, el orquestador no toca
 * nada (no se inventan valores).
 */
const normalizarEstadoEmbudo = (evento, data) => {
  const payload = data && typeof data === "object" ? data : {};
  const usuarioId =
    payload.telefono || payload.usuarioId || payload.whatsappId || null;
  if (!usuarioId) return null;
  const canal = typeof payload.canal === "string" ? payload.canal : "whatsapp";
  return {
    evento,
    canal,
    usuarioId: String(usuarioId),
    clave: payload.clave || `${canal}:${String(usuarioId)}`,
    paso: payload.paso,
    pasoLabel: payload.pasoLabel,
    etiqueta: payload.etiqueta,
  };
};

/**
 * @param {Object}   opciones
 * @param {Object}   opciones.socket       Instancia Socket.IO (o window.socket como fallback).
 * @param {Function} opciones.onInvalidar  Callback que recibe el lote normalizado.
 * @param {Function} [opciones.onStatus]   LOTE B5 (WA-95): recibe cada cambio de
 *                                         estado de mensaje al instante (sin debounce).
 * @param {Function} [opciones.onBotToggle] LOTE B6 (IG-02): recibe el nuevo estado
 *                                         global del bot de Instagram (`{ enabled }`).
 * @param {Function} [opciones.onPresence]  LOTE B7a (WA-68): recibe cada evento de
 *                                         presencia/escritura ya normalizado
 *                                         (`{ canal, usuarioId, clave, tipo, presence?, isTyping?, ttlMs }`).
 * @param {Function} [opciones.onMensaje]   LOTE B7b (IG-07): recibe cada mensaje
 *                                         nuevo al instante, sin debounce
 *                                         (`{ canal, usuarioId, clave, mensaje }`).
 * @param {Function} [opciones.onModo]      LOTE B7b (IG-09): recibe cada cambio de
 *                                         modo por socket
 *                                         (`{ canal, usuarioId, clave, modo }`).
 * @param {Function} [opciones.onPagoCliente] LOTE B7c (WA-21): recibe el
 *                                         `pago_enviado_cliente` ya normalizado
 *                                         (`{ canal, usuarioId, clave, pedido }`),
 *                                         sin debounce.
 * @param {Function} [opciones.onAlertaEstancada] LOTE B7c (WA-28): recibe
 *                                         `alerta_orden_estancada` normalizado
 *                                         (`{ canal, usuarioId, clave, alerta }`),
 *                                         sin debounce.
 * @param {Function} [opciones.onEstadoEmbudo] LOTE B7c (WA-27): recibe
 *                                         `estado_actualizado` normalizado
 *                                         (`{ canal, usuarioId, clave, paso, pasoLabel, etiqueta }`),
 *                                         sin debounce.
 * @param {number}   [opciones.debounceMs] Ventana de agrupación (default 800 ms).
 */
const useInboxSocket = ({
  socket,
  onInvalidar,
  onStatus,
  onBotToggle,
  onPresence,
  onMensaje,
  onModo,
  onPagoCliente,
  onAlertaEstancada,
  onEstadoEmbudo,
  debounceMs = 800,
} = {}) => {
  // El callback vive en un ref para no re-registrar listeners en cada render.
  const callbackRef = useRef(onInvalidar);
  callbackRef.current = onInvalidar;
  // WA-95: el callback de estado puede llegar en CUALQUIER momento, así que
  // también vive en un ref (no se re-suscribe por cada render del orquestador).
  const statusRef = useRef(onStatus);
  statusRef.current = onStatus;
  // IG-02: ídem para el switch global del bot de Instagram.
  const botToggleRef = useRef(onBotToggle);
  botToggleRef.current = onBotToggle;
  // LOTE B7a · WA-68: ídem para presencia/escritura.
  const presenceRef = useRef(onPresence);
  presenceRef.current = onPresence;
  // LOTE B7b · IG-07/IG-09: mensaje entrante y cambio de modo al instante.
  const mensajeRef = useRef(onMensaje);
  mensajeRef.current = onMensaje;
  const modoRef = useRef(onModo);
  modoRef.current = onModo;
  // LOTE B7c · WA-21/WA-28/WA-27: pago, orden estancada y embudo al instante.
  const pagoClienteRef = useRef(onPagoCliente);
  pagoClienteRef.current = onPagoCliente;
  const alertaEstancadaRef = useRef(onAlertaEstancada);
  alertaEstancadaRef.current = onAlertaEstancada;
  const estadoEmbudoRef = useRef(onEstadoEmbudo);
  estadoEmbudoRef.current = onEstadoEmbudo;

  useEffect(() => {
    const liveSocket =
      socket || (typeof window !== "undefined" ? window.socket : null);
    if (!liveSocket) return undefined;

    let temporizador = null;
    let pendientes = [];

    const vaciar = () => {
      temporizador = null;
      const lote = pendientes;
      pendientes = [];
      if (typeof callbackRef.current === "function") {
        callbackRef.current(lote);
      }
    };

    const registrar = (evento) => (data) => {
      pendientes.push(normalizarEvento(evento, data));
      if (temporizador) clearTimeout(temporizador);
      temporizador = setTimeout(vaciar, debounceMs);
    };

    const suscripciones = EVENTOS_UNIFICADOS.concat(EVENTOS_LEGACY).map(
      (evento) => {
        const handler = registrar(evento);
        liveSocket.on(evento, handler);
        return [evento, handler];
      },
    );

    // WA-95: los estados van por su propio canal, sin pasar por el debounce, para
    // que el tick ✓✓ azul aparezca en el hilo sin esperar la recarga.
    const suscripcionesStatus = EVENTOS_STATUS.map((evento) => {
      const handler = (data) => {
        if (typeof statusRef.current !== "function") return;
        const estado = normalizarEstado(evento, data);
        if (!estado.status) return;
        statusRef.current(estado);
      };
      liveSocket.on(evento, handler);
      return [evento, handler];
    });

    // LOTE B6 · IG-02: switch global del bot de Instagram (sin debounce; no
    // invalida listas, solo sincroniza el estado del switch entre dispositivos).
    const handlerBotToggle = (data) => {
      if (typeof botToggleRef.current !== "function") return;
      const payload = data && typeof data === "object" ? data : {};
      if (typeof payload.enabled !== "boolean") return;
      botToggleRef.current({ enabled: payload.enabled });
    };
    liveSocket.on(EVENTO_BOT_TOGGLE, handlerBotToggle);

    // P-02 (WA-68 / WA-19 / WA-20): Eventos sin emisor en el backend comentados.
    /*
    const suscripcionesPresencia = EVENTOS_PRESENCIA.map((evento) => {
      const handler = (data) => {
        if (typeof presenceRef.current !== "function") return;
        const presencia = normalizarPresencia(evento, data);
        if (!presencia) return;
        presenceRef.current(presencia);
      };
      liveSocket.on(evento, handler);
      return [evento, handler];
    });
    */
    const suscripcionesPresencia = [];

    // LOTE B7b · IG-07: mensaje nuevo al instante (sin debounce) — append +
    // dedupe de temporales en el orquestador, paridad con el legacy de IG.
    const suscripcionesMensaje = EVENTOS_MENSAJE.map((evento) => {
      const handler = (data) => {
        if (typeof mensajeRef.current !== "function") return;
        const entrante = normalizarMensajeEntrante(evento, data);
        if (!entrante) return;
        mensajeRef.current(entrante);
      };
      liveSocket.on(evento, handler);
      return [evento, handler];
    });

    // LOTE B7b · IG-09: cambio de modo al instante (modo + requiereAtencion).
    const suscripcionesModo = EVENTOS_MODO.map((evento) => {
      const handler = (data) => {
        if (typeof modoRef.current !== "function") return;
        const cambio = normalizarModo(evento, data);
        if (!cambio) return;
        modoRef.current(cambio);
      };
      liveSocket.on(evento, handler);
      return [evento, handler];
    });

    // LOTE B7c · WA-21: comprobante del cliente → historial de compras + sidebar
    // + tono de pago, al instante (paridad WhatsAppConsole.js:547-592).
    const suscripcionesPagoCliente = EVENTOS_PAGO_CLIENTE.map((evento) => {
      const handler = (data) => {
        if (typeof pagoClienteRef.current !== "function") return;
        const pago = normalizarPagoCliente(evento, data);
        if (!pago) return;
        pagoClienteRef.current(pago);
      };
      liveSocket.on(evento, handler);
      return [evento, handler];
    });

    // LOTE B7c · WA-28: orden estancada → marca `stuck` en la fila al instante.
    const suscripcionesAlertaEstancada = EVENTOS_ALERTA_ESTANCADA.map(
      (evento) => {
        const handler = (data) => {
          if (typeof alertaEstancadaRef.current !== "function") return;
          const alerta = normalizarAlertaEstancada(evento, data);
          if (!alerta) return;
          alertaEstancadaRef.current(alerta);
        };
        liveSocket.on(evento, handler);
        return [evento, handler];
      },
    );

    // LOTE B7c · WA-27: paso/pasoLabel/etiqueta del embudo al instante. OJO:
    // `estado_actualizado` sigue TAMBIÉN en EVENTOS_LEGACY (invalidación +
    // recarga), de modo que la fila se reconcilia con el servidor aunque el
    // payload del socket venga incompleto.
    const suscripcionesEstadoEmbudo = EVENTOS_ESTADO_EMBUDO.map((evento) => {
      const handler = (data) => {
        if (typeof estadoEmbudoRef.current !== "function") return;
        const embudo = normalizarEstadoEmbudo(evento, data);
        if (!embudo) return;
        estadoEmbudoRef.current(embudo);
      };
      liveSocket.on(evento, handler);
      return [evento, handler];
    });

    return () => {
      if (temporizador) clearTimeout(temporizador);
      suscripciones
        .concat(suscripcionesStatus)
        .concat(suscripcionesPresencia)
        .concat(suscripcionesMensaje)
        .concat(suscripcionesModo)
        .concat(suscripcionesPagoCliente)
        .concat(suscripcionesAlertaEstancada)
        .concat(suscripcionesEstadoEmbudo)
        .forEach(([evento, handler]) => {
          liveSocket.off(evento, handler);
        });
      liveSocket.off(EVENTO_BOT_TOGGLE, handlerBotToggle);
    };
  }, [socket, debounceMs]);
};

export default useInboxSocket;
