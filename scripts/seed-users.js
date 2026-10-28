const mongoose = require("mongoose");
require("dotenv").config();
const Usuario = require("../models/Usuario");

async function seedUsers() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error("❌ MONGODB_URI no definido en .env");
      process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    // Clear existing users
    await Usuario.deleteMany({});
    console.log("Cleared existing users");

    const users = [
      {
        username: "admin",
        password: "admin123", // Will be hashed by pre-save hook
        nombre: "Administrador Pachi",
        role: "admin"
      },
      {
        username: "reparto",
        password: "reparto123",
        nombre: "Juan Repartidor",
        role: "repartidor"
      },
      {
        username: "caja",
        password: "caja123",
        nombre: "Maria Cajera",
        role: "cajero"
      }
    ];

    for (const u of users) {
      await Usuario.create(u);
      console.log(`Created user: ${u.username} (${u.role})`);
    }

    console.log("✅ Seeding completed");
    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error seeding users:", error);
    process.exit(1);
  }
}

seedUsers();
