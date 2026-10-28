// @ts-nocheck
const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "../temp_db.json");

/**
 * Persistencia simple en archivo JSON para Pruebas de Integración.
 * Permite compartir estado entre el Bot y el Panel en un entorno de test.
 */
class DbLocal {
  constructor() {
    if (!fs.existsSync(DB_FILE)) {
      this.write({ usuarios: [], pedidos: [], productos: [], etiquetas: {}, counters: [], metodosPago: [], metodosEnvio: [] });
    }
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
      if (!parsed.metodosEnvio) parsed.metodosEnvio = [];
      if (!parsed.etiquetas || Array.isArray(parsed.etiquetas)) parsed.etiquetas = {};
      if (!parsed.etiquetasIg || Array.isArray(parsed.etiquetasIg)) parsed.etiquetasIg = {};
      return parsed;
    } catch (e) {
      return { usuarios: [], pedidos: [], productos: [], etiquetas: {}, counters: [], metodosPago: [], metodosEnvio: [] };
    }
  }

  write(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
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
        const data = this.read();
        let products = data.productos || [];
        products = products.filter((p) => matchProductQuery(p, query));
        
        const chain = {
          populate: () => chain,
          // LOTE B7a: el copiloto (`extractOrderFromChat`) hace
          // `Producto.find({activo:true}).select('name')`; sin `select` en el
          // mock, esa llamada lanzaba TypeError y la extracción IA devolvía 500
          // en NODE_ENV=test. La proyección de campos no hace falta en el mock:
          // se devuelve el documento completo, como Mongoose con `select('name')`
          // devolvería solo `name` (el consumidor solo lee `.name`).
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
        const data = this.read();
        let products = data.productos || [];
        const p = products.find((prod) => matchProductQuery(prod, query)) || null;
        if (!p) return null;
        const doc = JSON.parse(JSON.stringify(p));
        doc.save = async () => {
          const currentData = this.read();
          const idx = (currentData.productos || []).findIndex((item) => String(item._id) === String(doc._id) || String(item.id) === String(doc.id));
          if (idx !== -1) {
            currentData.productos[idx] = { ...doc };
            delete currentData.productos[idx].save;
            this.write(currentData);
          }
          return doc;
        };
        return doc;
      },
      findById: async (id) => {
        const data = this.read();
        let products = data.productos || [];
        const p = products.find((prod) => String(prod._id) === String(id) || String(prod.id) === String(id)) || null;
        if (!p) return null;
        const doc = JSON.parse(JSON.stringify(p));
        doc.save = async () => {
          const currentData = this.read();
          const idx = (currentData.productos || []).findIndex((item) => String(item._id) === String(doc._id) || String(item.id) === String(doc.id));
          if (idx !== -1) {
            currentData.productos[idx] = { ...doc };
            delete currentData.productos[idx].save;
            this.write(currentData);
          }
          return doc;
        };
        return doc;
      },
      exists: async (query = {}) => {
        const data = this.read();
        let products = data.productos || [];
        const p = products.find((prod) => matchProductQuery(prod, query));
        return p ? { _id: p._id || p.id } : null;
      },
      create: async (product) => {
        const data = this.read();
        data.productos = data.productos || [];
        if (!product.imagenes) product.imagenes = [];
        data.productos.push(product);
        this.write(data);
        return product;
      },
      insertMany: async (prods) => {
        const data = this.read();
        data.productos = data.productos || [];
        const toInsert = Array.isArray(prods) ? prods : [prods];
        for (const p of toInsert) {
          if (!p.imagenes) p.imagenes = [];
          data.productos.push(p);
        }
        this.write(data);
        return toInsert;
      },
      deleteMany: async (query = {}) => {
        const data = this.read();
        if (!query || Object.keys(query).length === 0) {
          const count = (data.productos || []).length;
          data.productos = [];
          this.write(data);
          return { deletedCount: count };
        }
        const initial = (data.productos || []).length;
        data.productos = (data.productos || []).filter((p) => !matchProductQuery(p, query));
        this.write(data);
        return { deletedCount: initial - data.productos.length };
      },
      countDocuments: async (query = {}) => {
        const data = this.read();
        return (data.productos || []).filter((p) => matchProductQuery(p, query)).length;
      },
      findOneAndUpdate: async (query, update, options) => {
        const data = this.read();
        let products = data.productos || [];
        let p = products.find((prod) => matchProductQuery(prod, query));
        if (p) {
          if (update.$inc) {
            for (let k in update.$inc) {
              p[k] = (p[k] || 0) + update.$inc[k];
            }
          }
          if (update.$set) {
            Object.assign(p, update.$set);
          }
          for (let k in update) {
            if (!k.startsWith("$")) {
              p[k] = update[k];
            }
          }
          this.write(data);
          return p;
        }
        return null;
      }
    };
  }

  getPedidoModel() {
    const self = this;
    const createQuery = (query) => {
      const exec = () => {
        const data = self.read();
        if (!data.pedidos) return Promise.resolve(null);
        
        let filtered = data.pedidos.filter(p => {
          if (query.whatsappId && p.whatsappId !== query.whatsappId) return false;
          if (query.estado) {
            if (typeof query.estado === "object") {
              if (query.estado.$nin && query.estado.$nin.includes(p.estado)) return false;
              if (query.estado.$in && !query.estado.$in.includes(p.estado)) return false;
            } else if (p.estado !== query.estado) {
              return false;
            }
          }
          if (query.$or) {
            return query.$or.some(cond => {
              const key = Object.keys(cond)[0];
              if (key === "pago.comprobanteMediaId") return p.pago?.comprobanteMediaId === cond[key];
              if (key === "comprobanteMediaId") return p.comprobanteMediaId === cond[key];
              return false;
            });
          }
          return true;
        });

        if (filtered.length === 0) return Promise.resolve(null);
        
        // Ordenar por timestamp desc por defecto
        filtered.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        
        const pedido = filtered[0];
        const doc = JSON.parse(JSON.stringify(pedido));

        doc.markModified = function() {};
        doc.save = async function() {
          const currentData = self.read();
          const idx = currentData.pedidos.findIndex(p => p._id === this._id);
          if (idx !== -1) {
            const saveDoc = { ...this };
            delete saveDoc.save;
            delete saveDoc.markModified;
            currentData.pedidos[idx] = saveDoc;
            self.write(currentData);
          }
          return this;
        };
        
        return Promise.resolve(doc);
      };

      return {
        sort: () => createQuery(query),
        then: (onFullfilled) => exec().then(onFullfilled),
        catch: (onRejected) => exec().catch(onRejected)
      };
    };

    return {
      findOne: (query) => createQuery(query),
      findOneAndUpdate: async (query, update, options) => {
        const data = this.read();
        if (!data.pedidos) data.pedidos = [];
        
        let index = data.pedidos.findIndex(p => {
          for (const key in query) {
            if (key === "whatsappId" && p.whatsappId !== query[key]) return false;
            if (key === "estado") {
              const val = query[key];
              if (typeof val === "object") {
                if (val.$nin && val.$nin.includes(p.estado)) return false;
                if (val.$in && !val.$in.includes(p.estado)) return false;
              } else if (p.estado !== val) {
                return false;
              }
            }
          }
          return true;
        });
        
        let doc;
        const updateData = update.$set || update;
        
        if (index === -1) {
          if (options && options.upsert) {
            doc = { 
              _id: `order-${Date.now()}`,
              timestamp: new Date(),
              ...query, 
              ...updateData, 
              items: updateData.items || [] 
            };
            data.pedidos.push(doc);
          } else {
            return null;
          }
        } else {
          doc = data.pedidos[index];
          for (const key in updateData) {
            if (key.includes(".")) {
              const parts = key.split(".");
              let target = doc;
              for (let i = 0; i < parts.length - 1; i++) {
                if (!target[parts[i]]) target[parts[i]] = {};
                target = target[parts[i]];
              }
              target[parts[parts.length - 1]] = updateData[key];
            } else {
              doc[key] = updateData[key];
            }
          }
          if (updateData.estado) doc.estado = updateData.estado;
          data.pedidos[index] = doc;
        }
        
        this.write(data);
        return doc;
      },
      findByIdAndUpdate: async (id, update, options) => {
        const data = this.read();
        const idx = data.pedidos.findIndex(p => p._id === String(id));
        if (idx === -1) return null;
        Object.assign(data.pedidos[idx], update.$set || update);
        this.write(data);
        return data.pedidos[idx];
      },
      findById: async (id) => {
        const data = self.read();
        data.pedidos = data.pedidos || [];
        const pedido = data.pedidos.find(p => String(p._id) === String(id));
        if (!pedido) return null;
        const doc: any = JSON.parse(JSON.stringify(pedido));
        doc.markModified = function() {};
        doc.save = async function() {
          const currentData = self.read();
          const idx = currentData.pedidos.findIndex(p => String(p._id) === String(this._id));
          if (idx !== -1) {
            const saveDoc = { ...this };
            delete saveDoc.save;
            delete saveDoc.markModified;
            currentData.pedidos[idx] = saveDoc;
            self.write(currentData);
          }
          return this;
        };
        return doc;
      },
      find: (query = {}, projection = null) => {
        const data = this.read();
        data.pedidos = data.pedidos || [];
        let list = data.pedidos.filter(p => {
          if (query.whatsappId) {
            if (typeof query.whatsappId === "object" && query.whatsappId.$in) {
              if (!query.whatsappId.$in.includes(p.whatsappId)) return false;
            } else if (p.whatsappId !== query.whatsappId) {
              return false;
            }
          }
          if (query.estado) {
            if (typeof query.estado === "object") {
              if (query.estado.$nin && query.estado.$nin.includes(p.estado)) return false;
              if (query.estado.$in && !query.estado.$in.includes(p.estado)) return false;
            } else if (p.estado !== query.estado) {
              return false;
            }
          }
          return true;
        });
        list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        return {
          sort: () => ({
            skip: (n) => ({
              limit: (l) => ({
                lean: () => Promise.resolve(list.slice(n, n + l)),
                then: (resolve) => resolve(list.slice(n, n + l)),
                catch: () => {},
              }),
              lean: () => Promise.resolve(list.slice(n)),
              then: (resolve) => resolve(list.slice(n)),
              catch: () => {},
            }),
            limit: (l) => ({
              lean: () => Promise.resolve(list.slice(0, l)),
              then: (resolve) => resolve(list.slice(0, l)),
              catch: () => {},
            }),
            lean: () => Promise.resolve(list),
            then: (resolve) => resolve(list),
            catch: () => {},
          }),
          lean: () => Promise.resolve(list),
          then: (resolve) => resolve(list),
          catch: () => {},
        };
      },
      aggregate: async (pipeline = []) => {
        const data = self.read();
        const pedidos = data.pedidos || [];
        let totalIngresos = 0;
        let totalVES = 0;
        let totalPedidos = 0;
        for (const p of pedidos) {
          if (["entregado", "confirmado", "verificado", "en_ruta"].includes(p.estado)) {
            totalPedidos++;
            totalIngresos += p.pago?.montoUSD || 0;
            totalVES += p.pago?.montoVES || 0;
          }
        }
        return [
          {
            totalIngresos,
            totalVES,
            totalPedidos,
            sumaTiempoEntrega: 0,
            totalEntregados: 0,
            totalAdsIngresos: 0,
            totalAdsVES: 0,
            totalAdsPedidos: 0,
          },
        ];
      },
      countDocuments: async (query = {}) => {
        const data = self.read();
        const pedidos = data.pedidos || [];
        if (!query || Object.keys(query).length === 0) return pedidos.length;
        return pedidos.filter((p) => {
          if (query["origenWeb.codigo"]) {
            if (!p.origenWeb || !p.origenWeb.codigo) return false;
          }
          if (query.estado) {
            if (typeof query.estado === "object") {
              if (query.estado.$nin && query.estado.$nin.includes(p.estado)) return false;
              if (query.estado.$in && !query.estado.$in.includes(p.estado)) return false;
            } else if (p.estado !== query.estado) {
              return false;
            }
          }
          return true;
        }).length;
      },
      distinct: async (field = "whatsappId", query = {}) => {
        const data = self.read();
        const pedidos = data.pedidos || [];
        const set = new Set();
        for (const p of pedidos) {
          if (p[field]) set.add(p[field]);
        }
        return Array.from(set);
      },
      create: async (pedido) => {
        const data = self.read();
        data.pedidos = data.pedidos || [];
        const doc: any = {
          _id: pedido._id || `order-${Date.now()}`,
          timestamp: new Date(),
          ...pedido
        };
        doc.markModified = function() {};
        doc.save = async function() {
          const currentData = self.read();
          const idx = currentData.pedidos.findIndex(p => String(p._id) === String(this._id));
          if (idx !== -1) {
            const saveDoc = { ...this };
            delete saveDoc.save;
            delete saveDoc.markModified;
            currentData.pedidos[idx] = saveDoc;
            self.write(currentData);
          }
          return this;
        };
        data.pedidos.push(doc);
        self.write(data);
        return doc;
      },
      deleteMany: async () => {
        const data = self.read();
        data.pedidos = [];
        self.write(data);
      },
      exists: async (query) => {
        const data = this.read();
        return data.pedidos.some(p => p.pago?.comprobanteMediaId === query.$or[0]["pago.comprobanteMediaId"]);
      }
    };
  }

  getMetodoPagoModel() {
    const self = this;
    const findQuery = (query) => {
      const exec = () => {
        const data = self.read();
        let methods = data.metodosPago || [];
        if (query && query.activo !== undefined) {
          methods = methods.filter(m => m.activo === query.activo);
        }
        return Promise.resolve(methods);
      };
      return {
        sort: () => ({
          then: (onFullfilled) => exec().then(onFullfilled),
          catch: (onRejected) => exec().catch(onRejected)
        }),
        then: (onFullfilled) => exec().then(onFullfilled),
        catch: (onRejected) => exec().catch(onRejected)
      };
    };
    return {
      find: (query) => findQuery(query),
      findOne: async (query) => {
        const data = this.read();
        let methods = data.metodosPago || [];
        let found = null;
        if (query.tipo) {
          found = methods.find(m => m.tipo === query.tipo);
        } else if (query._id) {
          found = methods.find(m => String(m._id) === String(query._id));
        }
        return found || null;
      },
      findById: (id) => {
        const data = this.read();
        let methods = data.metodosPago || [];
        const result = methods.find(m => String(m._id) === String(id)) || null;
        const thenable = {
          lean: () => Promise.resolve(result),
          then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
          catch: (onRejected) => Promise.resolve(result).catch(onRejected),
        };
        return thenable;
      }
    };
  }

  sembrarMetodosEnvioEjemplo() {
    const data = this.read();
    data.metodosEnvio = [
      {
        _id: "env-001",
        nombre: "Delivery Caracas",
        tipo: "delivery_local",
        descripcion: "El costo depende de la zona",
        costoTipo: "a_convenir",
        costo: 0,
        pideDatos: "dirección exacta de entrega en Caracas",
        activo: true,
        orden: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: "env-002",
        nombre: "Envío nacional",
        tipo: "envio_nacional",
        descripcion: "Envíos a todo el país",
        costoTipo: "a_convenir",
        costo: 0,
        pideDatos: "estado, ciudad y agencia de envío (MRW/Zoom/Tealca)",
        activo: true,
        orden: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        _id: "env-003",
        nombre: "Retiro en persona",
        tipo: "retiro",
        descripcion: "Retiro en nuestro punto de encuentro",
        costoTipo: "fijo",
        costo: 0,
        pideDatos: "",
        direccion: "Punto de retiro de prueba",
        horario: "",
        activo: true,
        orden: 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    this.write(data);
    return data.metodosEnvio;
  }

  getMetodoEnvioModel() {
    const self = this;
    const matchEnvioQuery = (m, query) => {
      if (!query || Object.keys(query).length === 0) return true;
      for (const [key, val] of Object.entries(query)) {
        if (key === "_id" && String(m._id) !== String(val)) return false;
        if (key === "activo" && Boolean(m.activo) !== Boolean(val)) return false;
        if (key === "tipo" && m.tipo !== val) return false;
        if (key === "costoTipo" && m.costoTipo !== val) return false;
      }
      return true;
    };

    const findQuery = (query) => {
      const exec = () => {
        const data = self.read();
        let methods = (data.metodosEnvio || []).filter((m) => matchEnvioQuery(m, query));
        return Promise.resolve(methods);
      };
      return {
        sort: (sortObj) => {
          const sortedExec = () =>
            exec().then((methods) => {
              const copy = [...methods];
              copy.sort((a, b) => {
                const aOrden = Number(a.orden) || 0;
                const bOrden = Number(b.orden) || 0;
                if (aOrden !== bOrden) return aOrden - bOrden;
                return (a.nombre || "").localeCompare(b.nombre || "");
              });
              return copy;
            });
          return {
            then: (onFulfilled) => sortedExec().then(onFulfilled),
            catch: (onRejected) => sortedExec().catch(onRejected),
          };
        },
        lean: () => ({
          then: (onFulfilled) => exec().then(onFulfilled),
          catch: (onRejected) => exec().catch(onRejected),
        }),
        then: (onFulfilled) => exec().then(onFulfilled),
        catch: (onRejected) => exec().catch(onRejected),
      };
    };

    return {
      find: (query) => findQuery(query),
      findOne: (query) => {
        const queryObj = findQuery(query);
        return {
          sort: (sortObj) => {
            const sorted = queryObj.sort(sortObj);
            return {
              lean: () => sorted.then((res) => (res && res.length > 0 ? res[0] : null)),
              then: (onFulfilled, onRejected) =>
                sorted.then((res) => (res && res.length > 0 ? res[0] : null)).then(onFulfilled, onRejected),
              catch: (onRejected) => sorted.catch(onRejected),
            };
          },
          lean: () => queryObj.then((res) => (res && res.length > 0 ? res[0] : null)),
          then: (onFulfilled, onRejected) =>
            queryObj.then((res) => (res && res.length > 0 ? res[0] : null)).then(onFulfilled, onRejected),
          catch: (onRejected) => queryObj.catch(onRejected),
        };
      },
      findById: (id) => {
        const data = self.read();
        const methods = data.metodosEnvio || [];
        const result = methods.find((m) => String(m._id) === String(id)) || null;
        return {
          lean: () => Promise.resolve(result),
          then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
          catch: (onRejected) => Promise.resolve(result).catch(onRejected),
        };
      },
      create: async (doc) => {
        const data = self.read();
        if (!data.metodosEnvio) data.metodosEnvio = [];
        const newDoc = {
          _id: "env-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
          activo: true,
          orden: 0,
          costo: 0,
          ...doc,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        data.metodosEnvio.push(newDoc);
        self.write(data);
        return newDoc;
      },
      findByIdAndUpdate: async (id, update, options = {}) => {
        const data = self.read();
        if (!data.metodosEnvio) data.metodosEnvio = [];
        const idx = data.metodosEnvio.findIndex((m) => String(m._id) === String(id));
        if (idx === -1) return null;
        const updateData = update.$set || update;
        data.metodosEnvio[idx] = {
          ...data.metodosEnvio[idx],
          ...updateData,
          updatedAt: new Date(),
        };
        self.write(data);
        return data.metodosEnvio[idx];
      },
      findByIdAndDelete: async (id) => {
        const data = self.read();
        if (!data.metodosEnvio) data.metodosEnvio = [];
        const idx = data.metodosEnvio.findIndex((m) => String(m._id) === String(id));
        if (idx === -1) return null;
        const [deleted] = data.metodosEnvio.splice(idx, 1);
        self.write(data);
        return deleted;
      },
      deleteMany: async (query = {}) => {
        const data = self.read();
        if (!data.metodosEnvio) data.metodosEnvio = [];
        const prevLen = data.metodosEnvio.length;
        data.metodosEnvio = data.metodosEnvio.filter((m) => !matchEnvioQuery(m, query));
        self.write(data);
        return { deletedCount: prevLen - data.metodosEnvio.length };
      },
      insertMany: async (docs) => {
        const data = self.read();
        if (!data.metodosEnvio) data.metodosEnvio = [];
        const created = docs.map((doc, i) => ({
          _id: doc._id || "env-" + Date.now() + "-" + i,
          activo: true,
          orden: 0,
          costo: 0,
          ...doc,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
        data.metodosEnvio.push(...created);
        self.write(data);
        return created;
      },
      countDocuments: async (query = {}) => {
        const data = self.read();
        return (data.metodosEnvio || []).filter((m) => matchEnvioQuery(m, query)).length;
      },
    };
  }

  getCounterModel() {
    return {
      findOneAndUpdate: async (query, update, options) => {
        const data = this.read();
        if (!data.counters) data.counters = [];

        let c = data.counters.find((x) => {
          if (query._id && x._id !== query._id) return false;
          if (query["available_seqs.0"] && query["available_seqs.0"].$exists !== undefined) {
            const exists = query["available_seqs.0"].$exists;
            const hasElem = Array.isArray(x.available_seqs) && x.available_seqs.length > 0;
            if (exists && !hasElem) return false;
            if (!exists && hasElem) return false;
          }
          if (query.available_seqs && query.available_seqs.$exists !== undefined) {
            const hasElem = Array.isArray(x.available_seqs) && x.available_seqs.length > 0;
            if (query.available_seqs.$exists && !hasElem) return false;
          }
          return true;
        });

        if (!c) {
          if (options && options.upsert) {
            c = { _id: query._id, seq: 0, available_seqs: [] };
            data.counters.push(c);
          } else {
            return null;
          }
        }

        if (!Array.isArray(c.available_seqs)) {
          c.available_seqs = [];
        }

        const beforeDoc = JSON.parse(JSON.stringify(c));

        if (update.$inc) {
          for (const [key, incVal] of Object.entries(update.$inc)) {
            c[key] = (c[key] || 0) + incVal;
          }
        }

        if (update.$set) {
          for (const [key, setVal] of Object.entries(update.$set)) {
            c[key] = setVal;
          }
        }

        if (update.$push) {
          for (const [key, pushVal] of Object.entries(update.$push)) {
            if (!Array.isArray(c[key])) {
              c[key] = [];
            }
            if (pushVal && typeof pushVal === "object" && Array.isArray(pushVal.$each)) {
              c[key].push(...pushVal.$each);
              if (pushVal.$sort !== undefined) {
                const dir = pushVal.$sort === -1 ? -1 : 1;
                c[key].sort((a, b) => (a - b) * dir);
              }
            } else {
              c[key].push(pushVal);
            }
          }
        }

        if (update.$pop) {
          for (const [key, popVal] of Object.entries(update.$pop)) {
            if (Array.isArray(c[key])) {
              if (popVal === -1) {
                c[key].shift();
              } else if (popVal === 1) {
                c[key].pop();
              }
            }
          }
        }

        this.write(data);

        if (options && (options.returnDocument === "before" || options.new === false)) {
          return beforeDoc;
        }
        return c;
      },
    };
  }

  getEtiquetaModel() {
    return {
      find: (query = {}, projection = null) => {
        const data = this.read();
        const ets = Object.values(data.etiquetas || {});
        let list = ets;
        if (query.telefono) {
          if (typeof query.telefono === "object" && query.telefono.$in) {
            list = list.filter(e => query.telefono.$in.includes(e.telefono));
          } else {
            list = list.filter(e => e.telefono === query.telefono);
          }
        }
        if (query.paso) {
          if (typeof query.paso === "object" && query.paso.$in) {
            list = list.filter(e => query.paso.$in.includes(e.paso));
          } else {
            list = list.filter(e => e.paso === query.paso);
          }
        }
        if (query.modo) {
          if (typeof query.modo === "object" && query.modo.$ne) {
            list = list.filter(e => e.modo !== query.modo.$ne);
          } else {
            list = list.filter(e => e.modo === query.modo);
          }
        }
        return {
          limit: (l) => ({
            lean: () => Promise.resolve(list.slice(0, l)),
            then: (resolve) => resolve(list.slice(0, l)),
            catch: () => {},
          }),
          lean: () => Promise.resolve(list),
          then: (resolve) => resolve(list),
          catch: () => {}
        };
      },
      findOne: (query) => {
        const exec = () => {
          const data = this.read();
          if (!data.etiquetas) data.etiquetas = {};
          return Promise.resolve(data.etiquetas[query.telefono] || null);
        };
        return {
          lean: () => exec(),
          then: (onFulfilled, onRejected) => exec().then(onFulfilled, onRejected),
          catch: (onRejected) => exec().catch(onRejected)
        };
      },
      findOneAndUpdate: async (query, update, options) => {
        const data = this.read();
        if (!data.etiquetas) data.etiquetas = {};
        
        let doc = data.etiquetas[query.telefono];
        if (!doc) {
          if (options && options.upsert) {
            doc = { telefono: query.telefono, paso: "inicio", carrito: { items: [] }, etiqueta: "nuevo", modo: "automatico", unreadCount: 0 };
            data.etiquetas[query.telefono] = doc;
          } else {
            return null;
          }
        }

        // Soporta updates planos (histórico) y operadores $set / $inc
        // ($inc lo usa el contador de no leídos del Inbox Unificado).
        const updateData = update && update.$set ? update.$set : update || {};
        for (const key of Object.keys(updateData)) {
          if (key === "$inc" || key === "$set" || key === "$setOnInsert") continue;
          doc[key] = updateData[key];
        }
        if (update && update.$inc) {
          for (const [key, incVal] of Object.entries(update.$inc)) {
            doc[key] = (doc[key] || 0) + incVal;
          }
        }
        data.etiquetas[query.telefono] = doc;
        
        this.write(data);
        return doc;
      },
      updateOne: async (query, update) => {
        const data = this.read();
        if (!data.etiquetas) data.etiquetas = {};
        let doc = data.etiquetas[query.telefono];
        if (doc) {
          const updateData = update.$set ? update.$set : update;
          for (const key of Object.keys(updateData)) {
            if (key.includes(".")) {
              const parts = key.split(".");
              let target = doc;
              for (let i = 0; i < parts.length - 1; i++) {
                if (!target[parts[i]]) target[parts[i]] = {};
                target = target[parts[i]];
              }
              target[parts[parts.length - 1]] = updateData[key];
            } else {
              doc[key] = updateData[key];
            }
          }
          data.etiquetas[query.telefono] = doc;
          this.write(data);
        }
        return { modifiedCount: doc ? 1 : 0 };
      },
      create: async (etiqueta) => {
        const data = this.read();
        if (!data.etiquetas) data.etiquetas = {};
        data.etiquetas[etiqueta.telefono] = etiqueta;
        this.write(data);
        return etiqueta;
      },
      deleteOne: async (query) => {
        const data = this.read();
        if (!data.etiquetas) data.etiquetas = {};
        let deletedCount = 0;
        if (query.telefono && data.etiquetas[query.telefono]) {
          delete data.etiquetas[query.telefono];
          deletedCount = 1;
          this.write(data);
        }
        return { deletedCount };
      },
      deleteMany: async (query = {}) => {
        const data = this.read();
        if (!data.etiquetas) data.etiquetas = {};
        if (Object.keys(query).length === 0) {
          data.etiquetas = {};
        } else if (query.telefono) {
          delete data.etiquetas[query.telefono];
        }
        this.write(data);
        return { acknowledged: true };
      }
    };
  }

  getMensajeModel() {
    return {
      create: async (msg) => {
        const data = this.read();
        data.mensajes = data.mensajes || [];
        const newMsg = { _id: "msg-" + Date.now(), status: "sent", ...msg };
        data.mensajes.push(newMsg);
        this.write(data);
        return newMsg;
      },
      findOneAndUpdate: async (filter, update, options: any = {}) => {
        const data = this.read();
        data.mensajes = data.mensajes || [];
        let msg = data.mensajes.find(m => {
          if (filter.wamid && m.wamid === filter.wamid) return true;
          if (filter._id && m._id === filter._id) return true;
          return false;
        });
        if (msg) {
          if (update.$set) {
            Object.assign(msg, update.$set);
          } else {
            Object.assign(msg, update);
          }
          this.write(data);
        } else if (options && (options.upsert || options.returnDocument)) {
          msg = {
            _id: "msg-" + Date.now(),
            ...(update.$setOnInsert || {}),
            ...(update.$set || update),
            ...filter
          };
          data.mensajes.push(msg);
          this.write(data);
        }
        return msg || null;
      },
      findByIdAndUpdate: async (id, update) => {
        const data = this.read();
        data.mensajes = data.mensajes || [];
        const msg = data.mensajes.find(m => String(m._id) === String(id));
        if (msg) {
          if (update.$set) {
            Object.assign(msg, update.$set);
          } else {
            Object.assign(msg, update);
          }
          this.write(data);
        }
        return msg || null;
      },
      findOne: (query) => {
        const data = this.read();
        data.mensajes = data.mensajes || [];
        const list = data.mensajes.filter(m => {
          if (query._id && String(m._id) !== String(query._id)) return false;
          if (query.telefono && m.telefono !== query.telefono) return false;
          if (query.direccion && m.direccion !== query.direccion) return false;
          if (query.wamid && m.wamid !== query.wamid) return false;
          if (query.mediaId && m.mediaId !== query.mediaId) return false;
          if (query.tipo && m.tipo !== query.tipo) return false;
          return true;
        });
        const doc = list[list.length - 1] || null;
        return {
          sort: (sortCriteria) => {
            let sorted = [...list];
            if (typeof sortCriteria === "object") {
              const key = Object.keys(sortCriteria)[0];
              const dir = sortCriteria[key];
              sorted.sort((a, b) => {
                const va = a[key] instanceof Date ? a[key].getTime() : (typeof a[key] === "string" ? new Date(a[key]).getTime() : (a[key] || 0));
                const vb = b[key] instanceof Date ? b[key].getTime() : (typeof b[key] === "string" ? new Date(b[key]).getTime() : (b[key] || 0));
                return dir === -1 ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
              });
            }
            const res = sorted[0] || null;
            return {
              then: (onFulfilled) => Promise.resolve(res).then(onFulfilled),
              catch: (onRejected) => Promise.resolve(res).catch(onRejected)
            };
          },
          then: (onFulfilled) => Promise.resolve(doc).then(onFulfilled),
          catch: (onRejected) => Promise.resolve(doc).catch(onRejected)
        };
      },
      find: (query = {}) => {
        const data = this.read();
        data.mensajes = data.mensajes || [];
        let list = [...data.mensajes];
        if (query.telefono) {
          list = list.filter(m => m.telefono === query.telefono);
        }
        list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        return {
          sort: () => ({
            skip: (n = 0) => ({
              limit: (l = 50) => Promise.resolve(list.slice(n, n + l))
            }),
            limit: (l = 50) => Promise.resolve(list.slice(0, l))
          }),
          skip: (n = 0) => ({
            limit: (l = 50) => Promise.resolve(list.slice(n, n + l))
          }),
          limit: (l = 50) => Promise.resolve(list.slice(0, l)),
          then: (resolve) => resolve(list)
        };
      },
      countDocuments: async (query = {}) => {
        const data = this.read();
        data.mensajes = data.mensajes || [];
        let list = data.mensajes;
        if (query.telefono) {
          list = list.filter(m => m.telefono === query.telefono);
        }
        return list.length;
      },
      aggregate: async (pipeline) => {
        const data = this.read();
        data.mensajes = data.mensajes || [];
        const groups = {};
        data.mensajes.forEach(m => {
          if (!groups[m.telefono]) {
            groups[m.telefono] = {
              _id: m.telefono,
              ultimoMensaje: m,
              totalMensajes: 0
            };
          }
          groups[m.telefono].totalMensajes += 1;
          if (new Date(m.timestamp) > new Date(groups[m.telefono].ultimoMensaje.timestamp)) {
            groups[m.telefono].ultimoMensaje = m;
          }
        });
        return Object.values(groups);
      }
    };
  }

  getCategoriaModel() {
    const defaultCategorias = [
      { _id: "cat-001", nombre: "Dumplings", slug: "dumplings", activo: true, padre: null },
      { _id: "cat-002", nombre: "Especialidades", slug: "especialidades", activo: true, padre: null }
    ];
    return {
      find: (query = {}) => {
        const data = this.read();
        let categorias = data.categorias && data.categorias.length > 0 ? data.categorias : defaultCategorias;
        if (query.padre !== undefined) {
          categorias = categorias.filter(c => c.padre === query.padre);
        }
        if (query.slug) {
          if (query.slug.$ne) {
            categorias = categorias.filter(c => c.slug !== query.slug.$ne);
          } else {
            categorias = categorias.filter(c => c.slug === query.slug);
          }
        }
        const chain = {
          sort: () => chain,
          lean: () => Promise.resolve(categorias),
          then: (resolve) => resolve(categorias),
          catch: () => {}
        };
        return chain;
      },
      findOne: async (query = {}) => {
        const data = this.read();
        let categorias = data.categorias && data.categorias.length > 0 ? data.categorias : defaultCategorias;
        if (query.slug) return categorias.find(c => c.slug === query.slug) || null;
        if (query._id) return categorias.find(c => String(c._id) === String(query._id)) || null;
        return categorias[0] || null;
      },
      findById: async (id) => {
        const data = this.read();
        let categorias = data.categorias && data.categorias.length > 0 ? data.categorias : defaultCategorias;
        return categorias.find(c => String(c._id) === String(id)) || null;
      }
    };
  }

  getAuditoriaModel() {
    return {
      create: async (auditoria) => {
        const data = this.read();
        data.auditorias = data.auditorias || [];
        data.auditorias.push(auditoria);
        this.write(data);
        return auditoria;
      },
      find: (query = {}) => {
        const data = this.read();
        data.auditorias = data.auditorias || [];
        let list = [...data.auditorias];
        if (query.pedidoId) {
          list = list.filter(a => a.pedidoId === query.pedidoId);
        }
        if (query.accion) {
          list = list.filter(a => a.accion === query.accion);
        }
        if (query.recursoId) {
          list = list.filter(a => a.recursoId === query.recursoId);
        }
        return {
          sort: () => ({
            skip: (n = 0) => ({
              limit: (l = 50) => list.slice(n, n + l),
              then: (resolve) => resolve(list.slice(n, n + l)),
              catch: () => {}
            }),
            limit: (l = 50) => list.slice(0, l),
            then: (resolve) => resolve(list),
            catch: () => {}
          }),
          then: (resolve) => resolve(list),
          catch: () => {}
        };
      },
      countDocuments: async () => {
        const data = this.read();
        return (data.auditorias || []).length;
      },
      deleteMany: async () => {
        const data = this.read();
        data.auditorias = [];
        this.write(data);
      }
    };
  }

  getUsuarioModel() {
    return {
      find: (query = {}, projection = null) => {
        const data = this.read();
        data.usuarios = data.usuarios || [];
        let list = [...data.usuarios];
        if (query.role) {
          list = list.filter(u => u.role === query.role);
        }
        return {
          select: () => ({
            lean: async () => list
          }),
          lean: async () => list,
          then: (resolve) => resolve(list)
        };
      },
      findOne: async (query = {}) => {
        const data = this.read();
        data.usuarios = data.usuarios || [];
        return data.usuarios.find(u => {
          if (query.username && u.username !== query.username) return false;
          if (query._id && u._id !== query._id) return false;
          return true;
        }) || null;
      },
      findById: async (id) => {
        const data = this.read();
        data.usuarios = data.usuarios || [];
        return data.usuarios.find(u => String(u._id) === String(id)) || null;
      },
      countDocuments: async () => {
        const data = this.read();
        return (data.usuarios || []).length;
      },
      create: async (usuario) => {
        const data = this.read();
        data.usuarios = data.usuarios || [];
        const doc = { _id: usuario._id || `user-${Date.now()}`, ...usuario };
        data.usuarios.push(doc);
        this.write(data);
        return doc;
      }
    };
  }

  getFaqModel() {
    return this.getFAQModel();
  }

  getFAQModel() {
    const self = this;
    return {
      find: (query = {}) => {
        const data = self.read();
        let faqs = data.faqs || [];
        if (query.brand) faqs = faqs.filter(f => f.brand === query.brand);
        if (query.activo !== undefined) faqs = faqs.filter(f => f.activo === query.activo);
        
        const queryObj = {
          sort: (sortObj = {}) => {
            const sorted = [...faqs].sort((a, b) => (a.order || 0) - (b.order || 0));
            return Promise.resolve(sorted);
          },
          lean: () => Promise.resolve(faqs),
          exec: () => Promise.resolve(faqs),
          then: (onFulfilled, onRejected) => Promise.resolve(faqs).then(onFulfilled, onRejected),
        };
        return queryObj;
      },
      findById: async (id) => {
        const data = self.read();
        const faqs = data.faqs || [];
        return faqs.find(f => String(f._id || f.id) === String(id)) || null;
      },
      findByIdAndUpdate: async (id, update, options = {}) => {
        const data = self.read();
        data.faqs = data.faqs || [];
        const index = data.faqs.findIndex(f => String(f._id || f.id) === String(id));
        if (index === -1) return null;
        data.faqs[index] = { ...data.faqs[index], ...update, updatedAt: new Date().toISOString() };
        self.write(data);
        return data.faqs[index];
      },
      findByIdAndDelete: async (id) => {
        const data = self.read();
        data.faqs = data.faqs || [];
        const index = data.faqs.findIndex(f => String(f._id || f.id) === String(id));
        if (index === -1) return null;
        const deleted = data.faqs.splice(index, 1)[0];
        self.write(data);
        return deleted;
      },
      create: async (faqData) => {
        const data = self.read();
        data.faqs = data.faqs || [];
        const newFaq = {
          _id: "faq_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
          brand: "default",
          activo: true,
          type: "estatica",
          dynamicKey: null,
          order: 0,
          ...faqData,
          keywords: Array.isArray(faqData.keywords)
            ? faqData.keywords
            : typeof faqData.keywords === "string"
            ? faqData.keywords.split(",").map(k => k.trim()).filter(Boolean)
            : [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        data.faqs.push(newFaq);
        self.write(data);
        return newFaq;
      }
    };
  }

  getCategoriaModel() {
    const self = this;
    return {
      find: (query = {}) => {
        const data = self.read();
        let cats = data.categorias || [];
        if (query.padre !== undefined) {
          cats = cats.filter(
            (c) => (c.padre || null) === (query.padre || null),
          );
        }
        if (query.slug && query.slug.$ne) {
          cats = cats.filter((c) => c.slug !== query.slug.$ne);
        }
        const chain = {
          sort: () => chain,
          limit: (n) => Promise.resolve(cats.slice(0, n)),
          lean: () => Promise.resolve(cats),
          then: (resolve, reject) => Promise.resolve(cats).then(resolve, reject),
          catch: (reject) => Promise.resolve(cats).catch(reject),
        };
        return chain;
      },
      findOne: async (query = {}) => {
        const data = self.read();
        const cats = data.categorias || [];
        if (query.slug) return cats.find((c) => c.slug === query.slug) || null;
        if (query._id) return cats.find((c) => String(c._id) === String(query._id)) || null;
        return cats[0] || null;
      },
      findById: async (id) => {
        const data = self.read();
        const cats = data.categorias || [];
        return cats.find((c) => String(c._id) === String(id)) || null;
      },
      create: async (cat) => {
        const data = self.read();
        data.categorias = data.categorias || [];
        const doc = {
          _id:
            cat._id ||
            `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          ...cat,
        };
        data.categorias.push(doc);
        self.write(data);
        return doc;
      },
      deleteMany: async () => {
        const data = self.read();
        data.categorias = [];
        self.write(data);
        return { deletedCount: 0 };
      }
    };
  }

  getEtiquetaIgModel() {
    const self = this;
    return {
      find: (query = {}, projection = null) => {
        const data = self.read();
        const ets = Object.values(data.etiquetasIg || {});
        let list = ets;
        if (query.usuarioIgId) {
          if (typeof query.usuarioIgId === "object" && query.usuarioIgId.$in) {
            list = ets.filter(e => query.usuarioIgId.$in.includes(e.usuarioIgId));
          } else {
            list = ets.filter(e => e.usuarioIgId === query.usuarioIgId);
          }
        }
        return {
          limit: (l) => ({
            lean: () => Promise.resolve(list.slice(0, l)),
            then: (resolve) => resolve(list.slice(0, l)),
            catch: () => {},
          }),
          lean: () => Promise.resolve(list),
          then: (resolve) => resolve(list),
          catch: () => {}
        };
      },
      findOne: async (query) => {
        const data = self.read();
        if (!data.etiquetasIg) data.etiquetasIg = {};
        return data.etiquetasIg[query.usuarioIgId] || null;
      },
      findOneAndUpdate: async (query, update, options) => {
        const data = self.read();
        if (!data.etiquetasIg) data.etiquetasIg = {};
        
        let doc = data.etiquetasIg[query.usuarioIgId];
        if (!doc) {
          if (options && options.upsert) {
            doc = {
              usuarioIgId: query.usuarioIgId,
              username: null,
              nombre: null,
              paso: "inicio",
              modo: "automatico",
              bloqueado: false,
              stuck: false,
              unreadCount: 0,
              lastInteraction: new Date(),
              metadata: {},
            };
            data.etiquetasIg[query.usuarioIgId] = doc;
          } else {
            return null;
          }
        }
        
        if (update.$set) {
          Object.assign(doc, update.$set);
        } else if (!update.$inc) {
          Object.assign(doc, update);
        }
        if (update.$inc) {
          for (const [key, incVal] of Object.entries(update.$inc)) {
            doc[key] = (doc[key] || 0) + incVal;
          }
        }
        data.etiquetasIg[query.usuarioIgId] = doc;
        
        self.write(data);
        return doc;
      },
      create: async (etiqueta) => {
        const data = self.read();
        if (!data.etiquetasIg) data.etiquetasIg = {};
        const newEtiqueta = {
          bloqueado: false,
          ...etiqueta,
        };
        data.etiquetasIg[etiqueta.usuarioIgId] = newEtiqueta;
        self.write(data);
        return newEtiqueta;
      }
    };
  }

  getMensajeIgModel() {
    const self = this;
    return {
      create: async (msg) => {
        const data = self.read();
        data.mensajesIg = data.mensajesIg || [];
        const newMsg = {
          _id: "igmsg-" + Date.now() + "-" + Math.random().toString(36).substr(2, 5),
          status: "sent",
          timestamp: new Date(),
          ...msg,
        };
        data.mensajesIg.push(newMsg);
        self.write(data);
        return newMsg;
      },
      findOne: async (query = {}) => {
        const data = self.read();
        data.mensajesIg = data.mensajesIg || [];
        return data.mensajesIg.find(m => {
          if (query.usuarioIgId && m.usuarioIgId !== query.usuarioIgId) return false;
          if (query.mid && m.mid !== query.mid) return false;
          return true;
        }) || null;
      },
      find: (query = {}) => {
        const data = self.read();
        data.mensajesIg = data.mensajesIg || [];
        let list = [...data.mensajesIg];
        if (query.usuarioIgId) {
          list = list.filter(m => m.usuarioIgId === query.usuarioIgId);
        }
        if (query.direccion) {
          list = list.filter(m => m.direccion === query.direccion);
        }
        list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
        return {
          sort: () => ({
            skip: (n = 0) => ({
              limit: (l = 50) => Promise.resolve(list.slice(n, n + l))
            }),
            limit: (l = 50) => Promise.resolve(list.slice(0, l))
          }),
          skip: (n = 0) => ({
            limit: (l = 50) => Promise.resolve(list.slice(n, n + l))
          }),
          limit: (l = 50) => Promise.resolve(list.slice(0, l)),
          lean: () => Promise.resolve(list),
          then: (resolve) => resolve(list)
        };
      },
      countDocuments: async (query = {}) => {
        const data = self.read();
        data.mensajesIg = data.mensajesIg || [];
        let list = data.mensajesIg;
        if (query.usuarioIgId) {
          list = list.filter(m => m.usuarioIgId === query.usuarioIgId);
        }
        return list.length;
      },
      aggregate: async (pipeline) => {
        const data = self.read();
        data.mensajesIg = data.mensajesIg || [];
        const groups = {};
        data.mensajesIg.forEach(m => {
          if (!groups[m.usuarioIgId]) {
            groups[m.usuarioIgId] = {
              _id: m.usuarioIgId,
              ultimoMensaje: m,
              totalMensajes: 0
            };
          }
          groups[m.usuarioIgId].totalMensajes += 1;
          if (new Date(m.timestamp) > new Date(groups[m.usuarioIgId].ultimoMensaje.timestamp)) {
            groups[m.usuarioIgId].ultimoMensaje = m;
          }
        });
        return Object.values(groups);
      }
    };
  }

  getSettingModel() {
    const self = this;
    return {
      find: async (query = {}) => {
        const data = self.read();
        if (!data.settings) data.settings = {};
        return Object.entries(data.settings).map(([key, value]) => ({ key, value }));
      },
      findOne: async (query = {}) => {
        const data = self.read();
        if (!data.settings) data.settings = {};
        if (query.key && data.settings[query.key] !== undefined) {
          return { key: query.key, value: data.settings[query.key] };
        }
        return null;
      },
      findOneAndUpdate: async (query, update, options = {}) => {
        const data = self.read();
        if (!data.settings) data.settings = {};
        const key = query.key;
        const updateData = update.$set || update;
        const value = updateData.value !== undefined ? updateData.value : updateData;
        data.settings[key] = value;
        self.write(data);
        return { key, value };
      }
    };
  }

  getSuscripcionPushModel() {
    const self = this;
    return {
      find: (query = {}) => {
        const data = self.read();
        let subs = data.suscripcionesPush || [];
        if (query.role) subs = subs.filter(s => s.role === query.role);
        if (query.usuarioId) subs = subs.filter(s => String(s.usuarioId) === String(query.usuarioId));
        return {
          sort: () => Promise.resolve(subs),
          then: (resolve) => Promise.resolve(subs).then(resolve)
        };
      },
      findOne: async (query = {}) => {
        const data = self.read();
        const subs = data.suscripcionesPush || [];
        return subs.find(s => {
          if (query.endpoint && s.endpoint !== query.endpoint) return false;
          if (query.usuarioId && String(s.usuarioId) !== String(query.usuarioId)) return false;
          return true;
        }) || null;
      },
      findOneAndUpdate: async (query, update, options = {}) => {
        const data = self.read();
        if (!data.suscripcionesPush) data.suscripcionesPush = [];
        const updateData = update.$set || update;
        const idx = data.suscripcionesPush.findIndex(s => s.endpoint === query.endpoint);
        if (idx >= 0) {
          data.suscripcionesPush[idx] = { ...data.suscripcionesPush[idx], ...updateData, updatedAt: new Date() };
          self.write(data);
          return data.suscripcionesPush[idx];
        } else if (options.upsert) {
          const newSub = { _id: "sub-" + Date.now(), ...query, ...updateData, createdAt: new Date(), updatedAt: new Date() };
          data.suscripcionesPush.push(newSub);
          self.write(data);
          return newSub;
        }
        return null;
      },
      deleteOne: async (query = {}) => {
        const data = self.read();
        if (!data.suscripcionesPush) data.suscripcionesPush = [];
        const initialLen = data.suscripcionesPush.length;
        data.suscripcionesPush = data.suscripcionesPush.filter(s => s.endpoint !== query.endpoint);
        self.write(data);
        return { deletedCount: initialLen - data.suscripcionesPush.length };
      },
      deleteMany: async (query = {}) => {
        const data = self.read();
        if (!data.suscripcionesPush) data.suscripcionesPush = [];
        if (query.endpoint) {
          data.suscripcionesPush = data.suscripcionesPush.filter(s => s.endpoint !== query.endpoint);
        } else if (query.usuarioId) {
          data.suscripcionesPush = data.suscripcionesPush.filter(s => String(s.usuarioId) !== String(query.usuarioId));
        } else {
          data.suscripcionesPush = [];
        }
        self.write(data);
        return { acknowledged: true };
      }
    };
  }

  getCarritoWebModel() {
    const self = this;
    const matchQuery = (c: any, query: any) => {
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
            const gtTime = new Date((val as any).$gt).getTime();
            if (isNaN(expTime) || expTime <= gtTime) return false;
          } else {
            const valTime = new Date(val as any).getTime();
            if (expTime !== valTime) return false;
          }
        }
      }
      return true;
    };

    const findQuery = (query: any) => {
      const exec = () => {
        const data = self.read();
        const carritos = (data.carritosWeb || []).filter((c: any) => matchQuery(c, query));
        return Promise.resolve(carritos);
      };
      return {
        sort: (sortObj: any) => {
          return {
            lean: () => exec(),
            then: (onFulfilled: any) => exec().then(onFulfilled),
            catch: (onRejected: any) => exec().catch(onRejected),
          };
        },
        lean: () => ({
          then: (onFulfilled: any) => exec().then(onFulfilled),
          catch: (onRejected: any) => exec().catch(onRejected),
        }),
        then: (onFulfilled: any) => exec().then(onFulfilled),
        catch: (onRejected: any) => exec().catch(onRejected),
      };
    };

    return {
      schema: {
        indexes: () => [
          [{ expiraEn: 1 }, { expireAfterSeconds: 0 }]
        ]
      },
      find: (query: any) => findQuery(query),
      findOne: (query: any) => {
        const queryObj = findQuery(query);
        return {
          lean: () => queryObj.then((res: any[]) => (res && res.length > 0 ? res[0] : null)),
          then: (onFulfilled: any, onRejected: any) =>
            queryObj.then((res: any[]) => (res && res.length > 0 ? res[0] : null)).then(onFulfilled, onRejected),
          catch: (onRejected: any) => queryObj.catch(onRejected),
        };
      },
      findOneAndUpdate: (filter: any, update: any, options: any = {}) => {
        const exec = () => {
          const data = self.read();
          data.carritosWeb = data.carritosWeb || [];
          const index = data.carritosWeb.findIndex((c: any) => matchQuery(c, filter));
          if (index === -1) return null;

          const cw = data.carritosWeb[index];
          const updateData = update.$set ? update.$set : update;
          Object.assign(cw, updateData, { updatedAt: new Date() });
          self.write(data);
          return {
            ...cw,
            toObject: () => ({ ...cw }),
          };
        };
        return {
          lean: () => Promise.resolve(exec()),
          then: (onFulfilled: any, onRejected: any) => Promise.resolve(exec()).then(onFulfilled, onRejected),
          catch: (onRejected: any) => Promise.resolve(exec()).catch(onRejected),
        };
      },
      findById: (id: any) => {
        return {
          then: (onFulfilled: any, onRejected: any) => {
            const data = self.read();
            const found = (data.carritosWeb || []).find((c: any) => String(c._id) === String(id));
            return Promise.resolve(found || null).then(onFulfilled, onRejected);
          },
          catch: (onRejected: any) => Promise.resolve(null).catch(onRejected),
        };
      },
      create: (doc: any) => {
        const data = self.read();
        if (!data.carritosWeb) data.carritosWeb = [];
        const newDoc = {
          _id: doc._id || "cw-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
          estado: doc.estado || "pendiente",
          telefono: doc.telefono || null,
          pedidoId: doc.pedidoId || null,
          creadoEn: doc.creadoEn || new Date(),
          ...doc,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        data.carritosWeb.push(newDoc);
        self.write(data);
        return Promise.resolve({
          ...newDoc,
          toObject: () => ({ ...newDoc }),
        });
      },
      countDocuments: (query: any = {}) => {
        const data = self.read();
        const carritos = (data.carritosWeb || []).filter((c: any) => matchQuery(c, query));
        return Promise.resolve(carritos.length);
      },
      deleteMany: (query: any = {}) => {
        const data = self.read();
        if (!data.carritosWeb) data.carritosWeb = [];
        if (!query || Object.keys(query).length === 0) {
          data.carritosWeb = [];
        } else {
          data.carritosWeb = data.carritosWeb.filter((c: any) => !matchQuery(c, query));
        }
        self.write(data);
        return Promise.resolve({ deletedCount: 1 });
      },
    };
  }

  getContadorCatalogoModel() {
    const self = this;
    const matchQuery = (c: any, query: any) => {
      if (!query || Object.keys(query).length === 0) return true;
      for (const [key, val] of Object.entries(query)) {
        if (key === "_id" && String(c._id) !== String(val)) return false;
        if (key === "tipo") {
          if (val && typeof val === "object" && "$in" in val) {
            if (!((val as any).$in || []).includes(c.tipo)) return false;
          } else if (c.tipo !== val) {
            return false;
          }
        }
        if (key === "fecha") {
          if (val && typeof val === "object") {
            const valObj = val as any;
            if (valObj.$gte !== undefined && c.fecha < valObj.$gte) return false;
            if (valObj.$lte !== undefined && c.fecha > valObj.$lte) return false;
            if (valObj.$gt !== undefined && c.fecha <= valObj.$gt) return false;
            if (valObj.$lt !== undefined && c.fecha >= valObj.$lt) return false;
            if (valObj.$in !== undefined && !valObj.$in.includes(c.fecha)) return false;
          } else if (c.fecha !== val) {
            return false;
          }
        }
      }
      return true;
    };

    const findQuery = (query: any) => {
      let sortFn: ((a: any, b: any) => number) | null = null;
      const exec = () => {
        const data = self.read();
        let items = (data.contadoresCatalogo || []).filter((c: any) => matchQuery(c, query));
        if (sortFn) {
          items.sort(sortFn);
        }
        return Promise.resolve(items);
      };
      return {
        sort: (sortObj: any) => {
          if (sortObj && typeof sortObj === "object") {
            const [field, direction] = Object.entries(sortObj)[0] || [];
            if (field) {
              const dir = direction === -1 || direction === "desc" ? -1 : 1;
              sortFn = (a: any, b: any) => (a[field] > b[field] ? dir : a[field] < b[field] ? -dir : 0);
            }
          }
          return {
            lean: () => exec(),
            then: (onFulfilled: any) => exec().then(onFulfilled),
            catch: (onRejected: any) => exec().catch(onRejected),
          };
        },
        lean: () => ({
          then: (onFulfilled: any) => exec().then(onFulfilled),
          catch: (onRejected: any) => exec().catch(onRejected),
        }),
        then: (onFulfilled: any) => exec().then(onFulfilled),
        catch: (onRejected: any) => exec().catch(onRejected),
      };
    };

    return {
      find: (query: any) => findQuery(query),
      findOne: (query: any) => {
        const queryObj = findQuery(query);
        return {
          lean: () => queryObj.then((res: any[]) => (res && res.length > 0 ? res[0] : null)),
          then: (onFulfilled: any, onRejected: any) =>
            queryObj.then((res: any[]) => (res && res.length > 0 ? res[0] : null)).then(onFulfilled, onRejected),
          catch: (onRejected: any) => queryObj.catch(onRejected),
        };
      },
      findOneAndUpdate: (filter: any, update: any, options: any = {}) => {
        const exec = () => {
          const data = self.read();
          data.contadoresCatalogo = data.contadoresCatalogo || [];
          let item = data.contadoresCatalogo.find((c: any) => matchQuery(c, filter));
          if (!item) {
            if (options && options.upsert) {
              item = {
                _id: "cc-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
                fecha: filter.fecha,
                tipo: filter.tipo,
                cantidad: 0,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
              data.contadoresCatalogo.push(item);
            } else {
              return null;
            }
          }

          if (update.$inc) {
            for (const [key, incVal] of Object.entries(update.$inc)) {
              item[key] = (item[key] || 0) + (incVal as number);
            }
          }
          if (update.$set) {
            for (const [key, setVal] of Object.entries(update.$set)) {
              item[key] = setVal;
            }
          }
          item.updatedAt = new Date();
          self.write(data);
          return {
            ...item,
            toObject: () => ({ ...item }),
          };
        };
        return {
          lean: () => Promise.resolve(exec()),
          then: (onFulfilled: any, onRejected: any) => Promise.resolve(exec()).then(onFulfilled, onRejected),
          catch: (onRejected: any) => Promise.resolve(exec()).catch(onRejected),
        };
      },
      deleteMany: (query: any = {}) => {
        const data = self.read();
        if (!data.contadoresCatalogo) data.contadoresCatalogo = [];
        if (!query || Object.keys(query).length === 0) {
          data.contadoresCatalogo = [];
        } else {
          data.contadoresCatalogo = data.contadoresCatalogo.filter((c: any) => !matchQuery(c, query));
        }
        self.write(data);
        return Promise.resolve({ deletedCount: 1 });
      },
    };
  }
}

module.exports = new DbLocal();// @ts-nocheck
