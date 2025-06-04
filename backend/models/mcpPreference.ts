import mongoose, { Schema, Document } from "mongoose";

export interface MCPPreferencesDocument extends Document {
    workingDirectory: string;
    preferredTools: string[];
    recentDirectories: string[];
    toolUsageStats: Record<string, number>;
    lastActivity: Date;
}

const mcpPreferencesSchema = new Schema<MCPPreferencesDocument>({
    workingDirectory: { type: String, default: process.cwd() },
    preferredTools: [{ type: String }],
    recentDirectories: [{ type: String }],
    toolUsageStats: { type: Schema.Types.Mixed, default: {} },
    lastActivity: { type: Date, default: Date.now }
});

export const MCPPreferences = mongoose.model<MCPPreferencesDocument>("MCPPreferences", mcpPreferencesSchema);