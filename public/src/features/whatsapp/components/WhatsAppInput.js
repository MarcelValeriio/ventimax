// public/src/features/whatsapp/components/WhatsAppInput.js
import React, { useState, useRef, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";
const e = React.createElement;

const EMOJIS = [
  "😀",
  "😂",
  "🥰",
  "😍",
  "😊",
  "🙏",
  "👍",
  "🙌",
  "❤️",
  "🔥",
  "🎉",
  "✨",
  "💯",
  "🤔",
  "👀",
  "🍕",
  "🍔",
  "🛵",
  "🏍️",
  "🛍️",
  "✅",
  "❌",
  "✔️",
  "📦",
  "📞",
];

/**
 * WhatsAppInput — Cuadro de composición de mensajes del chat.
 * 
 * - Altura Inicial: rows=3 con min-h-[70px] en mobile / min-h-[64px] en desktop para mayor comodidad visual.
 * - Crecimiento Controlado: max-h-[140px] con scroll interno y resize-none.
 * - Iconografía: 100% Font Awesome con atributos de accesibilidad.
 * - Alineación: items-end para que los botones de acción se ubiquen ergonómicamente al pie del textarea.
 */
const WhatsAppInput = ({
  inputText,
  setInputText,
  handleSend,
  activePhone,
  replyingTo = null,
  onCancelReply = null,
}) => {
  const [showEmojis, setShowEmojis] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const textAreaRef = useRef(null);

  // AutoFocus automático en el textarea al presionar "Responder / Citar"
  useEffect(() => {
    if (replyingTo && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [replyingTo]);

  const handleEmojiClick = (emoji) => {
    setInputText((prev) => prev + emoji);
  };

  const handleAttachClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!activePhone) {
      window.showToast("Selecciona un chat primero.", "error");
      return;
    }

    try {
      setIsUploading(true);
      window.showToast("📎 Subiendo archivo...", "info");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("to", activePhone);
      if (replyingTo) {
        const replyToMid =
          replyingTo.wamid &&
          !String(replyingTo.wamid).startsWith("temp-") &&
          !/^[0-9a-fA-F]{24}$/.test(String(replyingTo.wamid))
            ? replyingTo.wamid
            : null;
        if (replyToMid) formData.append("replyToMid", replyToMid);
        if (replyingTo.text) formData.append("replyToText", replyingTo.text);
      }
      if (inputText.trim()) {
        formData.append("caption", inputText.trim());
        setInputText("");
      }

      const res = await apiClient.post("/api/admin/chat/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (res.data && res.data.success) {
        window.showToast("✅ Archivo enviado con éxito!");
        if (onCancelReply) onCancelReply();
      } else {
        window.showToast("❌ Error al enviar el archivo.", "error");
      }
    } catch (err) {
      console.error("Upload error:", err);
      window.showToast("❌ Falló la subida del archivo.", "error");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return e(
    "div",
    {
      className:
        "border-t border-gray-200 dark:border-gray-800 bg-[#f0f2f5] dark:bg-gray-900 flex flex-col relative shrink-0",
    },
    [
      // Barra previa de respuesta a mensaje citado
      replyingTo &&
        e(
          "div",
          {
            key: "replying-preview-bar",
            className:
              "mx-2.5 mt-2 px-3 py-1.5 bg-white dark:bg-gray-800 border-l-4 border-[#008069] flex justify-between items-center text-xs text-gray-700 dark:text-gray-200 rounded shadow-2xs animate-fadeIn select-none",
          },
          [
            e("div", { className: "flex items-center gap-2 truncate min-w-0" }, [
              e("i", { className: "fas fa-reply text-[#008069] shrink-0 text-[11px]" }),
              e("span", { className: "font-bold text-[#008069] shrink-0" }, "Respondiendo a:"),
              e(
                "span",
                { className: "truncate italic font-medium text-gray-600 dark:text-gray-300" },
                replyingTo.text || (replyingTo.mediaUrl ? "[Foto/Archivo]" : "Mensaje"),
              ),
            ]),
            e(
              "button",
              {
                type: "button",
                onClick: onCancelReply,
                className:
                  "text-gray-400 hover:text-gray-700 dark:hover:text-white p-1 rounded-full shrink-0 cursor-pointer transition",
                title: "Cancelar respuesta",
                "aria-label": "Cancelar respuesta",
              },
              e("i", { className: "fas fa-times text-xs" }),
            ),
          ],
        ),

      // Fila inferior con controles de entrada
      e(
        "div",
        {
          key: "input-controls-row",
          className: "p-1.5 sm:p-2.5 flex gap-1.5 sm:gap-2 items-end",
        },
        [
      // Selector flotante de emojis
      showEmojis &&
        e(
          "div",
          {
            key: "emoji-picker",
            className:
              "absolute bottom-20 left-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl rounded-2xl p-2.5 flex flex-wrap gap-2 w-64 z-50 animate-fadeIn",
          },
          EMOJIS.map((emoji) =>
            e(
              "button",
              {
                key: emoji,
                type: "button",
                onClick: () => handleEmojiClick(emoji),
                className:
                  "cursor-pointer text-xl hover:bg-gray-100 dark:hover:bg-gray-700 p-1.5 rounded-lg transition active:scale-95 leading-none",
              },
              emoji,
            ),
          ),
        ),

      // Botón Emoji con icono Font Awesome
      e(
        "button",
        {
          key: "btn-emoji",
          type: "button",
          "aria-label": "Insertar emojis",
          className:
            "w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-[#008069] dark:hover:text-emerald-400 transition cursor-pointer self-end mb-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 active:scale-95 shrink-0",
          onClick: () => setShowEmojis(!showEmojis),
        },
        e("i", { className: "far fa-smile text-lg sm:text-xl", "aria-hidden": "true" }),
      ),

      // Botón Adjuntar Archivo con icono Font Awesome
      e(
        "button",
        {
          key: "btn-attach",
          type: "button",
          "aria-label": "Adjuntar archivo o imagen",
          className: `w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center ${
            isUploading ? "text-[#008069] fa-beat" : "text-gray-500 dark:text-gray-400"
          } hover:text-[#008069] dark:hover:text-emerald-400 transition cursor-pointer self-end mb-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 active:scale-95 shrink-0`,
          onClick: handleAttachClick,
        },
        e("i", { className: "fas fa-paperclip text-base sm:text-lg", "aria-hidden": "true" }),
      ),

      // Input oculto para carga de archivos
      e("input", {
        key: "hidden-file-input",
        type: "file",
        ref: fileInputRef,
        className: "hidden",
        onChange: handleFileChange,
        accept: "image/*,application/pdf",
      }),

      // Textarea Principal (rows=3, min-h=[70px] mobile / [64px] desktop, max-h=[140px])
      e("textarea", {
        key: "input-field",
        ref: textAreaRef,
        value: inputText,
        onChange: (ev) => setInputText(ev.target.value),
        onKeyDown: (ev) => {
          if (ev.key === "Enter" && !ev.shiftKey) {
            ev.preventDefault();
            handleSend();
          }
        },
        placeholder: "Escribe un mensaje...",
        rows: 3,
        "aria-label": "Escribe un mensaje",
        className:
          "flex-1 min-h-[70px] sm:min-h-[64px] max-h-[140px] py-2 px-3 bg-white dark:bg-gray-800 rounded-xl text-sm sm:text-[15px] text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-[#008069] dark:focus:ring-emerald-500 border border-gray-200 dark:border-gray-700 resize-none overflow-y-auto leading-relaxed transition shadow-2xs",
      }),

      // Botón Enviar Mensaje
      e(
        "button",
        {
          key: "btn-send",
          type: "button",
          "aria-label": "Enviar mensaje",
          onClick: handleSend,
          disabled: !inputText.trim() && !isUploading,
          className:
            "bg-[#008069] hover:bg-[#006e59] text-white w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition shadow-xs active:scale-95 disabled:opacity-40 self-end mb-0.5 shrink-0 cursor-pointer focus:ring-2 focus:ring-[#008069]",
        },
        e("i", { className: "fas fa-paper-plane text-sm", "aria-hidden": "true" }),
      ),
    ]),
  ]);
};

export default WhatsAppInput;
