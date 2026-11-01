/**
 * catalogo/js/slider.js
 * Lógica del carrusel de portada, sin manipulaciones de DOM (se prueba en Node.js).
 * Gobierna transiciones de índice, cálculo desde scroll y condiciones de autoavance.
 */

/**
 * Limita un índice al rango [0, total - 1].
 */
export function ajustarIndice(indice, total) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (n === 0) return 0;
  const i = Math.round(Number(indice) || 0);
  return Math.min(Math.max(i, 0), n - 1);
}

/**
 * Siguiente índice del slider.
 * @param {number} actual Índice vigente
 * @param {number} total Cantidad total de slides
 * @param {boolean} [darVuelta=true] Si da la vuelta al llegar al final
 */
export function siguienteIndice(actual, total, darVuelta = true) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (n <= 1) return 0;
  const i = ajustarIndice(actual, n);
  if (darVuelta) {
    return (i + 1) % n;
  }
  return Math.min(i + 1, n - 1);
}

/**
 * Anterior índice del slider.
 * @param {number} actual Índice vigente
 * @param {number} total Cantidad total de slides
 * @param {boolean} [darVuelta=true] Si da la vuelta al llegar al inicio
 */
export function anteriorIndice(actual, total, darVuelta = true) {
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (n <= 1) return 0;
  const i = ajustarIndice(actual, n);
  if (darVuelta) {
    return (i - 1 + n) % n;
  }
  return Math.max(i - 1, 0);
}

/**
 * Índice visible a partir del desplazamiento horizontal de la pista (scroll-snap).
 */
export function indiceDesdeScroll(scrollLeft, ancho, total) {
  if (!ancho || ancho <= 0) return 0;
  const n = Math.max(0, Math.floor(Number(total) || 0));
  if (n === 0) return 0;
  return ajustarIndice(Math.round(Math.abs(Number(scrollLeft) || 0) / ancho), n);
}

/**
 * Valida y acota los segundos de autoavance entre 3 y 15 (por defecto 6).
 */
export function validarSegundos(segundos) {
  const s = Math.round(Number(segundos) || 6);
  if (isNaN(s)) return 6;
  return Math.min(Math.max(s, 3), 15);
}

/**
 * Determina si el carrusel debe autoavanzar en el tick actual.
 */
export function debeAutoavanzar({ autoavance, total, pausado, prefersReducedMotion, pestanaOculta }) {
  if (autoavance !== true) return false;
  if (!total || total < 2) return false;
  if (pausado) return false;
  if (prefersReducedMotion) return false;
  if (pestanaOculta) return false;
  return true;
}

/**
 * Crea un controlador de estado para el slider de portada.
 */
export function crearControladorSlider({
  total = 0,
  autoavance = true,
  segundos = 6,
  darVuelta = true,
  onCambio = null,
} = {}) {
  let indice = 0;
  let pausado = false;
  let pestanaOculta = false;
  let prefersReducedMotion = false;
  let temporizador = null;

  const totalSlides = Math.max(0, Math.floor(Number(total) || 0));
  const intervaloMs = validarSegundos(segundos) * 1000;

  function notificar() {
    if (typeof onCambio === "function") {
      onCambio(indice);
    }
  }

  function tick() {
    if (debeAutoavanzar({ autoavance, total: totalSlides, pausado, prefersReducedMotion, pestanaOculta })) {
      siguiente();
    }
  }

  function iniciarTemporizador() {
    detenerTemporizador();
    if (autoavance && totalSlides >= 2) {
      temporizador = setInterval(tick, intervaloMs);
    }
  }

  function detenerTemporizador() {
    if (temporizador) {
      clearInterval(temporizador);
      temporizador = null;
    }
  }

  function irA(nuevoIndice) {
    const ajustado = ajustarIndice(nuevoIndice, totalSlides);
    if (ajustado !== indice) {
      indice = ajustado;
      notificar();
    }
    iniciarTemporizador();
    return indice;
  }

  function siguiente() {
    return irA(siguienteIndice(indice, totalSlides, darVuelta));
  }

  function anterior() {
    return irA(anteriorIndice(indice, totalSlides, darVuelta));
  }

  function pausar() {
    pausado = true;
  }

  function reanudar() {
    pausado = false;
    iniciarTemporizador();
  }

  function setPestanaOculta(oculta) {
    pestanaOculta = Boolean(oculta);
  }

  function setReducedMotion(reducido) {
    prefersReducedMotion = Boolean(reducido);
  }

  function destruir() {
    detenerTemporizador();
  }

  iniciarTemporizador();

  return {
    getIndice: () => indice,
    estaPausado: () => pausado,
    irA,
    siguiente,
    anterior,
    pausar,
    reanudar,
    setPestanaOculta,
    setReducedMotion,
    destruir,
  };
}
