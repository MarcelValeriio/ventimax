// public/src/features/whatsapp/components/MessageList.js
import React from "https://cdn.skypack.dev/react";
import MessageBubble from "./MessageBubble.js?v=5";
const e = React.createElement;

const getDateLabel = (timestamp) => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (d.toDateString() === today.toDateString()) return "Hoy";
  if (d.toDateString() === yesterday.toDateString()) return "Ayer";
  
  return d.toLocaleDateString("es-VE", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
};

const MessageList = ({
  messages,
  purchaseHistory,
  scrollRef,
  hasMore,
  loadMoreMessages,
  loadingHistory,
  operationMode,
  onRetryMessage,
  onReply,
}) => {
  // Combinar mensajes con tarjetas de compra (Lógica de Inyección)
  const timelineItems = [...messages.map((m) => ({ ...m, timelineType: "message" }))];
  
  purchaseHistory.forEach((order) => {
    timelineItems.push({
      ...order,
      timestamp: new Date(order.timestamp).getTime(),
      timelineType: "purchase",
    });
  });
  // Ordenar cronológicamente
  timelineItems.sort((a, b) => a.timestamp - b.timestamp);

  return e(
    "div",
    {
      ref: scrollRef,
      className: "flex-1 overflow-y-auto p-4 space-y-1 wa-bg-doodle relative",
    },
    [
      // Banner Modo Manual
      operationMode === "manual" &&
        e(
          "div",
          { className: "flex justify-center mb-3 z-10 relative" },
          e(
            "div",
            {
              className: "bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 shadow-sm",
            },
            [
              "👤 Modo Manual — El bot está pausado para este chat. Los mensajes del cliente no recibirán respuesta automática."
            ]
          )
        ),

      // Botón Cargar más
      hasMore &&
        e(
          "div",
          { className: "flex justify-center pb-4 mb-4 z-10 relative" },
          e(
            "button",
            {
              onClick: loadMoreMessages,
              className: "text-[12px] bg-white border border-gray-200 px-4 py-1.5 rounded-full text-[#008069] shadow-sm hover:bg-gray-50 transition font-medium flex items-center gap-1.5",
            },
            [
              e("i", { className: `fas ${loadingHistory ? "fa-spinner fa-spin" : "fa-history"} text-xs` }),
              loadingHistory ? "Cargando..." : "Cargar mensajes anteriores"
            ]
          )
        ),
      
      // Timeline rendering con etiquetas de fecha
      ...timelineItems.reduce((acc, item, idx) => {
        const itemDate = new Date(item.timestamp).toDateString();
        const prevDate = idx > 0 ? new Date(timelineItems[idx - 1].timestamp).toDateString() : null;

        // Inyectar etiqueta de fecha si cambió el día
        if (itemDate !== prevDate) {
          acc.push(
            e(
              "div",
              { key: `date-${itemDate}`, className: "flex justify-center my-3 relative z-10" },
              e(
                "span",
                { className: "bg-[#f0f2f5] text-[#54656f] text-[11.5px] uppercase font-medium px-3 py-1 rounded-lg shadow-sm" },
                getDateLabel(item.timestamp)
              )
            )
          );
        }

        if (item.timelineType === "purchase") {
          acc.push(
            e(
              "div",
              { key: `order-${idx}`, className: "flex justify-center my-4 relative z-10" },
              e(
                "div",
                { className: "bg-[#e2f5fc] border border-[#b2dff2] rounded-xl p-3 max-w-[90%] md:max-w-md shadow-sm flex items-center gap-3" },
                [
                  e("div", { className: "w-10 h-10 bg-[#027eb5] text-white rounded-full flex items-center justify-center shrink-0" }, 
                    e("i", { className: "fas fa-shopping-bag" })
                  ),
                  e("div", null, [
                    e("p", { className: "text-xs font-black text-[#015c85] uppercase tracking-tighter" }, `📦 Pedido Confirmado ${item.correlativo || "---"}`),
                    e("p", { className: "text-[10px] text-[#027eb5]" }, `Total: $${item.pago?.montoUSD || 0} / Bs. ${item.pago?.montoVES?.toLocaleString("es-VE") || "0"}`)
                  ])
                ]
              )
            )
          );
        } else {
          // Burbuja de Mensaje
          acc.push(
            e(MessageBubble, {
              key: `msg-${item._id || item.wamid || idx}`,
              _id: item._id,
              wamid: item.wamid,
              text: item.text || item.texto,
              caption: item.caption,
              fileName: item.fileName,
              mediaUrl: item.mediaUrl,
              timestamp: item.timestamp,
              direction: item.direction || item.direccion,
              mediaId: item.mediaId,
              tipo: item.tipo,
              mimeType: item.mimeType,
              status: item.status || item.estado || 'sent',
              replyToText: item.replyToText,
              replyToMid: item.replyToMid,
              onRetry: onRetryMessage,
              onReply: onReply,
            })
          );
        }
        return acc;
      }, [])
    ]
  );
};

export default MessageList;
