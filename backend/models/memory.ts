import mongoose, { Schema, Document } from "mongoose";

export interface UserFact extends Document {
  userFact: string;
  updatedTime: Date;
}

const userSchema = new Schema<UserFact>({
  userFact: { type: String, required: true },
  updatedTime: { type: Date, default: Date.now }
});

export const UserMemory = mongoose.model<UserFact>("UserMemory", userSchema);