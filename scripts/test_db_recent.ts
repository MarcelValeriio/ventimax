import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    console.log("=== ÚLTIMOS 10 MENSAJES EN LA DB ===");
    const recent = await db.collection('mensajes').find().sort({ timestamp: -1 }).limit(10).toArray();
    recent.forEach(m => {
      console.log(`[${new Date(m.timestamp).toISOString()}] ${m.usuarioId}: ${m.texto}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
