/**
 * scripts/test-descuentos.ts — F2g
 * Suite de pruebas para los descuentos por producto y el cintillo promocional de la tienda.
 *
 * Verificaciones:
 * 1. Helper services/precios.ts: redondeo, 0 % y 90 %, valores inválidos -> 0 de descuento.
 * 2. Validadores: productoSchema (default 0, 91 y decimales rechazados) y productoUpdateSchema (sin default).
 * 3. GET /api/admin/products agrega descuentoPct y precioVigente sin quitar campos.
 * 4. Catálogo público: precioUsd vigente, precioAntesUsd, descuentoPct y precioBs a la tasa.
 * 5. Pedido web: el total cobra el precio vigente.
 * 6. Venta manual: el precio sale de la base y es el vigente.
 * 7. Bot de WhatsApp: el producto y el carrito usan el precio vigente; el menú dinámico muestra "(-X%)".
 * 8. IA: la línea del catálogo usa el precio vigente.
 * 9. Cintillo: validador, PUT con permiso y auditoría, y /api/public/info con banner automático
 *    (null si está inactivo, o si el producto no existe o está inactivo).
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-descuentos.ts
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.JWT_SECRET = "x".repeat(40);
process.env.WHATSAPP_PHONE = "584122781982";

const dbLocal = require("../services/dbLocal");
const { descuentoVigente, precioVigente } = require("../services/precios");
const { productoSchema, productoUpdateSchema } = require("../validators");
const adminController = require("../controllers/adminController");
const publicController = require("../controllers/publicController");
const configAdminController = require("../controllers/configAdminController");
const { validarBannerTienda } = require("../services/configValidators");
const bannerTiendaService = require("../services/bannerTiendaService");
const chatFlowService = require("../services/chatFlowService");
const chatFlow = require("../controllers/chatFlowController");
const orderService = require("../services/orderService");
const { getMenuDinamico } = require("../services/faqMatcher");
const { lineaProductoParaIA } = require("../services/ai");
const { authorize } = require("../middlewares/auth");
const PERMISSIONS = require("../data/permissions");

let superadas = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  superadas++;
  console.log(`  ✅ ${nombre}`);
}

/** Respuesta simulada de Express con los métodos que usan los controladores. */
function mockRes() {
  const out: { status: number; json: any; headers: Record<string, string> } = { status: 200, json: null, headers: {} };
  const res: any = {
    status: (s: number) => {
      out.status = s;
      return res;
    },
    json: (d: any) => {
      out.json = d;
      return res;
    },
    send: (d: any) => {
      out.json = d;
      return res;
    },
    setHeader: (k: string, v: string) => {
      out.headers[k] = v;
    },
  };
  return { res, out };
}

const ADMIN = { user: "admin", role: "admin", permissions: PERMISSIONS["admin"] };

const CATEGORIA_MESA = "65f000000000000000000101";
const CATEGORIA_PARED = "65f000000000000000000102";

/** Productos de la prueba. fortunne-n04 tiene 20 % de descuento; n21 no tiene. */
function sembrarProductos() {
  const data = dbLocal.read();
  data.categorias = [
    { _id: CATEGORIA_MESA, nombre: "Mesa", slug: "mesa", activo: true, padre: null },
    { _id: CATEGORIA_PARED, nombre: "Pared", slug: "pared", activo: true, padre: null },
  ];
  data.productos = [
    {
      _id: "prod-n04",
      id: "fortunne-n04",
      name: 'Fortunne Turbo Fan 10"',
      price: 40,
      descuentoPct: 20,
      description: "2 en 1 mesa y pared",
      categoria: CATEGORIA_MESA,
      categorias: [CATEGORIA_PARED],
      activo: true,
      trackStock: false,
      stock: 0,
      imagenes: [],
    },
    {
      _id: "prod-n21",
      id: "fortunne-n21",
      name: 'Fortunne Mini Jumbo 6"',
      price: 25,
      descuentoPct: 0,
      description: "Mesa compacto",
      categoria: CATEGORIA_MESA,
      categorias: [],
      activo: true,
      trackStock: false,
      stock: 0,
      imagenes: [],
    },
  ];
  // Un Setting de cintillo de pruebas anteriores no debe contaminar la suite
  if (data.settings) delete data.settings.bannerTienda;
  dbLocal.write(data);
  bannerTiendaService.invalidateBannerTiendaCache();
}

function setActivo(id: string, activo: boolean) {
  const data = dbLocal.read();
  const p = data.productos.find((x: any) => x.id === id);
  p.activo = activo;
  dbLocal.write(data);
}

async function run() {
  console.log("================================================================================");
  console.log("🏷️  SUITE DE PRUEBAS: DESCUENTOS Y CINTILLO DE LA TIENDA (F2g)");
  console.log("================================================================================");

  sembrarProductos();

  // ── 1. Helper ─────────────────────────────────────────────────────────────
  await prueba("Helper: precio vigente con redondeo, 0 % y 90 %", () => {
    assert.strictEqual(precioVigente({ price: 40, descuentoPct: 0 }), 40);
    assert.strictEqual(precioVigente({ price: 40, descuentoPct: 20 }), 32);
    assert.strictEqual(precioVigente({ price: 40, descuentoPct: 90 }), 4);
    assert.strictEqual(precioVigente({ price: 25, descuentoPct: 10 }), 22.5);
    assert.strictEqual(precioVigente({ price: 33, descuentoPct: 33 }), 22.11, "redondea a centavos");
    assert.strictEqual(precioVigente({ price: 40 }), 40, "sin campo de descuento, precio base");
    assert.strictEqual(descuentoVigente({ descuentoPct: 90 }), 90);
    assert.strictEqual(descuentoVigente({ descuentoPct: "20" }), 20, "texto numérico entero se acepta");
  });

  await prueba("Helper: valores de descuento inválidos cuentan como 0", () => {
    const invalidos: any[] = [-5, 91, 12.5, "abc", NaN, Infinity, true, {}, [], null, undefined, ""];
    for (const v of invalidos) {
      assert.strictEqual(descuentoVigente({ price: 40, descuentoPct: v }), 0, `descuento ${String(v)} debe ser 0`);
      assert.strictEqual(precioVigente({ price: 40, descuentoPct: v }), 40, `precio con ${String(v)} debe ser el base`);
    }
    assert.strictEqual(descuentoVigente(undefined), 0);
  });

  // ── 2. Validadores ────────────────────────────────────────────────────────
  const BASE_PRODUCTO = { id: "fortunne-x1", name: "Producto de prueba", price: 10, categoria: "65f000000000000000000101" };

  await prueba("Validador de alta: descuentoPct por defecto es 0", () => {
    const r = productoSchema.safeParse(BASE_PRODUCTO);
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.data.descuentoPct, 0);
  });

  await prueba("Validador de alta: 91 se rechaza, 90 se acepta, decimales y texto no", () => {
    assert.strictEqual(productoSchema.safeParse({ ...BASE_PRODUCTO, descuentoPct: 91 }).success, false);
    assert.strictEqual(productoSchema.safeParse({ ...BASE_PRODUCTO, descuentoPct: -1 }).success, false);
    assert.strictEqual(productoSchema.safeParse({ ...BASE_PRODUCTO, descuentoPct: 90 }).success, true);
    assert.strictEqual(productoSchema.safeParse({ ...BASE_PRODUCTO, descuentoPct: 12.5 }).success, false);
    assert.strictEqual(productoSchema.safeParse({ ...BASE_PRODUCTO, descuentoPct: "abc" }).success, false);
    const texto = productoSchema.safeParse({ ...BASE_PRODUCTO, descuentoPct: "15" });
    assert.strictEqual(texto.success, true, "el formulario manda texto y coerce lo convierte");
    assert.strictEqual(texto.data.descuentoPct, 15);
  });

  await prueba("Validador de edición: sin default, no toca el descuento si no viene", () => {
    const r = productoUpdateSchema.safeParse({ name: "Nombre nuevo" });
    assert.strictEqual(r.success, true);
    assert.strictEqual(r.data.descuentoPct, undefined, "la edición no debe poner 0 por defecto");
    assert.strictEqual(productoUpdateSchema.safeParse({ descuentoPct: 91 }).success, false);
    assert.strictEqual(productoUpdateSchema.safeParse({ descuentoPct: 0 }).success, true);
  });

  // ── 3. Panel: GET /api/admin/products ─────────────────────────────────────
  await prueba("GET /api/admin/products agrega descuentoPct y precioVigente sin quitar campos", async () => {
    const { res, out } = mockRes();
    await adminController.getProducts({ query: {}, user: ADMIN }, res);
    assert.strictEqual(out.status, 200);
    const n04 = out.json.data.find((p: any) => p.id === "fortunne-n04");
    assert(n04, "debe venir el producto");
    assert.strictEqual(n04.descuentoPct, 20);
    assert.strictEqual(n04.precioVigente, 32);
    assert.strictEqual(n04.price, 40, "el precio base sigue igual");
    assert.strictEqual(n04.name, 'Fortunne Turbo Fan 10"', "los demás campos siguen");
    const n21 = out.json.data.find((p: any) => p.id === "fortunne-n21");
    assert.strictEqual(n21.precioVigente, 25);
    assert.strictEqual(n21.descuentoPct, 0);
  });

  // ── 4. Catálogo público ───────────────────────────────────────────────────
  await prueba("Catálogo público: precioUsd vigente, precioAntesUsd, descuentoPct y precioBs", async () => {
    const { res, out } = mockRes();
    await publicController.getCatalogo({}, res);
    assert.strictEqual(out.status, 200);
    const n04 = out.json.productos.find((p: any) => p.id === "fortunne-n04");
    assert.strictEqual(n04.precioUsd, 32, "precio vigente");
    assert.strictEqual(n04.precioAntesUsd, 40, "precio base tachado");
    assert.strictEqual(n04.descuentoPct, 20);
    assert.strictEqual(n04.precioBs, 1152, "vigente × tasa del día (36)");
    const n21 = out.json.productos.find((p: any) => p.id === "fortunne-n21");
    assert.strictEqual(n21.precioUsd, 25);
    assert.strictEqual(n21.precioAntesUsd, null, "sin descuento no hay precio anterior");
    assert.strictEqual(n21.descuentoPct, 0);
  });

  // ── 5. Pedido web ─────────────────────────────────────────────────────────
  await prueba("Pedido web cobra el precio vigente (2 × $32 = $64)", async () => {
    const { res, out } = mockRes();
    await publicController.postPedidoWeb(
      { body: { items: [{ productoId: "fortunne-n04", cantidad: 2 }] } },
      res,
    );
    assert.strictEqual(out.status, 200, JSON.stringify(out.json));
    assert.strictEqual(out.json.totalUsd, 64);
    const CarritoWeb = dbLocal.getCarritoWebModel();
    const guardado = await CarritoWeb.findOne({ codigo: out.json.codigo });
    assert.strictEqual(guardado.total, 64, "el carrito guardado también cobra el vigente");
    assert.strictEqual(guardado.items[0].precio, 32);
  });

  // ── 6. Venta manual ───────────────────────────────────────────────────────
  await prueba("Venta manual usa el precio vigente de la base (2 × $32, ignora el $999 del cuerpo)", async () => {
    const { res, out } = mockRes();
    await adminController.postManualSale(
      {
        body: {
          whatsappId: "584129990001",
          cliente: { nombre: "Cliente Descuento", cedula: "20123456", telefono: "584129990001" },
          items: [{ id: "fortunne-n04", producto: 'Fortunne Turbo Fan 10"', price: 999, cantidad: 2 }],
          pago: { metodo: "Efectivo" },
        },
        user: ADMIN,
      },
      res,
    );
    assert.strictEqual(out.status, 201, JSON.stringify(out.json));
    assert.strictEqual(out.json.data.pago.montoUSD, 64);
    assert.strictEqual(out.json.data.items[0].price, 32);
  });

  // ── 7. Bot de WhatsApp ────────────────────────────────────────────────────
  const enviados: string[] = [];
  const origEnviarYRegistrar = chatFlow.enviarYRegistrar;
  chatFlow.enviarYRegistrar = async (to: string, opciones: any, io: any) => {
    if (opciones?.texto) enviados.push(opciones.texto);
    return origEnviarYRegistrar.call(chatFlow, to, opciones, io);
  };

  await prueba("Bot: al elegir el producto muestra el precio vigente con -20% y lo agrega al carrito con ese precio", async () => {
    const tel = "584127770001";
    await orderService.setEstado(tel, { paso: "esperando_producto", carrito: { items: [] } }, null);
    enviados.length = 0;
    const estado = await orderService.getEstado(tel);
    await chatFlowService.handleEsperandoProducto({ from: tel, text: "fortunne-n04", low: "fortunne-n04", io: null, estado });

    const tras = await orderService.getEstado(tel);
    assert.strictEqual(tras.paso, "esperando_cantidad");
    assert.strictEqual(tras.carrito.producto_actual.price, 32, "el producto actual guarda el precio vigente");
    assert(
      enviados.some((t) => t.includes("($32, -20%)")),
      `el mensaje debe mostrar ($32, -20%): ${JSON.stringify(enviados)}`,
    );

    await chatFlowService.handleEsperandoCantidad({ from: tel, low: "2", io: null, estado: tras });
    const alFinal = await orderService.getEstado(tel);
    const linea = alFinal.carrito.items.find((i: any) => i.id === "fortunne-n04");
    assert(linea, "el producto debe estar en el carrito");
    assert.strictEqual(linea.price, 32, "el carrito guarda el precio vigente");
    assert.strictEqual(linea.cantidad, 2);
  });

  await prueba("Menú dinámico {menu} muestra el precio vigente y (-20%) solo en el producto con descuento", async () => {
    const menu = await getMenuDinamico();
    assert(menu.includes("(-20%)"), "debe marcar el descuento");
    assert(/\$32\.00 \(-20%\)/.test(menu), `precio vigente con descuento: ${menu}`);
    assert(/\$25\.00/.test(menu) && !/\$25\.00 \(-/.test(menu), "sin descuento no lleva porcentaje");
  });

  // ── 8. IA ─────────────────────────────────────────────────────────────────
  await prueba("Catálogo de la IA usa el precio vigente y dice el porcentaje", () => {
    const data = dbLocal.read();
    const p = data.productos.find((x: any) => x.id === "fortunne-n04");
    const linea = lineaProductoParaIA(p, 36);
    assert.match(linea, /Precio: \$32(\.00)? \(con 20% de descuento\)/);
    const sinDescuento = lineaProductoParaIA(data.productos.find((x: any) => x.id === "fortunne-n21"), 36);
    assert.match(sinDescuento, /Precio: \$25(\.00)?\s\//);
    assert(!sinDescuento.includes("descuento"));
  });

  // ── 9. Cintillo ───────────────────────────────────────────────────────────
  await prueba("Validador del cintillo: activo sin texto ni producto da error; textos y ids inválidos se rechazan", () => {
    const vacio = validarBannerTienda({ activo: true, texto: "", productoId: null });
    assert.strictEqual(vacio.ok, false);
    assert.strictEqual(vacio.error, "Escribe un texto o elige un producto");
    assert.strictEqual(validarBannerTienda({ activo: true, texto: "x".repeat(121), productoId: null }).ok, false);
    assert.strictEqual(validarBannerTienda({ activo: true, texto: "x".repeat(120), productoId: null }).ok, true);
    assert.strictEqual(validarBannerTienda({ activo: true, texto: "", productoId: "Fortunne N04" }).ok, false);
    assert.strictEqual(validarBannerTienda({ activo: true, texto: "", productoId: "x".repeat(61) }).ok, false);
    assert.strictEqual(validarBannerTienda({ activo: true, texto: "", productoId: "fortunne-n04" }).ok, true);
    const apagado = validarBannerTienda({});
    assert.deepStrictEqual(apagado.value, { activo: false, texto: "", productoId: null });
  });

  await prueba("PUT del cintillo: permiso config:manage, validación y auditoría", async () => {
    const Auditoria = dbLocal.getAuditoriaModel();
    const antes = (await Auditoria.find({ recursoId: "bannerTienda" })).length;

    const invalido = mockRes();
    await configAdminController.updateBannerTiendaConfig({ body: { activo: true, texto: "", productoId: null }, user: ADMIN }, invalido.res);
    assert.strictEqual(invalido.out.status, 400);
    assert.strictEqual(invalido.out.json.error, "Escribe un texto o elige un producto");

    const ok = mockRes();
    await configAdminController.updateBannerTiendaConfig(
      { body: { activo: true, texto: "", productoId: "fortunne-n04" }, user: ADMIN },
      ok.res,
    );
    assert.strictEqual(ok.out.status, 200, JSON.stringify(ok.out.json));
    assert.strictEqual(ok.out.json.banner.productoId, "fortunne-n04");

    const despues = (await Auditoria.find({ recursoId: "bannerTienda" })).length;
    assert.strictEqual(despues, antes + 1, "el PUT válido deja una entrada de auditoría");

    const get = mockRes();
    await configAdminController.getBannerTiendaConfig({ user: ADMIN }, get.res);
    assert.strictEqual(get.out.json.banner.activo, true);

    const cajero = { user: "cajero", role: "cajero", permissions: PERMISSIONS["cajero"] };
    let status = 200;
    let siguio = false;
    const res: any = { status: (s: number) => { status = s; return res; }, json: () => res };
    authorize(["config:manage"])({ user: cajero } as any, res, () => { siguio = true; });
    assert.strictEqual(siguio, false, "el cajero no tiene config:manage");
    assert.strictEqual(status, 403);
  });

  await prueba("/api/public/info: banner automático '20% OFF en <nombre>' con el producto del cintillo", async () => {
    const { res, out } = mockRes();
    await publicController.getInfo({}, res);
    assert.strictEqual(out.status, 200);
    assert.deepStrictEqual(out.json.banner, {
      texto: '20% OFF en Fortunne Turbo Fan 10"',
      productoId: "fortunne-n04",
      descuentoPct: 20,
    });
  });

  await prueba("/api/public/info: sin descuento el texto es 'Destacado: <nombre>'; con texto propio se usa ese", async () => {
    await bannerTiendaService.setBannerTienda({ activo: true, texto: "", productoId: "fortunne-n21" });
    let { res, out } = mockRes();
    await publicController.getInfo({}, res);
    assert.strictEqual(out.json.banner.texto, 'Destacado: Fortunne Mini Jumbo 6"');
    assert.strictEqual(out.json.banner.descuentoPct, 0);

    await bannerTiendaService.setBannerTienda({ activo: true, texto: "Envíos a todo el país", productoId: null });
    ({ res, out } = mockRes());
    await publicController.getInfo({}, res);
    assert.deepStrictEqual(out.json.banner, { texto: "Envíos a todo el país", productoId: null, descuentoPct: 0 });
  });

  await prueba("/api/public/info: banner null si está inactivo, si el producto está inactivo o no existe", async () => {
    await bannerTiendaService.setBannerTienda({ activo: false, texto: "Apagado", productoId: "fortunne-n04" });
    let { res, out } = mockRes();
    await publicController.getInfo({}, res);
    assert.strictEqual(out.json.banner, null, "inactivo");

    await bannerTiendaService.setBannerTienda({ activo: true, texto: "", productoId: "fortunne-n04" });
    setActivo("fortunne-n04", false);
    ({ res, out } = mockRes());
    await publicController.getInfo({}, res);
    assert.strictEqual(out.json.banner, null, "producto inactivo");
    setActivo("fortunne-n04", true);

    await bannerTiendaService.setBannerTienda({ activo: true, texto: "", productoId: "fortunne-no-existe" });
    ({ res, out } = mockRes());
    await publicController.getInfo({}, res);
    assert.strictEqual(out.json.banner, null, "producto inexistente");
  });

  // Restaurar el estado de la suite y los productos de prueba
  await bannerTiendaService.setBannerTienda({ activo: false, texto: "", productoId: null });
  chatFlow.enviarYRegistrar = origEnviarYRegistrar;

  console.log("================================================================================");
  console.log(`🎉 TODOS LOS TESTS DE DESCUENTOS Y CINTILLO (F2g) PASARON EXITOSAMENTE (${superadas}/${superadas})`);
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("\n❌ ERROR EN TEST DE DESCUENTOS:", err);
  process.exit(1);
});
