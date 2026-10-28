/**
 * scripts/test-multicategoria.ts
 * Suite de validación para la arquitectura Multicategoría (F0-7).
 * Criterio de Cierre:
 * - N04 sale en Mesa y en Pared.
 * - N04 no aparece en Pedestal.
 * - Si se agrega al carrito desde dos categorías distintas, suma cantidades en una sola línea.
 * - Las consultas respetan filtroPorCategoria y getMenuDinamico refleja las secciones.
 *
 * Ejecución: NODE_ENV=test npx tsx scripts/test-multicategoria.ts
 */

process.env.NODE_ENV = "test";

const assert = require("assert");
const dbLocal = require("../services/dbLocal");
const {
  filtroPorCategoria,
  productoPerteneceACategoria,
  obtenerCategoriasDeProducto,
} = require("../services/catalogQuery");
const chatFlow = require("../controllers/chatFlowController");
const chatFlowService = require("../services/chatFlowService");
const orderService = require("../services/orderService");
const { getMenuDinamico } = require("../services/faqMatcher");

async function runTests() {
  console.log("🚀 Iniciando suite de pruebas para Multicategoría (F0-7)...");

  // Modelos con backend mock dbLocal
  const Producto = dbLocal.getProductoModel();
  const Categoria = dbLocal.getCategoriaModel();

  // 1. Limpieza y preparación de datos
  await Producto.deleteMany({});
  await Categoria.deleteMany();

  const catMesa = await Categoria.create({
    nombre: "Mesa",
    slug: "mesa",
    padre: null,
  });
  const catPared = await Categoria.create({
    nombre: "Pared",
    slug: "pared",
    padre: null,
  });
  const catPedestal = await Categoria.create({
    nombre: "Pedestal",
    slug: "pedestal",
    padre: null,
  });

  const prodN21 = await Producto.create({
    id: "fortunne-n21",
    name: "Fortunne Mini Jumbo 6\"",
    price: 25.0,
    description: "6\" (15,24 cm), 3 aspas aerodinámicas, 3 velocidades",
    categoria: catMesa._id,
    categorias: [catMesa._id],
    activo: true,
    stock: 10,
    trackStock: false,
  });

  const prodN04 = await Producto.create({
    id: "fortunne-n04",
    name: "Fortunne Turbo Fan 10\"",
    price: 40.0,
    description: "10\" (25,4 cm), 2 en 1 mesa/pared, 3 velocidades",
    categoria: catMesa._id,
    categorias: [catMesa._id, catPared._id],
    activo: true,
    stock: 15,
    trackStock: false,
  });

  const prodN37 = await Producto.create({
    id: "fortunne-n37",
    name: "Fortunne Ventilador de Pedestal 18\"",
    price: 25.0,
    description: "18\" (45,72 cm), 180 W, 3 aspas, altura ajustable",
    categoria: catPedestal._id,
    categorias: [catPedestal._id],
    activo: true,
    stock: 8,
    trackStock: false,
  });

  console.log("  🌱 Datos semilla multicategoría insertados.");

  // Test 1: Helper catalogQuery en memoria
  console.log("▶ Test 1: Helper productoPerteneceACategoria...");
  assert.strictEqual(
    productoPerteneceACategoria(prodN04, catMesa._id),
    true,
    "N04 debe pertenecer a Mesa (categoría principal)"
  );
  assert.strictEqual(
    productoPerteneceACategoria(prodN04, catPared._id),
    true,
    "N04 debe pertenecer a Pared (categoría secundaria)"
  );
  assert.strictEqual(
    productoPerteneceACategoria(prodN04, catPedestal._id),
    false,
    "N04 NO debe pertenecer a Pedestal"
  );
  assert.strictEqual(
    productoPerteneceACategoria(prodN21, catPared._id),
    false,
    "N21 no pertenece a Pared"
  );

  const catsN04 = obtenerCategoriasDeProducto(prodN04);
  assert.strictEqual(catsN04.length, 2, "N04 debe tener 2 categorías únicas");

  // Validación de filtroPorCategoria(null / undefined): debe retornar {} (sin filtro)
  assert.deepStrictEqual(filtroPorCategoria(null), {}, "filtroPorCategoria(null) debe retornar {}");
  assert.deepStrictEqual(filtroPorCategoria(undefined), {}, "filtroPorCategoria(undefined) debe retornar {}");
  console.log("  ✅ Test 1 superado");

  // Test 2: Consulta DB - Categoría Mesa
  console.log("▶ Test 2: Consulta por categoría Mesa (incluye N21 y N04)...");
  const prodsMesa = await Producto.find(filtroPorCategoria(catMesa._id));
  const idsMesa = prodsMesa.map((p: any) => p.id);
  assert.ok(idsMesa.includes("fortunne-n21"), "Mesa debe incluir N21");
  assert.ok(idsMesa.includes("fortunne-n04"), "Mesa debe incluir N04");
  assert.ok(!idsMesa.includes("fortunne-n37"), "Mesa NO debe incluir N37");
  console.log("  ✅ Test 2 superado");

  // Test 3: Consulta DB - Categoría Pared
  console.log("▶ Test 3: Consulta por categoría Pared (incluye N04, no N21 ni N37)...");
  const prodsPared = await Producto.find(filtroPorCategoria(catPared._id));
  const idsPared = prodsPared.map((p: any) => p.id);
  assert.ok(idsPared.includes("fortunne-n04"), "Pared debe incluir N04");
  assert.ok(!idsPared.includes("fortunne-n21"), "Pared NO debe incluir N21");
  assert.ok(!idsPared.includes("fortunne-n37"), "Pared NO debe incluir N37");
  console.log("  ✅ Test 3 superado");

  // Test 3b: Test negativo de semántica MongoDB para mocks
  console.log("▶ Test 3b (Negativo): Producto.find({ categoria: Pared }) NO debe devolver N04...");
  const prodsParedDirecto = await Producto.find({ categoria: catPared._id });
  const idsParedDirecto = prodsParedDirecto.map((p: any) => p.id);
  assert.ok(
    !idsParedDirecto.includes("fortunne-n04"),
    "Una consulta directa { categoria: id } sin $or NO debe devolver N04 porque su categoría principal es Mesa"
  );
  console.log("  ✅ Test 3b superado (semántica estricta de MongoDB en mocks verificada)");

  // Test 4: Consulta DB - Categoría Pedestal
  console.log("▶ Test 4: Consulta por categoría Pedestal (N04 NO aparece)...");
  const prodsPedestal = await Producto.find(filtroPorCategoria(catPedestal._id));
  const idsPedestal = prodsPedestal.map((p: any) => p.id);
  assert.ok(idsPedestal.includes("fortunne-n37"), "Pedestal debe incluir N37");
  assert.ok(!idsPedestal.includes("fortunne-n04"), "N04 NO debe aparecer en Pedestal");
  assert.ok(!idsPedestal.includes("fortunne-n21"), "N21 NO debe aparecer en Pedestal");
  console.log("  ✅ Test 4 superado");

  // Test 5: Consulta con $and combinando stock y categoría
  console.log("▶ Test 5: Consulta combinada ($and de stock + filtroPorCategoria)...");
  const prodsCombinados = await Producto.find({
    $and: [
      { activo: true },
      { $or: [{ trackStock: { $ne: true } }, { stock: { $gt: 0 } }] },
      filtroPorCategoria(catPared._id),
    ],
  });
  assert.strictEqual(prodsCombinados.length, 1, "Solo N04 debe coincidir en Pared con stock activo");
  assert.strictEqual(prodsCombinados[0].id, "fortunne-n04");
  console.log("  ✅ Test 5 superado");

  // Test 6: Carrito multicategoría - suma en una sola línea
  console.log("▶ Test 6: Agregar N04 desde dos categorías distintas suma cantidades en una sola línea...");
  const telefonoTest = "584129990001";
  const ioMock = { emit: () => {} };

  // Paso 1: Usuario elige N04 desde categoría "mesa" con cantidad 1
  await orderService.setEstado(
    telefonoTest,
    {
      paso: "esperando_cantidad",
      categoria: "mesa",
      carrito: {
        items: [],
        producto_actual: {
          id: prodN04.id,
          name: prodN04.name,
          price: prodN04.price,
        },
      },
    },
    ioMock
  );
  let est1 = await orderService.getEstado(telefonoTest);
  await chatFlowService.handleEsperandoCantidad({
    from: telefonoTest,
    low: "1",
    io: ioMock,
    estado: est1,
  });

  let estadoActual = await orderService.getEstado(telefonoTest);
  assert.strictEqual(estadoActual.carrito.items.length, 1, "Debe haber 1 item en el carrito");
  assert.strictEqual(estadoActual.carrito.items[0].cantidad, 1, "Cantidad debe ser 1");

  // Paso 2: Usuario navega a categoría "pared" y agrega N04 con cantidad 2
  await orderService.setEstado(
    telefonoTest,
    {
      paso: "esperando_cantidad",
      categoria: "pared",
      carrito: {
        ...estadoActual.carrito,
        producto_actual: {
          id: prodN04.id,
          name: prodN04.name,
          price: prodN04.price,
        },
      },
    },
    ioMock
  );
  let est2 = await orderService.getEstado(telefonoTest);
  await chatFlowService.handleEsperandoCantidad({
    from: telefonoTest,
    low: "2",
    io: ioMock,
    estado: est2,
  });

  estadoActual = await orderService.getEstado(telefonoTest);
  assert.strictEqual(
    estadoActual.carrito.items.length,
    1,
    "El carrito debe seguir teniendo exactamente 1 línea para N04"
  );
  assert.strictEqual(
    estadoActual.carrito.items[0].producto,
    prodN04.name,
    "El producto debe ser N04"
  );
  assert.strictEqual(
    estadoActual.carrito.items[0].cantidad,
    3,
    "Las cantidades deben haberse sumado en una sola línea (1 + 2 = 3)"
  );
  console.log("  ✅ Test 6 superado (N04 suma en una sola línea en el carrito)");

  // Test 7: getMenuDinamico refleja productos en múltiples categorías
  console.log("▶ Test 7: getMenuDinamico() muestra N04 en Mesa y en Pared...");
  const menuTexto = await getMenuDinamico();
  assert.ok(menuTexto.includes("Mesa"), "El menú debe tener sección Mesa");
  assert.ok(menuTexto.includes("Pared"), "El menú debe tener sección Pared");
  assert.ok(menuTexto.includes("Pedestal"), "El menú debe tener sección Pedestal");

  // Verificar que N04 aparece en ambas secciones
  const mesaIndex = menuTexto.indexOf("Mesa");
  const paredIndex = menuTexto.indexOf("Pared");
  const pedestalIndex = menuTexto.indexOf("Pedestal");

  const seccionMesa = menuTexto.substring(mesaIndex, paredIndex);
  const seccionPared = menuTexto.substring(paredIndex, pedestalIndex);
  const seccionPedestal = menuTexto.substring(pedestalIndex);

  assert.ok(
    seccionMesa.includes("Fortunne Turbo Fan 10\""),
    "Sección Mesa debe listar el Turbo Fan 10\""
  );
  assert.ok(
    seccionPared.includes("Fortunne Turbo Fan 10\""),
    "Sección Pared debe listar el Turbo Fan 10\""
  );
  assert.ok(
    !seccionPedestal.includes("Fortunne Turbo Fan 10\""),
    "Sección Pedestal NO debe listar el Turbo Fan 10\""
  );
  console.log("  ✅ Test 7 superado");

  console.log("\n🎉 TODOS LOS TESTS DE MULTICATEGORÍA PASARON EXITOSAMENTE (7/7).\n");
}

runTests().catch((err) => {
  console.error("❌ Fallo en las pruebas de multicategoría:", err);
  process.exit(1);
});
