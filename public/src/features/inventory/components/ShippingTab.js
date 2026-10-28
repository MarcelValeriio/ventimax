/**
 * public/src/features/inventory/components/ShippingTab.js
 * Módulo de gestión de métodos de envío y despacho - Pure JS Version
 */
import React, { useEffect, useState } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";
import ConfirmModal from "./ConfirmModal.js";

const e = React.createElement;

const TIPOS_ENVIO = [
  { value: "delivery_local", label: "Delivery Local", icon: "fa-motorcycle" },
  { value: "envio_nacional", label: "Envío Nacional", icon: "fa-shipping-fast" },
  { value: "retiro_tienda", label: "Retiro en Tienda / Punto", icon: "fa-store" },
  { value: "otro", label: "Otro / Especial", icon: "fa-truck" },
];

const PIDE_DATOS_OPCIONES = [
  { value: "direccion", label: "Dirección de entrega" },
  { value: "agencia", label: "Datos de agencia / casillero" },
  { value: "ninguno", label: "Ninguno (Retiro presencial)" },
];

const ShippingTab = () => {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const [formData, setFormData] = useState({
    nombre: "",
    tipo: "delivery_local",
    descripcion: "",
    costoTipo: "a_convenir",
    costo: 0,
    pideDatos: "direccion",
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
      window.showToast?.("❌ Error cargando métodos de envío", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMethods();
  }, []);

  const handleOpenModal = (method = null) => {
    if (method) {
      setEditingMethod(method);
      setFormData({
        nombre: method.nombre || "",
        tipo: method.tipo || "delivery_local",
        descripcion: method.descripcion || "",
        costoTipo: method.costoTipo || "a_convenir",
        costo: Number(method.costo) || 0,
        pideDatos: method.pideDatos || "direccion",
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
        pideDatos: "direccion",
        activo: true,
        orden: 0,
      });
    }
    setIsModalOpen(true);
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
      window.showToast?.(`✅ Método ${nuevoEstado ? "activado" : "desactivado"}`);
    } catch (err) {
      window.showToast?.("❌ Error al cambiar estado: " + err.message, "error");
    }
  };

  const handleSave = async (ev) => {
    if (ev) ev.preventDefault();
    if (!formData.nombre.trim()) {
      window.showToast?.("⚠️ El nombre del método es obligatorio", "error");
      return;
    }
    if (formData.costoTipo === "fijo" && Number(formData.costo) < 0) {
      window.showToast?.("⚠️ El costo no puede ser negativo", "error");
      return;
    }

    try {
      const payload = {
        ...formData,
        costo: formData.costoTipo === "fijo" ? Number(formData.costo) : 0,
        orden: Number(formData.orden) || 0,
      };

      if (editingMethod) {
        await apiClient.put(`/api/admin/shipping/${editingMethod._id}`, payload);
      } else {
        await apiClient.post("/api/admin/shipping", payload);
      }
      handleCloseModal();
      fetchMethods();
      window.showToast?.("✅ Método de envío guardado");
    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      window.showToast?.("❌ Error al guardar: " + msg, "error");
    }
  };

  const handleDelete = (method) => {
    setConfirmConfig({
      isOpen: true,
      title: "¿Eliminar Método de Envío?",
      message: `⚠️ ¿Estás seguro de eliminar "${method.nombre}"?\n\nSi hay pedidos asociados, no se podrá borrar.`,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/api/admin/shipping/${method._id}`);
          fetchMethods();
          window.showToast?.("🗑️ Método de envío eliminado");
        } catch (err) {
          const msg = err.response?.data?.message || err.message;
          window.showToast?.("❌ " + msg, "error");
        }
      },
    });
  };

  const getTipoIcon = (tipo) => {
    const item = TIPOS_ENVIO.find((t) => t.value === tipo);
    return item ? item.icon : "fa-truck";
  };

  const getTipoLabel = (tipo) => {
    const item = TIPOS_ENVIO.find((t) => t.value === tipo);
    return item ? item.label : tipo.replace("_", " ");
  };

  const getPideDatosLabel = (val) => {
    const item = PIDE_DATOS_OPCIONES.find((p) => p.value === val);
    return item ? item.label : val;
  };

  if (loading && methods.length === 0) {
    return e(
      "div",
      { className: "p-10 text-center text-gray-400" },
      e("i", { className: "fas fa-spinner fa-spin mr-2" }),
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
          e("i", { className: "fas fa-truck" }),
          "Métodos de Envío",
        ),
        e(
          "p",
          { className: "text-[10px] text-gray-500 font-bold mt-1 uppercase" },
          "Configura las opciones de entrega y despacho disponibles para los clientes",
        ),
      ),
      e(
        "button",
        {
          onClick: () => handleOpenModal(),
          className:
            "bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition flex items-center gap-2 text-sm font-bold active:scale-95 cursor-pointer",
        },
        e("i", { className: "fas fa-plus" }),
        "Añadir Método",
      ),
    ),

    // Grid de Métodos
    methods.length === 0
      ? e(
          "div",
          { className: "text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-8" },
          e("i", { className: "fas fa-truck text-4xl text-gray-300 dark:text-gray-600 mb-3" }),
          e("p", { className: "text-gray-500 font-medium" }, "No hay métodos de envío configurados."),
          e(
            "button",
            {
              onClick: () => handleOpenModal(),
              className: "mt-4 text-emerald-600 hover:text-emerald-700 text-sm font-bold underline cursor-pointer",
            },
            "Crear el primer método de envío",
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
                      e("i", { className: `fas ${getTipoIcon(m.tipo)}` }),
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
                  e(
                    "div",
                    { className: "flex justify-between text-xs items-center" },
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
                    { className: "flex justify-between text-xs items-center" },
                    e("span", { className: "text-gray-400 font-medium" }, "Pide al cliente:"),
                    e(
                      "span",
                      { className: "text-gray-700 dark:text-gray-300 font-semibold text-right" },
                      getPideDatosLabel(m.pideDatos),
                    ),
                  ),
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
                    onClick: () => handleOpenModal(m),
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
                  e("i", { className: "fas fa-trash-alt" }),
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
              e("i", { className: "fas fa-truck text-emerald-500" }),
              editingMethod ? "Editar Método de Envío" : "Nuevo Método de Envío",
            ),
            e(
              "button",
              {
                onClick: handleCloseModal,
                className: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition cursor-pointer",
              },
              e("i", { className: "fas fa-times" }),
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
                TIPOS_ENVIO.map((t) => e("option", { key: t.value, value: t.value }, t.label)),
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

            // Modalidad de Costo
            e(
              "div",
              { className: "grid grid-cols-2 gap-3" },
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

            // Pide Datos
            e(
              "div",
              null,
              e(
                "label",
                { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" },
                "Datos que solicita el Bot",
              ),
              e(
                "select",
                {
                  value: formData.pideDatos,
                  onChange: (ev) => setFormData({ ...formData, pideDatos: ev.target.value }),
                  className:
                    "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm",
                },
                PIDE_DATOS_OPCIONES.map((p) => e("option", { key: p.value, value: p.value }, p.label)),
              ),
            ),

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
