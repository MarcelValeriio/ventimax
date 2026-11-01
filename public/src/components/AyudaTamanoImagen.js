/**
 * public/src/components/AyudaTamanoImagen.js
 * Texto de ayuda que indica el tamaño recomendado de la imagen junto a cada campo de subida del panel.
 *
 * Uso: e(AyudaTamanoImagen, { medidas: "1000 × 1000 px (cuadrada)" })
 */
import React from "https://cdn.skypack.dev/react";

const e = React.createElement;

export function AyudaTamanoImagen({ medidas, detalle, className = "" }) {
  return e(
    "p",
    { className: `text-[11px] leading-snug text-gray-500 dark:text-gray-400 ${className}`.trim() },
    e("span", { className: "font-bold text-gray-600 dark:text-gray-300" }, "Tamaño recomendado: "),
    medidas,
    detalle ? ` · ${detalle}` : ""
  );
}
