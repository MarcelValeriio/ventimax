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

module.exports = { nombreEnvio, detalleCostoEnvio };
