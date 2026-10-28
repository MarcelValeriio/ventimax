/**
 * catalogo/js/dom.js
 * Utilidades seguras para construcción de nodos del DOM.
 * Cumple con R13 y la política estricta contra inyecciones XSS.
 */

/**
 * Crea un elemento del DOM de forma segura.
 * @param {string} tag Nombre de la etiqueta HTML
 * @param {Object} props Atributos, clases, datasets y event listeners
 * @param {Array<Node|string|number>} children Hijos a adjuntar
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const element = document.createElement(tag);

  if (props && typeof props === "object") {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) {
        continue;
      }

      if (key === "className" || key === "class") {
        element.className = String(value);
      } else if (key === "textContent" || key === "text") {
        element.textContent = String(value);
      } else if (key.startsWith("on") && typeof value === "function") {
        const eventName = key.slice(2).toLowerCase();
        element.addEventListener(eventName, value);
      } else if (key === "dataset" && typeof value === "object") {
        for (const [dKey, dVal] of Object.entries(value)) {
          if (dVal !== null && dVal !== undefined) {
            element.dataset[dKey] = String(dVal);
          }
        }
      } else if (key === "style" && typeof value === "object") {
        for (const [sKey, sVal] of Object.entries(value)) {
          element.style[sKey] = String(sVal);
        }
      } else if (key === "style" && typeof value === "string") {
        element.setAttribute("style", value);
      } else if (value === true) {
        element.setAttribute(key, "");
      } else {
        element.setAttribute(key, String(value));
      }
    }
  }

  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    if (child instanceof Node) {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(String(child)));
    }
  }

  return element;
}

/**
 * Limpia todos los nodos hijos de un elemento de forma segura.
 * @param {HTMLElement} element
 */
export function limpiarElemento(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}
