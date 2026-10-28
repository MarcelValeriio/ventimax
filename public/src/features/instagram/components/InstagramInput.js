/**
 * public/src/features/instagram/components/InstagramInput.js
 * Barra de entrada de texto para Instagram Direct
 * Estilo visual limpio y moderno con botón de envío en gradiente de marca
 */

import React, { useRef, useEffect } from "https://cdn.skypack.dev/react";

const e = React.createElement;

const InstagramInput = ({
  inputText = "",
  setInputText,
  onSend,
  onSendImage,
}) => {
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleSubmit = (ev) => {
    if (ev) ev.preventDefault();
    if (!inputText.trim()) return;
    onSend(inputText.trim());
    setInputText("");
    if (inputRef.current) inputRef.current.focus();
  };

  const handleKeyDown = (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      handleSubmit();
    }
  };

  const handleFileChange = (ev) => {
    const file = ev.target.files?.[0];
    if (file) {
      if (onSendImage) {
        onSendImage(file);
      }
      ev.target.value = "";
    }
  };

  return e(
    "footer",
    {
      className:
        "bg-white dark:bg-gray-800/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700/80 shrink-0 z-10 transition-colors flex flex-col",
    },
    [
      e(
        "form",
        {
          key: "ig-form",
          onSubmit: handleSubmit,
          className: "flex items-end gap-1.5 sm:gap-2 max-w-5xl mx-auto w-full p-2 sm:p-3 md:p-4",
        },
        [
          // Input de archivo oculto
          e("input", {
            key: "file-input",
            ref: fileInputRef,
            type: "file",
            accept: "image/*",
            className: "hidden",
            onChange: handleFileChange,
          }),

          // Botón de adjuntar imagen
          e(
            "button",
            {
              key: "attach-btn",
              type: "button",
              onClick: () => fileInputRef.current && fileInputRef.current.click(),
              className:
                "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-[#E1306C] dark:hover:text-[#E1306C] hover:bg-pink-50 dark:hover:bg-gray-700/60 transition-colors active:scale-95 shrink-0 mb-0.5 cursor-pointer",
              title: "Adjuntar foto",
              "aria-label": "Adjuntar imagen",
            },
            e("i", { className: "far fa-image text-base sm:text-lg" }),
          ),

          // Campo de texto (3 líneas de alto con soporte responsive)
          e(
            "div",
            { key: "input-wrap", className: "flex-1 relative min-w-0" },
            e("textarea", {
              ref: inputRef,
              rows: 3,
              value: inputText,
              onChange: (e) => setInputText(e.target.value),
              onKeyDown: handleKeyDown,
              placeholder: "Escribe un mensaje en Instagram... (Enter para enviar, Shift+Enter para nueva línea)",
              className:
                "w-full bg-gray-100 dark:bg-gray-700/70 text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-400 text-xs sm:text-sm px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl border border-transparent focus:border-[#E1306C] focus:bg-white dark:focus:bg-gray-900 focus:outline-none transition-all shadow-inner resize-none leading-relaxed custom-scrollbar",
            }),
          ),

          // Botón Enviar con Gradiente Instagram
          e(
            "button",
            {
              key: "send-btn",
              type: "submit",
              disabled: !inputText.trim(),
              className: `w-10 h-10 rounded-full flex items-center justify-center transition-all shrink-0 mb-1 ${
                inputText.trim()
                  ? "bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4] text-white shadow-md shadow-pink-500/30 hover:opacity-95 active:scale-95 cursor-pointer"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed opacity-60"
              }`,
              title: "Enviar mensaje",
              "aria-label": "Enviar mensaje por Instagram",
            },
            e("i", { className: "fas fa-paper-plane text-sm" }),
          ),
        ],
      ),
    ],
  );
};

export default InstagramInput;
