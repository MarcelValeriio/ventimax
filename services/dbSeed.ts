const fs = require("fs").promises;
const path = require("path");
const Producto = require("../models/Producto");
const Categoria = require("../models/Categoria");
const configManager = require("./configManager");

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
    // 1. Verificar si ya existen productos
    const count = await Producto.countDocuments();
    
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

    let catGeneral = await Categoria.findOne({ slug: "general" });
    if (!catGeneral) {
      console.log("🌱 [SEED] Creando categoría inicial 'General'...");
      catGeneral = await Categoria.create({ nombre: "General", slug: "general" });
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
          let cat = await Categoria.findOne({ slug });
          if (!cat) {
            console.log(`🌱 [SEED] Creando categoría '${nombre}' (${slug})...`);
            cat = await Categoria.create({ nombre, slug });
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

      return {
        ...prodData,
        categoria: catPrincipalId,
        categorias: catIds
      };
    });

    // 5. Inserción masiva
    await Producto.insertMany(productsWithCat);

    console.log(`✅ [SEED] Catálogo sembrado con ${productsWithCat.length} productos.`);
  } catch (error: any) {
    console.error(`❌ [SEED] Error crítico durante la siembra: ${error.message}`);
  }
};

module.exports = { seedDatabase };
