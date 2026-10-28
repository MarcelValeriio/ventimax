// public/src/features/inbox/components/InboxQuickReplyBar.js
// LOTE B2 — Respuestas Rápidas en el inbox unificado (paridad §1.G: WA-107..WA-117 + IG-49).
//
// Estrategia de paridad: NO se duplica el bottom sheet. Se IMPORTA tal cual el
// componente legacy `features/whatsapp/components/QuickReplyBottomSheet.js` (es
// 100% dirigido por props: isOpen/onClose/replies/onSelectReply) y
// `features/whatsapp/components/parseTemplate.js`. Así la paridad es automática:
// buscador (WA-112), chips de categorías + Favoritas (WA-113), orden
// favoritas-primero + orden manual (WA-114), badge Completar/Envío directo
// (WA-115), Escape + backdrop + botón cerrar + foco + bloqueo de scroll (WA-116)
// y estado vacío + Restablecer filtros (WA-117) son exactamente los de la consola
// de WhatsApp. Las consolas legacy NO se tocan (solo se leen/importan).
//
// Diferencias deliberadas frente a `QuickReplyBar.js` de la consola legacy:
//   · No usa `socket.emit("enviar_desde_panel")` ni `enviarTextoIg`: todo sale por
//     `POST /api/admin/inbox/mensaje` a través de la prop `onSend` del hilo (§6.3).
//   · El contexto de tokens (WA-110) se pide al endpoint unificado
//     `GET /api/admin/inbox/contexto?canal=&usuarioId=` (no a `/chat-context`).
//   · El catálogo de quick replies es POR MARCA, no por canal (models/QuickReply.ts),
//     así que el mismo componente sirve para WhatsApp, Instagram y Messenger (IG-49).
//
// Decisión sobre tokens sin datos (WA-110/WA-115):
//   Instagram y Messenger no tienen carrito, y WhatsApp puede no tenerlo. Si la
//   conversación NO aporta datos para `{items}/{totalUSD}/{totalBS}/{total}`, la
//   plantilla se carga en el input CON LOS TOKENS VISIBLES para que el agente la
//   complete (badge "Completar"); NUNCA se envían llaves crudas al cliente.
//   Solo cuando hay datos reales se sustituyen los tokens antes de cargar el input.
import React, { useState, useEffect, useCallback } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js?v=6";
import parseTemplate from "../../whatsapp/components/parseTemplate.js?v=5";
import QuickReplyBottomSheet from "../../whatsapp/components/QuickReplyBottomSheet.js?v=3";
import InboxQuickCalculator from "./InboxQuickCalculator.js?v=1";

const e = React.createElement;

const API_QUICK_REPLIES = "/api/admin/quick-replies";
const API_INBOX = "/api/admin/inbox";

// Mismos tokens que QuickReplyBar.js:54 / QuickReplyBottomSheet.js:329 / parseTemplate.js:39
const TOKEN_RE = /\{(nombre|totalUSD|totalBS|total|items|menu)\}/;

/** ¿La plantilla necesita datos de la conversación? (WA-110) */
export const tieneTokens = (texto) => TOKEN_RE.test(texto || "");

/**
 * ¿Hay datos reales para sustituir los tokens? (WA-110)
 * El único canal con carrito vivo es WhatsApp: ahí `items`/`totalUSD`/`totalBS`
 * llegan del contexto; en Instagram y Messenger siempre faltan.
 */
export const hayDatosDeCarrito = (ctx) =>
  Boolean(ctx) &&
  ((Array.isArray(ctx.items) && ctx.items.length > 0) ||
    ctx.totalUSD != null ||
    ctx.totalBS != null);

/**
 * Traduce la respuesta de `GET /api/admin/inbox/contexto` al `chatContext` que
 * espera `parseTemplate` (customerName, items, totalUSD, totalBS).
 */
export const construirContexto = (conversacion, data) => {
  const d = data || {};
  const perfil = d.perfil || {};
  const nombre = (
    d.customerName ||
    (conversacion && conversacion.nombreVisible) ||
    perfil.nombre ||
    perfil.username ||
    ""
  )
    .toString()
    .trim();
  return {
    customerName: nombre || null,
    items: Array.isArray(d.items) ? d.items : [],
    totalUSD: d.totalUSD != null ? d.totalUSD : null,
    totalBS: d.totalBS != null ? d.totalBS : null,
    menu: d.menuTexto || d.menu || null,
    menuTexto: d.menuTexto || d.menu || null,
    // Extras del contexto (no los usa parseTemplate, quedan disponibles):
    cedula: d.cedula || null,
    ltvUSD: d.ltvUSD != null ? d.ltvUSD : null,
    totalCompras: d.totalCompras != null ? d.totalCompras : null,
  };
};

/**
 * Decide qué hacer con una respuesta rápida seleccionada (WA-110/WA-111/WA-115).
 * Devuelve siempre el mismo shape para poder probarse de forma aislada:
 *   modo      · "directo"   → enviar ya (WA-111)
 *               "completar" → cargar en el input y que el agente revise (WA-115)
 *   badge     · el mismo texto que muestra la tarjeta del bottom sheet
 *   sustituido· true si parseTemplate reemplazó los tokens con datos reales
 *   aviso     · mensaje para el operador cuando faltan datos
 */
export const resolverRespuesta = (reply, ctx) => {
  const texto = (reply && (reply.text || reply.texto)) || "";
  if (!tieneTokens(texto)) {
    return {
      texto,
      modo: "directo",
      badge: "Envío directo",
      tokens: false,
      sustituido: false,
      aviso: null,
    };
  }

  const necesitaCarrito = /\{(items|totalUSD|totalBS|total)\}/.test(texto);
  const tieneCarrito = hayDatosDeCarrito(ctx);

  // Si necesita carrito pero NO hay datos de carrito
  if (necesitaCarrito && !tieneCarrito) {
    // Sustituimos {nombre} y {menu} si están disponibles, dejando los tokens de carrito visibles
    let textoParcial = texto;
    const customerName = (ctx && ctx.customerName) ? ctx.customerName.trim() : "Hola";
    textoParcial = textoParcial.replace(/\{nombre\}/g, customerName);
    if (ctx && (ctx.menu || ctx.menuTexto)) {
      textoParcial = textoParcial.replace(/\{menu\}/g, ctx.menuTexto || ctx.menu);
    }
    return {
      texto: textoParcial,
      modo: "completar",
      badge: "Completar",
      tokens: true,
      sustituido: false,
      aviso: "Sin datos de carrito en esta conversación: completa los tokens restantes antes de enviar.",
    };
  }

  // Si hay datos de carrito (o si la plantilla no requería carrito, e.g. solo {nombre} y/o {menu})
  return {
    texto: parseTemplate(texto, ctx),
    modo: "completar",
    badge: "Completar",
    tokens: true,
    sustituido: true,
    aviso: null,
  };
};

// Acento por canal (la estética de Instagram de IG-49 se conserva dentro del inbox)
const COLOR_BOTON = {
  whatsapp: "bg-[#008069] hover:bg-[#006e59] text-white",
  instagram:
    "bg-gradient-to-tr from-[#F77737] via-[#E1306C] to-[#833AB4] text-white hover:opacity-95",
  messenger: "bg-[#0084FF] hover:bg-[#0072e0] text-white",
};

const InboxQuickReplyBar = ({ conversacion, onFillInput, onSend }) => {
  const [replies, setReplies] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [chatContext, setChatContext] = useState(null);
  const [cargandoContexto, setCargandoContexto] = useState(false);

  const canal = (conversacion && conversacion.canal) || "whatsapp";
  const clave = conversacion && conversacion.clave;
  const usuarioId = conversacion && conversacion.usuarioId;

  // ── WA-107: carga del catálogo (por marca, no por canal) y filtrado de `active` ──
  const cargarRespuestas = useCallback(async () => {
    try {
      setCargando(true);
      const res = await apiClient.get(API_QUICK_REPLIES);
      if (res.data && res.data.success && Array.isArray(res.data.data)) {
        setReplies(res.data.data.filter((r) => r && r.active !== false));
      }
    } catch (err) {
      console.warn(
        "InboxQuickReplyBar: no se pudieron cargar las respuestas rápidas.",
        err.message,
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarRespuestas();
  }, [cargarRespuestas]);

  // ── WA-110: contexto de la conversación para los tokens ──────────────────────
  useEffect(() => {
    if (!clave || !usuarioId) {
      setChatContext(null);
      return undefined;
    }
    let vigente = true;
    setCargandoContexto(true);
    apiClient
      .get(`${API_INBOX}/contexto`, { params: { canal, usuarioId } })
      .then((res) => {
        if (!vigente) return;
        const data = res.data && res.data.data;
        setChatContext(construirContexto(conversacion, data));
      })
      .catch((err) => {
        if (!vigente) return;
        // Sin contexto el token {nombre} al menos cae a nombreVisible del contrato
        setChatContext(construirContexto(conversacion, null));
        console.warn(
          "InboxQuickReplyBar: contexto no disponible para los tokens.",
          err.message,
        );
      })
      .finally(() => {
        if (vigente) setCargandoContexto(false);
      });
    return () => {
      vigente = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, canal, usuarioId]);

  // ── WA-109: registro de uso (usageCount + 1) ────────────────────────────────
  const registrarUso = (reply) => {
    if (!reply || !reply._id) return;
    apiClient
      .put(`${API_QUICK_REPLIES}/${reply._id}`, {
        usageCount: (reply.usageCount || 0) + 1,
      })
      .catch(() => {
        // El registro de uso nunca debe bloquear el envío
      });
  };

  // Cierre estable: el bottom sheet reutilizado reinicia sus filtros cada vez que
  // cambia la identidad de `onClose` (deps de su useEffect). Al memoizarlo, el
  // buscador/categoría NO se resetean si el hilo se repinta con un mensaje nuevo
  // mientras el panel está abierto; se sigue reseteando al abrirlo (isOpen=true).
  const cerrarSheet = useCallback(() => setIsSheetOpen(false), []);

  // ── WA-110 / WA-111: resolución y entrega ───────────────────────────────────
  const handleSeleccionar = (reply) => {
    registrarUso(reply);
    const decision = resolverRespuesta(reply, chatContext);
    if (!decision.texto) return;

    if (decision.modo === "directo") {
      // Envío directo por el endpoint unificado (§6.3): decide el servidor
      // (socket de WhatsApp o REST de Instagram/Messenger).
      if (typeof onSend === "function") onSend(decision.texto);
      return;
    }

    if (typeof onFillInput === "function") onFillInput(decision.texto);
    if (decision.aviso) {
      window.showToast?.(decision.aviso, "warning");
    } else {
      window.showToast?.("Respuesta cargada en el input. Revísala y envíala.");
    }
  };

  // Paridad con QuickReplyBar.js:77 — sin conversación, sin datos o cargando: nada
  if (cargando || !conversacion || replies.length === 0) return null;

  const hayCarrito = hayDatosDeCarrito(chatContext);
  const chipTexto = cargandoContexto
    ? "Cargando contexto..."
    : hayCarrito
      ? "Datos del pedido listos para los tokens"
      : canal === "whatsapp"
        ? "Sin carrito: los tokens se cargan para editar"
        : "Sin carrito en este canal: los tokens se cargan para editar";
  const chipTitulo = hayCarrito
    ? "Los tokens {items}/{totalUSD}/{totalBS}/{total} se sustituyen con el pedido en vivo."
    : "No hay datos para los tokens: la respuesta se carga en el input con los tokens visibles para que los completes (badge «Completar»).";

  return e(
    "div",
    {
      className:
        "relative w-full border-t border-gray-200 dark:border-gray-800 bg-[#f0f2f5] dark:bg-gray-900 flex items-center gap-2 py-1 px-1.5 sm:px-2 transition-all shrink-0 select-none",
    },
    [
      // ── WA-108: botón "Respuestas Rapidas" que abre el bottom sheet ──
      e(
        "button",
        {
          key: "btn-open-sheet",
          type: "button",
          onClick: () => setIsSheetOpen(true),
          "aria-label": `Ver todas las respuestas rápidas (${replies.length} disponibles)`,
          title: "Abrir respuestas rápidas (buscador, categorías y favoritas)",
          className: `h-7 px-3 rounded-full text-[11px] font-bold flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer active:scale-95 transition ${
            COLOR_BOTON[canal] || COLOR_BOTON.whatsapp
          }`,
        },
        [
          e("i", { className: "fas fa-list-ul text-[10px]", "aria-hidden": "true" }),
          e("span", null, "Respuestas Rapidas"),
        ],
      ),

      // ── Calculadora Rápida de Cotización ──
      e(InboxQuickCalculator, {
        key: "inbox-quick-calculator",
        onFillInput,
      }),

      // Estado de sustitución de tokens (WA-110/WA-115) — visible desde la barra
      e(
        "span",
        {
          key: "chip-tokens",
          title: chipTitulo,
          className: `hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${
            hayCarrito
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
              : "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
          }`,
        },
        [
          e("i", {
            className: `fas ${hayCarrito ? "fa-bolt" : "fa-edit"} text-[9px]`,
            "aria-hidden": "true",
          }),
          e("span", null, chipTexto),
        ],
      ),

      e(
        "span",
        {
          key: "contador",
          className:
            "ml-auto text-[10px] text-gray-500 dark:text-gray-400 shrink-0 tabular-nums",
        },
        `${replies.length} disponibles`,
      ),

      // ── WA-112..WA-117 + IG-49: bottom sheet legacy reutilizado sin cambios ──
      isSheetOpen &&
        e(QuickReplyBottomSheet, {
          key: "sheet-quick-replies",
          isOpen: isSheetOpen,
          onClose: cerrarSheet,
          replies,
          onSelectReply: (reply) => {
            handleSeleccionar(reply);
            setIsSheetOpen(false);
          },
          chatContext,
          channelName:
            canal === "instagram"
              ? "Instagram"
              : canal === "messenger"
              ? "Messenger"
              : "WhatsApp",
        }),
    ],
  );
};

export default InboxQuickReplyBar;
