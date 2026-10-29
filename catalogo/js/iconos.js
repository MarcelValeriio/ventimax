/**
 * catalogo/js/iconos.js
 * Íconos de la tienda: los de Lucide (catalogo/js/lucide.js, generado con scripts/vendor-lucide.js), creados con
 * createElementNS. Sin insertar HTML como texto ni archivos externos, así que respetan la CSP. Un solo estilo para toda la tienda.
 */

import { LUCIDE } from "./lucide.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// Nombre que usa la tienda → ícono de Lucide
const NOMBRES = {
  carrito: "shopping-cart",
  buscar: "search",
  cerrar: "x",
  menos: "minus",
  mas: "plus",
  basura: "trash",
  anterior: "chevron-left",
  siguiente: "chevron-right",
  check: "check",
  listo: "circle-check",
  copiar: "copy",
  foto: "image",
  etiqueta: "tag",
  mensaje: "message-circle",
  camion: "truck",
  alerta: "circle-alert",
  caja: "package",
  ubicacion: "map-pin",
  gps: "locate-fixed",
  tienda: "store",
  enlace: "external-link",
  cargando: "loader-circle",
};

/**
 * Devuelve un <svg> decorativo (aria-hidden) con el ícono pedido. El nombre accesible lo pone el botón o enlace.
 * @param {string} nombre Clave de NOMBRES
 * @param {string} [clase] Clase CSS adicional
 */
export function icono(nombre, clase = "") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", `icono ${clase}`.trim());
  for (const [etiqueta, atributos] of LUCIDE[NOMBRES[nombre]] || []) {
    const figura = document.createElementNS(SVG_NS, etiqueta);
    for (const [clave, valor] of Object.entries(atributos)) figura.setAttribute(clave, valor);
    svg.appendChild(figura);
  }
  return svg;
}
