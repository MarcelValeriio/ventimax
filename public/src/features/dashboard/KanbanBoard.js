import { Icono } from "../../components/Icono.js";
/**
 * public/src/features/dashboard/KanbanBoard.js
 * Tablero Operativo para Gestión de Pedidos (Priority 1) - Pure JS Version
 * Clean CSS transitions for smooth modal animations
 */
import React, {
  useEffect,
  useState,
  useRef,
} from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js";
import OrderDetailsModal from "../../components/OrderDetailsModal.js";

const formatCedula = (c) => {
  const v = (c || "").toString().trim();
  if (!v) return "";
  if (/^[vejgp][\s\-\.]*\d/i.test(v)) {
    return v.replace(/^([vejgp])[\s\-\.]*/i, (_, l) => l.toUpperCase() + "-");
  }
  return /^\d/.test(v) ? `V-${v}` : v;
};

const e = React.createElement;

const KanbanBoard = ({ socket, userRole, health }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTabCol, setActiveTabCol] = useState("pendiente_verificacion");
  const [stuckPhones, setStuckPhones] = useState([]);
  const [verifiedPendingCount, setVerifiedPendingCount] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [brandName, setBrandName] = useState(() => {
    if (typeof window !== "undefined" && window.BASE_TITLE) {
      const match = window.BASE_TITLE.split(" | ")[0];
      if (match) return match;
    }
    return "";
  });

  const [metodosPagoMap, setMetodosPagoMap] = useState({});

  useEffect(() => {
    apiClient
      .get("/api/config")
      .then((res) => {
        const name = res.data?.settings?.brandName || res.data?.brandName;
        if (name) setBrandName(name);
      })
      .catch(() => {});

    apiClient
      .get("/api/admin/payments")
      .then((res) => {
        if (res.data?.success && Array.isArray(res.data.data)) {
          const map = {};
          res.data.data.forEach((m) => {
            if (m._id) map[String(m._id)] = m;
          });
          setMetodosPagoMap(map);
        }
      })
      .catch(() => {});
  }, []);

  const StatusLED = ({ status, label, icon }) => {
    const colors = {
      connected: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]",
      disconnected: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]",
      error: "bg-orange-500 animate-pulse",
      unknown: "bg-gray-500",
      true: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]",
      false: "bg-red-500 animate-pulse",
    };
    const colorClass = colors[status] || colors.unknown;

    return e(
      "div",
      { className: "flex items-center gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-700/50 rounded-full border border-gray-100 dark:border-gray-700 group relative cursor-help" },
      e("div", { className: `w-2 h-2 rounded-full ${colorClass}` }),
      e(Icono, { nombre: icon, className: "text-[10px] text-gray-400 group-hover:text-emerald-500 transition-colors" }),
      e(
        "span",
        {
          className:
            "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50",
        },
        `${label}: ${status === true || status === "connected" ? "En Línea" : "Desconectado"}`,
      ),
    );
  };

  const ALL_COLUMNS = [
    {
      id: "pendiente_verificacion",
      title: "Por Verificar",
      icon: "clock",
      color: "bg-yellow-100 text-yellow-800",
      accent: "border-yellow-500",
    },
    {
      id: "verificado",
      title: "Verificado",
      icon: "circle-check",
      color: "bg-orange-100 text-orange-800",
      accent: "border-orange-500",
    },
    {
      id: "en_ruta",
      title: "En Ruta",
      icon: "truck",
      color: "bg-blue-100 text-blue-800",
      accent: "border-blue-500",
    },
    {
      id: "entregado",
      title: "Entregado",
      icon: "house",
      color: "bg-green-100 text-green-800",
      accent: "border-green-500",
    },
  ];

  const COLUMNS = ALL_COLUMNS.filter((col) => {
    if (userRole === "repartidor")
      return ["verificado", "en_ruta", "entregado"].includes(col.id);
    return true;
  });

  useEffect(() => {
    if (userRole === "repartidor") setActiveTabCol("verificado");
  }, [userRole]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const { data } = await apiClient.get("/api/admin/pedidos-historial");
      if (data.success) setOrders(data.data);
    } catch (error) {
      console.error("❌ Error cargando pedidos para Kanban:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (orderId, newStatus) => {
    try {
      const { data } = await apiClient.patch(
        `/api/admin/orders/${orderId}/status`,
        { estado: newStatus },
      );
      if (data.success) {
        setOrders((prev) =>
          prev.map((o) =>
            o._id === orderId ? { ...o, estado: newStatus } : o,
          ),
        );
        window.showToast?.(`Pedido actualizado a ${newStatus}`);
      }
    } catch (error) {
      alert("Error al actualizar el estado");
    }
  };

  const handleDeleteOrder = (orderId) => {
    setOrderToDelete(orderId);
  };

  const confirmDeleteOrder = async () => {
    if (!orderToDelete) return;
    setDeletingId(orderToDelete);
    try {
      const res = await apiClient.delete(`/api/admin/orders/${orderToDelete}`);
      if (res.data && res.data.success) {
        setOrders(prev => prev.filter(o => o._id !== orderToDelete));
        setIsModalOpen(false);
        setOrderToDelete(null);
        window.showToast?.("Pedido eliminado correctamente", "success");
      } else {
        window.showToast?.("Error al eliminar el pedido: " + (res.data.error || "Desconocido"), "error");
      }
    } catch (err) {
      window.showToast?.("Error de red al eliminar el pedido", "error");
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    fetchOrders();

    if (socket) {
      socket.on("pago_enviado_cliente", (newOrder) => {
        setOrders((prev) => {
          const exists = prev.find((o) => o._id === newOrder._id);
          if (exists)
            return prev.map((o) => (o._id === newOrder._id ? newOrder : o));
          return [newOrder, ...prev];
        });
      });

      socket.on("order_status_changed", (updated) => {
        setOrders((prev) =>
          prev.map((o) =>
            o._id === updated._id ? { ...o, estado: updated.estado } : o,
          ),
        );
        // Limpiar badge de verificados cuando se despacha o entrega
        if (["en_ruta", "entregado"].includes(updated.estado)) {
          setVerifiedPendingCount((prev) => Math.max(0, prev - 1));
        }
      });

      socket.on("pedido_actualizado", (data) => {
        setOrders((prev) =>
          prev.map((o) =>
            o._id === data._id ? { ...o, estado: data.estado } : o,
          ),
        );
      });

      socket.on("alerta_cliente_trabado", (data) =>
        setStuckPhones((prev) => [...new Set([...prev, data.telefono])]),
      );
      socket.on("alerta_orden_estancada", (data) => {
        setOrders((prev) => {
          const order = prev.find((o) => o._id === data.id);
          if (order && order.cliente?.telefono)
            setStuckPhones((sp) => [
              ...new Set([...sp, order.cliente.telefono]),
            ]);
          return prev;
        });
      });
      socket.on("bot_destrabado", (telefono) =>
        setStuckPhones((prev) => prev.filter((p) => p !== telefono)),
      );
      socket.on("alerta_pedido_verificado", (data) => {
        setVerifiedPendingCount(data.count);
      });
    }
    return () => {
      if (socket) {
        socket.off("pago_enviado_cliente");
        socket.off("order_status_changed");
        socket.off("pedido_actualizado");
        socket.off("alerta_cliente_trabado");
        socket.off("bot_destrabado");
        socket.off("alerta_pedido_verificado");
      }
    };
  }, [socket]);

  const handleOpenOrder = (order) => {
    setSelectedOrder(order);
    setIsModalOpen(true);
  };

  const handleCloseOrder = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedOrder(null), 300);
  };

  const handlePrintOrder = (order) => {
    if (!order) return;

    const correlativo = (order.correlativo || order._id || "---")
      .toString()
      .replace(/^#+/, "");
    const fecha = order.timestamp || order.fecha
      ? new Date(order.timestamp || order.fecha).toLocaleString("es-VE", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      : "---";

    const clienteNombre =
      order.cliente?.nombre || order.cliente || "Consumidor Final";
    const clienteCedula = order.cliente?.cedula
      ? formatCedula(order.cliente.cedula)
      : "";
    const clienteTelefono =
      order.cliente?.telefono || order.telefono || order.whatsappId || "";
    const direccion =
      order.ubicacion?.direccion ||
      order.cliente?.direccion ||
      order.direccion ||
      "";
    const notas = order.notas || "";

    let metodoPago = "PENDIENTE";
    if (
      typeof order.pago?.metodo === "object" &&
      order.pago?.metodo?.nombre
    ) {
      metodoPago = order.pago.metodo.nombre;
    } else if (typeof order.pago?.metodo === "string") {
      metodoPago = order.pago.metodo;
    } else if (order.metodoPago || order.metodo) {
      metodoPago = order.metodoPago || order.metodo;
    }

    const totalUSD = Number(
      order.pago?.montoUSD || order.total || 0,
    ).toFixed(2);
    const totalVES = order.pago?.montoVES || order.totalBs;

    // Todo dato del pedido viene del cliente (WhatsApp/IG): se escapa antes de ir al HTML de la comanda.
    const esc = (valor) =>
      String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const itemsHtml =
      order.items && order.items.length > 0
        ? order.items
            .map((item) => {
              const qty = item.cantidad || 1;
              const name = item.producto || "Producto";
              const price = Number(item.price || item.precio || 0).toFixed(2);
              const subtotal = item.subtotal
                ? Number(item.subtotal).toFixed(2)
                : (qty * Number(item.price || item.precio || 0)).toFixed(2);
              return `
                <tr>
                  <td style="padding: 6px 0; vertical-align: top; width: 45px;">${esc(qty)}x</td>
                  <td style="padding: 6px 10px; vertical-align: top;">${esc(name)}<br><small style="color: #666; font-size: 12px;">@ $${price}</small></td>
                  <td style="padding: 6px 0; text-align: right; vertical-align: top; width: 90px;">$${subtotal}</td>
                </tr>
              `;
            })
            .join("")
        : `<tr><td colspan="3" style="padding: 6px 0; font-style: italic;">${esc(order.productos || "Sin items detallados")}</td></tr>`;

    const printContainer = document.createElement("div");
    printContainer.style.width = "650px";
    printContainer.style.padding = "20px";
    printContainer.style.fontFamily = "'Courier New', Courier, monospace";
    printContainer.style.fontSize = "14px";
    printContainer.style.color = "#000";
    printContainer.style.backgroundColor = "#fff";
    printContainer.style.lineHeight = "1.4";
    printContainer.style.boxSizing = "border-box";

    printContainer.innerHTML = `
      <div style="text-align: center; margin-bottom: 16px; border-bottom: 1px dashed #000; padding-bottom: 12px;">
        <h2 style="margin: 0; font-size: 18px; font-weight: bold; text-transform: uppercase;">Comanda de Pedido${brandName ? ` ${esc(brandName)}` : ""}</h2>
        <h1 style="margin: 6px 0; font-size: 28px; font-weight: 900;">#${esc(correlativo)}</h1>
        ${order.ctwaClid ? `<div style="margin: 4px auto 6px auto; display: inline-block; font-size: 11px; font-weight: bold; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 2px 8px; border-radius: 4px;">META AD (CTWA)</div>` : ""}
        ${order.origenWeb?.codigo ? `<div style="margin: 4px auto 6px auto; display: inline-block; font-size: 11px; font-weight: bold; background: #fef3c7; color: #92400e; border: 1px solid #fde68a; padding: 2px 8px; border-radius: 4px;">PEDIDO WEB: ${esc(order.origenWeb.codigo)}</div>` : ""}
        <p style="margin: 0; font-size: 13px; color: #333;">${esc(fecha)}</p>
      </div>

      <div style="margin-bottom: 14px; border-bottom: 1px dashed #000; padding-bottom: 10px; font-size: 14px;">
        <p style="margin: 0 0 4px 0;"><strong>Cliente:</strong> ${esc(typeof clienteNombre === "string" ? clienteNombre : "Consumidor Final")}</p>
        ${clienteCedula ? `<p style="margin: 0 0 4px 0;"><strong>Cédula:</strong> ${esc(clienteCedula)}</p>` : ""}
        ${clienteTelefono ? `<p style="margin: 0 0 4px 0;"><strong>Teléfono:</strong> ${esc(clienteTelefono)}</p>` : ""}
        ${direccion ? `<p style="margin: 0 0 4px 0;"><strong>Dirección:</strong> ${esc(direccion)}</p>` : ""}
        ${order.envio && order.envio.nombre ? `<p style="margin: 0 0 4px 0;"><strong>Envío:</strong> ${esc(order.envio.nombre)}${order.envio.costoAcordado ? ` ($${Number(order.envio.costo).toFixed(2)}, acordado con el asesor)` : (order.envio.aConvenir ? " (A convenir)" : (order.envio.costo ? ` ($${Number(order.envio.costo).toFixed(2)})` : ""))}</p>` : ""}
      </div>

      <div style="margin-bottom: 14px; border-bottom: 1px dashed #000; padding-bottom: 10px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="border-bottom: 1px solid #000; text-align: left;">
              <th style="padding-bottom: 6px;">Cant</th>
              <th style="padding-bottom: 6px; padding-left: 10px;">Desc</th>
              <th style="padding-bottom: 6px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>

      ${
        notas
          ? `
        <div style="margin-bottom: 14px; border-bottom: 1px dashed #000; padding-bottom: 10px; background: #f3f3f3; padding: 10px; border-radius: 4px;">
          <strong>NOTAS:</strong>
          <p style="margin: 4px 0 0 0; font-size: 14px; font-style: italic;">${esc(notas)}</p>
        </div>
      `
          : ""
      }

      <div style="margin-bottom: 16px; border-bottom: 1px dashed #000; padding-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; margin-bottom: 6px;">
          <span>TOTAL USD:</span>
          <span>$${totalUSD}</span>
        </div>
        ${
          order.envio && order.envio.nombre
            ? `
          <div style="display: flex; justify-content: space-between; font-size: 14px; color: #444; margin-bottom: 6px;">
            <span>Envío (${esc(order.envio.nombre)}):</span>
            <span>${order.envio.costoAcordado ? `$${Number(order.envio.costo || 0).toFixed(2)} (Acordado)` : (order.envio.aConvenir ? "A convenir" : `$${Number(order.envio.costo || 0).toFixed(2)}`)}</span>
          </div>
        `
            : ""
        }
        ${
          totalVES
            ? `
          <div style="display: flex; justify-content: space-between; font-size: 14px; color: #444; margin-bottom: 6px;">
            <span>Total Bs:</span>
            <span>Bs. ${Number(totalVES).toLocaleString("es-VE", { minimumFractionDigits: 2 })}</span>
          </div>
        `
            : ""
        }
        <div style="display: flex; justify-content: space-between; font-size: 14px; color: #444;">
          <span>Método de Pago:</span>
          <span style="font-weight: bold; text-transform: uppercase;">${esc(metodoPago)}</span>
        </div>
        ${
          order.pago?.vuelto
            ? `
          <div style="display: flex; justify-content: space-between; font-size: 14px; color: #c00; margin-top: 4px;">
            <span>Vuelto:</span>
            <span>$${Number(order.pago.vuelto).toFixed(2)}</span>
          </div>
        `
            : ""
        }
      </div>

      <div style="text-align: center; font-size: 12px; color: #666; margin-top: 10px;">
        <p style="margin: 0;">¡Gracias por su preferencia!</p>
      </div>
    `;

    // Nombre sugerido al guardar/imprimir: "Pedido #46 Nombre Cliente"
    const nombreArchivo = `Pedido #${correlativo} ${typeof clienteNombre === "string" ? clienteNombre : ""}`
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const opt = {
      margin: [10, 10, 10, 10],
      filename: `${nombreArchivo}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
    };

    const lib = window.html2pdf;
    if (typeof lib === "undefined") {
      window.print();
      return;
    }

    // Descarga directa: jsPDF usa <a download>, que respeta el nombre en todos los navegadores.
    const descargar = () => lib().set(opt).from(printContainer).save();

    // Móviles (iOS Safari, Android) no incrustan PDFs en iframes: se descarga directo.
    const esMovil =
      /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (esMovil) {
      descargar();
      return;
    }

    // Escritorio: visor en pestaña nueva (abierta de inmediato para no ser bloqueada).
    const win = window.open("", "_blank");
    if (!win) {
      descargar(); // popup bloqueado: descarga directa
      return;
    }
    const safeTitle = nombreArchivo
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
    win.document.title = nombreArchivo;

    lib()
      .set(opt)
      .from(printContainer)
      .outputPdf("blob")
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        try {
          win.document.open();
          win.document.write(
            `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>` +
              `<style>html,body{margin:0;height:100%;font-family:sans-serif}` +
              `.bar{height:40px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;background:#1f2937;color:#fff;font-size:14px}` +
              `.bar a{color:#fff;background:#059669;padding:6px 12px;border-radius:6px;text-decoration:none;font-weight:bold}` +
              `iframe{border:0;width:100%;height:calc(100% - 40px)}</style></head><body>` +
              `<div class="bar"><span>${safeTitle}</span>` +
              `<a href="${url}" download="${safeTitle}.pdf">Descargar PDF</a></div>` +
              `<iframe src="${url}" title="${safeTitle}"></iframe></body></html>`,
          );
          win.document.close();
        } catch (err) {
          win.close();
          descargar();
        }
      })
      .catch(() => {
        try { win.close(); } catch (_) {}
        descargar();
      });
  };

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === "Escape" && isModalOpen) handleCloseOrder();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isModalOpen]);



  return e(
    "div",
    {
      className:
        "flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-hidden",
    },
    e(
      "div",
      {
        className:
          "p-4 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center flex-shrink-0",
      },
      e(
        "div",
        { className: "flex items-center gap-3" },
        e(
          "h2",
          {
            className:
              "text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2",
          },
          e(Icono, { nombre: "columns-3", className: "text-emerald-500" }),
          e("span", { className: "hidden md:inline" }, "Tablero Operativo"),
        ),
        health && e(
          "div",
          { className: "hidden md:flex items-center gap-2 ml-4 border-l dark:border-gray-700 pl-4" },
          e(StatusLED, {
            status: health.socket,
            label: "Socket",
            icon: "plug",
          }),
          e(StatusLED, {
            status: health.whatsapp,
            label: "WhatsApp",
            icon: "smartphone",
          }),
          e(StatusLED, {
            status: health.mongodb,
            label: "Database",
            icon: "database",
          }),
        ),
      ),
      e(
        "button",
        {
          onClick: fetchOrders,
          className:
            "p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500",
          title: "Refrescar Tablero",
        },
        e(Icono, { nombre: "refresh-cw", girar: loading }),
      ),
    ),
    e(
      "div",
      {
        className:
          "lg:hidden flex border-b dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0 overflow-x-auto scrollbar-hide",
      },
      COLUMNS.map((col) =>
        e(
          "button",
          {
            key: col.id,
            onClick: () => setActiveTabCol(col.id),
            className: `flex-1 py-3 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-2 whitespace-nowrap ${activeTabCol === col.id ? "border-emerald-500 text-emerald-600 bg-emerald-50/30" : "border-transparent text-gray-400 hover:text-gray-600"}`,
          },
          e(Icono, { nombre: col.icon, className: "mr-2" }),
          col.title.split(" ")[0],
        ),
      ),
    ),
    e(
      "div",
      { className: "flex-1 flex flex-row overflow-x-auto gap-6 p-4 lg:p-6" },
      COLUMNS.map((col) =>
        e(
          "div",
          {
            key: col.id,
            className: `flex-shrink-0 w-full lg:w-[24%] min-w-[300px] bg-gray-100/50 dark:bg-gray-800/40 rounded-3xl flex flex-col h-full border border-gray-200 dark:border-gray-700 shadow-sm transition-all ${activeTabCol === col.id ? "block" : "hidden lg:flex"}`,
          },
          e(
            "div",
            {
              className: `p-4 rounded-t-3xl font-black text-xs uppercase tracking-widest flex justify-between items-center ${col.color} border-b-2 ${col.accent} flex-shrink-0`,
            },
            e(
              "span",
              { className: "flex items-center gap-2" },
              e(Icono, { nombre: col.icon }),
              col.title,
              col.id === "verificado" && verifiedPendingCount > 0 &&
                e(
                  "span",
                  {
                    className:
                      "animate-bounce bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full",
                    title: `${verifiedPendingCount} pedido(s) listo(s) para despachar`,
                  },
                  e(Icono, { nombre: "truck", className: "inline mr-1" }), verifiedPendingCount,
                ),
            ),
            e(
              "span",
              { className: "bg-white/50 px-2 py-1 rounded-full text-[10px]" },
              orders.filter((o) => {
                const s = (o.estado || o.status || "").toLowerCase();
                if (col.id === "pendiente_verificacion") {
                  return ["pendiente_verificacion", "por_verificar"].includes(s);
                }
                if (col.id === "verificado") {
                  return ["verificado", "confirmado"].includes(s);
                }
                return s === col.id;
              }).length,
            ),
          ),
          e(
            "div",
            { className: "flex-1 overflow-y-auto p-3 space-y-4" },
            orders
              .filter((o) => {
                const s = (o.estado || o.status || "").toLowerCase();
                if (col.id === "pendiente_verificacion") {
                  return ["pendiente_verificacion", "por_verificar"].includes(
                    s,
                  );
                }
                if (col.id === "verificado") {
                  return ["verificado", "confirmado"].includes(s);
                }
                return s === col.id;
              })
              .sort((a, b) => {
                const idA = parseInt(
                  (a.correlativo || "0").toString().replace(/\D/g, ""),
                  10,
                );
                const idB = parseInt(
                  (b.correlativo || "0").toString().replace(/\D/g, ""),
                  10,
                );
                return idA && idB
                  ? idB - idA
                  : new Date(b.timestamp) - new Date(a.timestamp);
              })
              .map((order) => {
                const isStuck = stuckPhones.includes(order.cliente?.telefono);
                return e(
                  "div",
                  {
                    key: order._id,
                    onClick: () => handleOpenOrder(order),
                    className: `bg-white dark:bg-gray-700 p-4 rounded-2xl shadow-sm border-l-4 border-emerald-500 hover:shadow-lg transition-all relative group cursor-pointer ${isStuck ? "animate-pulse ring-2 ring-red-500 bg-red-50/30 dark:bg-red-900/20" : ""}`,
                  },
                  isStuck &&
                    e(
                      "div",
                      {
                        className:
                          "absolute -top-2 -right-2 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center shadow-lg animate-bounce",
                      },
                      e(Icono, { nombre: "circle-alert", className: "text-[10px]" }),
                    ),
                  e(
                    "div",
                    { className: "flex justify-between items-start mb-3" },
                    [
                      e(
                        "div",
                        { className: "flex items-center gap-2 flex-wrap" },
                        [
                          e(
                            "span",
                            {
                              className:
                                "font-black text-gray-800 dark:text-gray-100 text-sm",
                            },
                            `#${(order.correlativo || "---").toString().replace(/^#+/, "")}`,
                          ),
                          Boolean(order.ctwaClid && order.ctwaClid.toString().trim()) &&
                            e(
                              "span",
                              {
                                className:
                                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
                                title: `Meta Ad (CTWA): ${order.ctwaClid}`,
                              },
                              e(Icono, { marca: "meta", className: "text-[9px]" }),
                              "Ad",
                            ),
                          Boolean(order.origenWeb?.codigo) &&
                            e(
                              "span",
                              {
                                className:
                                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800",
                                title: `Pedido Web: ${order.origenWeb.codigo}`,
                              },
                              e(Icono, { nombre: "globe", className: "text-[9px]" }),
                              "WEB",
                            ),
                          e(Icono, {
                              onClick: (ev) => {
                                ev.stopPropagation();
                                handlePrintOrder(order);
                              },
                              nombre: "printer", className: "text-gray-400 hover:text-blue-500 cursor-pointer text-xs p-1 transition-colors",
                              titulo: "Imprimir comanda",
                            },
                          ),
                        ],
                      ),
                      e(
                        "span",
                        {
                          className:
                            "text-[10px] font-bold text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded",
                        },
                        new Date(order.timestamp).toLocaleString("es-VE", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }),
                      ),
                    ],
                  ),
                  e(
                    "p",
                    {
                      className:
                        "text-sm font-bold text-gray-700 dark:text-gray-200 mb-1",
                    },
                    order.cliente?.nombre || "Sin nombre",
                  ),
                  e(
                    "p",
                    {
                      className:
                        "text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed mb-4 line-clamp-2",
                    },
                    order.items
                      ?.map((i) => `${i.producto} (x${i.cantidad})`)
                      .join(", "),
                  ),
                  order.envio?.nombre &&
                    e(
                      "p",
                      {
                        className:
                          "text-[10px] font-medium text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1",
                      },
                      e(Icono, { nombre: "truck", className: "text-[9px]" }),
                      `${order.envio.nombre}${order.envio.costoAcordado ? ` ($${Number(order.envio.costo).toFixed(2)}, acordado con el asesor)` : (order.envio.aConvenir ? " (A convenir)" : (order.envio.costo ? ` ($${Number(order.envio.costo).toFixed(2)})` : ""))}`,
                    ),
                  order.notas &&
                    e(
                      "div",
                      {
                        className:
                          "mb-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg",
                      },
                      [
                        e(
                          "p",
                          {
                            className:
                              "text-[10px] font-bold text-yellow-800 dark:text-yellow-400 uppercase flex items-center gap-1 mb-0.5",
                          },
                          [
                            e(Icono, { nombre: "sticky-note" }),
                            " Notas",
                          ]
                        ),
                        e(
                          "p",
                          {
                            className:
                              "text-[11px] text-gray-700 dark:text-gray-300 italic line-clamp-2",
                          },
                          order.notas
                        ),
                      ]
                    ),
                  e(
                    "div",
                    {
                      className:
                        "p-2.5 bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between items-center",
                    },
                    [
                    (() => {
                      const metodoInfo = (() => {
                        const m = order.pago?.metodo;
                        if (typeof m === "object" && m !== null) {
                          return {
                            nombre: m.nombre || "Sin método",
                            tipo: m.tipo || "",
                            esEfectivo: m.tipo === "efectivo" || (m.nombre && m.nombre.toLowerCase().includes("efectivo")),
                          };
                        }

                        if (!m) {
                          if (order.estado === "pendiente_pago" || order.estado === "inicio") {
                            return { nombre: "Pendiente", tipo: "", esEfectivo: false };
                          }
                          return { nombre: "Sin método", tipo: "", esEfectivo: false };
                        }

                        if (typeof m === "string" && metodosPagoMap[m]) {
                          const found = metodosPagoMap[m];
                          return {
                            nombre: found.nombre || "Sin método",
                            tipo: found.tipo || "",
                            esEfectivo: found.tipo === "efectivo" || (found.nombre && found.nombre.toLowerCase().includes("efectivo")),
                          };
                        }

                        const isID = typeof m === "string" && /^[0-9a-fA-F]{24}$/.test(m);
                        if (isID) {
                          if (order.estado === "pendiente_pago" || order.estado === "inicio") {
                            return { nombre: "Pendiente", tipo: "", esEfectivo: false };
                          }
                          return { nombre: "Sin método", tipo: "", esEfectivo: false };
                        }

                        const str = String(m);
                        return {
                          nombre: str,
                          tipo: "",
                          esEfectivo: str.toLowerCase().includes("efectivo"),
                        };
                      })();

                      return [
                        e("div", { key: "metodo-box", className: "flex items-center gap-2" }, [
                          e(
                            "span",
                            { className: "text-[12px]" },
                            metodoInfo.esEfectivo ? e(Icono, { nombre: "banknote" }) : e(Icono, { nombre: "credit-card" }),
                          ),
                          e(
                            "span",
                            {
                              className:
                                "text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-tighter",
                            },
                            metodoInfo.nombre,
                          ),
                        ]),
                        e(
                          "span",
                          {
                            key: "monto-box",
                            className:
                              "text-xs font-black text-emerald-600 dark:text-emerald-400",
                          },
                          `$${order.pago?.montoUSD || 0}`,
                        ),
                      ];
                    })(),
                    ],
                  ),
                );
              }),
          ),
        ),
      ),
    ),
    e(OrderDetailsModal, {
      order: selectedOrder,
      isOpen: isModalOpen,
      onClose: handleCloseOrder,
      onUpdateStatus: updateStatus,
      onDelete: handleDeleteOrder,
      deleting: deletingId === (selectedOrder && selectedOrder._id),
      userRole,
    }),
    
    // Modal de Confirmación de Eliminación
    orderToDelete &&
      e("div", { className: "fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" }, 
        e("div", { className: "bg-[#111b21] border border-[#2a3942] rounded-2xl p-6 max-w-sm w-full shadow-2xl transform scale-100 animate-in fade-in zoom-in-95 duration-200" }, [
          e("div", { className: "w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4" }, 
            e(Icono, { nombre: "triangle-alert", className: "text-2xl text-red-500" })
          ),
          e("h3", { className: "text-lg font-black text-[#e9edef] text-center mb-2" }, "¿Eliminar Pedido?"),
          e("p", { className: "text-sm text-[#8696a0] text-center mb-6" }, "Esta acción es irreversible. Se borrará permanentemente del sistema."),
          e("div", { className: "flex gap-3" }, [
            e("button", {
              onClick: () => setOrderToDelete(null),
              disabled: deletingId === orderToDelete,
              className: "flex-1 px-4 py-2.5 rounded-lg font-bold text-[#e9edef] bg-[#202c33] hover:bg-[#2a3942] transition disabled:opacity-50 cursor-pointer"
            }, "Cancelar"),
            e("button", {
              onClick: confirmDeleteOrder,
              disabled: deletingId === orderToDelete,
              className: "flex-1 px-4 py-2.5 rounded-lg font-bold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-50 flex justify-center items-center gap-2 cursor-pointer"
            }, [
              deletingId === orderToDelete ? e(Icono, { nombre: "loader-circle", girar: true }) : e(Icono, { nombre: "trash" }),
              "Eliminar"
            ])
          ])
        ])
      )
  );
};

export default KanbanBoard;
