import mongoose, { Schema } from "mongoose";
import { ISetting } from "../types/models";

const settingSchema = new Schema<ISetting>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    value: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model<ISetting>("Setting", settingSchema);
