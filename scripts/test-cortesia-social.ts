/**
 * scripts/test-cortesia-social.ts — M-3
 * Bot de Instagram y Messenger más natural: cortesías, clientes fuera de la zona de entrega,
 * respuesta corta cuando no entiende, sin saludo repetido ni respuestas dobles.
 *
 * Caso principal: la conversación real que mostró el dueño (Instagram de Mr. Pachi, 2026-10-29):
 *   "Soy de San Francisco, ¿dónde entregan?" → "Estamos muy lejos" → "Gracias"
 * El bot respondía el saludo inicial completo dos veces y no ofrecía el envío nacional.
 *
 * Uso: NODE_ENV=test npx tsx scripts/test-cortesia-social.ts
 */
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";
process.env.BRAND_NAME = "ventimax";
process.env.WEBHOOK_DEBOUNCE_MS = "0";
process.env.ADMIN_PHONE_NUMBER = process.env.ADMIN_PHONE_NUMBER || "584120000000";

const dbLocal = require("../services/dbLocal");
const cortesia = require("../services/cortesiaService");
const instagramFlowService = require("../services/instagramFlowService");

let ok = 0;
async function prueba(nombre: string, fn: () => Promise<void> | void) {
  await fn();
  ok++;
  console.log(`  ✅ ${nombre}`);
}

const MensajeIg = dbLocal.getMensajeIgModel();
const EtiquetaIg = dbLocal.getEtiquetaIgModel();
const MetodoEnvio = dbLocal.getMetodoEnvioModel();

/** Manda un mensaje del cliente por el flujo real y devuelve las respuestas nuevas del bot. */
async function cliente(userId: string, texto: string, canal = "instagram"): Promise<string[]> {
  const vistos = new Set((await MensajeIg.find({ usuarioIgId: userId, direccion: "bot" })).map((m: any) => String(m._id)));
  await instagramFlowService.handleIncomingMessage(userId, "ig-cuenta", texto, `mid_${Date.now()}_${Math.random()}`, null, {}, { canal, debounceMs: 0 });
  const todos = await MensajeIg.find({ usuarioIgId: userId, direccion: "bot" });
  return todos
    .filter((m: any) => !vistos.has(String(m._id)))
    .sort((x: any, y: any) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime())
    .map((m: any) => m.texto);
}

async function nacionalActivo(activo: boolean) {
  await MetodoEnvio.deleteMany({ nombre: "Envío nacional (prueba M-3)" });
  if (activo) {
    await MetodoEnvio.create({
      nombre: "Envío nacional (prueba M-3)",
      tipo: "envio_nacional",
      costoTipo: "a_convenir",
      costo: 0,
      activo: true,
      orden: 50,
    });
  }
  // Dejar inactivos los nacionales de la semilla para controlar el caso
  const otros = await MetodoEnvio.find({ tipo: "envio_nacional" });
  for (const m of otros) {
    if (m.nombre !== "Envío nacional (prueba M-3)") {
      await MetodoEnvio.findByIdAndUpdate(m._id, { activo: false });
    }
  }
}

async function run() {
  console.log("================================================================================");
  console.log("💬 SUITE DE PRUEBAS: BOT SOCIAL MÁS NATURAL (M-3)");
  console.log("================================================================================");

  await prueba("Detección: cortesías, fuera de zona y mensajes que no lo son", () => {
    for (const t of ["Gracias", "muchas gracias!!", "ok", "Listo 👍", "chao, buenas noches", "Perfecto, gracias"]) {
      assert.strictEqual(cortesia.detectarIntencion(t), "agradecimiento", t);
    }
    for (const t of [
      "Soy de San Francisco, donde entregan?",
      "Estamos muy lejos",
      "vivo en Valencia",
      "¿envían a Maracaibo?",
      "hacen envios?",
      "envío nacional?",
    ]) {
      assert.strictEqual(cortesia.detectarIntencion(t), "fueraDeZona", t);
    }
    for (const t of ["gracias, ¿hacen delivery?", "cuanto cuesta el de 20", "me envían fotos?", "cuando llegan los nuevos", "hola"]) {
      assert.strictEqual(cortesia.detectarIntencion(t), null, t);
    }
  });

  await prueba("Frases de las dos marcas: listas con al menos una frase no vacía", () => {
    for (const marca of ["ventimax", "default"]) {
      const s = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "brand", marca, "settings.json"), "utf8"));
      for (const clave of ["socialThanks", "socialOutsideZone", "socialOutsideZoneNoShipping", "socialUnknown"]) {
        const v = s.messages?.[clave];
        assert.ok(Array.isArray(v) && v.length > 0 && v.every((f: unknown) => typeof f === "string" && f.trim()), `${marca}.${clave}`);
      }
    }
  });

  await prueba("Variantes al azar sin repetir la última usada con la misma persona", () => {
    const memoria = { variantes: { socialThanks: 0 } };
    for (let i = 0; i < 20; i++) {
      const { indice } = cortesia.elegirFrase("socialThanks", { waLink: "https://wa.me/1" }, memoria);
      assert.notStrictEqual(indice, 0);
    }
    const { texto } = cortesia.elegirFrase("socialOutsideZone", { waLink: "https://wa.me/584120000000" }, {});
    assert.ok(!texto.includes("{{waLink}}") && texto.includes("https://wa.me/"), "rellena {{waLink}}");
  });

  await prueba("La conversación de la captura, con envío nacional activo", async () => {
    await nacionalActivo(true);
    const u = `ig-captura-${Date.now()}`;
    const r1 = await cliente(u, "Hola");
    assert.strictEqual(r1.length, 1, "saludo inicial");

    const r2 = await cliente(u, "Soy de San Francisco, donde entregan?");
    assert.strictEqual(r2.length, 1);
    assert.ok(/pa[ií]s|envi/i.test(r2[0]) && r2[0].includes("https://wa.me/"), `ofrece envío nacional: ${r2[0]}`);
    assert.ok(!/Encantado de saludarte|Bienvenido/.test(r2[0]), "sin saludo a mitad de conversación");

    const r3 = await cliente(u, "Estamos muy lejos");
    const r4 = await cliente(u, "Gracias");
    const respuestas = [...r3, ...r4];
    assert.ok(respuestas.length <= 1, `como mucho una respuesta más, hubo ${respuestas.length}: ${respuestas.join(" | ")}`);
    for (const t of respuestas) assert.ok(!/Encantado de saludarte|Bienvenido/.test(t), "sin saludo repetido");
  });

  await prueba("Fuera de zona sin envío nacional: ofrece un asesor y no inventa envíos", async () => {
    await nacionalActivo(false);
    const u = `ig-sin-nacional-${Date.now()}`;
    await cliente(u, "Hola");
    const r = await cliente(u, "vivo en Mérida, ¿me lo pueden mandar?");
    assert.strictEqual(r.length, 1);
    assert.ok(/asesor/i.test(r[0]) && !/todo el pa[ií]s/i.test(r[0]), r[0]);
  });

  await prueba("Gracias con pregunta sigue a la FAQ; mensaje que no se entiende → respuesta corta", async () => {
    const u = `ig-faq-${Date.now()}`;
    await cliente(u, "Hola");
    const noEntendido = await cliente(u, "zxqw plof");
    assert.strictEqual(noEntendido.length, 1);
    assert.ok(!/Encantado de saludarte|Bienvenido/.test(noEntendido[0]), `respuesta corta: ${noEntendido[0]}`);
    assert.ok(/ayudarte/i.test(noEntendido[0]) && /asesor/i.test(noEntendido[0]), noEntendido[0]);
    assert.ok(!/no entend|no logr/i.test(noEntendido[0]), "sin frases negativas");
    assert.strictEqual(cortesia.detectarIntencion("gracias, ¿hacen delivery?"), null, "no se trata como despedida");
  });

  await prueba("Nunca dos respuestas iguales seguidas", async () => {
    const u = `ig-repetido-${Date.now()}`;
    await cliente(u, "Hola");
    const a = await cliente(u, "qwerty asdf");
    const b = await cliente(u, "qwerty asdf");
    const c = await cliente(u, "qwerty asdf");
    const todas = [...a, ...b, ...c];
    for (let i = 1; i < todas.length; i++) assert.notStrictEqual(todas[i], todas[i - 1], "respuesta repetida seguida");
  });

  await prueba("Messenger usa la misma lógica", async () => {
    await nacionalActivo(true);
    const u = `fb-${Date.now()}`;
    await cliente(u, "Hola", "messenger");
    const r = await cliente(u, "somos de Barquisimeto", "messenger");
    assert.strictEqual(r.length, 1);
    assert.ok(/pa[ií]s|venezuela/i.test(r[0]), r[0]);
  });

  await prueba("WhatsApp no usa el módulo social", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "services", "chatFlowService.ts"), "utf8");
    assert.ok(!src.includes("cortesiaService"), "chatFlowService no debe usar cortesiaService");
  });

  await nacionalActivo(false);
  console.log("================================================================================");
  console.log(`🎉 ${ok} pruebas del bot social superadas.`);
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("❌ Falló la suite test-cortesia-social.ts:", err);
  process.exit(1);
});
