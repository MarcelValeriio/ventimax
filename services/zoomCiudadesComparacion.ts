/**
 * services/zoomCiudadesComparacion.ts
 *
 * Funciones puras para comparar la tabla de códigos de oficina de Zoom (services/zoomCiudades.ts) con lo que Zoom
 * lista hoy. Sin red, sin BD y sin imports: lo usan services/zoomCiudadesMonitor.ts y
 * scripts/regenerar-zoom-ciudades.ts (que no debe cargar modelos ni configuración).
 */

export interface CambioOficinaZoom {
  oficina: string;
  antes: string;
  ahora: string;
}

export interface ResultadoComparacionZoom {
  cambiadas: CambioOficinaZoom[];
  desaparecidas: string[];
  nuevas: { oficina: string; codciudad: string }[];
}

export const porNumero = (a: string, b: string) => Number(a) - Number(b) || a.localeCompare(b);

/**
 * Compara la tabla guardada (oficina -> codciudad) con lo que Zoom lista hoy (codciudad -> oficinas).
 * Sin red ni BD. Las listas salen ordenadas por código de oficina.
 */
export function compararTablaZoom(
  tablaActual: Record<string, number | string>,
  oficinasPorCiudad: Record<string, Array<number | string>>,
): ResultadoComparacionZoom {
  const ahoraPorOficina = new Map<string, string[]>();
  Object.keys(oficinasPorCiudad).forEach((codciudad) => {
    (oficinasPorCiudad[codciudad] || []).forEach((oficina) => {
      const clave = String(oficina);
      const donde = ahoraPorOficina.get(clave) || [];
      donde.push(String(codciudad));
      ahoraPorOficina.set(clave, donde);
    });
  });

  const cambiadas: CambioOficinaZoom[] = [];
  const desaparecidas: string[] = [];
  Object.keys(tablaActual).forEach((oficina) => {
    const antes = String(tablaActual[oficina]);
    const donde = ahoraPorOficina.get(oficina);
    if (!donde || donde.length === 0) {
      desaparecidas.push(oficina);
    } else if (!donde.includes(antes)) {
      cambiadas.push({ oficina, antes, ahora: [...donde].sort(porNumero)[0] });
    }
  });

  const nuevas: { oficina: string; codciudad: string }[] = [];
  ahoraPorOficina.forEach((donde, oficina) => {
    if (!Object.prototype.hasOwnProperty.call(tablaActual, oficina)) {
      nuevas.push({ oficina, codciudad: [...donde].sort(porNumero)[0] });
    }
  });

  return {
    cambiadas: cambiadas.sort((a, b) => porNumero(a.oficina, b.oficina)),
    desaparecidas: desaparecidas.sort(porNumero),
    nuevas: nuevas.sort((a, b) => porNumero(a.oficina, b.oficina)),
  };
}

/** Oficinas (codoficina) de la respuesta de getOficinas. Lanza si la respuesta no es válida. */
export function extraerOficinasZoom(data: any): string[] {
  if (data?.codrespuesta && data.codrespuesta !== "COD_000") {
    throw new Error(`respuesta ${data.codrespuesta}`);
  }
  // Una ciudad sin oficinas responde texto, no lista: es vacío válido. Otro texto es error (no vaciar la tabla).
  if (typeof data?.entidadRespuesta === "string" && /NO HAY OFICINAS/i.test(data.entidadRespuesta)) return [];
  if (!Array.isArray(data?.entidadRespuesta)) throw new Error("respuesta sin lista");
  return data.entidadRespuesta
    .filter((o: any) => o && o.codoficina !== undefined && o.codoficina !== null)
    .map((o: any) => String(o.codoficina));
}
