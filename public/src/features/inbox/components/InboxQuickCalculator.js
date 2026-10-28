// public/src/features/inbox/components/InboxQuickCalculator.js
// Calculadora rápida de cotización (USD y Bs BCV) con soporte para múltiples categorías.
import React, { useState, useEffect, useRef } from "https://cdn.skypack.dev/react";
import apiClient from "../../../services/apiClient.js?v=6";

const e = React.createElement;

let rowCounter = 0;
const generateRowId = () => `row-${Date.now()}-${++rowCounter}`;

const formatCategoryItem = (qty, cat) => {
  const emojiStr = cat?.emoji ? `${cat.emoji} ` : "";
  const catName = (cat?.name || "General").trim();
  const hasCaja = /cajas?/i.test(catName);
  const cajasLabel = hasCaja ? "" : (qty === 1 ? "caja de " : "cajas de ");
  return `${qty} ${cajasLabel}${emojiStr}${catName}`.replace(/\s+/g, " ").trim();
};

const InboxQuickCalculator = ({ onFillInput }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [bcvRate, setBcvRate] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const containerRef = useRef(null);

  // Cierre por click exterior o presionar Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Carga diferida al abrir por primera vez o reintentar
  useEffect(() => {
    if (isOpen && (!hasFetched || retryCount > 0)) {
      setLoading(true);
      setFetchError(null);

      Promise.all([
        apiClient.get("/api/admin/products?limit=100"),
        apiClient.get("/api/admin/bcv"),
      ])
        .then(([prodRes, bcvRes]) => {
          // Extraer productos activos
          const rawProds = Array.isArray(prodRes.data?.data)
            ? prodRes.data.data
            : Array.isArray(prodRes.data)
            ? prodRes.data
            : [];
          const activeProds = rawProds.filter((p) => p && p.activo === true && (!p.trackStock || (Number(p.stock) || 0) > 0));

          // Extraer categorías únicas a partir de los productos activos
          const categoriesMap = new Map();
          activeProds.forEach((p) => {
            const allCats = [
              p.categoria,
              ...(Array.isArray(p.categorias) ? p.categorias : []),
            ].filter(Boolean);

            allCats.forEach((c) => {
              const catName = (
                c?.nombre ||
                c?.name ||
                (typeof c === "string" && c.trim() ? c.trim() : "General")
              ).trim();

              const key = catName.toLowerCase();
              if (!categoriesMap.has(key)) {
                const catId = (c?._id || c?.id || catName).toString();
                categoriesMap.set(key, {
                  id: catId,
                  name: catName,
                  price: Number(p.price || 0),
                  emoji: (c?.emoji || p.emoji || "").trim(),
                  trackStock: p.trackStock,
                  stock: p.stock,
                });
              }
            });
          });

          const uniqueCategories = Array.from(categoriesMap.values());
          setCategories(uniqueCategories);

          // Inicializar rows con 1 fila por defecto usando la primera categoría
          if (uniqueCategories.length > 0) {
            setRows((prev) =>
              prev.length > 0
                ? prev
                : [
                    {
                      id: generateRowId(),
                      categoryId: uniqueCategories[0].id,
                      cantidad: 1,
                    },
                  ],
            );
          }

          // Extraer tasa BCV
          const tasa = Number(
            bcvRes.data?.data?.tasa ||
            bcvRes.data?.tasa ||
            bcvRes.data?.data?.rate ||
            0,
          );
          setBcvRate(tasa);
          setHasFetched(true);
        })
        .catch((err) => {
          console.error("InboxQuickCalculator: error al consultar catálogo o BCV:", err);
          setFetchError("No se pudieron cargar las categorías o la tasa.");
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, hasFetched, retryCount]);

  // Manejo de filas (mini-carrito)
  const handleAddRow = () => {
    if (categories.length === 0) return;
    const usedCatIds = new Set(rows.map((r) => r.categoryId));
    const unusedCat = categories.find((c) => !usedCatIds.has(c.id));
    const defaultCatId = unusedCat?.id || categories[0]?.id || "";

    setRows((prev) => [
      ...prev,
      {
        id: generateRowId(),
        categoryId: defaultCatId,
        cantidad: 1,
      },
    ]);
  };

  const handleDeleteRow = (rowId) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((r) => r.id !== rowId);
    });
  };

  const handleCategoryChange = (rowId, newCatId) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, categoryId: newCatId } : r)),
    );
  };

  const handleQuantityChange = (rowId, newQty) => {
    const validQty = Math.max(1, Number(newQty) || 1);
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, cantidad: validQty } : r)),
    );
  };

  const handleRetry = () => {
    setFetchError(null);
    setHasFetched(false);
    setRetryCount((c) => c + 1);
  };

  // Cálculo global
  const categoriesMapById = new Map(categories.map((c) => [c.id, c]));

  const totalUsd = rows.reduce((sum, row) => {
    const cat = categoriesMapById.get(row.categoryId) || categories[0];
    const price = Number(cat?.price || 0);
    const qty = Math.max(1, Number(row.cantidad) || 1);
    return sum + price * qty;
  }, 0);

  const totalBs = (totalUsd * (bcvRate || 0)).toFixed(2);

  // Inserción en el chat
  const handleInsert = () => {
    if (rows.length === 0 || categories.length === 0) return;

    let texto = "";
    if (rows.length === 1) {
      const row = rows[0];
      const cat = categoriesMapById.get(row.categoryId) || categories[0];
      const qty = Math.max(1, Number(row.cantidad) || 1);
      const itemStr = formatCategoryItem(qty, cat);
      texto = `*El monto por ${itemStr} sería de REF: ${totalUsd.toFixed(2)} (Bs: ${totalBs}).*\n
        📱 Pago Móvil
        🏦 Banco: 0172 - Bancamiga Banco Universal 
        👤 CI: E-83016063
        📞 Telf: 04149101013
      
✅ Cuando pagues, envía una Captura a este chat para procesar tu pedido.`;
    } else {
      const lines = rows.map((row) => {
        const cat = categoriesMapById.get(row.categoryId) || categories[0];
        const qty = Math.max(1, Number(row.cantidad) || 1);
        return `• ${formatCategoryItem(qty, cat)}`;
      });
      texto = `*Buenas, el Monto Total de su pedido es de:*\n${lines.join("\n")}\n\n*Total REF:* ${totalUsd.toFixed(2)} (Bs: *${totalBs}* ).\n 
      📱 Pago Móvil
      🏦 Banco: 0172 - Bancamiga Banco Universal 
      👤 CI: E-83016063
      📞 Telf: 04149101013
      \n✅ Cuando pagues, envía una *Captura* a este chat para procesar tu pedido.`;
    }

    if (typeof onFillInput === "function") {
      onFillInput(texto);
    }
    setIsOpen(false);
  };

  return e(
    "div",
    {
      ref: containerRef,
      className: "relative inline-block shrink-0",
    },
    [
      // Botón gatillo en la barra
      e(
        "button",
        {
          key: "btn-quick-calc",
          type: "button",
          onClick: () => setIsOpen((prev) => !prev),
          "aria-label": "Calculadora rápida de cotización",
          title: "Calculadora rápida de cotización (USD y Bs BCV)",
          className:
            "h-7 px-2.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 shrink-0 shadow-2xs cursor-pointer active:scale-95 transition bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700",
        },
        [
          e("i", {
            className: "fas fa-calculator text-[10px] text-emerald-600 dark:text-emerald-400",
            "aria-hidden": "true",
          }),
          e("span", { className: "hidden sm:inline" }, "Cotizar"),
        ],
      ),

      // Backdrop oscuro para cerrar en móvil
      isOpen &&
        e("div", {
          key: "calculator-backdrop",
          className: "fixed inset-0 bg-black/40 z-40 sm:hidden",
          onClick: () => setIsOpen(false),
          "aria-hidden": "true",
        }),

      // Popover flotante (fixed en mobile para evitar desborde/cortes, absolute en desktop)
      isOpen &&
        e(
          "div",
          {
            key: "popover-calculator",
            className:
              "fixed inset-x-3 bottom-16 sm:absolute sm:inset-x-auto sm:left-0 sm:bottom-full sm:mb-2 w-auto sm:w-96 max-w-[calc(100vw-1.5rem)] sm:max-w-md max-h-[82vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 sm:p-3.5 z-50 select-text flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150",
            style: { minWidth: "270px" },
          },
          [
            // Cabecera
            e(
              "div",
              {
                key: "popover-header",
                className:
                  "flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2",
              },
              [
                e("div", { className: "flex items-center gap-1.5" }, [
                  e("i", {
                    className:
                      "fas fa-calculator text-emerald-600 dark:text-emerald-400 text-xs",
                  }),
                  e(
                    "span",
                    { className: "text-xs font-bold text-gray-800 dark:text-gray-100" },
                    "Cotizador Rápido",
                  ),
                ]),
                e("div", { className: "flex items-center gap-2" }, [
                  bcvRate > 0 &&
                    e(
                      "span",
                      {
                        className:
                          "text-[10px] font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60 px-1.5 py-0.5 rounded",
                        title: "Tasa oficial BCV",
                      },
                      `BCV: ${bcvRate.toFixed(2)}`,
                    ),
                  e(
                    "button",
                    {
                      type: "button",
                      onClick: () => setIsOpen(false),
                      className:
                        "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs p-1 rounded-full cursor-pointer",
                      "aria-label": "Cerrar",
                    },
                    e("i", { className: "fas fa-times" }),
                  ),
                ]),
              ],
            ),

            // Estado de Carga
            loading &&
              e(
                "div",
                {
                  key: "loading-state",
                  className:
                    "py-6 flex flex-col items-center justify-center gap-2 text-gray-500 dark:text-gray-400",
                },
                [
                  e("i", {
                    className: "fas fa-circle-notch fa-spin text-lg text-emerald-500",
                  }),
                  e("span", { className: "text-xs" }, "Cargando catálogo y BCV..."),
                ],
              ),

            // Estado de Error
            !loading && fetchError &&
              e(
                "div",
                {
                  key: "error-state",
                  className: "py-3 text-center text-xs text-red-500 flex flex-col gap-2",
                },
                [
                  e("span", null, fetchError),
                  e(
                    "button",
                    {
                      type: "button",
                      onClick: handleRetry,
                      className:
                        "self-center text-[11px] font-bold text-emerald-600 hover:underline cursor-pointer",
                    },
                    "Reintentar",
                  ),
                ],
              ),

            // Estado Vacío
            !loading && !fetchError && categories.length === 0 &&
              e(
                "div",
                {
                  key: "empty-state",
                  className: "py-4 text-center text-xs text-gray-500 dark:text-gray-400",
                },
                "No hay categorías disponibles.",
              ),

            // Formulario multi-categoría y Totales
            !loading && !fetchError && categories.length > 0 &&
              e(
                "div",
                {
                  key: "calculator-body",
                  className: "flex flex-col gap-2.5",
                },
                [
                  // Encabezado de columnas
                  e(
                    "div",
                    {
                      key: "rows-header",
                      className:
                        "text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center justify-between px-0.5",
                    },
                    [
                      e("span", null, "Categoría"),
                      e(
                        "span",
                        { className: rows.length > 1 ? "pr-8" : "pr-2" },
                        "Cantidad",
                      ),
                    ],
                  ),

                  // Lista scrollable de filas
                  e(
                    "div",
                    {
                      key: "rows-container",
                      className:
                        "flex flex-col gap-2 max-h-60 overflow-y-auto pr-0.5",
                    },
                    rows.map((row) => {
                      const rowElements = [
                        // Select Categoría
                        e(
                          "select",
                          {
                            key: `select-${row.id}`,
                            value: row.categoryId,
                            onChange: (ev) =>
                              handleCategoryChange(row.id, ev.target.value),
                            className:
                              "flex-1 min-w-0 text-[11px] sm:text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 p-1 sm:p-1.5 focus:ring-2 focus:ring-emerald-500 outline-none cursor-pointer truncate",
                          },
                          categories.map((cat) => {
                            const emoji = cat.emoji ? `${cat.emoji} ` : "";
                            const catPrice = Number(cat.price || 0).toFixed(2);
                            return e(
                              "option",
                              { key: cat.id, value: cat.id },
                              `${emoji}${cat.name} ($${catPrice})${cat.trackStock ? ` - Stock: ${cat.stock}` : ''}`,
                            );
                          }),
                        ),

                        // Controles de cantidad
                        e(
                          "div",
                          {
                            key: `qty-group-${row.id}`,
                            className: "flex items-center gap-0.5 sm:gap-1 shrink-0",
                          },
                          [
                            e(
                              "button",
                              {
                                type: "button",
                                onClick: () =>
                                  handleQuantityChange(
                                    row.id,
                                    Math.max(1, row.cantidad - 1),
                                  ),
                                className:
                                  "w-5 sm:w-6 h-6 sm:h-7 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-200 flex items-center justify-center font-bold text-xs hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition cursor-pointer",
                                "aria-label": "Disminuir cantidad",
                              },
                              "−",
                            ),
                            e("input", {
                              type: "number",
                              min: 1,
                              value: row.cantidad,
                              onChange: (ev) => {
                                const val = parseInt(ev.target.value, 10);
                                handleQuantityChange(
                                  row.id,
                                  isNaN(val) || val < 1 ? 1 : val,
                                );
                              },
                              className:
                                "w-8 sm:w-11 h-6 sm:h-7 text-center text-xs font-bold rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-emerald-500 outline-none tabular-nums px-0.5 sm:px-1",
                            }),
                            e(
                              "button",
                              {
                                type: "button",
                                onClick: () =>
                                  handleQuantityChange(row.id, row.cantidad + 1),
                                className:
                                  "w-5 sm:w-6 h-6 sm:h-7 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-200 flex items-center justify-center font-bold text-xs hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-95 transition cursor-pointer",
                                "aria-label": "Aumentar cantidad",
                              },
                              "+",
                            ),
                          ],
                        ),
                      ];

                      // Botón papelera para eliminar fila (solo si rows.length > 1)
                      if (rows.length > 1) {
                        rowElements.push(
                          e(
                            "button",
                            {
                              key: `btn-del-${row.id}`,
                              type: "button",
                              onClick: () => handleDeleteRow(row.id),
                              title: "Eliminar fila",
                              "aria-label": "Eliminar fila",
                              className:
                                "w-6 sm:w-7 h-6 sm:h-7 rounded-lg flex items-center justify-center text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer shrink-0",
                            },
                            e("i", { className: "fas fa-trash text-xs" }),
                          ),
                        );
                      }

                      return e(
                        "div",
                        {
                          key: row.id,
                          className: "flex items-center gap-1.5",
                        },
                        rowElements,
                      );
                    }),
                  ),

                  // Botón + Añadir otro
                  e(
                    "button",
                    {
                      key: "btn-add-row",
                      type: "button",
                      onClick: handleAddRow,
                      className:
                        "self-start flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 py-1 px-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition cursor-pointer",
                    },
                    [
                      e("i", { className: "fas fa-plus text-[10px]" }),
                      e("span", null, "Añadir otro"),
                    ],
                  ),

                  // Totales en Grande
                  e(
                    "div",
                    {
                      key: "totals-card",
                      className:
                        "p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-between",
                    },
                    [
                      e("div", null, [
                        e(
                          "div",
                          {
                            className:
                              "text-[10px] font-bold uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400",
                          },
                          "Total USD",
                        ),
                        e(
                          "div",
                          {
                            className:
                              "text-xl font-black text-emerald-800 dark:text-emerald-200 tabular-nums leading-tight",
                          },
                          `$${totalUsd.toFixed(2)}`,
                        ),
                      ]),
                      e("div", { className: "text-right" }, [
                        e(
                          "div",
                          {
                            className:
                              "text-[10px] font-bold uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400",
                          },
                          "Total Bs",
                        ),
                        e(
                          "div",
                          {
                            className:
                              "text-base font-black text-emerald-700 dark:text-emerald-300 tabular-nums leading-tight",
                          },
                          `${totalBs} Bs`,
                        ),
                      ]),
                    ],
                  ),

                  // Botón Insertar en el chat
                  e(
                    "button",
                    {
                      key: "btn-insert-chat",
                      type: "button",
                      disabled: rows.length === 0,
                      onClick: handleInsert,
                      className:
                        "w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition cursor-pointer",
                    },
                    [
                      e("i", {
                        className: "fas fa-comment-dots text-xs",
                        "aria-hidden": "true",
                      }),
                      e("span", null, "Insertar en el chat"),
                    ],
                  ),
                ],
              ),
          ],
        ),
    ],
  );
};

export default InboxQuickCalculator;
