/**
 * Certificación E2E de la plantilla: marca activa → bot de WhatsApp → carrito persistido → API admin.
 * Siembra su propio catálogo en el mock (no depende de lo que dejen otras suites ni de una marca concreta).
 * Uso: NODE_ENV=test npx tsx scripts/test-e2e-saas.js
 */
process.env.NODE_ENV = "test"; // mocks de base de datos, red e IA; nunca carga el .env

const assert = require("node:assert");
const configManager = require("../services/configManager");
const chatFlowService = require("../services/chatFlowService");
const dbLocal = require("../services/dbLocal");

const TEST_PHONE = "584129999999";

async function runE2ESuite() {
  console.log("🛡️ Certificación E2E de la plantilla\n");

  // 1. Marca activa
  const brand = configManager.get("settings.brandName");
  assert(brand, "settings.brandName debe estar definido");
  console.log(`✅ Marca activa: ${brand}`);

  // 2. Catálogo propio de la prueba
  const Producto = dbLocal.getProductoModel();
  const Categoria = dbLocal.getCategoriaModel();
  await Producto.deleteMany({});
  await Categoria.deleteMany();
  const categoria = await Categoria.create({ nombre: "Categoría E2E", slug: "categoria-e2e", padre: null });
  await Producto.create({
    id: "e2e-prod-1",
    name: "Producto E2E",
    price: 30,
    description: "Producto de la certificación",
    categoria: categoria._id,
    categorias: [categoria._id],
    activo: true,
    stock: 10,
    trackStock: false,
  });
  console.log("✅ Catálogo de prueba sembrado");

  // 3. Conversación: saludo → hacer pedido → categoría → producto → cantidad
  const Etiqueta = dbLocal.getEtiquetaModel();
  await Etiqueta.deleteOne({ telefono: TEST_PHONE });
  const ioMock = { emit: () => {} };
  for (const texto of ["Hola", "faq_pedir", `category_${categoria.slug}`, "e2e-prod-1", "2"]) {
    await chatFlowService.handleIncomingMessage(TEST_PHONE, "text", texto, null, null, ioMock, {});
  }

  const estado = await Etiqueta.findOne({ telefono: TEST_PHONE });
  const items = estado?.carrito?.items || [];
  assert.strictEqual(items.length, 1, `El carrito debe tener 1 línea (paso actual: ${estado?.paso})`);
  assert.strictEqual(items[0].producto, "Producto E2E");
  assert.strictEqual(items[0].cantidad, 2);
  assert.strictEqual(items[0].price, 30);
  console.log(`✅ Carrito persistido: ${items[0].cantidad}x ${items[0].producto} (paso: ${estado.paso})`);

  // 4. La API del panel lee el mismo catálogo que el bot
  const adminController = require("../controllers/adminController");
  let respuesta;
  const resMock = {
    json: (data) => ((respuesta = data), data),
    status: () => resMock,
  };
  await adminController.getProducts({ query: {} }, resMock);
  const lista = Array.isArray(respuesta) ? respuesta : respuesta?.data || respuesta?.productos || [];
  assert(Array.isArray(lista) && lista.some((p) => p.id === "e2e-prod-1"), "La API admin debe devolver el producto sembrado");
  console.log(`✅ API admin devuelve el catálogo (${lista.length} producto/s)`);

  console.log("\n🎉 CERTIFICACIÓN E2E SUPERADA.");
}

runE2ESuite()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n❌ FALLO EN LA CERTIFICACIÓN: ${error.message}`);
    process.exit(1);
  });
