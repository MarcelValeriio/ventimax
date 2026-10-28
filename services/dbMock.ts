// @ts-nocheck
const mongoose = require("mongoose");

/**
 * Mock de Base de Datos en memoria para Pruebas de Integración
 * Sustituye los modelos de Mongoose por una implementación simple en memoria.
 */
class DbMock {
  data: Record<string, any>;

  constructor() {
    this.data = {
      etiquetas: {},
      mensajes: [],
      productos: [],
      categorias: []
    };
  }

  async connect() {
    console.log("🟡 [DbMock] Usando base de datos en memoria para el test.");
    return Promise.resolve();
  }

  getEtiquetaModel() {
    return {
      findOne: (query) => {
        const exec = () => Promise.resolve(this.data.etiquetas[query.telefono] || null);
        return {
          lean: () => exec(),
          then: (onFulfilled, onRejected) => exec().then(onFulfilled, onRejected),
          catch: (onRejected) => exec().catch(onRejected)
        };
      },
      findOneAndUpdate: async (query, update, options) => {
        let doc = this.data.etiquetas[query.telefono];
        if (!doc) {
          doc = { telefono: query.telefono, paso: "inicio", carrito: { items: [] }, etiqueta: "nuevo" };
          this.data.etiquetas[query.telefono] = doc;
        }
        
        // Aplicar actualizaciones simples
        if (update.paso) doc.paso = update.paso;
        if (update.etiqueta) doc.etiqueta = update.etiqueta;
        if (update.carrito) doc.carrito = { ...doc.carrito, ...update.carrito };
        
        return doc;
      },
      create: async (data) => {
        this.data.etiquetas[data.telefono] = { ...data };
        return this.data.etiquetas[data.telefono];
      },
      deleteOne: async (query) => {
        delete this.data.etiquetas[query.telefono];
        return { deletedCount: 1 };
      }
    };
  }

  getMensajeModel() {
    return {
      create: async (data) => {
        this.data.mensajes.push(data);
        return data;
      },
      find: () => ({
        sort: () => ({
          skip: () => ({
            limit: async () => this.data.mensajes
          })
        })
      }),
      countDocuments: async () => this.data.mensajes.length,
      aggregate: async () => []
    };
  }

  getProductoModel() {
    const matchProductQuery = (p, query) => {
      if (!query || Object.keys(query).length === 0) return true;

      for (const [key, val] of Object.entries(query)) {
        if (key === "$and" && Array.isArray(val)) {
          if (!val.every((sub) => matchProductQuery(p, sub))) return false;
          continue;
        }
        if (key === "$or" && Array.isArray(val)) {
          if (!val.some((sub) => matchProductQuery(p, sub))) return false;
          continue;
        }
        if (key === "activo") {
          if (val !== undefined && p.activo !== val) return false;
          continue;
        }
        if (key === "categoria") {
          const target = String(val?._id || val);
          const mainCat = String(p.categoria?._id || p.categoria || "");
          if (mainCat !== target) return false;
          continue;
        }
        if (key === "categorias") {
          const target = String(val?._id || val);
          const inCategorias =
            Array.isArray(p.categorias) &&
            p.categorias.some((c) => String(c?._id || c) === target);
          if (!inCategorias) return false;
          continue;
        }
        if (key === "trackStock") {
          if (val && typeof val === "object" && val.$ne !== undefined) {
            if (p.trackStock === val.$ne) return false;
          } else if (p.trackStock !== val) {
            return false;
          }
          continue;
        }
        if (key === "stock") {
          if (val && typeof val === "object" && val.$gt !== undefined) {
            if (!((Number(p.stock) || 0) > val.$gt)) return false;
          } else if (val && typeof val === "object" && val.$gte !== undefined) {
            if (!((Number(p.stock) || 0) >= val.$gte)) return false;
          } else if (p.stock !== val) {
            return false;
          }
          continue;
        }
        if (key === "id") {
          if (val !== undefined && p.id !== val) return false;
          continue;
        }
        if (key === "_id") {
          if (val !== undefined && String(p._id) !== String(val)) return false;
          continue;
        }
        if (key === "name") {
          if (val instanceof RegExp) {
            if (!val.test(p.name)) return false;
          } else if (val !== undefined && p.name !== val) {
            return false;
          }
          continue;
        }
        if (val !== undefined && p[key] !== val) return false;
      }
      return true;
    };

    return {
      find: (query = {}) => {
        let products = this.data.productos.filter((p) => matchProductQuery(p, query));
        const chain = {
          populate: () => chain,
          select: () => chain,
          sort: (sortCriteria) => {
            if (typeof sortCriteria === "object") {
              const key = Object.keys(sortCriteria)[0];
              const dir = sortCriteria[key];
              products = [...products].sort((a, b) => (a[key] > b[key] ? dir : -dir));
            }
            return chain;
          },
          limit: (n) => {
            products = products.slice(0, n);
            return Promise.resolve(products);
          },
          lean: () => Promise.resolve(products),
          then: (resolve, reject) => Promise.resolve(products).then(resolve, reject),
          catch: (reject) => Promise.resolve(products).catch(reject),
        };
        return chain;
      },
      findOne: async (query = {}) => {
        const p = this.data.productos.find((prod) => matchProductQuery(prod, query)) || null;
        if (!p) return null;
        const doc = JSON.parse(JSON.stringify(p));
        doc.save = async () => {
          const idx = this.data.productos.findIndex((item) => String(item._id) === String(doc._id) || String(item.id) === String(doc.id));
          if (idx !== -1) {
            this.data.productos[idx] = { ...doc };
            delete this.data.productos[idx].save;
          }
          return doc;
        };
        return doc;
      },
      findById: async (id) => {
        const p = this.data.productos.find((prod) => String(prod._id) === String(id) || String(prod.id) === String(id)) || null;
        if (!p) return null;
        const doc = JSON.parse(JSON.stringify(p));
        doc.save = async () => {
          const idx = this.data.productos.findIndex((item) => String(item._id) === String(doc._id) || String(item.id) === String(doc.id));
          if (idx !== -1) {
            this.data.productos[idx] = { ...doc };
            delete this.data.productos[idx].save;
          }
          return doc;
        };
        return doc;
      },
      exists: async (query = {}) => {
        const p = this.data.productos.find((prod) => matchProductQuery(prod, query));
        return p ? { _id: p._id || p.id } : null;
      },
      create: async (product) => {
        if (!product.imagenes) product.imagenes = [];
        this.data.productos.push(product);
        return product;
      },
      insertMany: async (prods) => {
        const toInsert = Array.isArray(prods) ? prods : [prods];
        for (const p of toInsert) {
          if (!p.imagenes) p.imagenes = [];
          this.data.productos.push(p);
        }
        return toInsert;
      },
      deleteMany: async (query = {}) => {
        if (!query || Object.keys(query).length === 0) {
          const count = this.data.productos.length;
          this.data.productos = [];
          return { deletedCount: count };
        }
        const initial = this.data.productos.length;
        this.data.productos = this.data.productos.filter((p) => !matchProductQuery(p, query));
        return { deletedCount: initial - this.data.productos.length };
      },
      countDocuments: async (query = {}) => {
        return this.data.productos.filter((p) => matchProductQuery(p, query)).length;
      },
      findOneAndUpdate: async (query, update) => {
        let p = this.data.productos.find((prod) => matchProductQuery(prod, query));
        if (p) {
          if (update.$inc) {
            for (let k in update.$inc) p[k] = (p[k] || 0) + update.$inc[k];
          }
          if (update.$set) Object.assign(p, update.$set);
          for (let k in update) {
            if (!k.startsWith("$")) p[k] = update[k];
          }
          return p;
        }
        return null;
      }
    };
  }

  getCategoriaModel() {
    return {
      find: (query = {}) => {
        let cats = this.data.categorias;
        if (query.padre !== undefined) cats = cats.filter(c => c.padre === query.padre);
        const chain = {
          sort: () => chain,
          lean: () => Promise.resolve(cats),
          then: (resolve) => resolve(cats)
        };
        return chain;
      },
      findOne: async (query = {}) => {
        if (query.slug) return this.data.categorias.find(c => c.slug === query.slug) || null;
        if (query._id) return this.data.categorias.find(c => String(c._id) === String(query._id)) || null;
        return this.data.categorias[0] || null;
      },
      findById: async (id) => {
        return this.data.categorias.find(c => String(c._id) === String(id)) || null;
      },
      create: async (data) => {
        const cat = { _id: `cat-${Date.now()}-${Math.random()}`, ...data };
        this.data.categorias.push(cat);
        return cat;
      }
    };
  }

  getCarritoWebModel() {
    if (!this.data.carritosWeb) this.data.carritosWeb = [];
    const matchQuery = (c, query) => {
      if (!query || Object.keys(query).length === 0) return true;
      for (const [key, val] of Object.entries(query)) {
        if (key === "_id" && String(c._id) !== String(val)) return false;
        if (key === "codigo" && c.codigo !== val) return false;
        if (key === "estado" && c.estado !== val) return false;
        if (key === "telefono" && c.telefono !== val) return false;
        if (key === "pedidoId" && String(c.pedidoId) !== String(val)) return false;
        if (key === "expiraEn") {
          const expTime = new Date(c.expiraEn).getTime();
          if (val && typeof val === "object" && "$gt" in val) {
            const gtTime = new Date(val.$gt).getTime();
            if (isNaN(expTime) || expTime <= gtTime) return false;
          } else {
            const valTime = new Date(val).getTime();
            if (expTime !== valTime) return false;
          }
        }
      }
      return true;
    };

    return {
      schema: {
        indexes: () => [[{ expiraEn: 1 }, { expireAfterSeconds: 0 }]]
      },
      find: (query = {}) => {
        const carritos = this.data.carritosWeb.filter((c) => matchQuery(c, query));
        return {
          lean: () => Promise.resolve(carritos),
          then: (resolve) => resolve(carritos),
          catch: () => {},
        };
      },
      findOne: async (query = {}) => {
        const found = this.data.carritosWeb.find((c) => matchQuery(c, query));
        return found || null;
      },
      findOneAndUpdate: async (filter = {}, update = {}, options = {}) => {
        const index = this.data.carritosWeb.findIndex((c) => matchQuery(c, filter));
        if (index === -1) return null;
        const cw = this.data.carritosWeb[index];
        const updateData = update.$set ? update.$set : update;
        Object.assign(cw, updateData, { updatedAt: new Date() });
        return {
          ...cw,
          toObject: function() { return { ...this }; }
        };
      },
      findById: async (id) => {
        return this.data.carritosWeb.find((c) => String(c._id) === String(id)) || null;
      },
      create: async (doc) => {
        const newDoc = {
          _id: doc._id || `cw-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          estado: doc.estado || "pendiente",
          telefono: doc.telefono || null,
          pedidoId: doc.pedidoId || null,
          creadoEn: doc.creadoEn || new Date(),
          ...doc,
          createdAt: new Date(),
          updatedAt: new Date(),
          toObject: function() { return { ...this }; }
        };
        this.data.carritosWeb.push(newDoc);
        return newDoc;
      },
      countDocuments: async (query = {}) => {
        return this.data.carritosWeb.filter((c) => matchQuery(c, query)).length;
      },
      deleteMany: async (query = {}) => {
        if (!query || Object.keys(query).length === 0) {
          this.data.carritosWeb = [];
        } else {
          this.data.carritosWeb = this.data.carritosWeb.filter((c) => !matchQuery(c, query));
        }
        return { acknowledged: true };
      }
    };
  }

  getContadorCatalogoModel() {
    if (!this.data.contadoresCatalogo) this.data.contadoresCatalogo = [];
    const matchQuery = (c, query) => {
      if (!query || Object.keys(query).length === 0) return true;
      for (const [key, val] of Object.entries(query)) {
        if (key === "_id" && String(c._id) !== String(val)) return false;
        if (key === "tipo") {
          if (val && typeof val === "object" && "$in" in val) {
            if (!((val.$in || []).includes(c.tipo))) return false;
          } else if (c.tipo !== val) {
            return false;
          }
        }
        if (key === "fecha") {
          if (val && typeof val === "object") {
            if (val.$gte !== undefined && c.fecha < val.$gte) return false;
            if (val.$lte !== undefined && c.fecha > val.$lte) return false;
            if (val.$gt !== undefined && c.fecha <= val.$gt) return false;
            if (val.$lt !== undefined && c.fecha >= val.$lt) return false;
            if (val.$in !== undefined && !val.$in.includes(c.fecha)) return false;
          } else if (c.fecha !== val) {
            return false;
          }
        }
      }
      return true;
    };

    return {
      find: (query = {}) => {
        let items = this.data.contadoresCatalogo.filter((c) => matchQuery(c, query));
        let sortFn = null;
        const result = {
          sort: (sortObj) => {
            if (sortObj && typeof sortObj === "object") {
              const [field, direction] = Object.entries(sortObj)[0] || [];
              if (field) {
                const dir = direction === -1 || direction === "desc" ? -1 : 1;
                sortFn = (a, b) => (a[field] > b[field] ? dir : a[field] < b[field] ? -dir : 0);
                items.sort(sortFn);
              }
            }
            return {
              lean: () => Promise.resolve(items),
              then: (resolve) => resolve(items),
              catch: () => {},
            };
          },
          lean: () => Promise.resolve(items),
          then: (resolve) => resolve(items),
          catch: () => {},
        };
        return result;
      },
      findOne: async (query = {}) => {
        const found = this.data.contadoresCatalogo.find((c) => matchQuery(c, query));
        return found || null;
      },
      findOneAndUpdate: async (filter = {}, update = {}, options = {}) => {
        let item = this.data.contadoresCatalogo.find((c) => matchQuery(c, filter));
        if (!item) {
          if (options && options.upsert) {
            item = {
              _id: `cc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              fecha: filter.fecha,
              tipo: filter.tipo,
              cantidad: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            this.data.contadoresCatalogo.push(item);
          } else {
            return null;
          }
        }

        if (update.$inc) {
          for (const [key, incVal] of Object.entries(update.$inc)) {
            item[key] = (item[key] || 0) + incVal;
          }
        }
        if (update.$set) {
          for (const [key, setVal] of Object.entries(update.$set)) {
            item[key] = setVal;
          }
        }
        item.updatedAt = new Date();
        return {
          ...item,
          toObject: function () {
            return { ...this };
          },
        };
      },
      deleteMany: async (query = {}) => {
        if (!query || Object.keys(query).length === 0) {
          this.data.contadoresCatalogo = [];
        } else {
          this.data.contadoresCatalogo = this.data.contadoresCatalogo.filter((c) => !matchQuery(c, query));
        }
        return { acknowledged: true, deletedCount: 1 };
      },
    };
  }
}

module.exports = new DbMock();
// @ts-nocheck
