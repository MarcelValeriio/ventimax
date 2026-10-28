// public/src/features/inbox/components/InboxSidebar.js
// Col-C del LAYOUT V3: cabecera del canal activo + filtros + lista de
// conversaciones de ESE canal. Los chips de canal ya no viven aquí (raíl).
//
// La visibilidad en móvil la controla el wrapper de InboxConsole (raíl + lista
// se ocultan juntos cuando hay conversación abierta), por eso este componente
// ya no lleva la clase `hidden md:flex` propia de la versión de lista única.
import React from "https://cdn.skypack.dev/react";
import InboxFilterBar from "./InboxFilterBar.js?v=7";
import InboxConversationRow from "./InboxConversationRow.js?v=9";
// LOTE B6 — engranaje de «ajustes del canal» (perfil de WhatsApp Business /
// bot global de Instagram) en la cabecera de esta columna.
import InboxChannelSettings from "./InboxChannelSettings.js?v=1";

const e = React.createElement;

// Chip del canal activo: refleja en la cabecera el canal fijado en el raíl.
const CANAL_CHIP = {
  todos: "bg-[#008069]",
  whatsapp: "bg-[#25D366]",
  instagram: "bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4]",
  messenger: "bg-[#0084FF]",
};

// LOTE B7a · WA-43 — descriptor del canal activo.
// Origen legacy: el encabezado de `WhatsAppSidebar.js:162-223` («WhatsApp ·
// Mensajería de WhatsApp Business») y el de `InstagramSidebar.js:64-177`.
// El inbox no cambia su título («Inbox unificado», IN-25) pero ahora rotula
// debajo QUÉ canal se está atendiendo, para que la Col-C no pierda esa
// identificación contextual que sí tenía cada consola.
const DESCRIPTOR_CANAL = {
  todos: "Todos los canales · Inbox unificado",
  whatsapp: "WhatsApp · Mensajería de WhatsApp Business",
  instagram: "Instagram Direct · Mensajería de Meta Direct",
  messenger: "Messenger · Mensajería de Meta Direct",
};

const InboxSidebar = ({
  conversaciones = [],
  claveActiva,
  onSelectContact,
  filtros = {},
  onFiltrosChange,
  buscar = "",
  onBuscarChange,
  canalActivo = "todos",
  canalLabel = "Todos",
  canalIcono = "fas fa-layer-group",
  totales = {},
  totalesNoLeidos = {},
  loading = false,
  error = null,
  onRefresh,
  // LOTE B6 — ajustes a nivel de CANAL (los consume InboxChannelSettings)
  botEnabled = null,
  botCargando = false,
  botCambiando = false,
  onToggleBot,
  onOpenWhatsappProfile,
}) => {
  const totalCanal = Number(totales[canalActivo]) || conversaciones.length;
  const noLeidosCanal = Number(totalesNoLeidos[canalActivo]) || 0;
  const totalNoLeidosGlobal = Number(totalesNoLeidos.todos) || 0;
  // El canal lo fija el raíl: aquí solo cuentan los filtros propios de la Col-C.
  const hayFiltrosActivos =
    Boolean(filtros.noLeidos) ||
    Boolean(filtros.modo) ||
    Boolean(filtros.atencion) ||
    Boolean(filtros.conPedido) ||
    Boolean(buscar);

  const limpiarFiltros = () => {
    if (typeof onFiltrosChange === "function") {
      onFiltrosChange({
        noLeidos: false,
        modo: null,
        atencion: false,
        conPedido: false,
      });
    }
    if (typeof onBuscarChange === "function") onBuscarChange("");
  };

  return e(
    "aside",
    {
      className:
        "w-full md:w-80 lg:w-96 bg-white dark:bg-gray-800 border-r dark:border-gray-700 flex flex-col flex-1 min-h-0 md:flex-none h-full select-none",
    },
    [
      // Cabecera: canal activo + totales + filtros
      e(
        "div",
        {
          key: "sidebar-header",
          className:
            "p-3 sm:p-4 border-b dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/80 space-y-3 shrink-0",
        },
        [
          e("div", { key: "top-row", className: "flex items-center justify-between gap-2" }, [
            e("div", { key: "title-brand", className: "flex items-center gap-2.5 min-w-0" }, [
              e(
                "div",
                {
                  key: "logo-box",
                  className:
                    "w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 via-emerald-600 to-[#0084FF] flex items-center justify-center text-white shadow-sm shrink-0",
                },
                e("i", { className: "fas fa-inbox text-lg" }),
              ),
              e("div", { key: "titles", className: "flex flex-col min-w-0" }, [
                e(
                  "h2",
                  {
                    key: "h2",
                    className:
                      "font-black text-sm text-gray-900 dark:text-white uppercase tracking-tight leading-tight truncate",
                  },
                  "Inbox unificado",
                ),
                // IN-25: total de conversaciones y no leídos del canal activo
                e(
                  "span",
                  {
                    key: "sub",
                    className: "text-[10px] text-gray-500 dark:text-gray-400 font-medium truncate",
                  },
                  `${totalCanal} conversación(es)${
                    noLeidosCanal > 0 ? ` · ${noLeidosCanal} sin leer` : ""
                  }`,
                ),
                // LOTE B7a · WA-43 — descriptor del canal activo (contexto de la
                // Col-C, como el encabezado de cada consola legacy).
                e(
                  "span",
                  {
                    key: "canal-desc",
                    "data-testid": "canal-desc",
                    className: "text-[9px] text-gray-400 dark:text-gray-500 truncate",
                    title: DESCRIPTOR_CANAL[canalActivo] || DESCRIPTOR_CANAL.todos,
                  },
                  DESCRIPTOR_CANAL[canalActivo] || DESCRIPTOR_CANAL.todos,
                ),
              ]),
            ]),
            e("div", { key: "top-actions", className: "flex items-center gap-1.5 shrink-0" }, [
              e(
                "span",
                {
                  key: "canal-chip",
                  className: `inline-flex items-center gap-1 text-[10px] font-bold text-white px-2 py-1 rounded-lg shadow-xs ${
                    CANAL_CHIP[canalActivo] || CANAL_CHIP.todos
                  }`,
                  title: `Canal activo: ${canalLabel} (se cambia en el raíl)`,
                },
                [
                  e("i", { key: "ic", className: `${canalIcono} text-[9px]` }),
                  canalLabel,
                ],
              ),
              totalNoLeidosGlobal > 0
                ? e(
                    "span",
                    {
                      key: "total-unread",
                      className:
                        "px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500 text-white shadow-xs",
                      title: `${totalNoLeidosGlobal} conversación(es) con mensajes sin leer en el inbox`,
                    },
                    totalNoLeidosGlobal,
                  )
                : null,
              // LOTE B6 — engranaje de ajustes del CANAL activo (no de la conversación)
              e(InboxChannelSettings, {
                key: "channel-settings",
                canalActivo,
                canalLabel,
                botEnabled,
                botCargando,
                botCambiando,
                onToggleBot,
                onOpenWhatsappProfile,
              }),
            ]),
          ]),

          e(InboxFilterBar, {
            key: "filter-bar",
            filtros,
            onChange: onFiltrosChange,
            buscar,
            onBuscarChange,
            totales,
            totalesNoLeidos,
            canalLabel,
            loading,
            onRefresh,
          }),
        ],
      ),

      // Lista de conversaciones del canal activo
      e(
        "div",
        { key: "chat-list", className: "flex-1 min-h-0 overflow-y-auto" },
        error
          ? e(
              "div",
              {
                className:
                  "p-6 m-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-xs font-medium flex items-start gap-2",
              },
              [
                e("i", { key: "icon", className: "fas fa-exclamation-triangle mt-0.5" }),
                e("span", { key: "msg" }, error),
              ],
            )
          : conversaciones.length === 0
            ? e(
                "div",
                {
                  className:
                    "p-8 text-center flex flex-col items-center justify-center h-48 text-gray-400 dark:text-gray-500",
                },
                [
                  e("i", { key: "ic", className: "fas fa-search text-3xl mb-2 opacity-30" }),
                  e(
                    "p",
                    {
                      key: "t1",
                      className: "text-xs font-bold text-gray-700 dark:text-gray-300 mb-1",
                    },
                    loading
                      ? "Cargando conversaciones..."
                      : `No se encontraron conversaciones${canalLabel !== "Todos" ? ` en ${canalLabel}` : ""}`,
                  ),
                  e(
                    "p",
                    { key: "t2", className: "text-[11px] text-gray-400 dark:text-gray-400 mb-3" },
                    "Intenta cambiar el filtro o borrar el texto de búsqueda.",
                  ),
                  hayFiltrosActivos
                    ? e(
                        "button",
                        {
                          key: "limpiar",
                          type: "button",
                          onClick: limpiarFiltros,
                          className:
                            "px-3 py-1.5 rounded-lg text-xs font-bold bg-[#008069] hover:bg-emerald-700 text-white transition shadow-xs",
                        },
                        "Limpiar filtros",
                      )
                    : null,
                ],
              )
            : conversaciones.map((conv) =>
                e(InboxConversationRow, {
                  key: conv.clave,
                  conversacion: conv,
                  isActive: claveActiva === conv.clave,
                  onClick: () => typeof onSelectContact === "function" && onSelectContact(conv.clave),
                }),
              ),
      ),
    ],
  );
};

export default InboxSidebar;
