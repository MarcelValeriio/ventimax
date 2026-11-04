/**
 * services/zoomCiudadesMonitor.ts
 *
 * Vigila los códigos de oficina de Zoom que usa services/zoomCiudades.ts. Si Zoom los cambia, el estimado de
 * envío de Zoom deja de salir o sale mal. Solo avisa (log + push a administradores) y guarda el resultado en
 * Setting ("zoomCodigosRevision"). No cambia la tabla: eso lo hace scripts/regenerar-zoom-ciudades.ts.
 *
 * Una consulta fallida por red no cuenta como cambio: la revisión queda como "no se pudo revisar" y se reintenta
 * al día siguiente. Solo se avisa cuando cambia el resultado (no se repite el mismo aviso cada semana).
 */

import axios from "axios";
import { createHash } from "node:crypto";
import {
  compararTablaZoom,
  extraerOficinasZoom,
  porNumero,
  type ResultadoComparacionZoom,
} from "./zoomCiudadesComparacion";

export { compararTablaZoom, extraerOficinasZoom };
export type { CambioOficinaZoom, ResultadoComparacionZoom } from "./zoomCiudadesComparacion";

export interface RevisionZoom extends ResultadoComparacionZoom {
  fecha: string; // AAAA-MM-DD (UTC) de la revisión
  ejecutadaEn: number; // timestamp ms
  ok: boolean;
  error?: string;
  firma: string; // huella de cambiadas + desaparecidas; "" si no hay alarma
  fallosSeguidos?: number; // revisiones fallidas seguidas (se pone a 0 con una revisión ok)
}
const pushService = require("./pushService");
const { CODIGO_CIUDAD_POR_OFICINA_ZOOM } = require("./zoomCiudades");
const { hayEmpresasCon, ZOOM_BASE, TIMEOUT_MS } = require("./cotizadorEnvio");

let Setting = require("../models/Setting");
if (process.env.NODE_ENV === "test") {
  Setting = require("./dbLocal").getSettingModel();
}

export const CLAVE_REVISION_ZOOM = "zoomCodigosRevision";
export const ESPERA_ZOOM_MS = 1000; // una consulta por segundo
const MS_DIA = 24 * 60 * 60 * 1000;
const DIAS_SI_TODO_OK = 7;
export const FALLOS_PARA_AVISO = 3; // 3 revisiones fallidas seguidas (~3 días) avisan una sola vez por racha

/** Consulta las oficinas de una codciudad. Lanza si falla (sin reintentos). */
export async function consultarOficinasZoom(codciudad: string): Promise<string[]> {
  const url = `${ZOOM_BASE}/getOficinas?codciudad=${encodeURIComponent(codciudad)}&codservicio=1`;
  const { data } = await axios.get(url, { timeout: TIMEOUT_MS });
  return extraerOficinasZoom(data);
}

function firmaDe(r: ResultadoComparacionZoom): string {
  if (r.cambiadas.length === 0 && r.desaparecidas.length === 0) return "";
  const partes = [
    ...r.cambiadas.map((c) => `${c.oficina}>${c.ahora}`),
    ...r.desaparecidas.map((o) => `${o}-`),
  ].sort();
  return createHash("sha256").update(partes.join("|")).digest("hex").slice(0, 16);
}

function fechaUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function leerRevisionZoom(): Promise<RevisionZoom | null> {
  const doc: any = await Setting.findOne({ key: CLAVE_REVISION_ZOOM });
  return doc?.value || null;
}

async function guardarRevisionZoom(rev: RevisionZoom): Promise<void> {
  await Setting.findOneAndUpdate(
    { key: CLAVE_REVISION_ZOOM },
    { key: CLAVE_REVISION_ZOOM, value: rev },
    { upsert: true },
  );
}

/** Aviso: log siempre que haya cambios; push a administradores solo si el resultado es nuevo. */
async function avisar(rev: RevisionZoom): Promise<void> {
  console.warn(
    `⚠️ [Cotizador] Zoom cambió códigos de oficina: ${rev.cambiadas.length} cambiadas, ${rev.desaparecidas.length} desaparecidas. Regenerar services/zoomCiudades.ts`,
  );
  try {
    await pushService.sendToAllAdmins({
      title: "Cotizador de envíos: Zoom cambió códigos",
      body: `${rev.cambiadas.length} oficinas cambiaron de ciudad y ${rev.desaparecidas.length} ya no aparecen. Hay que regenerar la tabla de Zoom.`,
      url: "/panel",
      tag: "zoom-codigos",
    });
  } catch (err: any) {
    console.error("❌ [Cotizador] Push de códigos Zoom:", err?.message || err);
  }
}

/** Aviso de racha de fallos: log y push, una sola vez por racha (se dispara al llegar justo al umbral). */
async function avisarFallos(error: string): Promise<void> {
  console.warn(
    `⚠️ [Cotizador] No se pudieron revisar los códigos de Zoom ${FALLOS_PARA_AVISO} días seguidos: ${error}`,
  );
  try {
    await pushService.sendToAllAdmins({
      title: "Cotizador de envíos: no se revisan los códigos de Zoom",
      body: `La revisión de códigos de Zoom falló ${FALLOS_PARA_AVISO} días seguidos (${error}). Revisar la conexión con Zoom.`,
      url: "/panel",
      tag: "zoom-codigos-fallo",
    });
  } catch (err: any) {
    console.error("❌ [Cotizador] Push de fallos Zoom:", err?.message || err);
  }
}

/**
 * Revisa todas las codciudades que aparecen en la tabla (una por segundo). Si una consulta falla, se corta, no se
 * compara nada y no hay alarma. Guarda el resultado en Setting. `espera` se inyecta en las pruebas.
 */
export async function revisarCodigosZoom(
  opciones: { espera?: (ms: number) => Promise<void>; ahora?: Date } = {},
): Promise<RevisionZoom> {
  const espera = opciones.espera || ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const ahora = opciones.ahora || new Date();
  const previo = await leerRevisionZoom().catch(() => null);
  const tabla: Record<string, number> = CODIGO_CIUDAD_POR_OFICINA_ZOOM;
  const codciudades = [...new Set(Object.values(tabla).map(String))].sort(porNumero);

  const oficinasPorCiudad: Record<string, string[]> = {};
  let error: string | null = null;
  for (let i = 0; i < codciudades.length; i++) {
    if (i > 0) await espera(ESPERA_ZOOM_MS);
    try {
      oficinasPorCiudad[codciudades[i]] = await consultarOficinasZoom(codciudades[i]);
    } catch (err: any) {
      error = `codciudad ${codciudades[i]}: ${err?.response?.status || err?.message || "red"}`;
      break;
    }
  }

  if (error) {
    const fallosSeguidos = (previo?.fallosSeguidos || 0) + 1;
    const rev: RevisionZoom = {
      fecha: fechaUtc(ahora), ejecutadaEn: ahora.getTime(), ok: false, error,
      cambiadas: [], desaparecidas: [], nuevas: [],
      firma: previo?.firma || "", // un fallo no cambia el estado del aviso
      fallosSeguidos,
    };
    console.error(`❌ [Cotizador] No se pudo revisar los códigos de Zoom (${error}). Se reintenta mañana.`);
    await guardarRevisionZoom(rev);
    if (fallosSeguidos === FALLOS_PARA_AVISO) await avisarFallos(error);
    return rev;
  }

  const comparacion = compararTablaZoom(tabla, oficinasPorCiudad);
  const firma = firmaDe(comparacion);
  const rev: RevisionZoom = {
    fecha: fechaUtc(ahora), ejecutadaEn: ahora.getTime(), ok: true, ...comparacion, firma, fallosSeguidos: 0,
  };
  if (comparacion.nuevas.length > 0) {
    console.log(`ℹ️ [Cotizador] Zoom listó ${comparacion.nuevas.length} oficinas que no están en la tabla (solo informativo).`);
  }
  if (firma && firma !== (previo?.firma || "")) {
    await avisar(rev);
  }
  await guardarRevisionZoom(rev);
  return rev;
}

/** ¿Toca revisar? Con todo bien, cada 7 días; tras un fallo, al día siguiente. */
export function debeRevisarZoom(previo: RevisionZoom | null, ahora: number): boolean {
  if (!previo) return true;
  const edad = ahora - previo.ejecutadaEn;
  return previo.ok ? edad >= DIAS_SI_TODO_OK * MS_DIA : edad >= MS_DIA;
}

/** Job (agenda, cada día): revisa una vez por semana y solo si hay empresas con cotizador "zoom". Nunca lanza. */
export async function ejecutarRevisionZoomSemanal(
  ahora: Date = new Date(),
  opciones: { espera?: (ms: number) => Promise<void> } = {},
): Promise<void> {
  try {
    if (!debeRevisarZoom(await leerRevisionZoom(), ahora.getTime())) return;
    if (!(await hayEmpresasCon("zoom"))) return;
    await revisarCodigosZoom({ ahora, espera: opciones.espera });
  } catch (err: any) {
    console.error("❌ [Cotizador] Revisión de códigos Zoom:", err?.message || err);
  }
}

module.exports = {
  CLAVE_REVISION_ZOOM,
  FALLOS_PARA_AVISO,
  compararTablaZoom,
  extraerOficinasZoom,
  consultarOficinasZoom,
  revisarCodigosZoom,
  debeRevisarZoom,
  ejecutarRevisionZoomSemanal,
  leerRevisionZoom,
};
