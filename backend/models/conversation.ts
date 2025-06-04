import mongoose from "mongoose";

export interface Conversation extends Document {
    title: string;
    createdAt: Date;
}

const ConversationSchema = new mongoose.Schema<Conversation>({
    title: { type: String, default: "Untitled" },
    createdAt: { type: Date, default: Date.now }
});

export const Conversation = mongoose.model("Conversation", ConversationSchema);