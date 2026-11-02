/**
 * Datos de demostración de F1 (producto ampliado) para el MongoDB LOCAL de Docker.
 *   npx tsx scripts/demo-repuestos-local.ts            → carga repuestos con SKU, OEM, atributos,
 *                                                        compatibilidad por vehículo y grupos de equivalencia;
 *                                                        genera archivos de prueba para Inventario → Importar
 *   npx tsx scripts/demo-repuestos-local.ts --borrar   → elimina solo lo que este script creó
 *
 * Se niega a correr contra una base que no sea 127.0.0.1/localhost. No carga el .env.
 * Todo lo creado queda marcado: IDs "demo-rep-", SKU "DEMO-", categorías que terminan en "(demo)".
 * Los archivos de importación quedan en scripts/demo-data/.
 */
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

const Producto = require("../models/Producto");
const Categoria = require("../models/Categoria");
const { generarXlsx, COLUMNAS_PRODUCTOS, COLUMNAS_COMPATIBILIDAD } = require("../services/importacionProductos");

const URI = process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/ventimax_local";
const SUFIJO = " (demo)";
const CARPETA = path.join(__dirname, "demo-data");

type Compat = { marca: string; modelo: string; anioDesde?: number; anioHasta?: number; motor?: string; version?: string; nota?: string };
type Rep = {
  sku: string;
  nombre: string;
  cat: string;
  precio: number;
  stock: number;
  fabricante: string;
  oem: string[];
  grupo?: string;
  descripcion: string;
  atributos?: { nombre: string; valor: string }[];
  compat?: Compat[];
  descuentoPct?: number;
};

const REPUESTOS: Rep[] = [
  {
    sku: "DEMO-PF-001", nombre: "Pastillas de freno delanteras Bosch", cat: "Frenos", precio: 30, stock: 12, fabricante: "Bosch",
    oem: ["04465-02220", "04465-12610"], grupo: "pastillas-corolla-09-14", descripcion: "Juego de 4 pastillas, calidad original.",
    atributos: [{ nombre: "Posición", valor: "Delantera" }, { nombre: "Material", valor: "Cerámica" }],
    compat: [
      { marca: "Toyota", modelo: "Corolla", anioDesde: 2009, anioHasta: 2014, motor: "1.8" },
      { marca: "Toyota", modelo: "Corolla", anioDesde: 2009, anioHasta: 2014, motor: "1.6" },
    ],
  },
  {
    sku: "DEMO-PF-002", nombre: "Pastillas de freno delanteras genéricas", cat: "Frenos", precio: 15, stock: 25, fabricante: "Genérico",
    oem: ["04465-02220"], grupo: "pastillas-corolla-09-14", descripcion: "Alternativa económica, misma medida.",
    atributos: [{ nombre: "Posición", valor: "Delantera" }, { nombre: "Material", valor: "Semimetálica" }],
    compat: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 2009, anioHasta: 2014 }],
  },
  {
    sku: "DEMO-DF-001", nombre: "Disco de freno ventilado", cat: "Frenos", precio: 45, stock: 6, fabricante: "Brembo",
    oem: ["43512-02220"], descripcion: "Par de discos delanteros.", descuentoPct: 10,
    atributos: [{ nombre: "Diámetro", valor: "275 mm" }],
    compat: [
      { marca: "Toyota", modelo: "Corolla", anioDesde: 2009, anioHasta: 2013, version: "GLi", nota: "Solo con ABS" },
      { marca: "Toyota", modelo: "Yaris", anioDesde: 2008, anioHasta: 2012 },
    ],
  },
  {
    sku: "DEMO-FA-001", nombre: "Filtro de aceite", cat: "Filtros", precio: 6, stock: 40, fabricante: "Fram",
    oem: ["90915-YZZD4"], descripcion: "Rosca estándar.",
    compat: [
      { marca: "Toyota", modelo: "Corolla", anioDesde: 2003, anioHasta: 2019 },
      { marca: "Toyota", modelo: "Yaris", anioDesde: 2006, anioHasta: 2016 },
      { marca: "Chevrolet", modelo: "Aveo", anioDesde: 2006, anioHasta: 2016, motor: "1.6" },
    ],
  },
  {
    sku: "DEMO-FAI-001", nombre: "Filtro de aire", cat: "Filtros", precio: 9, stock: 18, fabricante: "Mann",
    oem: ["17801-22020"], descripcion: "Elemento de papel.",
    compat: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 2009, anioHasta: 2014, motor: "1.8" }],
  },
  {
    sku: "DEMO-BU-001", nombre: "Bujía de iridio", cat: "Motor", precio: 11, stock: 60, fabricante: "NGK",
    oem: ["90919-01253"], grupo: "bujia-18l", descripcion: "Se vende por unidad.",
    atributos: [{ nombre: "Rosca", valor: "14 mm" }],
    compat: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 2009, anioHasta: 2014, motor: "1.8" }],
  },
  {
    sku: "DEMO-AC-001", nombre: "Aceite sintético 5W-30 (1 litro)", cat: "Lubricantes", precio: 8, stock: 80, fabricante: "Mobil",
    oem: [], descripcion: "Universal: sirve para cualquier vehículo a gasolina que pida 5W-30.",
    atributos: [{ nombre: "Viscosidad", valor: "5W-30" }],
  },
  {
    sku: "DEMO-AM-001", nombre: "Amortiguador delantero", cat: "Suspensión", precio: 55, stock: 0, fabricante: "Monroe",
    oem: ["48510-02450"], descripcion: "Agotado: sirve para probar el aviso de stock.",
    compat: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 2009, anioHasta: 2014 }],
  },
];

const aTexto = (r: Rep) => [
  r.sku, r.nombre, r.cat, String(r.precio), String(r.stock), "sí", r.fabricante, r.oem.join("; "), r.grupo || "", r.descripcion, "sí",
];
const aTextoCompat = (sku: string, c: Compat) => [
  sku, c.marca, c.modelo, c.anioDesde ? String(c.anioDesde) : "", c.anioHasta ? String(c.anioHasta) : "", c.motor || "", c.version || "", c.nota || "",
];

const csv = (cabecera: string[], filas: string[][]) =>
  [cabecera, ...filas].map((f) => f.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";

/** Archivos para Inventario → Importar: uno limpio, otro con cambios y otro con errores a propósito. */
async function generarArchivos() {
  fs.mkdirSync(CARPETA, { recursive: true });
  const cabP = COLUMNAS_PRODUCTOS.map((c: any) => c.titulo);
  const cabC = COLUMNAS_COMPATIBILIDAD.map((c: any) => c.titulo);

  // 1) Catálogo nuevo: 3 productos que NO están cargados (todos se crean)
  const nuevos: Rep[] = [
    {
      sku: "DEMO-RA-001", nombre: "Rótula de suspensión", cat: "Suspensión", precio: 22, stock: 10, fabricante: "TRW",
      oem: ["43330-09360"], descripcion: "Inferior izquierda.", compat: [{ marca: "Toyota", modelo: "Corolla", anioDesde: 2009, anioHasta: 2014 }],
    },
    {
      sku: "DEMO-CO-001", nombre: "Correa de distribución", cat: "Motor", precio: 28, stock: 7, fabricante: "Gates",
      oem: ["13568-09030"], descripcion: "Con tensor.", compat: [{ marca: "Chevrolet", modelo: "Aveo", anioDesde: 2006, anioHasta: 2016, motor: "1.6" }],
    },
    {
      sku: "DEMO-BA-001", nombre: "Batería 12V 45Ah", cat: "Eléctrico", precio: 70, stock: 5, fabricante: "Tudor",
      oem: [], descripcion: "Universal para carros pequeños.",
    },
  ];
  const nuevosCompat = nuevos.flatMap((r) => (r.compat || []).map((c) => aTextoCompat(r.sku, c)));
  fs.writeFileSync(path.join(CARPETA, "1-productos-nuevos.xlsx"), await generarXlsx({ productos: nuevos.map(aTexto), compatibilidad: nuevosCompat }));
  fs.writeFileSync(path.join(CARPETA, "1-productos-nuevos.productos.csv"), csv(cabP, nuevos.map(aTexto)));
  fs.writeFileSync(path.join(CARPETA, "1-productos-nuevos.compatibilidad.csv"), csv(cabC, nuevosCompat));

  // 2) Cambios: sube el precio de un producto ya cargado y baja el de otro (la vista previa muestra antes y después)
  const cambiados = [
    { ...REPUESTOS[0], precio: 34 },
    { ...REPUESTOS[3], precio: 5, stock: 55 },
  ];
  fs.writeFileSync(
    path.join(CARPETA, "2-cambios-de-precio.xlsx"),
    await generarXlsx({
      productos: cambiados.map(aTexto),
      compatibilidad: cambiados.flatMap((r) => (r.compat || []).map((c) => aTextoCompat(r.sku, c))),
    }),
  );

  // 3) Errores a propósito: la vista previa debe marcarlos y negarse a confirmar
  const malos = [
    ["DEMO-ER-001", "Sin precio", "Frenos", "", "5", "sí", "", "", "", "Precio vacío", "sí"],
    ["DEMO-ER-002", "SKU repetido A", "Frenos", "10", "5", "sí", "", "", "", "", "sí"],
    ["DEMO-ER-002", "SKU repetido B", "Frenos", "12", "5", "sí", "", "", "", "", "sí"],
  ];
  const compatMala = [
    ["DEMO-ER-003", "Toyota", "Corolla", "2014", "2009", "", "", "Año desde mayor que año hasta"],
    ["DEMO-NOEXISTE", "Toyota", "Yaris", "2010", "2012", "", "", "SKU que no está en la hoja Productos"],
  ];
  malos.push(["DEMO-ER-003", "Compatibilidad con años al revés", "Frenos", "9", "1", "sí", "", "", "", "", "sí"]);
  fs.writeFileSync(path.join(CARPETA, "3-con-errores.xlsx"), await generarXlsx({ productos: malos, compatibilidad: compatMala }));
}

async function borrar() {
  const cats = await Categoria.find({ nombre: new RegExp(`${SUFIJO.replace(/[()]/g, "\\$&")}$`) }).lean();
  const ids = cats.map((c: any) => c._id);
  const r = await Promise.all([
    Producto.deleteMany({ $or: [{ id: /^demo-rep-/ }, { sku: /^DEMO-/ }] }),
    Categoria.deleteMany({ _id: { $in: ids } }),
  ]);
  const total = r.reduce((s: number, x: any) => s + (x.deletedCount || 0), 0);
  fs.rmSync(CARPETA, { recursive: true, force: true });
  console.log(`🧹 Datos de demostración de repuestos eliminados (${total} documentos y la carpeta scripts/demo-data).`);
}

async function cargar() {
  const yaHay = await Producto.countDocuments({ id: /^demo-rep-/ });
  if (yaHay > 0) {
    console.log("ℹ️ Ya hay repuestos de demostración. Para recargarlos: --borrar y volver a ejecutar.");
    return;
  }
  const catPorNombre = new Map<string, any>();
  for (const nombre of [...new Set(REPUESTOS.map((r) => r.cat))]) {
    const completo = nombre + SUFIJO;
    const slug = "demo-" + nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
    const cat = (await Categoria.findOne({ slug })) || (await Categoria.create({ nombre: completo, slug }));
    catPorNombre.set(nombre, cat);
  }
  let n = 0;
  for (const r of REPUESTOS) {
    const cat = catPorNombre.get(r.cat);
    await Producto.create({
      id: `demo-rep-${++n}`,
      name: r.nombre,
      price: r.precio,
      descuentoPct: r.descuentoPct || 0,
      description: r.descripcion,
      categoria: cat._id,
      categorias: [cat._id],
      stock: r.stock,
      trackStock: true,
      sku: r.sku,
      marcaFabricante: r.fabricante,
      codigosOEM: r.oem,
      atributos: r.atributos || [],
      grupoEquivalencia: r.grupo || "",
      compatibilidad: r.compat || [],
    });
  }
  await generarArchivos();
  console.log(`✅ ${REPUESTOS.length} repuestos de demostración cargados en ${catPorNombre.size} categorías "(demo)".`);
  console.log("   Archivos para Inventario → Importar en scripts/demo-data/:");
  console.log("   1-productos-nuevos.xlsx (3 nuevos), 2-cambios-de-precio.xlsx (2 cambios), 3-con-errores.xlsx (debe negarse a confirmar)");
  console.log("   Búsquedas para probar en la lista: DEMO-PF-001 · 04465-02220 · 04465 02220 · toyota corolla 2012 · aveo 2010");
  console.log("   Para quitarlo: npx tsx scripts/demo-repuestos-local.ts --borrar");
}

async function main() {
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(URI)) {
    console.error("❌ Este script solo trabaja con la base local (127.0.0.1 o localhost).");
    process.exit(1);
  }
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 3000 });
  try {
    if (process.argv.includes("--borrar")) await borrar();
    else await cargar();
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  console.error("   ¿Está levantado MongoDB? docker compose -f docker-compose.local.yml up -d");
  process.exit(1);
});
