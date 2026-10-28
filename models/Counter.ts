import mongoose, { Schema } from "mongoose";
import { ICounter } from "../types/models";

const CounterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
  available_seqs: { type: [Number], default: [] },
});

module.exports = mongoose.model<ICounter>("Counter", CounterSchema);
