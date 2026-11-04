/**
 * public/src/features/sales/components/MapaEntrega.js
 * Mapa con pin central y buscador de direcciones para la venta manual (misma lógica que la tienda, F2d).
 * Usa Leaflet local (public/lib/leaflet) y los endpoints públicos de geocodificación con su límite por IP.
 * Todo se pinta con React, sin HTML crudo con datos.
 */
import React, { useEffect, useRef, useState } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";

const e = React.createElement;

export default function MapaEntrega({ onSeleccionar }) {
  const mapaRef = useRef(null);
  const mapaInstancia = useRef(null);
  const timerMover = useRef(null);
  const timerBusqueda = useRef(null);
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState([]);
  const [direccion, setDireccion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mapaListo, setMapaListo] = useState(false);

  useEffect(() => {
    let activo = true;
    if (!window.L || !mapaRef.current) return undefined;

    const iniciar = async () => {
      let centro = { lat: 0, lng: 0 };
      let zoom = 2;
      try {
        const res = await apiClient.get("/api/public/marca");
        const m = res.data?.mapa;
        if (m?.centro && Number.isFinite(m.centro.lat) && Number.isFinite(m.centro.lng)) {
          centro = m.centro;
          zoom = 13;
        }
      } catch (err) {
        console.warn("No se pudo cargar el centro del mapa:", err);
      }
      if (!activo || !mapaRef.current) return;

      const mapa = window.L.map(mapaRef.current, {
        center: [centro.lat, centro.lng],
        zoom,
        attributionControl: false,
      });
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        subdomains: ["a", "b", "c"],
        // OSM bloquea las teselas sin Referer; helmet envía no-referrer por defecto
        referrerPolicy: "strict-origin-when-cross-origin",
      }).addTo(mapa);
      mapaInstancia.current = mapa;
      setMapaListo(true);

      mapa.on("movestart", () => {
        setDireccion("Obteniendo dirección…");
      });
      mapa.on("moveend", () => {
        clearTimeout(timerMover.current);
        timerMover.current = setTimeout(() => resolverCentro(mapa), 450);
      });
      setTimeout(() => {
        mapa.invalidateSize();
        resolverCentro(mapa);
      }, 200);
    };

    iniciar();

    return () => {
      activo = false;
      clearTimeout(timerMover.current);
      clearTimeout(timerBusqueda.current);
      if (mapaInstancia.current) {
        mapaInstancia.current.remove();
        mapaInstancia.current = null;
      }
    };
  }, []);

  const resolverCentro = async (mapa) => {
    const { lat, lng } = mapa.getCenter();
    setCargando(true);
    let texto = "";
    try {
      const res = await apiClient.get(
        `/api/public/geocodificar?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`,
      );
      texto = res.data?.direccion || "";
    } catch (err) {
      console.warn("No se pudo geocodificar el centro del mapa:", err);
    }
    setCargando(false);
    const final = texto || `Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    setDireccion(final);
    onSeleccionar({ direccion: texto, latitud: lat, longitud: lng });
  };

  const buscar = (valor) => {
    setConsulta(valor);
    clearTimeout(timerBusqueda.current);
    if (valor.trim().length < 3) {
      setResultados([]);
      return;
    }
    timerBusqueda.current = setTimeout(async () => {
      try {
        const res = await apiClient.get(
          `/api/public/buscar-direccion?q=${encodeURIComponent(valor.trim())}`,
        );
        setResultados(Array.isArray(res.data?.resultados) ? res.data.resultados : []);
      } catch (err) {
        console.warn("Error buscando dirección:", err);
        setResultados([]);
      }
    }, 350);
  };

  const elegir = (res) => {
    setConsulta(res.nombre || res.display_name || "");
    setResultados([]);
    if (mapaInstancia.current) {
      mapaInstancia.current.setView([res.lat, res.lon], 16, { animate: true });
    }
  };

  if (!window.L) {
    return e(
      "p",
      { className: "text-xs text-amber-600 dark:text-amber-400" },
      "El mapa no está disponible. Escribe la dirección a mano.",
    );
  }

  return e(
    "div",
    { className: "space-y-2" },
    e(
      "div",
      { className: "relative z-20" },
      e("input", {
        type: "search",
        value: consulta,
        onChange: (evt) => buscar(evt.target.value),
        placeholder: "Buscar calle, avenida o sector…",
        autoComplete: "off",
        "aria-label": "Buscar dirección",
        className:
          "w-full px-3 py-2 min-h-[44px] bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm",
      }),
      resultados.length > 0 &&
        e(
          "div",
          { className: "absolute z-20 left-0 right-0 mt-1 max-h-60 overflow-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg" },
          resultados.map((res, idx) =>
            e(
              "button",
              {
                key: idx,
                type: "button",
                onClick: () => elegir(res),
                className:
                  "block w-full text-left px-3 py-2 min-h-[44px] text-sm text-gray-800 dark:text-gray-100 hover:bg-emerald-50 dark:hover:bg-emerald-900/30",
              },
              res.display_name || res.nombre,
            ),
          ),
        ),
    ),
    e(
      "div",
      { className: "relative w-full h-56 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700" },
      e("div", { ref: mapaRef, className: "absolute inset-0 isolate" }),
      // Pin fijo al centro: la dirección sale del punto central del mapa
      e(
        "div",
        { className: "pointer-events-none absolute inset-0 z-10 flex items-center justify-center" },
        e("span", { className: "block w-4 h-4 rounded-full bg-emerald-600 border-2 border-white shadow" }),
      ),
    ),
    e(
      "p",
      { className: "text-xs text-gray-500 dark:text-gray-400 flex justify-between gap-2" },
      e("span", null, mapaListo ? direccion || "Mueve el mapa para ubicar la entrega…" : "Cargando mapa…"),
      cargando && e("span", null, "…"),
    ),
  );
}
