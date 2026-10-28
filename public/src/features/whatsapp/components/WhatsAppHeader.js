// public/src/features/whatsapp/components/WhatsAppHeader.js
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
const e = React.createElement;

const WhatsAppHeader = ({
  phone,
  onBack,
  operationMode,
  onToggleMode,
  onToggleCustomerCard,
  isCustomerCardOpen,
  onOpenManualOrder,
  presence = "unknown",
  isTyping = false,
}) => {
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    setIsMuted(localStorage.getItem("pachi_muted") === "true");
    const handleStorageChange = () => setIsMuted(localStorage.getItem("pachi_muted") === "true");
    window.addEventListener("pachi_mute_toggled", handleStorageChange);
    return () => window.removeEventListener("pachi_mute_toggled", handleStorageChange);
  }, []);

  const toggleMute = () => {
    const newState = !isMuted;
    setIsMuted(newState);
    localStorage.setItem("pachi_muted", newState.toString());
    window.dispatchEvent(new Event("pachi_mute_toggled"));
    window.showToast?.(`Notificaciones ${newState ? 'silenciadas' : 'activadas'}`);
  };

  // Renderizar estado de presencia / escribiendo
  const renderStatus = () => {
    if (isTyping) {
      return e(
        "p",
        {
          className:
            "text-[11px] text-emerald-100 font-semibold flex items-center gap-1 animate-pulse",
        },
        [e("span", null, "escribiendo...")],
      );
    }
    if (presence === "online") {
      return e(
        "p",
        { className: "text-[11px] text-emerald-100 flex items-center gap-1" },
        [
          e("span", {
            className: "w-1.5 h-1.5 rounded-full bg-emerald-300 inline-block",
          }),
          "en línea",
        ],
      );
    }
    if (presence === "offline") {
      return e("p", { className: "text-[11px] opacity-75" }, "desconectado");
    }
    // Default cuando no hay señal de presencia (WhatsApp Business API estándar)
    return e("p", { className: "text-[11px] opacity-75" }, "WhatsApp");
  };

  return e(
    "div",
    {
      className:
        "p-3 border-b dark:border-gray-700 flex justify-between items-center shadow-sm z-10 bg-[#008069] text-white",
    },
    [
      e("div", { className: "flex items-center gap-3 overflow-hidden min-w-0" }, [
        e(
          "button",
          {
            onClick: onBack,
            className:
              "block md:hidden p-2 text-white hover:bg-white/10 rounded-full transition-colors flex items-center justify-center mr-1 shrink-0",
          },
          e("i", { className: "fas fa-arrow-left text-lg" })
        ),
        e(
          "div",
          {
            className:
              "w-10 h-10 rounded-full bg-white/20 overflow-hidden shrink-0",
          },
          e("img", {
            src: `https://api.dicebear.com/7.x/avataaars/svg?seed=${phone}`,
            className: "w-full",
          }),
        ),
        e("div", { className: "truncate min-w-0" }, [
          e("div", { className: "flex items-center gap-2" }, [
            e("h4", { className: "font-bold text-[15px] truncate leading-tight" }, phone),
            e(
              "button",
              {
                onClick: onToggleMode,
                title:
                  operationMode === "manual"
                    ? "Modo Manual activo (clic para reactivar Bot)"
                    : "Bot activo (clic para pausar a Modo Manual)",
                className: `px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all duration-200 flex items-center gap-1 cursor-pointer shrink-0 border ${
                  operationMode === "manual"
                    ? "bg-amber-400/20 text-amber-200 border-amber-300/40 hover:bg-amber-400/30"
                    : "bg-emerald-400/20 text-emerald-100 border-emerald-300/40 hover:bg-emerald-400/30"
                }`,
              },
              [
                e("span", {
                  className: `w-1.5 h-1.5 rounded-full ${
                    operationMode === "manual"
                      ? "bg-amber-300 animate-pulse"
                      : "bg-emerald-300"
                  }`,
                }),
                e("i", {
                  className: `fas ${
                    operationMode === "manual" ? "fa-user" : "fa-robot"
                  } text-[9px]`,
                }),
                e(
                  "span",
                  { className: "hidden sm:inline" },
                  operationMode === "manual" ? "Manual" : "Bot",
                ),
              ],
            ),
          ]),
          renderStatus(),
        ]),
      ]),
      e("div", { className: "flex items-center gap-1.5 sm:gap-2 shrink-0" }, [
        e(
          "button",
          {
            onClick: onToggleCustomerCard,
            title: isCustomerCardOpen
              ? "Ocultar ficha del cliente"
              : "Ver ficha del cliente y pedido en vivo",
            "aria-label": "Ver ficha del cliente",
            className: `p-2 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              isCustomerCardOpen
                ? "bg-white text-[#008069] shadow-sm"
                : "bg-white/15 text-white hover:bg-white/25"
            }`,
          },
          [
            e("i", { className: "fas fa-id-card text-sm" }),
            e("span", { className: "hidden sm:inline text-xs" }, "Ficha"),
          ],
        ),
        e(
          "button",
          {
            onClick: onOpenManualOrder,
            title: "Crear venta manual prellenada con IA",
            "aria-label": "Venta IA",
            className:
              "p-2 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-bold bg-white text-[#008069] hover:bg-emerald-50 transition flex items-center gap-1.5 cursor-pointer shadow-sm",
          },
          [
            e("i", { className: "fas fa-robot text-sm" }),
            e(
              "span",
              { className: "hidden sm:inline text-xs" },
              "Venta IA",
            ),
          ],
        ),
      ]),
    ],
  );
};

export default WhatsAppHeader;
