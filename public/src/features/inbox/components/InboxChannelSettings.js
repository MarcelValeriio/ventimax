/**
 * public/src/features/inbox/components/InboxChannelSettings.js
 * LOTE B6 — AJUSTES DEL CANAL (no de la conversación).
 *
 * Engranaje en la cabecera de la COLUMNA DE LISTA (Col-C, `InboxSidebar`), a la
 * derecha del chip de canal. Muestra las opciones del canal ACTIVO en el raíl:
 *
 *   whatsapp  → «Perfil de WhatsApp Business»        (WA-45 · modal WA-39)
 *   instagram → switch global Bot ON/OFF             (IG-01 · switch IG-18)
 *   messenger → sin ajustes de canal todavía (Facebook Messenger no tiene
 *               perfil ni bot global expuestos por Meta en este proyecto)
 *   todos     → invita a fijar un canal en el raíl
 *
 * DECISIÓN DE DISEÑO (dueño): son ajustes de CANAL y por eso NO viven en la
 * cabecera de la conversación (`InboxThread`), sino aquí. El componente es
 * PRESENTACIONAL: quién consulta/persiste el estado del bot y quién abre el modal
 * de perfil es `InboxConsole` (fuente única de verdad), de modo que este
 * componente se puede ejercitar en el harness sin red.
 *
 * El engranaje solo pinta opciones de `canalActivo`: nunca mezcla canales.
 * Es usable en móvil (icono 32×32 en la fila de la cabecera, que ya envuelve el
 * buscador/filtros debajo; el panel se ancla a la derecha y se limita a
 * `min(18rem, 85vw)` para no desbordar pantallas estrechas).
 */
import React, { useEffect, useState } from "https://cdn.skypack.dev/react";

const e = React.createElement;

const InboxChannelSettings = ({
  canalActivo = "todos",
  canalLabel = "Todos",
  botEnabled = null,
  botCargando = false,
  botCambiando = false,
  onToggleBot,
  onOpenWhatsappProfile,
}) => {
  const [abierto, setAbierto] = useState(false);

  // Cierre con Escape (mismo criterio que el visor de imagen del lote B5).
  useEffect(() => {
    if (!abierto) return undefined;
    const handleKeyDown = (ev) => {
      if (ev.key === "Escape" || ev.keyCode === 27) setAbierto(false);
    };
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      if (typeof window !== "undefined" && window.removeEventListener) {
        window.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [abierto]);

  const cerrar = () => setAbierto(false);

  const abrirPerfilWhatsApp = () => {
    if (typeof onOpenWhatsappProfile === "function") onOpenWhatsappProfile();
    cerrar();
  };

  const alternarBot = () => {
    if (botCargando || botCambiando) return;
    const siguiente = !botEnabled;
    if (typeof onToggleBot === "function") onToggleBot(siguiente);
  };

  // ── Opciones por canal ACTIVO (nunca de otro canal) ───────────────────────
  let contenido = null;
  if (canalActivo === "whatsapp") {
    contenido = e(
      "button",
      {
        key: "opt-perfil-wa",
        type: "button",
        "data-testid": "channel-settings-whatsapp-profile",
        onClick: abrirPerfilWhatsApp,
        className:
          "w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left hover:bg-emerald-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer",
      },
      [
        e(
          "span",
          {
            key: "icon",
            className:
              "w-8 h-8 rounded-lg bg-[#008069]/10 text-[#008069] flex items-center justify-center shrink-0",
          },
          e("i", { className: "fas fa-store text-sm" }),
        ),
        e("span", { key: "txt", className: "flex flex-col min-w-0" }, [
          e(
            "span",
            { key: "t", className: "text-xs font-bold text-gray-800 dark:text-white" },
            "Perfil de WhatsApp Business",
          ),
          e(
            "span",
            { key: "s", className: "text-[10px] text-gray-500 dark:text-gray-400 leading-snug" },
            "Estado, descripción, sector, dirección, email, webs y foto",
          ),
        ]),
      ],
    );
  } else if (canalActivo === "instagram") {
    contenido = e(
      "button",
      {
        key: "opt-bot-ig",
        type: "button",
        role: "switch",
        "aria-checked": botEnabled === true,
        "aria-label": botEnabled ? "Desactivar bot de Instagram" : "Activar bot de Instagram",
        "data-testid": "channel-settings-instagram-bot",
        onClick: alternarBot,
        disabled: botCargando || botCambiando,
        title: botEnabled
          ? "Bot de Instagram ACTIVO (haz clic para pausar)"
          : "Bot de Instagram PAUSADO (haz clic para activar)",
        className: `w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
          botEnabled
            ? "bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-950/50"
            : "bg-amber-50/70 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50"
        } ${botCargando || botCambiando ? "opacity-60 cursor-wait" : ""}`,
      },
      [
        e(
          "span",
          {
            key: "icon",
            className: `w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              botEnabled
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
            }`,
          },
          e("i", { className: "fas fa-robot text-sm" }),
        ),
        e("span", { key: "txt", className: "flex flex-col min-w-0 flex-1" }, [
          e(
            "span",
            { key: "t", className: "text-xs font-bold text-gray-800 dark:text-white" },
            "Bot global de Instagram",
          ),
          e(
            "span",
            { key: "s", className: "text-[10px] text-gray-500 dark:text-gray-400 leading-snug" },
            botCargando
              ? "Consultando estado…"
              : botEnabled
                ? "ACTIVO — responde solo a todas las conversaciones"
                : "PAUSADO — todo pasa a atención manual",
          ),
        ]),
        e(
          "span",
          {
            key: "estado",
            "data-testid": "channel-settings-instagram-bot-estado",
            className: `shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black ${
              botEnabled ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
            }`,
          },
          botCargando ? "…" : botEnabled ? "ON" : "OFF",
        ),
      ],
    );
  } else if (canalActivo === "messenger") {
    contenido = e(
      "p",
      {
        key: "opt-messenger",
        "data-testid": "channel-settings-messenger-vacio",
        className: "px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400 leading-snug",
      },
      "Facebook Messenger no expone todavía ajustes de canal (ni perfil público ni bot global). El bot de Messenger sigue el modo de cada conversación.",
    );
  } else {
    contenido = e(
      "p",
      {
        key: "opt-todos",
        "data-testid": "channel-settings-todos-vacio",
        className: "px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400 leading-snug",
      },
      "Elige un canal en el raíl (WhatsApp o Instagram) para ver sus ajustes: perfil del negocio o bot global.",
    );
  }

  return e(
    "div",
    { key: "channel-settings", className: "relative shrink-0" },
    [
      e(
        "button",
        {
          key: "gear",
          type: "button",
          "data-testid": "channel-settings-gear",
          onClick: () => setAbierto((prev) => !prev),
          "aria-expanded": abierto,
          "aria-haspopup": "menu",
          "aria-label": `Ajustes del canal ${canalLabel}`,
          title: `Ajustes de ${canalLabel}`,
          className: `w-8 h-8 flex items-center justify-center rounded-lg transition-colors active:scale-95 cursor-pointer ${
            abierto
              ? "bg-emerald-100 text-emerald-700 dark:bg-gray-700 dark:text-emerald-300"
              : "text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-gray-700/60"
          }`,
        },
        e("i", { className: "fas fa-cog text-xs" }),
      ),
      abierto
        ? e(
            "div",
            {
              key: "panel",
              role: "menu",
              "data-testid": "channel-settings-panel",
              "aria-label": `Ajustes del canal ${canalLabel}`,
              className:
                "absolute right-0 top-full mt-2 w-72 max-w-[85vw] z-40 p-2 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col gap-1",
            },
            [
              e(
                "div",
                {
                  key: "panel-head",
                  className:
                    "px-3 pt-1.5 pb-1 flex items-center justify-between border-b border-gray-100 dark:border-gray-700/70",
                },
                [
                  e(
                    "span",
                    {
                      key: "titulo",
                      className:
                        "text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500",
                    },
                    `Ajustes de ${canalLabel}`,
                  ),
                  e(
                    "button",
                    {
                      key: "cerrar",
                      type: "button",
                      onClick: cerrar,
                      "aria-label": "Cerrar ajustes del canal",
                      title: "Cerrar (Escape)",
                      className:
                        "w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer",
                    },
                    e("i", { className: "fas fa-times text-[10px]" }),
                  ),
                ],
              ),
              contenido,
            ],
          )
        : null,
    ],
  );
};

export default InboxChannelSettings;
