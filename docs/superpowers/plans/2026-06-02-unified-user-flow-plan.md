# Unified User Data Flow & ID Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge "Name" and "ID" steps into one, enforce ID as mandatory, and ensure visibility in Admin notifications and Dashboards.

**Architecture:** 
1.  **State Machine:** Update `chatFlowService.js` to extract ID via Regex in the `esperando_datos_cliente` state.
2.  **Controller:** Update `chatFlowController.js` messages and data handling.
3.  **Config:** Update `settings.json` templates.
4.  **UI:** Update React modals in `KanbanBoard.js` and `SalesDashboard.js`.

**Tech Stack:** Node.js, Mongoose, React (Skypack), Tailwind CSS.

---

### Task 1: Update Configuration Templates

**Files:**
- Modify: `config/brand/default/settings.json`

- [ ] **Step 1: Update message templates**
    Update `promptPersonalData` to ask for both and `orderNotificationAdmin` to include the ID.

```json
{
  "messages": {
    "promptPersonalData": "📝 Ingresa tu nombre completo y cédula (Ej: Juan Perez 12345678).",
    "orderNotificationAdmin": "🛍️ *NUEVA COMPRA*\n📞 {{telefono}}\n📦 {{items}}\n👤 {{nombre}} (ID: {{cedula}})\n💰 Total: ${{totalUSD}}"
  }
}
```

- [ ] **Step 2: Commit**
```bash
git add config/brand/default/settings.json
git commit -m "chore: update bot message templates for unified flow"
```

---

### Task 2: Implement Unified Extraction Logic in Service

**Files:**
- Modify: `services/chatFlowService.js`

- [ ] **Step 1: Refactor `esperando_datos_cliente` state**
    Implement regex extraction and state jumping.

```javascript
// Inside ChatFlowService.handleIncomingMessage, case "esperando_datos_cliente":
if (text && text.length > 3) {
  // Regex para detectar cédula (7 a 9 dígitos, ignorando puntos/espacios)
  const idMatch = text.match(/\d[\d\.\s\-]{6,10}\d/);
  let detectedId = null;
  let cleanedName = text;

  if (idMatch) {
    detectedId = idMatch[0].replace(/[\.\-\s]/g, "");
    // Si tiene el largo correcto de una cédula (7-9)
    if (detectedId.length >= 7 && detectedId.length <= 9) {
      cleanedName = text.replace(idMatch[0], "").trim().replace(/\s\s+/g, ' ');
      carrito.cedula = detectedId;
    } else {
      detectedId = null; // No era una cédula válida
    }
  }

  carrito.nombre = cleanedName;
  await orderService.setEstado(from, { paso: "inicio", carrito }, io); 

  if (carrito.cedula && (carrito.ubicacion || carrito.direccion_manual)) {
    await orderService.setEstado(from, { paso: "esperando_confirmacion_datos", carrito }, io);
    await chatFlow.solicitarConfirmacionDatos(from, carrito, io);
  } else if (carrito.cedula) {
    // Si tenemos cédula pero no ubicación
    await orderService.setEstado(from, { paso: "esperando_ubicacion", carrito }, io);
    await chatFlow.solicitarUbicacion(from, io);
  } else {
    // Si NO tenemos cédula, vamos al paso de pedirla
    await orderService.setEstado(from, { paso: "esperando_cedula", carrito }, io);
    await chatFlow.solicitarCedula(from, io);
  }
}
```

- [ ] **Step 2: Test logic with manual input simulation**
    (Verify via logs or manual test)

- [ ] **Step 3: Commit**
```bash
git add services/chatFlowService.js
git commit -m "feat: implement unified name and ID extraction logic"
```

---

### Task 3: Update Controller Messages

**Files:**
- Modify: `controllers/chatFlowController.js`

- [ ] **Step 1: Update `solicitarNombre` message**

```javascript
// controllers/chatFlowController.js
async solicitarNombre(to, io) {
  const msg = configManager.get("messages.promptPersonalData") || 
    "📝 Por favor, indícanos tu *Nombre, Apellido y Cédula* para el registro del pedido (Ej: Juan Perez 12345678):";
  const enviado = await enviarTexto(to, msg);
  if (enviado) await this.emitirYGuardar(to, msg, "bot", io);
  return enviado;
}
```

- [ ] **Step 2: Commit**
```bash
git add controllers/chatFlowController.js
git commit -m "feat: update controller prompt for unified data"
```

---

### Task 4: Update Frontend Dashboards (Kanban & Sales)

**Files:**
- Modify: `public/src/features/dashboard/KanbanBoard.js`
- Modify: `public/src/features/sales/SalesDashboard.js`

- [ ] **Step 1: Update `OrderDetailsModal` in Kanban**
    Ensure consistent display of ID.

```javascript
// public/src/features/dashboard/KanbanBoard.js
// Around line 65, inside Cliente section
e("h4", { className: "text-xl font-bold text-gray-800 dark:text-gray-100" }, order.cliente?.nombre || "Sin nombre registrado"),
e("p", { className: "text-xs font-black text-gray-400 uppercase mb-2" }, `🆔 ${order.cliente?.cedula ? 'V-' + order.cliente.cedula : 'CÉDULA NO REGISTRADA'}`),
```

- [ ] **Step 2: Update `OrderDetailsModal` in SalesDashboard**

```javascript
// public/src/features/sales/SalesDashboard.js
// Around line 65, inside Cliente section
e("h4", { className: "text-xl font-bold text-gray-800 dark:text-gray-100" }, order.cliente?.nombre || order.cliente || "Sin nombre registrado"),
e("p", { className: "text-xs font-black text-gray-400 uppercase mb-2" }, `🆔 ${order.cliente?.cedula ? 'V-' + order.cliente.cedula : 'CÉDULA NO REGISTRADA'}`),
```

- [ ] **Step 3: Commit**
```bash
git add public/src/features/dashboard/KanbanBoard.js public/src/features/sales/SalesDashboard.js
git commit -m "feat: display ID number in OrderDetailsModal across dashboards"
```

---

### Task 5: Final Validation & Cleanup

- [ ] **Step 1: End-to-end Verification**
    Simulate a user flow sending "Juan Perez 12345678" and verify it jumps directly to location.
- [ ] **Step 2: Verify Admin Notification**
    Verify the output message includes the ID in parentheses.
- [ ] **Step 3: Commit**
```bash
git commit --allow-empty -m "fix: final validation of unified flow"
```
