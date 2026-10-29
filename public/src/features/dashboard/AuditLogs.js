import { Icono } from "../../components/Icono.js";
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js";

const e = React.createElement;

const AuditLogs = ({ onBack }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = async (pageNum = 1) => {
    try {
      setLoading(true);
      const { data } = await apiClient.get(
        `/api/admin/audit?page=${pageNum}&limit=50`,
      );
      if (data.success) {
        setLogs(data.data);
        setHasMore(pageNum < data.pagination.pages);
      }
    } catch (error) {
      console.error("Error fetching audit logs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(page);
  }, [page]);

  // Soporte para cerrar modal con tecla ESC
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedLog(null);
      }
    };
    if (selectedLog) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLog]);

  const getActionBadge = (action) => {
    const styles = {
      pago_confirmado: "bg-emerald-100 text-emerald-700",
      cambio_estado: "bg-blue-100 text-blue-700",
      crear_producto: "bg-purple-100 text-purple-700",
      actualizar_producto: "bg-purple-50 text-purple-600",
      eliminar_producto: "bg-red-100 text-red-700",
      crear_categoria: "bg-indigo-100 text-indigo-700",
      actualizar_categoria: "bg-indigo-50 text-indigo-600",
      eliminar_categoria: "bg-red-100 text-red-700",
      crear_usuario: "bg-orange-100 text-orange-700",
      actualizar_usuario: "bg-orange-50 text-orange-600",
      reactivar_bot: "bg-yellow-100 text-yellow-700",
      reset_bot: "bg-red-50 text-red-600",
      default: "bg-gray-100 text-gray-700",
    };
    const style = styles[action] || styles.default;
    return e(
      "span",
      {
        className: `px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${style}`,
      },
      action.replace("_", " "),
    );
  };

  const AuditDetailModal = () => {
    if (!selectedLog) return null;

    return e(
      "div",
      {
        className:
          "fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200",
        onClick: () => setSelectedLog(null),
      },
      e(
        "div",
        {
          className:
            "bg-white dark:bg-gray-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200",
          onClick: (e) => e.stopPropagation(),
        },
        // Header
        e(
          "div",
          {
            className:
              "p-6 border-b dark:border-gray-700 flex justify-between items-start",
          },
          e(
            "div",
            null,
            e(
              "h3",
              {
                className:
                  "text-lg font-black text-gray-800 dark:text-white uppercase tracking-tighter",
              },
              "Detalle del Cambio",
            ),
            e(
              "p",
              { className: "text-xs text-gray-400" },
              new Date(selectedLog.timestamp).toLocaleString(),
            ),
          ),
          e(
            "button",
            {
              onClick: () => setSelectedLog(null),
              className:
                "w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 transition-colors",
            },
            e(Icono, { nombre: "x", className: "text-gray-500" }),
          ),
        ),

        // Body
        e(
          "div",
          { className: "p-6 space-y-6 max-h-[70vh] overflow-auto" },
          e(
            "div",
            { className: "grid grid-cols-2 gap-4" },
            e(
              "div",
              null,
              e(
                "p",
                {
                  className:
                    "text-[10px] font-black text-gray-400 uppercase mb-1",
                },
                "Usuario",
              ),
              e(
                "div",
                { className: "flex items-center gap-2" },
                e(
                  "div",
                  {
                    className:
                      "w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold",
                  },
                  (selectedLog.usuarioNombre || "U").charAt(0),
                ),
                e(
                  "span",
                  {
                    className:
                      "text-sm font-bold text-gray-700 dark:text-gray-200",
                  },
                  selectedLog.usuarioNombre,
                ),
              ),
            ),
            e(
              "div",
              null,
              e(
                "p",
                {
                  className:
                    "text-[10px] font-black text-gray-400 uppercase mb-1",
                },
                "Acción",
              ),
              getActionBadge(selectedLog.accion),
            ),
          ),

          e(
            "div",
            {
              className:
                "p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border dark:border-gray-700",
            },
            e(
              "p",
              {
                className:
                  "text-[10px] font-black text-gray-400 uppercase mb-2",
              },
              "Recurso Afectado",
            ),
            e(
              "div",
              { className: "flex justify-between items-center" },
              e(
                "span",
                {
                  className:
                    "text-sm font-bold text-gray-800 dark:text-white uppercase",
                },
                selectedLog.tipoRecurso,
              ),
              selectedLog.correlativoPedido
                ? e(
                    "span",
                    {
                      className:
                        "px-3 py-1 bg-emerald-500 text-white text-xs font-black rounded-lg",
                    },
                    `#${selectedLog.correlativoPedido}`,
                  )
                : e(
                    "span",
                    { className: "text-xs font-mono text-gray-500" },
                    selectedLog.recursoId,
                  ),
            ),
          ),

          // Comparativa de Estados
          (selectedLog.estadoAnterior || selectedLog.estadoNuevo) &&
            e(
              "div",
              { className: "space-y-3" },
              e(
                "p",
                { className: "text-[10px] font-black text-gray-400 uppercase" },
                "Comparativa de Datos",
              ),
              e(
                "div",
                { className: "grid grid-cols-1 gap-3" },
                e(
                  "div",
                  {
                    className:
                      "p-4 bg-red-50 dark:bg-red-950/10 rounded-xl border border-red-100 dark:border-red-900/30 overflow-hidden",
                  },
                  e(
                    "p",
                    {
                      className:
                        "text-[9px] font-bold text-red-400 uppercase mb-2",
                    },
                    "Antes",
                  ),
                  e(
                    "pre",
                    {
                      className:
                        "text-[11px] text-red-700 dark:text-red-300 whitespace-pre-wrap break-all font-mono bg-white/50 dark:bg-black/20 p-2 rounded-lg",
                    },
                    selectedLog.estadoAnterior || "(vacío)",
                  ),
                ),
                e(
                  "div",
                  {
                    className:
                      "p-4 bg-emerald-50 dark:bg-emerald-950/10 rounded-xl border border-emerald-100 dark:border-emerald-900/30 overflow-hidden",
                  },
                  e(
                    "p",
                    {
                      className:
                        "text-[9px] font-bold text-emerald-400 uppercase mb-2",
                    },
                    "Después",
                  ),
                  e(
                    "pre",
                    {
                      className:
                        "text-[11px] text-emerald-700 dark:text-emerald-400 font-mono whitespace-pre-wrap break-all bg-white/50 dark:bg-black/20 p-2 rounded-lg",
                    },
                    selectedLog.estadoNuevo || "(vacío)",
                  ),
                ),
              ),
            ),

          e(
            "div",
            null,
            e(
              "p",
              {
                className:
                  "text-[10px] font-black text-gray-400 uppercase mb-1",
              },
              "Observaciones / Detalles",
            ),
            e(
              "p",
              {
                className:
                  "text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl italic border-l-4 border-emerald-500",
              },
              selectedLog.detalles || "Sin detalles adicionales",
            ),
          ),
        ),

        e(
          "div",
          { className: "p-4 bg-gray-50 dark:bg-gray-900 flex justify-end" },
          e(
            "button",
            {
              onClick: () => setSelectedLog(null),
              className:
                "px-6 py-2 bg-gray-800 text-white text-xs font-bold rounded-xl hover:bg-black transition-all active:scale-95",
            },
            "Entendido",
          ),
        ),
      ),
    );
  };

  if (loading && logs.length === 0)
    return e("div", { className: "p-10 text-center" }, "Cargando historial...");

  return e(
    "div",
    { className: "p-6 max-w-7xl mx-auto h-full overflow-hidden flex flex-col" },
    e(AuditDetailModal),
    e(
      "div",
      { className: "flex justify-between items-center mb-8" },
      e(
        "div",
        { className: "flex items-center gap-4" },
        [
          onBack && e("button", {
            onClick: onBack,
            className: "w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-emerald-500 transition-all active:scale-90"
          }, e(Icono, { nombre: "arrow-left" })),
          e(
            "div",
            null,
            e(
              "h2",
              {
                className:
                  "text-2xl font-black text-gray-800 dark:text-white uppercase tracking-tighter",
              },
              "Auditoría de Acciones",
            ),
            e(
              "p",
              { className: "text-sm text-gray-400" },
              "Registro completo de movimientos, inventario y cambios de estado",
            ),
          ),
        ]
      ),
      e(
        "button",
        {
          onClick: () => fetchLogs(page),
          className:
            "bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 text-xs",
        },
        e(Icono, { nombre: "refresh-cw" }),
        "Actualizar",
      ),
    ),

    e(
      "div",
      {
        className:
          "flex-1 overflow-auto bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700",
      },
      e(
        "table",
        { className: "w-full text-left border-collapse" },
        e(
          "thead",
          { className: "sticky top-0 bg-gray-50 dark:bg-gray-900 z-10" },
          e(
            "tr",
            null,
            e(
              "th",
              {
                className:
                  "px-6 py-4 text-[10px] font-black uppercase text-gray-400",
              },
              "Fecha",
            ),
            e(
              "th",
              {
                className:
                  "px-6 py-4 text-[10px] font-black uppercase text-gray-400",
              },
              "Usuario",
            ),
            e(
              "th",
              {
                className:
                  "px-6 py-4 text-[10px] font-black uppercase text-gray-400",
              },
              "Acción",
            ),
            e(
              "th",
              {
                className:
                  "hidden md:table-cell px-6 py-4 text-[10px] font-black uppercase text-gray-400",
              },
              "Recurso",
            ),
            e(
              "th",
              {
                className:
                  "hidden lg:table-cell px-6 py-4 text-[10px] font-black uppercase text-gray-400",
              },
              "Cambio",
            ),
          ),
        ),
        e(
          "tbody",
          { className: "divide-y divide-gray-50 dark:divide-gray-700" },
          logs.map((log) =>
            e(
              "tr",
              {
                key: log._id,
                onClick: () => setSelectedLog(log),
                className:
                  "hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer group",
              },
              e(
                "td",
                { className: "px-6 py-4 text-[11px] md:text-xs text-gray-500" },
                new Date(log.timestamp).toLocaleString([], {
                  dateStyle: "short",
                  timeStyle: "short",
                }),
              ),
              e(
                "td",
                { className: "px-6 py-4" },
                e(
                  "div",
                  { className: "flex items-center gap-2" },
                  e(
                    "div",
                    {
                      className:
                        "w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0",
                    },
                    (log.usuarioNombre || "U").charAt(0),
                  ),
                  e(
                    "span",
                    {
                      className:
                        "text-[11px] md:text-xs font-bold text-gray-700 dark:text-gray-200 truncate max-w-[80px] md:max-w-none",
                    },
                    log.usuarioNombre,
                  ),
                ),
              ),
              e("td", { className: "px-6 py-4" }, getActionBadge(log.accion)),
              e(
                "td",
                { className: "hidden md:table-cell px-6 py-4" },
                log.tipoRecurso === "pedido"
                  ? e(
                      "span",
                      { className: "text-xs font-black text-emerald-600" },
                      `${log.correlativoPedido || "---"}`,
                    )
                  : e(
                      "div",
                      { className: "flex flex-col" },
                      e(
                        "span",
                        {
                          className:
                            "text-[10px] font-bold text-gray-400 uppercase",
                        },
                        log.tipoRecurso,
                      ),
                      e(
                        "span",
                        {
                          className: "text-xs text-gray-600 dark:text-gray-300",
                        },
                        log.recursoId || "---",
                      ),
                    ),
              ),
              e(
                "td",
                { className: "hidden lg:table-cell px-6 py-4" },
                (log.estadoAnterior || log.estadoNuevo) &&
                  e(
                    "div",
                    {
                      className:
                        "flex items-center gap-2 text-[10px] font-bold",
                    },
                    e(
                      "span",
                      { className: "text-gray-400 truncate max-w-[100px]" },
                      log.estadoAnterior || "---",
                    ),
                    e(Icono, { nombre: "arrow-right", className: "text-gray-300" }),
                    e(
                      "span",
                      { className: "text-emerald-500 truncate max-w-[100px]" },
                      log.estadoNuevo || "---",
                    ),
                  ),
              ),
            ),
          ),
        ),
      ),
    ),

    e(
      "div",
      {
        className:
          "mt-6 flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl",
      },
      e(
        "button",
        {
          disabled: page === 1,
          onClick: () => setPage((p) => p - 1),
          className:
            "px-4 py-2 text-xs font-bold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-xl shadow-sm border border-gray-300 dark:border-gray-700 disabled:opacity-50",
        },
        "Anterior",
      ),
      e(
        "span",
        {
          className: "text-xs font-black text-gray-400 dark:text-gray-300",
        },
        `Página ${page}`,
      ),
      e(
        "button",
        {
          disabled: !hasMore,
          onClick: () => setPage((p) => p + 1),
          className:
            "px-4 py-2 text-xs font-bold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-xl shadow-sm border border-gray-300 dark:border-gray-700 disabled:opacity-50",
        },
        "Siguiente",
      ),
    ),
  );
};

export default AuditLogs;
