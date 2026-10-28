/**
 * public/src/features/whatsapp/components/WhatsAppProfileModal.js
 * Modal de Configuración y Edición del Perfil de WhatsApp Business
 * Permite consultar y modificar: Foto, Estado (About), Descripción, Dirección, Email, Sitios Web y Categoría (Vertical)
 */

import React, {
  useState,
  useEffect,
  useRef,
} from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";

const e = React.createElement;

const VERTICAL_OPTIONS = [
  { value: "UNDEFINED", label: "No definido" },
  { value: "RESTAURANT", label: "Restaurante" },
  { value: "FOOD_GROCERY", label: "Alimentos y Supermercado (Grocery)" },
  { value: "RETAIL", label: "Comercio / Tienda minorista" },
  { value: "APPAREL", label: "Ropa y Moda" },
  { value: "BEAUTY", label: "Belleza y Cuidado personal" },
  { value: "HEALTH", label: "Salud y Medicina" },
  { value: "EDU", label: "Educación" },
  { value: "EVENT_PLAN", label: "Planificación de Eventos" },
  { value: "FINANCE", label: "Finanzas y Banca" },
  { value: "GROCERY", label: "Bodega / Abarrotes" },
  { value: "HOTEL", label: "Hotelería y Hospedaje" },
  { value: "NONPROFIT", label: "Organización sin fines de lucro" },
  { value: "PROF_SERVICES", label: "Servicios Profesionales" },
  { value: "TRAVEL", label: "Viajes y Turismo" },
  { value: "AUTO", label: "Automotriz" },
  { value: "ENTERTAIN", label: "Entretenimiento" },
  { value: "OTHER", label: "Otro sector" },
];

const WhatsAppProfileModal = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);

  const [about, setAbout] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [website1, setWebsite1] = useState("");
  const [website2, setWebsite2] = useState("");
  const [vertical, setVertical] = useState("RESTAURANT");
  const [profilePictureUrl, setProfilePictureUrl] = useState("");

  const fileInputRef = useRef(null);

  // Cargar perfil desde la API al abrir
  useEffect(() => {
    if (!isOpen) return;

    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get("/api/admin/whatsapp/profile");
        if (res.data && res.data.success && res.data.data) {
          const p = res.data.data;
          setAbout(p.about || "");
          setAddress(p.address || "");
          setDescription(p.description || "");
          setEmail(p.email || "");
          setVertical(p.vertical || "RESTAURANT");
          setProfilePictureUrl(p.profile_picture_url || "");

          const webs = Array.isArray(p.websites) ? p.websites : [];
          setWebsite1(webs[0] || "");
          setWebsite2(webs[1] || "");
        }
      } catch (err) {
        console.error("❌ [WhatsApp Profile] Error cargando perfil:", err);
        if (window.showToast) {
          window.showToast("No se pudo cargar el perfil de WhatsApp Business", "error");
        }
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveTextProfile = async (ev) => {
    if (ev) ev.preventDefault();
    setSaving(true);

    try {
      const websites = [website1.trim(), website2.trim()].filter(Boolean);
      const payload = {
        about: about.trim(),
        address: address.trim(),
        description: description.trim(),
        email: email.trim(),
        websites,
        vertical,
      };

      const res = await apiClient.post("/api/admin/whatsapp/profile", payload);
      if (res.data && res.data.success) {
        if (window.showToast) {
          window.showToast("✅ Perfil de WhatsApp Business actualizado", "success");
        }
        onClose();
      } else {
        throw new Error(res.data?.error || "Error al actualizar perfil");
      }
    } catch (err) {
      console.error("❌ [WhatsApp Profile] Error guardando textos:", err);
      if (window.showToast) {
        window.showToast(err.response?.data?.error || err.message, "error");
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;

    // Validación básica de tamaño (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      if (window.showToast) {
        window.showToast("La foto no debe superar los 5MB", "warning");
      }
      return;
    }

    setUploadingPic(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await apiClient.post("/api/admin/whatsapp/profile-picture", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data && res.data.success) {
        if (res.data.profile_picture_url) {
          setProfilePictureUrl(res.data.profile_picture_url);
        } else {
          // Si Meta no devuelve la URL de inmediato, crear objeto local temporal
          setProfilePictureUrl(URL.createObjectURL(file));
        }
        if (window.showToast) {
          window.showToast("✅ Foto de perfil de WhatsApp Business actualizada", "success");
        }
      } else {
        throw new Error(res.data?.error || "Error al subir foto de perfil");
      }
    } catch (err) {
      console.error("❌ [WhatsApp Profile] Error subiendo foto:", err);
      if (window.showToast) {
        window.showToast(err.response?.data?.error || err.message, "error");
      }
    } finally {
      setUploadingPic(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return e(
    "div",
    {
      className:
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn",
    },
    [
      // Overlay backdrop
      e("div", {
        key: "backdrop",
        onClick: onClose,
        className: "absolute inset-0",
      }),

      // Modal Card
      e(
        "div",
        {
          key: "modal-card",
          className:
            "relative w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh] z-10 animate-scaleUp",
        },
        [
          // Header
          e(
            "div",
            {
              key: "modal-header",
              className:
                "px-6 py-4 bg-[#008069] text-white flex items-center justify-between shrink-0",
            },
            [
              e("div", { key: "title-wrap", className: "flex items-center gap-2.5" }, [
                e("div", {
                  key: "icon",
                  className: "w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white",
                }, e("i", { className: "fab fa-whatsapp text-lg" })),
                e("div", { key: "texts" }, [
                  e("h3", { key: "title", className: "text-base font-bold leading-tight" }, "Perfil de WhatsApp Business"),
                  e("p", { key: "subtitle", className: "text-xs text-emerald-100" }, "Datos públicos visibles para tus clientes en WhatsApp"),
                ]),
              ]),
              e(
                "button",
                {
                  key: "close-btn",
                  onClick: onClose,
                  className: "w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer",
                  title: "Cerrar",
                },
                e("i", { className: "fas fa-times" }),
              ),
            ],
          ),

          // Body Form
          e(
            "form",
            {
              key: "modal-body",
              onSubmit: handleSaveTextProfile,
              className: "flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar select-text",
            },
            loading
              ? [
                  e(
                    "div",
                    {
                      key: "loading",
                      className: "flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400 gap-3",
                    },
                    [
                      e("i", { className: "fas fa-spinner fa-spin text-3xl text-[#008069]" }),
                      e("p", { className: "text-sm font-medium" }, "Cargando información desde Meta Graph API..."),
                    ],
                  ),
                ]
              : [
                  // Sección Foto de Perfil
                  e(
                    "div",
                    {
                      key: "photo-section",
                      className:
                        "flex items-center gap-5 p-4 rounded-xl bg-emerald-50/60 dark:bg-gray-700/50 border border-emerald-100 dark:border-gray-600",
                    },
                    [
                      e(
                        "div",
                        {
                          key: "avatar-wrap",
                          className:
                            "relative w-20 h-20 rounded-full overflow-hidden shrink-0 border-2 border-[#008069] shadow-md bg-white dark:bg-gray-800",
                        },
                        [
                          e("img", {
                            key: "avatar-img",
                            src:
                              profilePictureUrl ||
                              "https://api.dicebear.com/7.x/bottts/svg?seed=WhatsAppBusiness",
                            alt: "Foto WhatsApp Business",
                            className: "w-full h-full object-cover",
                          }),
                          uploadingPic &&
                            e(
                              "div",
                              {
                                key: "upload-spinner",
                                className:
                                  "absolute inset-0 bg-black/60 flex items-center justify-center text-white",
                              },
                              e("i", { className: "fas fa-spinner fa-spin text-xl" }),
                            ),
                        ],
                      ),
                      e("div", { key: "avatar-actions", className: "flex-1 space-y-1.5" }, [
                        e("h4", { key: "h4", className: "text-sm font-bold text-gray-900 dark:text-white" }, "Foto del Perfil"),
                        e("p", { key: "p", className: "text-xs text-gray-500 dark:text-gray-400" }, "JPG o PNG recomendado, máximo 5MB."),
                        e(
                          "div",
                          { key: "btn-wrap", className: "pt-1" },
                          [
                            e("input", {
                              key: "file-input",
                              ref: fileInputRef,
                              type: "file",
                              accept: "image/jpeg,image/png",
                              onChange: handlePhotoUpload,
                              className: "hidden",
                            }),
                            e(
                              "button",
                              {
                                key: "upload-btn",
                                type: "button",
                                onClick: () => fileInputRef.current && fileInputRef.current.click(),
                                disabled: uploadingPic,
                                className:
                                  "px-3 py-1.5 rounded-lg bg-[#008069] hover:bg-[#00705c] text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50",
                              },
                              [
                                e("i", { className: "fas fa-camera text-xs" }),
                                e("span", null, uploadingPic ? "Subiendo a Meta..." : "Cambiar Foto"),
                              ],
                            ),
                          ],
                        ),
                      ]),
                    ],
                  ),

                  // Estado (About)
                  e("div", { key: "field-about", className: "space-y-1.5" }, [
                    e("div", { className: "flex justify-between items-center" }, [
                      e("label", { className: "block text-xs font-bold text-gray-700 dark:text-gray-200" }, "Estado / Info (About)"),
                      e("span", { className: "text-[11px] text-gray-400 font-mono" }, `${about.length}/139`),
                    ]),
                    e("input", {
                      type: "text",
                      maxLength: 139,
                      value: about,
                      onChange: (ev) => setAbout(ev.target.value),
                      placeholder: "Ej: Atención al cliente y pedidos",
                      className:
                        "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs",
                    }),
                  ]),

                  // Descripción Comercial
                  e("div", { key: "field-desc", className: "space-y-1.5" }, [
                    e("div", { className: "flex justify-between items-center" }, [
                      e("label", { className: "block text-xs font-bold text-gray-700 dark:text-gray-200" }, "Descripción del Negocio"),
                      e("span", { className: "text-[11px] text-gray-400 font-mono" }, `${description.length}/512`),
                    ]),
                    e("textarea", {
                      rows: 3,
                      maxLength: 512,
                      value: description,
                      onChange: (ev) => setDescription(ev.target.value),
                      placeholder: "Describe tu negocio, productos y servicios destacados...",
                      className:
                        "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs resize-none",
                    }),
                  ]),

                  // Sector / Categoría Vertical
                  e("div", { key: "field-vertical", className: "space-y-1.5" }, [
                    e("label", { className: "block text-xs font-bold text-gray-700 dark:text-gray-200" }, "Sector Comercial (Vertical)"),
                    e(
                      "select",
                      {
                        value: vertical,
                        onChange: (ev) => setVertical(ev.target.value),
                        className:
                          "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs cursor-pointer",
                      },
                      VERTICAL_OPTIONS.map((opt) =>
                        e("option", { key: opt.value, value: opt.value }, opt.label),
                      ),
                    ),
                  ]),

                  // Dirección Física
                  e("div", { key: "field-address", className: "space-y-1.5" }, [
                    e("div", { className: "flex justify-between items-center" }, [
                      e("label", { className: "block text-xs font-bold text-gray-700 dark:text-gray-200" }, "Dirección Física"),
                      e("span", { className: "text-[11px] text-gray-400 font-mono" }, `${address.length}/256`),
                    ]),
                    e("input", {
                      type: "text",
                      maxLength: 256,
                      value: address,
                      onChange: (ev) => setAddress(ev.target.value),
                      placeholder: "Ej: Av. Principal de Las Mercedes, Caracas",
                      className:
                        "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs",
                    }),
                  ]),

                  // Email de Contacto
                  e("div", { key: "field-email", className: "space-y-1.5" }, [
                    e("label", { className: "block text-xs font-bold text-gray-700 dark:text-gray-200" }, "Correo Electrónico"),
                    e("input", {
                      type: "email",
                      maxLength: 128,
                      value: email,
                      onChange: (ev) => setEmail(ev.target.value),
                      placeholder: "ejemplo@tudominio.com",
                      className:
                        "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs",
                    }),
                  ]),

                  // Sitios Web (Hasta 2 URLs)
                  e("div", { key: "field-websites", className: "space-y-2" }, [
                    e("label", { className: "block text-xs font-bold text-gray-700 dark:text-gray-200" }, "Sitios Web (Hasta 2 URLs)"),
                    e("input", {
                      type: "url",
                      maxLength: 256,
                      value: website1,
                      onChange: (ev) => setWebsite1(ev.target.value),
                      placeholder: "https://tudominio.com (Principal)",
                      className:
                        "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs",
                    }),
                    e("input", {
                      type: "url",
                      maxLength: 256,
                      value: website2,
                      onChange: (ev) => setWebsite2(ev.target.value),
                      placeholder: "https://instagram.com/tu_cuenta (Opcional)",
                      className:
                        "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs",
                    }),
                  ]),
                ],
          ),

          // Footer
          e(
            "div",
            {
              key: "modal-footer",
              className:
                "px-6 py-4 bg-gray-50 dark:bg-gray-700/60 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3 shrink-0",
            },
            [
              e(
                "button",
                {
                  key: "cancel-btn",
                  type: "button",
                  onClick: onClose,
                  disabled: saving,
                  className:
                    "px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer disabled:opacity-50",
                },
                "Cancelar",
              ),
              e(
                "button",
                {
                  key: "save-btn",
                  type: "button",
                  onClick: handleSaveTextProfile,
                  disabled: loading || saving,
                  className:
                    "px-5 py-2 rounded-xl bg-[#008069] hover:bg-[#00705c] text-white text-sm font-bold shadow-md shadow-emerald-700/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95",
                },
                [
                  saving && e("i", { key: "spin", className: "fas fa-spinner fa-spin text-xs" }),
                  e("span", { key: "txt" }, saving ? "Guardando..." : "Guardar Cambios"),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
};

export default WhatsAppProfileModal;
