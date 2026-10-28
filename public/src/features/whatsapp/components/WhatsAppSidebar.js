// public/src/features/whatsapp/components/WhatsAppSidebar.js
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import ContactCard from "./ContactCard.js";
const e = React.createElement;

const WhatsAppSidebar = ({
  conversations = {},
  activePhone,
  onSelectContact,
  operationModes = {},
  unreadPerPhone = {},
  onOpenProfileModal,
}) => {
  const [filterTab, setFilterTab] = useState("all"); // "all" | "unread" | "manual" | "pending"
  const [searchQuery, setSearchQuery] = useState("");
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setIsMuted(localStorage.getItem("pachi_muted") === "true");
    
    // Sync with other components modifying the same localStorage key (e.g. WhatsAppHeader)
    const handleStorageChange = (e) => {
      setIsMuted(localStorage.getItem("pachi_muted") === "true");
    };
    window.addEventListener("pachi_mute_toggled", handleStorageChange);
    return () => window.removeEventListener("pachi_mute_toggled", handleStorageChange);
  }, []);

  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    localStorage.setItem("pachi_muted", newState.toString());
    window.dispatchEvent(new Event("pachi_mute_toggled"));
    window.showToast?.(`Notificaciones ${newState ? 'silenciadas' : 'activadas'}`);
  };

  const allPhones = Object.keys(conversations);

  const normalizeDigits = (value) => String(value || "").replace(/\D/g, "");

  // Helper para extraer variantes de teléfono (con/sin prefijo internacional 58, con/sin 0 inicial)
  const getPhoneVariants = (phoneStr) => {
    const clean = normalizeDigits(phoneStr);
    const without58 =
      clean.startsWith("58") && clean.length >= 11 ? clean.slice(2) : clean;
    const without0 = without58.replace(/^0+/, "");
    const with0 = without58.length === 10 ? `0${without58}` : without58;
    return { clean, without58, without0, with0 };
  };

  // Conteo y lógica para las pestañas de atención y pedidos
  const isRequiresAttention = (conv = {}) => {
    const p = (conv.paso || "").toLowerCase();
    const pl = (conv.pasoLabel || "").toLowerCase();
    const etiqueta = (conv.etiqueta || "").toLowerCase();
    const stuck = conv.stuck === true || etiqueta === "estancado";
    const paymentSteps = [
      "pendiente_verificacion",
      "esperando_verificacion",
      "por_verificar",
      "verificando_pago",
      "pendiente_pago",
      "verificando",
      "esperando_comprobante",
      "esperando_pago_metodo",
    ];
    return (
      paymentSteps.includes(p) ||
      stuck ||
      (pl &&
        (pl.includes("pago") ||
          pl.includes("comprobante") ||
          pl.includes("verificar") ||
          pl.includes("estancado")))
    );
  };

  const hasOrder = (conv = {}) => {
    return conv.tienePedido === true || (Number(conv.pedidosCount) || 0) > 0;
  };

  const unreadCountTotal = Object.values(unreadPerPhone).filter(
    (c) => c > 0,
  ).length;
  const manualCountTotal = Object.keys(operationModes).filter(
    (p) => operationModes[p] === "manual",
  ).length;
  const attentionCountTotal = allPhones.filter((p) =>
    isRequiresAttention(conversations[p] || {}),
  ).length;
  const ordersCountTotal = allPhones.filter((p) =>
    hasOrder(conversations[p] || {}),
  ).length;

  // Filtrado de la lista de chats
  const filteredPhones = allPhones.filter((phone) => {
    const conv = conversations[phone] || {};
    const opMode = operationModes[phone] || "automatico";
    const unread = unreadPerPhone[phone] || 0;
    const name = (conv.nombre || "").toLowerCase();
    const phoneVariants = getPhoneVariants(phone);
    const cedulaRaw = (conv.cedula || "").toString().toLowerCase();
    const cedulaDigits = normalizeDigits(conv.cedula);
    const cedulaAlphanumeric = cedulaRaw.replace(/[^a-z0-9]/g, "");

    const searchLower = searchQuery.toLowerCase().trim();
    const searchDigits = normalizeDigits(searchLower);
    const searchWithout0 = searchDigits.replace(/^0+/, "");
    const searchWithout58 =
      searchDigits.startsWith("58") && searchDigits.length >= 11
        ? searchDigits.slice(2)
        : searchDigits;
    const searchWithout58And0 = searchWithout58.replace(/^0+/, "");
    const searchAlphanumeric = searchLower.replace(/[^a-z0-9]/g, "");

    // 1. Criterio de Pestaña
    if (filterTab === "unread" && unread === 0) return false;
    if (filterTab === "manual" && opMode !== "manual") return false;
    if (filterTab === "payment" && !isRequiresAttention(conv)) return false;
    if (filterTab === "orders" && !hasOrder(conv)) return false;

    // 2. Criterio de Búsqueda
    if (searchLower) {
      const matchesPhone = Boolean(
        phone.toLowerCase().includes(searchLower) ||
          (searchDigits &&
            (phoneVariants.clean.includes(searchDigits) ||
              phoneVariants.without58.includes(searchDigits) ||
              phoneVariants.without58.includes(searchWithout0) ||
              phoneVariants.without58.includes(searchWithout58) ||
              phoneVariants.without58.includes(searchWithout58And0) ||
              phoneVariants.with0.includes(searchDigits))),
      );

      const matchesCedula = Boolean(
        conv.cedula &&
          ((cedulaDigits && searchDigits && cedulaDigits.includes(searchDigits)) ||
            (cedulaRaw && cedulaRaw.includes(searchLower)) ||
            (searchAlphanumeric &&
              cedulaAlphanumeric.includes(searchAlphanumeric))),
      );

      const matchesName = name.includes(searchLower);
      const matchesText = (conv.resumen?.text || "")
        .toLowerCase()
        .includes(searchLower);

      if (!matchesPhone && !matchesCedula && !matchesName && !matchesText)
        return false;
    }

    return true;
  });

  // Ordenar por timestamp más reciente
  filteredPhones.sort(
    (a, b) =>
      (conversations[b].resumen?.timestamp || 0) -
      (conversations[a].resumen?.timestamp || 0),
  );

  return e(
    "div",
    {
      className: `w-full md:w-80 lg:w-96 bg-white dark:bg-gray-800 border-r dark:border-gray-700 flex flex-col h-full shrink-0 ${activePhone ? "hidden md:flex" : "flex"}`,
    },
    [
      // Cabecera del Sidebar
      e(
        "div",
        {
          key: "sidebar-header",
          className:
            "p-4 border-b dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/80 space-y-3 shrink-0",
        },
        [
          e(
            "div",
            {
              key: "top-row",
              className: "flex items-center justify-between",
            },
            [
              e(
                "div",
                {
                  key: "title-brand",
                  className: "flex items-center gap-2.5",
                },
                [
                  e(
                    "div",
                    {
                      key: "logo-box",
                      className:
                        "w-8 h-8 rounded-xl bg-gradient-to-tr from-[#25D366] via-[#00A884] to-[#008069] flex items-center justify-center text-white shadow-sm",
                    },
                    e("i", { className: "fab fa-whatsapp text-lg" }),
                  ),
                  e(
                    "div",
                    { key: "titles", className: "flex flex-col" },
                    [
                      e(
                        "h2",
                        {
                          key: "h2",
                          className:
                            "font-black text-sm text-gray-900 dark:text-white uppercase tracking-tight leading-tight",
                        },
                        "WhatsApp",
                      ),
                      e(
                        "span",
                        {
                          key: "sub",
                          className: "text-[10px] text-gray-500 dark:text-gray-400 font-medium",
                        },
                        "Mensajería de WhatsApp Business",
                      ),
                    ],
                  ),
                ],
              ),
              e(
                "div",
                { key: "top-actions", className: "flex items-center gap-1.5" },
                [
                  unreadCountTotal > 0 &&
                    e(
                      "span",
                      {
                        key: "total-unread",
                        className:
                          "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500 text-white shadow-xs",
                        title: `${unreadCountTotal} mensajes sin leer`,
                      },
                      unreadCountTotal,
                    ),
                  e(
                    "button",
                    {
                      key: "profile-btn",
                      onClick: onOpenProfileModal,
                      className:
                        "p-1.5 text-gray-500 hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-gray-700/60 rounded-lg transition-colors active:scale-95 text-xs flex items-center justify-center cursor-pointer",
                      title: "Perfil de WhatsApp Business",
                      "aria-label": "Perfil de WhatsApp Business",
                    },
                    e("i", { className: "fas fa-store text-xs" }),
                  ),
                  e(
                    "button",
                    {
                      key: "mute-btn",
                      onClick: toggleMute,
                      className:
                        `p-1.5 rounded-lg transition-colors active:scale-95 text-xs flex items-center justify-center cursor-pointer ${
                          isMuted 
                            ? "text-red-500 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20" 
                            : "text-gray-500 hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-gray-700/60"
                        }`,
                      title: isMuted ? "Activar sonido" : "Silenciar notificaciones",
                    },
                    e("i", { className: `fas ${isMuted ? "fa-bell-slash" : "fa-bell"} text-xs` }),
                  ),
                  e(
                    "button",
                    {
                      key: "refresh",
                      onClick: () => {
                        window.dispatchEvent(new Event("refreshChatList"));
                      },
                      className:
                        "p-1.5 text-gray-500 hover:text-emerald-600 dark:text-gray-400 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-gray-700/60 rounded-lg transition-colors active:scale-95 text-xs flex items-center justify-center cursor-pointer",
                      title: "Actualizar lista de chats",
                      "aria-label": "Actualizar lista",
                    },
                    e("i", { className: "fas fa-sync-alt text-xs" }),
                  ),
                ],
              ),
            ],
          ),

          // Buscador de chats
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
                placeholder: "Buscar por nombre, teléfono o mensaje...",
                className:
                  "w-full bg-white dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-400 text-xs pl-8 pr-7 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#008069] focus:outline-none transition-all shadow-2xs",
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
                    "aria-label": "Limpiar búsqueda",
                  },
                  e("i", { className: "fas fa-times" }),
                ),
            ],
          ),

          // Barra de Pestañas de Filtro
          e(
            "div",
            { className: "flex gap-1 overflow-x-auto pb-0.5 scrollbar-none" },
            [
              e(
                "button",
                {
                  onClick: () => setFilterTab("all"),
                  "aria-selected": filterTab === "all",
                  className: `px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 ${
                    filterTab === "all"
                      ? "bg-[#008069] text-white shadow-xs"
                      : "bg-gray-200/70 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`,
                },
                "Todos",
              ),

              e(
                "button",
                {
                  onClick: () => setFilterTab("unread"),
                  "aria-selected": filterTab === "unread",
                  className: `px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 ${
                    filterTab === "unread"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "bg-gray-200/70 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`,
                },
                [
                  "No Leídos",
                  unreadCountTotal > 0 &&
                    e(
                      "span",
                      {
                        className:
                          "ml-0.5 bg-emerald-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black",
                      },
                      unreadCountTotal,
                    ),
                ],
              ),

              e(
                "button",
                {
                  onClick: () => setFilterTab("manual"),
                  "aria-selected": filterTab === "manual",
                  className: `px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 ${
                    filterTab === "manual"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-gray-200/70 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`,
                },
                [
                  "Modo Manual",
                  manualCountTotal > 0 &&
                    e(
                      "span",
                      {
                        className:
                          "ml-0.5 bg-amber-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black",
                      },
                      manualCountTotal,
                    ),
                ],
              ),

              e(
                "button",
                {
                  onClick: () => setFilterTab("payment"),
                  "aria-selected": filterTab === "payment",
                  className: `px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 ${
                    filterTab === "payment"
                      ? "bg-blue-600 text-white shadow-xs"
                      : "bg-gray-200/70 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`,
                },
                [
                  "Verificar Pago",
                  attentionCountTotal > 0 &&
                    e(
                      "span",
                      {
                        className:
                          "ml-0.5 bg-blue-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black",
                      },
                      attentionCountTotal,
                    ),
                ],
              ),

              e(
                "button",
                {
                  onClick: () => setFilterTab("orders"),
                  "aria-selected": filterTab === "orders",
                  className: `px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 ${
                    filterTab === "orders"
                      ? "bg-purple-600 text-white shadow-xs"
                      : "bg-gray-200/70 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  }`,
                },
                [
                  "Con Pedido",
                  ordersCountTotal > 0 &&
                    e(
                      "span",
                      {
                        className:
                          "ml-0.5 bg-purple-500 text-white text-[9px] px-1.5 py-0.2 rounded-full font-black",
                      },
                      ordersCountTotal,
                    ),
                ],
              ),
            ],
          ),
        ],
      ),

      // Lista de Conversaciones Filtrada
      e(
        "div",
        { key: "chat-list", className: "flex-1 overflow-y-auto" },
        filteredPhones.length === 0
          ? e(
              "div",
              {
                className:
                  "p-8 text-center flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-500",
              },
              [
                e("i", { className: "fas fa-search text-3xl mb-2 opacity-30" }),
                e(
                  "p",
                  {
                    className:
                      "text-xs font-bold text-gray-700 dark:text-gray-300 mb-1",
                  },
                  "No se encontraron conversaciones",
                ),
                e(
                  "p",
                  {
                    className:
                      "text-[11px] text-gray-400 dark:text-gray-400 mb-3",
                  },
                  "Intenta cambiar el filtro o borrar el texto de búsqueda.",
                ),
                (searchQuery || filterTab !== "all") &&
                  e(
                    "button",
                    {
                      onClick: () => {
                        setSearchQuery("");
                        setFilterTab("all");
                      },
                      className:
                        "px-3 py-1.5 rounded-lg text-xs font-bold bg-[#008069] hover:bg-emerald-700 text-white transition shadow-xs",
                    },
                    "Limpiar filtros",
                  ),
              ],
            )
          : filteredPhones.map((phone) => {
              const conv = conversations[phone] || {};
              const isActive = activePhone === phone;
              return e(ContactCard, {
                key: phone,
                phone,
                nombre: conv.nombre,
                resumen: conv.resumen || {},
                isActive,
                onClick: () => onSelectContact(phone),
                operationMode: operationModes[phone],
                pasoLabel: conv.pasoLabel,
                stuck: conv.stuck,
                unreadCount: unreadPerPhone[phone] || 0,
              });
            }),
      ),
    ],
  );
};

export default WhatsAppSidebar;
