# 🚀 Registro de Versiones (Release Notes) - Yuri Bot (Mr. Pachi)

Este documento registra de manera oficial todas las capacidades, arquitecturas y características entregadas en las versiones estables del sistema. Funciona como la carta de entrega de producto y anexo técnico de licenciamiento.

---

## [v1.0.0] - Lanzamiento Oficial (Etapa 1)
**Fecha de liberación:** 06 de Septiembre de 2026
**Estado:** Stable / Production Ready

Yuri Bot v1.0.0 representa la consolidación de un sistema integral de e-commerce conversacional omnicanal, diseñado para automatizar y escalar las ventas a través de redes sociales, dotando a la empresa de herramientas de gestión de pedidos en tiempo real y asistencia impulsada por Inteligencia Artificial.

### 🌟 1. Capacidades Core (Ventas Omnicanales)
- **Motor Omnicanal (WhatsApp Cloud API e Instagram Direct):** Integración directa y oficial con la API de Meta (v20.0), garantizando estabilidad, envíos de alta velocidad y cumplimiento absoluto de las políticas de comercio conversacional de la plataforma.
- **Flujo de Ventas Autónomo (State Machine):** Implementación de una "Máquina de Estados" conversacional que atiende al cliente 24/7 sin intervención humana. El flujo acompaña al cliente a través de: visualización de catálogo interactivo, selección de cantidades (unidad/caja), recolección de datos sanitizados (nombre y cédula), solicitud de ubicación exacta y confirmación del método de pago.
- **Manejo Inteligente de Pagos Multimoneda:** Integración con scraping en tiempo real de la tasa oficial del Banco Central de Venezuela (BCV). El sistema calcula dinámicamente los totales en moneda extranjera y local, almacenando la tasa en caché para máxima velocidad y eficiencia.
- **Sinergia Publicitaria (Meta Ads):** Intercepción e identificación automática de clientes que ingresan a través de anuncios pagados. El sistema respeta los tiempos de respuesta nativos de Meta y toma el control si el cliente no recibe atención humana.

### 🤖 2. Inteligencia Artificial y Asistencia
- **Copiloto de Ventas (DeepSeek AI):** Integración con modelos de lenguaje de última generación. El Copiloto es capaz de leer el catálogo en tiempo real, entender contextos de chat complejos, extraer datos de comprobantes enviados en texto libre y pre-llenar comandas manuales, ahorrando hasta un 80% del tiempo de transcripción del administrador.
- **Clasificador de Intenciones Oculto:** Capacidad del bot para detectar automáticamente cuando un cliente pregunta únicamente por la tasa de cambio del día, entregando la información sin forzarlo a entrar al embudo de ventas.

### 📊 3. Panel de Administración y Operativa (Dashboard Kanban)
- **Gestión Visual de Pedidos (React + Tailwind):** Interfaz gráfica de última tecnología donde los pedidos caen en tiempo real sin necesidad de recargar la página (vía WebSockets). Se clasifican en estados lógicos: *Pendiente de Pago, Verificado, En Ruta y Entregado*.
- **Generador Automático de Comandas PDF:** Creación instantánea de tickets de cocina y despacho en formato Carta, listos para imprimir, con desglose de productos, datos del cliente y código de orden.
- **Traducción Inversa de GPS:** Las ubicaciones enviadas por los clientes vía WhatsApp (Longitud/Latitud) se transforman automáticamente en tarjetas interactivas de Google Maps dentro del panel para facilitar la logística del repartidor.
- **Módulo de Auditoría y Control de Roles:** Registro inalterable de qué operador (Administrador, Cajero, Repartidor) verificó o entregó un pedido, fortaleciendo el control interno del negocio.

### 🛡️ 4. Arquitectura de Alta Disponibilidad, Resiliencia y Seguridad
- **Watchdog Service (Monitoreo Proactivo):** Un servicio de vigilancia permanente que escanea la base de datos en segundo plano cada minuto. Si detecta una orden "atascada" (un cliente que olvidó subir su pago tras 15 minutos) o un lead publicitario sin respuesta, alerta de inmediato a los administradores vía WhatsApp y reprioriza el ticket en la interfaz.
- **Circuit Breaker (Escudo Anti-Caídas):** Implementación de un patrón de arquitectura avanzada que detecta si los servidores de Meta están fallando. Si la red se degrada, el sistema corta las peticiones para evitar bloqueos globales, encolando las respuestas y protegiendo el backend.
- **Blindaje Criptográfico (HMAC SHA-256):** Validación matemática de todas las comunicaciones entrantes para asegurar que provienen exclusivamente de los servidores oficiales de Meta, haciendo imposible el *spoofing* o ataques de falsificación de mensajes.
- **Rate Limiting y Prevención de Fuerza Bruta:** Restricciones estrictas en los intentos de inicio de sesión y protección total de los endpoints públicos del sistema.

### 💼 5. Experiencia de Usuario Extendida
- **Aplicación Progresiva (PWA):** El panel de control es instalable nativamente tanto en computadoras de escritorio (Windows/Mac) como en teléfonos móviles (iOS/Android) comportándose como una app nativa.
- **Sistema de Notificaciones Push:** Alertas visuales y sonoras en segundo plano en los dispositivos de los operadores cada vez que entra un nuevo pedido, garantizando tiempos de despacho inmediatos.
- **Modo Manual "No Molestar":** Un switch de seguridad que permite a los operadores silenciar al bot instantáneamente para tomar control de un cliente problemático o complejo, pausando la automatización solo para esa conversación.
