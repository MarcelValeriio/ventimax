import mongoose, { Schema } from "mongoose";
import { IQuickReply } from "../types/models";

const QuickReplySchema = new Schema<IQuickReply>(
  {
    text: { type: String, required: true },
    category: { type: String, default: "general" },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
    isFavorite: { type: Boolean, default: false },
    usageCount: { type: Number, default: 0 },
    brand: { type: String, default: "default" },
  },
  { timestamps: true }
);

QuickReplySchema.index({ brand: 1, isFavorite: -1, order: 1 });

module.exports = mongoose.model<IQuickReply>("QuickReply", QuickReplySchema);
