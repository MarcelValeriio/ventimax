/**
 * Arranque seguro (F0-8).
 * - comprobarJwtSecret: en producción el servidor no arranca sin un JWT_SECRET fuerte.
 * - crearAdminInicial: crea el primer administrador desde ADMIN_USER/ADMIN_PASS solo si la base
 *   no tiene ningún usuario. Nunca modifica ni reemplaza usuarios existentes.
 */
const LONGITUD_MINIMA_JWT = 32;
export const LONGITUD_MINIMA_ADMIN_PASS = 12;

function modeloUsuario() {
  return process.env.NODE_ENV === "test"
    ? require("./dbLocal").getUsuarioModel()
    : require("../models/Usuario");
}

/** Devuelve el problema encontrado con JWT_SECRET, o null si es válido. */
export function problemaJwtSecret(secret = process.env.JWT_SECRET): string | null {
  if (!secret) return "JWT_SECRET no está definido";
  if (secret === "secreto_por_defecto_cambialo") return "JWT_SECRET usa el valor por defecto";
  if (secret.length < LONGITUD_MINIMA_JWT) return `JWT_SECRET tiene menos de ${LONGITUD_MINIMA_JWT} caracteres`;
  return null;
}

/** En producción detiene el proceso si JWT_SECRET no es seguro; en otros entornos solo avisa. */
export function comprobarJwtSecret(): void {
  const problema = problemaJwtSecret();
  if (!problema) return;
  if (process.env.NODE_ENV === "production") {
    console.error(`❌ [Seguridad] ${problema}. El servidor no arranca. Genera uno con: openssl rand -hex 32`);
    process.exit(1);
  }
  console.warn(`⚠️ [Seguridad] ${problema}. En producción el servidor no arrancaría.`);
}

export type ResultadoAdminInicial = "creado" | "ya_hay_usuarios" | "faltan_variables" | "clave_corta";

export async function crearAdminInicial(
  usuario = process.env.ADMIN_USER,
  clave = process.env.ADMIN_PASS,
): Promise<ResultadoAdminInicial> {
  const Usuario = modeloUsuario();
  const existentes = await Usuario.countDocuments();
  if (existentes > 0) return "ya_hay_usuarios";

  if (!usuario || !clave) {
    console.warn("⚠️ [Arranque] No hay usuarios y faltan ADMIN_USER/ADMIN_PASS: nadie podrá entrar al panel.");
    return "faltan_variables";
  }
  if (clave.length < LONGITUD_MINIMA_ADMIN_PASS) {
    console.warn(`⚠️ [Arranque] ADMIN_PASS debe tener al menos ${LONGITUD_MINIMA_ADMIN_PASS} caracteres. No se creó el administrador.`);
    return "clave_corta";
  }

  // La contraseña se cifra en el hook pre-save del modelo.
  await Usuario.create({ username: usuario, password: clave, nombre: "Administrador", role: "admin", activo: true });
  console.log(`✅ [Arranque] Administrador inicial '${usuario}' creado.`);
  return "creado";
}

module.exports = { problemaJwtSecret, comprobarJwtSecret, crearAdminInicial, LONGITUD_MINIMA_ADMIN_PASS };
