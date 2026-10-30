import { Icono } from "../../components/Icono.js";
// public/src/features/dashboard/FaqManager.js
import React, { useState, useEffect, useCallback } from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js";
import ConfirmModal from "../inventory/components/ConfirmModal.js";

const e = React.createElement;

/**
 * FaqManager — Panel de Administración de Preguntas Frecuentes (FAQs)
 * Permite configurar respuestas automáticas locales por palabras clave (estáticas o dinámicas por inventario).
 */
const FaqManager = ({ onBack }) => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    pregunta: "",
    keywords: "",
    respuesta: "",
    type: "estatica",
    dynamicKey: "",
    activo: true,
    order: 0,
  });
  const [saving, setSaving] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const fetchFaqs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get("/api/admin/faqs");
      if (res.data?.success) setFaqs(res.data.data || []);
    } catch (err) {
      window.showToast?.("Error cargando preguntas frecuentes", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFaqs();
  }, [fetchFaqs]);

  // ── CRUD handlers ──
  const openNew = () => {
    setEditing(null);
    setForm({
      pregunta: "",
      keywords: "",
      respuesta: "",
      type: "estatica",
      dynamicKey: "",
      activo: true,
      order: faqs.length,
    });
    setShowForm(true);
  };

  const openEdit = (faq) => {
    setEditing(faq);
    setForm({
      pregunta: faq.pregunta || "",
      keywords: Array.isArray(faq.keywords) ? faq.keywords.join(", ") : "",
      respuesta: faq.respuesta || "",
      type: faq.type || "estatica",
      dynamicKey: faq.dynamicKey || (faq.type === "dinamica" ? "sabores" : ""),
      activo: faq.activo !== false,
      order: faq.order || 0,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleSave = async (evt) => {
    if (evt && evt.preventDefault) evt.preventDefault();
    if (!form.pregunta.trim()) {
      return window.showToast?.("La pregunta o título es obligatoria", "error");
    }
    if (form.type === "estatica" && !form.respuesta.trim()) {
      return window.showToast?.("La respuesta es obligatoria para FAQs estáticas", "error");
    }

    const payload = {
      pregunta: form.pregunta.trim(),
      keywords: form.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      respuesta: form.type === "dinamica" ? (form.respuesta.trim() || "Consultando productos disponibles...") : form.respuesta.trim(),
      type: form.type,
      dynamicKey: form.type === "dinamica" ? (form.dynamicKey.trim() || "sabores") : null,
      activo: Boolean(form.activo),
      order: Number(form.order) || 0,
    };

    try {
      setSaving(true);
      if (editing) {
        await apiClient.put(`/api/admin/faqs/${editing._id}`, payload);
        window.showToast?.("Pregunta frecuente actualizada", "success");
      } else {
        await apiClient.post("/api/admin/faqs", payload);
        window.showToast?.("Pregunta frecuente creada", "success");
      }
      closeForm();
      fetchFaqs();
    } catch (err) {
      window.showToast?.(
        "Error al guardar: " + (err.response?.data?.error || err.message),
        "error"
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (faq) => {
    try {
      await apiClient.put(`/api/admin/faqs/${faq._id}`, { activo: !faq.activo });
      fetchFaqs();
    } catch (err) {
      window.showToast?.("Error al cambiar estado", "error");
    }
  };

  const handleDelete = (faq) => {
    setConfirmConfig({
      isOpen: true,
      title: "¿Eliminar pregunta frecuente?",
      message: `"${faq.pregunta}"\n\nEsta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/api/admin/faqs/${faq._id}`);
          window.showToast?.("Pregunta frecuente eliminada", "success");
          fetchFaqs();
        } catch (err) {
          window.showToast?.(
            "Error al eliminar: " + (err.response?.data?.error || err.message),
            "error"
          );
        }
      },
    });
  };

  const filteredFaqs = faqs.filter((faq) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    const preguntaMatch = (faq.pregunta || "").toLowerCase().includes(q);
    const respuestaMatch = (faq.respuesta || "").toLowerCase().includes(q);
    const keywordsMatch = Array.isArray(faq.keywords) &&
      faq.keywords.some((k) => (k || "").toLowerCase().includes(q));
    return preguntaMatch || respuestaMatch || keywordsMatch;
  });

  return e("div", { className: "h-full flex flex-col bg-gray-50 dark:bg-gray-900" }, [
    // Header
    e("div", {
      key: "header",
      className: "flex items-center gap-3 px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 shadow-xs",
    }, [
      e("button", {
        key: "back",
        onClick: onBack,
        "aria-label": "Volver a Configuración",
        className: "p-2 rounded-xl text-gray-500 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-gray-700 dark:hover:text-teal-400 transition active:scale-95",
      }, e(Icono, { nombre: "arrow-left", className: "text-base", "aria-hidden": "true" })),
      e("div", { key: "title-wrap", className: "flex items-center gap-3" }, [
        e("div", {
          className: "w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center text-lg",
        }, e(Icono, { nombre: "circle-question-mark", "aria-hidden": "true" })),
        e("div", null, [
          e("h2", { className: "text-lg font-black text-gray-800 dark:text-white tracking-tight" }, "Preguntas Frecuentes (FAQs)"),
          e("p", { className: "text-xs text-gray-500 dark:text-gray-400 font-medium" }, "Respuestas automáticas por palabras clave"),
        ]),
      ]),
      e("span", { key: "spacer", className: "flex-1" }),
      e("button", {
        key: "add",
        onClick: openNew,
        className: "bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 shadow-md shadow-teal-600/20 flex items-center gap-2",
      }, [
        e(Icono, { nombre: "plus", "aria-hidden": "true" }),
        "Nueva FAQ",
      ]),
    ]),

    // Toolbar / Search
    e("div", {
      key: "toolbar",
      className: "px-6 py-3 bg-white dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800 flex items-center gap-4",
    }, [
      e("div", { className: "relative flex-1 max-w-md" }, [
        e(Icono, {
          nombre: "search", className: "absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm",
          "aria-hidden": "true",
        }),
        e("input", {
          type: "text",
          value: searchQuery,
          onChange: (ev) => setSearchQuery(ev.target.value),
          placeholder: "Buscar por pregunta, respuesta o palabra clave...",
          className: "w-full pl-10 pr-4 py-2 bg-gray-100 dark:bg-gray-700/60 border-0 rounded-xl text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:ring-2 focus:ring-teal-500 outline-none transition",
        }),
        searchQuery && e("button", {
          onClick: () => setSearchQuery(""),
          "aria-label": "Limpiar búsqueda",
          className: "absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200",
        }, e(Icono, { nombre: "circle-x", className: "text-sm", "aria-hidden": "true" })),
      ]),
      e("span", { className: "text-xs font-bold text-gray-400" }, `${filteredFaqs.length} ${filteredFaqs.length === 1 ? "FAQ" : "FAQs"}`),
    ]),

    // Content Area
    e("div", { key: "content", className: "flex-1 overflow-y-auto p-6" }, [
      loading && e("div", { className: "flex items-center justify-center h-48 text-gray-400 gap-3" }, [
        e(Icono, { nombre: "loader-circle", girar: true, className: "text-xl", "aria-hidden": "true" }),
        e("span", { className: "text-sm font-medium" }, "Cargando preguntas frecuentes..."),
      ]),

      !loading && filteredFaqs.length === 0 && e("div", {
        className: "flex flex-col items-center justify-center h-64 text-center p-8 bg-white dark:bg-gray-800 rounded-[2rem] border border-gray-100 dark:border-gray-700 max-w-md mx-auto my-8",
      }, [
        e("div", {
          className: "w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 text-2xl mb-4",
        }, e(Icono, { nombre: "circle-question-mark", "aria-hidden": "true" })),
        e("h3", { className: "text-base font-bold text-gray-800 dark:text-white mb-1" }, searchQuery ? "No se encontraron FAQs" : "No hay preguntas frecuentes registradas"),
        e("p", { className: "text-xs text-gray-500 dark:text-gray-400 mb-5 max-w-xs" }, searchQuery ? "Prueba con otros términos de búsqueda." : "Crea respuestas automáticas para responder dudas comunes de clientes al instante."),
        !searchQuery && e("button", {
          onClick: openNew,
          className: "bg-teal-600 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-teal-700 transition active:scale-95",
        }, "+ Crear Primera FAQ"),
      ]),

      !loading && filteredFaqs.length > 0 && e("div", {
        className: "max-w-4xl mx-auto space-y-4",
      }, filteredFaqs.map((faq) =>
        e("div", {
          key: faq._id,
          className: `p-5 rounded-[1.5rem] bg-white dark:bg-gray-800 border transition-all duration-200 shadow-xs hover:shadow-md flex flex-col md:flex-row md:items-start justify-between gap-4 ${faq.activo !== false ? 'border-gray-100 dark:border-gray-700' : 'border-gray-200 dark:border-gray-750 opacity-60'}`
        }, [
          e("div", { className: "flex-1 space-y-2.5" }, [
            e("div", { className: "flex items-center gap-3 flex-wrap" }, [
              e("h4", { className: "font-black text-gray-800 dark:text-white text-base tracking-tight" }, faq.pregunta),
              faq.type === "dinamica" && e("span", {
                className: "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 flex items-center gap-1",
              }, [
                e(Icono, { nombre: "refresh-cw", className: "text-[9px]", "aria-hidden": "true" }),
                `Dinámica (${faq.dynamicKey || "inventario"})`,
              ]),
              e("span", {
                className: `px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${faq.activo !== false ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`,
              }, faq.activo !== false ? "Activo" : "Inactivo"),
            ]),
            // Keywords
            e("div", { className: "flex items-center gap-1.5 flex-wrap" }, [
              e("span", { className: "text-[11px] font-bold text-gray-400 flex items-center gap-1 mr-1" }, [
                e(Icono, { nombre: "key", className: "text-[10px]", "aria-hidden": "true" }),
                "Keywords:",
              ]),
              Array.isArray(faq.keywords) && faq.keywords.length > 0
                ? faq.keywords.map((kw, idx) =>
                    e("span", {
                      key: idx,
                      className: "bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/40 px-2 py-0.5 rounded-lg text-xs font-semibold",
                    }, kw)
                  )
                : e("span", { className: "text-xs italic text-gray-400" }, "Sin palabras clave asignadas"),
            ]),
            // Respuesta
            e("div", {
              className: "p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed",
            }, faq.type === "dinamica"
              ? `[Respuesta en Tiempo Real]: Consultará los productos en stock del catálogo en el momento del mensaje.`
              : faq.respuesta
            ),
          ]),

          // Action Buttons
          e("div", { className: "flex md:flex-col items-center gap-2 self-end md:self-start pt-2 md:pt-0" }, [
            e("button", {
              onClick: () => handleToggleActive(faq),
              title: faq.activo !== false ? "Desactivar respuesta" : "Activar respuesta",
              "aria-label": faq.activo !== false ? "Desactivar respuesta" : "Activar respuesta",
              className: `w-9 h-9 rounded-xl flex items-center justify-center transition active:scale-95 ${faq.activo !== false ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 hover:bg-emerald-100' : 'bg-gray-100 text-gray-400 dark:bg-gray-700 hover:bg-gray-200'}`,
            }, e(Icono, { nombre: faq.activo !== false ? "toggle-right" : "toggle-left", className: "text-base", "aria-hidden": "true" })),
            e("button", {
              onClick: () => openEdit(faq),
              title: "Editar FAQ",
              "aria-label": "Editar FAQ",
              className: "w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 flex items-center justify-center transition active:scale-95",
            }, e(Icono, { nombre: "square-pen", className: "text-sm", "aria-hidden": "true" })),
            e("button", {
              onClick: () => handleDelete(faq),
              title: "Eliminar FAQ",
              "aria-label": "Eliminar FAQ",
              className: "w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center transition active:scale-95",
            }, e(Icono, { nombre: "trash", className: "text-sm", "aria-hidden": "true" })),
          ]),
        ])
      )),
    ]),

    // Modal Form (Crear / Editar)
    showForm && e("div", {
      className: "fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "faq-modal-title",
      onClick: (ev) => { if (ev.target === ev.currentTarget) closeForm(); },
    }, [
      e("div", {
        className: "bg-white dark:bg-gray-800 rounded-[2rem] p-6 md:p-8 max-w-lg w-full shadow-2xl border border-gray-100 dark:border-gray-700 animate-in fade-in zoom-in duration-150 space-y-6",
      }, [
        // Modal Header
        e("div", { className: "flex items-center justify-between" }, [
          e("div", null, [
            e("p", { className: "text-[10px] font-black text-teal-600 dark:text-teal-400 uppercase tracking-widest mb-1" }, editing ? "Editar" : "Nueva"),
            e("h3", { id: "faq-modal-title", className: "text-2xl font-black text-gray-800 dark:text-white tracking-tight" }, editing ? "Editar FAQ" : "Crear FAQ"),
          ]),
          e("button", {
            onClick: closeForm,
            "aria-label": "Cerrar modal",
            className: "w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex items-center justify-center transition active:scale-95",
          }, e(Icono, { nombre: "x", "aria-hidden": "true" })),
        ]),

        // Form Fields
        e("form", { onSubmit: handleSave, className: "space-y-4" }, [
          // Tipo de FAQ
          e("div", { className: "space-y-1.5" }, [
            e("label", { className: "block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider" }, "Tipo de Respuesta"),
            e("select", {
              value: form.type,
              onChange: (ev) => setForm({ ...form, type: ev.target.value, dynamicKey: ev.target.value === "dinamica" ? "sabores" : "" }),
              className: "w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 transition",
            }, [
              e("option", { value: "estatica" }, "Estática (Texto Fijo)"),
              e("option", { value: "dinamica" }, "Dinámica (productos en stock desde el inventario)"),
            ]),
          ]),

          // Pregunta
          e("div", { className: "space-y-1.5" }, [
            e("div", { className: "flex items-center justify-between" }, [
              e("label", { className: "block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider" }, "Pregunta o Título"),
              e("span", {
                className: `text-[11px] font-bold ${
                  (form.pregunta || "").length > 24
                    ? "text-amber-500 dark:text-amber-400"
                    : "text-gray-400 dark:text-gray-500"
                }`
              }, `${(form.pregunta || "").length}/24 chars`),
            ]),
            e("input", {
              type: "text",
              required: true,
              value: form.pregunta,
              onChange: (ev) => setForm({ ...form, pregunta: ev.target.value }),
              placeholder: "¿Qué productos tienen?",
              className: "w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 transition",
            }),
            e("p", { className: "text-[11px] text-gray-500 dark:text-gray-400" }, "Recomendado máximo 24 caracteres para que se vea completo en la lista de WhatsApp."),
          ]),

          // Keywords
          e("div", { className: "space-y-1.5" }, [
            e("label", { className: "block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider" }, "Palabras clave (Keywords)"),
            e("input", {
              type: "text",
              value: form.keywords,
              onChange: (ev) => setForm({ ...form, keywords: ev.target.value }),
              placeholder: "productos, catálogo, que tienen, disponibles",
              className: "w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 transition",
            }),
            e("p", { className: "text-[11px] text-gray-500 dark:text-gray-400" }, "Separa las palabras o frases con comas. La búsqueda no distingue mayúsculas ni tildes."),
          ]),

          // Respuesta (solo si es estática)
          form.type === "estatica" && e("div", { className: "space-y-1.5" }, [
            e("label", { className: "block text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider" }, "Respuesta Automática"),
            e("textarea", {
              required: true,
              rows: 4,
              value: form.respuesta,
              onChange: (ev) => setForm({ ...form, respuesta: ev.target.value }),
              placeholder: "Escribe aquí la respuesta que se enviará automáticamente.",
              className: "w-full px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 rounded-xl text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 transition resize-none",
            }),
          ]),

          // Mensaje informativo si es dinámica
          form.type === "dinamica" && e("div", {
            className: "p-4 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/40 text-xs text-teal-800 dark:text-teal-300 flex items-start gap-3",
          }, [
            e(Icono, { nombre: "info", className: "text-sm mt-0.5", "aria-hidden": "true" }),
            e("span", null, "Esta respuesta se generará en tiempo real consultando los productos con stock activo en el inventario."),
          ]),

          // Activo Checkbox
          e("div", { className: "flex items-center gap-3 pt-2" }, [
            e("input", {
              type: "checkbox",
              id: "faq-activo-checkbox",
              checked: form.activo,
              onChange: (ev) => setForm({ ...form, activo: ev.target.checked }),
              className: "w-4 h-4 text-teal-600 rounded border-gray-300 focus:ring-teal-500",
            }),
            e("label", {
              htmlFor: "faq-activo-checkbox",
              className: "text-sm font-bold text-gray-700 dark:text-gray-300 cursor-pointer",
            }, "Activar respuesta automática"),
          ]),

          // Modal Actions
          e("div", { className: "flex items-center justify-end gap-3 pt-4 border-t dark:border-gray-700" }, [
            e("button", {
              type: "button",
              onClick: closeForm,
              className: "px-5 py-2.5 rounded-xl text-xs font-black text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 uppercase tracking-wider transition",
            }, "Cancelar"),
            e("button", {
              type: "submit",
              disabled: saving,
              className: "bg-teal-600 hover:bg-teal-700 text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition active:scale-95 shadow-md shadow-teal-600/20 disabled:opacity-50",
            }, saving ? "Guardando..." : (editing ? "Actualizar" : "Crear")),
          ]),
        ]),
      ]),
    ]),

    // Confirm Modal
    confirmConfig.isOpen && e(ConfirmModal, {
      title: confirmConfig.title,
      message: confirmConfig.message,
      onConfirm: () => {
        confirmConfig.onConfirm();
        setConfirmConfig({ ...confirmConfig, isOpen: false });
      },
      onCancel: () => setConfirmConfig({ ...confirmConfig, isOpen: false }),
    }),
  ]);
};

export default FaqManager;
