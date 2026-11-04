/**
 * scripts/regenerar-zoom-ciudades.ts (F1-8)
 *
 * Regenera services/zoomCiudades.ts con los códigos de oficina de Zoom (API pública). Lo usa el dueño o un
 * desarrollador cuando el aviso semanal (services/zoomCiudadesMonitor.ts) dice que Zoom cambió códigos.
 *
 *   npx tsx scripts/regenerar-zoom-ciudades.ts --seco   solo compara y muestra cuántas oficinas cambian
 *   npx tsx scripts/regenerar-zoom-ciudades.ts          escribe services/zoomCiudades.ts si hay cambios
 *
 * Consulta getCiudades y luego getOficinas para cada codciudad de 1 a 240 más las de getCiudades (una petición
 * por segundo). Si una consulta falla, se aborta sin escribir nada. No usa .env ni base de datos.
 * Requiere red: NO va en scripts/ci.sh.
 */
import axios from "axios";
import fs from "node:fs";
import path from "node:path";
import { CODIGO_CIUDAD_POR_OFICINA_ZOOM } from "../services/zoomCiudades";
import { compararTablaZoom, extraerOficinasZoom, porNumero } from "../services/zoomCiudadesComparacion";

const ZOOM_BASE = "https://api.zoom.red/canguroazul";
const TIMEOUT_MS = 8000;
const ESPERA_MS = 1000;
const RANGO_MAX = 240;
const ARCHIVO = path.join(__dirname, "..", "services", "zoomCiudades.ts");
const seco = process.argv.includes("--seco");

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cabecera(fecha: string): string {
  return `/**
 * services/zoomCiudades.ts (F1-8, regenerado ${fecha})
 *
 * Código de ciudad de Zoom (ciudad_destinatario de CalcularTarifa) por código de oficina (codoficina / sku del
 * directorio de sucursales). Sirve para las oficinas en ciudades que getCiudades no lista: Zoom solo lista 38
 * ciudades en getCiudades, pero sus oficinas están en más ciudades, y sin este dato el estimado no sale.
 *
 * Origen: getOficinas consultado para cada codciudad de 1 a 240 y para las de getCiudades (una petición por
 * segundo). Cada oficina queda asociada a la codciudad donde Zoom la lista. Solo tiene números: los nombres de
 * ciudad no van en el código.
 *
 * Se usa primero que la búsqueda por nombre. services/zoomCiudadesMonitor.ts revisa esta tabla una vez por semana
 * y avisa si Zoom cambió códigos. Para regenerarla (requiere red, no va en ci.sh):
 *   npx tsx scripts/regenerar-zoom-ciudades.ts --seco   (solo muestra cuántas cambian)
 *   npx tsx scripts/regenerar-zoom-ciudades.ts          (escribe este archivo si hay cambios)
 */

export const CODIGO_CIUDAD_POR_OFICINA_ZOOM: Record<string, number> = {`;
}

function cuerpo(tabla: Record<string, number>): string {
  const claves = Object.keys(tabla).sort(porNumero);
  const lineas: string[] = [];
  for (let i = 0; i < claves.length; i += 4) {
    lineas.push("  " + claves.slice(i, i + 4).map((k) => `${k}: ${tabla[k]},`).join(" "));
  }
  return lineas.join("\n");
}

async function pedir(url: string): Promise<any> {
  const { data } = await axios.get(url, { timeout: TIMEOUT_MS });
  return data;
}

async function main() {
  const tablaActual: Record<string, number> = { ...CODIGO_CIUDAD_POR_OFICINA_ZOOM };

  console.log("▶ Lista de ciudades (getCiudades)…");
  const dataCiudades = await pedir(`${ZOOM_BASE}/getCiudades`);
  const listaCiudades: any[] = Array.isArray(dataCiudades) ? dataCiudades : dataCiudades?.entidadRespuesta || [];
  const codciudades = new Set<string>();
  for (let c = 1; c <= RANGO_MAX; c++) codciudades.add(String(c));
  listaCiudades.forEach((c: any) => {
    if (c && c.codciudad !== undefined && c.codciudad !== null) codciudades.add(String(c.codciudad));
  });
  const orden = [...codciudades].sort(porNumero);
  console.log(`▶ Oficinas por codciudad: ${orden.length} consultas (una por segundo)…`);

  const oficinasPorCiudad: Record<string, string[]> = {};
  for (let i = 0; i < orden.length; i++) {
    await esperar(ESPERA_MS);
    const cod = orden[i];
    try {
      const oficinas = extraerOficinasZoom(await pedir(`${ZOOM_BASE}/getOficinas?codciudad=${cod}&codservicio=1`));
      if (oficinas.length > 0) oficinasPorCiudad[cod] = oficinas;
    } catch (err: any) {
      const motivo = err?.response?.status || err?.message || "red";
      console.error(`❌ Falló la consulta de codciudad ${cod} (${motivo}). Se aborta sin escribir. Repetir más tarde.`);
      process.exit(1);
    }
    if ((i + 1) % 40 === 0) console.log(`  … ${i + 1}/${orden.length}`);
  }

  // Cada oficina a una sola codciudad: si Zoom la lista en varias, se queda con la de la tabla actual si está.
  const candidatos = new Map<string, string[]>();
  Object.keys(oficinasPorCiudad).forEach((cod) => {
    oficinasPorCiudad[cod].forEach((o) => candidatos.set(o, [...(candidatos.get(o) || []), cod]));
  });
  const nueva: Record<string, number> = {};
  candidatos.forEach((donde, oficina) => {
    const actual = tablaActual[oficina];
    nueva[oficina] = Number(actual !== undefined && donde.includes(String(actual)) ? actual : [...donde].sort(porNumero)[0]);
  });

  const comp = compararTablaZoom(tablaActual, oficinasPorCiudad);
  const total = comp.cambiadas.length + comp.desaparecidas.length + comp.nuevas.length;
  console.log("");
  console.log(`Oficinas en la tabla actual: ${Object.keys(tablaActual).length}`);
  console.log(`Oficinas que Zoom lista hoy: ${Object.keys(nueva).length}`);
  console.log(`Cambiadas: ${comp.cambiadas.length} · Desaparecidas: ${comp.desaparecidas.length} · Nuevas: ${comp.nuevas.length}`);
  comp.cambiadas.slice(0, 20).forEach((c) => console.log(`  cambia  oficina ${c.oficina}: ${c.antes} -> ${c.ahora}`));
  comp.desaparecidas.slice(0, 20).forEach((o) => console.log(`  falta   oficina ${o}`));
  comp.nuevas.slice(0, 20).forEach((n) => console.log(`  nueva   oficina ${n.oficina} (codciudad ${n.codciudad})`));

  if (seco) {
    console.log("\nModo --seco: no se escribe nada.");
    return;
  }
  if (total === 0) {
    console.log("\nSin cambios: no se escribe el archivo.");
    return;
  }
  const fecha = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(ARCHIVO, `${cabecera(fecha)}\n${cuerpo(nueva)}\n};\n`, "utf8");
  console.log(`\nEscrito ${path.relative(process.cwd(), ARCHIVO)} (${Object.keys(nueva).length} oficinas, fecha ${fecha}).`);
}

main().catch((err) => {
  console.error("❌", err?.message || err);
  process.exit(1);
});
