/**
 * scripts/test-stock-eliminar.ts
 * Al eliminar un pedido, los productos descontados vuelven a stock.
 */

import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const adminController = require("../controllers/adminController");
const orderService = require("../services/orderService");

function mockReqRes(options: { body?: any; params?: any; user?: any } = {}) {
  const req: any = { body: options.body || {}, params: options.params || {}, query: {}, user: options.user };
  let statusCode = 200;
  let responseData: any = null;
  const res: any = {
    status: (code: number) => { statusCode = code; return res; },
    json: (data: any) => { responseData = data; return res; },
    getStatus: () => statusCode,
    getData: () => responseData,
  };
  return { req, res };
}

const stockDe = (name: string) => dbLocal.read().productos.find((p: any) => p.name === name)?.stock;

async function main() {
  const adminUser = { id: "u-admin", username: "admin", role: "admin" };
  const limpiar = () => {
    const d = dbLocal.read();
    d.productos = (d.productos || []).filter((p: any) => !String(p.name).startsWith("Prueba S"));
    d.pedidos = (d.pedidos || []).filter((p: any) => p.whatsappId !== "584120000001");
    dbLocal.write(d);
  };
  limpiar();
  const data = dbLocal.read();
  data.productos = data.productos || [];
  data.productos.push(
    { _id: "stk-1", id: "stk-1", name: "Prueba Stock A", price: 10, activo: true, trackStock: true, stock: 10 },
    { _id: "stk-2", id: "stk-2", name: "Prueba Sin Control", price: 5, activo: true, trackStock: false, stock: 0 },
  );
  dbLocal.write(data);

  console.log("▶ Test 1: venta manual descuenta y registra stockDescontado...");
  const { req, res } = mockReqRes({
    body: {
      cliente: { nombre: "Cliente Stock", cedula: "1", telefono: "584120000001" },
      items: [
        { producto: "Prueba Stock A", price: 10, cantidad: 3 },
        { producto: "Prueba Sin Control", price: 5, cantidad: 2 },
      ],
      pago: { metodo: "Efectivo" },
    },
    user: adminUser,
  });
  await adminController.postManualSale(req, res);
  assert.strictEqual(res.getStatus(), 201);
  const pedido = res.getData().data;
  assert.strictEqual(stockDe("Prueba Stock A"), 7);
  assert.deepStrictEqual(
    (pedido.stockDescontado || []).map((i: any) => [i.producto, i.cantidad]),
    [["Prueba Stock A", 3]],
    "solo se registra lo que tenía control de stock",
  );
  console.log("  ✅ Test 1 superado");

  console.log("▶ Test 2: eliminar el pedido repone el stock...");
  const { req: rDel, res: resDel } = mockReqRes({ params: { id: String(pedido._id) }, user: adminUser });
  await adminController.deleteOrder(rDel, resDel, null);
  assert.strictEqual(resDel.getStatus(), 200);
  assert.strictEqual(stockDe("Prueba Stock A"), 10, "stock vuelve a 10");
  assert.strictEqual(stockDe("Prueba Sin Control"), 0, "sin control: no se toca");
  assert.deepStrictEqual(resDel.getData().data.stockRepuesto, [{ producto: "Prueba Stock A", cantidad: 3 }]);
  console.log("  ✅ Test 2 superado");

  console.log("▶ Test 3: pedido sin registro de stock (antiguo) no suma nada...");
  const antes = stockDe("Prueba Stock A");
  const rep = await orderService.reponerStockPedido({ items: [{ producto: "Prueba Stock A", cantidad: 5 }] });
  assert.deepStrictEqual(rep, []);
  assert.strictEqual(stockDe("Prueba Stock A"), antes);
  console.log("  ✅ Test 3 superado");

  limpiar();
  console.log("🎉 TODOS LOS TESTS DE REPOSICIÓN DE STOCK PASARON (3/3)");
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
