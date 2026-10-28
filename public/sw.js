/**
 * public/sw.js
 * Service Worker para Notificaciones Push en Segundo Plano (Web Push API)
 * VentiMax Platform
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: "Notificación de Panel",
        body: event.data.text(),
      };
    }
  }

  const title = data.title || "Notificación de Panel";
  const options = {
    body: data.body || "Nueva actualización en el sistema",
    icon: data.icon ? (data.icon.startsWith("http") ? data.icon : self.location.origin + data.icon) : self.location.origin + "/assets/favicon.svg",
    badge: data.badge ? (data.badge.startsWith("http") ? data.badge : self.location.origin + data.badge) : self.location.origin + "/assets/badge.png",
    vibrate: data.vibrate || [200, 100, 200],
    tag: data.tag || "panel-alert",
    renotify: true,
    requireInteraction: true,
    silent: false,
    data: {
      url: data.url || "/",
      timestamp: data.timestamp || Date.now(),
    },
    actions: [
      {
        action: "explore",
        title: "Ver en Panel",
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // Si ya hay una pestaña abierta, enfocarla
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      // Si no hay pestaña abierta, abrir una nueva ventana
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('fetch', (event) => {});
