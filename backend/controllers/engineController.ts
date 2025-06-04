import { Response, Request } from "express";
import { generateResponseDeepseek, generateResponseGemini, generateResponseOpenAI } from "../services/engine";
import { Conversation } from "../models/conversation";
import { ChatMessage } from "../models/chatMessage";
import mongoose from "mongoose";

export async function generateResponseController(req: Request, res: Response): Promise<void> {
    const { prompt, model } = req.body;
    let { conversationId } = req.body;
    if (!model || !["deepseek", "gemini", "openai"].includes(model)) {
        res.status(400).json({ error: "Invalid or missing model. Use 'deepseek', 'gemini', or 'openai'." });
        return;
    }
    if (!prompt) {
        res.status(400).json({ error: "Prompt is required" });
        return;
    }
    try {
        if (!conversationId) {
            const newConversation = await Conversation.create({
                title: prompt.substring(0, 30) + (prompt.length > 30 ? "..." : "")
            });
            conversationId = newConversation._id.toString();
        } else if (!mongoose.Types.ObjectId.isValid(conversationId)) {
            res.status(400).json({ error: "Invalid conversationId format" });
            return;
        }

        let response: string;
        if (model === "gemini") {
            response = await generateResponseGemini(prompt, conversationId);
        } else if (model === "deepseek") {
            response = await generateResponseDeepseek(prompt, conversationId);
        } else {
            response = await generateResponseOpenAI(prompt, conversationId);
        }
        res.status(200).json({
            response,
            conversationId
        });

    } catch (error) {
        console.error("Error generating response:", error);
        res.status(500).json({ error: "Failed to generate response" });
    }
}

export async function getConversationsController(req: Request, res: Response): Promise<void> {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const conversations = await Conversation.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Conversation.countDocuments();

        res.status(200).json({
            conversations,
            pagination: {
                total,
                page,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Error fetching conversations:", error);
        res.status(500).json({ error: "Failed to fetch conversations" });
    }
}

export async function getConversationMessagesController(req: Request, res: Response): Promise<void> {
    try {
        const { conversationId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
            res.status(400).json({ error: "Invalid conversationId format" });
            return;
        }

        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            res.status(404).json({ error: "Conversation not found" });
            return;
        }

        const messages = await ChatMessage.find({ conversationId: new mongoose.Types.ObjectId(conversationId) })
            .sort({ createdAt: 1 });

        res.status(200).json({
            conversation,
            messages
        });
    } catch (error) {
        console.error("Error fetching conversation messages:", error);
        res.status(500).json({ error: "Failed to fetch conversation messages" });
    }
}
export async function deleteConversationController(req: Request, res: Response): Promise<void> {
    try {
        const { conversationId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(conversationId)) {
            res.status(400).json({ error: "Invalid conversationId format" });
            return;
        }
        const conversation = await Conversation.findById(conversationId);

        if (!conversation) {
            res.status(404).json({ error: "Conversation not found" });
            return;
        }
        await ChatMessage.deleteMany({ conversationId: new mongoose.Types.ObjectId(conversationId) });
        await Conversation.findByIdAndDelete(conversationId);

        res.status(200).json({
            success: true,
            message: "Conversation and its messages deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting conversation:", error);
        res.status(500).json({ error: "Failed to delete conversation" });
    }
}

export async function createConversationController(req: Request, res: Response): Promise<void> {
    try {
        const { title } = req.body;
        const newConversation = await Conversation.create({
            title: title || "New Conversation"
        });
        res.status(201).json({
            success: true,
            conversation: newConversation
        });
    } catch (error) {
        console.error("Error creating conversation:", error);
        res.status(500).json({ error: "Failed to create conversation" });
    }
}