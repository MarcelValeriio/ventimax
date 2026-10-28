/**
 * public/src/features/dashboard/components/EnvConfigModal.js
 * Modal de Administración de Variables de Entorno y Canales (Opción D Híbrida)
 */
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";

const e = React.createElement;

const TABS = [
  { id: "whatsapp", label: "WhatsApp & Meta", icon: "fab fa-whatsapp" },
  { id: "social", label: "Instagram & Messenger", icon: "fab fa-instagram" },
  { id: "alerts", label: "Alertas & Teléfonos", icon: "fas fa-bell" },
  { id: "tracking", label: "Tracking & CAPI", icon: "fas fa-chart-line" },
  { id: "secrets", label: "Estado de Secretos", icon: "fas fa-shield-alt" },
];

export const EnvConfigModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState("whatsapp");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingWa, setTestingWa] = useState(false);
  const [waTestResult, setWaTestResult] = useState(null);

  // Solo estas claves se pueden editar; el servidor rechaza cualquier otra
  const [editables, setEditables] = useState({
    ADMIN_PHONE_NUMBER: "",
    ADMIN_PHONE_NUMBER_2: "",
    DELIVERY_PHONE_NUMBER: "",
    WEBHOOK_DEBOUNCE_MS: "",
  });
  // Valores efectivos de las variables de solo lectura
  const [lectura, setLectura] = useState({});

  const [estadoSecretos, setEstadoSecretos] = useState({});

  useEffect(() => {
    let isMounted = true;
    const fetchConfig = async () => {
      try {
        setLoading(true);
        const res = await apiClient.get("/api/admin/config");
        if (res.data?.success && isMounted) {
          if (res.data.editables) {
            setEditables((prev) => ({
              ...prev,
              ...res.data.editables,
            }));
          }
          if (res.data.lectura) {
            setLectura(res.data.lectura);
          }
          if (res.data.estadoSecretos) {
            setEstadoSecretos(res.data.estadoSecretos);
          }
        }
      } catch (err) {
        console.error("Error cargando configuración:", err);
        window.showToast?.("No se pudo cargar la configuración de variables", "error");
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (key, value) => {
    setEditables((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const cleaned = {};
      for (const k of Object.keys(editables)) {
        const v = editables[k];
        cleaned[k] = typeof v === "string" ? v.trim() : v;
      }

      const res = await apiClient.put("/api/admin/config", cleaned);
      if (res.data?.success) {
        window.showToast?.("✅ Configuración guardada y actualizada en caliente", "success");
        onClose();
      }
    } catch (err) {
      console.error("Error guardando configuración:", err);
      const msg = err.response?.data?.error || "Error al guardar la configuración";
      window.showToast?.(`❌ ${msg}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleTestWhatsApp = async () => {
    try {
      setTestingWa(true);
      setWaTestResult(null);
      const res = await apiClient.post("/api/admin/config/test-whatsapp");
      if (res.data?.success) {
        setWaTestResult({
          success: true,
          message: `Conexión verificada: ${res.data.data?.verified_name || "Válido"} (${res.data.data?.display_phone_number || "Número OK"})`,
        });
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || "Fallo en la prueba de conexión";
      setWaTestResult({
        success: false,
        message: msg,
      });
    } finally {
      setTestingWa(false);
    }
  };

  // Renderizador de un campo de texto estándar
  const renderField = (key, label, placeholder, helperText) => {
    const esEditable = Object.prototype.hasOwnProperty.call(editables, key);
    const valor = esEditable ? editables[key] : lectura[key];
    return e("div", { className: "mb-4" },
      e("label", { className: "block text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-200 mb-1" }, label),
      e("input", {
        type: "text",
        value: valor || "",
        readOnly: !esEditable,
        disabled: !esEditable,
        onChange: esEditable ? (ev) => handleChange(key, ev.target.value) : undefined,
        placeholder: esEditable ? placeholder : "No configurado",
        className: "w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-50 placeholder:text-gray-400 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none transition-colors",
      }),
      e("p", { className: "text-xs text-gray-500 dark:text-gray-400 mt-1" },
        esEditable ? helperText : `Solo lectura. ${helperText || ""}`.trim()
      )
    );
  };

  // Pestaña: WhatsApp & Meta
  const renderWhatsAppTab = () => {
    return e("div", { className: "space-y-4" },
      e("div", { className: "bg-blue-50 dark:bg-blue-950/50 p-3 rounded-lg border border-blue-200 dark:border-blue-700 text-xs text-blue-800 dark:text-blue-200 flex items-center justify-between" },
        e("span", null, "Verifica el estado del canal de WhatsApp Cloud API en tiempo real:"),
        e("button", {
          type: "button",
          onClick: handleTestWhatsApp,
          disabled: testingWa,
          className: "px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium text-xs shadow-sm flex items-center gap-1 disabled:opacity-50",
        },
          testingWa ? e("i", { className: "fas fa-spinner fa-spin" }) : e("i", { className: "fas fa-plug" }),
          testingWa ? "Probando..." : "Probar Conexión"
        )
      ),
      waTestResult && e("div", {
        className: `p-3 rounded-lg text-xs font-medium ${waTestResult.success ? "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200 border border-green-300 dark:border-green-700" : "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200 border border-red-300 dark:border-red-700"}`
      },
        e("i", { className: `fas mr-1.5 ${waTestResult.success ? "fa-check-circle" : "fa-exclamation-triangle"}` }),
        waTestResult.message
      ),
      renderField("WHATSAPP_PHONE_NUMBER_ID", "Phone Number ID (Meta)", "1092837465...", "Identificador de teléfono asignado en Meta WhatsApp Cloud API."),
      renderField("WHATSAPP_BUSINESS_ACCOUNT_ID", "WhatsApp Business Account ID (WABA)", "9283746102...", "ID de cuenta comercial de WhatsApp (WABA)."),
      renderField("WHATSAPP_TEMPLATE_ORDER", "Nombre Plantilla Notificación Comanda", "order_notification", "Plantilla de Meta utilizada para notificar comandas fuera de ventana de 24h."),
      renderField("WHATSAPP_TEMPLATE_REACTIVACION", "Nombre Plantilla Reactivación", "reactivacion_carrito", "Plantilla de Meta utilizada por el servicio de retoma de carritos abandonados.")
    );
  };

  // Pestaña: Instagram & Messenger
  const renderSocialTab = () => {
    return e("div", { className: "space-y-4" },
      renderField("IG_ACCOUNT_ID", "Instagram Business Account ID", "178414...", "ID de la cuenta de Instagram conectada a la Fanpage."),
      renderField("FB_PAGE_ID", "Facebook Page ID (Messenger)", "1029384756...", "ID numérico de la página de Facebook para canal Messenger.")
    );
  };

  // Pestaña: Alertas & Teléfonos
  const renderAlertsTab = () => {
    return e("div", { className: "space-y-4" },
      renderField("ADMIN_PHONE_NUMBER", "Teléfono Administrador 1 (Notificaciones)", "584120000000", "Formato internacional sin signos (ej: 584121234567)."),
      renderField("ADMIN_PHONE_NUMBER_2", "Teléfono Administrador 2 (Alternativo)", "584140000000", "Segundo número administrativo para recibir comandas y alertas."),
      renderField("DELIVERY_PHONE_NUMBER", "Teléfono Repartidor / Delivery", "584240000000", "Número al que se le despachan asignaciones de entrega."),
      renderField("WEBHOOK_DEBOUNCE_MS", "Debounce de Mensajes de Meta (Milisegundos)", "1200", "Ventana de espera para agrupar mensajes concurrentes recibidos en ráfaga."),
      renderField("VAPID_EMAIL", "Email de Contacto Push Web", "admin@tu-sitio.com", "Dirección de correo asociada a la suscripción VAPID para notificaciones móviles.")
    );
  };

  // Pestaña: Tracking & CAPI
  const renderTrackingTab = () => {
    return e("div", { className: "space-y-4" },
      renderField("META_PIXEL_ID", "Meta Pixel ID", "123456789012345", "ID del Pixel de Facebook/Meta Ads para tracking de eventos."),
      renderField("META_DATASET_ID", "Meta Dataset ID", "123456789012345", "ID del Dataset en Events Manager (si aplica)."),
      renderField("META_CAPI_TEST_EVENT_CODE", "Test Event Code (Meta Conversions API)", "TEST12345", "Código de prueba para validar eventos Purchase en vivo en Events Manager.")
    );
  };

  // Pestaña: Estado de Secretos (Solo Lectura)
  const renderSecretsTab = () => {
    const secretList = Object.entries(estadoSecretos);

    return e("div", { className: "space-y-4" },
      e("div", { className: "bg-amber-50 dark:bg-amber-950/50 p-3 rounded-lg border border-amber-200 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-200" },
        e("i", { className: "fas fa-info-circle mr-1.5" }),
        "Por políticas estrictas de seguridad (SAIF/OWASP), los tokens y secretos no se envían a la web ni pueden editarse desde el panel. Solo se indica si están configurados en las variables de entorno de Render."
      ),
      e("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1" },
        secretList.map(([key, isConfigured]) =>
          e("div", {
            key,
            className: "flex items-center justify-between p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-950/60 text-xs"
          },
            e("span", { className: "font-mono font-medium truncate max-w-[200px] text-gray-800 dark:text-gray-100" }, key),
            isConfigured
              ? e("span", { className: "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800 dark:bg-green-900/60 dark:text-green-200 gap-1" },
                  e("i", { className: "fas fa-check text-[9px]" }), "Configurado"
                )
              : e("span", { className: "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-200 gap-1" },
                  e("i", { className: "fas fa-times text-[9px]" }), "No configurado"
                )
          )
        )
      )
    );
  };

  // Antes de los return de render, para no alterar el orden de los hooks
  if (!isOpen) return null;

  return e("div", {
    className: "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn",
    onClick: () => !saving && onClose(),
  },
    e("div", {
      className: "relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-600 overflow-hidden flex flex-col max-h-[90vh]",
      onClick: (ev) => ev.stopPropagation(),
    },
      // Cabecera
      e("div", { className: "px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900" },
        e("div", { className: "flex items-center gap-3" },
          e("div", { className: "w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 flex items-center justify-center text-lg" },
            e("i", { className: "fas fa-sliders-h" })
          ),
          e("div", null,
            e("h3", { className: "text-base font-bold text-gray-900 dark:text-gray-100" }, "Variables de Entorno y Canales"),
            e("p", { className: "text-xs text-gray-500 dark:text-gray-400" }, "Teléfonos de alerta y debounce editables; el resto, solo lectura")
          )
        ),
        e("button", {
          type: "button",
          onClick: onClose,
          disabled: saving,
          className: "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1"
        },
          e("i", { className: "fas fa-times text-lg" })
        )
      ),

      // Pestañas
      e("div", { className: "flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-4 overflow-x-auto" },
        TABS.map((tab) =>
          e("button", {
            key: tab.id,
            type: "button",
            onClick: () => setActiveTab(tab.id),
            className: `flex items-center gap-2 px-3 py-2.5 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-600 dark:text-blue-300 dark:border-blue-400 bg-white dark:bg-gray-900 rounded-t-lg"
                : "border-transparent text-gray-500 dark:text-gray-300 hover:text-gray-700 dark:hover:text-white"
            }`,
          },
            e("i", { className: tab.icon }),
            tab.label
          )
        )
      ),

      // Contenido con Scroll
      e("div", { className: "p-6 overflow-y-auto flex-1" },
        loading
          ? e("div", { className: "py-12 flex flex-col items-center justify-center text-gray-400 gap-2" },
              e("i", { className: "fas fa-circle-notch fa-spin text-2xl text-blue-500" }),
              e("span", { className: "text-xs" }, "Cargando configuración...")
            )
          : (
            activeTab === "whatsapp" ? renderWhatsAppTab() :
            activeTab === "social" ? renderSocialTab() :
            activeTab === "alerts" ? renderAlertsTab() :
            activeTab === "tracking" ? renderTrackingTab() :
            renderSecretsTab()
          )
      ),

      // Pie de modal
      e("div", { className: "px-6 py-3.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 flex items-center justify-between" },
        e("span", { className: "text-[11px] text-gray-400" },
          "💾 Los cambios se aplican inmediatamente en MongoDB sin reiniciar Render"
        ),
        e("div", { className: "flex items-center gap-2" },
          e("button", {
            type: "button",
            onClick: onClose,
            disabled: saving,
            className: "px-4 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          }, "Cerrar"),
          activeTab !== "secrets" && e("button", {
            type: "button",
            onClick: handleSave,
            disabled: saving || loading,
            className: "px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-all flex items-center gap-1.5 disabled:opacity-50"
          },
            saving && e("i", { className: "fas fa-circle-notch fa-spin text-xs" }),
            saving ? "Guardando..." : "Guardar Cambios"
          )
        )
      )
    )
  );
};

export default EnvConfigModal;
