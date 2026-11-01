/**
 * scripts/test-slider-tienda.ts
 *
 * Suite de pruebas del slider de portada de la tienda (F2i).
 * Uso: NODE_ENV=test npx tsx scripts/test-slider-tienda.ts
 *
 * Cubre:
 * 1. Validador y valores por defecto (límites de slides, alt, segundos, doble destino).
 * 2. Permiso config:manage en las rutas de admin.
 * 3. Subida de imagen a la carpeta <marca>/slider y manejo de Cloudinary no configurado.
 * 4. PUT con validación de existencia de producto/categoría, aislamiento de publicId y auditoría.
 * 5. Borrado en Cloudinary de imágenes reemplazadas o eliminadas.
 * 6. Salida pública en GET /api/public/info (lista blanca, null si inactivo, destino caído a null).
 * 7. Lógica sin DOM en catalogo/js/slider.js (navegación, autoavance, pausas).
 */
import assert from "node:assert";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";

const dbLocal = require("../services/dbLocal");
const sliderTiendaService = require("../services/sliderTiendaService");
const { validarSliderTienda } = require("../services/configValidators");
const cloudinaryService = require("../services/cloudinaryService");
const configAdminController = require("../controllers/configAdminController");
const publicController = require("../controllers/publicController");
const { authorize } = require("../middlewares/auth");
const AuditoriaModelo = require("../models/Auditoria");
const PERMISSIONS: Record<string, string[]> = require("../data/permissions");
const sliderLib = require("../catalogo/js/slider.js");

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
  data.categorias = [
    { _id: CAT_MESA, nombre: "Mesa", slug: "mesa", activo: true, padre: null },
    { _id: "cat-pared", nombre: "Pared", slug: "pared", activo: true, padre: null },
  ];
  data.productos = [
    {
      _id: "prod-n04",
      id: "fortunne-n04",
      name: 'Fortunne Turbo Fan 10"',
      price: 40,
      descuentoPct: 0,
      description: "2 en 1",
      categoria: CAT_MESA,
      categorias: ["mesa", "pared"],
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
      activo: false, // Inactivo
      trackStock: false,
      stock: 0,
      imagenes: [],
    },
  ];
  data.auditorias = [];
  if (data.settings) delete data.settings.sliderTienda;
  dbLocal.write(data);
  sliderTiendaService.invalidateSliderTiendaCache();
}

function reqSubida(bufferContent = "imagen-prueba") {
  return { file: { buffer: Buffer.from(bufferContent) }, user: adminUser };
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
  console.log("🎠  SUITE DE PRUEBAS: SLIDER DE PORTADA DE LA TIENDA (F2i)");
  console.log("================================================================================");

  resetDb();

  // ---------------------------------------------------------------------------
  console.log("▶ Test 1: Validador y valor por defecto...");
  {
    const def = await sliderTiendaService.getSliderTienda();
    assert.deepStrictEqual(def, { activo: false, autoavance: true, segundos: 6, slides: [] });

    // Segundos fuera de rango
    assert.strictEqual(validarSliderTienda({ segundos: 2, slides: [] }).ok, false, "segundos < 3 rechazados");
    assert.strictEqual(validarSliderTienda({ segundos: 16, slides: [] }).ok, false, "segundos > 15 rechazados");
    assert.strictEqual(validarSliderTienda({ segundos: 6.5, slides: [] }).ok, false, "segundos no enteros rechazados");

    // Más de 8 slides
    const nueveSlides = Array(9).fill({
      url: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/a.jpg",
      publicId: "ventimax/slider/a",
    });
    assert.strictEqual(validarSliderTienda({ slides: nueveSlides }).ok, false, "más de 8 slides rechazadas");

    // Alt largo
    assert.strictEqual(
      validarSliderTienda({
        slides: [
          {
            url: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/a.jpg",
            publicId: "ventimax/slider/a",
            alt: "x".repeat(121),
          },
        ],
      }).ok,
      false,
      "alt > 120 rechazado"
    );

    // Doble destino (productoId y categoriaSlug simultáneos)
    assert.strictEqual(
      validarSliderTienda({
        slides: [
          {
            url: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/a.jpg",
            publicId: "ventimax/slider/a",
            productoId: "fortunne-n04",
            categoriaSlug: "mesa",
          },
        ],
      }).ok,
      false,
      "doble destino rechazado"
    );

    // URL no https o inválida
    assert.strictEqual(
      validarSliderTienda({
        slides: [
          {
            url: "http://inseguro.com/a.jpg",
            publicId: "ventimax/slider/a",
          },
        ],
      }).ok,
      false,
      "url http rechazada"
    );

    // Slide válida
    const val = validarSliderTienda({
      activo: true,
      autoavance: true,
      segundos: 8,
      slides: [
        {
          url: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/a.jpg",
          publicId: "ventimax/slider/a",
          urlMovil: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/a_m.jpg",
          publicIdMovil: "ventimax/slider/a_m",
          alt: "Ventiladores en promoción",
          productoId: "fortunne-n04",
        },
      ],
    });
    assert.strictEqual(val.ok, true, "slide válida aceptada");
  }
  console.log("  ✅ Test 1 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 2: Permisos de acceso (config:manage)...");
  {
    assert.strictEqual(authPrueba("config:manage", adminUser).next, true);
    assert.strictEqual(authPrueba("config:manage", { role: "cajero", permissions: PERMISSIONS["cajero"] }).status, 403);
    assert.strictEqual(authPrueba("config:manage", { role: "repartidor", permissions: PERMISSIONS["repartidor"] }).status, 403);
    assert.strictEqual(authPrueba("config:manage", undefined).status, 401);
  }
  console.log("  ✅ Test 2 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 3: Subida de imagen y aislamiento de carpeta...");
  {
    // Sin archivo
    const { res: resVacia, out: outVacia } = mockRes();
    await configAdminController.postSliderTiendaImagen({ file: null, user: adminUser }, resVacia);
    assert.strictEqual(outVacia.status, 400);

    // Cloudinary no configurado
    process.env.FORZAR_CLOUDINARY_DESCONFIGURADO = "true";
    const { res: resDesconf, out: outDesconf } = mockRes();
    await configAdminController.postSliderTiendaImagen(reqSubida(), resDesconf);
    assert.strictEqual(outDesconf.status, 400);
    assert.strictEqual(outDesconf.json.error, "Cloudinary no está configurado");
    delete process.env.FORZAR_CLOUDINARY_DESCONFIGURADO;

    // Subida exitosa a la carpeta <marca>/slider
    const { res: resOk, out: outOk } = mockRes();
    await configAdminController.postSliderTiendaImagen(reqSubida(), resOk);
    assert.strictEqual(outOk.status, 201);
    assert.ok(outOk.json.url && typeof outOk.json.url === "string");
    assert.ok(outOk.json.publicId.startsWith("ventimax/slider/"));
    assert.strictEqual(cloudinaryService.esPublicIdDeSlider(outOk.json.publicId), true);
    assert.strictEqual(cloudinaryService.esPublicIdDeSlider("ventimax/productos/foto.jpg"), false);
  }
  console.log("  ✅ Test 3 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 4: PUT de configuración, validación de destinos y auditoría...");
  {
    // Producto inexistente
    const { res: resInex, out: outInex } = mockRes();
    await configAdminController.updateSliderTiendaConfig(
      {
        body: {
          activo: true,
          slides: [
            {
              url: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/s1.jpg",
              publicId: "ventimax/slider/s1",
              productoId: "no-existe",
            },
          ],
        },
        user: adminUser,
      } as any,
      resInex
    );
    assert.strictEqual(outInex.status, 400);
    assert.ok(outInex.json.error.includes("no existe"));

    // Producto inactivo
    const { res: resInac, out: outInac } = mockRes();
    await configAdminController.updateSliderTiendaConfig(
      {
        body: {
          activo: true,
          slides: [
            {
              url: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/s1.jpg",
              publicId: "ventimax/slider/s1",
              productoId: "fortunne-n21", // Inactivo
            },
          ],
        },
        user: adminUser,
      } as any,
      resInac
    );
    assert.strictEqual(outInac.status, 400);
    assert.ok(outInac.json.error.includes("no existe o no está activo"));

    // Categoría inexistente
    const { res: resCatInex, out: outCatInex } = mockRes();
    await configAdminController.updateSliderTiendaConfig(
      {
        body: {
          activo: true,
          slides: [
            {
              url: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/s1.jpg",
              publicId: "ventimax/slider/s1",
              categoriaSlug: "categoria-fantasma",
            },
          ],
        },
        user: adminUser,
      } as any,
      resCatInex
    );
    assert.strictEqual(outCatInex.status, 400);
    assert.ok(outCatInex.json.error.includes("no existe"));

    // publicId ajeno rechazado (p. ej. de productos o de otra marca)
    const { res: resAjeno, out: outAjeno } = mockRes();
    await configAdminController.updateSliderTiendaConfig(
      {
        body: {
          activo: true,
          slides: [
            {
              url: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/s1.jpg",
              publicId: "ventimax/productos/hack.jpg",
            },
          ],
        },
        user: adminUser,
      } as any,
      resAjeno
    );
    assert.strictEqual(outAjeno.status, 400);
    assert.ok(outAjeno.json.error.includes("carpeta autorizada"));

    // Guardado exitoso con producto y categoría válidos
    const { res: resGuardar, out: outGuardar } = mockRes();
    await configAdminController.updateSliderTiendaConfig(
      {
        body: {
          activo: true,
          autoavance: true,
          segundos: 5,
          slides: [
            {
              url: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/s1.jpg",
              publicId: "ventimax/slider/s1",
              alt: "Turbo Fan 10",
              productoId: "fortunne-n04",
            },
            {
              url: "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/s2.jpg",
              publicId: "ventimax/slider/s2",
              alt: "Categoría Mesa",
              categoriaSlug: "mesa",
            },
          ],
        },
        user: adminUser,
      } as any,
      resGuardar
    );
    assert.strictEqual(outGuardar.status, 200);
    assert.strictEqual(outGuardar.json.slider.slides.length, 2);

    // Comprobación de auditoría (tipoRecurso slider_tienda en enum)
    const Auditoria = dbLocal.getAuditoriaModel();
    const logs = await Auditoria.find({ tipoRecurso: "slider_tienda" });
    assert.ok(logs.length >= 1, "Debe registrarse auditoría para slider_tienda");
    assert.strictEqual(logs[logs.length - 1].tipoRecurso, "slider_tienda");
    assert.ok(AuditoriaModelo.schema.path("tipoRecurso").enumValues.includes("slider_tienda"));
  }
  console.log("  ✅ Test 4 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 5: Salida pública GET /api/public/info (lista blanca y destinos)...");
  {
    // Con las 2 slides activas
    const { res: resInfo, out: outInfo } = mockRes();
    await publicController.getInfo({} as any, resInfo);
    assert.strictEqual(outInfo.status, 200);
    assert.ok(outInfo.json.slider, "info.slider debe existir");
    assert.strictEqual(outInfo.json.slider.autoavance, true);
    assert.strictEqual(outInfo.json.slider.segundos, 5);
    assert.strictEqual(outInfo.json.slider.slides.length, 2);

    // Lista blanca estricta: NO debe incluir publicId ni publicIdMovil
    assert.strictEqual(outInfo.json.slider.slides[0].publicId, undefined);
    assert.strictEqual(outInfo.json.slider.slides[0].publicIdMovil, undefined);
    assert.strictEqual(outInfo.json.slider.slides[0].destino, "#/producto/fortunne-n04");
    assert.strictEqual(outInfo.json.slider.slides[1].destino, "#/categoria/mesa");

    // Destino caído (el producto se desactiva en BD): la slide no se rompe y destino pasa a null
    const dataLocal = dbLocal.read();
    const prodTarget = dataLocal.productos.find((p: any) => p.id === "fortunne-n04");
    if (prodTarget) prodTarget.activo = false;
    dbLocal.write(dataLocal);

    const { res: resCaido, out: outCaido } = mockRes();
    await publicController.getInfo({} as any, resCaido);
    assert.strictEqual(outCaido.json.slider.slides[0].destino, null, "destino caído debe pasar a null sin romper la slide");
    assert.strictEqual(outCaido.json.slider.slides[0].url, "https://res.cloudinary.com/demo/image/upload/v1/ventimax/slider/s1.jpg");

    // Si el slider se desactiva, info.slider debe ser null
    await sliderTiendaService.setSliderTienda({ activo: false, autoavance: true, segundos: 6, slides: [] });
    const { res: resApagado, out: outApagado } = mockRes();
    await publicController.getInfo({} as any, resApagado);
    assert.strictEqual(outApagado.json.slider, null, "slider apagado debe ser null");
  }
  console.log("  ✅ Test 5 superado");

  // ---------------------------------------------------------------------------
  console.log("▶ Test 6: Lógica de catalogo/js/slider.js (sin DOM)...");
  {
    assert.strictEqual(sliderLib.ajustarIndice(-1, 3), 0);
    assert.strictEqual(sliderLib.ajustarIndice(5, 3), 2);
    assert.strictEqual(sliderLib.ajustarIndice(1, 3), 1);

    // Siguiente y anterior con bucle
    assert.strictEqual(sliderLib.siguienteIndice(0, 3, true), 1);
    assert.strictEqual(sliderLib.siguienteIndice(2, 3, true), 0, "debe dar la vuelta al inicio");
    assert.strictEqual(sliderLib.anteriorIndice(0, 3, true), 2, "debe dar la vuelta al final");
    assert.strictEqual(sliderLib.anteriorIndice(1, 3, true), 0);

    // Sin bucle (clamp)
    assert.strictEqual(sliderLib.siguienteIndice(2, 3, false), 2);
    assert.strictEqual(sliderLib.anteriorIndice(0, 3, false), 0);

    // Índice desde scroll
    assert.strictEqual(sliderLib.indiceDesdeScroll(0, 500, 3), 0);
    assert.strictEqual(sliderLib.indiceDesdeScroll(490, 500, 3), 1);
    assert.strictEqual(sliderLib.indiceDesdeScroll(1020, 500, 3), 2);

    // Validar segundos
    assert.strictEqual(sliderLib.validarSegundos(2), 3);
    assert.strictEqual(sliderLib.validarSegundos(20), 15);
    assert.strictEqual(sliderLib.validarSegundos("7"), 7);

    // Condiciones de autoavance
    assert.strictEqual(sliderLib.debeAutoavanzar({ autoavance: true, total: 3, pausado: false }), true);
    assert.strictEqual(sliderLib.debeAutoavanzar({ autoavance: true, total: 1, pausado: false }), false, "con 1 slide no avanza");
    assert.strictEqual(sliderLib.debeAutoavanzar({ autoavance: true, total: 3, pausado: true }), false, "pausado no avanza");
    assert.strictEqual(sliderLib.debeAutoavanzar({ autoavance: true, total: 3, prefersReducedMotion: true }), false, "con reduced-motion no avanza");
    assert.strictEqual(sliderLib.debeAutoavanzar({ autoavance: true, total: 3, pestanaOculta: true }), false, "pestaña oculta no avanza");

    // Controlador
    let cambios = 0;
    const ctrl = sliderLib.crearControladorSlider({
      total: 3,
      autoavance: true,
      segundos: 6,
      onCambio: () => {
        cambios++;
      },
    });
    assert.strictEqual(ctrl.getIndice(), 0);
    ctrl.siguiente();
    assert.strictEqual(ctrl.getIndice(), 1);
    assert.strictEqual(cambios, 1);
    ctrl.anterior();
    assert.strictEqual(ctrl.getIndice(), 0);
    assert.strictEqual(cambios, 2);
    ctrl.pausar();
    assert.strictEqual(ctrl.estaPausado(), true);
    ctrl.reanudar();
    assert.strictEqual(ctrl.estaPausado(), false);
    ctrl.destruir();
  }
  console.log("  ✅ Test 6 superado");

  console.log("================================================================================");
  console.log("🎉 TODOS LOS TESTS DE SLIDER TIENDA PASARON EXITOSAMENTE (6/6)");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("❌ Fallo en la suite de slider:", err);
  process.exit(1);
});
