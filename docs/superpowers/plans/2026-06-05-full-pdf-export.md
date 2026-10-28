# Full PDF Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow "Export PDF" to include ALL records for the selected date filter by fetching them on-demand.

**Architecture:** 
1. Update Backend to support `limit=0` (all records).
2. Update Frontend to add a `fullTransacciones` state.
3. Trigger a "fetch all" call when clicking the "Exportar PDF" button.

**Tech Stack:** Node.js, Express, React (Pure JS), apiClient.

---

### Task 1: Backend - Support Unlimited Records

**Files:**
- Modify: `controllers/adminController.js`

- [ ] **Step 1: Allow limit=0 to skip pagination in getSalesSummary**

```javascript
// controllers/adminController.js
const { page = 1, limit = 20, filtroFecha = 'mes', fechaInicio, fechaFin } = req.query;
const pageNum = parseInt(page);
const limitNum = parseInt(limit);
// Si limitNum es 0, no aplicamos skip/limit
const usePagination = limitNum > 0;
const skip = usePagination ? (pageNum - 1) * limitNum : 0;

// ... filtros de fecha iguales ...

// 5. Obtener Transacciones (Paginadas o Totales)
let query = Pedido.find(queryFilter).sort({ timestamp: -1 });

if (usePagination) {
  query = query.skip(skip).limit(limitNum);
}

const transaccionesRaw = await query.lean();
```

- [ ] **Step 2: Commit backend support**

```bash
git add controllers/adminController.js
git commit -m "feat(admin): support limit=0 for full data export"
```

---

### Task 2: Frontend - "Fetch All" Logic and PDF State

**Files:**
- Modify: `public/src/features/sales/SalesDashboard.js`

- [ ] **Step 1: Add state for full transactions and loading**

```javascript
const [fullTransacciones, setFullTransacciones] = useState([]);
const [isFetchingFull, setIsFetchingFull] = useState(false);
```

- [ ] **Step 2: Update handleShowPdfPreview to fetch all data**

```javascript
const handleOpenPdfPreview = async () => {
  try {
    setIsFetchingFull(true);
    const params = new URLSearchParams({
      page: 1,
      limit: 0, // Pide todo
      filtroFecha,
      fechaInicio,
      fechaFin
    });

    const res = await apiClient.get(`/api/admin/sales-summary?${params.toString()}`);
    if (res.data && res.data.success) {
      setFullTransacciones(res.data.data.transacciones);
      setShowPdfPreview(true);
    }
  } catch (err) {
    alert("Error al cargar datos para el reporte");
  } finally {
    setIsFetchingFull(false);
  }
};
```

- [ ] **Step 3: Update PDF Modal to use fullTransacciones**

```javascript
// En la sección del reporte-hoja-contable:
e(
  "tbody",
  null,
  fullTransacciones.map((t) => // <-- Cambiar transacciones por fullTransacciones
    e("tr", { key: t.id, ... }, [ ... ])
  )
)
```

- [ ] **Step 4: Update Export Button to use new handler**

```javascript
e("button", {
  onClick: handleOpenPdfPreview, // <-- Cambiar handler
  disabled: isFetchingFull,
  className: "..."
}, [
  isFetchingFull ? e("i", { className: "fa-spinner fa-spin" }) : e("i", { className: "fa-file-pdf" }),
  "Exportar PDF"
])
```

- [ ] **Step 5: Commit frontend changes**

```bash
git add public/src/features/sales/SalesDashboard.js
git commit -m "feat(sales): fetch all records on-demand for PDF report"
```

---

### Task 3: Final Validation

- [ ] **Step 1: Select "Hoy" and verify PDF has all orders from today (even > 20).**
- [ ] **Step 2: Select "Personalizado" and verify PDF matches the range.**
- [ ] **Step 3: Confirm main table remains paginated after closing PDF.**
