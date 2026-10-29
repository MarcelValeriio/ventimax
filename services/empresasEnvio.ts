/**
 * Empresas de envío de un método nacional (F2f).
 * Cada empresa: { nombre, logoUrl, logoPublicId }. Los métodos guardados antes de F2f tienen strings;
 * esta función los lee igual, sin lanzar nunca: lo que no sirve se descarta.
 */

const MAX_EMPRESAS = 10;
const MAX_LARGO_NOMBRE = 40;
const MAX_LARGO_PUBLIC_ID = 200;
const PREFIJO_LOGO = "https://res.cloudinary.com/";

export interface EmpresaEnvio {
  nombre: string;
  logoUrl: string;
  logoPublicId: string;
}

/** Devuelve la URL solo si es de Cloudinary; si no, "" (nunca se guarda una URL ajena). */
function logoSeguro(url: any): string {
  if (typeof url !== "string") return "";
  const limpia = url.trim();
  return limpia.startsWith(PREFIJO_LOGO) ? limpia : "";
}

/** Carpeta de Cloudinary donde viven los logos de envío (la misma que usa subirLogoEnvio). */
function carpetaLogos(): string {
  return `${process.env.BRAND_NAME || "default"}/envios/`;
}

/**
 * Solo identificadores de la carpeta de logos de envío: al quitar una empresa se borra su logo de Cloudinary,
 * y un identificador ajeno (p. ej. la foto de un producto) nunca debe llegar a borrarse por esta vía.
 */
function publicIdSeguro(publicId: any): string {
  if (typeof publicId !== "string") return "";
  const limpio = publicId.trim();
  return limpio && limpio.length <= MAX_LARGO_PUBLIC_ID && limpio.startsWith(carpetaLogos()) ? limpio : "";
}

/**
 * Normaliza la lista de empresas tal como se guarda o se lee: acepta strings u objetos, recorta el nombre
 * (hasta 40 caracteres), descarta las vacías y las repetidas (sin distinguir mayúsculas) y deja máximo 10.
 */
function normalizarEmpresas(lista: any): EmpresaEnvio[] {
  if (!Array.isArray(lista)) return [];
  const vistas = new Set<string>();
  const resultado: EmpresaEnvio[] = [];
  for (const e of lista) {
    let nombre = "";
    let logoUrl = "";
    let logoPublicId = "";
    if (typeof e === "string") {
      nombre = e;
    } else if (e && typeof e === "object" && typeof e.nombre === "string") {
      nombre = e.nombre;
      logoUrl = logoSeguro(e.logoUrl);
      logoPublicId = publicIdSeguro(e.logoPublicId);
    } else {
      continue;
    }
    nombre = nombre.trim().slice(0, MAX_LARGO_NOMBRE);
    if (!nombre) continue;
    const clave = nombre.toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    resultado.push({ nombre, logoUrl, logoPublicId });
    if (resultado.length >= MAX_EMPRESAS) break;
  }
  return resultado;
}

/** Solo los nombres, para comparar la elección del cliente y para el bot de WhatsApp. */
function nombresEmpresas(lista: any): string[] {
  return normalizarEmpresas(lista).map((e) => e.nombre);
}

module.exports = {
  MAX_EMPRESAS,
  MAX_LARGO_NOMBRE,
  normalizarEmpresas,
  nombresEmpresas,
  logoSeguro,
};
