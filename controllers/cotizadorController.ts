/**
 * controllers/cotizadorController.ts (F1-8)
 * POST /api/public/cotizar-envio. Vive aparte de publicController para que el peso de la base (pesoKg, que no se
 * expone en la API pública) se lea solo aquí y nunca se devuelva al navegador.
 */
const { normalizarEmpresas } = require("../services/empresasEnvio");
const { precioVigente } = require("../services/precios");
const bcv = require("../services/bcv");

let Producto = require("../models/Producto");
let MetodoEnvio = require("../models/MetodoEnvio");
if (process.env.NODE_ENV === "test") {
  const dbLocal = require("../services/dbLocal");
  Producto = dbLocal.getProductoModel();
  MetodoEnvio = dbLocal.getMetodoEnvioModel();
}

/**
 * POST /api/public/cotizar-envio (F1-8)
 * Body: { items: [{ id, cantidad }], metodoId, empresaId (nombre de la empresa), ciudadDestino?, sucursalId? }
 * El peso y el precio salen de la base; el cliente solo elige. Todos los envíos son cobro a destino y retiro
 * en agencia: el estimado es informativo y no suma al total. Sin estimado → { disponible: false }.
 */
export async function postCotizarEnvio(req: any, res: any) {
  try {
    const cotizador = require("../services/cotizadorEnvio");
    const body = req.body || {};
    const itemsRaw = Array.isArray(body.items) ? body.items : null;
    if (!itemsRaw || itemsRaw.length === 0 || itemsRaw.length > 50) {
      return res.status(400).json({ error: "Carrito inválido" });
    }
    const cantidades = new Map<string, number>();
    for (const it of itemsRaw) {
      const id = typeof it?.id === "string" ? it.id.trim() : "";
      const cant = Number(it?.cantidad);
      if (!id || id.length > 100 || !Number.isInteger(cant) || cant < 1 || cant > 50) {
        return res.status(400).json({ error: "Carrito inválido" });
      }
      cantidades.set(id, (cantidades.get(id) || 0) + cant);
    }
    const metodoId = typeof body.metodoId === "string" ? body.metodoId.trim() : "";
    const empresaId = typeof body.empresaId === "string" ? body.empresaId.trim().slice(0, 40) : "";
    const ciudadDestino = typeof body.ciudadDestino === "string" ? body.ciudadDestino.trim().slice(0, 60) : "";
    const sucursalId = typeof body.sucursalId === "string" ? body.sucursalId.trim().slice(0, 40) : "";
    const sinEstimado = { disponible: false };

    if (!metodoId || !empresaId) return res.status(200).json(sinEstimado);
    let metodo: any = null;
    try {
      metodo = await MetodoEnvio.findById(metodoId);
    } catch {
      metodo = null;
    }
    if (!metodo || metodo.activo === false || metodo.tipo === "retiro" || metodo.cobroADestino !== true) {
      return res.status(200).json(sinEstimado);
    }
    const emp = normalizarEmpresas(metodo.empresas).find(
      (e: any) => e.nombre.toLowerCase() === empresaId.toLowerCase(),
    );
    if (!emp || !emp.cotizador) return res.status(200).json(sinEstimado);

    // Peso y precio de la base (nunca del navegador)
    const itemsPeso: { pesoKg: unknown; cantidad: number }[] = [];
    let subtotalUsd = 0;
    for (const [prodId, cant] of cantidades.entries()) {
      const prod: any = await Producto.findOne({ id: prodId });
      if (!prod || prod.activo === false) return res.status(200).json(sinEstimado);
      itemsPeso.push({ pesoKg: prod.pesoKg, cantidad: cant });
      subtotalUsd += precioVigente(prod) * cant;
    }
    const peso = cotizador.pesoPedido(itemsPeso);
    if (!peso.ok) return res.status(200).json(sinEstimado);

    const tasaInfo = await bcv.obtenerTasaUSD();
    if (!tasaInfo || !(Number(tasaInfo.tasa) > 0)) return res.status(200).json(sinEstimado);
    const tasa = Number(tasaInfo.tasa);

    // Zoom: ciudad de la sucursal elegida o la escrita; el código de oficina sale de la sucursal
    let ciudad = ciudadDestino;
    let oficina = "";
    if (emp.cotizador === "zoom" && emp.slug && sucursalId) {
      const ciudadSuc = await cotizador.ciudadDeSucursal(emp.slug, sucursalId);
      if (ciudadSuc) ciudad = ciudadSuc;
      oficina = await cotizador.oficinaDeSucursal(emp.slug, sucursalId);
    }

    const estimado = await cotizador.cotizarEnvio({
      cotizador: emp.cotizador,
      kg: peso.kg,
      ciudadDestino: ciudad,
      oficina,
      montoMercanciaBs: subtotalUsd * tasa,
    });
    if (!estimado) return res.status(200).json(sinEstimado);

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      disponible: true,
      montoUsd: cotizador.bsAUsd(estimado.montoBs, tasa),
      montoBs: Math.round(estimado.montoBs * 100) / 100,
      fecha: estimado.fecha,
      estimado: true,
    });
  } catch (error: any) {
    console.error("❌ Error en postCotizarEnvio:", error);
    return res.status(500).json({ error: "Error al cotizar el envío" });
  }
}
