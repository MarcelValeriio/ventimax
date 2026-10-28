// Arranque del panel (/panel). Antes estaba en línea en public/index.html; se movió aquí
// para que la CSP no necesite 'unsafe-inline' (F0-11).
import React, {
  useState,
  useEffect,
} from "https://cdn.skypack.dev/react";
import ReactDOM from "https://cdn.skypack.dev/react-dom";
import KanbanBoard from "../features/dashboard/KanbanBoard.js?v=10";
import InventoryManager from "../features/inventory/InventoryManager.js?v=6";
import WhatsAppConsole from "../features/whatsapp/WhatsAppConsole.js?v=8";
import InstagramConsole from "../features/instagram/InstagramConsole.js?v=6";
import InboxConsole from "../features/inbox/InboxConsole.js?v=20";
import useInboxSocket from "../features/inbox/hooks/useInboxSocket.js?v=12";
import apiClient from "../services/apiClient.js?v=6";
import SalesDashboard from "../features/sales/SalesDashboard.js?v=6";
import UserManagement from "../features/dashboard/UserManagement.js?v=6";
import AuditLogs from "../features/dashboard/AuditLogs.js?v=6";
import QuickReplyManager from "../features/dashboard/QuickReplyManager.js?v=6";
import FaqManager from "../features/dashboard/FaqManager.js?v=6";
import SettingsPanel from "../features/dashboard/SettingsPanel.js?v=6";
import AIStudio from "../features/dashboard/AIStudio.js?v=6";

const e = React.createElement;
const socket = io();

function App() {
  const [activeTab, setActiveTab] = useState("kanban");
  const [user, setUser] = useState(null);
  const [stuckClients, setStuckClients] = useState([]);
  const [isDark, setIsDark] = useState(
    localStorage.getItem("theme") === "dark",
  );
  const [health, setHealth] = useState({
    socket: false,
    whatsapp: "unknown",
    mongodb: "unknown",
  });
  const [bcvData, setBcvData] = useState({ tasa: 0, eur: 0 });
  const [showChecklist, setShowChecklist] = useState(
    sessionStorage.getItem("checklist_dismissed_session") !== "true",
  );
  // Persistir la activación de audio durante la sesión para no pedirlo en cada F5
  const [audioEnabled, setAudioEnabled] = useState(
    sessionStorage.getItem("audio_enabled_session") === "true",
  );
  // Badge del Inbox unificado (§8.1): no leídos globales visibles desde cualquier pestaña
  const [inboxUnread, setInboxUnread] = useState(0);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          const brandName = data.settings?.brandName || data.brandName || "Panel";
          document.title = `${brandName} | Dashboard`;
          // LOTE B7c (WA-04): el título base queda publicado para que el
          // inbox (y la consola de WhatsApp legacy, que ya lo lee en
          // WhatsAppConsole.js:112) compongan «(N) BASE» sin adivinar el
          // prefijo y sin duplicar `(N)` cuando ya hay uno aplicado.
          window.BASE_TITLE = `${brandName} | Dashboard`;
          window.BOT_IDENTITY = data.settings?.botIdentity || data.botIdentity || "Panel";
          if (data.settings?.theme?.logoUrl) {
            const favicon = document.querySelector("link[rel~='icon']");
            if (favicon) favicon.href = data.settings.theme.logoUrl;
          }
          if (data.settings?.theme) {
            const root = document.documentElement;
            if (data.settings.theme.primaryColor) root.style.setProperty('--primary-color', data.settings.theme.primaryColor);
            if (data.settings.theme.secondaryColor) root.style.setProperty('--secondary-color', data.settings.theme.secondaryColor);
          }
        }
      } catch (err) {
        console.warn("No se pudo cargar la configuración de marca:", err);
      }
    };

    const fetchUser = async () => {
      try {
        const res = await fetch("/api/admin/me");
        const data = await res.json();
        if (data.success) {
          setUser(data.data);
          localStorage.setItem(
            "user",
            JSON.stringify({
              nombre: data.data.nombre || data.data.user,
              role: data.data.role,
            }),
          );
        } else {
          // Si no hay sesión, apiClient interceptará el 401 pero por si acaso
          window.location.href = "/login";
        }
      } catch (e) {
        console.error("Error validando sesión:", e);
        const storedUser = localStorage.getItem("user");
        if (storedUser) setUser(JSON.parse(storedUser));
      }
    };

    fetchConfig();
    fetchUser();
  }, []);

  // Cargar alertas persistentes de la DB
  const fetchStuckClients = async () => {
    try {
      const res = await fetch("/api/admin/etiquetas");
      const data = await res.json();
      if (data.success) {
        const stuck = Object.entries(data.data)
          .filter(([tel, info]) => info.stuck)
          .map(([tel, info]) => ({ telefono: tel, ...info }));
        setStuckClients(stuck);
      }
    } catch (e) {
      console.error("Error cargando clientes estancados:", e);
    }
  };

  // Notificaciones Push
  const requestNotificationPermission = () => {
    if ("Notification" in window) {
      Notification.requestPermission();
    }
  };

  const sendPushNotification = (title, body) => {
    if (localStorage.getItem("pachi_muted") === "true") return;
    // LOTE B7c (X-03): guarda explícita para entornos sin API de
    // notificaciones (algunos navegadores embebidos / SSR). El envío real
    // pasa SIEMPRE por el Service Worker registrado en `/sw.js`.
    if (typeof Notification === "undefined") return;

    if (
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      const options = {
        body,
        icon: "/assets/favicon.svg",
        badge: "/assets/badge.png",
        vibrate: [200, 100, 200]
      };

      if (navigator.serviceWorker) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, options);
        });
      } else {
        new Notification(title, options);
      }
    }
  };

  useEffect(() => {
    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  // Badge de notificaciones en el título de la pestaña
  useEffect(() => {
    let unreadCount = 0;
    const originalTitle = document.title;

    const updateTitleBadge = () => {
      // LOTE B7c (WA-04): mientras el INBOX UNIFICADO está montado, él es el
      // dueño del `<title>` porque conoce los no leídos REALES por canal
      // (`totalesNoLeidos`) y con desglose; el contador de push de aquí es
      // una aproximación. Sin esta guarda las dos fuentes se pisaban.
      if (window.__pachiInboxTitulo) return;
      const base = window.BASE_TITLE || originalTitle;
      document.title =
        unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
    };

    // Envolver sendPushNotification para incrementar contador
    const _originalSend = sendPushNotification;
    window.sendPushNotification = (title, body) => {
      unreadCount++;
      updateTitleBadge();
      return _originalSend(title, body);
    };

    // Resetear contador cuando la pestaña recibe foco
    const onFocus = () => {
      unreadCount = 0;
      updateTitleBadge();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.sendPushNotification = _originalSend;
    };
  }, []);

  // Badge de no leídos del Inbox Unificado (fase 2B, contrato §6.1).
  // Si el endpoint todavía no existe (backend en construcción) el badge queda en 0
  // y el panel sigue funcionando con normalidad.
  const fetchInboxUnread = async () => {
    try {
      const res = await apiClient.get("/api/admin/inbox", {
        params: { canal: "todos", limite: 1 },
      });
      const totales = res.data && res.data.totalesNoLeidos;
      if (totales) setInboxUnread(Number(totales.todos) || 0);
    } catch (err) {
      // /api/admin/inbox no disponible: silencio deliberado
    }
  };

  // Se refresca al autenticar y al cambiar de pestaña principal
  useEffect(() => {
    if (user) fetchInboxUnread();
  }, [user, activeTab]);

  // Y en tiempo real, con el mismo contrato de invalidación que consume el inbox
  useInboxSocket({
    socket,
    onInvalidar: () => fetchInboxUnread(),
  });

  // Polling de salud del sistema y tasa BCV
  const checkHealth = async () => {
    try {
      const res = await fetch("/api/admin/health");
      const data = await res.json();
      if (data.success) {
        setHealth((prev) => ({
          ...prev,
          whatsapp:
            data.data.whatsapp?.state || data.data.whatsapp || "unknown",
          mongodb:
            data.data.mongodb?.state || data.data.mongodb || "unknown",
        }));
      }

      // Fetch BCV Rates
      const rateRes = await fetch("/api/admin/bcv");
      const rateData = await rateRes.json();
      if (rateData.success) {
        setBcvData({
          tasa: rateData.data.tasa,
          eur: rateData.data.eur || 0,
        });
      }
    } catch (e) {
      setHealth((prev) => ({
        ...prev,
        whatsapp: "error",
        mongodb: "error",
      }));
    }
  };

  const SetupChecklist = () => {
    // Solo mostrar a Administradores y siempre al inicio de cada sesión
    if (
      !showChecklist ||
      activeTab !== "kanban" ||
      (user && user.role !== "admin")
    )
      return null;

    const steps = [
      {
        id: 1,
        text: "Conexión WhatsApp",
        status: health.whatsapp === "connected",
        icon: "fa-mobile-alt",
      },
      {
        id: 2,
        text: "Salud del Sistema (DB/Socket)",
        status: health.socket && health.mongodb === "connected",
        icon: "fa-server",
      },
      {
        id: 3,
        text: "Tasa BCV Activa",
        status: bcvData.tasa > 0,
        icon: "fa-university",
      },
      { id: 4, text: "Cargar Productos", status: true, icon: "fa-box" },
    ];

    return e(
      "div",
      {
        className:
          "absolute top-4 left-4 z-[70] w-72 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-emerald-100 dark:border-gray-700 p-4 animate-in fade-in slide-in-from-left-4 duration-500",
      },
      e(
        "div",
        { className: "flex justify-between items-center mb-3" },
        e(
          "h3",
          {
            className:
              "font-bold text-gray-800 dark:text-white text-sm flex items-center gap-2",
          },
          e("i", { className: "fas fa-rocket text-emerald-500" }),
          "Guía de Inicio Rápido",
        ),
        e(
          "button",
          {
            onClick: () => {
              setShowChecklist(false);
              sessionStorage.setItem(
                "checklist_dismissed_session",
                "true",
              );
            },
            className:
              "text-gray-400 hover:text-gray-600 dark:hover:text-white",
          },
          e("i", { className: "fas fa-times text-xs" }),
        ),
      ),
      e(
        "div",
        { className: "space-y-2" },
        steps.map((step) =>
          e(
            "div",
            {
              key: step.id,
              className: "flex items-center gap-3 text-xs",
            },
            e(
              "div",
              {
                className: `w-6 h-6 rounded-full flex items-center justify-center transition-colors ${step.status ? "bg-emerald-100 text-emerald-600 border border-emerald-200" : "bg-gray-50 text-gray-400 border border-gray-100"}`,
              },
              e("i", {
                className: `fas ${step.status ? "fa-check-circle" : "fa-circle-notch animate-spin-slow"}`,
              }),
            ),
            e(
              "span",
              {
                className: `font-medium ${step.status ? "text-emerald-700 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`,
              },
              step.text,
            ),
          ),
        ),
      ),
    );
  };

  useEffect(() => {
    checkHealth();
    fetchStuckClients();
    requestNotificationPermission();

    // Registrar Service Worker para Web Push
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("SW register:", err.message));
    }

    const interval = setInterval(checkHealth, 60000); // Cada minuto
    return () => clearInterval(interval);
  }, []);

  // Watchdog Listener
  useEffect(() => {
    socket.on("connect", () =>
      setHealth((prev) => ({ ...prev, socket: true })),
    );
    socket.on("disconnect", () =>
      setHealth((prev) => ({ ...prev, socket: false })),
    );

    socket.on("pago_enviado_cliente", (order) => {
      // LOTE B7c (X-07): el comprobante nace de un `Pedido`, modelo EXCLUSIVO
      // de WhatsApp (contrato §6.2). Se acota el aviso global a ese canal
      // para que ningún payload de otro canal dispare el sonido de caja ni
      // el toast de pago (comportamiento por canal).
      if (order && order.canal && order.canal !== "whatsapp") return;
      playCashSound();
      window.showToast(
        `💰 Nuevo comprobante de ${order.cliente?.nombre || order.whatsappId}`,
        "success",
      );
      sendPushNotification(
        "💰 Nuevo Pedido!",
        `Pedido #${order.correlativo || "---"} de ${order.cliente?.nombre}`,
      );
    });

    socket.on("alerta_cliente_trabado", (data) => {
      setStuckClients((prev) => {
        if (prev.find((c) => c.telefono === data.telefono)) return prev;
        return [...prev, data];
      });
      playAlertSound();
      sendPushNotification(
        "🚨 Cliente Atrapado",
        `El cliente ${data.telefono} requiere ayuda.`,
      );
    });

    socket.on("bot_destrabado", (telefono) => {
      setStuckClients((prev) =>
        prev.filter((c) => c.telefono !== telefono),
      );
    });

    socket.on("alerta_orden_estancada", (data) => {
      window.showToast(
        `🚨 Órden #${data.correlativo || data.id} estancada (${data.minutos} min)`,
        "error",
      );
      playAlertSound();
    });

    socket.on("recordatorio_pago_pendiente", (data) => {
      playCashSound();
      // Aviso discreto en consola o toast opcional
      console.log(`🔔 Recordatorio: ${data.count} pagos esperando.`);
    });

    socket.on("alerta_pedido_verificado", (data) => {
      playAlertSound();
      window.showToast(
        `🚚 ${data.count} pedido(s) verificado(s) sin despachar`,
        "warning",
      );
    });

    socket.on("pago_confirmado", (order) => {
      playSuccessSound();
      window.showToast(
        `✅ Pago verificado: #${order.correlativo || order.id}`,
        "success",
      );
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("pago_enviado_cliente");
      socket.off("alerta_cliente_trabado");
      socket.off("bot_destrabado");
      socket.off("alerta_orden_estancada");
      socket.off("recordatorio_pago_pendiente");
      socket.off("alerta_pedido_verificado");
      socket.off("pago_confirmado");
    };
  }, []);

  // Pre-cargar audios locales para evitar latencia
  const cashSound = new Audio("/assets/sounds/cash-register.mp3");
  const alertSound = new Audio(
    "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
  );

  const playAlertSound = () => {
    if (!audioEnabled || localStorage.getItem("pachi_muted") === "true") return;
    alertSound.currentTime = 0;
    alertSound
      .play()
      .catch((e) => console.warn("Audio bloqueado:", e.message));
  };

  const playCashSound = () => {
    if (!audioEnabled || localStorage.getItem("pachi_muted") === "true") return;
    cashSound.currentTime = 0;
    cashSound.play().catch((e) => {
      console.warn(
        "Sonido de caja bloqueado por el navegador. Requiere interacción previa.",
      );
    });
  };

  const successSound = new Audio(
    "https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3",
  );
  const playSuccessSound = () => {
    if (!audioEnabled || localStorage.getItem("pachi_muted") === "true") return;
    successSound.currentTime = 0;
    successSound
      .play()
      .catch((e) => console.warn("Audio bloqueado:", e.message));
  };

  const handleResetBot = async (telefono) => {
    try {
      const res = await fetch("/api/admin/reset-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono }),
      });
      const data = await res.json();
      if (data.success) {
        window.showToast("⚡ Bot destrabado con éxito");
        setStuckClients((prev) =>
          prev.filter((c) => c.telefono !== telefono),
        );
      }
    } catch (err) {
      window.showToast("❌ Error al destrabar", "error");
    }
  };

  const NavButton = ({
    tab,
    icon,
    iconPrefix = "fas",
    iconColor = "",
    title,
    customClass = "",
    activeClass = "",
    badge = 0,
  }) =>
    e(
      "button",
      {
        onClick: () => setActiveTab(tab),
        className: `relative w-12 h-12 md:w-16 md:h-16 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 ${
          activeTab === tab
            ? (activeClass || "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-105")
            : "text-emerald-100 dark:text-gray-400 hover:bg-emerald-700/50 dark:hover:bg-gray-800 hover:scale-105"
        } ${customClass}`,
        title: title,
      },
      e("i", {
        className: `${iconPrefix} ${icon} text-xl md:text-lg mb-0.5 ${iconColor}`,
      }),
      e(
        "span",
        {
          className:
            "hidden md:block text-[9px] font-black uppercase tracking-tighter leading-none opacity-90",
        },
        title,
      ),
      // Badge de no leídos (Inbox unificado)
      Number(badge) > 0 &&
        e(
          "span",
          {
            className:
              "absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-md ring-2 ring-emerald-700",
            "aria-label": `${badge} mensajes sin leer`,
          },
          Number(badge) > 99 ? "99+" : Number(badge),
        ),
    );

  // Deep-link del Inbox Unificado hacia las consolas de detalle (§8.1).
  // El inbox es el punto de entrada; WhatsAppConsole/InstagramConsole siguen
  // siendo el detalle por canal (pedidos, pago, repartidor, CRM) y NO se eliminan.
  // LOTE B7c (X-15): las consolas legacy siguen SIN consumir el atajo (no se
  // pueden tocar en este lote), pero el INBOX UNIFICADO sí lo consume
  // (`InboxConsole`: lee y borra `pachi_inbox_deeplink` al montar y escucha
  // `pachi:focus-conversacion`), de modo que el atajo deja de ser «solo
  // cambia de pestaña»: al volver al inbox enfoca la conversación.
  // LOTE B8 (X-13/X-14): este atajo es ahora la ÚNICA vía de entrada a las
  // pestañas `chat` / `instagram`, porque sus NavButton se retiraron del nav
  // principal. Por eso `setActiveTab(...)` (:701) es imprescindible: los
  // botones del nav ya no existen para estas dos pestañas.
  // LIMITACIÓN CONOCIDA (documentada, no es un bug): al aterrizar en la
  // consola legacy NO se enfoca la conversación concreta, porque esos dos
  // archivos no escuchan `pachi:focus-conversacion` (prohibido editarlos);
  // WhatsAppConsole abre en su estado vacío «Selecciona un chat para comenzar».
  // El usuario vuelve al inbox con el NavButton «Inbox».
  const openCanalConsole = (canal, usuarioId) => {
    if (canal === "messenger") {
      window.showToast?.("Messenger todavía no tiene consola dedicada.", "error");
      return;
    }
    try {
      sessionStorage.setItem(
        "pachi_inbox_deeplink",
        JSON.stringify({ canal, usuarioId, ts: Date.now() }),
      );
    } catch (err) {
      // sessionStorage no disponible: el deep-link solo cambiará de pestaña
    }
    // Aviso global para que las consolas puedan enfocar la conversación cuando
    // incorporen el deep-link (hoy no lo consumen).
    window.dispatchEvent(
      new CustomEvent("pachi:focus-conversacion", {
        detail: { canal, usuarioId },
      }),
    );
    setActiveTab(canal === "instagram" ? "instagram" : "chat");
  };

  return e(
    "div",
    {
      className:
        "flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900",
    },
    // Alertas de Watchdog (Flotantes Responsivas)
    e(
      "div",
      {
        className:
          "fixed bottom-0 left-0 right-0 md:bottom-auto md:left-auto md:top-4 md:right-4 z-[9999] p-4 flex flex-col gap-3 pointer-events-none md:w-96",
      },
      stuckClients.map((client) =>
        e(
          "div",
          {
            key: client.telefono,
            className:
              "pointer-events-auto bg-red-950 text-white p-5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-red-500/50 flex flex-col md:flex-row items-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500",
          },
          e(
            "div",
            { className: "flex items-center gap-4 flex-1" },
            e(
              "div",
              {
                className:
                  "w-12 h-12 bg-red-600 rounded-full flex items-center justify-center animate-pulse",
              },
              e("i", {
                className: "fas fa-exclamation-triangle text-xl",
              }),
            ),
            e(
              "div",
              null,
              e(
                "p",
                {
                  className:
                    "font-black text-sm uppercase tracking-wider",
                },
                "🚨 Emergencia",
              ),
              e(
                "p",
                { className: "text-xs text-red-200" },
                `Cliente ${client.telefono} atrapado`,
              ),
            ),
          ),
          e(
            "button",
            {
              onClick: () => handleResetBot(client.telefono),
              className:
                "w-full md:w-auto bg-red-600 hover:bg-red-700 text-white font-bold py-3 md:py-2 px-6 rounded-xl active:scale-95 transition-all shadow-lg text-sm whitespace-nowrap",
            },
            "⚡ Destrabar",
          ),
        ),
      ),
    ),

    // Nav Principal (Responsiva: Sidebar en Desktop, Bottom Nav en Móvil)
    e(
      "div",
      {
        id: "global-sidebar",
        className:
          "fixed bottom-0 left-0 right-0 h-14 md:h-screen md:w-20 bg-emerald-800 dark:bg-gray-950 flex flex-row md:flex-col items-center justify-around md:justify-start py-0 md:py-6 gap-0 md:gap-6 z-50 transition-all border-t md:border-t-0 md:border-r dark:border-gray-800",
      },
      e(
        "div",
        {
          className:
            "hidden md:flex w-10 h-10 bg-white dark:bg-emerald-600 rounded-xl items-center justify-center mb-2 md:mb-4 shadow-lg active:scale-95 transition-transform overflow-hidden",
        },
        e("img", {
          src: "/assets/favicon.svg",
          className: "w-7 h-7 object-contain",
          alt: "Logo",
        }),
      ),

      (!user ||
        user.role === "admin" ||
        user.role === "repartidor" ||
        user.role === "cajero") &&
        e(NavButton, {
          tab: "kanban",
          icon: "fa-columns",
          title: "Tablero",
        }),
      (!user || user.role === "admin" || user.role === "cajero") &&
        e(NavButton, {
          tab: "inbox",
          icon: "fa-inbox",
          title: "Inbox",
          badge: inboxUnread,
        }),
      // LOTE B8 (X-13 / X-14) — Los NavButton «WhatsApp» (pestaña `chat`) e
      // «Instagram» (pestaña `instagram`) SE RETIRAN del nav principal por
      // decisión del dueño: el INBOX unificado es el punto de entrada único
      // de los 3 canales (WhatsApp + Instagram + Messenger) y su raíl de
      // canales reemplaza a esos dos accesos.
      //
      // ⚠️ NO se eliminan las pestañas NI sus consolas: `WhatsAppConsole.js` e
      // `InstagramConsole.js` siguen importadas (`:118-119`), siguen montadas
      // por el render condicional (`activeTab === "chat"` / `"instagram"`,
      // ver «Contenido Principal Dinámico») y siguen siendo la VISTA DE DETALLE
      // por canal, accesible desde el botón «Consola» de cada hilo del inbox
      // (`InboxThread.js`) vía `openCanalConsole(canal, usuarioId)` (`:682-702`).
      // El render de esas pestañas NO depende de estos botones: `openCanalConsole`
      // llama a `setActiveTab` directamente.
      // Inventario funcional: `docs/paridad-inbox-v3.md` §1.A.
      (!user || user.role === "admin") &&
        e(NavButton, {
          tab: "inventory",
          icon: "fa-box",
          title: "Inventario",
        }),
      (!user || user.role === "admin" || user.role === "cajero") &&
        e(NavButton, {
          tab: "sales",
          icon: "fa-chart-line",
          title: "Ventas",
        }),
      (!user || user.role === "admin") &&
        e(NavButton, {
          tab: "aistudio",
          icon: "fa-magic",
          title: "AI Studio",
          customClass:
            "text-emerald-400 animate-pulse-gentle nav-button-ai-studio",
        }),
      (!user || user.role === "admin") &&
        e(NavButton, {
          tab: "config",
          icon: "fa-cog",
          title: "Config",
        }),

      e(
        "div",
        {
          className:
            "md:mt-auto flex flex-row md:flex-col gap-4 items-center",
        },
        user &&
          e(
            "div",
            {
              className:
                "hidden md:block text-[10px] text-emerald-200 font-bold uppercase mb-2 text-center",
            },
            user.role,
          ),
        e(
          "a",
          {
            href: "/logout",
            className:
              "w-10 h-10 rounded-xl flex items-center justify-center text-red-100 hover:bg-red-700 transition-all active:scale-90 shadow-sm border border-red-700/30",
            title: "Cerrar Sesión",
          },
          e("i", { className: "fas fa-sign-out-alt" }),
        ),
      ),
    ),

    // Contenido Principal Dinámico
    e(
      "div",
      {
        id: "main-content-wrapper",
        className:
          "flex-1 relative overflow-hidden mb-14 md:mb-0 md:ml-20 transition-all",
      },
      e(SetupChecklist),

      // BCV Indicator ... (unchanged)
      activeTab === "kanban" &&
        bcvData.tasa > 0 &&
        e(
          "div",
          {
            className:
              "fixed top-3 left-1/2 -translate-x-1/2 z-[60] bg-white/90 dark:bg-gray-800/95 backdrop-blur-xl px-4 py-2 rounded-full shadow-2xl shadow-emerald-500/10 border border-white/50 dark:border-gray-700/50 flex items-center gap-4 md:gap-6 animate-in fade-in zoom-in slide-in-from-top-4 duration-500 max-w-[90vw] md:max-w-none",
          },
          e(
            "div",
            { className: "flex items-center gap-2.5" },
            e(
              "div",
              {
                className:
                  "w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 flex-shrink-0",
              },
              e("i", {
                className: "fas fa-dollar-sign text-[10px] md:text-xs",
              }),
            ),
            e(
              "div",
              { className: "flex flex-col justify-center" },
              e(
                "p",
                {
                  className:
                    "text-[7px] md:text-[8px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-widest leading-none mb-0.5",
                },
                "USD BCV",
              ),
              e(
                "p",
                {
                  className:
                    "text-xs md:text-sm font-black text-gray-800 dark:text-white tabular-nums leading-none",
                },
                e(
                  "span",
                  {
                    className: "text-[10px] font-bold mr-0.5 opacity-50",
                  },
                  "Bs.",
                ),
                bcvData.tasa.toFixed(2),
              ),
            ),
          ),
          bcvData.eur > 0 &&
            e("div", {
              className: "w-px h-6 bg-gray-200 dark:bg-gray-700 mx-0.5",
            }),
          bcvData.eur > 0 &&
            e(
              "div",
              { className: "flex items-center gap-2.5" },
              e(
                "div",
                {
                  className:
                    "w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-blue-500/20 flex-shrink-0",
                },
                e("i", {
                  className: "fas fa-euro-sign text-[10px] md:text-xs",
                }),
              ),
              e(
                "div",
                { className: "flex flex-col justify-center" },
                e(
                  "p",
                  {
                    className:
                      "text-[7px] md:text-[8px] text-blue-600 dark:text-blue-400 font-black uppercase tracking-widest leading-none mb-0.5",
                  },
                  "EUR BCV",
                ),
                e(
                  "p",
                  {
                    className:
                      "text-xs md:text-sm font-black text-gray-800 dark:text-white tabular-nums leading-none",
                  },
                  e(
                    "span",
                    {
                      className:
                        "text-[10px] font-bold mr-0.5 opacity-50",
                    },
                    "Bs.",
                  ),
                  bcvData.eur.toFixed(2),
                ),
              ),
            ),
        ),

      activeTab === "kanban" &&
        e(KanbanBoard, { socket, userRole: user?.role, health }),
      activeTab === "inbox" &&
        e(InboxConsole, {
          socket,
          userRole: user?.role,
          onOpenCanalConsole: openCanalConsole,
        }),
      activeTab === "chat" && e(WhatsAppConsole, { socket }),
      activeTab === "instagram" && e(InstagramConsole, { socket }),
      activeTab === "inventory" && e(InventoryManager),
      activeTab === "sales" &&
        e(
          "div",
          { className: "h-full overflow-auto" },
          e(SalesDashboard, { userRole: user?.role }),
        ),
      activeTab === "users" &&
        e(UserManagement, { onBack: () => setActiveTab("config") }),
      activeTab === "audit" &&
        e(AuditLogs, { onBack: () => setActiveTab("config") }),
      activeTab === "quickreplies" &&
        e(QuickReplyManager, { onBack: () => setActiveTab("config") }),
      activeTab === "faqs" &&
        e(FaqManager, { onBack: () => setActiveTab("config") }),
      activeTab === "aistudio" && e(AIStudio),
      activeTab === "config" &&
        e(SettingsPanel, {
          isDark,
          setIsDark,
          setActiveTab,
          user,
          audioEnabled,
          setAudioEnabled,
        }),
    ),

    // Overlay de Activación de Audio (Fix: Audio blocked by browser)
    !audioEnabled &&
      e(
        "div",
        {
          className:
            "fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300",
        },
        e(
          "div",
          {
            className:
              "bg-white dark:bg-gray-800 rounded-[2rem] p-8 max-w-sm text-center shadow-2xl border border-emerald-100 dark:border-gray-700",
          },
          [
            e(
              "div",
              {
                className:
                  "w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner",
              },
              e("i", { className: "fas fa-volume-up text-3xl" }),
            ),
            e(
              "h3",
              {
                className:
                  "text-xl font-black text-gray-800 dark:text-white mb-2 uppercase tracking-tighter",
              },
              "Activar Alertas",
            ),
            e(
              "p",
              {
                className:
                  "text-sm text-gray-500 dark:text-gray-400 mb-8 leading-relaxed",
              },
              "Haz clic abajo para habilitar los sonidos de notificación de ventas y emergencias.",
            ),
            e(
              "button",
              {
                onClick: () => {
                  setAudioEnabled(true);
                  sessionStorage.setItem("audio_enabled_session", "true");

                  // "Despertar" el contexto de audio reproduciendo los sonidos una vez
                  // (Se ponen en volumen 0 o casi 0 para no molestar, pero activa el permiso)
                  cashSound.volume = 0.01;
                  cashSound
                    .play()
                    .then(() => {
                      cashSound.pause();
                      cashSound.volume = 1;
                    })
                    .catch(() => {});

                  alertSound.volume = 0.01;
                  alertSound
                    .play()
                    .then(() => {
                      alertSound.pause();
                      alertSound.volume = 1;
                    })
                    .catch(() => {});
                },
                className:
                  "w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95 transition-all uppercase tracking-widest text-xs",
              },
              "Habilitar Sonido",
            ),
          ],
        ),
      ),
  );
}

ReactDOM.render(e(App), document.getElementById("root"));

// Helper global para Toasts
window.showToast = (msg, type = "success") => {
  const toast = document.getElementById("toast");
  if (!toast) return;
  // El mensaje puede traer datos del cliente o del servidor: se inserta como texto, nunca como HTML.
  toast.innerHTML = `<i class="fas ${type === "success" ? "fa-check-circle text-emerald-500" : "fa-exclamation-circle text-red-500"} text-xl mr-3"></i><span class="text-sm font-medium text-gray-700"></span>`;
  toast.querySelector("span").textContent = String(msg ?? "");
  toast.classList.remove("translate-y-[-150%]", "opacity-0");
  setTimeout(
    () => toast.classList.add("translate-y-[-150%]", "opacity-0"),
    3000,
  );
};
