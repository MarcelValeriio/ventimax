const fs = require("fs").promises;
const path = require("path");
let Producto = require("../models/Producto");
let Categoria = require("../models/Categoria");
const configManager = require("./configManager");

/**
 * Obtiene los modelos adecuados según el entorno
 */
const getModels = () => {
  if (process.env.NODE_ENV === "test") {
    const dbLocal = require("./dbLocal");
    return {
      Producto: dbLocal.getProductoModel(),
      Categoria: dbLocal.getCategoriaModel(),
    };
  }
  return { Producto, Categoria };
};

/**
 * Helper para generar slugs limpios y consistentes para categorías
 */
const generarSlug = (texto: string): string => {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
};

/**
 * Realiza la siembra inicial del catálogo de productos y categorías en MongoDB Atlas.
 */
const seedDatabase = async () => {
  try {
    const { Producto: ProdModel, Categoria: CatModel } = getModels();

    // 1. Verificar si ya existen productos
    const count = await ProdModel.countDocuments();
    
    if (count > 0) {
      console.log("ℹ️ [SEED] El catálogo ya contiene datos, omitiendo siembra.");
      return;
    }

    console.log("🌱 [SEED] Sembrando catálogo inicial...");

    // 2. Obtener productos desde la configuración activa
    const products = configManager.get("products");

    if (!products || !Array.isArray(products) || products.length === 0) {
      console.warn("⚠️ [SEED] No se encontraron productos válidos para sembrar en config.");
      return;
    }

    // 3. Gestionar categorías requeridas (por defecto "General")
    const categoryMap = new Map(); // slug -> Categoria doc

    let catGeneral = await CatModel.findOne({ slug: "general" });
    if (!catGeneral) {
      console.log("🌱 [SEED] Creando categoría inicial 'General'...");
      catGeneral = await CatModel.create({ nombre: "General", slug: "general" });
    }
    categoryMap.set("general", catGeneral);

    // Recolectar nombres de categorías declaradas en los productos
    for (const p of products) {
      const categoriasNombres = Array.isArray(p.categorias)
        ? p.categorias
        : (typeof p.categoria === "string" && p.categoria.trim() ? [p.categoria.trim()] : []);

      for (const catNombre of categoriasNombres) {
        if (typeof catNombre !== "string" || !catNombre.trim()) continue;
        const nombre = catNombre.trim();
        const slug = generarSlug(nombre);
        if (!categoryMap.has(slug)) {
          let cat = await CatModel.findOne({ slug });
          if (!cat) {
            console.log(`🌱 [SEED] Creando categoría '${nombre}' (${slug})...`);
            cat = await CatModel.create({ nombre, slug });
          }
          categoryMap.set(slug, cat);
        }
      }
    }

    // 4. Mapear productos vinculando la categoría principal y el array multicategoría
    const productsWithCat = products.map(p => {
      const { categorias: catNombres, ...prodData } = p;
      let catIds: any[] = [];
      let catPrincipalId = catGeneral._id;

      if (Array.isArray(catNombres) && catNombres.length > 0) {
        catIds = catNombres
          .map((c: string) => {
            const slug = generarSlug(String(c));
            return categoryMap.get(slug)?._id;
          })
          .filter(Boolean);

        if (catIds.length > 0) {
          catPrincipalId = catIds[0];
        }
      }

      let imagenesMapped: any[] = [];
      if (Array.isArray(p.imagenes)) {
        imagenesMapped = p.imagenes
          .map((img: any) => {
            if (typeof img === "string" && img.trim()) {
              return { url: img.trim(), publicId: "" };
            }
            if (img && typeof img === "object" && img.url) {
              return { url: String(img.url).trim(), publicId: img.publicId || "" };
            }
            return null;
          })
          .filter(Boolean);
      }

      return {
        ...prodData,
        imagenes: imagenesMapped,
        categoria: catPrincipalId,
        categorias: catIds
      };
    });

    // 5. Inserción masiva
    await ProdModel.insertMany(productsWithCat);

    console.log(`✅ [SEED] Catálogo sembrado con ${productsWithCat.length} productos.`);
  } catch (error: any) {
    console.error(`❌ [SEED] Error crítico durante la siembra: ${error.message}`);
  }
};

module.exports = { seedDatabase };
