/**
 * F1-5 · Búsqueda de piezas por vehículo (bot de WhatsApp).
 * Consultas al catálogo y reglas de compatibilidad. Sin textos de marca: los mensajes viven en messages.
 * Productos sin compatibilidad = universales (se ofrecen para cualquier vehículo).
 */
import { normalizarTexto } from "./productoAmpliado";
import { LIMITES_VEHICULO } from "./vehiculoCliente";

let ProductoModel = require("../models/Producto");
let CategoriaModel = require("../models/Categoria");

// Soporte para Pruebas de Integración (Mock)
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("./dbLocal");
  ProductoModel = dbLocal.getProductoModel();
  if (typeof dbLocal.getCategoriaModel === "function") {
    CategoriaModel = dbLocal.getCategoriaModel();
  }
}

/** Máximo de opciones por lista de WhatsApp: 9 + la fila "Otra (escríbela)" = 10 (services/whatsapp.ts). */
export const OPCIONES_POR_LISTA = 9;

const CONDICION_DISPONIBLE = { $or: [{ trackStock: { $ne: true } }, { stock: { $gt: 0 } }] };

export interface VehiculoBusqueda {
  marcaNorm: string;
  modeloNorm: string;
  anio: number;
  motorNorm?: string | null;
}

/** Identificador de fila de lista: sin acentos, solo [a-z0-9-]. */
export function slugOpcion(texto: string): string {
  const s = normalizarTexto(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 60) || "x";
}

/** Año escrito por el cliente: exactamente 4 cifras. null si no es un año válido de formato. */
export function parsearAnio(texto: string): number | null {
  const limpio = String(texto || "").trim();
  if (!/^\d{4}$/.test(limpio)) return null;
  return Number(limpio);
}

function entradasDe(p: any): any[] {
  return Array.isArray(p?.compatibilidad) ? p.compatibilidad : [];
}

function anioEnRango(e: any, anio: number): boolean {
  if (e.anioDesde != null && anio < e.anioDesde) return false;
  if (e.anioHasta != null && anio > e.anioHasta) return false;
  return true;
}

/** Una entrada de compatibilidad sirve si coincide marca, modelo y año; con motor, solo si no fija otro. */
function entradaCoincide(e: any, b: VehiculoBusqueda): boolean {
  if (e.marcaNorm !== b.marcaNorm || e.modeloNorm !== b.modeloNorm) return false;
  if (!anioEnRango(e, b.anio)) return false;
  if (e.motor && b.motorNorm && normalizarTexto(e.motor) !== b.motorNorm) return false;
  return true;
}

async function productosDisponibles(filtro: any[]): Promise<any[]> {
  const lista = await ProductoModel.find({ $and: [{ activo: true }, CONDICION_DISPONIBLE, ...filtro] });
  return Array.isArray(lista) ? lista : [];
}

/** Marcas con piezas compatibles, de más a menos productos. */
export async function listarMarcas(): Promise<Array<{ marcaNorm: string; marca: string; productos: number }>> {
  const productos = await productosDisponibles([]);
  const mapa = new Map<string, { marcaNorm: string; marca: string; ids: Set<string> }>();
  for (const p of productos) {
    for (const e of entradasDe(p)) {
      if (!e.marcaNorm) continue;
      if (!mapa.has(e.marcaNorm)) mapa.set(e.marcaNorm, { marcaNorm: e.marcaNorm, marca: e.marca, ids: new Set() });
      mapa.get(e.marcaNorm)!.ids.add(String(p.id ?? p._id));
    }
  }
  return [...mapa.values()]
    .map((m) => ({ marcaNorm: m.marcaNorm, marca: m.marca, productos: m.ids.size }))
    .sort((a, b) => b.productos - a.productos || a.marca.localeCompare(b.marca));
}

/** Modelos de una marca con piezas, de más a menos productos. */
export async function listarModelos(marcaNorm: string): Promise<Array<{ modeloNorm: string; modelo: string; productos: number }>> {
  const productos = await productosDisponibles([{ "compatibilidad.marcaNorm": marcaNorm }]);
  const mapa = new Map<string, { modeloNorm: string; modelo: string; ids: Set<string> }>();
  for (const p of productos) {
    for (const e of entradasDe(p)) {
      if (e.marcaNorm !== marcaNorm || !e.modeloNorm) continue;
      if (!mapa.has(e.modeloNorm)) mapa.set(e.modeloNorm, { modeloNorm: e.modeloNorm, modelo: e.modelo, ids: new Set() });
      mapa.get(e.modeloNorm)!.ids.add(String(p.id ?? p._id));
    }
  }
  return [...mapa.values()]
    .map((m) => ({ modeloNorm: m.modeloNorm, modelo: m.modelo, productos: m.ids.size }))
    .sort((a, b) => b.productos - a.productos || a.modelo.localeCompare(b.modelo));
}

/**
 * Rango de años que cubre el catálogo para un modelo. Una entrada sin año desde/hasta
 * se toma como abierta (1950 / 2100). null si el modelo no tiene entradas.
 */
export async function rangoAnios(marcaNorm: string, modeloNorm: string): Promise<{ desde: number; hasta: number } | null> {
  const productos = await productosDisponibles([
    { "compatibilidad.marcaNorm": marcaNorm },
    { "compatibilidad.modeloNorm": modeloNorm },
  ]);
  let desde: number | null = null;
  let hasta: number | null = null;
  for (const p of productos) {
    for (const e of entradasDe(p)) {
      if (e.marcaNorm !== marcaNorm || e.modeloNorm !== modeloNorm) continue;
      const d = e.anioDesde ?? LIMITES_VEHICULO.anioMin;
      const h = e.anioHasta ?? LIMITES_VEHICULO.anioMax;
      desde = desde === null ? d : Math.min(desde, d);
      hasta = hasta === null ? h : Math.max(hasta, h);
    }
  }
  if (desde === null || hasta === null) return null;
  return { desde, hasta };
}

/**
 * Motores que hacen falta preguntar: solo si alguna entrada del vehículo (marca, modelo, año)
 * tiene motor. Devuelve los motores distintos ordenados.
 */
export async function motoresParaVehiculo(
  marcaNorm: string,
  modeloNorm: string,
  anio: number
): Promise<{ necesitaMotor: boolean; motores: Array<{ norm: string; label: string }> }> {
  const productos = await productosDisponibles([
    { "compatibilidad.marcaNorm": marcaNorm },
    { "compatibilidad.modeloNorm": modeloNorm },
  ]);
  const motores = new Map<string, string>();
  for (const p of productos) {
    for (const e of entradasDe(p)) {
      if (!entradaCoincide(e, { marcaNorm, modeloNorm, anio, motorNorm: null })) continue;
      if (e.motor) motores.set(normalizarTexto(e.motor), e.motor.trim());
    }
  }
  const lista = [...motores.entries()]
    .map(([norm, label]) => ({ norm, label }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { necesitaMotor: lista.length > 0, motores: lista };
}

/**
 * Piezas que sirven para el vehículo: las compatibles (con su entrada que coincide) y
 * las universales (sin compatibilidad). Sin duplicados.
 */
export async function piezasParaVehiculo(b: VehiculoBusqueda): Promise<any[]> {
  const compatibles = await productosDisponibles([
    { "compatibilidad.marcaNorm": b.marcaNorm },
    { "compatibilidad.modeloNorm": b.modeloNorm },
  ]);
  const universales = await productosDisponibles([{ compatibilidad: { $size: 0 } }]);
  const vistos = new Set<string>();
  const piezas: any[] = [];
  for (const p of compatibles) {
    if (!entradasDe(p).some((e) => entradaCoincide(e, b))) continue;
    const id = String(p.id ?? p._id);
    if (!vistos.has(id)) {
      vistos.add(id);
      piezas.push(p);
    }
  }
  for (const p of universales) {
    const id = String(p.id ?? p._id);
    if (!vistos.has(id)) {
      vistos.add(id);
      piezas.push(p);
    }
  }
  return piezas.sort((a, b2) => String(a.name).localeCompare(String(b2.name)));
}

/** Categorías (de las piezas) con su nombre, en orden alfabético. "general" queda fuera. */
export async function categoriasDePiezas(piezas: any[]): Promise<Array<{ id: string; nombre: string }>> {
  const ids = new Set<string>();
  for (const p of piezas) {
    if (p.categoria) ids.add(String(p.categoria?._id ?? p.categoria));
    for (const c of Array.isArray(p.categorias) ? p.categorias : []) ids.add(String(c?._id ?? c));
  }
  const categorias = await CategoriaModel.find({});
  return (Array.isArray(categorias) ? categorias : [])
    .filter((c) => ids.has(String(c._id)) && c.slug !== "general")
    .map((c) => ({ id: String(c._id), nombre: c.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Piezas de una categoría (directa o adicional). */
export function piezasDeCategoria(piezas: any[], categoriaId: string): any[] {
  return piezas.filter(
    (p) =>
      String(p.categoria?._id ?? p.categoria ?? "") === categoriaId ||
      (Array.isArray(p.categorias) && p.categorias.some((c) => String(c?._id ?? c) === categoriaId))
  );
}
