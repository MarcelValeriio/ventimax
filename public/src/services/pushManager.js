/**
 * public/src/services/pushManager.js
 * Cliente de Gestión de Notificaciones Web Push para el Frontend
 */
import apiClient from "./apiClient.js?v=4";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export const isPushSupported = () => {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
};

export const registerServiceWorker = async () => {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    return registration;
  } catch (error) {
    console.warn("⚠️ [PushManager] Error registrando sw.js:", error.message);
    return null;
  }
};

export const getCurrentPushSubscription = async () => {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch (error) {
    console.warn("⚠️ [PushManager] Error obteniendo suscripción:", error);
    return null;
  }
};

export const subscribeToWebPush = async (vapidPublicKey) => {
  if (!isPushSupported()) {
    throw new Error("Las notificaciones push no están soportadas en este navegador.");
  }

  // 1. Solicitar permiso al usuario
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permiso de notificaciones denegado por el usuario.");
  }

  // 2. Obtener registro de Service Worker
  let reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) {
    reg = await navigator.serviceWorker.register("/sw.js");
  }
  await navigator.serviceWorker.ready;

  // 3. Suscribirse con la clave pública VAPID
  if (!vapidPublicKey) {
    // Intentar obtenerla desde /api/config
    const configRes = await fetch("/api/config");
    const configData = await configRes.json();
    vapidPublicKey = configData.vapidPublicKey;
  }

  if (!vapidPublicKey) {
    throw new Error("Clave pública VAPID no configurada en el servidor.");
  }

  const convertedKey = urlBase64ToUint8Array(vapidPublicKey.trim());

  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: convertedKey,
    });
  }

  // 4. Enviar suscripción al backend
  const subJSON = subscription.toJSON();
  const res = await apiClient.post("/api/admin/push/subscribe", {
    subscription: subJSON,
  });

  return { subscription, data: res.data };
};

export const unsubscribeFromWebPush = async () => {
  if (!isPushSupported()) return false;

  try {
    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      try {
        await apiClient.post("/api/admin/push/unsubscribe", { endpoint });
      } catch (e) {
        console.warn("No se pudo notificar la baja al backend:", e.message);
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error al cancelar suscripción push:", error);
    throw error;
  }
};

export const sendTestWebPush = async () => {
  const res = await apiClient.post("/api/admin/push/test");
  return res.data;
};
