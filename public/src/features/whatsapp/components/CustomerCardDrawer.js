import { Icono } from "../../../components/Icono.js";
// public/src/features/whatsapp/components/CustomerCardDrawer.js
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
const e = React.createElement;

const CustomerCardDrawer = ({
  isOpen,
  onClose,
  context,
  loading,
  onAssignDriver,
  onRefreshContext
}) => {
  const [comprobanteModalOpen, setComprobanteModalOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [assigningDriver, setAssigningDriver] = useState(false);

  useEffect(() => {
    if (context?.pedidoActivo?.repartidor) {
      setSelectedDriver(context.pedidoActivo.repartidor);
    } else {
      setSelectedDriver("");
    }
  }, [context]);

  // Manejador de tecla Escape para cerrar modales
  useEffect(() => {
    const handleKeyDown = (ev) => {
      if (ev.key === "Escape") {
        if (comprobanteModalOpen) {
          setComprobanteModalOpen(false);
          setZoomLevel(1);
        } else if (isOpen) {
          onClose();
        }
      }
    };
    if (isOpen || comprobanteModalOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, comprobanteModalOpen, onClose]);

  if (!isOpen) return null;

  const data = context || {};
  const {
    customerName,
    telefono,
    cedula,
    direccion,
    totalCompras = 0,
    ltvUSD = 0,
    items = [],
    pasoActual = "inicio",
    etiqueta,
    totalUSD,
    totalBS,
    tasaBCV,
    pedidoActivo,
    repartidores = []
  } = data;

  const handleAssignClick = async () => {
    if (!pedidoActivo?._id || !selectedDriver) return;
    try {
      setAssigningDriver(true);
      if (onAssignDriver) {
        await onAssignDriver(pedidoActivo._id, selectedDriver);
      }
    } finally {
      setAssigningDriver(false);
    }
  };

  const openGoogleMaps = () => {
    if (!direccion) return;
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  // Render modal de comprobante con zoom
  const renderComprobanteModal = () => {
    if (!comprobanteModalOpen) return null;
    const mediaId = pedidoActivo?.comprobanteMediaId;
    const mediaUrl = pedidoActivo?.comprobanteUrl || (mediaId ? `/api/admin/media/${mediaId}` : null);

    return e("div", {
      className: "fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 backdrop-blur-md",
      onClick: () => {
        setComprobanteModalOpen(false);
        setZoomLevel(1);
      }
    }, [
      e("div", {
        className: "absolute top-4 right-4 flex items-center gap-3 z-10",
        onClick: (ev) => ev.stopPropagation()
      }, [
        e("button", {
          onClick: () => setZoomLevel((z) => Math.min(z + 0.5, 3)),
          className: "bg-white/20 hover:bg-white/30 text-white w-10 h-10 rounded-full flex items-center justify-center transition shadow-lg",
          title: "Aumentar zoom"
        }, e(Icono, { nombre: "zoom-in", className: "text-sm" })),
        e("button", {
          onClick: () => setZoomLevel((z) => Math.max(z - 0.5, 1)),
          className: "bg-white/20 hover:bg-white/30 text-white w-10 h-10 rounded-full flex items-center justify-center transition shadow-lg",
          title: "Reducir zoom"
        }, e(Icono, { nombre: "zoom-out", className: "text-sm" })),
        e("button", {
          onClick: () => {
            setComprobanteModalOpen(false);
            setZoomLevel(1);
          },
          className: "bg-red-600 hover:bg-red-700 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold transition shadow-lg text-lg",
          title: "Cerrar visor"
        }, e(Icono, { nombre: "x" }))
      ]),
      mediaUrl && e("div", {
        className: "overflow-auto max-h-[85vh] max-w-[90vw] flex items-center justify-center",
        onClick: (ev) => ev.stopPropagation()
      }, [
        e("img", {
          src: mediaUrl,
          alt: "Comprobante de pago",
          style: { transform: `scale(${zoomLevel})`, transition: "transform 0.2s ease-out" },
          className: "max-h-[80vh] max-w-[85vw] object-contain rounded-lg shadow-2xl"
        })
      ])
    ]);
  };

  // Contenido interno de la ficha en Dark Mode
  const drawerContent = e("div", { className: "flex flex-col h-full bg-[#111b21] text-[#e9edef] overflow-y-auto" }, [
    // Header Dark WhatsApp
    e("div", { className: "p-3.5 bg-[#202c33] text-[#e9edef] flex justify-between items-center sticky top-0 z-10 border-b border-[#2a3942] shadow-md" }, [
      e("div", { className: "flex items-center gap-2.5" }, [
        e("div", { className: "w-9 h-9 rounded-full bg-[#00a884] text-[#111b21] flex items-center justify-center font-black text-base shadow-sm" }, [
          e(Icono, { nombre: "id-card" })
        ]),
        e("div", null, [
          e("h3", { className: "font-black text-sm tracking-tight text-[#e9edef]" }, "Ficha del Cliente"),
          e("p", { className: "text-xs font-semibold text-[#00a884]" }, telefono || "---")
        ])
      ]),
      e("div", { className: "flex items-center gap-1.5" }, [
        onRefreshContext && e("button", {
          onClick: onRefreshContext,
          className: "text-[#8696a0] hover:text-[#00a884] p-2 rounded-lg hover:bg-[#111b21] transition text-xs",
          title: "Refrescar datos"
        }, e(Icono, { nombre: "refresh-cw" })),
        e("button", {
          onClick: onClose,
          className: "text-[#8696a0] hover:text-[#e9edef] p-2 rounded-lg hover:bg-[#111b21] transition text-sm font-black",
          title: "Cerrar ficha"
        }, e(Icono, { nombre: "x" }))
      ])
    ]),

    // Body Dark
    e("div", { className: "p-3.5 space-y-3 flex-1 text-sm" }, [
      loading && e("div", { className: "flex items-center justify-center py-6 text-[#00a884] gap-2 text-xs font-bold bg-[#202c33] rounded-xl border border-[#2a3942]" }, [
        e(Icono, { nombre: "loader-circle", girar: true, className: "text-sm" }),
        " Cargando información..."
      ]),

      // 1. SECCIÓN CLIENTE (Dark Card)
      e("div", { className: "bg-[#202c33] p-3.5 rounded-xl border border-[#2a3942] shadow-sm space-y-2" }, [
        e("h4", { className: "text-xs font-black text-[#00a884] uppercase tracking-wider flex items-center gap-1.5" }, [
          e(Icono, { nombre: "user-check" }),
          "Datos del Cliente"
        ]),
        e("div", { className: "space-y-2 text-xs pt-1" }, [
          e("div", { className: "flex justify-between items-center py-1 border-b border-[#2a3942]/60" }, [
            e("span", { className: "text-[#8696a0] font-semibold" }, "Nombre:"),
            e("span", { className: "font-black text-[#e9edef] text-right text-[13px]" }, customerName || "Sin registrar")
          ]),
          e("div", { className: "flex justify-between items-center py-1 border-b border-[#2a3942]/60" }, [
            e("span", { className: "text-[#8696a0] font-semibold" }, "Cédula:"),
            e("span", { className: "font-bold text-[#e9edef] text-right" }, cedula || "No registrada")
          ]),
          e("div", { className: "flex justify-between items-start py-1" }, [
            e("span", { className: "text-[#8696a0] font-semibold shrink-0" }, "Dirección:"),
            e("span", { className: "font-semibold text-[#e9edef] text-right break-words pl-3 leading-tight" }, direccion || "No registrada")
          ]),
          direccion && e("button", {
            onClick: openGoogleMaps,
            className: "w-full mt-2 bg-[#00a884] hover:bg-[#008069] active:scale-[0.98] text-[#111b21] font-black text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition shadow-md"
          }, [
            e(Icono, { nombre: "map", className: "text-sm" }),
            "Abrir en Google Maps"
          ])
        ])
      ]),

      // 2. SECCIÓN HISTORIAL DE COMPRAS (Dark Card con Alto Contraste)
      e("div", { className: "bg-[#202c33] p-3.5 rounded-xl border border-[#2a3942] shadow-sm space-y-2.5" }, [
        e("h4", { className: "text-xs font-black text-[#00a884] uppercase tracking-wider flex items-center gap-1.5" }, [
          e(Icono, { nombre: "chart-pie" }),
          "Historial de Compras"
        ]),
        e("div", { className: "grid grid-cols-2 gap-2.5" }, [
          e("div", { className: "bg-[#111b21] p-3 rounded-xl text-center border border-[#2a3942] shadow-inner" }, [
            e("p", { className: "text-[10px] text-[#8696a0] font-black uppercase tracking-wider" }, "Compras"),
            e("p", { className: "text-xl font-black text-[#e9edef] mt-0.5 tracking-tight" }, totalCompras)
          ]),
          e("div", { className: "bg-[#111b21] p-3 rounded-xl text-center border border-[#2a3942] shadow-inner" }, [
            e("p", { className: "text-[10px] text-[#8696a0] font-black uppercase tracking-wider" }, "Total Gastado"),
            e("p", { className: "text-xl font-black text-[#00a884] mt-0.5 tracking-tight" }, `$${Number(ltvUSD).toFixed(2)}`)
          ])
        ])
      ]),

      // 3. SECCIÓN CARRITO EN VIVO (Dark Card)
      e("div", { className: "bg-[#202c33] p-3.5 rounded-xl border border-[#2a3942] shadow-sm space-y-2.5" }, [
        e("div", { className: "flex justify-between items-center" }, [
          e("h4", { className: "text-xs font-black text-[#00a884] uppercase tracking-wider flex items-center gap-1.5" }, [
            e(Icono, { nombre: "shopping-basket", className: "text-amber-400" }),
            "Carrito en Vivo"
          ]),
          pasoActual && e("span", {
            className: "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-tight"
          }, pasoActual.replace("_", " "))
        ]),
        items.length === 0 ? e("p", { className: "text-xs text-[#8696a0] font-semibold italic text-center py-3 bg-[#111b21] rounded-lg border border-[#2a3942]" }, "Carrito vacío actualmente") : e("div", { className: "space-y-1.5" }, [
          ...items.map((it, idx) => e("div", {
            key: `cart-item-${idx}`,
            className: "flex justify-between items-center text-xs py-1.5 border-b border-[#2a3942]/60 last:border-0"
          }, [
            e("span", { className: "text-[#e9edef] font-bold" }, `${it.producto || it.name || "Producto"} x${it.cantidad || 1}`),
            e("span", { className: "font-black text-[#e9edef] text-right" }, `$${((Number(it.price) || 0) * (Number(it.cantidad) || 1)).toFixed(2)}`)
          ])),
          e("div", { className: "pt-2.5 mt-1 border-t border-[#2a3942] flex justify-between items-end" }, [
            e("div", null, [
              e("p", { className: "text-[11px] text-[#8696a0] font-bold" }, tasaBCV ? `Tasa BCV: Bs. ${Number(tasaBCV).toFixed(2)}` : ""),
              totalBS && e("p", { className: "text-xs font-black text-[#e9edef]" }, `Bs. ${totalBS}`)
            ]),
            e("div", { className: "text-right bg-[#00a884]/15 px-2.5 py-1 rounded-lg border border-[#00a884]/40" }, [
              e("span", { className: "text-xs text-[#00a884] font-bold mr-1" }, "Total:"),
              e("span", { className: "text-base font-black text-[#00a884]" }, totalUSD != null ? `$${Number(totalUSD).toFixed(2)}` : "---")
            ])
          ])
        ])
      ]),

      // 4. ACCIONES RÁPIDAS DEL PEDIDO ACTIVO
      pedidoActivo && e("div", { className: "bg-[#202c33] p-3.5 rounded-xl border border-[#2a3942] shadow-sm space-y-3" }, [
        e("div", { className: "flex justify-between items-center" }, [
          e("h4", { className: "text-xs font-black text-[#00a884] uppercase tracking-wider flex items-center gap-1.5" }, [
            e(Icono, { nombre: "zap", className: "text-indigo-400" }),
            `Pedido ${pedidoActivo.idFormateado}`
          ]),
          e("span", {
            className: "text-[10px] font-black px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 uppercase tracking-tight"
          }, pedidoActivo.estado)
        ]),

        // Botón Ver Comprobante
        (pedidoActivo.comprobanteMediaId || pedidoActivo.comprobanteUrl) && e("button", {
          onClick: () => {
            setZoomLevel(1);
            setComprobanteModalOpen(true);
          },
          className: "w-full bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] text-white font-black text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-2 transition shadow-md"
        }, [
          e(Icono, { nombre: "receipt", className: "text-sm" }),
          "Ver Comprobante con Zoom"
        ]),

        // Selector y Asignación de Repartidor
        e("div", { className: "pt-2 border-t border-[#2a3942]/60" }, [
          e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Asignar Repartidor:"),
          e("div", { className: "flex gap-1.5" }, [
            e("select", {
              value: selectedDriver,
              onChange: (ev) => setSelectedDriver(ev.target.value),
              className: "flex-1 bg-[#111b21] border border-[#2a3942] rounded-lg px-2.5 py-1.5 text-xs text-[#e9edef] font-bold outline-none focus:border-[#00a884]"
            }, [
              e("option", { value: "" }, "-- Sin asignar --"),
              ...repartidores.map((rep) => e("option", { key: rep._id, value: rep.username || rep.nombre }, `${rep.nombre} (@${rep.username})`))
            ]),
            e("button", {
              onClick: handleAssignClick,
              disabled: assigningDriver || !selectedDriver || selectedDriver === pedidoActivo.repartidor,
              className: "bg-[#00a884] hover:bg-[#008069] disabled:opacity-40 text-[#111b21] font-black text-xs px-3.5 py-1.5 rounded-lg transition shrink-0 shadow-sm"
            }, assigningDriver ? e(Icono, { nombre: "loader-circle", girar: true }) : "Guardar")
          ]),
          pedidoActivo.repartidor && e("p", { className: "text-xs font-bold text-[#00a884] mt-1.5 flex items-center gap-1.5 bg-[#00a884]/15 px-2 py-1 rounded-md border border-[#00a884]/30" }, [
            e(Icono, { nombre: "motorbike" }),
            `Asignado a: @${pedidoActivo.repartidor}`
          ])
        ])
      ])
    ])
  ]);

  return e(React.Fragment, null, [
    // 1. Vista Escritorio (Drawer Lateral Derecho Dark)
    e("div", {
      className: "hidden md:flex flex-col w-80 lg:w-96 border-l border-[#2a3942] bg-[#111b21] text-[#e9edef] h-full shadow-2xl z-20 shrink-0 transition-all duration-300 ease-in-out"
    }, drawerContent),

    // 2. Vista Móvil (Bottom Sheet Overlay Dark)
    e("div", {
      className: "md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/80 backdrop-blur-xs transition-opacity duration-300",
      onClick: onClose
    }, [
      e("div", {
        className: "bg-[#111b21] text-[#e9edef] rounded-t-2xl max-h-[88vh] shadow-2xl flex flex-col overflow-hidden animate-slide-up border-t border-[#2a3942]",
        onClick: (ev) => ev.stopPropagation()
      }, [
        // Handle barra táctil
        e("div", { className: "w-12 h-1.5 bg-[#2a3942] rounded-full mx-auto my-2 shrink-0" }),
        drawerContent
      ])
    ]),

    // 3. Modal de Zoom de Comprobante
    renderComprobanteModal()
  ]);
};

export default CustomerCardDrawer;
