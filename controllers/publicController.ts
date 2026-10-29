import crypto from "node:crypto";
const configManager = require("../services/configManager");
const bcv = require("../services/bcv");
const { getDatosNegocioSync } = require("../services/datosNegocioService");
const { getConfigCatalogoSync } = require("../services/catalogoConfigService");
const { registrarEventoCatalogo } = require("../services/catalogoAbusoService");
const { obtenerCategoriasDeProducto } = require("../services/catalogQuery");
const { pedidoPublicoSchema } = require("../validators");
const { getPreguntasFrecuentesSync } = require("../services/preguntasFrecuentesService");
const { formatearHorarioAtencion } = require("../services/horarioService");
const { normalizarEmpresas, nombresEmpresas } = require("../services/empresasEnvio");

let Producto = require("../models/Producto");
let Categoria = require("../models/Categoria");
let CarritoWeb = require("../models/CarritoWeb");
let MetodoPago = require("../models/MetodoPago");
let MetodoEnvio = require("../models/MetodoEnvio");

if (process.env.NODE_ENV === "test") {
  const dbLocal = require("../services/dbLocal");
  Producto = dbLocal.getProductoModel();
  Categoria = dbLocal.getCategoriaModel();
  CarritoWeb = dbLocal.getCarritoWebModel();
  MetodoPago = dbLocal.getMetodoPagoModel();
  MetodoEnvio = dbLocal.getMetodoEnvioModel();
}

const ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Genera un código de 5 caracteres con el alfabeto seguro especificado.
 */
export function generarCodigoRandom(prefijo: string): string {
  let chars = "";
  for (let i = 0; i < 5; i++) {
    const idx = crypto.randomInt(0, ALFABETO_CODIGO.length);
    chars += ALFABETO_CODIGO[idx];
  }
  return `${prefijo}-${chars}`;
}

/**
 * Resuelve el número de WhatsApp para enlace del catálogo:
 * Datos del negocio -> WHATSAPP_PHONE -> ADMIN_PHONE_NUMBER
 */
function obtenerNumeroWhatsApp(incluirAdmin = true): string | null {
  try {
    const deDatos = getDatosNegocioSync()?.contacto?.whatsapp;
    if (deDatos && typeof deDatos === "string" && deDatos.trim() !== "") {
      const limpio = deDatos.replace(/\D/g, "");
      if (limpio.length >= 10) return limpio;
    }
  } catch (_e) {
    // Si datosNegocio falla, continuar con variables de entorno
  }

  const deEnv = process.env.WHATSAPP_PHONE;
  if (deEnv && typeof deEnv === "string" && deEnv.trim() !== "") {
    const limpio = deEnv.replace(/\D/g, "");
    if (limpio.length >= 10) return limpio;
  }

  if (!incluirAdmin) return null;

  const deAdmin = process.env.ADMIN_PHONE_NUMBER;
  if (deAdmin && typeof deAdmin === "string" && deAdmin.trim() !== "") {
    const limpio = deAdmin.replace(/\D/g, "");
    if (limpio.length >= 10) return limpio;
  }

  return null;
}

/**
 * GET /api/public/marca
 * Cache-Control: public, max-age=600
 * Expone únicamente datos visuales públicos de la marca activa.
 */
export async function getMarca(req: any, res: any) {
  try {
    res.setHeader("Cache-Control", "public, max-age=600");
    const brandName = configManager.get("settings.brandName") || "";
    const theme = configManager.get("settings.theme") || {};
    const primaryColor = theme.primaryColor || "";
    const secondaryColor = theme.secondaryColor || "";
    const logoUrl = theme.logoUrl || "";
    const productBrandLogoUrl = theme.productBrandLogoUrl || logoUrl;

    // Botón de ayuda de la tienda: solo con el número público del negocio. Nunca el ADMIN_PHONE_NUMBER
    // (es el teléfono personal del administrador); sin número, la tienda no muestra el botón.
    const numeroAyuda = obtenerNumeroWhatsApp(false);
    const ayuda = numeroAyuda
      ? {
          whatsapp: numeroAyuda,
          texto: configManager.get("settings.messages.webHelpPrefill") || "",
          textoProducto: configManager.get("settings.messages.webHelpPrefillProducto") || "",
        }
      : null;

    return res.status(200).json({
      brandName,
      theme: {
        primaryColor,
        secondaryColor,
        logoUrl,
        productBrandLogoUrl,
      },
      ayuda,
    });
  } catch (error: any) {
    console.error("❌ Error en getMarca pública:", error);
    return res.status(500).json({ error: "Error al obtener datos de la marca" });
  }
}

/**
 * GET /api/public/catalogo
 * Cache-Control: public, max-age=120
 * Lista blanca estricta de campos. Sin _id, stock exacto, publicId, trackStock ni notas internas.
 */
export async function getCatalogo(req: any, res: any) {
  try {
    res.setHeader("Cache-Control", "public, max-age=120");

    // 1. Tasa BCV del día
    let tasa: number | null = null;
    let fechaTasa: string | null = null;
    try {
      const infoTasa = await bcv.obtenerTasaUSD();
      if (infoTasa && typeof infoTasa.tasa === "number" && infoTasa.tasa > 0) {
        tasa = infoTasa.tasa;
        fechaTasa = infoTasa.fecha || null;
      }
    } catch (err: any) {
      console.warn("⚠️ [Catálogo] Error consultando tasa BCV:", err?.message || err);
    }

    // 2. Categorías activas
    const categoriasDb = await Categoria.find();
    const categoriasActivas = (categoriasDb || []).filter((c: any) => c && c.activo !== false);

    // Mapa ID -> Slug
    const catIdToSlug = new Map<string, string>();
    for (const c of categoriasActivas) {
      const idStr = String(c._id || "");
      if (idStr && c.slug) {
        catIdToSlug.set(idStr, c.slug);
      }
    }

    const categoriasResponse = categoriasActivas.map((c: any) => ({
      nombre: c.nombre,
      slug: c.slug,
    }));

    // 3. Productos activos
    const productosDb = await Producto.find({ activo: true });
    const productosResponse = (productosDb || [])
      .filter((p: any) => p && p.activo !== false)
      .map((p: any) => {
        const precioUsd = Number(p.price) || 0;
        const precioBs = tasa !== null ? Math.round(precioUsd * tasa * 100) / 100 : null;

        // Slugs de categorías
        const catIds = obtenerCategoriasDeProducto(p);
        const slugsSet = new Set<string>();
        for (const cid of catIds) {
          const s = catIdToSlug.get(cid);
          if (s) slugsSet.add(s);
        }

        // URLs de imágenes limpias de publicId
        const imagenesUrls: string[] = (p.imagenes || [])
          .map((img: any) => (typeof img === "string" ? img : img?.url))
          .filter(Boolean);

        // Disponibilidad: false si controla stock y no queda; nunca se expone el número
        const trackStock = Boolean(p.trackStock);
        const stockActual = Number(p.stock) || 0;
        const disponible = trackStock ? stockActual > 0 : true;

        return {
          id: p.id,
          nombre: p.name,
          descripcion: p.description || "",
          precioUsd,
          precioBs,
          imagenes: imagenesUrls,
          categorias: Array.from(slugsSet),
          disponible,
        };
      });

    return res.status(200).json({
      tasa,
      fechaTasa,
      // Solo categorías con algún producto: una vacía (p. ej. "General" de la siembra) sería un botón sin nada
      categorias: categoriasResponse.filter((c: any) =>
        productosResponse.some((p: any) => p.categorias.includes(c.slug)),
      ),
      productos: productosResponse,
    });
  } catch (error: any) {
    console.error("❌ Error en getCatalogo público:", error);
    return res.status(500).json({ error: "Error al obtener el catálogo público" });
  }
}

/**
 * GET /api/public/info
 * Cache-Control: public, max-age=300
 * Preguntas frecuentes con respuesta, nombres de los métodos de pago, envíos activos y horario.
 * Lista blanca: nunca cuentas, cédulas, correos ni instrucciones de pago.
 */
/** Enlace de Google Maps a partir de coordenadas (no requiere clave de API). */
export function enlaceMapa(latitud: number, longitud: number): string {
  return `https://maps.google.com/?q=${latitud.toFixed(6)},${longitud.toFixed(6)}`;
}

/**
 * Valida la entrega que eligió el cliente en la tienda (F2c). El método se busca en la base (activo); el costo
 * sale de ahí, nunca del navegador. Retiro no guarda ubicación; los demás exigen GPS o una dirección escrita.
 */
async function resolverEntrega(entrega: any): Promise<{ ok: true; value: any } | { ok: false; error: string }> {
  const metodo = await MetodoEnvio.findById(entrega.metodoId);
  if (!metodo || metodo.activo === false) {
    return { ok: false, error: "El método de entrega elegido no está disponible. Elige otro." };
  }
  const esRetiro = metodo.tipo === "retiro";
  // Cobro a destino: el cliente le paga el envío a la empresa al recibirlo; no suma al total
  const cobroADestino = !esRetiro && metodo.cobroADestino === true;
  const aConvenir = !esRetiro && !cobroADestino && metodo.costoTipo === "a_convenir";
  const costo = esRetiro || aConvenir || cobroADestino ? 0 : Number(metodo.costo) || 0;

  // Con empresas configuradas, el cliente elige una de la lista (se guarda el nombre tal como está en el panel)
  const empresas: string[] = esRetiro ? [] : nombresEmpresas(metodo.empresas);
  let empresa = "";
  if (empresas.length) {
    const pedida = String(entrega.empresa || "").trim().toLowerCase();
    empresa = empresas.find((e) => e.toLowerCase() === pedida) || "";
    if (!empresa) return { ok: false, error: "Elige la empresa de envío." };
  }
  // La ubicación del teléfono solo vale para el delivery en la ciudad; un envío nacional necesita los datos escritos
  const tieneGps =
    metodo.tipo === "delivery_local" && typeof entrega.latitud === "number" && typeof entrega.longitud === "number";
  const direccion = String(entrega.direccion || "").trim();

  if (!esRetiro && !tieneGps && direccion.length < 8) {
    return { ok: false, error: "Indica tu ubicación o escribe la dirección de entrega." };
  }

  return {
    ok: true,
    value: {
      metodoId: metodo._id,
      nombre: String(metodo.nombre || ""),
      tipo: String(metodo.tipo || ""),
      costo,
      aConvenir,
      empresa,
      cobroADestino,
      latitud: esRetiro || !tieneGps ? null : entrega.latitud,
      longitud: esRetiro || !tieneGps ? null : entrega.longitud,
      direccion: esRetiro ? "" : direccion,
    },
  };
}

export async function getInfo(req: any, res: any) {
  try {
    res.setHeader("Cache-Control", "public, max-age=300");

    const preguntas = getPreguntasFrecuentesSync()
      .items.filter((p: any) => p.respuesta && p.respuesta.trim() !== "")
      .map((p: any) => ({ pregunta: p.pregunta, respuesta: p.respuesta }));

    const pagosDb = await MetodoPago.find({ activo: true }).sort({ _id: 1 });
    const pagos = (pagosDb || [])
      .filter((m: any) => m && m.activo !== false && m.nombre)
      .map((m: any) => String(m.nombre));

    const horario = formatearHorarioAtencion();

    const enviosDb = await MetodoEnvio.find({ activo: true }).sort({ orden: 1, createdAt: 1 });
    const envios = (enviosDb || [])
      .filter((m: any) => m && m.activo !== false)
      .map((m: any) => {
        const esRetiro = m.tipo === "retiro";
        const aConvenir = m.costoTipo === "a_convenir";
        return {
          // Identificador para que la tienda envíe el método elegido (F2c); el servidor lo vuelve a validar
          id: String(m._id),
          nombre: String(m.nombre || ""),
          tipo: String(m.tipo || ""),
          pideDatos: esRetiro ? null : String(m.pideDatos || "") || null,
          // Envío nacional: empresas entre las que elige el cliente y si el envío se paga al recibirlo
          // Cada empresa con su logo (F2f); el logo viene solo si es de Cloudinary, sin publicId
          empresas: esRetiro ? [] : normalizarEmpresas(m.empresas).map((e: any) => ({ nombre: e.nombre, logoUrl: e.logoUrl })),
          cobroADestino: !esRetiro && m.cobroADestino === true,
          descripcion: String(m.descripcion || ""),
          costo: aConvenir ? null : Number(m.costo) || 0,
          aConvenir,
          // Solo el retiro tiene punto físico; sin horario propio se usa el de atención
          direccion: esRetiro ? String(m.direccion || "") || null : null,
          horario: esRetiro ? String(m.horario || "") || horario : null,
        };
      });

    return res.status(200).json({ preguntas, pagos, envios, horario });
  } catch (error: any) {
    console.error("❌ Error en getInfo público:", error);
    return res.status(500).json({ error: "Error al obtener la información de la tienda" });
  }
}

/**
 * POST /api/public/pedidos
 * Procesa la creación de un carrito web con código alfanumérico seguro.
 */
export async function postPedidoWeb(req: any, res: any) {
  try {
    const configCatalogo = getConfigCatalogoSync();
    if (configCatalogo.activo === false) {
      console.warn("⚠️ [Catálogo] POST /api/public/pedidos: catálogo web desactivado");
      return res.status(503).json({
        error: "El servicio de pedidos web se encuentra temporalmente suspendido",
      });
    }

    const prefijo = configCatalogo.prefijo || "PW";
    const vigenciaHoras = Number(configManager.get("settings.catalogo.vigenciaHoras")) || 72;

    // 1. Validación estricta Zod (primero, incluso para honeypots)
    const validation = pedidoPublicoSchema.safeParse(req.body);
    if (!validation.success) {
      await registrarEventoCatalogo("validacion");
      const errList = validation.error?.issues || validation.error?.errors || [];
      const detallesStr = errList.map((e: any) => `${(e.path || []).join(".")}: ${e.message}`).join(", ");
      console.warn(`⚠️ [Catálogo] POST /api/public/pedidos: validación fallida - ${detallesStr}`);
      return res.status(400).json({
        error: "Datos de pedido inválidos",
        detalles: errList.map((e: any) => ({
          campo: (e.path || []).join("."),
          mensaje: e.message || "Error de validación",
        })),
      });
    }

    const esHoneypot = typeof req.body?.website === "string" && req.body.website.trim() !== "";

    // 2. Consolidación de líneas duplicadas y validación de cantidad
    const itemsRaw = validation.data.items;
    const mapaItems = new Map<string, number>();
    for (const it of itemsRaw) {
      const actual = mapaItems.get(it.productoId) || 0;
      mapaItems.set(it.productoId, actual + it.cantidad);
    }

    for (const [, cant] of mapaItems.entries()) {
      if (cant > 50) {
        await registrarEventoCatalogo("validacion");
        console.warn("⚠️ [Catálogo] POST /api/public/pedidos: cantidad combinada excede 50 unidades");
        return res.status(400).json({
          error: "La cantidad combinada de un producto no puede exceder 50 unidades",
        });
      }
    }

    // 3. Verificación de productos en base de datos (por id de texto estricto)
    let totalUsd = 0;
    const itemsGuardar: Array<{
      productoId: string;
      nombre: string;
      precio: number;
      cantidad: number;
    }> = [];

    for (const [prodId, cantidad] of mapaItems.entries()) {
      // Consulta estricta por id de texto (nunca _id para evitar CastError)
      const prod = await Producto.findOne({ id: prodId });
      if (!prod) {
        await registrarEventoCatalogo("producto");
        console.warn(`⚠️ [Catálogo] POST /api/public/pedidos: producto '${prodId}' no encontrado`);
        return res.status(400).json({
          error: `El producto '${prodId}' no existe o no está disponible.`,
        });
      }
      if (prod.activo === false) {
        await registrarEventoCatalogo("producto");
        console.warn(`⚠️ [Catálogo] POST /api/public/pedidos: producto '${prod.name || prodId}' inactivo`);
        return res.status(400).json({
          error: `El producto '${prod.name || prodId}' no está disponible.`,
        });
      }
      if (prod.trackStock === true) {
        const stockDisponible = Number(prod.stock) || 0;
        if (stockDisponible < cantidad) {
          await registrarEventoCatalogo("producto");
          console.warn(`⚠️ [Catálogo] POST /api/public/pedidos: producto '${prod.name}' sin stock suficiente`);
          return res.status(400).json({
            error: `El producto '${prod.name}' no tiene disponibilidad suficiente.`,
          });
        }
      }

      const precioUnitario = Number(prod.price) || 0;
      totalUsd += precioUnitario * cantidad;
      itemsGuardar.push({
        productoId: prod.id,
        nombre: prod.name,
        precio: precioUnitario,
        cantidad,
      });
    }

    // 3b. Entrega elegida en la tienda (opcional): método de la base y costo fijo sumado al total
    let entregaGuardar: any = null;
    if (validation.data.entrega) {
      const entrega = await resolverEntrega(validation.data.entrega);
      if (entrega.ok === false) {
        await registrarEventoCatalogo("validacion");
        console.warn(`⚠️ [Catálogo] POST /api/public/pedidos: entrega rechazada - ${entrega.error}`);
        return res.status(400).json({ error: entrega.error });
      }
      entregaGuardar = entrega.value;
      totalUsd += entregaGuardar.costo;
    }

    totalUsd = Math.round(totalUsd * 100) / 100;

    // 4. Verificación de número de WhatsApp
    const numeroWhatsApp = obtenerNumeroWhatsApp();
    if (!numeroWhatsApp) {
      console.warn("⚠️ [Catálogo] POST /api/public/pedidos: número de WhatsApp no configurado");
      return res.status(503).json({
        error: "Los pedidos web no están disponibles por ahora",
      });
    }

    // 5. Generación de código único
    let codigo = "";
    let existe = true;
    let intentos = 0;
    while (existe && intentos < 10) {
      codigo = generarCodigoRandom(prefijo);
      const existente = await CarritoWeb.findOne({ codigo });
      if (!existente) existe = false;
      intentos++;
    }

    if (existe) {
      console.error("❌ [Catálogo] Imposible generar código único tras 10 intentos");
      return res.status(500).json({ error: "Error al generar el pedido" });
    }

    const expiraEn = new Date(Date.now() + vigenciaHoras * 3600 * 1000);

    // 6. Tasa BCV y enlace WhatsApp
    let totalBs: number | null = null;
    try {
      const infoTasa = await bcv.obtenerTasaUSD();
      if (infoTasa && typeof infoTasa.tasa === "number" && infoTasa.tasa > 0) {
        totalBs = Math.round(totalUsd * infoTasa.tasa * 100) / 100;
      }
    } catch (_e) {
      // Continuar sin tasa
    }

    const plantillaPrefill = configCatalogo.mensajePrefill || "Hola, quiero confirmar mi pedido web {{codigo}}";
    const lineasPrefill = [plantillaPrefill.replace(/\{\{codigo\}\}/g, codigo)];
    // La entrega viaja también en el mensaje: el asesor la ve aunque el bot esté en modo manual
    if (entregaGuardar) {
      const linea = (clave: string, valor: string) =>
        String(configManager.get(`settings.messages.${clave}`) || "").replace(/\{\{valor\}\}/g, valor);
      lineasPrefill.push(
        linea("webOrderPrefillEntrega", entregaGuardar.cobroADestino ? `${entregaGuardar.nombre} (cobro a destino)` : entregaGuardar.nombre)
      );
      if (entregaGuardar.empresa) lineasPrefill.push(linea("webOrderPrefillEmpresa", entregaGuardar.empresa));
      if (entregaGuardar.latitud !== null) {
        lineasPrefill.push(linea("webOrderPrefillUbicacion", enlaceMapa(entregaGuardar.latitud, entregaGuardar.longitud)));
      }
      if (entregaGuardar.direccion) lineasPrefill.push(linea("webOrderPrefillDireccion", entregaGuardar.direccion));
    }
    const prefillText = lineasPrefill.filter((l) => l.trim()).join("\n");
    const enlaceWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(prefillText)}`;

    // 7. Si es honeypot: responde exactamente igual pero SIN persistir en la base de datos
    if (esHoneypot) {
      await registrarEventoCatalogo("honeypot");
      console.warn("⚠️ [Catálogo] POST /api/public/pedidos: honeypot detectado");
      return res.status(200).json({
        codigo,
        totalUsd,
        totalBs,
        enlaceWhatsApp,
        expira: expiraEn.toISOString(),
      });
    }

    // 8. Persistencia en CarritoWeb con TTL
    await CarritoWeb.create({
      codigo,
      items: itemsGuardar,
      total: totalUsd,
      entrega: entregaGuardar,
      estado: "pendiente",
      telefono: null,
      pedidoId: null,
      creadoEn: new Date(),
      expiraEn,
    });

    await registrarEventoCatalogo("creado");

    return res.status(200).json({
      codigo,
      totalUsd,
      totalBs,
      enlaceWhatsApp,
      expira: expiraEn.toISOString(),
    });
  } catch (error: any) {
    console.error("❌ Error en postPedidoWeb:", error);
    return res.status(500).json({ error: "Error al procesar el pedido web" });
  }
}
