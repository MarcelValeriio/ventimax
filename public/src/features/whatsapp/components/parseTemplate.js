/**
 * Sustituye tokens {nombre}, {items}, {totalUSD}, {totalBS}, {total}, {menu} en plantillas
 * de respuestas rápidas usando el contexto del chat activo.
 */
export default function parseTemplate(template, ctx = {}) {
  if (!template || typeof template !== "string") return "";

  const customerName = (ctx.customerName || "").trim() || "Hola";
  const totalUSD =
    ctx.totalUSD != null && ctx.totalUSD > 0 ? `$${ctx.totalUSD}` : "";
  const totalBS = ctx.totalBS ? `(Bs. ${ctx.totalBS})` : "";

  const total = totalUSD
    ? [totalUSD, totalBS].filter(Boolean).join(" ") || "tu pedido"
    : "tu pedido";

  let itemsFormatted = "tu pedido";
  if (Array.isArray(ctx.items) && ctx.items.length > 0) {
    itemsFormatted = ctx.items
      .map((it) => {
        const prod = (it.producto || it.name || "Producto").trim();
        const cant = Number(it.cantidad) || 1;
        const subtotal = (Number(it.price) || 0) * cant;
        return `• ${prod} x${cant} - $${subtotal.toFixed(2)}`;
      })
      .join("\n");
  }

  const menuFormatted =
    (ctx.menuTexto || ctx.menu || "").trim() ||
    "En este momento no hay productos disponibles en el menú.";

  const valores = {
    "{nombre}": customerName,
    "{totalUSD}": totalUSD,
    "{totalBS}": totalBS,
    "{total}": total,
    "{items}": itemsFormatted,
    "{menu}": menuFormatted,
  };

  // Función como reemplazo para que "$" NO se interprete como grupo de captura
  const texto = template.replace(
    /\{(nombre|totalUSD|totalBS|total|items|menu)\}/g,
    (match, token) =>
      valores[`{${token}}`] !== undefined ? valores[`{${token}}`] : match,
  );

  // Limpieza: conservar saltos de línea (\n), limpiar solo espacios dobles dentro de una línea
  return texto
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .trim();
}
