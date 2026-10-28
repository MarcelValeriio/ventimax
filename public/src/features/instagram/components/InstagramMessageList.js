/**
 * public/src/features/instagram/components/InstagramMessageList.js
 * Área de mensajes con diseño e identidad visual de Instagram Direct
 * Diferenciado del verde/beige de WhatsApp con gradientes IG y fondo claro neutro
 */

import React, { useEffect } from "https://cdn.skypack.dev/react";

const e = React.createElement;

// Formateador simple de hora
const formatTime = (timestamp) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const getDateLabel = (timestamp) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  
  return d.toLocaleDateString("es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
};

// Formateador de texto con soporte simple para *negritas* e _itálicas_ y saltos de línea
const renderFormattedText = (text) => {
  if (!text) return "";
  const lines = text.split("\n");
  return lines.map((line, lIdx) => {
    // Reemplazos simples
    const parts = [];
    let remaining = line;
    let keyIdx = 0;

    // Procesar negrita y cursiva básica
    const regex = /(\*[^*]+\*|_[^_]+_)/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith("*") && token.endsWith("*")) {
        parts.push(
          e("strong", { key: `b-${lIdx}-${keyIdx++}`, className: "font-bold" }, token.slice(1, -1)),
        );
      } else if (token.startsWith("_") && token.endsWith("_")) {
        parts.push(
          e("em", { key: `i-${lIdx}-${keyIdx++}`, className: "italic opacity-90" }, token.slice(1, -1)),
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < line.length) {
      parts.push(line.substring(lastIndex));
    }

    return e(
      "span",
      { key: `line-${lIdx}`, className: "block" },
      parts.length > 0 ? parts : line,
    );
  });
};

const InstagramMessageList = ({
  messages = [],
  scrollRef,
  contactAvatar,
}) => {
  // Auto-scroll al final en cada actualización de mensajes
  useEffect(() => {
    if (scrollRef && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, scrollRef]);

  return e(
    "div",
    {
      ref: scrollRef,
      className:
        "flex-1 overflow-y-auto p-4 md:p-6 space-y-3.5 bg-[#f8f8f8] dark:bg-gray-900 transition-colors select-text",
    },
    [
      // Banner informativo de canal
      e(
        "div",
        {
          key: "ig-banner",
          className: "flex justify-center my-2",
        },
        e(
          "div",
          {
            className:
              "inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xs text-xs text-gray-500 dark:text-gray-400 font-medium",
          },
          [
            e("i", {
              key: "banner-icon",
              className:
                "fab fa-instagram text-transparent bg-clip-text bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] text-sm",
            }),
            e("span", { key: "banner-text" }, "Conversación de Instagram Direct"),
          ],
        ),
      ),

      // Lista de burbujas con etiquetas de fecha
      messages.reduce((acc, msg, idx) => {
        const msgDate = new Date(msg.timestamp).toDateString();
        const prevDate = idx > 0 ? new Date(messages[idx - 1].timestamp).toDateString() : null;

        // Inyectar etiqueta de fecha si cambió el día
        if (msgDate !== prevDate) {
          acc.push(
            e(
              "div",
              {
                key: `date-${msgDate}`,
                className: "flex justify-center my-4 relative z-10",
              },
              e(
                "span",
                {
                  className:
                    "text-[11px] font-medium px-3 py-1 bg-gray-200/60 dark:bg-gray-800/80 text-gray-500 dark:text-gray-400 rounded-lg shadow-sm",
                },
                getDateLabel(msg.timestamp)
              )
            )
          );
        }

        const isClient = (msg.direction || msg.direccion) === "cliente";
        
        acc.push(
          e(
            "div",
            {
              key: msg._id || `msg-${idx}`,
              className: `flex items-end gap-2 group relative ${isClient ? "justify-start" : "justify-end"}`,
            },
            [
              // Avatar pequeño para el cliente
              isClient &&
                e("img", {
                  key: "client-avatar",
                  src: contactAvatar || "https://api.dicebear.com/7.x/avataaars/svg?seed=ig",
                  alt: "Avatar",
                  className:
                    "w-7 h-7 rounded-full object-cover shrink-0 border border-gray-200 dark:border-gray-700 shadow-xs mb-1 hidden sm:block",
                }),
  
              // Burbuja de mensaje
              e(
                "div",
                {
                  key: "bubble",
                  className: `relative max-w-[85%] sm:max-w-[75%] md:max-w-[65%] px-4 py-2.5 rounded-2xl shadow-sm text-sm break-words leading-relaxed transition-all ${
                    isClient
                      ? "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200/90 dark:border-gray-700 rounded-bl-xs"
                      : "bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#E1306C] text-white rounded-br-xs shadow-md shadow-pink-500/10"
                  }`,
                },
                [
                  // Contenido multimedia (Audio o Imagen)
                  msg.mediaUrl && (msg.mediaType === "audio" || msg.tipo === "audio" || /\.(mp4|mp3|m4a|ogg|aac|wav)/i.test(msg.mediaUrl)) &&
                    e(
                      "div",
                      { key: "audio-wrap", className: "my-1.5" },
                      e("audio", {
                        key: "audio-player",
                        controls: true,
                        src: msg.mediaUrl,
                        className: "max-w-full h-8 sm:h-9 rounded-md accent-[#E1306C]",
                      }),
                    ),
  
                  msg.mediaUrl && (msg.mediaType === "image" || msg.tipo === "imagen" || /\.(jpg|jpeg|png|webp|gif)/i.test(msg.mediaUrl)) &&
                    e(
                      "div",
                      { key: "image-wrap", className: "my-1.5" },
                      e("img", {
                        key: "image-content",
                        src: msg.mediaUrl,
                        alt: "Foto de Instagram",
                        className: "max-w-full max-h-64 sm:max-h-72 rounded-xl object-cover cursor-pointer shadow-xs hover:opacity-95 active:scale-[0.99] transition-all border border-black/10 dark:border-white/10",
                        onClick: () => window.open(msg.mediaUrl, "_blank"),
                      }),
                    ),
  
                  // Texto formateado (si existe y no es placeholder redundante)
                  (() => {
                    const msgText = msg.text || msg.texto || "";
                    return msgText && !((msg.mediaUrl && (msgText === "[Foto]" || msgText === "[Foto recibida]" || msgText === "[Nota de voz]" || msgText === "[Nota de voz recibida]")))
                      ? e(
                          "div",
                          { key: "text-content", className: "whitespace-pre-wrap font-normal" },
                          renderFormattedText(msgText),
                        )
                      : null;
                  })(),
  
                  // Metadatos (Hora y estado)
                  e(
                    "div",
                    {
                      key: "meta-row",
                      className: `flex items-center justify-end gap-1 mt-1 text-[10px] ${
                        isClient
                          ? "text-gray-400 dark:text-gray-400"
                          : "text-white/80"
                      }`,
                    },
                    [
                      e("span", { key: "time" }, formatTime(msg.timestamp)),
                      !isClient &&
                        e("i", {
                          key: "status",
                          className: "fas fa-check-double text-[9px] text-white/90 ml-0.5",
                          title: "Entregado por Instagram Direct",
                        }),
                    ],
                  ),
                ],
              ),
            ],
          )
        );
        return acc;
      }, []),
    ],
  );
};

export default InstagramMessageList;
