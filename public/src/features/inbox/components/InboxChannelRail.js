// public/src/features/inbox/components/InboxChannelRail.js
// Raíl lateral de canales del Inbox Unificado — LAYOUT V3 (§6.1 A-01).
//
// Sustituye a los chips de canal que vivían en InboxFilterBar: aquí se FIJA el
// canal activo (`Todos · WhatsApp · Instagram · Messenger`). El canal queda fijo
// a propósito, para que más adelante la cabecera del hilo pueda mostrar los
// botones propios de ese canal.
//
// Responsive (mismo criterio que WhatsAppConsole.js:398-416 e
// InstagramConsole.js:168-186): en móvil el raíl no ocupa ancho de pantalla —
// se convierte en una barra horizontal sobre la lista y se oculta junto con
// ella cuando hay una conversación abierta (lo controla InboxConsole).
import React from "https://cdn.skypack.dev/react";

const e = React.createElement;

// IN-31 movido al raíl: una entrada por canal con icono, nombre corto y
// contadores (total + no leídos). Messenger se renderiza SIEMPRE (§8.5).
const CANALES = [
  {
    valor: "todos",
    label: "Todos",
    corto: "Todos",
    icono: "fas fa-layer-group",
    activo: "bg-[#008069] text-white shadow-md shadow-emerald-900/20",
  },
  {
    valor: "whatsapp",
    label: "WhatsApp",
    corto: "WhatsApp",
    icono: "fab fa-whatsapp",
    activo: "bg-[#25D366] text-white shadow-md shadow-emerald-500/20",
  },
  {
    valor: "instagram",
    label: "Instagram",
    corto: "Instagram",
    icono: "fab fa-instagram",
    activo:
      "bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4] text-white shadow-md shadow-pink-500/20",
  },
  {
    valor: "messenger",
    label: "Messenger",
    corto: "Messenger",
    icono: "fab fa-facebook-messenger",
    activo: "bg-[#0084FF] text-white shadow-md shadow-sky-500/20",
  },
];

const InboxChannelRail = ({
  canalActivo = "todos",
  onCanalChange,
  totales = {},
  totalesNoLeidos = {},
  isMuted = false,
  onToggleMute,
}) => {
  const emitir = (valor) => {
    if (typeof onCanalChange === "function") onCanalChange(valor);
  };
  const etiquetaActiva =
    (CANALES.find((c) => c.valor === canalActivo) || {}).label || "Todos";

  const entradas = CANALES.map((c) => {
    const activo = canalActivo === c.valor;
    const total = Number(totales[c.valor]) || 0;
    const sinLeer = Number(totalesNoLeidos[c.valor]) || 0;
    // Messenger deshabilitado solo si no tiene conversaciones y no es el activo.
    const deshabilitado = c.valor === "messenger" && total === 0 && !activo;

    return e(
      "button",
      {
        key: c.valor,
        type: "button",
        onClick: () => {
          if (deshabilitado) return;
          emitir(c.valor);
        },
        disabled: deshabilitado,
        "aria-pressed": activo,
        "aria-label": `${c.label}: ${total} conversación(es), ${sinLeer} sin leer`,
        title: deshabilitado
          ? "Messenger aún no tiene conversaciones (canal en habilitación)"
          : `${c.label}: ${total} conversación(es)${sinLeer > 0 ? ` · ${sinLeer} sin leer` : ""}`,
        className: `relative flex md:flex-col items-center justify-center gap-1 md:gap-0.5 shrink-0 md:w-14 md:h-14 px-2.5 md:px-0 py-1.5 rounded-xl transition-all cursor-pointer active:scale-95 ${
          activo
            ? c.activo
            : "bg-white/70 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
        } ${deshabilitado ? "opacity-40 cursor-not-allowed" : ""}`,
      },
      [
        e("i", {
          key: "icono",
          className: `${c.icono} text-base md:text-lg leading-none`,
        }),
        e(
          "span",
          {
            key: "corto",
            className:
              "text-[9px] md:text-[8px] font-bold leading-none whitespace-nowrap",
          },
          c.corto,
        ),
        e(
          "span",
          {
            key: "total",
            className: `text-[8px] leading-none tabular-nums font-semibold ${
              activo ? "text-white/80" : "text-gray-400 dark:text-gray-500"
            }`,
            title: `${total} conversación(es) en ${c.label}`,
          },
          total,
        ),
        // Contador de no leídos POR CANAL (badge sobre la esquina del icono)
        sinLeer > 0
          ? e(
              "span",
              {
                key: "noLeidos",
                className:
                  "absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 rounded-full bg-emerald-500 text-white text-[9px] font-black flex items-center justify-center ring-2 ring-gray-50 dark:ring-gray-800 shadow-xs",
                title: `${sinLeer} conversación(es) con no leídos en ${c.label}`,
                "aria-hidden": "true",
              },
              sinLeer,
            )
          : null,
      ],
    );
  });

  // IN-26: el mute del inbox vive en el raíl (pie de la columna en desktop,
  // extremo derecho de la barra en móvil).
  if (typeof onToggleMute === "function") {
    entradas.push(
      e(
        "button",
        {
          key: "mute",
          type: "button",
          onClick: onToggleMute,
          "aria-pressed": isMuted,
          "aria-label": isMuted
            ? "Activar sonido del inbox"
            : "Silenciar notificaciones del inbox",
          title: isMuted
            ? "Activar sonido del inbox"
            : "Silenciar notificaciones del inbox (pachi_muted_inbox)",
          className: `ml-auto md:ml-0 md:mt-auto flex items-center justify-center shrink-0 w-9 h-9 md:w-10 md:h-10 rounded-xl transition-all active:scale-95 cursor-pointer ${
            isMuted
              ? "text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20"
              : "text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-gray-700/60"
          }`,
        },
        e("i", {
          className: `fas ${isMuted ? "fa-bell-slash" : "fa-bell"} text-sm`,
        }),
      ),
    );
  }

  return e(
    "nav",
    {
      "aria-label": `Canales del inbox (activo: ${etiquetaActiva})`,
      className:
        "w-full md:w-16 md:h-full shrink-0 bg-gray-50 dark:bg-gray-800/95 border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-700 flex md:flex-col items-stretch md:items-center gap-1 md:gap-1.5 px-1.5 py-1.5 md:py-3 overflow-x-auto md:overflow-x-visible scrollbar-none select-none",
    },
    entradas,
  );
};

export default InboxChannelRail;
