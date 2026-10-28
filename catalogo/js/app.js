/**
 * catalogo/js/app.js
 * Aplicación cliente del catálogo web (SPA con renderizado seguro).
 * Conforme a F2-3 y las reglas de seguridad [R1, R7, R11, R13].
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
} from "./carrito.js";

import {
  obtenerMarca,
  obtenerCatalogo,
  enviarPedidoWeb,
  resolverUrlRecurso,
} from "./api.js";

import { el, limpiarElemento } from "./dom.js";

/** Solo se abre un enlace de WhatsApp (wa.me); cualquier otra cosa que llegara de la API se ignora. */
function esEnlaceWhatsApp(url) {
  return typeof url === "string" && url.startsWith("https://wa.me/");
}

// Estado global de la aplicación
const state = {
  marca: null,
  catalogo: null,
  carrito: cargarCarritoDesdeStorage(),
  busqueda: "",
  categoriaActiva: "todas",
  ultimoPedido: null,
};

const appRoot = document.getElementById("app-root");
const cartBadge = document.getElementById("cart-badge");
const brandTitle = document.getElementById("brand-title");
const brandLogo = document.getElementById("brand-logo");
const toastContainer = document.getElementById("toast-container");

/**
 * Notificaciones temporales en pantalla.
 */
function mostrarToast(mensaje) {
  if (!toastContainer) return;
  const toast = el("div", { className: "toast" }, "✓ ", mensaje);
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
}

/**
 * Formatea un monto en dólares estadounidenses.
 */
function formatearUsd(monto) {
  const num = Number(monto) || 0;
  return `$${num.toFixed(2)}`;
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
 * Aplica la identidad visual recibida de la marca a la página.
 */
function aplicarIdentidadMarca(marca) {
  if (!marca) return;
  state.marca = marca;

  if (marca.brandName) {
    document.title = marca.brandName;
    if (brandTitle) brandTitle.textContent = marca.brandName;
  }

  const theme = marca.theme || {};
  if (theme.primaryColor) {
    document.documentElement.style.setProperty("--primary-color", theme.primaryColor);
  }
  if (theme.secondaryColor) {
    document.documentElement.style.setProperty("--secondary-color", theme.secondaryColor);
  }

  const logoUrl = theme.productBrandLogoUrl || theme.logoUrl;
  if (logoUrl && brandLogo) {
    brandLogo.src = resolverUrlRecurso(logoUrl);
    brandLogo.classList.remove("hidden");
    if (brandTitle) brandTitle.classList.add("hidden");
  }
}

/**
 * Vista de Catálogo Principal / Filtrado por Categoría.
 */
function renderizarCatalogo() {
  limpiarElemento(appRoot);

  if (!state.catalogo) {
    appRoot.appendChild(el("div", { className: "empty-state" }, "Cargando catálogo..."));
    return;
  }

  const container = el("div", { className: "catalog-view" });

  // 1. Barra de Búsqueda y Filtros
  const searchInput = el("input", {
    type: "search",
    className: "search-input",
    placeholder: "Buscar productos...",
    value: state.busqueda,
    oninput: (e) => {
      state.busqueda = e.target.value.toLowerCase().trim();
      actualizarGrillaProductos();
    },
  });

  const searchWrap = el(
    "div",
    { className: "search-bar-wrap" },
    el("span", { className: "search-icon" }, "🔍"),
    searchInput
  );

  // Barra de Categorías
  const categoriesBar = el("div", { className: "categories-bar" });
  const pillTodas = el(
    "button",
    {
      type: "button",
      className: `category-pill ${state.categoriaActiva === "todas" ? "active" : ""}`,
      onclick: () => {
        state.categoriaActiva = "todas";
        window.location.hash = "#/";
      },
    },
    "Todas"
  );
  categoriesBar.appendChild(pillTodas);

  for (const cat of state.catalogo.categorias || []) {
    const isActiva = state.categoriaActiva === cat.slug;
    const pill = el(
      "button",
      {
        type: "button",
        className: `category-pill ${isActiva ? "active" : ""}`,
        onclick: () => {
          state.categoriaActiva = cat.slug;
          window.location.hash = `#/categoria/${encodeURIComponent(cat.slug)}`;
        },
      },
      cat.nombre
    );
    categoriesBar.appendChild(pill);
  }

  const controls = el("div", { className: "catalog-controls" }, searchWrap, categoriesBar);
  container.appendChild(controls);

  // 2. Aviso de Tasa Oficial
  if (state.catalogo.tasa) {
    const textoTasa = `Tasa del día: ${formatearBs(state.catalogo.tasa)} / USD${
      state.catalogo.fechaTasa ? ` (${state.catalogo.fechaTasa})` : ""
    }`;
    const rateNotice = el("div", { className: "rate-notice" }, "ℹ️ ", textoTasa);
    container.appendChild(rateNotice);
  }

  // 3. Contenedor de Grilla
  const gridContainer = el("div", { className: "products-grid" });
  container.appendChild(gridContainer);
  appRoot.appendChild(container);

  // Función interna para refrescar productos según filtros
  function actualizarGrillaProductos() {
    limpiarElemento(gridContainer);

    const filtrados = (state.catalogo.productos || []).filter((prod) => {
      // Filtro por categoría
      if (state.categoriaActiva !== "todas") {
        const prodCats = Array.isArray(prod.categorias) ? prod.categorias : [];
        if (!prodCats.includes(state.categoriaActiva)) {
          return false;
        }
      }

      // Filtro por búsqueda
      if (state.busqueda) {
        const nombre = (prod.nombre || "").toLowerCase();
        const desc = (prod.descripcion || "").toLowerCase();
        if (!nombre.includes(state.busqueda) && !desc.includes(state.busqueda)) {
          return false;
        }
      }

      return true;
    });

    if (filtrados.length === 0) {
      gridContainer.appendChild(
        el(
          "div",
          { className: "empty-state", style: { gridColumn: "1 / -1" } },
          el("div", { className: "empty-state-icon" }, "📦"),
          "No se encontraron productos disponibles."
        )
      );
      return;
    }

    for (const prod of filtrados) {
      const card = crearTarjetaProducto(prod);
      gridContainer.appendChild(card);
    }
  }

  actualizarGrillaProductos();
}

/**
 * Foto de un producto. Si no tiene foto, o si la foto no carga (p. ej. se borró en Cloudinary), muestra un
 * recuadro neutro "Sin foto" en vez del ícono de imagen rota del navegador.
 */
function imagenProducto(url, alt, className, extra = {}) {
  const recuadroSinFoto = () =>
    el(
      "div",
      { className: `${className} img-sin-foto`, role: "img", "aria-label": `${alt} (sin foto)` },
      el("span", { className: "img-sin-foto-icono" }, "📷"),
      el("span", { className: "img-sin-foto-texto" }, "Sin foto")
    );
  const src = resolverUrlRecurso(url);
  if (!src) return recuadroSinFoto();
  const img = el("img", { className, src, alt, ...extra });
  img.addEventListener("error", () => img.replaceWith(recuadroSinFoto()), { once: true });
  return img;
}

/**
 * Crea una tarjeta individual de producto para la grilla.
 */
function crearTarjetaProducto(prod) {
  const imgUrl =
    Array.isArray(prod.imagenes) && prod.imagenes.length > 0 ? prod.imagenes[0] : "";

  const imgEl = imagenProducto(imgUrl, prod.nombre, "product-card-img", { loading: "lazy" });

  const imgWrap = el(
    "div",
    {
      className: "product-card-img-wrap",
      onclick: () => {
        window.location.hash = `#/producto/${encodeURIComponent(prod.id)}`;
      },
    },
    imgEl
  );

  if (!prod.disponible) {
    imgWrap.appendChild(el("span", { className: "badge-agotado" }, "Agotado"));
  }

  const titleEl = el(
    "a",
    {
      className: "product-card-title",
      href: `#/producto/${encodeURIComponent(prod.id)}`,
    },
    prod.nombre
  );

  const descEl = el("p", { className: "product-card-desc" }, prod.descripcion || "");

  const pricesEl = el(
    "div",
    { className: "product-card-prices" },
    el("div", { className: "price-usd" }, formatearUsd(prod.precioUsd)),
    prod.precioBs ? el("div", { className: "price-bs" }, `Ref: ${formatearBs(prod.precioBs)}`) : null
  );

  const addBtn = el(
    "button",
    {
      type: "button",
      className: "btn btn-primary",
      disabled: !prod.disponible,
      onclick: () => {
        state.carrito = agregarProducto(state.carrito, prod.id, 1);
        guardarCarritoEnStorage(state.carrito);
        actualizarBadge();
        mostrarToast(`${prod.nombre} agregado`);
      },
    },
    prod.disponible ? "Agregar" : "Agotado"
  );

  const bodyEl = el(
    "div",
    { className: "product-card-body" },
    titleEl,
    descEl,
    pricesEl,
    addBtn
  );

  return el("div", { className: "product-card" }, imgWrap, bodyEl);
}

/**
 * Vista de Detalle de Producto (#/producto/:id).
 */
function renderizarDetalleProducto(productoId) {
  limpiarElemento(appRoot);

  const prod = (state.catalogo?.productos || []).find((p) => p.id === productoId);
  if (!prod) {
    const errorBox = el(
      "div",
      { className: "empty-state" },
      el("div", { className: "empty-state-icon" }, "❓"),
      el("p", {}, "El producto solicitado no fue encontrado o ya no está disponible."),
      el("a", { href: "#/", className: "btn btn-primary", style: { marginTop: "16px", maxWidth: "200px" } }, "Volver al catálogo")
    );
    appRoot.appendChild(errorBox);
    return;
  }

  const backLink = el(
    "a",
    { href: "#/", className: "back-link" },
    "← Volver al catálogo"
  );

  // Galería de imágenes
  const imagenes = Array.isArray(prod.imagenes) && prod.imagenes.length > 0 ? prod.imagenes : [""];
  let imgSeleccionada = imagenes[0];

  const mainImgWrap = el(
    "div",
    { className: "detail-main-img-wrap" },
    imagenProducto(imgSeleccionada, prod.nombre, "detail-main-img")
  );
  const thumbsWrap = el("div", { className: "detail-thumbs-wrap" });

  if (imagenes.length > 1) {
    imagenes.forEach((url, idx) => {
      const thumbImg = el("img", {
        src: resolverUrlRecurso(url),
        alt: `${prod.nombre} foto ${idx + 1}`,
      });
      const thumb = el(
        "div",
        {
          className: `detail-thumb ${url === imgSeleccionada ? "active" : ""}`,
          onclick: () => {
            imgSeleccionada = url;
            limpiarElemento(mainImgWrap);
            mainImgWrap.appendChild(imagenProducto(url, prod.nombre, "detail-main-img"));
            for (const t of thumbsWrap.children) t.classList.remove("active");
            thumb.classList.add("active");
          },
        },
        thumbImg
      );
      thumbsWrap.appendChild(thumb);
    });
  }

  const galleryEl = el("div", { className: "detail-gallery" }, mainImgWrap, thumbsWrap);

  // Información y acción
  const titleEl = el("h1", { className: "detail-title" }, prod.nombre);
  const descEl = el("p", { className: "detail-desc" }, prod.descripcion || "");

  const pricesEl = el(
    "div",
    { className: "detail-prices", style: { marginBottom: "20px" } },
    el("div", { className: "price-usd", style: { fontSize: "1.6rem" } }, formatearUsd(prod.precioUsd)),
    prod.precioBs ? el("div", { className: "price-bs", style: { fontSize: "0.95rem" } }, `Ref: ${formatearBs(prod.precioBs)}`) : null
  );

  // Selector de cantidad
  let cantidadSeleccionada = 1;
  const qtyInput = el("input", {
    type: "text",
    className: "qty-input",
    value: "1",
    readOnly: true,
  });

  const btnMinus = el(
    "button",
    {
      type: "button",
      className: "qty-btn",
      onclick: () => {
        if (cantidadSeleccionada > 1) {
          cantidadSeleccionada--;
          qtyInput.value = String(cantidadSeleccionada);
          actualizarTextoAgregar();
        }
      },
    },
    "-"
  );

  const btnPlus = el(
    "button",
    {
      type: "button",
      className: "qty-btn",
      onclick: () => {
        if (cantidadSeleccionada < 50) {
          cantidadSeleccionada++;
          qtyInput.value = String(cantidadSeleccionada);
          actualizarTextoAgregar();
        }
      },
    },
    "+"
  );

  const qtyControl = el("div", { className: "qty-control" }, btnMinus, qtyInput, btnPlus);
  const qtyRow = el("div", { className: "detail-qty-row" }, el("span", {}, "Cantidad:"), qtyControl);

  const addBtn = el(
    "button",
    {
      type: "button",
      className: "btn btn-primary",
      style: { maxWidth: "300px", padding: "14px" },
      disabled: !prod.disponible,
      onclick: () => {
        state.carrito = agregarProducto(state.carrito, prod.id, cantidadSeleccionada);
        guardarCarritoEnStorage(state.carrito);
        actualizarBadge();
        mostrarToast(`${prod.nombre} agregado`);
      },
    },
    prod.disponible ? `Agregar al carrito (${cantidadSeleccionada})` : "Agotado"
  );

  // El texto del botón sigue a la cantidad elegida con + y −
  function actualizarTextoAgregar() {
    if (prod.disponible) addBtn.textContent = `Agregar al carrito (${cantidadSeleccionada})`;
  }

  const infoEl = el(
    "div",
    { className: "detail-info" },
    titleEl,
    descEl,
    pricesEl,
    prod.disponible ? qtyRow : null,
    addBtn
  );

  const layout = el("div", { className: "product-detail-layout" }, galleryEl, infoEl);
  appRoot.appendChild(backLink);
  appRoot.appendChild(layout);
}

/**
 * Vista de Carrito de Compras (#/carrito).
 */
function renderizarCarrito() {
  limpiarElemento(appRoot);

  const backLink = el(
    "a",
    { href: "#/", className: "back-link" },
    "← Seguir explorando"
  );
  appRoot.appendChild(backLink);

  if (!state.carrito || state.carrito.length === 0) {
    const emptyBox = el(
      "div",
      { className: "empty-state" },
      el("div", { className: "empty-state-icon" }, "🛒"),
      el("h2", { style: { marginBottom: "8px" } }, "Tu carrito está vacío"),
      el("p", { style: { marginBottom: "16px" } }, "Agrega productos desde el catálogo para iniciar tu pedido."),
      el("a", { href: "#/", className: "btn btn-primary", style: { maxWidth: "220px", margin: "0 auto" } }, "Ver productos")
    );
    appRoot.appendChild(emptyBox);
    return;
  }

  const layout = el("div", { className: "cart-layout" });
  layout.appendChild(el("h1", { style: { marginBottom: "20px", fontSize: "1.5rem" } }, "Tu Carrito"));

  const itemsList = el("div", { className: "cart-items-list" });
  let subtotalUsd = 0;

  for (const item of state.carrito) {
    const prod = (state.catalogo?.productos || []).find((p) => p.id === item.productoId);
    const nombre = prod ? prod.nombre : item.productoId;
    const precio = prod ? prod.precioUsd : 0;
    const itemTotal = precio * item.cantidad;
    subtotalUsd += itemTotal;

    const imgUrl = prod && Array.isArray(prod.imagenes) && prod.imagenes[0] ? prod.imagenes[0] : "";
    const thumbImg = imagenProducto(imgUrl, nombre, "cart-item-thumb");

    const info = el(
      "div",
      { className: "cart-item-info" },
      el("div", { className: "cart-item-title" }, nombre),
      el("div", { className: "cart-item-price" }, `${formatearUsd(precio)} c/u`)
    );

    // Controles de cantidad
    const qtyInput = el("input", {
      type: "text",
      className: "qty-input",
      value: String(item.cantidad),
      readOnly: true,
    });

    const btnMinus = el(
      "button",
      {
        type: "button",
        className: "qty-btn",
        onclick: () => {
          state.carrito = actualizarCantidad(state.carrito, item.productoId, item.cantidad - 1);
          guardarCarritoEnStorage(state.carrito);
          actualizarBadge();
          renderizarCarrito();
        },
      },
      "-"
    );

    const btnPlus = el(
      "button",
      {
        type: "button",
        className: "qty-btn",
        onclick: () => {
          state.carrito = actualizarCantidad(state.carrito, item.productoId, item.cantidad + 1);
          guardarCarritoEnStorage(state.carrito);
          actualizarBadge();
          renderizarCarrito();
        },
      },
      "+"
    );

    const btnDel = el(
      "button",
      {
        type: "button",
        className: "btn-del",
        title: "Eliminar producto",
        onclick: () => {
          state.carrito = eliminarProducto(state.carrito, item.productoId);
          guardarCarritoEnStorage(state.carrito);
          actualizarBadge();
          renderizarCarrito();
        },
      },
      "🗑"
    );

    const actions = el(
      "div",
      { className: "cart-item-actions" },
      el("div", { className: "qty-control" }, btnMinus, qtyInput, btnPlus),
      el("span", { style: { fontWeight: "700", minWidth: "60px", textAlign: "right" } }, formatearUsd(itemTotal)),
      btnDel
    );

    itemsList.appendChild(el("div", { className: "cart-item-row" }, thumbImg, info, actions));
  }

  layout.appendChild(itemsList);

  // Resumen del Carrito
  const summary = el("div", { className: "cart-summary" });

  const totalRowUsd = el(
    "div",
    { className: "cart-summary-row" },
    el("span", { className: "cart-summary-total" }, "Total estimado:"),
    el("span", { className: "cart-summary-total" }, formatearUsd(subtotalUsd))
  );
  summary.appendChild(totalRowUsd);

  if (state.catalogo?.tasa) {
    const totalBsEst = Math.round(subtotalUsd * state.catalogo.tasa * 100) / 100;
    const totalRowBs = el(
      "div",
      { className: "cart-summary-row", style: { color: "var(--text-muted)", fontSize: "0.9rem" } },
      el("span", {}, "Referencia en Bs:"),
      el("span", {}, formatearBs(totalBsEst))
    );
    summary.appendChild(totalRowBs);
  }

  const note = el(
    "p",
    { className: "cart-note" },
    "💡 Los precios finales y el costo de envío se confirmarán directamente en WhatsApp."
  );
  summary.appendChild(note);

  // Campo trampa (honeypot) estricto [R6][R9]
  const honeypotInput = el("input", {
    type: "text",
    name: "website",
    id: "honeypot-website",
    value: "",
    tabIndex: -1,
    autocomplete: "off",
    style: { display: "none !important", position: "absolute", left: "-9999px" },
    ariaHidden: "true",
  });
  summary.appendChild(honeypotInput);

  // Caja de alertas para errores
  const alertBox = el("div", { className: "alert-box alert-danger hidden" });
  summary.appendChild(alertBox);

  // Botón "Pedir por WhatsApp"
  const submitBtn = el(
    "button",
    {
      type: "button",
      className: "btn btn-whatsapp",
      onclick: async () => {
        alertBox.classList.add("hidden");
        submitBtn.disabled = true;
        const textoOriginal = submitBtn.textContent;
        submitBtn.textContent = "Procesando pedido...";

        const websiteVal = honeypotInput.value;
        const payload = armarCuerpoPedido(state.carrito, websiteVal);

        const res = await enviarPedidoWeb(payload);

        if (res.ok && res.data) {
          state.ultimoPedido = res.data;
          state.carrito = [];
          limpiarCarritoEnStorage();
          actualizarBadge();

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
          submitBtn.disabled = false;
          submitBtn.textContent = textoOriginal;
          alertBox.textContent = res.mensaje || "Error al procesar el pedido";
          alertBox.classList.remove("hidden");
        }
      },
    },
    "📱 Pedir por WhatsApp"
  );

  summary.appendChild(submitBtn);
  layout.appendChild(summary);
  appRoot.appendChild(layout);
}

/**
 * Vista de Confirmación de Pedido (#/confirmacion/:codigo).
 */
function renderizarConfirmacion(codigo) {
  limpiarElemento(appRoot);

  const orderData = state.ultimoPedido;
  const codigoMostrar = codigo || orderData?.codigo || "PENDIENTE";

  const icon = el("div", { className: "confirm-icon" }, "🎉");
  const headline = el("h1", { style: { fontSize: "1.6rem", marginBottom: "8px" } }, "¡Pedido Web Generado!");
  const instructions = el(
    "p",
    { style: { color: "var(--text-muted)", marginBottom: "20px" } },
    "Hemos preparado tu mensaje de confirmación para WhatsApp con el código de tu pedido. Si la aplicación no se abrió automáticamente, toca el botón de abajo."
  );

  const codeBox = el(
    "div",
    { className: "confirm-code-box" },
    el("span", {}, codigoMostrar),
    el(
      "button",
      {
        type: "button",
        className: "btn-copy",
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(codigoMostrar);
            mostrarToast("Código copiado al portapapeles");
          } catch (_e) {
            mostrarToast("Código: " + codigoMostrar);
          }
        },
      },
      "Copiar"
    )
  );

  const waLink = esEnlaceWhatsApp(orderData?.enlaceWhatsApp) ? orderData.enlaceWhatsApp : null;
  const waBtn = waLink
    ? el(
        "a",
        {
          href: waLink,
          className: "btn btn-whatsapp",
          style: { marginBottom: "16px" },
        },
        "📱 Abrir WhatsApp"
      )
    : null;

  const backCatalog = el(
    "a",
    {
      href: "#/",
      className: "btn btn-secondary",
    },
    "Volver a la tienda"
  );

  const card = el(
    "div",
    { className: "confirm-card" },
    icon,
    headline,
    instructions,
    codeBox,
    waBtn,
    backCatalog
  );

  appRoot.appendChild(card);
}

/**
 * Enrutador principal de la aplicación.
 */
function enrutar() {
  const hash = window.location.hash || "#/";

  if (hash === "#/" || hash === "" || hash.startsWith("#/?")) {
    state.categoriaActiva = "todas";
    renderizarCatalogo();
  } else if (hash.startsWith("#/categoria/")) {
    const slug = decodeURIComponent(hash.replace("#/categoria/", "")).split("?")[0];
    state.categoriaActiva = slug || "todas";
    renderizarCatalogo();
  } else if (hash.startsWith("#/producto/")) {
    const pid = decodeURIComponent(hash.replace("#/producto/", "")).split("?")[0];
    renderizarDetalleProducto(pid);
  } else if (hash === "#/carrito") {
    renderizarCarrito();
  } else if (hash.startsWith("#/confirmacion/")) {
    const cod = decodeURIComponent(hash.replace("#/confirmacion/", "")).split("?")[0];
    renderizarConfirmacion(cod);
  } else {
    // Ruta desconocida: fallback al catálogo
    window.location.hash = "#/";
  }
}

/**
 * Inicialización al cargar la página.
 */
async function iniciar() {
  actualizarBadge();
  window.addEventListener("hashchange", enrutar);

  try {
    // 1. Cargar marca y catálogo en paralelo
    const [marcaData, catalogoData] = await Promise.all([
      obtenerMarca().catch((err) => {
        console.warn("⚠️ No se pudo cargar marca:", err);
        return null;
      }),
      obtenerCatalogo().catch((err) => {
        console.error("❌ No se pudo cargar catálogo:", err);
        return null;
      }),
    ]);

    if (marcaData) {
      aplicarIdentidadMarca(marcaData);
    }
    state.catalogo = catalogoData;

    // 2. Renderizar ruta actual
    enrutar();
  } catch (err) {
    console.error("❌ Error inicializando catálogo:", err);
    limpiarElemento(appRoot);
    appRoot.appendChild(
      el(
        "div",
        { className: "empty-state" },
        el("div", { className: "empty-state-icon" }, "⚠️"),
        el("p", {}, "No fue posible cargar el catálogo en este momento. Por favor intenta recargar la página.")
      )
    );
  }
}

// Arranque
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", iniciar);
} else {
  iniciar();
}
