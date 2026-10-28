/**
 * types/models.d.ts
 * Definiciones de tipos para los Modelos Core del Sistema (Mongoose Schemas).
 * Fase 2: Migración a TypeScript - Reply Bot Pachi
 */

// ==========================================
// Tipos Auxiliares y Enums
// ==========================================

export type EstadoPedido =
  | "pendiente_pago"
  | "pendiente_verificacion"
  | "verificado"
  | "en_ruta"
  | "confirmado"
  | "entregado"
  | "cancelado";

export type RolUsuario = "admin" | "repartidor" | "cajero";

export type ModoOperacion = "automatico" | "manual";

/**
 * Canales de mensajería soportados por el SaaS.
 * Campo discriminador retrocompatible: los documentos antiguos (sin `canal`)
 * se siguen tratando como su canal original (whatsapp/instagram).
 */
export type CanalMensajeria = "whatsapp" | "instagram" | "messenger";

export type OrigenIg = "anuncio" | "directo";

// ==========================================
// Sub-interfaces para Pedido
// ==========================================

export interface IClientePedido {
  nombre?: string;
  cedula?: string;
  telefono?: string;
}

export interface IItemPedido {
  producto: string;
  price: number;
  cantidad: number;
}

export interface IUbicacionPedido {
  latitud?: number;
  longitud?: number;
  direccion?: string;
}

export interface IPagoPedido {
  metodo?: string;
  montoUSD?: number;
  montoVES?: number;
  tasa?: number;
  comprobanteMediaId?: string;
  comprobanteUrl?: string;
  pagoCon?: number;
  vuelto?: number;
  pagoEfectivo?: number;
  pagoDigitalVES?: number;
}

export interface IEnvioPedido {
  metodoId?: string;
  nombre?: string;
  tipo?: TipoMetodoEnvio | string;
  costo?: number;
  aConvenir?: boolean;
  costoAcordado?: boolean;
  direccion?: string;
  horario?: string;
  cambioTrasCotizar?: boolean;
}

// ==========================================
// 1. IPedido (models/Pedido.js)
// ==========================================

export interface IPedido {
  _id?: string;
  whatsappId: string;
  cliente?: IClientePedido;
  items: IItemPedido[];
  ubicacion?: IUbicacionPedido;
  envio?: IEnvioPedido;
  notas?: string | null;
  origenWeb?: {
    codigo?: string;
  };
  pago?: IPagoPedido;
  ctwaClid?: string | null;
  idFormateado?: string;
  correlativo?: string;
  repartidor?: string | null;
  estado: EstadoPedido;
  timestamp?: Date;
  verifiedAt?: Date;
  deliveredAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 2. IUsuario (models/Usuario.js)
// ==========================================

export interface IUsuario {
  _id?: string;
  username: string;
  password?: string;
  nombre: string;
  role: RolUsuario;
  activo: boolean;
  ultimoLogin?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  comparePassword?(candidatePassword: string): Promise<boolean>;
}

// ==========================================
// 3. IEtiqueta (models/Etiqueta.js - WhatsApp)
// ==========================================

export interface IUltimaReactivacion {
  at?: Date | null;
  paso?: string | null;
  esSegundo?: boolean;
}

export interface IEtiqueta {
  _id?: string;
  telefono: string;
  /**
   * Canal de origen de la conversación. Retrocompatible: los documentos
   * antiguos sin este campo equivalen a "whatsapp".
   */
  canal?: CanalMensajeria;
  etiqueta?: string;
  paso: string;
  modo: ModoOperacion;
  carrito: Record<string, any>;
  meta?: string | null;
  ctwaClid?: string | null;
  mensajesEnEsperaCount?: number;
  /**
   * Mensajes entrantes sin leer (inbox unificado). Se incrementa en cada
   * mensaje del cliente y se limpia con POST /api/admin/inbox/leido.
   */
  unreadCount?: number;
  reintentosFallidos?: number;
  stuck?: boolean;
  bloqueado?: boolean;
  ultimaReactivacion?: IUltimaReactivacion;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 4. IEtiquetaIg (models/EtiquetaIg.js - Instagram)
// ==========================================

export interface IEtiquetaIg {
  _id?: string;
  usuarioIgId: string;
  /**
   * Canal de origen de la conversación. Retrocompatible: los documentos
   * antiguos sin este campo equivalen a "instagram".
   */
  canal?: CanalMensajeria;
  username?: string | null;
  nombre?: string | null;
  profilePic?: string | null;
  paso?: string;
  modo?: ModoOperacion;
  origen?: OrigenIg;
  bloqueado?: boolean;
  stuck?: boolean;
  unreadCount?: number;
  lastInteraction?: Date;
  metadata?: Record<string, any>;
  /** Memoria corta del bot social (M-3, services/cortesiaService.ts). */
  social?: Record<string, any>;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 5. IProducto (models/Producto.js)
// ==========================================

export interface IProductoImagen {
  url: string;
  publicId?: string;
}

export interface IProducto {
  _id?: string;
  id: string; // ej. 'prod-001'
  name: string;
  price: number;
  description?: string;
  emoji?: string;
  imagenes?: IProductoImagen[];
  categoria: string | any; // ObjectId ref 'Categoria'
  categorias?: (string | any)[]; // Array de ObjectId ref 'Categoria' para multicategoría
  activo?: boolean;
  stock?: number;
  trackStock?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// Tipos Auxiliares Adicionales (Fase 3)
// ==========================================

export type TipoMetodoPago =
  | "transferencia"
  | "pago_movil"
  | "zelle"
  | "binance"
  | "efectivo"
  | "otro";

export type DireccionMensajeIg = "cliente" | "bot" | "admin";

// ==========================================
// 6. ICategoria (models/Categoria.js)
// ==========================================

export interface ICategoria {
  _id?: string;
  nombre: string;
  slug: string;
  padre?: string | null | any; // ObjectId ref Categoria
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 7. IMetodoPago (models/MetodoPago.js)
// ==========================================

export interface IMetodoPago {
  _id?: string;
  tipo: TipoMetodoPago;
  nombre: string;
  detalles?: Record<string, any>;
  notaAdicional?: string;
  activo?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 7b. IMetodoEnvio (models/MetodoEnvio.ts)
// ==========================================

export type TipoMetodoEnvio =
  | "delivery_local"
  | "envio_nacional"
  | "retiro"
  | "otro";

export type CostoTipoEnvio = "fijo" | "a_convenir";

export interface IMetodoEnvio {
  _id?: string;
  nombre: string;
  tipo: TipoMetodoEnvio;
  descripcion?: string;
  costoTipo: CostoTipoEnvio;
  costo?: number;
  pideDatos?: string;
  direccion?: string;
  horario?: string;
  activo?: boolean;
  orden?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 8. IMensaje (models/Mensaje.js - WhatsApp)
// ==========================================

export interface IMensaje {
  _id?: string;
  telefono?: string;
  /**
   * Canal por el que circuló el mensaje. Retrocompatible: los documentos
   * antiguos sin este campo equivalen a "whatsapp".
   */
  canal?: CanalMensajeria;
  texto?: string;
  direccion?: string;
  timestamp?: Date;
  tipo?: string;
  mediaId?: string;
  mediaUrl?: string | null;
  fileName?: string | null;
  caption?: string | null;
  mimeType?: string | null;
  wamid?: string;
  replyToMid?: string | null;
  replyToText?: string | null;
  status?: string; 
  error?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 9. IMensajeIg (models/MensajeIg.js - Instagram)
// ==========================================

export interface IMensajeIg {
  _id?: string;
  usuarioIgId: string;
  /**
   * Canal por el que circuló el mensaje ("instagram" | "messenger").
   * Retrocompatible: los documentos antiguos sin este campo equivalen a "instagram".
   */
  canal?: CanalMensajeria;
  direccion: DireccionMensajeIg | string;
  texto?: string;
  tipo?: string;
  mid?: string | null;
  replyToMid?: string | null;
  replyToText?: string | null;
  status?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  timestamp?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// Tipos Auxiliares (Fase 3 - Lote Final)
// ==========================================

export type AIGenerationStatus = "pending" | "completed" | "failed";

export type TipoRecursoAuditoria =
  | "pedido"
  | "producto"
  | "categoria"
  | "usuario"
  | "config"
  | "metodo_pago";

export type FAQType = "estatica" | "dinamica";

export interface IPushKeys {
  p256dh: string;
  auth: string;
}

// ==========================================
// 10. IAIDestination (models/AIDestination.js)
// ==========================================

export interface IAIDestination {
  _id?: string;
  name: string;
  phone: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 11. IAIGeneration (models/AIGeneration.js)
// ==========================================

export interface IAIGeneration {
  _id?: string;
  imagePrompt: string;
  imageUrl?: string | null;
  copyText?: string;
  status: AIGenerationStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 12. IAuditoria (models/Auditoria.js)
// ==========================================

export interface IAuditoria {
  _id?: string;
  usuarioId?: string | any;
  usuarioNombre?: string;
  pedidoId?: string | any;
  correlativoPedido?: string;
  recursoId?: string;
  tipoRecurso?: TipoRecursoAuditoria;
  accion: string;
  estadoAnterior?: string;
  estadoNuevo?: string;
  detalles?: string;
  timestamp?: Date;
}

// ==========================================
// 13. ICounter (models/Counter.js)
// ==========================================

export interface ICounter {
  _id: string;
  seq?: number;
  available_seqs?: number[];
}

// ==========================================
// 14. IFAQ (models/FAQ.js)
// ==========================================

export interface IFAQ {
  _id?: string;
  pregunta: string;
  keywords?: string[];
  respuesta?: string;
  type?: FAQType;
  dynamicKey?: string | null;
  activo?: boolean;
  order?: number;
  brand?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 15. IQuickReply (models/QuickReply.js)
// ==========================================

export interface IQuickReply {
  _id?: string;
  text: string;
  category?: string;
  order?: number;
  active?: boolean;
  isFavorite?: boolean;
  usageCount?: number;
  brand?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 16. ISetting (models/Setting.js)
// ==========================================

export interface ISetting {
  _id?: string;
  key: string;
  value: any;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 17. ISuscripcionPush (models/SuscripcionPush.js)
// ==========================================

export interface ISuscripcionPush {
  _id?: string;
  usuarioId?: string | any;
  role?: RolUsuario;
  endpoint: string;
  keys: IPushKeys;
  userAgent?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 18. ICarritoWeb (models/CarritoWeb.ts) - F2
// ==========================================

export interface ICarritoWebItem {
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface ICarritoWeb {
  _id?: string;
  codigo: string;
  items: ICarritoWebItem[];
  total: number;
  estado: "pendiente" | "vinculado";
  telefono?: string | null;
  pedidoId?: string | null | any;
  creadoEn?: Date;
  expiraEn: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 19. IContadorCatalogo (models/ContadorCatalogo.ts) - F2-4
// ==========================================

export type TipoEventoCatalogo = "creado" | "limite" | "honeypot" | "validacion" | "producto";

export interface IContadorCatalogo {
  _id?: string;
  fecha: string; // YYYY-MM-DD
  tipo: TipoEventoCatalogo;
  cantidad: number;
  createdAt?: Date;
  updatedAt?: Date;
}

