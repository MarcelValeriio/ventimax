/**
 * public/src/features/sales/SalesDashboard.js
 * Panel de métricas financieras con Filtros de Fecha y Respaldo Total
 * Pure JS Version - Clean CSS transitions for modal animations
 */
import React, {
  useEffect,
  useState,
  useRef,
} from "https://cdn.skypack.dev/react";
import apiClient, { getTopProducts } from "../../services/apiClient.js";
import OrderDetailsModal from "../../components/OrderDetailsModal.js";

const e = React.createElement;

const SalesDashboard = ({ userRole = "admin" }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filtroFecha, setFiltroFecha] = useState("todos");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [fullTransacciones, setFullTransacciones] = useState([]);
  const [isFetchingFull, setIsFetchingFull] = useState(false);
  const [topProducts, setTopProducts] = useState([]);
  const [loadingTopProducts, setLoadingTopProducts] = useState(false);

  const [showManualSaleModal, setShowManualSaleModal] = useState(false);
  const [showContactList, setShowContactList] = useState(false);
  const [dbContacts, setDbContacts] = useState([]);
  const [contactsSearch, setContactsSearch] = useState("");
  const [manualSale, setManualSale] = useState({
    cliente: { nombre: "", cedula: "", telefono: "" },
    items: [{ producto: "", price: 0, cantidad: 1 }],
    pago: { metodo: "Efectivo" },
    ubicacion: { direccion: "Retiro en tienda" },
  });
  const [comprobanteFile, setComprobanteFile] = useState(null);
  const [productCatalog, setProductCatalog] = useState([]);
  const [bcvRate, setBcvRate] = useState(0);
  const [brandConfig, setBrandConfig] = useState(null);

  useEffect(() => {
    apiClient
      .get("/api/config")
      .then((res) => {
        if (res.data) setBrandConfig(res.data);
      })
      .catch((err) =>
        console.warn("No se pudo cargar la configuración de marca:", err),
      );
  }, []);

  useEffect(() => {
    if (showManualSaleModal) {
      apiClient
        .get("/api/admin/products")
        .then((res) => {
          if (res.data && res.data.success) {
            setProductCatalog(res.data.data.filter((p) => p.activo && (!p.trackStock || (Number(p.stock) || 0) > 0)));
          }
        })
        .catch((err) =>
          console.error("❌ Error cargando catálogo de productos:", err),
        );

      apiClient
        .get("/api/admin/bcv")
        .then((res) => {
          if (res.data && res.data.success) {
            setBcvRate(res.data.data.tasa || 0);
          }
        })
        .catch((err) => console.error("❌ Error cargando tasa BCV:", err));

      apiClient
        .get("/api/admin/clients")
        .then((res) => {
          if (res.data && res.data.success) {
            setDbContacts(res.data.data);
          }
        })
        .catch((err) => console.error("❌ Error cargando clientes:", err));
    }
  }, [showManualSaleModal]);

  const handleAddProductRow = () => {
    setManualSale((prev) => ({
      ...prev,
      items: [...prev.items, { producto: "", price: 0, cantidad: 1 }],
    }));
  };

  const handleRemoveProductRow = (index) => {
    setManualSale((prev) => ({
      ...prev,
      items: prev.items.filter((_, idx) => idx !== index),
    }));
  };

  const handleProductChange = (index, productName) => {
    const prod = productCatalog.find((p) => p.name === productName);
    const updatedItems = [...manualSale.items];
    updatedItems[index] = {
      producto: productName,
      price: prod ? prod.price : 0,
      cantidad: updatedItems[index].cantidad || 1,
    };
    setManualSale((prev) => ({
      ...prev,
      items: updatedItems,
    }));
  };

  const handleQtyChange = (index, qty) => {
    const updatedItems = [...manualSale.items];
    updatedItems[index] = {
      ...updatedItems[index],
      cantidad: Math.max(1, parseInt(qty) || 1),
    };
    setManualSale((prev) => ({
      ...prev,
      items: updatedItems,
    }));
  };

  const handleSubmitManualSale = async () => {
    try {
      if (!manualSale.cliente.nombre.trim()) {
        window.showToast?.("⚠️ El nombre del cliente es obligatorio.", "error");
        return;
      }
      if (manualSale.items.length === 0) {
        window.showToast?.("⚠️ Debe agregar al menos un producto.", "error");
        return;
      }
      const invalidItem = manualSale.items.find(
        (item) => !item.producto || item.cantidad <= 0,
      );
      if (invalidItem) {
        window.showToast?.(
          "⚠️ Verifica que todos los productos tengan nombre y cantidad.",
          "error",
        );
        return;
      }

      let res;
      if (comprobanteFile) {
        // Con archivo: usar FormData (axios auto-detecta el Content-Type con boundary)
        const formData = new FormData();
        formData.append("data", JSON.stringify(manualSale));
        formData.append("comprobante", comprobanteFile);
        res = await apiClient.post("/api/admin/manual-sale", formData, {
          headers: { "Content-Type": undefined }, // dejar que axios ponga el boundary
        });
      } else {
        // Sin archivo: enviar JSON directamente
        res = await apiClient.post("/api/admin/manual-sale", manualSale);
      }
      if (res.data && res.data.success) {
        window.showToast?.(
          `✅ Venta #${res.data.data.correlativo} registrada con éxito!`,
        );
        setShowManualSaleModal(false);
        fetchSales(currentPage);
      } else {
        window.showToast?.(
          `❌ ${res.data.error || "No se pudo registrar la venta"}`,
          "error",
        );
      }
    } catch (err) {
      console.error("❌ Error registrando venta manual:", err);
      const errMsg = err.response?.data?.error || err.message;
      window.showToast?.(`❌ Error: ${errMsg}`, "error");
    }
  };

  const fetchSales = async (page = 1, isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      const params = new URLSearchParams({
        page,
        limit: 20,
        filtroFecha,
      });

      if (filtroFecha === "personalizado") {
        if (fechaInicio) params.append("fechaInicio", fechaInicio);
        if (fechaFin) params.append("fechaFin", fechaFin);
      }

      const res = await apiClient.get(
        `/api/admin/sales-summary?${params.toString()}`,
      );
      if (res.data && res.data.success) {
        setData(res.data.data);
        setError(null);
      } else {
        throw new Error("Formato de respuesta inválido");
      }
    } catch (err) {
      console.error("❌ Error sincronizando con Atlas:", err.message);
      setError(
        "Error al cargar las métricas de ventas. Por favor, verifica la conexión.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleOpenPdfPreview = async () => {
    try {
      setIsFetchingFull(true);
      const params = new URLSearchParams({
        page: 1,
        limit: 0, // Carga total para el PDF
        filtroFecha,
      });

      if (filtroFecha === "personalizado") {
        if (fechaInicio) params.append("fechaInicio", fechaInicio);
        if (fechaFin) params.append("fechaFin", fechaFin);
      }

      const res = await apiClient.get(
        `/api/admin/sales-summary?${params.toString()}`,
      );
      if (res.data && res.data.success) {
        setFullTransacciones(res.data.data.transacciones || []);
        setShowPdfPreview(true);
      }
    } catch (err) {
      console.error("❌ Error cargando datos para PDF:", err);
      alert("Error al cargar datos para el reporte completo.");
    } finally {
      setIsFetchingFull(false);
    }
  };

  const fetchTopProducts = async () => {
    try {
      setLoadingTopProducts(true);
      const params = { filtroFecha, fechaInicio, fechaFin };
      const fetchFn = getTopProducts || apiClient.getTopProducts;
      const res = await fetchFn(params);
      if (res && res.success && Array.isArray(res.data)) {
        setTopProducts(res.data);
      } else if (Array.isArray(res)) {
        setTopProducts(res);
      } else if (res && Array.isArray(res.data)) {
        setTopProducts(res.data);
      } else {
        setTopProducts([]);
      }
    } catch (err) {
      console.error("❌ Error cargando Top Productos:", err);
    } finally {
      setLoadingTopProducts(false);
    }
  };

  useEffect(() => {
    fetchSales(currentPage);
    fetchTopProducts();
  }, [currentPage, filtroFecha, fechaInicio, fechaFin]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filtroFecha, fechaInicio, fechaFin]);

  const handleOpenOrder = async (transaccion) => {
    const lookupId = transaccion.idPedidoOriginal || transaccion.id;
    if (!lookupId) return;
    try {
      setLoading(true);
      const res = await apiClient.get(`/api/admin/orders/${lookupId}`);
      if (res.data && res.data.success) setSelectedOrder(res.data.data);
      else setSelectedOrder(transaccion);
    } catch (err) {
      setSelectedOrder(transaccion);
    } finally {
      setLoading(false);
      setIsModalOpen(true);
    }
  };

  const handleCloseOrder = () => {
    setIsModalOpen(false);
    setTimeout(() => setSelectedOrder(null), 300);
  };

  const handleDeleteOrder = async (id) => {
    if (!id) return;
    const ok = window.confirm(
      "⚠️ ¿Eliminar este pedido definitivamente?\n\nEsta acción NO se puede deshacer. Úsalo solo para pedidos de prueba.",
    );
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await apiClient.delete(`/api/admin/orders/${id}`);
      if (res.data && res.data.success) {
        window.showToast
          ? window.showToast("Pedido eliminado", "success")
          : alert("Pedido eliminado");
        handleCloseOrder();
        fetchSales(currentPage);
      } else {
        throw new Error(res.data?.error || "Error eliminando pedido");
      }
    } catch (err) {
      console.error("❌ Error eliminando pedido:", err.message);
      window.showToast
        ? window.showToast("Error al eliminar pedido", "error")
        : alert("Error al eliminar pedido");
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key === "Escape" && isModalOpen) handleCloseOrder();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isModalOpen]);

  const transacciones = data?.transacciones || [];
  const totalPedidos = data?.kpis?.totalPedidos || 0;
  const ingresosUSD = data?.kpis?.totalIngresos || "$0.00";
  const ingresosBS = data?.kpis?.totalVES || 0;
  const totalAdsIngresos = data?.kpis?.totalAdsIngresos || "$0.00";
  const totalAdsVES = data?.kpis?.totalAdsVES || 0;
  const totalAdsPedidos = data?.kpis?.totalAdsPedidos || 0;
  const porcentajeVentasAds = data?.kpis?.porcentajeVentasAds || 0;
  const totalRegistros = data?.pagination?.totalRecords || 0;
  const totalPaginas = data?.pagination?.totalPages || 1;

  const formatBs = (amount) =>
    new Intl.NumberFormat("es-VE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount || 0);

  const executeDownload = () => {
    const element = document.getElementById("reporte-hoja-contable");
    if (!element) return;
    setIsExporting(true);
    const brandPrefix = (
      brandConfig?.settings?.brandName ||
      brandConfig?.brandName ||
      "Empresa"
    ).replace(/[^a-zA-Z0-9]/g, "_");
    const opt = {
      margin: 15,
      filename: `Historial_Contable_${brandPrefix}_${filtroFecha}_${new Date().toISOString().split("T")[0]}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
    };
    html2pdf()
      .from(element)
      .set(opt)
      .save()
      .then(() => {
        setIsExporting(false);
        setShowPdfPreview(false);
      });
  };

  if (loading && !data)
    return e(
      "div",
      { className: "p-10 text-center text-gray-400 animate-pulse" },
      e("i", { className: "fas fa-spinner fa-spin mr-2" }),
      "Sincronizando con Atlas...",
    );

  return e(
    "div",
    {
      className:
        "p-4 md:p-6 space-y-6 md:space-y-8 bg-gray-50 dark:bg-gray-900 min-h-full pb-20",
    },
    e(
      "header",
      {
        className:
          "flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4",
      },
      e(
        "div",
        null,
        e(
          "h2",
          {
            className:
              "text-2xl font-bold text-emerald-800 dark:text-emerald-400",
          },
          "Panel de Ventas",
        ),
        e(
          "p",
          { className: "text-gray-500 dark:text-gray-400 text-sm" },
          "Gestión financiera y reportes",
        ),
      ),
      e(
        "div",
        { className: "flex gap-2 w-full sm:w-auto" },
        e(
          "button",
          {
            onClick: () => {
              setManualSale({
                cliente: { nombre: "", cedula: "", telefono: "" },
                items: [{ producto: "", price: 0, cantidad: 1 }],
                pago: { metodo: "Efectivo" },
                ubicacion: { direccion: "Retiro en tienda" },
              });
              setComprobanteFile(null);
              setShowManualSaleModal(true);
            },
            className:
              "flex-1 sm:flex-none px-4 py-2 bg-emerald-600 text-white rounded-lg shadow hover:bg-emerald-700 transition flex items-center justify-center gap-2 active:scale-95 font-bold text-sm",
          },
          e("i", { className: "fas fa-plus" }),
          "Venta Manual",
        ),
        e(
          "button",
          {
            onClick: handleOpenPdfPreview,
            disabled: isFetchingFull,
            className:
              "flex-1 sm:flex-none px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg shadow-sm hover:bg-gray-50 flex items-center justify-center gap-2 active:scale-95 font-bold text-sm",
          },
          isFetchingFull
            ? e("i", { className: "fas fa-spinner fa-spin text-emerald-500" })
            : e("i", { className: "fas fa-file-pdf text-red-500" }),
          "Exportar PDF",
        ),
        e(
          "button",
          {
            onClick: () => {
              fetchSales(true);
              fetchTopProducts();
            },
            disabled: refreshing,
            className:
              "flex-1 sm:flex-none px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-lg shadow-sm hover:bg-gray-50 flex items-center justify-center gap-2 active:scale-95 font-bold text-sm",
          },
          e("i", {
            className: `fas ${refreshing ? "fa-sync fa-spin" : "fa-sync-alt"} text-emerald-500`,
          }),
          "Refrescar",
        ),
      ),
    ),
    e(
      "div",
      { className: "flex flex-wrap gap-2 items-center" },
      [
        { id: "todos", label: "Todos" },
        { id: "hoy", label: "Hoy" },
        { id: "semana", label: "Esta Semana" },
        { id: "mes", label: "Este Mes" },
        { id: "personalizado", label: "Personalizado" },
      ].map((f) =>
        e(
          "button",
          {
            key: f.id,
            onClick: () => setFiltroFecha(f.id),
            className: `px-4 py-1.5 rounded-full text-xs font-bold transition-all ${filtroFecha === f.id ? "bg-emerald-600 text-white shadow-md scale-105" : "bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700"}`,
          },
          f.label,
        ),
      ),
      filtroFecha === "personalizado" &&
        e("div", { className: "flex items-center gap-2 ml-auto" }, [
          e("input", {
            type: "date",
            value: fechaInicio,
            onChange: (ev) => setFechaInicio(ev.target.value),
            className:
              "px-3 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-emerald-500 outline-none",
          }),
          e("span", { className: "text-white text-xs font-bold" }, "hasta"),
          e("input", {
            type: "date",
            value: fechaFin,
            onChange: (ev) => setFechaFin(ev.target.value),
            className:
              "px-3 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:ring-2 focus:ring-emerald-500 outline-none",
          }),
        ]),
    ),
    // Fila 1: Ingresos (USD, Bs y Ads)
    e(
      "div",
      {
        className: "grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6",
      },
      e(
        "div",
        {
          className:
            "bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-md border-l-4 border-emerald-500",
        },
        e(
          "p",
          {
            className:
              "text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1",
          },
          "Ingresos USD",
        ),
        e(
          "p",
          {
            className:
              "text-2xl sm:text-3xl font-black text-gray-800 dark:text-gray-100 truncate",
          },
          ingresosUSD.startsWith("$") ? ingresosUSD : `$${ingresosUSD}`,
        ),
      ),
      e(
        "div",
        {
          className:
            "bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-md border-l-4 border-emerald-600",
        },
        e(
          "p",
          {
            className:
              "text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1",
          },
          "Ingresos Bs.",
        ),
        e(
          "p",
          {
            className:
              "text-xl sm:text-2xl font-black text-gray-800 dark:text-gray-100 truncate",
          },
          `Bs. ${formatBs(ingresosBS)}`,
        ),
      ),
      e(
        "div",
        {
          className:
            "col-span-2 lg:col-span-1 bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-xl shadow-md border-l-4 border-blue-600 flex flex-col justify-between",
        },
        e(
          "div",
          { className: "flex items-center justify-between mb-1" },
          e(
            "p",
            {
              className:
                "text-xs font-bold text-blue-600 dark:text-blue-400 uppercase flex items-center gap-1.5",
            },
            e("i", { className: "fab fa-meta text-sm" }),
            "Ventas por Anuncios",
          ),
          e(
            "span",
            {
              className:
                "text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
            },
            `${porcentajeVentasAds}% del total`,
          ),
        ),
        e(
          "p",
          {
            className:
              "text-2xl sm:text-3xl font-black text-gray-800 dark:text-gray-100 truncate",
          },
          totalAdsIngresos.startsWith("$") ? totalAdsIngresos : `$${totalAdsIngresos}`,
        ),
        e(
          "div",
          {
            className:
              "mt-2 text-[11px] text-gray-500 dark:text-gray-400 flex items-center justify-between font-medium pt-2 border-t border-gray-100 dark:border-gray-700/60",
          },
          e(
            "span",
            { className: "flex items-center gap-1" },
            e("i", { className: "fas fa-bullhorn text-[10px] text-blue-500" }),
            `${totalAdsPedidos} pedidos CTWA`,
          ),
          e(
            "span",
            null,
            `Bs. ${formatBs(totalAdsVES)}`,
          ),
        ),
      ),
    ),

    // Fila 2: Pedidos | Ticket Promedio | Tiempo Entrega (1 sola línea en Mobile con grid-cols-3)
    e(
      "div",
      {
        className: "grid grid-cols-3 gap-2 sm:gap-4 md:gap-6 mt-4",
      },
      e(
        "div",
        {
          className:
            "bg-white dark:bg-gray-800 p-2.5 sm:p-5 md:p-6 rounded-xl shadow-md border-l-2 sm:border-l-4 border-blue-500 flex flex-col justify-center",
        },
        e(
          "p",
          {
            className:
              "text-[10px] sm:text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1 truncate",
          },
          "Pedidos",
        ),
        e(
          "p",
          {
            className:
              "text-lg sm:text-2xl md:text-3xl font-black text-gray-800 dark:text-gray-100 truncate",
          },
          totalPedidos,
        ),
      ),
      e(
        "div",
        {
          className:
            "bg-white dark:bg-gray-800 p-2.5 sm:p-5 md:p-6 rounded-xl shadow-md border-l-2 sm:border-l-4 border-orange-500 flex flex-col justify-center",
        },
        e(
          "p",
          {
            className:
              "text-[10px] sm:text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1 truncate",
          },
          "Ticket Promedio",
        ),
        e(
          "p",
          {
            className:
              "text-sm sm:text-xl md:text-2xl font-black text-gray-800 dark:text-gray-100 truncate",
          },
          (() => {
            const monto = parseFloat(
              ingresosUSD.toString().replace("$", "").replace(",", ""),
            );
            return `$${totalPedidos > 0 ? (monto / totalPedidos).toFixed(2) : "0.00"}`;
          })(),
        ),
      ),
      e(
        "div",
        {
          className:
            "bg-white dark:bg-gray-800 p-2.5 sm:p-5 md:p-6 rounded-xl shadow-md border-l-2 sm:border-l-4 border-purple-500 flex flex-col justify-center",
        },
        e(
          "p",
          {
            className:
              "text-[10px] sm:text-xs font-bold text-gray-400 dark:text-gray-500 uppercase mb-1 truncate",
          },
          "Tiempo Entrega",
        ),
        e(
          "p",
          {
            className:
              "text-sm sm:text-xl md:text-2xl font-black text-gray-800 dark:text-gray-100 truncate",
          },
          `${data?.kpis?.avgDeliveryTime || 0} min`,
        ),
        e(
          "div",
          {
            className:
              "mt-1 sm:mt-2 text-[8px] sm:text-[10px] text-purple-600 font-medium truncate",
          },
          "Promedio histórico",
        ),
      ),
    ),
    e(
      "div",
      { className: "grid grid-cols-1 lg:grid-cols-3 gap-6" },
      e(
        "div",
        { className: "lg:col-span-1 space-y-6" },
        // Embudo de Conversión
        e(
          "div",
          {
            className: "bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg",
          },
          e(
            "h3",
            {
              className:
                "font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center gap-2",
            },
            e("i", { className: "fas fa-filter text-orange-500" }),
            "Embudo de Conversión",
          ),
          e(
            "div",
            { className: "space-y-3" },
            Object.entries(data?.churn || {})
              .sort((a, b) => b[1] - a[1])
              .map(([paso, count]) => {
                const totalUsers = Object.values(data?.churn || {}).reduce(
                  (s, v) => s + v,
                  0,
                );
                const percent = ((count / totalUsers) * 100).toFixed(1);
                return e(
                  "div",
                  { key: paso, className: "group" },
                  e(
                    "div",
                    {
                      className:
                        "flex justify-between text-[10px] font-black uppercase text-gray-400 mb-1",
                    },
                    e("span", null, paso.replace(/_/g, " ")),
                    e("span", null, `${count} usuarios (${percent}%)`),
                  ),
                  e(
                    "div",
                    {
                      className:
                        "h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden",
                    },
                    e("div", {
                      className:
                        "h-full bg-emerald-500 rounded-full transition-all duration-1000",
                      style: { width: `${percent}%` },
                    }),
                  ),
                );
              }),
          ),
        ),
        // Top Productos (Ranking)
        e(
          "div",
          {
            className: "bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg",
          },
          e(
            "div",
            { className: "flex justify-between items-center mb-4" },
            e(
              "h3",
              {
                className:
                  "font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2",
              },
              e("i", { className: "fas fa-trophy text-amber-500" }),
              "Top Productos",
            ),
            loadingTopProducts &&
              e("i", {
                className: "fas fa-spinner fa-spin text-emerald-500 text-xs",
              }),
          ),
          topProducts.length === 0 && !loadingTopProducts
            ? e(
                "p",
                { className: "text-xs text-gray-400 italic py-4 text-center" },
                "Sin ventas registradas en el periodo",
              )
            : e(
                "div",
                { className: "space-y-3" },
                topProducts.slice(0, 5).map((prod, idx) => {
                  const nombre =
                    prod.nombre ||
                    prod.name ||
                    prod.producto ||
                    prod._id ||
                    "Producto";
                  const unidades =
                    prod.cantidadVendida ??
                    prod.unidadesVendidas ??
                    prod.unidades ??
                    prod.cantidad ??
                    prod.totalVendidos ??
                    prod.quantity ??
                    0;
                  const ingresos =
                    prod.ingresos ??
                    prod.totalIngresos ??
                    prod.ingresosUSD ??
                    prod.total ??
                    prod.revenue ??
                    0;
                  return e(
                    "div",
                    {
                      key: prod._id || idx,
                      className:
                        "flex items-center justify-between p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/40 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition",
                    },
                    e(
                      "div",
                      { className: "flex items-center gap-2.5 min-w-0 pr-2" },
                      [
                        e(
                          "span",
                          {
                            className: `w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black shrink-0 ${
                              idx === 0
                                ? "bg-amber-100 text-amber-700"
                                : idx === 1
                                  ? "bg-gray-200 text-gray-700"
                                  : idx === 2
                                    ? "bg-amber-50 text-amber-800"
                                    : "bg-gray-100 text-gray-500"
                            }`,
                          },
                          idx + 1,
                        ),
                        e(
                          "div",
                          { className: "min-w-0" },
                          e(
                            "p",
                            {
                              className:
                                "text-xs font-bold text-gray-800 dark:text-gray-200 truncate",
                            },
                            nombre,
                          ),
                          e(
                            "p",
                            {
                              className:
                                "text-[10px] text-gray-400 dark:text-yellow-500 font-medium",
                            },
                            `${unidades} vendidas`,
                          ),
                        ),
                      ],
                    ),
                    e(
                      "span",
                      {
                        className:
                          "text-xs font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap",
                      },
                      `$${Number(ingresos).toFixed(2)}`,
                    ),
                  );
                }),
              ),
        ),
      ),
      e(
        "div",
        {
          className:
            "lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden",
        },
        e(
          "div",
          {
            className:
              "p-4 bg-gray-50 dark:bg-gray-800/50 border-b dark:border-gray-700 flex justify-between items-center",
          },
          e(
            "h3",
            { className: "font-bold text-gray-700 dark:text-gray-200" },
            "Historial Contable",
          ),
          e(
            "span",
            {
              className:
                "text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-full",
            },
            `${totalRegistros} resultados`,
          ),
        ),
        e(
          "div",
          { className: "overflow-x-auto w-full" },
          e(
            "table",
            { className: "w-full text-left border-collapse min-w-[850px]" },
            e(
              "thead",
              {
                className:
                  "bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400",
              },
              e(
                "tr",
                null,
                e("th", { className: "px-6 py-4" }, "ID PEDIDO"),
                e("th", { className: "px-6 py-4" }, "CLIENTE"),
                e("th", { className: "px-6 py-4" }, "PRODUCTOS"),
                e("th", { className: "px-6 py-4" }, "TOTAL ($)"),
                e("th", { className: "px-6 py-4" }, "TOTAL (Bs.)"),
                e("th", { className: "px-6 py-4" }, "FECHA"),
              ),
            ),
            e(
              "tbody",
              { className: "divide-y divide-gray-100 dark:divide-gray-700" },
              transacciones.length > 0
                ? transacciones.map((t) =>
                    e(
                      "tr",
                      {
                        key: t.id,
                        onClick: () => handleOpenOrder(t),
                        className:
                          "hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition cursor-pointer group",
                      },
                      e(
                        "td",
                        {
                          className:
                            "px-6 py-4 font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2",
                        },
                        `#${t.id.toString().replace(/^#+/, "")}`,
                        (t.esAd || t.ctwaClid) &&
                          e(
                            "span",
                            {
                              className:
                                "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800",
                              title: `Meta Ad (CTWA): ${t.ctwaClid || ""}`,
                            },
                            e("i", { className: "fab fa-meta text-[9px]" }),
                            "Ad",
                          ),
                      ),
                      e(
                        "td",
                        {
                          className:
                            "px-6 py-4 text-gray-600 dark:text-gray-300 font-bold",
                        },
                        t.cliente,
                      ),
                      e(
                        "td",
                        {
                          className:
                            "px-6 py-4 text-gray-500 dark:text-gray-400 text-sm italic max-w-xs truncate",
                        },
                        t.productos,
                      ),
                      e(
                        "td",
                        {
                          className:
                            "px-6 py-4 text-emerald-600 dark:text-emerald-400 font-black",
                        },
                        `$${Number(t.total).toFixed(2)}`,
                      ),
                      e(
                        "td",
                        { className: "px-6 py-4" },
                        e(
                          "div",
                          {
                            className:
                              "text-emerald-700 dark:text-emerald-500 font-medium",
                          },
                          `Bs. ${formatBs(t.totalBs)}`,
                        ),
                        e(
                          "div",
                          { className: "text-[9px] text-gray-400" },
                          `(Tasa: ${t.tasaHistorial})`,
                        ),
                      ),
                      e(
                        "td",
                        { className: "px-6 py-4 text-gray-400 text-xs" },
                        new Date(t.fecha).toLocaleDateString(),
                      ),
                    ),
                  )
                : e(
                    "tr",
                    null,
                    e(
                      "td",
                      {
                        colSpan: 6,
                        className: "px-6 py-10 text-center text-gray-400",
                      },
                      "📭 No hay registros en este periodo.",
                    ),
                  ),
            ),
          ),
        ),
        // Controles de Paginación
        totalPaginas > 1 &&
          e(
            "div",
            {
              className:
                "p-4 bg-gray-50 dark:bg-gray-800/50 border-t dark:border-gray-700 flex flex-col sm:flex-row justify-between items-center gap-4",
            },
            [
              e(
                "span",
                { className: "text-xs font-bold text-gray-400 uppercase" },
                `Página ${currentPage} de ${totalPaginas}`,
              ),
              e("div", { className: "flex flex-wrap justify-center gap-2" }, [
                e(
                  "button",
                  {
                    disabled: currentPage === 1,
                    onClick: () => setCurrentPage((p) => Math.max(1, p - 1)),
                    className:
                      "px-3 py-2 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-600 disabled:opacity-50 active:scale-95 transition hover:bg-gray-50",
                  },
                  "Anterior",
                ),
                ...(() => {
                  const pages = [];
                  const delta = 2; // Número de páginas a mostrar a los lados
                  for (let i = 1; i <= totalPaginas; i++) {
                    if (
                      i === 1 ||
                      i === totalPaginas ||
                      (i >= currentPage - delta && i <= currentPage + delta)
                    ) {
                      pages.push(i);
                    } else if (
                      i === currentPage - delta - 1 ||
                      i === currentPage + delta + 1
                    ) {
                      pages.push("...");
                    }
                  }
                  // Eliminar duplicados de "..."
                  return pages
                    .filter((p, i) => p !== "..." || pages[i - 1] !== "...")
                    .map((num, idx) =>
                      num === "..."
                        ? e(
                            "span",
                            {
                              key: `dots-${idx}`,
                              className: "px-2 py-2 text-gray-400",
                            },
                            "...",
                          )
                        : e(
                            "button",
                            {
                              key: num,
                              onClick: () => setCurrentPage(num),
                              className: `w-10 h-10 flex items-center justify-center rounded-lg text-xs font-bold border transition-all active:scale-95 ${
                                currentPage === num
                                  ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-500/30"
                                  : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50"
                              }`,
                            },
                            num,
                          ),
                    );
                })(),
                e(
                  "button",
                  {
                    disabled: currentPage === totalPaginas,
                    onClick: () =>
                      setCurrentPage((p) => Math.min(totalPaginas, p + 1)),
                    className:
                      "px-3 py-2 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-bold border border-gray-200 dark:border-gray-600 disabled:opacity-50 active:scale-95 transition hover:bg-gray-50",
                  },
                  "Siguiente",
                ),
              ]),
            ],
          ),
      ),
    ),
    e(
      "footer",
      { className: "flex justify-center pt-8 border-t dark:border-gray-800" },
      e(
        "a",
        {
          href: "/api/admin/backup",
          className:
            "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-6 py-3 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center gap-3 hover:bg-gray-200 transition shadow-sm active:scale-95 font-bold text-sm",
        },
        e("i", { className: "fas fa-database text-emerald-500" }),
        "Descargar Respaldo Total (JSON)",
      ),
    ),
    e(OrderDetailsModal, {
      order: selectedOrder,
      isOpen: isModalOpen,
      onClose: handleCloseOrder,
      onDelete: userRole === "admin" ? handleDeleteOrder : null,
      deleting: deleting,
      userRole: userRole || "admin",
    }),
    showPdfPreview &&
      e(
        "div",
        {
          className:
            "fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 backdrop-blur-sm",
        },
        e(
          "div",
          {
            className:
              "bg-white dark:bg-gray-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden",
          },
          e(
            "div",
            {
              className:
                "p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50",
            },
            e(
              "h3",
              { className: "font-bold text-gray-800 dark:text-gray-100" },
              "Vista Previa del Reporte Contable",
            ),
            e(
              "button",
              {
                onClick: () => setShowPdfPreview(false),
                className: "text-gray-400 p-2",
              },
              "✕",
            ),
          ),
          e(
            "div",
            {
              className:
                "flex-1 overflow-y-auto p-4 md:p-8 bg-gray-200 dark:bg-gray-900",
            },
            e(
              "div",
              {
                id: "reporte-hoja-contable",
                className: "bg-white p-10 shadow-lg mx-auto w-full text-black",
              },
              e(
                "div",
                {
                  className:
                    "text-center border-b-2 border-emerald-800 pb-4 mb-6",
                },
                e(
                  "h1",
                  { className: "text-2xl font-black text-emerald-800 m-0" },
                  `REPORTE DE VENTAS - ${(brandConfig?.settings?.brandName || brandConfig?.brandName || "GENERAL").toUpperCase()}`,
                ),
                e(
                  "p",
                  {
                    className: "text-xs text-gray-500 uppercase font-bold mt-1",
                  },
                  "Sistema de Gestión de Pedidos",
                ),
              ),
              e(
                "div",
                { className: "flex justify-between mb-8 text-xs" },
                e(
                  "div",
                  null,
                  e(
                    "p",
                    null,
                    e("strong", null, "Fecha: "),
                    new Date().toLocaleDateString(),
                  ),
                  e(
                    "p",
                    null,
                    e("strong", null, "Filtro: "),
                    filtroFecha.toUpperCase(),
                  ),
                ),
                e(
                  "div",
                  { className: "text-right" },
                  e(
                    "p",
                    null,
                    e("strong", null, "Unidad: "),
                    "USD / Bs. Histórico",
                  ),
                ),
              ),
              e(
                "div",
                { className: "grid grid-cols-3 gap-4 mb-8" },
                e(
                  "div",
                  {
                    className:
                      "bg-gray-50 p-4 rounded-lg border border-gray-100",
                  },
                  e(
                    "p",
                    { className: "text-[9px] font-bold text-gray-400" },
                    "INGRESOS (USD)",
                  ),
                  e("p", { className: "text-xl font-black" }, ingresosUSD),
                ),
                e(
                  "div",
                  {
                    className:
                      "bg-gray-50 p-4 rounded-lg border border-gray-100",
                  },
                  e(
                    "p",
                    { className: "text-[9px] font-bold text-gray-400" },
                    "INGRESOS (BS.)",
                  ),
                  e(
                    "p",
                    { className: "text-xl font-black" },
                    `Bs. ${formatBs(ingresosBS)}`,
                  ),
                ),
                e(
                  "div",
                  {
                    className:
                      "bg-gray-50 p-4 rounded-lg border border-gray-100",
                  },
                  e(
                    "p",
                    { className: "text-[9px] font-bold text-gray-400" },
                    "PEDIDOS",
                  ),
                  e("p", { className: "text-xl font-black" }, totalPedidos),
                ),
              ),
              e(
                "table",
                { className: "w-full text-left border-collapse text-[10px]" },
                e(
                  "thead",
                  null,
                  e(
                    "tr",
                    { className: "border-b-2 border-gray-200" },
                    e("th", null, "ID"),
                    e("th", null, "CLIENTE"),
                    e("th", null, "PRODUCTOS"),
                    e("th", { className: "text-right" }, "TOTAL ($)"),
                    e("th", { className: "text-right" }, "TOTAL (Bs.)"),
                    e("th", { className: "text-right" }, "FECHA"),
                  ),
                ),
                e(
                  "tbody",
                  null,
                  fullTransacciones.map((t) =>
                    e(
                      "tr",
                      { key: t.id, className: "border-b border-gray-100" },
                      e("td", { className: "p-2" }, t.id),
                      e("td", { className: "p-2" }, t.cliente),
                      e("td", { className: "p-2" }, t.productos),
                      e(
                        "td",
                        { className: "p-2 text-right" },
                        `$${Number(t.total).toFixed(2)}`,
                      ),
                      e(
                        "td",
                        { className: "p-2 text-right" },
                        `Bs. ${formatBs(t.totalBs)}`,
                      ),
                      e(
                        "td",
                        { className: "p-2 text-right" },
                        new Date(t.fecha).toLocaleDateString(),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          e(
            "div",
            {
              className:
                "p-4 border-t border-gray-100 dark:border-gray-700 flex gap-3 bg-gray-50 dark:bg-gray-900/50",
            },
            e(
              "button",
              {
                onClick: () => setShowPdfPreview(false),
                className:
                  "flex-1 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-50",
              },
              "❌ Cancelar",
            ),
            e(
              "button",
              {
                onClick: executeDownload,
                disabled: isExporting,
                className:
                  "flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 flex items-center justify-center gap-2 disabled:opacity-50",
              },
              e("i", {
                className: `fas ${isExporting ? "fa-spinner fa-spin" : "fa-check-circle"}`,
              }),
              isExporting ? "Generando..." : "📥 Confirmar Descarga",
            ),
          ),
        ),
      ),
    showManualSaleModal &&
      e(
        "div",
        {
          className:
            "fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 backdrop-blur-sm",
        },
        e(
          "div",
          {
            className:
              "bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden",
          },
          // Header
          e(
            "div",
            {
              className:
                "p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50",
            },
            e(
              "h3",
              {
                className:
                  "font-bold text-lg text-emerald-800 dark:text-emerald-400 flex items-center gap-2",
              },
              e("i", { className: "fas fa-cart-plus" }),
              "Registrar Venta Manual (Fuera de WhatsApp)",
            ),
            e(
              "button",
              {
                onClick: () => setShowManualSaleModal(false),
                className:
                  "text-gray-400 dark:text-gray-500 hover:text-gray-600 p-2 font-bold text-lg",
              },
              "✕",
            ),
          ),
          // Form Content
          e(
            "div",
            {
              className:
                "flex-1 overflow-y-auto p-6 space-y-6 bg-white dark:bg-gray-800",
            },
            // Sección 1: Datos del Cliente
            e(
              "div",
              { className: "space-y-4 relative" },
              e(
                "div",
                { className: "flex justify-between items-center" },
                e(
                  "h4",
                  {
                    className:
                      "text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider",
                  },
                  "1. Datos del Cliente",
                ),
                e(
                  "button",
                  {
                    type: "button",
                    onClick: () => setShowContactList(!showContactList),
                    className: "px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 rounded-lg text-xs font-semibold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition flex items-center gap-2",
                  },
                  e("i", { className: "fas fa-address-book" }),
                  "Lista de Contactos"
                )
              ),
              showContactList && e(
                "div",
                {
                  className: "absolute top-8 right-0 z-10 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden flex flex-col"
                },
                e(
                  "div",
                  { className: "p-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900" },
                  e("input", {
                    type: "text",
                    autoFocus: true,
                    placeholder: "Buscar cliente...",
                    value: contactsSearch,
                    onChange: (evt) => setContactsSearch(evt.target.value),
                    className: "w-full px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  })
                ),
                e(
                  "div",
                  { className: "max-h-60 overflow-y-auto" },
                  dbContacts.length === 0 ? e("div", { className: "p-4 text-center text-xs text-gray-400" }, "Cargando clientes...") :
                  dbContacts.filter(c => (c.nombre || "").toLowerCase().includes(contactsSearch.toLowerCase()) || (c.telefono || "").includes(contactsSearch) || (c.cedula || "").toLowerCase().includes(contactsSearch.toLowerCase())).length === 0 ? e("div", { className: "p-4 text-center text-xs text-gray-400" }, "No hay resultados") :
                  dbContacts.filter(c => (c.nombre || "").toLowerCase().includes(contactsSearch.toLowerCase()) || (c.telefono || "").includes(contactsSearch) || (c.cedula || "").toLowerCase().includes(contactsSearch.toLowerCase())).map((contact, idx) => e(
                    "button",
                    {
                      key: idx,
                      type: "button",
                      className: "w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition last:border-0",
                      onClick: () => {
                        const uniqueDirs = [...new Set(contact.direcciones || [])];
                        const lastDir = uniqueDirs.length > 0 ? uniqueDirs[0] : "Retiro en tienda";
                        setManualSale((prev) => ({
                          ...prev,
                          cliente: {
                            ...prev.cliente,
                            nombre: contact.nombre || "",
                            telefono: contact.telefono || "",
                            cedula: contact.cedula || ""
                          },
                          ubicacion: {
                            direccion: lastDir
                          }
                        }));
                        setShowContactList(false);
                      }
                    },
                    e("div", { className: "font-bold text-sm text-gray-800 dark:text-gray-200" }, contact.nombre || "Sin nombre"),
                    e("div", { className: "text-xs text-gray-500 dark:text-gray-400 flex gap-2 mt-1" },
                      e("span", null, e("i", { className: "fas fa-phone mr-1" }), contact.telefono || "N/A"),
                      e("span", null, e("i", { className: "fas fa-id-card mr-1" }), contact.cedula || "N/A")
                    )
                  ))
                )
              ),
              e(
                "div",
                { className: "grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2" },
                e(
                  "div",
                  null,
                  e(
                    "label",
                    {
                      className:
                        "block text-xs text-gray-500 dark:text-gray-400 mb-1",
                    },
                    "Nombre del Cliente *",
                  ),
                  e("input", {
                    type: "text",
                    value: manualSale.cliente.nombre,
                    onChange: (evt) =>
                      setManualSale({
                        ...manualSale,
                        cliente: {
                          ...manualSale.cliente,
                          nombre: evt.target.value,
                        },
                      }),
                    placeholder: "Ej. Juan Pérez",
                    className:
                      "w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm",
                  }),
                ),
                e(
                  "div",
                  null,
                  e(
                    "label",
                    {
                      className:
                        "block text-xs text-gray-500 dark:text-gray-400 mb-1",
                    },
                    "Teléfono",
                  ),
                  e("input", {
                    type: "tel",
                    value: manualSale.cliente.telefono,
                    onChange: (evt) =>
                      setManualSale({
                        ...manualSale,
                        cliente: {
                          ...manualSale.cliente,
                          telefono: evt.target.value,
                        },
                      }),
                    placeholder: "Ej. 584241234567",
                    className:
                      "w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm",
                  }),
                ),
                e(
                  "div",
                  null,
                  e(
                    "label",
                    {
                      className:
                        "block text-xs text-gray-500 dark:text-gray-400 mb-1",
                    },
                    "Cédula / Documento",
                  ),
                  e("input", {
                    type: "text",
                    value: manualSale.cliente.cedula,
                    onChange: (evt) =>
                      setManualSale({
                        ...manualSale,
                        cliente: {
                          ...manualSale.cliente,
                          cedula: evt.target.value,
                        },
                      }),
                    placeholder: "Ej. V-12345678",
                    className:
                      "w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm",
                  }),
                ),
              ),
            ),
            // Sección 2: Productos
            e(
              "div",
              {
                className:
                  "space-y-4 border-t border-gray-100 dark:border-gray-700 pt-6",
              },
              e(
                "div",
                { className: "flex justify-between items-center" },
                e(
                  "h4",
                  {
                    className:
                      "text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider",
                  },
                  "2. Productos",
                ),
                e(
                  "button",
                  {
                    onClick: handleAddProductRow,
                    className:
                      "px-3 py-1 bg-emerald-50 dark:bg-emerald-955/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30 rounded-lg text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/35 flex items-center gap-1 active:scale-95 transition",
                  },
                  e("i", { className: "fas fa-plus" }),
                  "Agregar Producto",
                ),
              ),
              // Lista de productos
              e(
                "div",
                { className: "space-y-3" },
                manualSale.items.map((item, index) => {
                  const subtotal = item.price * item.cantidad;
                  return e(
                    "div",
                    {
                      key: index,
                      className:
                        "flex flex-wrap sm:flex-nowrap gap-3 items-end bg-gray-50 dark:bg-gray-900/40 p-3 rounded-xl border border-gray-100 dark:border-gray-800",
                    },
                    // Select Producto
                    e(
                      "div",
                      { className: "flex-1 min-w-[200px]" },
                      e(
                        "label",
                        {
                          className:
                            "block text-[10px] text-gray-400 dark:text-gray-500 mb-1",
                        },
                        "Producto",
                      ),
                      e(
                        "select",
                        {
                          value: item.producto,
                          onChange: (evt) =>
                            handleProductChange(index, evt.target.value),
                          className:
                            "w-full px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500",
                        },
                        e("option", { value: "" }, "Selecciona..."),
                        productCatalog.map((p) =>
                          e(
                            "option",
                            { key: p.id, value: p.name },
                            `${p.name} ($${p.price})${p.trackStock ? ` - Stock: ${p.stock}` : ''}`,
                          ),
                        ),
                      ),
                    ),
                    // Cantidad
                    e(
                      "div",
                      { className: "w-20" },
                      e(
                        "label",
                        {
                          className:
                            "block text-[10px] text-gray-400 dark:text-gray-500 mb-1",
                        },
                        "Cantidad",
                      ),
                      e("input", {
                        type: "number",
                        min: 1,
                        value: item.cantidad,
                        onChange: (evt) =>
                          handleQtyChange(index, evt.target.value),
                        className:
                          "w-full px-2 py-1.5 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 text-center",
                      }),
                    ),
                    // Precio (readonly)
                    e(
                      "div",
                      { className: "w-24" },
                      e(
                        "label",
                        {
                          className:
                            "block text-[10px] text-gray-400 dark:text-gray-500 mb-1",
                        },
                        "Precio Unit.",
                      ),
                      e(
                        "div",
                        {
                          className:
                            "w-full px-2 py-1.5 bg-gray-100/50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700 rounded-lg text-sm text-right",
                        },
                        `$${item.price.toFixed(2)}`,
                      ),
                    ),
                    // Subtotal
                    e(
                      "div",
                      { className: "w-24" },
                      e(
                        "label",
                        {
                          className:
                            "block text-[10px] text-gray-400 dark:text-gray-500 mb-1",
                        },
                        "Subtotal",
                      ),
                      e(
                        "div",
                        {
                          className:
                            "w-full px-2 py-1.5 bg-gray-100/50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-semibold border border-gray-100 dark:border-gray-700 rounded-lg text-sm text-right",
                        },
                        `$${subtotal.toFixed(2)}`,
                      ),
                    ),
                    // Eliminar fila
                    e(
                      "button",
                      {
                        onClick: () => handleRemoveProductRow(index),
                        className:
                          "p-2 bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400 rounded-lg active:scale-95 transition",
                      },
                      e("i", { className: "fas fa-trash-alt text-xs" }),
                    ),
                  );
                }),
              ),
              // Total USD
              e(
                "div",
                { className: "flex justify-end pr-8" },
                e(
                  "div",
                  { className: "text-right" },
                  e(
                    "span",
                    { className: "text-xs text-gray-500 dark:text-gray-400" },
                    "Total Venta: ",
                  ),
                  e(
                    "span",
                    {
                      className:
                        "text-lg font-bold text-gray-800 dark:text-white",
                    },
                    `$${manualSale.items.reduce((sum, item) => sum + item.price * item.cantidad, 0).toFixed(2)} USD`,
                  ),
                ),
              ),
            ),
            // Sección 3: Pago y Tasa
            e(
              "div",
              {
                className:
                  "space-y-4 border-t border-gray-100 dark:border-gray-700 pt-6",
              },
              e(
                "h4",
                {
                  className:
                    "text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider",
                },
                "3. Pago e Impuestos",
              ),
              e(
                "div",
                { className: "grid grid-cols-1 sm:grid-cols-3 gap-4" },
                // Método de pago
                e(
                  "div",
                  null,
                  e(
                    "label",
                    {
                      className:
                        "block text-xs text-gray-500 dark:text-gray-400 mb-1",
                    },
                    "Método de Pago",
                  ),
                  e(
                    "select",
                    {
                      value: manualSale.pago.metodo,
                      onChange: (evt) =>
                        setManualSale({
                          ...manualSale,
                          pago: {
                            ...manualSale.pago,
                            metodo: evt.target.value,
                          },
                        }),
                      className:
                        "w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm",
                    },
                    e("option", { value: "Efectivo" }, "💵 Efectivo"),
                    e("option", { value: "Pago Móvil" }, "📱 Pago Móvil"),
                    e("option", { value: "Transferencia" }, "🏦 Transferencia"),
                    e("option", { value: "Zelle" }, "🇺🇸 Zelle"),
                    e(
                      "option",
                      { value: "Punto de Venta" },
                      "💳 Punto de Venta",
                    ),
                  ),
                ),
                // Tasa BCV (readonly)
                e(
                  "div",
                  null,
                  e(
                    "label",
                    {
                      className:
                        "block text-xs text-gray-500 dark:text-gray-400 mb-1",
                    },
                    "Tasa BCV (Bs/$)",
                  ),
                  e(
                    "div",
                    {
                      className:
                        "w-full px-3 py-2 bg-gray-100 dark:bg-gray-900 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg text-sm",
                    },
                    bcvRate ? `${bcvRate.toFixed(4)}` : "Cargando...",
                  ),
                ),
                // Total en Bs
                e(
                  "div",
                  null,
                  e(
                    "label",
                    {
                      className:
                        "block text-xs text-gray-500 dark:text-gray-400 mb-1",
                    },
                    "Total en Bolívares (Bs)",
                  ),
                  e(
                    "div",
                    {
                      className:
                        "w-full px-3 py-2 bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-300 font-semibold border border-gray-200 dark:border-gray-700 rounded-lg text-sm",
                    },
                    `${(manualSale.items.reduce((sum, item) => sum + item.price * item.cantidad, 0) * bcvRate).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`,
                  ),
                ),
              ),
              // Comprobante de pago (opcional)
              e(
                "div",
                { className: "mt-4" },
                e(
                  "label",
                  {
                    className:
                      "block text-xs text-gray-500 dark:text-gray-400 mb-1",
                  },
                  "📸 Comprobante de Pago (opcional)",
                ),
                e(
                  "div",
                  { className: "flex items-center gap-3" },
                  e("input", {
                    type: "file",
                    accept: "image/*",
                    onChange: (evt) =>
                      setComprobanteFile(evt.target.files[0] || null),
                    className:
                      "w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 dark:file:bg-emerald-900/30 file:text-emerald-700 dark:file:text-emerald-400 hover:file:bg-emerald-100 dark:hover:file:bg-emerald-900/50 transition cursor-pointer",
                  }),
                  comprobanteFile &&
                    e(
                      "button",
                      {
                        onClick: () => setComprobanteFile(null),
                        className:
                          "text-red-500 hover:text-red-700 p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition flex-shrink-0",
                      },
                      e("i", { className: "fas fa-times" }),
                    ),
                ),
                comprobanteFile &&
                  e(
                    "p",
                    {
                      className:
                        "text-[10px] text-emerald-600 dark:text-emerald-400 mt-1",
                    },
                    `📎 ${comprobanteFile.name} (${(comprobanteFile.size / 1024).toFixed(1)} KB)`,
                  ),
              ),
            ),
            // Sección 4: Ubicación / Entrega
            e(
              "div",
              {
                className:
                  "space-y-4 border-t border-gray-100 dark:border-gray-700 pt-6",
              },
              e(
                "h4",
                {
                  className:
                    "text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider",
                },
                "4. Tipo de Entrega",
              ),
              e(
                "div",
                null,
                e(
                  "label",
                  {
                    className:
                      "block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 flex justify-between items-center",
                  },
                  e("span", null, "Dirección / Detalles de Entrega"),
                  (() => {
                    const matchedContact = manualSale.cliente.telefono ? dbContacts.find(c => c.telefono === manualSale.cliente.telefono) : null;
                    if (matchedContact && matchedContact.direcciones && matchedContact.direcciones.length > 0) {
                      const uniqueDirs = [...new Set(matchedContact.direcciones)];
                      return e(
                        "div",
                        { className: "flex flex-wrap gap-1 max-w-[60%] justify-end" },
                        uniqueDirs.map((dir, dIdx) => e(
                          "button",
                          {
                            key: dIdx,
                            title: dir,
                            type: "button",
                            onClick: () => setManualSale(prev => ({ ...prev, ubicacion: { direccion: dir } })),
                            className: "px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded text-[10px] hover:bg-emerald-100 dark:hover:bg-emerald-900/50 truncate max-w-[150px] transition cursor-pointer"
                          },
                          dir
                        ))
                      );
                    }
                    return null;
                  })()
                ),
                e("input", {
                  type: "text",
                  value: manualSale.ubicacion.direccion,
                  onChange: (evt) =>
                    setManualSale({
                      ...manualSale,
                      ubicacion: { direccion: evt.target.value },
                    }),
                  placeholder:
                    "Ej. Retiro en tienda o Dirección del cliente...",
                  className:
                    "w-full px-3 py-2 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm",
                }),
              ),
            ),
          ),
          // Footer / Acciones
          e(
            "div",
            {
              className:
                "p-4 border-t border-gray-100 dark:border-gray-700 flex gap-3 bg-gray-50 dark:bg-gray-900/50",
            },
            e(
              "button",
              {
                onClick: () => setShowManualSaleModal(false),
                className:
                  "flex-1 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-50 transition active:scale-95 text-sm",
              },
              "❌ Cancelar",
            ),
            e(
              "button",
              {
                onClick: handleSubmitManualSale,
                className:
                  "flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 transition flex items-center justify-center gap-2 active:scale-95 text-sm",
              },
              e("i", { className: "fas fa-check-circle" }),
              "💾 Registrar Venta",
            ),
          ),
        ),
      ),
  );
};

export default SalesDashboard;
