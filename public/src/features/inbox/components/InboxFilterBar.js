// public/src/features/inbox/components/InboxFilterBar.js
// Cabecera de filtros de la Col-C del LAYOUT V3 (§6.1 A-02).
//
// En la V3 los CHIPS DE CANAL se movieron al raíl (InboxChannelRail) y NO se
// duplican aquí: el canal activo lo fija el raíl. Este componente conserva el
// buscador, los toggles (no leídos · modo manual · atención · con pedido) y el
// botón de refresco. Todos los filtros son del SERVIDOR: el componente solo
// emite cambios.
import React from "https://cdn.skypack.dev/react";

const e = React.createElement;

const InboxFilterBar = ({
  filtros = {},
  onChange,
  buscar = "",
  onBuscarChange,
  totales = {}, // los contadores por canal viven ahora en el raíl
  totalesNoLeidos = {},
  canalLabel = "Todos",
  loading = false,
  onRefresh,
}) => {
  const emitir = (patch) => {
    if (typeof onChange === "function") onChange(patch);
  };

  const chipClase = (activo, colorActivo) =>
    `px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 cursor-pointer ${
      activo
        ? `${colorActivo} text-white shadow-xs`
        : "bg-gray-200/70 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
    }`;

  return e("div", { className: "space-y-2" }, [
    // Buscador — el placeholder recuerda en qué canal se está buscando
    e("div", { key: "search-wrap", className: "relative" }, [
      e("i", {
        key: "search-icon",
        className:
          "fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-xs",
      }),
      e("input", {
        key: "search-input",
        type: "text",
        value: buscar,
        onChange: (ev) => {
          if (typeof onBuscarChange === "function") onBuscarChange(ev.target.value);
        },
        placeholder:
          canalLabel && canalLabel !== "Todos"
            ? `Buscar en ${canalLabel} (nombre, usuario o mensaje)...`
            : "Buscar por nombre, usuario o mensaje...",
        className:
          "w-full bg-white dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-400 text-xs pl-8 pr-7 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#008069] focus:outline-none transition-all shadow-2xs",
      }),
      buscar
        ? e(
            "button",
            {
              key: "clear-search",
              type: "button",
              onClick: () => {
                if (typeof onBuscarChange === "function") onBuscarChange("");
              },
              className:
                "absolute right-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs p-1",
              title: "Limpiar búsqueda",
              "aria-label": "Limpiar búsqueda",
            },
            e("i", { className: "fas fa-times" }),
          )
        : null,
    ]),

    // Toggles booleanos (§8.5) — todos viajan como query params al servidor
    e("div", { key: "toggle-chips", className: "flex gap-1 overflow-x-auto pb-0.5 scrollbar-none" }, [
      e(
        "button",
        {
          key: "toggle-noleidos",
          type: "button",
          onClick: () => emitir({ noLeidos: !filtros.noLeidos }),
          "aria-pressed": Boolean(filtros.noLeidos),
          title: "Solo conversaciones con mensajes sin leer",
          className: chipClase(Boolean(filtros.noLeidos), "bg-emerald-600"),
        },
        [
          e("i", { key: "ic", className: "fas fa-envelope text-[9px]" }),
          "No leídos",
          Number(totalesNoLeidos.todos) > 0
            ? e(
                "span",
                {
                  key: "n",
                  className: "ml-0.5 bg-emerald-500 text-white text-[9px] px-1.5 rounded-full font-black",
                },
                Number(totalesNoLeidos.todos),
              )
            : null,
        ],
      ),
      e(
        "button",
        {
          key: "toggle-manual",
          type: "button",
          onClick: () => emitir({ modo: filtros.modo === "manual" ? null : "manual" }),
          "aria-pressed": filtros.modo === "manual",
          title: "Solo conversaciones en modo manual (bot pausado)",
          className: chipClase(filtros.modo === "manual", "bg-amber-600"),
        },
        [e("i", { key: "ic", className: "fas fa-user-edit text-[9px]" }), "Modo manual"],
      ),
      e(
        "button",
        {
          key: "toggle-atencion",
          type: "button",
          onClick: () => emitir({ atencion: !filtros.atencion }),
          "aria-pressed": Boolean(filtros.atencion),
          title: "Solo conversaciones que requieren atención (definición única del servidor)",
          className: chipClase(Boolean(filtros.atencion), "bg-blue-600"),
        },
        [e("i", { key: "ic", className: "fas fa-bell text-[9px]" }), "Atención"],
      ),
      e(
        "button",
        {
          key: "toggle-pedido",
          type: "button",
          onClick: () => emitir({ conPedido: !filtros.conPedido }),
          "aria-pressed": Boolean(filtros.conPedido),
          title: "Solo conversaciones con pedido (requiere ?conPedido=true en el backend)",
          className: chipClase(Boolean(filtros.conPedido), "bg-purple-600"),
        },
        [e("i", { key: "ic", className: "fas fa-shopping-bag text-[9px]" }), "Con pedido"],
      ),
      typeof onRefresh === "function"
        ? e(
            "button",
            {
              key: "refresh",
              type: "button",
              onClick: onRefresh,
              title: "Actualizar lista",
              "aria-label": "Actualizar lista",
              className:
                "px-2.5 py-1 rounded-full text-[11px] font-bold transition whitespace-nowrap flex items-center gap-1 cursor-pointer bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 ml-auto",
            },
            e("i", {
              className: `fas fa-sync-alt text-[9px] ${loading ? "fa-spin" : ""}`,
            }),
          )
        : null,
    ]),
  ]);
};

export default InboxFilterBar;
