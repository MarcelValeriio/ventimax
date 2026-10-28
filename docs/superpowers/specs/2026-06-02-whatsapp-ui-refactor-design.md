# Spec: WhatsApp Business UI High-Fidelity Refactor

**Date:** 2026-06-02
**Status:** Draft
**Topic:** UI Refactoring

## 1. Goal
Refactor the current `ChatConsole` UI into a modular system that mirrors the official WhatsApp Business visual identity with "high fidelity". This includes specific design tokens, characteristic message bubbles ("tails"), and delivery status icons, while maintaining 100% of the current functional logic.

## 2. Context
The existing `ChatConsole.js` is a single large file (22KB) using `React.createElement` and Tailwind CSS. It handles state management, API calls, and complex UI rendering. While functional, it diverges visually from WhatsApp and is becoming difficult to maintain as a monolithic file.

## 3. Design Requirements

### 3.1 Visual Identity (extracted from Figma)
- **Primary Color (Header):** `#008069`
- **Secondary Green (Badges/Active):** `#128C7E`
- **Bright Green (Accents):** `#25D366`
- **Outgoing Bubble:** `#DCF8C6`
- **Incoming Bubble:** `#FFFFFF`
- **Chat Background:** `#EFE7DD` with the standard WhatsApp doodle pattern.
- **Typography:** Roboto (Medium/Regular) and Inter.

### 3.2 UI Components
- **Message Bubbles:** Must include the characteristic "tail" (rabillo). Outgoing messages aligned to the right, incoming to the left.
- **Delivery Status:** Implementation of check icons:
  - Sent: Single gray check `✓`.
  - Delivered: Double gray check `✓✓`.
  - Read: Double blue check `✓✓` (color `#53BDEB`).
- **Sidebar:** Modern contact cards with circular avatars and unread counters in WA green.
- **Header:** Contact name, avatar, "online" status, and standard action icons (Call, Video, Search).

## 4. Architecture
The refactor will use a **Smart-Dumb component pattern**. `ChatConsole.js` remains the "Smart" component (Container), while UI elements move to "Dumb" components (Presentational).

### 4.1 Component Tree
```
ChatConsole (Container - handles state/socket)
├── ChatSidebar (List of conversations)
│   └── ContactCard (Individual contact entry)
├── ChatWindow (Main area)
│   ├── ChatHeader (Contact info & actions)
│   ├── MessageList (Timeline container with background)
│   │   ├── MessageBubble (The "Tail" bubble)
│   │   └── PurchaseCard (Injected sales info)
│   └── ChatInput (Text field & action buttons)
```

### 4.2 Technical Constraints
- **Framework:** React 18+ via Skypack CDN.
- **Syntax:** `React.createElement` (No JSX/Babel in browser).
- **Styling:** Tailwind CSS + Custom CSS for specific shapes (bubble tails).
- **Zero-Breaking Policy:** All existing props, state names, and API endpoints must remain unchanged.

## 5. Implementation Plan
1. **Preparation:** Create `public/src/features/chat/components/` directory.
2. **Modularization:** Extract UI logic into individual files using `export default`.
3. **Refactor `ChatConsole`:** Update its `return` to use the new components.
4. **CSS Injection:** Add a small `<style>` block in the header or via JS for the bubble tails.
5. **Validation:** Verify real-time message receiving and delivery status updates.

## 6. Testing Strategy
- **Manual Verification:** Compare against Figma mockups in the visual companion.
- **Regression Testing:** Verify that "Confirm Payment", "Reactivate Bot", and "Lazy Loading" still work perfectly.
- **Responsive Check:** Ensure the "mobile-optimized" logic (hiding sidebar on mobile when chat is active) is preserved.
