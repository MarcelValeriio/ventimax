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

export interface ISucursalEnvioDetalle {
  empresa: string;
  codigo: string;
  nombre: string;
  estado: string;
  ciudad: string;
  direccion: string;
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
  empresa?: string;
  cobroADestino?: boolean;
  sucursal?: ISucursalEnvioDetalle | null;
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
  stockDescontado?: { producto: string; cantidad: number }[];
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

export interface IVehiculoCliente {
  marca?: string;
  modelo?: string;
  anio?: number | null;
  motor?: string;
  version?: string;
  marcaNorm?: string;
  modeloNorm?: string;
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
  vehiculo?: IVehiculoCliente | null;
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
  vehiculo?: IVehiculoCliente | null;
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

export interface IProductoAtributo {
  nombre: string; // máx. 40
  valor: string; // máx. 120
}

export interface IProductoCompatibilidad {
  marca: string; // máx. 60
  modelo: string; // máx. 60
  marcaNorm?: string; // lo calcula el servidor (services/productoAmpliado.ts)
  modeloNorm?: string;
  anioDesde?: number; // 1950 a 2100
  anioHasta?: number; // 1950 a 2100
  motor?: string; // máx. 20; vacío = cualquier motor
  version?: string; // máx. 40; vacío = cualquier versión
  nota?: string; // máx. 120
}

export interface IProducto {
  _id?: string;
  id: string; // ej. 'prod-001'
  name: string;
  price: number; // precio base
  descuentoPct?: number; // 0 a 90 (F2g)
  description?: string;
  emoji?: string;
  imagenes?: IProductoImagen[];
  categoria: string | any; // ObjectId ref 'Categoria'
  categorias?: (string | any)[]; // Array de ObjectId ref 'Categoria' para multicategoría
  activo?: boolean;
  stock?: number;
  trackStock?: boolean;
  // Campos ampliados (F1-1), todos opcionales
  sku?: string; // máx. 40, mayúsculas; único disperso
  marcaFabricante?: string; // máx. 60
  codigosOEM?: string[]; // máx. 30 códigos, normalizados (mayúsculas, sin espacios ni guiones)
  atributos?: IProductoAtributo[]; // máx. 20
  grupoEquivalencia?: string; // máx. 60
  compatibilidad?: IProductoCompatibilidad[]; // máx. 200
  // Peso y medidas de la caja (F1-7), opcionales; null = sin dato
  pesoKg?: number | null; // kg, 0 a 1000, máx. 3 decimales
  altoCm?: number | null; // cm, mayor a 0 y hasta 500, máx. 1 decimal
  anchoCm?: number | null;
  profundidadCm?: number | null;
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

/** Empresa de envío de un método nacional (F2f, F2n). */
export interface EmpresaEnvio {
  nombre: string;
  logoUrl?: string;
  logoPublicId?: string;
  slug?: string;
  cotizador?: "mrw" | "zoom" | "ninguno";
}

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
  empresas?: (EmpresaEnvio | string)[];
  cobroADestino?: boolean;
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
  | "metodo_pago"
  | "metodo_envio"
  | "slider_tienda"
  | "aliado";

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
  /** Se muestra en la tienda web (F2h). Nunca aplica a las dinámicas. */
  mostrarEnTienda?: boolean;
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

export interface IEntregaCarritoWeb {
  metodoId: string | any;
  nombre: string;
  tipo: string;
  costo: number;
  aConvenir: boolean;
  empresa?: string;
  cobroADestino?: boolean;
  latitud: number | null;
  longitud: number | null;
  direccion: string;
  sucursal?: ISucursalEnvioDetalle | null;
}

export interface ICarritoWeb {
  _id?: string;
  codigo: string;
  items: ICarritoWebItem[];
  total: number;
  entrega?: IEntregaCarritoWeb | null;
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

// ==========================================
// 20. IAliado (models/Aliado.ts) - F2j
// ==========================================

export interface IAliado {
  _id?: string;
  nombre: string;
  descripcion: string;
  logoUrl?: string;
  logoPublicId?: string;
  orden?: number;
  activo?: boolean;
  brand?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

// ==========================================
// 21. ISucursal (models/Sucursal.ts) - F2n
// ==========================================

export type SlugEmpresaEnvio = "zoom" | "mrw" | "tealca";

export interface ISucursal {
  _id?: string;
  empresa: SlugEmpresaEnvio | string;
  codigo: string;
  nombre: string;
  estado: string;
  ciudad: string;
  direccion: string;
  telefono?: string;
  horario?: string;
  lat?: number | null;
  lng?: number | null;
  activa?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}



