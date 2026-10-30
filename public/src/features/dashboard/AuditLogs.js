import { Icono } from "../../components/Icono.js";
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js";
import { infoArea, tituloAccion } from "./components/auditoriaMapas.js";
import {
  AuditSeccionAccion,
  AuditTarjetaArea,
  Cargando,
  EstadoError,
  SinRegistros,
} from "./components/AuditRegistros.js";

const e = React.createElement;

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
    (action || "").replace("_", " "),
  );
};

/** Modal con el detalle de un cambio (el mismo de siempre, ahora fuera del componente principal). */
const DetalleCambio = ({ log, onCerrar }) =>
  e(
    "div",
    {
      className:
        "fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200",
      onClick: onCerrar,
    },
    e(
      "div",
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "audit-detalle-titulo",
        className:
          "bg-white dark:bg-gray-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200",
        onClick: (evento) => evento.stopPropagation(),
      },
      // Header
      e(
        "div",
        { className: "p-6 border-b dark:border-gray-700 flex justify-between items-start" },
        e(
          "div",
          null,
          e(
            "h3",
            {
              id: "audit-detalle-titulo",
              className:
                "text-lg font-black text-gray-800 dark:text-white uppercase tracking-tighter",
            },
            "Detalle del Cambio",
          ),
          e(
            "p",
            { className: "text-xs text-gray-400" },
            new Date(log.timestamp).toLocaleString(),
          ),
        ),
        e(
          "button",
          {
            type: "button",
            onClick: onCerrar,
            "aria-label": "Cerrar detalle",
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
              { className: "text-[10px] font-black text-gray-400 uppercase mb-1" },
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
                (log.usuarioNombre || "U").charAt(0),
              ),
              e(
                "span",
                { className: "text-sm font-bold text-gray-700 dark:text-gray-200" },
                log.usuarioNombre,
              ),
            ),
          ),
          e(
            "div",
            null,
            e(
              "p",
              { className: "text-[10px] font-black text-gray-400 uppercase mb-1" },
              "Acción",
            ),
            getActionBadge(log.accion),
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
            { className: "text-[10px] font-black text-gray-400 uppercase mb-2" },
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
              log.tipoRecurso,
            ),
            log.correlativoPedido
              ? e(
                  "span",
                  {
                    className:
                      "px-3 py-1 bg-emerald-500 text-white text-xs font-black rounded-lg",
                  },
                  `#${log.correlativoPedido}`,
                )
              : e(
                  "span",
                  { className: "text-xs font-mono text-gray-500" },
                  log.recursoId,
                ),
          ),
        ),

        // Comparativa de Estados
        (log.estadoAnterior || log.estadoNuevo) &&
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
                  { className: "text-[9px] font-bold text-red-400 uppercase mb-2" },
                  "Antes",
                ),
                e(
                  "pre",
                  {
                    className:
                      "text-[11px] text-red-700 dark:text-red-300 whitespace-pre-wrap break-all font-mono bg-white/50 dark:bg-black/20 p-2 rounded-lg",
                  },
                  log.estadoAnterior || "(vacío)",
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
                  { className: "text-[9px] font-bold text-emerald-400 uppercase mb-2" },
                  "Después",
                ),
                e(
                  "pre",
                  {
                    className:
                      "text-[11px] text-emerald-700 dark:text-emerald-400 font-mono whitespace-pre-wrap break-all bg-white/50 dark:bg-black/20 p-2 rounded-lg",
                  },
                  log.estadoNuevo || "(vacío)",
                ),
              ),
            ),
          ),

        e(
          "div",
          null,
          e(
            "p",
            { className: "text-[10px] font-black text-gray-400 uppercase mb-1" },
            "Observaciones / Detalles",
          ),
          e(
            "p",
            {
              className:
                "text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 p-4 rounded-2xl italic border-l-4 border-emerald-500",
            },
            log.detalles || "Sin detalles adicionales",
          ),
        ),
      ),

      e(
        "div",
        { className: "p-4 bg-gray-50 dark:bg-gray-900 flex justify-end" },
        e(
          "button",
          {
            type: "button",
            onClick: onCerrar,
            className:
              "px-6 py-2 bg-gray-800 text-white text-xs font-bold rounded-xl hover:bg-black transition-all active:scale-95",
          },
          "Entendido",
        ),
      ),
    ),
  );

const AuditLogs = ({ onBack }) => {
  // Resumen por área y acción (GET /api/admin/audit/resumen)
  const [resumen, setResumen] = useState({ cargando: true, error: false, datos: null });
  // null = vista Todo; si no, el tipoRecurso del área abierta
  const [areaActiva, setAreaActiva] = useState(null);
  // Sube con cada "Actualizar" para que las secciones y tarjetas vuelvan a pedir sus registros
  const [recarga, setRecarga] = useState(0);
  const [selectedLog, setSelectedLog] = useState(null);

  const cargarResumen = async () => {
    setResumen((previo) => ({ ...previo, cargando: true, error: false }));
    try {
      const { data } = await apiClient.get("/api/admin/audit/resumen");
      if (!data || !data.success) throw new Error("Respuesta de resumen inválida");
      setResumen({ cargando: false, error: false, datos: data.data });
    } catch (error) {
      console.error("Error fetching audit summary:", error);
      setResumen({ cargando: false, error: true, datos: null });
    }
  };

  useEffect(() => {
    cargarResumen();
  }, []);

  // Soporte para cerrar modal con tecla ESC
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setSelectedLog(null);
    };
    if (selectedLog) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedLog]);

  const actualizar = () => {
    cargarResumen();
    setRecarga((n) => n + 1);
  };

  const cabecera = () =>
    e(
      "div",
      { className: "flex flex-wrap justify-between items-center gap-4" },
      e(
        "div",
        { className: "flex items-center gap-4" },
        onBack &&
          e(
            "button",
            {
              type: "button",
              onClick: onBack,
              "aria-label": "Volver",
              className:
                "w-10 h-10 rounded-full bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-center text-gray-400 hover:text-emerald-500 transition-all active:scale-90",
            },
            e(Icono, { nombre: "arrow-left" }),
          ),
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
            "Registro de movimientos, inventario y cambios de estado, por área",
          ),
        ),
      ),
      e(
        "button",
        {
          type: "button",
          onClick: actualizar,
          disabled: resumen.cargando,
          className:
            "bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 text-xs disabled:opacity-60",
        },
        e(Icono, { nombre: "refresh-cw", girar: resumen.cargando && !!resumen.datos }),
        "Actualizar",
      ),
    );

  const pastillas = (datos) => {
    const opciones = [
      { id: null, nombre: "Todo", total: datos.total, icono: "layers" },
      ...datos.areas.map((area) => {
        const info = infoArea(area.tipoRecurso);
        return { id: area.tipoRecurso, nombre: info.nombre, total: area.total, icono: info.icono };
      }),
    ];
    return e(
      "div",
      { role: "group", "aria-label": "Filtrar por área", className: "flex gap-2 overflow-x-auto pb-2" },
      opciones.map((opcion) => {
        const activa = areaActiva === opcion.id;
        return e(
          "button",
          {
            key: opcion.id || "todo",
            type: "button",
            "aria-pressed": activa ? "true" : "false",
            onClick: () => setAreaActiva(opcion.id),
            className: `shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border transition-all ${
              activa
                ? "bg-emerald-600 border-emerald-600 text-white shadow-md"
                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-400"
            }`,
          },
          e(Icono, { nombre: opcion.icono, "aria-hidden": "true" }),
          `${opcion.nombre} (${opcion.total})`,
        );
      }),
    );
  };

  const vistaTodo = (datos) =>
    datos.areas.length === 0
      ? e(
          "div",
          { className: "bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-6" },
          e(SinRegistros),
        )
      : e(
          "div",
          { className: "grid grid-cols-1 lg:grid-cols-2 gap-6" },
          datos.areas.map((area) =>
            e(AuditTarjetaArea, {
              key: area.tipoRecurso,
              tipoRecurso: area.tipoRecurso,
              total: area.total,
              recarga,
              onVerTodos: () => setAreaActiva(area.tipoRecurso),
              onSeleccionar: setSelectedLog,
            }),
          ),
        );

  const vistaArea = (datos) => {
    const area = datos.areas.find((a) => a.tipoRecurso === areaActiva);
    if (!area) {
      return e(
        "div",
        { className: "bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-6" },
        e(SinRegistros),
      );
    }
    const info = infoArea(area.tipoRecurso);
    return e(
      "div",
      { className: "bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 p-5 space-y-3" },
      e(
        "div",
        { className: "flex items-center gap-3 px-1 pb-2" },
        e(Icono, { nombre: info.icono, className: "text-emerald-600" }),
        e(
          "h3",
          { className: "text-sm font-black uppercase tracking-tight text-gray-800 dark:text-white" },
          info.nombre,
        ),
        e("span", { className: "text-xs text-gray-400" }, `${area.total} registros`),
      ),
      area.acciones.map((accion, indice) =>
        e(AuditSeccionAccion, {
          key: `${area.tipoRecurso}-${accion.accion}`,
          tipoRecurso: area.tipoRecurso,
          accion: accion.accion,
          total: accion.total,
          recarga,
          abiertaPorDefecto: indice === 0,
          onSeleccionar: setSelectedLog,
        }),
      ),
    );
  };

  const contenidoResumen = () => {
    if (resumen.cargando && !resumen.datos) {
      return e(
        "div",
        { className: "space-y-4" },
        e(Cargando),
        e(
          "div",
          { className: "grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse" },
          [0, 1].map((n) =>
            e("div", { key: n, className: "h-48 rounded-3xl bg-gray-100 dark:bg-gray-800" }),
          ),
        ),
      );
    }
    if (resumen.error && !resumen.datos) {
      return e(
        "div",
        { className: "bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-6" },
        e(EstadoError, {
          onReintentar: cargarResumen,
          mensaje: "No se pudo cargar la auditoría.",
        }),
      );
    }
    const datos = resumen.datos;
    return e(
      "div",
      { className: "space-y-6" },
      pastillas(datos),
      areaActiva === null ? vistaTodo(datos) : vistaArea(datos),
    );
  };

  return e(
    "div",
    { className: "p-6 max-w-7xl mx-auto space-y-6" },
    selectedLog && e(DetalleCambio, { log: selectedLog, onCerrar: () => setSelectedLog(null) }),
    cabecera(),
    contenidoResumen(),
  );
};

export default AuditLogs;
