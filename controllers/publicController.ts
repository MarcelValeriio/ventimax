import crypto from "node:crypto";
const configManager = require("../services/configManager");
const bcv = require("../services/bcv");
const { getDatosNegocioSync } = require("../services/datosNegocioService");
const { getConfigCatalogoSync } = require("../services/catalogoConfigService");
const { registrarEventoCatalogo } = require("../services/catalogoAbusoService");
const { obtenerCategoriasDeProducto } = require("../services/catalogQuery");
const { pedidoPublicoSchema } = require("../validators");

let Producto = require("../models/Producto");
let Categoria = require("../models/Categoria");
let CarritoWeb = require("../models/CarritoWeb");

if (process.env.NODE_ENV === "test") {
  const dbLocal = require("../services/dbLocal");
  Producto = dbLocal.getProductoModel();
  Categoria = dbLocal.getCategoriaModel();
  CarritoWeb = dbLocal.getCarritoWebModel();
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
function obtenerNumeroWhatsApp(): string | null {
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

    return res.status(200).json({
      brandName,
      theme: {
        primaryColor,
        secondaryColor,
        logoUrl,
        productBrandLogoUrl,
      },
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
    const prefillText = plantillaPrefill.replace(/\{\{codigo\}\}/g, codigo);
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
