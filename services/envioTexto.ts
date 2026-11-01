/**
 * services/envioTexto.ts
 * Cómo se nombra el envío de un pedido en los mensajes (resumen del bot, comanda, notificaciones): el método,
 * la empresa elegida por el cliente (envío nacional) y si el envío es cobro a destino.
 */

/** "Envíos Nacionales · MRW" o solo el nombre del método. */
export function nombreEnvio(envio: any): string {
  if (!envio || !envio.nombre) return "";
  return envio.empresa ? `${envio.nombre} · ${envio.empresa}` : String(envio.nombre);
}

/** Detalle del costo entre paréntesis: cobro a destino, acordado, a convenir o el monto fijo. */
export function detalleCostoEnvio(envio: any): string {
  if (!envio) return "";
  if (envio.cobroADestino) return " (cobro a destino)";
  if (envio.costoAcordado) return ` ($${Number(envio.costo).toFixed(2)}, acordado con el asesor)`;
  if (envio.aConvenir) return " (A convenir)";
  if (envio.costo) return ` ($${Number(envio.costo).toFixed(2)})`;
  return "";
}

/** Formato legible de la sucursal de envío: "ZOOM 1234 — Principal Maracaibo, Maracaibo (Zulia)". */
export function textoSucursalEnvio(envio: any): string {
  const s = envio?.sucursal;
  if (!s || !s.codigo) return "";
  const emp = s.empresa ? `${String(s.empresa).toUpperCase()} ` : "";
  const partes = [];
  if (s.nombre) partes.push(s.nombre);
  if (s.ciudad) partes.push(s.ciudad);
  const detalleLugar = partes.join(", ");
  const estadoTxt = s.estado ? ` (${s.estado})` : "";
  return `${emp}${s.codigo} — ${detalleLugar}${estadoTxt}`;
}

/** Dirección oficial de la sucursal o cadena vacía si no existe. */
export function direccionSucursalEnvio(envio: any): string {
  return String(envio?.sucursal?.direccion || "").trim();
}

module.exports = { nombreEnvio, detalleCostoEnvio, textoSucursalEnvio, direccionSucursalEnvio };
