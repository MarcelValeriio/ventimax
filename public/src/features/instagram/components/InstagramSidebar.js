/**
 * public/src/features/instagram/components/InstagramSidebar.js
 * Barra lateral de conversaciones de Instagram Direct
 * Lista de contactos con avatares, usernames, badges no leídos y buscador integrado
 */

import React, { useState } from "https://cdn.skypack.dev/react";
import InstagramAvatar from "./InstagramAvatar.js?v=4";

const e = React.createElement;

const formatSidebarTime = (timestamp) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const now = new Date();
  const diffHours = (now - d) / (1000 * 60 * 60);

  if (diffHours < 24 && d.getDate() === now.getDate()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else if (diffHours < 48) {
    return "Ayer";
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const InstagramSidebar = ({
  conversations = [],
  activeId,
  onSelectContact,
  searchQuery = "",
  setSearchQuery,
  botEnabled = true,
  onToggleBot,
  isTogglingBot = false,
}) => {
  const [filterTab, setFilterTab] = useState("all"); // "all" | "unread"

  const totalUnread = conversations.reduce(
    (acc, curr) => acc + (curr.unreadCount || 0),
    0,
  );
  const unreadCountTotal = conversations.filter(
    (c) => (c.unreadCount || 0) > 0,
  ).length;

  const filtered = conversations.filter((c) => {
    if (filterTab === "unread" && (c.unreadCount || 0) === 0) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const nameMatch = (c.fullName || "").toLowerCase().includes(q);
    const userMatch = (c.username || "").toLowerCase().includes(q);
    const textMatch = (c.lastMessage?.text || "").toLowerCase().includes(q);
    return nameMatch || userMatch || textMatch;
  });

  return e(
    "aside",
    {
      className: `${
        activeId ? "hidden md:flex" : "flex"
      } flex-col w-full md:w-80 lg:w-96 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700/80 shrink-0 select-none transition-all`,
    },
    [
      // Header del Sidebar
      e(
        "div",
        {
          key: "header",
          className:
            "p-4 border-b border-gray-200 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/80 space-y-3 shrink-0",
        },
        [
          e(
            "div",
            {
              key: "top-row",
              className: "flex items-center justify-between gap-2",
            },
            [
              e(
                "div",
                {
                  key: "title-brand",
                  className: "flex items-center gap-2.5 min-w-0",
                },
                [
                  e(
                    "div",
                    {
                      key: "logo-box",
                      className:
                        "w-8 h-8 rounded-xl bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4] flex items-center justify-center text-white shadow-sm shrink-0",
                    },
                    e("i", { className: "fab fa-instagram text-lg" }),
                  ),
                  e(
                    "div",
                    { key: "titles", className: "flex flex-col min-w-0" },
                    [
                      e(
                        "h2",
                        {
                          key: "h2",
                          className:
                            "font-black text-sm text-gray-900 dark:text-white uppercase tracking-tight leading-tight truncate",
                        },
                        "Instagram Direct",
                      ),
                      e(
                        "span",
                        {
                          key: "sub",
                          className:
                            "text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate",
                        },
                        "Mensajería de Meta Direct",
                      ),
                    ],
                  ),
                ],
              ),
              e(
                "div",
                { key: "top-actions", className: "flex items-center gap-1.5 shrink-0" },
                [
                  // Switch de Bot Global ON/OFF
                  onToggleBot &&
                    e(
                      "button",
                      {
                        key: "bot-toggle-btn",
                        onClick: onToggleBot,
                        disabled: isTogglingBot,
                        role: "switch",
                        "aria-checked": botEnabled,
                        "aria-label": botEnabled
                          ? "Desactivar bot de Instagram"
                          : "Activar bot de Instagram",
                        title: botEnabled
                          ? "Bot de Instagram ACTIVO (haz clic para pausar)"
                          : "Bot de Instagram PAUSADO (haz clic para activar)",
                        className: `flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                          botEnabled
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                            : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                        } ${isTogglingBot ? "opacity-60 cursor-wait" : ""}`,
                      },
                      [
                        e("i", {
                          key: "bot-icon",
                          className: `fas fa-robot text-[11px] ${
                            botEnabled
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-amber-600 dark:text-amber-400"
                          }`,
                        }),
                        e(
                          "span",
                          { key: "bot-label", className: "text-[11px]" },
                          botEnabled ? "Bot ON" : "Bot OFF",
                        ),
                      ],
                    ),
                  totalUnread > 0 &&
                    e(
                      "span",
                      {
                        key: "total-unread",
                        className:
                          "px-2.5 py-0.5 rounded-full text-xs font-bold bg-pink-500 text-white shadow-xs",
                        title: `${totalUnread} mensajes sin leer`,
                      },
                      totalUnread,
                    ),
                ],
              ),
            ],
          ),

          // Buscador de contactos
          e(
            "div",
            { key: "search-wrap", className: "relative" },
            [
              e("i", {
                key: "search-icon",
                className:
                  "fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs",
              }),
              e("input", {
                key: "search-input",
                type: "text",
                value: searchQuery,
                onChange: (ev) => setSearchQuery(ev.target.value),
                placeholder: "Buscar por nombre, @usuario o mensaje...",
                className:
                  "w-full bg-white dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-400 text-xs pl-8 pr-7 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#E1306C] focus:outline-none transition-all shadow-2xs",
              }),
              searchQuery &&
                e(
                  "button",
                  {
                    key: "clear-search",
                    onClick: () => setSearchQuery(""),
                    className:
                      "absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs p-1",
                    title: "Limpiar búsqueda",
                  },
                  e("i", { className: "fas fa-times" }),
                ),
            ],
          ),

          // Barra de Pestañas de Filtro
          e(
            "div",
            {
              key: "filter-tabs-row",
              className: "flex gap-1 overflow-x-auto pb-0.5 scrollbar-none",
            },
            [
              e(
                "button",
                {
                  key: "tab-all",
                  onClick: () => setFilterTab("all"),
                  "aria-selected": filterTab === "all",
                  className: `px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                    filterTab === "all"
                      ? "bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4] text-white shadow-xs"
                      : "bg-gray-200/70 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`,
                },
                "Todos",
              ),

              e(
                "button",
                {
                  key: "tab-unread",
                  onClick: () => setFilterTab("unread"),
                  "aria-selected": filterTab === "unread",
                  className: `px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                    filterTab === "unread"
                      ? "bg-[#E1306C] text-white shadow-xs"
                      : "bg-gray-200/70 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`,
                },
                [
                  "No Leídos",
                  unreadCountTotal > 0 &&
                    e(
                      "span",
                      {
                        key: "unread-badge",
                        className:
                          "ml-0.5 bg-pink-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black",
                      },
                      unreadCountTotal,
                    ),
                ],
              ),
            ],
          ),
        ],
      ),

      // Lista de Chats
      e(
        "div",
        {
          key: "chat-list",
          className: "flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700/40",
        },
        filtered.length === 0
          ? e(
              "div",
              {
                className:
                  "p-8 text-center text-gray-400 dark:text-gray-500 flex flex-col items-center gap-2",
              },
              [
                e("i", { key: "empty-icon", className: "fab fa-instagram text-3xl opacity-30 mb-1" }),
                e("p", { key: "empty-text", className: "text-xs font-medium" }, "No se encontraron conversaciones"),
              ],
            )
          : filtered.map((contact) => {
              const isActive = activeId === contact.id;
              const hasUnread = (contact.unreadCount || 0) > 0;

              return e(
                "div",
                {
                  key: contact.id,
                  onClick: () => onSelectContact(contact.id),
                  className: `flex items-center gap-3 p-3.5 cursor-pointer transition-all duration-150 ${
                    isActive
                      ? "bg-pink-50/80 dark:bg-pink-950/30 border-r-4 border-[#E1306C]"
                      : "hover:bg-gray-50 dark:hover:bg-gray-700/40"
                  }`,
                },
                [
                  // Avatar con foto real o iniciales sobre gradiente
                  e(InstagramAvatar, {
                    key: "contact-avatar",
                    src: contact.avatar,
                    username: contact.username,
                    name: contact.fullName,
                    size: "md",
                    hasStoryRing: hasUnread,
                    online: contact.online,
                  }),

                  // Info del contacto y preview de mensaje
                  e(
                    "div",
                    { key: "contact-meta", className: "flex-1 min-w-0" },
                    [
                      // Fila superior: Nombre + Fecha
                      e(
                        "div",
                        {
                          key: "top-line",
                          className: "flex items-center justify-between gap-1 mb-0.5",
                        },
                        [
                          e(
                            "div",
                            { key: "name-wrap", className: "flex items-center gap-1 min-w-0" },
                            [
                              e(
                                "h3",
                                {
                                  key: "name",
                                  className: `text-sm font-semibold truncate ${
                                    hasUnread
                                      ? "text-gray-900 dark:text-white font-bold"
                                      : "text-gray-800 dark:text-gray-200"
                                  }`,
                                },
                                contact.fullName ||
                                  (contact.username
                                    ? `@${contact.username}`
                                    : "Usuario de Instagram"),
                              ),
                              contact.verified &&
                                e("i", {
                                  key: "verified",
                                  className: "fas fa-check-circle text-sky-500 text-[10px]",
                                }),
                              contact.origen === "anuncio" &&
                                e("i", {
                                  key: "ad-badge",
                                  className: "fas fa-bullhorn text-purple-500 text-[10px] shrink-0",
                                  title: "Vino de un anuncio",
                                  "aria-label": "Vino de un anuncio",
                                }),
                            ],
                          ),
                          e(
                            "span",
                            {
                              key: "time",
                              className: `text-[11px] shrink-0 ${
                                hasUnread
                                  ? "text-[#E1306C] font-bold"
                                  : "text-gray-400 dark:text-gray-400"
                              }`,
                            },
                            formatSidebarTime(contact.lastMessage?.timestamp),
                          ),
                        ],
                      ),

                      // Fila secundaria: Username + Preview de último mensaje + Badge
                      e(
                        "div",
                        {
                          key: "bottom-line",
                          className: "flex items-center justify-between gap-2",
                        },
                        [
                          e(
                            "div",
                            { key: "msg-preview", className: "flex items-center gap-1 min-w-0 text-xs" },
                            [
                              contact.username &&
                                e(
                                  "span",
                                  { key: "handle", className: "text-[#E1306C] font-medium text-[11px] shrink-0" },
                                  `@${contact.username}:`,
                                ),
                              e(
                                "p",
                                {
                                  key: "preview-text",
                                  className: `truncate ${
                                    hasUnread
                                      ? "text-gray-800 dark:text-gray-200 font-semibold"
                                      : "text-gray-500 dark:text-gray-400"
                                  }`,
                                },
                                contact.lastMessage?.text || "Conversación iniciada",
                              ),
                            ],
                          ),
                          hasUnread &&
                            e(
                              "span",
                              {
                                key: "unread-pill",
                                className:
                                  "w-5 h-5 rounded-full bg-gradient-to-r from-[#E1306C] to-[#833AB4] text-white text-[10px] font-bold flex items-center justify-center shrink-0 shadow-xs",
                              },
                              contact.unreadCount,
                            ),
                        ],
                      ),
                    ],
                  ),
                ],
              );
            }),
      ),
    ],
  );
};

export default InstagramSidebar;
