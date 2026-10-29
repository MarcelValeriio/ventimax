/**
 * public/src/lib/iconoTexto.js
 * Devuelve el SVG de un ícono de Lucide (public/src/lib/lucide.js) como texto HTML, para los pocos sitios que
 * inyectan HTML con innerHTML (p. ej. el toast de public/src/boot/panel.js). En React usar Icono (components/Icono.js).
 * Los nombres que se pasan son constantes del código, nunca datos del usuario.
 */
import { LUCIDE } from "./lucide.js";

const escAtributo = (valor) => String(valor).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function iconoHtml(nombre, className = "") {
  const figuras = LUCIDE[nombre];
  if (!figuras) return "";
  const hijos = figuras
    .map(([etiqueta, atributos]) => {
      const attrs = Object.entries(atributos).map(([k, v]) => `${k}="${escAtributo(v)}"`).join(" ");
      return `<${etiqueta} ${attrs}/>`;
    })
    .join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ` +
    `focusable="false" class="icono-svg ${escAtributo(className)}" ` +
    `style="display:inline-block;vertical-align:-0.125em;flex-shrink:0">${hijos}</svg>`
  );
}
