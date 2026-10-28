/**
 * public/src/features/dashboard/SettingsPanel.js
 * Panel de Configuración: navegación por secciones (lateral en escritorio, pestañas en móvil)
 * y cada ajuste en una sola ubicación.
 */
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js";
import {
  isPushSupported,
  getCurrentPushSubscription,
  subscribeToWebPush,
  unsubscribeFromWebPush,
  sendTestWebPush,
} from "../../services/pushManager.js?v=4";
import EnvConfigModal from "./components/EnvConfigModal.js";

const e = React.createElement;

// Días de la semana ordenados de Lunes a Domingo para una mejor UX
const DAYS_OF_WEEK = [
  { id: 1, name: "Lunes", short: "Lun" },
  { id: 2, name: "Martes", short: "Mar" },
  { id: 3, name: "Miércoles", short: "Mié" },
  { id: 4, name: "Jueves", short: "Jue" },
  { id: 5, name: "Viernes", short: "Vie" },
  { id: 6, name: "Sábado", short: "Sáb" },
  { id: 0, name: "Domingo", short: "Dom" },
];

const SECTIONS = [
  { id: "general", label: "General", icon: "fa-sliders-h", adminOnly: false },
  { id: "notificaciones", label: "Notificaciones", icon: "fa-bell", adminOnly: false },
  { id: "operacion", label: "Operación", icon: "fa-tasks", adminOnly: true },
  { id: "canales", label: "Canales y variables", icon: "fa-plug", adminOnly: true },
  { id: "catalogo", label: "Catálogo web", icon: "fa-globe", adminOnly: true },
];

// Clases literales (Tailwind necesita verlas completas en el código)
const ICON_TONES = {
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400",
  teal: "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400",
  gray: "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-400",
};

const TOGGLE_TONES = {
  emerald: "bg-emerald-600",
  blue: "bg-blue-600",
};

const Toggle = ({ checked, onChange, disabled, tone = "emerald", label }) =>
  e("button", {
    type: "button",
    role: "switch",
    "aria-checked": checked,
    "aria-label": label,
    onClick: onChange,
    disabled: disabled,
    className: `relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
      checked ? TOGGLE_TONES[tone] : "bg-gray-300 dark:bg-gray-600"
    } ${disabled ? "opacity-50 cursor-wait" : ""}`,
  }, e("span", {
    className: `inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
      checked ? "translate-x-6" : "translate-x-1"
    }`,
  }));

// Agrupa filas de ajustes relacionadas bajo un mismo título
const SettingsGroup = ({ title, rows }) =>
  e("section", { className: "space-y-3" },
    title && e("h3", { className: "text-[11px] font-black uppercase tracking-widest text-gray-400 px-1" }, title),
    e("div", {
      className: "bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 overflow-hidden",
    }, ...rows)
  );

// Una fila de ajuste: icono, título, descripción y control (interruptor o acción)
const SettingRow = ({ icon, tone = "emerald", title, description, control, onClick }) => {
  const trailing = control || (onClick && e("i", { className: "fas fa-chevron-right text-xs text-gray-300 dark:text-gray-600" }));
  return e("div", {
    onClick: onClick,
    role: onClick ? "button" : undefined,
    tabIndex: onClick ? 0 : undefined,
    onKeyDown: onClick
      ? (ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onClick();
          }
        }
      : undefined,
    className: `flex items-center justify-between gap-4 px-5 py-4 ${
      onClick
        ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 focus:outline-none focus-visible:bg-gray-50 dark:focus-visible:bg-gray-700/40"
        : ""
    }`,
  },
    e("div", { className: "flex items-center gap-4 min-w-0" },
      e("div", {
        className: `shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${ICON_TONES[tone]}`,
      }, e("i", { className: `fas ${icon}` })),
      e("div", { className: "min-w-0" },
        e("p", { className: "text-sm font-bold text-gray-800 dark:text-gray-100" }, title),
        description && e("p", { className: "text-xs text-gray-500 dark:text-gray-400 mt-0.5" }, description)
      )
    ),
    trailing && e("div", { className: "shrink-0 flex items-center gap-2" }, trailing)
  );
};

const PageHeader = ({ title, description }) =>
  e("div", { className: "mb-2" },
    e("h2", { className: "text-2xl md:text-3xl font-black text-gray-800 dark:text-white tracking-tight" }, title),
    description && e("p", { className: "text-sm text-gray-500 dark:text-gray-400 mt-1" }, description)
  );

const describirAlertas = (disabledDays, startHour, endHour, loading) => {
  if (loading) return "Cargando configuración...";
  const hours = `(${startHour} a ${endHour})`;
  if (disabledDays.length === 0) return `Activas todos los días ${hours}`;
  if (disabledDays.length === 7) return "Todas silenciadas";
  if (disabledDays.length === 2 && disabledDays.includes(0) && disabledDays.includes(6)) {
    return `Silenciadas en fin de semana ${hours}`;
  }
  const names = DAYS_OF_WEEK.filter((d) => disabledDays.includes(d.id)).map((d) => d.name);
  return `Silenciadas: ${names.join(", ")} ${hours}`;
};

// Modal de Alertas Admin (WhatsApp). Recibe su estado y acciones desde SettingsPanel.
const WatchdogModal = ({
  days,
  startHour,
  endHour,
  saving,
  onClose,
  onToggleDay,
  onPreset,
  onStartChange,
  onEndChange,
  onSave,
}) => {
  const isAllActive = days.length === 0;
  const isWeekdaysOnly = days.length === 2 && days.includes(0) && days.includes(6);
  const isAllDisabled = days.length === 7;

  const presetClass = (active, activeClass) =>
    `px-3 py-1.5 rounded-xl text-xs font-bold transition active:scale-95 ${
      active
        ? `${activeClass} text-white shadow-sm`
        : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
    }`;

  const timeInput = (value, onChange) =>
    e("input", {
      type: "time",
      value: value,
      onChange: (ev) => onChange(ev.target.value),
      required: true,
      className: "w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm font-bold text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500",
    });

  return e("div", {
    className: "fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm",
    onClick: () => !saving && onClose(),
  }, e("div", {
    className: "bg-white dark:bg-gray-800 w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-gray-100 dark:border-gray-700 flex flex-col max-h-[90vh]",
    onClick: (ev) => ev.stopPropagation(),
  },
    // Encabezado
    e("div", { className: "flex items-start justify-between gap-4 mb-4" },
      e("div", null,
        e("h3", { className: "text-lg font-black text-gray-800 dark:text-white" }, "Alertas Admin"),
        e("p", { className: "text-xs text-gray-500 dark:text-gray-400 mt-0.5" }, "Recordatorios automáticos por WhatsApp a los administradores")
      ),
      e("button", {
        type: "button",
        onClick: () => !saving && onClose(),
        disabled: saving,
        "aria-label": "Cerrar",
        className: "w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition",
      }, e("i", { className: "fas fa-times" }))
    ),

    // Accesos rápidos
    e("div", { className: "mb-4" },
      e("p", { className: "text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2 px-1" }, "Accesos rápidos"),
      e("div", { className: "flex flex-wrap gap-2" },
        e("button", {
          type: "button",
          onClick: () => onPreset("weekdays"),
          className: presetClass(isWeekdaysOnly, "bg-emerald-600"),
        }, "Lunes a viernes"),
        e("button", {
          type: "button",
          onClick: () => onPreset("all"),
          className: presetClass(isAllActive, "bg-emerald-600"),
        }, "Todos los días"),
        e("button", {
          type: "button",
          onClick: () => onPreset("none"),
          className: presetClass(isAllDisabled, "bg-rose-600"),
        }, "Silenciar todo")
      )
    ),

    // Días
    e("div", { className: "overflow-y-auto pr-1 space-y-2 flex-1 max-h-[260px]" },
      ...DAYS_OF_WEEK.map((day) => {
        const isEnabled = !days.includes(day.id);
        return e("div", {
          key: day.id,
          onClick: () => onToggleDay(day.id),
          className: `p-3 rounded-2xl border transition-colors flex items-center justify-between cursor-pointer select-none ${
            isEnabled
              ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40"
              : "bg-gray-50 dark:bg-gray-700/30 border-gray-200 dark:border-gray-700"
          }`,
        },
          e("div", { className: "flex items-center gap-3" },
            e("div", {
              className: `w-9 h-9 rounded-xl flex items-center justify-center text-xs font-black ${
                isEnabled
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
              }`,
            }, day.short),
            e("div", null,
              e("p", { className: "text-sm font-bold text-gray-800 dark:text-gray-100" }, day.name),
              e("p", {
                className: `text-[11px] font-semibold mt-0.5 ${
                  isEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"
                }`,
              }, isEnabled ? "Alertas activas" : "Silenciado")
            )
          ),
          e("span", {
            className: `relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${
              isEnabled ? "bg-emerald-600" : "bg-gray-300 dark:bg-gray-600"
            }`,
          }, e("span", {
            className: `inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isEnabled ? "translate-x-6" : "translate-x-1"
            }`,
          }))
        );
      })
    ),

    // Franja horaria
    e("div", { className: "mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2" },
      e("p", { className: "text-[10px] font-black uppercase tracking-wider text-gray-400" }, "Franja horaria permitida"),
      e("div", { className: "grid grid-cols-2 gap-3" },
        e("label", { className: "block" },
          e("span", { className: "block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1" }, "Inicio"),
          timeInput(startHour, onStartChange)
        ),
        e("label", { className: "block" },
          e("span", { className: "block text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-1" }, "Fin"),
          timeInput(endHour, onEndChange)
        )
      )
    ),

    // Pie
    e("div", { className: "pt-4 mt-4 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-3" },
      e("p", { className: "text-xs text-gray-500 dark:text-gray-400 font-medium" },
        `${7 - days.length} activo(s) · ${days.length} silenciado(s)`
      ),
      e("div", { className: "flex items-center gap-2 w-full sm:w-auto" },
        e("button", {
          type: "button",
          disabled: saving,
          onClick: onClose,
          className: "flex-1 sm:flex-initial px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition",
        }, "Cancelar"),
        e("button", {
          type: "button",
          disabled: saving,
          onClick: onSave,
          className: `flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 transition flex items-center justify-center gap-2 ${
            saving ? "opacity-60 cursor-wait" : ""
          }`,
        },
          e("i", { className: `fas ${saving ? "fa-spinner fa-spin" : "fa-save"}` }),
          saving ? "Guardando..." : "Guardar"
        )
      )
    )
  ));
};

const SettingsPanel = ({ isDark, setIsDark, setActiveTab, user, audioEnabled, setAudioEnabled }) => {
  const isAdmin = Boolean(user && user.role === "admin");
  const [activeSection, setActiveSection] = useState("general");

  const [pushSupported, setPushSupported] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  // Alertas Admin (Watchdog)
  const [watchdogDisabledDays, setWatchdogDisabledDays] = useState([0, 6]);
  const [watchdogStartHour, setWatchdogStartHour] = useState("08:00");
  const [watchdogEndHour, setWatchdogEndHour] = useState("22:00");
  const [watchdogLoading, setWatchdogLoading] = useState(false);
  const [watchdogSaving, setWatchdogSaving] = useState(false);
  const [isWatchdogModalOpen, setIsWatchdogModalOpen] = useState(false);
  const [tempDisabledDays, setTempDisabledDays] = useState([0, 6]);
  const [tempStartHour, setTempStartHour] = useState("08:00");
  const [tempEndHour, setTempEndHour] = useState("22:00");

  const [horarioDays, setHorarioDays] = useState([1, 2, 3, 4, 5]);
  const [horarioApertura, setHorarioApertura] = useState("09:00");
  const [horarioCierre, setHorarioCierre] = useState("17:00");
  const [horarioTexto, setHorarioTexto] = useState("");
  const [horarioLoading, setHorarioLoading] = useState(false);
  const [horarioSaving, setHorarioSaving] = useState(false);

  // Flujo en días no laborables (F0-4)
  const [flujoActivo, setFlujoActivo] = useState(true);
  const [entregaDiferidaActivo, setEntregaDiferidaActivo] = useState(true);
  const [entregaDiferidaTexto, setEntregaDiferidaTexto] = useState("");
  const [retiroEnPuntoActivo, setRetiroEnPuntoActivo] = useState(false);
  const [retiroEnPuntoNombre, setRetiroEnPuntoNombre] = useState("");
  const [retiroEnPuntoDireccion, setRetiroEnPuntoDireccion] = useState("");
  const [retiroEnPuntoHorario, setRetiroEnPuntoHorario] = useState("");
  const [flujoLoading, setFlujoLoading] = useState(false);
  const [flujoSaving, setFlujoSaving] = useState(false);

  // Datos del negocio (política de privacidad y enlaces a WhatsApp)
  const [datosNegocio, setDatosNegocio] = useState({
    razonSocial: "", rif: "", direccion: "", email: "", website: "", instagram: "", whatsapp: "",
  });
  const [datosFecha, setDatosFecha] = useState("");
  const [datosLoading, setDatosLoading] = useState(false);
  const [datosSaving, setDatosSaving] = useState(false);

  // Catálogo web y anti-abuso (F2-4)
  const [catalogoConfig, setCatalogoConfig] = useState({
    activo: true,
    prefijo: "PW",
    mensajePrefill: "Hola, quiero confirmar mi pedido web {{codigo}}",
  });
  const [catalogoPrefijoOriginal, setCatalogoPrefijoOriginal] = useState("PW");
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [catalogoSaving, setCatalogoSaving] = useState(false);
  const [abusoReporte, setAbusoReporte] = useState([]);
  const [abusoLoading, setAbusoLoading] = useState(false);

  const [isEnvModalOpen, setIsEnvModalOpen] = useState(false);

  // Si el usuario deja de ser admin, no puede quedarse en una sección solo para admin
  const visibleSections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);
  const currentSection = visibleSections.some((s) => s.id === activeSection) ? activeSection : "general";

  useEffect(() => {
    const checkPush = async () => {
      const supported = isPushSupported();
      setPushSupported(supported);
      if (supported) {
        const sub = await getCurrentPushSubscription();
        setPushSubscribed(Boolean(sub));
      }
    };
    checkPush();
  }, []);

  // Carga la configuración de Alertas Admin desde el endpoint autenticado (solo admin)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchWatchdogConfig = async () => {
      try {
        setWatchdogLoading(true);
        const client = window.apiClient || apiClient;
        const res = await client.get("/api/config/watchdog");
        const watchdog = res.data?.watchdog;
        if (watchdog) {
          if (Array.isArray(watchdog.disabledDays)) setWatchdogDisabledDays(watchdog.disabledDays);
          if (watchdog.startHour) setWatchdogStartHour(watchdog.startHour);
          if (watchdog.endHour) setWatchdogEndHour(watchdog.endHour);
        }
      } catch (err) {
        console.warn("No se pudo cargar la configuración de watchdog:", err);
      } finally {
        setWatchdogLoading(false);
      }
    };
    fetchWatchdogConfig();
  }, [isAdmin]);

  // Carga la configuración de Horario de Atención (solo admin)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchHorarioConfig = async () => {
      try {
        setHorarioLoading(true);
        const client = window.apiClient || apiClient;
        const res = await client.get("/api/admin/config/horario");
        if (res.data?.success && res.data?.horario) {
          const h = res.data.horario;
          if (Array.isArray(h.dias)) setHorarioDays(h.dias);
          if (h.apertura) setHorarioApertura(h.apertura);
          if (h.cierre) setHorarioCierre(h.cierre);
          if (res.data.texto) setHorarioTexto(res.data.texto);
        }
      } catch (err) {
        console.warn("No se pudo cargar el horario de atención:", err);
      } finally {
        setHorarioLoading(false);
      }
    };
    fetchHorarioConfig();
  }, [isAdmin]);

  // Carga los datos legales y de contacto del negocio (solo admin)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchDatosNegocio = async () => {
      try {
        setDatosLoading(true);
        const client = window.apiClient || apiClient;
        const res = await client.get("/api/admin/config/datos-negocio");
        if (res.data?.success && res.data?.datos) {
          const d = res.data.datos;
          setDatosNegocio({
            razonSocial: d.legal?.razonSocial || "",
            rif: d.legal?.rif || "",
            direccion: d.legal?.direccion || "",
            email: d.contacto?.email || "",
            website: d.contacto?.website || "",
            instagram: d.contacto?.instagram || "",
            whatsapp: d.contacto?.whatsapp || "",
          });
          setDatosFecha(d.fechaActualizacion || "");
        }
      } catch (err) {
        console.warn("No se pudieron cargar los datos del negocio:", err);
      } finally {
        setDatosLoading(false);
      }
    };
    fetchDatosNegocio();
  }, [isAdmin]);

  // Carga la configuración de Días No Laborables (solo admin)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchFlujoConfig = async () => {
      try {
        setFlujoLoading(true);
        const client = window.apiClient || apiClient;
        const res = await client.get("/api/admin/config/flujo-no-laborable");
        if (res.data?.success && res.data?.flujo) {
          const f = res.data.flujo;
          setFlujoActivo(Boolean(f.activo));
          if (f.entregaDiferida) {
            setEntregaDiferidaActivo(Boolean(f.entregaDiferida.activo));
            setEntregaDiferidaTexto(f.entregaDiferida.texto || "");
          }
          if (f.retiroEnPunto) {
            setRetiroEnPuntoActivo(Boolean(f.retiroEnPunto.activo));
            setRetiroEnPuntoNombre(f.retiroEnPunto.nombre || "");
            setRetiroEnPuntoDireccion(f.retiroEnPunto.direccion || "");
            setRetiroEnPuntoHorario(f.retiroEnPunto.horario || "");
          }
        }
      } catch (err) {
        console.warn("No se pudo cargar la configuración de días no laborables:", err);
      } finally {
        setFlujoLoading(false);
      }
    };
    fetchFlujoConfig();
  }, [isAdmin]);

  // Carga la configuración del Catálogo Web y el reporte anti-abuso (solo admin)
  useEffect(() => {
    if (!isAdmin) return;
    const fetchCatalogoConfig = async () => {
      try {
        setCatalogoLoading(true);
        const client = window.apiClient || apiClient;
        const res = await client.get("/api/admin/config/catalogo");
        if (res.data?.success && res.data?.catalogo) {
          const c = res.data.catalogo;
          setCatalogoConfig({
            activo: Boolean(c.activo),
            prefijo: c.prefijo || "PW",
            mensajePrefill: c.mensajePrefill || "",
          });
          setCatalogoPrefijoOriginal(c.prefijo || "PW");
        }
      } catch (err) {
        console.warn("No se pudo cargar la configuración del catálogo:", err);
      } finally {
        setCatalogoLoading(false);
      }
    };

    const fetchAbusoReporte = async () => {
      try {
        setAbusoLoading(true);
        const client = window.apiClient || apiClient;
        const res = await client.get("/api/admin/config/catalogo/abuso");
        if (res.data?.success && Array.isArray(res.data?.reporte)) {
          setAbusoReporte(res.data.reporte);
        }
      } catch (err) {
        console.warn("No se pudo cargar el reporte de abuso:", err);
      } finally {
        setAbusoLoading(false);
      }
    };

    fetchCatalogoConfig();
    fetchAbusoReporte();
  }, [isAdmin]);

  const toast = (msg, type) => {
    if (window.showToast) window.showToast(msg, type);
  };

  const handleTogglePush = async () => {
    if (!pushSupported) {
      toast("Tu navegador no soporta notificaciones push", "error");
      return;
    }
    setPushLoading(true);
    try {
      if (pushSubscribed) {
        await unsubscribeFromWebPush();
        setPushSubscribed(false);
        toast("Notificaciones push desactivadas", "success");
      } else {
        await subscribeToWebPush();
        setPushSubscribed(true);
        toast("Notificaciones push activadas", "success");
      }
    } catch (err) {
      console.error("Error cambiando estado push:", err);
      toast(err.message || "Error configurando notificaciones", "error");
    } finally {
      setPushLoading(false);
    }
  };

  const handleSendTestPush = async () => {
    try {
      await sendTestWebPush();
      toast("Alerta de prueba enviada al dispositivo", "success");
    } catch (err) {
      toast("Error enviando alerta de prueba", "error");
    }
  };

  const handleToggleSound = () => {
    const newState = !audioEnabled;
    if (setAudioEnabled) setAudioEnabled(newState);
    sessionStorage.setItem("audio_enabled_session", String(newState));
  };

  // Alertas Admin: abrir, editar en borrador y guardar
  const handleOpenWatchdogModal = () => {
    setTempDisabledDays([...watchdogDisabledDays]);
    setTempStartHour(watchdogStartHour);
    setTempEndHour(watchdogEndHour);
    setIsWatchdogModalOpen(true);
  };

  const handleToggleDay = (dayId) => {
    setTempDisabledDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  const handleSetPreset = (type) => {
    if (type === "weekdays") setTempDisabledDays([0, 6]);
    else if (type === "all") setTempDisabledDays([]);
    else if (type === "none") setTempDisabledDays([0, 1, 2, 3, 4, 5, 6]);
  };

  const handleSaveWatchdogConfig = async () => {
    setWatchdogSaving(true);
    try {
      const client = window.apiClient || apiClient;
      await client.put("/api/config/watchdog", {
        watchdog: {
          disabledDays: tempDisabledDays,
          startHour: tempStartHour,
          endHour: tempEndHour,
        },
      });
      setWatchdogDisabledDays([...tempDisabledDays]);
      setWatchdogStartHour(tempStartHour);
      setWatchdogEndHour(tempEndHour);
      setIsWatchdogModalOpen(false);
      toast("Configuración de alertas Admin actualizada", "success");
    } catch (err) {
      console.error("Error guardando configuración de Watchdog:", err);
      toast(err.response?.data?.error || err.message || "Error al guardar configuración", "error");
    } finally {
      setWatchdogSaving(false);
    }
  };

  const handleToggleHorarioDay = (dayId) => {
    setHorarioDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  const handleSaveHorario = async () => {
    if (horarioDays.length === 0) {
      toast("Debe seleccionar al menos un día de atención.", "error");
      return;
    }
    if (horarioApertura >= horarioCierre) {
      toast("La hora de apertura debe ser anterior a la hora de cierre.", "error");
      return;
    }
    setHorarioSaving(true);
    try {
      const client = window.apiClient || apiClient;
      const res = await client.put("/api/admin/config/horario", {
        dias: horarioDays,
        apertura: horarioApertura,
        cierre: horarioCierre,
      });
      if (res.data?.success) {
        toast("Horario de atención guardado correctamente", "success");
        if (res.data.texto) setHorarioTexto(res.data.texto);
      }
    } catch (err) {
      console.error("Error guardando horario de atención:", err);
      toast(err.response?.data?.error || err.message || "Error al guardar horario", "error");
    } finally {
      setHorarioSaving(false);
    }
  };

  const handleSaveDatosNegocio = async () => {
    setDatosSaving(true);
    try {
      const client = window.apiClient || apiClient;
      const d = datosNegocio;
      const res = await client.put("/api/admin/config/datos-negocio", {
        legal: { razonSocial: d.razonSocial, rif: d.rif, direccion: d.direccion },
        contacto: { email: d.email, website: d.website, instagram: d.instagram, whatsapp: d.whatsapp },
      });
      if (res.data?.success && res.data?.datos) {
        const g = res.data.datos;
        setDatosNegocio({
          razonSocial: g.legal.razonSocial, rif: g.legal.rif, direccion: g.legal.direccion,
          email: g.contacto.email, website: g.contacto.website, instagram: g.contacto.instagram, whatsapp: g.contacto.whatsapp,
        });
        setDatosFecha(g.fechaActualizacion || "");
        toast("Datos del negocio guardados correctamente", "success");
      }
    } catch (err) {
      console.error("Error guardando datos del negocio:", err);
      toast(err.response?.data?.error || err.message || "Error al guardar los datos del negocio", "error");
    } finally {
      setDatosSaving(false);
    }
  };

  const handleSaveFlujo = async () => {
    if (flujoActivo && !entregaDiferidaActivo && !retiroEnPuntoActivo) {
      toast("Activa al menos una modalidad o apaga el flujo de días no laborables", "error");
      return;
    }
    if (retiroEnPuntoActivo) {
      if (!retiroEnPuntoNombre.trim()) {
        toast("El nombre del punto de retiro es obligatorio cuando la modalidad está activa.", "error");
        return;
      }
      if (!retiroEnPuntoDireccion.trim()) {
        toast("La dirección del punto de retiro es obligatoria cuando la modalidad está activa.", "error");
        return;
      }
    }
    setFlujoSaving(true);
    try {
      const client = window.apiClient || apiClient;
      const res = await client.put("/api/admin/config/flujo-no-laborable", {
        activo: flujoActivo,
        entregaDiferida: {
          activo: entregaDiferidaActivo,
          texto: entregaDiferidaTexto,
        },
        retiroEnPunto: {
          activo: retiroEnPuntoActivo,
          nombre: retiroEnPuntoNombre,
          direccion: retiroEnPuntoDireccion,
          horario: retiroEnPuntoHorario,
        },
      });
      if (res.data?.success) {
        toast("Configuración de días no laborables guardada correctamente", "success");
      }
    } catch (err) {
      console.error("Error guardando flujo no laborable:", err);
      toast(err.response?.data?.error || err.message || "Error al guardar configuración", "error");
    } finally {
      setFlujoSaving(false);
    }
  };

  const handleSaveCatalogo = async () => {
    const prefijo = catalogoConfig.prefijo.trim().toUpperCase();
    if (!/^[A-HJ-KM-NP-Z]{2,4}$/.test(prefijo)) {
      toast("El prefijo debe tener entre 2 y 4 letras mayúsculas (sin las letras I, L, O).", "error");
      return;
    }
    const prefill = catalogoConfig.mensajePrefill.trim();
    if (!prefill) {
      toast("El mensaje de WhatsApp no puede estar vacío.", "error");
      return;
    }
    if (prefill.length > 200) {
      toast("El mensaje de WhatsApp no puede exceder 200 caracteres.", "error");
      return;
    }
    if (!prefill.includes("{{codigo}}")) {
      toast("El mensaje de WhatsApp debe contener la variable {{codigo}}.", "error");
      return;
    }

    setCatalogoSaving(true);
    try {
      const client = window.apiClient || apiClient;
      const res = await client.put("/api/admin/config/catalogo", {
        catalogo: {
          activo: catalogoConfig.activo,
          prefijo,
          mensajePrefill: prefill,
        },
      });
      if (res.data?.success && res.data?.catalogo) {
        const c = res.data.catalogo;
        setCatalogoConfig({
          activo: Boolean(c.activo),
          prefijo: c.prefijo,
          mensajePrefill: c.mensajePrefill,
        });
        setCatalogoPrefijoOriginal(c.prefijo);
        toast("Configuración del catálogo web guardada correctamente", "success");
      }
    } catch (err) {
      console.error("Error guardando configuración del catálogo:", err);
      toast(err.response?.data?.error || err.message || "Error al guardar configuración", "error");
    } finally {
      setCatalogoSaving(false);
    }
  };

  const handleRefreshAbuso = async () => {
    try {
      setAbusoLoading(true);
      const client = window.apiClient || apiClient;
      const res = await client.get("/api/admin/config/catalogo/abuso");
      if (res.data?.success && Array.isArray(res.data?.reporte)) {
        setAbusoReporte(res.data.reporte);
        toast("Reporte de incidentes actualizado", "success");
      }
    } catch (err) {
      console.error("Error actualizando reporte de abuso:", err);
      toast("Error al actualizar reporte de incidentes", "error");
    } finally {
      setAbusoLoading(false);
    }
  };

  // ---- Secciones ----

  const renderGeneral = () => [
    e(PageHeader, { key: "header", title: "General", description: "Apariencia del panel y tu sesión." }),
    e(SettingsGroup, {
      key: "apariencia",
      title: "Apariencia",
      rows: [
        e(SettingRow, {
          key: "tema",
          icon: isDark ? "fa-moon" : "fa-sun",
          tone: isDark ? "indigo" : "amber",
          title: "Modo oscuro",
          description: isDark ? "Activado" : "Desactivado",
          control: e(Toggle, { checked: isDark, onChange: () => setIsDark(!isDark), label: "Modo oscuro" }),
        }),
      ],
    }),
    e(SettingsGroup, {
      key: "sesion",
      title: "Sesión",
      rows: [
        e(SettingRow, {
          key: "usuario",
          icon: "fa-user-circle",
          tone: "gray",
          title: user?.nombre || user?.user || "Usuario",
          description: `Rol: ${user?.role || "—"}`,
          control: e("a", {
            href: "/logout",
            className: "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition",
          },
            e("i", { className: "fas fa-sign-out-alt mr-2" }),
            "Cerrar sesión"
          ),
        }),
      ],
    }),
  ];

  const renderNotificaciones = () => [
    e(PageHeader, { key: "header", title: "Notificaciones", description: "Qué avisos recibes y cómo en este dispositivo." }),
    e(SettingsGroup, {
      key: "dispositivo",
      title: "Este dispositivo",
      rows: [
        e(SettingRow, {
          key: "sonido",
          icon: "fa-volume-up",
          tone: audioEnabled ? "emerald" : "gray",
          title: "Sonidos de alerta",
          description: audioEnabled ? "Suenan mientras el panel está abierto" : "Silenciados",
          control: e(Toggle, { checked: Boolean(audioEnabled), onChange: handleToggleSound, label: "Sonidos de alerta" }),
        }),
        e(SettingRow, {
          key: "push",
          icon: "fa-mobile-alt",
          tone: pushSubscribed ? "blue" : "gray",
          title: "Notificaciones push",
          description: !pushSupported
            ? "Tu navegador no las soporta"
            : pushSubscribed
              ? "Recibes avisos aunque el navegador esté cerrado"
              : "Recibe avisos en segundo plano",
          control: [
            pushSubscribed && e("button", {
              key: "test",
              type: "button",
              onClick: handleSendTestPush,
              className: "px-3 py-1.5 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 transition",
            }, "Probar"),
            e(Toggle, {
              key: "toggle",
              checked: pushSubscribed,
              onChange: handleTogglePush,
              disabled: pushLoading || !pushSupported,
              tone: "blue",
              label: "Notificaciones push",
            }),
          ],
        }),
      ],
    }),
    isAdmin && e(SettingsGroup, {
      key: "admins",
      title: "Administradores",
      rows: [
        e(SettingRow, {
          key: "alertas",
          icon: "fa-shield-alt",
          tone: "rose",
          title: "Alertas Admin por WhatsApp",
          description: describirAlertas(watchdogDisabledDays, watchdogStartHour, watchdogEndHour, watchdogLoading),
          onClick: handleOpenWatchdogModal,
        }),
      ],
    }),
  ];

  const renderOperacion = () => [
    e(PageHeader, { key: "header", title: "Operación", description: "Herramientas de gestión del negocio." }),
    e("section", { key: "datos-negocio", className: "space-y-3" },
      e("h3", { className: "text-[11px] font-black uppercase tracking-widest text-gray-400 px-1" }, "Datos del negocio"),
      e("div", { className: "bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-6 space-y-6" },
        e("div", { className: "flex items-center gap-3" },
          e("div", { className: `w-10 h-10 rounded-2xl flex items-center justify-center text-sm ${ICON_TONES.blue}` },
            e("i", { className: "fas fa-building" })
          ),
          e("div", null,
            e("h4", { className: "text-sm font-bold text-gray-800 dark:text-gray-100" }, "Datos legales y de contacto"),
            e("p", { className: "text-xs text-gray-500 dark:text-gray-400 mt-0.5" },
              "Aparecen en la política de privacidad (/privacidad), que revisa Meta. El WhatsApp es al que Instagram y Messenger envían a los clientes. Los campos vacíos no se muestran."
            )
          )
        ),
        e("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
          e("div", { className: "space-y-1" },
            e("label", { className: "text-[11px] font-bold text-gray-600 dark:text-gray-400" }, "Razón social:"),
            e("input", {
              type: "text",
              value: datosNegocio.razonSocial,
              placeholder: "Inversiones Ejemplo, C.A.",
              onChange: (ev) => setDatosNegocio({ ...datosNegocio, razonSocial: ev.target.value }),
              className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
            })
          ),
          e("div", { className: "space-y-1" },
            e("label", { className: "text-[11px] font-bold text-gray-600 dark:text-gray-400" }, "RIF:"),
            e("input", {
              type: "text",
              value: datosNegocio.rif,
              placeholder: "J-12345678-9",
              onChange: (ev) => setDatosNegocio({ ...datosNegocio, rif: ev.target.value }),
              className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
            }),
            e("p", { className: "text-[10px] text-gray-400" }, "Letra V, E, J, P o G, 8 dígitos y el verificador.")
          ),
          e("div", { className: "space-y-1 sm:col-span-2" },
            e("label", { className: "text-[11px] font-bold text-gray-600 dark:text-gray-400" }, "Dirección fiscal:"),
            e("input", {
              type: "text",
              value: datosNegocio.direccion,
              placeholder: "Av. Principal, Edificio, Ciudad",
              onChange: (ev) => setDatosNegocio({ ...datosNegocio, direccion: ev.target.value }),
              className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
            })
          ),
        ),
        e("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-3" },
          e("div", { className: "space-y-1" },
            e("label", { className: "text-[11px] font-bold text-gray-600 dark:text-gray-400" }, "Correo de contacto:"),
            e("input", {
              type: "text",
              value: datosNegocio.email,
              placeholder: "contacto@minegocio.com",
              onChange: (ev) => setDatosNegocio({ ...datosNegocio, email: ev.target.value }),
              className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
            })
          ),
          e("div", { className: "space-y-1" },
            e("label", { className: "text-[11px] font-bold text-gray-600 dark:text-gray-400" }, "WhatsApp del negocio:"),
            e("input", {
              type: "text",
              value: datosNegocio.whatsapp,
              placeholder: "584121234567",
              onChange: (ev) => setDatosNegocio({ ...datosNegocio, whatsapp: ev.target.value }),
              className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
            }),
            e("p", { className: "text-[10px] text-gray-400" }, "Con código de país, sin + ni espacios.")
          ),
          e("div", { className: "space-y-1" },
            e("label", { className: "text-[11px] font-bold text-gray-600 dark:text-gray-400" }, "Sitio web:"),
            e("input", {
              type: "text",
              value: datosNegocio.website,
              placeholder: "https://minegocio.com",
              onChange: (ev) => setDatosNegocio({ ...datosNegocio, website: ev.target.value }),
              className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
            })
          ),
          e("div", { className: "space-y-1" },
            e("label", { className: "text-[11px] font-bold text-gray-600 dark:text-gray-400" }, "Instagram:"),
            e("input", {
              type: "text",
              value: datosNegocio.instagram,
              placeholder: "@minegocio",
              onChange: (ev) => setDatosNegocio({ ...datosNegocio, instagram: ev.target.value }),
              className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
            })
          ),
        ),
        e("div", { className: "flex items-center justify-between gap-3 pt-2" },
          e("p", { className: "text-[11px] text-gray-400" },
            datosFecha ? `Última actualización de la política: ${datosFecha}` : "La fecha de actualización se pone sola al guardar."
          ),
          e("button", {
            type: "button",
            onClick: handleSaveDatosNegocio,
            disabled: datosSaving || datosLoading,
            className: "px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2",
          },
            datosSaving && e("i", { className: "fas fa-spinner fa-spin" }),
            datosSaving ? "Guardando..." : "Guardar datos del negocio"
          )
        )
      )
    ),
    e("section", { key: "horario", className: "space-y-3" },
      e("h3", { className: "text-[11px] font-black uppercase tracking-widest text-gray-400 px-1" }, "Horario de atención"),
      e("div", { className: "bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-6 space-y-6" },
        e("div", { className: "flex items-start justify-between gap-4" },
          e("div", { className: "flex items-center gap-3" },
            e("div", { className: `w-10 h-10 rounded-2xl flex items-center justify-center text-sm ${ICON_TONES.teal}` },
              e("i", { className: "fas fa-clock" })
            ),
            e("div", null,
              e("h4", { className: "text-sm font-bold text-gray-800 dark:text-gray-100" }, "Horario comercial del Bot y Delivery"),
              e("p", { className: "text-xs text-gray-500 dark:text-gray-400 mt-0.5" },
                horarioTexto ? `Actual: ${horarioTexto}` : "Configura los días laborables y las horas de apertura y cierre."
              )
            )
          )
        ),
        e("div", { className: "space-y-2" },
          e("label", { className: "text-xs font-bold text-gray-700 dark:text-gray-300" }, "Días laborables:"),
          e("div", { className: "grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2" },
            ...DAYS_OF_WEEK.map((d) => {
              const active = horarioDays.includes(d.id);
              return e("button", {
                key: d.id,
                type: "button",
                onClick: () => handleToggleHorarioDay(d.id),
                className: `py-2.5 px-3 rounded-2xl border text-xs font-bold transition-all flex flex-col items-center justify-center gap-1 ${
                  active
                    ? "bg-emerald-600 border-emerald-600 text-white shadow-sm"
                    : "bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300"
                }`,
              },
                e("span", { className: "text-xs uppercase" }, d.short),
                e("i", { className: `fas fa-check text-[10px] ${active ? "opacity-100" : "opacity-0"}` })
              );
            })
          )
        ),
        e("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4" },
          e("div", { className: "space-y-1.5" },
            e("label", { className: "text-xs font-bold text-gray-700 dark:text-gray-300" }, "Hora de apertura (24h)"),
            e("input", {
              type: "time",
              value: horarioApertura,
              onChange: (ev) => setHorarioApertura(ev.target.value),
              className: "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500",
            })
          ),
          e("div", { className: "space-y-1.5" },
            e("label", { className: "text-xs font-bold text-gray-700 dark:text-gray-300" }, "Hora de cierre (24h)"),
            e("input", {
              type: "time",
              value: horarioCierre,
              onChange: (ev) => setHorarioCierre(ev.target.value),
              className: "w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-100 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500",
            })
          )
        ),
        e("div", { className: "flex justify-end pt-2" },
          e("button", {
            type: "button",
            onClick: handleSaveHorario,
            disabled: horarioSaving || horarioLoading,
            className: "px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2",
          },
            horarioSaving && e("i", { className: "fas fa-spinner fa-spin" }),
            horarioSaving ? "Guardando..." : "Guardar horario"
          )
        )
      )
    ),
    e("section", { key: "dias-no-laborables", className: "space-y-3" },
      e("h3", { className: "text-[11px] font-black uppercase tracking-widest text-gray-400 px-1" }, "Días no laborables"),
      e("div", { className: "bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-6 space-y-6" },
        e("div", { className: "flex items-start justify-between gap-4" },
          e("div", { className: "flex items-center gap-3" },
            e("div", { className: `w-10 h-10 rounded-2xl flex items-center justify-center text-sm ${ICON_TONES.amber}` },
              e("i", { className: "fas fa-moon" })
            ),
            e("div", null,
              e("h4", { className: "text-sm font-bold text-gray-800 dark:text-gray-100" }, "Flujo especial en días no laborables"),
              e("p", { className: "text-xs text-gray-500 dark:text-gray-400 mt-0.5" },
                flujoActivo
                  ? "Activo: El bot intercepta fuera de días comerciales y ofrece modalidades disponibles."
                  : "Desactivado: El bot mantiene el flujo normal de atención aún en días no laborables."
              )
            )
          ),
          e("label", { className: "relative inline-flex items-center cursor-pointer" },
            e("input", {
              type: "checkbox",
              checked: flujoActivo,
              onChange: (ev) => setFlujoActivo(ev.target.checked),
              className: "sr-only peer",
            }),
            e("div", {
              className: "w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-emerald-600",
            })
          )
        ),
        e("div", { className: "p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-700/20 space-y-3" },
          e("div", { className: "flex items-center justify-between" },
            e("label", { className: "flex items-center gap-2 cursor-pointer" },
              e("input", {
                type: "checkbox",
                checked: entregaDiferidaActivo,
                onChange: (ev) => setEntregaDiferidaActivo(ev.target.checked),
                className: "rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4",
              }),
              e("span", { className: "text-xs font-bold text-gray-800 dark:text-gray-200" }, "Modalidad: Entrega diferida (Próximo día hábil)")
            )
          ),
          e("div", { className: "space-y-1.5" },
            e("label", { className: "text-xs text-gray-600 dark:text-gray-400 font-semibold" }, "Texto descriptivo de la modalidad (ej. Entrega en día hábil):"),
            e("input", {
              type: "text",
              value: entregaDiferidaTexto,
              placeholder: "Entrega en día hábil",
              onChange: (ev) => setEntregaDiferidaTexto(ev.target.value),
              className: "w-full px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
            })
          )
        ),
        e("div", { className: "p-4 rounded-2xl border border-gray-100 dark:border-gray-700/60 bg-gray-50/50 dark:bg-gray-700/20 space-y-3" },
          e("div", { className: "flex items-center justify-between" },
            e("label", { className: "flex items-center gap-2 cursor-pointer" },
              e("input", {
                type: "checkbox",
                checked: retiroEnPuntoActivo,
                onChange: (ev) => setRetiroEnPuntoActivo(ev.target.checked),
                className: "rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4",
              }),
              e("span", { className: "text-xs font-bold text-gray-800 dark:text-gray-200" }, "Modalidad: Retiro en punto aliado presencial (Pick Up)")
            )
          ),
          retiroEnPuntoActivo && e("div", { className: "grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1" },
            e("div", { className: "space-y-1" },
              e("label", { className: "text-[11px] font-bold text-gray-600 dark:text-gray-400" }, "Nombre del punto:"),
              e("input", {
                type: "text",
                value: retiroEnPuntoNombre,
                placeholder: "Punto aliado",
                onChange: (ev) => setRetiroEnPuntoNombre(ev.target.value),
                className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
              })
            ),
            e("div", { className: "space-y-1" },
              e("label", { className: "text-[11px] font-bold text-gray-600 dark:text-gray-400" }, "Dirección:"),
              e("input", {
                type: "text",
                value: retiroEnPuntoDireccion,
                placeholder: "Dirección del punto",
                onChange: (ev) => setRetiroEnPuntoDireccion(ev.target.value),
                className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
              })
            ),
            e("div", { className: "space-y-1" },
              e("label", { className: "text-[11px] font-bold text-gray-600 dark:text-gray-400" }, "Horario del punto:"),
              e("input", {
                type: "text",
                value: retiroEnPuntoHorario,
                placeholder: "Lun a Vie de 9:00 am a 5:00 pm",
                onChange: (ev) => setRetiroEnPuntoHorario(ev.target.value),
                className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500",
              })
            )
          )
        ),
        e("div", { className: "flex justify-end pt-2" },
          e("button", {
            type: "button",
            onClick: handleSaveFlujo,
            disabled: flujoSaving || flujoLoading,
            className: "px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2",
          },
            flujoSaving && e("i", { className: "fas fa-spinner fa-spin" }),
            flujoSaving ? "Guardando..." : "Guardar días no laborables"
          )
        )
      )
    ),
    e(SettingsGroup, {
      key: "gestion",
      title: "Gestión",
      rows: [
        e(SettingRow, { key: "personal", icon: "fa-users-cog", tone: "blue", title: "Personal", description: "Usuarios, roles y permisos", onClick: () => setActiveTab("users") }),
        e(SettingRow, { key: "auditoria", icon: "fa-history", tone: "purple", title: "Auditoría", description: "Historial de acciones realizadas", onClick: () => setActiveTab("audit") }),
        e(SettingRow, { key: "respuestas", icon: "fa-comment-dots", tone: "amber", title: "Respuestas rápidas", description: "Mensajes predefinidos del chat", onClick: () => setActiveTab("quickreplies") }),
        e(SettingRow, { key: "faqs", icon: "fa-question-circle", tone: "teal", title: "Preguntas frecuentes", description: "Respuestas automáticas por WhatsApp", onClick: () => setActiveTab("faqs") }),
      ],
    }),
  ];

  const renderCanales = () => [
    e(PageHeader, { key: "header", title: "Canales y variables", description: "Teléfonos de alerta editables. El resto de canales se consulta aquí." }),
    e(SettingsGroup, {
      key: "variables",
      title: "Variables",
      rows: [
        e(SettingRow, {
          key: "entorno",
          icon: "fa-sliders-h",
          tone: "indigo",
          title: "Variables de entorno y canales",
          description: "Teléfonos de alerta y ajustes editables; IDs, plantillas y estado de secretos en solo lectura",
          onClick: () => setIsEnvModalOpen(true),
        }),
      ],
    }),
    e("div", { key: "nota", className: "flex gap-3 items-start rounded-2xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-900/20 p-4 text-xs text-blue-800 dark:text-blue-200" },
      e("i", { className: "fas fa-info-circle mt-0.5 text-blue-500" }),
      e("p", null, "Los tokens y claves secretas se gestionan en Render. Aquí solo ves si están configurados; nunca se muestran ni se editan desde el panel.")
    ),
  ];

  const renderCatalogo = () => [
    e(PageHeader, {
      key: "header",
      title: "Catálogo web",
      description: "Configuración de la tienda online pública, prefijo de pedidos y registro anti-abuso.",
    }),
    e("section", { key: "config-general", className: "space-y-3" },
      e("h3", { className: "text-[11px] font-black uppercase tracking-widest text-gray-400 px-1" }, "Operación del catálogo"),
      e("div", { className: "bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 p-6 space-y-6" },
        e("div", { className: "flex items-start justify-between gap-4" },
          e("div", { className: "flex items-center gap-3" },
            e("div", { className: `w-10 h-10 rounded-2xl flex items-center justify-center text-sm ${ICON_TONES.teal}` },
              e("i", { className: "fas fa-store" })
            ),
            e("div", null,
              e("h4", { className: "text-sm font-bold text-gray-800 dark:text-gray-100" }, "Tienda online pública"),
              e("p", { className: "text-xs text-gray-500 dark:text-gray-400 mt-0.5" },
                catalogoConfig.activo
                  ? "Activo: Los clientes pueden crear carritos web y el bot procesa sus pedidos."
                  : "Desactivado: La API pública responde 503 (Servicio suspendido) y el bot ignora códigos web."
              )
            )
          ),
          e("label", { className: "relative inline-flex items-center cursor-pointer" },
            e("input", {
              type: "checkbox",
              checked: catalogoConfig.activo,
              onChange: (ev) => setCatalogoConfig({ ...catalogoConfig, activo: ev.target.checked }),
              className: "sr-only peer",
            }),
            e("div", {
              className: "w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600",
            })
          )
        ),
        e("div", { className: "grid grid-cols-1 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700" },
          e("div", { className: "space-y-1" },
            e("label", { className: "text-xs font-bold text-gray-700 dark:text-gray-300" }, "Prefijo del código de pedido (2 a 4 letras):"),
            e("input", {
              type: "text",
              value: catalogoConfig.prefijo,
              maxLength: 4,
              placeholder: "PW",
              onChange: (ev) => setCatalogoConfig({ ...catalogoConfig, prefijo: ev.target.value.toUpperCase() }),
              className: "w-full max-w-xs px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500",
            }),
            e("p", { className: "text-[11px] text-gray-400" }, "Solo letras mayúsculas de la A a la Z, excluyendo I, L, O para evitar confusiones tipográficas."),
            catalogoConfig.prefijo !== catalogoPrefijoOriginal && e("div", {
              className: "mt-2 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2",
            },
              e("i", { className: "fas fa-exclamation-triangle mt-0.5 text-amber-500" }),
              e("span", null, "Los pedidos web creados con el prefijo anterior se dejan de reconocer (vencen automáticamente a los 3 días).")
            )
          ),
          e("div", { className: "space-y-1 pt-2" },
            e("label", { className: "text-xs font-bold text-gray-700 dark:text-gray-300" }, "Mensaje predeterminado para WhatsApp:"),
            e("textarea", {
              rows: 3,
              maxLength: 200,
              value: catalogoConfig.mensajePrefill,
              onChange: (ev) => setCatalogoConfig({ ...catalogoConfig, mensajePrefill: ev.target.value }),
              className: "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none",
            }),
            e("div", { className: "flex justify-between text-[11px] text-gray-400" },
              e("span", null, "Debe contener la variable {{codigo}} obligatoriamente."),
              e("span", null, `${(catalogoConfig.mensajePrefill || "").length}/200`)
            )
          )
        ),
        e("div", { className: "flex justify-end pt-2" },
          e("button", {
            type: "button",
            onClick: handleSaveCatalogo,
            disabled: catalogoSaving || catalogoLoading,
            className: "px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-50 flex items-center gap-2",
          },
            catalogoSaving && e("i", { className: "fas fa-spinner fa-spin" }),
            catalogoSaving ? "Guardando..." : "Guardar catálogo"
          )
        )
      )
    ),
    e("section", { key: "abuso", className: "space-y-3" },
      e("div", { className: "flex items-center justify-between px-1" },
        e("h3", { className: "text-[11px] font-black uppercase tracking-widest text-gray-400" }, "Registro anti-abuso (últimos 14 días)"),
        e("button", {
          type: "button",
          onClick: handleRefreshAbuso,
          disabled: abusoLoading,
          className: "text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5 transition",
        },
          e("i", { className: `fas fa-sync-alt ${abusoLoading ? "fa-spin" : ""}` }),
          "Actualizar"
        )
      ),
      e("div", { className: "bg-white dark:bg-gray-800 rounded-3xl border border-gray-100 dark:border-gray-700 overflow-hidden" },
        e("div", { className: "p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400" },
          e("i", { className: "fas fa-shield-alt text-amber-500 text-sm" }),
          e("span", null, "Monitoreo agregado de peticiones e incidentes detectados por la API pública (R14). Sin direcciones IP ni datos personales.")
        ),
        e("div", { className: "overflow-x-auto" },
          e("table", { className: "w-full text-left text-xs" },
            e("thead", { className: "bg-gray-50 dark:bg-gray-700/50 text-[10px] uppercase font-bold text-gray-400 dark:text-gray-400" },
              e("tr", null,
                e("th", { className: "px-4 py-3" }, "Fecha"),
                e("th", { className: "px-4 py-3 text-right" }, "Carritos creados"),
                e("th", { className: "px-4 py-3 text-right" }, "Límite tasa (429)"),
                e("th", { className: "px-4 py-3 text-right" }, "Honeypot"),
                e("th", { className: "px-4 py-3 text-right" }, "Error validación"),
                e("th", { className: "px-4 py-3 text-right" }, "Producto inválido"),
                e("th", { className: "px-4 py-3 text-right" }, "Total incidentes")
              )
            ),
            e("tbody", { className: "divide-y divide-gray-100 dark:divide-gray-700/50" },
              abusoReporte.length === 0
                ? e("tr", null, e("td", { colSpan: 7, className: "px-4 py-6 text-center text-gray-400 italic" }, "Sin datos de actividad reciente"))
                : abusoReporte.map((fila) =>
                    e("tr", { key: fila.fecha, className: "hover:bg-gray-50/50 dark:hover:bg-gray-700/20" },
                      e("td", { className: "px-4 py-3 font-semibold text-gray-700 dark:text-gray-300" }, fila.fecha),
                      e("td", { className: "px-4 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400" }, fila.creado || 0),
                      e("td", { className: `px-4 py-3 text-right font-semibold ${(fila.limite || 0) > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}` }, fila.limite || 0),
                      e("td", { className: `px-4 py-3 text-right font-semibold ${(fila.honeypot || 0) > 0 ? "text-purple-600 dark:text-purple-400" : "text-gray-400"}` }, fila.honeypot || 0),
                      e("td", { className: `px-4 py-3 text-right font-semibold ${(fila.validacion || 0) > 0 ? "text-rose-600 dark:text-rose-400" : "text-gray-400"}` }, fila.validacion || 0),
                      e("td", { className: `px-4 py-3 text-right font-semibold ${(fila.producto || 0) > 0 ? "text-orange-600 dark:text-orange-400" : "text-gray-400"}` }, fila.producto || 0),
                      e("td", { className: `px-4 py-3 text-right font-black ${(fila.totalEventos || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-gray-400"}` }, fila.totalEventos || 0)
                    )
                  )
            )
          )
        )
      )
    )
  ];

  const renderers = {
    general: renderGeneral,
    notificaciones: renderNotificaciones,
    operacion: renderOperacion,
    canales: renderCanales,
    catalogo: renderCatalogo,
  };

  return e("div", { className: "p-4 md:p-8 h-full overflow-y-auto bg-gray-50 dark:bg-gray-900" },
    e("div", { className: "max-w-5xl mx-auto flex flex-col lg:flex-row gap-6 lg:gap-10" },
      // Navegación de secciones: pestañas horizontales en móvil, columna en escritorio
      e("nav", {
        "aria-label": "Secciones de configuración",
        className: "flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible shrink-0 lg:w-56 pb-1",
      }, ...visibleSections.map((s) => {
        const active = s.id === currentSection;
        return e("button", {
          key: s.id,
          type: "button",
          onClick: () => setActiveSection(s.id),
          "aria-current": active ? "page" : undefined,
          className: `flex items-center gap-2.5 px-4 py-2.5 rounded-2xl text-sm font-bold whitespace-nowrap transition ${
            active
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-800"
          }`,
        },
          e("i", { className: `fas ${s.icon} w-4 text-center` }),
          s.label
        );
      })),

      // Contenido de la sección activa
      e("main", { className: "flex-1 min-w-0 space-y-6" }, ...renderers[currentSection]())
    ),

    isWatchdogModalOpen && e(WatchdogModal, {
      days: tempDisabledDays,
      startHour: tempStartHour,
      endHour: tempEndHour,
      saving: watchdogSaving,
      onClose: () => setIsWatchdogModalOpen(false),
      onToggleDay: handleToggleDay,
      onPreset: handleSetPreset,
      onStartChange: setTempStartHour,
      onEndChange: setTempEndHour,
      onSave: handleSaveWatchdogConfig,
    }),

    isEnvModalOpen && e(EnvConfigModal, {
      isOpen: isEnvModalOpen,
      onClose: () => setIsEnvModalOpen(false),
    })
  );
};

export default SettingsPanel;
