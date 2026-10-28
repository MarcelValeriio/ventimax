/**
 * public/src/features/inbox/components/InboxWhatsAppProfileModal.js
 * LOTE B6 — Administrador del Perfil de WhatsApp Business (WA-39 · disparador WA-45).
 *
 * POR QUÉ SE DUPLICA Y NO SE REUTILIZA `WhatsAppProfileModal.js`:
 *   · El modal legacy recibe `{ isOpen, onClose }`, pero sus endpoints están
 *     HARDCODEADOS a las rutas de la consola (`/api/admin/whatsapp/profile` y
 *     `/api/admin/whatsapp/profile-picture`). No hay prop que los inyecte.
 *   · El inbox solo puede usar endpoints unificados (§6.3) y tiene PROHIBIDO
 *     editar `public/src/features/whatsapp/**` (regla dura del lote), así que
 *     "reutilizar" exigiría tocar el legacy. Se porta el mismo formulario con
 *     los endpoints `/api/admin/inbox/whatsapp/profile*`, equivalentes exactos
 *     de los legacy (mismo servicio de Meta por detrás).
 *   · Se AÑADE el cierre con Escape (el legacy no lo tenía) y `data-testid`s
 *     para el harness de render.
 *
 * Campos (idénticos al legacy): foto, Estado/About, Descripción, Sector
 * (vertical), Dirección, Email y hasta 2 Sitios Web.
 */
import React, { useEffect, useRef, useState } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";

const e = React.createElement;

const API_PERFIL = "/api/admin/inbox/whatsapp/profile";
const API_FOTO = "/api/admin/inbox/whatsapp/profile-picture";

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

const InboxWhatsAppProfileModal = ({ isOpen, onClose }) => {
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

  // Carga del perfil (GET unificado) al abrir.
  useEffect(() => {
    if (!isOpen) return undefined;
    let activo = true;
    const fetchProfile = async () => {
      setLoading(true);
      try {
        const res = await apiClient.get(`${API_PERFIL}?canal=whatsapp`);
        const payload = (res.data && res.data.data) || {};
        const p = payload.perfil || {};
        if (!activo) return;
        setAbout(p.about || "");
        setAddress(p.address || "");
        setDescription(p.description || "");
        setEmail(p.email || "");
        setVertical(p.vertical || "RESTAURANT");
        setProfilePictureUrl(p.profile_picture_url || "");
        const webs = Array.isArray(p.websites) ? p.websites : [];
        setWebsite1(webs[0] || "");
        setWebsite2(webs[1] || "");
      } catch (err) {
        if (!activo) return;
        console.error("❌ [Inbox · Perfil WA] Error cargando perfil:", err);
        window.showToast?.(
          "No se pudo cargar el perfil de WhatsApp Business",
          "error",
        );
      } finally {
        if (activo) setLoading(false);
      }
    };
    fetchProfile();
    return () => {
      activo = false;
    };
  }, [isOpen]);

  // Cierre con Escape (mejora sobre el legacy, pedida en el lote).
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (ev) => {
      if (ev.key === "Escape" || ev.keyCode === 27) {
        if (typeof onClose === "function") onClose();
      }
    };
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      if (typeof window !== "undefined" && window.removeEventListener) {
        window.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveTextProfile = async (ev) => {
    if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
    setSaving(true);
    try {
      const websites = [website1.trim(), website2.trim()].filter(Boolean);
      const res = await apiClient.post(API_PERFIL, {
        canal: "whatsapp",
        about: about.trim(),
        address: address.trim(),
        description: description.trim(),
        email: email.trim(),
        websites,
        vertical,
      });
      if (res.data && res.data.success) {
        window.showToast?.("✅ Perfil de WhatsApp Business actualizado", "success");
        if (typeof onClose === "function") onClose();
      } else {
        throw new Error((res.data && res.data.error) || "Error al actualizar perfil");
      }
    } catch (err) {
      console.error("❌ [Inbox · Perfil WA] Error guardando textos:", err);
      window.showToast?.(
        (err.response && err.response.data && err.response.data.error) || err.message,
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (ev) => {
    const file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      window.showToast?.("La foto no debe superar los 5MB", "warning");
      return;
    }

    setUploadingPic(true);
    try {
      const formData = new FormData();
      // `canal` ANTES del archivo: multer rellena `req.body` al vuelo.
      formData.append("canal", "whatsapp");
      formData.append("file", file);

      const res = await apiClient.post(API_FOTO, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const payload = (res.data && res.data.data) || {};
      if (res.data && res.data.success) {
        if (payload.profile_picture_url) setProfilePictureUrl(payload.profile_picture_url);
        else setProfilePictureUrl(URL.createObjectURL(file));
        window.showToast?.("✅ Foto de perfil de WhatsApp Business actualizada", "success");
      } else {
        throw new Error((res.data && res.data.error) || "Error al subir foto de perfil");
      }
    } catch (err) {
      console.error("❌ [Inbox · Perfil WA] Error subiendo foto:", err);
      window.showToast?.(
        (err.response && err.response.data && err.response.data.error) || err.message,
        "error",
      );
    } finally {
      setUploadingPic(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const campoTexto = (key, label, valor, setValor, maxLength, placeholder, contador) =>
    e("div", { key, className: "space-y-1.5" }, [
      e("div", { key: "head", className: "flex justify-between items-center" }, [
        e("label", { key: "l", className: "block text-xs font-bold text-gray-700 dark:text-gray-200" }, label),
        contador
          ? e(
              "span",
              { key: "c", className: "text-[11px] text-gray-400 font-mono" },
              `${valor.length}/${maxLength}`,
            )
          : null,
      ]),
      e("input", {
        type: key === "email" ? "email" : key === "website" ? "url" : "text",
        maxLength,
        value: valor,
        onChange: (ev) => setValor(ev.target.value),
        placeholder,
        "data-testid": key,
        className:
          "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs",
      }),
    ]);

  return e(
    "div",
    {
      "data-testid": "inbox-wa-profile-modal",
      className:
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs",
    },
    [
      e("div", { key: "backdrop", onClick: onClose, className: "absolute inset-0" }),
      e(
        "div",
        {
          key: "card",
          className:
            "relative w-full max-w-xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[90vh] z-10",
        },
        [
          e(
            "div",
            {
              key: "header",
              className:
                "px-6 py-4 bg-[#008069] text-white flex items-center justify-between shrink-0",
            },
            [
              e("div", { key: "title-wrap", className: "flex items-center gap-2.5" }, [
                e(
                  "div",
                  {
                    key: "icon",
                    className:
                      "w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center text-white",
                  },
                  e("i", { className: "fab fa-whatsapp text-lg" }),
                ),
                e("div", { key: "texts" }, [
                  e(
                    "h3",
                    { key: "title", className: "text-base font-bold leading-tight" },
                    "Perfil de WhatsApp Business",
                  ),
                  e(
                    "p",
                    { key: "subtitle", className: "text-xs text-emerald-100" },
                    "Datos públicos visibles para tus clientes",
                  ),
                ]),
              ]),
              e(
                "button",
                {
                  key: "close-btn",
                  type: "button",
                  onClick: onClose,
                  "aria-label": "Cerrar perfil de WhatsApp Business",
                  title: "Cerrar (Escape)",
                  className:
                    "w-8 h-8 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer",
                },
                e("i", { className: "fas fa-times" }),
              ),
            ],
          ),
          e(
            "form",
            {
              key: "body",
              onSubmit: handleSaveTextProfile,
              className: "flex-1 overflow-y-auto p-6 space-y-5 select-text",
            },
            loading
              ? [
                  e(
                    "div",
                    {
                      key: "loading",
                      "data-testid": "inbox-wa-profile-loading",
                      className:
                        "flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400 gap-3",
                    },
                    [
                      e("i", { className: "fas fa-spinner fa-spin text-3xl text-[#008069]" }),
                      e("p", { className: "text-sm font-medium" }, "Cargando información desde Meta..."),
                    ],
                  ),
                ]
              : [
                  e(
                    "div",
                    {
                      key: "photo",
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
                            "data-testid": "inbox-wa-profile-foto",
                            className: "w-full h-full object-cover",
                          }),
                          uploadingPic
                            ? e(
                                "div",
                                {
                                  key: "upload-spinner",
                                  className:
                                    "absolute inset-0 bg-black/60 flex items-center justify-center text-white",
                                },
                                e("i", { className: "fas fa-spinner fa-spin text-xl" }),
                              )
                            : null,
                        ],
                      ),
                      e("div", { key: "avatar-actions", className: "flex-1 space-y-1.5" }, [
                        e(
                          "h4",
                          { key: "h4", className: "text-sm font-bold text-gray-900 dark:text-white" },
                          "Foto del Perfil",
                        ),
                        e(
                          "p",
                          { key: "p", className: "text-xs text-gray-500 dark:text-gray-400" },
                          "JPG o PNG recomendado, máximo 5MB.",
                        ),
                        e("div", { key: "btn-wrap", className: "pt-1" }, [
                          e("input", {
                            key: "file-input",
                            ref: fileInputRef,
                            type: "file",
                            accept: "image/jpeg,image/png",
                            onChange: handlePhotoUpload,
                            "data-testid": "inbox-wa-profile-file",
                            className: "hidden",
                          }),
                          e(
                            "button",
                            {
                              key: "upload-btn",
                              type: "button",
                              onClick: () =>
                                fileInputRef.current && fileInputRef.current.click(),
                              disabled: uploadingPic,
                              className:
                                "px-3 py-1.5 rounded-lg bg-[#008069] hover:bg-[#00705c] text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50",
                            },
                            [
                              e("i", { key: "i", className: "fas fa-camera text-xs" }),
                              e("span", { key: "s" }, uploadingPic ? "Subiendo a Meta..." : "Cambiar Foto"),
                            ],
                          ),
                        ]),
                      ]),
                    ],
                  ),
                  campoTexto("about", "Estado / Info (About)", about, setAbout, 139, "Ej: Dumplings congelados para llevar", true),
                  e("div", { key: "field-desc", className: "space-y-1.5" }, [
                    e("div", { key: "head", className: "flex justify-between items-center" }, [
                      e(
                        "label",
                        { key: "l", className: "block text-xs font-bold text-gray-700 dark:text-gray-200" },
                        "Descripción del Negocio",
                      ),
                      e(
                        "span",
                        { key: "c", className: "text-[11px] text-gray-400 font-mono" },
                        `${description.length}/512`,
                      ),
                    ]),
                    e("textarea", {
                      rows: 3,
                      maxLength: 512,
                      value: description,
                      onChange: (ev) => setDescription(ev.target.value),
                      placeholder: "Describe tu negocio, productos y servicios destacados...",
                      "data-testid": "description",
                      className:
                        "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs resize-none",
                    }),
                  ]),
                  e("div", { key: "field-vertical", className: "space-y-1.5" }, [
                    e(
                      "label",
                      { key: "l", className: "block text-xs font-bold text-gray-700 dark:text-gray-200" },
                      "Sector Comercial (Vertical)",
                    ),
                    e(
                      "select",
                      {
                        value: vertical,
                        onChange: (ev) => setVertical(ev.target.value),
                        "data-testid": "vertical",
                        className:
                          "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs cursor-pointer",
                      },
                      VERTICAL_OPTIONS.map((opt) =>
                        e("option", { key: opt.value, value: opt.value }, opt.label),
                      ),
                    ),
                  ]),
                  campoTexto("address", "Dirección Física", address, setAddress, 256, "Ej: Av. Principal de Las Mercedes, Caracas", true),
                  campoTexto("email", "Correo Electrónico", email, setEmail, 128, "ejemplo@tudominio.com", false),
                  e("div", { key: "field-websites", className: "space-y-2" }, [
                    e(
                      "label",
                      { key: "l", className: "block text-xs font-bold text-gray-700 dark:text-gray-200" },
                      "Sitios Web (Hasta 2 URLs)",
                    ),
                    e("input", {
                      type: "url",
                      maxLength: 256,
                      value: website1,
                      onChange: (ev) => setWebsite1(ev.target.value),
                      placeholder: "https://tudominio.com (Principal)",
                      "data-testid": "website1",
                      className:
                        "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs",
                    }),
                    e("input", {
                      type: "url",
                      maxLength: 256,
                      value: website2,
                      onChange: (ev) => setWebsite2(ev.target.value),
                      placeholder: "https://instagram.com/tu_cuenta (Opcional)",
                      "data-testid": "website2",
                      className:
                        "w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#008069] focus:outline-none transition-all shadow-xs",
                    }),
                  ]),
                ],
          ),
          e(
            "div",
            {
              key: "footer",
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
                  "data-testid": "inbox-wa-profile-save",
                  onClick: handleSaveTextProfile,
                  disabled: loading || saving,
                  className:
                    "px-5 py-2 rounded-xl bg-[#008069] hover:bg-[#00705c] text-white text-sm font-bold shadow-md transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95",
                },
                [
                  saving
                    ? e("i", { key: "spin", className: "fas fa-spinner fa-spin text-xs" })
                    : null,
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

export default InboxWhatsAppProfileModal;
