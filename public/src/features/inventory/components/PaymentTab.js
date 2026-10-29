import { Icono } from "../../../components/Icono.js";
/**
 * public/src/features/inventory/components/PaymentTab.js
 * Módulo de gestión de métodos de pago - Pure JS Version
 */
import React, { useEffect, useState } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";
import ConfirmModal from "./ConfirmModal.js";

const e = React.createElement;

const PaymentTab = () => {
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMethod, setEditingMethod] = useState(null);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: "", message: "", onConfirm: () => {} });
  
  const [formData, setFormData] = useState({
    nombre: "",
    tipo: "transferencia",
    activo: true,
    detalles: {}
  });

  const fetchMethods = async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get("/api/admin/payments");
      if (data.success) {
        setMethods(data.data || []);
      }
    } catch (err) {
      console.error("❌ Error cargando métodos de pago:", err.message);
      window.showToast?.("Error cargando métodos de pago");
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
        nombre: method.nombre,
        tipo: method.tipo,
        activo: method.activo !== false,
        detalles: { ...(method.detalles || {}) }
      });
    } else {
      setEditingMethod(null);
      setFormData({
        nombre: "",
        tipo: "transferencia",
        activo: true,
        detalles: {}
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
      await apiClient.put(`/api/admin/payments/${method._id}`, {
        activo: nuevoEstado
      });
      fetchMethods();
      window.showToast?.(`Método ${nuevoEstado ? 'activado' : 'desactivado'}`);
    } catch (err) {
      window.showToast?.("Error al cambiar estado: " + err.message, "error");
    }
  };

  const handleSave = async (ev) => {
    if (ev) ev.preventDefault();
    try {
      if (editingMethod) {
        await apiClient.put(`/api/admin/payments/${editingMethod._id}`, formData);
      } else {
        await apiClient.post("/api/admin/payments", formData);
      }
      handleCloseModal();
      fetchMethods();
      window.showToast?.("Método de pago guardado");
    } catch (err) {
      window.showToast?.("Error al guardar: " + err.message, "error");
    }
  };

  const handleDelete = async (id) => {
    setConfirmConfig({
      isOpen: true,
      title: "¿Eliminar Método de Pago?",
      message: "¿Estás seguro de eliminar este método de pago?\n\nEsta acción no se puede deshacer.",
      onConfirm: async () => {
        try {
          await apiClient.delete(`/api/admin/payments/${id}`);
          fetchMethods();
          window.showToast?.("Método eliminado");
        } catch (err) {
          window.showToast?.("Error al eliminar: " + err.message, "error");
        }
      }
    });
  };

  const updateDetalle = (key, value) => {
    setFormData(prev => ({
      ...prev,
      detalles: {
        ...prev.detalles,
        [key]: value
      }
    }));
  };

  const getDetailLabel = (key) => {
    const labels = {
      banco: "Banco",
      numeroCuenta: "Número de Cuenta",
      titular: "Titular",
      cedula: "Cédula / RIF",
      tipoCuenta: "Tipo de Cuenta",
      telefono: "Teléfono",
      email: "Correo Electrónico",
      binanceId: "ID de Binance",
      instruccionesDePago: "Instrucciones de Pago",
    };
    return labels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
  };

  const renderInstructionsField = () => (
    e("div", { key: "instruccionesDePago" }, 
      e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Instrucciones de Pago"),
      e("textarea", { 
        value: formData.detalles.instruccionesDePago || "", 
        onChange: (ev) => updateDetalle("instruccionesDePago", ev.target.value),
        className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm h-24 resize-none",
        placeholder: "Ej: Enviar comprobante al WhatsApp..."
      })
    )
  );

  const renderDynamicFields = () => {
    const { tipo, detalles } = formData;
    
    switch(tipo) {
      case 'transferencia':
        return [
          e("div", { key: "banco" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Banco"),
            e("input", { 
              type: "text", value: detalles.banco || "", 
              onChange: (ev) => updateDetalle("banco", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm",
              placeholder: "Banesco, Mercantil, etc."
            })
          ),
          e("div", { key: "numeroCuenta" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Número de Cuenta"),
            e("input", { 
              type: "text", value: detalles.numeroCuenta || "", 
              onChange: (ev) => updateDetalle("numeroCuenta", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm",
              placeholder: "0102-XXXX-XX-XXXXXXXXXX"
            })
          ),
          e("div", { key: "titular" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Titular"),
            e("input", { 
              type: "text", value: detalles.titular || "", 
              onChange: (ev) => updateDetalle("titular", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            })
          ),
          e("div", { key: "cedula" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Cédula / RIF"),
            e("input", { 
              type: "text", value: detalles.cedula || "", 
              onChange: (ev) => updateDetalle("cedula", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            })
          ),
          e("div", { key: "tipoCuenta" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Tipo de Cuenta"),
            e("select", { 
              value: detalles.tipoCuenta || "Corriente", 
              onChange: (ev) => updateDetalle("tipoCuenta", ev.target.value),
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            },
              e("option", { value: "Corriente" }, "Corriente"),
              e("option", { value: "Ahorro" }, "Ahorro")
            )
          ),
          renderInstructionsField()
        ];
      case 'pago_movil':
        return [
          e("div", { key: "banco" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Banco"),
            e("input", { 
              type: "text", value: detalles.banco || "", 
              onChange: (ev) => updateDetalle("banco", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            })
          ),
          e("div", { key: "telefono" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Teléfono"),
            e("input", { 
              type: "text", value: detalles.telefono || "", 
              onChange: (ev) => updateDetalle("telefono", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            })
          ),
          e("div", { key: "cedula" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Cédula"),
            e("input", { 
              type: "text", value: detalles.cedula || "", 
              onChange: (ev) => updateDetalle("cedula", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            })
          ),
          renderInstructionsField()
        ];
      case 'zelle':
        return [
          e("div", { key: "email" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Correo Electrónico"),
            e("input", { 
              type: "email", value: detalles.email || "", 
              onChange: (ev) => updateDetalle("email", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            })
          ),
          e("div", { key: "titular" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Titular"),
            e("input", { 
              type: "text", value: detalles.titular || "", 
              onChange: (ev) => updateDetalle("titular", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            })
          ),
          renderInstructionsField()
        ];
      case 'binance':
        return [
          e("div", { key: "binanceId" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "ID de Binance"),
            e("input", { 
              type: "text", value: detalles.binanceId || "", 
              onChange: (ev) => updateDetalle("binanceId", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            })
          ),
          e("div", { key: "email" }, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Correo de Binance"),
            e("input", { 
              type: "email", value: detalles.email || "", 
              onChange: (ev) => updateDetalle("email", ev.target.value),
              required: true,
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm"
            })
          ),
          renderInstructionsField()
        ];
      case 'efectivo':
      case 'otro':
        return [
          renderInstructionsField()
        ];
      default:
        return null;
    }
  };

  if (loading && methods.length === 0)
    return e("div", { className: "p-10 text-center text-gray-400" }, 
      e(Icono, { nombre: "loader-circle", girar: true, className: "mr-2" }), "Cargando métodos de pago..."
    );

  return e(
    "div",
    { className: "p-4 md:p-6 bg-gray-50 dark:bg-gray-900 min-h-full pb-24" },
    
    // Header
    e("header", { className: "mb-6 flex justify-between items-center" }, 
      e("div", null,
        e("h2", { className: "text-2xl font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-3" },
          e(Icono, { nombre: "credit-card" }), "Métodos de Pago"
        ),
        e("p", { className: "text-[10px] text-gray-500 font-bold mt-1 uppercase" }, "Configura cómo quieres recibir pagos")
      ),
      e("button", { 
        onClick: () => handleOpenModal(),
        className: "bg-emerald-600 text-white px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition flex items-center gap-2 text-sm font-bold active:scale-95"
      }, e(Icono, { nombre: "plus" }), "Añadir Método")
    ),

    // Grid de Métodos (Cards)
    e("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" }, 
      methods.map(m => e("div", { key: m._id, className: `bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border ${m.activo ? 'border-gray-100 dark:border-gray-700' : 'border-gray-200 dark:border-gray-700 opacity-60'} transition-all hover:shadow-md` }, 
        e("div", { className: "flex justify-between items-start mb-4" }, 
          e("div", { className: "flex items-center gap-3" }, 
            e("div", { className: "w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600" }, 
              e(Icono, { nombre: m.tipo === 'zelle' ? "zap" : m.tipo === 'efectivo' ? "banknote" : "landmark" })
            ),
            e("div", null,
              e("h4", { className: "font-bold text-gray-800 dark:text-gray-100 leading-tight" }, m.nombre),
              e("p", { className: "text-[10px] font-black text-gray-400 uppercase tracking-tighter" }, m.tipo.replace('_', ' '))
            )
          ),
          e("button", { 
            onClick: () => handleToggleActivo(m),
            className: `w-12 h-6 rounded-full transition-colors relative ${m.activo ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`
          }, 
            e("div", { className: `absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${m.activo ? 'left-7' : 'left-1'}` })
          )
        ),
        
        // Detalles rápidos
        e("div", { className: "mb-5 space-y-1.5" }, 
          Object.entries(m.detalles || {}).map(([key, val]) => 
            e("div", { key, className: "flex justify-between text-xs" }, 
              e("span", { className: "text-gray-400 capitalize" }, key.replace('_', ' ')),
              e("span", { className: "text-gray-600 dark:text-gray-300 font-medium truncate max-w-[150px]" }, val)
            )
          )
        ),

        e("div", { className: "flex gap-2" }, 
          e("button", { 
            onClick: () => handleOpenModal(m),
            className: "flex-1 py-2 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-600 transition"
          }, "Editar"),
          e("button", { 
            onClick: () => handleDelete(m._id),
            className: "p-2 bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl hover:bg-red-100 transition"
          }, e(Icono, { nombre: "trash" }))
        )
      ))
    ),

    // Modal
    isModalOpen && e("div", { className: "fixed inset-0 bg-black/60 flex items-center justify-center z-[110] p-4 backdrop-blur-sm" }, 
      e("div", { className: "bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200" }, 
        e("div", { className: "p-6 border-b dark:border-gray-700 border-gray-100 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50" }, 
          e("h3", { className: "text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2" }, 
            e(Icono, { nombre: "credit-card", className: "text-emerald-500" }),
            editingMethod ? "Editar Método" : "Nuevo Método de Pago"
          ),
          e("button", { onClick: handleCloseModal, className: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition" }, e(Icono, { nombre: "x" }))
        ),
        e("form", { onSubmit: handleSave, className: "p-6 space-y-4" }, 
          e("div", null, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Nombre Público"),
            e("input", { 
              type: "text", value: formData.nombre, required: true,
              onChange: (ev) => setFormData({ ...formData, nombre: ev.target.value }),
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm",
              placeholder: "Ej: Pago Móvil Banesco"
            })
          ),
          e("div", null, 
            e("label", { className: "text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1" }, "Tipo de Pago"),
            e("select", { 
              value: formData.tipo, required: true,
              onChange: (ev) => setFormData({ ...formData, tipo: ev.target.value, detalles: {} }),
              className: "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-sm"
            }, 
              e("option", { value: "transferencia" }, "Transferencia Bancaria"),
              e("option", { value: "pago_movil" }, "Pago Móvil"),
              e("option", { value: "zelle" }, "Zelle"),
              e("option", { value: "binance" }, "Binance Pay"),
              e("option", { value: "efectivo" }, "Efectivo"),
              e("option", { value: "otro" }, "Otro")
            )
          ),
          
          // Campos dinámicos
          e("div", { className: "space-y-4 pt-2 border-t dark:border-gray-700 border-gray-50" }, 
            renderDynamicFields()
          ),

          e("div", { className: "pt-4 flex gap-3" }, 
            e("button", { type: "button", onClick: handleCloseModal, className: "flex-1 py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition" }, "Cancelar"),
            e("button", { type: "submit", className: "flex-1 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 transition" }, "Guardar")
          )
        )
      )
    ),

    // Confirm Modal
    e(ConfirmModal, { 
      ...confirmConfig, 
      onCancel: () => setConfirmConfig({ ...confirmConfig, isOpen: false }) 
    })
  );
};

export default PaymentTab;
