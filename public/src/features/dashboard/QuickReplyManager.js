// public/src/features/dashboard/QuickReplyManager.js
import React, { useState, useEffect, useCallback } from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js";
import ConfirmModal from "../inventory/components/ConfirmModal.js";
const e = React.createElement;

/**
 * QuickReplyManager — Panel CRUD de respuestas rápidas
 * Accesible desde Configuración → "Respuestas Rápidas"
 */
const QuickReplyManager = ({ onBack }) => {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // null = nuevo, object = editando
  const [form, setForm] = useState({ text: "", category: "general", active: true, isFavorite: false });
  const [saving, setSaving] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const fetchReplies = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get("/api/admin/quick-replies");
      if (res.data?.success) setReplies(res.data.data || []);
    } catch (err) {
      window.showToast?.("❌ Error cargando respuestas rápidas", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchReplies(); }, [fetchReplies]);

  // ── CRUD handlers ──
  const openNew = () => {
    setEditing(null);
    setForm({ text: "", category: "general", active: true, isFavorite: false });
    setShowForm(true);
  };

  const openEdit = (reply) => {
    setEditing(reply);
    setForm({
      text: reply.text,
      category: reply.category || "general",
      active: reply.active !== false,
      isFavorite: Boolean(reply.isFavorite)
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.text.trim()) {
      return window.showToast?.("⚠️ El texto es obligatorio", "error");
    }
    try {
      setSaving(true);
      if (editing) {
        await apiClient.put(`/api/admin/quick-replies/${editing._id}`, form);
        window.showToast?.("✅ Respuesta actualizada", "success");
      } else {
        await apiClient.post("/api/admin/quick-replies", { ...form, order: replies.length });
        window.showToast?.("✅ Respuesta creada", "success");
      }
      closeForm();
      fetchReplies();
    } catch (err) {
      window.showToast?.("❌ Error al guardar: " + (err.response?.data?.error || err.message), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (reply) => {
    try {
      await apiClient.put(`/api/admin/quick-replies/${reply._id}`, { active: !reply.active });
      fetchReplies();
    } catch (err) {
      window.showToast?.("❌ Error al cambiar estado", "error");
    }
  };

  const handleToggleFavorite = async (reply) => {
    try {
      await apiClient.put(`/api/admin/quick-replies/${reply._id}`, { isFavorite: !reply.isFavorite });
      fetchReplies();
    } catch (err) {
      window.showToast?.("❌ Error al cambiar favorita", "error");
    }
  };

  const handleDelete = (reply) => {
    setConfirmConfig({
      isOpen: true,
      title: "¿Eliminar respuesta rápida?",
      message: `"${reply.text.slice(0, 50)}${reply.text.length > 50 ? "…" : ""}"\n\nEsta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/api/admin/quick-replies/${reply._id}`);
          window.showToast?.("🗑️ Respuesta eliminada", "success");
          fetchReplies();
        } catch (err) {
          window.showToast?.("❌ Error al eliminar: " + (err.response?.data?.error || err.message), "error");
        }
      }
    });
  };

  const handleReorder = (fromIndex, direction) => {
    const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= replies.length) return;
    const reordered = [...replies];
    [reordered[fromIndex], reordered[toIndex]] = [reordered[toIndex], reordered[fromIndex]];
    const ids = reordered.map((r) => r._id);
    apiClient.patch("/api/admin/quick-replies/reorder", { ids }).then(() => fetchReplies()).catch(() => {});
    setReplies(reordered);
  };

  const filteredReplies = replies.filter((reply) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      reply.text.toLowerCase().includes(q) ||
      (reply.category || "").toLowerCase().includes(q)
    );
  });

  return e("div", { className: "h-full flex flex-col bg-white dark:bg-gray-900" }, [
    // Header
    e("div", { key: "header", className: "flex items-center gap-3 px-4 py-3 border-b dark:border-gray-700" }, [
      e("button", {
        key: "back",
        onClick: onBack,
        className: "text-gray-500 hover:text-[#008069] dark:hover:text-emerald-400 transition"
      }, e("i", { className: "fas fa-arrow-left text-lg" })),
      e("h2", { key: "title", className: "text-lg font-bold text-[#3b4a54] dark:text-gray-100" }, "💬 Respuestas Rápidas"),
      e("span", { key: "spacer", className: "flex-1" }),
      e("button", {
        key: "add",
        onClick: openNew,
        className: "bg-[#008069] text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-[#016853] transition active:scale-95 shadow-xs"
      }, "+ Nueva"),
    ]),

    // Buscador
    e("div", { key: "search-bar", className: "px-4 pt-3 pb-1" }, [
      e("div", { className: "relative flex items-center" }, [
        e("i", { className: "fas fa-search absolute left-3 text-gray-400 text-xs" }),
        e("input", {
          type: "text",
          value: searchQuery,
          onChange: (ev) => setSearchQuery(ev.target.value),
          placeholder: "Buscar plantilla por texto o categoría...",
          className: "w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-xs rounded-lg pl-8 pr-8 py-2 text-gray-800 dark:text-gray-100 outline-none focus:border-[#008069]"
        }),
        searchQuery && e("button", {
          onClick: () => setSearchQuery(""),
          className: "absolute right-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs font-bold"
        }, "✕")
      ])
    ]),

    // Lista
    e("div", { key: "list", className: "flex-1 overflow-y-auto px-4 py-3 space-y-2" },
      loading
        ? e("div", { className: "text-center text-gray-400 py-8" }, e("i", { className: "fas fa-spinner fa-spin mr-2" }), "Cargando…")
        : filteredReplies.length === 0
          ? e("div", { className: "text-center text-gray-400 py-8 text-xs italic" }, searchQuery ? "No se encontraron respuestas para la búsqueda." : "No hay respuestas rápidas. Crea la primera con '+ Nueva'.")
          : filteredReplies.map((reply, idx) =>
              e("div", {
                key: reply._id,
                className: `flex items-center gap-3 p-3 rounded-lg border transition ${
                  reply.active
                    ? "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                    : "border-gray-100 dark:border-gray-800 bg-gray-100/50 dark:bg-gray-800/50 opacity-60"
                }`
              }, [
                // Reorder buttons
                e("div", { key: "reorder", className: "flex flex-col gap-0.5" }, [
                  e("button", {
                    key: "up",
                    onClick: () => handleReorder(idx, "up"),
                    disabled: idx === 0,
                    className: "text-gray-400 hover:text-[#008069] disabled:opacity-30 text-xs leading-none"
                  }, "▲"),
                  e("button", {
                    key: "down",
                    onClick: () => handleReorder(idx, "down"),
                    disabled: idx === filteredReplies.length - 1,
                    className: "text-gray-400 hover:text-[#008069] disabled:opacity-30 text-xs leading-none"
                  }, "▼"),
                ]),
                // Favorite Toggle Button
                e("button", {
                  key: "fav",
                  onClick: () => handleToggleFavorite(reply),
                  title: reply.isFavorite ? "Quitar de Favoritas" : "Marcar como Favorita",
                  className: "text-sm hover:scale-110 transition p-0.5"
                }, reply.isFavorite ? "⭐" : "☆"),
                // Text
                e("span", {
                  key: "text",
                  className: "flex-1 text-sm text-[#3b4a54] dark:text-gray-200 font-medium",
                  title: reply.text
                }, reply.text),
                // Category badge
                e("span", {
                  key: "cat",
                  className: "text-[10px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-bold uppercase"
                }, reply.category || "general"),
                // Toggle active
                e("button", {
                  key: "toggle",
                  onClick: () => handleToggleActive(reply),
                  title: reply.active ? "Desactivar" : "Activar",
                  className: `text-sm ${reply.active ? "text-emerald-500" : "text-gray-400"} hover:scale-110 transition`
                }, reply.active ? "✅" : "⏸️"),
                // Edit
                e("button", {
                  key: "edit",
                  onClick: () => openEdit(reply),
                  className: "text-gray-400 hover:text-blue-500 transition"
                }, e("i", { className: "fas fa-pen text-xs" })),
                // Delete
                e("button", {
                  key: "delete",
                  onClick: () => handleDelete(reply),
                  className: "text-gray-400 hover:text-red-500 transition"
                }, e("i", { className: "fas fa-trash text-xs" })),
              ])
            )
    ),

    // Modal / Form overlay
    showForm && e("div", {
      key: "modal",
      className: "fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-xs"
    }, [
      e("div", {
        key: "modal-inner",
        className: "bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 border dark:border-gray-700"
      }, [
        e("h3", { key: "modal-title", className: "text-lg font-bold text-[#3b4a54] dark:text-gray-100" },
          editing ? "Editar respuesta rápida" : "Nueva respuesta rápida"),
        // Text
        e("div", { key: "field-text" }, [
          e("label", { className: "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1" }, "Texto de la plantilla"),
          e("textarea", {
            value: form.text,
            onChange: (ev) => setForm({ ...form, text: ev.target.value }),
            rows: 3,
            placeholder: "Ej: ¡Hola {nombre}! El total de tu pedido es {total} 🍱",
            className: "w-full p-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-[#3b4a54] dark:text-gray-100 text-sm resize-none focus:ring-2 focus:ring-[#008069] focus:border-transparent outline-none"
          }),
          e("p", { className: "text-[10px] text-gray-400 mt-1" }, "Tokens permitidos: {nombre}, {total}, {totalUSD}, {totalBS}, {items}, {menu}")
        ]),
        // Category
        e("div", { key: "field-cat" }, [
          e("label", { className: "block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1" }, "Categoría"),
          e("input", {
            value: form.category,
            onChange: (ev) => setForm({ ...form, category: ev.target.value }),
            placeholder: "general, saludo, pedidos, pagos, entrega, soporte...",
            className: "w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm text-[#3b4a54] dark:text-gray-100 focus:ring-2 focus:ring-[#008069] outline-none"
          })
        ]),
        // Toggles row (Favorita & Activa)
        e("div", { key: "toggles", className: "flex justify-between items-center pt-1" }, [
          e("label", { className: "flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer" }, [
            e("input", {
              type: "checkbox",
              checked: form.isFavorite,
              onChange: (ev) => setForm({ ...form, isFavorite: ev.target.checked }),
              className: "accent-[#008069] rounded"
            }),
            "⭐ Marcar como Favorita"
          ]),
          e("div", { className: "flex items-center gap-2" }, [
            e("label", { className: "text-xs font-semibold text-gray-500 dark:text-gray-400" }, "Activa:"),
            e("button", {
              type: "button",
              onClick: () => setForm({ ...form, active: !form.active }),
              className: `w-10 h-5 rounded-full transition-colors relative ${form.active ? "bg-[#008069]" : "bg-gray-300 dark:bg-gray-600"}`
            }, e("span", {
              className: `absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                form.active ? "left-5" : "left-0.5"
              }`
            }))
          ])
        ]),
        // Actions
        e("div", { key: "actions", className: "flex gap-2 justify-end pt-3 border-t border-gray-100 dark:border-gray-700" }, [
          e("button", {
            key: "cancel",
            onClick: closeForm,
            className: "px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition font-medium"
          }, "Cancelar"),
          e("button", {
            key: "save",
            onClick: handleSave,
            disabled: saving || !form.text.trim(),
            className: "px-4 py-2 text-sm bg-[#008069] text-white rounded-lg font-bold hover:bg-[#016853] transition disabled:opacity-50 active:scale-95 shadow-xs"
          }, saving ? "Guardando…" : "Guardar"),
        ])
      ])
    ]),

    // Confirm Modal (para eliminar)
    e(ConfirmModal, {
      ...confirmConfig,
      onCancel: () => setConfirmConfig({ ...confirmConfig, isOpen: false })
    })
  ]);
};

export default QuickReplyManager;
