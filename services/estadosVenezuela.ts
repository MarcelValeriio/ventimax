/**
 * services/estadosVenezuela.ts
 * Lista oficial de las 24 entidades federales de Venezuela, función de normalización
 * de nombres de estado y mapeo de las ciudades de Zoom a su correspondiente estado.
 */

export const ESTADOS_VENEZUELA = [
  "Amazonas",
  "Anzoátegui",
  "Apure",
  "Aragua",
  "Barinas",
  "Bolívar",
  "Carabobo",
  "Cojedes",
  "Delta Amacuro",
  "Distrito Capital",
  "Falcón",
  "Guárico",
  "La Guaira",
  "Lara",
  "Mérida",
  "Miranda",
  "Monagas",
  "Nueva Esparta",
  "Portuguesa",
  "Sucre",
  "Táchira",
  "Trujillo",
  "Yaracuy",
  "Zulia",
] as const;

export type EstadoVenezuela = (typeof ESTADOS_VENEZUELA)[number];

/** Quita acentos, signos de puntuación y espacios extras para comparaciones robustas */
function limpiarCadena(str: string): string {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Mapa de normalización de variantes o errores comunes de escritura de estados */
const ALIAS_ESTADOS: Record<string, EstadoVenezuela> = {
  // Distrito Capital
  dcapital: "Distrito Capital",
  distritocapital: "Distrito Capital",
  distritofederal: "Distrito Capital",
  df: "Distrito Capital",
  caracas: "Distrito Capital",

  // La Guaira / Vargas
  vargas: "La Guaira",
  edovargas: "La Guaira",
  laguaira: "La Guaira",
  guaira: "La Guaira",

  // Variantes sin tilde y con tilde
  amazonas: "Amazonas",
  anzoategui: "Anzoátegui",
  apure: "Apure",
  aragua: "Aragua",
  barinas: "Barinas",
  bolivar: "Bolívar",
  carabobo: "Carabobo",
  cojedes: "Cojedes",
  deltaamacuro: "Delta Amacuro",
  falcon: "Falcón",
  guarico: "Guárico",
  lara: "Lara",
  merida: "Mérida",
  miranda: "Miranda",
  monagas: "Monagas",
  nuevaesparta: "Nueva Esparta",
  margarita: "Nueva Esparta",
  portuguesa: "Portuguesa",
  sucre: "Sucre",
  tachira: "Táchira",
  trujillo: "Trujillo",
  yaracuy: "Yaracuy",
  zulia: "Zulia",
};

/**
 * Normaliza el nombre de un estado al formato oficial con acentos y mayúsculas.
 * Si el nombre no corresponde a ningún estado válido de Venezuela, retorna null.
 */
export function normalizarNombreEstado(estadoBruto: string): EstadoVenezuela | null {
  if (!estadoBruto || typeof estadoBruto !== "string") return null;
  const limpio = limpiarCadena(estadoBruto);
  if (!limpio) return null;
  return ALIAS_ESTADOS[limpio] || null;
}

/**
 * Mapeo de las ciudades de Zoom (122 ciudades encontradas en su directorio oficial)
 * a su correspondiente estado venezolano. Ciudades internacionales o desconocidas retornan null.
 */
export const CIUDAD_A_ESTADO_ZOOM: Record<string, EstadoVenezuela> = {
  ABEJALES: "Táchira",
  ACARIGUA: "Portuguesa",
  ACHAGUAS: "Apure",
  ANACO: "Anzoátegui",
  BACHAQUERO: "Zulia",
  BARCELONA: "Anzoátegui",
  BARINAS: "Barinas",
  BARQUISIMETO: "Lara",
  BEJUMA: "Carabobo",
  BIRUACA: "Apure",
  BOCONO: "Trujillo",
  CABIMAS: "Zulia",
  CABUDARE: "Lara",
  CAGUA: "Aragua",
  "CAJA SECA": "Zulia",
  CALABOZO: "Guárico",
  CANTAURA: "Anzoátegui",
  CAPACHO: "Táchira",
  CARABALLEDA: "La Guaira",
  CARACAS: "Distrito Capital",
  CARAYACA: "La Guaira",
  CARORA: "Lara",
  CARRIZAL: "Miranda",
  CARUPANO: "Sucre",
  CARVAJAL: "Trujillo",
  CHARALLAVE: "Miranda",
  "CIUDAD BOLIVAR": "Bolívar",
  "CIUDAD BOLIVIA": "Barinas",
  "CIUDAD OJEDA": "Zulia",
  COLON: "Táchira",
  COLONCITO: "Táchira",
  "COLONIA TOVAR": "Aragua",
  CORO: "Falcón",
  CUA: "Miranda",
  CUMANA: "Sucre",
  DABAJURO: "Falcón",
  EJIDO: "Mérida",
  "EL CALLAO": "Bolívar",
  "EL LIMON": "Aragua",
  "EL PINAL": "Táchira",
  "EL SOMBRERO": "Guárico",
  "EL TIGRE": "Anzoátegui",
  "EL TIGRITO": "Anzoátegui",
  "EL TOCUYO": "Lara",
  "EL VENADO": "Zulia",
  "EL VIGIA": "Mérida",
  GUACARA: "Carabobo",
  GUANARE: "Portuguesa",
  GUARENAS: "Miranda",
  GUASIPATI: "Bolívar",
  GUATIRE: "Miranda",
  HIGUEROTE: "Miranda",
  "JUAN GRIEGO": "Nueva Esparta",
  "LA ASUNCION": "Nueva Esparta",
  "LA CONCEPCION": "Zulia",
  "LA FRIA": "Táchira",
  "LA GRITA": "Táchira",
  "LA PASTORA": "Lara",
  "LA PEDRERA": "Táchira",
  "LA TENDIDA": "Táchira",
  "LA VICTORIA": "Aragua",
  LAGUNILLAS: "Zulia",
  LECHERIAS: "Anzoátegui",
  "LOS GUAYOS": "Carabobo",
  "LOS PUERTOS DE ALTAGRACIA": "Zulia",
  "LOS TEQUES": "Miranda",
  MACHIQUES: "Zulia",
  MAIQUETIA: "La Guaira",
  MARACAIBO: "Zulia",
  MARACAY: "Aragua",
  MATURIN: "Monagas",
  "MENE DE MAUROA": "Falcón",
  "MENE GRANDE": "Zulia",
  MERIDA: "Mérida",
  MONTALBAN: "Carabobo",
  MUCUCHIES: "Mérida",
  "OCUMARE DEL TUY": "Miranda",
  PALMIRA: "Táchira",
  PAMPATAR: "Nueva Esparta",
  PORLAMAR: "Nueva Esparta",
  "PUERTO AYACUCHO": "Amazonas",
  "PUERTO CABELLO": "Carabobo",
  "PUERTO CUMAREBO": "Falcón",
  "PUERTO LA CRUZ": "Anzoátegui",
  "PUERTO ORDAZ": "Bolívar",
  "PUNTA DE MATA": "Monagas",
  "PUNTO FIJO": "Falcón",
  QUIBOR: "Lara",
  RUBIO: "Táchira",
  "SAN ANTONIO DE LOS ALTOS": "Miranda",
  "SAN ANTONIO DEL TACHIRA": "Táchira",
  "SAN CARLOS": "Cojedes",
  "SAN CRISTOBAL": "Táchira",
  "SAN FELIPE": "Yaracuy",
  "SAN FELIX": "Bolívar",
  "SAN FERNANDO": "Apure",
  "SAN JUAN DE LOS MORROS": "Guárico",
  "SANTA BARBARA DE BARINAS": "Barinas",
  "SANTA BARBARA DEL ZULIA": "Zulia",
  "SANTA CRUZ DE ARAGUA": "Aragua",
  "SANTA ELENA DE ARENALES (EDO. MERIDA)": "Mérida",
  "SANTA RITA - ARAGUA": "Aragua",
  "SANTA TERESA DEL TUY": "Miranda",
  SOCOPO: "Barinas",
  "TARIBA NUEVA": "Táchira",
  TEMBLADOR: "Monagas",
  TOVAR: "Mérida",
  TRUJILLO: "Trujillo",
  TUCUPITA: "Delta Amacuro",
  TUMEREMO: "Bolívar",
  TUREN: "Portuguesa",
  TURMERO: "Aragua",
  UPATA: "Bolívar",
  URENA: "Táchira",
  VALENCIA: "Carabobo",
  VALERA: "Trujillo",
  "VALLE DE LA PASCUA": "Guárico",
  "VILLA DE CURA": "Aragua",
  "VILLA DEL ROSARIO": "Zulia",
  YARITAGUA: "Yaracuy",
};

/**
 * Obtiene el estado venezolano para una ciudad de Zoom.
 * Si no está registrada o es internacional (ej. Miami, Panamá), devuelve null.
 */
export function estadoDeCiudadZoom(ciudad: string): EstadoVenezuela | null {
  if (!ciudad || typeof ciudad !== "string") return null;
  const c = ciudad.trim().toUpperCase();
  return CIUDAD_A_ESTADO_ZOOM[c] || null;
}

module.exports = {
  ESTADOS_VENEZUELA,
  normalizarNombreEstado,
  CIUDAD_A_ESTADO_ZOOM,
  estadoDeCiudadZoom,
};
