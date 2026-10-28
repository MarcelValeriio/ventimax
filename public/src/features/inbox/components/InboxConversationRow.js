// public/src/features/inbox/components/InboxConversationRow.js
// Fila de conversación del Inbox Unificado.
// Evolución de whatsapp/components/ContactCard.js: en vez de props sueltas recibe
// el objeto ConversacionUnificada completo (§6.2) y añade el badge de canal.
import React from "https://cdn.skypack.dev/react";
// LOTE B7b — el avatar de Instagram se dibuja con el componente LEGACY
// REUTILIZADO `InstagramAvatar.js` (consola de Instagram, 101 líneas, 100 %
// dirigido por props). Aporta sin reescribirlo:
//   · IG-37 — fallback a INICIALES sobre el gradiente oficial + `onError`
//   · IG-23 — aro de HISTORIA cuando la fila tiene no leídos
//   · IG-38 — punto verde «en línea» + `aria-label`/`title` con el nombre
// Se importa con el MISMO `?v=4` que usan InstagramConsole.js:16,
// InstagramSidebar.js:8 e InstagramHeader.js:8 para compartir una única
// instancia del módulo en el navegador (regla de cache-busting del repo).
import InstagramAvatar from "../../instagram/components/InstagramAvatar.js?v=4";

const e = React.createElement;

// Identidad visual por canal (§6.2: whatsapp | instagram | messenger)
const CANAL_META = {
  whatsapp: {
    label: "WhatsApp",
    abrev: "WA",
    icono: "fab fa-whatsapp",
    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    badge: "bg-[#25D366]",
    // LOTE B7b: la píldora de no leídos y el color de la hora con no leídos
    // son del canal (IG-29: el legacy usa el GRADIENTE de Instagram).
    pill: "bg-emerald-500 text-white",
    tiempoNoLeido: "text-emerald-600 dark:text-emerald-400 font-bold",
  },
  instagram: {
    label: "Instagram",
    abrev: "IG",
    icono: "fab fa-instagram",
    chip: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
    badge: "bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4]",
    pill: "bg-gradient-to-r from-[#E1306C] to-[#833AB4] text-white",
    tiempoNoLeido: "text-[#E1306C] font-bold",
  },
  messenger: {
    label: "Messenger",
    abrev: "MSGR",
    icono: "fab fa-facebook-messenger",
    chip: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    badge: "bg-[#0084FF]",
    pill: "bg-[#0084FF] text-white",
    tiempoNoLeido: "text-[#0084FF]",
  },
};

const formatHora = (timestamp) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  const ahora = new Date();
  const diffHoras = (ahora - d) / (1000 * 60 * 60);
  if (diffHoras < 24 && d.getDate() === ahora.getDate()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  if (diffHoras < 48) return "Ayer";
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

// WhatsApp no aporta avatar (§6.2): el fallback DiceBear queda en el cliente.
const avatarDe = (conv) => {
  if (conv.avatar) return conv.avatar;
  const semilla = encodeURIComponent(conv.usuarioId || conv.clave || "inbox");
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${semilla}`;
};

const InboxConversationRow = ({ conversacion, isActive, onClick }) => {
  if (!conversacion) return null;

  const canal = conversacion.canal || "whatsapp";
  const meta = CANAL_META[canal] || CANAL_META.whatsapp;
  const nombre =
    (conversacion.nombreVisible || "").trim() ||
    conversacion.usuarioId ||
    conversacion.clave ||
    "Sin nombre";
  const usuarioId = conversacion.usuarioId || "";
  const username = conversacion.username || null;
  const ultimo = conversacion.ultimoMensaje || null;
  const preview = ultimo ? ultimo.texto || "(mensaje sin texto)" : "(Sin mensajes aún)";
  const esSaliente =
    ultimo &&
    (ultimo.direccion === "saliente" ||
      ultimo.direccion === "bot" ||
      ultimo.direccion === "admin");
  const noLeidos = Number(conversacion.noLeidos) || 0;
  const pedido = conversacion.pedido || null;
  const modoManual = conversacion.modo === "manual";
  // LOTE B7b — extensión `perfil` del contrato (§6.2) para IG/Messenger:
  // alimenta la insignia verificada (IG-24), el aro de historia y el punto
  // «en línea» (IG-23/IG-38).
  const perfil = conversacion.perfil || null;
  const estaVerificado = Boolean(perfil && perfil.verificado);
  const estaOnline = Boolean(perfil && perfil.online === true);
  // IG-28 — el legacy antepone `@username:` al preview
  // (`InstagramSidebar.js:388-393`); el inbox lo omitía.
  const prefijoPreview =
    canal === "instagram" && username
      ? e(
          "span",
          { key: "yo", className: "text-[#E1306C] dark:text-pink-400 font-medium" },
          `@${username}: `,
        )
      : esSaliente
        ? e("span", { key: "yo", className: "text-gray-400" }, "Tú: ")
        : null;

  return e(
    "div",
    {
      onClick,
      role: "button",
      tabIndex: 0,
      onKeyDown: (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          if (onClick) onClick();
        }
      },
      "aria-label": `Conversación de ${meta.label} con ${nombre}. Último mensaje: ${preview}`,
      className: `p-3 sm:p-2.5 border-b border-gray-100 dark:border-gray-700/80 cursor-pointer transition flex items-start gap-3 min-h-[5.25rem] sm:min-h-[4.25rem] select-none ${
        conversacion.stuck
          ? isActive
            ? "bg-red-50/80 dark:bg-red-950/30 border-l-4 border-l-red-600 shadow-2xs"
            : "border-l-4 border-l-red-500 bg-red-50/40 dark:bg-red-900/10 animate-pulse hover:bg-red-100/50 dark:hover:bg-red-900/30"
          : isActive
            ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-l-4 border-l-emerald-500 shadow-2xs"
            : "hover:bg-gray-50/90 dark:hover:bg-gray-700/50 active:bg-gray-100 dark:active:bg-gray-700"
      }`,
    },
    [
      // Avatar + badge de canal
      // LOTE B7b · IG-23/37/38 — en Instagram el avatar lo dibuja el componente
      // LEGACY reutilizado `InstagramAvatar` (iniciales sobre gradiente con
      // `onError` si la foto falla, aro de historia si hay no leídos y punto
      // verde «en línea»). En los demás canales se conserva la `<img>` con el
      // fallback DiceBear de siempre (WhatsApp no aporta avatar, §6.2).
      e(
        "div",
        {
          key: "avatar-wrap",
          "data-testid": canal === "instagram" ? "ig-row-avatar" : undefined,
          className:
            canal === "instagram"
              ? "shrink-0 relative self-start mt-0.5"
              : "w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0 relative self-start mt-0.5 shadow-2xs",
        },
        [
          canal === "instagram"
            ? e(InstagramAvatar, {
                key: "ig-avatar",
                src: conversacion.avatar || null,
                username,
                name: conversacion.nombre || null,
                size: "md",
                hasStoryRing: noLeidos > 0,
                online: estaOnline,
              })
            : e("img", {
                key: "avatar-img",
                src: avatarDe(conversacion),
                alt: `Avatar de ${nombre}`,
                className: "w-full h-full object-cover",
                loading: "lazy",
              }),
          e(
            "span",
            {
              key: "canal-badge",
              className: `absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${meta.badge} text-white flex items-center justify-center text-[8px] ring-2 ring-white dark:ring-gray-800`,
              title: meta.label,
            },
            e("i", { className: `${meta.icono} text-[8px]` }),
          ),
          modoManual &&
            e(
              "span",
              {
                key: "modo-badge",
                className:
                  "absolute -top-0.5 -left-0.5 bg-amber-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-black shadow-xs ring-2 ring-white dark:ring-gray-800",
                title: "Modo Manual activado",
                "aria-label": "Modo Manual",
              },
              e("i", { className: "fas fa-user-edit text-[7px]" }),
            ),
        ],
      ),

      // Cuerpo de la fila
      e("div", { key: "row-body", className: "flex-1 min-w-0 flex flex-col justify-between" }, [
        // Nombre + alerta de atención + hora
        e("div", { key: "row-top", className: "flex justify-between items-start gap-2" }, [
          e("div", { key: "name-wrap", className: "truncate flex-1 pr-1" }, [
            e(
              "h4",
              {
                key: "name",
                className:
                  "font-bold text-sm text-gray-900 dark:text-gray-100 truncate leading-snug flex items-center gap-1",
              },
              [
                conversacion.requiereAtencion &&
                  e("i", {
                    key: "atencion",
                    className: "fas fa-exclamation-circle text-amber-500 text-[10px] shrink-0",
                    title: "Requiere atención",
                  }),
                e("span", { key: "name-text", className: "truncate" }, nombre),
                conversacion.bloqueado &&
                  e("i", {
                    key: "bloqueado",
                    className: "fas fa-user-slash text-red-500 text-[11px] shrink-0",
                    title: "Usuario bloqueado",
                  }),
                // LOTE B7b · IG-24 — insignia verificada (`fa-check-circle`),
                // paridad literal con InstagramSidebar.js:347-351. La alimenta
                // `conversacion.perfil.verificado` (adaptador de Instagram).
                estaVerificado &&
                  e("i", {
                    key: "verificado",
                    "data-testid": "ig-verificado",
                    className: "fas fa-check-circle text-sky-500 text-[10px] shrink-0",
                    title: "Cuenta verificada",
                    "aria-label": "Cuenta verificada",
                  }),
                // LOTE B7a · WA-59 — indicador de lead estancado: punto rojo
                // pulsante (paridad EXACTA con ContactCard.js:109-114). El inbox
                // usaba un icono de reloj de arena, que no «late» y es más
                // difícil de ver en la lista.
                conversacion.origen === "anuncio" &&
                  e("i", {
                    key: "origen",
                    className: "fas fa-bullhorn text-purple-500 text-[9px] shrink-0",
                    title: "Vino de un anuncio",
                  }),
              ],
            ),
            canal === "whatsapp" &&
              e(
                "p",
                {
                  key: "usuario",
                  className:
                    "text-[11px] text-gray-400 dark:text-gray-400 font-mono leading-tight mt-0.5 truncate",
                },
                usuarioId,
              ),
            canal !== "whatsapp" &&
              username &&
              e(
                "p",
                {
                  key: "username",
                  className:
                    "text-[11px] text-gray-400 dark:text-gray-400 leading-tight mt-0.5 truncate",
                },
                `@${username}`,
              ),
          ]),
          e(
            "div",
            {
              key: "time",
              className: `text-[10px] shrink-0 flex items-center gap-1.5 font-medium mt-0.5 ${
                noLeidos > 0 ? meta.tiempoNoLeido : "text-gray-400 dark:text-gray-400"
              }`,
            },
            formatHora(ultimo && ultimo.timestamp),
          ),
        ]),

        // Preview del último mensaje
        e(
          "p",
          {
            key: "preview",
            // LOTE B7a · WA-61 — preview con `line-clamp-3` en móvil y
            // `line-clamp-2` en escritorio (paridad con ContactCard.js:126-134).
            className: `text-xs leading-relaxed break-words line-clamp-3 md:line-clamp-2 my-1 ${
              noLeidos > 0
                ? "text-gray-800 dark:text-gray-200 font-semibold"
                : "text-gray-600 dark:text-gray-300 font-normal"
            }`,
            title: preview,
          },
          [prefijoPreview, preview],
        ),

        // Chips inferiores: canal, paso, pedido + contador de no leídos
        e("div", { key: "row-bottom", className: "flex justify-between items-center mt-1 gap-2" }, [
          e("div", { key: "chips", className: "flex items-center gap-1 min-w-0 flex-wrap" }, [
            e(
              "span",
              {
                key: "canal-chip",
                className: `inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md ${meta.chip}`,
                title: `Canal: ${meta.label}`,
              },
              [e("i", { key: "ic", className: `${meta.icono} text-[8px]` }), meta.abrev],
            ),
            conversacion.pasoLabel
              ? e(
                  "span",
                  {
                    key: "paso-chip",
                    className:
                      "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 truncate max-w-[150px]",
                    title: `Estado actual: ${conversacion.pasoLabel}`,
                  },
                  [
                    e("i", { key: "ic", className: "fas fa-tag text-[8px]" }),
                    e("span", { key: "txt", className: "truncate" }, conversacion.pasoLabel),
                  ],
                )
              : null,
            pedido && pedido.tienePedido
              ? e(
                  "span",
                  {
                    key: "pedido-chip",
                    className:
                      "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 truncate max-w-[150px]",
                    title: `Pedido ${pedido.ultimoCorrelativo || ""} · ${pedido.ultimoEstado || ""}`,
                  },
                  [
                    e("i", { key: "ic", className: "fas fa-shopping-bag text-[8px]" }),
                    e(
                      "span",
                      { key: "txt", className: "truncate" },
                      `${pedido.ultimoCorrelativo || "Pedido"} · ${(pedido.ultimoEstado || "").replace(/_/g, " ")}`,
                    ),
                  ],
                )
              : null,
            conversacion.bloqueado
              ? e(
                  "span",
                  {
                    key: "bloqueado-chip",
                    className:
                      "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
                    title: "Conversación marcada por anti-spam",
                  },
                  [e("i", { key: "ic", className: "fas fa-ban text-[8px]" }), "Bloqueado"],
                )
              : null,
          ]),

          noLeidos > 0 &&
            e(
              "span",
              {
                key: "unread-pill",
                // LOTE B7b · IG-29 — la píldora de no leídos usa el color del
                // canal: en Instagram el GRADIENTE oficial (paridad con
                // InstagramSidebar.js:408-418), no el verde uniforme.
                "data-testid": "unread-pill",
                className: `text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center shadow-xs ml-auto shrink-0 ${meta.pill}`,
                title: `${noLeidos} mensaje(s) sin leer`,
                "aria-label": `${noLeidos} no leídos`,
              },
              noLeidos,
            ),
        ]),
      ]),
    ],
  );
};

export default InboxConversationRow;
