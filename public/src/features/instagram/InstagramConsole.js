import { Icono } from "../../components/Icono.js";
/**
 * public/src/features/instagram/InstagramConsole.js
 * Consola Principal de Instagram Direct
 * Misma UX de WhatsApp pero con identidad visual y gradientes oficiales de Instagram
 * Autocontenido con datos mockeados y desacoplado del backend de WhatsApp
 */

import React, { useState, useRef, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js?v=4";
import { INITIAL_INSTAGRAM_CONVERSATIONS } from "./mockData.js?v=4";
import InstagramSidebar from "./components/InstagramSidebar.js?v=4";
import InstagramHeader from "./components/InstagramHeader.js?v=4";
import InstagramMessageList from "./components/InstagramMessageList.js?v=4";
import InstagramQuickReplyBar from "./components/InstagramQuickReplyBar.js?v=4";
import InstagramInput from "./components/InstagramInput.js?v=4";
import InstagramCustomerDrawer from "./components/InstagramCustomerDrawer.js?v=4";

const e = React.createElement;

const isMobileScreen = () => typeof window !== "undefined" && window.innerWidth < 768;

const InstagramConsole = ({ socket }) => {
  const [conversations, setConversations] = useState(
    JSON.parse(JSON.stringify(INITIAL_INSTAGRAM_CONVERSATIONS)),
  );
  const [activeId, setActiveId] = useState(isMobileScreen() ? null : "ig_user_101");
  const [drafts, setDrafts] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [botEnabled, setBotEnabled] = useState(true);
  const [isTogglingBot, setIsTogglingBot] = useState(false);
  const scrollRef = useRef(null);

  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  const currentInputText = activeId ? (drafts[activeId] || "") : "";
  const setInputText = (valOrFn) => {
    if (!activeIdRef.current) return;
    const id = activeIdRef.current;
    setDrafts((prev) => {
      const currentVal = prev[id] || "";
      const newVal = typeof valOrFn === "function" ? valOrFn(currentVal) : valOrFn;
      return { ...prev, [id]: newVal };
    });
  };

  // Cargar estado global del bot de Instagram
  const fetchBotToggle = async () => {
    try {
      const res = await apiClient.get("/api/admin/ig/bot-toggle");
      if (res.data && res.data.success && typeof res.data.data?.enabled === "boolean") {
        setBotEnabled(res.data.data.enabled);
      }
    } catch (err) {
      console.warn("⚠️ [IG Console] Error consultando bot-toggle:", err.message);
    }
  };

  // Alternar estado global del bot (optimista + persistencia en API)
  const handleToggleBot = async () => {
    if (isTogglingBot) return;
    const nextState = !botEnabled;
    setBotEnabled(nextState);
    setIsTogglingBot(true);
    try {
      const res = await apiClient.post("/api/admin/ig/bot-toggle", { enabled: nextState });
      if (res.data && res.data.success) {
        if (window.showToast) {
          window.showToast(
            nextState ? "Bot de Instagram activado" : "Bot de Instagram pausado (manual)",
            nextState ? "success" : "warning",
          );
        }
      } else {
        setBotEnabled(!nextState);
      }
    } catch (err) {
      setBotEnabled(!nextState);
      console.error("❌ [IG Console] Error cambiando bot-toggle:", err.message);
      if (window.showToast) {
        window.showToast("No se pudo cambiar el estado del bot", "error");
      }
    } finally {
      setIsTogglingBot(false);
    }
  };

  // Cargar lista de conversaciones desde el backend
  const fetchConversations = async () => {
    try {
      const res = await apiClient.get("/api/admin/ig/historial");
      if (res.data && res.data.success && res.data.data) {
        const raw = res.data.data;
        const list = Array.isArray(raw) ? raw : Object.values(raw);
        if (list.length > 0) {
          setConversations((prev) => {
            return list.map((newItem) => {
              const existing = prev.find((p) => p.id === newItem.id);
              return {
                ...newItem,
                // Preservar array de mensajes y unreadCount local ya cargado
                messages: existing?.messages || newItem.messages,
                unreadCount: existing ? existing.unreadCount : (newItem.unreadCount || 0),
              };
            });
          });
          setActiveId((prevActive) => {
            if (prevActive && list.some((c) => c.id === prevActive)) {
              return prevActive;
            }
            if (isMobileScreen()) {
              return prevActive || null;
            }
            return list[0]?.id || null;
          });
        }
      }
    } catch (err) {
      console.warn("⚠️ [IG Console] Fallback a mockData por error en API:", err.message);
    }
  };

  // Marcar leído EXPLÍCITO en el servidor (Inbox Unificado, Fase 2A).
  // Desde la fase 2A el GET del historial YA NO resetea `unreadCount`: el
  // marcado de leído tiene su propio endpoint idempotente.
  const marcarLeidoEnServidor = async (id) => {
    if (!id || id.startsWith("ig_user_")) return; // Mock id
    try {
      await apiClient.post("/api/admin/inbox/leido", {
        canal: "instagram",
        usuarioId: id,
      });
    } catch (err) {
      // No bloqueante: la UI ya marcó leído de forma local
      console.warn(`⚠️ [IG Console] No se pudo marcar leído en el servidor para ${id}:`, err.message);
    }
  };

  // Cargar mensajes de la conversación activa
  const fetchMessagesForActiveContact = async (id) => {
    if (!id || id.startsWith("ig_user_")) return; // Mock id
    try {
      const res = await apiClient.get(`/api/admin/ig/historial?usuario=${id}`);
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setConversations((prev) =>
          prev.map((c) => (c.id === id ? { ...c, messages: res.data.data, unreadCount: 0 } : c)),
        );
        marcarLeidoEnServidor(id);
      }
    } catch (err) {
      console.warn(`⚠️ [IG Console] Error cargando mensajes para ${id}:`, err.message);
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchBotToggle();
  }, []);

  useEffect(() => {
    if (activeId) {
      fetchMessagesForActiveContact(activeId);
    }
  }, [activeId]);

  // Ocultar global-sidebar en mobile al tener conversación activa
  useEffect(() => {
    const globalSidebar = document.getElementById("global-sidebar");
    if (!globalSidebar) return;

    const handleResize = () => {
      if (window.innerWidth < 768 && activeId) {
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
  }, [activeId]);

  // Escuchar eventos en tiempo real vía Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleMensajeIg = (data) => {
      if (!data?.usuarioIgId || !data?.mensaje) return;
      const uId = data.usuarioIgId;
      const rawMsg = data.mensaje;
      const newMsg = {
        _id: rawMsg._id,
        mid: rawMsg.mid || null,
        status: rawMsg.status || (rawMsg.direccion === "bot" ? "sent" : "received"),
        text: rawMsg.texto || rawMsg.text || "",
        timestamp: new Date(rawMsg.timestamp).getTime(),
        direction: rawMsg.direccion || rawMsg.direction || "cliente",
        tipo: rawMsg.tipo || "texto",
        mediaUrl: rawMsg.mediaUrl || null,
        mediaType: rawMsg.mediaType || null,
      };

      setConversations((prev) => {
        const exists = prev.some((c) => c.id === uId);
        if (!exists) {
          fetchConversations();
          return prev;
        }
        return prev.map((c) => {
          if (c.id === uId) {
            let msgs = [...(c.messages || [])];
            // Si llega un mensaje real del bot, limpiar mensajes optimistas temporales coincidentes
            if (newMsg.direction === "bot") {
              const textNew = newMsg.text;
              msgs = msgs.filter(
                (m) => !(m._id && typeof m._id === "string" && m._id.startsWith("temp-") && (m.texto === textNew || m.text === textNew)),
              );
            }
            if (!msgs.some((m) => m._id === newMsg._id)) {
              msgs.push(newMsg);
            }
            return {
              ...c,
              lastMessage: {
                text: newMsg.text,
                timestamp: newMsg.timestamp,
                direction: newMsg.direction,
              },
              messages: msgs,
              unreadCount: activeId === uId ? 0 : (c.unreadCount || 0) + (newMsg.direction === "cliente" ? 1 : 0),
            };
          }
          return c;
        });
      });
    };

    const handleActualizado = (data) => {
      fetchConversations();
    };

    const handleBotToggle = (data) => {
      if (data && typeof data.enabled === "boolean") {
        setBotEnabled(data.enabled);
      }
    };

    const handleModoActualizado = (data) => {
      if (!data?.usuarioIgId || !data?.modo) return;
      setConversations((prev) =>
        prev.map((c) =>
          c.id === data.usuarioIgId
            ? {
                ...c,
                modo: data.modo,
                operationMode: data.modo,
                requiresAttention:
                  data.modo === "manual" || c.stuck === true || c.origen === "anuncio",
              }
            : c,
        ),
      );
    };

    socket.on("mensaje_ig", handleMensajeIg);
    socket.on("ig_actualizado", handleActualizado);
    socket.on("ig_bot_toggle", handleBotToggle);
    socket.on("ig_modo_actualizado", handleModoActualizado);

    return () => {
      socket.off("mensaje_ig", handleMensajeIg);
      socket.off("ig_actualizado", handleActualizado);
      socket.off("ig_bot_toggle", handleBotToggle);
      socket.off("ig_modo_actualizado", handleModoActualizado);
    };
  }, [socket, activeId]);

  const activeContact = conversations.find((c) => c.id === activeId) || null;

  // Alternar modo del bot para un contacto específico (Automático / Manual)
  const handleToggleContactBotMode = async (contactId, nextMode) => {
    if (!contactId) return;

    // Actualización optimista local
    setConversations((prev) =>
      prev.map((c) =>
        c.id === contactId
          ? {
              ...c,
              modo: nextMode,
              operationMode: nextMode,
              requiresAttention:
                nextMode === "manual" || c.stuck === true || c.origen === "anuncio",
            }
          : c,
      ),
    );

    if (contactId.startsWith("ig_user_")) {
      if (window.showToast) {
        window.showToast(
          nextMode === "automatico"
            ? "Bot activado para este contacto"
            : "Modo manual activado para este contacto",
          nextMode === "automatico" ? "success" : "warning",
        );
      }
      return;
    }

    try {
      const res = await apiClient.post("/api/admin/ig/modo", {
        usuarioIgId: contactId,
        modo: nextMode,
      });
      if (res.data && res.data.success) {
        if (window.showToast) {
          window.showToast(
            nextMode === "automatico"
              ? "Bot activado para este contacto"
              : "Modo manual activado para este contacto",
            nextMode === "automatico" ? "success" : "warning",
          );
        }
      } else {
        const prevMode = nextMode === "automatico" ? "manual" : "automatico";
        setConversations((prev) =>
          prev.map((c) => (c.id === contactId ? { ...c, modo: prevMode, operationMode: prevMode } : c)),
        );
      }
    } catch (err) {
      console.error("❌ [IG Console] Error cambiando modo de contacto:", err.message);
      const prevMode = nextMode === "automatico" ? "manual" : "automatico";
      setConversations((prev) =>
        prev.map((c) => (c.id === contactId ? { ...c, modo: prevMode, operationMode: prevMode } : c)),
      );
      if (window.showToast) {
        window.showToast("No se pudo cambiar el modo del bot", "error");
      }
    }
  };

  // Selección de contacto y marcado de mensajes como leídos
  const handleSelectContact = (id) => {
    setActiveId(id);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
    );
    // Marcado explícito en el servidor: cubre re-seleccionar el mismo hilo
    // (cuando el id no cambia, el efecto de carga no se vuelve a disparar).
    marcarLeidoEnServidor(id);
  };

  // Envío de mensajes (API real con fallback optimista)
  const handleSend = async (text) => {
    if (!text || !activeId) return;

    const tempMsg = {
      _id: `temp-${Date.now()}`,
      text,
      texto: text,
      direction: "bot",
      direccion: "bot",
      timestamp: Date.now(),
      status: "sent",
    };

    // Actualización optimista local
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeId) {
          return {
            ...c,
            lastMessage: {
              text,
              timestamp: Date.now(),
              direction: "bot",
            },
            messages: [...(c.messages || []), tempMsg],
          };
        }
        return c;
      }),
    );

    setInputText("");

    // Si es un contacto mockeado, mantener envío local
    if (activeId.startsWith("ig_user_")) return;

    try {
      const res = await apiClient.post("/api/admin/ig/enviar", {
        usuarioIgId: activeId,
        texto: text,
      });
      if (res.data && res.data.success && res.data.data) {
        const raw = res.data.data;
        const normalizedMsg = {
          _id: raw._id,
          mid: raw.mid || null,
          status: raw.status || "sent",
          text: raw.texto || raw.text || text,
          texto: raw.texto || raw.text || text,
          timestamp: raw.timestamp
            ? (raw.timestamp instanceof Date ? raw.timestamp.getTime() : new Date(raw.timestamp).getTime())
            : Date.now(),
          direction: raw.direccion || raw.direction || "bot",
          direccion: raw.direccion || raw.direction || "bot",
          tipo: raw.tipo || "texto",
          mediaUrl: raw.mediaUrl || null,
          mediaType: raw.mediaType || null,
        };
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === activeId) {
              const msgs = c.messages || [];
              const hasTemp = msgs.some((m) => m._id === tempMsg._id);
              const updatedMsgs = hasTemp
                ? msgs.map((m) => (m._id === tempMsg._id ? normalizedMsg : m))
                : msgs.some((m) => m._id === normalizedMsg._id)
                  ? msgs
                  : [...msgs, normalizedMsg];
              return { ...c, messages: updatedMsgs };
            }
            return c;
          }),
        );
      }
    } catch (err) {
      console.error("❌ [IG Console] Error enviando mensaje a la API:", err.message);
      if (window.showToast) {
        window.showToast(err.response?.data?.error || err.message, "error");
      }
    }
  };

  const handleSendImage = async (file) => {
    if (!file || !activeId) return;

    const tempUrl = URL.createObjectURL(file);
    const tempMsg = {
      _id: `temp-${Date.now()}`,
      text: "[Foto]",
      texto: "[Foto]",
      tipo: "imagen",
      mediaUrl: tempUrl,
      mediaType: "image",
      direction: "bot",
      direccion: "bot",
      timestamp: Date.now(),
      status: "sent",
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeId) {
          return {
            ...c,
            lastMessage: {
              text: "📷 Foto",
              timestamp: Date.now(),
              direction: "bot",
            },
            messages: [...(c.messages || []), tempMsg],
          };
        }
        return c;
      }),
    );

    if (activeId.startsWith("ig_user_")) return;

    try {
      const formData = new FormData();
      formData.append("usuarioIgId", activeId);
      formData.append("file", file);

      const res = await apiClient.post("/api/admin/ig/enviar-imagen", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data && res.data.success && res.data.data) {
        const raw = res.data.data;
        const normalizedMsg = {
          _id: raw._id,
          mid: raw.mid || null,
          status: raw.status || "sent",
          text: raw.texto || raw.text || "[Foto]",
          texto: raw.texto || raw.text || "[Foto]",
          timestamp: raw.timestamp
            ? (raw.timestamp instanceof Date ? raw.timestamp.getTime() : new Date(raw.timestamp).getTime())
            : Date.now(),
          direction: raw.direccion || raw.direction || "bot",
          direccion: raw.direccion || raw.direction || "bot",
          tipo: raw.tipo || "imagen",
          mediaUrl: raw.mediaUrl || tempUrl,
          mediaType: raw.mediaType || "image",
        };
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === activeId) {
              const msgs = c.messages || [];
              const hasTemp = msgs.some((m) => m._id === tempMsg._id);
              const updatedMsgs = hasTemp
                ? msgs.map((m) => (m._id === tempMsg._id ? normalizedMsg : m))
                : msgs.some((m) => m._id === normalizedMsg._id)
                  ? msgs
                  : [...msgs, normalizedMsg];
              return { ...c, messages: updatedMsgs };
            }
            return c;
          }),
        );
      }
    } catch (err) {
      console.error("❌ [IG Console] Error enviando imagen:", err.message);
      if (window.showToast) {
        window.showToast(err.response?.data?.error || err.message, "error");
      }
    }
  };

  return e(
    "div",
    {
      className:
        "flex h-full w-full overflow-hidden bg-white dark:bg-gray-900 transition-colors select-none",
    },
    [
      // Sidebar de conversaciones (Izquierda)
      e(InstagramSidebar, {
        key: "ig-sidebar",
        conversations,
        activeId,
        onSelectContact: handleSelectContact,
        searchQuery,
        setSearchQuery,
        botEnabled,
        onToggleBot: handleToggleBot,
        isTogglingBot,
      }),

      // Ventana de Chat Principal o Estado Vacío (Derecha)
      activeContact
        ? e(
            "div",
            {
              key: "chat-viewport",
              className:
                "flex-1 flex h-full w-full relative overflow-hidden bg-[#f8f8f8] dark:bg-gray-900",
            },
            [
              // Columna Central de Chat
              e(
                "div",
                {
                  key: "chat-column",
                  className:
                    "flex-1 flex flex-col h-full bg-[#f8f8f8] dark:bg-gray-900 relative overflow-hidden min-w-0",
                },
                [
                  // Banner fino de advertencia si el bot está desactivado globalmente
                  !botEnabled &&
                    e(
                      "div",
                      {
                        key: "bot-paused-banner",
                        className:
                          "bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 flex items-center justify-between text-amber-800 dark:text-amber-200 text-xs shrink-0 font-medium",
                      },
                      [
                        e(
                          "div",
                          { key: "banner-msg", className: "flex items-center gap-2" },
                          [
                            e(Icono, { nombre: "bot", className: "text-amber-600 dark:text-amber-400" }),
                            e("span", null, "Bot de Instagram pausado globalmente — Las respuestas automáticas están apagadas."),
                          ],
                        ),
                        e(
                          "button",
                          {
                            key: "banner-reactivate-btn",
                            onClick: handleToggleBot,
                            disabled: isTogglingBot,
                            className:
                              "text-[11px] font-bold text-amber-900 dark:text-amber-100 underline hover:no-underline cursor-pointer ml-2",
                          },
                          "Reactivar Bot",
                        ),
                      ],
                    ),
                  e(InstagramHeader, {
                    key: "ig-header",
                    contact: activeContact,
                    onBack: () => setActiveId(null),
                    onToggleInfo: () => setIsInfoOpen((prev) => !prev),
                    onToggleBotMode: handleToggleContactBotMode,
                    isInfoOpen,
                  }),
                  e(InstagramMessageList, {
                    key: "ig-messages",
                    messages: activeContact.messages || [],
                    scrollRef,
                    contactAvatar: activeContact.avatar,
                  }),
                  e(InstagramQuickReplyBar, {
                    key: "ig-quick-reply-bar",
                    activeContact,
                    chatContext: {
                      customerName: activeContact.fullName || activeContact.username || "Cliente",
                      totalUSD: null,
                      totalBS: null,
                      items: [],
                    },
                    onFillInput: (text) => setInputText(text),
                    onSend: handleSend,
                  }),
                  e(InstagramInput, {
                    key: "ig-input",
                    inputText: currentInputText,
                    setInputText,
                    onSend: handleSend,
                    onSendImage: handleSendImage,
                  }),
                ],
              ),

              // Drawer de información del cliente IG
              e(InstagramCustomerDrawer, {
                key: "ig-drawer",
                isOpen: isInfoOpen,
                onClose: () => setIsInfoOpen(false),
                contact: activeContact,
                onToggleBotMode: handleToggleContactBotMode,
              }),
            ],
          )
        : e(
            "div",
            {
              key: "empty-state",
              className:
                "hidden md:flex flex-1 flex-col items-center justify-center p-8 bg-[#f8f8f8] dark:bg-gray-900 text-center select-none",
            },
            [
              e(
                "div",
                {
                  key: "empty-logo-box",
                  className:
                    "w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4] flex items-center justify-center text-white shadow-xl shadow-pink-500/20 mb-5 animate-pulse-gentle",
                },
                e(Icono, { marca: "instagram", className: "text-4xl" }),
              ),
              e(
                "h2",
                {
                  key: "empty-h2",
                  className:
                    "text-xl font-black text-gray-800 dark:text-white uppercase tracking-tight mb-2",
                },
                "Instagram Direct",
              ),
              e(
                "p",
                {
                  key: "empty-p",
                  className:
                    "text-sm text-gray-500 dark:text-gray-400 max-w-sm leading-relaxed",
                },
                "Selecciona una conversación del panel izquierdo para responder mensajes y gestionar pedidos de Instagram.",
              ),
            ],
          ),
    ],
  );
};

export default InstagramConsole;
