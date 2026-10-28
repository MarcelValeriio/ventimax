import mongoose, { Schema } from "mongoose";
import { IAIDestination } from "../types/models";

const AIDestinationSchema = new Schema<IAIDestination>(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model<IAIDestination>("AIDestination", AIDestinationSchema);
