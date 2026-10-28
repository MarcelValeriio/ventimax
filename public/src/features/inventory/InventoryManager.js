/**
 * public/src/features/inventory/InventoryManager.js
 * Componente contenedor para la gestión de inventario, métodos de pago y envíos
 */
import React, { useState } from "https://cdn.skypack.dev/react";
import ProductTab from "./components/ProductTab.js";
import PaymentTab from "./components/PaymentTab.js";
import ShippingTab from "./components/ShippingTab.js";

const e = React.createElement;

const InventoryManager = () => {
  const [activeTab, setActiveTab] = useState("products");

  return e(
    "div",
    { className: "h-full flex flex-col bg-gray-50 dark:bg-gray-900" },
    // Tab Header
    e(
      "div",
      { className: "bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-4 md:px-6 flex items-center gap-6" },
      e(
        "button",
        {
          onClick: () => setActiveTab("products"),
          className: `py-4 text-sm font-bold border-b-2 transition-all ${
            activeTab === "products"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`
        },
        e("i", { className: "fas fa-box mr-2" }),
        "Productos"
      ),
      e(
        "button",
        {
          onClick: () => setActiveTab("payments"),
          className: `py-4 text-sm font-bold border-b-2 transition-all ${
            activeTab === "payments"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`
        },
        e("i", { className: "fas fa-credit-card mr-2" }),
        "Métodos de Pago"
      ),
      e(
        "button",
        {
          onClick: () => setActiveTab("shipping"),
          className: `py-4 text-sm font-bold border-b-2 transition-all ${
            activeTab === "shipping"
              ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          }`
        },
        e("i", { className: "fas fa-truck mr-2" }),
        "Envíos"
      )
    ),
    // Content
    e(
      "div",
      { className: "flex-1 overflow-auto" },
      activeTab === "products"
        ? e(ProductTab)
        : activeTab === "payments"
        ? e(PaymentTab)
        : e(ShippingTab)
    )
  );
};

export default InventoryManager;
