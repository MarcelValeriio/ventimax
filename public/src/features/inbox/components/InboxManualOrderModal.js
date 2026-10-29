import { Icono } from "../../../components/Icono.js";
/**
 * public/src/features/inbox/components/InboxManualOrderModal.js
 *
 * LOTE B7a · COPILOTO DE VENTA MANUAL (docs/paridad-inbox-v3.md §1.I — WA-131..139)
 *
 * POR QUÉ NO SE REUTILIZA `features/whatsapp/components/ChatManualOrderModal.js`
 * -----------------------------------------------------------------------------
 * El modal legacy SÍ recibe todo por props (`isOpen/onClose/whatsappId/apiClient`)
 * —así que en principio era candidato a importarse tal cual, como se hizo con
 * `CustomerCardDrawer.js`, `QuickReplyBottomSheet.js` e `ImageLightboxModal.js—
 * PERO **hardcodea los endpoints legacy** contra el `apiClient` global:
 *
 *   · GET  /api/admin/products            (catálogo)
 *   · GET  /api/admin/payments            (métodos de pago)
 *   · POST /api/admin/chat/extract-order  (extracción IA)
 *   · POST /api/admin/manual-sale         (guardar venta, multipart)
 *
 * Este lote tiene PROHIBIDO editar `public/src/features/whatsapp/**`, y el
 * requisito del inbox es que consuma endpoints unificados bajo
 * `/api/admin/inbox/**`; además no hay forma de inyectarle la base de rutas por
 * props (las rutas están literales DENTRO del componente, no en constantes). Un
 * shim de `apiClient` que reescriba URLs se descartó por ser una capa oculta
 * (cualquier cambio futuro del legacy rompería el inbox en silencio). Por eso se
 * porta aquí con la MISMA estructura, textos, clases y flujo, y solo cambian las
 * URL. Mismo criterio que `InboxWhatsAppProfileModal.js` (LOTE B6).
 *
 * Endpoints unificados (todos GET/POST bajo /api/admin/inbox):
 *   · GET  /inbox/products                             → catálogo          (WA-135)
 *   · GET  /inbox/payments                             → métodos de pago   (WA-135)
 *   · POST /inbox/whatsapp/copiloto/extraer            → { usuarioId }     (WA-132)
 *   · POST /inbox/whatsapp/venta-manual                → multipart         (WA-139)
 *
 * Paridad ID a ID con el legacy:
 *   WA-131 modal «Copiloto: Venta Manual» (cabecera con robot + ✕, cuerpo
 *          scrollable, pie Cancelar / Confirmar e Ingresar).
 *   WA-132 estado «Analizando la conversación...» mientras corre la extracción IA
 *          (y 404 = chat sin historial → llenado manual SIN toast de error).
 *   WA-133 campos Nombre del Cliente, Cédula y Dirección de Entrega.
 *   WA-134 gestión de productos: «+ Agregar», selector del catálogo, cantidad
 *          (number, min 1) y papelera por fila.
 *   WA-135 carga de catálogo y métodos de pago en paralelo al abrir.
 *   WA-136 campo Notas o Instrucciones (textarea rows=2).
 *   WA-137 selector de Método de Pago (preselecciona el primero).
 *   WA-138 comprobante extraído del chat: preview 64×64 + «Ver imagen completa».
 *   WA-139 subir comprobante manual (input file image/*) + guardar la venta
 *          multipart `data` + `comprobante`.
 *
 * Desviaciones documentadas (mínimas, todas ADITIVAS):
 *   1. Si el catálogo o los métodos de pago vienen con `activo: false` en TODOS
 *      los documentos, se cae a la lista cruda en vez de dejar el selector vacío
 *      (el legacy se quedaba sin opciones). Nunca añade elementos inactivos si
 *      hay al menos uno activo.
 *   2. Se ancla la venta a la conversación (`usuarioId`) además de `whatsappId`:
 *      el servidor unificado fuerza `whatsappId`/`cliente.telefono` a esa
 *      conversación, de modo que el pedido nunca se asocia a otro chat.
 *   3. Cierre con Escape y `role="dialog"` (accesibilidad; el legacy no lo tenía).
 *
 * Solo WhatsApp: lo monta `InboxConsole` únicamente con una conversación
 * WhatsApp activa (los endpoints del copiloto devuelven 409 en otros canales).
 */
import React from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js?v=6";

const { useState, useEffect, useRef } = React;
const e = React.createElement;

const API_INBOX = "/api/admin/inbox";

/** Lista usable de catálogo/métodos de pago: los activos; si no hay, la cruda. */
const activosOFallback = (lista) => {
  const arr = Array.isArray(lista) ? lista : [];
  const activos = arr.filter((x) => x && x.activo !== false && (!x.trackStock || (Number(x.stock) || 0) > 0));
  return activos.length ? activos : arr;
};

const InboxManualOrderModal = ({
  isOpen,
  onClose,
  whatsappId,
  onSaved,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comprobanteFile, setComprobanteFile] = useState(null);
  const [comprobanteAIUrl, setComprobanteAIUrl] = useState("");
  const [formData, setFormData] = useState({
    cliente: { nombre: "", cedula: "", telefono: whatsappId, direccion: "" },
    notas: "",
    items: [],
    pago: { metodo: { nombre: "Zelle", type: "digital" }, montoUSD: 0, referencia: "", pagoCon: "" },
    envio: null,
  });
  const [catalogo, setCatalogo] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);
  const [metodosEnvio, setMetodosEnvio] = useState([]);

  // Anti-carrera: si el modal se cierra mientras el catálogo o la extracción IA
  // están en vuelo, la respuesta tardía NO debe pisar el estado del siguiente chat.
  const montajeRef = useRef(0);

  useEffect(() => {
    if (isOpen && whatsappId) {
      const montaje = montajeRef.current + 1;
      montajeRef.current = montaje;
      setLoading(true);
      setComprobanteFile(null);
      setComprobanteAIUrl("");
      setFormData((p) => ({
        ...p,
        cliente: { ...p.cliente, telefono: whatsappId },
      }));

      // WA-135 — catálogo, métodos de pago y métodos de envío simultáneos
      Promise.all([
        apiClient.get(`${API_INBOX}/products`),
        apiClient.get(`${API_INBOX}/payments`),
        apiClient.get(`${API_INBOX}/shipping`).catch(() => apiClient.get("/api/admin/shipping")),
      ])
        .then(([resProd, resPagos, resEnvios]) => {
          if (montajeRef.current !== montaje) return;
          const productos = (resProd && resProd.data && resProd.data.data) || [];
          const pagos = (resPagos && resPagos.data && resPagos.data.data) || [];
          const envios = (resEnvios && resEnvios.data && resEnvios.data.data) || [];
          setCatalogo(activosOFallback(productos));
          const usables = activosOFallback(pagos);
          setMetodosPago(usables);
          const usablesEnvios = activosOFallback(envios);
          setMetodosEnvio(usablesEnvios);
          // WA-137 — preseleccionar el primer método de pago y de envío
          if (usables.length > 0 || usablesEnvios.length > 0) {
            setFormData((p) => {
              const updated = { ...p };
              if (usables.length > 0) {
                const first = usables[0];
                updated.pago = {
                  ...updated.pago,
                  metodo: { nombre: first.nombre, type: first.tipo || "digital" },
                };
              }
              if (usablesEnvios.length > 0) {
                const firstEnv = usablesEnvios[0];
                updated.envio = {
                  metodoId: firstEnv._id,
                  nombre: firstEnv.nombre,
                  tipo: firstEnv.tipo,
                  costo: firstEnv.costoTipo === "fijo" ? Number(firstEnv.costo || 0) : 0,
                  aConvenir: firstEnv.costoTipo === "a_convenir",
                };
              }
              return updated;
            });
          }
        })
        .catch((err) => {
          if (montajeRef.current !== montaje) return;
          console.warn(
            "⚠️ [Inbox] No se pudo cargar el catálogo, métodos de pago o envíos:",
            (err.response && err.response.data && err.response.data.error) || err.message,
          );
        });

      // WA-132 — extracción del pedido con IA a partir del hilo del chat
      apiClient
        .post(`${API_INBOX}/whatsapp/copiloto/extraer`, {
          canal: "whatsapp",
          usuarioId: whatsappId,
        })
        .then((res) => {
          if (montajeRef.current !== montaje) return;
          if (res && res.data && res.data.success) {
            const extraido = res.data.data || {};
            if (extraido.comprobanteUrl && (String(extraido.comprobanteUrl).startsWith("http") || String(extraido.comprobanteUrl).startsWith("/api/"))) {
              setComprobanteAIUrl(extraido.comprobanteUrl);
            } else {
              setComprobanteAIUrl("");
            }
            setFormData((prev) => ({
              ...prev,
              cliente: {
                ...prev.cliente,
                telefono: whatsappId,
                // WA-133 — nombre / cédula / dirección prellenados por la IA
                nombre: (extraido.cliente && extraido.cliente.nombre) || "",
                cedula: (extraido.cliente && extraido.cliente.cedula) || "",
                direccion: (extraido.cliente && extraido.cliente.direccion) || "",
              },
              notas: extraido.notas || "",
              items: extraido.items
                ? extraido.items.map((i) => ({
                    producto: i.producto,
                    cantidad: i.cantidad,
                    precio: 0,
                  }))
                : [],
            }));
          }
        })
        .catch((err) => {
          if (montajeRef.current !== montaje) return;
          console.error("No se pudo extraer:", err);
          // 404 = chat nuevo sin historial: NO es un error real (el operador
          // llena los datos a mano). Cualquier otro fallo sí avisa (paridad con
          // ChatManualOrderModal.js:68-76).
          if (!err || !err.response || err.response.status !== 404) {
            window.showToast?.(
              "No se pudo analizar el chat con IA. Llena los datos manual.",
              "error",
            );
          } else {
            console.log("Chat sin historial previo, llenado manual requerido.");
          }
        })
        .finally(() => {
          if (montajeRef.current !== montaje) return;
          setLoading(false);
        });
    }
    // El efecto se re-ejecuta SOLO al abrir/cambiar de conversación (`isOpen`,
    // `whatsappId`): los estados que lee (`catalogo`, `metodosPago`) se consultan
    // por los setters funcionales de arriba, así que no hacen falta en las deps.
  }, [isOpen, whatsappId]);

  // Desviación 3: cierre con Escape (aditivo; el legacy no lo tenía).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (ev) => {
      if (ev && ev.key === "Escape" && typeof onClose === "function") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // WA-134 — agregar / quitar / cambiar cantidad
  const addItem = () =>
    setFormData((p) => ({ ...p, items: [...p.items, { producto: "", cantidad: 1 }] }));
  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData((p) => ({ ...p, items: newItems }));
  };
  const removeItem = (index) =>
    setFormData((p) => ({ ...p, items: p.items.filter((_, i) => i !== index) }));

  /**
   * WA-139 — guardar la venta manual.
   * Mismo payload que el legacy (estado pendiente_verificacion, totalBs 0,
   * ubicación con fallback «Retiro en tienda», pago.metodo por NOMBRE) y mismos
   * cálculos de subtotal/total desde el catálogo recuperado por WA-135.
   */
  const handleSave = async () => {
    setSaving(true);

    const isValidUrl = comprobanteAIUrl && (String(comprobanteAIUrl).startsWith("http") || String(comprobanteAIUrl).startsWith("/api/"));
    if (!comprobanteFile && !isValidUrl) {
      window.showToast?.("Debes adjuntar la foto del comprobante o de los billetes para procesar el pago.", "error");
      setSaving(false);
      return;
    }

    let totalUSD = 0;
    const finalItems = formData.items
      .filter((i) => i.producto && Number(i.cantidad) > 0)
      .map((i) => {
        const prodEnCatalogo = catalogo.find((p) => p.name === i.producto);
        const precio = prodEnCatalogo ? prodEnCatalogo.price : 0;
        const sub = precio * Number(i.cantidad);
        totalUSD += sub;
        return { ...i, cantidad: Number(i.cantidad), price: precio, subtotal: sub };
      });

    // Sumar costo de envío si es fijo
    let costoEnvio = 0;
    if (formData.envio && !formData.envio.aConvenir && Number(formData.envio.costo) > 0) {
      costoEnvio = Number(formData.envio.costo);
    }
    totalUSD += costoEnvio;

    let pagoConNum = parseFloat(formData.pago.pagoCon) || 0;
    let vueltoUSD = 0;
    
    // Identificar si el método es digital o efectivo
    const metodoNombre = formData.pago?.metodo?.nombre || "";
    const metodoType = formData.pago?.metodo?.type || "";
    const isDigital = !(metodoType.toLowerCase() === "efectivo" || metodoNombre.toLowerCase().includes("efectivo"));

    if (!isDigital && formData.pago.pagoCon !== "" && pagoConNum > 0) {
      if (pagoConNum < totalUSD) {
        window.showToast?.("El billete (Pago con) no puede ser menor al total del pedido.", "error");
        setSaving(false);
        return;
      }
      vueltoUSD = Math.round((pagoConNum - totalUSD) * 100) / 100;
    }

    const manualSale = {
      correlativo: 0,
      whatsappId,
      telefono: whatsappId,
      cliente: { ...formData.cliente, telefono: whatsappId },
      estado: "pendiente_verificacion",
      items: finalItems,
      totalUSD,
      totalBs: 0,
      notas: formData.notas,
      ubicacion: { direccion: formData.cliente.direccion || "Retiro en tienda" },
      envio: formData.envio || null,
      pago: {
        ...formData.pago,
        metodo: formData.pago.metodo.nombre,
        montoUSD: totalUSD,
        fecha: new Date(),
        verificado: false,
        ...(comprobanteAIUrl ? { comprobanteUrl: comprobanteAIUrl } : {}),
        ...(!isDigital && pagoConNum > 0 ? { pagoCon: pagoConNum, vuelto: vueltoUSD } : {})
      },
      timestamp: new Date(),
    };

    const formPayload = new FormData();
    formPayload.append("canal", "whatsapp");
    formPayload.append("usuarioId", whatsappId); // desviación 2: anclaje al chat
    formPayload.append("data", JSON.stringify(manualSale));
    if (comprobanteFile) formPayload.append("comprobante", comprobanteFile);

    try {
      const res = await apiClient.post(`${API_INBOX}/whatsapp/venta-manual`, formPayload, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data && res.data.success) {
        window.showToast?.("Venta manual generada");
        if (typeof onSaved === "function") onSaved(res.data.data || null);
        if (typeof onClose === "function") onClose();
      } else {
        window.showToast?.("Error: " + (res.data && res.data.error), "error");
      }
    } catch (err) {
      const errorMsg =
        (err.response && err.response.data && err.response.data.error) || "Error de red";
      window.showToast?.("Error: " + errorMsg, "error");
    } finally {
      setSaving(false);
    }
  };

  const inputClase =
    "w-full bg-[#202c33] border border-[#2a3942] p-2.5 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none transition";

  return e(
    "div",
    {
      className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Copiloto: Venta Manual",
      "data-testid": "copiloto-venta-manual",
    },
    e(
      "div",
      {
        className:
          "bg-[#111b21] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden text-[#e9edef] border border-[#2a3942]",
      },
      [
        // ── WA-131: cabecera del modal ───────────────────────────────────────
        e(
          "div",
          {
            key: "cabecera",
            className:
              "p-4 border-b border-[#2a3942] flex justify-between items-center bg-[#202c33]",
          },
          [
            e("h2", { key: "titulo", className: "text-lg font-bold flex items-center gap-2" }, [
              e(Icono, { nombre: "bot", className: "text-[#00a884]" }),
              "Copiloto: Venta Manual",
            ]),
            e(
              "button",
              {
                key: "cerrar",
                type: "button",
                onClick: onClose,
                title: "Cerrar",
                "aria-label": "Cerrar copiloto",
                className: "text-[#8696a0] hover:text-[#e9edef] transition cursor-pointer",
              },
              e(Icono, { nombre: "x", className: "text-xl" }),
            ),
          ],
        ),

        e(
          "div",
          { key: "cuerpo", className: "p-4 overflow-y-auto flex-1 space-y-5" },
          [
            // ── WA-132: estado «Analizando la conversación...» ───────────────
            loading
              ? e(
                  "div",
                  { key: "analizando", className: "text-center py-12", "data-testid": "copiloto-analizando" },
                  [
                    e(Icono, {
                      key: "spinner",
                      nombre: "loader-circle", girar: true, className: "text-4xl text-[#00a884] mb-3",
                    }),
                    e(
                      "p",
                      { key: "texto", className: "text-[#8696a0] font-semibold tracking-wide" },
                      "Analizando la conversación...",
                    ),
                  ],
                )
              : e(React.Fragment, null, [
                  // ── WA-133: Nombre / Cédula ──────────────────────────────
                  e("div", { key: "fila-datos", className: "grid grid-cols-2 gap-4" }, [
                    e("div", { key: "nombre-wrap" }, [
                      e(
                        "label",
                        { className: "block text-xs font-bold text-[#8696a0] mb-1" },
                        "Nombre del Cliente",
                      ),
                      e("input", {
                        value: formData.cliente.nombre,
                        "aria-label": "Nombre del Cliente",
                        onChange: (ev) =>
                          setFormData((p) => ({
                            ...p,
                            cliente: { ...p.cliente, nombre: ev.target.value },
                          })),
                        className: inputClase,
                      }),
                    ]),
                    e("div", { key: "cedula-wrap" }, [
                      e(
                        "label",
                        { className: "block text-xs font-bold text-[#8696a0] mb-1" },
                        "Cédula",
                      ),
                      e("input", {
                        value: formData.cliente.cedula,
                        "aria-label": "Cédula",
                        onChange: (ev) =>
                          setFormData((p) => ({
                            ...p,
                            cliente: { ...p.cliente, cedula: ev.target.value },
                          })),
                        className: inputClase,
                      }),
                    ]),
                  ]),

                  // ── WA-133: Dirección ───────────────────────────────────
                  e("div", { key: "direccion-wrap" }, [
                    e(
                      "label",
                      { className: "block text-xs font-bold text-[#8696a0] mb-1" },
                      "Dirección de Entrega",
                    ),
                    e("input", {
                      value: formData.cliente.direccion,
                      "aria-label": "Dirección de Entrega",
                      onChange: (ev) =>
                        setFormData((p) => ({
                          ...p,
                          cliente: { ...p.cliente, direccion: ev.target.value },
                        })),
                      className: inputClase,
                    }),
                  ]),

                  // ── WA-134/WA-135: productos del carrito + catálogo ──────
                  e(
                    "div",
                    {
                      key: "productos",
                      className: "border border-[#2a3942] p-3.5 rounded-lg bg-[#202c33]",
                    },
                    [
                      e(
                        "div",
                        { key: "cabecera-productos", className: "flex justify-between mb-3 items-center" },
                        [
                          e(
                            "h3",
                            { key: "titulo", className: "font-bold text-[#e9edef]" },
                            "Productos Extraídos",
                          ),
                          e(
                            "button",
                            {
                              key: "agregar",
                              type: "button",
                              onClick: addItem,
                              className:
                                "bg-[#00a884]/20 text-[#00a884] px-3 py-1.5 rounded-md text-xs font-black hover:bg-[#00a884]/30 transition cursor-pointer",
                            },
                            "+ Agregar",
                          ),
                        ],
                      ),
                      ...formData.items.map((item, idx) =>
                        e("div", { key: `item-${idx}`, className: "flex gap-2 mb-2" }, [
                          e(
                            "select",
                            {
                              value: item.producto,
                              "aria-label": `Producto ${idx + 1}`,
                              onChange: (ev) => updateItem(idx, "producto", ev.target.value),
                              className:
                                "flex-1 bg-[#111b21] border border-[#2a3942] p-2 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none",
                            },
                            [
                              e("option", { key: "vacio", value: "" }, "Selecciona..."),
                              ...catalogo.map((c) =>
                                e("option", { key: c._id || c.name, value: c.name }, `${c.name}${c.trackStock ? ` - Stock: ${c.stock}` : ''}`),
                              ),
                            ],
                          ),
                          e("input", {
                            type: "number",
                            min: "1",
                            value: item.cantidad,
                            "aria-label": `Cantidad ${idx + 1}`,
                            onChange: (ev) => updateItem(idx, "cantidad", ev.target.value),
                            className:
                              "w-20 bg-[#111b21] border border-[#2a3942] p-2 rounded-lg text-center text-sm text-[#e9edef] focus:border-[#00a884] outline-none",
                          }),
                          e(
                            "button",
                            {
                              key: "quitar",
                              type: "button",
                              onClick: () => removeItem(idx),
                              title: "Quitar producto",
                              "aria-label": `Quitar producto ${idx + 1}`,
                              className: "text-red-400 hover:text-red-300 px-3 transition cursor-pointer",
                            },
                            e(Icono, { nombre: "trash" }),
                          ),
                        ]),
                      ),
                    ],
                  ),

                  // ── WA-136: notas ───────────────────────────────────────
                  e("div", { key: "notas-wrap" }, [
                    e(
                      "label",
                      { className: "block text-xs font-bold text-[#8696a0] mb-1" },
                      "Notas o Instrucciones (IA)",
                    ),
                    e("textarea", {
                      value: formData.notas,
                      rows: 2,
                      "aria-label": "Notas",
                      onChange: (ev) => setFormData((p) => ({ ...p, notas: ev.target.value })),
                      className:
                        "w-full bg-[#202c33] border border-[#2a3942] p-2.5 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none transition resize-none",
                    }),
                  ]),

                  // ── F0-5: método de envío ───────────────────────────────
                  e(
                    "div",
                    {
                      key: "metodo-envio",
                      className:
                        "flex justify-between items-center bg-[#202c33] border border-[#2a3942] p-3.5 rounded-lg mt-2",
                    },
                    [
                      e(
                        "span",
                        { key: "label", className: "font-bold text-[#e9edef]" },
                        "Método de Envío:",
                      ),
                      e(
                        "select",
                        {
                          value: (formData.envio && formData.envio.metodoId) || "",
                          "aria-label": "Método de Envío",
                          onChange: (ev) => {
                            const env = metodosEnvio.find((m) => String(m._id) === ev.target.value);
                            setFormData((p) => ({
                              ...p,
                              envio: env
                                ? {
                                    metodoId: env._id,
                                    nombre: env.nombre,
                                    tipo: env.tipo,
                                    costo: env.costoTipo === "fijo" ? Number(env.costo || 0) : 0,
                                    aConvenir: env.costoTipo === "a_convenir",
                                  }
                                : null,
                            }));
                          },
                          className:
                            "bg-[#111b21] border border-[#2a3942] p-2 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none",
                        },
                        [
                          e("option", { key: "sin-envio", value: "" }, "Sin método especificado"),
                          ...metodosEnvio.map((m) =>
                            e(
                              "option",
                              { key: m._id || m.nombre, value: m._id },
                              `${m.nombre} (${m.costoTipo === "fijo" ? `$${Number(m.costo || 0).toFixed(2)}` : "A convenir"})`
                            ),
                          ),
                        ]
                      ),
                    ],
                  ),

                  // ── WA-137: método de pago ───────────────────────────────
                  e(
                    "div",
                    {
                      key: "metodo-pago",
                      className:
                        "flex justify-between items-center bg-[#202c33] border border-[#2a3942] p-3.5 rounded-lg mt-2",
                    },
                    [
                      e(
                        "span",
                        { key: "label", className: "font-bold text-[#e9edef]" },
                        "Método de Pago:",
                      ),
                      e(
                        "select",
                        {
                          value: formData.pago.metodo.nombre,
                          "aria-label": "Método de Pago",
                          onChange: (ev) => {
                            const met = metodosPago.find((m) => m.nombre === ev.target.value);
                            setFormData((p) => ({
                              ...p,
                              pago: {
                                ...p.pago,
                                metodo: {
                                  nombre: ev.target.value,
                                  type: met ? met.tipo || "digital" : "digital",
                                },
                              },
                            }));
                          },
                          className:
                            "bg-[#111b21] border border-[#2a3942] p-2 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none",
                        },
                        metodosPago.map((m) =>
                          e("option", { key: m._id || m.nombre, value: m.nombre }, m.nombre),
                        ),
                      ),
                    ],
                  ),

                  (() => {
                    const isEfe = (formData.pago.metodo.type || "").toLowerCase() === "efectivo" || 
                                  (formData.pago.metodo.nombre || "").toLowerCase().includes("efectivo");
                    if (!isEfe) return null;
                    return e("div", { key: "efectivo-input", className: "flex justify-between items-center bg-[#202c33] border border-[#2a3942] p-3.5 rounded-lg mt-2" }, [
                      e("span", { key: "label", className: "font-bold text-[#e9edef]" }, "¿Monto a Entregar? ($):"),
                      e("input", {
                        key: "input",
                        type: "number", min: "1", step: "0.01",
                        placeholder: "Ej: 20",
                        value: formData.pago.pagoCon || "",
                        onChange: ev => setFormData(p => ({...p, pago: {...p.pago, pagoCon: ev.target.value}})),
                        className: "bg-[#111b21] border border-[#2a3942] p-2 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none w-32"
                      })
                    ]);
                  })(),

                  // ── WA-138/WA-139: comprobante ───────────────────────────
                  e(
                    "div",
                    {
                      key: "comprobante",
                      className:
                        "bg-[#202c33] border border-[#2a3942] p-3.5 rounded-lg mt-2 space-y-3",
                    },
                    [
                      e(
                        "label",
                        { key: "label", className: "block text-xs font-bold text-[#8696a0] mb-1" },
                        "Comprobante de Pago",
                      ),
                      // WA-138 — comprobante detectado en el chat
                      comprobanteAIUrl
                        ? e(
                            "div",
                            {
                              key: "comprobante-ia",
                              "data-testid": "copiloto-comprobante-ia",
                              className:
                                "flex items-center gap-3 p-2.5 bg-[#111b21] rounded-lg border border-[#2a3942]",
                            },
                            [
                              e("img", {
                                key: "preview",
                                src: comprobanteAIUrl,
                                alt: "Comprobante",
                                className:
                                  "w-16 h-16 object-cover rounded-lg border border-[#2a3942]",
                              }),
                              e("div", { key: "detalle", className: "flex-1 text-xs" }, [
                                e(
                                  "p",
                                  {
                                    key: "etiqueta",
                                    className: "text-[#00a884] font-semibold flex items-center gap-1.5",
                                  },
                                  [
                                    e(Icono, { key: "ic", nombre: "circle-check" }),
                                    "Comprobante extraído del chat",
                                  ],
                                ),
                                e(
                                  "a",
                                  {
                                    key: "ver",
                                    href: comprobanteAIUrl,
                                    target: "_blank",
                                    rel: "noopener noreferrer",
                                    className:
                                      "text-[#8696a0] hover:text-[#e9edef] underline mt-1 inline-block",
                                  },
                                  "Ver imagen completa",
                                ),
                              ]),
                            ],
                          )
                        : null,
                      // WA-139 — subida manual
                      e(
                        "div",
                        { key: "subida" },
                        e("input", {
                          type: "file",
                          accept: "image/*",
                          "aria-label": "Subir comprobante",
                          onChange: (ev) =>
                            setComprobanteFile(ev.target.files && ev.target.files[0]),
                          className:
                            "block w-full text-xs text-[#8696a0] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#00a884]/20 file:text-[#00a884] hover:file:bg-[#00a884]/30 cursor-pointer",
                        }),
                      ),
                    ],
                  ),
                ]),
          ],
        ),

        // ── WA-131/WA-139: pie con Cancelar / Confirmar e Ingresar ───────────
        e(
          "div",
          {
            key: "pie",
            className: "p-4 border-t border-[#2a3942] flex justify-end gap-3 bg-[#202c33]",
          },
          [
            e(
              "button",
              {
                key: "cancelar",
                type: "button",
                onClick: onClose,
                className:
                  "px-5 py-2.5 rounded-lg text-[#e9edef] font-bold hover:bg-[#111b21] transition cursor-pointer",
              },
              "Cancelar",
            ),
            (() => {
              const isValidUrl = comprobanteAIUrl && (String(comprobanteAIUrl).startsWith("http") || String(comprobanteAIUrl).startsWith("/api/"));
              const faltaComprobante = !comprobanteFile && !isValidUrl;
              return e(
                "button",
                {
                  key: "guardar",
                  type: "button",
                  onClick: faltaComprobante ? () => window.showToast?.("Adjunta la foto del comprobante o billetes primero.", "error") : handleSave,
                  disabled: loading || saving,
                  "data-testid": "copiloto-guardar",
                  className:
                    `px-5 py-2.5 rounded-lg font-black transition flex items-center gap-2 ${faltaComprobante ? 'bg-gray-700 text-gray-500 cursor-not-allowed hover:bg-gray-700' : 'bg-[#00a884] text-[#111b21] hover:bg-[#008069] disabled:opacity-50 cursor-pointer'}`,
                },
                [
                  e(Icono, { key: "ic", nombre: saving ? "loader-circle" : "check", girar: saving }),
                  "Confirmar e Ingresar",
                ],
              );
            })(),
          ],
        ),
      ],
    ),
  );
};

export default InboxManualOrderModal;
