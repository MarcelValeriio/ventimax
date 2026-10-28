/**
 * scripts/test-seguridad.ts — F0-8 (arranque seguro y correcciones de la auditoría)
 * Primer administrador, JWT_SECRET, sesión contra la base, verificación de webhooks y firma HMAC.
 * Uso: NODE_ENV=test npx tsx scripts/test-seguridad.ts
 */
import assert from "node:assert";
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "x".repeat(40);
process.env.VERIFY_TOKEN = "token-verificacion-prueba";
delete process.env.IG_VERIFY_TOKEN;

const jwt = require("jsonwebtoken");
const dbLocal = require("../services/dbLocal");
const { crearAdminInicial, problemaJwtSecret } = require("../services/bootstrapAdmin");
const { verificarSesion } = require("../middlewares/auth");

let ok = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
}

/** Respuesta falsa de Express que registra estado, tipo y cuerpo. */
function respuesta() {
  const r: any = { statusCode: 200, tipo: "", cuerpo: undefined };
  r.status = (c: number) => ((r.statusCode = c), r);
  r.type = (t: string) => ((r.tipo = t), r);
  r.send = (b: unknown) => ((r.cuerpo = b), r);
  r.sendStatus = (c: number) => ((r.statusCode = c), r);
  r.json = (b: unknown) => ((r.cuerpo = b), r);
  return r;
}

async function main() {
  console.log("🔐 Suite de seguridad (F0-8)");

  // ── Primer administrador ─────────────────────────────────────────
  const Usuario = dbLocal.getUsuarioModel();

  // El cifrado lo hace el hook pre-save del modelo real (comprobado en el entorno local); el mock no cifra.
  await prueba("Base vacía con credenciales válidas: crea 1 admin", async () => {
    dbLocal.write({ usuarios: [] });
    const r = await crearAdminInicial("dueno", "clave-larga-de-prueba");
    assert.strictEqual(r, "creado");
    const usuarios = dbLocal.read().usuarios;
    assert.strictEqual(usuarios.length, 1);
    assert.strictEqual(usuarios[0].role, "admin");
  });

  await prueba("Clave de menos de 12 caracteres: no crea", async () => {
    dbLocal.write({ usuarios: [] });
    assert.strictEqual(await crearAdminInicial("dueno", "corta123"), "clave_corta");
    assert.strictEqual(await Usuario.countDocuments(), 0);
  });

  await prueba("ADMIN_PASS con espacio o salto de línea en el borde: no crea; usuario sin espacios", async () => {
    dbLocal.write({ usuarios: [] });
    assert.strictEqual(await crearAdminInicial("dueno", "clave-larga-de-prueba \n"), "clave_con_espacios");
    assert.strictEqual(await Usuario.countDocuments(), 0);
    assert.strictEqual(await crearAdminInicial("  dueno ", "clave-larga-de-prueba"), "creado");
    const [creado] = await Usuario.find({});
    assert.strictEqual(creado.username, "dueno");
  });

  await prueba("Sin ADMIN_USER/ADMIN_PASS: no crea", async () => {
    dbLocal.write({ usuarios: [] });
    assert.strictEqual(await crearAdminInicial(undefined, undefined), "faltan_variables");
    assert.strictEqual(await Usuario.countDocuments(), 0);
  });

  await prueba("Con usuarios existentes: no toca nada", async () => {
    const existente = { _id: "u-1", username: "ya", nombre: "Ya", role: "cajero", activo: true, password: "h" };
    dbLocal.write({ usuarios: [existente] });
    assert.strictEqual(await crearAdminInicial("dueno", "clave-larga-de-prueba"), "ya_hay_usuarios");
    assert.deepStrictEqual(dbLocal.read().usuarios, [existente]);
  });

  await prueba("JWT_SECRET: vacío, por defecto o corto se detectan; 32+ caracteres es válido", () => {
    assert(problemaJwtSecret(""));
    assert(problemaJwtSecret("secreto_por_defecto_cambialo"));
    assert(problemaJwtSecret("corto"));
    assert.strictEqual(problemaJwtSecret("a".repeat(32)), null);
  });

  // ── Sesión ───────────────────────────────────────────────────────
  dbLocal.write({
    usuarios: [
      { _id: "s-activo", username: "a", nombre: "A", role: "cajero", activo: true },
      { _id: "s-inactivo", username: "b", nombre: "B", role: "admin", activo: false },
      { _id: "s-degradado", username: "c", nombre: "C", role: "repartidor", activo: true },
    ],
  });
  const firmar = (payload: object, opciones: object = { expiresIn: "1h" }) =>
    jwt.sign(payload, process.env.JWT_SECRET, opciones);

  await prueba("Sesión válida de un usuario activo: aceptada con sus permisos", async () => {
    const u = await verificarSesion(firmar({ id: "s-activo", role: "cajero" }));
    assert(u && u.role === "cajero" && u.permissions.length > 0);
  });

  await prueba("Token sin caducidad (sesiones viejas de 10 años): rechazado", async () => {
    assert.strictEqual(await verificarSesion(firmar({ id: "s-activo", role: "cajero" }, {})), null);
  });

  await prueba("Usuario desactivado o inexistente: rechazado", async () => {
    assert.strictEqual(await verificarSesion(firmar({ id: "s-inactivo", role: "admin" })), null);
    assert.strictEqual(await verificarSesion(firmar({ id: "no-existe", role: "admin" })), null);
  });

  await prueba("El rol sale de la base, no del token", async () => {
    const u = await verificarSesion(firmar({ id: "s-degradado", role: "admin" }));
    assert(u && u.role === "repartidor");
    assert(!u.permissions.includes("system:manage"));
  });

  await prueba("Firma con otro secreto: rechazada", async () => {
    const falso = jwt.sign({ id: "s-activo", role: "admin" }, "otro-secreto", { expiresIn: "1h" });
    assert.strictEqual(await verificarSesion(falso), null);
  });

  // ── Verificación de webhooks ─────────────────────────────────────
  const { verifyWebhook } = require("../controllers/webhookController");
  const verificar = (query: Record<string, string>) => {
    const res = respuesta();
    verifyWebhook({ query } as any, res);
    return res;
  };

  await prueba("Webhook: token correcto devuelve el challenge como texto plano", () => {
    const res = verificar({ "hub.mode": "subscribe", "hub.verify_token": "token-verificacion-prueba", "hub.challenge": "<script>x</script>" });
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.tipo, "text/plain");
  });

  await prueba("Webhook: sin token o con token incorrecto da 403", () => {
    assert.strictEqual(verificar({ "hub.mode": "subscribe", "hub.challenge": "1" }).statusCode, 403);
    assert.strictEqual(verificar({ "hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "1" }).statusCode, 403);
  });

  await prueba("Webhook de Instagram sin token configurado: 403 aunque la petición no traiga token", () => {
    const guardado = process.env.VERIFY_TOKEN;
    delete process.env.VERIFY_TOKEN;
    try {
      const { verifyWebhook: verificarIg } = require("../controllers/instagramWebhookController");
      const res = respuesta();
      verificarIg({ query: { "hub.mode": "subscribe", "hub.challenge": "1" } } as any, res);
      assert.strictEqual(res.statusCode, 403);
    } finally {
      process.env.VERIFY_TOKEN = guardado;
    }
  });

  // ── Firma HMAC de Meta ───────────────────────────────────────────
  const { validateMetaHmac } = require("../middlewares/hmacValidator");
  const cuerpo = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const firmarHmac = (secreto: string) => "sha256=" + crypto.createHmac("sha256", secreto).update(cuerpo, "utf8").digest("hex");
  const llamar = (cabecera?: string) => {
    const res = respuesta();
    let paso = false;
    validateMetaHmac(
      { headers: cabecera ? { "x-hub-signature-256": cabecera } : {}, rawBody: cuerpo, originalUrl: "/webhook" } as any,
      res,
      () => (paso = true),
    );
    return { res, paso };
  };

  const entornoOriginal = { ...process.env };
  try {
    process.env.NODE_ENV = "development"; // antes, "development" desactivaba la firma
    process.env.WHATSAPP_APP_SECRET = "secreto-whatsapp";

    await prueba("HMAC: en development también se exige la firma", () => {
      const { res, paso } = llamar();
      assert.strictEqual(paso, false);
      assert.strictEqual(res.statusCode, 403);
    });

    await prueba("HMAC: firma correcta pasa y firma incorrecta da 403", () => {
      assert.strictEqual(llamar(firmarHmac("secreto-whatsapp")).paso, true);
      assert.strictEqual(llamar(firmarHmac("otro")).res.statusCode, 403);
    });

    await prueba("HMAC: APP_SECRET solo también sirve para validar", () => {
      delete process.env.WHATSAPP_APP_SECRET;
      delete process.env.IG_APP_SECRET;
      delete process.env.FB_APP_SECRET;
      process.env.APP_SECRET = "secreto-general";
      assert.strictEqual(llamar(firmarHmac("secreto-general")).paso, true);
    });
  } finally {
    for (const k of ["NODE_ENV", "WHATSAPP_APP_SECRET", "IG_APP_SECRET", "FB_APP_SECRET", "APP_SECRET"]) {
      if (entornoOriginal[k] === undefined) delete process.env[k];
      else process.env[k] = entornoOriginal[k];
    }
  }

  console.log(`🎉 ${ok} pruebas de seguridad superadas.`);
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
