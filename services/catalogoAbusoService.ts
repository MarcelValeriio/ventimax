/**
 * Registro y consulta de métricas anti-abuso del Catálogo Web (F2-4, R14).
 * Almacena contadores diarios atómicos en la colección ContadorCatalogo.
 * Sin IPs ni datos personales.
 */
import { TipoEventoCatalogo } from "../types/models";

function getContadorModel() {
  return process.env.NODE_ENV === "test"
    ? require("./dbLocal").getContadorCatalogoModel()
    : require("../models/ContadorCatalogo");
}

/** Devuelve la fecha actual en zona horaria de Caracas como YYYY-MM-DD */
export function fechaCaracas(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Incrementa atómicamente el contador diario para el tipo de evento dado.
 */
export async function registrarEventoCatalogo(
  tipo: TipoEventoCatalogo,
  cantidad = 1,
  fechaStr?: string
): Promise<void> {
  try {
    const fecha = fechaStr || fechaCaracas();
    const model = getContadorModel();
    await model.findOneAndUpdate(
      { fecha, tipo },
      { $inc: { cantidad } },
      { upsert: true, new: true }
    );
  } catch (err: any) {
    console.error(`⚠️ [Catálogo] Error registrando evento '${tipo}':`, err?.message || err);
  }
}

export interface FilaAbusoCatalogo {
  fecha: string;
  creado: number;
  limite: number;
  honeypot: number;
  validacion: number;
  producto: number;
  totalEventos: number;
}

/**
 * Obtiene el reporte diario para los últimos `dias` días (por defecto 14).
 */
export async function obtenerReporteAbuso(dias = 14): Promise<FilaAbusoCatalogo[]> {
  const fechas: string[] = [];
  const ahora = new Date();
  for (let i = 0; i < dias; i++) {
    const d = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000);
    fechas.push(fechaCaracas(d));
  }

  const model = getContadorModel();
  const docs = await model.find({ fecha: { $in: fechas } });
  const mapa = new Map<string, Record<TipoEventoCatalogo, number>>();

  for (const f of fechas) {
    mapa.set(f, { creado: 0, limite: 0, honeypot: 0, validacion: 0, producto: 0 });
  }

  for (const doc of docs) {
    const f = doc.fecha;
    if (mapa.has(f)) {
      const reg = mapa.get(f)!;
      const t = doc.tipo as TipoEventoCatalogo;
      if (t in reg) {
        reg[t] = (reg[t] || 0) + (doc.cantidad || 0);
      }
    }
  }

  const filas: FilaAbusoCatalogo[] = [];
  for (const f of fechas) {
    const r = mapa.get(f)!;
    filas.push({
      fecha: f,
      creado: r.creado || 0,
      limite: r.limite || 0,
      honeypot: r.honeypot || 0,
      validacion: r.validacion || 0,
      producto: r.producto || 0,
      totalEventos: (r.limite || 0) + (r.honeypot || 0) + (r.validacion || 0) + (r.producto || 0),
    });
  }

  return filas;
}

/**
 * Obtiene el total de carritos web creados en un rango de fechas [inicio, fin].
 * Si no se especifican fechas, cuenta todos los registros de tipo "creado".
 */
export async function obtenerTotalCreados(inicioStr?: string, finStr?: string): Promise<number> {
  const model = getContadorModel();
  const query: any = { tipo: "creado" };
  if (inicioStr || finStr) {
    query.fecha = {};
    if (inicioStr) query.fecha.$gte = inicioStr;
    if (finStr) query.fecha.$lte = finStr;
  }
  const docs = await model.find(query);
  let total = 0;
  for (const doc of docs) {
    total += doc.cantidad || 0;
  }
  return total;
}

module.exports = {
  fechaCaracas,
  registrarEventoCatalogo,
  obtenerReporteAbuso,
  obtenerTotalCreados,
};
