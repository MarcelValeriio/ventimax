/**
 * scripts/test-bot-vehiculo.ts
 * Suite de F1-5 · Bot por vehículo (settings.features.busquedaPorVehiculo).
 * Flujo completo con mocks (dbLocal + listas de WhatsApp capturadas, sin red):
 * marca → modelo → año → motor (si aplica) → categorías → piezas → producto → flujo de compra.
 * Cubre: límite de 10 filas, año fuera de rango, sin piezas (modo manual + registro), universales,
 * vehículo guardado con pregunta de confirmación, bandera en false sin cambios, texto escrito y regresión.
 *
 * Ejecución: NODE_ENV=test npx tsx scripts/test-bot-vehiculo.ts
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const wa = require("../services/whatsapp");
const configManager = require("../services/configManager");
const orderService = require("../services/orderService");
const chatFlowService = require("../services/chatFlowService");
const { normalizarCompatibilidad } = require("../services/productoAmpliado");
const { validarFeatures } = require("../services/configValidators");
const busquedaVehiculo = require("../services/busquedaVehiculo");
const fs = require("fs");
const path = require("path");

// --- Captura de envíos del bot (no hay red en test) ---
const enviados: any[] = [];
wa.enviarTexto = async (to: string, texto: string) => {
  enviados.push({ tipo: "texto", texto });
  return true;
};
wa.enviarBotones = async (to: string, texto: string, buttons: any[]) => {
  enviados.push({ tipo: "botones", texto, buttons });
  return true;
};
wa.enviarLista = async (to: string, texto: string, buttonText: string, sections: any[]) => {
  enviados.push({ tipo: "lista", texto, sections });
  return true;
};

const io = { emit: () => {} };
const Producto = dbLocal.getProductoModel();
const Categoria = dbLocal.getCategoriaModel();
const BusquedaSinResultado = dbLocal.getBusquedaSinResultadoModel();

const ultimo = () => enviados[enviados.length - 1];
const filas = (envio: any): any[] => envio.sections[0].rows;

async function paso(tel: string): Promise<string> {
  return (await orderService.getEstado(tel)).paso;
}

async function escribir(tel: string, texto: string) {
  enviados.length = 0;
  await chatFlowService.handleIncomingMessage(tel, "text", texto, null, null, io, {}, null, null, null, { debounceMs: 0 });
}

async function tocar(tel: string, id: string, titulo = "") {
  enviados.length = 0;
  await chatFlowService.handleIncomingMessage(tel, "interactive", id, titulo, null, io, {}, null, null, null, { debounceMs: 0 });
}

/** Lleva al cliente al menú de pedido (desde las preguntas frecuentes, como hoy). */
async function iniciarPedido(tel: string) {
  await orderService.setEstado(tel, { paso: "en_faq", carrito: {}, vehiculo: null });
  await escribir(tel, "hacer pedido");
}

async function producto(id: string, name: string, cat: any, compat: any[] = []) {
  const norm = normalizarCompatibilidad(compat);
  assert.strictEqual(norm.ok, true, `compatibilidad de prueba inválida: ${norm.errores?.join(" ")}`);
  return Producto.create({
    id,
    name,
    price: 10,
    description: "Pieza de prueba",
    categoria: cat._id,
    categorias: [cat._id],
    activo: true,
    stock: 5,
    trackStock: false,
    compatibilidad: norm.valor,
  });
}

async function prepararCatalogo() {
  await Producto.deleteMany({});
  await Categoria.deleteMany({});
  await BusquedaSinResultado.deleteMany?.({});
  const filtros = await Categoria.create({ nombre: "Filtros", slug: "filtros", padre: null });
  const frenos = await Categoria.create({ nombre: "Frenos", slug: "frenos", padre: null });
  const encendido = await Categoria.create({ nombre: "Encendido", slug: "encendido", padre: null });
  const suspension = await Categoria.create({ nombre: "Suspension", slug: "suspension", padre: null });
  const corolla = { marca: "Toyota", modelo: "Corolla", anioDesde: 2009, anioHasta: 2014 };
  const ids: Record<string, any> = {
    filtros,
    frenos,
    encendido,
    suspension,
    p1: await producto("filtro-aceite", "Filtro de aceite Corolla", filtros, [corolla]),
    p2: await producto("pastillas-18", "Pastillas 1.8", frenos, [{ ...corolla, motor: "1.8" }]),
    p3: await producto("bujia-20", "Bujia 2.0", encendido, [{ ...corolla, motor: "2.0" }]),
    p4: await producto("amortiguador-hilux", "Amortiguador Hilux", suspension, [
      { marca: "Toyota", modelo: "Hilux", anioDesde: 2010, anioHasta: 2015 },
    ]),
    p5: await producto("kit-universal", "Kit universal", filtros, []),
    p6: await producto("bujia-aveo", "Bujia Aveo", encendido, [
      { marca: "Chevrolet", modelo: "Aveo", anioDesde: 2008, anioHasta: 2012 },
    ]),
  };
  // Marcas extra para probar el límite de 10 filas (una pieza cada una)
  for (let i = 1; i <= 11; i++) {
    const n = String(i).padStart(2, "0");
    await producto(`extra-${n}`, `Pieza extra ${n}`, filtros, [
      { marca: `Marca ${n}`, modelo: "Modelo X", anioDesde: 2000, anioHasta: 2020 },
    ]);
  }
  return ids;
}

async function runTests() {
  console.log("🚀 Iniciando suite F1-5 · Bot por vehículo...");
  const cfg = configManager.config.settings;
  // La base mock persiste en disco: cada ejecución usa teléfonos nuevos
  const base = String(Date.now() % 100000000).padStart(8, "0");
  const tel = (n: number) => `4141${base}${n}`;

  // 0. Validador de la bandera y valor de marca
  const malo = validarFeatures({ busquedaPorVehiculo: "si" });
  assert.strictEqual(malo.ok, false, "la bandera no booleana debe rechazarse");
  assert.strictEqual(validarFeatures(undefined).ok, true, "sin bloque features es válido");
  assert.strictEqual(validarFeatures({ busquedaPorVehiculo: true }).ok, true);
  assert.strictEqual(cfg.features.busquedaPorVehiculo, false, "la marca trae la bandera en false");
  console.log("  ✅ Validador de bandera y valor por defecto en false");

  const ids = await prepararCatalogo();

  // 1. Bandera en false: el pedido va al menú de categorías de siempre (regresión)
  cfg.features.busquedaPorVehiculo = false;
  const t1 = tel(1);
  await iniciarPedido(t1);
  assert.strictEqual(await paso(t1), "esperando_seleccion", "con la bandera en false no entra al flujo por vehículo");
  assert.strictEqual(ultimo().tipo, "lista");
  assert.strictEqual(ultimo().sections[0].title, "Variedades Disponibles", "menú de categorías de siempre");
  console.log("  ✅ Bandera en false: menú de categorías sin cambios");

  // A partir de aquí, bandera en true
  cfg.features.busquedaPorVehiculo = true;

  // 2. Entrada: marca con 10 filas (9 + "Otra (escríbela)") y Toyota primera (más piezas)
  const t2 = tel(2);
  await iniciarPedido(t2);
  assert.strictEqual(await paso(t2), "veh_marca");
  const listaMarcas = ultimo();
  assert.strictEqual(listaMarcas.tipo, "lista");
  const filasMarca = filas(listaMarcas);
  assert.ok(filasMarca.length <= 10, `máximo 10 filas, hubo ${filasMarca.length}`);
  assert.strictEqual(filasMarca.length, 10, "13 marcas: 9 opciones + Otra");
  assert.strictEqual(filasMarca[0].id, "veh_marca_toyota", "Toyota primero por cantidad de productos");
  assert.strictEqual(filasMarca[9].id, "veh_otra_marca");
  assert.ok(filasMarca.every((f: any) => f.title.length <= 24 && f.description.length <= 72), "títulos y descripciones dentro de límite");
  console.log("  ✅ Marca: lista con máximo 10 filas, Otra al final");

  // 3. Toque de marca → modelo
  await tocar(t2, "veh_marca_toyota", "Toyota");
  assert.strictEqual(await paso(t2), "veh_modelo");
  assert.ok(filas(ultimo()).some((f: any) => f.id === "veh_modelo_corolla"), "Corolla en la lista de modelos");
  console.log("  ✅ Marca → modelos");

  // 4. Año fuera de rango: vuelve a pedir el año, sin avanzar
  await tocar(t2, "veh_modelo_corolla", "Corolla");
  assert.strictEqual(await paso(t2), "veh_anio");
  await escribir(t2, "1800");
  assert.strictEqual(await paso(t2), "veh_anio", "año fuera de rango no avanza");
  assert.ok(ultimo().texto.includes("2009") && ultimo().texto.includes("2014"), "el aviso muestra el rango del catálogo");
  await escribir(t2, "2020");
  assert.strictEqual(await paso(t2), "veh_anio", "año posterior al rango tampoco avanza");
  console.log("  ✅ Año fuera de rango: se vuelve a pedir con el rango");

  // 5. Año válido con motor: pregunta motor (hay piezas que dependen del motor)
  await escribir(t2, "2012");
  assert.strictEqual(await paso(t2), "veh_motor");
  const motores = filas(ultimo()).map((f: any) => f.id);
  assert.ok(motores.includes("veh_motor_1-8") && motores.includes("veh_motor_2-0"), "motores de las piezas");
  console.log("  ✅ Año → motor (solo porque hay piezas que dependen del motor)");

  // 6. Motor → categorías (sin 2.0, sin Encendido salvo la pieza universal)
  await tocar(t2, "veh_motor_1-8", "1.8");
  assert.strictEqual(await paso(t2), "veh_categoria");
  const catsIds = filas(ultimo()).map((f: any) => f.id);
  assert.ok(catsIds.includes(`veh_cat_${String(ids.frenos._id)}`), "Frenos (pastillas 1.8)");
  assert.ok(catsIds.includes(`veh_cat_${String(ids.filtros._id)}`), "Filtros (pieza compatible y universal)");
  assert.ok(!catsIds.includes(`veh_cat_${String(ids.encendido._id)}`), "Encendido solo tiene piezas de motor 2.0 o de otra marca");
  assert.strictEqual(ultimo().tipo, "lista");
  const estado2 = await orderService.getEstado(t2);
  assert.ok(estado2.vehiculo, "el vehículo se guarda en Etiqueta al llegar a las categorías");
  assert.strictEqual(estado2.vehiculo.marca, "Toyota");
  assert.strictEqual(estado2.vehiculo.modelo, "Corolla");
  assert.strictEqual(estado2.vehiculo.anio, 2012);
  assert.strictEqual(estado2.vehiculo.motor, "1.8");
  console.log("  ✅ Motor → categorías con piezas compatibles; vehículo guardado en Etiqueta");

  // 7. Categoría → piezas (la universal se ofrece también)
  await tocar(t2, `veh_cat_${String(ids.filtros._id)}`, "Filtros");
  assert.strictEqual(await paso(t2), "veh_producto");
  const idsPiezas = filas(ultimo()).map((f: any) => f.id);
  assert.ok(idsPiezas.includes("veh_prod_filtro-aceite"), "pieza compatible");
  assert.ok(idsPiezas.includes("veh_prod_kit-universal"), "pieza universal sin compatibilidad");
  console.log("  ✅ Categoría → piezas compatibles y universales");

  // 8. Pieza → cantidad (flujo de compra actual)
  await tocar(t2, "veh_prod_filtro-aceite", "Filtro de aceite Corolla");
  const estado3 = await orderService.getEstado(t2);
  assert.strictEqual(estado3.paso, "esperando_cantidad", "pasa a cantidad como el flujo de siempre");
  assert.strictEqual(estado3.carrito.producto_actual.id, "filtro-aceite");
  console.log("  ✅ Pieza → cantidad (flujo de compra actual)");

  // 9. Texto escrito: se compara normalizado con marcaNorm y modeloNorm
  const t3 = tel(3);
  await iniciarPedido(t3);
  await escribir(t3, "TOYÓTA");
  assert.strictEqual(await paso(t3), "veh_modelo", "marca escrita con mayúsculas y acento");
  await escribir(t3, "corolla");
  assert.strictEqual(await paso(t3), "veh_anio");
  await escribir(t3, "2010");
  assert.strictEqual(await paso(t3), "veh_motor");
  await escribir(t3, "1.8");
  assert.strictEqual(await paso(t3), "veh_categoria", "motor escrito");
  console.log("  ✅ Texto escrito: marca, modelo y motor normalizados");

  // 10. Sin piezas: modo manual, registro de la búsqueda y aviso de la marca
  const t4 = tel(4);
  await iniciarPedido(t4);
  await escribir(t4, "Marca Inexistente");
  const estado4 = await orderService.getEstado(t4);
  assert.strictEqual(estado4.modo, "manual", "sin piezas pasa a modo manual");
  assert.strictEqual(estado4.paso, "inicio");
  assert.ok(ultimo().texto.includes("Marca Inexistente"), "aviso con el vehículo buscado");
  const registros = await BusquedaSinResultado.find({ usuarioId: t4 });
  assert.strictEqual(registros.length, 1, "la búsqueda sin resultado queda registrada");
  assert.strictEqual(registros[0].marca, "Marca Inexistente");
  assert.strictEqual(registros[0].canal, "whatsapp");
  console.log("  ✅ Sin piezas: modo manual y búsqueda registrada");

  // 10b. Año en un hueco del rango (solo hay universales): se ofrecen, sin modo manual, y la búsqueda se registra una vez
  await producto("faro-corolla-16", "Faro Corolla 2016", ids.filtros, [
    { marca: "Toyota", modelo: "Corolla", anioDesde: 2016, anioHasta: 2018 },
  ]);
  const t4b = tel(40);
  await iniciarPedido(t4b);
  await escribir(t4b, "toyota");
  await escribir(t4b, "corolla");
  await escribir(t4b, "2015");
  const estado4b = await orderService.getEstado(t4b);
  assert.notStrictEqual(estado4b.modo, "manual", "con universales no pasa a modo manual");
  assert.strictEqual(estado4b.paso, "veh_categoria", "ofrece las categorías de las piezas universales");
  const registros4b = await BusquedaSinResultado.find({ usuarioId: t4b });
  assert.strictEqual(registros4b.length, 1, "sin piezas específicas: búsqueda registrada una vez");
  assert.strictEqual(registros4b[0].anio, 2015);
  console.log("  ✅ Solo universales: se ofrecen y la búsqueda queda registrada");

  // 11. Modelo que no existe en el catálogo: también sin piezas
  const t5 = tel(5);
  await iniciarPedido(t5);
  await tocar(t5, "veh_marca_toyota", "Toyota");
  await escribir(t5, "Modelo Fantasma");
  assert.strictEqual((await orderService.getEstado(t5)).modo, "manual", "modelo sin piezas pasa a manual");
  console.log("  ✅ Modelo sin piezas: modo manual");

  // 12. Vehículo guardado: pregunta de confirmación y "Sí" lleva a las categorías
  const t6 = tel(6);
  await iniciarPedido(t6);
  await tocar(t6, "veh_marca_toyota", "Toyota");
  await tocar(t6, "veh_modelo_corolla", "Corolla");
  await escribir(t6, "2013");
  await tocar(t6, "veh_motor_1-8", "1.8");
  assert.strictEqual(await paso(t6), "veh_categoria");
  await orderService.setEstado(t6, { paso: "en_faq" });
  await escribir(t6, "hacer pedido");
  assert.strictEqual(await paso(t6), "veh_confirmar", "con vehículo guardado pregunta si sigue siendo el mismo");
  const botones = ultimo();
  assert.strictEqual(botones.tipo, "botones");
  assert.ok(botones.texto.includes("Toyota Corolla 2013 1.8"), "la pregunta describe el vehículo guardado");
  assert.deepStrictEqual(botones.buttons.map((b: any) => b.id), ["veh_confirmar_si", "veh_confirmar_otro"]);
  await tocar(t6, "veh_confirmar_si", "Sí, el mismo");
  assert.strictEqual(await paso(t6), "veh_categoria", "Sí lleva directo a las categorías");
  await orderService.setEstado(t6, { paso: "en_faq" });
  await escribir(t6, "hacer pedido");
  await tocar(t6, "veh_confirmar_otro", "Otro vehículo");
  assert.strictEqual(await paso(t6), "veh_marca", "Otro vehículo vuelve a pedir la marca");
  console.log("  ✅ Vehículo guardado: confirmación, Sí y Otro vehículo");

  // 13. "Otra (escríbela)" pide el texto y no cambia el paso
  await tocar(t6, "veh_otra_marca", "Otra (escríbela)");
  assert.strictEqual(await paso(t6), "veh_marca");
  assert.strictEqual(ultimo().texto, "Escribe la marca de tu vehículo:");
  console.log("  ✅ Otra (escríbela): pide el texto");

  // 14. Las dos listas nunca pasan de 10 filas (categorías y piezas incluidas)
  for (const envio of enviados.filter((e) => e.tipo === "lista")) {
    assert.ok(filas(envio).length <= 10, "lista con más de 10 filas");
  }

  // 15. Universales: sin compatibilidad se ofrecen igual (ya comprobado); el helper lo expresa
  const piezasUniversales = await busquedaVehiculo.piezasParaVehiculo({
    marcaNorm: "marca-que-no-existe",
    modeloNorm: "x",
    anio: 2012,
    motorNorm: null,
  });
  assert.deepStrictEqual(piezasUniversales.map((p: any) => p.id), ["kit-universal"], "solo la universal");

  // 16. Sin texto de marca en el código nuevo
  const archivos = [
    path.join(__dirname, "..", "services", "busquedaVehiculo.ts"),
    path.join(__dirname, "..", "models", "BusquedaSinResultado.ts"),
  ];
  for (const f of archivos) {
    const texto = fs.readFileSync(f, "utf-8").toLowerCase();
    assert.ok(!texto.includes("ventimax") && !texto.includes("fortunne") && !texto.includes("pachi"), `marca escrita en ${path.basename(f)}`);
  }

  // 17. Bandera otra vez en false: el pedido vuelve al menú de categorías
  cfg.features.busquedaPorVehiculo = false;
  const t7 = tel(7);
  await iniciarPedido(t7);
  assert.strictEqual(await paso(t7), "esperando_seleccion");
  console.log("  ✅ Límites, universales y sin marca en el código nuevo");

  console.log("\n🎉 TODOS LOS TESTS DE BOT POR VEHÍCULO (F1-5) PASARON EXITOSAMENTE.");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ FALLO EN BOT POR VEHÍCULO:", err);
    process.exit(1);
  });
