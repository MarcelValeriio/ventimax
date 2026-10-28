// public/src/features/whatsapp/components/ImageLightboxModal.js
import React, { useState, useEffect, useRef } from "https://cdn.skypack.dev/react";
const e = React.createElement;

/**
 * ImageLightboxModal - Visor modal de imágenes integrado para el chat del SaaS.
 * 
 * Cumple con:
 * - Visor superpuesto adaptado a móvil y escritorio (max-w, max-h, object-contain).
 * - Botón de cerrar visible con aria-label="Cerrar imagen".
 * - Cierre con tecla Escape.
 * - Cierre al pulsar el fondo (backdrop) oscuro.
 * - Clic en la imagen NO cierra el visor (stopPropagation).
 * - Bloqueo de scroll del fondo (overflow hidden) mientras está abierto.
 * - Restauración accesible del foco al elemento disparador.
 * - Fallback accesible en caso de error al cargar la imagen.
 */
const ImageLightboxModal = ({
  isOpen,
  onClose,
  src,
  alt = "Imagen ampliada",
  caption = null,
  fileName = null,
  triggerRef = null,
}) => {
  const [hasError, setHasError] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);

  // Manejo de eventos de teclado (Escape) y bloqueo de scroll
  useEffect(() => {
    if (!isOpen) return;

    // Resetear estados al abrir
    setHasError(false);
    setZoomLevel(1);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Poner el foco en el botón de cerrar al abrir para accesibilidad
    const timer = setTimeout(() => {
      if (closeButtonRef.current) {
        closeButtonRef.current.focus();
      } else if (modalRef.current) {
        modalRef.current.focus();
      }
    }, 50);

    const handleKeyDown = (ev) => {
      if (ev.key === "Escape" || ev.keyCode === 27) {
        ev.preventDefault();
        ev.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);

      // Restaurar foco al elemento que abrió el visor
      if (triggerRef && triggerRef.current && typeof triggerRef.current.focus === "function") {
        setTimeout(() => triggerRef.current.focus(), 0);
      }
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen || !src) return null;

  const displayTitle = caption || fileName || alt;

  return e(
    "div",
    {
      ref: modalRef,
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Visor de imagen",
      tabIndex: -1,
      className:
        "fixed inset-0 z-[120] bg-black/90 backdrop-blur-xs flex flex-col items-center justify-between p-3 sm:p-6 select-none animate-fadeIn",
      onClick: (ev) => {
        // Cierre solo si se pulsa el backdrop
        if (ev.target === ev.currentTarget) {
          onClose();
        }
      },
    },
    [
      // Barra Superior (Título / Controles / Botón Cerrar)
      e(
        "div",
        {
          key: "lightbox-header",
          className:
            "w-full max-w-6xl flex items-center justify-between z-10 py-2 px-1 text-white gap-3",
          onClick: (ev) => ev.stopPropagation(),
        },
        [
          // Título o Nombre de Archivo
          e(
            "div",
            {
              className: "flex items-center gap-2 truncate pr-2",
            },
            [
              e("i", { className: "fas fa-image text-emerald-400 text-sm" }),
              e(
                "span",
                {
                  className: "text-xs sm:text-sm font-medium text-gray-200 truncate",
                  title: displayTitle,
                },
                displayTitle,
              ),
            ],
          ),

          // Botones de Acción (Zoom & Cerrar)
          e(
            "div",
            {
              className: "flex items-center gap-2 shrink-0",
            },
            [
              // Botón Zoom +
              e(
                "button",
                {
                  type: "button",
                  onClick: () => setZoomLevel((z) => Math.min(z + 0.5, 3)),
                  className:
                    "w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer text-xs",
                  title: "Aumentar zoom",
                  "aria-label": "Aumentar zoom",
                },
                e("i", { className: "fas fa-search-plus" }),
              ),
              // Botón Zoom -
              e(
                "button",
                {
                  type: "button",
                  onClick: () => setZoomLevel((z) => Math.max(z - 0.5, 1)),
                  className:
                    "w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer text-xs",
                  title: "Reducir zoom",
                  "aria-label": "Reducir zoom",
                },
                e("i", { className: "fas fa-search-minus" }),
              ),
              // Botón Reset Zoom (si tiene zoom)
              zoomLevel > 1 &&
                e(
                  "button",
                  {
                    type: "button",
                    onClick: () => setZoomLevel(1),
                    className:
                      "px-2 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer text-xs font-mono",
                    title: "Restablecer zoom",
                    "aria-label": "Restablecer zoom",
                  },
                  "1x",
                ),
              // Botón de Cerrar Visor (Obligatorio)
              e(
                "button",
                {
                  ref: closeButtonRef,
                  type: "button",
                  onClick: onClose,
                  "aria-label": "Cerrar imagen",
                  className:
                    "w-9 h-9 rounded-full bg-white/20 hover:bg-red-600 text-white flex items-center justify-center transition cursor-pointer ml-1 shadow-lg text-sm",
                  title: "Cerrar imagen (Escape)",
                },
                e("i", { className: "fas fa-times" }),
              ),
            ],
          ),
        ],
      ),

      // Área Central de Imagen (Centrada, responsiva y aislada de clic de cierre)
      e(
        "div",
        {
          key: "lightbox-body",
          className:
            "flex-1 w-full max-w-6xl flex items-center justify-center overflow-auto p-1 sm:p-4 my-auto relative",
          onClick: (ev) => {
            // Si hace clic en el área vacía del cuerpo, cerrar
            if (ev.target === ev.currentTarget) {
              onClose();
            }
          },
        },
        [
          !hasError
            ? e(
                "div",
                {
                  className: "relative max-w-full max-h-full flex items-center justify-center",
                  onClick: (ev) => ev.stopPropagation(), // Evitar que el clic en la imagen cierre el visor
                },
                [
                  e("img", {
                    src,
                    alt,
                    className:
                      "max-w-[92vw] max-h-[80vh] md:max-w-4xl md:max-h-[82vh] object-contain rounded-lg shadow-2xl transition-transform duration-200 cursor-default",
                    style: {
                      transform: `scale(${zoomLevel})`,
                      transformOrigin: "center center",
                    },
                    onError: () => setHasError(true),
                  }),
                ],
              )
            : e(
                "div",
                {
                  className:
                    "flex flex-col items-center justify-center p-8 bg-gray-900/90 text-gray-300 rounded-xl border border-gray-700 max-w-md text-center gap-3 shadow-2xl",
                  onClick: (ev) => ev.stopPropagation(),
                },
                [
                  e("i", {
                    className: "fas fa-exclamation-triangle text-amber-400 text-3xl",
                  }),
                  e(
                    "p",
                    { className: "text-sm font-medium text-white" },
                    "No se pudo cargar la imagen.",
                  ),
                  e(
                    "p",
                    { className: "text-xs text-gray-400" },
                    "Es posible que el enlace haya expirado o no esté disponible temporalmente.",
                  ),
                  e(
                    "button",
                    {
                      type: "button",
                      onClick: onClose,
                      className:
                        "mt-2 px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs transition cursor-pointer",
                    },
                    "Cerrar visor",
                  ),
                ],
              ),
        ],
      ),

      // Pie del Visor (Caption / Texto complementario si existe)
      caption &&
        e(
          "div",
          {
            key: "lightbox-footer",
            className: "w-full max-w-2xl py-2 px-4 text-center z-10",
            onClick: (ev) => ev.stopPropagation(),
          },
          [
            e(
              "div",
              {
                className:
                  "inline-block bg-black/60 border border-white/10 backdrop-blur-xs text-white text-xs sm:text-sm px-4 py-2 rounded-xl max-w-full shadow-lg text-left whitespace-pre-wrap break-words",
              },
              caption,
            ),
          ],
        ),
    ],
  );
};

export default ImageLightboxModal;
