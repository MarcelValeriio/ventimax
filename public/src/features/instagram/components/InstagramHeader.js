import { Icono } from "../../../components/Icono.js";
/**
 * public/src/features/instagram/components/InstagramHeader.js
 * Encabezado de la conversación de Instagram Direct
 * Gradiente oficial de Instagram, branding y controles de navegación
 */

import React from "https://cdn.skypack.dev/react";
import InstagramAvatar from "./InstagramAvatar.js?v=4";

const e = React.createElement;

const InstagramHeader = ({
  contact,
  onBack,
  onToggleInfo,
  onToggleBotMode,
  isInfoOpen,
}) => {
  if (!contact) return null;

  const isAutoMode = contact.modo !== "manual";

  return e(
    "header",
    {
      className:
        "h-16 px-4 flex items-center justify-between bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-white shadow-md z-10 shrink-0 select-none",
    },
    [
      // Lado Izquierdo: Botón volver (Mobile), Avatar, Datos
      e(
        "div",
        { key: "left", className: "flex items-center gap-3 min-w-0" },
        [
          // Botón Atrás (Sólo móvil)
          e(
            "button",
            {
              key: "back-btn",
              onClick: onBack,
              className:
                "block md:hidden p-2 -ml-1 text-white/90 hover:text-white active:scale-95 transition-transform rounded-full hover:bg-white/10",
              title: "Volver a la lista de chats",
              "aria-label": "Volver",
            },
            e(Icono, { nombre: "arrow-left", className: "text-lg" }),
          ),

          // Avatar con foto real o iniciales sobre gradiente
          e(InstagramAvatar, {
            key: "header-avatar",
            src: contact.avatar,
            username: contact.username,
            name: contact.fullName,
            size: "md",
            online: contact.online,
            borderClass: "border-2 border-white/80",
          }),

          // Nombre y Username
          e(
            "div",
            { key: "info", className: "flex flex-col min-w-0" },
            [
              e(
                "div",
                {
                  key: "name-row",
                  className: "flex items-center gap-1.5 leading-tight truncate",
                },
                [
                  e(
                    "span",
                    {
                      key: "name",
                      className: "font-bold text-sm text-white truncate",
                    },
                    contact.fullName || contact.username,
                  ),
                  contact.verified &&
                    e(Icono, {
                      key: "verified-icon",
                      nombre: "circle-check", className: "text-sky-200 text-xs",
                      titulo: "Cuenta verificada",
                    }),
                ],
              ),
              e(
                "div",
                {
                  key: "meta-row",
                  className: "flex items-center gap-2 text-[11px] text-white/85 truncate",
                },
                [
                  contact.username
                    ? e("span", { key: "handle", className: "font-medium" }, `@${contact.username}`)
                    : e("span", { key: "handle", className: "font-medium opacity-90" }, "Direct"),
                  contact.username && e("span", { key: "dot", className: "opacity-75" }, "•"),
                  e(
                    "span",
                    { key: "channel", className: "flex items-center gap-1 opacity-90 text-[10px]" },
                    [
                      e(Icono, { key: "ig-icon", marca: "instagram", className: "text-[10px]" }),
                      "Instagram",
                    ],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),

      // Lado Derecho: Switch de Modo, Badge de Canal y Botón de Ficha
      e(
        "div",
        { key: "right", className: "flex items-center gap-2 shrink-0" },
        [
          // Botón rápido interactivo de Modo del Bot (Automático / Manual)
          e(
            "button",
            {
              key: "mode-toggle-btn",
              onClick: () => {
                const next = isAutoMode ? "manual" : "automatico";
                if (onToggleBotMode) onToggleBotMode(contact.id, next);
              },
              className: `hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-xs active:scale-95 border cursor-pointer ${
                isAutoMode
                  ? "bg-emerald-500/30 hover:bg-emerald-500/40 text-emerald-100 border-emerald-400/40"
                  : "bg-amber-500/35 hover:bg-amber-500/45 text-amber-100 border-amber-400/40"
              }`,
              title: isAutoMode
                ? "Bot Activo: Clic para pausar y pasar a Modo Manual"
                : "Modo Manual: Clic para activar Bot Automático",
            },
            [
              e(Icono, { nombre: isAutoMode ? "bot" : "user-round", className: "text-xs" }),
              e("span", null, isAutoMode ? "Bot Activo" : "Modo Manual"),
            ],
          ),

          // Badge visual de canal Instagram
          e(
            "div",
            {
              key: "channel-badge",
              className:
                "hidden md:flex items-center gap-1.5 bg-black/20 backdrop-blur-md px-2.5 py-1 rounded-full text-xs text-white/90 font-semibold border border-white/15",
            },
            [
              e(Icono, { key: "ig-brand", marca: "instagram", className: "text-sm" }),
              e("span", { key: "ig-text" }, "Direct"),
            ],
          ),

          // Botón Ficha del Contacto
          e(
            "button",
            {
              key: "info-btn",
              onClick: onToggleInfo,
              className: `w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                isInfoOpen
                  ? "bg-white text-[#E1306C] shadow-md scale-105"
                  : "bg-white/20 text-white hover:bg-white/30 active:scale-95"
              }`,
              title: isInfoOpen ? "Ocultar información del perfil" : "Ver información del perfil",
              "aria-label": "Información del perfil de Instagram",
            },
            e(Icono, { nombre: "info" }),
          ),
        ],
      ),
    ],
  );
};

export default InstagramHeader;
