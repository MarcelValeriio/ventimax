// public/src/features/inbox/components/InboxThread.js
// Hilo de la conversación activa con burbujas normalizadas (§6.2 MensajeUnificado).
// Reutiliza los patrones visuales de MessageList (WhatsApp) e InstagramMessageList.
//
// LOTE B2: la barra de Respuestas Rápidas (InboxQuickReplyBar) vive aquí, en la
// columna del hilo (Col-H), justo encima del composer — igual que en la consola de
// WhatsApp (WhatsAppConsole.js:1043) y en la de Instagram (InstagramConsole.js:614).
//
// LOTE B4: se añaden al hilo (Col-H) las ACCIONES DE PEDIDO/PAGO/DESPACHO —
// Confirmar Pago y Enviar Comandas (WA-14/WA-35), Despachar (En Ruta)
// (WA-15/WA-36) y Marcar como Entregado (WA-37)— como banner sobre el composer,
// replicando literalmente la barra de acción de WhatsAppConsole.js:910-1003, y
// el botón «Ficha» del cliente (WA-69) que abre el drawer reutilizado
// `CustomerCardDrawer.js` (WA-118..130, montado por InboxConsole).
// Las acciones de pedido son EXCLUSIVAS de WhatsApp: en Instagram/Messenger no
// se pinta nada (el canal no tiene modelo de pedidos, `pedido` es null §6.2).
//
// LOTE B5 — MULTIMEDIA DEL HILO (doc §1.E y §1.F):
//   · El VISOR DE IMAGEN (WA-97..106) se REUTILIZA importando el componente legacy
//     `features/whatsapp/components/ImageLightboxModal.js`: es 100 % dirigido por
//     props (isOpen/onClose/src/alt/caption/fileName/triggerRef) y no depende de
//     nada de la consola de WhatsApp, así que la paridad del visor (overlay, zoom
//     +/−/reset con tope 3×, Cerrar con aria-label, Escape, cierre por backdrop,
//     bloqueo del scroll del body, restauración del foco y fallback de imagen) es
//     AUTOMÁTICA. Se importa SIN `?v=` para resolver a la MISMA URL que usa
//     MessageBubble.js y compartir una sola instancia del módulo.
//   · MessageList.js / MessageBubble.js NO se reutilizan: su contrato de callbacks
//     choca con el que ya consumen los lotes B3/B4 del inbox
//     (`onReply({_id,idExterno,texto})`, `onRetry({_id,idExterno,texto})`, mientras
//     el legacy llama `onRetry(text, _id, wamid)`) y su burbuja es WhatsApp-only
//     (color plano), mientras el inbox pinta gradiente de Instagram y azul de
//     Messenger. Importarlos REGRESARÍA B3/B4. Por eso WA-80/83/84/85/88/89/90/91/95
//     se PORTAN aquí con la misma heurística y el mismo markup del legacy.
//
// LOTE B7a — CABECERA Y COMPOSER (doc §1.D) + COPILOTO (doc §1.I):
//   · WA-68 presencia / escribiendo en la cabecera («escribiendo…», «en línea»,
//     «desconectado») desde los eventos `cliente_presencia`/`cliente_typing`
//     (hooks/useInboxSocket.js). Solo WhatsApp.
//   · WA-70 botón «Venta IA» (Copiloto de Venta Manual → InboxManualOrderModal),
//     solo WhatsApp. Origen: WhatsAppHeader.js:153-170.
//   · WA-71 picker de emojis (25) con botón flotante. Origen: WhatsAppInput.js.
//   · WA-72/WA-73 el texto del composer viaja como `caption` del adjunto y se
//     conserva la cita (`replyToMid`/`replyToText`) al adjuntar.
//   · WA-76 textarea `rows=3` + `min-h-[70px] sm:min-h-[64px]` + `max-h-[140px]`
//     con scroll interno (paridad con WhatsAppInput.js:237-253).
import React, { useEffect, useRef, useState, useCallback } from "https://cdn.skypack.dev/react";
import InboxQuickReplyBar from "./InboxQuickReplyBar.js?v=1";
// LOTE B7b — AVATAR DE INSTAGRAM (IG-23/37/38): componente LEGACY reutilizado
// tal cual (100 % dirigido por props) para la cabecera del hilo y, desde
// InboxConversationRow, para las filas de la Col-C. Aporta el fallback a
// iniciales sobre el gradiente oficial con `onError`, el aro de historia
// cuando hay no leídos y el punto verde «en línea». Se importa con el MISMO
// `?v=4` que la consola de Instagram para compartir una única instancia del
// módulo en el navegador.
import InstagramAvatar from "../../instagram/components/InstagramAvatar.js?v=4";
// FIX (lote B6): la ruta era `../whatsapp/...`, que desde
// `features/inbox/components/` resuelve a `features/inbox/whatsapp/...` (no
// existe) y rompía el grafo de módulos de `public/index.html` → panel en blanco.
// El visor vive en `features/whatsapp/components/` (dos niveles arriba) y la URL
// resultante es la MISMA que importa `MessageBubble.js`, así que se comparte una
// única instancia del módulo.
import ImageLightboxModal from "../../whatsapp/components/ImageLightboxModal.js";

const e = React.createElement;

const CANAL_META = {
  whatsapp: {
    label: "WhatsApp",
    icono: "fab fa-whatsapp",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    // LOTE B5 · WA-84: `bg-[#dcf8c6]` es el verde EXACTO de la burbuja saliente de
    // MessageBubble.js:241 (el inbox usaba `#d9fdd3`). `rounded-br-xs` deja la
    // esquina recta que encaja con la cola.
    saliente:
      "bg-[#dcf8c6] text-[#111b21] dark:bg-emerald-900/50 dark:text-emerald-50 rounded-br-xs",
    // LOTE B7c · WA-41: `wa-bg-doodle` es la clase que instala `styles.js` (el
    // MISMO doodle que `MessageList.js:51`); `bg-[#efeae2]` se conserva como
    // respaldo por si la hoja `.wa-*` no estuviera montada.
    fondo: "bg-[#efeae2] wa-bg-doodle dark:bg-gray-900",
    acento: "focus:border-[#008069]",
    // LOTE B7b · IG-48 — botón Enviar por canal (el legacy de IG usa gradiente).
    enviar: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/30",
  },
  instagram: {
    label: "Instagram",
    icono: "fab fa-instagram",
    chip: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
    saliente:
      "bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#E1306C] text-white rounded-br-xs shadow-md shadow-pink-500/10",
    fondo: "bg-[#f8f8f8] dark:bg-gray-900",
    acento: "focus:border-[#E1306C]",
    // Literal de InstagramInput.js:108-112 (gradiente oficial de la marca).
    enviar:
      "bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4] text-white shadow-md shadow-pink-500/30 hover:opacity-95",
  },
  messenger: {
    label: "Messenger",
    icono: "fab fa-facebook-messenger",
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    saliente: "bg-[#0084FF] text-white rounded-br-xs shadow-md shadow-sky-500/10",
    fondo: "bg-[#f8f8f8] dark:bg-gray-900",
    acento: "focus:border-[#0084FF]",
    enviar: "bg-[#0084FF] hover:bg-[#007ae6] text-white shadow-md shadow-sky-500/30",
  },
};

// El contrato dice epoch ms, pero el backend en construcción puede devolver ISO:
// se normaliza en un único punto defensivo.
const aMillis = (valor) => {
  if (!valor) return 0;
  if (typeof valor === "number") return valor;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

const formatHora = (timestamp) => {
  const ms = aMillis(timestamp);
  if (!ms) return "";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const getDateLabel = (timestamp) => {
  const ms = aMillis(timestamp);
  if (!ms) return "";
  const d = new Date(ms);
  const hoy = new Date();
  const ayer = new Date(hoy);
  ayer.setDate(ayer.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-VE", { day: "numeric", month: "long", year: "numeric" });
};

// §7 #16: direccion normalizada a "entrante"/"saliente"; tolerante a los valores crudos.
const esEntrante = (msg) => {
  const dir = msg && (msg.direccion || msg.direction);
  return dir === "entrante" || dir === "cliente";
};

const textoDe = (msg) => (msg && (msg.texto || msg.text || msg.caption)) || "";

// LOTE B3 (WA-92/WA-93) — ¿el mensaje puede citarse?
// Mismo criterio que MessageBubble.js:110-117 (legacy): solo un id externo REAL
// de Meta (wamid de WhatsApp · mid de Instagram/Messenger). NUNCA un ObjectId de
// Mongo (`[0-9a-f]{24}`) ni un id temporal del panel (`temp-…`).
const idExternoValido = (valor) => {
  if (!valor) return false;
  const s = String(valor);
  if (s.startsWith("temp-")) return false;
  if (/^[0-9a-fA-F]{24}$/.test(s)) return false;
  return s.startsWith("wamid.") || s.length >= 15;
};

// Texto que se muestra en la barra de cita / en la burbuja citada.
// Placeholder por tipo, igual que MessageBubble.js:124-128 (legacy).
const textoCitable = (msg) => {
  const texto = textoDe(msg).trim();
  if (texto) return texto;
  const tipo = (msg && msg.tipo) || "";
  if (tipo === "imagen") return "[Foto]";
  if (tipo === "audio") return "[Nota de voz]";
  if (tipo === "documento") return "[Archivo]";
  return "[Archivo]";
};

// WA-94: reintentar solo tiene sentido con texto real (el endpoint unificado
// reenvía TEXTO, no multimedia) y nunca sobre un placeholder de adjunto.
const PLACEHOLDER_MEDIA = /^\[(Foto|Audio|Vídeo|Video|Documento|Sticker|Adjunto|Nota de voz)\]$/;
const textoReintentable = (msg) => {
  const texto = textoDe(msg).trim();
  return Boolean(texto) && !PLACEHOLDER_MEDIA.test(texto);
};

// ── LOTE B5 · WA-85 — heurística de tipo multimedia (tipo + MIME + extensión) ─
// Paridad con MessageBubble.js:66-79 (legacy) con el añadido del fallback por
// extensión del nombre de archivo o de la URL, porque el inbox no recibe
// `mediaId` (el `MensajeUnificado` del contrato §6.2 no lo expone).
const EXT_AUDIO = ["mp3", "m4a", "ogg", "oga", "opus", "aac", "wav", "amr", "weba"];
const EXT_IMAGEN = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif", "svg", "avif"];
const EXT_VIDEO = ["mp4", "mov", "m4v", "avi", "webm", "mkv", "3gp"];

const extensionDe = (valor) => {
  const m = /\.([a-z0-9]{1,5})(?:[?#]|$)/i.exec(String(valor || ""));
  return m ? m[1].toLowerCase() : "";
};

// La ubicación compartida se guarda con `tipo: "location"` y la URL de Google Maps
// en `mediaUrl` (services/chatFlowService.ts:126-139). OJO: `normalizarTipo`
// (services/inbox/normalizar.ts:86) colapsa `location` → `"otro"`, por eso la
// detección NO puede depender solo del `tipo`: también mira `mediaType` y la URL.
const esUrlMaps = (valor) =>
  /^https?:\/\/(?:www\.|maps\.)?google\.[a-z.]{2,6}\//i.test(String(valor || "")) &&
  /(?:\/maps|maps\.google|\?q=|-?\d+\.\d+,-?\d+\.\d+)/i.test(String(valor || ""));

/**
 * Tipo multimedia efectivo del mensaje (WA-85).
 * @returns {"location"|"audio"|"video"|"imagen"|"documento"|"texto"}
 */
const detectarTipoMultimedia = (msg) => {
  if (!msg) return "texto";
  const tipo = String(msg.tipo || "").toLowerCase();
  const mime = String(msg.mimeType || "").toLowerCase();
  const mediaType = String(msg.mediaType || "").toLowerCase();
  const url = String(msg.mediaUrl || "");
  const nombre = String(msg.fileName || "");
  const ext = extensionDe(nombre) || extensionDe(url);

  if (
    tipo === "location" ||
    tipo === "ubicacion" ||
    mediaType === "location" ||
    esUrlMaps(url)
  ) {
    return "location";
  }
  if (
    tipo === "audio" ||
    tipo === "voice" ||
    tipo === "nota_voz" ||
    mime.startsWith("audio/") ||
    mediaType === "audio" ||
    EXT_AUDIO.indexOf(ext) !== -1
  ) {
    return "audio";
  }
  if (
    tipo === "video" ||
    mime.startsWith("video/") ||
    mediaType === "video" ||
    EXT_VIDEO.indexOf(ext) !== -1
  ) {
    return "video";
  }
  if (
    tipo === "imagen" ||
    tipo === "image" ||
    tipo === "foto" ||
    mime.startsWith("image/") ||
    mediaType === "image" ||
    EXT_IMAGEN.indexOf(ext) !== -1
  ) {
    return "imagen";
  }
  // MessageBubble.js:72-78: cualquier cosa con archivo/media y sin MIME de
  // imagen/audio ES un documento (el vídeo sin reproductor también cae aquí).
  if (url || nombre || (mime && !mime.startsWith("image/") && !mime.startsWith("audio/"))) {
    return "documento";
  }
  return "texto";
};

// ── LOTE B5 · WA-90 — icono por tipo de documento (PDF/DOC/XLS/ZIP/TXT) ─────
// Copia de `getFileIconInfo` (MessageBubble.js:6-39): el legacy no la exporta y
// extraerla obligaría a editar un archivo de la consola de WhatsApp, lo que este
// lote tiene prohibido.
// ÚNICA desviación (documentada): en el legacy la rama de DOC se evalúa antes que
// la de XLS y usa `m.includes("document")`, que casa con TODA la familia OOXML —
// así un .xlsx real (mime `…spreadsheetml.sheet`) salía con icono de Word. Aquí la
// hoja de cálculo se comprueba ANTES que el documento para cumplir WA-90
// («icono por tipo»); el resto de ramas y etiquetas son idénticas.
const getFileIconInfo = (name, mime) => {
  const ext = (name || "").split(".").pop().toLowerCase();
  const m = (mime || "").toLowerCase();

  if (ext === "pdf" || m.includes("pdf")) {
    return { icon: "fa-file-pdf", color: "text-red-500", label: "PDF" };
  }
  if (
    ["xls", "xlsx", "csv", "ods"].includes(ext) ||
    m.includes("spreadsheetml") ||
    m.includes("ms-excel") ||
    m.includes("sheet") ||
    m.includes("excel") ||
    m.includes("csv")
  ) {
    return { icon: "fa-file-excel", color: "text-green-500", label: "XLS" };
  }
  if (
    ["doc", "docx", "rtf", "odt"].includes(ext) ||
    m.includes("word") ||
    m.includes("document")
  ) {
    return { icon: "fa-file-word", color: "text-blue-500", label: "DOC" };
  }
  if (
    ["zip", "rar", "7z", "tar", "gz"].includes(ext) ||
    m.includes("zip") ||
    m.includes("compressed")
  ) {
    return { icon: "fa-file-archive", color: "text-amber-500", label: "ZIP" };
  }
  if (["txt", "md"].includes(ext) || m.includes("text/plain")) {
    return { icon: "fa-file-alt", color: "text-gray-500", label: "TXT" };
  }
  return { icon: "fa-file", color: "text-gray-500", label: "ARCHIVO" };
};

// ── LOTE B5 · WA-84 — cola de burbuja (mismo triángulo que styles.js) ───────
// El legacy lo hace con las clases `.wa-bubble-tail-in/out` que inyecta
// WhatsAppConsole.js; el inbox no tiene esa hoja de estilos (y no puede
// modificarla), así que se replica el MISMO triángulo con estilos en línea:
//   .wa-bubble-tail-in  → left:-8px;  border-bottom:10px transparent; border-right:10px #ffffff
//   .wa-bubble-tail-out → right:-8px; border-bottom:10px transparent; border-left:10px #dcf8c6
const estiloCola = (entrante, color) =>
  entrante
    ? {
        position: "absolute",
        left: "-8px",
        top: 0,
        width: 0,
        height: 0,
        borderBottom: "10px solid transparent",
        borderRight: `10px solid ${color}`,
      }
    : {
        position: "absolute",
        right: "-8px",
        top: 0,
        width: 0,
        height: 0,
        borderBottom: "10px solid transparent",
        borderLeft: `10px solid ${color}`,
      };

// §7 #17: vocabulario cerrado de status (los entrantes no tienen status de entrega).
// LOTE B5 · WA-95 — paridad de los ticks con MessageBubble.js:136-207 (legacy):
//   enviando ⏱ → reloj · enviado ✓ · entregado ✓✓ gris · leído ✓✓ AZUL (#53bdeb).
const STATUS_ICONO = {
  enviando: { icono: "fas fa-clock text-white/80", titulo: "Enviando mensaje..." },
  sent: { icono: "fas fa-check text-white drop-shadow-sm", titulo: "Enviado a Meta" },
  delivered: { icono: "fas fa-check-double text-white drop-shadow-sm", titulo: "Entregado al dispositivo" },
  read: { icono: "fas fa-check-double text-[#53bdeb] drop-shadow-sm", titulo: "Leído por el cliente" },
  failed: { icono: "fas fa-exclamation-triangle text-red-600", titulo: "Falló el envío" },
};

// LOTE B7b · IG-46 — Instagram Direct NO emite estados de entrega por webhook
// (`mensaje_status_actualizado` es de WhatsApp), así que el legacy pinta SIEMPRE
// el doble check con el título "Entregado por Instagram Direct" en los mensajes
// salientes (InstagramMessageList.js:232-237). Es la entrada de respaldo del
// canal: si algún día el servidor aporta un `status` real, ese manda.
const STATUS_IG_SALIENTE = {
  icono: "fas fa-check-double text-white/90",
  titulo: "Entregado por Instagram Direct",
};

// ── LOTE B4 · WA-14/15/35/36/37 — estados del pedido que habilitan cada acción ──
// Paridad LITERAL con la barra de acción de la consola de WhatsApp
// (WhatsAppConsole.js:928-934 para el filtro de finalizados, :928-935 los estados
// de verificación, :957 verificado/confirmado y :979 en_ruta).
const ESTADOS_POR_VERIFICAR = [
  "pendiente_verificacion",
  "por_verificar",
  "esperando_verificacion",
  "verificando_pago",
];
const ESTADOS_VERIFICADOS = ["verificado", "confirmado"];
const ESTADOS_FINALIZADOS = ["entregado", "cancelado", "anulado"];

// Render simple de *negritas* e _itálicas_ (mismo criterio que InstagramMessageList)
const renderFormattedText = (text) => {
  if (!text) return "";
  return text.split("\n").map((line, idxLinea) => {
    const partes = [];
    const regex = /(\*[^*]+\*|_[^_]+_)/g;
    let match;
    let ultimo = 0;
    let k = 0;
    while ((match = regex.exec(line)) !== null) {
      if (match.index > ultimo) partes.push(line.substring(ultimo, match.index));
      const token = match[0];
      if (token.startsWith("*") && token.endsWith("*")) {
        partes.push(e("strong", { key: `b-${idxLinea}-${k++}`, className: "font-bold" }, token.slice(1, -1)));
      } else if (token.startsWith("_") && token.endsWith("_")) {
        partes.push(e("em", { key: `i-${idxLinea}-${k++}`, className: "italic opacity-90" }, token.slice(1, -1)));
      }
      ultimo = regex.lastIndex;
    }
    if (ultimo < line.length) partes.push(line.substring(ultimo));
    return e("span", { key: `l-${idxLinea}`, className: "block" }, partes.length > 0 ? partes : line);
  });
};

// ── LOTE B7a · WA-71 — picker de emojis (25) ────────────────────────────────
// Copia LITERAL de EMOJIS (WhatsAppInput.js:6-32): el legacy no lo exporta y
// extraerlo obligaría a editar la consola de WhatsApp (prohibido en este lote).
const EMOJIS = [
  "😀", "😂", "🥰", "😍", "😊", "🙏", "👍", "🙌", "❤️", "🔥",
  "🎉", "✨", "💯", "🤔", "👀", "🍕", "🍔", "🛵", "🏍️", "🛍️",
  "✅", "❌", "✔️", "📦", "📞",
];

// ── LOTE B7a · WA-68 — estado de presencia / escribiendo ────────────────────
// Paridad con WhatsAppHeader.js:34-62 (`renderStatus`). Devuelve null cuando no
// hay señal de presencia: el legacy pintaba "WhatsApp" por defecto, pero en el
// inbox esa etiqueta ya la aporta el chip de canal de la cabecera, así que
// repetirla sería ruido (única desviación, documentada).
const renderEstadoPresencia = (isTyping, presence) => {
  if (isTyping) {
    return {
      clave: "escribiendo",
      texto: "escribiendo...",
      icono: null,
      clase: "text-[11px] text-indigo-500 dark:text-indigo-300 font-semibold animate-pulse",
    };
  }
  if (presence === "online") {
    return {
      clave: "en-linea",
      texto: "en línea",
      icono: "punto",
      clase: "text-[11px] text-emerald-600 dark:text-emerald-400",
    };
  }
  if (presence === "offline") {
    return {
      clave: "desconectado",
      texto: "desconectado",
      icono: null,
      clase: "text-[11px] text-gray-400 dark:text-gray-500",
    };
  }
  return null;
};

const avatarDe = (conv) => {
  if (conv.avatar) return conv.avatar;
  const semilla = encodeURIComponent(conv.usuarioId || conv.clave || "inbox");
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${semilla}`;
};

const InboxThread = ({
  conversacion,
  mensajes = [],
  paginacion = {},
  cargandoHilo = false,
  onLoadMore,
  onSend,
  onSendAdjunto,
  onToggleModo,
  onResetBot,
  onToggleBloqueo,
  onBack,
  onOpenCanalConsole,
  borrador = "",
  setBorrador,
  // LOTE B3 — Citar/Responder (WA-74/75/92/93/34) y Reintentar (WA-94)
  replyingTo = null,
  onReply,
  onCancelReply,
  onRetry,
  // LOTE B4 — Acciones de pedido/pago/despacho (WA-14/15/35/36/37) y ficha
  // del cliente (WA-69 → drawer WA-118..130 montado por InboxConsole).
  estadoPedido = null,
  pedidoActivoId = null,
  // LOTE B5 · WA-83 — pedido activo del CRM (`GET /inbox/contexto` → pedidoActivo):
  // `{_id, idFormateado, estado, montoUSD, montoVES, timestamp, repartidor, …}`.
  // Es lo que permite INTERCALAR la tarjeta «Pedido Confirmado» en el timeline.
  pedidoActivo = null,
  pedidosActivos = [],
  // LOTE B7c · WA-11 — HISTORIAL COMPLETO de compras del cliente
  // (`GET /api/admin/pedidos-historial?telefono=` → `InboxConsole.cargarCompras`).
  // El legacy lo usaba para inyectar UNA tarjeta «Pedido Confirmado» por compra
  // (`MessageList.js:34-45`); el inbox solo tenía el pedido activo. Solo WhatsApp.
  historialCompras = [],
  cargandoAccion = false,
  onConfirmarPago,
  onCambiarEstadoPedido,
  onAbrirFicha,
  fichaAbierta = false,
  // LOTE B7a · WA-68 — presencia / escribiendo (socket `cliente_presencia` y
  // `cliente_typing`; ver hooks/useInboxSocket.js). Solo WhatsApp.
  presence = "unknown",
  isTyping = false,
  // LOTE B7a · WA-70 — botón «Venta IA» que abre el Copiloto de Venta Manual
  // (WA-131..139, montado por InboxConsole). Solo WhatsApp.
  onOpenManualOrder,
  // LOTE B7b · IG-16 — el bot GLOBAL del canal (switch del engranaje de la
  // Col-C; estado de CANAL, no de conversación) se refleja también en el hilo:
  // si está pausado, banner con «Reactivar Bot». Paridad con
  // InstagramConsole.js:567-597 (banner global de bot pausado).
  botCanalPausado = false,
  onReactivarBotCanal,
  // LOTE B7b · IG-36 — botón «Ficha del contacto» de la cabecera IG (origen:
  // InstagramHeader.js:159-174). Abre el drawer de perfil reutilizado
  // (InstagramCustomerDrawer, IG-50..57), que monta InboxConsole.
  onAbrirFichaIG,
  fichaIGAbierta = false,
}) => {
  const scrollRef = useRef(null);
  const alturaPreviaRef = useRef(0);
  const fileInputRef = useRef(null);
  const textAreaRef = useRef(null);
  // LOTE B7a · WA-71 — visibilidad del picker de emojis del composer.
  const [showEmojis, setShowEmojis] = useState(false);
  // Menú hamburguesa de opciones en la cabecera (consolida Venta IA, Ficha CRM/IG, Destrabar, Bloqueo, Consola)
  const [menuAccionesAbierto, setMenuAccionesAbierto] = useState(false);
  const menuRef = useRef(null);

  // Cerrar menú al cambiar de conversación
  useEffect(() => {
    setMenuAccionesAbierto(false);
  }, [conversacion?.usuarioId]);

  // Cerrar menú al hacer clic o touch fuera, o pulsar Escape
  useEffect(() => {
    if (!menuAccionesAbierto) return undefined;
    const handleFuera = (ev) => {
      if (menuRef.current && !menuRef.current.contains(ev.target)) {
        setMenuAccionesAbierto(false);
      }
    };
    const handleKeyDown = (ev) => {
      if (ev.key === "Escape") {
        setMenuAccionesAbierto(false);
      }
    };
    document.addEventListener("mousedown", handleFuera);
    document.addEventListener("touchstart", handleFuera);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleFuera);
      document.removeEventListener("touchstart", handleFuera);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuAccionesAbierto]);

  // ── LOTE B5 · WA-97..106 — estado del visor de imagen ────────────────────
  // `lightbox` = {src, alt, caption, fileName} | null. Vive en el hilo (no en la
  // burbuja) para montar UNA sola instancia del visor aunque el hilo tenga N
  // imágenes, igual que `CustomerCardDrawer` se monta una sola vez en la consola.
  const [lightbox, setLightbox] = useState(null);
  // WA-89: errores de carga por mensaje (`_id` → true), no un único booleano:
  // una imagen rota no debe ocultar las demás.
  const [imagenesConError, setImagenesConError] = useState({});
  // WA-105: disparador real del visor, para devolverle el foco al cerrar.
  const lightboxTriggerRef = useRef(null);

  // `useCallback` (deja [] fijo) para que el efecto del visor legacy no se
  // re-ejecute en cada render del hilo: dentro de ese efecto están el bloqueo del
  // scroll del body y la restauración del foco, y con una identidad inestable se
  // dispararían una y otra vez.
  const cerrarLightbox = useCallback(() => setLightbox(null), []);

  // WA-75 — auto-focus del textarea al activar una cita.
  // Origen legacy: WhatsAppInput.js:56-60. El ref se rellena tras el render, así
  // que se enfoca en un microtask para dar tiempo a que el textarea exista.
  useEffect(() => {
    if (!replyingTo) return undefined;
    const enfocar = () => {
      if (textAreaRef.current && typeof textAreaRef.current.focus === "function") {
        textAreaRef.current.focus();
      }
    };
    enfocar();
    const t = setTimeout(enfocar, 60);
    return () => clearTimeout(t);
  }, [replyingTo]);

  // Auto-scroll al final; al cargar mensajes anteriores se preserva la posición.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (alturaPreviaRef.current > 0) {
      el.scrollTop = el.scrollHeight - alturaPreviaRef.current;
      alturaPreviaRef.current = 0;
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, [mensajes]);

  if (!conversacion) return null;

  const canal = conversacion.canal || "whatsapp";
  const meta = CANAL_META[canal] || CANAL_META.whatsapp;
  const nombre =
    (conversacion.nombreVisible || "").trim() ||
    conversacion.usuarioId ||
    conversacion.clave ||
    "Conversación";
  const esManual = conversacion.modo === "manual";
  const pedido = conversacion.pedido || null;
  // §8.6: el composer debe leer las capacidades del canal. Instagram/Messenger solo imagen.
  const acepta = canal === "whatsapp" ? "image/*,application/pdf,audio/*" : "image/*";
  const puedeGestionarPedido = canal === "whatsapp" && Boolean(pedido && pedido.tienePedido);
  // P-02 / LOTE B7a · WA-68 — presencia desactivada por falta de emisor en el backend.
  // const estadoPresencia = canal === "whatsapp" ? renderEstadoPresencia(isTyping, presence) : null;
  const estadoPresencia = null;
  // LOTE B7b — extensión `perfil` del contrato (§6.2) para IG/Messenger: de
  // ella salen la insignia verificada (IG-32), el aro de historia y el punto
  // «en línea» del avatar de la cabecera (IG-23/IG-38).
  const perfilConv = conversacion.perfil || null;
  const igVerificado = Boolean(perfilConv && perfilConv.verificado);
  const igOnline = Boolean(perfilConv && perfilConv.online === true);

  // ── LOTE B4 · WA-14/15/35/36/37 — barra de acción del pedido ──────────────
  // El estado manda por encima del resumen del objeto unificado: `estadoPedido`
  // llega de `GET /api/admin/inbox/contexto` (`pedidoActivo.estado`) y solo cae a
  // `conversacion.pedido.ultimoEstado` si el CRM aún no se ha cargado.
  // `pedidoActivoId` (el `_id` del pedido) llega del mismo contexto: es
  // imprescindible para despachar/entregar (PATCH .../pedido/:id/estado), no así
  // para confirmar el pago, que opera por teléfono.
  const estadoPedidoNorm = String(
    estadoPedido || (pedido && pedido.ultimoEstado) || "",
  ).toLowerCase();
  const pedidoFinalizado = ESTADOS_FINALIZADOS.includes(estadoPedidoNorm);

  const construirBotonAccion = (clave, ariaLabel, titulo, icono, texto, clases) =>
    e(
      "button",
      {
        key: clave,
        type: "button",
        onClick: titulo.accion,
        disabled: cargandoAccion,
        title: titulo.titulo,
        "aria-label": ariaLabel,
        className: `w-full ${clases} text-white py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`,
      },
      [
        e("i", {
          key: "ic",
          className: `fas ${cargandoAccion ? "fa-spinner fa-spin" : icono} text-sm`,
        }),
        texto,
      ],
    );

  let accionBanner = null;
  if (puedeGestionarPedido) {
    const ordersToProcess = (pedidosActivos && pedidosActivos.length > 0) 
      ? pedidosActivos 
      : (pedidoActivo && !pedidoFinalizado) ? [pedidoActivo] : [];

    if (ordersToProcess.length > 0) {
      accionBanner = e("div", { key: "actionbanners", className: "flex flex-col w-full" }, 
        ordersToProcess.map(order => {
          const estadoNorm = (order.estado || "").toLowerCase().trim();
          const correlativoStr = order.idFormateado ? ` ${order.idFormateado}` : "";
          const orderId = order._id;
          
          if (ESTADOS_POR_VERIFICAR.includes(estadoNorm) && typeof onConfirmarPago === "function") {
            return e(
              "div",
              {
                key: `actionbanner-${orderId}`,
                className: "w-full p-2 sm:px-4 bg-emerald-50 dark:bg-emerald-950/40 border-t border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center shrink-0 z-10",
              },
              construirBotonAccion(
                `btn-confirmar-pago-${orderId}`,
                `Confirmar pago y enviar comandas${correlativoStr}`,
                { accion: () => onConfirmarPago(orderId), titulo: `Confirmar Pago${correlativoStr}` },
                "fa-check-double",
                `Confirmar Pago${correlativoStr}`,
                "bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800",
              )
            );
          } else if (ESTADOS_VERIFICADOS.includes(estadoNorm) && typeof onCambiarEstadoPedido === "function") {
            return e(
              "div",
              {
                key: `actionbanner-${orderId}`,
                className: "w-full p-2 sm:px-4 bg-blue-50 dark:bg-blue-950/40 border-t border-blue-200 dark:border-blue-800/40 flex items-center justify-center shrink-0 z-10",
              },
              construirBotonAccion(
                `btn-despachar-${orderId}`,
                `Despachar pedido en ruta${correlativoStr}`,
                {
                  accion: () => onCambiarEstadoPedido(orderId, "en_ruta"),
                  titulo: `Despachar Pedido${correlativoStr}`,
                },
                "fa-motorcycle",
                `Despachar Pedido${correlativoStr}`,
                "bg-blue-600 hover:bg-blue-700 active:bg-blue-800",
              )
            );
          } else if (estadoNorm === "en_ruta" && typeof onCambiarEstadoPedido === "function") {
            return e(
              "div",
              {
                key: `actionbanner-${orderId}`,
                className: "w-full p-2 sm:px-4 bg-indigo-50 dark:bg-indigo-950/40 border-t border-indigo-200 dark:border-indigo-800/40 flex items-center justify-center shrink-0 z-10",
              },
              construirBotonAccion(
                `btn-entregado-${orderId}`,
                `Marcar como entregado${correlativoStr}`,
                {
                  accion: () => onCambiarEstadoPedido(orderId, "entregado"),
                  titulo: `Marcar como Entregado${correlativoStr}`,
                },
                "fa-flag-checkered",
                `Marcar como Entregado${correlativoStr}`,
                "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800",
              )
            );
          }
          return null;
        }).filter(Boolean)
      );
    }
  }

  // ── LOTE B5 · WA-97/WA-105 — abrir el visor recordando el disparador ─────
  // El disparador se captura del PROPIO evento (`currentTarget`), NO con
  // `ref={lightboxTriggerRef}` en el botón: con varias imágenes un ref compartido
  // apuntaría siempre a la última pintada, y además el propio render lo reasignaría
  // pisando el valor capturado al hacer clic. Así el foco vuelve SIEMPRE al botón
  // de la imagen que se pulsó.
  const abrirLightbox = (datos, ev) => {
    const disparador = ev && ev.currentTarget;
    if (disparador && typeof disparador.focus === "function") {
      lightboxTriggerRef.current = disparador;
    }
    setLightbox(datos);
  };

  // WA-89: marcar la imagen concreta que falló.
  const marcarErrorImagen = (clave) =>
    setImagenesConError((prev) => Object.assign({}, prev, { [String(clave)]: true }));

  // ── LOTE B5 · WA-83 — tarjeta de «Pedido Confirmado» en el timeline ───────
  // Markup y datos del legacy MessageList.js:108-127: correlativo + montos
  // USD/VES. Solo WhatsApp (es el único canal con modelo de pedidos §6.2).
  const tarjetaPedido = (item) => {
    const ped = item.pedido || {};
    const montoUSD = Number(ped.montoUSD) || 0;
    const montoVES = Number(ped.montoVES) || 0;
    return e(
      "div",
      { key: item.key, className: "flex justify-center my-4" },
      e(
        "div",
        {
          className:
            "bg-[#e2f5fc] dark:bg-sky-950/40 border border-[#b2dff2] dark:border-sky-800/60 rounded-xl p-3 max-w-[90%] md:max-w-md shadow-sm flex items-center gap-3",
        },
        [
          e(
            "div",
            {
              key: "ic",
              className:
                "w-10 h-10 bg-[#027eb5] text-white rounded-full flex items-center justify-center shrink-0",
            },
            e("i", { className: "fas fa-shopping-bag" }),
          ),
          e("div", { key: "info" }, [
            e(
              "p",
              {
                key: "titulo",
                className:
                  "text-xs font-black text-[#015c85] dark:text-sky-200 uppercase tracking-tighter",
              },
              `📦 Pedido Confirmado ${ped.idFormateado || ped.correlativo || "---"}`,
            ),
            e(
              "p",
              { key: "montos", className: "text-[10px] text-[#027eb5] dark:text-sky-300" },
              `Total: $${montoUSD} / Bs. ${montoVES.toLocaleString("es-VE")}`,
            ),
          ]),
        ],
      ),
    );
  };

  // ── LOTE B5 · WA-83 — Timeline: mensajes + tarjeta de pedido INTERCALADA ──
  // Paridad MessageList.js:34-45: los pedidos confirmados se ordenan con los
  // mensajes por timestamp y comparten los separadores de fecha (Hoy/Ayer/fecha).
  // LOTE B7c · WA-11 (cierra la brecha §2.1): ahora se inyecta el historial
  // COMPLETO de compras (`historialCompras`, de `GET /api/admin/pedidos-historial`),
  // con caída al pedido activo del CRM cuando el historial aún no llegó.
  const elementosTimeline = [];
  if (canal === "whatsapp") {
    // LOTE B7c · WA-11 — UNA tarjeta «Pedido Confirmado» por compra del cliente
    // (paridad `MessageList.js:34-45`, que inyectaba TODAS las compras). Si el
    // historial aún no llegó (o el endpoint falló) se usa el pedido ACTIVO del
    // CRM, que era exactamente el comportamiento del LOTE B5. El dedupe por `_id`
    // evita que el pedido activo salga dos veces.
    const compras =
      Array.isArray(historialCompras) && historialCompras.length
        ? historialCompras
        : pedidoActivo
          ? [pedidoActivo]
          : [];
    const vistos = {};
    compras.forEach((compra, i) => {
      if (!compra) return;
      if (!(compra.idFormateado || compra.correlativo)) return;
      const ts = aMillis(compra.timestamp);
      if (!ts) return;
      const idTarjeta = String(
        compra._id || compra.idFormateado || compra.correlativo || `compra-${i}`,
      );
      if (vistos[idTarjeta]) return;
      vistos[idTarjeta] = true;
      elementosTimeline.push({
        timelineType: "pedido",
        key: `pedido-${idTarjeta}`,
        timestamp: ts,
        pedido: compra,
      });
    });
  }
  mensajes.forEach((msg, idx) => {
    elementosTimeline.push({
      timelineType: "mensaje",
      key: (msg && msg._id) || `msg-${idx}`,
      timestamp: aMillis(msg && msg.timestamp),
      msg,
      idx,
    });
  });
  elementosTimeline.sort((a, b) => a.timestamp - b.timestamp);

  const handleLoadOlder = () => {
    if (scrollRef.current) alturaPreviaRef.current = scrollRef.current.scrollHeight;
    if (typeof onLoadMore === "function") onLoadMore();
  };

  const handleSubmit = (ev) => {
    if (ev) ev.preventDefault();
    const texto = (borrador || "").trim();
    if (!texto) return;
    if (typeof onSend === "function") onSend(texto);
    // LOTE B7b · IG-48 — REENFOQUE tras enviar (origen: InstagramInput.js:20-26,
    // que hace `inputRef.current.focus()` al terminar `handleSubmit`).
    if (textAreaRef.current && typeof textAreaRef.current.focus === "function") {
      try {
        textAreaRef.current.focus();
      } catch (err) {
        // No bloqueante: en algunos entornos el foco puede fallar.
      }
    }
  };

  const handleKeyDown = (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      handleSubmit();
    }
  };

  const handleFile = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    // LOTE B7a · WA-72/WA-73 — el TEXTO del composer viaja como `caption` del
    // adjunto (origen legacy: WhatsAppInput.js:98-101). El composer queda vacío
    // tras enviarlo (lo limpia InboxConsole al consumir el borrador).
    if (file && typeof onSendAdjunto === "function") {
      onSendAdjunto(file, (borrador || "").trim(), replyingTo || null);
    }
    ev.target.value = "";
  };

  return e("div", { className: "flex-1 flex flex-col h-full min-w-0 overflow-hidden" }, [
    // Cabecera del hilo
    e(
      "header",
      {
        key: "thread-header",
        className:
          "shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700/80 px-3 py-2 flex items-center gap-2.5",
      },
      [
        e(
          "button",
          {
            key: "back-btn",
            onClick: () => typeof onBack === "function" && onBack(),
            className:
              "md:hidden w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 cursor-pointer",
            title: "Volver a la lista",
            "aria-label": "Volver a la lista",
          },
          e("i", { className: "fas fa-arrow-left" }),
        ),
        canal === "instagram"
          ? e(InstagramAvatar, {
              key: "avatar",
              src: conversacion.avatar || null,
              username: conversacion.username || null,
              name: conversacion.nombre || null,
              size: "md",
              // IG-23/IG-38: aro de historia si hay no leídos + punto «en línea».
              hasStoryRing: Number(conversacion.noLeidos) > 0,
              online: igOnline,
              borderClass: "border-2 border-white dark:border-gray-800",
            })
          : e("img", {
              key: "avatar",
              src: avatarDe(conversacion),
              alt: `Avatar de ${nombre}`,
              className:
                "w-9 h-9 rounded-full object-cover shrink-0 border border-gray-200 dark:border-gray-700",
            }),
        e("div", { key: "identidad", className: "flex-1 min-w-0" }, [
          e("div", { key: "linea-1", className: "flex items-center gap-1.5 min-w-0" }, [
            e(
              "h3",
              {
                key: "nombre",
                className:
                  "font-bold text-sm text-gray-900 dark:text-white truncate leading-tight",
              },
              nombre,
            ),
            // LOTE B7b · IG-32 — insignia verificada en la cabecera del hilo
            // (origen: InstagramHeader.js:80-85). La alimenta el `perfil` del
            // objeto unificado.
            igVerificado
              ? e("i", {
                  key: "verificado",
                  "data-testid": "ig-verificado-header",
                  className: "fas fa-check-circle text-sky-500 text-[11px] shrink-0",
                  title: "Cuenta verificada",
                  "aria-label": "Cuenta verificada",
                })
              : null,
            e(
              "span",
              {
                key: "canal-chip",
                className: `inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${meta.chip}`,
                title: `Canal: ${meta.label}`,
              },
              [
                e("i", { key: "ic", className: `${meta.icono} text-[8px]` }),
                meta.label,
              ],
            ),
            conversacion.origen === "anuncio"
              ? e("i", {
                  key: "origen",
                  className: "fas fa-bullhorn text-purple-500 text-[10px] shrink-0",
                  title: `Vino de un anuncio${conversacion.detalleOrigen ? ` (${conversacion.detalleOrigen})` : ""}`,
                })
              : null,
          ]),
          e(
            "p",
            {
              key: "linea-2",
              className: "text-[10px] text-gray-500 dark:text-gray-400 truncate",
            },
            [
              conversacion.username ? `@${conversacion.username} · ` : "",
              // LOTE B7b · IG-33 — la fila meta del legacy dice
              // «@username • Instagram» (InstagramHeader.js:88-108); el inbox no
              // rotulaba el canal aquí.
              canal === "instagram" ? "Instagram · " : "",
              canal === "whatsapp" ? conversacion.usuarioId : `ID ${conversacion.usuarioId}`,
              conversacion.pasoLabel ? ` · ${conversacion.pasoLabel}` : "",
            ].join(""),
          ),
          // P-02: Comentado — el backend nunca emite cliente_presencia ni cliente_typing.
          /*
          canal === "whatsapp" && estadoPresencia
            ? e(
                "p",
                {
                  key: "linea-presencia",
                  "data-testid": "presencia",
                  className: `truncate flex items-center gap-1 ${estadoPresencia.clase}`,
                },
                [
                  estadoPresencia.icono === "punto"
                    ? e("span", {
                        key: "punto",
                        className:
                          "w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0",
                      })
                    : null,
                  estadoPresencia.texto,
                ],
              )
            : null,
          */
        ]),
        e(
          "div",
          {
            key: "acciones",
            ref: menuRef,
            className: "flex items-center gap-1.5 shrink-0 relative",
          },
          [
            // Botón Modo Bot ON / Manual (Único botón visible directo)
            typeof onToggleModo === "function"
              ? e(
                  "button",
                  {
                    key: "modo-btn",
                    onClick: onToggleModo,
                    title: esManual
                      ? "Reactivar bot (volver a automático)"
                      : "Pausar bot en esta conversación (modo manual)",
                    className: `px-2 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      esManual
                        ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                    }`,
                  },
                  [
                    e("i", {
                      key: "ic",
                      className: `fas ${esManual ? "fa-user-edit" : "fa-robot"} text-[10px]`,
                    }),
                    e("span", { key: "txt", className: "hidden sm:inline" }, esManual ? "Manual" : "Bot ON"),
                  ],
                )
              : null,

            // Botón Menú Hamburguesa / Opciones
            e(
              "button",
              {
                key: "menu-btn",
                type: "button",
                onClick: () => setMenuAccionesAbierto((v) => !v),
                title: "Más opciones de la conversación",
                "aria-label": "Más opciones",
                "aria-expanded": menuAccionesAbierto,
                className: `w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-all cursor-pointer border text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95 ${
                  menuAccionesAbierto
                    ? "bg-gray-200 dark:bg-gray-700 border-gray-300 dark:border-gray-600 shadow-inner"
                    : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                }`,
              },
              e("i", {
                className: `fas ${menuAccionesAbierto ? "fa-times" : "fa-bars"} text-xs`,
              }),
            ),

            // Dropdown de acciones estilado
            menuAccionesAbierto &&
              e(
                "div",
                {
                  key: "dropdown-acciones",
                  className:
                    "absolute right-0 top-full mt-1.5 w-60 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col divide-y divide-gray-100 dark:divide-gray-700/60 select-none",
                },
                [
                  // Grupo 1: Herramientas principales (Venta IA, Ficha CRM / Perfil)
                  e(
                    "div",
                    { key: "grupo-tools", className: "py-1 flex flex-col" },
                    [
                      canal === "whatsapp" && typeof onOpenManualOrder === "function"
                        ? e(
                            "button",
                            {
                              key: "venta-ia-btn",
                              type: "button",
                              "data-testid": "venta-ia-btn",
                              onClick: () => {
                                setMenuAccionesAbierto(false);
                                onOpenManualOrder();
                              },
                              className:
                                "w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-gray-700 dark:text-gray-200 transition cursor-pointer group",
                            },
                            [
                              e("i", {
                                className:
                                  "fas fa-robot text-xs w-4 text-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform",
                              }),
                              e("div", { className: "flex flex-col flex-1 min-w-0" }, [
                                e("span", { className: "font-semibold text-gray-800 dark:text-gray-100" }, "Venta IA"),
                                e("span", { className: "text-[10px] text-gray-400" }, "Copiloto para venta manual"),
                              ]),
                            ],
                          )
                        : null,

                      canal === "whatsapp" && typeof onAbrirFicha === "function"
                        ? e(
                            "button",
                            {
                              key: "ficha-btn",
                              type: "button",
                              "aria-pressed": Boolean(fichaAbierta),
                              onClick: () => {
                                setMenuAccionesAbierto(false);
                                onAbrirFicha();
                              },
                              className: `w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 transition cursor-pointer group ${
                                fichaAbierta
                                  ? "bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300"
                                  : "hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-200"
                              }`,
                            },
                            [
                              e("i", {
                                className:
                                  "fas fa-id-card text-xs w-4 text-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform",
                              }),
                              e("div", { className: "flex flex-col flex-1 min-w-0" }, [
                                e("span", { className: "font-semibold" }, "Ficha del Cliente"),
                                e("span", { className: "text-[10px] text-gray-400" }, "CRM, LTV, carrito y pedidos"),
                              ]),
                              fichaAbierta &&
                                e("span", { className: "text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300" }, "Abierta"),
                            ],
                          )
                        : null,

                      canal === "instagram" && typeof onAbrirFichaIG === "function"
                        ? e(
                            "button",
                            {
                              key: "ficha-ig-btn",
                              type: "button",
                              "data-testid": "ig-info-btn",
                              "aria-pressed": Boolean(fichaIGAbierta),
                              onClick: () => {
                                setMenuAccionesAbierto(false);
                                onAbrirFichaIG();
                              },
                              className: `w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 transition cursor-pointer group ${
                                fichaIGAbierta
                                  ? "bg-pink-50/70 dark:bg-pink-950/40 text-[#E1306C]"
                                  : "hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-200"
                              }`,
                            },
                            [
                              e("i", {
                                className:
                                  "fas fa-info-circle text-xs w-4 text-center text-[#E1306C] group-hover:scale-110 transition-transform",
                              }),
                              e("div", { className: "flex flex-col flex-1 min-w-0" }, [
                                e("span", { className: "font-semibold" }, "Perfil de Instagram"),
                                e("span", { className: "text-[10px] text-gray-400" }, "Información del contacto"),
                              ]),
                              fichaIGAbierta &&
                                e("span", { className: "text-[9px] font-bold px-1.5 py-0.5 rounded bg-pink-100 dark:bg-pink-900 text-[#E1306C]" }, "Abierta"),
                            ],
                          )
                        : null,
                    ].filter(Boolean),
                  ),

                  // Grupo 2: Acciones operativas (Destrabar, Consola externa)
                  e(
                    "div",
                    { key: "grupo-operativo", className: "py-1 flex flex-col" },
                    [
                      canal === "whatsapp" && typeof onResetBot === "function"
                        ? e(
                            "button",
                            {
                              key: "reset-btn",
                              type: "button",
                              onClick: () => {
                                setMenuAccionesAbierto(false);
                                onResetBot();
                              },
                              className:
                                "w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-gray-700 dark:text-gray-200 transition cursor-pointer group",
                            },
                            [
                              e("i", {
                                className:
                                  "fas fa-unlock text-xs w-4 text-center text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform",
                              }),
                              e("div", { className: "flex flex-col flex-1 min-w-0" }, [
                                e("span", { className: "font-semibold text-gray-800 dark:text-gray-100" }, "Destrabar Bot"),
                                e("span", { className: "text-[10px] text-gray-400" }, "Limpia estado y carrito atascado"),
                              ]),
                            ],
                          )
                        : null,

                      canal !== "messenger" && typeof onOpenCanalConsole === "function"
                        ? e(
                            "button",
                            {
                              key: "consola-btn",
                              type: "button",
                              onClick: () => {
                                setMenuAccionesAbierto(false);
                                onOpenCanalConsole(canal, conversacion.usuarioId);
                              },
                              className:
                                "w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-200 transition cursor-pointer group",
                            },
                            [
                              e("i", {
                                className:
                                  "fas fa-external-link-alt text-xs w-4 text-center text-gray-500 group-hover:scale-110 transition-transform",
                              }),
                              e("div", { className: "flex flex-col flex-1 min-w-0" }, [
                                e("span", { className: "font-semibold text-gray-800 dark:text-gray-100" }, `Consola de ${meta.label}`),
                                e("span", { className: "text-[10px] text-gray-400" }, "Abrir vista detallada"),
                              ]),
                            ],
                          )
                        : null,
                    ].filter(Boolean),
                  ),

                  // Grupo 3: Bloqueo (Acción de seguridad/moderación)
                  typeof onToggleBloqueo === "function"
                    ? e(
                        "div",
                        { key: "grupo-moderacion", className: "py-1 flex flex-col" },
                        [
                          e(
                            "button",
                            {
                              key: "bloquear-btn",
                              type: "button",
                              onClick: () => {
                                setMenuAccionesAbierto(false);
                                onToggleBloqueo();
                              },
                              className: `w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 transition cursor-pointer group ${
                                conversacion.bloqueado
                                  ? "hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                                  : "hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400"
                              }`,
                            },
                            [
                              e("i", {
                                className: `fas ${
                                  conversacion.bloqueado ? "fa-user-check text-emerald-600 dark:text-emerald-400" : "fa-user-slash text-red-500"
                                } text-xs w-4 text-center group-hover:scale-110 transition-transform`,
                              }),
                              e("div", { className: "flex flex-col flex-1 min-w-0" }, [
                                e(
                                  "span",
                                  { className: "font-semibold" },
                                  conversacion.bloqueado ? "Desbloquear usuario" : "Bloquear usuario",
                                ),
                                e(
                                  "span",
                                  { className: "text-[10px] text-gray-400" },
                                  conversacion.bloqueado ? "Permitir recibir mensajes" : "Ignorar mensajes entrantes",
                                ),
                              ]),
                            ],
                          ),
                        ],
                      )
                    : null,
                ].filter(Boolean),
              ),
          ],
        ),
      ],
    ),

    // ── LOTE B7b · IG-16 — BANNER GLOBAL DE BOT PAUSADO (Instagram) ──────────
    // Origen legacy: InstagramConsole.js:567-597. El switch global del bot de
    // Instagram es estado de CANAL (vive en el engranaje de la Col-C, LOTE B6),
    // pero el legacy lo recordaba también dentro del hilo: cuando está pausado,
    // «las respuestas automáticas están apagadas» y hay un botón «Reactivar
    // Bot». Solo Instagram (Messenger no tiene bot-toggle propio).
    canal === "instagram" && botCanalPausado
      ? e(
          "div",
          {
            key: "bot-pausado-banner",
            "data-testid": "ig-bot-pausado-banner",
            className:
              "shrink-0 bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-amber-800 dark:text-amber-200 text-xs font-medium",
          },
          [
            e("div", { key: "banner-msg", className: "flex items-center gap-2 min-w-0" }, [
              e("i", { className: "fas fa-robot text-amber-600 dark:text-amber-400" }),
              e(
                "span",
                { className: "truncate" },
                "Bot de Instagram pausado globalmente — Las respuestas automáticas están apagadas.",
              ),
            ]),
            typeof onReactivarBotCanal === "function"
              ? e(
                  "button",
                  {
                    key: "banner-reactivar",
                    type: "button",
                    onClick: () => onReactivarBotCanal(),
                    className:
                      "text-[11px] font-bold text-amber-900 dark:text-amber-100 underline hover:no-underline cursor-pointer ml-2 shrink-0",
                  },
                  "Reactivar Bot",
                )
              : null,
          ],
        )
      : null,

    // Banner de pedido (extensión sólo disponible en WhatsApp, §6.2 `pedido`)
    puedeGestionarPedido
      ? e(
          "div",
          {
            key: "pedido-banner",
            className:
              "shrink-0 px-3 py-2 bg-purple-50 dark:bg-purple-950/30 border-b border-purple-200 dark:border-purple-900/40 flex items-center justify-between gap-2 text-[11px]",
          },
          [
            e("div", { key: "info", className: "flex items-center gap-2 min-w-0 text-purple-800 dark:text-purple-200 font-semibold" }, [
              e("i", { key: "ic", className: "fas fa-shopping-bag" }),
              e(
                "span",
                { key: "txt", className: "truncate" },
                `Pedido ${pedido.ultimoCorrelativo || ""} · ${(pedido.ultimoEstado || "sin estado").replace(/_/g, " ")}${pedido.pedidosCount > 1 ? ` · ${pedido.pedidosCount} pedidos` : ""}`,
              ),
            ]),
            e(
              "button",
              {
                key: "gestionar",
                onClick: () =>
                  typeof onOpenCanalConsole === "function" &&
                  onOpenCanalConsole(canal, conversacion.usuarioId),
                className:
                  "shrink-0 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-600 hover:bg-purple-700 text-white transition active:scale-95 cursor-pointer",
              },
              "Verificar pago / despacho",
            ),
          ],
        )
      : null,

    // Lista de mensajes
    e(
      "div",
      {
        key: "mensajes",
        ref: scrollRef,
        className: `flex-1 overflow-y-auto p-4 md:p-6 space-y-3.5 select-text ${meta.fondo}`,
 },
 [
 // ── LOTE B7b · IG-39 — BANNER DE CANAL «Conversación de Instagram Direct» ──
 // Origen legacy: InstagramMessageList.js:99-121. El legacy recordaba EN EL
 // PROPIO HILO que la conversación es de Instagram Direct (píldora centrada con
 // el icono en gradiente); el inbox solo tenía el chip de canal de la cabecera.
 canal === "instagram"
   ? e(
       "div",
       {
         key: "ig-canal-banner",
         "data-testid": "ig-canal-banner",
         className: "flex justify-center my-2",
       },
       e(
         "div",
         {
           className:
             "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xs text-xs text-gray-500 dark:text-gray-400 font-medium",
         },
         [
           e("i", {
             key: "banner-icon",
             className:
               "fab fa-instagram text-transparent bg-clip-text bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-sm",
           }),
           e("span", { key: "banner-text" }, "Conversación de Instagram Direct"),
         ],
       ),
     )
   : null,

 // ── LOTE B5 · WA-80 — banner de Modo Manual en el hilo ────────────────
 // Texto LITERAL de MessageList.js:54-68 (legacy): al pausar el bot el
 // operador tiene que verlo en el propio hilo, no solo en el botón de modo.
 esManual
   ? e(
       "div",
       {
         key: "banner-modo-manual",
         className: "flex justify-center mb-3",
         "data-testid": "banner-modo-manual",
       },
       e(
         "div",
         {
           className:
             "bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 shadow-sm",
         },
         "👤 Modo Manual — El bot está pausado para este chat. Los mensajes del cliente no recibirán respuesta automática.",
       ),
     )
   : null,

 paginacion && paginacion.hasMore
          ? e(
              "div",
              { key: "load-more", className: "flex justify-center pb-2" },
              e(
                "button",
                {
                  onClick: handleLoadOlder,
                  disabled: cargandoHilo,
                  className:
                    "px-3 py-1.5 rounded-full text-[11px] font-bold bg-white/90 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer disabled:opacity-60",
                },
                cargandoHilo ? "Cargando..." : "Cargar mensajes anteriores",
              ),
            )
          : null,

        elementosTimeline.length === 0
          ? e(
              "div",
              {
                key: "sin-mensajes",
                className:
                  "h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 gap-2",
              },
              [
                e("i", { key: "ic", className: `${meta.icono} text-4xl opacity-30` }),
                e(
                  "p",
                  { key: "txt", className: "text-xs font-medium" },
                  cargandoHilo ? "Cargando conversación..." : "Sin mensajes en esta conversación",
                ),
              ],
            )
          : elementosTimeline.reduce((acc, item, idx) => {
              // WA-83: la tarjeta de pedido ocupa su lugar cronológico y ya pasó
              // por el separador de fecha de arriba.
              if (item.timelineType === "pedido") {
                acc.push(tarjetaPedido(item));
                return acc;
              }
              const msg = item.msg;
              const ms = aMillis(msg.timestamp);
              const fecha = ms ? new Date(ms).toDateString() : "sin-fecha";
              const fechaPrevia =
                idx > 0
                  ? new Date(elementosTimeline[idx - 1].timestamp).toDateString()
                  : null;

              if (fecha !== fechaPrevia) {
                acc.push(
                  e(
                    "div",
                    { key: `fecha-${fecha}-${idx}`, className: "flex justify-center my-3" },
                    e(
                      "span",
                      {
                        className:
                          "text-[11px] font-medium px-3 py-1 bg-gray-200/70 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 rounded-lg shadow-sm",
                      },
                      getDateLabel(msg.timestamp),
                    ),
                  ),
                );
              }

              const entrante = esEntrante(msg);
              const texto = textoDe(msg);
              const mediaUrl = msg.mediaUrl || null;
              // LOTE B5 · WA-85: la heurística por tipo + MIME + extensión
              // sustituye a la detección anterior (que solo miraba `tipo` y la
              // extensión de la URL y por eso no veía `mimeType` ni `location`).
              const tipoMedia = detectarTipoMultimedia(msg);
              const esAudio = tipoMedia === "audio";
              const esImagen = tipoMedia === "imagen";
              const esUbicacion = tipoMedia === "location";
              // El vídeo sin reproductor cae al bloque de documento (mismo
              // comportamiento que el legacy, que trataba toda media no-imagen y
              // no-audio como documento descargable).
              const esDocumento = tipoMedia === "documento" || tipoMedia === "video";
              // LOTE B7b · IG-46: en Instagram el saliente cae al doble check
              // «Entregado por Instagram Direct» cuando Meta no aporta status.
              const status = entrante
                ? null
                : STATUS_ICONO[msg.status] ||
                  (canal === "instagram" ? STATUS_IG_SALIENTE : null);
              const esTemporal = typeof msg._id === "string" && msg._id.indexOf("temp-") === 0;
              // WA-90: nombre legible + icono por tipo.
              let nombreArchivo = msg.fileName || null;
              if (!nombreArchivo && texto && /^\[Archivo:/i.test(texto)) {
                const m = texto.match(/^\[Archivo:\s*([^\]]+)\]/i);
                if (m) nombreArchivo = m[1].trim();
              }
              if (!nombreArchivo) nombreArchivo = "Documento adjunto";
              const fileIconInfo = getFileIconInfo(nombreArchivo, msg.mimeType);
              // WA-89: la imagen rota se recuerda por mensaje.
              const imagenConError = Boolean(imagenesConError[String(msg._id)]);
              // WA-91: enlace a Google Maps (el backend guarda ahí la ubicación).
              const mapsHref = /^https?:\/\//i.test(String(mediaUrl || "")) ? mediaUrl : null;

              // ── LOTE B3 · WA-92/93: citar (hover + doble clic) ────────────────
              // Solo si el mensaje tiene un id externo REAL de Meta (wamid/mid).
              const puedeCitar =
                typeof onReply === "function" && idExternoValido(msg.idExterno);
              const cita = puedeCitar
                ? {
                    _id: msg._id,
                    idExterno: msg.idExterno,
                    texto: textoCitable(msg),
                    direccion: msg.direccion || msg.direction,
                  }
                : null;
              const dispararCita = cita
                ? (ev) => {
                    if (ev && typeof ev.stopPropagation === "function") ev.stopPropagation();
                    onReply(cita);
                  }
                : undefined;

              // ── LOTE B3 · WA-94: reintentar (solo WhatsApp, saliente, fallido) ─
              const puedeReintentar =
                !entrante &&
                canal === "whatsapp" &&
                msg.status === "failed" &&
                typeof onRetry === "function" &&
                textoReintentable(msg);

              const placeholderRedundante =
                esUbicacion || // WA-91: MessageBubble.js:466-467 oculta el texto en las ubicaciones
                (mediaUrl &&
                  (texto === "[Foto]" ||
                    texto === "[Foto recibida]" ||
                    texto === "[Nota de voz]" ||
                    texto === "[Nota de voz recibida]"));

              // WA-92: botón Responder/Citar — visible al hacer hover sobre la
              // burbuja (y siempre visible con foco por teclado). Origen legacy:
              // MessageBubble.js:219-233.
              const botonCitar = puedeCitar
                ? e(
                    "button",
                    {
                      key: "reply-action-btn",
                      type: "button",
                      onClick: dispararCita,
                      title: "Citar y responder",
                      "aria-label": "Responder a este mensaje",
                      className:
                        "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1.5 text-gray-400 hover:text-[#008069] dark:hover:text-emerald-400 bg-white/90 dark:bg-gray-800/90 rounded-full shadow-xs text-xs cursor-pointer shrink-0 select-none mb-1",
                    },
                    e("i", { className: "fas fa-reply" }),
                  )
                : null;

              acc.push(
                e(
                  "div",
                  {
                    key: msg._id || `msg-${idx}`,
                    // WA-93: doble clic sobre la burbuja para citar.
                    // Origen legacy: MessageBubble.js:215.
                    onDoubleClick: dispararCita,
                    className: `group relative flex items-end gap-2 ${
                      entrante ? "justify-start" : "justify-end"
                    }`,
                  },
                  [
                    entrante
                      ? e("img", {
                          key: "avatar-cliente",
                          src: avatarDe(conversacion),
                          alt: "Avatar",
                          className:
                            "w-7 h-7 rounded-full object-cover shrink-0 border border-gray-200 dark:border-gray-700 shadow-xs mb-1 hidden sm:block",
                        })
                      : null,
                    // Saliente: el botón va ANTES de la burbuja (order-first legacy)
                    entrante ? null : botonCitar,
                    e(
                      "div",
                      {
                        key: "burbuja",
                        className: `relative max-w-[85%] sm:max-w-[75%] md:max-w-[65%] px-4 py-2.5 rounded-2xl shadow-sm text-sm break-words leading-relaxed ${
                          entrante
                            ? "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200/90 dark:border-gray-700 rounded-bl-xs"
                            : meta.saliente
                        } ${esTemporal ? "opacity-80" : ""}`,
                      },
                      [
                        // ── LOTE B5 · WA-84 — cola de burbuja in/out ───────────
                        // Triángulo idéntico al de styles.js (`.wa-bubble-tail-*`),
                        // pero en estilos en línea porque esa hoja la inyecta
                        // WhatsAppConsole.js y el inbox no puede depender de que la
                        // consola legacy esté montada. Solo WhatsApp: Instagram y
                        // Messenger conservan su diseño propio (gradiente/azul).
                        canal === "whatsapp"
                          ? e("span", {
                              key: "bubble-tail",
                              "aria-hidden": "true",
                              "data-testid": entrante ? "bubble-tail-in" : "bubble-tail-out",
                              // LOTE B7c · WA-41: la clase `.wa-bubble-tail-*` la
                              // define `styles.js` (idéntica a `MessageBubble.js:247`);
                              // el estilo en línea de B5 queda como GEOMETRÍA
                              // garantizada (mismos valores) para que la cola se vea
                              // igual aunque la hoja `.wa-*` aún no esté montada.
                              className: entrante ? "wa-bubble-tail-in" : "wa-bubble-tail-out",
                              style: estiloCola(entrante, entrante ? "#ffffff" : "#dcf8c6"),
                            })
                          : null,

                        msg.replyToText
                          ? e(
                              "div",
                              {
                                key: "cita",
                                className: `mb-1.5 pl-2 border-l-2 text-[11px] leading-snug opacity-80 ${
                                  entrante ? "border-emerald-400" : "border-white/60"
                                }`,
                              },
                              msg.replyToText,
                            )
                          : null,

                        esAudio
                          ? e(
                              "div",
                              { key: "audio-wrap", className: "my-1.5" },
                              e("audio", {
                                controls: true,
                                src: mediaUrl,
                                className: "max-w-full h-8 sm:h-9 rounded-md",
                              }),
                            )
                          : null,

                        // ── LOTE B5 · WA-88 — imagen → VISOR INTERNO con zoom ───
                        // (el inbox abría `window.open`, que se sale del SaaS y no
                        // tiene zoom; paridad MessageBubble.js:318-366)
                        esImagen && mediaUrl
                          ? e("div", { key: "img-wrap", className: "my-1.5" }, [
                              // WA-89 — error de imagen: aviso en la propia burbuja
                              // (paridad MessageBubble.js:342-354).
                              imagenConError
                                ? e(
                                    "div",
                                    {
                                      key: "img-error",
                                      className:
                                        "flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/40 border border-gray-200 dark:border-gray-600 rounded-lg text-xs text-gray-500 dark:text-gray-300",
                                    },
                                    [
                                      e("i", {
                                        key: "ic",
                                        className: "fas fa-image text-gray-400 text-base",
                                      }),
                                      e("span", { key: "txt" }, "No se pudo cargar la imagen."),
                                    ],
                                  )
                                : e(
                                    "button",
                                    {
                                      key: "img-btn",
                                      type: "button",
                                      onClick: (ev) => {
                                        if (ev && typeof ev.stopPropagation === "function") {
                                          ev.stopPropagation();
                                        }
                                        abrirLightbox(
                                          {
                                            src: mediaUrl,
                                            alt: nombreArchivo || texto || "Imagen adjunta",
                                            caption: msg.caption || null,
                                            fileName: msg.fileName || null,
                                          },
                                          ev,
                                        );
                                      },
                                      className:
                                        "p-0 bg-transparent border-0 text-left cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#00a884] rounded-lg block overflow-hidden max-w-full group",
                                      "aria-label": `Ver imagen ampliada: ${nombreArchivo || texto || "Imagen adjunta"}`,
                                    },
                                    e("img", {
                                      src: mediaUrl,
                                      alt: nombreArchivo || texto || "Imagen adjunta",
                                      className:
                                        "max-w-full max-h-64 sm:max-h-72 rounded-xl object-contain shadow-xs group-hover:opacity-95 transition-all border border-black/10 dark:border-white/10",
                                      loading: "lazy",
                                      onError: () => marcarErrorImagen(msg._id),
                                    }),
                                  ),
                            ])
                          : null,

                        // ── LOTE B5 · WA-91 — ubicación compartida → Google Maps ─
                        // Paridad MessageBubble.js:423-463. El backend guarda la
                        // ubicación con `tipo: "location"` y la URL de Maps en
                        // `mediaUrl` (chatFlowService.ts:126-139); si es un chat
                        // antiguo sin coordenadas el enlace queda deshabilitado.
                        esUbicacion
                          ? e("div", { key: "location-wrap", className: "my-1.5" }, [
                              e(
                                "a",
                                {
                                  key: "maps-link",
                                  href: mapsHref || "#",
                                  target: "_blank",
                                  rel: "noopener noreferrer",
                                  className:
                                    "flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-blue-600 dark:text-blue-200 no-underline",
                                  "aria-label": "Abrir ubicación compartida en Google Maps",
                                },
                                [
                                  e(
                                    "div",
                                    {
                                      key: "ic-wrap",
                                      className:
                                        "w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center shrink-0",
                                    },
                                    e("i", {
                                      className:
                                        "fas fa-map-marker-alt text-blue-500 dark:text-blue-300",
                                    }),
                                  ),
                                  e("div", { key: "txt", className: "flex flex-col" }, [
                                    e(
                                      "span",
                                      { key: "t", className: "text-[13px] font-bold" },
                                      "Ubicación Compartida",
                                    ),
                                    e(
                                      "span",
                                      { key: "s", className: "text-[11px] opacity-80" },
                                      mapsHref
                                        ? "Toca para abrir en Google Maps"
                                        : "Coordenadas no disponibles (Chat antiguo)",
                                    ),
                                  ]),
                                ],
                              ),
                            ])
                          : null,

                        // ── LOTE B5 · WA-90 — documento descargable con ICONO POR
                        // TIPO (PDF/DOC/XLS/ZIP/TXT) y atributo `download`.
                        // Paridad MessageBubble.js:369-421; antes el inbox pintaba
                        // un enlace genérico sin icono ni descarga.
                        esDocumento && mediaUrl
                          ? e(
                              "a",
                              {
                                key: "doc-wrap",
                                href: mediaUrl,
                                target: "_blank",
                                rel: "noopener noreferrer",
                                download: nombreArchivo,
                                "aria-label": `Descargar o abrir documento ${nombreArchivo}`,
                                className: `flex items-center gap-3 p-2.5 my-1.5 rounded-xl transition-colors no-underline text-inherit cursor-pointer select-none group border ${
                                  entrante
                                    ? "bg-gray-100 dark:bg-gray-700 border-black/10 dark:border-white/10"
                                    : "bg-black/10 border-black/10 dark:border-white/10"
                                }`,
                              },
                              [
                                e(
                                  "div",
                                  {
                                    key: "ic",
                                    className: `w-10 h-10 rounded-lg bg-white dark:bg-gray-800 shadow-xs flex items-center justify-center shrink-0 ${fileIconInfo.color}`,
                                  },
                                  e("i", {
                                    className: `fas ${fileIconInfo.icon} text-lg`,
                                  }),
                                ),
                                e("div", { key: "info", className: "flex-1 min-w-0 pr-2" }, [
                                  e(
                                    "p",
                                    {
                                      key: "n",
                                      className: "text-[13px] font-medium truncate mb-0.5",
                                      title: nombreArchivo,
                                    },
                                    nombreArchivo,
                                  ),
                                  e(
                                    "span",
                                    {
                                      key: "l",
                                      className:
                                        "text-[10px] uppercase font-semibold opacity-70",
                                    },
                                    fileIconInfo.label,
                                  ),
                                ]),
                                e(
                                  "div",
                                  {
                                    key: "dl",
                                    className:
                                      "opacity-60 group-hover:opacity-100 transition-opacity p-1 shrink-0",
                                    title: "Descargar",
                                  },
                                  e("i", { className: "fas fa-arrow-down text-xs" }),
                                ),
                              ],
                            )
                          : null,

                        texto && !placeholderRedundante
                          ? e(
                              "div",
                              { key: "texto", className: "whitespace-pre-wrap font-normal" },
                              renderFormattedText(texto),
                            )
                          : null,

                        e(
                          "div",
                          {
                            key: "meta",
                            className: `flex items-center justify-end gap-1 mt-1 text-[10px] ${
                              entrante ? "text-gray-400 dark:text-gray-400" : "text-black/50 dark:text-white/80"
                            }`,
                          },
                          [
                            e("span", { key: "hora" }, formatHora(msg.timestamp)),
                            // WA-94: en un mensaje fallido el icono de estado se
                            // sustituye por el botón Reintentar (paridad exacta con
                            // MessageBubble.js:173-196 del legacy).
                            status && !puedeReintentar
                              ? e("i", {
                                  key: "status",
                                  className: `${status.icono} text-[9px] ml-0.5`,
                                  title: status.titulo,
                                })
                              : null,
                            puedeReintentar
                              ? e(
                                  "button",
                                  {
                                    key: "retry",
                                    type: "button",
                                    onClick: (ev) => {
                                      if (ev && typeof ev.stopPropagation === "function") {
                                        ev.stopPropagation();
                                      }
                                      onRetry({
                                        _id: msg._id,
                                        idExterno: msg.idExterno,
                                        texto: textoDe(msg),
                                        status: msg.status,
                                        replyToId: msg.replyToId || null,
                                        replyToText: msg.replyToText || null,
                                      });
                                    },
                                    title:
                                      "Error al enviar por WhatsApp. Clic para reintentar.",
                                    "aria-label": "Reintentar mensaje",
                                    className:
                                      "text-red-600 hover:text-red-800 font-bold text-[10px] ml-1 bg-red-50 hover:bg-red-100 border border-red-200 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition shadow-xs",
                                  },
                                  [
                                    e(
                                      "span",
                                      { key: "ic", className: "text-xs leading-none" },
                                      "⚠️",
                                    ),
                                    e(
                                      "span",
                                      {
                                        key: "txt",
                                        className: "text-[9px] leading-none font-bold",
                                      },
                                      "Reintentar",
                                    ),
                                  ],
                                )
                              : null,
                          ],
                        ),
                      ],
                    ),
                    // Entrante: el botón va DESPUÉS de la burbuja (order-last legacy)
                    entrante ? botonCitar : null,
                  ],
                ),
              );
              return acc;
            }, []),
      ],
    ),

    // Composer
    e(
      "footer",
      {
        key: "composer",
        className:
          "shrink-0 bg-white dark:bg-gray-800/95 border-t border-gray-200 dark:border-gray-700/80",
      },
      // LOTE B4 · WA-14/15/35/36/37 — barra de acción del pedido. En la consola
      // legacy vive entre la lista de mensajes y el input
      // (WhatsAppConsole.js:1070); en el inbox es el primer elemento del footer,
      // justo encima de las Respuestas Rápidas y del composer.
      accionBanner,
      // LOTE B2: barra de Respuestas Rápidas (Col-H, encima del composer) — WA-107..117 + IG-49
      e(InboxQuickReplyBar, {
        key: "quick-reply-bar",
        conversacion,
        onFillInput: (texto) => {
          if (typeof setBorrador === "function") setBorrador(texto);
        },
        onSend: (texto) => {
          if (typeof onSend === "function") onSend(texto);
        },
      }),
      // LOTE B3 · WA-74: barra de respuesta citada con botón cancelar.
      // Origen legacy: WhatsAppInput.js:131-163.
      replyingTo
        ? e(
            "div",
            {
              key: "replying-preview-bar",
              className:
                "mx-2 sm:mx-3 mt-2 px-3 py-1.5 bg-white dark:bg-gray-800 border-l-4 border-[#008069] flex justify-between items-center text-xs text-gray-700 dark:text-gray-200 rounded shadow-2xs select-none",
            },
            [
              e("div", { key: "cita", className: "flex items-center gap-2 truncate min-w-0" }, [
                e("i", {
                  key: "ic",
                  className: "fas fa-reply text-[#008069] shrink-0 text-[11px]",
                }),
                e(
                  "span",
                  { key: "label", className: "font-bold text-[#008069] shrink-0" },
                  "Respondiendo a:",
                ),
                e(
                  "span",
                  {
                    key: "texto",
                    className: "truncate italic font-medium text-gray-600 dark:text-gray-300",
                  },
                  replyingTo.texto || replyingTo.text || "[Mensaje]",
                ),
              ]),
              e(
                "button",
                {
                  key: "cancelar-cita",
                  type: "button",
                  onClick: () => {
                    if (typeof onCancelReply === "function") onCancelReply();
                  },
                  title: "Cancelar respuesta",
                  "aria-label": "Cancelar respuesta",
                  className:
                    "text-gray-400 hover:text-gray-700 dark:hover:text-white p-1 rounded-full shrink-0 cursor-pointer transition",
                },
                e("i", { className: "fas fa-times text-xs" }),
              ),
            ],
          )
        : null,
      e(
        "form",
        {
          onSubmit: handleSubmit,
          className: "flex items-end gap-1.5 sm:gap-2 max-w-5xl mx-auto w-full p-2 sm:p-3",
        },
        [
          e("input", {
            key: "file-input",
            ref: fileInputRef,
            type: "file",
            accept: acepta,
            className: "hidden",
            onChange: handleFile,
          }),
          e(
            "button",
            {
              key: "attach-btn",
              type: "button",
              onClick: () => fileInputRef.current && fileInputRef.current.click(),
              disabled: typeof onSendAdjunto !== "function",
              className:
                "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-gray-700/60 transition-colors active:scale-95 shrink-0 mb-0.5 cursor-pointer disabled:opacity-40",
              title:
                canal === "whatsapp"
                  ? "Adjuntar imagen, documento o audio"
                  : `Adjuntar imagen (${meta.label} solo admite imágenes)`,
              "aria-label": "Adjuntar archivo",
            },
            e("i", { className: "far fa-image text-base sm:text-lg" }),
          ),
          // LOTE B7a · WA-71 — botón de emojis (origen: WhatsAppInput.js:198-209).
          e(
            "button",
            {
              key: "emoji-btn",
              type: "button",
              onClick: () => setShowEmojis((prev) => !prev),
              "aria-label": "Insertar emojis",
              "data-testid": "emoji-btn",
              className:
                "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-gray-700/60 transition-colors active:scale-95 shrink-0 mb-0.5 cursor-pointer",
            },
            e("i", { className: "far fa-smile text-base sm:text-lg", "aria-hidden": "true" }),
          ),
          e(
            "div",
            { key: "input-wrap", className: "flex-1 relative min-w-0" },
            [
              // LOTE B7a · WA-71 — picker flotante con los 25 emojis (mismas
              // clases del legacy WhatsAppInput.js:173-195, adaptadas al tema del
              // canal para no chocar con el fondo del inbox).
              showEmojis
                ? e(
                    "div",
                    {
                      key: "emoji-picker",
                      "data-testid": "emoji-picker",
                      className:
                        "absolute bottom-12 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-2xl p-2.5 flex flex-wrap gap-2 w-64 z-50",
                    },
                    EMOJIS.map((emoji) =>
                      e(
                        "button",
                        {
                          key: emoji,
                          type: "button",
                          "aria-label": `Insertar ${emoji}`,
                          onClick: () => {
                            if (typeof setBorrador === "function") {
                              setBorrador((borrador || "") + emoji);
                            }
                          },
                          className:
                            "text-xl hover:bg-gray-100 dark:hover:bg-gray-700 p-1.5 rounded-lg transition active:scale-95 leading-none cursor-pointer",
                        },
                        emoji,
                      ),
                    ),
                  )
                : null,
              // LOTE B7a · WA-76 — textarea rows=3 con min-height y max-height
              // con scroll interno (origen: WhatsAppInput.js:237-253).
              e("textarea", {
                rows: 3,
                // WA-75: ref para el auto-focus al citar (§ LOTE B3)
                ref: textAreaRef,
                value: borrador || "",
                onChange: (ev) => {
                  if (typeof setBorrador === "function") setBorrador(ev.target.value);
                },
                onKeyDown: handleKeyDown,
                placeholder: `Escribe un mensaje por ${meta.label}... (Enter para enviar, Shift+Enter para nueva línea)`,
                "aria-label": "Escribe un mensaje",
                className: `w-full min-h-[70px] sm:min-h-[64px] max-h-[140px] bg-gray-100 dark:bg-gray-700/70 text-gray-800 dark:text-gray-100 placeholder-gray-400 text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-2xl border border-transparent focus:bg-white dark:focus:bg-gray-900 focus:outline-none transition-all shadow-inner resize-none overflow-y-auto leading-relaxed ${meta.acento}`,
              }),
            ],
          ),
          e(
            "button",
            {
              key: "send-btn",
              type: "submit",
              disabled: !(borrador || "").trim(),
              className: `w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 mb-1 ${
                (borrador || "").trim()
                  ? meta.enviar
                  : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60"
              }`,
              title: "Enviar mensaje",
              "aria-label": "Enviar mensaje",
            },
            e("i", { className: "fas fa-paper-plane text-sm" }),
          ),
        ],
      ),
    ),

    // ── LOTE B5 · WA-97..106 — VISOR DE IMAGEN (componente legacy REUTILIZADO) ─
    // `ImageLightboxModal.js` se importa tal cual desde la consola de WhatsApp: es
    // 100 % dirigido por props, así que aporta sin cambios el overlay modal
    // (WA-97), Zoom + hasta 3× (WA-98), Zoom − (WA-99), Reset 1× (WA-100), Cerrar
    // con aria-label="Cerrar imagen" (WA-101), cierre con Escape (WA-102), cierre
    // al clic en el backdrop pero no sobre la imagen (WA-103), bloqueo del scroll
    // del body (WA-104), restauración del foco al disparador (WA-105) y el
    // fallback "No se pudo cargar la imagen." (WA-106).
    // Se monta UNA sola vez por hilo (no una por burbuja): el estado del visor vive
    // en el hilo y el modal se pinta a sí mismo en `fixed inset-0 z-[120]`, fuera
    // del flujo, así que su posición en el árbol no altera el layout V3.
    lightbox
      ? e(ImageLightboxModal, {
          key: "inbox-image-lightbox",
          isOpen: true,
          onClose: cerrarLightbox,
          src: lightbox.src,
          alt: lightbox.alt,
          caption: lightbox.caption,
          fileName: lightbox.fileName,
          triggerRef: lightboxTriggerRef,
        })
      : null,
  ]);
};

export default InboxThread;
