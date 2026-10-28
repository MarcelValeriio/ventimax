# Spec: Unified User Data Flow & ID Integration

**Date:** 2026-06-02
**Status:** Draft
**Topic:** Bot Flow Optimization & Billing Requirements

## 1. Goal
Simplify the user data collection process in the WhatsApp bot by merging the "Name" and "ID Number" (Cédula) steps into a single interaction. This aims to reduce friction, improve conversion rates, and ensure mandatory ID collection for billing purposes.

## 2. Requirements

### 2.1 Unified Data Collection
- **Input:** A single message prompt asking for "Full Name and ID Number".
- **Extraction:** Use Regex to identify an ID number (7-9 digits) within the user's response.
- **Validation:** 
    - The ID number is **mandatory**. 
    - If the user provides both Name and ID, skip the next step.
    - If the user provides only the Name, proceed to a secondary "ID only" prompt.
    - If the user provides only the ID, proceed to a secondary "Name only" prompt.

### 2.2 Billing & Visibility
- **Mandatory ID:** The flow cannot proceed to the location step without a valid ID.
- **UI Visibility:** The ID must be clearly visible in:
    - Admin notification templates (WhatsApp message sent to the store).
    - Kanban Board (Order Details Modal).
    - Sales Dashboard (Order Details Modal).

### 2.3 Individual Editing
- Even if data is collected together, the user must be able to edit the Name or the ID separately during the confirmation phase to fix specific typos.

## 3. Proposed Changes

### 3.1 Backend (Services & Controllers)

#### `services/chatFlowService.js`
- Update `esperando_datos_cliente` state logic:
    - Analyze `text` for a numeric pattern `/\d{7,9}/`.
    - If found: 
        - Save numeric part as `cedula`.
        - Save remaining text (trimmed) as `nombre`.
        - Jump to `esperando_ubicacion` (or `esperando_confirmacion_datos` if location exists).
    - If not found:
        - Save `text` as `nombre`.
        - Move to `esperando_cedula` state.

#### `controllers/chatFlowController.js`
- Update `solicitarNombre` message to explicitly ask for both: *"📝 Por favor, indícanos tu *Nombre, Apellido y Cédula* para el registro del pedido (Ej: Juan Perez 12345678):"*
- Ensure `solicitarConfirmacionDatos` continues to show both fields clearly.

### 3.2 Configuration
- **`config/brand/default/settings.json`**:
    - Update `messages.promptPersonalData` to match the new unified prompt.
    - Update `messages.orderNotificationAdmin` to include the ID: `... 👤 {{nombre}} (ID: {{cedula}}) ...`

### 3.3 Frontend (Dashboards)
- **`public/src/features/dashboard/KanbanBoard.js`** & **`public/src/features/sales/SalesDashboard.js`**:
    - Ensure the `OrderDetailsModal` displays the ID with a consistent prefix (e.g., `V-` or `ID:`).

## 4. Technical Constraints
- **Regex Robustness:** Must handle common separators like dots, dashes, or spaces in the ID.
- **Legacy Compatibility:** Existing orders in the database must not be affected by the logic change.

## 5. Implementation Plan
1. **Service Update:** Implement extraction logic in `chatFlowService.js`.
2. **Controller Update:** Modify message strings and data handling in `chatFlowController.js`.
3. **Config Update:** Update `settings.json` templates.
4. **UI Update:** Add the ID field to the modal in both dashboard files.
5. **Validation:** Test with various inputs (Name+ID, Name only, ID only, ID with dots).

## 6. Testing Strategy
- **Success Case:** "Pedro Perez 10200300" -> Name: Pedro Perez, ID: 10200300.
- **Partial Case:** "Maria Lopez" -> Bot asks: "Ahora indícanos tu cédula".
- **Formatting Case:** "Juan 20.100.300" -> Name: Juan, ID: 20100300.
- **UI Check:** Open a new order in the dashboard and verify the ID is visible.
