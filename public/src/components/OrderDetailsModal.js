/**
 * public/src/components/OrderDetailsModal.js
 * Componente Modal de Detalles de Pedidos Compartido (Versión COMANDA EXTENDIDA - Clean Animations)
 */
import React, { useEffect, useState } from "https://cdn.skypack.dev/react";
import apiClient, { getCustomerCRM } from "../services/apiClient.js";

const formatCedula = (c) => {
  const v = (c || "").toString().trim();
  if (!v) return "";
  if (/^[vejgp][\s\-\.]*\d/i.test(v)) {
    return v.replace(/^([vejgp])[\s\-\.]*/i, (_, l) => l.toUpperCase() + "-");
  }
  return /^\d/.test(v) ? `V-${v}` : v;
};

const e = React.createElement;

const OrderDetailsModal = ({
  order,
  isOpen,
  onClose,
  onUpdateStatus,
  userRole,
  onDelete,
  deleting,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [crmData, setCrmData] = useState(null);
  const [loadingCrm, setLoadingCrm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [comprobanteFile, setComprobanteFile] = useState(null);
  const [shippingMethods, setShippingMethods] = useState([]);
  const [isChangingShipping, setIsChangingShipping] = useState(false);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [customShippingCost, setCustomShippingCost] = useState(0);
  const [notifyCustomerShipping, setNotifyCustomerShipping] = useState(false);
  const [savingShipping, setSavingShipping] = useState(false);

  useEffect(() => {
    if (isOpen) {
      apiClient
        .get("/api/admin/shipping?activo=true")
        .then((res) => {
          if (res.data?.success && Array.isArray(res.data.data)) {
            setShippingMethods(res.data.data);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && order) {
      setEditForm(JSON.parse(JSON.stringify(order)));
      setIsEditing(false);
      setIsChangingShipping(false);
      setSelectedShippingId(order.envio?.metodoId || "");
      setCustomShippingCost(Number(order.envio?.costo) || 0);
      setNotifyCustomerShipping(false);
      setComprobanteFile(null);
    }
  }, [isOpen, order]);

  const handleSaveShipping = async () => {
    if (!selectedShippingId) {
      alert("Por favor selecciona un método de envío");
      return;
    }
    const metodoSel = shippingMethods.find((m) => String(m._id) === String(selectedShippingId));
    if (!metodoSel) {
      alert("Método de envío seleccionado no válido");
      return;
    }
    try {
      setSavingShipping(true);
      const payload = {
        metodoId: selectedShippingId,
        avisarCliente: notifyCustomerShipping,
      };
      if (metodoSel.costoTipo === "a_convenir") {
        payload.costoAcordado = Number(customShippingCost) || 0;
      }
      const res = await apiClient.put(`/api/admin/orders/${order._id}/envio`, payload);
      if (res.data?.success) {
        if (res.data.aviso) {
          alert(`⚠️ ${res.data.aviso}`);
        }
        window.showToast?.("✅ Método de envío actualizado");
        if (res.data.data) {
          setEditForm(JSON.parse(JSON.stringify(res.data.data)));
          if (order) {
            order.envio = res.data.data.envio;
            if (res.data.data.pago) order.pago = res.data.data.pago;
          }
        }
        setIsChangingShipping(false);
        if (onUpdateStatus) onUpdateStatus(order._id, order.estado);
      }
    } catch (err) {
      alert("❌ Error actualizando envío: " + (err.response?.data?.error || err.message));
    } finally {
      setSavingShipping(false);
    }
  };

  const handleSaveEdit = async () => {
    try {
      setSaving(true);
      let payload = editForm;
      let config = {};
      
      if (comprobanteFile) {
        payload = new FormData();
        payload.append("data", JSON.stringify(editForm));
        payload.append("comprobante", comprobanteFile);
        config = { headers: { "Content-Type": "multipart/form-data" } };
      }
      
      await apiClient.put(`/api/admin/orders/${order._id}/edit`, payload, config);
      if (onUpdateStatus) onUpdateStatus(order._id, order.estado); // Refresh workaround
      setIsEditing(false);
      setComprobanteFile(null);
    } catch (error) {
      alert("Error al guardar: " + (error.response?.data?.message || error.message));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const pedido = order;
    const phone =
      pedido?.whatsappId || pedido?.cliente?.telefono || pedido?.telefono;
    if (isOpen && pedido && phone) {
      setLoadingCrm(true);
      const fetchCRM = getCustomerCRM || apiClient?.getCustomerCRM;
      if (fetchCRM) {
        fetchCRM(phone)
          .then((res) => {
            if (res && res.success && res.data) {
              setCrmData(res.data);
            } else if (res && res.data) {
              setCrmData(res.data);
            } else {
              setCrmData(res || null);
            }
          })
          .catch((err) => {
            console.warn("⚠️ No se pudo cargar datos CRM:", err);
            setCrmData(null);
          })
          .finally(() => setLoadingCrm(false));
      }
    } else if (!isOpen) {
      setCrmData(null);
    }
  }, [isOpen, order]);

  if (!isVisible && !isOpen) return null;

  const renderOrderId = (id) => {
    if (!id) return "#---";
    const cleanId = id.toString().replace(/^#+/, "");
    return `#${cleanId}`;
  };

  const formatDate = (ts) => {
    if (!ts) return "---";
    try {
      return new Date(ts).toLocaleString("es-VE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });
    } catch (err) {
      return "---";
    }
  };

  const showVerifyBtn =
    onUpdateStatus &&
    order?.estado === "pendiente_verificacion" &&
    (userRole === "admin" || userRole === "cajero");
  const showRouteBtn =
    onUpdateStatus && order?.estado === "verificado" && userRole === "admin";
  const showDeliverBtn =
    onUpdateStatus &&
    order?.estado === "en_ruta" &&
    (userRole === "admin" || userRole === "repartidor");
  const hasActions = showVerifyBtn || showRouteBtn || showDeliverBtn;
  const showDeleteBtn = onDelete && userRole === "admin";

  const isEfectivo =
    order?.pago?.metodo === "efectivo" ||
    order?.pago?.metodo?.tipo === "efectivo" ||
    order?.metodo === "efectivo";

  let metodoNombre = "PAGO PENDIENTE";
  if (typeof order?.pago?.metodo === "object" && order.pago.metodo.nombre) {
    metodoNombre = order.pago.metodo.nombre;
  } else if (typeof order?.pago?.metodo === "string") {
    metodoNombre = order.pago.metodo;
  } else if (order?.metodo) {
    metodoNombre = order.metodo;
  }

  const telefonoCliente =
    order?.cliente?.telefono || order?.telefono || order?.whatsappId || "";

  return e(
    "div",
    {
      className: `fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[110] p-2 md:p-4 transition-opacity duration-300 ease-out ${isOpen ? "opacity-100" : "opacity-0"}`,
      onClick: onClose,
    },
    e(
      "div",
      {
        className: `bg-white dark:bg-gray-800 rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[95vh] transition-all duration-300 ease-out transform ${isOpen ? "opacity-100 scale-100" : "opacity-0 scale-95"}`,
        onClick: (ev) => ev.stopPropagation(),
      },
      e(
        "div",
        {
          className:
            "p-6 md:p-8 bg-emerald-600 text-white flex justify-between items-center flex-shrink-0",
        },
        [
          e("div", null, [
            e(
              "p",
              {
                className:
                  "text-[10px] font-black uppercase tracking-[0.2em] opacity-80",
              },
              "Orden de Servicio",
            ),
            e(
              "h3",
              { className: "text-3xl font-black" },
              renderOrderId(order?.correlativo || order?.id),
            ),
          ]),
          e("div", { className: "text-right flex flex-col items-end" }, [
            e(
              "div",
              { className: "flex items-center gap-3" },
              [
                userRole === "admin" && !isEditing && e("button", {
                  onClick: () => setIsEditing(true),
                  className: "bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition flex items-center justify-center",
                  title: "Editar Pedido"
                }, e("i", { className: "fas fa-edit text-sm" })),
                e(
                  "p",
                  { className: "text-xs font-bold opacity-90" },
                  formatDate(order?.timestamp || order?.fecha),
                )
              ]
            ),
            e(
              "div",
              { className: "flex items-center justify-end gap-1.5 mt-1" },
              [
                Boolean(order?.ctwaClid && order.ctwaClid.toString().trim()) &&
                  e(
                    "span",
                    {
                      className:
                        "inline-flex items-center gap-1 px-2.5 py-0.5 bg-blue-500/80 border border-white/30 rounded-full text-[10px] font-black uppercase shadow-xs tracking-wider",
                      title: `Click-to-WhatsApp: ${order?.ctwaClid}`,
                    },
                    e("i", { className: "fab fa-meta text-[10px]" }),
                    "Meta Ad",
                  ),
                e(
                  "span",
                  {
                    className:
                      "inline-block px-3 py-1 bg-white/20 rounded-full text-[10px] font-black uppercase",
                  },
                  (order?.estado || "completado").toString().replace("_", " "),
                ),
              ],
            ),
          ]),
        ],
      ),
      e("div", { className: "flex-1 overflow-y-auto p-6 md:p-8 space-y-8" }, [
        e("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-6" }, [
          e("div", null, [
            e(
              "p",
              {
                className:
                  "text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase mb-1",
              },
              "👤 Cliente",
            ),
            isEditing
              ? e("div", { className: "space-y-2 mt-2" }, [
                  e("input", {
                    type: "text",
                    value: typeof editForm?.cliente === "object" ? editForm.cliente.nombre : editForm?.cliente || "",
                    onChange: (ev) => setEditForm(prev => ({ ...prev, cliente: { ...prev.cliente, nombre: ev.target.value } })),
                    className: "w-full p-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                    placeholder: "Nombre"
                  }),
                  e("input", {
                    type: "text",
                    value: editForm?.cliente?.cedula || "",
                    onChange: (ev) => setEditForm(prev => ({ ...prev, cliente: { ...prev.cliente, cedula: ev.target.value } })),
                    className: "w-full p-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                    placeholder: "Cédula"
                  }),
                  e("input", {
                    type: "text",
                    value: editForm?.whatsappId || "",
                    onChange: (ev) => setEditForm(prev => ({ ...prev, whatsappId: ev.target.value })),
                    className: "w-full p-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                    placeholder: "Teléfono (whatsappId)"
                  }),
                ])
              : e(React.Fragment, null, [
                  e(
                    "h4",
                    {
                      className: "text-xl font-bold text-gray-800 dark:text-gray-100",
                    },
                    order?.cliente?.nombre ||
                      order?.cliente ||
                      "Sin nombre registrado",
                  ),
                  e(
                    "p",
                    { className: "text-xs font-black text-gray-400 uppercase mb-2" },
                    `🆔 ${order?.cliente?.cedula ? formatCedula(order.cliente.cedula) : "CÉDULA NO REGISTRADA"}`,
                  ),
                  telefonoCliente &&
                    e(
                      "a",
                      {
                        href: `https://wa.me/${telefonoCliente.toString().replace(/[^0-9]/g, "")}`,
                        target: "_blank",
                        rel: "noopener noreferrer",
                        className:
                          "text-emerald-500 font-bold text-sm flex items-center gap-2 mt-1 hover:underline w-fit",
                      },
                      [e("i", { className: "fab fa-whatsapp" }), telefonoCliente],
                    ),
                ]),
            // Micro-CRM Badges
            (crmData || loadingCrm) &&
              e(
                "div",
                {
                  className:
                    "mt-4 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/50 rounded-xl",
                },
                [
                  e(
                    "div",
                    {
                      className:
                        "flex items-center justify-between text-[10px] font-black uppercase text-blue-800 dark:text-blue-300 tracking-wider mb-2",
                    },
                    [
                      e("span", { className: "flex items-center gap-1.5" }, [
                        e("i", { className: "fas fa-id-card text-blue-600 dark:text-blue-400" }),
                        "Ficha CRM del Cliente",
                      ]),
                      loadingCrm &&
                        e("i", { className: "fas fa-spinner fa-spin text-blue-500 text-xs" }),
                    ],
                  ),
                  e(
                    "div",
                    { className: "grid grid-cols-3 gap-2 text-center" },
                    [
                      e(
                        "div",
                        {
                          className:
                            "bg-white dark:bg-gray-800/90 p-2 rounded-lg border border-blue-100/60 dark:border-blue-900/40 shadow-xs",
                        },
                        [
                          e(
                            "p",
                            {
                              className:
                                "text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase truncate",
                            },
                            "LTV Total",
                          ),
                          e(
                            "p",
                            {
                              className:
                                "text-xs sm:text-sm font-black text-blue-800 dark:text-blue-300",
                            },
                            loadingCrm
                              ? "..."
                              : `$${Number(crmData?.ltv ?? crmData?.ltvUSD ?? crmData?.ltvTotal ?? crmData?.totalGastado ?? 0).toFixed(2)}`,
                          ),
                        ],
                      ),
                      e(
                        "div",
                        {
                          className:
                            "bg-white dark:bg-gray-800/90 p-2 rounded-lg border border-blue-100/60 dark:border-blue-900/40 shadow-xs",
                        },
                        [
                          e(
                            "p",
                            {
                              className:
                                "text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase truncate",
                            },
                            "Compras",
                          ),
                          e(
                            "p",
                            {
                              className:
                                "text-xs sm:text-sm font-black text-blue-800 dark:text-blue-300",
                            },
                            loadingCrm
                              ? "..."
                              : `${crmData?.totalCompras ?? crmData?.compras ?? crmData?.numCompras ?? crmData?.totalOrders ?? 0}`,
                          ),
                        ],
                      ),
                      e(
                        "div",
                        {
                          className:
                            "bg-white dark:bg-gray-800/90 p-2 rounded-lg border border-blue-100/60 dark:border-blue-900/40 shadow-xs",
                        },
                        [
                          e(
                            "p",
                            {
                              className:
                                "text-[9px] font-bold text-gray-500 dark:text-gray-400 uppercase truncate",
                            },
                            "Ticket Prom.",
                          ),
                          e(
                            "p",
                            {
                              className:
                                "text-xs sm:text-sm font-black text-blue-800 dark:text-blue-300",
                            },
                            loadingCrm
                              ? "..."
                              : `$${Number(
                                  crmData?.averageTicketUSD ??
                                  crmData?.ticketPromedio ??
                                    crmData?.avgTicket ??
                                    ((crmData?.totalCompras ?? crmData?.compras ?? crmData?.totalOrders ?? 0) > 0
                                      ? (crmData?.ltv ?? crmData?.ltvTotal ?? crmData?.ltvUSD ?? crmData?.totalGastado ?? 0) /
                                        (crmData?.totalCompras ?? crmData?.compras ?? crmData?.totalOrders ?? 1)
                                      : 0),
                                ).toFixed(2)}`,
                          ),
                        ],
                      ),
                    ],
                  ),
                ],
              ),
            Boolean(order?.ctwaClid && order.ctwaClid.toString().trim()) &&
              e(
                "div",
                {
                  className:
                    "mt-4 p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 rounded-xl flex items-center justify-between",
                },
                [
                  e("div", { className: "flex items-center gap-2.5 overflow-hidden" }, [
                    e(
                      "div",
                      {
                        className:
                          "w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm",
                      },
                      e("i", { className: "fab fa-meta text-sm" }),
                    ),
                    e("div", { className: "overflow-hidden" }, [
                      e(
                        "p",
                        {
                          className:
                            "text-[10px] font-black uppercase tracking-wider text-blue-800 dark:text-blue-300",
                        },
                        "Origen: Anuncio Meta (CTWA)",
                      ),
                      e(
                        "p",
                        {
                          className:
                            "text-xs font-mono text-gray-500 dark:text-gray-400 truncate max-w-[200px] sm:max-w-xs",
                          title: order.ctwaClid,
                        },
                        `clid: ${order.ctwaClid}`,
                      ),
                    ]),
                  ]),
                  e(
                    "span",
                    {
                      className:
                        "px-2 py-0.5 rounded text-[10px] font-extrabold bg-blue-600 text-white uppercase tracking-wider flex-shrink-0",
                    },
                    "Convertido",
                  ),
                ],
              ),
          ]),
          (isEditing || order?.ubicacion?.direccion || order?.cliente?.direccion || order?.direccion) &&
            e("div", null, [
              e(
                "p",
                {
                  className:
                    "text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2",
                },
                "📍 Dirección de Entrega",
              ),
              isEditing
                ? e("textarea", {
                    value: editForm?.ubicacion?.direccion || editForm?.direccion || "",
                    onChange: (ev) => setEditForm(prev => ({ ...prev, ubicacion: { ...prev.ubicacion, direccion: ev.target.value } })),
                    className: "w-full p-2 border rounded-lg text-sm min-h-[80px] dark:bg-gray-700 dark:border-gray-600 dark:text-white",
                    placeholder: "Dirección"
                  })
                : e(
                    "p",
                    {
                      className:
                        "text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-3",
                    },
                    order.ubicacion?.direccion || order.cliente?.direccion || order.direccion,
                  ),
              order.ubicacion?.latitud &&
                order.ubicacion?.longitud &&
                e(
                  "a",
                  {
                    href: `https://www.google.com/maps/search/?api=1&query=${order.ubicacion.latitud},${order.ubicacion.longitud}`,
                    target: "_blank",
                    className:
                      "inline-flex items-center gap-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-lg text-xs font-bold transition w-fit",
                  },
                  [
                    e("i", { className: "fas fa-map-marked-alt text-red-500" }),
                    "Ver en Google Maps",
                  ],
                ),
            ]),
        ]),
        // Sección Método de Envío
        e("div", { className: "bg-gray-50 dark:bg-gray-700/30 p-4 rounded-xl border border-gray-100 dark:border-gray-700 space-y-3" }, [
          e("div", { className: "flex justify-between items-center" }, [
            e("div", { className: "flex items-center gap-2" }, [
              e("i", { className: "fas fa-truck text-emerald-600 dark:text-emerald-400 text-xs" }),
              e("span", { className: "text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest" }, "Método de Entrega / Envío"),
            ]),
            !["entregado", "cancelado", "anulado"].includes(order?.estado) &&
              e("button", {
                type: "button",
                onClick: () => setIsChangingShipping(prev => !prev),
                className: "text-xs font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 underline cursor-pointer",
              }, isChangingShipping ? "Cancelar cambio" : "Cambiar Envío"),
          ]),
          
          // Información actual del envío
          e("div", { className: "text-sm text-gray-700 dark:text-gray-200" }, [
            order?.envio?.nombre
              ? e("div", { className: "space-y-1" }, [
                  e("p", { className: "font-bold flex items-center justify-between" }, [
                    e("span", null, order.envio.nombre),
                    e("span", { className: "text-xs px-2 py-0.5 rounded font-black bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400" },
                      order.envio.tipo === "retiro"
                        ? "Retiro (Gratis)"
                        : (order.envio.costoAcordado
                            ? `$${Number(order.envio.costo).toFixed(2)} USD (Acordado con asesor)`
                            : (order.envio.aConvenir
                                ? "A convenir con asesor"
                                : `$${Number(order.envio.costo || 0).toFixed(2)} USD`
                              )
                          )
                    ),
                  ]),
                  order.envio.tipo === "retiro" && order.envio.direccion &&
                    e("p", { className: "text-xs text-gray-500 dark:text-gray-400 italic" }, `📍 Punto: ${order.envio.direccion}`),
                  order.envio.tipo === "retiro" && order.envio.horario &&
                    e("p", { className: "text-xs text-gray-500 dark:text-gray-400 italic" }, `🕒 Horario: ${order.envio.horario}`),
                ])
              : e("p", { className: "text-xs text-gray-400 italic" }, "Sin método de envío seleccionado"),
          ]),

          // Formulario para cambiar el envío (si está activo el modo cambio)
          isChangingShipping &&
            e("div", { className: "pt-3 border-t dark:border-gray-600 space-y-3" }, [
              e("div", null, [
                e("label", { className: "text-[10px] font-bold text-gray-500 block mb-1 uppercase" }, "Selecciona Nuevo Método"),
                e("select", {
                  value: selectedShippingId,
                  onChange: (ev) => {
                    const id = ev.target.value;
                    setSelectedShippingId(id);
                    const m = shippingMethods.find((item) => String(item._id) === String(id));
                    if (m && m.costoTipo === "fijo") {
                      setCustomShippingCost(Number(m.costo) || 0);
                    } else if (m && m.costoTipo === "a_convenir") {
                      setCustomShippingCost(Number(order.envio?.costo) || 0);
                    }
                  },
                  className: "w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white outline-none",
                }, [
                  e("option", { key: "none", value: "" }, "-- Seleccionar método --"),
                  ...shippingMethods.map((m) =>
                    e("option", { key: m._id, value: m._id },
                      `${m.nombre} (${m.tipo === "retiro" ? "Retiro Gratis" : (m.costoTipo === "fijo" ? `$${Number(m.costo).toFixed(2)}` : "A convenir")})`
                    )
                  ),
                ]),
              ]),
              (() => {
                const sel = shippingMethods.find((m) => String(m._id) === String(selectedShippingId));
                if (sel && sel.costoTipo === "a_convenir") {
                  return e("div", null, [
                    e("label", { className: "text-[10px] font-bold text-gray-500 block mb-1 uppercase" }, "Costo Acordado con el Cliente ($ USD)"),
                    e("input", {
                      type: "number",
                      min: "0",
                      step: "0.01",
                      value: customShippingCost,
                      onChange: (ev) => setCustomShippingCost(parseFloat(ev.target.value) || 0),
                      className: "w-full p-2 border rounded-lg text-sm bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white outline-none",
                    }),
                  ]);
                }
                return null;
              })(),
              e("label", { className: "flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer" }, [
                e("input", {
                  type: "checkbox",
                  checked: notifyCustomerShipping,
                  onChange: (ev) => setNotifyCustomerShipping(ev.target.checked),
                  className: "w-4 h-4 text-emerald-600 rounded",
                }),
                "Avisar al cliente por WhatsApp con el nuevo total",
              ]),
              e("div", { className: "flex justify-end gap-2 pt-1" }, [
                e("button", {
                  type: "button",
                  onClick: handleSaveShipping,
                  disabled: savingShipping || !selectedShippingId,
                  className: "px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow transition disabled:opacity-50 cursor-pointer",
                }, savingShipping ? "Guardando..." : "Guardar Cambio de Envío"),
              ]),
            ]),
        ]),
        e("div", null, [
          e(
            "p",
            {
              className:
                "text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 border-b pb-2 dark:border-gray-700",
            },
            "🛒 Detalle de Productos",
          ),
          e("div", { className: "space-y-4" }, [
            ((isEditing ? editForm?.items : order?.items) || []).length > 0
              ? (isEditing ? editForm.items : order.items).map((item, idx) => {
                  const unitPrice = Number(item.price || item.precio || 0);
                  const qty = Number(item.cantidad || 0);
                  const subtotal = item.subtotal ? Number(item.subtotal) : unitPrice * qty;
                  return e(
                    "div",
                    { key: idx, className: "flex justify-between items-center group" },
                    [
                      e("div", { className: "flex items-center gap-4" }, [
                        isEditing
                          ? e("input", {
                              type: "number",
                              min: "1",
                              value: qty,
                              onChange: (ev) => {
                                const newItems = [...editForm.items];
                                newItems[idx].cantidad = Number(ev.target.value);
                                newItems[idx].subtotal = Number(ev.target.value) * unitPrice;
                                setEditForm(prev => ({ ...prev, items: newItems }));
                              },
                              className: "w-16 p-1 border rounded text-center text-sm dark:bg-gray-700 dark:text-white"
                            })
                          : e(
                              "span",
                              {
                                className: "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 w-8 h-8 flex items-center justify-center rounded-lg font-black text-xs border border-emerald-200 dark:border-emerald-500/30",
                              },
                              qty,
                            ),
                        e("div", null, [
                          e("p", { className: "font-bold text-gray-800 dark:text-gray-100" }, item.producto),
                          e("p", { className: "text-[12px] text-gray-500" }, `@ $${unitPrice.toFixed(2)} c/u`),
                        ]),
                      ]),
                      e("div", { className: "flex items-center gap-3" }, [
                        e("span", { className: "font-black text-gray-800 dark:text-gray-100" }, `$${subtotal.toFixed(2)}`),
                        isEditing && e("button", {
                          onClick: () => {
                            const newItems = editForm.items.filter((_, i) => i !== idx);
                            setEditForm(prev => ({ ...prev, items: newItems }));
                          },
                          className: "text-red-500 hover:text-red-700 p-1 rounded-full bg-red-50"
                        }, e("i", { className: "fas fa-trash-alt" }))
                      ])
                    ],
                  );
                })
              : e(
                  "div",
                  {
                    className:
                      "p-4 bg-gray-50 dark:bg-gray-900 rounded-xl text-center",
                  },
                  [
                    e(
                      "p",
                      { className: "text-sm text-gray-500 italic" },
                      order?.productos ||
                        "No hay detalles de items disponibles",
                    ),
                  ],
                ),
          ]),
        ]),
        e(
          "div",
          {
            className:
              "bg-gray-50 dark:bg-gray-900/50 p-6 rounded-[2rem] border border-gray-100 dark:border-gray-700",
          },
          [
            e("div", { className: "flex justify-between items-center mb-6" }, [
              e("div", null, [
                e(
                  "p",
                  {
                    className:
                      "text-[10px] font-black text-gray-400 uppercase mb-1",
                  },
                  "Método de Pago",
                ),
                e(
                  "p",
                  {
                    className:
                      "text-lg font-black text-gray-700 dark:text-gray-200 flex items-center gap-2",
                  },
                  isEfectivo
                    ? [
                        e("i", {
                          className: "fas fa-money-bill-wave text-emerald-500",
                        }),
                        "Efectivo",
                      ]
                    : [
                        e("i", {
                          className: "fas fa-credit-card text-blue-500",
                        }),
                        metodoNombre.toUpperCase(),
                      ],
                ),
              ]),
              e("div", { className: "text-right" }, [
                e(
                  "p",
                  {
                    className:
                      "text-[10px] font-black text-gray-400 uppercase mb-1",
                  },
                  "Total General",
                ),
                e(
                  "p",
                  {
                    className:
                      "text-4xl font-black text-emerald-600 dark:text-emerald-400",
                  },
                  `$${Number(order?.pago?.montoUSD || order?.total || 0).toFixed(2)}`,
                ),
              ]),
            ]),
            e(
              "div",
              {
                className:
                  "grid grid-cols-2 gap-4 pt-4 border-t dark:border-gray-700",
              },
              [
                e("div", null, [
                  e(
                    "p",
                    {
                      className:
                        "text-[9px] font-black text-gray-400 uppercase",
                    },
                    "Monto en Bolívares",
                  ),
                  e(
                    "p",
                    {
                      className:
                        "text-sm font-bold text-gray-600 dark:text-gray-400",
                    },
                    `Bs. ${(order?.pago?.montoVES || order?.totalBs || 0).toLocaleString("es-VE", { minimumFractionDigits: 2 })}`,
                  ),
                ]),
                isEfectivo &&
                  e("div", { className: "text-right" }, [
                    e(
                      "p",
                      {
                        className:
                          "text-[9px] font-black text-gray-400 uppercase",
                      },
                      "Vuelto Pendiente",
                    ),
                    e(
                      "p",
                      { className: "text-sm font-black text-orange-600" },
                      `$${Number(order?.pago?.vuelto || order?.vuelto || 0).toFixed(2)}`,
                    ),
                  ]),
              ],
            ),
            // Registro Contable para Pago Mixto
            (order?.pago?.pagoEfectivo > 0 ||
              order?.pago?.pagoDigitalVES > 0) &&
              e(
                "div",
                {
                  className:
                    "mt-4 pt-4 border-t border-dashed dark:border-gray-700 space-y-2",
                },
                [
                  e(
                    "p",
                    {
                      className:
                        "text-[10px] font-black text-gray-400 uppercase mb-2",
                    },
                    "🧾 Registro Contable",
                  ),
                  e(
                    "div",
                    {
                      className:
                        "flex justify-between items-center bg-gray-100/50 dark:bg-gray-800/50 p-2 rounded-lg",
                    },
                    [
                      e(
                        "span",
                        { className: "text-[11px] font-bold text-gray-500" },
                        "Ingreso Caja ($):",
                      ),
                      e(
                        "span",
                        {
                          className:
                            "text-xs font-bold text-gray-700 dark:text-gray-300",
                        },
                        `$${Number(order?.pago?.pagoEfectivo || 0).toFixed(2)}`,
                      ),
                    ],
                  ),
                  e(
                    "div",
                    {
                      className:
                        "flex justify-between items-center bg-gray-100/50 dark:bg-gray-800/50 p-2 rounded-lg",
                    },
                    [
                      e(
                        "span",
                        { className: "text-[11px] font-bold text-gray-500" },
                        "Ingreso Banco (Bs):",
                      ),
                      e(
                        "span",
                        {
                          className:
                            "text-xs font-bold text-gray-700 dark:text-gray-300",
                        },
                        `Bs. ${Number(order?.pago?.pagoDigitalVES || 0).toLocaleString("es-VE", { minimumFractionDigits: 2 })}`,
                      ),
                    ],
                  ),
                ],
              ),
            
            // Comprobante de Pago (Imagen)
            order?.pago?.comprobanteUrl &&
              e(
                "div",
                {
                  className:
                    "mt-4 pt-4 border-t border-dashed dark:border-gray-700 space-y-2",
                },
                [
                  e(
                    "p",
                    {
                      className:
                        "text-[10px] font-black text-gray-400 uppercase mb-2",
                    },
                    "🖼️ Comprobante Adjunto",
                  ),
                  e(
                    "a",
                    {
                      href: order.pago.comprobanteUrl,
                      target: "_blank",
                      className: "block hover:opacity-80 transition cursor-pointer"
                    },
                    e("img", {
                      src: order.pago.comprobanteUrl,
                      alt: "Comprobante",
                      className: "w-full max-h-48 object-contain rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                    })
                  )
                ]
              ),
          ],
        ),
        (isEditing || order?.observaciones || order?.notas) &&
          e("div", null, [
            e(
              "p",
              {
                className:
                  "text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2",
              },
              "📝 Notas del Pedido",
            ),
            isEditing
              ? e("textarea", {
                  value: editForm?.notas || editForm?.observaciones || "",
                  onChange: (ev) => setEditForm(prev => ({ ...prev, notas: ev.target.value })),
                  className: "w-full p-3 border rounded-lg text-sm min-h-[60px] dark:bg-gray-700 dark:border-gray-600 dark:text-white bg-yellow-50 dark:bg-yellow-900/20",
                  placeholder: "Notas o instrucciones..."
                })
              : e(
                  "div",
                  {
                    className:
                      "p-4 bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 text-sm text-yellow-800 dark:text-yellow-200 italic",
                  },
                  order.observaciones || order.notas,
                ),
          ]),
        isEditing && e("div", { className: "mt-4 bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/30" }, [
          e("p", { className: "text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-2" }, "📎 Subir o Reemplazar Comprobante de Pago"),
          e("input", {
            type: "file",
            accept: "image/*",
            onChange: (ev) => {
              if (ev.target.files && ev.target.files[0]) {
                setComprobanteFile(ev.target.files[0]);
              }
            },
            className: "w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
          })
        ]),
        showDeleteBtn &&
          e(
            "div",
            { className: "pt-2" },
            e(
              "button",
              {
                onClick: () => onDelete(order._id),
                disabled: deleting,
                title:
                  "Eliminar este pedido definitivamente (usar solo para pedidos de prueba)",
                className:
                  "w-full px-6 py-3 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-600/20 active:scale-95 transition flex items-center justify-center gap-2 hover:bg-red-700 disabled:opacity-50",
              },
              [
                e("i", { className: "fas fa-trash-alt" }),
                deleting ? "Eliminando..." : "Eliminar Pedido",
              ],
            ),
          ),
      ]),
      e(
        "div",
        {
          className: (hasActions || isEditing)
            ? "p-6 md:p-8 bg-gray-50 dark:bg-gray-800/80 border-t dark:border-gray-700 flex flex-col sm:flex-row gap-3 flex-shrink-0"
            : "p-6 md:p-8 bg-gray-50 dark:bg-gray-800/80 border-t dark:border-gray-700 flex flex-col gap-3 flex-shrink-0",
        },
        isEditing ? [
          e("button", {
            onClick: () => setIsEditing(false),
            disabled: saving,
            className: "flex-1 px-6 py-4 border-2 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition active:scale-95"
          }, "Cancelar"),
          e("button", {
            onClick: handleSaveEdit,
            disabled: saving,
            className: "flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition flex items-center justify-center gap-2"
          }, [
            saving ? e("i", { className: "fas fa-spinner fa-spin" }) : e("i", { className: "fas fa-save" }),
            saving ? "Guardando..." : "Guardar Cambios"
          ])
        ] : [
          e(
            "button",
            {
              onClick: onClose,
              className: hasActions
                ? "flex-1 px-6 py-4 border-2 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition active:scale-95"
                : "w-full px-6 py-4 border-2 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 transition active:scale-95",
            },
            "Cerrar",
          ),
          showVerifyBtn &&
            e(
              "button",
              {
                onClick: () => {
                  onUpdateStatus(order._id, "verificado");
                  onClose();
                },
                className:
                  "flex-[2] bg-orange-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-orange-500/20 active:scale-95 transition flex items-center justify-center gap-2",
              },
              [e("i", { className: "fas fa-check-double" }), "Confirmar Pago"],
            ),
          showRouteBtn &&
            e(
              "button",
              {
                onClick: () => {
                  onUpdateStatus(order._id, "en_ruta");
                  onClose();
                },
                className:
                  "flex-[2] bg-blue-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition flex items-center justify-center gap-2",
              },
              [e("i", { className: "fas fa-truck" }), "Despachar Pedido"],
            ),
          showDeliverBtn &&
            e(
              "button",
              {
                onClick: () => {
                  onUpdateStatus(order._id, "entregado");
                  onClose();
                },
                className:
                  "flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/20 active:scale-95 transition flex items-center justify-center gap-2",
              },
              [
                e("i", { className: "fas fa-flag-checkered" }),
                "Marcar como Entregado",
              ],
            ),
        ],
      ),
    ),
  );
};

export default OrderDetailsModal;
