import { Icono } from "../../../components/Icono.js";
/**
 * public/src/features/inventory/components/ImportarProductosModal.js (F1-3)
 * Importar productos desde Excel (.xlsx) o CSV en cuatro pasos:
 * 1. Plantilla vacía o exportar el catálogo actual. 2. Subir el archivo.
 * 3. Vista previa (nuevos, cambios antes/después, errores por fila, productos fuera del archivo).
 * 4. Confirmar: aplica por SKU, crea o actualiza, nunca borra. Desactivar los que faltan es una acción aparte.
 * Todo el contenido se pinta como texto de React, nunca como HTML crudo.
 */
import React, { useState } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";
import ConfirmModal from "./ConfirmModal.js";

const e = React.createElement;

const LIMITE_BYTES = 2 * 1024 * 1024;
const PASOS = ["Plantilla", "Archivo", "Vista previa", "Resultado"];
const RUTA = "/api/admin/productos";

const mensajeError = (err, generico = "No se pudo completar la acción.") =>
  err?.response?.data?.error || generico;

const BOTON_PRIMARIO =
  "min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed motion-reduce:transition-none inline-flex items-center justify-center gap-2";
const BOTON_SECUNDARIO =
  "min-h-[44px] px-5 py-2.5 rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition active:scale-95 disabled:opacity-50 motion-reduce:transition-none inline-flex items-center justify-center gap-2";

const ImportarProductosModal = ({ isOpen, onClose, onImported }) => {
  const [paso, setPaso] = useState(1);
  const [archivo, setArchivo] = useState(null);
  const [compat, setCompat] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [vista, setVista] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false);
  const [desactivados, setDesactivados] = useState(null);

  if (!isOpen) return null;

  const esCsv = archivo ? archivo.name.toLowerCase().endsWith(".csv") : false;

  const reiniciar = () => {
    setPaso(1);
    setArchivo(null);
    setCompat(null);
    setError("");
    setVista(null);
    setResultado(null);
    setDesactivados(null);
  };

  const cerrar = () => {
    reiniciar();
    onClose();
  };

  const descargar = async (ruta, nombre) => {
    setError("");
    setCargando(true);
    try {
      const res = await apiClient.get(ruta, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(mensajeError(err, "No se pudo descargar el archivo."));
    } finally {
      setCargando(false);
    }
  };

  const elegirArchivo = (ev) => {
    const f = ev.target.files?.[0] || null;
    setError("");
    if (!f) return setArchivo(null);
    const nombre = f.name.toLowerCase();
    if (!nombre.endsWith(".xlsx") && !nombre.endsWith(".csv")) {
      setError("Solo se aceptan archivos .xlsx o .csv.");
      return setArchivo(null);
    }
    if (f.size > LIMITE_BYTES) {
      setError("El archivo no puede exceder 2 MB.");
      return setArchivo(null);
    }
    setArchivo(f);
    if (!nombre.endsWith(".csv")) setCompat(null);
  };

  const elegirCompat = (ev) => {
    const f = ev.target.files?.[0] || null;
    setError("");
    if (f && !f.name.toLowerCase().endsWith(".csv")) {
      setError("El archivo de compatibilidad debe ser .csv.");
      return setCompat(null);
    }
    if (f && f.size > LIMITE_BYTES) {
      setError("El archivo no puede exceder 2 MB.");
      return setCompat(null);
    }
    setCompat(f);
  };

  const enviar = (ruta) => {
    const form = new FormData();
    form.append("archivo", archivo);
    if (compat) form.append("compatibilidad", compat);
    return apiClient.post(ruta, form, { headers: { "Content-Type": "multipart/form-data" } });
  };

  const verVistaPrevia = async () => {
    setError("");
    setCargando(true);
    try {
      const { data } = await enviar(`${RUTA}/importar/vista-previa`);
      setVista(data.data);
      setPaso(3);
    } catch (err) {
      setError(mensajeError(err, "No se pudo analizar el archivo."));
    } finally {
      setCargando(false);
    }
  };

  const confirmar = async () => {
    setError("");
    setCargando(true);
    try {
      const { data } = await enviar(`${RUTA}/importar/confirmar`);
      setResultado(data.data);
      setPaso(4);
      onImported?.();
      window.showToast?.("Importación aplicada", "success");
    } catch (err) {
      setError(mensajeError(err, "No se pudo completar la importación."));
    } finally {
      setCargando(false);
    }
  };

  const desactivarFaltantes = async () => {
    const ids = (vista?.noEnArchivo || []).map((p) => p.id);
    if (!ids.length) return;
    setError("");
    setCargando(true);
    try {
      const { data } = await apiClient.post(`${RUTA}/importar/desactivar`, { ids });
      setDesactivados(data.data.desactivados);
      setVista((v) => (v ? { ...v, noEnArchivo: [] } : v));
      onImported?.();
      window.showToast?.(`${data.data.desactivados} productos desactivados`, "success");
    } catch (err) {
      setError(mensajeError(err, "No se pudo desactivar los productos."));
    } finally {
      setCargando(false);
    }
  };

  const tarjeta = (titulo, valor, tono) =>
    e(
      "div",
      { key: titulo, className: "rounded-xl border dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-900/40" },
      e("p", { className: "text-[11px] font-bold uppercase tracking-wide text-gray-500" }, titulo),
      e("p", { className: `text-2xl font-black ${tono}` }, String(valor)),
    );

  const celdaTabla = (texto, clase = "") =>
    e("td", { className: `px-3 py-2 align-top text-sm text-gray-700 dark:text-gray-200 ${clase}` }, texto);

  const encabezado = (titulos) =>
    e(
      "thead",
      { className: "bg-gray-50 dark:bg-gray-900/40" },
      e(
        "tr",
        null,
        titulos.map((t) =>
          e("th", { key: t, scope: "col", className: "px-3 py-2 text-left text-[11px] font-bold uppercase text-gray-500" }, t),
        ),
      ),
    );

  const pasoPlantilla = () =>
    e(
      "div",
      { className: "space-y-4" },
      e("p", { className: "text-sm text-gray-600 dark:text-gray-300" },
        "Descarga la plantilla vacía para cargar productos nuevos, o exporta el catálogo actual para editarlo en Excel y volver a subirlo."),
      e(
        "div",
        { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
        e(
          "button",
          { type: "button", onClick: () => descargar(`${RUTA}/plantilla`, "plantilla-productos.xlsx"), disabled: cargando, className: BOTON_SECUNDARIO },
          e(Icono, { nombre: "file-spreadsheet" }),
          "Descargar plantilla",
        ),
        e(
          "button",
          { type: "button", onClick: () => descargar(`${RUTA}/exportar`, "catalogo-productos.xlsx"), disabled: cargando, className: BOTON_SECUNDARIO },
          e(Icono, { nombre: "file-spreadsheet" }),
          "Exportar catálogo actual",
        ),
      ),
      e(
        "div",
        { className: "rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-200" },
        "La hoja Productos tiene una fila por producto (SKU obligatorio). La hoja Compatibilidad tiene una fila por vehículo; si un SKU aparece ahí, sus vehículos se reemplazan por los del archivo.",
      ),
    );

  const pasoArchivo = () =>
    e(
      "div",
      { className: "space-y-4" },
      e(
        "label",
        { className: "flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-emerald-300 dark:border-emerald-700 p-6 cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition min-h-[44px]" },
        e(Icono, { nombre: "upload", className: "text-2xl text-emerald-600" }),
        e("span", { className: "text-sm font-bold text-gray-700 dark:text-gray-200" }, archivo ? archivo.name : "Elegir archivo .xlsx o .csv"),
        e("span", { className: "text-xs text-gray-500" }, "Máximo 2 MB y 2000 filas"),
        e("input", { type: "file", accept: ".xlsx,.csv", onChange: elegirArchivo, className: "sr-only" }),
      ),
      esCsv &&
        e(
          "label",
          { className: "block text-sm text-gray-700 dark:text-gray-300" },
          "Archivo de compatibilidad (opcional, CSV)",
          e("input", {
            type: "file",
            accept: ".csv",
            onChange: elegirCompat,
            className: "mt-2 block w-full text-sm",
          }),
          compat && e("span", { className: "block text-xs text-gray-500 mt-1" }, compat.name),
        ),
      e(
        "p",
        { className: "text-xs text-gray-500" },
        "El archivo solo se lee: las fórmulas no se ejecutan. Vista previa no cambia nada; el cambio se aplica al confirmar.",
      ),
    );

  const pasoVistaPrevia = () => {
    if (!vista) return null;
    const r = vista.resumen;
    const hayErrores = r.errores > 0;
    return e(
      "div",
      { className: "space-y-5" },
      e(
        "div",
        { className: "grid grid-cols-2 sm:grid-cols-5 gap-2" },
        tarjeta("Nuevos", r.nuevos, "text-emerald-600"),
        tarjeta("Cambios", r.cambios, "text-blue-600"),
        tarjeta("Sin cambio", r.sinCambio, "text-gray-600"),
        tarjeta("Errores", r.errores, hayErrores ? "text-red-600" : "text-gray-600"),
        tarjeta("Fuera del archivo", r.noEnArchivo, "text-amber-600"),
      ),
      hayErrores &&
        e(
          "div",
          { role: "alert", className: "flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300" },
          e(Icono, { nombre: "triangle-alert", className: "mt-0.5" }),
          `Hay ${r.errores} error(es). Corrige el archivo y vuelve a subirlo: no se aplica nada hasta que no haya errores.`,
        ),
      vista.categoriasNuevas.length > 0 &&
        e("p", { className: "text-sm text-gray-600 dark:text-gray-300" },
          `Se crearán las categorías: ${vista.categoriasNuevas.join(", ")}.`),
      vista.nuevos.length > 0 &&
        e(
          "section",
          { className: "space-y-2" },
          e("h3", { className: "text-sm font-bold text-gray-800 dark:text-gray-100" }, "Productos nuevos"),
          e(
            "div",
            { className: "overflow-x-auto rounded-xl border dark:border-gray-700" },
            e(
              "table",
              { className: "min-w-full" },
              encabezado(["Fila", "SKU", "Nombre", "Precio", "Categorías", "Vehículos"]),
              e(
                "tbody",
                null,
                vista.nuevos.map((n) =>
                  e(
                    "tr",
                    { key: `n-${n.fila}`, className: "border-t dark:border-gray-700" },
                    celdaTabla(String(n.fila)),
                    celdaTabla(n.sku, "font-mono"),
                    celdaTabla(n.nombre),
                    celdaTabla(`$${n.precio}`),
                    celdaTabla(n.categorias.join(", ")),
                    celdaTabla(String(n.vehiculos)),
                  ),
                ),
              ),
            ),
          ),
        ),
      vista.cambios.length > 0 &&
        e(
          "section",
          { className: "space-y-2" },
          e("h3", { className: "text-sm font-bold text-gray-800 dark:text-gray-100" }, "Productos que cambian"),
          e(
            "div",
            { className: "overflow-x-auto rounded-xl border dark:border-gray-700" },
            e(
              "table",
              { className: "min-w-full" },
              encabezado(["Fila", "SKU", "Campo", "Antes", "Después"]),
              e(
                "tbody",
                null,
                vista.cambios.flatMap((c) =>
                  c.campos.map((campo, i) =>
                    e(
                      "tr",
                      { key: `c-${c.fila}-${i}`, className: "border-t dark:border-gray-700" },
                      celdaTabla(i === 0 ? String(c.fila) : ""),
                      celdaTabla(i === 0 ? c.sku : "", "font-mono"),
                      celdaTabla(campo.campo),
                      celdaTabla(campo.antes, "text-red-600 dark:text-red-400"),
                      celdaTabla(campo.despues, "text-emerald-700 dark:text-emerald-400 font-bold"),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      vista.errores.length > 0 &&
        e(
          "section",
          { className: "space-y-2" },
          e("h3", { className: "text-sm font-bold text-red-700 dark:text-red-400" }, "Errores por fila"),
          e(
            "div",
            { className: "overflow-x-auto rounded-xl border border-red-200 dark:border-red-900" },
            e(
              "table",
              { className: "min-w-full" },
              encabezado(["Hoja", "Fila", "Motivo"]),
              e(
                "tbody",
                null,
                vista.errores.map((er, i) =>
                  e(
                    "tr",
                    { key: `e-${i}`, className: "border-t dark:border-gray-700" },
                    celdaTabla(er.hoja),
                    celdaTabla(String(er.fila)),
                    celdaTabla(er.motivo),
                  ),
                ),
              ),
            ),
          ),
        ),
      vista.noEnArchivo.length > 0 &&
        e(
          "section",
          { className: "space-y-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 p-3" },
          e("h3", { className: "text-sm font-bold text-amber-800 dark:text-amber-200" },
            `${vista.noEnArchivo.length} productos activos no vienen en el archivo`),
          e("p", { className: "text-xs text-amber-800 dark:text-amber-200" },
            "La importación no los borra. Si ya no se venden, puedes desactivarlos (quedan ocultos en la tienda y el bot)."),
          e("ul", { className: "text-xs text-gray-700 dark:text-gray-200 max-h-32 overflow-y-auto list-disc pl-5" },
            vista.noEnArchivo.map((p) => e("li", { key: p.id }, `${p.sku} · ${p.nombre}`))),
          e(
            "button",
            {
              type: "button",
              onClick: () => setConfirmarDesactivar(true),
              disabled: cargando,
              className: BOTON_SECUNDARIO,
            },
            e(Icono, { nombre: "trash", className: "text-red-500" }),
            `Desactivar ${vista.noEnArchivo.length} productos`,
          ),
        ),
      desactivados !== null &&
        e("p", { role: "status", className: "text-sm text-emerald-700 dark:text-emerald-400" }, `${desactivados} productos desactivados.`),
    );
  };

  const pasoResultado = () => {
    if (!resultado) return null;
    return e(
      "div",
      { className: "space-y-4 text-center py-4" },
      e(Icono, { nombre: "circle-check", className: "text-5xl text-emerald-500 mx-auto" }),
      e("h3", { className: "text-lg font-bold text-gray-800 dark:text-gray-100" }, "Importación aplicada"),
      e(
        "div",
        { className: "grid grid-cols-2 sm:grid-cols-4 gap-2 text-left" },
        tarjeta("Creados", resultado.creados, "text-emerald-600"),
        tarjeta("Actualizados", resultado.actualizados, "text-blue-600"),
        tarjeta("Sin cambio", resultado.sinCambio, "text-gray-600"),
        tarjeta("Categorías nuevas", resultado.categoriasCreadas.length, "text-gray-600"),
      ),
      resultado.noEnArchivo.length > 0 &&
        e("p", { className: "text-sm text-gray-600 dark:text-gray-300" },
          `${resultado.noEnArchivo.length} productos activos no vinieron en el archivo. Nada se borró.`),
    );
  };

  const cuerpo = () => {
    if (paso === 1) return pasoPlantilla();
    if (paso === 2) return pasoArchivo();
    if (paso === 3) return pasoVistaPrevia();
    return pasoResultado();
  };

  const pie = () => {
    const botones = [];
    if (paso === 2 || paso === 3) {
      botones.push(
        e(
          "button",
          { key: "atras", type: "button", onClick: () => { setError(""); setPaso(paso - 1); }, disabled: cargando, className: BOTON_SECUNDARIO },
          e(Icono, { nombre: "arrow-left" }),
          "Atrás",
        ),
      );
    }
    if (paso === 1) {
      botones.push(
        e(
          "button",
          { key: "siguiente", type: "button", onClick: () => setPaso(2), className: BOTON_PRIMARIO },
          "Siguiente",
          e(Icono, { nombre: "arrow-right" }),
        ),
      );
    }
    if (paso === 2) {
      botones.push(
        e(
          "button",
          { key: "vista", type: "button", onClick: verVistaPrevia, disabled: !archivo || cargando, className: BOTON_PRIMARIO },
          cargando ? e(Icono, { nombre: "loader-circle", girar: true }) : e(Icono, { nombre: "arrow-right" }),
          "Ver vista previa",
        ),
      );
    }
    if (paso === 3) {
      const bloqueado = !vista || vista.resumen.errores > 0 || cargando;
      botones.push(
        e(
          "button",
          { key: "confirmar", type: "button", onClick: confirmar, disabled: bloqueado, className: BOTON_PRIMARIO },
          cargando ? e(Icono, { nombre: "loader-circle", girar: true }) : e(Icono, { nombre: "circle-check" }),
          "Confirmar importación",
        ),
      );
    }
    if (paso === 4) {
      botones.push(
        e(
          "button",
          { key: "cerrar", type: "button", onClick: cerrar, className: BOTON_PRIMARIO },
          "Cerrar",
        ),
      );
    }
    return botones;
  };

  return e(
    "div",
    { className: "fixed inset-0 bg-black/60 flex items-center justify-center z-[200] p-4 backdrop-blur-sm" },
    e(
      "div",
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "importar-productos-titulo",
        className: "bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-gray-100 dark:border-gray-700",
      },
      // Encabezado con pasos
      e(
        "div",
        { className: "flex items-center justify-between gap-3 p-4 border-b dark:border-gray-700" },
        e(
          "div",
          null,
          e("h2", { id: "importar-productos-titulo", className: "text-lg font-black text-gray-800 dark:text-gray-100 flex items-center gap-2" },
            e(Icono, { nombre: "file-spreadsheet", className: "text-emerald-600" }),
            "Importar productos"),
          e("p", { className: "text-xs text-gray-500 mt-1" }, `Paso ${paso} de 4: ${PASOS[paso - 1]}`),
        ),
        e(
          "button",
          {
            type: "button",
            onClick: cerrar,
            disabled: cargando,
            "aria-label": "Cerrar",
            className: "min-h-[44px] min-w-[44px] rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center",
          },
          e(Icono, { nombre: "x" }),
        ),
      ),
      // Cuerpo
      e(
        "div",
        { className: "p-4 overflow-y-auto flex-1 space-y-4" },
        error && e("div", { role: "alert", className: "rounded-xl bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-700 dark:text-red-300" }, error),
        cuerpo(),
      ),
      // Pie
      e("div", { className: "flex flex-wrap justify-end gap-2 p-4 border-t dark:border-gray-700" }, pie()),
    ),
    e(ConfirmModal, {
      isOpen: confirmarDesactivar,
      title: "Desactivar productos",
      message: "Los productos desactivados dejan de verse en la tienda y en el bot. No se borran y se pueden volver a activar desde el panel.",
      confirmText: "Desactivar",
      cancelText: "Cancelar",
      isDanger: true,
      onCancel: () => setConfirmarDesactivar(false),
      onConfirm: desactivarFaltantes,
    }),
  );
};

export default ImportarProductosModal;
