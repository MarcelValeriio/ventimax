/**
 * catalogo/js/app.js
 * Aplicación cliente del catálogo web (SPA con renderizado seguro).
 * Conforme a F2-3 y las reglas de seguridad [R1, R7, R11, R13]: todo dato se pinta con textContent
 * o creando elementos; el total que vale es el del servidor.
 */

import {
  cargarCarritoDesdeStorage,
  guardarCarritoEnStorage,
  limpiarCarritoEnStorage,
  agregarProducto,
  actualizarCantidad,
  eliminarProducto,
  obtenerTotalUnidades,
  armarCuerpoPedido,
  MAX_CANTIDAD_POR_LINEA,
} from "./carrito.js";

import {
  obtenerMarca,
  obtenerCatalogo,
  obtenerInfo,
  enviarPedidoWeb,
  resolverUrlRecurso,
  obtenerBaseUrl,
} from "./api.js";

import { el, limpiarElemento } from "./dom.js";

import { icono, iconoInstagram } from "./iconos.js";

import { debeMostrarAyuda, textoAyuda, armarEnlaceAyuda } from "./ayuda.js";

import { ajustarIndice, indiceDesdeScroll } from "./galeria.js";

import { entregaCompleta, armarEntrega, costoEntrega, enlaceMapa, usaGps, empresasDe, logoEmpresa, MAX_DIRECCION } from "./entrega.js";

/** Solo se abre un enlace de WhatsApp (wa.me); cualquier otra cosa que llegara de la API se ignora. */
function esEnlaceWhatsApp(url) {
  return typeof url === "string" && url.startsWith("https://wa.me/");
}

// Estado global de la aplicación
const state = {
  marca: null,
  catalogo: null,
  info: null,
  cargando: true,
  carrito: cargarCarritoDesdeStorage(),
  busqueda: "",
  categoriaActiva: "todas",
  orden: "relevancia",
  ultimoPedido: null,
  vista: "",
  // Entrega elegida en el carrito (F2c); se reinicia al crear el pedido
  entrega: { metodo: null, gps: null, direccion: "", empresa: "", estadoGps: "inactivo" },
};

const appRoot = document.getElementById("app-root");
const cartBadge = document.getElementById("cart-badge");
const brandTitle = document.getElementById("brand-title");
const brandLink = document.getElementById("brand-link");
const toastContainer = document.getElementById("toast-container");
const buscadorForm = document.getElementById("buscador");
const buscadorInput = document.getElementById("buscador-input");

/* ------------------------------------------------------------------------------------------------
 * Formatos
 * ---------------------------------------------------------------------------------------------- */

/**
 * Formatea un monto en dólares estadounidenses.
 */
function formatearUsd(monto) {
  const num = Math.round((Number(monto) || 0) * 100) / 100;
  // Mismo formato en toda la tienda: separadores venezolanos (igual que los bolívares) y sin ",00" en montos enteros
  const entero = Number.isInteger(num);
  return `$${num.toLocaleString("es-VE", { minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formatea un monto en bolívares.
 */
function formatearBs(monto) {
  if (monto === null || monto === undefined) return null;
  const num = Number(monto) || 0;
  return `Bs. ${num.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Precio en dólares con los centavos en alto, como lo lee el comprador en las tiendas que ya conoce.
 * Los lectores de pantalla reciben el monto completo en una sola lectura.
 */
function precioUsd(monto, clase = "") {
  const [entero, centavos] = (Number(monto) || 0).toFixed(2).split(".");
  return el(
    "span",
    { className: `precio ${clase}`.trim() },
    el("span", { className: "sr-only" }, formatearUsd(monto)),
    el(
      "span",
      { className: "precio-visual", "aria-hidden": "true" },
      el("span", { className: "precio-signo" }, "$"),
      Number(entero).toLocaleString("es-VE"),
      centavos !== "00" ? el("sup", { className: "precio-centavos" }, centavos) : null
    )
  );
}

/** Línea de referencia en bolívares; null si el BCV no respondió (la tienda sigue en dólares). */
function lineaBs(montoBs, clase = "") {
  const texto = formatearBs(montoBs);
  return texto ? el("span", { className: `precio-bs ${clase}`.trim() }, texto) : null;
}

/** Porcentaje de descuento del producto: entero de 0 a 90. Sin dato o inválido, 0. */
function pctDescuento(prod) {
  const pct = Math.round(Number(prod?.descuentoPct));
  return Number.isFinite(pct) && pct > 0 ? Math.min(pct, 90) : 0;
}

/** Precio anterior tachado; solo si hay descuento y el servidor envió el precio base. */
function precioAnteriorUsd(prod) {
  const antes = Number(prod?.precioAntesUsd);
  if (pctDescuento(prod) === 0 || !(antes > 0)) return null;
  return el("s", { className: "precio-antes" }, el("span", { className: "sr-only" }, "Antes: "), formatearUsd(antes));
}

/** Insignia "-X%" sobre la foto; null sin descuento. */
function insigniaDescuento(prod) {
  const pct = pctDescuento(prod);
  return pct > 0 ? el("span", { className: "insignia-descuento" }, `-${pct}%`) : null;
}

/** Cantidad de un producto que ya está en el pedido. */
function cantidadEnCarrito(productoId) {
  return state.carrito.find((i) => i.productoId === productoId)?.cantidad || 0;
}

function productosDelCatalogo() {
  return state.catalogo?.productos || [];
}

/* ------------------------------------------------------------------------------------------------
 * Avisos, contador y barra de pedido
 * ---------------------------------------------------------------------------------------------- */

/**
 * Notificaciones temporales en pantalla.
 */
function mostrarToast(mensaje) {
  if (!toastContainer) return;
  const toast = el("div", { className: "aviso" }, icono("check", "aviso-icono"), el("span", {}, mensaje));
  toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 2500);
}

/**
 * Actualiza el contador del carrito en el encabezado.
 */
function actualizarBadge() {
  if (!cartBadge) return;
  const total = obtenerTotalUnidades(state.carrito);
  cartBadge.textContent = String(total);
  cartBadge.classList.toggle("hidden", total === 0);
  document.getElementById("cart-btn")?.setAttribute("aria-label", total ? `Ver tu pedido, ${total} productos` : "Ver tu pedido");
}

/** Total orientativo del pedido con los precios del catálogo; el que vale lo calcula el servidor. */
function totalOrientativo() {
  return state.carrito.reduce((suma, item) => {
    const prod = productosDelCatalogo().find((p) => p.id === item.productoId);
    return suma + (prod ? prod.precioUsd * item.cantidad : 0);
  }, 0);
}

/**
 * Barra fija inferior "Ver pedido": aparece en el catálogo y en la ficha cuando hay algo en el pedido.
 * En el carrito y la confirmación no hace falta.
 */
let barraPedido = null;

function actualizarBarraPedido() {
  const unidades = obtenerTotalUnidades(state.carrito);
  const visible = unidades > 0 && (state.vista === "catalogo" || state.vista === "producto");
  if (!barraPedido) {
    barraPedido = el("a", { className: "barra-pedido hidden", href: "#/carrito" });
    document.body.appendChild(barraPedido);
  }
  limpiarElemento(barraPedido);
  const total = formatearUsd(totalOrientativo());
  barraPedido.setAttribute("aria-label", `Ver pedido: ${unidades === 1 ? "1 producto" : `${unidades} productos`}, ${total}`);
  barraPedido.append(
    el(
      "span",
      { className: "barra-pedido-resumen", "aria-hidden": "true" },
      el("span", { className: "barra-pedido-carrito" }, icono("carrito"), el("span", { className: "barra-pedido-cuenta" }, String(unidades))),
      el("span", { className: "barra-pedido-texto" }, unidades === 1 ? "1 producto" : `${unidades} productos`),
      el("span", { className: "barra-pedido-total" }, total)
    ),
    el("span", { className: "barra-pedido-accion", "aria-hidden": "true" }, "Ver pedido", icono("siguiente"))
  );
  barraPedido.classList.toggle("hidden", !visible);
  document.body.classList.toggle("con-barra", visible);
  // Con la barra abajo, la ayuda queda como un círculo a su lado, sin tapar productos
  if (visible) botonAyuda?.classList.add("ayuda-wa--compacto");
}

/** Guarda el pedido y refresca todo lo que lo muestra. */
function guardarPedido(nuevo) {
  state.carrito = nuevo;
  guardarCarritoEnStorage(state.carrito);
  actualizarBadge();
  actualizarBarraPedido();
}

/* ------------------------------------------------------------------------------------------------
 * Botón flotante de ayuda por WhatsApp
 * ---------------------------------------------------------------------------------------------- */

/**
 * Botón flotante "¿Dudas? Escríbenos" (WhatsApp). Se crea una vez si la marca trae número de ayuda;
 * en cada vista se actualiza el texto prellenado (el del producto que se mira) o se oculta
 * (carrito y confirmación ya tienen su propio botón de WhatsApp).
 */
let botonAyuda = null;

function crearBotonAyuda() {
  if (botonAyuda || !state.marca?.ayuda) return;
  const etiqueta = el("span", { className: "ayuda-wa-texto" }, "¿Dudas? Escríbenos");
  botonAyuda = el(
    "a",
    {
      className: "ayuda-wa",
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": "¿Dudas? Escríbenos por WhatsApp",
    },
    el("img", { className: "ayuda-wa-icono", src: "img/whatsapp.svg", alt: "", width: "28", height: "28" }),
    etiqueta
  );
  document.body.appendChild(botonAyuda);
  // La etiqueta se ve al llegar y después queda solo el ícono (vuelve a abrirse al pasar el mouse o con el teclado)
  setTimeout(() => botonAyuda && botonAyuda.classList.add("ayuda-wa--compacto"), 6000);
}

function actualizarBotonAyuda(nombreProducto) {
  if (!botonAyuda) return;
  const enlace = armarEnlaceAyuda(state.marca.ayuda.whatsapp, textoAyuda(state.marca.ayuda, nombreProducto));
  const visible = Boolean(enlace) && debeMostrarAyuda(window.location.hash || "#/");
  botonAyuda.classList.toggle("hidden", !visible);
  document.body.classList.toggle("con-ayuda", visible);
  if (enlace) botonAyuda.setAttribute("href", enlace);
}

/** Enlace "Preguntar por WhatsApp" de la ficha, con el producto en el mensaje. Null sin número de ayuda. */
function enlaceAyudaProducto(nombreProducto) {
  if (!state.marca?.ayuda) return null;
  return armarEnlaceAyuda(state.marca.ayuda.whatsapp, textoAyuda(state.marca.ayuda, nombreProducto)) || null;
}

/* ------------------------------------------------------------------------------------------------
 * Identidad de la marca
 * ---------------------------------------------------------------------------------------------- */

/**
 * Aplica la identidad visual recibida de la marca a la página.
 */
function aplicarIdentidadMarca(marca) {
  if (!marca) return;
  state.marca = marca;

  if (marca.brandName) {
    document.title = marca.brandName;
    if (brandTitle) brandTitle.textContent = marca.brandName;
    const pie = document.getElementById("footer-brand");
    if (pie) pie.textContent = marca.brandName;
  }

  const theme = marca.theme || {};
  if (theme.primaryColor) {
    document.documentElement.style.setProperty("--primary-color", theme.primaryColor);
  }
  if (theme.secondaryColor) {
    document.documentElement.style.setProperty("--secondary-color", theme.secondaryColor);
  }

  // El logo se crea solo cuando hay uno: un <img> sin src se vería como imagen rota mientras carga la marca
  const logoUrl = resolverUrlRecurso(theme.productBrandLogoUrl || theme.logoUrl);
  if (logoUrl && brandLink && !brandLink.querySelector(".marca-logo")) {
    const logo = el("img", { className: "marca-logo", src: logoUrl, alt: marca.brandName || "" });
    // Si el logo no carga, queda el nombre de la marca en texto
    logo.addEventListener("error", () => {
      logo.remove();
      brandTitle?.classList.remove("hidden");
    }, { once: true });
    brandLink.prepend(logo);
    brandTitle?.classList.add("hidden");
  }
}

/** Botón de Instagram del encabezado: solo aparece si el servidor envía un usuario y un enlace de instagram.com. */
function pintarInstagram(instagram) {
  const boton = document.getElementById("ig-btn");
  if (!boton || !instagram || typeof instagram.usuario !== "string" || typeof instagram.url !== "string") return;
  if (!instagram.url.startsWith("https://www.instagram.com/")) return;
  boton.setAttribute("href", instagram.url);
  boton.setAttribute("aria-label", `Instagram @${instagram.usuario}`);
  boton.setAttribute("title", `Síguenos en Instagram @${instagram.usuario}`);
  document.getElementById("ig-text").textContent = `@${instagram.usuario}`;
  const contenedor = document.getElementById("ig-icon");
  if (contenedor && !contenedor.firstChild) contenedor.appendChild(iconoInstagram());
  boton.classList.remove("hidden");
}

/** Íconos fijos del encabezado y enlace a la política de privacidad del servidor. */
function prepararMarco() {
  document.getElementById("cart-icon")?.appendChild(icono("carrito"));
  document.getElementById("buscador-icono")?.appendChild(icono("buscar"));
  const privacidad = document.getElementById("footer-privacy");
  const base = obtenerBaseUrl();
  if (privacidad && base) {
    privacidad.setAttribute("href", `${base}/privacidad`);
    privacidad.setAttribute("rel", "noopener");
    privacidad.classList.remove("hidden");
  }

  // "Saltar al contenido": mueve el foco sin tocar el hash (el enrutador lo tomaría como una ruta)
  document.querySelector(".saltar")?.addEventListener("click", (ev) => {
    ev.preventDefault();
    appRoot.focus();
  });

  // El buscador del encabezado filtra desde cualquier vista: si no estás en el catálogo, te lleva a él
  buscadorInput?.addEventListener("input", () => {
    state.busqueda = buscadorInput.value.toLowerCase().trim();
    if (state.vista !== "catalogo") {
      state.categoriaActiva = "todas";
      window.location.hash = "#/";
    } else {
      renderizarCatalogo();
    }
  });
  buscadorForm?.addEventListener("submit", (ev) => {
    ev.preventDefault();
    buscadorInput?.blur();
  });
}

/* ------------------------------------------------------------------------------------------------
 * Piezas comunes
 * ---------------------------------------------------------------------------------------------- */

/**
 * Foto de un producto. Si no tiene foto, o si la foto no carga (p. ej. se borró en Cloudinary), muestra un
 * recuadro neutro "Sin foto" en vez del ícono de imagen rota del navegador.
 */
function imagenProducto(url, alt, className, extra = {}) {
  const recuadroSinFoto = () =>
    el(
      "div",
      { className: `${className} img-sin-foto`, role: "img", "aria-label": `${alt} (sin foto)` },
      icono("foto", "img-sin-foto-icono"),
      el("span", { className: "img-sin-foto-texto" }, "Sin foto")
    );
  const src = resolverUrlRecurso(url);
  if (!src) return recuadroSinFoto();
  const img = el("img", { className, src, alt, decoding: "async", ...extra });
  img.addEventListener("error", () => img.replaceWith(recuadroSinFoto()), { once: true });
  return img;
}

/** Selector − n + reutilizable. Devuelve el contenedor; `alCambiar` recibe la cantidad nueva. */
function selectorCantidad(cantidad, alCambiar, { min = 1, etiqueta = "producto" } = {}) {
  return el(
    "div",
    { className: "cantidad", role: "group", "aria-label": `Cantidad de ${etiqueta}` },
    el(
      "button",
      {
        type: "button",
        className: "cantidad-boton",
        "aria-label": cantidad <= 1 && min === 0 ? `Quitar ${etiqueta}` : "Restar uno",
        disabled: cantidad <= min,
        onclick: () => alCambiar(cantidad - 1),
      },
      icono(cantidad <= 1 && min === 0 ? "basura" : "menos")
    ),
    el("output", { className: "cantidad-valor", "aria-live": "polite" }, String(cantidad)),
    el(
      "button",
      {
        type: "button",
        className: "cantidad-boton",
        "aria-label": "Sumar uno",
        disabled: cantidad >= MAX_CANTIDAD_POR_LINEA,
        onclick: () => alCambiar(cantidad + 1),
      },
      icono("mas")
    )
  );
}

/**
 * Botón de compra de la tarjeta: "Agregar" y, cuando ya está en el pedido, el selector de cantidad en su lugar.
 * Se redibuja solo, sin repintar la cuadrícula.
 */
function controlCompraTarjeta(prod) {
  const caja = el("div", { className: "tarjeta-compra" });
  const pintar = () => {
    limpiarElemento(caja);
    if (!prod.disponible) {
      caja.appendChild(el("button", { type: "button", className: "boton boton-bloque", disabled: true }, "Agotado"));
      return;
    }
    const enPedido = cantidadEnCarrito(prod.id);
    if (enPedido === 0) {
      caja.appendChild(
        el(
          "button",
          {
            type: "button",
            className: "boton boton-primario boton-bloque",
            "aria-label": `Agregar ${prod.nombre} al pedido`,
            onclick: () => {
              guardarPedido(agregarProducto(state.carrito, prod.id, 1));
              pintar();
              caja.querySelector(".cantidad-boton:last-child")?.focus();
            },
          },
          "Agregar"
        )
      );
      return;
    }
    caja.appendChild(
      selectorCantidad(
        enPedido,
        (n) => {
          guardarPedido(n <= 0 ? eliminarProducto(state.carrito, prod.id) : actualizarCantidad(state.carrito, prod.id, n));
          pintar();
        },
        { min: 0, etiqueta: prod.nombre }
      )
    );
  };
  pintar();
  return caja;
}

/** Siluetas grises mientras llega el catálogo, en vez de una pantalla en blanco. */
function siluetasCatalogo() {
  return el(
    "div",
    { className: "cuadricula", "aria-hidden": "true" },
    Array.from({ length: 6 }, () =>
      el(
        "div",
        { className: "tarjeta tarjeta-silueta" },
        el("div", { className: "tarjeta-foto" }),
        el("div", { className: "tarjeta-cuerpo" }, el("span", { className: "silueta silueta-texto" }), el("span", { className: "silueta silueta-precio" }), el("span", { className: "silueta silueta-boton" }))
      )
    )
  );
}

/** Estado vacío o de error con una acción clara. */
function estadoVacio(iconoNombre, titulo, texto, accion) {
  return el(
    "div",
    { className: "vacio" },
    icono(iconoNombre, "vacio-icono"),
    el("h2", { className: "vacio-titulo" }, titulo),
    texto ? el("p", { className: "vacio-texto" }, texto) : null,
    accion || null
  );
}

/* ------------------------------------------------------------------------------------------------
 * Vista: catálogo (inicio, categoría y búsqueda)
 * ---------------------------------------------------------------------------------------------- */

/**
 * Lista de items del cintillo (F2g). Usa `banner.items` del servidor; si no viene, arma un solo item
 * con los campos de primer nivel. Descarta lo que no tiene texto.
 */
function itemsCintillo(banner) {
  const origen = Array.isArray(banner?.items) && banner.items.length > 0 ? banner.items : [banner];
  return origen
    .map((it) => ({
      texto: typeof it?.texto === "string" ? it.texto.trim() : "",
      productoId: typeof it?.productoId === "string" && it.productoId ? it.productoId : null,
      descuentoPct: Math.min(pctDescuento({ descuentoPct: it?.descuentoPct }), 90),
    }))
    .filter((it) => it.texto);
}

/** Pastilla "-X%" del item, salvo que el texto ya diga el porcentaje (p. ej. "20% OFF en …"). */
function pastillaCintillo(item) {
  if (!(item.descuentoPct > 0) || item.texto.includes(`${item.descuentoPct}%`)) return null;
  return el("span", { className: "cintillo-pastilla" }, `-${item.descuentoPct}%`);
}

/**
 * Cintillo de la tienda (F2g). Un solo item: banda fija como antes. Dos o más: cinta en movimiento.
 */
function crearCintillo(banner) {
  const items = itemsCintillo(banner);
  if (items.length === 0) return null;
  if (items.length === 1) return crearCintilloUnico(items[0]);
  return crearCintillaEnMovimiento(items);
}

/** Banda fija con un solo item: texto, pastilla de descuento y "Ver" si lleva a un producto. */
function crearCintilloUnico(item) {
  const partes = [
    icono("etiqueta", "cintillo-icono"),
    el("span", { className: "cintillo-texto" }, item.texto),
    pastillaCintillo(item),
  ];
  if (!item.productoId) return el("div", { className: "cintillo" }, partes);
  return el(
    "a",
    { className: "cintillo cintillo-enlace", href: `#/producto/${encodeURIComponent(item.productoId)}` },
    partes,
    el("span", { className: "cintillo-ver" }, "Ver", icono("siguiente", "cintillo-flecha"))
  );
}

/** Un item de la cinta. En la copia de repaso los enlaces salen del orden de tabulación (tabindex -1). */
function crearItemCintillo(item, repaso) {
  const partes = [
    icono("etiqueta", "cintillo-icono"),
    el("span", { className: "cintillo-texto" }, item.texto),
    pastillaCintillo(item),
  ];
  if (!item.productoId) return el("span", { className: "cintillo-item" }, partes);
  return el(
    "a",
    {
      className: "cintillo-item cintillo-item-enlace",
      href: `#/producto/${encodeURIComponent(item.productoId)}`,
      tabindex: repaso ? "-1" : null,
    },
    partes
  );
}

/**
 * Cinta en movimiento con todos los items. La pista lleva la lista dos veces para que el desplazamiento
 * sea continuo; la segunda copia se oculta a los lectores de pantalla. Se detiene con el ratón encima o el foco dentro.
 */
function crearCintillaEnMovimiento(items) {
  // Unos 7 s por item, con un mínimo de 20 s, para que se lean sin correr
  const duracion = Math.max(20, items.length * 7);
  const pista = el(
    "div",
    { className: "cintillo-pista" },
    el("div", { className: "cintillo-grupo" }, items.map((it) => crearItemCintillo(it, false))),
    el("div", { className: "cintillo-grupo", "aria-hidden": "true" }, items.map((it) => crearItemCintillo(it, true)))
  );
  pista.style.setProperty("--cintillo-duracion", `${duracion}s`);
  return el(
    "div",
    { className: "cintillo cintillo-cinta", role: "region", "aria-label": "Ofertas" },
    pista
  );
}

/** Cómo se compra aquí: lo que ninguna otra tienda puede decir con verdad, en tres pasos cortos. */
function pasosCompra() {
  const paso = (nombreIcono, titulo, texto) =>
    el("li", { className: "paso" }, el("span", { className: "paso-icono" }, icono(nombreIcono)), el("span", { className: "paso-texto" }, el("strong", {}, titulo), el("span", {}, texto)));
  return el(
    "section",
    { className: "pasos", "aria-label": "Cómo comprar" },
    el(
      "ol",
      { className: "pasos-lista" },
      paso("carrito", "Arma tu pedido", "Agrega lo que quieras aquí."),
      paso("etiqueta", "Recibe tu código", "Lo generamos con los precios del día."),
      paso("mensaje", "Confírmalo por WhatsApp", "Te atendemos al instante.")
    )
  );
}

function productosFiltrados() {
  const filtrados = productosDelCatalogo().filter((prod) => {
    if (state.categoriaActiva !== "todas") {
      const prodCats = Array.isArray(prod.categorias) ? prod.categorias : [];
      if (!prodCats.includes(state.categoriaActiva)) return false;
    }
    if (state.busqueda) {
      const nombre = (prod.nombre || "").toLowerCase();
      const desc = (prod.descripcion || "").toLowerCase();
      if (!nombre.includes(state.busqueda) && !desc.includes(state.busqueda)) return false;
    }
    return true;
  });
  if (state.orden === "menor") filtrados.sort((a, b) => a.precioUsd - b.precioUsd);
  if (state.orden === "mayor") filtrados.sort((a, b) => b.precioUsd - a.precioUsd);
  // Los agotados se ven, pero al final
  return filtrados.sort((a, b) => Number(b.disponible) - Number(a.disponible));
}

/**
 * Crea una tarjeta individual de producto para la grilla.
 */
function crearTarjetaProducto(prod) {
  const enlace = `#/producto/${encodeURIComponent(prod.id)}`;
  const imgUrl = Array.isArray(prod.imagenes) && prod.imagenes.length > 0 ? prod.imagenes[0] : "";

  const foto = el(
    "a",
    { className: "tarjeta-foto", href: enlace, tabindex: "-1", "aria-hidden": "true" },
    imagenProducto(imgUrl, prod.nombre, "tarjeta-imagen", { loading: "lazy" }),
    insigniaDescuento(prod),
    prod.disponible ? null : el("span", { className: "sello-agotado" }, "Agotado")
  );

  const nombresCategoria = (prod.categorias || [])
    .map((slug) => ((state.catalogo && state.catalogo.categorias) || []).find((c) => c.slug === slug))
    .filter(Boolean)
    .map((c) => c.nombre);

  const conDescuento = pctDescuento(prod) > 0;
  return el(
    "article",
    { className: ["tarjeta", prod.disponible ? "" : "tarjeta-agotada", conDescuento ? "tarjeta-descuento" : ""].filter(Boolean).join(" ") },
    foto,
    el(
      "div",
      { className: "tarjeta-cuerpo" },
      el("h3", { className: "tarjeta-nombre" }, el("a", { href: enlace }, prod.nombre)),
      nombresCategoria.length
        ? el("div", { className: "tarjeta-etiquetas" }, nombresCategoria.map((n) => el("span", { className: "etiqueta-categoria" }, n)))
        : null,
      el("div", { className: "tarjeta-precios" }, precioUsd(prod.precioUsd), precioAnteriorUsd(prod), lineaBs(prod.precioBs)),
      controlCompraTarjeta(prod)
    )
  );
}

/**
 * Banner lateral: imágenes verticales tipo anuncio que configura el negocio. Cada una enlaza a su producto si lo tiene.
 * Una imagen que no carga se quita para no dejar un hueco roto.
 */
function crearBannerLateral(imagenes) {
  if (!Array.isArray(imagenes) || imagenes.length === 0) return null;
  const items = imagenes
    .map((img) => {
      const src = resolverUrlRecurso(img && img.url);
      if (!src) return null;
      const conEnlace = typeof img.productoId === "string" && img.productoId !== "";
      const foto = el("img", { className: "banner-lateral-imagen", src, alt: "Promoción", loading: "lazy" });
      const contenido = conEnlace
        ? el("a", { className: "banner-lateral-enlace", href: `#/producto/${encodeURIComponent(img.productoId)}`, "aria-label": "Ver el producto de la promoción" }, foto)
        : foto;
      const li = el("li", { className: "banner-lateral-item" }, contenido);
      foto.addEventListener("error", () => li.remove(), { once: true });
      return li;
    })
    .filter(Boolean);
  if (items.length === 0) return null;
  return el("aside", { className: "banner-lateral", "aria-label": "Promociones" }, el("ul", { className: "banner-lateral-lista" }, items));
}

/**
 * Vista de Catálogo Principal / Filtrado por Categoría.
 */
function renderizarCatalogo() {
  limpiarElemento(appRoot);

  if (!state.catalogo) {
    if (state.cargando) {
      appRoot.appendChild(siluetasCatalogo());
      return;
    }
    appRoot.appendChild(
      estadoVacio(
        "alerta",
        "No pudimos cargar los productos",
        "Revisa tu conexión e inténtalo de nuevo.",
        el("button", { type: "button", className: "boton boton-primario", onclick: () => cargarDatos() }, "Reintentar")
      )
    );
    return;
  }

  const esInicio = state.categoriaActiva === "todas" && !state.busqueda;
  const categorias = state.catalogo.categorias || [];
  const categoria = categorias.find((c) => c.slug === state.categoriaActiva);

  // Cintillo promocional (F2g): debajo del buscador, antes de los pasos y las categorías
  const cintillo = crearCintillo(state.info?.banner);
  if (cintillo) appRoot.appendChild(cintillo);

  if (esInicio) appRoot.appendChild(pasosCompra());

  // Categorías: enlaces (son navegación), desplazables en el celular
  const pildora = (texto, href, activa) =>
    el("a", { className: "pildora", href, "aria-current": activa ? "page" : null }, texto);
  appRoot.appendChild(
    el(
      "nav",
      { className: "categorias", "aria-label": "Categorías" },
      pildora("Todo", "#/", state.categoriaActiva === "todas"),
      categorias.map((c) => pildora(c.nombre, `#/categoria/${encodeURIComponent(c.slug)}`, c.slug === state.categoriaActiva))
    )
  );

  // Enlace viejo a una categoría que ya no existe (la API oculta las categorías vacías)
  if (state.categoriaActiva !== "todas" && !categoria) {
    appRoot.appendChild(
      estadoVacio(
        "caja",
        "Esta categoría no está disponible",
        "Puede que ya no tenga productos. Mira el resto del catálogo.",
        el("a", { className: "boton boton-primario", href: "#/" }, "Ver todos los productos")
      )
    );
    return;
  }

  const lista = productosFiltrados();
  const titulo = state.busqueda
    ? `Resultados para “${buscadorInput?.value.trim() || state.busqueda}”`
    : categoria
      ? categoria.nombre
      : "Todos los productos";

  const selectorOrden = el(
    "select",
    {
      id: "orden",
      className: "orden-select",
      onchange: (ev) => {
        state.orden = ev.target.value;
        renderizarCatalogo();
      },
    },
    [
      ["relevancia", "Más relevantes"],
      ["menor", "Menor precio"],
      ["mayor", "Mayor precio"],
    ].map(([valor, texto]) => el("option", { value: valor, selected: state.orden === valor }, texto))
  );

  const principal = el("div", { className: "catalogo-principal" });
  principal.appendChild(
    el(
      "div",
      { className: "barra-listado" },
      el("h1", { className: "listado-titulo" }, titulo),
      el(
        "div",
        { className: "listado-fila" },
        el("p", { className: "listado-cuenta" }, lista.length === 1 ? "1 producto" : `${lista.length} productos`),
        el("div", { className: "orden" }, el("label", { for: "orden", className: "orden-etiqueta" }, "Ordenar por"), selectorOrden)
      )
    )
  );

  if (state.catalogo.tasa) {
    principal.appendChild(
      el(
        "p",
        { className: "nota-tasa" },
        `Precios en dólares. Referencia en bolívares a la tasa BCV${state.catalogo.fechaTasa ? ` del ${state.catalogo.fechaTasa}` : " del día"}: `,
        el("strong", {}, `${formatearBs(state.catalogo.tasa)} por dólar`)
      )
    );
  }

  if (lista.length === 0) {
    principal.appendChild(
      estadoVacio(
        "buscar",
        state.busqueda ? "No encontramos productos con esa búsqueda" : "Aún no hay productos en esta categoría",
        state.busqueda ? "Prueba con otra palabra o mira todo el catálogo." : null,
        el(
          "a",
          {
            className: "boton boton-secundario",
            href: "#/",
            onclick: () => {
              state.busqueda = "";
              if (buscadorInput) buscadorInput.value = "";
            },
          },
          "Ver todos los productos"
        )
      )
    );
  } else {
    principal.appendChild(el("div", { className: "cuadricula" }, lista.map(crearTarjetaProducto)));
  }

  // Banner lateral: columna de anuncios verticales a un lado en escritorio, carrusel arriba en el celular
  const banner = crearBannerLateral(state.info?.bannerLateral);
  appRoot.appendChild(banner ? el("div", { className: "catalogo-layout" }, banner, principal) : principal);

  if (esInicio) {
    seccionPreguntas = el("div", { className: "preguntas-hueco" });
    appRoot.appendChild(seccionPreguntas);
    pintarPreguntas();
  }
}

/* ------------------------------------------------------------------------------------------------
 * Preguntas frecuentes (inicio)
 * ---------------------------------------------------------------------------------------------- */

let seccionPreguntas = null;

function textoEnvio(envio) {
  const partes = [envio.descripcion].filter(Boolean);
  if (envio.aConvenir) partes.push("Costo a convenir.");
  else if (envio.costo === 0) partes.push("Sin costo.");
  else if (typeof envio.costo === "number") partes.push(`Costo: ${formatearUsd(envio.costo)}.`);
  if (envio.direccion) partes.push(`Dirección: ${envio.direccion}.`);
  if (envio.horario) partes.push(`Horario: ${envio.horario}.`);
  return partes.join(" ");
}

/**
 * Preguntas frecuentes: las que el dueño respondió en el panel y las que salen solas de lo configurado
 * (pagos, envíos, horario). Sin datos de /api/public/info, la sección no aparece.
 */
function pintarPreguntas() {
  if (!seccionPreguntas || !seccionPreguntas.isConnected) return;
  limpiarElemento(seccionPreguntas);
  const info = state.info;
  if (!info) return;

  const items = [];
  const agregar = (pregunta, ...respuesta) => items.push({ pregunta, respuesta });

  agregar(
    "¿Cómo funciona el pedido por WhatsApp?",
    el("p", {}, "Agregas los productos, tocas «Pedir por WhatsApp» y te damos un código. Al enviarlo, el asistente reconoce tu pedido con los precios del día y te guía con el envío y el pago.")
  );
  for (const p of info.preguntas || []) agregar(p.pregunta, el("p", {}, p.respuesta));
  if ((info.pagos || []).length) {
    agregar("¿Cómo puedo pagar?", el("p", {}, `Aceptamos ${info.pagos.join(", ")}. Los datos para pagar te los damos por WhatsApp al confirmar el pedido.`));
  }
  if ((info.envios || []).length) {
    agregar(
      "¿Hacen envíos?",
      el(
        "ul",
        { className: "pregunta-lista" },
        info.envios.map((e) => el("li", {}, el("strong", {}, e.nombre), textoEnvio(e) ? ` ${textoEnvio(e)}` : ""))
      )
    );
  }
  if (info.horario) agregar("¿Cuál es el horario de atención?", el("p", {}, info.horario));

  seccionPreguntas.appendChild(
    el(
      "section",
      { className: "preguntas", "aria-labelledby": "preguntas-titulo" },
      el("h2", { id: "preguntas-titulo", className: "preguntas-titulo" }, "Preguntas frecuentes"),
      el(
        "div",
        { className: "preguntas-lista" },
        items.map(({ pregunta, respuesta }) =>
          el(
            "details",
            { className: "pregunta" },
            el("summary", { className: "pregunta-resumen" }, el("span", {}, pregunta), icono("siguiente", "pregunta-flecha")),
            el("div", { className: "pregunta-respuesta" }, respuesta)
          )
        )
      )
    )
  );
}

/* ------------------------------------------------------------------------------------------------
 * Vista: ficha de producto
 * ---------------------------------------------------------------------------------------------- */

/**
 * Carrusel de fotos del producto. La tira usa scroll-snap, así que deslizar con el dedo o el trackpad es nativo;
 * las flechas, los puntos, las miniaturas y el teclado solo la desplazan. Con una sola foto no hay controles.
 */
function crearGaleriaProducto(prod) {
  const imagenes = Array.isArray(prod.imagenes) && prod.imagenes.length > 0 ? prod.imagenes : [""];
  const total = imagenes.length;
  let actual = 0;

  const tira = el(
    "div",
    { className: "carrusel-tira", tabindex: total > 1 ? "0" : null, "aria-label": total > 1 ? `Fotos de ${prod.nombre}` : null },
    imagenes.map((url, idx) =>
      el(
        "div",
        { className: "carrusel-slide", "aria-roledescription": "foto", "aria-label": `${idx + 1} de ${total}` },
        imagenProducto(url, `${prod.nombre}${total > 1 ? ` foto ${idx + 1}` : ""}`, "ficha-imagen", idx > 0 ? { loading: "lazy" } : {})
      )
    )
  );
  const visor = el("div", { className: "ficha-visor carrusel" }, tira);
  const insignia = insigniaDescuento(prod);
  if (insignia) visor.appendChild(insignia);
  if (!prod.disponible) visor.appendChild(el("span", { className: "sello-agotado" }, "Agotado"));
  const galeria = el("div", { className: "ficha-galeria" }, visor);
  if (total < 2) return galeria;

  const irA = (indice, suave = true) => {
    const i = ajustarIndice(indice, total);
    tira.scrollTo({ left: i * tira.clientWidth, behavior: suave ? "smooth" : "auto" });
  };

  const flechaAnterior = el(
    "button",
    { type: "button", className: "carrusel-flecha carrusel-flecha--anterior", "aria-label": "Foto anterior", onclick: () => irA(actual - 1) },
    icono("anterior")
  );
  const flechaSiguiente = el(
    "button",
    { type: "button", className: "carrusel-flecha carrusel-flecha--siguiente", "aria-label": "Foto siguiente", onclick: () => irA(actual + 1) },
    icono("siguiente")
  );
  const puntos = el(
    "div",
    { className: "carrusel-puntos" },
    imagenes.map((_, idx) =>
      el("button", { type: "button", className: "carrusel-punto", "aria-label": `Ver foto ${idx + 1}`, onclick: () => irA(idx) })
    )
  );
  visor.append(flechaAnterior, flechaSiguiente, puntos);

  const miniaturas = el(
    "div",
    { className: "ficha-miniaturas" },
    imagenes.map((url, idx) =>
      el(
        "button",
        { type: "button", className: "miniatura", "aria-label": `Ver foto ${idx + 1}`, onclick: () => irA(idx) },
        imagenProducto(url, "", "miniatura-imagen", { loading: "lazy" })
      )
    )
  );
  galeria.appendChild(miniaturas);

  const marcar = () => {
    flechaAnterior.disabled = actual === 0;
    flechaSiguiente.disabled = actual === total - 1;
    [...puntos.children].forEach((p, i) => p.setAttribute("aria-current", i === actual ? "true" : "false"));
    [...miniaturas.children].forEach((m, i) => m.classList.toggle("active", i === actual));
  };
  marcar();

  tira.addEventListener(
    "scroll",
    () => {
      const i = indiceDesdeScroll(tira.scrollLeft, tira.clientWidth, total);
      if (i !== actual) {
        actual = i;
        marcar();
      }
    },
    { passive: true }
  );

  tira.addEventListener("keydown", (ev) => {
    if (ev.key === "ArrowLeft") { ev.preventDefault(); irA(actual - 1); }
    if (ev.key === "ArrowRight") { ev.preventDefault(); irA(actual + 1); }
  });

  // Arrastre con el mouse en escritorio (el dedo y el trackpad ya deslizan solos)
  let arrastre = null;
  tira.addEventListener("pointerdown", (ev) => {
    if (ev.pointerType !== "mouse" || ev.button !== 0) return;
    arrastre = { x: ev.clientX, inicio: tira.scrollLeft, movio: false };
    tira.classList.add("arrastrando");
    tira.setPointerCapture(ev.pointerId);
  });
  tira.addEventListener("pointermove", (ev) => {
    if (!arrastre) return;
    const dx = ev.clientX - arrastre.x;
    if (Math.abs(dx) > 3) arrastre.movio = true;
    tira.scrollLeft = arrastre.inicio - dx;
  });
  const soltar = () => {
    if (!arrastre) return;
    const desde = Math.round(arrastre.inicio / tira.clientWidth);
    const dx = tira.scrollLeft - arrastre.inicio;
    arrastre = null;
    tira.classList.remove("arrastrando");
    // Basta con arrastrar un 15 % del ancho para pasar de foto
    const umbral = tira.clientWidth * 0.15;
    irA(dx > umbral ? desde + 1 : dx < -umbral ? desde - 1 : desde);
  };
  tira.addEventListener("pointerup", soltar);
  tira.addEventListener("pointercancel", soltar);
  tira.addEventListener("dragstart", (ev) => ev.preventDefault());

  // Si cambia el ancho (giro del celular), mantener la misma foto
  const alCambiarTamano = () => {
    if (!tira.isConnected) return window.removeEventListener("resize", alCambiarTamano);
    irA(actual, false);
  };
  window.addEventListener("resize", alCambiarTamano);
  return galeria;
}

/** La ficha viene como "18" (45,72 cm), 180 W, 3 aspas": cada parte separada por ", " es una característica. */
function caracteristicas(descripcion) {
  const partes = String(descripcion || "")
    .split(/,\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length < 2) return descripcion ? el("p", { className: "ficha-descripcion" }, descripcion) : null;
  return el("ul", { className: "ficha-caracteristicas" }, partes.map((p) => el("li", {}, icono("check", "ficha-check"), el("span", {}, p))));
}

/**
 * Vista de Detalle de Producto (#/producto/:id).
 */
function renderizarDetalleProducto(productoId) {
  limpiarElemento(appRoot);

  if (!state.catalogo) {
    renderizarCatalogo();
    return;
  }

  const prod = productosDelCatalogo().find((p) => p.id === productoId);
  if (!prod) {
    appRoot.appendChild(
      estadoVacio(
        "caja",
        "Este producto ya no está disponible",
        "Puede que lo hayamos retirado del catálogo.",
        el("a", { href: "#/", className: "boton boton-primario" }, "Ver el catálogo")
      )
    );
    return;
  }

  // Ruta de navegación: Inicio › categoría principal
  const categoria = (state.catalogo.categorias || []).find((c) => c.slug === (prod.categorias || [])[0]);
  appRoot.appendChild(
    el(
      "nav",
      { className: "migas", "aria-label": "Ruta" },
      el("a", { href: "#/" }, "Inicio"),
      categoria ? [icono("siguiente", "migas-separador"), el("a", { href: `#/categoria/${encodeURIComponent(categoria.slug)}` }, categoria.nombre)] : null
    )
  );

  // Galería: carrusel con deslizamiento (táctil, trackpad o arrastrando con el mouse), flechas, puntos y miniaturas
  const galleryEl = crearGaleriaProducto(prod);

  // Selector de cantidad
  let cantidadSeleccionada = 1;
  const cajaCantidad = el("div", { className: "ficha-cantidad-caja" });

  const addBtn = el(
    "button",
    {
      type: "button",
      className: "boton boton-primario boton-grande boton-bloque",
      disabled: !prod.disponible,
      onclick: () => {
        guardarPedido(agregarProducto(state.carrito, prod.id, cantidadSeleccionada));
        mostrarToast(cantidadSeleccionada === 1 ? "Agregado a tu pedido" : `${cantidadSeleccionada} agregados a tu pedido`);
        cantidadSeleccionada = 1;
        pintarCantidad();
        actualizarTextoAgregar();
      },
    },
    prod.disponible ? `Agregar al pedido (${cantidadSeleccionada})` : "Agotado"
  );

  // El texto del botón sigue a la cantidad elegida con + y −
  function actualizarTextoAgregar() {
    if (prod.disponible) addBtn.textContent = `Agregar al pedido (${cantidadSeleccionada})`;
  }

  function pintarCantidad() {
    limpiarElemento(cajaCantidad);
    cajaCantidad.appendChild(
      selectorCantidad(cantidadSeleccionada, (n) => {
        cantidadSeleccionada = Math.min(Math.max(n, 1), MAX_CANTIDAD_POR_LINEA);
        pintarCantidad();
        actualizarTextoAgregar();
      }, { etiqueta: prod.nombre })
    );
  }
  pintarCantidad();

  const enPedido = cantidadEnCarrito(prod.id);
  const ayuda = enlaceAyudaProducto(prod.nombre);
  const fechaTasa = state.catalogo.fechaTasa;

  const compra = el(
    "div",
    { className: pctDescuento(prod) > 0 ? "ficha-compra ficha-compra-descuento" : "ficha-compra" },
    el("h1", { className: "ficha-nombre" }, prod.nombre),
    el(
      "div",
      { className: "ficha-precios" },
      precioUsd(prod.precioUsd, "precio-grande"),
      precioAnteriorUsd(prod),
      prod.precioBs ? el("p", { className: "ficha-bs" }, formatearBs(prod.precioBs), fechaTasa ? el("span", {}, ` · tasa BCV del ${fechaTasa}`) : null) : null
    ),
    el(
      "p",
      { className: `ficha-disponibilidad ${prod.disponible ? "disponible" : "agotado"}` },
      prod.disponible ? "Disponible" : "Agotado por ahora"
    ),
    prod.disponible
      ? el("div", { className: "ficha-cantidad" }, el("span", { className: "ficha-cantidad-etiqueta" }, "Cantidad"), cajaCantidad)
      : null,
    addBtn,
    enPedido > 0 ? el("a", { className: "ficha-en-pedido", href: "#/carrito" }, `Ya tienes ${enPedido} en tu pedido · Ver pedido`) : null,
    ayuda
      ? el(
          "a",
          { className: "boton boton-secundario boton-bloque", href: ayuda, target: "_blank", rel: "noopener noreferrer" },
          icono("mensaje"),
          "Preguntar por WhatsApp"
        )
      : null
  );

  const detalle = caracteristicas(prod.descripcion);
  const envios = (state.info?.envios || []).map((e) => e.nombre);

  const info = el(
    "div",
    { className: "ficha-info" },
    detalle ? el("section", { className: "ficha-bloque" }, el("h2", { className: "ficha-subtitulo" }, "Características"), detalle) : null,
    envios.length
      ? el(
          "section",
          { className: "ficha-bloque" },
          el("h2", { className: "ficha-subtitulo" }, "Entrega"),
          el("p", { className: "ficha-entrega" }, icono("camion", "ficha-entrega-icono"), el("span", {}, `${envios.join(" · ")}. El costo y la fecha se acuerdan por WhatsApp.`))
        )
      : null
  );

  appRoot.appendChild(el("div", { className: "ficha" }, galleryEl, compra, info));
}

/* ------------------------------------------------------------------------------------------------
 * Vista: pedido (carrito)
 * ---------------------------------------------------------------------------------------------- */

/**
 * Vista de Carrito de Compras (#/carrito).
 */
function renderizarCarrito() {
  limpiarElemento(appRoot);

  if (!state.carrito || state.carrito.length === 0) {
    appRoot.appendChild(
      estadoVacio(
        "carrito",
        "Tu pedido está vacío",
        "Agrega productos desde el catálogo para armarlo.",
        el("a", { href: "#/", className: "boton boton-primario" }, "Ver productos")
      )
    );
    return;
  }

  const filas = el("ul", { className: "pedido-lineas" });

  for (const item of state.carrito) {
    const prod = productosDelCatalogo().find((p) => p.id === item.productoId);
    const nombre = prod ? prod.nombre : item.productoId;
    const precio = prod ? prod.precioUsd : 0;
    const imgUrl = prod && Array.isArray(prod.imagenes) && prod.imagenes[0] ? prod.imagenes[0] : "";

    const cambiar = (n) => {
      guardarPedido(n <= 0 ? eliminarProducto(state.carrito, item.productoId) : actualizarCantidad(state.carrito, item.productoId, n));
      renderizarCarrito();
    };

    filas.appendChild(
      el(
        "li",
        { className: "linea" },
        el("a", { className: "linea-foto", href: `#/producto/${encodeURIComponent(item.productoId)}`, tabindex: "-1", "aria-hidden": "true" }, imagenProducto(imgUrl, nombre, "linea-imagen")),
        el(
          "div",
          { className: "linea-info" },
          el("a", { className: "linea-nombre", href: `#/producto/${encodeURIComponent(item.productoId)}` }, nombre),
          el("span", { className: "linea-unitario" }, `${formatearUsd(precio)} c/u`),
          prod && !prod.disponible ? el("span", { className: "linea-aviso" }, "Agotado: quítalo para continuar") : null
        ),
        el(
          "div",
          { className: "linea-acciones" },
          selectorCantidad(item.cantidad, cambiar, { etiqueta: nombre }),
          el("span", { className: "linea-total" }, formatearUsd(precio * item.cantidad)),
          el(
            "button",
            { type: "button", className: "boton-icono", "aria-label": `Quitar ${nombre} del pedido`, onclick: () => cambiar(0) },
            icono("basura")
          )
        )
      )
    );
  }

  const subtotalUsd = totalOrientativo();
  const unidades = obtenerTotalUnidades(state.carrito);
  const hayAgotados = state.carrito.some((i) => productosDelCatalogo().find((p) => p.id === i.productoId)?.disponible === false);
  // Formas de entrega configuradas en el panel (F2c). Sin ellas, la entrega se acuerda por WhatsApp como antes
  const metodosEntrega = (state.info?.envios || []).filter((m) => m && m.id);
  const pideEntrega = metodosEntrega.length > 0;
  if (pideEntrega && state.entrega.metodo && !metodosEntrega.some((m) => m.id === state.entrega.metodo.id)) {
    state.entrega.metodo = null;
  }

  // Campo trampa (honeypot) estricto [R6][R9]: invisible para personas, presente para robots
  const honeypotInput = el("input", {
    type: "text",
    name: "website",
    id: "honeypot-website",
    value: "",
    tabindex: "-1",
    autocomplete: "off",
    className: "campo-trampa",
    "aria-hidden": "true",
  });

  // Caja de alertas para errores
  const alertBox = el("div", { className: "alerta hidden", role: "alert" });
  const pistaEntrega = el("p", { className: "resumen-pista hidden", id: "pista-entrega" });

  // Botón "Pedir por WhatsApp"
  const textoBoton = "Pedir por WhatsApp";
  const submitBtn = el(
    "button",
    {
      type: "button",
      className: "boton boton-whatsapp boton-grande boton-bloque",
      disabled: hayAgotados,
      "aria-describedby": "pista-entrega",
      onclick: async () => {
        alertBox.classList.add("hidden");
        submitBtn.disabled = true;
        submitBtn.setAttribute("aria-busy", "true");
        etiquetaBoton.textContent = "Preparando tu pedido…";

        const websiteVal = honeypotInput.value;
        const payload = armarCuerpoPedido(state.carrito, websiteVal, pideEntrega ? armarEntrega(state.entrega) : null);

        const res = await enviarPedidoWeb(payload);

        if (res.ok && res.data) {
          // Las cifras del servidor (las que valen) más la cantidad de productos, para la confirmación
          state.ultimoPedido = {
            ...res.data,
            unidades: obtenerTotalUnidades(state.carrito),
            entrega: pideEntrega && state.entrega.metodo ? { ...state.entrega.metodo } : null,
          };
          limpiarCarritoEnStorage();
          guardarPedido([]);
          state.entrega = { metodo: null, gps: null, direccion: "", empresa: "", estadoGps: "inactivo" };

          // Redirigir a vista de confirmación
          window.location.hash = `#/confirmacion/${encodeURIComponent(res.data.codigo)}`;

          // Intentar abrir WhatsApp en pestaña nueva
          if (res.data.enlaceWhatsApp) {
            try {
              if (esEnlaceWhatsApp(res.data.enlaceWhatsApp)) {
                window.open(res.data.enlaceWhatsApp, "_blank", "noopener");
              }
            } catch (_e) {
              // Popup bloqueado por navegador; el usuario dispone del botón "Abrir WhatsApp" en pantalla
            }
          }
        } else {
          submitBtn.removeAttribute("aria-busy");
          etiquetaBoton.textContent = textoBoton;
          alertBox.textContent = res.mensaje || "No pudimos preparar tu pedido. Inténtalo de nuevo.";
          alertBox.classList.remove("hidden");
          refrescarResumen();
        }
      },
    },
    el("img", { src: "img/whatsapp.svg", alt: "", width: "22", height: "22", className: "boton-wa-icono" })
  );
  const etiquetaBoton = el("span", {}, textoBoton);
  submitBtn.appendChild(etiquetaBoton);

  // Filas del resumen que cambian con la entrega elegida
  const valorEnvio = el("dd", {});
  const valorTotal = el("dd", {});

  function refrescarResumen() {
    const costo = pideEntrega ? costoEntrega(state.entrega.metodo) : { tipo: "pendiente", monto: 0 };
    valorEnvio.textContent =
      costo.tipo === "fijo"
        ? formatearUsd(costo.monto)
        : costo.tipo === "gratis"
          ? "Sin costo"
          : costo.tipo === "cobro_destino"
            ? "Cobro a destino"
          : costo.tipo === "a_convenir"
            ? "A convenir por WhatsApp"
            : pideEntrega
              ? "Elige cómo recibirlo"
              : "Se acuerda por WhatsApp";
    const total = subtotalUsd + costo.monto;
    limpiarElemento(valorTotal);
    valorTotal.append(precioUsd(total, "precio-grande"), state.catalogo?.tasa ? lineaBs(Math.round(total * state.catalogo.tasa * 100) / 100) : null);

    const lista = !pideEntrega || entregaCompleta(state.entrega);
    submitBtn.disabled = hayAgotados || !lista || submitBtn.getAttribute("aria-busy") === "true";
    const empresasMetodo = empresasDe(state.entrega.metodo);
    const faltaEmpresa = empresasMetodo.length > 0 && !empresasMetodo.includes(state.entrega.empresa);
    const pista =
      !pideEntrega || lista
        ? ""
        : !state.entrega.metodo
          ? "Elige cómo quieres recibir tu pedido."
          : faltaEmpresa
            ? "Elige la empresa de envío."
            : usaGps(state.entrega.metodo)
              ? "Indica tu ubicación o escribe la dirección de entrega."
              : "Completa los datos para el envío.";
    pistaEntrega.textContent = pista;
    pistaEntrega.classList.toggle("hidden", !pista);
  }

  const resumen = el(
    "aside",
    { className: "resumen", "aria-labelledby": "resumen-titulo" },
    el("h2", { id: "resumen-titulo", className: "resumen-titulo" }, "Resumen"),
    el(
      "dl",
      { className: "resumen-filas" },
      el("div", { className: "resumen-fila" }, el("dt", {}, unidades === 1 ? "1 producto" : `${unidades} productos`), el("dd", {}, formatearUsd(subtotalUsd))),
      el("div", { className: "resumen-fila" }, el("dt", {}, "Envío"), valorEnvio),
      el("div", { className: "resumen-fila resumen-total" }, el("dt", {}, "Total"), valorTotal)
    ),
    honeypotInput,
    alertBox,
    hayAgotados ? el("p", { className: "alerta" }, "Hay un producto agotado en tu pedido. Quítalo para poder pedir.") : null,
    submitBtn,
    pistaEntrega,
    el(
      "p",
      { className: "resumen-nota" },
      "Te daremos un código para enviar por WhatsApp. El asistente confirma el total con los precios del día y te ayuda con el pago."
    )
  );
  refrescarResumen();

  appRoot.appendChild(
    el(
      "div",
      { className: "pedido" },
      el(
        "div",
        { className: "pedido-principal" },
        el("div", { className: "pedido-cabecera" }, el("h1", { className: "listado-titulo" }, "Tu pedido"), el("a", { className: "enlace", href: "#/" }, "Seguir comprando")),
        filas,
        pideEntrega ? seccionEntrega(metodosEntrega, refrescarResumen) : null
      ),
      resumen
    )
  );
}

/* ------------------------------------------------------------------------------------------------
 * Entrega en el carrito (F2c): retiro, delivery con la ubicación del teléfono o dirección escrita
 * ---------------------------------------------------------------------------------------------- */

/** La ubicación del teléfono solo funciona en HTTPS (o localhost) y si el navegador la ofrece. */
function gpsDisponible() {
  return Boolean(window.isSecureContext && navigator.geolocation);
}

function textoCostoMetodo(metodo) {
  const costo = costoEntrega(metodo);
  if (costo.tipo === "cobro_destino") return "Cobro a destino";
  if (costo.tipo === "fijo") return formatearUsd(costo.monto);
  if (costo.tipo === "gratis") return "Sin costo";
  return "A convenir";
}

/**
 * "¿Cómo quieres recibirlo?": una opción por método activo del panel. Al elegir delivery aparecen "Usar mi
 * ubicación" y el campo de dirección; con retiro, la dirección y el horario del punto. `alCambiar` refresca
 * el resumen sin repintar el carrito (para no perder lo que se está escribiendo).
 */
function seccionEntrega(metodos, alCambiar) {
  const seccion = el("fieldset", { className: "entrega" }, el("legend", { className: "entrega-titulo" }, "¿Cómo quieres recibirlo?"));
  const detalle = el("div", { className: "entrega-detalle" });

  const opciones = metodos.map((m) => {
    const elegido = state.entrega.metodo?.id === m.id;
    const radio = el("input", {
      type: "radio",
      name: "entrega",
      value: m.id,
      className: "entrega-radio",
      checked: elegido,
      onchange: () => {
        state.entrega.metodo = m;
        [...seccion.querySelectorAll(".entrega-opcion")].forEach((o) => o.classList.toggle("activa", o.contains(radio)));
        pintarDetalle();
        alCambiar();
      },
    });
    return el(
      "label",
      { className: `entrega-opcion ${elegido ? "activa" : ""}`.trim() },
      radio,
      el("span", { className: "entrega-icono" }, icono(m.tipo === "retiro" ? "tienda" : "camion")),
      el(
        "span",
        { className: "entrega-texto" },
        el("strong", {}, m.nombre),
        m.descripcion ? el("span", { className: "entrega-descripcion" }, m.descripcion) : null
      ),
      el("span", { className: "entrega-costo" }, textoCostoMetodo(m))
    );
  });

  function campoDireccion(metodo) {
    const conGps = usaGps(metodo) && Boolean(state.entrega.gps);
    const etiqueta = conGps
      ? "Referencias para el repartidor (opcional)"
      : metodo.pideDatos || "Dirección de entrega y referencias";
    const id = "entrega-direccion";
    const area = el("textarea", {
      id,
      className: "entrega-campo",
      rows: "3",
      maxlength: String(MAX_DIRECCION),
      placeholder: conGps
        ? "Ej.: edificio azul, piso 3, apto 3-B"
        : usaGps(metodo)
          ? "Ej.: urbanización, calle, casa o edificio y un punto de referencia"
          : "Ej.: Carabobo, Valencia, oficina de la agencia más cercana",
      autocomplete: "street-address",
      oninput: (ev) => {
        state.entrega.direccion = ev.target.value;
        alCambiar();
      },
    });
    area.value = state.entrega.direccion || "";
    return el("div", { className: "entrega-grupo" }, el("label", { for: id, className: "entrega-etiqueta" }, etiqueta), area);
  }

  function bloqueGps() {
    if (!gpsDisponible()) return null;
    const { gps, estadoGps } = state.entrega;
    if (gps) {
      return el(
        "div",
        { className: "entrega-gps listo", role: "status" },
        el("span", { className: "entrega-gps-icono" }, icono("ubicacion")),
        el("span", { className: "entrega-gps-texto" }, el("strong", {}, "Ubicación lista"), el("span", {}, "La enviamos con tu pedido para el repartidor.")),
        el("a", { className: "enlace entrega-gps-ver", href: enlaceMapa(gps), target: "_blank", rel: "noopener noreferrer" }, "Ver", icono("enlace")),
        el(
          "button",
          {
            type: "button",
            className: "boton-icono",
            "aria-label": "Quitar la ubicación",
            onclick: () => {
              state.entrega.gps = null;
              state.entrega.estadoGps = "inactivo";
              pintarDetalle();
              alCambiar();
            },
          },
          icono("cerrar")
        )
      );
    }
    const buscando = estadoGps === "buscando";
    return el(
      "div",
      { className: "entrega-grupo" },
      el(
        "button",
        {
          type: "button",
          className: "boton boton-secundario boton-bloque",
          disabled: buscando,
          "aria-busy": buscando ? "true" : null,
          onclick: pedirUbicacion,
        },
        icono(buscando ? "cargando" : "gps", buscando ? "girando" : ""),
        buscando ? "Buscando tu ubicación…" : "Usar mi ubicación"
      ),
      estadoGps === "error"
        ? el("p", { className: "entrega-error", role: "alert" }, "No pudimos obtener tu ubicación. Revisa el permiso de ubicación del navegador o escribe la dirección.")
        : el("p", { className: "entrega-ayuda" }, "Recomendado si estás en el lugar de entrega: es lo más preciso.")
    );
  }

  function pedirUbicacion() {
    state.entrega.estadoGps = "buscando";
    pintarDetalle();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.entrega.gps = { latitud: pos.coords.latitude, longitud: pos.coords.longitude };
        state.entrega.estadoGps = "listo";
        pintarDetalle();
        alCambiar();
      },
      () => {
        state.entrega.estadoGps = "error";
        pintarDetalle();
        alCambiar();
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  /**
   * Tarjeta de una empresa: radio oculto (accesible) + logo + nombre. Sin logo, o si la imagen no carga, el nombre
   * queda en grande. Una sola selección (name="empresa-envio").
   */
  function tarjetaEmpresa(metodo, nombre) {
    const url = logoEmpresa(metodo, nombre);
    const elegida = state.entrega.empresa === nombre;
    const tarjeta = el(
      "label",
      { className: `entrega-empresa ${elegida ? "activa" : ""} ${url ? "" : "sin-logo"}`.trim() },
      el("input", {
        type: "radio",
        name: "empresa-envio",
        value: nombre,
        className: "entrega-radio",
        checked: elegida,
        onchange: (ev) => {
          state.entrega.empresa = nombre;
          [...ev.target.closest(".entrega-empresas-lista").querySelectorAll(".entrega-empresa")].forEach((c) =>
            c.classList.toggle("activa", c.contains(ev.target))
          );
          alCambiar();
        },
      }),
      url
        ? el("img", {
            className: "entrega-empresa-logo",
            src: url,
            alt: nombre,
            loading: "lazy",
            decoding: "async",
            // Si el logo no carga, la tarjeta queda solo con el nombre
            onerror: (ev) => {
              ev.currentTarget.remove();
              tarjeta.classList.add("sin-logo");
            },
          })
        : null,
      el("span", { className: "entrega-empresa-nombre" }, nombre)
    );
    return tarjeta;
  }

  function pintarDetalle() {
    limpiarElemento(detalle);
    const m = state.entrega.metodo;
    if (!m) return;
    // Los datos de la opción elegida van justo debajo de ella, no al final de la lista
    const activa = seccion.querySelector(".entrega-opcion.activa");
    if (activa && activa.nextSibling !== detalle) activa.after(detalle);
    if (m.tipo === "retiro") {
      detalle.appendChild(
        el(
          "div",
          { className: "entrega-retiro" },
          m.direccion ? el("p", {}, el("strong", {}, "Dirección: "), m.direccion) : null,
          m.horario ? el("p", {}, el("strong", {}, "Horario: "), m.horario) : null
        )
      );
      return;
    }
    // Envío nacional: una sola empresa, elegida de las que configuró el negocio (tarjeta con su logo)
    const empresas = empresasDe(m);
    if (empresas.length) {
      if (!empresas.includes(state.entrega.empresa)) state.entrega.empresa = "";
      detalle.appendChild(
        el(
          "fieldset",
          { className: "entrega-grupo entrega-empresas" },
          el("legend", { className: "entrega-etiqueta" }, "Empresa de envío"),
          el(
            "div",
            { className: "entrega-empresas-lista" },
            empresas.map((nombre) => tarjetaEmpresa(m, nombre))
          )
        )
      );
    }
    if (m.cobroADestino) {
      detalle.appendChild(
        el(
          "p",
          { className: "entrega-aviso" },
          icono("alerta"),
          el("span", {}, el("strong", {}, "Cobro a destino: "), "el costo del envío lo pagas al recibirlo o retirarlo en la agencia.")
        )
      );
    }

    // La ubicación del teléfono sirve para entregas en la ciudad; para envíos nacionales basta con los datos escritos
    if (usaGps(m)) {
      const gps = bloqueGps();
      if (gps) detalle.appendChild(gps);
    }
    detalle.appendChild(campoDireccion(m));
  }

  seccion.append(el("div", { className: "entrega-opciones" }, opciones, detalle));
  pintarDetalle();
  return seccion;
}

/* ------------------------------------------------------------------------------------------------
 * Vista: confirmación
 * ---------------------------------------------------------------------------------------------- */

function formatearFechaExpira(iso) {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toLocaleDateString("es-VE", { weekday: "long", day: "numeric", month: "long" });
}

/** Qué incluye el total de la confirmación según la entrega elegida en el carrito. */
function notaEntregaConfirmacion(entrega) {
  if (!entrega) return "Total con los precios de hoy. El envío se acuerda por WhatsApp.";
  const costo = costoEntrega(entrega);
  if (entrega.tipo === "retiro") return `Total con los precios de hoy. Retiro en ${entrega.nombre}.`;
  if (costo.tipo === "cobro_destino") return "Total con los precios de hoy. El envío es cobro a destino: lo pagas al recibirlo.";
  if (costo.tipo === "fijo") return `Total con los precios de hoy, con el envío (${entrega.nombre}) incluido.`;
  if (costo.tipo === "gratis") return `Total con los precios de hoy. ${entrega.nombre} sin costo.`;
  return `Total con los precios de hoy. El costo de ${entrega.nombre} se acuerda por WhatsApp.`;
}

/**
 * Vista de Confirmación de Pedido (#/confirmacion/:codigo).
 */
function renderizarConfirmacion(codigo) {
  limpiarElemento(appRoot);

  const orderData = state.ultimoPedido;
  const codigoMostrar = codigo || orderData?.codigo || "";
  const waLink = esEnlaceWhatsApp(orderData?.enlaceWhatsApp) ? orderData.enlaceWhatsApp : null;
  const vence = orderData?.expira ? formatearFechaExpira(orderData.expira) : null;

  const botonCopiar = el(
    "button",
    {
      type: "button",
      className: "boton boton-secundario",
      onclick: async () => {
        try {
          await navigator.clipboard.writeText(codigoMostrar);
          mostrarToast("Código copiado");
        } catch (_e) {
          mostrarToast(`Tu código: ${codigoMostrar}`);
        }
      },
    },
    icono("copiar"),
    "Copiar"
  );

  appRoot.appendChild(
    el(
      "div",
      { className: "confirmacion" },
      el("span", { className: "confirmacion-icono" }, icono("listo")),
      el("h1", { className: "confirmacion-titulo" }, "Tu pedido está listo"),
      el(
        "p",
        { className: "confirmacion-texto" },
        waLink
          ? "Te abrimos WhatsApp con tu código. Envía el mensaje y el asistente seguirá contigo. Si no se abrió, toca el botón."
          : "Escribe este código en nuestro chat de WhatsApp y el asistente seguirá contigo."
      ),
      el(
        "div",
        { className: "codigo" },
        el("span", { className: "codigo-etiqueta", id: "codigo-etiqueta" }, "Tu código de pedido"),
        el("span", { className: "codigo-valor", "aria-labelledby": "codigo-etiqueta" }, codigoMostrar),
        botonCopiar
      ),
      typeof orderData?.totalUsd === "number"
        ? el(
            "dl",
            { className: "confirmacion-total" },
            el(
              "div",
              { className: "resumen-fila" },
              el("dt", {}, orderData.unidades === 1 ? "1 producto" : `${orderData.unidades || ""} productos`.trim()),
              el("dd", {}, precioUsd(orderData.totalUsd), lineaBs(orderData.totalBs))
            ),
            el("p", { className: "confirmacion-total-nota" }, notaEntregaConfirmacion(orderData.entrega))
          )
        : null,
      vence ? el("p", { className: "confirmacion-vence" }, `Válido hasta el ${vence}.`) : null,
      waLink
        ? el(
            "a",
            { href: waLink, className: "boton boton-whatsapp boton-grande boton-bloque", target: "_blank", rel: "noopener noreferrer" },
            el("img", { src: "img/whatsapp.svg", alt: "", width: "22", height: "22", className: "boton-wa-icono" }),
            "Abrir WhatsApp"
          )
        : null,
      el("a", { href: "#/", className: "enlace confirmacion-volver" }, "Volver a la tienda")
    )
  );
}

/* ------------------------------------------------------------------------------------------------
 * Enrutador y arranque
 * ---------------------------------------------------------------------------------------------- */

/**
 * Enrutador principal de la aplicación.
 */
function enrutar() {
  const hash = window.location.hash || "#/";
  const vistaAnterior = state.vista;
  let productoEnVista = null;

  if (hash === "#/" || hash === "" || hash.startsWith("#/?")) {
    state.categoriaActiva = "todas";
    state.vista = "catalogo";
    renderizarCatalogo();
  } else if (hash.startsWith("#/categoria/")) {
    const slug = decodeURIComponent(hash.replace("#/categoria/", "")).split("?")[0];
    state.categoriaActiva = slug || "todas";
    state.vista = "catalogo";
    renderizarCatalogo();
  } else if (hash.startsWith("#/producto/")) {
    const pid = decodeURIComponent(hash.replace("#/producto/", "")).split("?")[0];
    productoEnVista = productosDelCatalogo().find((p) => p.id === pid)?.nombre || null;
    state.vista = "producto";
    renderizarDetalleProducto(pid);
  } else if (hash === "#/carrito") {
    state.vista = "carrito";
    renderizarCarrito();
  } else if (hash.startsWith("#/confirmacion/")) {
    const cod = decodeURIComponent(hash.replace("#/confirmacion/", "")).split("?")[0];
    state.vista = "confirmacion";
    renderizarConfirmacion(cod);
  } else {
    // Ruta desconocida: fallback al catálogo
    window.location.hash = "#/";
    return;
  }

  actualizarBotonAyuda(productoEnVista);
  actualizarBarraPedido();

  // Al cambiar de vista: arriba de la página y el foco en el contenido (salvo mientras se escribe en el buscador)
  if (document.activeElement !== buscadorInput) {
    window.scrollTo(0, 0);
    if (vistaAnterior && vistaAnterior !== state.vista) appRoot.focus({ preventScroll: true });
  }
}

/** Carga el catálogo (y, sin bloquear, las preguntas frecuentes). */
async function cargarDatos() {
  state.cargando = true;
  enrutar();
  state.catalogo = await obtenerCatalogo().catch((err) => {
    console.error("[Catálogo] No se pudo cargar el catálogo:", err);
    return null;
  });
  state.cargando = false;
  enrutar();

  if (state.catalogo && !state.info) {
    obtenerInfo()
      .then((info) => {
        state.info = info;
        pintarInstagram(info?.instagram);
        // El cintillo (F2g) llega con esta información: si el catálogo está en pantalla, se vuelve a pintar
        if (state.vista === "catalogo") renderizarCatalogo();
        else pintarPreguntas();
        // El carrito muestra las formas de entrega que llegan con esta información
        if (state.vista === "carrito") renderizarCarrito();
      })
      .catch((err) => console.warn("[Catálogo] No se pudo cargar la información de la tienda:", err));
  }
}

/**
 * Inicialización al cargar la página.
 */
async function iniciar() {
  prepararMarco();
  actualizarBadge();
  window.addEventListener("hashchange", enrutar);

  obtenerMarca()
    .then((marcaData) => {
      aplicarIdentidadMarca(marcaData);
      crearBotonAyuda();
      enrutar();
    })
    .catch((err) => console.warn("[Catálogo] No se pudo cargar la marca:", err));

  await cargarDatos();
}

// Arranque
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}
