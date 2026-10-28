/**
 * services/inboxService.ts
 * INBOX UNIFICADO — capa de servicio (Fase 2A).
 *
 * Implementa el contrato de docs/inbox-unificado-contrato.md:
 *   §6.1 lista de conversaciones con filtros de servidor
 *   §6.2 objeto `ConversacionUnificada` (normalización en ./inbox/normalizar)
 *   §6.3 acciones unificadas + regla de error 400/404/409/501/502
 *   §6.4 evento Socket.IO `inbox_actualizado` (único punto de emisión)
 *   §6.5 adaptadores por canal (whatsapp | instagram | messenger)
 *
 * Regla de oro: este servicio NO altera el comportamiento de los endpoints
 * legacy. Los adaptadores reutilizan los handlers existentes para que las
 * consolas de WhatsApp e Instagram sigan viendo lo mismo.
 */

import type {
  CanalInbox,
  CanalFiltro,
  CapacidadCanal,
  ConversacionUnificada,
  OpcionesListaInbox,
  RespuestaListaInbox,
} from "../types/inbox";

const whatsappAdapter = require("./inbox/adapters/whatsappAdapter");
const instagramAdapterModule = require("./inbox/adapters/instagramAdapter");
const messengerAdapter = require("./inbox/adapters/messengerAdapter");
const {
  CANALES,
  construirPayloadInbox,
} = require("./inbox/normalizar");

const ADAPTADORES: Record<CanalInbox, any> = {
  whatsapp: whatsappAdapter,
  instagram: instagramAdapterModule.instagramAdapter,
  messenger: messengerAdapter,
};

const LIMITE_DEFAULT = 100;
const LIMITE_MAXIMO = 300;

/** Error con código HTTP explícito (la regla de error la aplica el controlador). */
function errorInbox(
  statusCode: number,
  message: string,
  extra: Record<string, any> = {},
): any {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  err.esErrorInbox = true;
  Object.assign(err, extra);
  return err;
}

/** Valida el enum de canal. Devuelve el canal normalizado o lanza 400. */
function normalizarCanal(canal: any, porDefecto: CanalInbox | null = null): CanalInbox {
  if (canal === undefined || canal === null || canal === "") {
    if (porDefecto) return porDefecto;
    throw errorInbox(400, "Falta el parámetro requerido: canal");
  }
  const valor = String(canal);
  if (!CANALES.includes(valor)) {
    throw errorInbox(
      400,
      `Canal inválido: "${valor}". Valores permitidos: ${CANALES.join(", ")}`,
    );
  }
  return valor as CanalInbox;
}

/** Valida el filtro `?canal=` de la lista (`todos` | whatsapp | instagram | messenger). */
function normalizarCanalFiltro(canal: any): CanalFiltro {
  if (canal === undefined || canal === null || canal === "" || canal === "todos") {
    return "todos";
  }
  const valor = String(canal);
  if (!CANALES.includes(valor)) {
    throw errorInbox(
      400,
      `Canal inválido: "${valor}". Valores permitidos: todos, ${CANALES.join(", ")}`,
    );
  }
  return valor as CanalFiltro;
}

function exigirUsuarioId(usuarioId: any): string {
  if (usuarioId === undefined || usuarioId === null || String(usuarioId).trim() === "") {
    throw errorInbox(400, "Falta el parámetro requerido: usuarioId");
  }
  return String(usuarioId);
}

function exigirModo(modo: any): "manual" | "automatico" {
  if (!["manual", "automatico"].includes(modo)) {
    throw errorInbox(400, "Modo inválido. Debe ser 'manual' o 'automatico'");
  }
  return modo;
}

function normalizarLimite(limite: any, defecto = LIMITE_DEFAULT): number {
  const num = parseInt(String(limite), 10);
  if (!Number.isFinite(num) || num <= 0) return defecto;
  return Math.min(num, LIMITE_MAXIMO);
}

/** Adaptador del canal (lanza 400 si el canal no existe). */
function getAdaptador(canal: any): any {
  const canalValido = normalizarCanal(canal);
  return ADAPTADORES[canalValido];
}

/** `true` si la conversación existe en ese canal (mensajes o etiqueta). */
async function existeConversacion(canal: any, usuarioId: any): Promise<boolean> {
  const adaptador = getAdaptador(canal);
  return adaptador.existe(exigirUsuarioId(usuarioId));
}

/** Lanza 404 si la conversación no existe en el canal. */
async function exigirConversacion(canal: CanalInbox, usuarioId: string): Promise<void> {
  const existe = await ADAPTADORES[canal].existe(usuarioId);
  if (!existe) {
    throw errorInbox(
      404,
      `No existe la conversación "${canal}:${usuarioId}"`,
      { canal, usuarioId },
    );
  }
}

/** 409: acción exclusiva de otro canal (p. ej. confirmar pago en Instagram). */
function exigirCanalWhatsApp(canal: any): void {
  const canalValido = normalizarCanal(canal);
  if (canalValido !== "whatsapp") {
    throw errorInbox(
      409,
      `Esta acción solo está disponible para WhatsApp (se recibió "${canalValido}")`,
      { canal: canalValido },
    );
  }
}

function exigirCanalInstagram(canal: any): void {
  const canalValido = normalizarCanal(canal);
  if (canalValido !== "instagram") {
    throw errorInbox(
      409,
      `Esta acción solo está disponible para Instagram (se recibió "${canalValido}")`,
      { canal: canalValido },
    );
  }
}

/**
 * Emite el evento de invalidación unificado (§6.4).
 * Los eventos legacy del canal se siguen emitiendo desde los adaptadores/flujos.
 */
function emitirInboxActualizado(
  io: any,
  canal: CanalInbox,
  usuarioId: any,
  tipo: string,
): void {
  if (!io || typeof io.emit !== "function") return;
  try {
    io.emit("inbox_actualizado", construirPayloadInbox(canal, usuarioId, tipo));
  } catch (err: any) {
    console.error("⚠️ [Inbox] Error emitiendo inbox_actualizado:", err.message);
  }
}

/** Capacidades por canal — la UI oculta bloques sin hardcodear el canal (§6.5). */
function capacidadesPorCanal(): Record<CanalInbox, CapacidadCanal[]> {
  const salida: any = {};
  for (const canal of CANALES) {
    salida[canal] = Array.from(ADAPTADORES[canal].capacidades || []);
  }
  return salida;
}

/** Filtros de servidor (§6.1) aplicados en memoria sobre la lista del canal. */
function pasaFiltros(conv: ConversacionUnificada, opts: OpcionesListaInbox): boolean {
  if (opts.noLeidos === true && !(conv.noLeidos > 0)) return false;
  if (opts.modo && conv.modo !== opts.modo) return false;
  if (opts.atencion === true && conv.requiereAtencion !== true) return false;
  if (opts.conPedido === true && !(conv.pedido && conv.pedido.tienePedido === true)) {
    return false;
  }
  if (opts.buscar) {
    const aguja = String(opts.buscar).trim().toLowerCase();
    if (aguja) {
      // LOTE B7a · WA-48: variantes de teléfono (58, 0 inicial, cédula).
      // El legacy las resolvía en el CLIENTE (WhatsAppSidebar.js:39-49,101-149,
      // función `getPhoneVariants`); el contrato §2.1 delega la búsqueda al
      // servidor (`?buscar=`), así que la fidelidad de la búsqueda venezolana se
      // replica aquí. Es ADITIVO: solo amplía coincidencias, nunca las reduce.
      const digitos = (valor: any) => String(valor || "").replace(/\D/g, "");
      const variantesTelefono = (valor: any) => {
        const limpio = digitos(valor);
        const sin58 = limpio.startsWith("58") && limpio.length >= 11 ? limpio.slice(2) : limpio;
        const sin0 = sin58.replace(/^0+/, "");
        const con0 = sin58.length === 10 ? `0${sin58}` : sin58;
        return { limpio, sin58, sin0, con0 };
      };

      const tel = variantesTelefono(conv.usuarioId);
      const cedulaRaw = String(conv.cedula || "").toLowerCase();
      const cedulaDigitos = digitos(conv.cedula);
      const cedulaAlfanumerica = cedulaRaw.replace(/[^a-z0-9]/g, "");

      const agujaDigitos = digitos(aguja);
      const agujaSin58 =
        agujaDigitos.startsWith("58") && agujaDigitos.length >= 11
          ? agujaDigitos.slice(2)
          : agujaDigitos;
      const agujaSin58y0 = agujaSin58.replace(/^0+/, "");
      const agujaAlfanumerica = aguja.replace(/[^a-z0-9]/g, "");

      const coincideTelefono =
        String(conv.usuarioId || "").toLowerCase().includes(aguja) ||
        (Boolean(agujaDigitos) &&
          (tel.limpio.includes(agujaDigitos) ||
            tel.sin58.includes(agujaDigitos) ||
            tel.sin58.includes(agujaSin58) ||
            tel.sin58.includes(agujaSin58y0) ||
            tel.con0.includes(agujaDigitos)));
      // WA-48: la cédula también es criterio de búsqueda en el legacy.
      const coincideCedula = Boolean(
        conv.cedula &&
          ((cedulaDigitos && agujaDigitos && cedulaDigitos.includes(agujaDigitos)) ||
            (cedulaRaw && cedulaRaw.includes(aguja)) ||
            (agujaAlfanumerica && cedulaAlfanumerica.includes(agujaAlfanumerica))),
      );

      const campos = [
        conv.nombreVisible,
        conv.usuarioId,
        conv.username || "",
        conv.ultimoMensaje?.texto || "",
      ];
      const coincideTexto = campos.some((campo) =>
        String(campo || "").toLowerCase().includes(aguja),
      );
      if (!coincideTelefono && !coincideCedula && !coincideTexto) return false;
    }
  }
  return true;
}

/**
 * Lista de conversaciones de los canales seleccionados.
 * Orden garantizado por el servidor: `ultimoMensaje.timestamp` DESC.
 */
async function listarConversaciones(
  opts: OpcionesListaInbox = {},
): Promise<RespuestaListaInbox> {
  const canal = normalizarCanalFiltro(opts.canal);
  const limite = normalizarLimite(opts.limite);
  // §6.1 + §8.5: `totales`/`totalesNoLeidos` alimentan los badges de TODOS los
  // chips de canal, así que se consultan los 3 canales siempre; el filtro
  // `?canal=` se aplica a `data` (lista) y se ecoa en la respuesta.
  const canalesConsulta: CanalInbox[] = [...CANALES];
  const canalesSalida: CanalInbox[] = canal === "todos" ? canalesConsulta : [canal];

  const porCanal: Record<string, ConversacionUnificada[]> = {};
  for (const c of canalesConsulta) {
    try {
      porCanal[c] = await ADAPTADORES[c].listarConversaciones({ ...opts, limite });
    } catch (err: any) {
      err.canal = err.canal || c;
      throw err;
    }
  }

  const totales: any = { todos: 0, whatsapp: 0, instagram: 0, messenger: 0 };
  const totalesNoLeidos: any = { todos: 0, whatsapp: 0, instagram: 0, messenger: 0 };
  for (const c of canalesConsulta) {
    // Los totales reflejan el canal completo (badges de la UI), sin los filtros
    // booleanos del operador. `totalesNoLeidos` cuenta CONVERSACIONES con no
    // leídos (mismo universo que `totales`).
    const lista = porCanal[c] || [];
    totales[c] = lista.length;
    totalesNoLeidos[c] = lista.filter((conv) => conv.noLeidos > 0).length;
    totales.todos += totales[c];
    totalesNoLeidos.todos += totalesNoLeidos[c];
  }

  let data: ConversacionUnificada[] = [];
  for (const c of canalesSalida) {
    data = data.concat((porCanal[c] || []).filter((conv) => pasaFiltros(conv, opts)));
  }
  data.sort(
    (a, b) => (b.ultimoMensaje?.timestamp || 0) - (a.ultimoMensaje?.timestamp || 0),
  );

  return {
    success: true,
    generadoEn: Date.now(),
    canal,
    totales,
    totalesNoLeidos,
    capacidades: capacidadesPorCanal(),
    data,
  };
}

/** Hilo de una conversación — GET sin efectos secundarios (§6.3). */
async function leerHilo(input: {
  canal: any;
  usuarioId: any;
  page?: any;
  limite?: any;
}): Promise<{ success: true; data: any[]; pagination: any }> {
  const canal = normalizarCanal(input.canal);
  const usuarioId = exigirUsuarioId(input.usuarioId);
  await exigirConversacion(canal, usuarioId);

  const { data, pagination } = await ADAPTADORES[canal].leerHilo(
    usuarioId,
    input.page,
    input.limite,
  );
  return { success: true, data, pagination };
}

/**
 * Envía un mensaje de texto por el canal correspondiente.
 *
 * LOTE B3 (WA-33/WA-34):
 *   · `replyToMid`/`replyToText` → cita (contrato §6.3). Ya existía.
 *   · `retryMsgId`/`retryWamid` → REINTENTO con reconciliación in-place. Solo
 *     WhatsApp: es el único canal con estados de entrega + `wamid`; en
 *     Instagram/Messenger la acción no está soportada → `409` (§6.3, mismo
 *     criterio que "confirmar pago en Instagram").
 */
async function enviarMensaje(input: {
  canal: any;
  usuarioId: any;
  texto: any;
  replyToMid?: any;
  replyToText?: any;
  retryMsgId?: any;
  retryWamid?: any;
  io?: any;
}): Promise<any> {
  const canal = normalizarCanal(input.canal);
  const usuarioId = exigirUsuarioId(input.usuarioId);

  const texto = typeof input.texto === "string" ? input.texto.trim() : "";
  if (!texto) {
    throw errorInbox(400, "Falta el parámetro requerido: texto");
  }
  await exigirConversacion(canal, usuarioId);

  // Un id temporal del panel (`temp-…`) no es reconciliable: se ignora y el
  // mensaje se crea de nuevo (retrocompatible).
  const retryMsgId =
    input.retryMsgId && !String(input.retryMsgId).startsWith("temp-")
      ? String(input.retryMsgId)
      : null;

  if (retryMsgId && canal !== "whatsapp") {
    throw errorInbox(
      409,
      `El reintento con reconciliación solo está disponible para WhatsApp (se recibió "${canal}")`,
      { canal },
    );
  }

  const mensaje = await ADAPTADORES[canal].enviarTexto(usuarioId, texto, {
    replyToMid: input.replyToMid || null,
    replyToText: input.replyToText || null,
    retryMsgId,
    retryWamid: input.retryWamid || null,
    io: input.io,
  });

  // El reintento NO es un mensaje nuevo: se invalida como cambio de estado
  // (§6.4 `tipo: "estado"`), no como `mensaje_nuevo`.
  emitirInboxActualizado(
    input.io,
    canal,
    usuarioId,
    retryMsgId ? "estado" : "mensaje_nuevo",
  );
  return { success: true, data: mensaje };
}

/** Envía un adjunto (multipart). WhatsApp: imagen/doc/audio · IG: solo imagen. */
async function enviarAdjunto(input: {
  canal: any;
  usuarioId: any;
  file: any;
  caption?: any;
  replyToMid?: any;
  replyToText?: any;
  io?: any;
}): Promise<any> {
  const canal = normalizarCanal(input.canal);
  const usuarioId = exigirUsuarioId(input.usuarioId);

  if (!input.file) {
    throw errorInbox(400, "No se proporcionó ningún archivo");
  }
  await exigirConversacion(canal, usuarioId);

  const mensaje = await ADAPTADORES[canal].enviarAdjunto(usuarioId, input.file, {
    caption: input.caption || null,
    replyToMid: input.replyToMid || null,
    replyToText: input.replyToText || null,
    io: input.io,
  });

  emitirInboxActualizado(input.io, canal, usuarioId, "mensaje_nuevo");
  return { success: true, data: mensaje };
}

/** Cambia el modo del bot para una conversación (manual | automatico). */
async function cambiarModo(input: {
  canal: any;
  usuarioId: any;
  modo: any;
  io?: any;
}): Promise<any> {
  const canal = normalizarCanal(input.canal);
  const usuarioId = exigirUsuarioId(input.usuarioId);
  const modo = exigirModo(input.modo);
  await exigirConversacion(canal, usuarioId);

  await ADAPTADORES[canal].setModo(usuarioId, modo, { io: input.io });

  emitirInboxActualizado(input.io, canal, usuarioId, "modo");
  return { success: true, data: { clave: `${canal}:${usuarioId}`, canal, usuarioId, modo } };
}

/**
 * Marca leído (idempotente, §6.3). Esta es la operación que asume el reseteo de
 * `unreadCount` que antes hacía implícitamente `GET /api/admin/ig/historial?usuario=`.
 */
async function marcarLeido(input: {
  canal: any;
  usuarioId: any;
  io?: any;
}): Promise<any> {
  const canal = normalizarCanal(input.canal);
  const usuarioId = exigirUsuarioId(input.usuarioId);
  await exigirConversacion(canal, usuarioId);

  const marcados = await ADAPTADORES[canal].marcarLeido(usuarioId);

  emitirInboxActualizado(input.io, canal, usuarioId, "leido");
  return {
    success: true,
    data: {
      clave: `${canal}:${usuarioId}`,
      canal,
      usuarioId,
      marcados: Number(marcados) || 0,
      noLeidos: 0,
    },
  };
}

/** Contexto/CRM de la conversación (§6.3). */
async function obtenerContexto(input: {
  canal: any;
  usuarioId: any;
}): Promise<any> {
  const canal = normalizarCanal(input.canal);
  const usuarioId = exigirUsuarioId(input.usuarioId);
  await exigirConversacion(canal, usuarioId);

  const contexto = await ADAPTADORES[canal].contexto(usuarioId);
  return { success: true, data: { canal, usuarioId, ...(contexto || {}) } };
}

/** Reset del bot: exclusivo de WhatsApp. En los demás canales → 501 (§6.3). */
async function resetearBot(input: {
  canal: any;
  usuarioId: any;
  io?: any;
}): Promise<any> {
  const canal = normalizarCanal(input.canal);
  const usuarioId = exigirUsuarioId(input.usuarioId);

  if (canal !== "whatsapp") {
    throw errorInbox(
      501,
      `El reset del bot no está implementado para el canal "${canal}"`,
      { canal },
    );
  }
  await exigirConversacion(canal, usuarioId);
  await ADAPTADORES[canal].resetear(usuarioId, { io: input.io });

  emitirInboxActualizado(input.io, canal, usuarioId, "estado");
  return { success: true, data: { clave: `${canal}:${usuarioId}`, canal, usuarioId, paso: "inicio" } };
}

/** Bot global del canal (solo Instagram) — estado de canal, no de chat (§6.3). */
async function obtenerBotToggle(canal: any): Promise<any> {
  exigirCanalInstagram(canal);
  const enabled = await ADAPTADORES.instagram.getBotToggle();
  return { success: true, data: { canal: "instagram", enabled } };
}

async function cambiarBotToggle(input: { canal: any; enabled: any; io?: any }): Promise<any> {
  exigirCanalInstagram(input.canal);
  if (typeof input.enabled !== "boolean") {
    throw errorInbox(400, "El campo 'enabled' debe ser booleano");
  }
  const enabled = await ADAPTADORES.instagram.setBotToggle(input.enabled);
  if (input.io && typeof input.io.emit === "function") {
    input.io.emit("ig_bot_toggle", { enabled });
  }
  return { success: true, data: { canal: "instagram", enabled } };
}

/**
 * ── LOTE B6 · PERFIL DE WHATSAPP BUSINESS (WA-45 / WA-39) ───────────────────
 * Estado de CANAL (no de chat): envuelve `services/whatsapp` sobre los MISMOS
 * handlers de Meta que ya usan los endpoints legacy `/api/admin/whatsapp/profile`
 * y `/whatsapp/profile-picture` (controllers/adminController.ts:986-1048).
 *
 * Retrocompatibilidad: los endpoints legacy NO se tocan ni se re-enrutan; estas
 * funciones solo añaden una ruta unificada bajo `/api/admin/inbox` para que el
 * inbox no dependa de rutas de la consola legacy. El payload saliente hacia Meta
 * se normaliza igual que en el legacy (mismo saneado de campos), de modo que
 * ambos caminos producen exactamente la misma llamada.
 *
 * `canal` es opcional aquí (por defecto `whatsapp`) porque la ruta ya fija el
 * canal; si llega otro canal explícito → 409 (regla de error §6.3).
 */
function canalFijoWhatsApp(canal: any): void {
  const valor = canal === undefined || canal === null || canal === "" ? "whatsapp" : canal;
  exigirCanalWhatsApp(valor);
}

/** GET → perfil público actual (about/descripción/vertical/dirección/email/web/foto). */
async function obtenerPerfilWhatsApp(canal: any): Promise<any> {
  canalFijoWhatsApp(canal);
  const { getWhatsAppBusinessProfile } = require("./whatsapp");
  const perfil = await getWhatsAppBusinessProfile();
  return { success: true, data: { canal: "whatsapp", perfil: perfil || {} } };
}

/** POST → actualiza los campos de TEXTO del perfil. Body plano (sin `canal`). */
async function actualizarPerfilWhatsApp(input: { canal: any; datos?: any }): Promise<any> {
  canalFijoWhatsApp(input.canal);
  const datos: any = input.datos && typeof input.datos === "object" ? input.datos : {};

  // Mismo saneado que el handler legacy (adminController.ts:1000-1022).
  const profileData: any = {};
  if (typeof datos.about === "string") profileData.about = datos.about.trim();
  if (typeof datos.address === "string") profileData.address = datos.address.trim();
  if (typeof datos.description === "string") profileData.description = datos.description.trim();
  if (typeof datos.email === "string") profileData.email = datos.email.trim();
  if (Array.isArray(datos.websites)) {
    profileData.websites = datos.websites
      .map((w: any) => (w || "").toString().trim())
      .filter(Boolean);
  }
  if (typeof datos.vertical === "string" && datos.vertical.trim()) {
    profileData.vertical = datos.vertical.trim();
  }

  if (Object.keys(profileData).length === 0) {
    throw errorInbox(
      400,
      "Nada que actualizar: envía al menos uno de about, address, description, email, websites o vertical",
    );
  }

  const { updateWhatsAppBusinessProfile } = require("./whatsapp");
  const resultado = await updateWhatsAppBusinessProfile(profileData);
  return { success: true, data: { canal: "whatsapp", perfil: profileData, resultado } };
}

/** POST multipart → sube la foto de perfil (Resumable Upload de Meta). */
async function actualizarFotoPerfilWhatsApp(input: { canal: any; file?: any }): Promise<any> {
  canalFijoWhatsApp(input.canal);
  const file = input.file;
  if (!file || !file.buffer) {
    throw errorInbox(400, "No se proporcionó ningún archivo de imagen para la foto de perfil");
  }
  const { updateWhatsAppBusinessProfilePicture } = require("./whatsapp");
  const resultado = await updateWhatsAppBusinessProfilePicture(
    file.buffer,
    file.mimetype || "image/jpeg",
  );
  return {
    success: true,
    data: {
      canal: "whatsapp",
      profile_picture_url: (resultado && resultado.profile_picture_url) || null,
      resultado,
    },
  };
}

/**
 * ── LOTE B7a · COPILOTO DE VENTA MANUAL (WA-131..139) ─────────────────────────
 * Endpoints unificados bajo `/api/admin/inbox/**` que envuelven los MISMOS
 * handlers legacy que ya consume la consola de WhatsApp (que queda intacta):
 *
 *   · Catálogo     GET  /api/admin/inbox/products                → adminController.getProducts
 *   · Pagos        GET  /api/admin/inbox/payments                → paymentController.getPayments
 *   · Extracción   POST /api/admin/inbox/whatsapp/copiloto/extraer
 *                                                               → adminController.extractOrderFromChat
 *   · Venta        POST /api/admin/inbox/whatsapp/venta-manual   → adminController.postManualSale
 *
 * El catálogo y los métodos de pago NO son estado de chat, pero se sirven bajo
 * `/inbox` para que el modal del inbox no dependa de rutas de la consola legacy.
 * La extracción con IA y la venta manual SÍ son exclusivas de WhatsApp (es el
 * único canal con pedidos/CRM §6.2): en Instagram/Messenger → 409.
 *
 * Retrocompatibilidad: los endpoints legacy `/chat/extract-order` y
 * `/manual-sale` siguen intactos y con su shape original; estas funciones solo
 * añaden el camino unificado.
 */

/**
 * Invoca un handler legacy que lee `req.body` (y opcionalmente `req.file`) y
 * responde con `res.json` o `res.status(código).json`.
 *
 * A diferencia de `invocarHandlerLegacy` (solo query y `status` siempre = error),
 * aquí `status(2xx)` resuelve y `status(4xx/5xx)` rechaza con ese código, que es
 * lo que hacen `extractOrderFromChat` (400/404/500) y `postManualSale` (201/400/500).
 */
function invocarHandlerLegacyConBody(
  handler: any,
  body: any,
  file: any = undefined,
  io: any = null,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = { body, file, query: {} };
    const res = {
      json: (payload: any) => resolve(payload),
      status: (code: number) => ({
        json: (payload: any) => {
          if (Number(code) >= 400) {
            const err: any = new Error(
              (payload && payload.error) || "Error del handler legacy",
            );
            err.statusCode = code;
            reject(err);
          } else {
            resolve(payload);
          }
        },
      }),
    };
    Promise.resolve(handler(req, res, io)).catch(reject);
  });
}

/** GET → catálogo de productos activos (mismo shape `{success,data}`). */
async function listarCatalogoInbox(): Promise<any> {
  const adminController = require("../controllers/adminController"); // lazy: evita ciclos
  const respuesta = await invocarHandlerLegacyConBody(adminController.getProducts, {}, undefined);
  return {
    success: true,
    data: (respuesta && respuesta.data) || [],
  };
}

/** GET → métodos de pago (mismo shape `{success,data}`). */
async function listarMetodosPagoInbox(): Promise<any> {
  const paymentController = require("../controllers/paymentController"); // lazy: evita ciclos
  const respuesta = await invocarHandlerLegacyConBody(paymentController.getPayments, {}, undefined);
  return {
    success: true,
    data: (respuesta && respuesta.data) || [],
  };
}

async function listarMetodosEnvioInbox(): Promise<any> {
  let MetodoEnvio = require("../models/MetodoEnvio");
  if (process.env.NODE_ENV === "test") {
    const dbLocal = require("./dbLocal");
    MetodoEnvio = dbLocal.getMetodoEnvioModel();
  }
  const methods = await MetodoEnvio.find({ activo: true }).sort({ orden: 1, createdAt: 1 });
  return {
    success: true,
    data: (methods && Array.isArray(methods)) ? methods : [],
  };
}

/**
 * WA-132 — extracción con IA del chat (`POST /chat/extract-order`).
 * El handler legacy opera por `telefono`; aquí el parámetro canónico es
 * `usuarioId` (§6.3) y se mapea al mismo campo. El 404 del legacy ("No hay
 * historial para extraer") se propaga tal cual: es un chat sin historial, no un
 * error real (el modal lo trata como «llenado manual»).
 */
async function extraerOrdenDesdeChat(input: { usuarioId: any; canal?: any }): Promise<any> {
  exigirCanalWhatsApp(input.canal === undefined ? "whatsapp" : input.canal);
  const usuarioId = exigirUsuarioId(input.usuarioId);
  const adminController = require("../controllers/adminController"); // lazy
  const respuesta = await invocarHandlerLegacyConBody(
    adminController.extractOrderFromChat,
    { telefono: usuarioId },
    undefined,
  );
  return { success: true, data: (respuesta && respuesta.data) || {}, usuarioId };
}

/**
 * WA-139 — guardar la venta manual (`POST /manual-sale`, multipart
 * `data` + `comprobante`).
 *
 * `usuarioId` (opcional pero recomendado) Fuerza el anclaje de la venta a la
 * conversación abierta en el inbox: sobreescribe `whatsappId`/`telefono` del
 * payload `data` antes de delegar, de modo que el pedido creado se asocie
 * siempre al chat desde el que se abrió el copiloto (y no a un valor del
 * cliente). El comprobante subido viaja como `req.file` y el handler legacy lo
 * sube a Cloudinary de forma no bloqueante.
 */
async function crearVentaManual(input: {
  usuarioId?: any;
  datos: any;
  file?: any;
  io?: any;
}): Promise<any> {
  const adminController = require("../controllers/adminController"); // lazy

  let datos = input.datos;
  if (typeof datos === "string") {
    try {
      datos = JSON.parse(datos);
    } catch (err: any) {
      throw errorInbox(400, "El campo 'data' debe ser un JSON válido");
    }
  }
  if (!datos || typeof datos !== "object") {
    throw errorInbox(400, "Falta el campo 'data' con los datos de la venta");
  }

  const usuarioId =
    input.usuarioId === undefined || input.usuarioId === null || input.usuarioId === ""
      ? null
      : String(input.usuarioId);
  if (usuarioId) {
    datos.whatsappId = usuarioId;
    datos.telefono = usuarioId;
    datos.cliente = Object.assign({}, datos.cliente || {}, { telefono: usuarioId });
  }

  const respuesta = await invocarHandlerLegacyConBody(
    adminController.postManualSale,
    { data: JSON.stringify(datos) },
    input.file,
    input.io || null,
  );
  const pedido = (respuesta && respuesta.data) || null;
  return {
    success: true,
    data: pedido,
    usuarioId,
    canal: "whatsapp",
  };
}
/** Bloquear/Desbloquear usuario. */
async function bloquearUsuario(input: {
  canal: any;
  usuarioId: any;
  bloqueado: boolean;
  io?: any;
}): Promise<boolean> {
  const canal = normalizarCanal(input.canal);
  const usuarioId = exigirUsuarioId(input.usuarioId);

  if (canal === "whatsapp") {
    let Etiqueta = require("../models/Etiqueta");
    if (process.env.NODE_ENV === "test") {
      Etiqueta = require("./dbLocal").getEtiquetaModel();
    }
    await Etiqueta.updateOne({ telefono: usuarioId }, { $set: { bloqueado: input.bloqueado } });
  } else if (canal === "instagram") {
    let EtiquetaIg = require("../models/EtiquetaIg");
    if (process.env.NODE_ENV === "test") {
      EtiquetaIg = require("./dbLocal").getEtiquetaIgModel();
    }
    await EtiquetaIg.updateOne({ usuarioIgId: usuarioId }, { $set: { bloqueado: input.bloqueado } });
  } else {
    return false;
  }

  if (input.io) {
    emitirInboxActualizado(input.io, canal as any, usuarioId, "bloqueo");
  }
  return true;
}

module.exports = {
  CANALES,
  ADAPTADORES,
  errorInbox,
  normalizarCanal,
  normalizarCanalFiltro,
  normalizarLimite,
  getAdaptador,
  existeConversacion,
  exigirConversacion,
  exigirCanalWhatsApp,
  exigirCanalInstagram,
  emitirInboxActualizado,
  capacidadesPorCanal,
  listarConversaciones,
  leerHilo,
  enviarMensaje,
  enviarAdjunto,
  cambiarModo,
  marcarLeido,
  obtenerContexto,
  resetearBot,
  obtenerBotToggle,
  bloquearUsuario,
  cambiarBotToggle,
  obtenerPerfilWhatsApp,
  actualizarPerfilWhatsApp,
  actualizarFotoPerfilWhatsApp,
  listarCatalogoInbox,
  listarMetodosPagoInbox,
  listarMetodosEnvioInbox,
  extraerOrdenDesdeChat,
  crearVentaManual,
};
