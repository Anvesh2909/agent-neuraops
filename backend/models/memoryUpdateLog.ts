import mongoose, { Schema, Document } from "mongoose";

export interface MemoryUpdateLogDocument extends Document {
  type: "add" | "update" | "delete";
  field: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  timestamp: Date;
}

const memoryUpdateLogSchema = new Schema<MemoryUpdateLogDocument>({
  type: { type: String, enum: ["add", "update", "delete"], required: true },
  field: { type: String, required: true },
  oldValue: { type: Schema.Types.Mixed },
  newValue: { type: Schema.Types.Mixed },
  reason: { type: String },
  timestamp: { type: Date, default: Date.now }
});

export const MemoryUpdateLog = mongoose.model<MemoryUpdateLogDocument>("MemoryUpdateLog", memoryUpdateLogSchema);