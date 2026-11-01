/**
 * scripts/test-aliados.ts
 *
 * Suite de pruebas automatizadas para Aliados comerciales (F2j).
 * Uso: NODE_ENV=test npx tsx scripts/test-aliados.ts
 *
 * Cubre:
 * 1. Permiso config:manage en las rutas /api/admin/aliados.
 * 2. Validaciones (nombre obligatorio <= 60, descripción obligatoria <= 400, tope de 30 aliados).
 * 3. Subida de logo a carpeta <marca>/aliados y rechazo de publicId ajeno.
 * 4. CRUD completo con registro de auditoría (tipoRecurso: "aliado") y borrado de Cloudinary al cambiar/eliminar logo.
 * 5. Salida pública en GET /api/public/info (lista blanca estricta, solo activos, ordenados, vacío si no hay).
 * 6. Integridad de la tienda (sin innerHTML, redirección a #/ sin aliados, enlace condicional en barra y pie).
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const aliadosController = require("../controllers/aliadosController");
const publicController = require("../controllers/publicController");
const cloudinaryService = require("../services/cloudinaryService");
const AuditoriaModelo = require("../models/Auditoria");
const { authorize } = require("../middlewares/auth");
const PERMISSIONS: Record<string, string[]> = require("../data/permissions");

function mockRes() {
  const out: { status: number; json: any; headers: Record<string, string> } = {
    status: 200,
    json: null,
    headers: {},
  };
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

const adminUser = {
  id: "u-admin",
  user: "admin_test",
  role: "admin",
  permissions: PERMISSIONS["admin"] || ["config:manage", "product:manage"],
};

const limitedUser = {
  id: "u-cocina",
  user: "cocina_test",
  role: "cocina",
  permissions: ["order:view", "order:update"],
};

function resetDb() {
  const data = dbLocal.read();
  data.aliados = [];
  data.auditorias = [];
  data.settings = {};
  dbLocal.write(data);
}

async function main() {
  console.log("================================================================================");
  console.log("🤝  SUITE DE PRUEBAS: ALIADOS COMERCIALES (F2j)");
  console.log("================================================================================");

  resetDb();

  // ---------------------------------------------------------------------------
  console.log("▶ Test 1: Permisos de acceso (config:manage)...");
  {
    const middleware = authorize(["config:manage"]);

    // Usuario sin permiso
    let bloqueado = false;
    const reqSinPermiso: any = { user: limitedUser };
    const { res: resSinPermiso } = mockRes();
    middleware(reqSinPermiso, resSinPermiso, () => {
      bloqueado = true;
    });
    assert.strictEqual(bloqueado, false, "usuario sin config:manage debe ser bloqueado por middleware");

    // Usuario admin con config:manage
    let permitido = false;
    const reqConPermiso: any = { user: adminUser };
    const { res: resConPermiso } = mockRes();
    middleware(reqConPermiso, resConPermiso, () => {
      permitido = true;
    });
    assert.strictEqual(permitido, true, "usuario con config:manage debe tener acceso permitido");
  }
  console.log("  ✅ Test 1 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 2: Validaciones de campos y límite de 30 aliados...");
  {
    // Nombre vacío
    {
      const { res, out } = mockRes();
      await aliadosController.createAliado(
        { body: { nombre: "", descripcion: "Descripción válida" }, user: adminUser } as any,
        res
      );
      assert.strictEqual(out.status, 400);
      assert.ok(out.json.error.includes("nombre"), "debe exigir nombre");
    }

    // Nombre > 60 chars
    {
      const { res, out } = mockRes();
      await aliadosController.createAliado(
        { body: { nombre: "A".repeat(61), descripcion: "Descripción válida" }, user: adminUser } as any,
        res
      );
      assert.strictEqual(out.status, 400);
      assert.ok(out.json.error.includes("60 caracteres"), "debe rechazar nombre mayor a 60 chars");
    }

    // Descripción vacía
    {
      const { res, out } = mockRes();
      await aliadosController.createAliado(
        { body: { nombre: "Aliado Test", descripcion: "" }, user: adminUser } as any,
        res
      );
      assert.strictEqual(out.status, 400);
      assert.ok(out.json.error.includes("descripción"), "debe exigir descripción");
    }

    // Descripción > 400 chars
    {
      const { res, out } = mockRes();
      await aliadosController.createAliado(
        { body: { nombre: "Aliado Test", descripcion: "X".repeat(401) }, user: adminUser } as any,
        res
      );
      assert.strictEqual(out.status, 400);
      assert.ok(out.json.error.includes("400 caracteres"), "debe rechazar descripción mayor a 400 chars");
    }

    // Llenar con 30 aliados
    const data = dbLocal.read();
    for (let i = 1; i <= 30; i++) {
      data.aliados.push({
        _id: `aliado-${i}`,
        nombre: `Aliado Comercial ${i}`,
        descripcion: `Descripción del aliado ${i}`,
        orden: i,
        activo: true,
        brand: "ventimax",
      });
    }
    dbLocal.write(data);

    // Intentar crear el 31
    const { res: res31, out: out31 } = mockRes();
    await aliadosController.createAliado(
      { body: { nombre: "Aliado 31", descripcion: "No debe pasar" }, user: adminUser } as any,
      res31
    );
    assert.strictEqual(out31.status, 400);
    assert.ok(out31.json.error.includes("Máximo 30"), "debe rechazar el 31.º aliado");

    resetDb();
  }
  console.log("  ✅ Test 2 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 3: Subida de logo y aislamiento de carpeta en Cloudinary...");
  {
    assert.strictEqual(cloudinaryService.esPublicIdDeAliado("ventimax/aliados/logo123"), true);
    assert.strictEqual(cloudinaryService.esPublicIdDeAliado("otra_marca/aliados/logo123"), false);
    assert.strictEqual(cloudinaryService.esPublicIdDeAliado("ventimax/productos/p123"), false);
    assert.strictEqual(cloudinaryService.esPublicIdDeAliado(""), false);

    // Subida exitosa
    const subida = await cloudinaryService.subirLogoAliado(Buffer.from("fake-png"));
    assert.ok(subida.url.includes("cloudinary.com"));
    assert.ok(subida.publicId.startsWith("ventimax/aliados/"));

    // Subida mediante endpoint
    const { res: resSubida, out: outSubida } = mockRes();
    await aliadosController.uploadAliadoLogo(
      { file: { buffer: Buffer.from("fake-png") }, user: adminUser } as any,
      resSubida
    );
    assert.strictEqual(outSubida.status, 200);
    assert.ok(outSubida.json.data.url);
    assert.ok(outSubida.json.data.publicId.startsWith("ventimax/aliados/"));

    // Rechazo de publicId ajeno al crear
    const { res: resAjeno, out: outAjeno } = mockRes();
    await aliadosController.createAliado(
      {
        body: {
          nombre: "Aliado Hack",
          descripcion: "Intento de inyectar logo ajeno",
          logoUrl: "https://example.com/logo.png",
          logoPublicId: "otra_carpeta/foto",
        },
        user: adminUser,
      } as any,
      resAjeno
    );
    assert.strictEqual(outAjeno.status, 400);
    assert.ok(outAjeno.json.error.includes("carpeta de aliados"), "debe rechazar publicId fuera de <marca>/aliados/");

    // Cloudinary no configurado responde 400
    process.env.FORZAR_CLOUDINARY_DESCONFIGURADO = "true";
    const { res: resDesconf, out: outDesconf } = mockRes();
    await aliadosController.uploadAliadoLogo(
      { file: { buffer: Buffer.from("fake-png") }, user: adminUser } as any,
      resDesconf
    );
    assert.strictEqual(outDesconf.status, 400);
    assert.strictEqual(outDesconf.json.error, "Cloudinary no está configurado");
    delete process.env.FORZAR_CLOUDINARY_DESCONFIGURADO;
  }
  console.log("  ✅ Test 3 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 4: CRUD completo, auditoría y borrado en Cloudinary...");
  {
    resetDb();

    // 4a: Crear aliado con logo
    const { res: resCrear, out: outCrear } = mockRes();
    await aliadosController.createAliado(
      {
        body: {
          nombre: "Electro Distribuidora",
          descripcion: "Distribuidor oficial de componentes en Caracas.",
          logoUrl: "https://res.cloudinary.com/test/image/upload/v1/ventimax/aliados/e1.png",
          logoPublicId: "ventimax/aliados/e1",
          orden: 1,
          activo: true,
        },
        user: adminUser,
        ip: "127.0.0.1",
        headers: {},
      } as any,
      resCrear
    );
    assert.strictEqual(outCrear.status, 201);
    const aliadoCreado = outCrear.json.data;
    assert.ok(aliadoCreado._id);

    // Auditoría de creación
    const dbData = dbLocal.read();
    const audCrear = (dbData.auditorias || []).find(
      (a: any) => a.tipoRecurso === "aliado" && a.accion === "crear_aliado"
    );
    assert.ok(audCrear, "debe registrar auditoría de creación con tipoRecurso 'aliado'");
    assert.strictEqual(audCrear.estadoNuevo, "Electro Distribuidora");

    // 4b: Listar aliados (GET)
    const { res: resList, out: outList } = mockRes();
    await aliadosController.getAliados({ query: {}, user: adminUser } as any, resList);
    assert.strictEqual(outList.status, 200);
    assert.strictEqual(outList.json.data.length, 1);

    // 4c: Actualizar aliado cambiando el logo (debe borrar el anterior)
    let imagenBorrada = "";
    const origBorrar = cloudinaryService.borrarImagen;
    cloudinaryService.borrarImagen = async (pid: string) => {
      imagenBorrada = pid;
      return { result: "ok" };
    };

    const { res: resUpd, out: outUpd } = mockRes();
    await aliadosController.updateAliado(
      {
        params: { id: aliadoCreado._id },
        body: {
          nombre: "Electro Distribuidora S.A.",
          logoUrl: "https://res.cloudinary.com/test/image/upload/v1/ventimax/aliados/e2.png",
          logoPublicId: "ventimax/aliados/e2",
        },
        user: adminUser,
        ip: "127.0.0.1",
        headers: {},
      } as any,
      resUpd
    );
    assert.strictEqual(outUpd.status, 200);
    assert.strictEqual(imagenBorrada, "ventimax/aliados/e1", "debe borrar el logo anterior de Cloudinary");

    // Auditoría de actualización
    const audUpd = (dbLocal.read().auditorias || []).find(
      (a: any) => a.tipoRecurso === "aliado" && a.accion === "actualizar_aliado"
    );
    assert.ok(audUpd, "debe registrar auditoría de actualización");

    // 4d: Id mal formado / inexistente da 404 (M-2)
    const { res: resInex, out: outInex } = mockRes();
    await aliadosController.updateAliado(
      { params: { id: "id-no-existe" }, body: { nombre: "X" }, user: adminUser } as any,
      resInex
    );
    assert.strictEqual(outInex.status, 404);
    assert.strictEqual(outInex.json.error, "Aliado no encontrado");

    // 4e: Eliminar aliado (borra logo en Cloudinary y audita)
    imagenBorrada = "";
    const { res: resDel, out: outDel } = mockRes();
    await aliadosController.deleteAliado(
      { params: { id: aliadoCreado._id }, user: adminUser, ip: "127.0.0.1", headers: {} } as any,
      resDel
    );
    assert.strictEqual(outDel.status, 200);
    assert.strictEqual(imagenBorrada, "ventimax/aliados/e2", "al eliminar debe borrar el logo de Cloudinary");

    const audDel = (dbLocal.read().auditorias || []).find(
      (a: any) => a.tipoRecurso === "aliado" && a.accion === "eliminar_aliado"
    );
    assert.ok(audDel, "debe registrar auditoría de eliminación");

    cloudinaryService.borrarImagen = origBorrar;
  }
  console.log("  ✅ Test 4 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 5: Salida pública GET /api/public/info...");
  {
    resetDb();

    // Sin aliados activos: debe ser []
    const { res: resVacio, out: outVacio } = mockRes();
    await publicController.getInfo({} as any, resVacio);
    assert.ok(Array.isArray(outVacio.json.aliados), "info.aliados debe ser un arreglo");
    assert.strictEqual(outVacio.json.aliados.length, 0, "sin aliados activos debe retornar []");

    // Sembrar 2 aliados activos y 1 inactivo
    const Aliado = dbLocal.getAliadoModel();
    await Aliado.create({
      nombre: "Aliado Alfa",
      descripcion: "Descripción Alfa",
      logoUrl: "https://res.cloudinary.com/test/image/upload/v1/ventimax/aliados/a.png",
      logoPublicId: "ventimax/aliados/a",
      orden: 2,
      activo: true,
      brand: "ventimax",
    });
    await Aliado.create({
      nombre: "Aliado Beta",
      descripcion: "Descripción Beta (primero por orden)",
      logoUrl: "https://res.cloudinary.com/test/image/upload/v1/ventimax/aliados/b.png",
      logoPublicId: "ventimax/aliados/b",
      orden: 1,
      activo: true,
      brand: "ventimax",
    });
    await Aliado.create({
      nombre: "Aliado Inactivo",
      descripcion: "No debe salir",
      logoUrl: "https://res.cloudinary.com/test/image/upload/v1/ventimax/aliados/c.png",
      logoPublicId: "ventimax/aliados/c",
      orden: 0,
      activo: false,
      brand: "ventimax",
    });

    const { res: resInfo, out: outInfo } = mockRes();
    await publicController.getInfo({} as any, resInfo);
    assert.strictEqual(outInfo.status, 200);
    assert.strictEqual(outInfo.json.aliados.length, 2, "solo debe incluir los 2 activos");

    // Lista blanca estricta
    const primero = outInfo.json.aliados[0];
    assert.strictEqual(primero.nombre, "Aliado Beta", "debe respetar orden ascendente (orden 1 antes que 2)");
    assert.strictEqual(primero.descripcion, "Descripción Beta (primero por orden)");
    assert.strictEqual(primero.logoUrl, "https://res.cloudinary.com/test/image/upload/v1/ventimax/aliados/b.png");
    assert.strictEqual(primero._id, undefined, "NO debe exponer _id");
    assert.strictEqual(primero.logoPublicId, undefined, "NO debe exponer logoPublicId");
    assert.strictEqual(primero.brand, undefined, "NO debe exponer brand");
  }
  console.log("  ✅ Test 5 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 6: Integridad de la tienda, ruta directa y frontend (sin innerHTML)...");
  {
    const appSrc = fs.readFileSync(path.join(__dirname, "../catalogo/js/app.js"), "utf8");
    const htmlSrc = fs.readFileSync(path.join(__dirname, "../catalogo/index.html"), "utf8");
    const cssSrc = fs.readFileSync(path.join(__dirname, "../catalogo/css/style.css"), "utf8");

    // Ruta directa #/aliados sin state.info previo: no debe redirigir a #/ prematuramente
    assert.ok(
      appSrc.includes('if (!state.info)') && appSrc.includes('appRoot.appendChild(siluetasCatalogo());'),
      "enrutar() y renderizarAliados() deben esperar state.info con siluetas antes de decidir redirección"
    );
    assert.ok(
      appSrc.includes('if (window.location.hash.startsWith("#/aliados")) enrutar();'),
      "cargarDatos() debe volver a enrutar cuando llegue la info pública"
    );

    // Redirección en enrutador solo si state.info ya cargó y lista está vacía
    assert.ok(
      appSrc.includes('hash === "#/aliados"') && appSrc.includes('window.location.hash = "#/";'),
      "enrutar() debe redirigir a #/ si no hay aliados activos una vez cargada la info"
    );

    // renderizarAliados
    assert.ok(appSrc.includes("function renderizarAliados"), "renderizarAliados debe estar implementada");
    assert.ok(appSrc.includes("aliados-cuadricula"), "renderizarAliados debe armar la cuadrícula");

    // Intro de aliados desde marca con textContent (0 innerHTML)
    assert.ok(
      appSrc.includes("state.marca?.descripcionAliados") && appSrc.includes("pIntro.textContent = intro.trim();"),
      "renderizarAliados debe leer descripcionAliados de la marca y pintar con textContent"
    );

    // Seguridad: 0 innerHTML
    assert.ok(!appSrc.includes("innerHTML"), "catalogo/js/app.js no debe usar innerHTML");

    // Enlace en el pie de página
    assert.ok(htmlSrc.includes('id="footer-aliados"'), "index.html debe tener el enlace footer-aliados");
    assert.ok(appSrc.includes("footer-aliados"), "app.js debe alternar visibilidad de footer-aliados");

    // CSS responsive
    assert.ok(cssSrc.includes(".aliados-cuadricula"), "CSS debe tener .aliados-cuadricula");
    assert.ok(cssSrc.includes("grid-template-columns: repeat(2, 1fr)"), "CSS debe contemplar 2 columnas en tableta");
    assert.ok(cssSrc.includes("grid-template-columns: repeat(3, 1fr)"), "CSS debe contemplar 3 columnas en escritorio");
    assert.ok(cssSrc.includes("grid-template-columns: repeat(4, 1fr)"), "CSS debe contemplar 4 columnas en pantallas anchas");
    assert.ok(cssSrc.includes(".aliado-logo-contenedor"), "CSS debe tener .aliado-logo-contenedor con altura fija");
  }
  console.log("  ✅ Test 6 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 7: AyudaTamanoImagen y reordenamiento con posiciones explícitas en AliadosTab...");
  {
    const tabSrc = fs.readFileSync(
      path.join(__dirname, "../public/src/features/inventory/components/AliadosTab.js"),
      "utf8"
    );

    // AyudaTamanoImagen
    assert.ok(
      tabSrc.includes('import { AyudaTamanoImagen } from "../../../components/AyudaTamanoImagen.js";'),
      "AliadosTab debe importar AyudaTamanoImagen"
    );
    assert.ok(
      tabSrc.includes('medidas: "400 × 200 px (horizontal)"'),
      "AliadosTab debe indicar medidas de 400 × 200 px (horizontal)"
    );
    assert.ok(
      tabSrc.includes('detalle: "JPG, PNG o WebP, hasta 2 MB"'),
      "AliadosTab debe indicar detalle de JPG, PNG o WebP, hasta 2 MB"
    );

    // Reordenamiento sin 'Number(orden) || destino'
    assert.ok(
      !tabSrc.includes("Number(orden) || destino") && !tabSrc.includes("Number(adyacente.orden) || destino"),
      "AliadosTab no debe usar fallback '|| destino' que trata 0 como vacío"
    );
    assert.ok(
      tabSrc.includes("copia.splice(index, 1)") && tabSrc.includes("copia.splice(destino, 0, movido)"),
      "AliadosTab debe reordenar el arreglo con posiciones explícitas"
    );
  }
  console.log("  ✅ Test 7 superado");

  console.log("\n================================================================================");
  console.log("🎉 TODOS LOS TESTS DE ALIADOS COMERCIALES PASARON EXITOSAMENTE (7/7)");
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("❌ Falló la suite test-aliados.ts:", err);
  process.exit(1);
});
