# Inventory and Payment Methods Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Inventory section to include tabs for Products and Payment Methods, migrate payments to a MongoDB collection with dynamic fields, and update the bot flow to use the database.

**Architecture:** The frontend will split the monolithic `ProductTable.js` into an `InventoryManager.js` (Tabs container), `ProductTab.js` (existing logic), and `PaymentTab.js` (new CRUD for payments). The backend will introduce a `MetodoPago` Mongoose model and CRUD endpoints. The bot will be updated to fetch active payment methods from the database and format the response dynamically.

**Tech Stack:** Node.js, Express, Mongoose, React (CDN via Skypack), TailwindCSS.

---

### Task 1: Backend - Create Model and Seeding Script

**Files:**
- Create: `models/MetodoPago.js`
- Create: `scripts/migrate-payments.js`
- Test: `scripts/test-payments-model.js`

- [ ] **Step 1: Write the failing test / verification script**

```javascript
// scripts/test-payments-model.js
require("dotenv").config();
const mongoose = require("mongoose");
const MetodoPago = require("../models/MetodoPago");

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const count = await MetodoPago.countDocuments();
  console.log(`Payment methods count: ${count}`);
  process.exit(0);
}
run().catch(console.error);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-payments-model.js`
Expected: FAIL (Cannot find module '../models/MetodoPago')

- [ ] **Step 3: Write minimal implementation (Model)**

```javascript
// models/MetodoPago.js
const mongoose = require("mongoose");

const MetodoPagoSchema = new mongoose.Schema({
  tipo: { type: String, required: true, enum: ['transferencia', 'pago_movil', 'zelle', 'binance', 'efectivo', 'otro'] },
  nombre: { type: String, required: true },
  detalles: { type: Object, default: {} },
  notaAdicional: { type: String, default: "" },
  activo: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model("MetodoPago", MetodoPagoSchema);
```

- [ ] **Step 4: Write Migration Script**

```javascript
// scripts/migrate-payments.js
require("dotenv").config();
const mongoose = require("mongoose");
const MetodoPago = require("../models/MetodoPago");
const configManager = require("../services/configManager");

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  const payments = configManager.get("payments");
  
  if (!payments) {
    console.log("No payments found in config to migrate.");
    process.exit(0);
  }

  for (const [key, data] of Object.entries(payments)) {
    const exists = await MetodoPago.findOne({ nombre: data.nombre });
    if (!exists) {
      let tipo = 'otro';
      if (key.includes('transferencia')) tipo = 'transferencia';
      else if (key.includes('pago movil') || key.includes('pagomovil')) tipo = 'pago_movil';
      else if (key.includes('zelle')) tipo = 'zelle';
      else if (key.includes('usdt') || key.includes('binance')) tipo = 'binance';
      else if (key.includes('efectivo')) tipo = 'efectivo';

      await MetodoPago.create({
        tipo,
        nombre: data.nombre,
        detalles: { instruccionesDePago: data.instrucciones }, // For later manual split
        activo: true
      });
      console.log(`Migrated: ${data.nombre}`);
    }
  }
  console.log("Migration complete.");
  process.exit(0);
}
migrate().catch(console.error);
```

- [ ] **Step 5: Run tests and migration to verify it passes**

Run: `node scripts/migrate-payments.js`
Run: `node scripts/test-payments-model.js`
Expected: PASS (count > 0)

- [ ] **Step 6: Commit**

```bash
git add models/MetodoPago.js scripts/migrate-payments.js scripts/test-payments-model.js
git commit -m "feat(backend): add MetodoPago model and migration script"
```

---

### Task 2: Backend - API Endpoints

**Files:**
- Create: `controllers/paymentController.js`
- Modify: `routes/adminRoutes.js`
- Test: `scripts/test-payments-api.js`

- [ ] **Step 1: Write the failing test**

```javascript
// scripts/test-payments-api.js
const http = require("http");

http.get("http://localhost:3000/api/admin/payments", {
  headers: {
    // You might need a mock token or just expect a 401 if unauthenticated, 
    // but assuming we test route existence:
    "Cookie": "token=mock-admin-token" 
  }
}, (res) => {
  console.log(`Status: ${res.statusCode}`);
  process.exit(res.statusCode === 404 ? 1 : 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-payments-api.js`
Expected: FAIL (404 Not Found)

- [ ] **Step 3: Write minimal implementation (Controller)**

```javascript
// controllers/paymentController.js
const MetodoPago = require("../models/MetodoPago");

const getPayments = async (req, res) => {
  try {
    const payments = await MetodoPago.find();
    res.json({ success: true, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const createPayment = async (req, res) => {
  try {
    const payment = await MetodoPago.create(req.body);
    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const updatePayment = async (req, res) => {
  try {
    const payment = await MetodoPago.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    await MetodoPago.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

module.exports = { getPayments, createPayment, updatePayment, deletePayment };
```

- [ ] **Step 4: Modify Routes**

```javascript
// Add to routes/adminRoutes.js
const paymentController = require("../controllers/paymentController");

// Below // Gestión de Inventario
router.get("/payments", isAuthenticated, authorize("admin"), paymentController.getPayments);
router.post("/payments", isAuthenticated, authorize("admin"), paymentController.createPayment);
router.put("/payments/:id", isAuthenticated, authorize("admin"), paymentController.updatePayment);
router.delete("/payments/:id", isAuthenticated, authorize("admin"), paymentController.deletePayment);
```

- [ ] **Step 5: Run tests**

Start server, run `node scripts/test-payments-api.js` (with a valid token or bypass locally).
Expected: PASS (200 or 401, not 404).

- [ ] **Step 6: Commit**

```bash
git add controllers/paymentController.js routes/adminRoutes.js scripts/test-payments-api.js
git commit -m "feat(backend): add CRUD endpoints for payment methods"
```

---

### Task 3: Bot - Update Flow Logic

**Files:**
- Modify: `controllers/chatFlowController.js`
- Modify: `controllers/botController.js` (if applicable)
- Modify: `data/constants.js` (Remove hardcoded stuff if needed, or adjust imports)

- [ ] **Step 1: Write the failing test**

```javascript
// No automated test here easily without a full bot mock, but we can verify the code visually.
// We will replace configManager.get("payments") with DB call.
```

- [ ] **Step 2: Modify `controllers/chatFlowController.js`**

Find `solicitarMetodoPago` and update:
```javascript
// Add import at top
const MetodoPago = require("../models/MetodoPago");

// Inside solicitarMetodoPago(to, io):
async solicitarMetodoPago(to, io) {
  try {
    const msg = configManager.get("messages.promptPayment") || "💳 ¿Cómo deseas realizar el pago?";
    const paymentMethods = await MetodoPago.find({ activo: true });

    if (!paymentMethods || paymentMethods.length === 0) {
      await this.emitirYGuardar(to, "❌ Lo sentimos, no hay métodos de pago disponibles.", "bot", io);
      return;
    }

    const rows = paymentMethods.map((pm) => ({
      id: pm._id.toString(),
      title: pm.nombre,
      description: pm.tipo === "efectivo" ? "Pago exacto o con vuelto" : `Pago vía ${pm.tipo.replace('_', ' ')}`
    }));

    const buttons = {
      title: "Métodos de Pago",
      rows: rows
    };

    await enviarBotones(to, msg, buttons, "Opciones de Pago");
    await this.emitirYGuardar(to, "Métodos de pago enviados", "bot", io);
  } catch (error) {
    console.error("[ChatFlowController] Error obteniendo métodos:", error);
  }
}
```

- [ ] **Step 3: Modify `botController.js` (Payment confirmation formatting)**

Find where `carrito.pago` is used to send instructions (e.g., `PAYMENT_DETAILS[pago]`).
Update to fetch from DB and build dynamic text:
```javascript
// In botController.js, replace PAYMENT_DETAILS lookup with:
const MetodoPago = require("../models/MetodoPago");

// When confirming payment instructions:
const metodo = await MetodoPago.findById(carrito.pago);
let instruccionesStr = `💳 *${metodo.nombre}*\n\n`;

if (metodo.tipo === 'pago_movil') {
  instruccionesStr += `🏦 Banco: ${metodo.detalles.banco}\n📱 Teléfono: ${metodo.detalles.telefono}\n🪪 Cédula: ${metodo.detalles.cedula}\n`;
} else if (metodo.tipo === 'transferencia') {
  instruccionesStr += `🏦 Banco: ${metodo.detalles.banco}\n🔢 Cuenta: ${metodo.detalles.cuenta}\n👤 Titular: ${metodo.detalles.titular}\n🪪 CI/RIF: ${metodo.detalles.cedula}\n`;
} else if (metodo.tipo === 'zelle') {
  instruccionesStr += `✉️ Correo: ${metodo.detalles.correo}\n`;
} else if (metodo.tipo === 'binance') {
  instruccionesStr += `🟡 ID/Correo: ${metodo.detalles.id}\n`;
} else {
  instruccionesStr += metodo.detalles.instruccionesDePago || "";
}

if (metodo.notaAdicional) instruccionesStr += `\n📝 Nota: ${metodo.notaAdicional}\n`;
instruccionesStr += `\n⚠️ Envía el comprobante a este chat para confirmar.`;
```

- [ ] **Step 4: Commit**

```bash
git add controllers/chatFlowController.js controllers/botController.js
git commit -m "feat(bot): dynamic payment instructions from database"
```

---

### Task 4: Frontend - Refactor InventoryManager

**Files:**
- Create: `public/src/features/inventory/InventoryManager.js`
- Rename: `public/src/features/dashboard/ProductTable.js` to `public/src/features/inventory/components/ProductTab.js`
- Modify: `public/index.html`

- [ ] **Step 1: Write `InventoryManager.js`**

```javascript
// public/src/features/inventory/InventoryManager.js
import React, { useState } from "https://cdn.skypack.dev/react";
import ProductTab from "./components/ProductTab.js";
import PaymentTab from "./components/PaymentTab.js";

const e = React.createElement;

const InventoryManager = () => {
  const [activeTab, setActiveTab] = useState("products");

  return e(
    "div",
    { className: "h-full flex flex-col bg-gray-50 dark:bg-gray-900" },
    e(
      "div",
      { className: "px-6 pt-6 pb-2" },
      e(
        "div",
        { className: "flex space-x-2 border-b border-gray-200 dark:border-gray-700" },
        e("button", {
          onClick: () => setActiveTab("products"),
          className: `px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'products' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`
        }, "📦 Productos"),
        e("button", {
          onClick: () => setActiveTab("payments"),
          className: `px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeTab === 'payments' ? 'border-emerald-500 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`
        }, "💳 Métodos de Pago")
      )
    ),
    e(
      "div",
      { className: "flex-1 overflow-auto" },
      activeTab === "products" ? e(ProductTab) : e(PaymentTab)
    )
  );
};

export default InventoryManager;
```

- [ ] **Step 2: Move and update `ProductTable.js`**

```bash
mkdir -p public/src/features/inventory/components
mv public/src/features/dashboard/ProductTable.js public/src/features/inventory/components/ProductTab.js
```
*(No internal logic changes needed for ProductTab.js other than export renaming if desired)*

- [ ] **Step 3: Update `public/index.html`**

Find `ProductTable` import and usage, replace with `InventoryManager`:
```javascript
// Replace:
import ProductTable from "./src/features/dashboard/ProductTable.js";
// With:
import InventoryManager from "./src/features/inventory/InventoryManager.js";

// Inside activeTab === "inventory" rendering:
activeTab === "inventory" && e("div", { className: "h-full overflow-auto" }, e(InventoryManager)),
```

- [ ] **Step 4: Commit**

```bash
git add public/src/features/inventory/ public/index.html public/src/features/dashboard/ProductTable.js
git commit -m "refactor(ui): introduce InventoryManager and tabs"
```

---

### Task 5: Frontend - PaymentTab UI

**Files:**
- Create: `public/src/features/inventory/components/PaymentTab.js`

- [ ] **Step 1: Write `PaymentTab.js`**

```javascript
// public/src/features/inventory/components/PaymentTab.js
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js";

const e = React.createElement;

const PaymentTab = () => {
  const [payments, setPayments] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [formData, setFormData] = useState({ tipo: "transferencia", nombre: "", detalles: {}, notaAdicional: "", activo: true });

  const fetchPayments = async () => {
    try {
      const { data } = await apiClient.get("/api/admin/payments");
      if (data.success) setPayments(data.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchPayments(); }, []);

  const handleToggle = async (p) => {
    try {
      await apiClient.put(`/api/admin/payments/${p._id}`, { activo: !p.activo });
      fetchPayments();
    } catch (err) { alert("Error"); }
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar método?")) return;
    try {
      await apiClient.delete(`/api/admin/payments/${id}`);
      fetchPayments();
    } catch (err) { alert("Error"); }
  };

  const handleSave = async (ev) => {
    ev.preventDefault();
    try {
      if (editingPayment) {
        await apiClient.put(`/api/admin/payments/${editingPayment._id}`, formData);
      } else {
        await apiClient.post("/api/admin/payments", formData);
      }
      setIsModalOpen(false);
      fetchPayments();
    } catch (err) { alert("Error saving"); }
  };

  const openModal = (p = null) => {
    setEditingPayment(p);
    setFormData(p || { tipo: "transferencia", nombre: "", detalles: {}, notaAdicional: "", activo: true });
    setIsModalOpen(true);
  };

  const handleDetalleChange = (key, value) => {
    setFormData({ ...formData, detalles: { ...formData.detalles, [key]: value } });
  };

  const renderDynamicFields = () => {
    const fields = [];
    if (formData.tipo === 'transferencia') {
      fields.push({ key: 'banco', label: 'Banco' }, { key: 'cuenta', label: 'Nro de Cuenta' }, { key: 'titular', label: 'Titular' }, { key: 'cedula', label: 'Cédula/RIF' });
    } else if (formData.tipo === 'pago_movil') {
      fields.push({ key: 'banco', label: 'Banco' }, { key: 'telefono', label: 'Teléfono' }, { key: 'cedula', label: 'Cédula' });
    } else if (formData.tipo === 'zelle') {
      fields.push({ key: 'correo', label: 'Correo Electrónico' });
    } else if (formData.tipo === 'binance') {
      fields.push({ key: 'id', label: 'ID / Correo' });
    } else if (formData.tipo === 'otro' || formData.tipo === 'efectivo') {
      fields.push({ key: 'instruccionesDePago', label: 'Instrucciones Manuales' });
    }

    return fields.map(f => e("div", { key: f.key, className: "mb-2" },
      e("label", { className: "block text-xs font-bold mb-1" }, f.label),
      e("input", { 
        type: "text", 
        value: formData.detalles[f.key] || "", 
        onChange: (ev) => handleDetalleChange(f.key, ev.target.value),
        className: "w-full p-2 border rounded"
      })
    ));
  };

  return e("div", { className: "p-6" },
    e("div", { className: "flex justify-between items-center mb-6" },
      e("h2", { className: "text-xl font-bold" }, "Métodos de Pago"),
      e("button", { onClick: () => openModal(), className: "bg-emerald-600 text-white px-4 py-2 rounded-xl" }, "+ Nuevo Método")
    ),
    e("div", { className: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" },
      payments.map(p => e("div", { key: p._id, className: "bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border" },
        e("div", { className: "flex justify-between items-center mb-4" },
          e("h3", { className: "font-bold text-lg" }, p.nombre),
          e("button", { onClick: () => handleToggle(p), className: `w-12 h-6 rounded-full flex items-center transition-colors px-1 ${p.activo ? 'bg-emerald-500 justify-end' : 'bg-gray-300 justify-start'}` },
            e("div", { className: "w-4 h-4 bg-white rounded-full shadow" })
          )
        ),
        e("div", { className: "text-sm text-gray-500 mb-4" }, `Tipo: ${p.tipo}`),
        e("div", { className: "flex gap-2" },
          e("button", { onClick: () => openModal(p), className: "flex-1 bg-blue-50 text-blue-600 py-2 rounded-lg font-bold" }, "Editar"),
          e("button", { onClick: () => handleDelete(p._id), className: "w-10 bg-red-50 text-red-500 rounded-lg" }, e("i", { className: "fas fa-trash" }))
        )
      ))
    ),
    // Modal
    isModalOpen && e("div", { className: "fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" },
      e("div", { className: "bg-white p-6 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" },
        e("h3", { className: "text-lg font-bold mb-4" }, editingPayment ? "Editar Pago" : "Nuevo Pago"),
        e("form", { onSubmit: handleSave },
          e("div", { className: "mb-3" },
            e("label", { className: "block text-xs font-bold mb-1" }, "Nombre Visible"),
            e("input", { required: true, value: formData.nombre, onChange: e => setFormData({...formData, nombre: e.target.value}), className: "w-full p-2 border rounded" })
          ),
          e("div", { className: "mb-3" },
            e("label", { className: "block text-xs font-bold mb-1" }, "Tipo de Pago"),
            e("select", { value: formData.tipo, onChange: e => setFormData({...formData, tipo: e.target.value}), className: "w-full p-2 border rounded" },
              ['transferencia', 'pago_movil', 'zelle', 'binance', 'efectivo', 'otro'].map(t => e("option", { key: t, value: t }, t))
            )
          ),
          e("div", { className: "p-3 bg-gray-50 rounded-lg mb-3" },
            renderDynamicFields()
          ),
          e("div", { className: "mb-4" },
            e("label", { className: "block text-xs font-bold mb-1" }, "Nota Adicional (Opcional)"),
            e("textarea", { value: formData.notaAdicional, onChange: e => setFormData({...formData, notaAdicional: e.target.value}), className: "w-full p-2 border rounded h-16" })
          ),
          e("div", { className: "flex gap-2" },
            e("button", { type: "button", onClick: () => setIsModalOpen(false), className: "flex-1 py-2 bg-gray-100 rounded-lg font-bold" }, "Cancelar"),
            e("button", { type: "submit", className: "flex-1 py-2 bg-emerald-600 text-white rounded-lg font-bold" }, "Guardar")
          )
        )
      )
    )
  );
};

export default PaymentTab;
```

- [ ] **Step 2: Check Frontend**

Launch the React app/check the server to make sure the "PaymentTab" renders without crashes.

- [ ] **Step 3: Commit**

```bash
git add public/src/features/inventory/components/PaymentTab.js
git commit -m "feat(ui): add PaymentTab for managing payment methods"
```
