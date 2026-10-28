# /add-push-notifications — Mejorar sistema de notificaciones y sonidos

## Objetivo
El sistema de notificaciones push YA EXISTE parcialmente en `public/index.html` (funciones `requestNotificationPermission`, `sendPushNotification`, sonidos `playCashSound`/`playAlertSound`). Esta skill lo robustece con: sonido de éxito para verificación de pago, toggle de sonidos por tipo desde Settings, y badge de notificaciones no leídas en el título de la pestaña.

## Paso 1: Añadir sonido de éxito (pago verificado)

En `public/index.html`, buscar donde se definen los sonidos:
```js
const cashSound = new Audio("/assets/sounds/cash-register.mp3");
const alertSound = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
```

Añadir después:
```js
const successSound = new Audio("https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3");
const playSuccessSound = () => {
  successSound.currentTime = 0;
  successSound.play().catch((e) => console.warn("Audio bloqueado:", e.message));
};
```

## Paso 2: Conectar sonido de éxito a eventos

En los listeners de socket, buscar donde se emite confirmación de pago. Si no existe un listener específico, añadir uno nuevo dentro del `useEffect` de socket:

```js
socket.on("pago_confirmado", (order) => {
  playSuccessSound();
  window.showToast(
    `✅ Pago verificado: #${order.correlativo || order.id}`,
    "success",
  );
  sendPushNotification(
    "✅ Pago Verificado",
    `Pedido #${order.correlativo} de ${order.cliente?.nombre} ha sido confirmado.`,
  );
});
```

## Paso 3: Badge de notificaciones en el título de la pestaña

Añadir esta lógica en el `useEffect` principal:

```js
// Contador de notificaciones no leídas (cambia el título de la pestaña)
let unreadCount = 0;
const originalTitle = document.title;

const updateTitleBadge = () => {
  document.title = unreadCount > 0 
    ? `(${unreadCount}) ${originalTitle}` 
    : originalTitle;
};

// Modificar sendPushNotification para incrementar contador
const originalSendPushNotification = sendPushNotification;
window.sendPushNotification = (title, body) => {
  unreadCount++;
  updateTitleBadge();
  return originalSendPushNotification(title, body);
};

// Resetear contador cuando la pestaña recibe foco
window.addEventListener("focus", () => {
  unreadCount = 0;
  updateTitleBadge();
});
```

## Paso 4: Toggle de sonidos en SettingsPanel

En `public/src/features/dashboard/SettingsPanel.js`, añadir una tarjeta para controlar sonidos:

Buscar la sección de "Apariencia" y añadir una nueva sección "Notificaciones":

```js
// Sección Notificaciones
e("div", { className: "space-y-4" }, [
  e("h4", { className: "text-xs font-black text-gray-400 uppercase tracking-widest px-2" }, "Notificaciones"),
  e(SettingCard, {
    icon: "fa-bell",
    title: "Sonidos de Alerta",
    description: audioEnabled ? "Sonidos activados" : "Sonidos desactivados",
    colorClass: audioEnabled ? "bg-emerald-100 text-emerald-600" : "bg-gray-100 text-gray-400",
    actionElement: e("button", {
      onClick: () => {
        const newState = !audioEnabled;
        setAudioEnabled(newState);
        sessionStorage.setItem("audio_enabled_session", String(newState));
      },
      className: `relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${audioEnabled ? 'bg-emerald-600' : 'bg-gray-200'}`
    }, e("span", {
      className: `inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${audioEnabled ? 'translate-x-7' : 'translate-x-1'}`
    }))
  })
])
```

Para pasar `audioEnabled` al SettingsPanel, en `index.html` asegurarse de que el estado se pase como prop.

## Paso 5: Emitir evento pago_confirmado desde el backend

En `controllers/adminController.js`, en la función `confirmarPago`, después de confirmar exitosamente, añadir:
```js
// Notificar al panel
io.emit("pago_confirmado", pedidoActualizado);
```

Buscar si ya existe esta emisión. Si no, añadirla justo después de `pedidoActualizado.save()` o equivalente.

## Verificación

1. Abrir el panel en dos pestañas.
2. Desde WhatsApp, enviar un comprobante de pago.
3. Verificar que suena el sonido de caja registradora.
4. Ir al panel admin → verificar el pago.
5. Verificar que suena el sonido de éxito.
6. Cambiar a otra pestaña → el título debe mostrar `(1) Pachi-Kid Dashboard`.
7. Volver a la pestaña del panel → el badge desaparece.
8. Ir a Settings → desactivar sonidos → verificar que ya no suenan.

## Notas importantes
- Los sonidos requieren interacción previa del usuario (política de autoplay del navegador). El checklist de inicio ya fuerza un clic.
- `mixkit.co` ofrece sonidos gratuitos. Si prefieres sonidos locales, descárgalos a `public/assets/sounds/`.
- El badge en el título funciona incluso si el panel está en background.
- Las notificaciones push requieren HTTPS en producción (funcionan en localhost para desarrollo).
