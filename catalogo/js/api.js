/**
 * catalogo/js/api.js
 * Cliente de comunicación con la API pública (/api/public).
 * Respuestas de error genéricas y amigables [R13].
 */

/**
 * Obtiene la URL base de la API pública desde la configuración global.
 */
export function obtenerBaseUrl() {
  const configUrl = window.CATALOGO_CONFIG && window.CATALOGO_CONFIG.apiUrl;
  if (typeof configUrl === "string" && configUrl.trim() !== "") {
    return configUrl.trim().replace(/\/+$/, "");
  }
  return "";
}

/**
 * Completa una URL de recurso relativo con la URL base de la API si es necesario.
 */
export function resolverUrlRecurso(url) {
  if (!url || typeof url !== "string") return "";
  const trimUrl = url.trim();
  if (trimUrl.startsWith("http://") || trimUrl.startsWith("https://") || trimUrl.startsWith("data:")) {
    return trimUrl;
  }
  const base = obtenerBaseUrl();
  const cleanPath = trimUrl.startsWith("/") ? trimUrl : `/${trimUrl}`;
  return `${base}${cleanPath}`;
}

/**
 * Consulta la identidad visual pública de la marca activa.
 */
export async function obtenerMarca() {
  const base = obtenerBaseUrl();
  const res = await fetch(`${base}/api/public/marca`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} al consultar marca`);
  }
  return res.json();
}

/**
 * Consulta el catálogo público con productos, categorías y tasa del día.
 */
export async function obtenerCatalogo() {
  const base = obtenerBaseUrl();
  const res = await fetch(`${base}/api/public/catalogo`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} al consultar catálogo`);
  }
  return res.json();
}

/**
 * Datos públicos para la sección de preguntas frecuentes: preguntas con respuesta, nombres de los métodos de
 * pago, métodos de envío y horario de atención. Si falla, la tienda funciona igual sin esa sección.
 */
export async function obtenerInfo() {
  const base = obtenerBaseUrl();
  const res = await fetch(`${base}/api/public/info`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Error HTTP ${res.status} al consultar información`);
  }
  return res.json();
}

/**
 * Envía el carrito para generar el pedido web y obtener el enlace a WhatsApp.
 * Gestiona errores con mensajes amables sin exponer detalles técnicos [R13].
 */
export async function enviarPedidoWeb(payload) {
  const base = obtenerBaseUrl();
  try {
    const res = await fetch(`${base}/api/public/pedidos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 200) {
      const data = await res.json();
      return { ok: true, data };
    }

    if (res.status === 429) {
      return {
        ok: false,
        status: 429,
        mensaje: "Has generado varios pedidos recientemente. Por favor espera unos minutos antes de intentar de nuevo.",
      };
    }

    if (res.status === 503) {
      return {
        ok: false,
        status: 503,
        mensaje: "Los pedidos web no están disponibles en este momento. Por favor intenta más tarde o comunícate directamente por WhatsApp.",
      };
    }

    if (res.status === 400) {
      return {
        ok: false,
        status: 400,
        mensaje: "No pudimos procesar tu pedido. Por favor revisa los productos y cantidades en tu carrito.",
      };
    }

    return {
      ok: false,
      status: res.status,
      mensaje: "Ocurrió un inconveniente al procesar tu pedido. Por favor intenta de nuevo en unos minutos.",
    };
  } catch (_networkError) {
    return {
      ok: false,
      status: 0,
      mensaje: "No fue posible conectar con el servidor. Por favor verifica tu conexión a internet e intenta nuevamente.",
    };
  }
}
