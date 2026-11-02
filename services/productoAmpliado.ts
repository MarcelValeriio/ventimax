/**
 * services/productoAmpliado.ts (F1-1)
 *
 * Normalización y validación de los campos ampliados del producto: SKU, marca fabricante, códigos OEM,
 * atributos, grupo de equivalencia y compatibilidad por vehículo.
 * Funciones puras: sin BD ni DOM. Las usa el hook pre("validate") de models/Producto.ts.
 * Todos los campos son opcionales: un producto sin ellos devuelve ok.
 */

export interface ResultadoValidacion<T = any> {
  ok: boolean;
  valor: T;
  errores: string[];
}

export const LIMITES = {
  sku: 40,
  marcaFabricante: 60,
  codigosOEM: 30, // cantidad de códigos
  codigoOEM: 30, // caracteres por código
  atributos: 20,
  atributoNombre: 40,
  atributoValor: 120,
  grupoEquivalencia: 60,
  compatibilidad: 200,
  compatibilidadMarca: 60,
  compatibilidadModelo: 60,
  motor: 20,
  version: 40,
  nota: 120,
  anioMin: 1950,
  anioMax: 2100,
};

/** Minúsculas, sin acentos (NFD), sin espacios repetidos, sin espacios al borde. */
export function normalizarTexto(s: any): string {
  if (s === undefined || s === null) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Mayúsculas, sin espacios ni guiones. */
export function normalizarCodigoOEM(s: any): string {
  if (s === undefined || s === null) return "";
  return String(s).toUpperCase().replace(/[\s-]+/g, "");
}

function textoLimitado(valor: any, max: number, etiqueta: string, errores: string[]): string {
  if (valor === undefined || valor === null) return "";
  if (typeof valor !== "string" && typeof valor !== "number") {
    errores.push(`${etiqueta} no es válido.`);
    return "";
  }
  const texto = String(valor).trim();
  if (texto.length > max) errores.push(`${etiqueta} no puede tener más de ${max} caracteres.`);
  return texto;
}

function anioValido(valor: any, etiqueta: string, errores: string[]): number | undefined {
  if (valor === undefined || valor === null || valor === "") return undefined;
  const n = typeof valor === "number" ? valor : Number(String(valor).trim());
  if (!Number.isInteger(n) || n < LIMITES.anioMin || n > LIMITES.anioMax) {
    errores.push(`${etiqueta} debe ser un año entre ${LIMITES.anioMin} y ${LIMITES.anioMax}.`);
    return undefined;
  }
  return n;
}

/**
 * Normaliza la lista de compatibilidad. `marcaNorm` y `modeloNorm` los calcula el servidor:
 * cualquier valor que envíe el cliente se ignora.
 */
export function normalizarCompatibilidad(lista: any): ResultadoValidacion<any[]> {
  const errores: string[] = [];
  if (lista === undefined || lista === null) return { ok: true, valor: [], errores };
  if (!Array.isArray(lista)) return { ok: false, valor: [], errores: ["La compatibilidad debe ser una lista."] };
  if (lista.length > LIMITES.compatibilidad) {
    errores.push(`La compatibilidad no puede tener más de ${LIMITES.compatibilidad} vehículos.`);
  }

  const valor: any[] = [];
  lista.forEach((fila: any, i: number) => {
    const n = i + 1;
    if (!fila || typeof fila !== "object") {
      errores.push(`Compatibilidad, fila ${n}: no es válida.`);
      return;
    }
    const marca = textoLimitado(fila.marca, LIMITES.compatibilidadMarca, `Compatibilidad, fila ${n}: la marca`, errores);
    const modelo = textoLimitado(fila.modelo, LIMITES.compatibilidadModelo, `Compatibilidad, fila ${n}: el modelo`, errores);
    if (!marca) errores.push(`Compatibilidad, fila ${n}: falta la marca del vehículo.`);
    if (!modelo) errores.push(`Compatibilidad, fila ${n}: falta el modelo del vehículo.`);

    const anioDesde = anioValido(fila.anioDesde, `Compatibilidad, fila ${n}: el año desde`, errores);
    const anioHasta = anioValido(fila.anioHasta, `Compatibilidad, fila ${n}: el año hasta`, errores);
    if (anioDesde !== undefined && anioHasta !== undefined && anioDesde > anioHasta) {
      errores.push(`Compatibilidad, fila ${n}: el año desde no puede ser mayor que el año hasta.`);
    }

    const motor = textoLimitado(fila.motor, LIMITES.motor, `Compatibilidad, fila ${n}: el motor`, errores);
    const version = textoLimitado(fila.version, LIMITES.version, `Compatibilidad, fila ${n}: la versión`, errores);
    const nota = textoLimitado(fila.nota, LIMITES.nota, `Compatibilidad, fila ${n}: la nota`, errores);

    const item: any = {
      marca,
      modelo,
      marcaNorm: normalizarTexto(marca),
      modeloNorm: normalizarTexto(modelo),
      motor,
      version,
      nota,
    };
    if (anioDesde !== undefined) item.anioDesde = anioDesde;
    if (anioHasta !== undefined) item.anioHasta = anioHasta;
    valor.push(item);
  });

  return { ok: errores.length === 0, valor, errores };
}

/**
 * Valida y normaliza los campos ampliados. Solo devuelve en `valor` los campos que llegaron
 * (undefined = no tocado). Un SKU vacío devuelve "" para que el modelo lo guarde sin valor
 * (el índice único es disperso).
 */
export function validarProductoAmpliado(datos: any): ResultadoValidacion<Record<string, any>> {
  const errores: string[] = [];
  const valor: Record<string, any> = {};
  const d = datos || {};

  if (d.sku !== undefined) {
    const sku = textoLimitado(d.sku, LIMITES.sku, "El SKU", errores).toUpperCase();
    valor.sku = sku;
  }

  if (d.marcaFabricante !== undefined) {
    valor.marcaFabricante = textoLimitado(d.marcaFabricante, LIMITES.marcaFabricante, "La marca del fabricante", errores);
  }

  if (d.grupoEquivalencia !== undefined) {
    valor.grupoEquivalencia = textoLimitado(d.grupoEquivalencia, LIMITES.grupoEquivalencia, "El grupo de equivalencia", errores);
  }

  if (d.codigosOEM !== undefined) {
    const lista = d.codigosOEM === null ? [] : d.codigosOEM;
    if (!Array.isArray(lista)) {
      errores.push("Los códigos OEM deben ser una lista.");
    } else {
      const codigos: string[] = [];
      for (const bruto of lista) {
        const codigo = normalizarCodigoOEM(bruto);
        if (!codigo) continue;
        if (codigo.length > LIMITES.codigoOEM) {
          errores.push(`El código OEM "${codigo.slice(0, 12)}…" no puede tener más de ${LIMITES.codigoOEM} caracteres.`);
          continue;
        }
        if (!codigos.includes(codigo)) codigos.push(codigo);
      }
      if (codigos.length > LIMITES.codigosOEM) {
        errores.push(`No puede haber más de ${LIMITES.codigosOEM} códigos OEM por producto.`);
      }
      valor.codigosOEM = codigos;
    }
  }

  if (d.atributos !== undefined) {
    const lista = d.atributos === null ? [] : d.atributos;
    if (!Array.isArray(lista)) {
      errores.push("Los atributos deben ser una lista.");
    } else {
      if (lista.length > LIMITES.atributos) {
        errores.push(`No puede haber más de ${LIMITES.atributos} atributos por producto.`);
      }
      const atributos: { nombre: string; valor: string }[] = [];
      lista.forEach((a: any, i: number) => {
        const n = i + 1;
        if (!a || typeof a !== "object") {
          errores.push(`Atributo ${n}: no es válido.`);
          return;
        }
        const nombre = textoLimitado(a.nombre, LIMITES.atributoNombre, `Atributo ${n}: el nombre`, errores);
        const val = textoLimitado(a.valor, LIMITES.atributoValor, `Atributo ${n}: el valor`, errores);
        if (!nombre) errores.push(`Atributo ${n}: falta el nombre.`);
        atributos.push({ nombre, valor: val });
      });
      valor.atributos = atributos;
    }
  }

  if (d.compatibilidad !== undefined) {
    const r = normalizarCompatibilidad(d.compatibilidad);
    errores.push(...r.errores);
    valor.compatibilidad = r.valor;
  }

  return { ok: errores.length === 0, valor, errores };
}
