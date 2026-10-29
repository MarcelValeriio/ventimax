import { Icono } from "../../../components/Icono.js";
// public/src/features/whatsapp/components/MessageBubble.js
import React, { useState, useRef } from "https://cdn.skypack.dev/react";
import ImageLightboxModal from "./ImageLightboxModal.js";
const e = React.createElement;

const getFileIconInfo = (name, mime) => {
  const ext = (name || "").split(".").pop().toLowerCase();
  const m = (mime || "").toLowerCase();

  if (ext === "pdf" || m.includes("pdf")) {
    return { icon: "file-text", color: "text-red-500", label: "PDF" };
  }
  if (
    ["doc", "docx", "rtf", "odt"].includes(ext) ||
    m.includes("word") ||
    m.includes("document")
  ) {
    return { icon: "file-text", color: "text-blue-500", label: "DOC" };
  }
  if (
    ["xls", "xlsx", "csv", "ods"].includes(ext) ||
    m.includes("sheet") ||
    m.includes("excel") ||
    m.includes("csv")
  ) {
    return { icon: "file-spreadsheet", color: "text-green-500", label: "XLS" };
  }
  if (
    ["zip", "rar", "7z", "tar", "gz"].includes(ext) ||
    m.includes("zip") ||
    m.includes("compressed")
  ) {
    return { icon: "file-archive", color: "text-amber-500", label: "ZIP" };
  }
  if (["txt", "md"].includes(ext) || m.includes("text/plain")) {
    return { icon: "file-text", color: "text-gray-500", label: "TXT" };
  }
  return { icon: "file", color: "text-gray-500", label: "ARCHIVO" };
};

const MessageBubble = ({
  text,
  caption,
  fileName,
  mediaUrl,
  timestamp,
  direction,
  mediaId,
  tipo,
  mimeType,
  status,
  onRetry,
  onReply,
  replyToText,
  replyToMid,
  wamid,
  _id,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const triggerRef = useRef(null);

  const isClient = direction === "cliente" || direction === "in";

  // Identificación de tipo de multimedia
  const mime = (mimeType || "").toLowerCase();
  const isAudio =
    tipo === "audio" || tipo === "voice" || mime.startsWith("audio/");
  const isImage =
    (tipo === "image" || tipo === "imagen" || mime.startsWith("image/")) &&
    !isAudio;
  const isDocument =
    tipo === "document" ||
    (!isImage &&
      !isAudio &&
      (mediaUrl ||
        fileName ||
        (mime && !mime.startsWith("image/") && !mime.startsWith("audio/"))));
  const isLocation = tipo === "location";

  // Resolución de URLs de origen
  const audioSrc = mediaUrl || (mediaId ? `/api/admin/audio/${mediaId}` : null);
  const imageSrc = mediaUrl || (mediaId ? `/api/admin/media/${mediaId}` : null);
  const docSrc = mediaUrl || (mediaId ? `/api/admin/media/${mediaId}` : null);

  // Nombre de archivo legible
  let displayFileName = fileName;
  if (!displayFileName && text && text.startsWith("[Archivo:")) {
    const match = text.match(/^\[Archivo:\s*([^\]]+)\]/i);
    if (match) displayFileName = match[1].trim();
  }
  if (!displayFileName) displayFileName = "Documento adjunto";

  // Manejo de caption y texto complementario
  let displayText = caption || null;
  if (!displayText && text) {
    if ((isImage || isDocument || isAudio) && text.startsWith("[Archivo:")) {
      const remainingCaption = text
        .replace(/^\[Archivo:\s*[^\]]+\]\s*/i, "")
        .trim();
      if (remainingCaption) displayText = remainingCaption;
    } else if (
      !isAudio ||
      (!text.includes("Nota de voz") && text.trim() !== "🎤 Nota de voz")
    ) {
      displayText = text;
    }
  }

  // Solo se puede citar si tiene un wamid válido de Meta (nunca Mongo ObjectId ni temp)
  const hasValidWamid = Boolean(
    wamid &&
    !String(wamid).startsWith("temp-") &&
    !/^[0-9a-fA-F]{24}$/.test(String(wamid)) &&
    (String(wamid).startsWith("wamid.") || String(wamid).length >= 15),
  );
  const canReply = Boolean(onReply && hasValidWamid);

  // Manejador para citar este mensaje
  const handleTriggerReply = (ev) => {
    if (ev) ev.stopPropagation();
    if (canReply) {
      onReply({
        wamid,
        text:
          displayText ||
          text ||
          (isImage ? "[Foto]" : isAudio ? "[Nota de voz]" : "[Archivo]"),
        mediaUrl,
        direction,
      });
    }
  };

  // Lógica de checkmarks / estado de entrega de WhatsApp
  const getStatusIcon = (msgStatus) => {
    if (isClient) return null;

    const s = (msgStatus || "sent").toLowerCase();

    if (s === "enviando" || s === "sending") {
      return e(
        "span",
        {
          className: "text-[#8696a0] text-[10px] ml-1 inline-flex items-center",
          title: "Enviando mensaje...",
        },
        e(Icono, { nombre: "clock", className: "text-xs" }),
      );
    }
    if (s === "read" || s === "visto") {
      return e(Icono, {
        nombre: "check-check", className: "text-[#53bdeb] text-[10px] ml-1 select-none",
        titulo: "Leído por el cliente",
      });
    }
    if (s === "delivered" || s === "entregado") {
      return e(Icono, {
        nombre: "check-check", className: "text-white text-[10px] ml-1 select-none drop-shadow-sm",
        titulo: "Entregado al dispositivo",
      });
    }
    if (s === "failed" || s === "error" || s === "fallido") {
      return e(
        "button",
        {
          type: "button",
          onClick: (ev) => {
            ev.stopPropagation();
            if (onRetry) onRetry(text || caption, _id, wamid);
          },
          "aria-label": "Reintentar mensaje",
          className:
            "text-red-600 hover:text-red-800 font-bold text-[10px] ml-1 bg-red-50 hover:bg-red-100 border border-red-200 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-pointer transition shadow-xs",
          title: "Error al enviar por WhatsApp. Clic para reintentar.",
        },
        [
          e(Icono, { nombre: "triangle-alert", className: "text-xs leading-none" }),
          e(
            "span",
            { className: "text-[9px] leading-none font-bold" },
            "Reintentar",
          ),
        ],
      );
    }

    // Default: 'sent' / 'enviado' (Entregado a los servidores de Meta)
    return e(Icono, {
      nombre: "check", className: "text-white text-[10px] ml-1 select-none drop-shadow-sm",
      titulo: "Enviado a Meta",
    });
  };

  const fileIconInfo = getFileIconInfo(displayFileName, mimeType);

  return e(
    "div",
    {
      className: `flex ${isClient ? "justify-start" : "justify-end"} mb-[4px] group relative items-center gap-1.5`,
      onDoubleClick: canReply ? handleTriggerReply : undefined,
    },
    [
      // Botón Responder (visible al pasar el cursor o en mobile si tiene wamid válido)
      canReply &&
        e(
          "button",
          {
            key: "reply-action-btn",
            type: "button",
            onClick: handleTriggerReply,
            className: `opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-gray-400 hover:text-[#008069] dark:hover:text-emerald-400 bg-white/90 dark:bg-gray-800/90 rounded-full shadow-xs text-xs cursor-pointer shrink-0 select-none ${
              isClient ? "order-last" : "order-first"
            }`,
            title: "Citar y responder",
            "aria-label": "Responder a este mensaje",
          },
          e(Icono, { nombre: "reply" }),
        ),
      e(
        "div",
        {
          key: "bubble-body",
          className: `max-w-[85%] md:max-w-[75%] px-[9px] py-[6px] pb-[8px] shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] relative ${
            isClient
              ? "bg-white text-[#111b21] rounded-[0_7.5px_7.5px_7.5px]"
              : "bg-[#dcf8c6] text-[#111b21] rounded-[7.5px_0_7.5px_7.5px]"
          }`,
        },
        [
          e("div", {
            key: "bubble-tail",
            className: isClient ? "wa-bubble-tail-in" : "wa-bubble-tail-out",
          }),

          // Previo de mensaje citado (Reply Context)
          replyToText &&
            e(
              "div",
              {
                key: "reply-preview-box",
                className:
                  "mb-1.5 p-1.5 px-2.5 rounded bg-black/5 dark:bg-black/20 border-l-4 border-[#008069] text-xs text-gray-700 dark:text-gray-300 truncate max-w-full flex items-center gap-1.5 select-none",
              },
              [
                e(Icono, {
                  nombre: "reply", className: "text-[10px] text-[#008069] dark:text-emerald-400 shrink-0",
                }),
                e(
                  "span",
                  { className: "truncate italic font-medium" },
                  replyToText,
                ),
              ],
            ),

          // 1. Reproductor de Audio Nativo
          isAudio &&
            audioSrc &&
            e(
              "div",
              {
                key: "audio-block",
                className: "my-1 w-full min-w-[240px] max-w-full",
              },
              [
                e(
                  "div",
                  {
                    className:
                      "flex items-center gap-2 mb-1 text-[11px] text-[#54656f] font-medium",
                  },
                  [
                    e(Icono, { nombre: "mic", className: "text-[#00a884]" }),
                    e("span", null, "Nota de voz"),
                  ],
                ),
                e(
                  "audio",
                  {
                    controls: true,
                    preload: "metadata",
                    className: "w-full h-9 rounded-md outline-none",
                    src: audioSrc,
                    "aria-label": "Reproductor de nota de voz",
                  },
                  [
                    e(
                      "p",
                      { className: "text-xs text-red-500" },
                      "Tu navegador no soporta el reproductor de audio.",
                    ),
                  ],
                ),
              ],
            ),

          // 2. Imagen / Vista previa con visor lightbox modal interno
          isImage &&
            imageSrc &&
            e("div", { key: "image-block", className: "my-1" }, [
              !imageError
                ? e(
                    "button",
                    {
                      type: "button",
                      ref: triggerRef,
                      onClick: (ev) => {
                        ev.stopPropagation();
                        setIsLightboxOpen(true);
                      },
                      className:
                        "p-0 bg-transparent border-0 text-left cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#00a884] rounded-lg block overflow-hidden max-w-full group",
                      "aria-label": `Ver imagen ampliada: ${displayFileName || caption || "Imagen adjunta"}`,
                    },
                    [
                      e("img", {
                        src: imageSrc,
                        alt: displayFileName || caption || "Imagen adjunta",
                        className:
                          "rounded-lg max-w-full max-h-72 object-contain shadow-xs group-hover:opacity-95 transition",
                        loading: "lazy",
                        onError: () => setImageError(true),
                      }),
                    ],
                  )
                : e(
                    "div",
                    {
                      className:
                        "flex items-center gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500",
                    },
                    [
                      e(Icono, {
                        nombre: "image", className: "text-gray-400 text-base",
                      }),
                      e("span", null, "No se pudo cargar la imagen."),
                    ],
                  ),

              // Visor interno lightbox (Modal superpuesto dentro del mismo SaaS)
              isLightboxOpen &&
                e(ImageLightboxModal, {
                  isOpen: isLightboxOpen,
                  onClose: () => setIsLightboxOpen(false),
                  src: imageSrc,
                  alt: displayFileName || caption || "Imagen adjunta",
                  caption: displayText,
                  fileName: displayFileName,
                  triggerRef,
                }),
            ]),

          // 3. Documento descargable / abrible
          isDocument &&
            docSrc &&
            e(
              "a",
              {
                key: "document-block",
                href: docSrc,
                target: "_blank",
                rel: "noopener noreferrer",
                download: displayFileName,
                className:
                  "flex items-center gap-3 p-2.5 my-1 bg-black/5 hover:bg-black/10 rounded-lg transition-colors border border-black/10 no-underline text-inherit cursor-pointer select-none group",
                "aria-label": `Descargar o abrir documento ${displayFileName}`,
              },
              [
                e(
                  "div",
                  {
                    className: `w-10 h-10 rounded-lg bg-white shadow-xs flex items-center justify-center shrink-0 ${fileIconInfo.color}`,
                  },
                  [e(Icono, { nombre: fileIconInfo.icon, className: "text-lg" })],
                ),
                e("div", { className: "flex-1 min-w-0 pr-2" }, [
                  e(
                    "p",
                    {
                      className:
                        "text-[13px] font-medium text-gray-900 truncate mb-0.5",
                      title: displayFileName,
                    },
                    displayFileName,
                  ),
                  e(
                    "span",
                    {
                      className:
                        "text-[10px] text-gray-500 uppercase font-semibold",
                    },
                    fileIconInfo.label,
                  ),
                ]),
                e(
                  "div",
                  {
                    className:
                      "text-gray-400 group-hover:text-gray-700 transition-colors p-1 shrink-0",
                    title: "Descargar",
                  },
                  [e(Icono, { nombre: "arrow-down", className: "text-xs" })],
                ),
              ],
            ),

          // 3.5. Ubicación
          isLocation &&
            e("div", { key: "location-block", className: "my-1" }, [
              e(
                "a",
                {
                  href: mediaUrl || "#",
                  target: "_blank",
                  rel: "noopener noreferrer",
                  className:
                    "flex items-center gap-2 bg-blue-50 dark:bg-blue-900/10 p-2 rounded-lg border border-blue-100 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors text-blue-600 dark:text-blue-800 no-underline",
                },
                [
                  e(
                    "div",
                    {
                      className:
                        "w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center shrink-0",
                    },
                    e(Icono, {
                      nombre: "map-pin", className: "text-blue-500 dark:text-blue-300",
                    }),
                  ),
                  e("div", { className: "flex flex-col" }, [
                    e(
                      "span",
                      { className: "text-[13px] font-bold" },
                      "Ubicación Compartida",
                    ),
                    e(
                      "span",
                      { className: "text-[11px] opacity-80" },
                      mediaUrl
                        ? "Toca para abrir en Google Maps"
                        : "Coordenadas no disponibles (Chat antiguo)",
                    ),
                  ]),
                ],
              ),
            ]),

          // 4. Texto del mensaje o Caption asociado
          displayText &&
            !isLocation &&
            e(
              "p",
              {
                key: "text-content",
                className:
                  "text-[14.2px] break-words leading-relaxed whitespace-pre-wrap mt-1",
              },
              displayText,
            ),

          // 5. Timestamp y Ticks
          e(
            "div",
            {
              key: "meta-footer",
              className:
                "text-[11px] mt-[2px] text-right text-[#667781] flex justify-end items-center gap-1 float-right ml-3 mt-2",
            },
            [
              new Date(timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              }),
              getStatusIcon(status),
            ],
          ),
        ],
      ),
    ],
  );
};

export default MessageBubble;
