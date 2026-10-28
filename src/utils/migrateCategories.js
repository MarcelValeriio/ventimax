const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const Producto = require("../../models/Producto");
const Categoria = require("../../models/Categoria");

const migrateCategories = async () => {
  try {
    console.log("🚀 Iniciando migración de categorías...");
    await mongoose.connect(process.env.MONGODB_URI, {
      family: 4,
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ Conectado a MongoDB Atlas");

    const productos = await Producto.find({});
    console.log(`📦 Encontrados ${productos.length} productos para revisar.`);

    let actualizados = 0;

    for (const prod of productos) {
      // Si prod.categoria es un ObjectId válido, lo saltamos
      if (mongoose.isValidObjectId(prod.categoria)) {
        continue;
      }

      // Si es un String, procedemos a buscar o crear la categoría
      if (typeof prod.categoria === "string") {
        const catName = prod.categoria.trim();
        const slug = catName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

        let catDoc = await Categoria.findOne({ nombre: catName });
        if (!catDoc) {
          catDoc = await Categoria.findOne({ slug });
        }

        if (!catDoc) {
          console.log(`✨ Creando nueva categoría: ${catName}`);
          catDoc = await Categoria.create({ nombre: catName, slug });
        }

        // Actualizar producto
        prod.categoria = catDoc._id;
        await prod.save({ validateBeforeSave: false }); // Desactivar validación temporal por si acaso
        actualizados++;
        console.log(`🔄 Producto ${prod.id} actualizado a la categoría '${catName}' (${catDoc._id})`);
      }
    }

    console.log(`🏁 Migración completada. Productos actualizados: ${actualizados}`);
    process.exit(0);
  } catch (error) {
    console.error("❌ Error durante la migración:", error.message);
    process.exit(1);
  }
};

migrateCategories();
