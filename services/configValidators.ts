/**
 * Validación de valores de configuración editables desde el panel.
 * Un valor vacío significa "sin override": configStore cae al valor de process.env.
 *
 * Longitudes basadas en los valores reales de producción (ver docs/validacion-variables.md):
 *  - Teléfonos (con código de país, sin +): 12 dígitos en Venezuela. E.164 admite hasta 15.
 *  - IDs de Meta (Phone Number ID, WABA, IG, Página, Pixel): 16 o 17 dígitos observados.
 *  - Plantillas: 18 caracteres observados; Meta admite hasta 512, solo minúsculas, números y _.
 *  - VAPID_EMAIL: 30 caracteres observados; un correo admite hasta 254.
 */

export type ResultadoValidacion = { ok: true; value: string } | { ok: false; error: string };

interface Regla {
  regex: RegExp;
  mensaje: string;
  normalizar?: (valor: string) => string;
  maxLen?: number;
  max?: number;
}

const soloDigitos = (valor: string) => valor.replace(/\D/g, "");

const TELEFONO = { regex: /^\d{8,15}$/, mensaje: "debe tener entre 8 y 15 dígitos, con código de país y sin + ni espacios.", normalizar: soloDigitos, maxLen: 15 };
const ID_META = { regex: /^\d{10,20}$/, mensaje: "debe ser un ID numérico de Meta de 10 a 20 dígitos.", maxLen: 20 };
const PLANTILLA = { regex: /^[a-z0-9_]{1,512}$/, mensaje: "solo admite minúsculas, números y guion bajo (formato de plantilla de Meta).", maxLen: 512 };

const REGLAS: Record<string, Regla> = {
  ADMIN_PHONE_NUMBER: TELEFONO,
  ADMIN_PHONE_NUMBER_2: TELEFONO,
  DELIVERY_PHONE_NUMBER: TELEFONO,

  WHATSAPP_PHONE_NUMBER_ID: ID_META,
  WHATSAPP_BUSINESS_ACCOUNT_ID: ID_META,
  IG_ACCOUNT_ID: ID_META,
  FB_PAGE_ID: ID_META,
  META_PIXEL_ID: ID_META,
  META_DATASET_ID: ID_META,

  WHATSAPP_TEMPLATE_ORDER: PLANTILLA,
  WHATSAPP_TEMPLATE_REACTIVACION: PLANTILLA,

  WEBHOOK_DEBOUNCE_MS: { regex: /^\d{1,5}$/, mensaje: "debe ser un número de milisegundos entre 0 y 10000.", max: 10000, maxLen: 5 },

  VAPID_EMAIL: { regex: /^(mailto:)?[^\s@]+@[^\s@]+\.[^\s@]+$/, mensaje: "debe ser un correo válido, opcionalmente con prefijo mailto:.", maxLen: 254 },

  META_CAPI_TEST_EVENT_CODE: { regex: /^[A-Za-z0-9_-]{1,64}$/, mensaje: "solo admite letras, números, guion y guion bajo (máximo 64).", maxLen: 64 },
};

const MAX_LONGITUD_GENERAL = 200;

export function validarValorConfig(clave: string, valor: unknown): ResultadoValidacion {
  if (typeof valor !== "string") {
    return { ok: false, error: `${clave}: el valor debe ser texto.` };
  }

  const limpio = valor.trim();
  if (limpio === "") {
    return { ok: true, value: "" };
  }

  if (limpio.length > MAX_LONGITUD_GENERAL) {
    return { ok: false, error: `${clave}: máximo ${MAX_LONGITUD_GENERAL} caracteres.` };
  }

  const regla = REGLAS[clave];
  if (!regla) {
    return { ok: true, value: limpio };
  }

  // La longitud máxima se mide sobre el valor ya normalizado (p. ej. sin + ni espacios)
  const candidato = regla.normalizar ? regla.normalizar(limpio) : limpio;
  if (regla.maxLen !== undefined && candidato.length > regla.maxLen) {
    return { ok: false, error: `${clave}: máximo ${regla.maxLen} caracteres.` };
  }
  if (!regla.regex.test(candidato)) {
    return { ok: false, error: `${clave} ${regla.mensaje}` };
  }
  if (regla.max !== undefined && Number(candidato) > regla.max) {
    return { ok: false, error: `${clave} ${regla.mensaje}` };
  }

  return { ok: true, value: candidato };
}

export interface HorarioAtencion {
  zonaHoraria: string;
  dias: number[];
  apertura: string;
  cierre: string;
}

export type ResultadoValidacionHorario =
  | { ok: true; value: HorarioAtencion }
  | { ok: false; error: string };

/**
 * Valida la configuración de Horario de Atención comercial.
 * Reglas:
 * - dias: Array de enteros 0..6 sin duplicados, al menos 1 día (0 = domingo, 6 = sábado).
 * - apertura y cierre: Formato HH:mm (24 horas).
 * - apertura < cierre.
 * - zonaHoraria: Opcional, por defecto 'America/Caracas'.
 */
export function validarHorarioAtencion(data: unknown): ResultadoValidacionHorario {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "El horario de atención debe ser un objeto con dias, apertura y cierre." };
  }

  const obj = data as any;
  const { dias, apertura, cierre, zonaHoraria } = obj;

  if (!Array.isArray(dias) || dias.length === 0) {
    return { ok: false, error: "Debe seleccionar al menos un día de atención." };
  }

  const diasVistos = new Set<number>();
  for (const d of dias) {
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) {
      return { ok: false, error: "Los días deben ser números enteros entre 0 (domingo) y 6 (sábado)." };
    }
    if (diasVistos.has(d)) {
      return { ok: false, error: "Los días no deben contener valores duplicados." };
    }
    diasVistos.add(d);
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (typeof apertura !== "string" || !timeRegex.test(apertura.trim())) {
    return { ok: false, error: "La hora de apertura debe tener formato HH:mm (24 horas, ej. 09:00)." };
  }
  if (typeof cierre !== "string" || !timeRegex.test(cierre.trim())) {
    return { ok: false, error: "La hora de cierre debe tener formato HH:mm (24 horas, ej. 17:00)." };
  }

  const apLimpio = apertura.trim();
  const ciLimpio = cierre.trim();

  if (apLimpio >= ciLimpio) {
    return { ok: false, error: "La hora de apertura debe ser anterior a la hora de cierre." };
  }

  const zhLimpia = (typeof zonaHoraria === "string" && zonaHoraria.trim()) ? zonaHoraria.trim() : "America/Caracas";

  try {
    Intl.DateTimeFormat(undefined, { timeZone: zhLimpia });
  } catch {
    return { ok: false, error: "Zona horaria inválida." };
  }

  return {
    ok: true,
    value: {
      zonaHoraria: zhLimpia,
      dias: Array.from(diasVistos),
      apertura: apLimpio,
      cierre: ciLimpio,
    },
  };
}

export interface FlujoNoLaborable {
  activo: boolean;
  entregaDiferida: {
    activo: boolean;
    texto?: string;
  };
  retiroEnPunto: {
    activo: boolean;
    nombre?: string;
    direccion?: string;
    horario?: string;
  };
}

/**
 * Valida la estructura y tipos de la configuración de flujo en días no laborables.
 */
export function validarFlujoNoLaborable(
  val: any
): { ok: true; value: FlujoNoLaborable } | { ok: false; error: string } {
  if (!val || typeof val !== "object" || Array.isArray(val)) {
    return { ok: false, error: "La configuración de flujo no laborable debe ser un objeto." };
  }

  if (typeof val.activo !== "boolean") {
    return { ok: false, error: "El campo 'activo' debe ser un booleano." };
  }

  if (!val.entregaDiferida || typeof val.entregaDiferida !== "object" || Array.isArray(val.entregaDiferida)) {
    return { ok: false, error: "El campo 'entregaDiferida' debe ser un objeto." };
  }
  if (typeof val.entregaDiferida.activo !== "boolean") {
    return { ok: false, error: "El campo 'entregaDiferida.activo' debe ser un booleano." };
  }
  if (val.entregaDiferida.texto !== undefined && typeof val.entregaDiferida.texto !== "string") {
    return { ok: false, error: "El campo 'entregaDiferida.texto' debe ser una cadena de texto." };
  }

  if (!val.retiroEnPunto || typeof val.retiroEnPunto !== "object" || Array.isArray(val.retiroEnPunto)) {
    return { ok: false, error: "El campo 'retiroEnPunto' debe ser un objeto." };
  }
  if (typeof val.retiroEnPunto.activo !== "boolean") {
    return { ok: false, error: "El campo 'retiroEnPunto.activo' debe ser un booleano." };
  }
  if (val.retiroEnPunto.nombre !== undefined && typeof val.retiroEnPunto.nombre !== "string") {
    return { ok: false, error: "El campo 'retiroEnPunto.nombre' debe ser una cadena de texto." };
  }
  if (val.retiroEnPunto.direccion !== undefined && typeof val.retiroEnPunto.direccion !== "string") {
    return { ok: false, error: "El campo 'retiroEnPunto.direccion' debe ser una cadena de texto." };
  }
  if (val.retiroEnPunto.horario !== undefined && typeof val.retiroEnPunto.horario !== "string") {
    return { ok: false, error: "El campo 'retiroEnPunto.horario' debe ser una cadena de texto." };
  }

  // 1. Si el flujo está activo, al menos una modalidad debe estar activa
  if (val.activo && !val.entregaDiferida.activo && !val.retiroEnPunto.activo) {
    return { ok: false, error: "Activa al menos una modalidad o apaga el flujo de días no laborables" };
  }

  const textoDiferidoLimpio = (val.entregaDiferida.texto || "").trim();
  const nombreLimpio = (val.retiroEnPunto.nombre || "").trim();
  const direccionLimpia = (val.retiroEnPunto.direccion || "").trim();
  const horarioLimpio = (val.retiroEnPunto.horario || "").trim();

  // 2. Si retiro en punto está activo, nombre y dirección son obligatorios
  if (val.retiroEnPunto.activo) {
    if (!nombreLimpio) {
      return { ok: false, error: "El nombre del punto de retiro es obligatorio cuando la modalidad está activa." };
    }
    if (!direccionLimpia) {
      return { ok: false, error: "La dirección del punto de retiro es obligatoria cuando la modalidad está activa." };
    }
  }

  // 3. Longitudes máximas para proteger mensajes de WhatsApp
  if (textoDiferidoLimpio.length > 60) {
    return { ok: false, error: "El texto descriptivo de entrega diferida no puede exceder 60 caracteres." };
  }
  if (nombreLimpio.length > 60) {
    return { ok: false, error: "El nombre del punto de retiro no puede exceder 60 caracteres." };
  }
  if (direccionLimpia.length > 200) {
    return { ok: false, error: "La dirección del punto de retiro no puede exceder 200 caracteres." };
  }
  if (horarioLimpio.length > 100) {
    return { ok: false, error: "El horario del punto de retiro no puede exceder 100 caracteres." };
  }

  return {
    ok: true,
    value: {
      activo: val.activo,
      entregaDiferida: {
        activo: val.entregaDiferida.activo,
        texto: textoDiferidoLimpio,
      },
      retiroEnPunto: {
        activo: val.retiroEnPunto.activo,
        nombre: nombreLimpio,
        direccion: direccionLimpia,
        horario: horarioLimpio,
      },
    },
  };
}

// ==========================================
// Datos del negocio (F0-14): legales y de contacto, editables desde el panel
// ==========================================

export interface DatosNegocio {
  legal: {
    razonSocial: string;
    rif: string;
    direccion: string;
  };
  contacto: {
    email: string;
    website: string;
    instagram: string;
    whatsapp: string;
  };
  fechaActualizacion: string;
}

export type ResultadoValidacionDatosNegocio =
  | { ok: true; value: DatosNegocio }
  | { ok: false; error: string };

const LIMITES_DATOS_NEGOCIO: Record<string, number> = {
  razonSocial: 120,
  direccion: 200,
  email: 100,
  website: 200,
  instagram: 100,
};

/**
 * Valida y normaliza los datos legales y de contacto del negocio.
 * Todos los campos son opcionales (vacío = no se muestra). La fecha de actualización
 * no se acepta del cliente: la pone el servicio al guardar.
 */
export function validarDatosNegocio(val: any): ResultadoValidacionDatosNegocio {
  if (!val || typeof val !== "object" || Array.isArray(val)) {
    return { ok: false, error: "Los datos del negocio deben ser un objeto." };
  }
  const legal = val.legal ?? {};
  const contacto = val.contacto ?? {};
  if (typeof legal !== "object" || Array.isArray(legal)) {
    return { ok: false, error: "El campo 'legal' debe ser un objeto." };
  }
  if (typeof contacto !== "object" || Array.isArray(contacto)) {
    return { ok: false, error: "El campo 'contacto' debe ser un objeto." };
  }

  const campos: Record<string, unknown> = {
    razonSocial: legal.razonSocial,
    rif: legal.rif,
    direccion: legal.direccion,
    email: contacto.email,
    website: contacto.website,
    instagram: contacto.instagram,
    whatsapp: contacto.whatsapp,
  };
  const limpio: Record<string, string> = {};
  for (const [nombre, valor] of Object.entries(campos)) {
    if (valor !== undefined && valor !== null && typeof valor !== "string") {
      return { ok: false, error: `El campo '${nombre}' debe ser texto.` };
    }
    limpio[nombre] = String(valor ?? "").trim().replace(/\s+/g, " ");
    const max = LIMITES_DATOS_NEGOCIO[nombre];
    if (max && limpio[nombre].length > max) {
      return { ok: false, error: `El campo '${nombre}' no puede exceder ${max} caracteres.` };
    }
  }

  // RIF venezolano: letra (V, E, J, P o G), 8 dígitos y dígito verificador. Se guarda como J-12345678-9.
  if (limpio.rif) {
    const m = limpio.rif.toUpperCase().replace(/[\s.]/g, "").match(/^([VEJPG])-?(\d{8})-?(\d)$/);
    if (!m) {
      return { ok: false, error: "RIF inválido. Formato esperado: J-12345678-9 (letra V, E, J, P o G)." };
    }
    limpio.rif = `${m[1]}-${m[2]}-${m[3]}`;
  }

  if (limpio.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio.email)) {
    return { ok: false, error: "Correo inválido." };
  }

  if (limpio.website) {
    const conProtocolo = /^https?:\/\//i.test(limpio.website) ? limpio.website : `https://${limpio.website}`;
    let url: URL | null = null;
    try {
      url = new URL(conProtocolo);
    } catch {
      url = null;
    }
    if (!url || !url.hostname.includes(".")) {
      return { ok: false, error: "Sitio web inválido. Ejemplo: https://minegocio.com" };
    }
    limpio.website = conProtocolo;
  }

  if (limpio.whatsapp) {
    const digitos = limpio.whatsapp.replace(/[\s+\-()]/g, "");
    if (!/^\d{10,15}$/.test(digitos)) {
      return { ok: false, error: "WhatsApp inválido. Escribe el número con código de país, por ejemplo 584121234567." };
    }
    limpio.whatsapp = digitos;
  }

  const fecha = typeof val.fechaActualizacion === "string" ? val.fechaActualizacion.trim() : "";

  return {
    ok: true,
    value: {
      legal: { razonSocial: limpio.razonSocial, rif: limpio.rif, direccion: limpio.direccion },
      contacto: {
        email: limpio.email,
        website: limpio.website,
        instagram: limpio.instagram,
        whatsapp: limpio.whatsapp,
      },
      fechaActualizacion: fecha.slice(0, 40),
    },
  };
}

// ==========================================
// Configuración del Catálogo Web (F2-4)
// ==========================================

export interface ConfigCatalogo {
  activo: boolean;
  prefijo: string;
  mensajePrefill: string;
}

export type ResultadoValidacionCatalogo =
  | { ok: true; value: ConfigCatalogo }
  | { ok: false; error: string };

const PREFIJO_REGEX = /^[A-HJ-KM-NP-Z]{2,4}$/;

export function validarConfigCatalogo(val: unknown): ResultadoValidacionCatalogo {
  if (!val || typeof val !== "object") {
    return { ok: false, error: "Datos de configuración del catálogo inválidos." };
  }

  const v = val as Partial<ConfigCatalogo>;

  const activo = typeof v.activo === "boolean" ? v.activo : true;

  if (typeof v.prefijo !== "string") {
    return { ok: false, error: "El prefijo es obligatorio y debe ser texto." };
  }

  const prefijoLimpio = v.prefijo.trim().toUpperCase();
  if (!PREFIJO_REGEX.test(prefijoLimpio)) {
    return {
      ok: false,
      error: "El prefijo debe tener de 2 a 4 letras mayúsculas (sin las letras ambiguas I, L, O).",
    };
  }

  if (typeof v.mensajePrefill !== "string") {
    return { ok: false, error: "El mensaje de WhatsApp es obligatorio y debe ser texto." };
  }

  const mensajeLimpio = v.mensajePrefill.trim();
  if (mensajeLimpio.length === 0) {
    return { ok: false, error: "El mensaje de WhatsApp no puede estar vacío." };
  }

  if (mensajeLimpio.length > 200) {
    return { ok: false, error: "El mensaje de WhatsApp no puede exceder 200 caracteres." };
  }

  if (!mensajeLimpio.includes("{{codigo}}")) {
    return { ok: false, error: "El mensaje de WhatsApp debe contener la variable {{codigo}}." };
  }

  return {
    ok: true,
    value: {
      activo,
      prefijo: prefijoLimpio,
      mensajePrefill: mensajeLimpio,
    },
  };
}

