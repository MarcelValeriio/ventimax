import { Icono } from "../../components/Icono.js";
/**
 * public/src/features/inbox/InboxConsole.js
 * INBOX UNIFICADO (WhatsApp · Instagram · Messenger) — orquestador (fase 2B).
 *
 * LAYOUT V3 (§6.1 del checklist docs/paridad-inbox-v3.md):
 *   [raíl de canales] [lista del canal activo] [hilo]
 * El raíl (InboxChannelRail) FIJA el canal activo; la lista solo muestra ese
 * canal y conserva buscador + toggles + refresco. El hilo (InboxThread) es la
 * tercera columna y no pierde ninguna capacidad.
 *
 * Programado contra el contrato congelado en docs/inbox-unificado-contrato.md:
 *   - Lista:   GET  /api/admin/inbox?canal=&limite=&buscar=&noLeidos=&modo=&atencion=&conPedido=
 *   - Hilo:    GET  /api/admin/inbox/hilo?canal=&usuarioId=&page=&limite=
 *   - Acciones (canal y usuarioId SIEMPRE en el body, §6.3):
 *       POST /api/admin/inbox/mensaje  { canal, usuarioId, texto }
 *       POST /api/admin/inbox/adjunto  multipart { canal, usuarioId, file, caption? }
 *       POST /api/admin/inbox/modo     { canal, usuarioId, modo }
 *       POST /api/admin/inbox/leido    { canal, usuarioId }
 *       POST /api/admin/inbox/reset    { canal, usuarioId }
 *   - Tiempo real: `inbox_actualizado` (+ eventos legacy) vía hooks/useInboxSocket.js
 *
 * Las consolas de WhatsApp e Instagram NO se sustituyen: este inbox es el punto de
 * entrada y ellas siguen siendo el detalle por canal (deep-link "Consola").
 *
 * LOTE B4 — Acciones de pedido/pago/despacho (WA-14/15/35/36/37) y ficha de cliente
 * (WA-118..130) sin salir del inbox:
 *   · Ficha:   GET   /api/admin/inbox/contexto?canal=whatsapp&usuarioId=  → CRM/LTV/carrito
 *              (el drawer se REUTILIZA importando el componente legacy
 *               features/whatsapp/components/CustomerCardDrawer.js — es 100%
 *               dirigido por props, igual que QuickReplyBottomSheet en el lote B2).
 *   · Confirmar pago:  POST  /api/admin/inbox/whatsapp/pago/confirmar
 *   · Despachar/Entregado: PATCH /api/admin/inbox/whatsapp/pedido/:id/estado
 *   · Asignar repartidor:  PATCH /api/admin/inbox/whatsapp/pedido/:id/repartidor
 *   Estos 3 últimos son EXCLUSIVOS de WhatsApp (los endpoints devuelven 409 en
 *   Instagram/Messenger) y por eso la UI no los pinta en esos canales.
 *
 * LOTE B5 — MULTIMEDIA DEL HILO (doc §1.E y §1.F):
 *   · El hilo recibe `pedidoActivo` (del CRM) para INTERCALAR la tarjeta de
 *     «Pedido Confirmado» en el timeline (WA-83) y `onStatus` para los ticks en
 *     vivo (WA-95). El visor de imagen (WA-97..106), el banner de Modo Manual
 *     (WA-80), la heurística multimedia (WA-85), la imagen→lightbox (WA-88), el
 *     error de imagen (WA-89), el documento con icono (WA-90) y la ubicación a
 *     Google Maps (WA-91) viven en `InboxThread` — ver su cabecera.
 *
 * LOTE B6 — AJUSTES A NIVEL DE CANAL (no de conversación):
 *   · Engranaje «Ajustes del canal» en la cabecera de la Col-C (`InboxSidebar`),
 *     con las opciones del canal que fija el raíl:
 *       WhatsApp  → «Perfil de WhatsApp Business» (WA-45 · modal WA-39) por los
 *                   endpoints unificados
 *                     GET  /api/admin/inbox/whatsapp/profile
 *                     POST /api/admin/inbox/whatsapp/profile
 *                     POST /api/admin/inbox/whatsapp/profile-picture (multipart)
 *       Instagram → switch global Bot ON/OFF (IG-01 · switch IG-18) por
 *                     GET/POST /api/admin/inbox/instagram/bot-toggle
 *                   sincronizado por socket `ig_bot_toggle` (IG-02).
 *       Messenger → sin ajustes de canal todavía.
 *     El estado del bot vive AQUÍ (fuente única de verdad) y el engranaje es
 *     presentacional, para poder ejercitarlo en el harness de render.
 *
 * LOTE B7a — COPILOTO DE VENTA MANUAL (WA-131..139, doc §1.I) + pendientes de
 * §1.C/§1.D:
 *   · El copiloto (`components/InboxManualOrderModal.js`, PROPIO y no el legacy
 *     `ChatManualOrderModal.js`, que hardcodea endpoints) se abre con el botón
 *     «Venta IA» de la cabecera del hilo (WA-70) y consume:
 *       GET  /api/admin/inbox/products                    catálogo          (WA-135)
 *       GET  /api/admin/inbox/payments                    métodos de pago   (WA-135)
 *       POST /api/admin/inbox/whatsapp/copiloto/extraer   IA del chat       (WA-132)
 *       POST /api/admin/inbox/whatsapp/venta-manual       venta multipart   (WA-139)
 *     Solo WhatsApp (el copiloto crea pedidos) y al guardar se refresca
 *     lista + hilo + CRM.
 *   · WA-68 presencia/escribiendo en la cabecera del hilo (socket
 *     `cliente_presencia`/`cliente_typing` + TTL de 3 s, paridad con WA-29).
 *   · WA-44 mute SINCRONIZADO: `pachi_muted_inbox` y `pachi_muted` se escriben
 *     juntas (el pitido global del panel solo mira la segunda).
 *   · WA-72/WA-73/WA-79 adjuntos con `caption` + cita y toasts de subida/éxito.
 *
 * LOTE B7b — PARIDAD DE INSTAGRAM (§1.J a §1.N del doc de paridad + IG-15/16/24/
 * 36/38/39/50/51/52/55/56/57):
 *   · FICHA DE PERFIL IG (IG-36 dispara · IG-50..57 drawer): el botón ℹ️ de la
 *     cabecera del hilo abre `InstagramCustomerDrawer.js` REUTILIZADO del legacy
 *     (es 100 % dirigido por props), alimentado por la extensión `perfil` del
 *     objeto unificado (§6.2) que aporta el adaptador de Instagram desde
 *     `EtiquetaIg.metadata`. Solo Instagram.
 *   · IG-07 — el socket `mensaje_ig`/`mensaje_messenger`/`nuevo_mensaje` ahora
 *     APPENDEA el mensaje al instante (dedupe de temporales + contador de no
 *     leídos) en vez de esperar la recarga debounced de 800 ms.
 *   · IG-09 — `ig_modo_actualizado`/`modo_actualizado` parchea `modo` +
 *     `requiereAtencion` en sitio (paridad con InstagramConsole.js:253-268).
 *   · IG-16 — banner global de bot pausado en el hilo de Instagram (switch de
 *     canal del LOTE B6) con botón «Reactivar Bot».
 *
 * LOTE B7c — TRANSVERSALES / ENTORNO Y SOCKETS del inbox (filas de la matriz
 * WA-04/11/17/19/20/21/23/27/28/30/41 y X-03/07/15):
 *   · WA-17  `nuevo_mensaje` (+ `whatsapp_message` defensivo) → append del
 *            mensaje en el hilo abierto, preview/`noLeidos` del sidebar y aviso
 *            (toast + tono + push) cuando NO es la conversación atendida.
 *   · WA-21  `pago_enviado_cliente` → historial de compras + sidebar + tono de
 *            pago + toast, sin esperar la recarga (paridad WhatsAppConsole.js:547).
 *   · WA-27  `estado_actualizado` → `paso/pasoLabel/etiqueta` del embudo en sitio.
 *   · WA-28  `alerta_orden_estancada` → marca `stuck` en vivo (la única fila
 *            que la matriz tenía en «No»).
 *   · WA-23  `modo_actualizado` → modo + `requiereAtencion` en sitio.
 *   · WA-11  `fetchPurchases` → `GET /api/admin/pedidos-historial` (historial de
 *            compras COMPLETO, que alimenta las tarjetas «Pedido Confirmado» del
 *            timeline igual que MessageList.js:34-45).
 *   · WA-04  badge `(N)` en el título de la pestaña por no leídos DEL CANAL
 *            ACTIVO (regla por canal: el badge de WhatsApp no cuenta Instagram).
 *   · WA-30  `visibilitychange` → al volver a la pestaña se re-marca leída la
 *            conversación activa.
 *   · WA-41  instalación del `<style>` con las clases `.wa-*` (reutilizando
 *            `features/whatsapp/components/styles.js`, sin editarlo) para el
 *            doodle de fondo y las colas de burbuja.
 *   · X-03   push vía Service Worker (`window.sendPushNotification`) también
 *            desde el canal de mensajes del socket, con título por canal.
 *   · X-07   el listener global de `pago_enviado_cliente` (index.html) queda
 *            acotado a WhatsApp (el Pedido es exclusivo de ese canal).
 *   · X-15   el inbox CONSUME `pachi_inbox_deeplink` / `pachi:focus-conversacion`
 *            (fija el raíl en el canal y abre la conversación del atajo), que era
 *            el eslabón que la matriz marcaba como «escrito pero no consumido».
 *   ⚠️  WA-19/WA-20 (`cliente_presencia`/`cliente_typing`) siguen suscritos de
 *      forma DEFENSIVA: el backend NO emite esos eventos (0 emisores), igual que
 *      en la consola legacy. La brecha es de backend, no de cliente.
 */
import React, { useEffect, useRef, useState } from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js?v=6";
import InboxChannelRail from "./components/InboxChannelRail.js?v=7";
import InboxSidebar from "./components/InboxSidebar.js?v=11";
import InboxThread from "./components/InboxThread.js?v=15";
import useInboxSocket from "./hooks/useInboxSocket.js?v=12";
// LOTE B7c · WA-41 — las clases `.wa-*` (doodle de fondo + colas de burbuja) las
// define la hoja de estilos de la consola de WhatsApp. Se IMPORTA tal cual (no se
// edita `features/whatsapp/**`) con el MISMO `?v=4` que usa WhatsAppConsole.js:12
// para compartir una única instancia del módulo, y se inyecta en `<head>` con el
// mismo `id` (`wa-custom-styles`) que el legacy, de modo que nunca hay dos hojas
// duplicadas ni dos versiones distintas de las clases.
import estilosWhatsApp from "../whatsapp/components/styles.js?v=4";
// LOTE B4: la ficha del cliente y su visor de comprobante se REUTILIZAN tal cual
// desde la consola de WhatsApp (paridad automática WA-118..130, incluido Escape,
// el zoom +/−/reset y el enlace a Google Maps). Se importa con el MISMO `?v=` que
// usa WhatsAppConsole.js:18 para compartir una sola instancia del módulo.
import CustomerCardDrawer from "../whatsapp/components/CustomerCardDrawer.js?v=4";
// LOTE B6 — perfil de WhatsApp Business (WA-39/WA-45). NO se reutiliza
// `WhatsAppProfileModal.js` porque hardcodea los endpoints legacy y está
// prohibido editar `features/whatsapp/**`; ver la cabecera del componente.
import InboxWhatsAppProfileModal from "./components/InboxWhatsAppProfileModal.js?v=1";
// LOTE B7b — FICHA DE PERFIL DE INSTAGRAM (§1.N: IG-50..57). Sí se REUTILIZA el
// componente legacy `InstagramCustomerDrawer.js` tal cual: es 100 % dirigido por
// props (`isOpen`, `onClose`, `contact`, `onToggleBotMode`) y no depende del
// estado de la consola de Instagram — igual que `CustomerCardDrawer.js` en B4 y
// `QuickReplyBottomSheet.js` en B2. Aporta sin reescribirlo: cabecera + cerrar
// (IG-50), avatar con aro + nombre + @username + seguidores (IG-51), bio
// (IG-52), switch del bot con textos dinámicos (IG-53), badge de anuncio
// (IG-54), stats Canal/Estado (IG-55), «Ver perfil en Instagram» (IG-56) y el
// placeholder «Crear Pedido desde Chat» (IG-57).
// Se importa con el MISMO `?v=4` que InstagramConsole.js:16 para compartir una
// única instancia del módulo en el navegador.
import InstagramCustomerDrawer from "../instagram/components/InstagramCustomerDrawer.js?v=4";
// LOTE B7a — Copiloto de Venta Manual (WA-131..139, doc §1.I). Tampoco se
// reutiliza `ChatManualOrderModal.js` por el mismo motivo (endpoints legacy
// hardcodeados); ver la cabecera del componente.
import InboxManualOrderModal from "./components/InboxManualOrderModal.js?v=1";

const e = React.createElement;

const API_INBOX = "/api/admin/inbox";
const LIMITE_LISTA = 100; // §6.1: por canal, default 100
const LIMITE_HILO = 20; // §8.4: paginación 20 por página

const FILTROS_INICIALES = {
  canal: "todos",
  noLeidos: false,
  modo: null, // null = sin filtro | "manual"
  atencion: false,
  conPedido: false,
};

const ETIQUETA_CANAL = {
  todos: "Todos",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
};

// LAYOUT V3 (§6.1 A-01): el raíl fija el canal activo y la cabecera de la
// Col-C lo refleja con su icono.
const ICONO_CANAL = {
  todos: { nombre: "layers" },
  whatsapp: { marca: "whatsapp" },
  instagram: { marca: "instagram" },
  messenger: { marca: "messenger" },
};

const esMovil = () => typeof window !== "undefined" && window.innerWidth < 768;

// ── LOTE B7c · WA-04 — título base de la pestaña ─────────────────────────────
// El legacy de WhatsApp lo resolvía con `window.BASE_TITLE || document.title.replace(...)`
// (WhatsAppConsole.js:112); aquí se centraliza: `index.html` publica
// `window.BASE_TITLE` al cargar la marca y, si aún no existe, se deriva del
// título actual quitando un posible `(N)` previo.
const leerTituloBase = () => {
  if (typeof window !== "undefined" && window.BASE_TITLE) return window.BASE_TITLE;
  const actual = (typeof document !== "undefined" && document.title) || "";
  const botId = (typeof window !== "undefined" && (window.BOT_IDENTITY || window.BRAND_CONFIG?.botIdentity)) || "Panel";
  return actual.replace(/^\(\d+\)\s*/, "").trim() || `${botId} | Panel`;
};

// ── LOTE B7c · X-15 — deep-link a la consola de canal ───────────────────────
// `index.html:650-671` (openCanalConsole) escribe `pachi_inbox_deeplink` con un
// `ts`; solo se consume si es RECIENTE, para que un atajo viejo no reopere una
// conversación mucho después.
const DEEPLINK_TTL_MS = 30000;

// ── Preferencia de silencio (§8.6): clave propia del inbox con fallback a la global ──
const leerMute = () => {
  try {
    const propio = localStorage.getItem("pachi_muted_inbox");
    if (propio !== null) return propio === "true";
    return localStorage.getItem("pachi_muted") === "true";
  } catch (err) {
    return false;
  }
};

// Tono nativo con Web Audio API (mismo enfoque que WhatsAppConsole, cero dependencias)
const playNotificationTone = (tipo = "message") => {
  if (leerMute()) return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (tipo === "payment") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.setValueAtTime(830.61, now + 0.08);
      osc.frequency.setValueAtTime(987.77, now + 0.16);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(783.99, now);
      osc.frequency.setValueAtTime(1046.5, now + 0.06);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (err) {
    // Autoplay bloqueado: ignorar silenciosamente
  }
};

// ── Helpers de normalización defensiva (el backend de la fase 2B se construye en paralelo) ──
const aMillis = (valor) => {
  if (!valor) return 0;
  if (typeof valor === "number") return valor;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

const textoDe = (msg) => (msg && (msg.texto || msg.text || msg.caption)) || "";

const esEntranteDe = (msg) => {
  const dir = msg && (msg.direccion || msg.direction);
  return dir === "entrante" || dir === "cliente";
};

const esTemporal = (msg) => typeof msg._id === "string" && msg._id.indexOf("temp-") === 0;

// LOTE B3 (WA-34) — id externo citable: wamid de WhatsApp / mid de Meta.
// NUNCA un ObjectId de Mongo ni un id temporal del panel.
// Mismo criterio que MessageBubble.js:110-117 (legacy).
const idExternoValido = (valor) => {
  if (!valor) return false;
  const s = String(valor);
  if (s.startsWith("temp-")) return false;
  if (/^[0-9a-fA-F]{24}$/.test(s)) return false;
  return s.startsWith("wamid.") || s.length >= 15;
};

// WA-94: el reintento reenvía TEXTO; los placeholders de multimedia no aplican.
const PLACEHOLDER_MEDIA = /^\[(Foto|Audio|Vídeo|Video|Documento|Sticker|Adjunto|Nota de voz)\]$/;
const textoReintentable = (msg) => {
  const texto = textoDe(msg).trim();
  return Boolean(texto) && !PLACEHOLDER_MEDIA.test(texto);
};

const timestampDe = (conv) =>
  (conv.ultimoMensaje && aMillis(conv.ultimoMensaje.timestamp)) ||
  aMillis(conv.lastInteraction) ||
  0;

const construirParams = (filtros, busqueda) => {
  const params = { canal: filtros.canal || "todos", limite: LIMITE_LISTA };
  const q = (busqueda || "").trim();
  if (q) params.buscar = q;
  params.noLeidos = filtros.noLeidos ? "true" : "false";
  params.atencion = filtros.atencion ? "true" : "false";
  if (filtros.modo === "manual") params.modo = "manual";
  if (filtros.conPedido) params.conPedido = "true";
  return params;
};

const normalizarLista = (payload) => {
  const raw = payload && payload.data !== undefined ? payload.data : payload;
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? Object.values(raw)
      : [];
  return arr
    .filter((c) => c && (c.clave || c.usuarioId || c.telefono || c.id))
    .map((c) => {
      const canal = c.canal || "whatsapp";
      const usuarioId =
        c.usuarioId || c.telefono || c.id || String(c.clave || "").split(":").slice(1).join(":");
      return Object.assign({}, c, {
        canal,
        usuarioId,
        clave: c.clave || `${canal}:${usuarioId}`,
        nombreVisible: (c.nombreVisible || c.nombre || usuarioId || "").toString(),
        noLeidos: Number(c.noLeidos) || 0,
      });
    });
};

// §8.4: orden por ultimoMensaje.timestamp DESC (el servidor lo garantiza; aquí solo se blinda)
const ordenarConversaciones = (lista) =>
  lista.slice().sort((a, b) => timestampDe(b) - timestampDe(a));

/**
 * ── LOTE B7c · WA-11 — HISTORIAL DE COMPRAS ──────────────────────────────────
 * `GET /api/admin/pedidos-historial?telefono=` devuelve los documentos `Pedido`
 * CRUDOS (`{success, data:[…]}`, orden `timestamp DESC`, límite 100 —
 * `controllers/adminController.ts:1304-1321`). La tarjeta «Pedido Confirmado»
 * del hilo (WA-83) lee los montos ya aplanados (`montoUSD`/`montoVES`) porque el
 * `pedidoActivo` del CRM los aplana desde `pago.*`
 * (`adminController.ts:1250-1251`); aquí se hace el MISMO aplanado para que el
 * timeline sea idéntico con el historial completo (paridad con el legacy, que
 * inyectaba todas las compras en `MessageList.js:34-45`).
 */
const normalizarCompras = (payload) => {
  const raw = payload && payload.data !== undefined ? payload.data : payload;
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .filter((p) => p && (p._id || p.idFormateado || p.correlativo))
    .map((p) =>
      Object.assign({}, p, {
        idFormateado:
          p.idFormateado ||
          p.correlativo ||
          (p._id ? `#${String(p._id).slice(-4)}` : null),
        montoUSD:
          p.montoUSD !== undefined && p.montoUSD !== null
            ? p.montoUSD
            : p.pago && p.pago.montoUSD !== undefined
              ? p.pago.montoUSD
              : null,
        montoVES:
          p.montoVES !== undefined && p.montoVES !== null
            ? p.montoVES
            : p.pago && p.pago.montoVES !== undefined
              ? p.pago.montoVES
              : null,
        timestamp: aMillis(p.timestamp) || Date.now(),
      }),
    );
};

// Fusiona lotes del hilo por _id, reconcilia temporales y mantiene orden cronológico.
const fusionarMensajes = (base, entrantes) => {
  const mapa = new Map();
  const orden = [];
  (base || []).concat(entrantes || []).forEach((m) => {
    if (!m) return;
    const k = String(m._id || m.idExterno || `${aMillis(m.timestamp)}-${textoDe(m)}`);
    if (!mapa.has(k)) {
      mapa.set(k, m);
      orden.push(k);
    } else {
      mapa.set(k, Object.assign({}, mapa.get(k), m));
    }
  });
  let lista = orden.map((k) => mapa.get(k));

  // Dedupe: un temporal saliente desaparece si llegó su versión real (ventana 60 s)
  const realesSalientes = lista.filter((m) => !esTemporal(m) && !esEntranteDe(m));
  lista = lista.filter((m) => {
    if (!esTemporal(m)) return true;
    const texto = textoDe(m).trim();
    if (!texto) return true;
    const ms = aMillis(m.timestamp);
    return !realesSalientes.some(
      (r) => textoDe(r).trim() === texto && Math.abs(aMillis(r.timestamp) - ms) < 60000,
    );
  });

  return lista.sort((a, b) => aMillis(a.timestamp) - aMillis(b.timestamp));
};

const InboxConsole = ({ socket, userRole, onOpenCanalConsole }) => {
  const [conversaciones, setConversaciones] = useState({}); // §8.4: store plano por `clave`
  const [conversacionActiva, setConversacionActiva] = useState(null);
  const [claveActiva, setClaveActiva] = useState(null); // nunca autoselecciona (evita marcar leído)
  const [mensajes, setMensajes] = useState([]);
  const [paginacion, setPaginacion] = useState({});
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [buscar, setBuscar] = useState("");
  const [totales, setTotales] = useState({});
  const [totalesNoLeidos, setTotalesNoLeidos] = useState({});
  const [cargandoLista, setCargandoLista] = useState(false);
  const [bloqueoParams, setBloqueoParams] = useState(null);
  const [cargandoHilo, setCargandoHilo] = useState(false);
  const [errorLista, setErrorLista] = useState(null);
  const [borradores, setBorradores] = useState({}); // borradores por clave
  const [isMuted, setIsMuted] = useState(leerMute);
  // LOTE B3 (WA-74): cita activa del composer (mensaje al que se va a responder).
  const [replyingTo, setReplyingTo] = useState(null);
  // LOTE B4 — ficha del cliente (WA-118..130) y acciones de pedido (WA-14/15/35/36/37)
  const [contexto, setContexto] = useState(null); // GET /inbox/contexto (CRM/LTV/carrito)
  const [cargandoContexto, setCargandoContexto] = useState(false);
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [accionPedidoEnCurso, setAccionPedidoEnCurso] = useState(false);
  // LOTE B6 — AJUSTES DE CANAL (no de conversación):
  //   · `perfilWaAbierto`  → modal del perfil de WhatsApp Business (WA-39/WA-45)
  //   · `botIg`            → estado global del bot de Instagram (IG-01/IG-18/IG-02)
  const [perfilWaAbierto, setPerfilWaAbierto] = useState(false);
  const [botIg, setBotIg] = useState({ enabled: null, cargando: false, cambiando: false });
  // LOTE B7a — COPILOTO DE VENTA MANUAL (WA-131..139): modal por conversación
  // WhatsApp; se monta como hermana (devuelve `null` mientras está cerrado).
  const [copilotoAbierto, setCopilotoAbierto] = useState(false);
  // LOTE B7b — ficha de PERFIL de Instagram (IG-36 · IG-50..57): drawer lateral
  // por conversación de Instagram, montado como hermana del hilo (el componente
  // legacy devuelve `null` mientras está cerrado, así que no altera el layout V3).
  const [fichaIgAbierta, setFichaIgAbierta] = useState(false);
  // LOTE B7a · WA-68 — presencia/escritura por conversación (socket
  // `cliente_presencia`/`cliente_typing`, con TTL). Clave = usuarioId.
  const [presenciaMap, setPresenciaMap] = useState({});
  // LOTE B7c · WA-11/WA-21 — historial de compras COMPLETO del cliente activo
  // (`GET /api/admin/pedidos-historial?telefono=`), que alimenta las tarjetas
  // «Pedido Confirmado» del timeline y el alta/actualización por socket de pago.
  const [historialCompras, setHistorialCompras] = useState([]);

  // Refs: evitan listeners y callbacks con estado obsoleto
  const conversacionesRef = useRef(conversaciones);
  conversacionesRef.current = conversaciones;
  const claveActivaRef = useRef(claveActiva);
  claveActivaRef.current = claveActiva;
  const filtrosRef = useRef(filtros);
  filtrosRef.current = filtros;
  const buscarRef = useRef(buscar);
  buscarRef.current = buscar;
  const enviadosRecientesRef = useRef([]);
  const pendingStatusesRef = useRef({});
  const paginaHiloRef = useRef(1);
  const cargarListaRef = useRef(null);
  const cargarHiloRef = useRef(null);
  // LOTE B4: el CRM (ficha + estado del pedido) también se recarga desde el socket.
  const cargarContextoRef = useRef(null);
  // LOTE B7c: el historial de compras (WA-11) se recarga tras las acciones de
  // pedido/pago y al abrir la conversación.
  const cargarComprasRef = useRef(null);
  // LOTE B6: el switch global del bot se consulta/cambia desde el engranaje y se
  // sincroniza por socket; vive en un ref para no depender de closures obsoletos.
  const botIgRef = useRef(botIg);
  botIgRef.current = botIg;
  const cargarBotToggleRef = useRef(null);
  // LOTE B7c · X-15: conversación pendiente de enfocar desde el deep-link (se
  // abre en cuanto la lista del canal la contiene).
  const pendienteDeeplinkRef = useRef(null);
  const enfocarDeeplinkRef = useRef(null);
  const abrirConversacionRef = useRef(null);
  // LOTE B7c · WA-30: el listener de `visibilitychange` vive en un efecto con
  // deps vacías, así que re-marca leído a través de este ref.
  const marcarLeidoRef = useRef(null);
  // La cita vive en un ref para que `enviarMensaje` no dependa de un closure obsoleto.
  const replyingToRef = useRef(replyingTo);
  replyingToRef.current = replyingTo;

  // ── Lista (§6.1) ──────────────────────────────────────────────────────────
  const detectarAlertas = (previas, lista) => {
    lista.forEach((conv) => {
      const anterior = previas[conv.clave];
      if (!anterior) return;
      const antes = Number(anterior.noLeidos) || 0;
      const ahora = Number(conv.noLeidos) || 0;
      if (ahora <= antes) return;
      const viendoEsta = claveActivaRef.current === conv.clave && !document.hidden;
      if (viendoEsta) return;

      const esPago =
        conv.pedido && conv.pedido.ultimoEstado === "pendiente_verificacion";
      playNotificationTone(esPago ? "payment" : "message");
      window.showToast?.(
        `Nuevo mensaje de ${conv.nombreVisible || conv.usuarioId} (${ETIQUETA_CANAL[conv.canal] || conv.canal})`,
      );
      if (document.hidden && esPago) {
        window.sendPushNotification?.(
          "Comprobante pendiente de verificación",
          `${conv.nombreVisible || conv.usuarioId}: ${(conv.ultimoMensaje && conv.ultimoMensaje.texto) || ""}`,
        );
      }
    });
  };

  const cargarLista = async ({ silencioso = false, origen = "manual" } = {}) => {
    if (!silencioso) setCargandoLista(true);
    try {
      const res = await apiClient.get(API_INBOX, {
        params: construirParams(filtrosRef.current, buscarRef.current),
      });
      const payload = res.data || {};
      const lista = ordenarConversaciones(normalizarLista(payload));

      if (origen === "socket") detectarAlertas(conversacionesRef.current, lista);

      const siguientes = {};
      lista.forEach((conv) => {
        siguientes[conv.clave] = conv;
      });
      setConversaciones(siguientes);
      if (payload.totales) setTotales(payload.totales);
      if (payload.totalesNoLeidos) setTotalesNoLeidos(payload.totalesNoLeidos);
      setErrorLista(null);
    } catch (err) {
      const estado = err.response ? err.response.status : null;
      let mensaje;
      if (!err.response) {
        mensaje = "No se pudo conectar con /api/admin/inbox. ¿Backend de la fase 2B desplegado?";
      } else if (estado === 404) {
        mensaje = "El endpoint /api/admin/inbox todavía no existe en el servidor (backend en construcción).";
      } else if (estado === 403) {
        mensaje = "Sin permisos para ver el inbox (requiere chat:manage).";
      } else {
        mensaje = (err.response.data && err.response.data.error) || `Error ${estado} cargando el inbox.`;
      }
      setErrorLista(mensaje);
      console.warn("⚠️ [Inbox] Error cargando la lista:", mensaje);
    } finally {
      if (!silencioso) setCargandoLista(false);
    }
  };
  cargarListaRef.current = cargarLista;

  // ── Hilo (§6.3 / §8.4) ────────────────────────────────────────────────────
  const cargarHilo = async (clave, { pagina = 1, reiniciar = false } = {}) => {
    const conv = conversacionesRef.current[clave];
    if (!conv) return;
    setCargandoHilo(true);
    try {
      const res = await apiClient.get(`${API_INBOX}/hilo`, {
        params: {
          canal: conv.canal,
          usuarioId: conv.usuarioId,
          page: pagina,
          limite: LIMITE_HILO,
        },
      });
      const data = res.data || {};
      const nuevos = Array.isArray(data.data) ? data.data : [];
      paginaHiloRef.current = pagina;
      if (pagina === 1) {
        setMensajes((prev) => (reiniciar ? nuevos : fusionarMensajes(prev, nuevos)));
      } else {
        setMensajes((prev) => fusionarMensajes(nuevos, prev));
      }
      setPaginacion(data.pagination || {});
    } catch (err) {
      const mensaje =
        (err.response && err.response.data && err.response.data.error) ||
        "No se pudo cargar el hilo de la conversación.";
      console.warn(`⚠️ [Inbox] Error cargando el hilo de ${clave}:`, mensaje);
      window.showToast?.(mensaje, "error");
    } finally {
      setCargandoHilo(false);
    }
  };
  cargarHiloRef.current = cargarHilo;

  // ── LOTE B4 · Ficha del cliente (WA-118..130) ─────────────────────────────
  // GET /api/admin/inbox/contexto entrega, en un solo viaje, todo lo que la ficha
  // necesita: datos del cliente (nombre/cédula/dirección), historial (nº compras +
  // LTV USD), carrito en vivo (items + tasa BCV + totales USD/Bs) y el pedido
  // activo (`_id`, `idFormateado`, `estado`, `repartidor`, comprobante) junto con
  // la lista de repartidores asignables. Además, `pedidoActivo.estado` es la
  // fuente del banner de acciones del hilo.
  // Es EXCLUSIVO de WhatsApp: en Instagram/Messenger el adaptador devuelve el
  // perfil, no el CRM, así que ni se pide (§3: la ficha CRM es de WhatsApp).
  const cargarContexto = async (conv, { silencioso = false } = {}) => {
    if (!conv || conv.canal !== "whatsapp") {
      setContexto(null);
      return null;
    }
    // Guarda anti-carrera: si el operador cambia de chat mientras el CRM está en
    // vuelo, la respuesta tardía NO debe pisar la ficha (ni el `pedidoActivo` del
    // banner de acciones, que podría despachar el pedido equivocado).
    const claveConv = conv.clave || `${conv.canal}:${conv.usuarioId}`;
    if (!silencioso) setCargandoContexto(true);
    try {
      const res = await apiClient.get(`${API_INBOX}/contexto`, {
        params: { canal: conv.canal, usuarioId: conv.usuarioId },
      });
      if (claveActivaRef.current !== claveConv) return null;
      const data = (res.data && res.data.data) || null;
      setContexto(data);
      return data;
    } catch (err) {
      // La ficha es un extra: si el CRM falla, el hilo sigue operativo.
      if (claveActivaRef.current !== claveConv) return null;
      if (!silencioso) {
        window.showToast?.(
          (err.response && err.response.data && err.response.data.error) ||
            "No se pudo cargar la ficha del cliente",
          "error",
        );
      }
      setContexto(null);
      return null;
    } finally {
      if (!silencioso) setCargandoContexto(false);
    }
  };
  cargarContextoRef.current = cargarContexto;

  /**
   * ── LOTE B7c · WA-11 — HISTORIAL DE COMPRAS DEL CLIENTE ─────────────────────
   * Origen legacy: `WhatsAppConsole.js:228-237` (`fetchPurchases` →
   * `GET /api/admin/pedidos-historial?telefono=`). El contrato unificado (§6.3) no
   * incluye ese endpoint porque NO es una acción de chat sino una lectura de
   * catálogo por contacto; el inbox lo consume igual que el legacy, pero SOLO
   * para WhatsApp (el modelo `Pedido` es exclusivo de ese canal, §6.2), así que
   * en Instagram/Messenger el historial queda vacío y no se pide nada.
   *
   * El historial alimenta las tarjetas «Pedido Confirmado» del timeline (WA-83) y
   * el `pago_enviado_cliente` del socket (WA-21) lo mantiene al día sin HTTP.
   * Es un extra: si falla, el hilo sigue operativo (no se avisa por toast).
   */
  const cargarCompras = async (conv) => {
    if (!conv || conv.canal !== "whatsapp") {
      setHistorialCompras([]);
      return;
    }
    const claveConv = conv.clave || `${conv.canal}:${conv.usuarioId}`;
    try {
      const res = await apiClient.get("/api/admin/pedidos-historial", {
        params: { telefono: conv.usuarioId },
      });
      if (claveActivaRef.current !== claveConv) return;
      setHistorialCompras(normalizarCompras(res.data));
    } catch (err) {
      if (claveActivaRef.current !== claveConv) return;
      setHistorialCompras([]);
      console.warn(
        "⚠️ [Inbox] No se pudo cargar el historial de compras:",
        (err.response && err.response.data && err.response.data.error) || err.message,
      );
    }
  };
  cargarComprasRef.current = cargarCompras;

  /**
   * Refresco tras una acción de pedido/pago/despacho: la lista (chip de pedido y
   * `unreadCount`), el hilo y el CRM. El evento `inbox_actualizado` del servidor
   * también invalida la lista, pero el refresco explícito garantiza que el
   * operador vea el cambio aunque el socket esté caído.
   */
  const refrescarTrasAccionPedido = async () => {
    if (cargarListaRef.current) await cargarListaRef.current({ silencioso: true });
    const clave = claveActivaRef.current;
    const conv = clave ? conversacionesRef.current[clave] : null;
    if (clave && cargarHiloRef.current) {
      await cargarHiloRef.current(clave, { pagina: 1, reiniciar: false });
    }
    if (conv) await cargarContexto(conv, { silencioso: true });
    // LOTE B7c · WA-11: el historial de compras también cambia (el pedido nuevo
    // entra en el timeline con su tarjeta «Pedido Confirmado»).
    if (conv && cargarComprasRef.current) await cargarComprasRef.current(conv);
  };

  /**
   * LOTE B4 · WA-14/WA-35 — Confirmar Pago y Enviar Comandas.
   * Origen legacy: WhatsAppConsole.js:295-313 (POST /api/admin/confirmar_pago).
   * Aquí por el endpoint unificado (canal fijo en el path, §6.3).
   */
  const confirmarPagoDesdeHilo = async (pedidoId) => {
    const clave = claveActivaRef.current;
    const conv = clave ? conversacionesRef.current[clave] : null;
    if (!conv || conv.canal !== "whatsapp") return;
    setAccionPedidoEnCurso(true);
    try {
      const payload = { canal: "whatsapp", usuarioId: conv.usuarioId };
      if (pedidoId) payload.pedidoId = pedidoId;
      const res = await apiClient.post(`${API_INBOX}/whatsapp/pago/confirmar`, payload);
      const data = (res.data && res.data.data) || {};
      // El handler legacy responde `{ data: { idFormateado } }` (su consola leía
      // `data.correlativo`, que nunca existió): aquí se aceptan ambos.
      const correlativo = data.correlativo || data.idFormateado || "";
      window.showToast?.(
        `Pedido ${correlativo} verificado. Comandas enviadas.`.trim(),
      );
    } catch (err) {
      window.showToast?.(
        (err.response && err.response.data && (err.response.data.error || err.response.data.message)) ||
          "Error al confirmar pago.",
        "error",
      );
    } finally {
      setAccionPedidoEnCurso(false);
      await refrescarTrasAccionPedido();
    }
  };

  /**
   * LOTE B4 · WA-15/WA-36 (en_ruta) y WA-37 (entregado).
   * Origen legacy: WhatsAppConsole.js:315-336 (PATCH /api/admin/orders/:id/status
   * con `{ estado, telefono }`); aquí por PATCH /inbox/whatsapp/pedido/:id/estado.
   */
  const cambiarEstadoPedidoDesdeHilo = async (pedidoId, nuevoEstado) => {
    const clave = claveActivaRef.current;
    const conv = clave ? conversacionesRef.current[clave] : null;
    if (!conv || conv.canal !== "whatsapp" || !pedidoId || !nuevoEstado) return;
    setAccionPedidoEnCurso(true);
    try {
      const res = await apiClient.patch(
        `${API_INBOX}/whatsapp/pedido/${encodeURIComponent(pedidoId)}/estado`,
        { canal: "whatsapp", usuarioId: conv.usuarioId, estado: nuevoEstado },
      );
      if (res.data && res.data.success === false) {
        throw new Error((res.data && res.data.error) || "El servidor rechazó el cambio de estado");
      }
      window.showToast?.(`Estado actualizado a: ${String(nuevoEstado).replace(/_/g, " ")}`);
    } catch (err) {
      window.showToast?.(
        (err.response && err.response.data && err.response.data.error) ||
          err.message ||
          "Error al actualizar estado.",
        "error",
      );
    } finally {
      setAccionPedidoEnCurso(false);
      await refrescarTrasAccionPedido();
    }
  };

  /**
   * LOTE B4 · WA-128 — Asignar repartidor desde la ficha (el drawer lo invoca con
   * `(pedidoId, repartidor)`).
   * Origen legacy: WhatsAppConsole.js:280-292 (PATCH /api/admin/orders/:id/repartidor).
   * Aquí por PATCH /inbox/whatsapp/pedido/:id/repartidor. Se envía también
   * `usuarioId` (opcional para el handler legacy, lo usa el evento de invalidación).
   */
  const asignarRepartidorDesdeFicha = async (pedidoId, repartidor) => {
    const clave = claveActivaRef.current;
    const conv = clave ? conversacionesRef.current[clave] : null;
    if (!conv || conv.canal !== "whatsapp" || !pedidoId) return;
    try {
      const res = await apiClient.patch(
        `${API_INBOX}/whatsapp/pedido/${encodeURIComponent(pedidoId)}/repartidor`,
        { canal: "whatsapp", usuarioId: conv.usuarioId, repartidor },
      );
      if (res.data && res.data.success === false) {
        throw new Error((res.data && res.data.error) || "El servidor rechazó la asignación");
      }
      window.showToast?.("Repartidor asignado correctamente");
    } catch (err) {
      window.showToast?.(
        (err.response && err.response.data && err.response.data.error) ||
          err.message ||
          "Error al asignar repartidor",
        "error",
      );
    } finally {
      await refrescarTrasAccionPedido();
    }
  };

  /**
   * ── LOTE B6 · AJUSTES DE CANAL (no de conversación) ────────────────────────
   *
   * IG-01 · IG-18 — estado global del bot de Instagram.
   *   GET /api/admin/inbox/instagram/bot-toggle?canal=instagram
   * Origen legacy: InstagramConsole.js:49-58 (`/api/admin/ig/bot-toggle`). El
   * endpoint unificado ya existía sin uso; este lote lo cierra.
   */
  const cargarBotToggle = async () => {
    setBotIg((prev) => (prev.cargando ? prev : { ...prev, cargando: true }));
    try {
      const res = await apiClient.get(`${API_INBOX}/instagram/bot-toggle`, {
        params: { canal: "instagram" },
      });
      const data = (res.data && res.data.data) || {};
      setBotIg((prev) => ({
        ...prev,
        enabled: typeof data.enabled === "boolean" ? data.enabled : prev.enabled,
        cargando: false,
      }));
    } catch (err) {
      setBotIg((prev) => ({ ...prev, cargando: false }));
      console.warn(
        "⚠️ [Inbox] No se pudo consultar el bot global de Instagram:",
        (err.response && err.response.data && err.response.data.error) || err.message,
      );
    }
  };
  cargarBotToggleRef.current = cargarBotToggle;

  /**
   * IG-01 — alterna el bot global (OPTIMISTA + rollback), paridad con
   * InstagramConsole.js:61-87, por el endpoint unificado.
   * POST /api/admin/inbox/instagram/bot-toggle  { canal: "instagram", enabled }
   */
  const alternarBotInstagram = async (siguiente) => {
    if (botIgRef.current.cargando || botIgRef.current.cambiando) return;
    const previo = botIgRef.current.enabled;
    const deseado = typeof siguiente === "boolean" ? siguiente : !previo;
    setBotIg((prev) => ({ ...prev, enabled: deseado, cambiando: true }));
    try {
      const res = await apiClient.post(`${API_INBOX}/instagram/bot-toggle`, {
        canal: "instagram",
        enabled: deseado,
      });
      const data = (res.data && res.data.data) || {};
      const final = typeof data.enabled === "boolean" ? data.enabled : deseado;
      setBotIg((prev) => ({ ...prev, enabled: final, cambiando: false }));
      window.showToast?.(
        final ? "Bot de Instagram activado" : "Bot de Instagram pausado (manual)",
        final ? "success" : "warning",
      );
    } catch (err) {
      setBotIg((prev) => ({ ...prev, enabled: previo, cambiando: false }));
      window.showToast?.("No se pudo cambiar el estado del bot", "error");
    }
  };

  /**
   * LOTE B5 · WA-95 — TICKS DE ESTADO EN VIVO (enviando/sent/delivered/read/failed).
   *
   * INVESTIGACIÓN: `mensaje_status_actualizado` SÍ existe en el backend y SÍ llega
   * al panel: Meta manda los `statuses` al webhook y
   * `controllers/webhookController.ts:82` llama a
   * `orderService.actualizarEstadoMensaje(wamid, status, errors, io)`, que hace
   * `io.emit("mensaje_status_actualizado", {_id, wamid, telefono, status, error})`
   * (`services/orderService.ts:397`). El LOTE B3 añadió `status_actualizado` para
   * los reintentos (`whatsappAdapter.ts:295`).
   *
   * El problema real era que ambos eventos solo disparaban una RECARGA del hilo
   * con el debounce de 800 ms (y `status_actualizado` ni siquiera estaba suscrito),
   * así que el ✓✓ no aparecía hasta el siguiente refresco. Aquí se parchea el
   * mensaje EN SITIO en cuanto llega el evento, sin esperar la recarga. Es un
   * refinamiento optimista: la recarga sigue haciéndose (verdad del servidor).
   */
  const aplicarEstadoMensaje = (estado) => {
    if (!estado || !estado.status) return;
    const claveEstado =
      estado.clave ||
      (estado.canal && estado.usuarioId ? `${estado.canal}:${estado.usuarioId}` : null);
    const claveActual = claveActivaRef.current;
    // Solo interesa el hilo abierto (y, si no hay hilo, solo la lista).
    if (claveActual && claveEstado && claveEstado !== claveActual) return;

    setMensajes((prev) => {
      let encontrado = false;
      const next = prev.map((m) => {
        const coincide =
          (estado._id && String(m._id) === estado._id) ||
          (estado.idExterno && m.idExterno && String(m.idExterno) === estado.idExterno);
        if (coincide) encontrado = true;
        return coincide ? Object.assign({}, m, { status: estado.status }) : m;
      });

      if (!encontrado && (estado.idExterno || estado._id)) {
        pendingStatusesRef.current[estado.idExterno || estado._id] = estado.status;
      }
      return next;
    });

    // El chip de la lista también refleja el estado del último saliente.
    if (claveEstado) {
      setConversaciones((prev) => {
        const conv = prev[claveEstado];
        if (!conv || !conv.ultimoMensaje) return prev;
        if (conv.ultimoMensaje.direccion !== "saliente") return prev;
        return Object.assign({}, prev, {
          [claveEstado]: Object.assign({}, conv, {
            ultimoMensaje: Object.assign({}, conv.ultimoMensaje, {
              status: estado.status,
            }),
          }),
        });
      });
    }
  };

  // ── LOTE B7b · IG-07 — MENSAJE NUEVO EN SITIO (append + dedupe de temporales) ─
  // Paridad con `InstagramConsole.js:192-241,270` (socket `mensaje_ig`): en vez de
  // esperar la recarga debounced de 800 ms, la burbuja entra YA en el hilo
  // abierto, el preview de la lista se actualiza y el contador de no leídos sube
  // si la conversación no es la activa. La recarga posterior sigue vigente (el
  // servidor es la fuente de verdad) y `fusionarMensajes` evita duplicados por
  // `_id`/mid, así que el adelanto es inocuo.
  const aplicarMensajeEntrante = (evento) => {
    if (!evento || !evento.usuarioId || !evento.mensaje) return;
    const clave = evento.clave || `${evento.canal}:${evento.usuarioId}`;
    const raw = evento.mensaje;
    const dirRaw = String((raw && (raw.direccion || raw.direction)) || "cliente");
    const saliente =
      dirRaw === "bot" || dirRaw === "admin" || dirRaw === "saliente";
    const tipo = raw.tipo || "texto";
    const texto =
      raw.texto ||
      raw.text ||
      raw.caption ||
      (tipo === "imagen" ? "[Foto]" : tipo === "audio" ? "[Audio]" : "[Adjunto]");
    const nuevo = {
      _id: raw._id || null,
      idExterno: raw.mid || raw.wamid || null,
      texto,
      caption: raw.caption || null,
      direccion: saliente ? "saliente" : "entrante",
      timestamp: aMillis(raw.timestamp) || Date.now(),
      status: raw.status || (saliente ? "sent" : null),
      tipo,
      mediaUrl: raw.mediaUrl || null,
      mediaType: raw.mediaType || null,
      mimeType: raw.mimeType || null,
      fileName: raw.fileName || null,
    };
    const idNuevo = nuevo._id ? String(nuevo._id) : null;

    // 1) Append en el hilo (solo si es el hilo abierto) con dedupe.
    setMensajes((prev) => {
      if (clave !== claveActivaRef.current) return prev;
      // Dedupe del temporal de texto que coincide (InstagramConsole.js:217-223).
      let base = prev;
      if (saliente) {
        const sinTemporal = prev.filter((m) => !(esTemporal(m) && textoDe(m) === texto));
        base = sinTemporal;
      }
      if (idNuevo && base.some((m) => String(m._id) === idNuevo)) return base;
      if (
        nuevo.idExterno &&
        base.some((m) => m.idExterno && String(m.idExterno) === String(nuevo.idExterno))
      ) {
        return base;
      }
      return fusionarMensajes(base, [nuevo]);
    });

    // 2) Preview de la fila + contador de no leídos (paridad WhatsAppConsole.js:422-526).
    //    La conversación está «atendida» solo si es la activa Y la pestaña está
    //    visible (`document.hidden`); en cualquier otro caso el mensaje del cliente
    //    queda sin atender — es el criterio literal del legacy
    //    (`document.hidden || activePhoneRef.current !== phone`), más fino que el
    //    `esLaActiva` que se usaba antes.
    const convActual = conversacionesRef.current[clave] || null;
    const esAtendida = claveActivaRef.current === clave && !document.hidden;
    setConversaciones((prev) => {
      const conv = prev[clave];
      if (!conv) return prev;
      return Object.assign({}, prev, {
        [clave]: Object.assign({}, conv, {
          ultimoMensaje: {
            texto,
            tipo,
            direccion: saliente ? "saliente" : "entrante",
            timestamp: nuevo.timestamp,
            status: nuevo.status,
            mediaUrl: nuevo.mediaUrl,
          },
          noLeidos: esAtendida
            ? 0
            : (Number(conv.noLeidos) || 0) + (saliente ? 0 : 1),
        }),
      });
    });

    // 3) LOTE B7c · WA-17 — AVISO del mensaje entrante NO atendido (paridad
    //    WhatsAppConsole.js:481-525): toast con el canal explícito (un mensaje de
    //    WhatsApp nunca se presenta como de Instagram ni al revés), tono nativo si
    //    el chat está en modo manual o la pestaña está oculta, y notificación de
    //    escritorio vía Service Worker (X-03) cuando la pestaña no se ve.
    if (saliente || esAtendida || !convActual) return;
    const etiquetaCanal = ETIQUETA_CANAL[evento.canal] || evento.canal;
    const nombreRemitente = convActual.nombreVisible || convActual.usuarioId;
    window.showToast?.(`Nuevo mensaje de ${nombreRemitente} (${etiquetaCanal})`);
    if (convActual.modo === "manual" || document.hidden) {
      playNotificationTone("message");
    }
  };

  // ── LOTE B7b · IG-09 — CAMBIO DE MODO EN SITIO (modo + requiereAtencion) ────
  // Paridad con `InstagramConsole.js:253-268,273` (socket `ig_modo_actualizado`):
  // el legacy aplicaba el modo y RECALCULABA `requiresAttention` en el cliente;
  // el inbox solo recargaba. La definición usada aquí es la del servidor
  // (§6.2.1 del contrato): manual · stuck · bloqueado · anuncio.
  const aplicarModoConversacion = (evento) => {
    if (!evento || !evento.usuarioId) return;
    const modo = evento.modo === "manual" ? "manual" : "automatico";
    const clave = evento.clave || `${evento.canal}:${evento.usuarioId}`;
    setConversaciones((prev) => {
      const conv = prev[clave];
      if (!conv) return prev;
      return Object.assign({}, prev, {
        [clave]: Object.assign({}, conv, {
          modo,
          requiereAtencion:
            modo === "manual" ||
            conv.stuck === true ||
            conv.bloqueado === true ||
            conv.origen === "anuncio",
        }),
      });
    });
  };

  // ── LOTE B7c · WA-21 — PAGO DEL CLIENTE (comprobante) EN SITIO ──────────────
  // Paridad con `WhatsAppConsole.js:547-592` (`handlePaymentReceived`): el payload
  // es el documento `Pedido` completo, así que se actualiza el resumen del sidebar
  // SIN HTTP, se añade/actualiza la compra en el historial del hilo abierto, se
  // toca el tono de pago y se avisa por toast. `Pedido` existe SOLO en WhatsApp
  // (§6.2), así que si un payload declarase otro canal se ignora: así la ficha de
  // Instagram/Messenger nunca muestra compras de WhatsApp.
  const aplicarPagoCliente = (evento) => {
    if (!evento || !evento.pedido) return;
    if (evento.canal !== "whatsapp") return;
    const pedido = evento.pedido;
    const clave = evento.clave || `${evento.canal}:${evento.usuarioId}`;
    const idFormateado =
      pedido.idFormateado ||
      (pedido.correlativo ? `#${pedido.correlativo}` : "") ||
      "---";

    // 1) Historial de compras del hilo abierto (WA-11): alta o actualización por
    //    `_id`, sin HTTP.
    setHistorialCompras((prev) => {
      if (claveActivaRef.current !== clave) return prev;
      const id = pedido._id ? String(pedido._id) : null;
      const existe = id && prev.some((o) => String(o._id) === id);
      return existe
        ? prev.map((o) => (String(o._id) === id ? Object.assign({}, o, pedido) : o))
        : normalizarCompras([pedido]).concat(prev);
    });

    // 2) Sidebar: resumen «Pago recibido» + nombre/cédula si aún no estaban.
    setConversaciones((prev) => {
      const conv = prev[clave];
      if (!conv) return prev;
      const nombreCliente =
        pedido.cliente && pedido.cliente.nombre && pedido.cliente.nombre.trim() !== "Sin nombre"
          ? pedido.cliente.nombre.trim()
          : null;
      const cedulaCliente =
        pedido.cliente && pedido.cliente.cedula && pedido.cliente.cedula.trim() !== "Sin cédula"
          ? pedido.cliente.cedula.trim()
          : null;
      return Object.assign({}, prev, {
        [clave]: Object.assign({}, conv, {
          nombre: conv.nombre || nombreCliente,
          cedula: conv.cedula || cedulaCliente,
          ultimoMensaje: {
            texto: `Pago recibido (${idFormateado})`,
            tipo: "texto",
            direccion: "entrante",
            timestamp: Date.now(),
            status: null,
            mediaUrl: null,
          },
        }),
      });
    });

    // 3) Tono de pago (distinguible del de mensaje) + toast. El push lo cubre el
    //    listener global de `index.html` (X-07), así que aquí no se duplica.
    playNotificationTone("payment");
    if (claveActivaRef.current === clave) {
      window.showToast?.(`Nuevo comprobante recibido (${idFormateado})`);
    } else {
      const conv = conversacionesRef.current[clave];
      window.showToast?.(
        `Nuevo pago recibido de ${(conv && conv.nombreVisible) || pedido.whatsappId}`,
      );
    }
  };

  // ── LOTE B7c · WA-28 — ORDEN ESTANCADA (marca `stuck` en vivo) ──────────────
  // Paridad con `WhatsAppConsole.js:668-676` (`handleAlertaEstancada`): el payload
  // del watchdog es `{id, correlativo, cliente, telefono, minutos}` y la fila pasa
  // a `stuck: true` → punto rojo pulsante (WA-59) + `requiereAtencion` (§6.2.1).
  // El toast y el sonido de alerta ya los da el listener global del panel (X-10),
  // así que aquí NO se duplican.
  const aplicarAlertaEstancada = (evento) => {
    if (!evento || !evento.usuarioId) return;
    const clave = evento.clave || `${evento.canal}:${evento.usuarioId}`;
    setConversaciones((prev) => {
      const conv = prev[clave];
      if (!conv) return prev;
      return Object.assign({}, prev, {
        [clave]: Object.assign({}, conv, {
          stuck: true,
          requiereAtencion: true,
        }),
      });
    });
  };

  // ── LOTE B7c · WA-27 — PASO/ETIQUETA DEL EMBUDO EN SITIO ────────────────────
  // Paridad con `WhatsAppConsole.js:652-666` (`handleEstadoActualizado`) con
  // payload `{telefono, paso, pasoLabel, etiqueta}`. Solo se parchean los campos
  // presentes: no se inventan valores y la recarga (evento legacy) reconcilia.
  const aplicarEstadoEmbudo = (evento) => {
    if (!evento || !evento.usuarioId) return;
    const clave = evento.clave || `${evento.canal}:${evento.usuarioId}`;
    setConversaciones((prev) => {
      const conv = prev[clave];
      if (!conv) return prev;
      const patch = {};
      if (evento.paso !== undefined) patch.paso = evento.paso;
      if (evento.pasoLabel !== undefined) patch.pasoLabel = evento.pasoLabel;
      if (evento.etiqueta !== undefined) patch.etiqueta = evento.etiqueta;
      if (!Object.keys(patch).length) return prev;
      return Object.assign({}, prev, { [clave]: Object.assign({}, conv, patch) });
    });
  };

  // ── LOTE B7c · X-15 — CONSUMO DEL DEEP-LINK A LA CONSOLA DE CANAL ───────────
  // `index.html:650-671` (openCanalConsole) escribe `pachi_inbox_deeplink` y emite
  // `pachi:focus-conversacion` antes de cambiar de pestaña. La matriz (X-15/E-10/
  // E-20) documentaba que NADIE lo consumía: ni la consola legacy (prohibido
  // tocarla en este lote) ni el inbox. Aquí el inbox SÍ lo consume — fija el raíl
  // en el canal del atajo y abre esa conversación — así que el deep-link deja de
  // ser «solo cambia de pestaña» y pasa a enfocar la conversación. Si la lista del
  // canal aún no trae ese contacto, se recuerda en `pendienteDeeplinkRef` y se abre
  // en cuanto llega. Messenger no tiene consola dedicada → se ignora.
  const enfocarDeeplink = (canal, usuarioId) => {
    if (!usuarioId) return;
    if (canal !== "whatsapp" && canal !== "instagram") return;
    const claveDestino = `${canal}:${String(usuarioId)}`;
    setFiltros((prev) =>
      prev.canal === canal ? prev : Object.assign({}, prev, { canal }),
    );
    if (conversacionesRef.current[claveDestino]) {
      pendienteDeeplinkRef.current = null;
      abrirConversacionRef.current(claveDestino);
    } else {
      pendienteDeeplinkRef.current = claveDestino;
    }
  };
  enfocarDeeplinkRef.current = enfocarDeeplink;

  // ── LOTE B7a · WA-68 — PRESENCIA / ESCRIBIENDO (paridad WhatsAppConsole.js:678-709)
  // El servidor hoy no emite `cliente_presencia`/`cliente_typing` (brecha WA-19/20
  // del doc, que también afecta a la consola legacy), pero el inbox implementa la
  // misma recepción + TTL: cuando exista el emisor, la cabecera del hilo muestra
  // «escribiendo…» / «en línea» / «desconectado» sin más cambios.
  const aplicarPresencia = (evento) => {
    if (!evento || !evento.usuarioId) return;
    const ts = Number(evento.timestamp) || Date.now();
    const ttl = Number(evento.ttlMs) || (evento.tipo === "typing" ? 8000 : 15000);
    setPresenciaMap((prev) => {
      const actual = prev[evento.usuarioId] || {};
      if (evento.tipo === "typing") {
        return Object.assign({}, prev, {
          [evento.usuarioId]: Object.assign({}, actual, {
            isTyping: Boolean(evento.isTyping),
            typingExpiresAt: evento.isTyping ? ts + ttl : 0,
          }),
        });
      }
      return Object.assign({}, prev, {
        [evento.usuarioId]: Object.assign({}, actual, {
          presence: evento.presence || "unknown",
          expiresAt: ts + ttl,
        }),
      });
    });
  };

  // WA-29 (paridad): limpieza de los TTL vencidos cada 3 s.
  useEffect(() => {
    const t = setInterval(() => {
      setPresenciaMap((prev) => {
        const ahora = Date.now();
        let cambio = false;
        const siguiente = {};
        Object.keys(prev).forEach((clave) => {
          const estado = prev[clave] || {};
          const expirado =
            (!Number(estado.expiresAt) || Number(estado.expiresAt) <= ahora) &&
            (!Number(estado.typingExpiresAt) || Number(estado.typingExpiresAt) <= ahora);
          if (expirado) {
            cambio = true;
            return;
          }
          siguiente[clave] = estado;
        });
        return cambio ? siguiente : prev;
      });
    }, 3000);
    return () => clearInterval(t);
  }, []);

  // ── LOTE B7c · WA-41 — INSTALACIÓN DE LA HOJA `.wa-*` (doodle + colas) ─────
  // El legacy la inyecta una vez al montar (`WhatsAppConsole.js:377-386`) con el
  // `id` `wa-custom-styles`. El inbox hace lo MISMO y con el mismo `id`: si el
  // usuario ya pasó por la consola de WhatsApp, la hoja ya está y no se duplica;
  // si entra directo al inbox, se instala aquí. Las clases se aplican en
  // `InboxThread` (`wa-bg-doodle` en el fondo de WhatsApp y `wa-bubble-tail-in/out`
  // en las colas), igual que `MessageList.js:51` y `MessageBubble.js:247`.
  useEffect(() => {
    if (typeof document === "undefined" || !document.head) return undefined;
    if (document.getElementById("wa-custom-styles")) return undefined;
    const styleTag = document.createElement("style");
    styleTag.id = "wa-custom-styles";
    styleTag.innerHTML = estilosWhatsApp;
    document.head.appendChild(styleTag);
    return undefined;
  }, []);

  // ── LOTE B7c · WA-04 — BADGE `(N)` EN EL TÍTULO DE LA PESTAÑA ─────────────
  // Origen legacy: `WhatsAppConsole.js:743-753,784-801`. El inbox NO escribía
  // `document.title` (E-04: solo el contador global de push del `index.html`).
  // Aquí el título refleja los no leídos del CANAL ACTIVO y, con el raíl en
  // «Todos», el total global: es la regla «por canal» — un no leído de Instagram
  // no puede aparecer cuando el operador está trabajando en WhatsApp. Se restaura
  // el título base al desmontar. `window.__pachiInboxTitulo` avisa al contador
  // global de push (`index.html`) de que NO debe pisar el título mientras el inbox
  // esté montado (había dos fuentes de verdad para el mismo `<title>`).
  useEffect(() => {
    if (typeof window !== "undefined") window.__pachiInboxTitulo = true;
    return () => {
      if (typeof window !== "undefined") window.__pachiInboxTitulo = false;
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const canal = filtros.canal || "todos";
    const total =
      canal === "todos"
        ? Number(totalesNoLeidos.todos) || 0
        : Number(totalesNoLeidos[canal]) || 0;
    const base = leerTituloBase();
    document.title = total > 0 ? `(${total}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [filtros.canal, totalesNoLeidos]);

  // ── LOTE B7c · WA-30 — RESET DE NO LEÍDOS AL VOLVER A LA PESTAÑA ──────────
  // Paridad con `WhatsAppConsole.js:784-801`: al recuperar la visibilidad se
  // re-marca leída la conversación activa (el inbox ya la marca al abrirla, pero
  // si llegaron mensajes mientras la pestaña estaba oculta el contador seguía
  // arriba). `POST /inbox/leido` es idempotente (§6.3/A-66).
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const handleVisibility = () => {
      if (document.hidden) return;
      const claveAct = claveActivaRef.current;
      if (!claveAct) return;
      const conv = conversacionesRef.current[claveAct];
      if (conv && Number(conv.noLeidos) > 0 && typeof marcarLeidoRef.current === "function") {
        marcarLeidoRef.current(conv);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // ── LOTE B7c · X-15 — CONSUMO DEL DEEP-LINK ───────────────────────────────
  // (a) Al montar: se LEE y se BORRA `pachi_inbox_deeplink` (una sola vez y solo
  //     si el atajo es reciente) para fijar el canal y abrir la conversación.
  // (b) Se escucha `pachi:focus-conversacion`, el mismo evento que despacha
  //     `openCanalConsole` (`index.html:665-669`), para reaccionar si el atajo se
  //     emite con el inbox ya montado.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    try {
      const raw = sessionStorage.getItem("pachi_inbox_deeplink");
      if (raw) {
        sessionStorage.removeItem("pachi_inbox_deeplink");
        const dl = JSON.parse(raw);
        const frescura = Date.now() - (Number(dl && dl.ts) || 0);
        if (dl && dl.usuarioId && frescura <= DEEPLINK_TTL_MS) {
          if (typeof enfocarDeeplinkRef.current === "function") {
            enfocarDeeplinkRef.current(dl.canal, dl.usuarioId);
          }
        }
      }
    } catch (err) {
      // sessionStorage no disponible o JSON inválido: el inbox sigue con normalidad
    }
    const handleFocus = (ev) => {
      const detalle = (ev && ev.detail) || null;
      if (!detalle || !detalle.canal || !detalle.usuarioId) return;
      if (typeof enfocarDeeplinkRef.current === "function") {
        enfocarDeeplinkRef.current(detalle.canal, detalle.usuarioId);
      }
    };
    window.addEventListener("pachi:focus-conversacion", handleFocus);
    return () => window.removeEventListener("pachi:focus-conversacion", handleFocus);
  }, []);

  // Abre la conversación del deep-link pendiente en cuanto la lista del canal la
  // contiene (la primera carga puede tardar o venir filtrada por el canal).
  useEffect(() => {
    const pendiente = pendienteDeeplinkRef.current;
    if (!pendiente) return;
    if (!conversaciones[pendiente]) return;
    pendienteDeeplinkRef.current = null;
    if (typeof abrirConversacionRef.current === "function") {
      abrirConversacionRef.current(pendiente);
    }
  }, [conversaciones]);

  // ── Tiempo real (§6.4) ────────────────────────────────────────────────────
  useInboxSocket({
    socket,
    onInvalidar: (lote) => {
      const eventos = Array.isArray(lote) ? lote : [];
      if (cargarListaRef.current) cargarListaRef.current({ silencioso: true, origen: "socket" });
      const clave = claveActivaRef.current;
      if (!clave) return;
      const afectaAlHilo = eventos.some((ev) => !ev.clave || ev.clave === clave);
      if (!afectaAlHilo) return;
      if (cargarHiloRef.current) {
        cargarHiloRef.current(clave, { pagina: 1, reiniciar: false });
      }
      // LOTE B4: el CRM también se recarga en vivo — de él salen el estado del
      // pedido activo (banner de acciones WA-14/15/35/36/37) y el comprobante /
      // repartidor de la ficha (WA-118..130).
      const conv = conversacionesRef.current[clave];
      if (conv && cargarContextoRef.current) {
        cargarContextoRef.current(conv, { silencioso: true });
      }
    },
    // LOTE B5 · WA-95: ticks de estado al instante (sin esperar la recarga).
    onStatus: aplicarEstadoMensaje,
    // LOTE B6 · IG-02: socket `ig_bot_toggle` → sincroniza el switch global del
    // bot de Instagram si se cambia desde otro dispositivo/consola.
    onBotToggle: (data) => {
      if (!data || typeof data.enabled !== "boolean") return;
      setBotIg((prev) => (prev.enabled === data.enabled ? prev : { ...prev, enabled: data.enabled }));
    },
    // LOTE B7a · WA-68: presencia/escribiendo del cliente (solo WhatsApp).
    onPresence: aplicarPresencia,
    // LOTE B7b · IG-07: mensaje nuevo al instante (append + dedupe + no leídos).
    onMensaje: aplicarMensajeEntrante,
    // LOTE B7b · IG-09: cambio de modo por socket (modo + requiereAtencion).
    onModo: aplicarModoConversacion,
    // LOTE B7c · WA-21: comprobante del cliente (historial + sidebar + tono + toast).
    onPagoCliente: aplicarPagoCliente,
    // LOTE B7c · WA-28: orden estancada → marca `stuck` en la fila al instante.
    onAlertaEstancada: aplicarAlertaEstancada,
    // LOTE B7c · WA-27: paso/pasoLabel/etiqueta del embudo al instante.
    onEstadoEmbudo: aplicarEstadoEmbudo,
  });

  // LOTE B6 · IG-01: al abrir el inbox se consulta el estado global del bot
  // (paridad con InstagramConsole.js:49-58, que lo hace en su montaje) y, si al
  // fijar el canal Instagram aún no se conoce, se reintenta una vez.
  useEffect(() => {
    if (typeof cargarBotToggleRef.current === "function") cargarBotToggleRef.current();
  }, []);

  useEffect(() => {
    if (filtros.canal !== "instagram") return;
    if (botIgRef.current.enabled !== null || botIgRef.current.cargando) return;
    if (typeof cargarBotToggleRef.current === "function") cargarBotToggleRef.current();
  }, [filtros.canal]);

  // ── Carga inicial + recarga al cambiar filtros/búsqueda (debounced) ───────
  useEffect(() => {
    const t = setTimeout(() => {
      if (cargarListaRef.current) cargarListaRef.current();
    }, 300);
    return () => clearTimeout(t);
  }, [
    filtros.canal,
    filtros.noLeidos,
    filtros.modo,
    filtros.atencion,
    filtros.conPedido,
    buscar,
  ]);

  // Recarga manual (paridad con el botón del sidebar de WhatsApp)
  useEffect(() => {
    const handleRefresh = () => {
      if (cargarListaRef.current) cargarListaRef.current();
      const clave = claveActivaRef.current;
      if (clave && cargarHiloRef.current) cargarHiloRef.current(clave, { pagina: 1, reiniciar: false });
    };
    window.addEventListener("refreshChatList", handleRefresh);
    return () => window.removeEventListener("refreshChatList", handleRefresh);
  }, []);

  // Mantener sincronizada la conversación activa con el store
  useEffect(() => {
    if (!claveActiva) {
      setConversacionActiva(null);
      return;
    }
    const conv = conversaciones[claveActiva];
    if (conv) {
      // FIX LOTE B7a (bug de la migración V3): antes el guardado CONSERVABA la
      // conversación anterior cuando la clave difería
      // (`prev.clave === conv.clave ? conv : prev`), así que al seleccionar otra
      // conversación el hilo seguía mostrando la vieja mientras `claveActiva` —y
      // por tanto el composer, el modo, las acciones de pedido y el Copiloto de
      // Venta Manual— apuntaban ya a la nueva (cabecera y hilo desincronizados).
      // Ahora se adopta SIEMPRE la conversación seleccionada y, si es la misma,
      // se refresca con la versión del store (que es el objetivo original de
      // IN-10: mantener el hilo al día sin cambiar de conversación).
      setConversacionActiva((prev) =>
        prev && prev.clave === conv.clave ? Object.assign({}, prev, conv) : conv,
      );
    }
  }, [conversaciones, claveActiva]);

  // Sincronizar el estado de mute si otra vista lo cambia
  useEffect(() => {
    const handleMuteToggled = () => setIsMuted(leerMute());
    window.addEventListener("pachi_mute_toggled", handleMuteToggled);
    return () => window.removeEventListener("pachi_mute_toggled", handleMuteToggled);
  }, []);

  // §8.6 Mobile: ocultar la barra de navegación inferior cuando hay conversación activa
  useEffect(() => {
    const globalSidebar = document.getElementById("global-sidebar");
    if (!globalSidebar) return undefined;
    const handleResize = () => {
      if (esMovil() && claveActiva) {
        globalSidebar.classList.add("hidden");
      } else {
        globalSidebar.classList.remove("hidden");
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      globalSidebar.classList.remove("hidden");
    };
  }, [claveActiva]);

  // ── Acciones ──────────────────────────────────────────────────────────────
  const marcarLeido = async (conv) => {
    // Optimista: el servidor es la fuente de verdad (§8.3)
    const pendientes = Number(conv.noLeidos) || 0;
    setConversaciones((prev) =>
      prev[conv.clave] ? { ...prev, [conv.clave]: { ...prev[conv.clave], noLeidos: 0 } } : prev,
    );
    // LOTE B7c · WA-30/WA-04: el badge del título baja EN EL CLIENTE con la misma
    // operación. El legacy reseteaba su contador local al volver a la pestaña
    // (WhatsAppConsole.js:784-801) — sin esto, el título seguía mostrando «(N)»
    // justo al recuperar el foco. La recarga posterior reconcilia con el servidor.
    if (pendientes > 0) {
      setTotalesNoLeidos((prev) => {
        const actualCanal = Number(prev[conv.canal]) || 0;
        const actualTodos = Number(prev.todos) || 0;
        return Object.assign({}, prev, {
          [conv.canal]: Math.max(0, actualCanal - pendientes),
          todos: Math.max(0, actualTodos - pendientes),
        });
      });
    }
    try {
      await apiClient.post(`${API_INBOX}/leido`, { canal: conv.canal, usuarioId: conv.usuarioId });
    } catch (err) {
      console.warn(
        "⚠️ [Inbox] No se pudo marcar como leído:",
        (err.response && err.response.data && err.response.data.error) || err.message,
      );
    }
  };
  marcarLeidoRef.current = marcarLeido;

  const abrirConversacion = (clave) => {
    const conv = conversacionesRef.current[clave];
    if (!conv) return;
    setClaveActiva(clave);
    // Ref sincronizado ya (no espera al siguiente render): la guarda anti-carrera
    // de `cargarContexto` compara contra la conversación realmente activa.
    claveActivaRef.current = clave;
    setMensajes([]);
    setPaginacion({});
    setReplyingTo(null); // WA-74: la cita no sobrevive al cambio de chat
    // LOTE B4: la ficha se cierra al cambiar de chat y el CRM se recarga para el
    // nuevo contacto (paridad con WhatsAppConsole.js:814-816).
    setFichaAbierta(false);
    // LOTE B7b: la ficha de perfil de Instagram también se cierra al cambiar de
    // conversación (su `contact` es el del chat).
    setFichaIgAbierta(false);
    // LOTE B7a: el copiloto también se cierra (su `whatsappId` es el del chat).
    setCopilotoAbierto(false);
    setContexto(null);
    paginaHiloRef.current = 1;
    // LOTE B7b · IG-16: el banner de «bot pausado» del hilo de Instagram
    // necesita el estado del switch global; si aún no se conoce (el raíl está en
    // «Todos» o no ha pasado por Instagram) se consulta al abrir el chat.
    if (conv.canal === "instagram" && botIgRef.current.enabled === null) {
      if (typeof cargarBotToggleRef.current === "function") cargarBotToggleRef.current();
    }
    if (Number(conv.noLeidos) > 0) marcarLeido(conv);
    if (cargarHiloRef.current) cargarHiloRef.current(clave, { pagina: 1, reiniciar: true });
    cargarContexto(conv);
    // LOTE B7c · WA-11: historial de compras del cliente (solo WhatsApp).
    cargarCompras(conv);
  };
  abrirConversacionRef.current = abrirConversacion;

  const cerrarConversacion = () => {
    setClaveActiva(null);
    claveActivaRef.current = null;
    setConversacionActiva(null);
    setMensajes([]);
    setPaginacion({});
    setReplyingTo(null);
    setFichaAbierta(false);
    setFichaIgAbierta(false);
    setCopilotoAbierto(false);
    setContexto(null);
    // LOTE B7c · WA-11: el historial tampoco sobrevive al cambio de chat.
    setHistorialCompras([]);
  };

  const cargarMasMensajes = () => {
    const clave = claveActivaRef.current;
    if (!clave) return;
    const paginaActual = Number(paginacion.page) || paginaHiloRef.current || 1;
    if (cargarHiloRef.current) {
      cargarHiloRef.current(clave, { pagina: paginaActual + 1, reiniciar: false });
    }
  };

  const enviarMensaje = async (texto) => {
    const clave = claveActivaRef.current;
    const conv = clave ? conversacionesRef.current[clave] : null;
    const limpio = (texto || "").trim();
    if (!conv || !limpio) return;

    // ── LOTE B3 · WA-34: cita (replyToMid + replyToText) ────────────────────
    // Solo se envía un id externo REAL de Meta; nunca un ObjectId ni un temp-.
    const cita = replyingToRef.current;
    const replyToMid = idExternoValido(cita && cita.idExterno) ? cita.idExterno : null;
    const replyToText = replyToMid ? cita.texto || null : null;

    const ahora = Date.now();
    const temporal = {
      _id: `temp-${ahora}`,
      texto: limpio,
      text: limpio,
      direccion: "saliente",
      timestamp: ahora,
      status: "enviando",
      tipo: "texto",
      replyToId: replyToMid,
      replyToText,
    };
    setMensajes((prev) => fusionarMensajes(prev, [temporal]));
    setConversaciones((prev) =>
      prev[clave]
        ? {
            ...prev,
            [clave]: {
              ...prev[clave],
              ultimoMensaje: {
                texto: limpio,
                tipo: "texto",
                direccion: "saliente",
                timestamp: ahora,
                status: "enviando",
                mediaUrl: null,
              },
            },
          }
        : prev,
    );
    setBorradores((prev) => ({ ...prev, [clave]: "" }));
    // La cita se consume con el envío (paridad con WhatsAppConsole.js:869).
    if (replyToMid) setReplyingTo(null);

    // Dedupe de temporales (patrón recentlySentRef, generalizado por canal — §8.3)
    enviadosRecientesRef.current.push({ texto: limpio, timestamp: ahora });
    if (enviadosRecientesRef.current.length > 10) enviadosRecientesRef.current.shift();

    try {
      const res = await apiClient.post(`${API_INBOX}/mensaje`, {
        canal: conv.canal,
        usuarioId: conv.usuarioId,
        texto: limpio,
        replyToMid,
        replyToText,
      });
      const devuelto = res.data && res.data.data;
      if (devuelto) {
        let finalStatus = devuelto.status || "sent";
        if (devuelto.idExterno && pendingStatusesRef.current[devuelto.idExterno]) {
          finalStatus = pendingStatusesRef.current[devuelto.idExterno];
          delete pendingStatusesRef.current[devuelto.idExterno];
        } else if (devuelto._id && pendingStatusesRef.current[devuelto._id]) {
          finalStatus = pendingStatusesRef.current[devuelto._id];
          delete pendingStatusesRef.current[devuelto._id];
        }
        devuelto.status = finalStatus;

        setMensajes((prev) =>
          fusionarMensajes(
            prev.filter((m) => m._id !== temporal._id),
            [devuelto],
          ),
        );
      } else {
        setMensajes((prev) =>
          prev.map((m) => (m._id === temporal._id ? { ...m, status: "sent" } : m)),
        );
      }
    } catch (err) {
      setMensajes((prev) =>
        prev.map((m) => (m._id === temporal._id ? { ...m, status: "failed" } : m)),
      );
      window.showToast?.(
        (err.response && err.response.data && err.response.data.error) ||
          "No se pudo enviar el mensaje",
        "error",
      );
    }
  };

  /**
   * LOTE B3 · WA-33/WA-94 — Reintento de un mensaje fallido con RECONCILIACIÓN
   * IN-PLACE (paridad con WhatsAppConsole.js:873-893).
   *
   * · El mensaje existente pasa a `enviando` en su sitio: NO se añade burbuja.
   * · El servidor actualiza el MISMO documento (`retryMsgId`) y devuelve el
   *   mensaje reconciliado; al fusionarlo por `_id` la burbuja sigue siendo una.
   * · Solo WhatsApp (único canal con estados de entrega + wamid); si el id es
   *   temporal (`temp-…`) no se envía `retryMsgId` y el servidor crea el mensaje
   *   real, que sustituye al temporal (tampoco duplica).
   */
  const reintentarMensaje = async (mensaje) => {
    const clave = claveActivaRef.current;
    const conv = clave ? conversacionesRef.current[clave] : null;
    if (!conv || !mensaje) return;

    if (conv.canal !== "whatsapp") {
      window.showToast?.("El reintento con reconciliación solo está disponible para WhatsApp.", "warning");
      return;
    }
    if (!textoReintentable(mensaje)) {
      window.showToast?.("Solo se pueden reintentar mensajes de texto.", "warning");
      return;
    }

    const texto = textoDe(mensaje).trim();
    const idOriginal = mensaje._id;
    const retryMsgId = esTemporal({ _id: idOriginal }) ? undefined : idOriginal;
    const retryWamid =
      mensaje.idExterno || (mensaje.fuente && mensaje.fuente.wamid) || undefined;

    // Reconciliación optimista: el mismo mensaje vuelve a `enviando`.
    setMensajes((prev) =>
      prev.map((m) => (m._id === idOriginal ? { ...m, status: "enviando" } : m)),
    );

    try {
      const res = await apiClient.post(`${API_INBOX}/mensaje`, {
        canal: conv.canal,
        usuarioId: conv.usuarioId,
        texto,
        retryMsgId,
        retryWamid,
        // Conserva la cita original del mensaje reintentado, si la tenía.
        replyToMid: mensaje.replyToId || undefined,
        replyToText: mensaje.replyToText || undefined,
      });
      const devuelto = res.data && res.data.data;
      if (devuelto) {
        let finalStatus = devuelto.status || "sent";
        if (devuelto.idExterno && pendingStatusesRef.current[devuelto.idExterno]) {
          finalStatus = pendingStatusesRef.current[devuelto.idExterno];
          delete pendingStatusesRef.current[devuelto.idExterno];
        } else if (devuelto._id && pendingStatusesRef.current[devuelto._id]) {
          finalStatus = pendingStatusesRef.current[devuelto._id];
          delete pendingStatusesRef.current[devuelto._id];
        }
        devuelto.status = finalStatus;

        // Fusiona por `_id`: si el servidor devolvió el MISMO documento, la
        // burbuja se actualiza en su sitio; si era temporal, lo sustituye.
        // En ningún caso se duplica.
        setMensajes((prev) =>
          fusionarMensajes(prev.filter((m) => m._id !== idOriginal), [devuelto]),
        );
      } else {
        setMensajes((prev) =>
          prev.map((m) => (m._id === idOriginal ? { ...m, status: "sent" } : m)),
        );
      }
      window.showToast?.("Mensaje reenviado");
    } catch (err) {
      setMensajes((prev) =>
        prev.map((m) => (m._id === idOriginal ? { ...m, status: "failed" } : m)),
      );
      window.showToast?.(
        (err.response && err.response.data && err.response.data.error) ||
          "No se pudo reintentar el mensaje",
        "error",
      );
    }
  };

  /**
   * LOTE B7a · WA-72/WA-73/WA-79 — envío de adjunto con paridad de WhatsAppInput:
   *   · `caption` = texto que hubiera en el composer (el borrador se consume).
   *   · `replyToMid`/`replyToText` = cita activa, con el MISMO criterio de id
   *     externo válido que el texto (nunca ObjectId de Mongo ni `temp-`).
   *   · Guardas y toasts del legacy: «Selecciona un chat primero», el aviso
   *     «📎 Subiendo archivo...» y el éxito «✅ Archivo enviado con éxito!».
   */
  const enviarAdjunto = async (file, caption = "", cita = null) => {
    const clave = claveActivaRef.current;
    const conv = clave ? conversacionesRef.current[clave] : null;
    if (!file) return;
    if (!conv) {
      // WA-79: guarda del legacy para "sin chat seleccionado".
      window.showToast?.("Selecciona un chat primero.", "error");
      return;
    }

    const urlLocal = URL.createObjectURL(file);
    const esImagen = (file.type || "").indexOf("image/") === 0;
    const ahora = Date.now();
    const texto = (caption || "").trim();
    const respuestaCita = cita || replyingToRef.current;
    const replyToMid = idExternoValido(respuestaCita && respuestaCita.idExterno)
      ? respuestaCita.idExterno
      : null;
    const replyToText = replyToMid ? respuestaCita.texto || null : null;
    const temporal = {
      _id: `temp-${ahora}`,
      texto: texto || (esImagen ? "[Foto]" : "[Archivo]"),
      caption: texto || null,
      direccion: "saliente",
      tipo: esImagen ? "imagen" : "documento",
      mediaUrl: urlLocal,
      fileName: file.name || null,
      mimeType: file.type || null,
      timestamp: ahora,
      status: "enviando",
      replyToId: replyToMid,
      replyToText,
    };
    setMensajes((prev) => fusionarMensajes(prev, [temporal]));
    // WA-73: el caption se consume con el envío y la cita también.
    if (texto) setBorradores((prev) => ({ ...prev, [clave]: "" }));
    if (replyToMid) setReplyingTo(null);
    // WA-79: aviso de subida en curso (paridad con WhatsAppInput.js:83).
    window.showToast?.("Subiendo archivo...", "info");

    try {
      const formData = new FormData();
      formData.append("canal", conv.canal);
      formData.append("usuarioId", conv.usuarioId);
      formData.append("file", file);
      if (texto) formData.append("caption", texto);
      if (replyToMid) formData.append("replyToMid", replyToMid);
      if (replyToText) formData.append("replyToText", replyToText);
      const res = await apiClient.post(`${API_INBOX}/adjunto`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const devuelto = res.data && res.data.data;
      if (devuelto) {
        setMensajes((prev) =>
          fusionarMensajes(
            prev.filter((m) => m._id !== temporal._id),
            [devuelto],
          ),
        );
      } else {
        setMensajes((prev) =>
          prev.map((m) => (m._id === temporal._id ? { ...m, status: "sent" } : m)),
        );
      }
      window.showToast?.("Archivo enviado con éxito!");
    } catch (err) {
      setMensajes((prev) =>
        prev.map((m) => (m._id === temporal._id ? { ...m, status: "failed" } : m)),
      );
      window.showToast?.(
        (err.response && err.response.data && err.response.data.error) ||
          "No se pudo enviar el adjunto",
        "error",
      );
    }
  };

  /**
   * LOTE B7b · IG-53 — `modoDeseado` opcional para que la FICHA de Instagram
   * pueda pedir un modo concreto (`InstagramCustomerDrawer` invoca
   * `onToggleBotMode(id, "manual"|"automatico")`). Sin argumento —o si llega el
   * evento de clic del botón de la cabecera— se comporta como siempre: alterna.
   */
  const cambiarModo = async (modoDeseado) => {
    const clave = claveActivaRef.current;
    const conv = clave ? conversacionesRef.current[clave] : null;
    if (!conv) return;
    const previo = conv.modo === "manual" ? "manual" : "automatico";
    const nuevo =
      modoDeseado === "manual" || modoDeseado === "automatico"
        ? modoDeseado
        : previo === "manual"
          ? "automatico"
          : "manual";
    if (nuevo === previo) return;

    setConversaciones((prev) =>
      prev[clave] ? { ...prev, [clave]: { ...prev[clave], modo: nuevo } } : prev,
    );
    try {
      const res = await apiClient.post(`${API_INBOX}/modo`, {
        canal: conv.canal,
        usuarioId: conv.usuarioId,
        modo: nuevo,
      });
      if (res.data && res.data.success === false) {
        throw new Error((res.data && res.data.error) || "El servidor rechazó el cambio de modo");
      }
      window.showToast?.(
        nuevo === "manual" ? "Modo manual activado" : "Bot reactivado para esta conversación",
        nuevo === "manual" ? "warning" : "success",
      );
    } catch (err) {
      setConversaciones((prev) =>
        prev[clave] ? { ...prev, [clave]: { ...prev[clave], modo: previo } } : prev,
      );
      window.showToast?.(
        (err.response && err.response.data && err.response.data.error) ||
          err.message ||
          "No se pudo cambiar el modo",
        "error",
      );
    }
  };

  const resetBot = async () => {
    const clave = claveActivaRef.current;
    const conv = clave ? conversacionesRef.current[clave] : null;
    if (!conv) return;
    try {
      const res = await apiClient.post(`${API_INBOX}/reset`, {
        canal: conv.canal,
        usuarioId: conv.usuarioId,
      });
      if (res.data && res.data.success === false) {
        throw new Error((res.data && res.data.error) || "El servidor rechazó el reset");
      }
      window.showToast?.("Bot destrabado (paso y carrito reiniciados)");
      if (cargarHiloRef.current) cargarHiloRef.current(clave, { pagina: 1, reiniciar: false });
    } catch (err) {
      window.showToast?.(
        (err.response && err.response.data && err.response.data.error) ||
          err.message ||
          "No se pudo destrabar el bot",
        "error",
      );
    }
  };

  const toggleBloqueo = async () => {
    const clave = claveActivaRef.current;
    const conv = clave ? conversacionesRef.current[clave] : null;
    if (!conv) return;
    const nuevoEstado = !conv.bloqueado;
    setBloqueoParams({ clave, conv, nuevoEstado });
  };

  const confirmarBloqueo = async () => {
    if (!bloqueoParams) return;
    const { clave, conv, nuevoEstado } = bloqueoParams;
    setBloqueoParams(null);
    try {
      const res = await apiClient.post(`${API_INBOX}/bloquear`, {
        canal: conv.canal,
        usuarioId: conv.usuarioId,
        bloqueado: nuevoEstado
      });
      if (res.data && res.data.success) {
        window.showToast?.(nuevoEstado ? "Usuario bloqueado" : "Usuario desbloqueado", nuevoEstado ? "warning" : "success");
        if (cargarHiloRef.current) cargarHiloRef.current(clave, { pagina: 1, reiniciar: false });
        if (cargarListaRef.current) cargarListaRef.current();
      }
    } catch (err) {
      window.showToast?.(
        err?.response?.data?.error || err.message || "No se pudo cambiar el bloqueo",
        "error",
      );
    }
  };

  /**
   * LOTE B7a · WA-44 — mute sincronizado con la consola legacy.
   *
   * El inbox usa su propia clave (`pachi_muted_inbox`, IN-01/IN-21) y el `index.html`
   * + la consola de WhatsApp usan `pachi_muted`. El contrato §3 exige que ambas
   * «convivan y estén sincronizadas por `pachi_mute_toggled`»; además el pitido
   * global del panel solo mira `pachi_muted` (E-02: silenciar en el inbox NO
   * silenciaba el tono global). Aquí se escriben LAS DOS claves y se emite el
   * evento: silenciar en el inbox silencia todo el panel y la consola legacy, y
   * viceversa (el listener de `pachi_mute_toggled` re-lee el estado).
   */
  const toggleMute = () => {
    const nuevo = !isMuted;
    setIsMuted(nuevo);
    try {
      localStorage.setItem("pachi_muted_inbox", nuevo ? "true" : "false");
      localStorage.setItem("pachi_muted", nuevo ? "true" : "false");
    } catch (err) {
      // localStorage no disponible: el estado en memoria sigue funcionando
    }
    window.dispatchEvent(new Event("pachi_mute_toggled"));
    window.showToast?.(`Notificaciones del inbox ${nuevo ? "silenciadas" : "activadas"}`);
  };

  const cambiarFiltros = (patch) => {
    setFiltros((prev) => Object.assign({}, prev, patch));
  };

  // LAYOUT V3: el canal lo fija el raíl (no es un chip más de la Col-C).
  const cambiarCanal = (valor) => {
    if (!valor || valor === filtrosRef.current.canal) return;
    setFiltros((prev) => Object.assign({}, prev, { canal: valor }));
    // LOTE B6: los ajustes son de canal — al cambiar de canal se cierra el modal
    // del perfil de WhatsApp para no dejar un diálogo de otro canal abierto.
    if (valor !== "whatsapp") setPerfilWaAbierto(false);
    // El canal activo queda FIJO. Si la conversación abierta ya no pertenece al
    // canal elegido, se cierra: así la cabecera del hilo nunca muestra un canal
    // que no es el que se está trabajando en el raíl.
    const abierta = claveActivaRef.current
      ? conversacionesRef.current[claveActivaRef.current]
      : null;
    if (abierta && valor !== "todos" && abierta.canal !== valor) {
      cerrarConversacion();
    }
  };

  const canalActivo = filtros.canal || "todos";
  const canalLabel = ETIQUETA_CANAL[canalActivo] || "Todos";
  const canalIcono = ICONO_CANAL[canalActivo] || ICONO_CANAL.todos;

  const clave = claveActiva;
  const borradorActual = clave ? borradores[clave] || "" : "";
  const setBorradorActual = (valor) => {
    const actual = claveActivaRef.current;
    if (!actual) return;
    setBorradores((prev) => ({ ...prev, [actual]: valor }));
  };
  const listaConversaciones = ordenarConversaciones(Object.values(conversaciones));
  // LOTE B7a · WA-68 — presencia/escritura del contacto abierto (TTL aplicado por
  // el limpiador de 3 s; aquí solo se lee).
  const presenciaActual = conversacionActiva
    ? presenciaMap[conversacionActiva.usuarioId] || null
    : null;
  // ── LOTE B7b — FICHA DE PERFIL DE INSTAGRAM (§1.N: IG-50..57) ──────────────
  // El drawer legacy reutilizado `InstagramCustomerDrawer` consume props sueltas
  // (`contact.id`, `.fullName`, `.username`, `.avatar`, `.modo`, `.origen`,
  // `.verified`, `.followers`, `.bio`, `.online`, `.lastSeen`). Aquí se mapea el
  // objeto `ConversacionUnificada` + su extensión `perfil` (§6.2) a ese contrato
  // SIN tocar el componente legacy.
  const contactoIG =
    conversacionActiva && conversacionActiva.canal === "instagram"
      ? {
          id: conversacionActiva.usuarioId,
          username: conversacionActiva.username || null,
          fullName:
            conversacionActiva.nombre ||
            conversacionActiva.nombreVisible ||
            conversacionActiva.username ||
            "Usuario de Instagram",
          avatar: conversacionActiva.avatar || null,
          modo: conversacionActiva.modo,
          origen: conversacionActiva.origen,
          verified: Boolean(
            conversacionActiva.perfil && conversacionActiva.perfil.verificado,
          ),
          followers: conversacionActiva.perfil ? conversacionActiva.perfil.followers : null,
          bio: conversacionActiva.perfil ? conversacionActiva.perfil.bio : null,
          online: Boolean(
            conversacionActiva.perfil && conversacionActiva.perfil.online === true,
          ),
          lastSeen: conversacionActiva.perfil ? conversacionActiva.perfil.lastSeen : null,
        }
      : null;
  // LOTE B7b · IG-16 — estado GLOBAL del bot de Instagram (estado de canal):
  // el hilo decide si pinta el banner (solo canal instagram).
  const botCanalPausado = botIg.enabled === false;

  return e(
    "div",
    { className: "flex h-full w-full overflow-hidden bg-white dark:bg-gray-900 relative" },
    [
      // ── Columna A+B: raíl de canales + lista del canal activo ──────────────
      // Desktop: [raíl 64px][lista 320/384px][hilo]. Móvil: el raíl pasa a ser
      // una barra horizontal sobre la lista y ambos se ocultan al abrir una
      // conversación (mismo criterio que WhatsAppConsole.js:398-416 e
      // InstagramConsole.js:168-186).
      e(
        "div",
        {
          key: "inbox-list-columns",
          className: `flex-col md:flex-row h-full w-full md:w-auto shrink-0 min-h-0 ${
            claveActiva ? "hidden md:flex" : "flex"
          }`,
        },
        [
          e(InboxChannelRail, {
            key: "inbox-rail",
            canalActivo,
            onCanalChange: cambiarCanal,
            totales,
            totalesNoLeidos,
            isMuted,
            onToggleMute: toggleMute,
          }),
          e(InboxSidebar, {
            key: "inbox-sidebar",
            conversaciones: listaConversaciones,
            claveActiva,
            onSelectContact: abrirConversacion,
            filtros,
            onFiltrosChange: cambiarFiltros,
            buscar,
            onBuscarChange: setBuscar,
            canalActivo,
            canalLabel,
            canalIcono,
            totales,
            totalesNoLeidos,
            loading: cargandoLista,
            error: errorLista,
            onRefresh: () => cargarLista(),
            // LOTE B6 — ajustes del canal activo en el engranaje de la cabecera
            botEnabled: botIg.enabled,
            botCargando: botIg.cargando,
            botCambiando: botIg.cambiando,
            onToggleBot: alternarBotInstagram,
            onOpenWhatsappProfile: () => setPerfilWaAbierto(true),
          }),
        ],
      ),

      conversacionActiva
        ? e(InboxThread, {
            key: "inbox-thread",
            conversacion: conversacionActiva,
            mensajes,
            paginacion,
            cargandoHilo,
            onLoadMore: cargarMasMensajes,
            onSend: enviarMensaje,
            onSendAdjunto: enviarAdjunto,
            onToggleModo: cambiarModo,
            onResetBot: resetBot,
            onToggleBloqueo: toggleBloqueo,
            onBack: cerrarConversacion,
            onOpenCanalConsole,
            borrador: borradorActual,
            setBorrador: setBorradorActual,
            // LOTE B3 — Citar/Responder (WA-74/75/92/93/34) y Reintentar (WA-94/33)
            replyingTo,
            onReply: (mensaje) => setReplyingTo(mensaje),
            onCancelReply: () => setReplyingTo(null),
            onRetry: reintentarMensaje,
            // LOTE B4 — Acciones de pedido/pago/despacho (WA-14/15/35/36/37) y
            // ficha del cliente (WA-69). El estado del pedido sale del contexto
            // unificado (`pedidoActivo`), con caída al resumen del objeto §6.2.
            estadoPedido: contexto && contexto.pedidoActivo ? contexto.pedidoActivo.estado : null,
            pedidoActivoId: contexto && contexto.pedidoActivo ? contexto.pedidoActivo._id : null,
            // LOTE B5 · WA-83: el pedido activo alimenta la tarjeta «Pedido
            // Confirmado» intercalada en el timeline (correlativo + USD/VES).
            pedidoActivo: contexto && contexto.pedidoActivo ? contexto.pedidoActivo : null,
            pedidosActivos: contexto && contexto.pedidosActivos ? contexto.pedidosActivos : [],
            // LOTE B7c · WA-11: el historial COMPLETO de compras (paridad
            // MessageList.js:34-45) para inyectar TODAS las tarjetas de pedido.
            historialCompras,
            cargandoAccion: accionPedidoEnCurso,
            onConfirmarPago: confirmarPagoDesdeHilo,
            onCambiarEstadoPedido: cambiarEstadoPedidoDesdeHilo,
            onAbrirFicha: () => setFichaAbierta((prev) => !prev),
            fichaAbierta,
            // LOTE B7a · WA-68 — presencia/escribiendo del contacto activo.
            presence: presenciaActual ? presenciaActual.presence : "unknown",
            isTyping: Boolean(presenciaActual && presenciaActual.isTyping),
            // LOTE B7a · WA-70 — abre el Copiloto de Venta Manual (WA-131..139).
            onOpenManualOrder: () => setCopilotoAbierto(true),
            // LOTE B7b · IG-36 — botón «Ficha del contacto» de Instagram (solo
            // se pinta con canal instagram): abre el drawer de perfil IG.
            onAbrirFichaIG: () => setFichaIgAbierta((prev) => !prev),
            fichaIGAbierta: fichaIgAbierta,
            // LOTE B7b · IG-16 — banner global de bot pausado (estado de canal).
            botCanalPausado,
            onReactivarBotCanal: () => alternarBotInstagram(true),
          })
        : e(
            "div",
            {
              key: "inbox-empty",
              className:
                "hidden md:flex flex-1 flex-col items-center justify-center p-8 bg-[#f8f8f8] dark:bg-gray-900 text-center select-none",
            },
            [
              e(
                "div",
                {
                  key: "empty-logo",
                  className:
                    "w-20 h-20 rounded-3xl bg-gradient-to-tr from-emerald-500 via-emerald-600 to-[#0084FF] flex items-center justify-center text-white shadow-xl shadow-emerald-500/20 mb-5 animate-pulse-gentle",
                },
                e(Icono, { nombre: "inbox", className: "text-4xl" }),
              ),
              e(
                "h2",
                {
                  key: "empty-title",
                  className:
                    "text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight mb-2",
                },
                "Inbox unificado",
              ),
              e(
                "p",
                {
                  key: "empty-text",
                  className:
                    "text-sm text-gray-500 dark:text-gray-400 max-w-md leading-relaxed",
                },
                "Selecciona una conversación para responder. WhatsApp, Instagram y Messenger conviven en esta lista; en WhatsApp puedes confirmar pagos, despachar pedidos, asignar repartidor y abrir la ficha del cliente sin salir del inbox.",
              ),
              userRole
                ? e(
                    "p",
                    {
                      key: "empty-role",
                      className:
                        "text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-3",
                    },
                    `Sesión: ${userRole}`,
                  )
                : null,
            ],
          ),

      // ── LOTE B4 · Ficha del cliente (WA-118..130) ───────────────────────────
      // Se monta como HERMANA del hilo dentro de la fila flex, igual que en
      // WhatsAppConsole.js:1084-1092: el propio componente decide su forma
      // (drawer lateral derecho `hidden md:flex w-80/lg:w-96` en escritorio,
      // bottom-sheet `md:hidden fixed inset-0` en móvil) y devuelve `null`
      // cuando está cerrada, así que no ocupa espacio ni altera el layout V3.
      // Solo WhatsApp: en IG/Messenger `contexto` es null y la ficha no tiene
      // sentido (no hay CRM, pedidos, carrito ni comprobante).
      conversacionActiva && conversacionActiva.canal === "whatsapp"
        ? e(CustomerCardDrawer, {
            key: "inbox-customer-card",
            isOpen: fichaAbierta,
            onClose: () => setFichaAbierta(false),
            context: contexto,
            loading: cargandoContexto,
            onAssignDriver: asignarRepartidorDesdeFicha,
            onRefreshContext: () => cargarContexto(conversacionActiva),
          })
        : null,

      // ── LOTE B7b · FICHA DE PERFIL DE INSTAGRAM (§1.N: IG-50..57) ───────────
      // Se monta como HERMANA del hilo (igual que la ficha CRM de WhatsApp y el
      // perfil de canal), con el componente LEGACY `InstagramCustomerDrawer.js`
      // REUTILIZADO tal cual: es 100 % dirigido por props y devuelve `null`
      // cuando está cerrado, así que no ocupa espacio ni altera el layout V3.
      // Solo Instagram (en WhatsApp la ficha es la CRM y en Messenger aún no hay
      // perfil en el contrato).
      conversacionActiva && conversacionActiva.canal === "instagram" && contactoIG
        ? e(InstagramCustomerDrawer, {
            key: "inbox-ig-customer-drawer",
            isOpen: fichaIgAbierta,
            onClose: () => setFichaIgAbierta(false),
            contact: contactoIG,
            // IG-53 — el drawer pide un modo concreto: `(contactId, next)`.
            onToggleBotMode: (_contactId, nextMode) => cambiarModo(nextMode),
          })
        : null,

      // ── LOTE B6 · Perfil de WhatsApp Business (WA-45 dispara · WA-39 modal) ──
      // Ajuste de CANAL, no de conversación: se monta como hermana (igual que la
      // ficha del cliente) y devuelve `null` mientras está cerrado, así que no
      // altera el layout V3. Lo abre el engranaje de la cabecera de la lista.
      e(InboxWhatsAppProfileModal, {
        key: "inbox-wa-profile-modal",
        isOpen: perfilWaAbierto,
        onClose: () => setPerfilWaAbierto(false),
      }),

      // ── LOTE B7a · Copiloto de Venta Manual (WA-131..139) ──────────────────
      // Modal de CONVERSACIÓN: se monta solo con un chat de WhatsApp abierto
      // (los endpoints del copiloto devuelven 409 en Instagram/Messenger: crear
      // una venta manual implica un pedido, modelo exclusivo de WhatsApp §6.2).
      // Devuelve `null` mientras está cerrado, así que no altera el layout V3.
      conversacionActiva && conversacionActiva.canal === "whatsapp"
        ? e(InboxManualOrderModal, {
            key: "inbox-copiloto-venta-manual",
            isOpen: copilotoAbierto,
            onClose: () => setCopilotoAbierto(false),
            whatsappId: conversacionActiva.usuarioId,
            // Al guardar la venta se refresca lista + hilo + CRM (el pedido nuevo
            // cambia el chip y el banner de acciones).
            onSaved: () => refrescarTrasAccionPedido(),
          })
        : null,

      // Modal de Confirmación para Bloqueo Lógico
      bloqueoParams !== null
        ? e(
            "div",
            {
              key: "inbox-bloqueo-confirm-modal",
              className: "fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs",
            },
            [
              e("div", { key: "backdrop", className: "absolute inset-0", onClick: () => setBloqueoParams(null) }),
              e(
                "div",
                { key: "modal", className: "relative bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200" },
                [
                  e(
                    "div",
                    { key: "header", className: `p-6 text-center ${bloqueoParams.nuevoEstado ? "bg-red-50 dark:bg-red-900/20" : "bg-emerald-50 dark:bg-emerald-900/20"}` },
                    e(
                      "div",
                      { className: `w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4 ${bloqueoParams.nuevoEstado ? "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400"}` },
                      e(Icono, { nombre: "user-x", className: "text-2xl" })
                    ),
                    e("h3", { className: "text-lg font-bold text-gray-900 dark:text-white" }, bloqueoParams.nuevoEstado ? "Bloquear Usuario" : "Desbloquear Usuario"),
                    e("p", { className: "text-sm text-gray-500 dark:text-gray-400 mt-2" }, 
                      bloqueoParams.nuevoEstado 
                        ? "¿Estás seguro de silenciar a este usuario? El bot ignorará todos sus mensajes de forma transparente a partir de ahora." 
                        : "¿Deseas desbloquear a este usuario? Volverá a interactuar con el bot con normalidad."
                    )
                  ),
                  e(
                    "div",
                    { key: "footer", className: "p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2" },
                    [
                      e("button", { key: "cancel", onClick: () => setBloqueoParams(null), className: "px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600 cursor-pointer transition-colors" }, "Cancelar"),
                      e("button", { key: "confirm", onClick: confirmarBloqueo, className: `px-4 py-2 text-sm font-medium text-white rounded-lg cursor-pointer transition-colors shadow-sm ${bloqueoParams.nuevoEstado ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}` }, "Confirmar")
                    ]
                  )
                ]
              )
            ]
          )
        : null,
    ],
  );
};

export default InboxConsole;
