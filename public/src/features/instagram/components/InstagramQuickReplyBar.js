import { Icono } from "../../../components/Icono.js";
/**
 * public/src/features/instagram/components/InstagramQuickReplyBar.js
 * Barra compacta de Respuestas Rápidas para Instagram Direct:
 * Reutiliza QuickReplyBottomSheet y parseTemplate de WhatsApp con estética de Instagram
 */

import React, {
  useState,
  useEffect,
  useCallback,
} from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js?v=4";
import parseTemplate from "../../whatsapp/components/parseTemplate.js?v=5";
import QuickReplyBottomSheet from "../../whatsapp/components/QuickReplyBottomSheet.js?v=4";

const e = React.createElement;

const InstagramQuickReplyBar = ({
  activeContact,
  chatContext = {},
  onFillInput,
  onSend,
}) => {
  const [replies, setReplies] = useState([]);
  const [isRepliesOpen, setIsRepliesOpen] = useState(false);

  // Carga de Respuestas Rápidas reales desde la base de datos
  const fetchReplies = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/admin/quick-replies");
      if (res.data?.success && Array.isArray(res.data.data)) {
        setReplies(res.data.data.filter((r) => r.active !== false));
      }
    } catch (err) {
      console.warn("InstagramQuickReplyBar: error cargando quick replies:", err.message);
    }
  }, []);

  useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  // Selección de Respuesta Rápida
  const handleSelectReply = (reply) => {
    const text = reply.text || "";
    const hasTokens = /\{(nombre|totalUSD|totalBS|total|items|menu)\}/.test(text);

    // Registro de contador de uso
    if (reply._id) {
      apiClient
        .put(`/api/admin/quick-replies/${reply._id}`, {
          usageCount: (reply.usageCount || 0) + 1,
        })
        .catch(() => {});
    }

    if (hasTokens) {
      const readyMessage = parseTemplate(text, chatContext);
      if (onFillInput) onFillInput(readyMessage);
    } else {
      if (onSend) onSend(text);
    }
  };

  if (!activeContact) return null;

  return e(
    "div",
    {
      className:
        "relative w-full border-t border-gray-200 dark:border-gray-700/80 bg-[#f8f8f8] dark:bg-gray-900/90 flex items-center justify-start gap-2 py-1.5 px-3 sm:px-4 transition-all shrink-0 select-none overflow-x-auto scrollbar-none",
    },
    [
      // Botón principal: Respuestas Rápidas (Abre QuickReplyBottomSheet reutilizado)
      e(
        "button",
        {
          key: "btn-quick-replies",
          type: "button",
          onClick: () => setIsRepliesOpen(true),
          className:
            "h-7 px-3 bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4] text-white rounded-full text-[11px] font-bold flex items-center gap-1.5 shrink-0 shadow-2xs hover:opacity-95 active:scale-95 transition-all cursor-pointer",
          title: "Abrir respuestas rápidas",
          "aria-label": "Ver respuestas rápidas",
        },
        [
          e(Icono, {
            key: "icon-replies",
            nombre: "list", className: "text-[10px]",
            "aria-hidden": "true",
          }),
          e("span", { key: "txt-replies" }, "Respuestas Rápidas"),
        ],
      ),

      // Bottom Sheet Modal de Respuestas Rápidas (Reutilizado del chat de WhatsApp)
      isRepliesOpen &&
        e(QuickReplyBottomSheet, {
          key: "sheet-quick-replies",
          isOpen: isRepliesOpen,
          onClose: () => setIsRepliesOpen(false),
          replies,
          onSelectReply: (reply) => {
            handleSelectReply(reply);
            setIsRepliesOpen(false);
          },
          chatContext,
          channelName: "Instagram",
        }),
    ],
  );
};

export default InstagramQuickReplyBar;
