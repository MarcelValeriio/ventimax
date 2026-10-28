import React from "https://cdn.skypack.dev/react";
const { useState, useEffect } = React;
const e = React.createElement;

const ChatManualOrderModal = ({ 
  isOpen, 
  onClose, 
  whatsappId, 
  apiClient 
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comprobanteFile, setComprobanteFile] = useState(null);
  const [comprobanteAIUrl, setComprobanteAIUrl] = useState("");
  const [formData, setFormData] = useState({
    cliente: { nombre: "", cedula: "", telefono: whatsappId, direccion: "" },
    notas: "",
    items: [],
    pago: { metodo: { nombre: "Zelle", type: "digital" }, montoUSD: 0, referencia: "", pagoCon: "" }
  });
  
  const [catalogo, setCatalogo] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);

  useEffect(() => {
    if (isOpen && whatsappId) {
      setLoading(true);
      setComprobanteFile(null);
      setComprobanteAIUrl("");
      // Cargar catálogo y métodos de pago simultáneamente
      Promise.all([
        apiClient.get("/api/admin/products"),
        apiClient.get("/api/admin/payments")
      ]).then(([resProd, resPagos]) => {
        if (resProd.data && resProd.data.success) {
          setCatalogo(resProd.data.data.filter(p => p.activo && (!p.trackStock || (Number(p.stock) || 0) > 0)));
        }
        if (resPagos.data && resPagos.data.success) {
          setMetodosPago(resPagos.data.data.filter(m => m.activo));
          // Preseleccionar el primer método
          if (resPagos.data.data.length > 0) {
            const first = resPagos.data.data.filter(m => m.activo)[0];
            if(first) setFormData(p => ({...p, pago: {...p.pago, metodo: { nombre: first.nombre, type: first.tipo }}}));
          }
        }
      });
      // Extraer chat
      apiClient.post("/api/admin/chat/extract-order", { telefono: whatsappId })
        .then(res => {
          if (res.data && res.data.success) {
            const extraido = res.data.data;
            if (extraido.comprobanteUrl && (String(extraido.comprobanteUrl).startsWith("http") || String(extraido.comprobanteUrl).startsWith("/api/"))) {
              setComprobanteAIUrl(extraido.comprobanteUrl);
            } else {
              setComprobanteAIUrl("");
            }
            setFormData(prev => ({
              ...prev,
              cliente: {
                ...prev.cliente,
                nombre: extraido.cliente?.nombre || "",
                cedula: extraido.cliente?.cedula || "",
                direccion: extraido.cliente?.direccion || ""
              },
              notas: extraido.notas || "",
              items: extraido.items ? extraido.items.map(i => ({ producto: i.producto, cantidad: i.cantidad, precio: 0 })) : []
            }));
          }
        })
        .catch(err => {
          console.error("No se pudo extraer:", err);
          if (err?.response?.status !== 404) {
            window.showToast?.("No se pudo analizar el chat con IA. Llena los datos manual.", "error");
          } else {
            // Es un chat nuevo sin historial, no es un error real
            console.log("Chat sin historial previo, llenado manual requerido.");
          }
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [isOpen, whatsappId]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);

    const isDigital = (formData.pago.metodo.type || "").toLowerCase() !== "efectivo" && 
                      !(formData.pago.metodo.nombre || "").toLowerCase().includes("efectivo");
    
    const isValidUrl = comprobanteAIUrl && (String(comprobanteAIUrl).startsWith("http") || String(comprobanteAIUrl).startsWith("/api/"));
    if (isDigital && !comprobanteFile && !isValidUrl) {
      window.showToast?.("⚠️ Debes adjuntar o tener capturado el comprobante para pagos digitales.", "error");
      setSaving(false);
      return;
    }

    let totalUSD = 0;
    const finalItems = formData.items.filter(i => i.producto && i.cantidad > 0).map(i => {
      const prodEnCatalogo = catalogo.find(p => p.name === i.producto);
      const precio = prodEnCatalogo ? prodEnCatalogo.price : 0;
      const sub = precio * i.cantidad;
      totalUSD += sub;
      return { ...i, price: precio, subtotal: sub };
    });

    let pagoConNum = parseFloat(formData.pago.pagoCon) || 0;
    let vueltoUSD = 0;
    if (!isDigital && formData.pago.pagoCon !== "" && pagoConNum > 0) {
      if (pagoConNum < totalUSD) {
        window.showToast?.("⚠️ El billete (Pago con) no puede ser menor al total del pedido.", "error");
        setSaving(false);
        return;
      }
      vueltoUSD = Math.round((pagoConNum - totalUSD) * 100) / 100;
    }

    const manualSale = {
      correlativo: 0,
      whatsappId,
      telefono: whatsappId,
      cliente: {
        ...formData.cliente,
        telefono: whatsappId
      },
      estado: "pendiente_verificacion",
      items: finalItems,
      totalUSD,
      totalBs: 0,
      notas: formData.notas,
      ubicacion: {
        direccion: formData.cliente.direccion || "Retiro en tienda"
      },
      pago: {
        ...formData.pago,
        metodo: formData.pago.metodo.nombre,
        montoUSD: totalUSD,
        fecha: new Date(),
        verificado: false,
        ...(comprobanteAIUrl ? { comprobanteUrl: comprobanteAIUrl } : {}),
        ...(!isDigital && pagoConNum > 0 ? { pagoCon: pagoConNum, vuelto: vueltoUSD } : {})
      },
      timestamp: new Date()
    };

    const formPayload = new FormData();
    formPayload.append("data", JSON.stringify(manualSale));
    if (comprobanteFile) {
      formPayload.append("comprobante", comprobanteFile);
    }

    try {
      const res = await apiClient.post("/api/admin/manual-sale", formPayload, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      if (res.data && res.data.success) {
        window.showToast?.("✅ Venta manual generada");
        onClose();
      } else {
        window.showToast?.("❌ Error: " + res.data.error, "error");
      }
    } catch (e) {
      const errorMsg = e.response?.data?.error || "Error de red";
      window.showToast?.("❌ Error: " + errorMsg, "error");
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => setFormData(p => ({ ...p, items: [...p.items, { producto: "", cantidad: 1 }] }));
  const updateItem = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = value;
    setFormData(p => ({ ...p, items: newItems }));
  };
  const removeItem = (index) => {
    const newItems = formData.items.filter((_, i) => i !== index);
    setFormData(p => ({ ...p, items: newItems }));
  };

  return e("div", { className: "fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" }, 
    e("div", { className: "bg-[#111b21] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden text-[#e9edef] border border-[#2a3942]" }, [
      e("div", { className: "p-4 border-b border-[#2a3942] flex justify-between items-center bg-[#202c33]" }, [
        e("h2", { className: "text-lg font-bold flex items-center gap-2" }, [
          e("i", { className: "fas fa-robot text-[#00a884]" }),
          "Copiloto: Venta Manual"
        ]),
        e("button", { onClick: onClose, className: "text-[#8696a0] hover:text-[#e9edef] transition" }, 
          e("i", { className: "fas fa-times text-xl" })
        )
      ]),
      
      e("div", { className: "p-4 overflow-y-auto flex-1 space-y-5" }, [
        loading ? e("div", { className: "text-center py-12" }, [
          e("i", { className: "fas fa-circle-notch fa-spin text-4xl text-[#00a884] mb-3" }),
          e("p", { className: "text-[#8696a0] font-semibold tracking-wide" }, "Analizando la conversación...")
        ]) : e(React.Fragment, null, [
          
          e("div", { className: "grid grid-cols-2 gap-4" }, [
            e("div", null, [
              e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Nombre del Cliente"),
              e("input", {
                value: formData.cliente.nombre,
                onChange: ev => setFormData(p => ({...p, cliente: {...p.cliente, nombre: ev.target.value}})),
                className: "w-full bg-[#202c33] border border-[#2a3942] p-2.5 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none transition"
              })
            ]),
            e("div", null, [
              e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Cédula"),
              e("input", {
                value: formData.cliente.cedula,
                onChange: ev => setFormData(p => ({...p, cliente: {...p.cliente, cedula: ev.target.value}})),
                className: "w-full bg-[#202c33] border border-[#2a3942] p-2.5 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none transition"
              })
            ])
          ]),
          
          e("div", null, [
            e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Dirección de Entrega"),
            e("input", {
              value: formData.cliente.direccion,
              onChange: ev => setFormData(p => ({...p, cliente: {...p.cliente, direccion: ev.target.value}})),
              className: "w-full bg-[#202c33] border border-[#2a3942] p-2.5 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none transition"
            })
          ]),

          e("div", { className: "border border-[#2a3942] p-3.5 rounded-lg bg-[#202c33]" }, [
            e("div", { className: "flex justify-between mb-3 items-center" }, [
              e("h3", { className: "font-bold text-[#e9edef]" }, "Productos Extraídos"),
              e("button", { onClick: addItem, className: "bg-[#00a884]/20 text-[#00a884] px-3 py-1.5 rounded-md text-xs font-black hover:bg-[#00a884]/30 transition" }, "+ Agregar")
            ]),
            
            formData.items.map((item, idx) => e("div", { key: idx, className: "flex gap-2 mb-2" }, [
              e("select", { 
                value: item.producto, 
                onChange: ev => updateItem(idx, "producto", ev.target.value),
                className: "flex-1 bg-[#111b21] border border-[#2a3942] p-2 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none"
              }, [
                e("option", { value: "" }, "Selecciona..."),
                ...catalogo.map(c => e("option", { key: c._id, value: c.name }, `${c.name}${c.trackStock ? ` - Stock: ${c.stock}` : ''}`))
              ]),
              e("input", { 
                type: "number", min: "1", 
                value: item.cantidad,
                onChange: ev => updateItem(idx, "cantidad", ev.target.value),
                className: "w-20 bg-[#111b21] border border-[#2a3942] p-2 rounded-lg text-center text-sm text-[#e9edef] focus:border-[#00a884] outline-none"
              }),
              e("button", { onClick: () => removeItem(idx), className: "text-red-400 hover:text-red-300 px-3 transition" }, e("i", { className: "fas fa-trash" }))
            ]))
          ]),
          
          e("div", null, [
            e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Notas o Instrucciones (IA)"),
            e("textarea", {
              value: formData.notas,
              onChange: ev => setFormData(p => ({...p, notas: ev.target.value})),
              className: "w-full bg-[#202c33] border border-[#2a3942] p-2.5 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none transition resize-none",
              rows: 2
            })
          ]),

          e("div", { className: "flex justify-between items-center bg-[#202c33] border border-[#2a3942] p-3.5 rounded-lg mt-2" }, [
            e("span", { className: "font-bold text-[#e9edef]" }, "Método de Pago:"),
            e("select", {
              value: formData.pago.metodo.nombre,
              onChange: ev => {
                const met = metodosPago.find(m => m.nombre === ev.target.value);
                setFormData(p => ({...p, pago: {...p.pago, metodo: { nombre: ev.target.value, type: met ? met.tipo : "digital" }}}));
              },
              className: "bg-[#111b21] border border-[#2a3942] p-2 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none"
            }, [
              ...metodosPago.map(m => e("option", { key: m._id, value: m.nombre }, m.nombre))
            ])
          ]),

          (() => {
            const isEfe = (formData.pago.metodo.type || "").toLowerCase() === "efectivo" || 
                          (formData.pago.metodo.nombre || "").toLowerCase().includes("efectivo");
            if (!isEfe) return null;
            return e("div", { className: "flex justify-between items-center bg-[#202c33] border border-[#2a3942] p-3.5 rounded-lg mt-2" }, [
              e("span", { className: "font-bold text-[#e9edef]" }, "¿Monto a Entregar? ($):"),
              e("input", {
                type: "number", min: "1", step: "0.01",
                placeholder: "Ej: 20",
                value: formData.pago.pagoCon || "",
                onChange: ev => setFormData(p => ({...p, pago: {...p.pago, pagoCon: ev.target.value}})),
                className: "bg-[#111b21] border border-[#2a3942] p-2 rounded-lg text-sm text-[#e9edef] focus:border-[#00a884] outline-none w-32"
              })
            ]);
          })(),

          e("div", { className: "bg-[#202c33] border border-[#2a3942] p-3.5 rounded-lg mt-2 space-y-3" }, [
            e("label", { className: "block text-xs font-bold text-[#8696a0] mb-1" }, "Comprobante de Pago"),
            comprobanteAIUrl ? e("div", { className: "flex items-center gap-3 p-2.5 bg-[#111b21] rounded-lg border border-[#2a3942]" }, [
              e("img", { 
                src: comprobanteAIUrl, 
                alt: "Comprobante", 
                className: "w-16 h-16 object-cover rounded-lg border border-[#2a3942]" 
              }),
              e("div", { className: "flex-1 text-xs" }, [
                e("p", { className: "text-[#00a884] font-semibold flex items-center gap-1.5" }, [
                  e("i", { className: "fas fa-check-circle" }),
                  "Comprobante extraído del chat"
                ]),
                e("a", { 
                  href: comprobanteAIUrl, 
                  target: "_blank", 
                  rel: "noopener noreferrer", 
                  className: "text-[#8696a0] hover:text-[#e9edef] underline mt-1 inline-block" 
                }, "Ver imagen completa")
              ])
            ]) : null,
            e("div", null, [
              e("input", {
                type: "file",
                accept: "image/*",
                onChange: ev => setComprobanteFile(ev.target.files[0]),
                className: "block w-full text-xs text-[#8696a0] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#00a884]/20 file:text-[#00a884] hover:file:bg-[#00a884]/30 cursor-pointer"
              })
            ])
          ])
        ])
      ]),
      
      e("div", { className: "p-4 border-t border-[#2a3942] flex justify-end gap-3 bg-[#202c33]" }, [
        e("button", { onClick: onClose, className: "px-5 py-2.5 rounded-lg text-[#e9edef] font-bold hover:bg-[#111b21] transition" }, "Cancelar"),

      (() => {
        const isDigital = (formData.pago.metodo.type || "").toLowerCase() !== "efectivo" && 
                          !(formData.pago.metodo.nombre || "").toLowerCase().includes("efectivo");
        const isValidUrl = comprobanteAIUrl && (String(comprobanteAIUrl).startsWith("http") || String(comprobanteAIUrl).startsWith("/api/"));
        const faltaComprobante = isDigital && !comprobanteFile && !isValidUrl;
        return e("button", { 
          onClick: faltaComprobante ? () => window.showToast?.("⚠️ Adjunta el comprobante de pago primero.", "error") : handleSave, 
          disabled: loading || saving,
          className: `px-5 py-2.5 rounded-lg font-black transition flex items-center gap-2 ${faltaComprobante ? 'bg-gray-700 text-gray-500 cursor-not-allowed hover:bg-gray-700' : 'bg-[#00a884] text-[#111b21] hover:bg-[#008069] disabled:opacity-50'}` 
        }, [
          saving ? e("i", { className: "fas fa-spinner fa-spin" }) : e("i", { className: "fas fa-check" }),
          "Confirmar e Ingresar"
        ])
      })()
      ])
    ])
  );
};

export default ChatManualOrderModal;
