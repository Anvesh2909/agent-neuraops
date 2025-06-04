import mongoose, {Schema, Document, Types, Mongoose} from "mongoose";

export interface ChatMessageDocument extends Document {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  conversationId: Types.ObjectId;
}

const chatMessageSchema = new Schema<ChatMessageDocument>({
  role: { type: String, enum: ["user", "assistant"], required: true },
  content: { type: String, required: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
  createdAt: { type: Date, default: Date.now }
});

export const ChatMessage = mongoose.model<ChatMessageDocument>("ChatMessage", chatMessageSchema);