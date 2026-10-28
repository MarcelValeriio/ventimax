import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export interface HmacRequest extends Request {
  rawBody?: string;
}

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

/**
 * Middleware que valida la firma HMAC SHA256 de Meta en webhooks entrantes.
 * Meta firma el cuerpo del POST con el App Secret usando SHA256.
 * Cabecera esperada: X-Hub-Signature-256: sha256=<firma_hex>
 */
function validateMetaHmac(req: Request, res: Response, next: NextFunction): void | Response {
  // Solo las suites (NODE_ENV=test) omiten la firma. Cualquier otro entorno la exige: un NODE_ENV
  // mal puesto en Render no puede dejar el webhook abierto.
  if (process.env.NODE_ENV === "test") {
    console.log("🔓 [HMAC] Validación omitida en entorno:", process.env.NODE_ENV);
    return next();
  }

  const signatureHeader = req.headers["x-hub-signature-256"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  // Meta App Secret. We check WHATSAPP_APP_SECRET, IG_APP_SECRET and FB_APP_SECRET
  // depending on how the environment is configured. Si los tres canales viven en la
  // misma app de Meta, basta con configurar uno solo.
  const appSecret =
    process.env.WHATSAPP_APP_SECRET ||
    process.env.IG_APP_SECRET ||
    process.env.FB_APP_SECRET ||
    process.env.APP_SECRET;

  if (!appSecret) {
    console.error("❌ [HMAC] WHATSAPP_APP_SECRET / IG_APP_SECRET / FB_APP_SECRET no configurado. El webhook no puede funcionar.");
    return res.status(500).json({ error: "Configuración de seguridad incompleta" });
  }

  if (!signature) {
    console.error("❌ [HMAC] Falta cabecera X-Hub-Signature-256. Petición rechazada.");
    return res.sendStatus(403);
  }

  // Meta envía el body como JSON string. Debemos usar el raw body.
  // Express ya parsea JSON, así que necesitamos el raw body de la request.
  // Usamos req.rawBody que configuraremos más abajo.
  const rawBody: string = req.rawBody || JSON.stringify(req.body);
  
  const whatsappSecret = process.env.WHATSAPP_APP_SECRET;
  const igSecret = process.env.IG_APP_SECRET;
  const fbSecret = process.env.FB_APP_SECRET;

  const checkSig = (secret?: string): boolean => {
    if (!secret) return false;
    const expectedSignature = "sha256=" + crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");
      
    try {
      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch (e) {
      return false;
    }
  };

  let isValid = false;

  // Si la petición es para instagram, probamos primero con su secret
  if (req.originalUrl && req.originalUrl.includes("instagram") && igSecret) {
    isValid = checkSig(igSecret);
  }

  // Si la petición es para messenger (Facebook), probamos primero con su secret
  if (!isValid && req.originalUrl && req.originalUrl.includes("messenger") && fbSecret) {
    isValid = checkSig(fbSecret);
  }

  // Fallback a probar con whatsapp o cualquiera de los tres
  if (!isValid && whatsappSecret) isValid = checkSig(whatsappSecret);
  if (!isValid && igSecret) isValid = checkSig(igSecret);
  if (!isValid && fbSecret) isValid = checkSig(fbSecret);
  if (!isValid && process.env.APP_SECRET) isValid = checkSig(process.env.APP_SECRET);

  if (!isValid) {
    console.error("❌ [HMAC] Firma inválida. Petición rechazada.");
    return res.sendStatus(403);
  }

  console.log("✅ [HMAC] Firma validada correctamente.");
  next();
}

module.exports = { validateMetaHmac };
