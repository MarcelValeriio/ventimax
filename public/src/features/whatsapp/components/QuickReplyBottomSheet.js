import { Icono } from "../../../components/Icono.js";
// public/src/features/whatsapp/components/QuickReplyBottomSheet.js
import React, { useState, useEffect, useRef } from "https://cdn.skypack.dev/react";
const e = React.createElement;

/**
 * QuickReplyBottomSheet — Panel inferior (bottom sheet / modal) de respuestas rápidas con tarjetas compactas.
 * 
 * - Tarjetas Compactas: Altura estable (min-h-[64px] sm:min-h-[70px]), padding reducido (p-2.5 sm:p-3), truncamiento a 2-3 líneas (line-clamp-2 sm:line-clamp-3).
 * - Tema: Soporte completo para Modo Claro (bg-white) y Modo Oscuro (dark:bg-gray-900 / dark:text-gray-100).
 * - Lista vertical scrollable sin desbordamientos.
 * - Buscador local en tiempo real (sin peticiones HTTP adicionales).
 * - Filtro por categorías y favoritas.
 * - Orden: Favoritas primero, respetando orden manual para el resto.
 * - Cierre con botón, tecla Escape y clic en backdrop.
 * - Iconografía estricta con Lucide (sin emojis decorativos en controles).
 * - Accesibilidad: role="dialog", aria-modal="true", aria-label="Respuestas rápidas".
 */
const QuickReplyBottomSheet = ({
  isOpen,
  onClose,
  replies = [],
  onSelectReply,
  channelName = "WhatsApp",
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all"); // "all" | "favorites" | category_name
  const searchInputRef = useRef(null);
  const sheetRef = useRef(null);

  // Manejo de eventos de teclado (Escape) y bloqueo de scroll
  useEffect(() => {
    if (!isOpen) return;

    // Resetear filtros al abrir
    setSearchQuery("");
    setSelectedCategory("all");

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Foco en el buscador al abrir
    const timer = setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 60);

    const handleKeyDown = (ev) => {
      if (ev.key === "Escape" || ev.keyCode === 27) {
        ev.preventDefault();
        ev.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Extraer categorías únicas de las respuestas cargadas
  const rawCategories = Array.from(new Set(replies.map((r) => r.category || "general")));
  const hasFavorites = replies.some((r) => r.isFavorite);

  // Filtrado 100% local en memoria
  const filteredReplies = replies.filter((reply) => {
    if (selectedCategory === "favorites" && !reply.isFavorite) return false;
    if (
      selectedCategory !== "all" &&
      selectedCategory !== "favorites" &&
      (reply.category || "general") !== selectedCategory
    ) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchText = (reply.text || "").toLowerCase().includes(q);
      const matchCat = (reply.category || "").toLowerCase().includes(q);
      if (!matchText && !matchCat) return false;
    }
    return true;
  });

  // Ordenar: Favoritas primero, luego orden manual
  filteredReplies.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return (a.order || 0) - (b.order || 0);
  });

  return e(
    "div",
    {
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Respuestas rápidas",
      tabIndex: -1,
      className:
        "fixed inset-0 z-[110] bg-black/60 dark:bg-black/80 backdrop-blur-xs flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 select-none animate-fadeIn",
      onClick: (ev) => {
        if (ev.target === ev.currentTarget) {
          onClose();
        }
      },
    },
    [
      e(
        "div",
        {
          key: "sheet-container",
          ref: sheetRef,
          className:
            "w-full max-w-xl bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh] sm:max-h-[80vh] overflow-hidden border border-gray-200 dark:border-gray-800 animate-slideUp text-gray-900 dark:text-gray-100",
          onClick: (ev) => ev.stopPropagation(),
        },
        [
          // Indicador superior táctil (solo móvil)
          e("div", {
            key: "drag-handle",
            className:
              "w-10 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mt-2.5 mb-1 sm:hidden shrink-0",
          }),

          // Encabezado del Bottom Sheet
          e(
            "div",
            {
              key: "sheet-header",
              className:
                "p-3 sm:p-3.5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-3 shrink-0 bg-white dark:bg-gray-900",
            },
            [
              e("div", { className: "flex items-center gap-2.5" }, [
                e("div", {
                  className:
                    "w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-[#008069] dark:text-emerald-400 flex items-center justify-center font-bold text-xs sm:text-sm border border-emerald-200 dark:border-emerald-800/50",
                }, [
                  e(Icono, { nombre: "zap", "aria-hidden": "true" }),
                ]),
                e("div", null, [
                  e(
                    "h3",
                    {
                      className:
                        "text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100 leading-tight",
                    },
                    "Respuestas Rápidas",
                  ),
                  e(
                    "p",
                    { className: "text-[11px] text-gray-500 dark:text-gray-400" },
                    `${filteredReplies.length} disponibles`,
                  ),
                ]),
              ]),

              // Botón visible de cerrar
              e(
                "button",
                {
                  type: "button",
                  onClick: onClose,
                  "aria-label": "Cerrar respuestas rápidas",
                  className:
                    "w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center transition cursor-pointer text-xs sm:text-sm border border-transparent dark:border-gray-700 focus:ring-2 focus:ring-[#008069]",
                  title: "Cerrar (Escape)",
                },
                e(Icono, { nombre: "x", "aria-hidden": "true" }),
              ),
            ],
          ),

          // Buscador local en tiempo real
          e(
            "div",
            {
              key: "sheet-search",
              className:
                "p-2.5 sm:p-3 pb-2 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900",
            },
            [
              e("div", { className: "relative flex items-center" }, [
                e(Icono, {
                  nombre: "search", className: "absolute left-3 text-gray-400 dark:text-gray-500 text-xs pointer-events-none",
                  "aria-hidden": "true",
                }),
                e("input", {
                  ref: searchInputRef,
                  type: "text",
                  value: searchQuery,
                  onChange: (ev) => setSearchQuery(ev.target.value),
                  placeholder: "Buscar por palabra clave o categoría...",
                  "aria-label": "Buscar plantilla de respuesta",
                  className:
                    "w-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs sm:text-sm pl-8 pr-8 py-1.5 sm:py-2 rounded-xl outline-none focus:border-[#008069] dark:focus:border-emerald-500 focus:ring-1 focus:ring-[#008069] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 transition",
                }),
                searchQuery &&
                  e(
                    "button",
                    {
                      type: "button",
                      onClick: () => setSearchQuery(""),
                      "aria-label": "Limpiar búsqueda",
                      className:
                        "absolute right-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 text-xs cursor-pointer",
                    },
                    e(Icono, { nombre: "circle-x", "aria-hidden": "true" }),
                  ),
              ]),
            ],
          ),

          // Filtros de categoría como chips horizontales
          e(
            "div",
            {
              key: "sheet-categories",
              className:
                "flex items-center gap-1.5 overflow-x-auto scrollbar-none px-2.5 sm:px-3 py-1.5 sm:py-2 border-b border-gray-100 dark:border-gray-800 shrink-0 bg-white dark:bg-gray-900",
            },
            [
              e(
                "button",
                {
                  key: "cat-all",
                  type: "button",
                  onClick: () => setSelectedCategory("all"),
                  "aria-selected": selectedCategory === "all",
                  className: `px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-semibold transition shrink-0 cursor-pointer ${
                    selectedCategory === "all"
                      ? "bg-[#008069] text-white shadow-xs"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent dark:border-gray-700"
                  }`,
                },
                "Todas",
              ),

              hasFavorites &&
                e(
                  "button",
                  {
                    key: "cat-favorites",
                    type: "button",
                    onClick: () => setSelectedCategory("favorites"),
                    "aria-selected": selectedCategory === "favorites",
                    className: `px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-semibold transition shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      selectedCategory === "favorites"
                        ? "bg-amber-500 text-white shadow-xs"
                        : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-900/50"
                    }`,
                  },
                  [
                    e(Icono, { nombre: "star", className: "text-[10px]", "aria-hidden": "true" }),
                    e("span", null, "Favoritas"),
                  ],
                ),

              ...rawCategories.map((cat) =>
                e(
                  "button",
                  {
                    key: `cat-${cat}`,
                    type: "button",
                    onClick: () => setSelectedCategory(cat),
                    "aria-selected": selectedCategory === cat,
                    className: `px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full text-xs font-semibold capitalize transition shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? "bg-[#008069] text-white shadow-xs"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 border border-transparent dark:border-gray-700"
                    }`,
                  },
                  cat,
                ),
              ),
            ],
          ),

          // Lista Vertical de Respuestas Rápidas (Tarjetas Compactas con altura estable)
          e(
            "div",
            {
              key: "sheet-list",
              className:
                "flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2 bg-gray-50/50 dark:bg-gray-900/50 divide-y divide-gray-100 dark:divide-gray-800",
            },
            filteredReplies.length === 0
              ? e(
                  "div",
                  {
                    className:
                      "flex flex-col items-center justify-center p-8 text-center text-gray-400 dark:text-gray-500 gap-2",
                  },
                  [
                    e(Icono, {
                      nombre: "message-circle-off", className: "text-3xl text-gray-300 dark:text-gray-600",
                      "aria-hidden": "true",
                    }),
                    e(
                      "p",
                      { className: "text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400" },
                      "No se encontraron respuestas para este filtro.",
                    ),
                    (searchQuery || selectedCategory !== "all") &&
                      e(
                        "button",
                        {
                          type: "button",
                          onClick: () => {
                            setSearchQuery("");
                            setSelectedCategory("all");
                          },
                          className:
                            "mt-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-[#008069] dark:text-emerald-400 text-xs font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 border border-gray-200 dark:border-gray-700",
                        },
                        [
                          e(Icono, { nombre: "undo-2", className: "text-[10px]", "aria-hidden": "true" }),
                          e("span", null, "Restablecer filtros"),
                        ],
                      ),
                  ],
                )
              : filteredReplies.map((reply, idx) => {
                  const hasTokens = /\{(nombre|totalUSD|totalBS|total|items|menu)\}/.test(
                    reply.text || "",
                  );
                  return e(
                    "button",
                    {
                      key: reply._id || idx,
                      type: "button",
                      onClick: () => onSelectReply(reply),
                      title: reply.text,
                      "aria-label": `Seleccionar respuesta: ${reply.text}`,
                      className:
                        "w-full text-left p-2.5 sm:p-3 rounded-xl bg-white dark:bg-gray-800 hover:bg-emerald-50/70 dark:hover:bg-gray-750 border border-gray-200/90 dark:border-gray-700/80 hover:border-[#008069] dark:hover:border-emerald-500 transition-all flex flex-col justify-between gap-1.5 group cursor-pointer active:scale-[0.99] shadow-2xs min-h-[64px] sm:min-h-[70px] select-none",
                    },
                    [
                      // Metadata superior compacta (Categoría, Favorita, Tipo de Envío)
                      e("div", { className: "flex items-center justify-between gap-2 w-full shrink-0" }, [
                        e("div", { className: "flex items-center gap-1.5" }, [
                          e(
                            "span",
                            {
                              className:
                                "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200/60 dark:border-gray-600/50",
                            },
                            reply.category || "general",
                          ),
                          reply.isFavorite &&
                            e(
                              "span",
                              {
                                className:
                                  "text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800/60",
                              },
                              [
                                e(Icono, { nombre: "star", className: "text-[9px]", "aria-hidden": "true" }),
                                e("span", null, "Favorita"),
                              ],
                            ),
                        ]),

                        // Badge indicando si es editable (tokens) o envío directo
                        hasTokens
                          ? e(
                              "span",
                              {
                                className:
                                  "text-[10px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 shrink-0",
                                title: "Carga el mensaje en el input para completarlo antes de enviar",
                              },
                              [
                                e(Icono, { nombre: "square-pen", className: "text-[9px]", "aria-hidden": "true" }),
                                e("span", null, "Completar"),
                              ],
                            )
                          : e(
                              "span",
                              {
                                className:
                                  "text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 shrink-0",
                                title: `Envío directo a ${channelName}`,
                              },
                              [
                                e(Icono, {
                                  nombre: "send", className: "text-[9px]",
                                  "aria-hidden": "true",
                                }),
                                e("span", null, "Envío directo"),
                              ],
                            ),
                      ]),

                      // Texto de la respuesta truncado a 2-3 líneas para mantener tarjeta compacta
                      e(
                        "p",
                        {
                          className:
                            "text-xs sm:text-[13px] text-gray-800 dark:text-gray-100 font-normal leading-snug break-words line-clamp-2 sm:line-clamp-3",
                        },
                        reply.text,
                      ),
                    ],
                  );
                }),
          ),
        ],
      ),
    ],
  );
};

export default QuickReplyBottomSheet;
