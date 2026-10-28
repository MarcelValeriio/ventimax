import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));
    
    const countMensajes = await db.collection('mensajes').countDocuments();
    console.log("Total Mensajes:", countMensajes);

    const match = await db.collection('mensajes').find({ usuarioId: /4249431417/ }).toArray();
    console.log("Matches:", match.length);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
