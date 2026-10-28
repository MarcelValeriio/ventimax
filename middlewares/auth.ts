import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
const PERMISSIONS: Record<string, string[]> = require("../data/permissions");

export interface AuthUser {
  id?: string;
  username?: string;
  nombre?: string;
  role?: string;
  permissions?: string[];
  [key: string]: any;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Duración de la sesión del panel. El token y la cookie caducan a la vez.
export const DURACION_SESION_MS = 30 * 24 * 60 * 60 * 1000;
export const DURACION_SESION_JWT = "30d";

// Estado del usuario (activo y rol) leído de la base, con caché corta: desactivar a alguien o
// cambiarle el rol surte efecto en como mucho CACHE_USUARIO_MS, sin esperar a que caduque su token.
const CACHE_USUARIO_MS = 60 * 1000;
const cacheUsuarios = new Map<string, { activo: boolean; role?: string; expira: number }>();

export function obtenerJwtSecret(): string | null {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "secreto_por_defecto_cambialo") return null;
  return secret;
}

function modeloUsuario() {
  return process.env.NODE_ENV === "test"
    ? require("../services/dbLocal").getUsuarioModel()
    : require("../models/Usuario");
}

async function estadoUsuario(id: string): Promise<{ activo: boolean; role?: string } | null> {
  const enCache = cacheUsuarios.get(id);
  if (enCache && enCache.expira > Date.now()) return enCache;

  const consulta = modeloUsuario().findById(id);
  const doc = typeof consulta?.lean === "function" ? await consulta.select("activo role").lean() : await consulta;
  if (!doc) {
    cacheUsuarios.delete(id);
    return null;
  }
  const estado = { activo: doc.activo !== false, role: doc.role, expira: Date.now() + CACHE_USUARIO_MS };
  cacheUsuarios.set(id, estado);
  return estado;
}

/**
 * Valida un token de sesión: firma, caducidad obligatoria y usuario existente y activo en la base.
 * El rol y los permisos salen de la base, no del token. La usan el panel HTTP y Socket.IO.
 */
export async function verificarSesion(token: string | undefined): Promise<AuthUser | null> {
  const secret = obtenerJwtSecret();
  if (!token || !secret) return null;
  try {
    const decoded = jwt.verify(token, secret) as AuthUser & { exp?: number };
    if (!decoded.exp || !decoded.id) return null; // tokens viejos sin caducidad: no se aceptan
    const estado = await estadoUsuario(String(decoded.id));
    if (!estado || !estado.activo) return null;
    const role = estado.role || decoded.role;
    return {
      ...decoded,
      role,
      permissions: role && PERMISSIONS[role] ? PERMISSIONS[role] : [],
    };
  } catch {
    return null;
  }
}

async function isAuthenticated(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  const token = (req.cookies && req.cookies.token) ? req.cookies.token : undefined;

  if (!token) {
    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.status(401).json({ error: "No autorizado" });
    }
    return res.redirect("/login");
  }

  if (!obtenerJwtSecret()) {
    console.error("❌ ERROR CRÍTICO: JWT_SECRET no configurado o inseguro en el entorno.");
    return res.status(500).json({ error: "Error de configuración de seguridad en el servidor" });
  }

  try {
    const usuario = await verificarSesion(token);
    if (!usuario) throw new Error("Sesión inválida");
    req.user = usuario;
    return next();
  } catch (err) {
    res.clearCookie("token", {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    });
    if (req.xhr || req.headers.accept?.includes("json")) {
      return res.status(401).json({ error: "Token inválido" });
    }
    return res.redirect("/login");
  }
}

// Renamed from authorize(roles) to authorize(requiredPermissions)
function authorize(requiredPermissions: string | string[] = []) {
  const permissionsList: string[] = typeof requiredPermissions === "string"
    ? [requiredPermissions]
    : requiredPermissions;

  return (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!req.user || !req.user.permissions) {
      return res.status(401).json({ error: "No autenticado o permisos no cargados" });
    }

    // Check if user has ALL required permissions
    const hasAllPermissions = permissionsList.every((perm: string) =>
      req.user!.permissions!.includes(perm)
    );

    if (permissionsList.length > 0 && !hasAllPermissions) {
      return res.status(403).json({ error: "No tienes permiso para realizar esta acción" });
    }

    next();
  };
}

module.exports = {
  isAuthenticated,
  authorize,
  verificarSesion,
  obtenerJwtSecret,
  DURACION_SESION_MS,
  DURACION_SESION_JWT,
};
