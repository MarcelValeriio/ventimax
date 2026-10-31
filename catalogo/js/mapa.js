/**
 * catalogo/js/mapa.js
 * Selector de ubicación interactivo con mapa y pin central (F2d).
 * Permite buscar calles/zonas en Caracas o mover el pin para seleccionar el punto de entrega.
 * Sin inserción de texto HTML, compatible con CSP y responsive en móvil y escritorio.
 */

import { el } from "./dom.js";
import { icono } from "./iconos.js";
import { geocodificarCoordenadas, buscarDireccion } from "./api.js";

// Coordenadas por defecto (Caracas)
const COORD_DEFAULT = { lat: 10.491, lon: -66.885, zoom: 13 };

/**
 * Monta el selector de mapa dentro de un contenedor.
 * @param {HTMLElement} contenedor Elemento DOM donde se inyecta
 * @param {Object} opciones
 * @param {number} [opciones.latInicial]
 * @param {number} [opciones.lonInicial]
 * @param {Function} opciones.alSeleccionar Callback ({ latitud, longitud, direccion })
 */
export function montarSelectorMapa(contenedor, { latInicial, lonInicial, alSeleccionar }) {
  if (typeof window.L === "undefined") {
    console.warn("Leaflet no está disponible");
    return null;
  }

  const latCentro = Number.isFinite(latInicial) ? latInicial : COORD_DEFAULT.lat;
  const lonCentro = Number.isFinite(lonInicial) ? lonInicial : COORD_DEFAULT.lon;
  const zoomCentro = Number.isFinite(latInicial) ? 16 : COORD_DEFAULT.zoom;

  let timerGeocode = null;
  let timerSearch = null;

  // 1. Buscador superior
  const inputBusqueda = el("input", {
    type: "search",
    className: "mapa-buscador-input",
    placeholder: "Buscar calle, avenida o sector en Caracas…",
    autocomplete: "off",
  });

  const listaResultados = el("div", { className: "mapa-buscador-resultados hidden" });

  const contenedorBuscador = el(
    "div",
    { className: "mapa-buscador" },
    el("span", { className: "mapa-buscador-icono" }, icono("buscar")),
    inputBusqueda,
    listaResultados
  );

  // 2. Lienzo del mapa
  const mapaDiv = el("div", { className: "mapa-lienzo" });

  // 3. Pin central fijo (patrón delivery apps: Uber / PedidosYa)
  const pinSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pinSvg.setAttribute("viewBox", "0 0 24 24");
  pinSvg.setAttribute("width", "36");
  pinSvg.setAttribute("height", "36");
  pinSvg.setAttribute("fill", "#1E8C88");
  pinSvg.setAttribute("stroke", "#ffffff");
  pinSvg.setAttribute("stroke-width", "1.5");
  pinSvg.setAttribute("stroke-linecap", "round");
  pinSvg.setAttribute("stroke-linejoin", "round");
  pinSvg.setAttribute("class", "mapa-pin-icono");

  const pathPin = document.createElementNS("http://www.w3.org/2000/svg", "path");
  pathPin.setAttribute("d", "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z");
  const circlePin = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circlePin.setAttribute("cx", "12");
  circlePin.setAttribute("cy", "9");
  circlePin.setAttribute("r", "2.5");
  circlePin.setAttribute("fill", "#ffffff");
  pinSvg.appendChild(pathPin);
  pinSvg.appendChild(circlePin);

  const sombraPin = el("div", { className: "mapa-pin-sombra" });
  const pinCentral = el("div", { className: "mapa-pin-central" }, pinSvg, sombraPin);

  // 4. Botón flotante para ubicar GPS actual
  const btnGps = el(
    "button",
    {
      type: "button",
      className: "mapa-btn-gps",
      title: "Centrar en mi ubicación actual",
      "aria-label": "Centrar en mi ubicación actual",
      onclick: () => {
        if (!navigator.geolocation) return;
        btnGps.classList.add("cargando");
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            btnGps.classList.remove("cargando");
            if (mapInstance) {
              mapInstance.setView([pos.coords.latitude, pos.coords.longitude], 16, { animate: true });
            }
          },
          () => {
            btnGps.classList.remove("cargando");
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
        );
      },
    },
    icono("gps")
  );

  const lienzoWrapper = el("div", { className: "mapa-lienzo-wrap" }, mapaDiv, pinCentral, btnGps);

  // 5. Barra inferior con la dirección detectada
  const textoDireccion = el("span", { className: "mapa-direccion-texto" }, "Mueve el mapa para ubicar tu entrega…");
  const barraDireccion = el(
    "div",
    { className: "mapa-direccion-barra" },
    el("span", { className: "mapa-direccion-icono" }, icono("ubicacion")),
    textoDireccion
  );

  const componente = el("div", { className: "mapa-selector" }, contenedorBuscador, lienzoWrapper, barraDireccion);
  contenedor.appendChild(componente);

  // 6. Inicializar Leaflet
  let mapInstance = null;
  try {
    mapInstance = window.L.map(mapaDiv, {
      center: [latCentro, lonCentro],
      zoom: zoomCentro,
      zoomControl: true,
      attributionControl: false,
    });

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      subdomains: ["a", "b", "c"],
    }).addTo(mapInstance);
  } catch (err) {
    console.error("Error inicializando mapa Leaflet:", err);
    return null;
  }

  // Animación del pin al mover el mapa
  mapInstance.on("movestart", () => {
    pinCentral.classList.add("moviendo");
    textoDireccion.textContent = "Obteniendo dirección…";
  });

  const resolverUbicacion = async () => {
    pinCentral.classList.remove("moviendo");
    const centro = mapInstance.getCenter();
    const lat = centro.lat;
    const lon = centro.lng;

    textoDireccion.textContent = "Buscando dirección descriptiva…";
    const direccion = await geocodificarCoordenadas(lat, lon);

    textoDireccion.textContent = direccion || `Coordenadas: ${lat.toFixed(5)}, ${lon.toFixed(5)}`;

    if (typeof alSeleccionar === "function") {
      alSeleccionar({
        latitud: lat,
        longitud: lon,
        direccion: direccion || "",
      });
    }
  };

  mapInstance.on("moveend", () => {
    clearTimeout(timerGeocode);
    timerGeocode = setTimeout(resolverUbicacion, 450);
  });

  // Evento de búsqueda de direcciones
  inputBusqueda.addEventListener("input", (ev) => {
    const val = ev.target.value.trim();
    clearTimeout(timerSearch);
    if (val.length < 3) {
      listaResultados.classList.add("hidden");
      listaResultados.replaceChildren();
      return;
    }

    timerSearch = setTimeout(async () => {
      const resultados = await buscarDireccion(val);
      listaResultados.replaceChildren();
      if (!resultados || resultados.length === 0) {
        listaResultados.classList.add("hidden");
        return;
      }

      for (const res of resultados) {
        const itemBtn = el(
          "button",
          {
            type: "button",
            className: "mapa-buscador-item",
            onclick: () => {
              inputBusqueda.value = res.nombre;
              listaResultados.classList.add("hidden");
              listaResultados.replaceChildren();
              mapInstance.setView([res.lat, res.lon], 16, { animate: true });
            },
          },
          el("span", { className: "mapa-buscador-item-icono" }, icono("ubicacion")),
          el("span", { className: "mapa-buscador-item-texto" }, el("strong", {}, res.nombre), el("span", {}, res.display_name))
        );
        listaResultados.appendChild(itemBtn);
      }
      listaResultados.classList.remove("hidden");
    }, 350);
  });

  // Cerrar resultados al hacer clic afuera
  document.addEventListener("click", (ev) => {
    if (!contenedorBuscador.contains(ev.target)) {
      listaResultados.classList.add("hidden");
    }
  });

  // Iniciar geocodificación inicial tras montar
  setTimeout(() => {
    mapInstance.invalidateSize();
    resolverUbicacion();
  }, 200);

  return {
    map: mapInstance,
    destruir: () => {
      clearTimeout(timerGeocode);
      clearTimeout(timerSearch);
      mapInstance.remove();
    },
  };
}
