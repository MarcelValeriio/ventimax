import { Icono } from "../../../components/Icono.js";
/**
 * public/src/features/inventory/components/AliadosTab.js
 * Módulo de gestión de aliados comerciales (F2j) - Pure JS Version
 */
import React, { useEffect, useRef, useState } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";
import ConfirmModal from "./ConfirmModal.js";

const e = React.createElement;

const MAX_ALIADOS = 30;
const MAX_LARGO_NOMBRE = 60;
const MAX_LARGO_DESCRIPCION = 400;

const AliadosTab = () => {
  const [aliados, setAliados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAliado, setEditingAliado] = useState(null);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorModal, setErrorModal] = useState("");
  const [confirmConfig, setConfirmConfig] = useState({ isOpen: false, title: "", message: "", onConfirm: () => {} });

  const fileInputRef = useRef(null);

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    logoUrl: "",
    logoPublicId: "",
    orden: 0,
    activo: true,
  });

  const fetchAliados = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get("/api/admin/aliados");
      if (res.data?.success) {
        setAliados(res.data.data || []);
      }
    } catch (err) {
      console.error("❌ Error cargando aliados comerciales:", err.message);
      window.showToast?.("Error cargando aliados comerciales", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAliados();
  }, []);

  const handleOpenModal = (aliado = null) => {
    setErrorModal("");
    if (aliado) {
      setEditingAliado(aliado);
      setFormData({
        nombre: aliado.nombre || "",
        descripcion: aliado.descripcion || "",
        logoUrl: aliado.logoUrl || "",
        logoPublicId: aliado.logoPublicId || "",
        orden: Number(aliado.orden) || 0,
        activo: aliado.activo !== false,
      });
    } else {
      setEditingAliado(null);
      setFormData({
        nombre: "",
        descripcion: "",
        logoUrl: "",
        logoPublicId: "",
        orden: aliados.length,
        activo: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSubirLogo = async (ev) => {
    const file = ev.target?.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorModal("El logo no puede exceder 2 MB");
      return;
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setErrorModal("Solo se permiten logos en formato JPG, PNG o WebP");
      return;
    }

    setErrorModal("");
    setSubiendoLogo(true);
    const fd = new FormData();
    fd.append("logo", file);

    try {
      const res = await apiClient.post("/api/admin/aliados/logo", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const data = res.data?.data;
      if (data?.url) {
        setFormData((prev) => ({
          ...prev,
          logoUrl: data.url,
          logoPublicId: data.publicId || "",
        }));
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      setErrorModal(String(msg));
    } finally {
      setSubiendoLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleQuitarLogo = () => {
    setFormData((prev) => ({
      ...prev,
      logoUrl: "",
      logoPublicId: "",
    }));
  };

  const handleSave = async (ev) => {
    if (ev) ev.preventDefault();
    if (guardando || subiendoLogo) return;

    const nombreLimpio = formData.nombre.trim();
    if (!nombreLimpio) {
      setErrorModal("El nombre del aliado es obligatorio");
      return;
    }
    if (nombreLimpio.length > MAX_LARGO_NOMBRE) {
      setErrorModal(`El nombre no puede exceder ${MAX_LARGO_NOMBRE} caracteres`);
      return;
    }

    const descLimpia = formData.descripcion.trim();
    if (!descLimpia) {
      setErrorModal("La descripción del aliado es obligatoria");
      return;
    }
    if (descLimpia.length > MAX_LARGO_DESCRIPCION) {
      setErrorModal(`La descripción no puede exceder ${MAX_LARGO_DESCRIPCION} caracteres`);
      return;
    }

    setErrorModal("");
    setGuardando(true);

    const payload = {
      nombre: nombreLimpio,
      descripcion: descLimpia,
      logoUrl: formData.logoUrl.trim(),
      logoPublicId: formData.logoPublicId.trim(),
      orden: Number(formData.orden) || 0,
      activo: formData.activo,
    };

    try {
      if (editingAliado) {
        await apiClient.put(`/api/admin/aliados/${editingAliado._id}`, payload);
        window.showToast?.("Aliado comercial actualizado");
      } else {
        await apiClient.post("/api/admin/aliados", payload);
        window.showToast?.("Aliado comercial creado");
      }
      setIsModalOpen(false);
      fetchAliados();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || err.message;
      setErrorModal(String(msg));
    } finally {
      setGuardando(false);
    }
  };

  const handleDelete = (aliado) => {
    setConfirmConfig({
      isOpen: true,
      title: "Eliminar aliado comercial",
      message: `¿Estás seguro de que deseas eliminar al aliado "${aliado.nombre}"? Si tiene logo, se borrará de Cloudinary.`,
      onConfirm: async () => {
        try {
          await apiClient.delete(`/api/admin/aliados/${aliado._id}`);
          window.showToast?.("Aliado comercial eliminado");
          fetchAliados();
        } catch (err) {
          const msg = err.response?.data?.error || err.response?.data?.message || err.message;
          window.showToast?.(String(msg), "error");
        }
      },
    });
  };

  const handleMoverOrden = async (index, direccion) => {
    const destino = index + direccion;
    if (destino < 0 || destino >= aliados.length) return;

    const actual = aliados[index];
    const adyacente = aliados[destino];

    const nuevoOrdenActual = Number(adyacente.orden) || destino;
    const nuevoOrdenAdyacente = Number(actual.orden) || index;

    try {
      await Promise.all([
        apiClient.put(`/api/admin/aliados/${actual._id}`, { orden: nuevoOrdenActual }),
        apiClient.put(`/api/admin/aliados/${adyacente._id}`, { orden: nuevoOrdenAdyacente }),
      ]);
      fetchAliados();
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      window.showToast?.(`Error reordenando: ${msg}`, "error");
    }
  };

  const handleToggleActivo = async (aliado) => {
    try {
      await apiClient.put(`/api/admin/aliados/${aliado._id}`, { activo: !aliado.activo });
      setAliados((prev) =>
        prev.map((a) => (a._id === aliado._id ? { ...a, activo: !a.activo } : a)),
      );
      window.showToast?.(aliado.activo ? "Aliado desactivado" : "Aliado activado");
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      window.showToast?.(String(msg), "error");
    }
  };

  return e(
    "div",
    { className: "p-4 md:p-6 max-w-7xl mx-auto space-y-6" },
    // Header
    e(
      "div",
      { className: "flex flex-col sm:flex-row sm:items-center justify-between gap-4" },
      e(
        "div",
        null,
        e(
          "div",
          { className: "flex items-center gap-3" },
          e("h2", { className: "text-xl font-bold text-gray-800 dark:text-gray-100" }, "Aliados Comerciales"),
          e(
            "span",
            {
              className:
                "px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
            },
            `${aliados.length}/${MAX_ALIADOS}`,
          ),
        ),
        e(
          "p",
          { className: "text-xs text-gray-500 dark:text-gray-400 mt-1" },
          "Empresas y marcas aliadas que se muestran en la sección pública de la tienda.",
        ),
      ),
      e(
        "button",
        {
          onClick: () => handleOpenModal(),
          disabled: aliados.length >= MAX_ALIADOS,
          className:
            "flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shadow-sm self-start sm:self-auto",
        },
        e(Icono, { nombre: "plus" }),
        "Nuevo Aliado",
      ),
    ),

    // Content: Loading, Empty o Grid
    loading
      ? e(
          "div",
          { className: "py-20 text-center text-gray-400 text-sm" },
          "Cargando aliados comerciales...",
        )
      : aliados.length === 0
      ? e(
          "div",
          {
            className:
              "text-center py-16 px-4 bg-white dark:bg-gray-800 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl",
          },
          e(
            "div",
            {
              className:
                "w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3",
            },
            e(Icono, { nombre: "building" }),
          ),
          e("p", { className: "font-bold text-gray-800 dark:text-gray-200 text-sm" }, "No hay aliados comerciales registrados"),
          e(
            "p",
            { className: "text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mt-1" },
            "Sin aliados activos, la sección 'Aliados' no se mostrará en la barra de navegación ni en la tienda.",
          ),
          e(
            "button",
            {
              onClick: () => handleOpenModal(),
              className: "mt-4 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition",
            },
            "+ Agregar el primer aliado",
          ),
        )
      : e(
          "div",
          { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" },
          aliados.map((aliado, idx) =>
            e(
              "div",
              {
                key: aliado._id,
                className: `bg-white dark:bg-gray-800 border rounded-2xl p-4 shadow-sm transition flex flex-col justify-between ${
                  aliado.activo ? "border-gray-200 dark:border-gray-700" : "border-gray-200/50 dark:border-gray-800 opacity-60"
                }`,
              },
              e(
                "div",
                { className: "space-y-3" },
                // Top row: logo preview + status switch + order buttons
                e(
                  "div",
                  { className: "flex items-start justify-between gap-3" },
                  aliado.logoUrl
                    ? e("img", {
                        src: aliado.logoUrl,
                        alt: aliado.nombre,
                        className: "h-12 w-24 object-contain rounded-lg bg-white border border-gray-200 p-1 shrink-0",
                      })
                    : e(
                        "div",
                        {
                          className:
                            "h-12 w-24 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-400 flex items-center justify-center shrink-0 border border-dashed border-gray-300 dark:border-gray-600",
                        },
                        e(Icono, { nombre: "building" }),
                      ),
                  e(
                    "div",
                    { className: "flex items-center gap-1.5" },
                    // Botones orden
                    e(
                      "button",
                      {
                        type: "button",
                        onClick: () => handleMoverOrden(idx, -1),
                        disabled: idx === 0,
                        title: "Subir orden",
                        className:
                          "p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-600 dark:text-gray-300",
                      },
                      e(Icono, { nombre: "arrow-up" }),
                    ),
                    e(
                      "button",
                      {
                        type: "button",
                        onClick: () => handleMoverOrden(idx, 1),
                        disabled: idx === aliados.length - 1,
                        title: "Bajar orden",
                        className:
                          "p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 text-gray-600 dark:text-gray-300",
                      },
                      e(Icono, { nombre: "arrow-down" }),
                    ),
                    // Switch activo
                    e(
                      "button",
                      {
                        type: "button",
                        onClick: () => handleToggleActivo(aliado),
                        title: aliado.activo ? "Desactivar" : "Activar",
                        className: `w-9 h-5 rounded-full transition-colors relative ${
                          aliado.activo ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                        }`,
                      },
                      e("span", {
                        className: `absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                          aliado.activo ? "translate-x-4" : "translate-x-0"
                        }`,
                      }),
                    ),
                  ),
                ),
                // Middle: Nombre y descripción
                e(
                  "div",
                  null,
                  e("h4", { className: "font-bold text-gray-800 dark:text-gray-100 text-sm" }, aliado.nombre),
                  e(
                    "p",
                    { className: "text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-3 leading-relaxed" },
                    aliado.descripcion,
                  ),
                ),
              ),
              // Bottom: Acciones
              e(
                "div",
                { className: "flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-700 mt-3" },
                e(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleOpenModal(aliado),
                    className:
                      "flex-1 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition",
                  },
                  "Editar",
                ),
                e(
                  "button",
                  {
                    type: "button",
                    onClick: () => handleDelete(aliado),
                    title: "Eliminar aliado",
                    className:
                      "p-1.5 text-rose-500 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 rounded-xl transition",
                  },
                  e(Icono, { nombre: "trash" }),
                ),
              ),
            ),
          ),
        ),

    // Modal Crear / Editar
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
              "bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]",
          },
          // Header modal
          e(
            "div",
            {
              className:
                "p-5 border-b dark:border-gray-700 border-gray-100 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50",
            },
            e(
              "h3",
              { className: "text-base font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2" },
              e(Icono, { nombre: "building", className: "text-emerald-500" }),
              editingAliado ? "Editar Aliado Comercial" : "Nuevo Aliado Comercial",
            ),
            e(
              "button",
              {
                type: "button",
                onClick: () => setIsModalOpen(false),
                className: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg",
              },
              "✕",
            ),
          ),
          // Formulario modal
          e(
            "form",
            { onSubmit: handleSave, className: "p-5 space-y-4 overflow-y-auto flex-1" },
            // Error banner si hay
            errorModal &&
              e(
                "div",
                {
                  className:
                    "p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-xs font-semibold border border-rose-200 dark:border-rose-800",
                },
                errorModal,
              ),

            // Campo Nombre
            e(
              "div",
              null,
              e(
                "div",
                { className: "flex justify-between items-center mb-1" },
                e("label", { className: "text-[11px] font-black uppercase text-gray-500" }, "Nombre del aliado *"),
                e("span", { className: "text-[10px] text-gray-400" }, `${formData.nombre.length}/${MAX_LARGO_NOMBRE}`),
              ),
              e("input", {
                type: "text",
                value: formData.nombre,
                maxLength: MAX_LARGO_NOMBRE,
                required: true,
                placeholder: "Ej: Distribuidora Central",
                onChange: (ev) => setFormData({ ...formData, nombre: ev.target.value }),
                className:
                  "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 text-xs focus:ring-2 focus:ring-emerald-500 outline-none",
              }),
            ),

            // Campo Descripción
            e(
              "div",
              null,
              e(
                "div",
                { className: "flex justify-between items-center mb-1" },
                e("label", { className: "text-[11px] font-black uppercase text-gray-500" }, "Descripción *"),
                e("span", { className: "text-[10px] text-gray-400" }, `${formData.descripcion.length}/${MAX_LARGO_DESCRIPCION}`),
              ),
              e("textarea", {
                rows: 3,
                value: formData.descripcion,
                maxLength: MAX_LARGO_DESCRIPCION,
                required: true,
                placeholder: "Describe la actividad, trayectoria o alianza comercial...",
                onChange: (ev) => setFormData({ ...formData, descripcion: ev.target.value }),
                className:
                  "w-full p-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 text-xs focus:ring-2 focus:ring-emerald-500 outline-none resize-none",
              }),
            ),

            // Campo Logo
            e(
              "div",
              { className: "space-y-2" },
              e("label", { className: "text-[11px] font-black uppercase text-gray-500 block" }, "Logo del aliado (opcional)"),
              e(
                "div",
                { className: "flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-200 dark:border-gray-700" },
                formData.logoUrl
                  ? e("img", {
                      src: formData.logoUrl,
                      alt: "Previsualización",
                      className: "h-14 w-28 object-contain rounded-lg bg-white border border-gray-200 p-1 shrink-0",
                    })
                  : e(
                      "div",
                      {
                        className:
                          "h-14 w-28 rounded-lg bg-gray-100 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-center text-gray-400 shrink-0",
                      },
                      e(Icono, { nombre: "image" }),
                    ),
                e(
                  "div",
                  { className: "flex-1 space-y-1.5" },
                  e(
                    "div",
                    { className: "flex flex-wrap gap-2" },
                    e(
                      "button",
                      {
                        type: "button",
                        onClick: () => fileInputRef.current?.click(),
                        disabled: subiendoLogo,
                        className:
                          "px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 text-gray-700 dark:text-gray-200 rounded-lg text-xs font-bold transition flex items-center gap-1.5",
                      },
                      e(Icono, { nombre: "upload" }),
                      subiendoLogo ? "Subiendo..." : formData.logoUrl ? "Cambiar logo" : "Subir logo",
                    ),
                    formData.logoUrl &&
                      e(
                        "button",
                        {
                          type: "button",
                          onClick: handleQuitarLogo,
                          disabled: subiendoLogo,
                          className:
                            "px-3 py-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 rounded-lg text-xs font-bold transition",
                        },
                        "Quitar logo",
                      ),
                  ),
                  e(
                    "p",
                    { className: "text-[10px] text-gray-400 leading-tight" },
                    "Recomendado fondo transparente (PNG/WebP) o blanco. Hasta 2 MB. Subida inmediata.",
                  ),
                ),
              ),
              e("input", {
                ref: fileInputRef,
                type: "file",
                accept: "image/jpeg,image/png,image/webp",
                className: "hidden",
                onChange: handleSubirLogo,
              }),
            ),

            // Interruptor activo
            e(
              "div",
              { className: "flex items-center justify-between pt-2" },
              e(
                "div",
                null,
                e("label", { className: "text-xs font-bold text-gray-700 dark:text-gray-300 block" }, "Estado del aliado"),
                e("span", { className: "text-[10px] text-gray-400" }, "Solo los aliados activos se muestran en la tienda pública"),
              ),
              e(
                "button",
                {
                  type: "button",
                  onClick: () => setFormData({ ...formData, activo: !formData.activo }),
                  className: `w-11 h-6 rounded-full transition-colors relative ${
                    formData.activo ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                  }`,
                },
                e("span", {
                  className: `absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    formData.activo ? "translate-x-5" : "translate-x-0"
                  }`,
                }),
              ),
            ),

            // Footer botones
            e(
              "div",
              { className: "pt-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-2" },
              e(
                "button",
                {
                  type: "button",
                  onClick: () => setIsModalOpen(false),
                  className: "px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 rounded-xl",
                },
                "Cancelar",
              ),
              e(
                "button",
                {
                  type: "submit",
                  disabled: guardando || subiendoLogo,
                  className:
                    "px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition shadow-sm",
                },
                guardando ? "Guardando..." : "Guardar Aliado",
              ),
            ),
          ),
        ),
      ),

    // Modal confirmación eliminación
    e(ConfirmModal, {
      isOpen: confirmConfig.isOpen,
      title: confirmConfig.title,
      message: confirmConfig.message,
      onConfirm: confirmConfig.onConfirm,
      onCancel: () => setConfirmConfig({ ...confirmConfig, isOpen: false }),
    }),
  );
};

export default AliadosTab;
