import { Icono } from "../../components/Icono.js";
import React, { useState, useEffect } from "https://cdn.skypack.dev/react";
import apiClient from "../../services/apiClient.js";

const e = React.createElement;

const AIStudio = () => {
  const [destinations, setDestinations] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedGenId, setSelectedGenId] = useState(null);
  const selectedGen = history.find(item => item._id === selectedGenId) || null;
  
  const [newDestName, setNewDestName] = useState("");
  const [newDestPhone, setNewDestPhone] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [copyPrompt, setCopyPrompt] = useState("");
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const fetchDestinations = async () => {
    try {
      const { data } = await apiClient.get('/api/admin/ai-studio/destinations');
      if (data.success) setDestinations(data.data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchHistory = async () => {
    try {
      const { data } = await apiClient.get('/api/admin/ai-studio/history');
      if (data.success) {
        setHistory(data.data);
        setSelectedGenId(prev => (!prev && data.data.length > 0) ? data.data[0]._id : prev);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchDestinations();
    fetchHistory();
    const interval = setInterval(fetchHistory, 5000);
    return () => clearInterval(interval);
  }, []);

  const addDestination = async () => {
    if (!newDestName || !newDestPhone) return;
    try {
      await apiClient.post('/api/admin/ai-studio/destinations', { name: newDestName, phone: newDestPhone });
      setNewDestName(""); setNewDestPhone("");
      fetchDestinations();
    } catch (e) {
      window.showToast("Error agregando destino", "error");
    }
  };

  const deleteDestination = async (id) => {
    try {
      await apiClient.delete(`/api/admin/ai-studio/destinations/${id}`);
      fetchDestinations();
    } catch (e) {
      window.showToast("Error eliminando destino", "error");
    }
  };

  const generateImage = async () => {
    if (!imagePrompt) return;
    setIsGeneratingImg(true);
    try {
      await apiClient.post('/api/admin/ai-studio/generate-image', { prompt: imagePrompt });
      window.showToast("Generación iniciada en segundo plano", "success");
      setImagePrompt("");
      fetchHistory();
    } catch(err) {
      window.showToast("Error iniciando generación", "error");
    } finally {
      setIsGeneratingImg(false);
    }
  };

  const generateCopy = async () => {
    if (!selectedGen) return;
    setIsGeneratingCopy(true);
    try {
      const { data } = await apiClient.post('/api/admin/ai-studio/generate-copy', { 
        generationId: selectedGen._id, 
        extraPrompt: copyPrompt 
      });
      if (data.success) {
        setCopyPrompt("");
        fetchHistory();
      }
    } catch(err) {
      window.showToast("Error generando texto", "error");
    } finally {
      setIsGeneratingCopy(false);
    }
  };

  const broadcast = async () => {
    if (!selectedGen || !selectedGen.imageUrl) return;
    setIsBroadcasting(true);
    try {
      const { data } = await apiClient.post('/api/admin/ai-studio/broadcast', { generationId: selectedGen._id });
      window.showToast(`Enviado a ${data.sent} de ${data.total} contactos`, "success");
    } catch(err) {
      window.showToast(err.response?.data?.error || "Error enviando difusión", "error");
    } finally {
      setIsBroadcasting(false);
    }
  };

  const isCopyTooLong = selectedGen?.copyText?.length > 1024;

  return e("div", { className: "flex flex-col h-full bg-gray-50 dark:bg-gray-900 font-sans" },
    // Header
    e("div", { className: "p-6 bg-white dark:bg-gray-800 border-b dark:border-gray-700 flex justify-between items-center shrink-0" },
      e("div", null, 
        e("h1", { className: "text-2xl font-black text-gray-800 dark:text-white tracking-tighter uppercase italic" }, "AI Studio ", e("span", { className: "text-emerald-500 text-sm" }, "PRO")),
        e("p", { className: "text-gray-400 text-[10px] font-black uppercase tracking-widest" }, "Generador de Copy Bajo Demanda")
      )
    ),

    e("div", { className: "flex-1 flex overflow-hidden" },
      // Sidebar
      e("div", { className: "w-80 bg-white dark:bg-gray-800 border-r dark:border-gray-700 p-6 overflow-y-auto space-y-8 shrink-0" },
        // Destinatarios
        e("div", { className: "space-y-4" },
          e("h3", { className: "text-[10px] font-black uppercase text-gray-400 tracking-widest" }, "Envío Directo"),
          e("div", { className: "flex flex-col gap-2 bg-gray-50 dark:bg-gray-900 p-3 rounded-2xl" },
            e("input", { 
              value: newDestName, onChange: (ev) => setNewDestName(ev.target.value),
              placeholder: "Nombre", className: "p-2 rounded text-xs border dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200" 
            }),
            e("input", { 
              value: newDestPhone, onChange: (ev) => setNewDestPhone(ev.target.value),
              placeholder: "Teléfono", className: "p-2 rounded text-xs border dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200" 
            }),
            e("button", { onClick: addDestination, className: "bg-emerald-100 hover:bg-emerald-200 text-emerald-700 py-2 rounded-xl font-bold text-xs transition-colors" }, "Agregar Contacto")
          ),
          e("div", { className: "space-y-2" }, 
            destinations.map(d => e("div", { key: d._id, className: "flex items-center gap-3 bg-white dark:bg-gray-800 p-3 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm" },
              e("div", { className: "w-8 h-8 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center text-xs" }, e(Icono, { marca: "whatsapp" })),
              e("div", { className: "flex-1" },
                e("p", { className: "text-[10px] font-black dark:text-gray-200" }, d.name),
                e("p", { className: "text-[9px] text-gray-400 font-medium" }, d.phone)
              ),
              e("button", { onClick: () => deleteDestination(d._id), className: "text-red-400 hover:text-red-600 w-6 h-6 rounded-full hover:bg-red-50 flex items-center justify-center transition-colors" }, e(Icono, { nombre: "trash", className: "text-[10px]" }))
            ))
          )
        ),
        
        // Generador de Imagen
        e("div", { className: "space-y-4" },
          e("h3", { className: "text-[10px] font-black uppercase text-gray-400 tracking-widest" }, "Prompt de Imagen (DALL-E 3)"),
          e("textarea", { 
            value: imagePrompt, onChange: (ev) => setImagePrompt(ev.target.value),
            className: "w-full bg-gray-50 dark:bg-gray-900 border-none rounded-2xl p-4 text-sm focus:ring-2 ring-emerald-500 h-32 resize-none dark:text-white", 
            placeholder: "Describe la imagen ideal para tus redes sociales..." 
          }),
          e("button", { 
            onClick: generateImage, disabled: isGeneratingImg || !imagePrompt,
            className: "w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100" 
          }, e(Icono, { nombre: isGeneratingImg ? "loader-circle" : "image", girar: isGeneratingImg, className: "mr-2" }), isGeneratingImg ? "Generando..." : "Generar Arte")
        )
      ),

      // Central Area
      e("div", { className: "flex-1 p-6 bg-gray-50 dark:bg-gray-900 flex flex-col space-y-6 overflow-hidden" },
        // Galería
        e("div", { className: "flex flex-col space-y-3 shrink-0" },
          e("h4", { className: "text-[10px] font-black uppercase text-gray-400 tracking-widest" }, "Historial de Creaciones"),
          e("div", { className: "flex gap-4 overflow-x-auto pb-4 scrollbar-hide" },
            history.map(item => e("div", { 
              key: item._id, 
              onClick: () => setSelectedGenId(item._id),
              className: `flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden cursor-pointer transition-all border-2 ${selectedGen?._id === item._id ? 'ring-2 ring-emerald-500 ring-offset-4 border-white dark:border-gray-800' : 'opacity-50 grayscale hover:opacity-100 hover:grayscale-0 border-transparent'}`
            }, 
              item.status === 'pending' ? e("div", { className: "w-full h-full bg-gray-200 dark:bg-gray-800 flex items-center justify-center animate-pulse" }, e(Icono, { nombre: "loader-circle", girar: true, className: "text-gray-400" })) :
              item.status === 'failed' ? e("div", { className: "w-full h-full bg-red-100 flex items-center justify-center text-red-500" }, e(Icono, { nombre: "triangle-alert" })) :
              e("img", { src: item.imageUrl, className: "w-full h-full object-cover" })
            ))
          )
        ),

        // Preview & Copy
        e("div", { className: "flex-1 flex flex-col md:flex-row gap-6 overflow-hidden" },
          e("div", { className: "flex-1 flex flex-col items-center justify-center min-h-0" },
            e("div", { className: "w-full max-w-md aspect-square bg-white dark:bg-gray-800 rounded-[3rem] shadow-2xl overflow-hidden relative border-4 border-white dark:border-gray-800" },
              selectedGen?.imageUrl ? e("img", { src: selectedGen.imageUrl, className: "w-full h-full object-cover" }) :
              e("div", { className: "w-full h-full flex flex-col items-center justify-center text-gray-400 gap-4" },
                e(Icono, { nombre: "image", className: "text-4xl" }),
                e("span", { className: "text-xs font-bold uppercase tracking-widest" }, selectedGen?.status === 'pending' ? "Procesando..." : "Esperando Generación")
              )
            )
          ),

          e("div", { className: "flex-1 flex flex-col justify-center max-w-md w-full shrink-0 overflow-y-auto" },
            e("div", { className: "bg-white dark:bg-gray-800 rounded-[2rem] p-6 shadow-xl border border-gray-100 dark:border-gray-700 space-y-4" },
              e("div", { className: "flex justify-between items-center" },
                e("h3", { className: "text-[10px] font-black uppercase text-emerald-600 tracking-widest" }, "Generador de Copy"),
                e("span", { className: "text-[9px] bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded-full text-gray-500 font-bold" }, "DeepSeek")
              ),
              
              e("div", { className: "space-y-3" },
                e("label", { className: "block text-xs font-bold text-gray-500" }, "Instrucciones extra (Opcional)"),
                e("input", { 
                  value: copyPrompt, onChange: (ev) => setCopyPrompt(ev.target.value),
                  className: "w-full bg-gray-50 dark:bg-gray-900 border-none rounded-xl p-3 text-sm focus:ring-2 ring-emerald-500 dark:text-white", 
                  placeholder: 'Ej: "Hazlo más divertido", "Incluye 20% OFF"' 
                }),
                e("button", { 
                  onClick: generateCopy, disabled: !selectedGen || selectedGen.status !== 'completed' || isGeneratingCopy,
                  className: "w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100" 
                }, e(Icono, { nombre: isGeneratingCopy ? "loader-circle" : "pen-tool", girar: isGeneratingCopy }), isGeneratingCopy ? "Escribiendo..." : "Escribir Texto")
              ),

              e("hr", { className: "border-gray-100 dark:border-gray-700 my-4 border-dashed" }),

              selectedGen?.copyText && e("div", null,
                e("div", { className: "flex justify-between items-center mb-2" },
                  e("span", { className: "text-[9px] font-bold text-gray-400 uppercase" }, "Resultado"),
                  e("div", { className: "flex items-center gap-3" },
                    e("span", { className: `text-[10px] font-bold ${isCopyTooLong ? 'text-red-500' : 'text-gray-400'}` }, `${selectedGen.copyText.length}/1024`),
                    e("button", { 
                      onClick: () => { navigator.clipboard.writeText(selectedGen.copyText); window.showToast("Copiado al portapapeles"); },
                      className: "text-gray-400 hover:text-emerald-500 transition-colors" 
                    }, e(Icono, { nombre: "copy" }))
                  )
                ),
                e("div", { className: `p-4 rounded-xl text-sm italic overflow-y-auto max-h-32 ${isCopyTooLong ? 'bg-red-50 dark:bg-red-900/10 text-red-700 dark:text-red-400 border border-red-200' : 'bg-emerald-50 dark:bg-emerald-900/10 text-gray-700 dark:text-gray-300'}` },
                  selectedGen.copyText
                )
              ),

              e("div", { className: "pt-4 mt-4 border-t dark:border-gray-700" },
                e("button", { 
                  onClick: broadcast, disabled: isBroadcasting || !selectedGen || !selectedGen.imageUrl || isCopyTooLong,
                  className: "w-full bg-gray-900 dark:bg-emerald-500 hover:bg-black dark:hover:bg-emerald-400 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100" 
                }, e(Icono, isBroadcasting ? { nombre: "loader-circle", girar: true, className: "text-lg" } : { marca: "whatsapp", className: "text-lg" }), isBroadcasting ? "Enviando..." : "Enviar a WhatsApp"),
                e("p", { className: "text-center text-[9px] text-gray-400 mt-2 font-bold uppercase" }, isCopyTooLong ? "El texto excede el límite de WhatsApp" : "Distribuir a todos los destinatarios")
              )
            )
          )
        )
      )
    )
  );
};

export default AIStudio;