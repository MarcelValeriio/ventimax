# Paginación del Historial Contable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement server-side pagination (20 items per page) for the Sales Dashboard with classic navigation buttons.

**Architecture:** Update backend controller to handle pagination and filtering. Update frontend to fetch data dynamically and render a custom pagination component consistent with the SaaS emerald theme.

**Tech Stack:** Node.js, Express, MongoDB (Mongoose), React (Pure JS), Tailwind CSS.

---

### Task 1: Backend - Pagination and Filtering in adminController

**Files:**
- Modify: `controllers/adminController.js`

- [ ] **Step 1: Update getSalesSummary to support query params**

```javascript
// controllers/adminController.js around line 1007
const getSalesSummary = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { filtro, inicio, fin } = req.query;

    // Build filter object for Mongoose
    let queryFilter = {
      estado: { $in: ["entregado", "confirmado", "verificado", "en_ruta"] }
    };

    if (filtro === 'personalizado' && inicio) {
      const dInicio = new Date(inicio);
      dInicio.setHours(0, 0, 0, 0);
      const dFin = fin ? new Date(fin) : new Date();
      dFin.setHours(23, 59, 59, 999);
      queryFilter.timestamp = { $gte: dInicio, $lte: dFin };
    } else if (filtro === 'hoy') {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      queryFilter.timestamp = { $gte: hoy };
    } else if (filtro === 'semana') {
      const haceSemana = new Date();
      haceSemana.setDate(haceSemana.getDate() - 7);
      queryFilter.timestamp = { $gte: haceSemana };
    } else if (filtro === 'mes') {
      const mesActual = new Date();
      mesActual.setDate(1);
      mesActual.setHours(0, 0, 0, 0);
      queryFilter.timestamp = { $gte: mesActual };
    }

    // 1. Get total count for pagination metadata
    const totalRecords = await Pedido.countDocuments(queryFilter);
    const totalPages = Math.ceil(totalRecords / limit);

    // 2. Calculate KPIs on ALL filtered records (not just the page)
    const allFilteredOrders = await Pedido.find(queryFilter).select('pago estado verifiedAt deliveredAt').lean();
    
    let totalIngresos = 0;
    let totalEntregados = 0;
    let sumaTiempoEntrega = 0;

    allFilteredOrders.forEach((p) => {
      totalIngresos += Number(p?.pago?.montoUSD || 0);
      if (p.estado === "entregado" && p.verifiedAt && p.deliveredAt) {
        const diff = (new Date(p.deliveredAt) - new Date(p.verifiedAt)) / (1000 * 60);
        if (diff > 0) { sumaTiempoEntrega += diff; totalEntregados++; }
      }
    });

    const avgDeliveryTime = totalEntregados > 0 ? Math.round(sumaTiempoEntrega / totalEntregados) : 0;

    // 3. Get paginated transactions
    const pedidosPaginados = await Pedido.find(queryFilter)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const transacciones = pedidosPaginados.map((p) => ({
      id: p?.correlativo || p?._id,
      idPedidoOriginal: p?._id,
      cliente: p?.cliente?.nombre || "Sin nombre",
      productos: (p?.items || []).map((i) => `${i?.producto} x${i?.cantidad}`).join(", "),
      total: p?.pago?.montoUSD || 0,
      totalBs: p?.pago?.montoVES || 0,
      tasaHistorial: p?.pago?.tasa || 0,
      fecha: p?.timestamp || new Date(),
    }));

    // (Churn analysis code remains largely same but could use queryFilter if needed)
    // ... existing churn logic ...

    return res.status(200).json({
      success: true,
      data: {
        // ... other data ...
        pagination: {
          totalRecords,
          totalPages,
          currentPage: page,
          limit
        },
        transacciones,
        kpis: {
          totalIngresos: formatUsd(totalIngresos),
          totalPedidos: totalRecords,
          ticketPromedio: totalRecords > 0 ? formatUsd(totalIngresos / totalRecords) : "0.00",
          avgDeliveryTime
        }
      },
    });
  } catch (error) { /* ... */ }
};
```

- [ ] **Step 2: Commit backend changes**

```bash
git add controllers/adminController.js
git commit -m "feat(admin): support pagination and server-side filtering in sales summary"
```

---

### Task 2: Frontend - Update State and API Calls

**Files:**
- Modify: `public/src/features/sales/SalesDashboard.js`

- [ ] **Step 1: Update state and fetchSales logic**

```javascript
// public/src/features/sales/SalesDashboard.js
const SalesDashboard = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filtroFecha, setFiltroFecha] = useState("todos");
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  // New state
  const [currentPage, setCurrentPage] = useState(1);

  const fetchSales = async (isManual = false, page = 1) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      
      const params = new URLSearchParams({
        page: page,
        limit: 20,
        filtro: filtroFecha,
        inicio: fechaInicio,
        fin: fechaFin
      });

      const res = await apiClient.get(`/api/admin/sales-summary?${params.toString()}`);
      if (res.data && res.data.success) {
        setData(res.data.data);
        setCurrentPage(page);
        setError(null);
      } else {
        throw new Error("Formato de respuesta inválido");
      }
    } catch (err) {
      setError("Error al cargar métricas");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Re-fetch when filter or page changes
  useEffect(() => {
    fetchSales(false, currentPage);
  }, [currentPage, filtroFecha, fechaInicio, fechaFin]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filtroFecha, fechaInicio, fechaFin]);

  // Remove local getVentasFiltradas logic as it's now server-side
  const transacciones = data?.transacciones || [];
  const totalIngresosUSD = data?.kpis?.totalIngresos || "0.00";
  const totalIngresosBS = data?.kpis?.totalIngresosBS || 0; // Ensure backend returns this too or calculate locally from data
```

- [ ] **Step 2: Commit frontend state changes**

```bash
git add public/src/features/sales/SalesDashboard.js
git commit -m "refactor(sales): move filtering and sorting to server-side"
```

---

### Task 3: Frontend - Pagination Component (Emerald Style)

**Files:**
- Modify: `public/src/features/sales/SalesDashboard.js`

- [ ] **Step 1: Implement PaginationControls component**

```javascript
// Inside SalesDashboard.js or as a separate helper
const PaginationControls = ({ pagination, onPageChange }) => {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { currentPage, totalPages, totalRecords, limit } = pagination;
  
  const pages = [];
  // Simple logic for page numbers
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return e("div", { className: "mt-6 flex flex-col items-center gap-4" }, [
    e("div", { className: "flex items-center gap-2" }, [
      e("button", {
        disabled: currentPage === 1,
        onClick: () => onPageChange(currentPage - 1),
        className: "p-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-30 transition-all active:scale-90"
      }, e("i", { className: "fas fa-chevron-left" })),
      
      pages.map((p, idx) => 
        p === '...' 
        ? e("span", { key: `dot-${idx}`, className: "text-gray-400 px-2" }, "...")
        : e("button", {
            key: p,
            onClick: () => onPageChange(p),
            className: `w-10 h-10 rounded-xl font-bold text-sm transition-all active:scale-90 ${p === currentPage 
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200 dark:shadow-none" 
              : "text-gray-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 border border-transparent"}`
          }, p)
      ),

      e("button", {
        disabled: currentPage === totalPages,
        onClick: () => onPageChange(currentPage + 1),
        className: "p-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-30 transition-all active:scale-90"
      }, e("i", { className: "fas fa-chevron-right" }))
    ]),
    e("p", { className: "text-[10px] font-black uppercase text-gray-400 tracking-widest" }, 
      `Mostrando ${Math.min(limit, totalRecords)} de ${totalRecords} pedidos`
    )
  ]);
};

// Add to SalesDashboard render below the table
// ... 
e("div", { className: "p-4 border-t dark:border-gray-700" }, [
  e(PaginationControls, { 
    pagination: data?.pagination, 
    onPageChange: (p) => setCurrentPage(p) 
  })
])
```

- [ ] **Step 2: Verify and Commit**

```bash
git add public/src/features/sales/SalesDashboard.js
git commit -m "feat(sales): add emerald-style pagination controls"
```

---

### Task 4: Final Validation

- [ ] **Step 1: Test different filters**
- [ ] **Step 2: Verify page changes**
- [ ] **Step 3: Ensure KPIs don't change when flipping pages**
- [ ] **Step 4: Check mobile responsiveness of pagination**
