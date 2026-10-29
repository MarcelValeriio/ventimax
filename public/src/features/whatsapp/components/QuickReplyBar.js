import { Icono } from "../../../components/Icono.js";
// public/src/features/whatsapp/components/QuickReplyBar.js
import React, {
  useState,
  useEffect,
  useCallback,
} from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js?v=3";
import parseTemplate from "./parseTemplate.js?v=5";
import QuickReplyBottomSheet from "./QuickReplyBottomSheet.js?v=3";
const e = React.createElement;

/**
 * QuickReplyBar — Barra única compacta de respuestas rápidas para Mobile y Desktop.
 *
 * - Una sola fila compacta (h-7/h-8) con botón principal "Ver respuestas" y hasta 3 accesos rápidos/favoritos.
 * - Al pulsar "Ver respuestas", abre el QuickReplyBottomSheet con búsqueda, categorías, favoritas y lista completa.
 * - Iconografía: 100% Lucide con aria-hidden="true" (sin emojis decorativos en controles).
 * - Temas: Soporte integral para Modo Claro (bg-[#f0f2f5]) y Modo Oscuro (dark:bg-gray-900).
 */
const QuickReplyBar = ({
  activePhone,
  socket,
  onReplySent,
  chatContext,
  onFillInput,
}) => {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const fetchReplies = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get("/api/admin/quick-replies");
      if (res.data?.success && Array.isArray(res.data.data)) {
        setReplies(res.data.data.filter((r) => r.active !== false));
      }
    } catch (err) {
      console.warn(
        "QuickReplyBar: no se pudieron cargar las respuestas rápidas.",
        err.message,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  const handleClick = (reply) => {
    const text = reply.text;
    const hasTokens = /\{(nombre|totalUSD|totalBS|total|items|menu)\}/.test(text);

    // Registrar uso
    if (reply._id) {
      apiClient
        .put(`/api/admin/quick-replies/${reply._id}`, {
          usageCount: (reply.usageCount || 0) + 1,
        })
        .catch(() => {});
    }

    if (hasTokens) {
      const readyMessage = parseTemplate(text, chatContext || {});
      if (onFillInput) onFillInput(readyMessage);
      return;
    }

    // Sin tokens: envío directo vía socket
    if (!activePhone || !socket) return;
    socket.emit("enviar_desde_panel", { to: activePhone, text });
    if (onReplySent) onReplySent(text);
  };

  if (loading || !activePhone || replies.length === 0) return null;

  return e(
    "div",
    {
      className:
        "relative w-full border-t border-gray-200 dark:border-gray-800 bg-[#f0f2f5] dark:bg-gray-900 flex py-1 px-1.5 sm:px-2 transition-all shrink-0 select-none",
    },
    [
      // =========================================================================
      // BARRA ÚNICA (Mobile y Desktop) — Solo botón "Ver respuestas"
      // =========================================================================
      e(
        "div",
        {
          key: "single-compact-bar",
          className: "flex items-center py-0.5 px-0.5 w-full",
        },
        [
          // Botón principal "Ver respuestas" para abrir el Bottom Sheet
          e(
            "button",
            {
              key: "btn-open-sheet",
              type: "button",
              onClick: () => setIsSheetOpen(true),
              "aria-label": "Ver todas las respuestas rápidas",
              className:
                "h-7 px-3 bg-[#008069] hover:bg-[#006e59] text-white rounded-full text-[11px] font-bold flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer active:scale-95 transition",
            },
            [
              e(Icono, {
                nombre: "list", className: "text-[10px]",
                "aria-hidden": "true",
              }),
              e("span", null, "Respuestas Rapidas"),
            ],
          ),
        ],
      ),

      // =========================================================================
      // BOTTOM SHEET MODAL (Panel inferior vertical completo)
      // =========================================================================
      isSheetOpen &&
        e(QuickReplyBottomSheet, {
          isOpen: isSheetOpen,
          onClose: () => setIsSheetOpen(false),
          replies,
          onSelectReply: (reply) => {
            handleClick(reply);
            setIsSheetOpen(false);
          },
          chatContext,
        }),
    ],
  );
};

export default QuickReplyBar;
