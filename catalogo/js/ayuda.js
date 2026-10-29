/**
 * catalogo/js/ayuda.js
 * Botón flotante "¿Dudas? Escríbenos": lógica sin DOM, para poder probarla con Node.
 * El número y los textos salen de GET /api/public/marca (campo `ayuda`); sin número no hay botón.
 */

/**
 * Vistas donde el botón estorba: el carrito y la confirmación ya tienen su propio botón de WhatsApp, y la ficha
 * de producto tiene "Preguntar por WhatsApp" con el producto en el mensaje.
 */
export function debeMostrarAyuda(hash) {
  const h = typeof hash === "string" ? hash : "";
  return !(h === "#/carrito" || h.startsWith("#/carrito?") || h.startsWith("#/confirmacion/") || h.startsWith("#/producto/"));
}

/** Texto prellenado: el del producto que se está mirando o el general. */
export function textoAyuda(ayuda, nombreProducto) {
  if (!ayuda) return "";
  const general = typeof ayuda.texto === "string" ? ayuda.texto : "";
  const plantilla = typeof ayuda.textoProducto === "string" ? ayuda.textoProducto : "";
  if (nombreProducto && plantilla.includes("{{producto}}")) {
    return plantilla.split("{{producto}}").join(String(nombreProducto));
  }
  return general;
}

/** Enlace wa.me con el texto codificado. Devuelve "" si el número no es válido (el botón no se muestra). */
export function armarEnlaceAyuda(numero, texto) {
  const digitos = String(numero || "").replace(/\D/g, "");
  if (digitos.length < 10 || digitos.length > 15) return "";
  const t = typeof texto === "string" ? texto.trim() : "";
  return t ? `https://wa.me/${digitos}?text=${encodeURIComponent(t)}` : `https://wa.me/${digitos}`;
}
