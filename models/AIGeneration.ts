import mongoose, { Schema } from "mongoose";
import { IAIGeneration } from "../types/models";

const AIGenerationSchema = new Schema<IAIGeneration>(
  {
    imagePrompt: { type: String, required: true },
    imageUrl: { type: String }, // Can be null initially while generating
    copyText: { type: String },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model<IAIGeneration>("AIGeneration", AIGenerationSchema);
