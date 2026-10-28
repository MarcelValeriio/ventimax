/**
 * public/src/features/instagram/components/InstagramCustomerDrawer.js
 * Panel lateral de información y perfil del cliente de Instagram Direct
 */

import React from "https://cdn.skypack.dev/react";
import InstagramAvatar from "./InstagramAvatar.js?v=4";

const e = React.createElement;

const InstagramCustomerDrawer = ({
  isOpen,
  onClose,
  contact,
  onToggleBotMode,
}) => {
  if (!isOpen || !contact) return null;

  const isAutoMode = contact.modo !== "manual";

  return e(
    "aside",
    {
      className:
        "w-full sm:w-80 md:w-88 border-l border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 h-full flex flex-col shadow-xl z-20 shrink-0 animate-in slide-in-from-right-4 duration-200 transition-all select-none overflow-y-auto",
    },
    [
      // Encabezado del Drawer
      e(
        "div",
        {
          key: "drawer-header",
          className:
            "p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50 shrink-0",
        },
        [
          e(
            "div",
            { key: "header-title", className: "flex items-center gap-2" },
            [
              e("i", { className: "fab fa-instagram text-[#E1306C] text-lg" }),
              e(
                "h3",
                { className: "font-bold text-sm text-gray-900 dark:text-white" },
                "Perfil de Instagram",
              ),
            ],
          ),
          e(
            "button",
            {
              key: "close-btn",
              onClick: onClose,
              className:
                "p-1.5 text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
              title: "Cerrar panel",
              "aria-label": "Cerrar",
            },
            e("i", { className: "fas fa-times" }),
          ),
        ],
      ),

      // Cuerpo del Drawer
      e(
        "div",
        { key: "drawer-body", className: "p-6 flex flex-col items-center text-center space-y-5" },
        [
          // Avatar grande con aro IG
          e(InstagramAvatar, {
            key: "drawer-avatar",
            src: contact.avatar,
            username: contact.username,
            name: contact.fullName,
            size: "xl",
            hasStoryRing: true,
            online: contact.online,
            borderClass: "border-4 border-white dark:border-gray-900",
          }),

          // Nombre y Username
          e(
            "div",
            { key: "profile-titles", className: "space-y-1" },
            [
              e(
                "div",
                { className: "flex items-center justify-center gap-1.5" },
                [
                  e(
                    "h4",
                    { className: "font-black text-lg text-gray-900 dark:text-white" },
                    contact.fullName || contact.username,
                  ),
                  contact.verified &&
                    e("i", {
                      className: "fas fa-check-circle text-sky-500 text-sm",
                      title: "Cuenta verificada",
                    }),
                ],
              ),
              e(
                "p",
                { className: "text-sm text-[#E1306C] font-semibold" },
                `@${contact.username}`,
              ),
              contact.followers &&
                e(
                  "p",
                  { className: "text-xs text-gray-500 dark:text-gray-400" },
                  `${contact.followers} seguidores`,
                ),
            ],
          ),

          // Bio del usuario
          contact.bio &&
            e(
              "div",
              {
                key: "bio-box",
                className:
                  "w-full bg-gray-50 dark:bg-gray-800 p-3.5 rounded-xl text-xs text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-gray-700 italic leading-relaxed",
              },
              contact.bio,
            ),

          // Control Individual del Asistente Virtual (Bot)
          e(
            "div",
            {
              key: "bot-control-box",
              className: `w-full p-4 rounded-2xl border transition-all ${
                isAutoMode
                  ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60"
                  : "bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60"
              }`,
            },
            [
              e(
                "div",
                { className: "flex items-center justify-between gap-2 mb-2" },
                [
                  e(
                    "div",
                    { className: "flex items-center gap-2.5 text-left" },
                    [
                      e(
                        "div",
                        {
                          className: `w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-xs ${
                            isAutoMode
                              ? "bg-emerald-500 text-white shadow-emerald-500/20"
                              : "bg-amber-500 text-white shadow-amber-500/20"
                          }`,
                        },
                        e("i", {
                          className: isAutoMode ? "fas fa-robot" : "fas fa-user-tie",
                        }),
                      ),
                      e("div", null, [
                        e(
                          "span",
                          {
                            className: `text-[10px] uppercase font-black tracking-wider block leading-none mb-0.5 ${
                              isAutoMode
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-amber-700 dark:text-amber-300"
                            }`,
                          },
                          "Bot en este chat",
                        ),
                        e(
                          "h5",
                          {
                            className: `text-xs font-black leading-tight ${
                              isAutoMode
                                ? "text-emerald-900 dark:text-emerald-200"
                                : "text-amber-900 dark:text-amber-200"
                            }`,
                          },
                          isAutoMode ? "Automático (Activo)" : "Manual (Pausado)",
                        ),
                      ]),
                    ],
                  ),
                  // Switch interactivo
                  e(
                    "button",
                    {
                      key: "switch-btn",
                      onClick: () => {
                        const next = isAutoMode ? "manual" : "automatico";
                        if (onToggleBotMode) onToggleBotMode(contact.id, next);
                      },
                      className: `relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none shadow-inner active:scale-95 ${
                        isAutoMode
                          ? "bg-emerald-500"
                          : "bg-gray-300 dark:bg-gray-700"
                      }`,
                      title: isAutoMode
                        ? "Pausar bot para este usuario (Modo Manual)"
                        : "Activar bot para este usuario (Modo Automático)",
                      "aria-label": "Alternar modo del bot",
                    },
                    e("span", {
                      className: `pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        isAutoMode ? "translate-x-5" : "translate-x-0"
                      }`,
                    }),
                  ),
                ],
              ),
              e(
                "p",
                {
                  className: `text-[11px] text-left leading-relaxed ${
                    isAutoMode
                      ? "text-emerald-800/80 dark:text-emerald-300/90"
                      : "text-amber-800/80 dark:text-amber-300/90"
                  }`,
                },
                isAutoMode
                  ? "El bot responde dudas, catálogo y FAQs a este contacto automáticamente."
                  : "El bot no responderá a este contacto. La conversación está reservada para atención humana.",
              ),
            ],
          ),

          // Badge de Anuncio si proviene de campaña
          contact.origen === "anuncio" &&
            e(
              "div",
              {
                key: "ad-origin-badge",
                className:
                  "w-full py-2 px-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-xs font-bold flex items-center justify-center gap-2 shadow-2xs",
                title: "Este usuario inició la conversación a través de un anuncio pagado en Instagram",
                "aria-label": "Vino de un anuncio",
              },
              [
                e("i", { className: "fas fa-bullhorn text-purple-600 dark:text-purple-400 text-xs" }),
                e("span", null, "Vino de un anuncio"),
              ],
            ),

          // Métricas y Atributos
          e(
            "div",
            {
              key: "stats-box",
              className: "w-full grid grid-cols-2 gap-3 text-left",
            },
            [
              e(
                "div",
                {
                  key: "stat-channel",
                  className:
                    "p-3 rounded-xl bg-pink-50/50 dark:bg-pink-950/30 border border-pink-100 dark:border-pink-900/40",
                },
                [
                  e(
                    "span",
                    { className: "text-[10px] uppercase font-bold text-pink-600 dark:text-pink-400 block mb-0.5" },
                    "Canal",
                  ),
                  e(
                    "span",
                    { className: "text-xs font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1" },
                    [
                      e("i", { className: "fab fa-instagram text-xs text-[#E1306C]" }),
                      "Direct (Meta)",
                    ],
                  ),
                ],
              ),
              e(
                "div",
                {
                  key: "stat-status",
                  className:
                    "p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700",
                },
                [
                  e(
                    "span",
                    { className: "text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 block mb-0.5" },
                    "Estado",
                  ),
                  e(
                    "span",
                    {
                      className: `text-xs font-semibold flex items-center gap-1.5 ${
                        contact.online
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-600 dark:text-gray-300"
                      }`,
                    },
                    [
                      e("span", {
                        className: `w-2 h-2 rounded-full ${
                          contact.online ? "bg-green-500" : "bg-gray-400"
                        }`,
                      }),
                      contact.online ? "En línea" : contact.lastSeen || "Desconectado",
                    ],
                  ),
                ],
              ),
            ],
          ),

          // Botones de acción
          e(
            "div",
            { key: "actions", className: "w-full space-y-2.5 pt-2" },
            [
              e(
                "a",
                {
                  key: "view-ig-link",
                  href: `https://instagram.com/${contact.username}`,
                  target: "_blank",
                  rel: "noopener noreferrer",
                  className:
                    "w-full py-2.5 px-4 bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] hover:opacity-95 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-98",
                },
                [
                  e("i", { className: "fab fa-instagram" }),
                  "Ver perfil en Instagram",
                ],
              ),
              e(
                "button",
                {
                  key: "mock-order-btn",
                  onClick: () =>
                    window.showToast
                      ? window.showToast("Conversión de chat IG a pedido programada para fase 2", "info")
                      : null,
                  className:
                    "w-full py-2.5 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-bold rounded-xl flex items-center justify-center gap-2 border border-transparent dark:border-gray-700 transition-all active:scale-98",
                },
                [
                  e("i", { className: "fas fa-shopping-bag text-gray-500 dark:text-gray-400" }),
                  "Crear Pedido desde Chat",
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
};

export default InstagramCustomerDrawer;
