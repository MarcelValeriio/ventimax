/**
 * scripts/sync-sucursales.ts
 *
 * Sincronización manual de directorios de sucursales de envío nacional (Zoom, MRW y Tealca).
 * Normaliza las respuestas y realiza upsert en MongoDB (colección Sucursal).
 *
 * SCRIPT EXCLUSIVAMENTE MANUAL:
 * - Es solo de uso manual para el operador técnico o administrador.
 * - NUNCA se llama desde el servidor ni desde un cron (Agenda u otros procesos automáticos).
 * - Para bases locales (127.0.0.1 o localhost), escribe directamente.
 * - Para bases remotas (p. ej. MongoDB Atlas o producción), exige obligatoriamente el parámetro --confirmar
 *   (a menos que se use --simular). Si no se proporciona, aborta inmediatamente con error y no conecta.
 *
 * USO MANUAL:
 *   npx tsx scripts/sync-sucursales.ts --simular             # Descarga y normaliza sin escribir en BD
 *   npx tsx scripts/sync-sucursales.ts                       # En base local (127.0.0.1 / localhost)
 *   npx tsx scripts/sync-sucursales.ts --confirmar           # En base remota (requiere confirmación explícita)
 *
 * REGLAS:
 * - Prohibido llamarlo desde el servidor o desde un cron.
 * - Pausa de al menos 3 segundos entre peticiones externas.
 * - Si una empresa devuelve lista vacía o < 50% de las existentes, NO se toca esa empresa.
 * - Las sucursales que ya no vienen se marcan activa: false (nunca se borran).
 */

import https from "node:https";
import mongoose from "mongoose";
const { normalizarNombreEstado, estadoDeCiudadZoom } = require("../services/estadosVenezuela");

export const URLS_SUCURSALES = {
  zoom: "https://zoom.red/wp-admin/admin-ajax.php?action=asl_load_stores&load_all=1&layout=1",
  mrw: "https://mrwve.com/api/agencias",
  tealca: "https://www.tealca.com/wp-json/tealca-oficinas/v1/offices",
};

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface SucursalNormalizada {
  empresa: "zoom" | "mrw" | "tealca";
  codigo: string;
  nombre: string;
  estado: string;
  ciudad: string;
  direccion: string;
  telefono: string;
  horario: string;
  lat: number | null;
  lng: number | null;
  activa: boolean;
}

/** Descarga contenido JSON vía HTTPS con pausa y headers estándar */
export async function descargarJson(urlStr: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      urlStr,
      {
        timeout: 25000,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "application/json, text/plain, */*",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode} al descargar ${urlStr}`));
          }
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (err: any) {
            reject(new Error(`Error parseando JSON de ${urlStr}: ${err.message}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout al descargar ${urlStr}`));
    });
  });
}

/** Limpia etiquetas HTML y espacios múltiples */
export function limpiarHtml(texto: any): string {
  if (!texto || typeof texto !== "string") return "";
  return texto
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extrae horario legible del formato JSON de open_hours de Zoom */
export function extraerHorarioZoom(openHoursStr: any, daysStr: any): string {
  if (daysStr && typeof daysStr === "string" && daysStr.trim()) {
    const dias = daysStr.trim();
    if (openHoursStr && typeof openHoursStr === "string") {
      try {
        const parsed = JSON.parse(openHoursStr);
        const horasMon = parsed?.mon?.[0];
        if (horasMon && typeof horasMon === "string") {
          return `${dias} ${horasMon}`.slice(0, 120);
        }
      } catch (_e) {}
    }
    return dias.slice(0, 120);
  }
  return "";
}

/**
 * Normaliza los registros de ZOOM.
 * Ciudad sin estado conocido se omite con advertencia (no se inventa).
 */
export function normalizarZoom(rawStores: any[]): SucursalNormalizada[] {
  if (!Array.isArray(rawStores)) return [];
  const salida: SucursalNormalizada[] = [];

  for (const s of rawStores) {
    if (!s || typeof s !== "object") continue;
    const codigo = String(s.sku || s.id || "").trim();
    if (!codigo) continue;

    const ciudad = String(s.city || "").trim().slice(0, 60);
    const estado = estadoDeCiudadZoom(ciudad);
    if (!estado) {
      console.warn(
        `⚠️ [Zoom] Ciudad sin estado venezolano conocido: '${ciudad}' (Oficina: ${codigo} - ${s.title || "Sin nombre"}). Omitida.`
      );
      continue;
    }

    const nombre = String(s.title || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const direccion = String(s.street || "").trim().replace(/\s+/g, " ").slice(0, 300);
    const telefono = String(s.phone || "").trim().replace(/[^\d+]/g, "").slice(0, 30);
    const horario = extraerHorarioZoom(s.open_hours, s.days_str);

    const lat = s.lat !== null && s.lat !== undefined && !isNaN(Number(s.lat)) ? Number(s.lat) : null;
    const lng = s.lng !== null && s.lng !== undefined && !isNaN(Number(s.lng)) ? Number(s.lng) : null;

    salida.push({
      empresa: "zoom",
      codigo,
      nombre,
      estado,
      ciudad,
      direccion,
      telefono,
      horario,
      lat,
      lng,
      activa: true,
    });
  }

  return salida;
}

/**
 * Normaliza los registros de MRW Venezuela.
 */
export function normalizarMrw(rawAgencias: any[]): SucursalNormalizada[] {
  if (!Array.isArray(rawAgencias)) return [];
  const salida: SucursalNormalizada[] = [];

  for (const a of rawAgencias) {
    if (!a || typeof a !== "object") continue;
    const codigo = String(a.codigo || "").trim();
    if (!codigo) continue;

    const estado = normalizarNombreEstado(a.estado);
    if (!estado) {
      console.warn(`⚠️ [MRW] Estado desconocido '${a.estado}' en agencia ${codigo}. Omitida.`);
      continue;
    }

    const nombre = String(a.nombre || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const direccion = String(a.direccion || "").trim().replace(/\s+/g, " ").slice(0, 300);
    const horario = "Lun a Vie 8:00 AM - 5:00 PM";

    const lat = a.latitud !== null && a.latitud !== undefined && !isNaN(Number(a.latitud)) ? Number(a.latitud) : null;
    const lng =
      a.longitud !== null && a.longitud !== undefined && !isNaN(Number(a.longitud)) ? Number(a.longitud) : null;

    salida.push({
      empresa: "mrw",
      codigo,
      nombre,
      estado,
      ciudad: "",
      direccion,
      telefono: "",
      horario,
      lat,
      lng,
      activa: true,
    });
  }

  return salida;
}

/**
 * Extrae teléfono limpio del texto descriptivo de Tealca si coincide con un patrón claro.
 */
export function extraerTelefonoTealca(textoLimpio: string): string {
  if (!textoLimpio) return "";
  // Busca patrones venezolanos como 0414.123.45.67, 0412-1234567, 0424 123 4567, etc.
  const match = textoLimpio.match(/(?:04\d{2}|02\d{2})[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}/);
  if (match) {
    return match[0].replace(/[^\d]/g, "").slice(0, 30);
  }
  return "";
}

/**
 * Normaliza los registros de TEALCA.
 */
export function normalizarTealca(rawOffices: any[]): SucursalNormalizada[] {
  if (!Array.isArray(rawOffices)) return [];
  const salida: SucursalNormalizada[] = [];

  for (const o of rawOffices) {
    if (!o || typeof o !== "object") continue;
    const fields = o.fields || {};
    const post = o.post || {};

    const codigo = String(fields.code || "").trim();
    if (!codigo) continue;

    const estado = normalizarNombreEstado(o.state);
    if (!estado) {
      console.warn(`⚠️ [Tealca] Estado desconocido '${o.state}' en oficina ${codigo}. Omitida.`);
      continue;
    }

    const nombre = String(post.name || "").trim().replace(/\s+/g, " ").slice(0, 80);
    const ciudad = String(o.city || "").trim().slice(0, 60);

    // Extraer coordenadas de url_google_map: https://maps.google.com/?q=10.4760594,-66.5455681
    let lat: number | null = null;
    let lng: number | null = null;
    if (fields.url_google_map && typeof fields.url_google_map === "string") {
      const match = fields.url_google_map.match(/q=([-\d.]+),([-\d.]+)/);
      if (match) {
        lat = Number(match[1]) || null;
        lng = Number(match[2]) || null;
      }
    }

    const textoAcerca = limpiarHtml(fields.acerca_de);
    const telefono = extraerTelefonoTealca(textoAcerca);
    // Usar texto descriptivo limpio como dirección de referencia si no hay campo calle
    const direccion = textoAcerca.slice(0, 300);

    salida.push({
      empresa: "tealca",
      codigo,
      nombre,
      estado,
      ciudad,
      direccion,
      telefono,
      horario: "",
      lat,
      lng,
      activa: true,
    });
  }

  return salida;
}

/**
 * Sincroniza las sucursales de una empresa en el modelo proporcionado.
 * Implementa upsert por { empresa, codigo } y desactivación (activa: false) de desaparecidas.
 */
export async function sincronizarEmpresa(
  empresa: "zoom" | "mrw" | "tealca",
  itemsNuevos: SucursalNormalizada[],
  SucursalModel: any,
  simular = false
): Promise<{
  empresa: string;
  totalNuevas: number;
  activasGuardadas: number;
  desactivadas: number;
  omitidaPorError: boolean;
}> {
  const conteoPrevio = await SucursalModel.countDocuments({ empresa, activa: true });

  // Validación de seguridad contra caídas externas:
  if (itemsNuevos.length === 0) {
    console.warn(
      `🚨 [Sync] Respuesta vacía para ${empresa.toUpperCase()}. Se omite la actualización para proteger los datos existentes.`
    );
    return { empresa, totalNuevas: 0, activasGuardadas: 0, desactivadas: 0, omitidaPorError: true };
  }

  if (conteoPrevio > 0 && itemsNuevos.length < Math.floor(conteoPrevio / 2)) {
    console.warn(
      `🚨 [Sync] ${empresa.toUpperCase()} devolvió ${itemsNuevos.length} sucursales, menos de la mitad de las ${conteoPrevio} previas. Se omite para evitar desastres.`
    );
    return { empresa, totalNuevas: itemsNuevos.length, activasGuardadas: 0, desactivadas: 0, omitidaPorError: true };
  }

  if (simular) {
    console.log(
      `[SIMULAR] ${empresa.toUpperCase()}: ${itemsNuevos.length} sucursales recibidas (${conteoPrevio} previas en BD). Sin cambios.`
    );
    return {
      empresa,
      totalNuevas: itemsNuevos.length,
      activasGuardadas: itemsNuevos.length,
      desactivadas: 0,
      omitidaPorError: false,
    };
  }

  const codigosNuevos = new Set(itemsNuevos.map((i) => i.codigo));

  for (const item of itemsNuevos) {
    await SucursalModel.findOneAndUpdate(
      { empresa: item.empresa, codigo: item.codigo },
      { $set: item },
      { upsert: true, new: true }
    );
  }

  // Las sucursales que estaban en BD y ya no vienen en la lista oficial se marcan activa: false
  const resDesactivadas = await SucursalModel.updateMany(
    {
      empresa,
      codigo: { $nin: Array.from(codigosNuevos) },
      activa: true,
    },
    { $set: { activa: false } }
  );

  const desactivadas = resDesactivadas?.modifiedCount || 0;

  return {
    empresa,
    totalNuevas: itemsNuevos.length,
    activasGuardadas: itemsNuevos.length,
    desactivadas,
    omitidaPorError: false,
  };
}

export async function sincronizarTodas(SucursalModel: any, simular = false) {
  console.log(`🚀 Iniciando sincronización de sucursales (Modo simular: ${simular ? "SÍ" : "NO"})...`);

  // 1. ZOOM
  console.log("\n📦 [1/3] Descargando oficinas de ZOOM...");
  let zoomItems: SucursalNormalizada[] = [];
  try {
    const rawZoom = await descargarJson(URLS_SUCURSALES.zoom);
    zoomItems = normalizarZoom(rawZoom);
    console.log(`✅ Zoom: ${zoomItems.length} sucursales normalizadas con éxito.`);
  } catch (err: any) {
    console.error(`❌ Error descargando Zoom: ${err.message}`);
  }

  // Pausa de 3 segundos
  await new Promise((r) => setTimeout(r, 3000));

  // 2. MRW
  console.log("\n📦 [2/3] Descargando agencias de MRW Venezuela...");
  let mrwItems: SucursalNormalizada[] = [];
  try {
    const rawMrw = await descargarJson(URLS_SUCURSALES.mrw);
    mrwItems = normalizarMrw(rawMrw);
    console.log(`✅ MRW: ${mrwItems.length} agencias normalizadas con éxito.`);
  } catch (err: any) {
    console.error(`❌ Error descargando MRW: ${err.message}`);
  }

  // Pausa de 3 segundos
  await new Promise((r) => setTimeout(r, 3000));

  // 3. TEALCA
  console.log("\n📦 [3/3] Descargando oficinas de TEALCA...");
  let tealcaItems: SucursalNormalizada[] = [];
  try {
    const rawTealca = await descargarJson(URLS_SUCURSALES.tealca);
    tealcaItems = normalizarTealca(rawTealca?.data || []);
    console.log(`✅ Tealca: ${tealcaItems.length} oficinas normalizadas con éxito.`);
  } catch (err: any) {
    console.error(`❌ Error descargando Tealca: ${err.message}`);
  }

  // Guardar / simular
  const rZoom = await sincronizarEmpresa("zoom", zoomItems, SucursalModel, simular);
  const rMrw = await sincronizarEmpresa("mrw", mrwItems, SucursalModel, simular);
  const rTealca = await sincronizarEmpresa("tealca", tealcaItems, SucursalModel, simular);

  return { zoom: rZoom, mrw: rMrw, tealca: rTealca };
}

export function esBaseLocal(uri: string): boolean {
  if (!uri || typeof uri !== "string") return false;
  return uri.includes("127.0.0.1") || uri.includes("localhost");
}

export function validarPermisoEjecucion({
  uri,
  simular,
  confirmar,
}: {
  uri: string;
  simular: boolean;
  confirmar: boolean;
}): { ok: boolean; motivo?: string } {
  if (simular) return { ok: true };
  if (esBaseLocal(uri)) return { ok: true };
  if (!confirmar) {
    return {
      ok: false,
      motivo:
        "Se intentó sincronizar contra una base de datos remota sin el parámetro obligatorio --confirmar. Operación abortada para proteger la base de datos.",
    };
  }
  return { ok: true };
}

// ─── Ejecución CLI directa ───
if (require.main === module) {
  (async () => {
    const simular = process.argv.includes("--simular");
    const confirmar = process.argv.includes("--confirmar");
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ventimax";

    // Salvaguarda estricta: bases remotas sin --simular exigen --confirmar
    const permiso = validarPermisoEjecucion({ uri, simular, confirmar });
    if (!permiso.ok) {
      console.error(`\n❌ ${permiso.motivo}`);
      console.error(`   Base indicada: ${uri.replace(/\/\/[^@]+@/, "//***@")}`);
      console.error(`   Para escribir en una base remota debes pasar explícitamente: --confirmar\n`);
      process.exit(1);
    }

    const isLocal = esBaseLocal(uri);
    if (!isLocal && !simular) {
      console.log(`⚠️ Conectando a base remota con confirmación: ${uri.replace(/\/\/[^@]+@/, "//***@")}`);
    }

    try {
      await mongoose.connect(uri);
      const Sucursal = require("../models/Sucursal");
      const resumen = await sincronizarTodas(Sucursal, simular);
      console.log("\n========================================================");
      console.log("📊 RESUMEN DE SINCRONIZACIÓN:");
      console.log(JSON.stringify(resumen, null, 2));
      console.log("========================================================");
      await mongoose.disconnect();
      process.exit(0);
    } catch (err: any) {
      console.error("❌ Error en ejecución:", err.message);
      process.exit(1);
    }
  })();
}

module.exports = {
  URLS_SUCURSALES,
  limpiarHtml,
  extraerHorarioZoom,
  extraerTelefonoTealca,
  normalizarZoom,
  normalizarMrw,
  normalizarTealca,
  sincronizarEmpresa,
  sincronizarTodas,
  esBaseLocal,
  validarPermisoEjecucion,
};
