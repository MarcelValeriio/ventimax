process.env.NODE_ENV = 'test';
const dbLocal = require('../services/dbLocal');

// Definir el mock del modelo Pedido
const PedidoMock = {
  aggregate: async () => [],
  countDocuments: async () => 0,
  find: () => ({
    sort: () => ({
      skip: () => ({
        limit: () => ({
          lean: () => Promise.resolve([])
        })
      })
    })
  }),
  distinct: async () => []
};

// Definir el mock del modelo Etiqueta
const EtiquetaMock = {
  find: (query) => ({
    limit: () => ({
        lean: () => Promise.resolve([])
    }),
    lean: () => Promise.resolve([])
  })
};

// Sobrescribir los métodos en dbLocal
dbLocal.getPedidoModel = () => PedidoMock;
dbLocal.getEtiquetaModel = () => EtiquetaMock;

const adminController = require('../controllers/adminController');

async function runTest() {
  try {
    console.log('🧪 Iniciando prueba de getSalesSummary con inyección completa de mocks (v3)...');

    let pedidosDB = [
      { 
        _id: '1',
        correlativo: 'PED-001',
        whatsappId: '123', 
        estado: 'entregado', 
        pago: { montoUSD: 10, montoVES: 400, tasa: 40 },
        timestamp: new Date(),
        verifiedAt: new Date(Date.now() - 60 * 60 * 1000),
        deliveredAt: new Date(),
        items: [{ producto: 'Empanada', cantidad: 2 }]
      },
      { 
        _id: '2',
        correlativo: 'PED-002',
        whatsappId: '456', 
        estado: 'entregado', 
        pago: { montoUSD: 20, montoVES: 800, tasa: 40 },
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // Hace 2 días
        verifiedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000),
        deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        items: [{ producto: 'Lumpia', cantidad: 1 }]
      },
      { 
        _id: '3',
        correlativo: 'PED-003',
        whatsappId: '789', 
        estado: 'entregado', 
        pago: { montoUSD: 30, montoVES: 1200, tasa: 40 },
        timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // Hace 10 días
        verifiedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000 - 30 * 60 * 1000),
        deliveredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        items: [{ producto: 'Arroz', cantidad: 1 }]
      }
    ];

    PedidoMock.countDocuments = async (query) => {
      let filtered = pedidosDB.filter(p => {
          if (query.estado && query.estado.$in) {
              if (!query.estado.$in.includes(p.estado)) return false;
          }
          if (query.timestamp && query.timestamp.$gte) {
              if (new Date(p.timestamp) < new Date(query.timestamp.$gte)) return false;
          }
          return true;
      });
      return filtered.length;
    };

    PedidoMock.aggregate = async (pipeline) => {
      const matchStage = pipeline.find(s => s.$match)?.$match || {};
      let filtered = pedidosDB.filter(p => {
        if (matchStage.estado && matchStage.estado.$in) {
            if (!matchStage.estado.$in.includes(p.estado)) return false;
        }
        if (matchStage.timestamp && matchStage.timestamp.$gte) {
            if (new Date(p.timestamp) < new Date(matchStage.timestamp.$gte)) return false;
        }
        return true;
      });

      if (pipeline.some(s => s.$group)) {
        let totalIngresos = 0;
        let totalVES = 0;
        let totalPedidos = filtered.length;
        let sumaTiempoEntrega = 0;
        let totalEntregados = 0;

        filtered.forEach(p => {
            totalIngresos += (p.pago?.montoUSD || 0);
            totalVES += (p.pago?.montoVES || 0);
            if (p.estado === 'entregado' && p.verifiedAt && p.deliveredAt) {
                const diff = (new Date(p.deliveredAt) - new Date(p.verifiedAt)) / (1000 * 60);
                sumaTiempoEntrega += diff;
                totalEntregados++;
            }
        });

        return [{
            totalIngresos,
            totalVES,
            totalPedidos,
            sumaTiempoEntrega,
            totalEntregados
        }];
      }
      return filtered;
    };

    PedidoMock.find = (query) => {
      let filtered = pedidosDB.filter(p => {
        if (query.estado && query.estado.$in) {
            if (!query.estado.$in.includes(p.estado)) return false;
        }
        if (query.timestamp && query.timestamp.$gte) {
            if (new Date(p.timestamp) < new Date(query.timestamp.$gte)) return false;
        }
        return true;
      });

      return {
        sort: () => ({
          skip: (s) => ({
            limit: (l) => ({
              lean: () => Promise.resolve(filtered.slice(s, s + l))
            })
          })
        })
      };
    };

    PedidoMock.distinct = async () => ['123', '456', '789'];

    console.log('✅ Mocks inyectados correctamente.');

    const req = { query: { page: 1, limit: 2, filtroFecha: 'mes' } };
    const res = {
      status: function(s) { this.statusCode = s; return this; },
      json: function(data) { this.body = data; return this; }
    };

    await adminController.getSalesSummary(req, res);

    const body = res.body;
    if (body.success) {
      console.log('🚀 RESULTADO: ÉXITO');
      console.log('📊 KPIs:', body.data.kpis);
      console.log('📄 Paginación:', body.data.pagination);
      console.log('💸 Transacciones encontradas:', body.data.transacciones.length);
      
      const expectedTotal = 3;
      if (body.data.pagination.totalRecords === expectedTotal && body.data.transacciones.length === 2) {
          console.log('✅ Validación de paginación correcta.');
      } else {
          console.error('❌ Error en validación de paginación.');
          process.exit(1);
      }
    } else {
      console.error('❌ RESULTADO: FALLO', body.error);
      process.exit(1);
    }

    req.query.filtroFecha = 'hoy';
    await adminController.getSalesSummary(req, res);
    if (res.body.data.pagination.totalRecords === 1) {
        console.log('✅ Filtro "hoy" funciona correctamente.');
    } else {
        console.error('❌ Filtro "hoy" falló:', res.body.data.pagination.totalRecords);
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('💥 Error durante el test:', error);
    process.exit(1);
  }
}

runTest();
