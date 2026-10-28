/**
 * catalogo/js/galeria.js
 * Cálculos del carrusel de fotos del producto, sin DOM (se prueban con Node).
 */

/** Limita un índice al rango [0, total - 1]. El carrusel no da la vuelta: en los extremos la flecha se desactiva. */
export function ajustarIndice(indice, total) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (n === 0) return 0;
  const i = Math.round(Number(indice) || 0);
  return Math.min(Math.max(i, 0), n - 1);
}

/** Foto visible a partir del desplazamiento horizontal de la tira (cada foto ocupa el ancho completo). */
export function indiceDesdeScroll(scrollLeft, ancho, total) {
  if (!ancho || ancho <= 0) return 0;
  return ajustarIndice(Math.abs(Number(scrollLeft) || 0) / ancho, total);
}
