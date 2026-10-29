/**
 * public/src/features/inventory/components/ShippingNacionalModal.js
 * Modal de envío nacional (y métodos especiales): costo, datos que pide el bot, cobro a destino y las empresas de
 * envío. Cada empresa es una tarjeta con su logo; el logo se sube a Cloudinary al instante, de forma independiente
 * de los demás campos (POST /api/admin/shipping/logo).
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from "https://cdn.skypack.dev/react";
import { Icono } from "../../../components/Icono.js";
import apiClient from "../../../services/apiClient.js";

const e = React.createElement;

const MAX_EMPRESAS = 10;
const CAMPO =
  "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm";
const ETIQUETA = "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1";
const FOCO = "focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none";

let secuenciaUid = 0;
const nuevoUid = () => {
  secuenciaUid += 1;
  return `emp-${secuenciaUid}`;
};

/**
 * Normaliza una empresa guardada. Datos viejos llegan como texto ("MRW"); los nuevos, como objeto.
 * Exportada para que el listado de métodos la use igual.
 */
export function normalizarEmpresa(valor) {
  if (typeof valor === "string") return { nombre: valor.trim(), logoUrl: "", logoPublicId: "" };
  if (valor && typeof valor === "object") {
    return {
      nombre: String(valor.nombre || "").trim(),
      logoUrl: typeof valor.logoUrl === "string" ? valor.logoUrl : "",
      logoPublicId: typeof valor.logoPublicId === "string" ? valor.logoPublicId : "",
    };
  }
  return { nombre: "", logoUrl: "", logoPublicId: "" };
}

/** Miniatura de una empresa en el listado: su logo, o su nombre si no tiene logo o el logo no carga. */
export function LogoEmpresa({ empresa }) {
  const [fallo, setFallo] = useState(false);
  if (empresa.logoUrl && !fallo) {
    return e("img", {
      src: empresa.logoUrl,
      alt: empresa.nombre,
      title: empresa.nombre,
      loading: "lazy",
      onError: () => setFallo(true),
      className: "h-6 max-w-[72px] object-contain rounded bg-white border border-gray-200 p-0.5",
    });
  }
  return e(
    "span",
    {
      title: empresa.nombre,
      className:
        "px-1.5 py-0.5 rounded bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-[11px] font-semibold text-gray-700 dark:text-gray-300",
    },
    empresa.nombre,
  );
}

function formularioInicial(method) {
  return {
    nombre: method?.nombre || "",
    descripcion: method?.descripcion || "",
    costoTipo: method?.costoTipo || "a_convenir",
    costo: Number(method?.costo) || 0,
    pideDatos: method?.pideDatos || "",
    cobroADestino: method?.cobroADestino === true,
    activo: method ? method.activo !== false : true,
    orden: Number(method?.orden) || 0,
  };
}

function empresasIniciales(method) {
  const lista = Array.isArray(method?.empresas) ? method.empresas : [];
  return lista
    .map(normalizarEmpresa)
    .filter((x) => x.nombre)
    .slice(0, MAX_EMPRESAS)
    .map((x) => ({ ...x, uid: nuevoUid(), subiendo: false, error: "", logoRoto: false }));
}

/** Tarjeta de una empresa: nombre, logo (subida independiente) y eliminar. */
function TarjetaEmpresa({ empresa, indice, onNombre, onSubir, onQuitarLogo, onEliminar }) {
  const inputRef = useRef(null);
  const [logoRoto, setLogoRoto] = useState(false);
  const nombreEtiqueta = empresa.nombre.trim() || `empresa ${indice + 1}`;
  const tieneLogo = Boolean(empresa.logoUrl);
  const idNombre = `${empresa.uid}-nombre`;
  const idError = `${empresa.uid}-error`;

  // Si cambia el logo, se vuelve a intentar mostrarlo
  useEffect(() => {
    setLogoRoto(false);
  }, [empresa.logoUrl]);

  const vistaLogo =
    tieneLogo && !logoRoto
      ? e("img", {
          src: empresa.logoUrl,
          alt: `Logo de ${nombreEtiqueta}`,
          onError: () => setLogoRoto(true),
          className: "h-16 w-auto max-w-full object-contain",
        })
      : e(
          "div",
          { className: "flex flex-col items-center gap-1 text-gray-300 dark:text-gray-600 text-center" },
          e(Icono, { nombre: "image", className: "text-2xl" }),
          tieneLogo
            ? e("span", { className: "text-[11px] font-bold text-red-500" }, "El logo no se puede mostrar")
            : e("span", { className: "text-[11px]" }, "Sin logo"),
        );

  return e(
    "div",
    { className: "rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex flex-col gap-3 bg-gray-50/60 dark:bg-gray-900/40" },
    e(
      "div",
      {
        className:
          "h-16 w-full flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-white p-1 overflow-hidden",
      },
      vistaLogo,
    ),
    e("label", { htmlFor: idNombre, className: ETIQUETA }, "Nombre de la empresa"),
    e("input", {
      id: idNombre,
      type: "text",
      maxLength: 40,
      value: empresa.nombre,
      placeholder: "ej: MRW",
      "aria-invalid": empresa.error ? "true" : undefined,
      "aria-describedby": empresa.error ? idError : undefined,
      onChange: (ev) => onNombre(ev.target.value),
      className: CAMPO,
    }),
    e(
      "div",
      { className: "flex flex-wrap items-center gap-2" },
      e("input", {
        ref: inputRef,
        type: "file",
        accept: "image/png,image/jpeg,image/webp",
        className: "hidden",
        "aria-label": `Archivo del logo de ${nombreEtiqueta}`,
        onChange: (ev) => {
          const archivo = ev.target.files && ev.target.files[0];
          ev.target.value = "";
          if (archivo) onSubir(archivo);
        },
      }),
      e(
        "button",
        {
          type: "button",
          disabled: empresa.subiendo,
          onClick: () => inputRef.current && inputRef.current.click(),
          "aria-label": `${tieneLogo ? "Cambiar" : "Subir"} logo de ${nombreEtiqueta}`,
          className: `inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 transition disabled:opacity-60 disabled:cursor-wait cursor-pointer ${FOCO}`,
        },
        e(Icono, { nombre: empresa.subiendo ? "loader-circle" : "upload", girar: empresa.subiendo }),
        empresa.subiendo ? "Subiendo…" : tieneLogo ? "Cambiar logo" : "Subir logo",
      ),
      tieneLogo
        ? e(
            "button",
            {
              type: "button",
              disabled: empresa.subiendo,
              onClick: onQuitarLogo,
              "aria-label": `Quitar logo de ${nombreEtiqueta}`,
              className: `px-3 py-2 rounded-xl text-xs font-bold text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-60 cursor-pointer ${FOCO}`,
            },
            "Quitar logo",
          )
        : null,
      e(
        "button",
        {
          type: "button",
          onClick: onEliminar,
          title: "Eliminar empresa",
          "aria-label": `Eliminar ${nombreEtiqueta}`,
          className: `ml-auto p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition cursor-pointer ${FOCO}`,
        },
        e(Icono, { nombre: "trash" }),
      ),
    ),
    empresa.error
      ? e("p", { id: idError, role: "alert", className: "text-[11px] font-bold text-red-600 dark:text-red-400" }, empresa.error)
      : null,
  );
}

const ShippingNacionalModal = ({ isOpen, method = null, onClose, onSaved }) => {
  const [form, setForm] = useState(() => formularioInicial(method));
  const [empresas, setEmpresas] = useState(() => empresasIniciales(method));
  const [guardando, setGuardando] = useState(false);

  // Antes de pintar, se carga el método que se abre (evita mostrar datos de una edición anterior)
  useLayoutEffect(() => {
    if (isOpen) {
      setForm(formularioInicial(method));
      setEmpresas(empresasIniciales(method));
    }
  }, [isOpen, method]);

  if (!isOpen) return null;

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));

  const cambiarEmpresa = (uid, cambios) =>
    setEmpresas((lista) => lista.map((x) => (x.uid === uid ? { ...x, ...cambios } : x)));

  const agregarEmpresa = () => {
    if (empresas.length >= MAX_EMPRESAS) return;
    setEmpresas((lista) => [
      ...lista,
      { uid: nuevoUid(), nombre: "", logoUrl: "", logoPublicId: "", subiendo: false, error: "", logoRoto: false },
    ]);
  };

  const eliminarEmpresa = (empresa) => {
    const nombre = empresa.nombre.trim() || "esta empresa";
    if (!window.confirm(`¿Quitar ${nombre} de las empresas de envío?`)) return;
    setEmpresas((lista) => lista.filter((x) => x.uid !== empresa.uid));
  };

  // La subida es independiente: cada tarjeta guarda su propio logo al instante
  const subirLogo = async (uid, archivo) => {
    cambiarEmpresa(uid, { subiendo: true, error: "" });
    const datos = new FormData();
    datos.append("logo", archivo);
    try {
      const res = await apiClient.post("/api/admin/shipping/logo", datos, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { url, publicId } = res.data?.data || {};
      if (!url) throw new Error("El servidor no devolvió la imagen del logo");
      cambiarEmpresa(uid, { logoUrl: url, logoPublicId: publicId || "", subiendo: false });
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      cambiarEmpresa(uid, { subiendo: false, error: String(msg) });
    }
  };

  const handleSave = async (ev) => {
    if (ev) ev.preventDefault();
    if (guardando) return;
    if (!form.nombre.trim()) {
      window.showToast?.("El nombre del método es obligatorio", "error");
      return;
    }
    if (form.costoTipo === "fijo" && Number(form.costo) < 0) {
      window.showToast?.("El costo no puede ser negativo", "error");
      return;
    }
    if (empresas.some((x) => x.subiendo)) {
      window.showToast?.("Espera a que termine la subida del logo", "error");
      return;
    }
    if (empresas.some((x) => !x.nombre.trim())) {
      setEmpresas((lista) =>
        lista.map((x) => (x.nombre.trim() ? x : { ...x, error: "Escribe el nombre de la empresa" })),
      );
      window.showToast?.("Revisa las empresas: falta escribir el nombre", "error");
      return;
    }

    const payload = {
      nombre: form.nombre.trim(),
      tipo: method?.tipo || "envio_nacional",
      descripcion: (form.descripcion || "").trim(),
      costoTipo: form.costoTipo,
      costo: form.costoTipo === "fijo" ? Number(form.costo) : 0,
      pideDatos: (form.pideDatos || "").trim(),
      cobroADestino: form.cobroADestino === true,
      orden: Number(form.orden) || 0,
      activo: form.activo,
      empresas: empresas.map((x) => ({
        nombre: x.nombre.trim(),
        logoUrl: x.logoUrl,
        logoPublicId: x.logoPublicId,
      })),
    };

    setGuardando(true);
    try {
      if (method) {
        await apiClient.put(`/api/admin/shipping/${method._id}`, payload);
      } else {
        await apiClient.post("/api/admin/shipping", payload);
      }
      window.showToast?.("Método de envío guardado");
      onSaved?.();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      window.showToast?.("Error al guardar: " + msg, "error");
    } finally {
      setGuardando(false);
    }
  };

  return e(
    "div",
    { className: "fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4 backdrop-blur-sm" },
    e(
      "div",
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "envio-nacional-titulo",
        className:
          "bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200",
      },
      // Cabecera
      e(
        "div",
        {
          className:
            "p-6 border-b dark:border-gray-700 border-gray-100 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50",
        },
        e(
          "h3",
          {
            id: "envio-nacional-titulo",
            className: "text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2",
          },
          e(Icono, { nombre: "truck", className: "text-emerald-500" }),
          method ? "Editar Método de Envío" : "Nuevo Envío Nacional",
        ),
        e(
          "button",
          {
            type: "button",
            onClick: onClose,
            "aria-label": "Cerrar",
            className: `text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition cursor-pointer rounded-lg ${FOCO}`,
          },
          e(Icono, { nombre: "x" }),
        ),
      ),

      // Formulario
      e(
        "form",
        { onSubmit: handleSave, className: "p-6 space-y-5 overflow-y-auto" },

        // Nombre público
        e(
          "div",
          null,
          e("label", { htmlFor: "envio-nacional-nombre", className: ETIQUETA }, "Nombre público"),
          e("input", {
            id: "envio-nacional-nombre",
            type: "text",
            required: true,
            value: form.nombre,
            onChange: (ev) => cambiar("nombre", ev.target.value),
            className: CAMPO,
            placeholder: "Ej: Envío nacional",
          }),
        ),

        // Descripción
        e(
          "div",
          null,
          e("label", { htmlFor: "envio-nacional-descripcion", className: ETIQUETA }, "Descripción / Instrucciones (Opcional)"),
          e("textarea", {
            id: "envio-nacional-descripcion",
            rows: 2,
            value: form.descripcion,
            onChange: (ev) => cambiar("descripcion", ev.target.value),
            className: `${CAMPO} resize-none`,
            placeholder: "Ej: Enviamos a todo el país por agencia",
          }),
        ),

        // Modalidad de costo
        e(
          "div",
          { className: "grid grid-cols-2 gap-3" },
          e(
            "div",
            null,
            e("label", { htmlFor: "envio-nacional-costo-tipo", className: ETIQUETA }, "Modalidad de Costo"),
            e(
              "select",
              {
                id: "envio-nacional-costo-tipo",
                value: form.costoTipo,
                onChange: (ev) => cambiar("costoTipo", ev.target.value),
                className: CAMPO,
              },
              e("option", { value: "a_convenir" }, "A convenir con asesor"),
              e("option", { value: "fijo" }, "Costo Fijo ($)"),
            ),
          ),
          form.costoTipo === "fijo"
            ? e(
                "div",
                null,
                e("label", { htmlFor: "envio-nacional-costo", className: ETIQUETA }, "Monto en USD ($)"),
                e("input", {
                  id: "envio-nacional-costo",
                  type: "number",
                  min: "0",
                  step: "0.01",
                  value: form.costo,
                  required: true,
                  onChange: (ev) => cambiar("costo", parseFloat(ev.target.value) || 0),
                  className: CAMPO,
                }),
              )
            : e(
                "div",
                null,
                e("span", { className: ETIQUETA }, "Detalle del Costo"),
                e("input", {
                  type: "text",
                  disabled: true,
                  "aria-label": "Detalle del costo",
                  value: "Se acuerda con el cliente",
                  className:
                    "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-100 dark:bg-gray-900/50 text-gray-400 text-sm cursor-not-allowed",
                }),
              ),
        ),

        // Datos que pide el bot
        e(
          "div",
          null,
          e("label", { htmlFor: "envio-nacional-pide", className: ETIQUETA }, "Datos que solicita el Bot (Opcional)"),
          e("input", {
            id: "envio-nacional-pide",
            type: "text",
            maxLength: 120,
            value: form.pideDatos,
            onChange: (ev) => cambiar("pideDatos", ev.target.value),
            className: CAMPO,
            placeholder: "ej: estado, ciudad y oficina de la agencia",
          }),
          e(
            "p",
            { className: "text-[11px] text-gray-400 mt-1" },
            "Si lo dejas vacío, el bot pedirá la dirección de entrega habitual.",
          ),
        ),

        // Cobro a destino
        e(
          "label",
          { className: "flex items-start gap-2 cursor-pointer" },
          e("input", {
            type: "checkbox",
            checked: form.cobroADestino === true,
            onChange: (ev) => cambiar("cobroADestino", ev.target.checked),
            className: `mt-0.5 w-4 h-4 accent-emerald-600 ${FOCO}`,
          }),
          e(
            "span",
            { className: "text-sm text-gray-700 dark:text-gray-300" },
            e("strong", null, "Cobro a destino"),
            " — el cliente paga el envío al recibirlo o retirarlo en la agencia. Se le avisa en la tienda y en el bot.",
          ),
        ),

        // Empresas de envío
        e(
          "section",
          { "aria-labelledby": "empresas-envio-titulo", className: "space-y-3" },
          e(
            "div",
            { className: "flex items-center justify-between" },
            e(
              "h4",
              {
                id: "empresas-envio-titulo",
                className: "text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2",
              },
              e(Icono, { nombre: "truck", className: "text-emerald-500" }),
              "Empresas de envío",
            ),
            e("span", { className: "text-[11px] text-gray-400" }, `${empresas.length}/${MAX_EMPRESAS}`),
          ),
          e(
            "p",
            { className: "text-[11px] text-gray-400" },
            "Cada empresa es una opción para el cliente. Con logo, la tienda la muestra con su imagen.",
          ),
          e(
            "div",
            { className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" },
            empresas.map((empresa, indice) =>
              e(TarjetaEmpresa, {
                key: empresa.uid,
                empresa,
                indice,
                onNombre: (valor) => cambiarEmpresa(empresa.uid, { nombre: valor, error: "" }),
                onSubir: (archivo) => subirLogo(empresa.uid, archivo),
                onQuitarLogo: () => cambiarEmpresa(empresa.uid, { logoUrl: "", logoPublicId: "" }),
                onEliminar: () => eliminarEmpresa(empresa),
              }),
            ),
            empresas.length < MAX_EMPRESAS
              ? e(
                  "button",
                  {
                    type: "button",
                    onClick: agregarEmpresa,
                    "aria-label": "Agregar empresa de envío",
                    className: `min-h-[200px] flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition cursor-pointer ${FOCO}`,
                  },
                  e(Icono, { nombre: "plus", className: "text-xl" }),
                  "Agregar empresa",
                )
              : null,
          ),
        ),

        // Orden y activo
        e(
          "div",
          { className: "flex justify-between items-center pt-2" },
          e(
            "div",
            { className: "flex items-center gap-2" },
            e("label", { htmlFor: "envio-nacional-orden", className: "text-xs font-bold text-gray-600 dark:text-gray-300" }, "Prioridad de orden:"),
            e("input", {
              id: "envio-nacional-orden",
              type: "number",
              value: form.orden,
              onChange: (ev) => cambiar("orden", parseInt(ev.target.value, 10) || 0),
              className:
                "w-16 p-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 dark:text-gray-100 text-center text-xs",
            }),
          ),
          e(
            "label",
            { className: "flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-gray-300" },
            e("input", {
              type: "checkbox",
              checked: form.activo,
              onChange: (ev) => cambiar("activo", ev.target.checked),
              className: "w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500",
            }),
            "Método Activo",
          ),
        ),

        // Botones
        e(
          "div",
          { className: "flex gap-3 pt-4 border-t dark:border-gray-700" },
          e(
            "button",
            {
              type: "button",
              onClick: onClose,
              className: `flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition cursor-pointer ${FOCO}`,
            },
            "Cancelar",
          ),
          e(
            "button",
            {
              type: "submit",
              disabled: guardando,
              className: `flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition disabled:opacity-60 cursor-pointer ${FOCO}`,
            },
            guardando ? "Guardando…" : method ? "Guardar Cambios" : "Crear Envío Nacional",
          ),
        ),
      ),
    ),
  );
};

export default ShippingNacionalModal;
