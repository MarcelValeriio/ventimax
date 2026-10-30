/**
 * scripts/test-banner-lateral.ts
 *
 * Suite de pruebas del banner lateral de la tienda (imágenes verticales con enlace opcional a producto).
 * Uso: NODE_ENV=test npx tsx scripts/test-banner-lateral.ts
 *
 * Cubre: validador, permiso config:manage, subir hasta 5 (la sexta se rechaza), Cloudinary sin configurar,
 * borrar (un publicId ajeno no se borra en Cloudinary), PUT de enlaces por posición,
 * auditoría y lectura pública (lista blanca: sin publicId, inactivo -> null, producto inactivo -> productoId null).
 */
import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const bannerLateralService = require("../services/bannerLateralService");
const { validarBannerLateral } = require("../services/configValidators");
const cloudinaryService = require("../services/cloudinaryService");
const configAdminController = require("../controllers/configAdminController");
const publicController = require("../controllers/publicController");
const { authorize } = require("../middlewares/auth");
const PERMISSIONS: Record<string, string[]> = require("../data/permissions");

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
    setHeader: (k: string, v: string) => {
      out.headers[k] = v;
    },
  };
  return { res, out };
}

const adminUser = { id: "u-admin", user: "admin_test", role: "admin", permissions: PERMISSIONS["admin"] };
const CAT_MESA = "65f000000000000000000101";

function resetDb() {
  const data = dbLocal.read();
  data.categorias = [{ _id: CAT_MESA, nombre: "Mesa", slug: "mesa", activo: true, padre: null }];
  data.productos = [
    {
      _id: "prod-n04",
      id: "fortunne-n04",
      name: 'Fortunne Turbo Fan 10"',
      price: 40,
      descuentoPct: 0,
      description: "2 en 1",
      categoria: CAT_MESA,
      categorias: [],
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
      description: "Mesa",
      categoria: CAT_MESA,
      categorias: [],
      activo: false,
      trackStock: false,
      stock: 0,
      imagenes: [],
    },
  ];
  data.auditorias = [];
  if (data.settings) delete data.settings.bannerLateral;
  dbLocal.write(data);
  bannerLateralService.invalidateBannerLateralCache();
}

function reqSubida(productoId?: string) {
  return { file: { buffer: Buffer.from("imagen-de-prueba") }, body: productoId ? { productoId } : {}, user: adminUser };
}

function authPrueba(permiso: string, user?: any) {
  let next = false;
  let status = 200;
  const req: any = { user };
  const res: any = {
    status: (s: number) => {
      status = s;
      return res;
    },
    json: () => res,
  };
  authorize(permiso)(req, res, () => {
    next = true;
  });
  return { next, status };
}

async function main() {
  console.log("================================================================================");
  console.log("🖼️  SUITE DE PRUEBAS: BANNER LATERAL DE LA TIENDA");
  console.log("================================================================================");

  resetDb();

  // ---------------------------------------------------------------------------
  console.log("▶ Test 1: Validador y valor por defecto...");
  {
    const def = await bannerLateralService.getBannerLateral();
    assert.deepStrictEqual(def, { activo: false, imagenes: [] });

    assert.strictEqual(validarBannerLateral({ activo: true, imagenes: [{ url: "http://x.com/a.jpg", publicId: "a", productoId: null }] }).ok, false, "http rechazado");
    assert.strictEqual(validarBannerLateral({ activo: true, imagenes: [{ url: "https://x.com/a.jpg", publicId: "p".repeat(201), productoId: null }] }).ok, false, "publicId largo rechazado");
    assert.strictEqual(validarBannerLateral({ activo: true, imagenes: [{ url: "https://x.com/a.jpg", publicId: "a", productoId: "x".repeat(61) }] }).ok, false, "productoId largo rechazado");
    assert.strictEqual(validarBannerLateral({ activo: "si", imagenes: [] }).ok, false, "activo no booleano rechazado");
    assert.strictEqual(validarBannerLateral({ activo: true, imagenes: Array(6).fill({ url: "https://x.com/a.jpg", publicId: "a", productoId: null }) }).ok, false, "más de 5 rechazado");
    const ok = validarBannerLateral({ activo: true, imagenes: [{ url: "https://x.com/a.jpg", publicId: "ventimax/banner/a", productoId: "fortunne-n04" }] });
    assert.strictEqual(ok.ok, true);
  }
  console.log("  ✅ Test 1 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 2: Permiso config:manage...");
  {
    assert.strictEqual(authPrueba("config:manage", adminUser).next, true);
    assert.strictEqual(authPrueba("config:manage", { role: "cajero", permissions: PERMISSIONS["cajero"] }).status, 403);
    assert.strictEqual(authPrueba("config:manage", { role: "repartidor", permissions: PERMISSIONS["repartidor"] }).status, 403);
    assert.strictEqual(authPrueba("config:manage", undefined).status, 401);
  }
  console.log("  ✅ Test 2 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 3: Subir hasta 5 imágenes y rechazar la sexta...");
  {
    for (let i = 1; i <= 5; i++) {
      const { res, out } = mockRes();
      await configAdminController.postBannerLateralImagen(reqSubida(i === 1 ? "fortunne-n04" : undefined), res);
      assert.strictEqual(out.status, 201, `Subida ${i} debe responder 201`);
      assert.strictEqual(out.json.banner.imagenes.length, i);
    }
    const { res, out } = mockRes();
    await configAdminController.postBannerLateralImagen(reqSubida(), res);
    assert.strictEqual(out.status, 400, "La sexta debe rechazarse");
    assert.match(out.json.error, /máximo de 5/);

    const guardado = bannerLateralService.getBannerLateralSync();
    assert.strictEqual(guardado.imagenes[0].productoId, "fortunne-n04", "El enlace de la primera se guarda");
    assert.strictEqual(guardado.imagenes[1].productoId, null);
    assert.ok(guardado.imagenes[0].publicId.startsWith("ventimax/banner/"));
  }
  console.log("  ✅ Test 3 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 4: Sin Cloudinary configurado...");
  {
    resetDb();
    process.env.FORZAR_CLOUDINARY_DESCONFIGURADO = "true";
    try {
      const { res, out } = mockRes();
      await configAdminController.postBannerLateralImagen(reqSubida(), res);
      assert.strictEqual(out.status, 400);
      assert.strictEqual(out.json.error, "Cloudinary no está configurado");
      assert.strictEqual(bannerLateralService.getBannerLateralSync().imagenes.length, 0);
    } finally {
      delete process.env.FORZAR_CLOUDINARY_DESCONFIGURADO;
    }
  }
  console.log("  ✅ Test 4 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 5: Borrar imagen; publicId ajeno no se borra en Cloudinary...");
  {
    resetDb();
    const { res: r1 } = mockRes();
    await configAdminController.postBannerLateralImagen(reqSubida(), r1);
    // Imagen ajena (de un producto) metida directamente en el banner
    await bannerLateralService.setBannerLateral({
      activo: true,
      imagenes: [
        ...bannerLateralService.getBannerLateralSync().imagenes,
        { url: "https://res.cloudinary.com/x/ajena.jpg", publicId: "ventimax/productos/ajena", productoId: null },
      ],
    });

    const llamadas: string[] = [];
    const original = cloudinaryService.borrarImagen;
    cloudinaryService.borrarImagen = async (id: string) => {
      llamadas.push(id);
      return { result: "ok" };
    };
    try {
      const { res: r2, out: o2 } = mockRes();
      await configAdminController.deleteBannerLateralImagen({ params: { indice: "1" }, user: adminUser } as any, r2);
      assert.strictEqual(o2.status, 200);
      assert.strictEqual(llamadas.length, 0, "Imagen ajena: no se llama a borrar en Cloudinary");
      assert.strictEqual(bannerLateralService.getBannerLateralSync().imagenes.length, 1);

      const { res: r3, out: o3 } = mockRes();
      await configAdminController.deleteBannerLateralImagen({ params: { indice: "0" }, user: adminUser } as any, r3);
      assert.strictEqual(o3.status, 200);
      assert.strictEqual(llamadas.length, 1, "Imagen del banner: sí se borra");
      assert.ok(llamadas[0].startsWith("ventimax/banner/"));
      assert.strictEqual(bannerLateralService.getBannerLateralSync().imagenes.length, 0);

      const { res: r4, out: o4 } = mockRes();
      await configAdminController.deleteBannerLateralImagen({ params: { indice: "3" }, user: adminUser } as any, r4);
      assert.strictEqual(o4.status, 404, "Índice fuera de rango -> 404");
    } finally {
      cloudinaryService.borrarImagen = original;
    }
  }
  console.log("  ✅ Test 5 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 6: PUT de enlaces por posición...");
  {
    resetDb();
    const { res: r0 } = mockRes();
    await configAdminController.postBannerLateralImagen(reqSubida(), r0);
    const { res: r0b } = mockRes();
    await configAdminController.postBannerLateralImagen(reqSubida(), r0b);

    const { res: rMal, out: oMal } = mockRes();
    await configAdminController.updateBannerLateralConfig({ body: { activo: true, enlaces: [null] }, user: adminUser } as any, rMal);
    assert.strictEqual(oMal.status, 400, "Longitud de enlaces distinta -> 400");

    const { res: rOk, out: oOk } = mockRes();
    await configAdminController.updateBannerLateralConfig({ body: { activo: true, enlaces: ["fortunne-n04", null] }, user: adminUser } as any, rOk);
    assert.strictEqual(oOk.status, 200);
    const cfg = bannerLateralService.getBannerLateralSync();
    assert.strictEqual(cfg.activo, true);
    assert.strictEqual(cfg.imagenes[0].productoId, "fortunne-n04");
    assert.strictEqual(cfg.imagenes[1].productoId, null);

    const data = dbLocal.read();
    const aud = (data.auditorias || []).find((a: any) => a.tipoRecurso === "config" && a.recursoId === "bannerLateral" && a.accion === "update");
    assert.ok(aud, "El PUT queda auditado");
  }
  console.log("  ✅ Test 6 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 7: Auditoría de la subida...");
  {
    const data = dbLocal.read();
    const aud = (data.auditorias || []).find((a: any) => a.accion === "subir_imagen_banner_lateral");
    assert.ok(aud, "La subida queda auditada");
    assert.strictEqual(aud.tipoRecurso, "config");
  }
  console.log("  ✅ Test 7 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 8: Lectura pública (lista blanca)...");
  {
    // Activo con un producto activo (n04) y uno inactivo (n21)
    await bannerLateralService.setBannerLateral({
      activo: true,
      imagenes: [
        { url: "https://res.cloudinary.com/x/a.jpg", publicId: "ventimax/banner/a", productoId: "fortunne-n04" },
        { url: "https://res.cloudinary.com/x/b.jpg", publicId: "ventimax/banner/b", productoId: "fortunne-n21" },
        { url: "https://res.cloudinary.com/x/c.jpg", publicId: "ventimax/banner/c", productoId: "fortunne-no-existe" },
      ],
    });
    const { res, out } = mockRes();
    await publicController.getInfo({}, res);
    const lista = out.json.bannerLateral;
    assert.deepStrictEqual(lista, [
      { url: "https://res.cloudinary.com/x/a.jpg", productoId: "fortunne-n04" },
      { url: "https://res.cloudinary.com/x/b.jpg", productoId: null },
      { url: "https://res.cloudinary.com/x/c.jpg", productoId: null },
    ]);
    assert.ok(!JSON.stringify(out.json).includes("ventimax/banner/"), "Nunca se expone publicId");

    // Inactivo -> null
    await bannerLateralService.setBannerLateral({ activo: false, imagenes: lista ? [{ url: "https://x.com/a.jpg", publicId: "ventimax/banner/a", productoId: null }] : [] });
    const { res: r2, out: o2 } = mockRes();
    await publicController.getInfo({}, r2);
    assert.strictEqual(o2.json.bannerLateral, null, "Inactivo -> null");

    // Activo sin imágenes -> null
    await bannerLateralService.setBannerLateral({ activo: true, imagenes: [] });
    const { res: r3, out: o3 } = mockRes();
    await publicController.getInfo({}, r3);
    assert.strictEqual(o3.json.bannerLateral, null, "Sin imágenes -> null");
  }
  console.log("  ✅ Test 8 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 9: Reordenar imágenes (PUT /config/banner-lateral/orden)...");
  {
    resetDb();
    for (let k = 0; k < 3; k++) {
      const { res: rs } = mockRes();
      await configAdminController.postBannerLateralImagen(reqSubida(), rs);
    }
    const { res: rEnl } = mockRes();
    await configAdminController.updateBannerLateralConfig({ body: { activo: true, enlaces: ["fortunne-n04", null, null] }, user: adminUser } as any, rEnl);
    const antes = bannerLateralService.getBannerLateralSync().imagenes.map((i: any) => i.publicId);
    assert.strictEqual(antes.length, 3);

    // Orden inválido: repetido, longitud distinta, no numérico, sin body
    for (const orden of [[0, 0, 1], [0, 1], [0, 1, 3], ["0", "1", "2"], undefined]) {
      const { res: rBad, out: oBad } = mockRes();
      await configAdminController.reorderBannerLateralImagenes({ body: { orden }, user: adminUser } as any, rBad);
      assert.strictEqual(oBad.status, 400, `Orden inválido ${JSON.stringify(orden)} -> 400`);
      assert.strictEqual(oBad.json.error, "Orden invalido");
    }
    assert.deepStrictEqual(bannerLateralService.getBannerLateralSync().imagenes.map((i: any) => i.publicId), antes, "un orden inválido no cambia nada");

    // Permutación válida: la imagen 1 pasa a la posición 0, la 2 a la 1, la 0 a la 2
    const { res: rOk, out: oOk } = mockRes();
    await configAdminController.reorderBannerLateralImagenes({ body: { orden: [1, 2, 0] }, user: adminUser } as any, rOk);
    assert.strictEqual(oOk.status, 200);
    const cfg = bannerLateralService.getBannerLateralSync();
    assert.deepStrictEqual(cfg.imagenes.map((i: any) => i.publicId), [antes[1], antes[2], antes[0]], "orden aplicado en la caché");
    assert.strictEqual(cfg.imagenes[2].productoId, "fortunne-n04", "el enlace a producto viaja con su imagen");

    const persistido = dbLocal.read().settings.bannerLateral;
    assert.deepStrictEqual(persistido.imagenes.map((i: any) => i.publicId), [antes[1], antes[2], antes[0]], "orden guardado en Setting");

    const aud = (dbLocal.read().auditorias || []).filter((a: any) => a.accion === "reordenar_imagenes_banner_lateral");
    assert.strictEqual(aud.length, 1, "el reordenado queda auditado");

    // Orden identidad: 200 sin auditoría nueva
    const { res: rId, out: oId } = mockRes();
    await configAdminController.reorderBannerLateralImagenes({ body: { orden: [0, 1, 2] }, user: adminUser } as any, rId);
    assert.strictEqual(oId.status, 200);
    assert.strictEqual((dbLocal.read().auditorias || []).filter((a: any) => a.accion === "reordenar_imagenes_banner_lateral").length, 1);

    // Ruta registrada con PUT y permiso config:manage
    const crearRouter = require("../routes/adminRoutes");
    const io: any = { on() {}, emit() {}, to() { return io; }, use() {} };
    const router = crearRouter(io);
    const ruta = (router.stack || []).find((layer: any) => layer.route && layer.route.path === "/config/banner-lateral/orden");
    assert.ok(ruta && ruta.route.methods.put, "PUT /config/banner-lateral/orden registrada");
    assert.strictEqual(authPrueba("config:manage", { role: "cajero", permissions: PERMISSIONS["cajero"] }).status, 403);
  }
  console.log("  ✅ Test 9 superado");

  console.log("================================================================================");
  console.log("🎉 TODAS LAS PRUEBAS DEL BANNER LATERAL PASARON (9/9)");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("❌ La suite de banner lateral falló:", err);
  process.exit(1);
});
