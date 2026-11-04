/**
 * services/cotizadorEnvio.ts (F1-8)
 *
 * Cotizador de envío nacional con estimado en el carrito. Todos los envíos nacionales son cobro a destino y
 * retiro en la agencia o tienda de la empresa (no hay entrega en la puerta), así que el estimado es solo de retiro.
 *
 * - MRW: no tiene API pública. Se consulta una vez al día (antes de la apertura) para cada kilo de 1 a 80 y se
 *   guarda la tabla en Setting ("cotizadorMrw"). Si la actualización falla, queda la última tabla buena.
 * - Zoom: API pública (CalcularTarifa). Se consulta al momento, con caché en memoria hasta el día siguiente.
 *
 * Sin nada de marca en el código: la ciudad de origen sale de settings.mapa de la marca. El estimado es
 * informativo; el costo real se cobra al recibir, así que no se suma al total del pedido.
 */

import axios from "axios";
const bcv = require("./bcv");
const configManager = require("./configManager");
const { normalizarTexto } = require("./productoAmpliado");
/** Día (AAAA-MM-DD) en la zona horaria de la marca. */
function fechaDeZona(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: horarioService.getHorarioSync().zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
const horarioService = require("./horarioService");

let Setting = require("../models/Setting");
let MetodoEnvio = require("../models/MetodoEnvio");
let Producto = require("../models/Producto");
let Sucursal = require("../models/Sucursal");
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("./dbLocal");
  Setting = dbLocal.getSettingModel();
  MetodoEnvio = dbLocal.getMetodoEnvioModel();
  Producto = dbLocal.getProductoModel();
  Sucursal = dbLocal.getSucursalModel();
}

export const COTIZADORES = ["ninguno", "mrw", "zoom"] as const;
export type Cotizador = (typeof COTIZADORES)[number];

export const TIMEOUT_MS = 8000;
export const MRW_URL = "https://mrwve.com/api/calculo-envio";
export const ZOOM_BASE = "https://api.zoom.red/canguroazul";
export const MRW_KG_MIN = 1;
export const MRW_KG_MAX = 80;
const MRW_ESPERA_MS = 1000; // una consulta por segundo
const MS_DIA = 24 * 60 * 60 * 1000;
const MS_HORA = 60 * 60 * 1000;
const MINUTOS_ANTES_APERTURA = 60;
const CLAVE_SETTING_MRW = "cotizadorMrw";

export interface TablaMrw {
  fecha: string; // día de la marca en que se consultó
  actualizadaEn: number; // timestamp ms
  retiro: Record<string, number>; // kg (texto) -> total en Bs
}

export interface ResultadoCotizacion {
  montoBs: number;
  fecha: string;
}

// ---------------------------------------------------------------------------------------------------------
// Funciones puras
// ---------------------------------------------------------------------------------------------------------

/**
 * Convierte un monto a número. Acepta número o texto en formato venezolano ("22.150,58") o con punto decimal
 * ("22150.58"). Devuelve null si no es un monto positivo.
 */
export function parsearBs(valor: unknown): number | null {
  let n: number;
  if (typeof valor === "number") {
    n = valor;
  } else if (typeof valor === "string") {
    const t = valor.trim();
    if (!t) return null;
    const limpio = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
    if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
    n = Number(limpio);
  } else {
    return null;
  }
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Peso del pedido: suma de pesoKg × cantidad. Si algún producto no tiene peso, no hay estimado (ok false). */
export function pesoPedido(items: { pesoKg: unknown; cantidad: number }[]): { ok: true; kg: number } | { ok: false } {
  let total = 0;
  for (const it of items) {
    const kg = typeof it.pesoKg === "number" ? it.pesoKg : Number(it.pesoKg);
    if (!Number.isFinite(kg) || kg <= 0) return { ok: false };
    total += kg * (Number(it.cantidad) || 0);
  }
  if (!(total > 0)) return { ok: false };
  return { ok: true, kg: Math.round(total * 1000) / 1000 };
}

/** Kilos enteros para la tabla de MRW: se redondea hacia arriba (0,2 kg cuenta como 1 kg). */
export function kgRedondeoArriba(kg: number): number {
  return Math.ceil(kg - 1e-9);
}

/** Bs → USD con la tasa del BCV, dos decimales. */
export function bsAUsd(montoBs: number, tasa: number): number {
  return Math.round((montoBs / tasa) * 100) / 100;
}

/** Hora local de la marca (zona horaria del horario de atención) en minutos desde medianoche. */
export function minutosDelDia(ahora: Date): number {
  const zona = horarioService.getHorarioSync().zonaHoraria;
  const c = new Date(ahora.toLocaleString("en-US", { timeZone: zona }));
  return c.getHours() * 60 + c.getMinutes();
}

function minutosDeHora(hhmm: string): number {
  const [h, m] = String(hhmm || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * ¿Hay que actualizar la tabla de MRW ahora? Corre 60 minutos antes de la apertura, un día laborable, una vez
 * por día. Tras un fallo se reintenta como mucho cada hora.
 */
export function debeActualizarMrw(p: {
  ahora: Date;
  apertura: string;
  esNoLaborable: boolean;
  tablaFecha: string | null;
  ultimoIntento: number | null;
}): boolean {
  if (p.esNoLaborable) return false;
  if (minutosDelDia(p.ahora) < minutosDeHora(p.apertura) - MINUTOS_ANTES_APERTURA) return false;
  if (p.tablaFecha === fechaDeZona(p.ahora)) return false;
  if (p.ultimoIntento && p.ahora.getTime() - p.ultimoIntento < MS_HORA) return false;
  return true;
}

/** Tabla vieja (más de 24 h o inexistente): se actualiza al arrancar. */
export function tablaVieja(tabla: TablaMrw | null, ahora: number): boolean {
  return !tabla || ahora - tabla.actualizadaEn > MS_DIA;
}

/** Elige una ciudad de la lista de getCiudades por nombre (sin acentos ni mayúsculas). */
export function buscarCiudadZoom(ciudades: any[], nombre: string): string | null {
  const buscada = normalizarTexto(nombre);
  if (!buscada) return null;
  const hit = ciudades.find((c: any) => normalizarTexto(c?.nombre_ciudad) === buscada);
  return hit && hit.codciudad !== undefined && hit.codciudad !== null ? String(hit.codciudad) : null;
}

/** Lista de ciudades de la respuesta de getCiudades (acepta lista directa o dentro de entidadRespuesta). */
export function extraerListaZoom(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.entidadRespuesta)) return data.entidadRespuesta;
  return [];
}

/** URL de CalcularTarifa de Zoom. Siempre retiro en oficina (modalidad_tarifa=1). */
export function urlTarifaZoom(p: { ciudadOrigen: string; ciudadDestino: string; oficina: string; kg: number; montoBs: number }): string {
  const q = new URLSearchParams({
    tipo_tarifa: "2",
    modalidad_tarifa: "1",
    ciudad_remitente: p.ciudadOrigen,
    ciudad_destinatario: p.ciudadDestino,
    oficina_retirar: p.oficina,
    cantidad_piezas: "1",
    peso: String(p.kg),
    valor_mercancia: p.montoBs.toFixed(2),
    valor_declarado: "0",
  });
  return `${ZOOM_BASE}/CalcularTarifa?${q.toString()}`;
}

// ---------------------------------------------------------------------------------------------------------
// Estado en memoria y caché
// ---------------------------------------------------------------------------------------------------------

let tablaMrwMemoria: TablaMrw | null = null;
let ultimoIntentoMrw: number | null = null;
let ultimoErrorMrw: string | null = null;
let actualizandoMrw = false;

const cacheZoom = new Map<string, { fecha: string; montoBs: number }>();
let ciudadesZoom: { fecha: string; lista: any[] } | null = null;

/** Tabla de MRW en memoria (la última buena). */
export function getTablaMrw(): TablaMrw | null {
  return tablaMrwMemoria;
}

export function getUltimoErrorMrw(): string | null {
  return ultimoErrorMrw;
}

/** Carga la última tabla guardada en Setting (solo al arrancar o si la memoria está vacía). */
export async function cargarTablaMrw(): Promise<TablaMrw | null> {
  try {
    const doc: any = await Setting.findOne({ key: CLAVE_SETTING_MRW });
    const v = doc?.value;
    if (v && typeof v === "object" && v.retiro && typeof v.retiro === "object") {
      tablaMrwMemoria = { fecha: String(v.fecha || ""), actualizadaEn: Number(v.actualizadaEn) || 0, retiro: v.retiro };
    }
  } catch (err: any) {
    console.warn("⚠️ [Cotizador] No se pudo leer la tabla de MRW:", err?.message || err);
  }
  return tablaMrwMemoria;
}

// ---------------------------------------------------------------------------------------------------------
// MRW
// ---------------------------------------------------------------------------------------------------------

/** Una consulta de MRW para un kilo entero (retiro en agencia, medidas mínimas). Lanza si no hay tarifa. */
export async function consultarMrwKg(kg: number): Promise<number> {
  const { data } = await axios.post(
    MRW_URL,
    { envio: 1, peso: kg, alto: 1, ancho: 1, largo: 1, retiro: 0 },
    { timeout: TIMEOUT_MS, headers: { "Content-Type": "application/json" } },
  );
  const bs = parsearBs(data?.Pago_en_Origen);
  if (bs === null) throw new Error(`MRW sin tarifa para ${kg} kg`);
  return bs;
}

/**
 * Consulta MRW de 1 a 80 kg (una por segundo) y guarda la tabla. Si una consulta falla, no se guarda nada:
 * queda la tabla anterior y el error se registra. `espera` se inyecta en las pruebas.
 */
export async function actualizarTablaMrw(
  opciones: { espera?: (ms: number) => Promise<void>; ahora?: Date } = {},
): Promise<{ ok: boolean; error?: string }> {
  if (actualizandoMrw) return { ok: false, error: "Ya se está actualizando" };
  const espera = opciones.espera || ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const ahora = opciones.ahora || new Date();
  actualizandoMrw = true;
  ultimoIntentoMrw = ahora.getTime();
  try {
    const retiro: Record<string, number> = {};
    for (let kg = MRW_KG_MIN; kg <= MRW_KG_MAX; kg++) {
      retiro[String(kg)] = await consultarMrwKg(kg);
      if (kg < MRW_KG_MAX) await espera(MRW_ESPERA_MS);
    }
    const tabla: TablaMrw = { fecha: fechaDeZona(ahora), actualizadaEn: ahora.getTime(), retiro };
    await Setting.findOneAndUpdate({ key: CLAVE_SETTING_MRW }, { key: CLAVE_SETTING_MRW, value: tabla }, { upsert: true });
    tablaMrwMemoria = tabla;
    ultimoErrorMrw = null;
    return { ok: true };
  } catch (err: any) {
    ultimoErrorMrw = String(err?.message || err);
    console.error("❌ [Cotizador] No se actualizó la tabla de MRW (se mantiene la anterior):", ultimoErrorMrw);
    return { ok: false, error: ultimoErrorMrw as string };
  } finally {
    actualizandoMrw = false;
  }
}

// ---------------------------------------------------------------------------------------------------------
// Zoom
// ---------------------------------------------------------------------------------------------------------

async function listarCiudadesZoom(): Promise<any[]> {
  const hoy = fechaDeZona();
  if (ciudadesZoom && ciudadesZoom.fecha === hoy) return ciudadesZoom.lista;
  const { data } = await axios.get(`${ZOOM_BASE}/getCiudades`, { timeout: TIMEOUT_MS });
  const lista = extraerListaZoom(data);
  ciudadesZoom = { fecha: hoy, lista };
  return lista;
}

function ciudadOrigenMarca(): string {
  const mapa = configManager.get("settings.mapa");
  return typeof mapa?.ciudad === "string" ? mapa.ciudad.trim() : "";
}

/** Tarifa de Zoom (retiro en oficina). Null si no hay ciudad, la tarifa no llega o falla la consulta. */
export async function cotizarZoom(p: {
  ciudadDestino: string;
  oficina: string;
  kg: number;
  montoMercanciaBs: number;
}): Promise<ResultadoCotizacion | null> {
  const origenNombre = ciudadOrigenMarca();
  if (!origenNombre || !p.ciudadDestino) return null;
  const ciudades = await listarCiudadesZoom();
  const ciudadOrigen = buscarCiudadZoom(ciudades, origenNombre);
  const ciudadDestino = buscarCiudadZoom(ciudades, p.ciudadDestino);
  if (!ciudadOrigen || !ciudadDestino) return null;

  const hoy = fechaDeZona();
  const clave = `${ciudadDestino}|${p.oficina}|${p.kg}`;
  const enCache = cacheZoom.get(clave);
  if (enCache && enCache.fecha === hoy) return { montoBs: enCache.montoBs, fecha: hoy };

  const { data } = await axios.get(
    urlTarifaZoom({ ciudadOrigen, ciudadDestino, oficina: p.oficina, kg: p.kg, montoBs: p.montoMercanciaBs }),
    { timeout: TIMEOUT_MS },
  );
  const montoBs = parsearBs(data?.entidadRespuesta?.total);
  if (montoBs === null) return null;
  cacheZoom.set(clave, { fecha: hoy, montoBs });
  return { montoBs, fecha: hoy };
}

// ---------------------------------------------------------------------------------------------------------
// Entrada común
// ---------------------------------------------------------------------------------------------------------

/**
 * Estimado de retiro para un peso en kilos. MRW usa la tabla diaria (kg redondeados hacia arriba); Zoom consulta
 * al momento. Cualquier fallo o falta de dato devuelve null (el cliente no ve estimado).
 */
export async function cotizarEnvio(p: {
  cotizador: string;
  kg: number;
  ciudadDestino?: string;
  oficina?: string;
  montoMercanciaBs?: number;
}): Promise<ResultadoCotizacion | null> {
  try {
    if (p.cotizador === "mrw") {
      const kg = kgRedondeoArriba(p.kg);
      if (kg < MRW_KG_MIN || kg > MRW_KG_MAX) return null;
      const tabla = tablaMrwMemoria || (await cargarTablaMrw());
      const bs = tabla?.retiro?.[String(kg)];
      return typeof bs === "number" && bs > 0 ? { montoBs: bs, fecha: tabla!.fecha } : null;
    }
    if (p.cotizador === "zoom") {
      if (p.kg <= 0) return null;
      return await cotizarZoom({
        ciudadDestino: p.ciudadDestino || "",
        oficina: p.oficina || "",
        kg: Math.round(p.kg * 1000) / 1000,
        montoMercanciaBs: Math.max(1, Math.round((p.montoMercanciaBs || 0) * 100) / 100),
      });
    }
    return null;
  } catch (err: any) {
    console.warn(`⚠️ [Cotizador] Fallo consultando ${p.cotizador}:`, err?.message || err);
    return null;
  }
}

/** ¿Alguna empresa de un método activo usa este cotizador? (sin ella no se llama a MRW ni a Zoom). */
export async function hayEmpresasCon(cotizador: string): Promise<boolean> {
  const metodos: any[] = (await MetodoEnvio.find({ activo: true })) || [];
  return metodos.some((m: any) =>
    Array.isArray(m.empresas) && m.empresas.some((e: any) => e && typeof e === "object" && e.cotizador === cotizador),
  );
}

/**
 * Job diario (agenda): actualiza la tabla de MRW 60 minutos antes de la apertura, en día laborable, si hay
 * empresas MRW configuradas. Nunca lanza.
 */
export async function ejecutarJobMrw(ahora: Date = new Date()): Promise<void> {
  try {
    await horarioService.getHorario();
    const horario = horarioService.getHorarioSync();
    const debe = debeActualizarMrw({
      ahora,
      apertura: horario.apertura,
      esNoLaborable: horarioService.esDiaNoLaborable(ahora),
      tablaFecha: tablaMrwMemoria?.fecha || null,
      ultimoIntento: ultimoIntentoMrw,
    });
    if (!debe || !(await hayEmpresasCon("mrw"))) return;
    await actualizarTablaMrw({ ahora });
  } catch (err: any) {
    console.error("❌ [Cotizador] Job MRW:", err?.message || err);
  }
}

/** Arranque: carga la tabla guardada y la actualiza si tiene más de 24 h (solo si hay empresas MRW). */
export async function iniciarCotizadorEnvio(): Promise<void> {
  try {
    const tabla = (await cargarTablaMrw()) || null;
    if (tablaVieja(tabla, Date.now()) && (await hayEmpresasCon("mrw"))) {
      await actualizarTablaMrw();
    }
  } catch (err: any) {
    console.error("❌ [Cotizador] Arranque:", err?.message || err);
  }
}

/** Sucursal de Zoom (o de la empresa con slug) para el código de oficina de la tarifa. */
export async function oficinaDeSucursal(slug: string, sucursalId: string): Promise<string> {
  if (!slug || !sucursalId || !sucursalId.startsWith(`${slug}-`)) return "";
  const codigo = sucursalId.slice(slug.length + 1);
  const suc: any = await Sucursal.findOne({ empresa: slug, codigo, activa: true });
  return suc ? String(suc.codigo || "") : "";
}

/** Ciudad de una sucursal activa (para la tarifa de Zoom). */
export async function ciudadDeSucursal(slug: string, sucursalId: string): Promise<string> {
  if (!slug || !sucursalId || !sucursalId.startsWith(`${slug}-`)) return "";
  const codigo = sucursalId.slice(slug.length + 1);
  const suc: any = await Sucursal.findOne({ empresa: slug, codigo, activa: true });
  return suc ? String(suc.ciudad || "") : "";
}

export function _resetParaPruebas(): void {
  tablaMrwMemoria = null;
  ultimoIntentoMrw = null;
  ultimoErrorMrw = null;
  actualizandoMrw = false;
  cacheZoom.clear();
  ciudadesZoom = null;
}

module.exports = {
  COTIZADORES,
  parsearBs,
  pesoPedido,
  kgRedondeoArriba,
  bsAUsd,
  debeActualizarMrw,
  tablaVieja,
  buscarCiudadZoom,
  extraerListaZoom,
  urlTarifaZoom,
  consultarMrwKg,
  actualizarTablaMrw,
  cotizarZoom,
  cotizarEnvio,
  cargarTablaMrw,
  getTablaMrw,
  getUltimoErrorMrw,
  hayEmpresasCon,
  ejecutarJobMrw,
  iniciarCotizadorEnvio,
  oficinaDeSucursal,
  ciudadDeSucursal,
  _resetParaPruebas,
  TIMEOUT_MS,
  MRW_URL,
  ZOOM_BASE,
  MRW_KG_MIN,
  MRW_KG_MAX,
};
