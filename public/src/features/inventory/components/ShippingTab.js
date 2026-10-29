import { Icono } from "../../../components/Icono.js";
/**
 * public/src/features/inventory/components/ShippingTab.js
 * Módulo de gestión de métodos de envío y despacho - Pure JS Version
 */
import React, { useEffect, useState } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";
import ConfirmModal from "./ConfirmModal.js";
import ShippingNacionalModal, { LogoEmpresa, normalizarEmpresa } from "./ShippingNacionalModal.js";

const e = React.createElement;

// Tipos con empresas de envío (MRW, Zoom…): se editan en ShippingNacionalModal, cada empresa con su logo
const TIPOS_CON_EMPRESAS = ["envio_nacional", "otro"];

const TIPOS_ENVIO = [
  { value: "delivery_local", label: "Delivery Local", icon: "motorbike" },
  { value: "envio_nacional", label: "Envío Nacional", icon: "truck" },
  { value: "retiro", label: "Retiro en persona / tienda", icon: "store" },
  { value: "otro", label: "Otro / Especial", icon: "truck" },
];

const ShippingTab = () => {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [nacionalAbierto, setNacionalAbierto] = useState(false);
  const [editingNacional, setEditingNacional] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const [formData, setFormData] = useState({
    nombre: "",
    tipo: "delivery_local",
    descripcion: "",
    costoTipo: "a_convenir",
    costo: 0,
    pideDatos: "",
    direccion: "",
    horario: "",
    activo: true,
    orden: 0,
  });

  const fetchMethods = async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get("/api/admin/shipping");
      if (data.success) {
        setMethods(data.data || []);
      }
    } catch (err) {
      console.error("❌ Error cargando métodos de envío:", err.message);
      window.showToast?.("Error cargando métodos de envío", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMethods();
  }, []);

  // Delivery y retiro: modal de siempre
  const handleOpenModal = (method = null) => {
    if (method) {
      setEditingMethod(method);
      setFormData({
        nombre: method.nombre || "",
        tipo: method.tipo || "delivery_local",
        descripcion: method.descripcion || "",
        costoTipo: method.costoTipo || "a_convenir",
        costo: Number(method.costo) || 0,
        pideDatos: method.pideDatos || "",
        direccion: method.direccion || "",
        horario: method.horario || "",
        activo: method.activo !== false,
        orden: Number(method.orden) || 0,
      });
    } else {
      setEditingMethod(null);
      setFormData({
        nombre: "",
        tipo: "delivery_local",
        descripcion: "",
        costoTipo: "a_convenir",
        costo: 0,
        pideDatos: "",
        direccion: "",
        horario: "",
        activo: true,
        orden: 0,
      });
    }
    setIsModalOpen(true);
  };

  // Envío nacional y especiales: modal con empresas y logos
  const handleOpenNacional = (method = null) => {
    setEditingNacional(method);
    setNacionalAbierto(true);
  };

  // Al editar, el tipo decide qué modal se abre
  const handleEditar = (method) => {
    if (TIPOS_CON_EMPRESAS.includes(method.tipo)) {
      handleOpenNacional(method);
    } else {
      handleOpenModal(method);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  const handleToggleActivo = async (method) => {
    try {
      const nuevoEstado = !method.activo;
      await apiClient.put(`/api/admin/shipping/${method._id}`, {
        activo: nuevoEstado,
      });
      fetchMethods();
      window.showToast?.(`Método ${nuevoEstado ? "activado" : "desactivado"}`);
    } catch (err) {
      window.showToast?.("Error al cambiar estado: " + err.message, "error");
    }
  };

  const handleSave = async (ev) => {
    if (ev) ev.preventDefault();
    if (!formData.nombre.trim()) {
      window.showToast?.("El nombre del método es obligatorio", "error");
      return;
    }

    const isRetiro = formData.tipo === "retiro";
    if (isRetiro) {
      if (!formData.direccion || !formData.direccion.trim()) {
        window.showToast?.("La dirección es obligatoria para el método de retiro", "error");
        return;
      }
    } else {
      if (formData.costoTipo === "fijo" && Number(formData.costo) < 0) {
        window.showToast?.("El costo no puede ser negativo", "error");
        return;
      }
    }

    try {
      const payload = {
        ...formData,
        costoTipo: isRetiro ? "fijo" : formData.costoTipo,
        costo: isRetiro ? 0 : (formData.costoTipo === "fijo" ? Number(formData.costo) : 0),
        pideDatos: isRetiro ? "" : (formData.pideDatos ? formData.pideDatos.trim() : ""),
        direccion: isRetiro ? formData.direccion.trim() : (formData.direccion || "").trim(),
        horario: isRetiro ? (formData.horario || "").trim() : (formData.horario || "").trim(),
        orden: Number(formData.orden) || 0,
      };

      if (editingMethod) {
        await apiClient.put(`/api/admin/shipping/${editingMethod._id}`, payload);
      } else {
        await apiClient.post("/api/admin/shipping", payload);
      }
      handleCloseModal();
      fetchMethods();
      window.showToast?.("Método de envío guardado");
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      window.showToast?.("Error al guardar: " + msg, "error");
    }
  };

  const handleDelete = (method) => {
    setConfirmConfig({
      isOpen: true,
      title: "¿Eliminar Método de Envío?",
      message: `¿Estás seguro de eliminar "${method.nombre}"?\n\nSi hay pedidos asociados, no se podrá borrar.`,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/api/admin/shipping/${method._id}`);
          fetchMethods();
          window.showToast?.("Método de envío eliminado");
        } catch (err) {
          const msg = err.response?.data?.error || err.response?.data?.message || err.message;
          window.showToast?.("" + msg, "error");
        }
      },
    });
  };

  const getTipoIcon = (tipo) => {
    const item = TIPOS_ENVIO.find((t) => t.value === tipo);
    return item ? item.icon : "truck";
  };

  const getTipoLabel = (tipo) => {
    const item = TIPOS_ENVIO.find((t) => t.value === tipo);
    return item ? item.label : tipo.replace("_", " ");
  };

  if (loading && methods.length === 0) {
    return e(
      "div",
      { className: "p-10 text-center text-gray-400" },
      e(Icono, { nombre: "loader-circle", girar: true, className: "mr-2" }),
      "Cargando métodos de envío...",
    );
  }

  return e(
    "div",
    { className: "p-4 md:p-6 bg-gray-50 dark:bg-gray-900 min-h-full pb-24" },

    // Header
    e(
      "header",
      { className: "mb-6 flex justify-between items-center" },
      e(
        "div",
        null,
        e(
          "h2",
          { className: "text-2xl font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-3" },
          e(Icono, { nombre: "truck" }),
          "Métodos de Envío",
        ),
        e(
          "p",
          { className: "text-[10px] text-gray-500 font-bold mt-1 uppercase" },
          "Configura las opciones de entrega y despacho disponibles para los clientes",
        ),
      ),
      e(
        "div",
        { className: "flex flex-wrap justify-end gap-2" },
        e(
          "button",
          {
            onClick: () => handleOpenModal(),
            "aria-label": "Crear un delivery o retiro",
            className:
              "bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition flex items-center gap-2 text-sm font-bold active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none",
          },
          e(Icono, { nombre: "plus" }),
          "Nuevo delivery o retiro",
        ),
        e(
          "button",
          {
            onClick: () => handleOpenNacional(),
            "aria-label": "Crear un envío nacional con empresas",
            className:
              "bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-400 border border-emerald-600 px-4 py-2.5 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition flex items-center gap-2 text-sm font-bold active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:outline-none",
          },
          e(Icono, { nombre: "truck" }),
          "Nuevo envío nacional",
        ),
      ),
    ),

    // Grid de Métodos
    methods.length === 0
      ? e(
          "div",
          { className: "text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-8" },
          e(Icono, { nombre: "truck", className: "text-4xl text-gray-300 dark:text-gray-600 mb-3" }),
          e("p", { className: "text-gray-500 font-medium" }, "No hay métodos de envío configurados."),
          e(
            "div",
            { className: "mt-4 flex flex-wrap justify-center gap-4" },
            e(
              "button",
              {
                onClick: () => handleOpenModal(),
                className: "text-emerald-600 hover:text-emerald-700 text-sm font-bold underline cursor-pointer",
              },
              "Crear un delivery o retiro",
            ),
            e(
              "button",
              {
                onClick: () => handleOpenNacional(),
                className: "text-emerald-600 hover:text-emerald-700 text-sm font-bold underline cursor-pointer",
              },
              "Crear un envío nacional",
            ),
          ),
        )
      : e(
          "div",
          { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" },
          methods.map((m) =>
            e(
              "div",
              {
                key: m._id,
                className: `bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border ${
                  m.activo ? "border-gray-100 dark:border-gray-700" : "border-gray-200 dark:border-gray-700 opacity-60"
                } transition-all hover:shadow-md flex flex-col justify-between`,
              },
              e("div", null, [
                // Cabecera de tarjeta
                e(
                  "div",
                  { key: "card-head", className: "flex justify-between items-start mb-4" },
                  e(
                    "div",
                    { className: "flex items-center gap-3" },
                    e(
                      "div",
                      {
                        className:
                          "w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600",
                      },
                      e(Icono, { nombre: getTipoIcon(m.tipo) }),
                    ),
                    e(
                      "div",
                      null,
                      e("h4", { className: "font-bold text-gray-800 dark:text-gray-100 leading-tight" }, m.nombre),
                      e(
                        "p",
                        { className: "text-[10px] font-black text-gray-400 uppercase tracking-tighter" },
                        getTipoLabel(m.tipo),
                      ),
                    ),
                  ),
                  e(
                    "button",
                    {
                      onClick: () => handleToggleActivo(m),
                      title: m.activo ? "Desactivar método" : "Activar método",
                      className: `w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                        m.activo ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                      }`,
                    },
                    e("div", {
                      className: `absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                        m.activo ? "left-7" : "left-1"
                      }`,
                    }),
                  ),
                ),

                // Descripción si existe
                m.descripcion
                  ? e(
                      "p",
                      { key: "desc", className: "text-xs text-gray-500 dark:text-gray-400 mb-3 italic" },
                      m.descripcion,
                    )
                  : null,

                // Detalles
                e(
                  "div",
                  { key: "detalles", className: "mb-5 space-y-2 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700/50" },
                  m.tipo === "retiro"
                    ? [
                        e(
                          "div",
                          { key: "costo-ret", className: "flex justify-between text-xs items-center" },
                          e("span", { className: "text-gray-400 font-medium" }, "Costo:"),
                          e("span", { className: "font-bold text-emerald-600 dark:text-emerald-400" }, "Gratis ($0.00)"),
                        ),
                        e(
                          "div",
                          { key: "dir-ret", className: "flex justify-between text-xs items-start gap-2" },
                          e("span", { className: "text-gray-400 font-medium whitespace-nowrap" }, "Dirección:"),
                          e("span", { className: "text-gray-700 dark:text-gray-300 font-semibold text-right text-[11px]" }, m.direccion || "No especificada"),
                        ),
                        e(
                          "div",
                          { key: "hor-ret", className: "flex justify-between text-xs items-center" },
                          e("span", { className: "text-gray-400 font-medium" }, "Horario:"),
                          e("span", { className: "text-gray-600 dark:text-gray-400 text-right text-[11px]" }, m.horario || "Horario de atención"),
                        ),
                      ]
                    : [
                        e(
                          "div",
                          { key: "costo-del", className: "flex justify-between text-xs items-center" },
                          e("span", { className: "text-gray-400 font-medium" }, "Costo:"),
                          e(
                            "span",
                            {
                              className: `font-bold ${
                                m.costoTipo === "fijo"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-amber-600 dark:text-amber-400"
                              }`,
                            },
                            m.costoTipo === "fijo"
                              ? `$${Number(m.costo || 0).toFixed(2)} USD`
                              : "A convenir con el asesor",
                          ),
                        ),
                        e(
                          "div",
                          { key: "pide-del", className: "flex justify-between text-xs items-center" },
                          e("span", { className: "text-gray-400 font-medium" }, "Pide al cliente:"),
                          e(
                            "span",
                            { className: "text-gray-700 dark:text-gray-300 font-semibold text-right truncate max-w-[160px]" },
                            m.pideDatos && m.pideDatos.trim() ? m.pideDatos : "Dirección habitual",
                          ),
                        ),
                        TIPOS_CON_EMPRESAS.includes(m.tipo) && Array.isArray(m.empresas) && m.empresas.map(normalizarEmpresa).some((x) => x.nombre)
                          ? e(
                              "div",
                              { key: "empresas-del", className: "flex justify-between gap-3 text-xs items-start" },
                              e("span", { className: "text-gray-400 font-medium shrink-0" }, "Empresas:"),
                              e(
                                "div",
                                { className: "flex flex-wrap justify-end gap-1.5" },
                                m.empresas
                                  .map(normalizarEmpresa)
                                  .filter((x) => x.nombre)
                                  .map((empresa, i) => e(LogoEmpresa, { key: `${empresa.nombre}-${i}`, empresa })),
                              ),
                            )
                          : null,
                        m.cobroADestino
                          ? e(
                              "div",
                              { key: "cobro-del", className: "flex justify-between text-xs items-center" },
                              e("span", { className: "text-gray-400 font-medium" }, "Pago del envío:"),
                              e("span", { className: "text-amber-600 dark:text-amber-400 font-semibold" }, "Cobro a destino"),
                            )
                          : null,
                      ],
                  m.orden !== undefined && m.orden !== 0
                    ? e(
                        "div",
                        { className: "flex justify-between text-xs items-center" },
                        e("span", { className: "text-gray-400 font-medium" }, "Prioridad orden:"),
                        e("span", { className: "text-gray-500 text-right" }, m.orden),
                      )
                    : null,
                ),
              ]),

              // Botones de acción
              e(
                "div",
                { className: "flex gap-2 mt-2" },
                e(
                  "button",
                  {
                    onClick: () => handleEditar(m),
                    className:
                      "flex-1 py-2 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-600 transition cursor-pointer",
                  },
                  "Editar",
                ),
                e(
                  "button",
                  {
                    onClick: () => handleDelete(m),
                    title: "Eliminar método",
                    className:
                      "p-2 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl hover:bg-red-100 transition cursor-pointer",
                  },
                  e(Icono, { nombre: "trash" }),
                ),
              ),
            ),
          ),
        ),

    // Modal de Creación / Edición
    isModalOpen &&
      e(
        "div",
        {
          className:
            "fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4 backdrop-blur-sm",
        },
        e(
          "div",
          {
            className:
              "bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200",
          },
          // Header Modal
          e(
            "div",
            {
              className:
                "p-6 border-b dark:border-gray-700 border-gray-100 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50",
            },
            e(
              "h3",
              { className: "text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2" },
              e(Icono, { nombre: "truck", className: "text-emerald-500" }),
              editingMethod ? "Editar Método de Envío" : "Nuevo Método de Envío",
            ),
            e(
              "button",
              {
                onClick: handleCloseModal,
                className: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition cursor-pointer",
              },
              e(Icono, { nombre: "x" }),
            ),
          ),

          // Formulario
          e(
            "form",
            { onSubmit: handleSave, className: "p-6 space-y-4" },
            // Nombre
            e(
              "div",
              null,
              e(
                "label",
                { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" },
                "Nombre Público",
              ),
              e("input", {
                type: "text",
                value: formData.nombre,
                required: true,
                onChange: (ev) => setFormData({ ...formData, nombre: ev.target.value }),
                className:
                  "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm",
                placeholder: "Ej: Delivery Caracas o MRW Nacional",
              }),
            ),

            // Tipo
            e(
              "div",
              null,
              e(
                "label",
                { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" },
                "Tipo de Envío",
              ),
              e(
                "select",
                {
                  value: formData.tipo,
                  onChange: (ev) => setFormData({ ...formData, tipo: ev.target.value }),
                  className:
                    "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm",
                },
                // Al crear, envío nacional y especiales se eligen con su propio botón (modal con empresas)
                TIPOS_ENVIO.filter((t) => !TIPOS_CON_EMPRESAS.includes(t.value)).map((t) =>
                  e("option", { key: t.value, value: t.value }, t.label),
                ),
              ),
            ),

            // Descripción
            e(
              "div",
              null,
              e(
                "label",
                { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" },
                "Descripción / Instrucciones (Opcional)",
              ),
              e("textarea", {
                value: formData.descripcion,
                rows: 2,
                onChange: (ev) => setFormData({ ...formData, descripcion: ev.target.value }),
                className:
                  "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm resize-none",
                placeholder: "Ej: Motorizado de confianza en Gran Caracas",
              }),
            ),

            // Campos específicos según tipo (Retiro vs Delivery/Nacional/Otro)
            formData.tipo === "retiro"
              ? [
                  e(
                    "div",
                    { key: "input-direccion-retiro" },
                    e(
                      "label",
                      { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" },
                      "Dirección del Punto de Retiro *",
                    ),
                    e("textarea", {
                      rows: 2,
                      maxLength: 200,
                      required: true,
                      value: formData.direccion || "",
                      onChange: (ev) => setFormData({ ...formData, direccion: ev.target.value }),
                      className:
                        "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm resize-none",
                      placeholder: "Dirección exacta del punto de retiro",
                    }),
                  ),
                  e(
                    "div",
                    { key: "input-horario-retiro" },
                    e(
                      "label",
                      { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" },
                      "Horario de Retiro (Opcional)",
                    ),
                    e("input", {
                      type: "text",
                      maxLength: 100,
                      value: formData.horario || "",
                      onChange: (ev) => setFormData({ ...formData, horario: ev.target.value }),
                      className:
                        "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm",
                      placeholder: "Ej: Lunes a Viernes de 9:00 am a 4:00 pm",
                    }),
                    e(
                      "p",
                      { className: "text-[11px] text-gray-400 mt-1" },
                      "Si lo dejas vacío, se usa el horario de atención configurado.",
                    ),
                  ),
                ]
              : [
                  // Modalidad de Costo
                  e(
                    "div",
                    { key: "modalidad-costo-grid", className: "grid grid-cols-2 gap-3" },
                    e(
                      "div",
                      null,
                      e(
                        "label",
                        { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" },
                        "Modalidad de Costo",
                      ),
                      e(
                        "select",
                        {
                          value: formData.costoTipo,
                          onChange: (ev) => setFormData({ ...formData, costoTipo: ev.target.value }),
                          className:
                            "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm",
                        },
                        e("option", { value: "a_convenir" }, "A convenir con asesor"),
                        e("option", { value: "fijo" }, "Costo Fijo ($)"),
                      ),
                    ),
                    formData.costoTipo === "fijo"
                      ? e(
                          "div",
                          null,
                          e(
                            "label",
                            { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" },
                            "Monto en USD ($)",
                          ),
                          e("input", {
                            type: "number",
                            min: "0",
                            step: "0.01",
                            value: formData.costo,
                            required: true,
                            onChange: (ev) => setFormData({ ...formData, costo: parseFloat(ev.target.value) || 0 }),
                            className:
                              "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm",
                          }),
                        )
                      : e(
                          "div",
                          null,
                          e(
                            "label",
                            { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" },
                            "Detalle del Costo",
                          ),
                          e("input", {
                            type: "text",
                            disabled: true,
                            value: "Se acuerda con el cliente",
                            className:
                              "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-100 dark:bg-gray-900/50 text-gray-400 text-sm cursor-not-allowed",
                          }),
                        ),
                  ),

                  // Datos que pide el bot
                  e(
                    "div",
                    { key: "input-pide-datos" },
                    e(
                      "label",
                      { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" },
                      "Datos que solicita el Bot (Opcional)",
                    ),
                    e("input", {
                      type: "text",
                      maxLength: 120,
                      value: formData.pideDatos || "",
                      onChange: (ev) => setFormData({ ...formData, pideDatos: ev.target.value }),
                      className:
                        "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm",
                      placeholder: "ej: estado, ciudad y agencia de envío",
                    }),
                    e(
                      "p",
                      { className: "text-[11px] text-gray-400 mt-1" },
                      "Si lo dejas vacío, el bot pedirá la dirección de entrega habitual.",
                    ),
                  ),

                ],

            // Orden y Activo
            e(
              "div",
              { className: "flex justify-between items-center pt-2" },
              e(
                "div",
                { className: "flex items-center gap-2" },
                e(
                  "label",
                  { className: "text-xs font-bold text-gray-600 dark:text-gray-300" },
                  "Prioridad de orden:",
                ),
                e("input", {
                  type: "number",
                  value: formData.orden,
                  onChange: (ev) => setFormData({ ...formData, orden: parseInt(ev.target.value, 10) || 0 }),
                  className:
                    "w-16 p-1.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 dark:text-gray-100 text-center text-xs",
                }),
              ),
              e(
                "label",
                { className: "flex items-center gap-2 cursor-pointer text-xs font-bold text-gray-700 dark:text-gray-300" },
                e("input", {
                  type: "checkbox",
                  checked: formData.activo,
                  onChange: (ev) => setFormData({ ...formData, activo: ev.target.checked }),
                  className: "w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500",
                }),
                "Método Activo",
              ),
            ),

            // Botones de footer
            e(
              "div",
              { className: "flex gap-3 pt-4 border-t dark:border-gray-700" },
              e(
                "button",
                {
                  type: "button",
                  onClick: handleCloseModal,
                  className:
                    "flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-bold hover:bg-gray-200 dark:hover:bg-gray-600 transition cursor-pointer",
                },
                "Cancelar",
              ),
              e(
                "button",
                {
                  type: "submit",
                  className:
                    "flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition cursor-pointer",
                },
                editingMethod ? "Guardar Cambios" : "Crear Método",
              ),
            ),
          ),
        ),
      ),

    // Modal de envío nacional y especiales (empresas con logo)
    e(ShippingNacionalModal, {
      isOpen: nacionalAbierto,
      method: editingNacional,
      onClose: () => setNacionalAbierto(false),
      onSaved: () => {
        setNacionalAbierto(false);
        fetchMethods();
      },
    }),

    // Modal de Confirmación
    e(ConfirmModal, {
      isOpen: confirmConfig.isOpen,
      title: confirmConfig.title,
      message: confirmConfig.message,
      onConfirm: confirmConfig.onConfirm,
      onCancel: () => setConfirmConfig({ ...confirmConfig, isOpen: false }),
    }),
  );
};

export default ShippingTab;
