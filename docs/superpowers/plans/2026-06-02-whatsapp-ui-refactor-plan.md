# WhatsApp Business UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the current monolithic `ChatConsole.js` into a modular, high-fidelity WhatsApp Business UI clone.

**Architecture:** Smart-Dumb component pattern. `ChatConsole.js` acts as the data container (Smart), delegating UI rendering to specialized presentational components (Dumb) in `features/chat/components/`.

**Tech Stack:** React (Skypack), Tailwind CSS, Native JS, Socket.io.

---

### Task 1: Setup and Base Styles

**Files:**
- Create: `public/src/features/chat/components/styles.js`
- Modify: `public/index.html` (Add Roboto font if missing)

- [ ] **Step 1: Define specific CSS for WhatsApp bubble tails**

```javascript
// public/src/features/chat/components/styles.js
const styles = `
  .wa-bubble-tail-in {
    position: absolute;
    left: -8px;
    top: 0;
    width: 0;
    height: 0;
    border-top: 0px solid transparent;
    border-bottom: 10px solid transparent;
    border-right: 10px solid #ffffff;
  }
  .wa-bubble-tail-out {
    position: absolute;
    right: -8px;
    top: 0;
    width: 0;
    height: 0;
    border-top: 0px solid transparent;
    border-bottom: 10px solid transparent;
    border-left: 10px solid #dcf8c6;
  }
  .wa-bg-doodle {
    background-color: #efe7dd;
    background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png');
    background-size: 400px;
  }
`;

export default styles;
```

- [ ] **Step 2: Inject styles into the document head in `ChatConsole.js`**

- [ ] **Step 3: Commit**

```bash
git add public/src/features/chat/components/styles.js
git commit -m "chore(chat): add whatsapp-specific design tokens and styles"
```

### Task 2: Implement Presentational Components (Sidebar & ContactCard)

**Files:**
- Create: `public/src/features/chat/components/ContactCard.js`
- Create: `public/src/features/chat/components/ChatSidebar.js`

- [ ] **Step 1: Create `ContactCard.js` using `React.createElement`**

```javascript
import React from "https://cdn.skypack.dev/react";
const e = React.createElement;

const ContactCard = ({ phone, resumen, isActive, onClick }) => {
  return e("div", {
    onClick,
    className: `p-3 border-b dark:border-gray-700 cursor-pointer transition flex items-center gap-3 ${isActive ? "bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-l-emerald-500" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"}`
  }, [
    e("div", { className: "w-12 h-12 rounded-full bg-gray-200 overflow-hidden shrink-0" }, 
      e("img", { src: `https://api.dicebear.com/7.x/avataaars/svg?seed=${phone}`, className: "w-full h-full" })
    ),
    e("div", { className: "flex-1 min-w-0" }, [
      e("div", { className: "flex justify-between items-start" }, [
        e("span", { className: "font-bold text-sm dark:text-gray-100 truncate" }, phone),
        e("span", { className: "text-[10px] text-gray-400 dark:text-gray-500 shrink-0" }, 
          new Date(resumen.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        )
      ]),
      e("p", { className: "text-xs text-gray-500 dark:text-gray-400 truncate pr-4" }, resumen.text)
    ])
  ]);
};

export default ContactCard;
```

- [ ] **Step 2: Create `ChatSidebar.js`**

- [ ] **Step 3: Commit**

```bash
git add public/src/features/chat/components/ContactCard.js public/src/features/chat/components/ChatSidebar.js
git commit -m "feat(chat): implement modular sidebar and contact cards"
```

### Task 3: Implement Chat Header and Input

**Files:**
- Create: `public/src/features/chat/components/ChatHeader.js`
- Create: `public/src/features/chat/components/ChatInput.js`

- [ ] **Step 1: Create `ChatHeader.js` with WhatsApp Business styles**

```javascript
import React from "https://cdn.skypack.dev/react";
const e = React.createElement;

const ChatHeader = ({ phone, onBack, actionButton, operationMode, onReactivate }) => {
  return e("div", { className: "p-3 border-b dark:border-gray-700 flex justify-between items-center shadow-sm z-10 bg-[#008069] text-white" }, [
    e("div", { className: "flex items-center gap-3 overflow-hidden" }, [
      e("button", { onClick: onBack, className: "block md:hidden p-2 text-white font-bold" }, "⬅️"),
      e("div", { className: "w-10 h-10 rounded-full bg-white/20 overflow-hidden" }, 
        e("img", { src: `https://api.dicebear.com/7.x/avataaars/svg?seed=${phone}`, className: "w-full" })
      ),
      e("div", { className: "truncate" }, [
        e("h4", { className: "font-bold text-[15px] truncate" }, phone),
        e("p", { className: "text-[11px] opacity-80" }, "en línea")
      ]),
      operationMode === "manual" && e("button", { 
        onClick: onReactivate, 
        className: "ml-2 bg-amber-100 text-amber-700 px-2 py-1 rounded text-[10px] font-black border border-amber-200" 
      }, "⚡ REINICIAR BOT")
    ]),
    actionButton
  ]);
};

export default ChatHeader;
```

- [ ] **Step 2: Create `ChatInput.js`**

- [ ] **Step 3: Commit**

```bash
git add public/src/features/chat/components/ChatHeader.js public/src/features/chat/components/ChatInput.js
git commit -m "feat(chat): implement whatsapp-style header and input"
```

### Task 4: Implement Message Components (Bubble & List)

**Files:**
- Create: `public/src/features/chat/components/MessageBubble.js`
- Create: `public/src/features/chat/components/MessageList.js`

- [ ] **Step 1: Create `MessageBubble.js` with "tail" support**

```javascript
import React from "https://cdn.skypack.dev/react";
const e = React.createElement;

const MessageBubble = ({ text, timestamp, direction, mediaId }) => {
  const isClient = direction === "cliente";
  return e("div", { className: `flex ${isClient ? "justify-start" : "justify-end"} mb-1` }, 
    e("div", { 
      className: `max-w-[85%] md:max-w-[70%] p-2 rounded-lg shadow-sm relative ${isClient ? "bg-white text-gray-800" : "bg-[#dcf8c6] text-gray-800"}`
    }, [
      e("div", { className: isClient ? "wa-bubble-tail-in" : "wa-bubble-tail-out" }),
      mediaId && e("img", {
        src: `/api/admin/media/${mediaId}`,
        className: "rounded-lg max-w-full mb-2 cursor-pointer",
        onClick: () => window.open(`/api/admin/media/${mediaId}`)
      }),
      e("p", { className: "text-[14.2px] break-words leading-relaxed" }, text),
      e("div", { className: "text-[11px] mt-1 text-right opacity-60 flex justify-end items-center gap-1" }, [
        new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        !isClient && e("span", { className: "text-[#53bdeb] font-bold" }, "✓✓")
      ])
    ])
  );
};

export default MessageBubble;
```

- [ ] **Step 2: Create `MessageList.js`**

- [ ] **Step 3: Commit**

```bash
git add public/src/features/chat/components/MessageBubble.js public/src/features/chat/components/MessageList.js
git commit -m "feat(chat): implement high-fidelity message bubbles with tails"
```

### Task 5: Integration and Refactor of ChatConsole

**Files:**
- Modify: `public/src/features/chat/ChatConsole.js`

- [ ] **Step 1: Import all new components**

- [ ] **Step 2: Replace inline UI logic with modular components**

- [ ] **Step 3: Verify all handlers (handleSend, handleReactivateBot, etc.) are correctly passed as props**

- [ ] **Step 4: Final verification and Commit**

```bash
git add public/src/features/chat/ChatConsole.js
git commit -m "refactor(chat): migrate ChatConsole to modular high-fidelity UI"
```
