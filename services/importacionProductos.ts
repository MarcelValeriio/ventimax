/**
 * services/importacionProductos.ts (F1-3)
 *
 * Importación y exportación de productos por Excel (.xlsx) o CSV, con vista previa.
 * - Parseo (xlsx con ExcelJS, CSV propio): solo lee valores; las fórmulas nunca se evalúan (se lee el valor guardado).
 * - Análisis puro (sin BD): `analizarImportacion` recibe los productos existentes y devuelve nuevos, cambios
 *   (antes/después), sin cambio, errores por fila, productos que no vienen en el archivo y lo que hay que aplicar.
 * - Usa `services/productoAmpliado.ts` para validar y normalizar SKU, OEM y compatibilidad.
 *
 * Las columnas de la plantilla están en COLUMNAS_PRODUCTOS y COLUMNAS_COMPATIBILIDAD. El formato definitivo
 * (columnas de la plantilla del cliente de repuestos) queda pendiente: cambiarlo solo aquí.
 * El controlador (adminController.ts) lee la BD, llama a este servicio y aplica el resultado.
 */
import ExcelJS from "exceljs";
import { LIMITES, normalizarTexto, normalizarCodigoOEM, normalizarCompatibilidad, validarProductoAmpliado } from "./productoAmpliado";

export const LIMITES_IMPORTACION = {
  tamanoBytes: 2 * 1024 * 1024, // 2 MB por archivo
  filas: 2000, // por hoja (o por archivo CSV), sin contar el encabezado
  columnas: 40, // columnas que se leen de cada hoja
  nombre: 200,
  descripcion: 1000,
  categoriaNombre: 60,
  categoriasPorProducto: 10,
  celda: 2000, // caracteres que se leen de una celda
};

export const NOMBRE_HOJA = { productos: "Productos", compatibilidad: "Compatibilidad" };

type Columna = { clave: string; titulo: string };

/** Hoja `Productos` (una fila por producto). Ver docs/f1-producto-ampliado.md §3.1 */
export const COLUMNAS_PRODUCTOS: Columna[] = [
  { clave: "sku", titulo: "SKU" },
  { clave: "nombre", titulo: "Nombre" },
  { clave: "categorias", titulo: "Categorías" },
  { clave: "precio", titulo: "Precio" },
  { clave: "stock", titulo: "Stock" },
  { clave: "controlarStock", titulo: "Controlar stock" },
  { clave: "marcaFabricante", titulo: "Marca fabricante" },
  { clave: "codigosOEM", titulo: "Códigos OEM" },
  { clave: "grupoEquivalencia", titulo: "Grupo equivalencia" },
  { clave: "descripcion", titulo: "Descripción" },
  { clave: "activo", titulo: "Activo" },
];

/** Hoja `Compatibilidad` (una fila por vehículo compatible). Ver docs/f1-producto-ampliado.md §3.1 */
export const COLUMNAS_COMPATIBILIDAD: Columna[] = [
  { clave: "sku", titulo: "SKU" },
  { clave: "marca", titulo: "Marca" },
  { clave: "modelo", titulo: "Modelo" },
  { clave: "anioDesde", titulo: "Año desde" },
  { clave: "anioHasta", titulo: "Año hasta" },
  { clave: "motor", titulo: "Motor" },
  { clave: "version", titulo: "Versión" },
  { clave: "nota", titulo: "Nota" },
];

/** Columnas que deben existir en el encabezado. El resto son opcionales. */
const OBLIGATORIAS_PRODUCTOS = ["sku", "nombre", "precio"];
const OBLIGATORIAS_COMPATIBILIDAD = ["sku", "marca", "modelo"];

const MIMES_XLSX = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream", // algunos navegadores envían este tipo para .xlsx
];
const MIMES_CSV = ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"];

export interface ArchivoImportacion {
  ok: boolean;
  formato?: "xlsx" | "csv";
  error?: string;
}

/**
 * Valida extensión, MIME y tamaño de un archivo subido. Función pura: la usan el filtro de multer y el controlador.
 * `soloCsv` = el archivo de compatibilidad (segundo archivo de un CSV) no puede ser Excel.
 */
export function validarArchivoImportacion({
  nombre,
  mimetype,
  tamano,
  soloCsv = false,
}: {
  nombre: string;
  mimetype: string;
  tamano: number;
  soloCsv?: boolean;
}): ArchivoImportacion {
  const nombreLimpio = String(nombre || "").toLowerCase();
  const extension = nombreLimpio.slice(nombreLimpio.lastIndexOf("."));
  const mime = String(mimetype || "").toLowerCase();
  if (tamano > LIMITES_IMPORTACION.tamanoBytes) {
    return { ok: false, error: "El archivo no puede exceder 2 MB." };
  }
  if (extension === ".xlsx" && !soloCsv) {
    if (!MIMES_XLSX.includes(mime)) return { ok: false, error: "El tipo de archivo no coincide con un Excel (.xlsx)." };
    return { ok: true, formato: "xlsx" };
  }
  if (extension === ".csv") {
    if (!MIMES_CSV.includes(mime)) return { ok: false, error: "El tipo de archivo no coincide con un CSV." };
    return { ok: true, formato: "csv" };
  }
  return { ok: false, error: soloCsv ? "El archivo de compatibilidad debe ser .csv." : "Solo se aceptan archivos .xlsx o .csv." };
}

/** Texto de una celda. Las fórmulas devuelven su valor guardado; nunca se ejecutan. */
export function textoCelda(valor: any): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object") {
    if ("result" in valor) return textoCelda(valor.result); // fórmula: solo el valor calculado
    if (Array.isArray(valor.richText)) return valor.richText.map((t: any) => t.text || "").join("");
    if ("text" in valor) return String(valor.text ?? ""); // hipervínculo
    return ""; // errores de hoja (#N/A…) y objetos desconocidos
  }
  return String(valor).slice(0, LIMITES_IMPORTACION.celda);
}

/** Separa un CSV (RFC 4180 con comillas). El separador es `;` o `,` según la primera línea. */
export function parsearCsv(texto: string): string[][] {
  const fuente = String(texto || "").replace(/^﻿/, "");
  const primeraLinea = fuente.split(/\r?\n/, 1)[0] || "";
  const separador = primeraLinea.split(";").length > primeraLinea.split(",").length ? ";" : ",";
  const registros: string[][] = [];
  let registro: string[] = [];
  let campo = "";
  let entreComillas = false;
  for (let i = 0; i < fuente.length; i++) {
    const c = fuente[i];
    if (entreComillas) {
      if (c === '"') {
        if (fuente[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        campo += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === separador) {
      registro.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && fuente[i + 1] === "\n") i++;
      registro.push(campo);
      registros.push(registro);
      registro = [];
      campo = "";
    } else {
      campo += c;
    }
  }
  if (campo !== "" || registro.length > 0) {
    registro.push(campo);
    registros.push(registro);
  }
  return registros;
}

interface FilaTabla {
  numero: number; // número de fila en el archivo (1 = encabezado)
  celdas: Record<string, string>;
}

export interface TablaImportada {
  hoja: string;
  filas: FilaTabla[];
}

/** Convierte filas crudas (encabezado primero) en filas con las claves de las columnas. */
function construirTabla(
  hoja: string,
  columnas: Columna[],
  obligatorias: string[],
  entradas: { numero: number; valores: string[] }[],
): { tabla: TablaImportada; errores: string[] } {
  const errores: string[] = [];
  const vacia: TablaImportada = { hoja, filas: [] };
  if (entradas.length === 0) {
    errores.push(`La hoja ${hoja} está vacía.`);
    return { tabla: vacia, errores };
  }
  const encabezado = entradas[0].valores.map((v) => normalizarTexto(v));
  const indices: Record<string, number> = {};
  for (const col of columnas) {
    const pos = encabezado.indexOf(normalizarTexto(col.titulo));
    if (pos >= 0) indices[col.clave] = pos;
  }
  for (const clave of obligatorias) {
    if (indices[clave] === undefined) {
      const col = columnas.find((c) => c.clave === clave);
      errores.push(`Falta la columna "${col?.titulo}" en la hoja ${hoja}.`);
    }
  }
  const datos = entradas.slice(1);
  if (datos.length > LIMITES_IMPORTACION.filas) {
    errores.push(`La hoja ${hoja} tiene más de ${LIMITES_IMPORTACION.filas} filas. Divide el archivo.`);
  }
  if (errores.length) return { tabla: vacia, errores };

  const filas: FilaTabla[] = datos.map((entrada) => {
    const celdas: Record<string, string> = {};
    for (const col of columnas) {
      const pos = indices[col.clave];
      celdas[col.clave] = pos === undefined ? "" : String(entrada.valores[pos] ?? "").trim();
    }
    return { numero: entrada.numero, celdas };
  });
  return { tabla: { hoja, filas }, errores };
}

/** Lee una hoja de Excel: solo valores, máximo LIMITES_IMPORTACION.columnas columnas. */
function entradasDeHoja(hoja: ExcelJS.Worksheet): { numero: number; valores: string[] }[] {
  const entradas: { numero: number; valores: string[] }[] = [];
  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    const valores: string[] = [];
    for (let c = 1; c <= LIMITES_IMPORTACION.columnas; c++) {
      valores.push(textoCelda(fila.getCell(c).value));
    }
    // Encabezado + tope + 1: basta para detectar que hay más filas de las permitidas (sin guardar el resto)
    if (valores.some((v) => v.trim() !== "") && entradas.length <= LIMITES_IMPORTACION.filas + 1) {
      entradas.push({ numero, valores });
    }
  });
  return entradas;
}

function entradasDeCsv(texto: string): { numero: number; valores: string[] }[] {
  return parsearCsv(texto)
    .map((valores, i) => ({ numero: i + 1, valores: valores.slice(0, LIMITES_IMPORTACION.columnas) }))
    .filter((e) => e.valores.some((v) => v.trim() !== ""));
}

export interface LecturaImportacion {
  formato: "xlsx" | "csv";
  productos: TablaImportada | null;
  compatibilidad: TablaImportada | null;
  errores: string[];
}

/**
 * Lee el archivo (o los dos CSV) y devuelve las tablas de Productos y Compatibilidad.
 * Errores de formato (hoja que falta, columna que falta, más de 2000 filas, archivo que no abre) van en `errores`.
 */
export async function leerArchivoImportacion({
  nombre,
  buffer,
  compatibilidad,
}: {
  nombre: string;
  buffer: Buffer;
  compatibilidad?: Buffer | null;
}): Promise<LecturaImportacion> {
  const extension = String(nombre || "").toLowerCase().endsWith(".csv") ? "csv" : "xlsx";
  if (extension === "csv") {
    if (buffer.includes(0)) return { formato: "csv", productos: null, compatibilidad: null, errores: ["El CSV no es un archivo de texto válido."] };
    const p = construirTabla(NOMBRE_HOJA.productos, COLUMNAS_PRODUCTOS, OBLIGATORIAS_PRODUCTOS, entradasDeCsv(buffer.toString("utf8")));
    let c: { tabla: TablaImportada; errores: string[] } = { tabla: { hoja: NOMBRE_HOJA.compatibilidad, filas: [] }, errores: [] };
    if (compatibilidad) {
      if (compatibilidad.includes(0)) return { formato: "csv", productos: null, compatibilidad: null, errores: ["El CSV de compatibilidad no es un archivo de texto válido."] };
      c = construirTabla(NOMBRE_HOJA.compatibilidad, COLUMNAS_COMPATIBILIDAD, OBLIGATORIAS_COMPATIBILIDAD, entradasDeCsv(compatibilidad.toString("utf8")));
    }
    return {
      formato: "csv",
      productos: p.tabla,
      compatibilidad: compatibilidad ? c.tabla : null,
      errores: [...p.errores, ...c.errores],
    };
  }

  // Excel: se leen las dos hojas del mismo archivo
  if (compatibilidad) {
    return { formato: "xlsx", productos: null, compatibilidad: null, errores: ["El archivo de compatibilidad solo se usa con CSV. En Excel va en la hoja Compatibilidad."] };
  }
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer as any);
  } catch (_e) {
    return { formato: "xlsx", productos: null, compatibilidad: null, errores: ["No se pudo leer el archivo. Revisa que sea un Excel (.xlsx) válido."] };
  }
  const buscarHoja = (titulo: string): ExcelJS.Worksheet | undefined =>
    libro.worksheets.find((h) => normalizarTexto(h.name) === normalizarTexto(titulo));
  const hojaProductos = buscarHoja(NOMBRE_HOJA.productos);
  const hojaCompat = buscarHoja(NOMBRE_HOJA.compatibilidad);
  const errores: string[] = [];
  let productos: TablaImportada | null = null;
  let compat: TablaImportada | null = null;
  if (!hojaProductos) {
    errores.push(`Falta la hoja "${NOMBRE_HOJA.productos}".`);
  } else {
    const r = construirTabla(NOMBRE_HOJA.productos, COLUMNAS_PRODUCTOS, OBLIGATORIAS_PRODUCTOS, entradasDeHoja(hojaProductos));
    productos = r.tabla;
    errores.push(...r.errores);
  }
  // La hoja de compatibilidad es opcional: sin ella, no se cambia la compatibilidad de ningún producto
  if (hojaCompat) {
    const r = construirTabla(NOMBRE_HOJA.compatibilidad, COLUMNAS_COMPATIBILIDAD, OBLIGATORIAS_COMPATIBILIDAD, entradasDeHoja(hojaCompat));
    compat = r.tabla;
    errores.push(...r.errores);
  }
  return { formato: "xlsx", productos, compatibilidad: compat, errores };
}

// ---------- Convertidores de texto a valor ----------

/** Vacío = la celda no trae dato (en una actualización, no se cambia el campo). */
const vacio = (s: string | undefined) => !s || s.trim() === "";

function numeroPrecio(texto: string): number {
  let t = texto.replace(/\s/g, "").replace(/^\$/, "");
  if (t.includes(",") && !t.includes(".")) t = t.replace(",", ".");
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

function enteroNoNegativo(texto: string): number {
  const t = texto.trim();
  return /^\d+(\.0+)?$/.test(t) ? Math.trunc(Number(t)) : NaN;
}

function anio(texto: string): number {
  const t = texto.trim();
  return /^\d{4}(\.0+)?$/.test(t) ? Math.trunc(Number(t)) : NaN;
}

/** sí/no en español o inglés. null = valor no válido. */
function siNo(texto: string): boolean | null {
  const t = normalizarTexto(texto);
  if (["si", "yes", "true", "1", "x"].includes(t)) return true;
  if (["no", "false", "0"].includes(t)) return false;
  return null;
}

const recortar = (texto: string, max: number) => texto.trim().slice(0, max);

function sinRepetidos(lista: string[]): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const v of lista) {
    const k = normalizarTexto(v);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    out.push(v);
  }
  return out;
}

// ---------- Análisis (sin BD) ----------

export interface ProductoExistente {
  id: string;
  sku?: string;
  name: string;
  price: number;
  stock?: number;
  trackStock?: boolean;
  activo?: boolean;
  description?: string;
  marcaFabricante?: string;
  codigosOEM?: string[];
  grupoEquivalencia?: string;
  categoriaNombres: string[]; // la principal primero
  compatibilidad: any[];
}

export interface CategoriaExistente {
  _id: string;
  nombre: string;
  slug?: string;
}

/** Lo que el archivo dice de un producto. Los campos ausentes (undefined) no cambian en una actualización. */
export interface DatosFila {
  sku: string;
  name?: string;
  price?: number;
  description?: string;
  stock?: number;
  trackStock?: boolean;
  activo?: boolean;
  marcaFabricante?: string;
  codigosOEM?: string[];
  grupoEquivalencia?: string;
  categoriaNombres?: string[];
  compatibilidad?: any[];
}

export interface CampoCambiado {
  campo: string;
  antes: string;
  despues: string;
}

export interface ErrorImportacion {
  hoja: string;
  fila: number;
  motivo: string;
}

export interface ResultadoImportacion {
  resumen: {
    filasProductos: number;
    filasCompatibilidad: number;
    nuevos: number;
    cambios: number;
    sinCambio: number;
    errores: number;
    noEnArchivo: number;
    categoriasNuevas: number;
  };
  nuevos: { fila: number; sku: string; nombre: string; precio: number; categorias: string[]; vehiculos: number }[];
  cambios: { fila: number; sku: string; nombre: string; campos: CampoCambiado[] }[];
  sinCambio: { sku: string; nombre: string }[];
  errores: ErrorImportacion[];
  noEnArchivo: { id: string; sku: string; nombre: string }[];
  categoriasNuevas: string[];
  /** Lo que `confirmar` aplica. No se envía al panel. */
  aplicar: {
    nuevos: { fila: number; sku: string; datos: DatosFila }[];
    cambios: { id: string; sku: string; datos: DatosFila }[];
    categoriasNuevas: { nombre: string; slug: string }[];
  };
}

const firmaLista = (lista: string[] | undefined) => [...(lista || [])].map(String).sort().join(";");

const firmaCompat = (lista: any[] | undefined) =>
  (lista || [])
    .map((f) => [f.marcaNorm || normalizarTexto(f.marca), f.modeloNorm || normalizarTexto(f.modelo), f.anioDesde || "", f.anioHasta || "", f.motor || "", f.version || "", f.nota || ""].join("|"))
    .sort()
    .join(";");

/** Compara lo que trae el archivo con el producto guardado. Devuelve solo los campos que cambian. */
function diferencias(p: ProductoExistente, d: DatosFila): CampoCambiado[] {
  const out: CampoCambiado[] = [];
  const add = (campo: string, antes: string, despues: string) => {
    if (antes !== despues) out.push({ campo, antes, despues });
  };
  if (d.name !== undefined) add("Nombre", p.name || "", d.name);
  if (d.price !== undefined) add("Precio", `$${p.price}`, `$${d.price}`);
  if (d.description !== undefined) add("Descripción", p.description || "", d.description);
  if (d.stock !== undefined) add("Stock", String(p.stock || 0), String(d.stock));
  if (d.trackStock !== undefined) add("Controlar stock", p.trackStock ? "sí" : "no", d.trackStock ? "sí" : "no");
  if (d.activo !== undefined) add("Activo", p.activo === false ? "no" : "sí", d.activo ? "sí" : "no");
  if (d.marcaFabricante !== undefined) add("Marca fabricante", p.marcaFabricante || "", d.marcaFabricante);
  if (d.codigosOEM !== undefined && firmaLista(p.codigosOEM) !== firmaLista(d.codigosOEM)) {
    add("Códigos OEM", (p.codigosOEM || []).join("; "), d.codigosOEM.join("; "));
  }
  if (d.grupoEquivalencia !== undefined) add("Grupo equivalencia", p.grupoEquivalencia || "", d.grupoEquivalencia);
  if (d.categoriaNombres !== undefined) {
    const antes = (p.categoriaNombres || []).map((n) => normalizarTexto(n)).join(";");
    const despues = d.categoriaNombres.map((n) => normalizarTexto(n)).join(";");
    if (antes !== despues) add("Categorías", (p.categoriaNombres || []).join("; "), d.categoriaNombres.join("; "));
  }
  if (d.compatibilidad !== undefined && firmaCompat(p.compatibilidad) !== firmaCompat(d.compatibilidad)) {
    add("Compatibilidad", `${(p.compatibilidad || []).length} vehículos`, `${d.compatibilidad.length} vehículos`);
  }
  return out;
}

function slugDe(nombre: string): string {
  return normalizarTexto(nombre).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "categoria";
}

/**
 * Analiza el archivo contra el catálogo actual. No escribe nada.
 * - Productos: se une por SKU. Las filas con error no entran (se reportan en `errores`).
 * - Compatibilidad: si un SKU tiene filas en la hoja, su lista de vehículos se reemplaza por esas filas.
 *   Si no aparece, no se toca.
 * - Categorías: una categoría que no existe no es error; se crea al confirmar.
 * - Nunca borra: los productos activos con SKU que no vienen en el archivo van en `noEnArchivo`.
 */
export function analizarImportacion({
  productos,
  compatibilidad,
  existentes,
  categorias,
}: {
  productos: TablaImportada | null;
  compatibilidad: TablaImportada | null;
  existentes: ProductoExistente[];
  categorias: CategoriaExistente[];
}): ResultadoImportacion {
  const errores: ErrorImportacion[] = [];
  const porSku = new Map<string, ProductoExistente>();
  for (const p of existentes) if (p.sku) porSku.set(p.sku, p);
  const skusArchivo = new Set<string>();
  const vistos = new Map<string, number>();
  const aceptados = new Map<string, { fila: number; datos: DatosFila }>();
  const rechazados = new Set<string>();

  // 1. Hoja Productos
  for (const fila of productos?.filas || []) {
    const c = fila.celdas;
    const err = (motivo: string) => errores.push({ hoja: NOMBRE_HOJA.productos, fila: fila.numero, motivo });
    const sku = recortar(c.sku || "", LIMITES.sku).toUpperCase();
    if (!sku) {
      err("Falta el SKU.");
      continue;
    }
    skusArchivo.add(sku);
    if (vistos.has(sku)) {
      // SKU ambiguo: se rechazan todas sus filas (la primera también, si había quedado aceptada)
      const primera = vistos.get(sku) as number;
      err(`El SKU ${sku} está repetido en el archivo (también en la fila ${primera}).`);
      if (aceptados.has(sku)) {
        aceptados.delete(sku);
        errores.push({ hoja: NOMBRE_HOJA.productos, fila: primera, motivo: `El SKU ${sku} está repetido en el archivo (también en la fila ${fila.numero}).` });
      }
      rechazados.add(sku);
      continue;
    }
    vistos.set(sku, fila.numero);

    const motivos: string[] = [];
    const datos: DatosFila = { sku };
    const nombre = recortar(c.nombre || "", LIMITES_IMPORTACION.nombre);
    if (!nombre) motivos.push("Falta el nombre.");
    else datos.name = nombre;

    if (vacio(c.precio)) motivos.push("El precio está vacío.");
    else {
      const precio = numeroPrecio(c.precio);
      if (!(precio > 0)) motivos.push("El precio no es válido: debe ser un número mayor a cero.");
      else datos.price = precio;
    }

    if (!vacio(c.categorias)) {
      const nombres = sinRepetidos(
        c.categorias.split(";").map((s) => recortar(s, LIMITES_IMPORTACION.categoriaNombre)).filter(Boolean),
      );
      if (nombres.length > LIMITES_IMPORTACION.categoriasPorProducto) {
        motivos.push(`No puede tener más de ${LIMITES_IMPORTACION.categoriasPorProducto} categorías.`);
      } else if (nombres.length > 0) datos.categoriaNombres = nombres;
    }

    if (!vacio(c.stock)) {
      const stock = enteroNoNegativo(c.stock);
      if (Number.isNaN(stock)) motivos.push("El stock debe ser un número entero mayor o igual a cero.");
      else datos.stock = stock;
    }
    if (!vacio(c.controlarStock)) {
      const v = siNo(c.controlarStock);
      if (v === null) motivos.push('"Controlar stock" debe ser sí o no.');
      else datos.trackStock = v;
    }
    if (!vacio(c.activo)) {
      const v = siNo(c.activo);
      if (v === null) motivos.push('"Activo" debe ser sí o no.');
      else datos.activo = v;
    }
    if (!vacio(c.descripcion)) datos.description = recortar(c.descripcion, LIMITES_IMPORTACION.descripcion);
    if (!vacio(c.marcaFabricante)) datos.marcaFabricante = recortar(c.marcaFabricante, LIMITES.marcaFabricante);
    if (!vacio(c.grupoEquivalencia)) datos.grupoEquivalencia = recortar(c.grupoEquivalencia, LIMITES.grupoEquivalencia);
    if (!vacio(c.codigosOEM)) {
      const codigos = c.codigosOEM.split(";").map((s) => normalizarCodigoOEM(s)).filter(Boolean);
      if (codigos.length) datos.codigosOEM = [...new Set(codigos)];
    }

    // Mismas reglas que el panel (F1-1) para SKU, marca, grupo y códigos OEM
    const validado = validarProductoAmpliado({
      sku,
      marcaFabricante: datos.marcaFabricante,
      grupoEquivalencia: datos.grupoEquivalencia,
      codigosOEM: datos.codigosOEM,
    });
    motivos.push(...validado.errores);

    if (motivos.length) {
      motivos.forEach((m) => err(m));
      rechazados.add(sku);
      continue;
    }
    aceptados.set(sku, { fila: fila.numero, datos });
  }

  // 2. Hoja Compatibilidad: se agrupa por SKU
  const compatPorSku = new Map<string, { fila: number; lista: any[] }>();
  let filasCompat = 0;
  for (const fila of compatibilidad?.filas || []) {
    filasCompat++;
    const c = fila.celdas;
    const err = (motivo: string) => errores.push({ hoja: NOMBRE_HOJA.compatibilidad, fila: fila.numero, motivo });
    const sku = recortar(c.sku || "", LIMITES.sku).toUpperCase();
    if (!sku) {
      err("Falta el SKU.");
      continue;
    }
    const motivos: string[] = [];
    if (!vacio(c.anioDesde) && Number.isNaN(anio(c.anioDesde))) motivos.push("El año desde no es válido (debe tener 4 dígitos).");
    if (!vacio(c.anioHasta) && Number.isNaN(anio(c.anioHasta))) motivos.push("El año hasta no es válido (debe tener 4 dígitos).");
    if (motivos.length) {
      motivos.forEach((m) => err(m));
      continue;
    }
    const entrada: any = {
      marca: recortar(c.marca || "", LIMITES.compatibilidadMarca),
      modelo: recortar(c.modelo || "", LIMITES.compatibilidadModelo),
      motor: recortar(c.motor || "", LIMITES.motor),
      version: recortar(c.version || "", LIMITES.version),
      nota: recortar(c.nota || "", LIMITES.nota),
    };
    if (!vacio(c.anioDesde)) entrada.anioDesde = anio(c.anioDesde);
    if (!vacio(c.anioHasta)) entrada.anioHasta = anio(c.anioHasta);
    const r = normalizarCompatibilidad([entrada]);
    if (!r.ok) {
      r.errores.forEach((m) => err(m.replace(/^Compatibilidad, fila \d+: /, "")));
      continue;
    }
    if (rechazados.has(sku)) {
      err(`El producto ${sku} tiene errores en la hoja Productos.`);
      continue;
    }
    if (!skusArchivo.has(sku) && !porSku.has(sku)) {
      err(`El SKU ${sku} no existe en la hoja Productos ni en el catálogo.`);
      continue;
    }
    const grupo = compatPorSku.get(sku) || { fila: fila.numero, lista: [] };
    grupo.lista.push(r.valor[0]);
    compatPorSku.set(sku, grupo);
  }
  for (const [sku, grupo] of compatPorSku) {
    const r = validarProductoAmpliado({ sku, compatibilidad: grupo.lista });
    if (!r.ok) {
      r.errores.forEach((m) => errores.push({ hoja: NOMBRE_HOJA.compatibilidad, fila: grupo.fila, motivo: m }));
      compatPorSku.delete(sku);
      continue;
    }
    const producto = aceptados.get(sku);
    if (producto) producto.datos.compatibilidad = r.valor.compatibilidad;
    else compatPorSku.set(sku, { fila: grupo.fila, lista: r.valor.compatibilidad });
  }

  // 3. Clasificación: nuevos, cambios o sin cambio
  const nuevos: ResultadoImportacion["nuevos"] = [];
  const cambios: ResultadoImportacion["cambios"] = [];
  const sinCambio: ResultadoImportacion["sinCambio"] = [];
  const aplicarNuevos: ResultadoImportacion["aplicar"]["nuevos"] = [];
  const aplicarCambios: ResultadoImportacion["aplicar"]["cambios"] = [];
  const categoriasPorNombre = new Map<string, CategoriaExistente>();
  for (const cat of categorias) categoriasPorNombre.set(normalizarTexto(cat.nombre), cat);

  const todos = new Set<string>([...aceptados.keys(), ...compatPorSku.keys()]);
  for (const sku of todos) {
    const aceptado = aceptados.get(sku);
    const datos: DatosFila = aceptado ? aceptado.datos : { sku };
    if (!aceptado) datos.compatibilidad = compatPorSku.get(sku)!.lista;
    const fila = aceptado ? aceptado.fila : compatPorSku.get(sku)!.fila;
    const existente = porSku.get(sku);
    if (!existente) {
      if (!datos.categoriaNombres) {
        errores.push({ hoja: NOMBRE_HOJA.productos, fila, motivo: "Falta la categoría: es obligatoria para un producto nuevo." });
        continue;
      }
      nuevos.push({
        fila,
        sku,
        nombre: datos.name || "",
        precio: datos.price || 0,
        categorias: datos.categoriaNombres,
        vehiculos: (datos.compatibilidad || []).length,
      });
      aplicarNuevos.push({ fila, sku, datos });
      continue;
    }
    const campos = diferencias(existente, datos);
    if (campos.length) {
      cambios.push({ fila, sku, nombre: existente.name, campos });
      aplicarCambios.push({ id: existente.id, sku, datos });
    } else {
      sinCambio.push({ sku, nombre: existente.name });
    }
  }

  // Categorías que hay que crear (no existen por nombre normalizado)
  const nombresAplicar = new Map<string, string>();
  for (const item of [...aplicarNuevos, ...aplicarCambios]) {
    for (const nombre of item.datos.categoriaNombres || []) {
      const k = normalizarTexto(nombre);
      if (!categoriasPorNombre.has(k) && !nombresAplicar.has(k)) nombresAplicar.set(k, nombre);
    }
  }
  const slugsUsados = new Set(categorias.map((c) => c.slug || slugDe(c.nombre)));
  const categoriasNuevas: { nombre: string; slug: string }[] = [];
  for (const nombre of nombresAplicar.values()) {
    let slug = slugDe(nombre);
    let n = 2;
    while (slugsUsados.has(slug)) slug = `${slugDe(nombre)}-${n++}`;
    slugsUsados.add(slug);
    categoriasNuevas.push({ nombre, slug });
  }

  // Productos activos con SKU que no vienen en el archivo: se ofrece desactivarlos, nunca se borran
  const noEnArchivo = existentes
    .filter((p) => p.sku && p.activo !== false && !skusArchivo.has(p.sku))
    .map((p) => ({ id: p.id, sku: p.sku as string, nombre: p.name }));

  return {
    resumen: {
      filasProductos: productos?.filas.length || 0,
      filasCompatibilidad: filasCompat,
      nuevos: nuevos.length,
      cambios: cambios.length,
      sinCambio: sinCambio.length,
      errores: errores.length,
      noEnArchivo: noEnArchivo.length,
      categoriasNuevas: categoriasNuevas.length,
    },
    nuevos,
    cambios,
    sinCambio,
    errores,
    noEnArchivo,
    categoriasNuevas: categoriasNuevas.map((c) => c.nombre),
    aplicar: { nuevos: aplicarNuevos, cambios: aplicarCambios, categoriasNuevas },
  };
}

/** Quita lo que no se envía al panel (lo que hay que aplicar). */
export function publicarResultado(r: ResultadoImportacion): Omit<ResultadoImportacion, "aplicar"> {
  const { aplicar: _aplicar, ...publico } = r;
  return publico;
}

// ---------- Excel de salida (plantilla y exportación) ----------

/** Filas de exportación del catálogo, en el mismo formato que la importación. */
export function filasExportacion(
  productos: any[],
  categorias: { _id: any; nombre: string }[],
): { productos: string[][]; compatibilidad: string[][] } {
  const nombrePorId = new Map(categorias.map((c) => [String(c._id), c.nombre]));
  const ordenados = [...productos].sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const hojaProductos: string[][] = [];
  const hojaCompat: string[][] = [];
  for (const p of ordenados) {
    const ids = [p.categoria, ...(p.categorias || [])].map((x) => String(x?._id || x || ""));
    const nombres = sinRepetidos(ids.map((id) => nombrePorId.get(id) || "").filter(Boolean));
    const sku = p.sku ? String(p.sku) : "";
    hojaProductos.push([
      sku,
      String(p.name || ""),
      nombres.join("; "),
      String(p.price ?? ""),
      String(p.stock ?? 0),
      p.trackStock ? "sí" : "no",
      String(p.marcaFabricante || ""),
      (p.codigosOEM || []).join("; "),
      String(p.grupoEquivalencia || ""),
      String(p.description || ""),
      p.activo === false ? "no" : "sí",
    ]);
    if (sku) {
      for (const f of p.compatibilidad || []) {
        hojaCompat.push([
          sku,
          String(f.marca || ""),
          String(f.modelo || ""),
          f.anioDesde ? String(f.anioDesde) : "",
          f.anioHasta ? String(f.anioHasta) : "",
          String(f.motor || ""),
          String(f.version || ""),
          String(f.nota || ""),
        ]);
      }
    }
  }
  return { productos: hojaProductos, compatibilidad: hojaCompat };
}

/** Arma el .xlsx con las dos hojas. Los valores se escriben como texto. */
export async function generarXlsx(filas: { productos: string[][]; compatibilidad: string[][] }): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = "Panel de inventario";
  const armar = (nombre: string, columnas: Columna[], datos: string[][]) => {
    const hoja = libro.addWorksheet(nombre);
    hoja.addRow(columnas.map((c) => c.titulo));
    hoja.getRow(1).font = { bold: true };
    hoja.views = [{ state: "frozen", ySplit: 1 }];
    hoja.columns = columnas.map((c) => ({ width: Math.max(14, c.titulo.length + 4) }));
    for (const fila of datos) hoja.addRow(fila);
  };
  armar(NOMBRE_HOJA.productos, COLUMNAS_PRODUCTOS, filas.productos);
  armar(NOMBRE_HOJA.compatibilidad, COLUMNAS_COMPATIBILIDAD, filas.compatibilidad);
  return Buffer.from(await libro.xlsx.writeBuffer());
}
