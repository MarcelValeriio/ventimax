/**
 * Piezas de la auditoría agrupada: fila de registro, sección plegable por acción y tarjeta por área.
 * Las usa AuditLogs.js. El detalle del cambio lo abre la pantalla principal (onSeleccionar).
 */
import { Icono } from "../../../components/Icono.js";
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";
import { infoArea, tituloAccion, esFiltrable } from "./auditoriaMapas.js";

const e = React.createElement;

/** Registros por página dentro de una sección de acción. */
export const LIMITE_SECCION = 10;
/** Registros que muestra la tarjeta de cada área en la vista Todo. */
export const LIMITE_TARJETA = 5;

const formatearFecha = (valor) =>
  new Date(valor).toLocaleString([], { dateStyle: "short", timeStyle: "short" });

/** Detalle corto de un registro: pedido o recurso, cambio de estado y observación. */
export const resumenDetalle = (log) => {
  const partes = [];
  if (log.correlativoPedido) partes.push(`Pedido #${log.correlativoPedido}`);
  else if (log.recursoId) partes.push(String(log.recursoId));
  if (log.estadoAnterior || log.estadoNuevo) {
    partes.push(`${log.estadoAnterior || "---"} → ${log.estadoNuevo || "---"}`);
  }
  if (log.detalles) partes.push(log.detalles);
  return partes.join(" · ") || "Sin detalles";
};

/** Fila de un registro: usuario, detalle corto y fecha. Toda la fila abre el detalle. */
export const AuditFila = ({ log, onSeleccionar }) =>
  e(
    "button",
    {
      type: "button",
      onClick: () => onSeleccionar(log),
      className:
        "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500",
    },
    e(
      "div",
      {
        "aria-hidden": "true",
        className:
          "w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-[10px] font-bold shrink-0",
      },
      (log.usuarioNombre || "U").charAt(0),
    ),
    e(
      "div",
      { className: "min-w-0 flex-1" },
      e(
        "p",
        { className: "text-xs font-bold text-gray-700 dark:text-gray-200 truncate" },
        log.usuarioNombre || "Sistema",
      ),
      e(
        "p",
        { className: "text-[11px] text-gray-500 dark:text-gray-400 truncate" },
        resumenDetalle(log),
      ),
    ),
    e(
      "time",
      {
        dateTime: new Date(log.timestamp).toISOString(),
        className: "text-[11px] text-gray-400 shrink-0",
      },
      formatearFecha(log.timestamp),
    ),
  );

export const Cargando = () =>
  e(
    "div",
    { role: "status", className: "flex items-center justify-center gap-2 py-4 text-xs text-gray-400" },
    e(Icono, { nombre: "loader-circle", girar: true }),
    "Cargando…",
  );

export const SinRegistros = () =>
  e(
    "p",
    { className: "py-4 text-center text-xs text-gray-400" },
    "Aún no hay registros en esta área",
  );

export const EstadoError = ({ onReintentar, mensaje = "No se pudieron cargar los registros." }) =>
  e(
    "div",
    { role: "alert", className: "flex flex-col items-center gap-2 py-4 text-center" },
    e(Icono, { nombre: "circle-alert", className: "text-red-500" }),
    e("p", { className: "text-xs text-gray-500 dark:text-gray-400" }, mensaje),
    e(
      "button",
      {
        type: "button",
        onClick: onReintentar,
        className:
          "px-3 py-1.5 text-xs font-bold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-xl shadow-sm border border-gray-300 dark:border-gray-700",
      },
      "Reintentar",
    ),
  );

const NoFiltrable = () =>
  e(
    "p",
    { className: "py-4 px-2 text-center text-[11px] text-gray-400" },
    "Registros con un formato antiguo: no se pueden filtrar desde esta pantalla.",
  );

/** Pide registros al servidor y valida la respuesta. */
const pedirRegistros = async (params) => {
  const query = new URLSearchParams(params).toString();
  const { data } = await apiClient.get(`/api/admin/audit?${query}`);
  if (!data || !data.success) throw new Error("Respuesta de auditoría inválida");
  return data;
};

/** Sección plegable de una acción dentro de un área, con "Ver más" por páginas. */
export const AuditSeccionAccion = ({
  tipoRecurso,
  accion,
  total,
  recarga,
  abiertaPorDefecto = false,
  onSeleccionar,
}) => {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  const [registros, setRegistros] = useState([]);
  const [pagina, setPagina] = useState(0);
  const [paginas, setPaginas] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const filtrable = esFiltrable(tipoRecurso) && esFiltrable(accion);
  const idPanel = `audit-seccion-${tipoRecurso}-${accion}`.replace(/[^a-zA-Z0-9_-]/g, "-");

  const cargar = async (numeroPagina, reemplazar) => {
    setCargando(true);
    setError(false);
    try {
      const datos = await pedirRegistros({
        tipoRecurso,
        accion,
        limit: LIMITE_SECCION,
        page: numeroPagina,
      });
      setRegistros((previos) => (reemplazar ? datos.data : [...previos, ...datos.data]));
      setPaginas(datos.pagination.pages);
      setPagina(numeroPagina);
    } catch (err) {
      console.error("Error cargando registros de auditoría:", err);
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  // Carga al abrir la sección y cada vez que se pulsa Actualizar
  useEffect(() => {
    if (abierta && filtrable) cargar(1, true);
  }, [abierta, recarga]);

  const contenido = () => {
    if (!filtrable) return e(NoFiltrable);
    if (cargando && registros.length === 0) return e(Cargando);
    if (error && registros.length === 0) {
      return e(EstadoError, { onReintentar: () => cargar(1, true) });
    }
    if (registros.length === 0) return e(SinRegistros);
    return e(
      "div",
      { className: "space-y-1" },
      registros.map((log, indice) =>
        e(AuditFila, { key: log._id || indice, log, onSeleccionar }),
      ),
      error &&
        e(EstadoError, {
          onReintentar: () => cargar(pagina + 1, false),
          mensaje: "No se pudo cargar la página siguiente.",
        }),
      pagina < paginas &&
        e(
          "div",
          { className: "flex justify-center pt-2" },
          e(
            "button",
            {
              type: "button",
              disabled: cargando,
              onClick: () => cargar(pagina + 1, false),
              className:
                "px-4 py-2 text-xs font-bold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-xl shadow-sm border border-gray-300 dark:border-gray-700 disabled:opacity-50",
            },
            cargando ? "Cargando…" : "Ver más",
          ),
        ),
    );
  };

  return e(
    "section",
    { className: "rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden" },
    e(
      "button",
      {
        type: "button",
        "aria-expanded": abierta ? "true" : "false",
        "aria-controls": idPanel,
        onClick: () => setAbierta(!abierta),
        className:
          "w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 text-left transition-colors",
      },
      e(Icono, {
        nombre: "chevron-right",
        className: `text-gray-400 transition-transform ${abierta ? "rotate-90" : ""}`,
      }),
      e(
        "span",
        { className: "flex-1 text-sm font-bold text-gray-700 dark:text-gray-200" },
        tituloAccion(accion),
      ),
      e(
        "span",
        {
          className:
            "px-2 py-0.5 rounded-lg bg-white dark:bg-gray-800 text-[11px] font-black text-gray-500 dark:text-gray-300",
        },
        total,
      ),
    ),
    e(
      "div",
      { id: idPanel, hidden: !abierta, className: "p-2" },
      abierta && contenido(),
    ),
  );
};

/** Tarjeta de un área en la vista Todo: últimos registros y botón para ver el área completa. */
export const AuditTarjetaArea = ({ tipoRecurso, total, recarga, onVerTodos, onSeleccionar }) => {
  const info = infoArea(tipoRecurso);
  const filtrable = esFiltrable(tipoRecurso);
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(filtrable);
  const [error, setError] = useState(false);

  const cargar = async () => {
    setCargando(true);
    setError(false);
    try {
      const datos = await pedirRegistros({ tipoRecurso, limit: LIMITE_TARJETA, page: 1 });
      setRegistros(datos.data);
    } catch (err) {
      console.error("Error cargando registros de auditoría:", err);
      setError(true);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (filtrable) cargar();
    else setCargando(false);
  }, [recarga]);

  const contenido = () => {
    if (!filtrable) return e(NoFiltrable);
    if (cargando) return e(Cargando);
    if (error) return e(EstadoError, { onReintentar: cargar });
    if (registros.length === 0) return e(SinRegistros);
    return e(
      "div",
      { className: "space-y-1" },
      registros.map((log, indice) =>
        e(AuditFila, { key: log._id || indice, log, onSeleccionar }),
      ),
    );
  };

  return e(
    "article",
    {
      className:
        "bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col overflow-hidden",
    },
    e(
      "header",
      { className: "flex items-center gap-3 px-5 pt-5 pb-3" },
      e(
        "div",
        {
          "aria-hidden": "true",
          className:
            "w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center",
        },
        e(Icono, { nombre: info.icono }),
      ),
      e(
        "div",
        { className: "flex-1 min-w-0" },
        e(
          "h3",
          { className: "text-sm font-black uppercase tracking-tight text-gray-800 dark:text-white" },
          info.nombre,
        ),
        e(
          "p",
          { className: "text-[11px] text-gray-400" },
          `${total} ${total === 1 ? "registro" : "registros"}`,
        ),
      ),
    ),
    e("div", { className: "px-3 flex-1" }, contenido()),
    e(
      "footer",
      { className: "px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex justify-end" },
      e(
        "button",
        {
          type: "button",
          onClick: onVerTodos,
          "aria-label": `Ver todos los registros de ${info.nombre} (${total})`,
          className:
            "px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md active:scale-95 transition-all",
        },
        `Ver todos (${total})`,
      ),
    ),
  );
};
