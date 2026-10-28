// public/src/features/whatsapp/components/ContactCard.js
import React from "https://cdn.skypack.dev/react";
const e = React.createElement;

/**
 * ContactCard — Tarjeta de contacto en la lista de chats con diseño responsive optimizado.
 * 
 * - Mobile: Densidad mejorada con altura visual mínima de 3 líneas (line-clamp-3) para facilitar lectura.
 * - Desktop: Presentación compacta y equilibrada (line-clamp-2 md:line-clamp-1/2).
 * - Accesibilidad: Jerarquía visual clara, metadatos no superpuestos, iconografía Font Awesome.
 */
const ContactCard = ({
  phone,
  nombre,
  resumen = {},
  isActive,
  onClick,
  operationMode,
  pasoLabel,
  stuck,
  unreadCount = 0,
}) => {
  const displayName = nombre && nombre.trim() ? nombre.trim() : phone;
  const messageText = resumen?.text || "(Sin mensajes aún)";

  return e(
    "div",
    {
      onClick,
      role: "button",
      tabIndex: 0,
      onKeyDown: (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onClick && onClick();
        }
      },
      "aria-label": `Chat con ${displayName}. Último mensaje: ${messageText}`,
      className: `p-3 sm:p-2.5 border-b border-gray-100 dark:border-gray-700/80 cursor-pointer transition flex items-start gap-3 min-h-[5.25rem] sm:min-h-[4.25rem] select-none ${
        stuck
          ? isActive
            ? "bg-red-50/80 dark:bg-red-950/30 border-l-4 border-l-red-600 shadow-2xs"
            : "border-l-4 border-l-red-500 bg-red-50/40 dark:bg-red-900/10 animate-pulse hover:bg-red-100/50 dark:hover:bg-red-900/30"
          : isActive
            ? "bg-emerald-50/80 dark:bg-emerald-950/30 border-l-4 border-l-emerald-500 shadow-2xs"
            : "hover:bg-gray-50/90 dark:hover:bg-gray-700/50 active:bg-gray-100 dark:active:bg-gray-700"
      }`,
    },
    [
      // Avatar con indicador de Modo Manual
      e(
        "div",
        {
          className:
            "w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden shrink-0 relative self-start mt-0.5 shadow-2xs",
        },
        [
          e("img", {
            src: `https://api.dicebear.com/7.x/avataaars/svg?seed=${phone}`,
            alt: `Avatar de ${displayName}`,
            className: "w-full h-full object-cover",
            loading: "lazy",
          }),
          operationMode === "manual" &&
            e(
              "span",
              {
                className:
                  "absolute -top-0.5 -right-0.5 bg-amber-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center font-black shadow-xs ring-2 ring-white dark:ring-gray-800",
                title: "Modo Manual activado",
                "aria-label": "Modo Manual",
              },
              [
                e("i", { className: "fas fa-user-edit text-[7px]", "aria-hidden": "true" }),
              ],
            ),
        ],
      ),

      // Contenido Principal (Nombre, Fecha, Resumen de 3 líneas y Footer)
      e("div", { className: "flex-1 min-w-0 flex flex-col justify-between" }, [
        // Fila Superior: Nombre y Hora
        e("div", { className: "flex justify-between items-start gap-2" }, [
          e("div", { className: "truncate flex-1 pr-1" }, [
            e(
              "h4",
              {
                className:
                  "font-bold text-sm text-gray-900 dark:text-gray-100 truncate leading-snug",
              },
              displayName,
            ),
            nombre &&
              nombre.trim() &&
              e(
                "p",
                {
                  className:
                    "text-[11px] text-gray-400 dark:text-gray-400 font-mono leading-tight mt-0.5",
                },
                phone,
              ),
          ]),

          // Hora e indicador de estancado
          e(
            "div",
            {
              className:
                "text-[10px] text-gray-400 dark:text-gray-400 shrink-0 flex items-center gap-1.5 font-medium mt-0.5",
            },
            [
              stuck && null,
              resumen?.timestamp
                ? new Date(resumen.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : null,
            ],
          ),
        ]),

        // Resumen del Mensaje (Hasta 3 líneas en Mobile para facilitar lectura, 2 en Desktop)
        e(
          "p",
          {
            className:
              "text-xs text-gray-600 dark:text-gray-300 leading-relaxed break-words line-clamp-3 md:line-clamp-2 my-1 font-normal",
            title: messageText,
          },
          messageText,
        ),

        // Fila Inferior: Paso del Embudo y Contador de No Leídos
        e("div", { className: "flex justify-between items-center mt-1 gap-2" }, [
          pasoLabel
            ? e(
                "span",
                {
                  className:
                    "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 truncate max-w-[170px]",
                  title: `Estado actual: ${pasoLabel}`,
                },
                [
                  e("i", { className: "fas fa-tag text-[8px]", "aria-hidden": "true" }),
                  e("span", { className: "truncate" }, pasoLabel),
                ],
              )
            : e("span"),

          unreadCount > 0 &&
            e(
              "span",
              {
                className:
                  "bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center shadow-xs ml-auto shrink-0",
                title: `${unreadCount} mensaje(s) sin leer`,
                "aria-label": `${unreadCount} no leídos`,
              },
              unreadCount,
            ),
        ]),
      ]),
    ],
  );
};

export default ContactCard;