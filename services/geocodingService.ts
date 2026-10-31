/**
 * services/geocodingService.ts
 * Geocodificación inversa y búsqueda de direcciones mediante OpenStreetMap (Nominatim).
 * Incluye caché en memoria, cabecera User-Agent según políticas de OSM y timeout estricto.
 */
import axios from "axios";
const configManager = require("./configManager");

interface CacheEntry {
  valor: any;
  expira: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 24 * 60 * 60 * 1000; // 24 horas

function limpiarCacheExpirado() {
  const ahora = Date.now();
  if (cache.size > 2000) {
    for (const [k, v] of cache.entries()) {
      if (v.expira < ahora) cache.delete(k);
    }
  }
}

function getUserAgent(): string {
  const brandName = configManager.get("settings.brandName") || "VentiMax";
  let contactEmail = "";
  try {
    const datos = require("./datosNegocioService").getDatosNegocioSync();
    contactEmail = datos?.contacto?.email || "";
  } catch (_e) {
    contactEmail = configManager.get("settings.contact.email") || "";
  }
  return contactEmail ? `${brandName}/1.0 (${contactEmail})` : `${brandName}/1.0`;
}

/** Formatea una dirección limpia a partir del objeto address de Nominatim */
function formatearDireccion(data: any): string {
  if (!data) return "";
  if (data.address) {
    const a = data.address;
    const via = a.road || a.pedestrian || a.street || a.avenue || a.path || "";
    const zona = a.suburb || a.neighbourhood || a.residential || a.quarter || a.city_block || "";
    const ciudad = a.county || a.city || a.town || a.municipality || "";
    const partes = [via, zona, ciudad].filter(Boolean);
    const unicas = [...new Set(partes)];
    if (unicas.length > 0) {
      return unicas.join(", ");
    }
  }
  if (data.display_name) {
    return String(data.display_name).split(", ").slice(0, 3).join(", ");
  }
  return "";
}

/** Geocodificación inversa: de (latitud, longitud) a dirección descriptiva */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return "";

  const key = `rev:${lat.toFixed(4)},${lon.toFixed(4)}`;
  const cacheado = cache.get(key);
  if (cacheado && cacheado.expira > Date.now()) {
    return cacheado.valor;
  }

  limpiarCacheExpirado();

  try {
    const res = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&zoom=18&addressdetails=1`,
      {
        headers: { "User-Agent": getUserAgent() },
        timeout: 3000,
      }
    );
    const direccion = formatearDireccion(res.data);
    cache.set(key, { valor: direccion, expira: Date.now() + TTL_MS });
    return direccion;
  } catch (err: any) {
    console.warn("⚠️ [Geocodificación] Error en reverse geocode:", err.message);
    return "";
  }
}

/** Búsqueda de direcciones en Caracas/Venezuela */
export async function searchAddress(q: string): Promise<Array<{ lat: number; lon: number; nombre: string; display_name: string }>> {
  const query = String(q || "").trim();
  if (query.length < 3) return [];

  const key = `search:${query.toLowerCase()}`;
  const cacheado = cache.get(key);
  if (cacheado && cacheado.expira > Date.now()) {
    return cacheado.valor;
  }

  limpiarCacheExpirado();

  try {
    // Si la búsqueda no incluye Caracas ni Venezuela, agregar Caracas para acotar al área de entrega
    const queryCompleta = /(caracas|venezuela|miranda)/i.test(query) ? query : `${query}, Caracas, Venezuela`;
    const res = await axios.get(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryCompleta)}&countrycodes=ve&limit=5&addressdetails=1`,
      {
        headers: { "User-Agent": getUserAgent() },
        timeout: 3500,
      }
    );

    const resultados = Array.isArray(res.data)
      ? res.data.map((item: any) => ({
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          nombre: formatearDireccion(item) || item.name || query,
          display_name: item.display_name || "",
        }))
      : [];

    cache.set(key, { valor: resultados, expira: Date.now() + TTL_MS });
    return resultados;
  } catch (err: any) {
    console.warn("⚠️ [Geocodificación] Error buscando dirección:", err.message);
    return [];
  }
}

module.exports = { reverseGeocode, searchAddress };
