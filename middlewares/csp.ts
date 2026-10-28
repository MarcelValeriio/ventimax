/**
 * Content Security Policy del panel (F0-11). La usan index.ts y scripts/test-cabeceras-seguridad.ts,
 * así la prueba revisa la configuración real y no una copia.
 *
 * script-src sin 'unsafe-inline': todo el JavaScript del panel vive en archivos (public/src/boot/).
 * No volver a poner <script> en línea en public/index.html ni public/login.html.
 */
export const CSP_DIRECTIVES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "https://cdn.tailwindcss.com",
    "https://cdnjs.cloudflare.com",
    "https://cdn.skypack.dev",
    "https://cdn.jsdelivr.net",
  ],
  // Estilos en línea permitidos: Tailwind por CDN los inyecta en tiempo de ejecución
  "style-src": [
    "'self'",
    "https://fonts.googleapis.com",
    "https://cdnjs.cloudflare.com",
    "'unsafe-inline'",
  ],
  "font-src": [
    "'self'",
    "https://fonts.gstatic.com",
    "https://cdnjs.cloudflare.com",
    "data:",
  ],
  "img-src": [
    "'self'",
    "data:",
    "blob:",
    "https://res.cloudinary.com",
    "https://api.dicebear.com",
    "https://user-images.githubusercontent.com",
  ],
  // 'self' cubre también el WebSocket (ws/wss) del mismo origen que usa Socket.IO
  "connect-src": [
    "'self'",
    "https://cdn.skypack.dev",
    "https://cdn.jsdelivr.net",
  ],
  "media-src": [
    "'self'",
    "https://assets.mixkit.co",
    "blob:",
    "data:",
  ],
  "object-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "base-uri": ["'self'"],
};

module.exports = { CSP_DIRECTIVES };
