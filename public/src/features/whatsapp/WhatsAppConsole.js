import { Icono } from "../../components/Icono.js";
/**
 * public/src/features/whatsapp/WhatsAppConsole.js
 * Centro de Mensajes - UX Mobile Optimized & Lazy Loading Integration
 * Pure JS Version - React.createElement
 */
import React, {
  useEffect,
  useState,
  useRef,
} from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js?v=4";
import styles from "./components/styles.js?v=4";
import WhatsAppSidebar from "./components/WhatsAppSidebar.js?v=4";
import WhatsAppHeader from "./components/WhatsAppHeader.js?v=4";
import MessageList from "./components/MessageList.js?v=6";
import WhatsAppInput from "./components/WhatsAppInput.js?v=4";
import QuickReplyBar from "./components/QuickReplyBar.js?v=4";
import CustomerCardDrawer from "./components/CustomerCardDrawer.js?v=4";
import WhatsAppProfileModal from "./components/WhatsAppProfileModal.js?v=4";
import ChatManualOrderModal from "./components/ChatManualOrderModal.js?v=4";

const e = React.createElement;

// Generador de audio nativo con Web Audio API (cero dependencias externas y seguro)
const playNotificationTone = (type = "message") => {
  if (localStorage.getItem("pachi_muted") === "true") return;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === "payment") {
      // Tono triunfal suave para comprobante de pago: 659Hz -> 830Hz -> 987Hz
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.setValueAtTime(830.61, now + 0.08);
      osc.frequency.setValueAtTime(987.77, now + 0.16);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    } else {
      // Tono sutil para mensaje de cliente en modo manual: 784Hz -> 1046Hz
      osc.type = "sine";
      osc.frequency.setValueAtTime(783.99, now);
      osc.frequency.setValueAtTime(1046.50, now + 0.06);
      gain.gain.setValueAtTime(0.10, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (e) {
    // Autoplay bloqueado o AudioContext no permitido sin interacción
  }
};

const WhatsAppConsole = ({ socket }) => {
  const [conversations, setConversations] = useState({});
  const [activePhone, setActivePhone] = useState(null);
  const [messages, setMessages] = useState([]); // Historial ACUMULATIVO
  const [purchaseHistory, setPurchaseHistory] = useState([]); // Compras del cliente activo
  const [operationModes, setOperationModes] = useState({}); // Modos Manual/Auto
  const [unreadPerPhone, setUnreadPerPhone] = useState({}); // Conteo de mensajes sin atender
  const [presenceMap, setPresenceMap] = useState({}); // Presencia real y typing { [phone]: { presence, isTyping, expiresAt, typingExpiresAt } }
  const [activeContext, setActiveContext] = useState({
    customerName: null,
    totalUSD: null,
    totalBS: null,
  });

  // Ocultar la barra de navegación inferior en dispositivos móviles cuando se entra a un chat
  useEffect(() => {
    const sidebar = document.getElementById("global-sidebar");
    const container = document.getElementById("main-content-wrapper");
    const isMobile = window.innerWidth < 768; // md breakpoint in tailwind
    
    if (isMobile && activePhone) {
      if (sidebar) sidebar.style.display = "none";
      if (container) {
        container.classList.remove("mb-14");
        container.classList.add("mb-0");
      }
    } else {
      if (sidebar) sidebar.style.display = "";
      if (container) {
        container.classList.add("mb-14");
        container.classList.remove("mb-0");
      }
    }

    return () => {
      // Restaurar al desmontar (por ejemplo si cambia de tab principal)
      if (sidebar) sidebar.style.display = "";
      if (container) {
        container.classList.add("mb-14");
        container.classList.remove("mb-0");
      }
    };
  }, [activePhone]);

  // Base title extraído dinámicamente del documento o uno por defecto
  const botId = (typeof window !== "undefined" && (window.BOT_IDENTITY || window.BRAND_CONFIG?.botIdentity)) || "Panel";
  const BASE_TITLE = window.BASE_TITLE || document.title.replace(/^\(\d+\)\s*/, "") || `${botId} | Panel`;

  const [isCustomerCardOpen, setIsCustomerCardOpen] = useState(false);
  const [isManualOrderOpen, setIsManualOrderOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [drafts, setDrafts] = useState({}); // Borradores de texto indexados por teléfono
  const [quotes, setQuotes] = useState({}); // Citas/respuestas indexadas por teléfono
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef(null);
  const lastScrollHeight = useRef(0);
  const recentlySentRef = useRef([]);
  const pendingStatusesRef = useRef({});
  const processedMsgKeysRef = useRef(new Set());
  
  const activePhoneRef = useRef(activePhone);
  activePhoneRef.current = activePhone;

  // Helpers para acceder y modificar el borrador y la cita del chat activo
  const currentInputText = activePhone ? (drafts[activePhone] || "") : "";
  const setInputText = (valOrFn) => {
    if (!activePhoneRef.current) return;
    const phone = activePhoneRef.current;
    setDrafts((prev) => {
      const currentVal = prev[phone] || "";
      const newVal = typeof valOrFn === "function" ? valOrFn(currentVal) : valOrFn;
      return { ...prev, [phone]: newVal };
    });
  };
  const currentQuote = activePhone ? (quotes[activePhone] || null) : null;
  const setReplyingTo = (quoteObj) => {
    if (!activePhoneRef.current) return;
    const phone = activePhoneRef.current;
    setQuotes((prev) => ({ ...prev, [phone]: quoteObj }));
  };

  const operationModesRef = useRef(operationModes);
  operationModesRef.current = operationModes;

  const API_BASE = "/api/admin";

  const fetchChatList = async () => {
    try {
      const res = await apiClient.get(`${API_BASE}/historial`);
      const data = res.data;
      if (
        data &&
        data.success &&
        typeof data.data === "object" &&
        !Array.isArray(data.data)
      ) {
        setConversations(data.data);
        return;
      }
      const listaFinal = Array.isArray(data) ? data : data.data || [];
      const grouped = {};
      listaFinal.forEach((m) => {
        const phone = m.telefono || m.from || "Desconocido";
        if (phone === "Desconocido") return;
        if (!grouped[phone]) {
          grouped[phone] = {
            resumen: {
              text: m.texto || m.text || "(Sin mensaje)",
              timestamp: m.timestamp
                ? new Date(m.timestamp).getTime()
                : Date.now(),
              direction: m.direccion,
            },
          };
        }
      });
      setConversations(grouped);
    } catch (err) {
      console.error("Error cargando lista:", err.message);
    }
  };

  const fetchModes = async () => {
    try {
      const res = await apiClient.get(`${API_BASE}/modos`);
      if (res.data && res.data.success) setOperationModes(res.data.data);
    } catch (err) {
      console.error("Error cargando modos:", err.message);
    }
  };

  // 1. CARGA DE HISTORIAL ACUMULATIVO (Lazy Loading)
  const fetchChatHistory = async (phone, page = 1) => {
    try {
      setLoadingHistory(true);
      const res = await apiClient.get(
        `${API_BASE}/historial?telefono=${phone}&page=${page}&limit=20`,
      );
      const { data, pagination } = res.data;

      const newBatch = Array.isArray(data) ? data : [];

      if (page === 1) {
        setMessages(newBatch);
      } else {
        // Guardamos la altura actual antes de añadir mensajes viejos
        lastScrollHeight.current = scrollRef.current?.scrollHeight || 0;
        // ANTEPONER mensajes anteriores
        setMessages((prev) => [...newBatch, ...prev]);
      }

      setHasMore(pagination?.hasMore || false);
      setLoadingHistory(false);
    } catch (err) {
      console.error(`Error historial ${phone}:`, err.message);
      setLoadingHistory(false);
    }
  };

  // 2. CARGA DE HISTORIAL DE COMPRAS
  const fetchPurchases = async (phone) => {
    try {
      const res = await apiClient.get(
        `${API_BASE}/pedidos-historial?telefono=${phone}`,
      );
      setPurchaseHistory(res.data.data || []);
    } catch (err) {
      console.error("Error compras:", err.message);
    }
  };

  // 2b. CARGA DE CONTEXTO DEL CHAT (Ficha de Cliente y Tokens)
  const fetchChatContext = async (phone) => {
    try {
      setLoadingContext(true);
      const res = await apiClient.get(
        `${API_BASE}/chat-context?telefono=${phone}`,
      );
      if (res.data?.success && res.data?.data) {
        const ctx = res.data.data;
        setActiveContext(ctx);
        if (ctx.customerName || ctx.cedula) {
          setConversations((prev) => {
            const existing = prev[phone];
            if (!existing) return prev;
            return {
              ...prev,
              [phone]: {
                ...existing,
                nombre:
                  existing.nombre ||
                  (ctx.customerName && ctx.customerName !== "Sin nombre"
                    ? ctx.customerName
                    : null),
                cedula:
                  existing.cedula ||
                  (ctx.cedula && ctx.cedula !== "Sin cédula"
                    ? ctx.cedula
                    : null),
              },
            };
          });
        }
      }
    } catch (err) {
      console.warn("No se pudo cargar el contexto del chat:", err.message);
      setActiveContext({});
    } finally {
      setLoadingContext(false);
    }
  };

  const handleAssignDriver = async (pedidoId, repartidor) => {
    try {
      const res = await apiClient.patch(`/api/admin/orders/${pedidoId}/repartidor`, {
        repartidor,
      });
      if (res.data?.success) {
        window.showToast("Repartidor asignado correctamente");
        if (activePhone) await fetchChatContext(activePhone);
      }
    } catch (err) {
      window.showToast(err.response?.data?.error || "Error al asignar repartidor", "error");
    }
  };

  // 3. GESTIÓN DINÁMICA DE ESTADOS (Botones de Acción)
  const handleConfirmPayment = async () => {
    if (!activePhone) return;
    try {
      setLoadingHistory(true);
      const res = await apiClient.post(`${API_BASE}/confirmar_pago`, {
        telefono: activePhone,
      });
      if (res.data && res.data.success) {
        // ✅ El socket pago_confirmado actualizará purchaseHistory y modo automáticamente
        window.showToast(
          `Pedido ${res.data.data.correlativo} verificado. Comandas enviadas.`,
        );
      }
    } catch (err) {
      window.showToast("Error al confirmar pago.", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleUpdateStatus = async (pedidoId, nuevoEstado) => {
    try {
      setLoadingHistory(true);
      const res = await apiClient.patch(
        `/api/admin/orders/${pedidoId}/status`,
        {
          estado: nuevoEstado,
          telefono: activePhone, // Para reactivación del bot si es 'entregado'
        },
      );
      if (res.data && res.data.success) {
        // ✅ El socket order_status_changed y bot_destrabado actualizarán el estado localmente
        window.showToast(
          `Estado actualizado a: ${nuevoEstado.replace("_", " ")}`,
        );
      }
    } catch (err) {
      window.showToast("Error al actualizar estado.", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleToggleMode = async () => {
    if (!activePhone) return;
    const currentMode = operationModes[activePhone] || "automatico";
    const newMode = currentMode === "manual" ? "automatico" : "manual";
    try {
      setLoadingHistory(true);
      const res = await apiClient.post(`${API_BASE}/chats/modo`, {
        telefono: activePhone,
        modo: newMode,
      });
      if (res.data && res.data.success) {
        // ✅ El socket modo_actualizado actualizará operationModes automáticamente
        window.showToast(
          newMode === "manual" ? "Modo Manual activado" : "Bot reactivado",
        );
      }
    } catch (err) {
      window.showToast("Error al cambiar modo.", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchChatList();
    fetchModes();

    // Botón manual de refresco en sidebar (fallback si hay desconexión)
    const handleRefresh = () => {
      fetchChatList();
      fetchModes();
    };
    window.addEventListener("refreshChatList", handleRefresh);

    return () => {
      window.removeEventListener("refreshChatList", handleRefresh);
    };
  }, []);

  useEffect(() => {
    // Inject custom WhatsApp styles
    let styleTag = document.getElementById("wa-custom-styles");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "wa-custom-styles";
      styleTag.innerHTML = styles;
      document.head.appendChild(styleTag);
    }
  }, []);

  // Mantener posición del scroll al cargar mensajes anteriores
  useEffect(() => {
    if (currentPage > 1 && scrollRef.current) {
      const newHeight = scrollRef.current.scrollHeight;
      scrollRef.current.scrollTop = newHeight - lastScrollHeight.current;
    } else if (scrollRef.current && currentPage === 1) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const globalSidebar = document.getElementById("global-sidebar");
    if (!globalSidebar) return;

    const handleResize = () => {
      if (window.innerWidth < 768 && activePhone) {
        globalSidebar.classList.add("hidden");
      } else {
        globalSidebar.classList.remove("hidden");
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      globalSidebar.classList.remove("hidden");
    };
  }, [activePhone]);

  useEffect(() => {
    const liveSocket = socket || window.socket;
    if (!liveSocket) return;
    // ✅ Actualiza sidebar localmente + append mensaje (sin HTTP)
    const handleUpdate = (msg) => {
      const phone = msg.telefono || msg.from;
      // Actualizar resumen en sidebar sin HTTP
      setConversations((prev) => {
        const existing = prev[phone];
        return {
          ...prev,
          [phone]: {
            ...existing,
            resumen: {
              text:
                msg.text ||
                msg.texto ||
                existing?.resumen?.text ||
                "(Sin mensaje)",
              timestamp: msg.timestamp
                ? new Date(msg.timestamp).getTime()
                : Date.now(),
              direction:
                msg.direction || msg.direccion || existing?.resumen?.direction,
            },
          },
        };
      });
      if (activePhone === phone) {
        // Evitar duplicación de mensajes enviados de forma optimista
        if (msg.direction === "bot") {
          const duplicateIndex = recentlySentRef.current.findIndex(
            (sent) =>
              sent.text === (msg.text || msg.texto) &&
              Math.abs(sent.timestamp - msg.timestamp) < 6000,
          );
          if (duplicateIndex !== -1) {
            // Remover de recentlySentRef para mantener la cola limpia
            recentlySentRef.current.splice(duplicateIndex, 1);
            // Actualizar el mensaje optimista con el _id, wamid y status devuelto
            setMessages((prev) => {
              let matched = false;
              const next = prev.map((m) => {
                if (!matched && m.text === (msg.text || msg.texto) && m.status === "enviando") {
                  matched = true;
                  let finalStatus = msg.status || "sent";
                  let finalError = msg.error;
                  if (msg.wamid && pendingStatusesRef.current[msg.wamid]) {
                    finalStatus = pendingStatusesRef.current[msg.wamid].status;
                    finalError = pendingStatusesRef.current[msg.wamid].error;
                    delete pendingStatusesRef.current[msg.wamid];
                  } else if (msg._id && pendingStatusesRef.current[msg._id]) {
                    finalStatus = pendingStatusesRef.current[msg._id].status;
                    finalError = pendingStatusesRef.current[msg._id].error;
                    delete pendingStatusesRef.current[msg._id];
                  }
                  return { ...m, ...msg, status: finalStatus, error: finalError };
                }
                return m;
              });
              return matched ? next : [...prev, msg];
            });
            return;
          }
        }
        setMessages((prev) => {
          if (msg._id && prev.some((m) => m._id && String(m._id) === String(msg._id))) {
            return prev;
          }
          if (msg.wamid && prev.some((m) => m.wamid && m.wamid === msg.wamid)) {
            return prev;
          }
          let finalStatus = msg.status || "sent";
          let finalError = msg.error;
          if (msg.wamid && pendingStatusesRef.current[msg.wamid]) {
            finalStatus = pendingStatusesRef.current[msg.wamid].status;
            finalError = pendingStatusesRef.current[msg.wamid].error;
            delete pendingStatusesRef.current[msg.wamid];
          } else if (msg._id && pendingStatusesRef.current[msg._id]) {
            finalStatus = pendingStatusesRef.current[msg._id].status;
            finalError = pendingStatusesRef.current[msg._id].error;
            delete pendingStatusesRef.current[msg._id];
          }
          return [...prev, { ...msg, status: finalStatus, error: finalError }];
        });
      } else {
        // Notificar visualmente si llega mensaje de otro cliente
        if (
          msg.direction === "cliente" ||
          msg.direction === "in" ||
          msg.direccion === "cliente"
        ) {
          window.showToast(`Nuevo mensaje de ${phone}`);
        }
      }

      // Contabilizar mensajes sin atender de clientes y disparar alerta sonora si corresponde
      const isClient =
        msg.direction === "cliente" ||
        msg.direction === "in" ||
        msg.direccion === "cliente";

      if (isClient) {
        const msgKey =
          msg._id ||
          msg.wamid ||
          `${phone}_${msg.timestamp || Date.now()}_${msg.text || msg.texto || ""}`;
        if (!processedMsgKeysRef.current.has(msgKey)) {
          processedMsgKeysRef.current.add(msgKey);
          if (processedMsgKeysRef.current.size > 300) {
            const firstKey = processedMsgKeysRef.current.values().next().value;
            processedMsgKeysRef.current.delete(firstKey);
          }

          const isUnattended =
            document.hidden || activePhoneRef.current !== phone;
          if (isUnattended) {
            setUnreadPerPhone((prev) => ({
              ...prev,
              [phone]: (prev[phone] || 0) + 1,
            }));

            // Reproducir sonido si el chat está en modo manual o la pestaña está oculta
            const currentMode = operationModesRef.current[phone];
            if (currentMode === "manual" || document.hidden) {
              playNotificationTone("message");
            }
          }
        }
      }
    };

    // Actualización de estado de entrega de WhatsApp (sent, delivered, read, failed)
    const handleStatusActualizado = (data) => {
      if (!data) return;
      if (activePhone === data.telefono) {
        setMessages((prev) => {
          let found = false;
          const next = prev.map((m) => {
            if (
              (data.wamid && m.wamid === data.wamid) ||
              (data._id && m._id === data._id)
            ) {
              found = true;
              return { ...m, status: data.status, error: data.error };
            }
            return m;
          });
          if (!found && (data.wamid || data._id)) {
            pendingStatusesRef.current[data.wamid || data._id] = { status: data.status, error: data.error };
          }
          return next;
        });
      }
    };

    // ✅ Actualiza purchaseHistory + sidebar sin HTTP
    const handlePaymentReceived = (newOrder) => {
      // Actualizar resumen en sidebar sin HTTP
      setConversations((prev) => ({
        ...prev,
        [newOrder.whatsappId]: {
          ...prev[newOrder.whatsappId],
          nombre:
            prev[newOrder.whatsappId]?.nombre ||
            (newOrder.cliente?.nombre &&
            newOrder.cliente.nombre.trim() !== "Sin nombre"
              ? newOrder.cliente.nombre.trim()
              : null),
          cedula:
            prev[newOrder.whatsappId]?.cedula ||
            (newOrder.cliente?.cedula &&
            newOrder.cliente.cedula.trim() !== "Sin cédula"
              ? newOrder.cliente.cedula.trim()
              : null),
          resumen: {
            text: `Pago recibido (${newOrder.idFormateado || "---"})`,
            timestamp: Date.now(),
            direction: "in",
          },
        },
      }));

      // Reproducir sonido nativo para alertar al vendedor
      playNotificationTone("payment");

      if (activePhone === newOrder.whatsappId) {
        setPurchaseHistory((prev) => {
          const exists = prev.find((o) => o._id === newOrder._id);
          if (exists) {
            return prev.map((o) => (o._id === newOrder._id ? newOrder : o));
          }
          return [newOrder, ...prev];
        });
        window.showToast(
          `Nuevo comprobante recibido (${newOrder.idFormateado || "---"})`,
        );
      } else {
        window.showToast(
          `Nuevo pago recibido de ${newOrder.cliente?.nombre || newOrder.whatsappId}`,
        );
      }
    };

    // ✅ Actualiza pedido COMPLETO en purchaseHistory + sidebar (sin HTTP)
    const handleStatusUpdate = (updated) => {
      if (activePhone === updated.whatsappId) {
        setPurchaseHistory((prev) => {
          const exists = prev.find((o) => o._id === updated._id);
          if (exists)
            return prev.map((o) => (o._id === updated._id ? updated : o));
          return [updated, ...prev];
        });
      }
      if (updated.whatsappId) {
        setConversations((prev) => ({
          ...prev,
          [updated.whatsappId]: {
            ...prev[updated.whatsappId],
            resumen: {
              text: `Pedido ${updated.idFormateado || updated._id} → ${updated.estado}`,
              timestamp: Date.now(),
              direction: "in",
            },
          },
        }));
      }
    };

    // ✅ Actualiza operationModes en tiempo real (sin HTTP)
    const handleModoActualizado = ({ telefono, modo }) => {
      setOperationModes((prev) => ({ ...prev, [telefono]: modo }));
    };

    // ✅ Nuevo: pago confirmado por admin — actualiza purchaseHistory (sin HTTP)
    const handlePagoConfirmado = (pedido) => {
      if (activePhone === pedido.whatsappId) {
        setPurchaseHistory((prev) => {
          const exists = prev.find((o) => o._id === pedido._id);
          if (exists)
            return prev.map((o) => (o._id === pedido._id ? pedido : o));
          return [pedido, ...prev];
        });
      }
    };

    // ✅ Nuevo: pedido actualizado parcialmente — actualiza estado en purchaseHistory (sin HTTP)
    const handlePedidoActualizado = ({ _id, estado }) => {
      if (!activePhone) return;
      setPurchaseHistory((prev) =>
        prev.map((o) => (o._id === _id ? { ...o, estado } : o)),
      );
    };

    // ✅ Nuevo: bot destrabado por watchdog — actualiza modo a automatico (sin HTTP)
    const handleBotDestrabado = (telefono) => {
      setOperationModes((prev) => ({ ...prev, [telefono]: "automatico" }));
      if (activePhone === telefono) {
        window.showToast("Bot reactivado automáticamente para este chat.");
      }
    };

    const handleEstadoActualizado = ({
      telefono,
      paso,
      pasoLabel,
      etiqueta,
    }) => {
      setConversations((prev) => {
        const existing = prev[telefono];
        if (!existing) return prev;
        return {
          ...prev,
          [telefono]: { ...existing, paso, pasoLabel, etiqueta },
        };
      });
    };

    const handleAlertaEstancada = (data) => {
      const phone = data.telefono || data.whatsappId;
      if (!phone) return;
      setConversations((prev) => {
        const existing = prev[phone];
        if (!existing) return prev;
        return { ...prev, [phone]: { ...existing, stuck: true } };
      });
    };

    // Eventos de presencia real y typing emitidos por el servidor
    const handleClientePresencia = (data) => {
      const phone = data?.telefono || data?.phone;
      if (!phone) return;
      const presence = ["online", "offline", "unknown"].includes(data.presence) ? data.presence : "unknown";
      const ttlMs = data.ttlMs || 15000;
      const expiresAt = Date.now() + ttlMs;
      setPresenceMap((prev) => ({
        ...prev,
        [phone]: {
          ...(prev[phone] || {}),
          presence,
          expiresAt,
        },
      }));
    };

    const handleClienteTyping = (data) => {
      const phone = data?.telefono || data?.phone;
      if (!phone) return;
      const isTyping = Boolean(data.isTyping !== false);
      const ttlMs = data.ttlMs || 8000;
      const typingExpiresAt = isTyping ? Date.now() + ttlMs : 0;
      setPresenceMap((prev) => ({
        ...prev,
        [phone]: {
          ...(prev[phone] || {}),
          isTyping,
          typingExpiresAt,
        },
      }));
    };

    liveSocket.on("nuevo_mensaje", handleUpdate);
    liveSocket.on("whatsapp_message", handleUpdate);
    liveSocket.on("mensaje_status_actualizado", handleStatusActualizado);
    liveSocket.on("cliente_presencia", handleClientePresencia);
    liveSocket.on("cliente_typing", handleClienteTyping);
    liveSocket.on("pago_enviado_cliente", handlePaymentReceived);
    liveSocket.on("order_status_changed", handleStatusUpdate);
    liveSocket.on("modo_actualizado", handleModoActualizado);
    liveSocket.on("pago_confirmado", handlePagoConfirmado);
    liveSocket.on("pedido_actualizado", handlePedidoActualizado);
    liveSocket.on("bot_destrabado", handleBotDestrabado);
    liveSocket.on("estado_actualizado", handleEstadoActualizado);
    liveSocket.on("alerta_orden_estancada", handleAlertaEstancada);

    return () => {
      liveSocket.off("nuevo_mensaje", handleUpdate);
      liveSocket.off("whatsapp_message", handleUpdate);
      liveSocket.off("mensaje_status_actualizado", handleStatusActualizado);
      liveSocket.off("cliente_presencia", handleClientePresencia);
      liveSocket.off("cliente_typing", handleClienteTyping);
      liveSocket.off("pago_enviado_cliente", handlePaymentReceived);
      liveSocket.off("order_status_changed", handleStatusUpdate);
      liveSocket.off("modo_actualizado", handleModoActualizado);
      liveSocket.off("pago_confirmado", handlePagoConfirmado);
      liveSocket.off("pedido_actualizado", handlePedidoActualizado);
      liveSocket.off("bot_destrabado", handleBotDestrabado);
      liveSocket.off("estado_actualizado", handleEstadoActualizado);
      liveSocket.off("alerta_orden_estancada", handleAlertaEstancada);
    };
  }, [socket, activePhone]);

  // Sincronizar título de la pestaña con badge de mensajes sin atender
  useEffect(() => {
    const totalUnread = Object.values(unreadPerPhone).reduce(
      (sum, count) => sum + count,
      0,
    );
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) ${BASE_TITLE}`;
    } else {
      document.title = BASE_TITLE;
    }
  }, [unreadPerPhone]);

  // Limpieza periódica de presencia y typing expirados (TTL)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPresenceMap((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const p in next) {
          const item = next[p];
          let nextItem = item;
          if (item.isTyping && item.typingExpiresAt && item.typingExpiresAt < now) {
            nextItem = { ...nextItem, isTyping: false };
            changed = true;
          }
          if (item.presence && item.presence !== "unknown" && item.expiresAt && item.expiresAt < now) {
            nextItem = { ...nextItem, presence: "unknown" };
            changed = true;
          }
          if (nextItem !== item) {
            next[p] = nextItem;
          }
        }
        return changed ? next : prev;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Listener para sincronizar unread al volver a la pestaña
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && activePhone) {
        setUnreadPerPhone((prev) => {
          if (!prev[activePhone]) return prev;
          const next = { ...prev };
          delete next[activePhone];
          return next;
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.title = BASE_TITLE;
    };
  }, [activePhone]);

  // Al cambiar de cliente, reseteamos paginación y limpiamos pendientes
  useEffect(() => {
    if (activePhone) {
      setUnreadPerPhone((prev) => {
        if (!prev[activePhone]) return prev;
        const next = { ...prev };
        delete next[activePhone];
        return next;
      });
      setCurrentPage(1);
      setActiveContext({});
      fetchChatHistory(activePhone, 1);
      fetchPurchases(activePhone);
      fetchChatContext(activePhone);
    }
  }, [activePhone]);

  const loadMoreMessages = () => {
    if (loadingHistory || !hasMore) return;
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    fetchChatHistory(activePhone, nextPage);
  };

  const handleSend = (overrideText = null) => {
    const textToSend = overrideText || currentInputText;
    if (!textToSend || !textToSend.trim() || !activePhone) return;
    const cleanText = textToSend.trim();
    // ÚNICAMENTE wamid válido de Meta, NUNCA Mongo ObjectId ni ID temporal
    const replyToMid =
      currentQuote?.wamid &&
      !String(currentQuote.wamid).startsWith("temp-") &&
      !/^[0-9a-fA-F]{24}$/.test(String(currentQuote.wamid))
        ? currentQuote.wamid
        : null;
    const replyToText = replyToMid
      ? currentQuote?.text || (currentQuote?.mediaUrl ? "[Foto/Archivo]" : null)
      : null;

    socket.emit("enviar_desde_panel", {
      to: activePhone,
      text: cleanText,
      replyToMid,
      replyToText,
    });

    const timestamp = Date.now();
    // Registrar localmente para evitar duplicados del socket
    recentlySentRef.current.push({ text: cleanText, timestamp });
    if (recentlySentRef.current.length > 10) {
      recentlySentRef.current.shift();
    }

    const newMsg = {
      _id: "temp-" + timestamp,
      from: activePhone,
      text: cleanText,
      direction: "bot",
      timestamp,
      tipo: "texto",
      status: "enviando",
      replyToMid,
      replyToText,
    };
    setMessages((prev) => [...prev, newMsg]);
    if (!overrideText) setInputText("");
    setReplyingTo(null);
  };

  // Reintento manual de mensajes fallidos con reconciliación in-place
  const handleRetryMessage = (text, msgId, wamid) => {
    if (!text || !text.trim() || !activePhone) return;
    const cleanText = text.trim();

    // Actualizar estado a 'enviando' en la lista sin duplicar la burbuja
    setMessages((prev) =>
      prev.map((m) => {
        if ((msgId && m._id === msgId) || (wamid && m.wamid === wamid)) {
          return { ...m, status: "enviando" };
        }
        return m;
      })
    );

    socket.emit("enviar_desde_panel", {
      to: activePhone,
      text: cleanText,
      retryMsgId: msgId,
      retryWamid: wamid,
    });
  };

  // --- COMPONENTES DE UI ---

  const renderChatWindow = () => {
    if (!activePhone) {
      return e(
        "div",
        {
          className:
            "hidden md:flex flex-1 flex-col items-center justify-center text-gray-400 dark:text-gray-600 bg-[#f0f2f5] dark:bg-gray-900 border-l dark:border-gray-700",
        },
        e(Icono, { nombre: "messages-square", className: "text-6xl mb-4 opacity-20" }),
        e("p", null, "Selecciona un chat para comenzar"),
      );
    }

    // 3. IDENTIFICACIÓN DE PEDIDO ACTIVO (Banner de Acción de ancho completo)
    // Buscamos el pedido más reciente que NO esté finalizado
    const activeOrder = purchaseHistory.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    )[0];

    let actionBanner = null;
    if (activeOrder) {
      const status = (
        activeOrder.estado ||
        activeOrder.status ||
        ""
      ).toLowerCase();
      const isFinalized = ["entregado", "cancelado", "anulado"].includes(
        status,
      );

      if (!isFinalized) {
        if (
          [
            "pendiente_verificacion",
            "por_verificar",
            "esperando_verificacion",
            "verificando_pago",
          ].includes(status)
        ) {
          actionBanner = e(
            "div",
            {
              key: "actionbanner",
              className:
                "w-full p-2 sm:px-4 bg-emerald-50 dark:bg-emerald-950/40 border-t border-emerald-200 dark:border-emerald-800/40 flex items-center justify-center shrink-0 z-10",
            },
            e(
              "button",
              {
                onClick: handleConfirmPayment,
                disabled: loadingHistory,
                className:
                  "w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              },
              e(Icono, { nombre: loadingHistory ? "loader-circle" : "check-check", girar: loadingHistory, className: "text-sm" }),
              "Confirmar Pago y Enviar Comandas",
            ),
          );
        } else if (status === "verificado" || status === "confirmado") {
          actionBanner = e(
            "div",
            {
              key: "actionbanner",
              className:
                "w-full p-2 sm:px-4 bg-blue-50 dark:bg-blue-950/40 border-t border-blue-200 dark:border-blue-800/40 flex items-center justify-center shrink-0 z-10",
            },
            e(
              "button",
              {
                onClick: () => handleUpdateStatus(activeOrder._id, "en_ruta"),
                disabled: loadingHistory,
                className:
                  "w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              },
              e(Icono, { nombre: loadingHistory ? "loader-circle" : "motorbike", girar: loadingHistory, className: "text-sm" }),
              "Despachar Pedido (En Ruta)",
            ),
          );
        } else if (status === "en_ruta") {
          actionBanner = e(
            "div",
            {
              key: "actionbanner",
              className:
                "w-full p-2 sm:px-4 bg-indigo-50 dark:bg-indigo-950/40 border-t border-indigo-200 dark:border-indigo-800/40 flex items-center justify-center shrink-0 z-10",
            },
            e(
              "button",
              {
                onClick: () => handleUpdateStatus(activeOrder._id, "entregado"),
                disabled: loadingHistory,
                className:
                  "w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white py-2.5 px-4 rounded-lg text-xs sm:text-sm font-bold shadow-sm transition flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
              },
              e(Icono, { nombre: loadingHistory ? "loader-circle" : "flag", girar: loadingHistory, className: "text-sm" }),
              "Marcar como Entregado",
            ),
          );
        }
      }
    }

    return e(
      "div",
      {
        className:
          "flex-1 flex h-full bg-white dark:bg-gray-900 w-full relative overflow-hidden",
      },
      [
        // Columna de Chat Principal
        e(
          "div",
          {
            className:
              "flex-1 flex flex-col h-full bg-[#efeae2] dark:bg-gray-900 relative overflow-hidden min-w-0",
          },
          [
            e(WhatsAppHeader, {
              key: "header",
              phone: activePhone,
              onBack: () => setActivePhone(null),
              operationMode: operationModes[activePhone],
              onToggleMode: handleToggleMode,
              onToggleCustomerCard: () => setIsCustomerCardOpen((prev) => !prev),
              isCustomerCardOpen: isCustomerCardOpen,
              onOpenManualOrder: () => setIsManualOrderOpen(true),
              presence: presenceMap[activePhone]?.presence || "unknown",
              isTyping: Boolean(presenceMap[activePhone]?.isTyping),
            }),
            e(MessageList, {
              key: "messagelist",
              messages,
              purchaseHistory,
              scrollRef,
              hasMore,
              loadMoreMessages,
              loadingHistory,
              operationMode: operationModes[activePhone],
              onRetryMessage: handleRetryMessage,
              onReply: (msg) => setReplyingTo(msg),
            }),
            e(QuickReplyBar, {
              key: "quickreplybar",
              activePhone,
              socket,
              chatContext: activeContext,
              onFillInput: (text) => setInputText(text),
              onReplySent: (text) => {
                const timestamp = Date.now();
                // Registrar localmente para evitar duplicados del socket
                recentlySentRef.current.push({ text, timestamp });
                if (recentlySentRef.current.length > 10) {
                  recentlySentRef.current.shift();
                }

                const newMsg = {
                  _id: "temp-" + timestamp,
                  from: activePhone,
                  text,
                  direction: "bot",
                  timestamp,
                  tipo: "texto",
                  status: "enviando",
                };
                setMessages((prev) => [...prev, newMsg]);
              },
            }),
            actionBanner,
            e(WhatsAppInput, {
              key: "input",
              inputText: currentInputText,
              setInputText,
              handleSend: () => handleSend(),
              activePhone,
              replyingTo: currentQuote,
              onCancelReply: () => setReplyingTo(null),
            }),
          ].filter(Boolean),
        ),

        // Ficha del Cliente (Drawer Lateral / Bottom Sheet)
        e(CustomerCardDrawer, {
          key: "customercarddrawer",
          isOpen: isCustomerCardOpen,
          onClose: () => setIsCustomerCardOpen(false),
          context: activeContext,
          loading: loadingContext,
          onAssignDriver: handleAssignDriver,
          onRefreshContext: () => fetchChatContext(activePhone),
        }),
      ],
    );
  };

  return e(
    "div",
    { className: "flex h-full overflow-hidden bg-white dark:bg-gray-900 relative" },
    [
      e(WhatsAppSidebar, {
        key: "whatsappsidebar",
        conversations,
        activePhone,
        onSelectContact: setActivePhone,
        operationModes,
        unreadPerPhone,
        onOpenProfileModal: () => setIsProfileModalOpen(true),
      }),
      renderChatWindow(),
      e(WhatsAppProfileModal, {
        key: "whatsappprofilemodal",
        isOpen: isProfileModalOpen,
        onClose: () => setIsProfileModalOpen(false),
      }),
      e(ChatManualOrderModal, {
        key: "chatmanualordermodal",
        isOpen: isManualOrderOpen,
        onClose: () => setIsManualOrderOpen(false),
        whatsappId: activePhone,
        apiClient: apiClient,
      }),
    ],
  );
};

export default WhatsAppConsole;
