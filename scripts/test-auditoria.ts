/**
 * scripts/test-auditoria.ts — M-5
 * Auditoría agrupada por área y por acción: filtros de GET /api/admin/audit (tipoRecurso, accion, limit),
 * resumen GET /api/admin/audit/resumen (totales, orden, "otro") y permiso audit_log:view.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-auditoria.ts
 */
import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const express = require("express");
const dbLocal = require("../services/dbLocal");
const adminController = require("../controllers/adminController");
const { authorize } = require("../middlewares/auth");
const AuditoriaModelo = require("../models/Auditoria");

let ok = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
}

/** Siembra registros conocidos en el mock de Auditoria (dbLocal). */
async function sembrar(Auditoria: any) {
  const base = Date.now() - 100000;
  let n = 0;
  const crear = async (tipoRecurso: string | null, accion: string) => {
    const registro: any = { usuarioNombre: "Tester", accion, detalles: `r${n}`, timestamp: new Date(base + n) };
    if (tipoRecurso !== null) registro.tipoRecurso = tipoRecurso;
    n++;
    await Auditoria.create(registro);
  };
  for (let i = 0; i < 3; i++) await crear("pedido", "cambio_estado");
  for (let i = 0; i < 2; i++) await crear("producto", "crear_producto");
  await crear("producto", "actualizar_producto");
  await crear("metodo_envio", "actualizar_metodo_envio");
  await crear("config", "update");
  for (let i = 0; i < 2; i++) await crear(null, "reset_bot");
  // 105 registros extra para comprobar el tope de 100 por página
  for (let i = 0; i < 105; i++) await crear("config", "relleno");
  return { total: 3 + 2 + 1 + 1 + 1 + 2 + 105 };
}

async function main() {
  console.log("================================================================================");
  console.log("📋 SUITE DE PRUEBAS: AUDITORÍA AGRUPADA (M-5)");
  console.log("================================================================================");

  const Auditoria = dbLocal.getAuditoriaModel();
  await Auditoria.deleteMany({});
  const { total: totalSembrado } = await sembrar(Auditoria);

  // Servidor mínimo con los dos controladores reales, para probar req.query de verdad
  const app = express();
  app.get("/api/admin/audit", (req: any, res: any) => adminController.getAuditLogs(req, res));
  app.get("/api/admin/audit/resumen", (req: any, res: any) => adminController.getAuditSummary(req, res));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (ruta: string) => {
    const r = await fetch(base + ruta);
    return { status: r.status, body: await r.json() };
  };

  try {
    console.log("▶ Filtros de /api/admin/audit");

    await prueba("filtra por tipoRecurso con igualdad exacta", async () => {
      const r = await get("/api/admin/audit?tipoRecurso=pedido&limit=50");
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.success, true);
      assert.strictEqual(r.body.data.length, 3);
      assert.ok(r.body.data.every((x: any) => x.tipoRecurso === "pedido"));
      assert.strictEqual(r.body.pagination.total, 3);
    });

    await prueba("filtra por accion sola", async () => {
      const r = await get("/api/admin/audit?accion=update&limit=50");
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.data.length, 1);
      assert.strictEqual(r.body.data[0].tipoRecurso, "config");
    });

    await prueba("combina tipoRecurso y accion", async () => {
      const r = await get("/api/admin/audit?tipoRecurso=producto&accion=crear_producto");
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.data.length, 2);
      assert.ok(r.body.data.every((x: any) => x.accion === "crear_producto"));
    });

    await prueba("sin filtros devuelve todo (paginado) con la forma de siempre", async () => {
      const r = await get("/api/admin/audit?limit=50&page=1");
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.pagination.total, totalSembrado);
      assert.strictEqual(r.body.pagination.page, 1);
      assert.strictEqual(r.body.pagination.pages, Math.ceil(totalSembrado / 50));
      assert.strictEqual(r.body.totalCount, totalSembrado);
    });

    await prueba("limit se acota entre 1 y 100", async () => {
      const grande = await get("/api/admin/audit?limit=500");
      assert.strictEqual(grande.status, 200);
      assert.strictEqual(grande.body.data.length, 100);
      const cero = await get("/api/admin/audit?limit=0");
      assert.strictEqual(cero.body.data.length, 1);
      const pocos = await get("/api/admin/audit?limit=5");
      assert.strictEqual(pocos.body.data.length, 5);
    });

    await prueba("tipoRecurso=otro incluye los registros sin tipoRecurso", async () => {
      const r = await get("/api/admin/audit?tipoRecurso=otro&limit=50");
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.data.length, 2);
      assert.ok(r.body.data.every((x: any) => x.accion === "reset_bot"));
    });

    await prueba("valores inválidos responden 400 'Filtro inválido'", async () => {
      const casos = [
        "/api/admin/audit?tipoRecurso=../x",
        "/api/admin/audit?tipoRecurso=Pedido",
        "/api/admin/audit?accion=" + "a".repeat(51),
        "/api/admin/audit?tipoRecurso=pedido&tipoRecurso=producto",
        "/api/admin/audit?accion=crear-producto",
        "/api/admin/audit?accion=",
      ];
      for (const ruta of casos) {
        const r = await get(ruta);
        assert.strictEqual(r.status, 400, `debía dar 400: ${ruta}`);
        assert.strictEqual(r.body.success, false);
        assert.strictEqual(r.body.error, "Filtro inválido");
      }
    });

    console.log("▶ Resumen /api/admin/audit/resumen");

    const resumen = await get("/api/admin/audit/resumen");

    await prueba("responde { success, data: { total, areas } } con totales correctos", async () => {
      assert.strictEqual(resumen.status, 200);
      assert.strictEqual(resumen.body.success, true);
      assert.strictEqual(resumen.body.data.total, totalSembrado);
      assert.ok(Array.isArray(resumen.body.data.areas));
    });

    await prueba("áreas y acciones ordenadas de mayor a menor total", async () => {
      const areas = resumen.body.data.areas;
      const totalesAreas = areas.map((a: any) => a.total);
      assert.deepStrictEqual(totalesAreas, [...totalesAreas].sort((x, y) => y - x));
      for (const area of areas) {
        const totales = area.acciones.map((a: any) => a.total);
        assert.deepStrictEqual(totales, [...totales].sort((x: number, y: number) => y - x));
        assert.strictEqual(
          area.acciones.reduce((s: number, a: any) => s + a.total, 0),
          area.total,
          `la suma de acciones debe ser el total de ${area.tipoRecurso}`,
        );
      }
      assert.strictEqual(areas[0].tipoRecurso, "config", "config tiene 106 registros");
    });

    await prueba("cuenta cada área y acción correctamente", async () => {
      const buscar = (tipo: string) => resumen.body.data.areas.find((a: any) => a.tipoRecurso === tipo);
      assert.strictEqual(buscar("pedido").total, 3);
      assert.deepStrictEqual(buscar("pedido").acciones, [{ accion: "cambio_estado", total: 3 }]);
      assert.strictEqual(buscar("producto").total, 3);
      assert.deepStrictEqual(buscar("producto").acciones[0], { accion: "crear_producto", total: 2 });
      assert.strictEqual(buscar("metodo_envio").total, 1);
      assert.strictEqual(buscar("config").total, 106);
    });

    await prueba("registros sin tipoRecurso cuentan en 'otro'", async () => {
      const otro = resumen.body.data.areas.find((a: any) => a.tipoRecurso === "otro");
      assert.ok(otro, "debe existir el área 'otro'");
      assert.strictEqual(otro.total, 2);
      assert.deepStrictEqual(otro.acciones, [{ accion: "reset_bot", total: 2 }]);
    });

    console.log("▶ Permisos y ruta");

    await prueba("resumen se registra con isAuthenticated + authorize(audit_log:view)", async () => {
      const adminRoutes = require("../routes/adminRoutes")({ emit: () => {} });
      const capa = adminRoutes.stack.find((l: any) => l.route && l.route.path === "/audit/resumen");
      assert.ok(capa, "falta la ruta /audit/resumen");
      assert.strictEqual(capa.route.stack.length, 3, "isAuthenticated, authorize y controlador");
      const capaAudit = adminRoutes.stack.find((l: any) => l.route && l.route.path === "/audit");
      assert.ok(capaAudit, "sigue existiendo /audit");
    });

    await prueba("authorize(audit_log:view) bloquea sin permiso y deja pasar con él", () => {
      const middleware = authorize(["audit_log:view"]);
      const probar = (permisos: string[] | undefined) => {
        let llamado = false;
        let status = 200;
        const req: any = { user: permisos ? { permissions: permisos } : undefined };
        const res: any = { status: (s: number) => ((status = s), res), json: () => res };
        middleware(req, res, () => (llamado = true));
        return { llamado, status };
      };
      assert.deepStrictEqual(probar(["dashboard:view"]), { llamado: false, status: 403 });
      assert.deepStrictEqual(probar(["audit_log:view"]), { llamado: true, status: 200 });
    });

    await prueba("el modelo acepta el área metodo_envio", () => {
      const valores = AuditoriaModelo.schema.path("tipoRecurso").enumValues;
      assert.ok(valores.includes("metodo_envio"));
    });

    await prueba("todo tipoRecurso que escribe el código está permitido en el modelo", () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const valores = AuditoriaModelo.schema.path("tipoRecurso").enumValues;
      const fuentes = ["controllers", "services"].flatMap((d) =>
        fs.readdirSync(path.join(__dirname, "..", d)).filter((f: string) => f.endsWith(".ts")).map((f: string) => path.join(__dirname, "..", d, f))
      );
      const usados = new Set<string>();
      for (const f of fuentes) for (const m of fs.readFileSync(f, "utf8").matchAll(/tipoRecurso:\s*"([^"]+)"/g)) usados.add(m[1]);
      const fuera = [...usados].filter((t) => !valores.includes(t));
      assert.deepStrictEqual(fuera, [], `tipos que Mongoose rechazaría (la acción quedaría sin auditar): ${fuera.join(", ")}`);
    });

    await prueba("registrarAuditoria guarda listas u objetos como texto (antes fallaba la validación)", async () => {
      const { registrarAuditoria } = require("../services/auditService");
      await registrarAuditoria({ user: { _id: "u1", nombre: "Prueba" } }, {
        recursoId: "p-fotos",
        tipoRecurso: "producto",
        accion: "subir_imagen_producto",
        nuevo: [{ url: "https://res.cloudinary.com/x/a.jpg", publicId: "ventimax/productos/a" }],
      });
      const guardado = (await Auditoria.find({ recursoId: "p-fotos" }))[0];
      assert.ok(guardado, "el registro se guardó");
      assert.strictEqual(typeof guardado.estadoNuevo, "string");
      assert.ok(guardado.estadoNuevo.includes("ventimax/productos/a"));
    });
  } finally {
    server.close();
    await Auditoria.deleteMany({});
  }

  console.log("================================================================================");
  console.log(`🎉 TODAS LAS PRUEBAS DE AUDITORÍA PASARON (${ok}/${ok})`);
  console.log("================================================================================");
}

main().catch((error) => {
  console.error("❌ Fallo en la suite de auditoría:", error);
  process.exit(1);
});
