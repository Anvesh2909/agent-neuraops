import { MCPClientManager } from '../mcp/MCPClientManager';
import { UserMemory, UserFact } from '../models/memory';
import { ChatMessage } from '../models/chatMessage';
import { Types } from 'mongoose';
import {
    generateResponse,
    retryWithBackoff,
    GenerateResponseOptions
} from './engine';
import * as path from 'path';

export interface MCPExecutionContext {
    userName: string;
    conversationId: string;
    provider?: 'deepseek' | 'openai' | 'gemini';
}

export interface MCPToolResult {
    server: string;
    tool: string;
    args: any;
    result: any;
    executionTime: number;
    success: boolean;
    error?: string;
    timestamp: Date;
}

interface MCPCommand {
    server: string;
    tool: string;
    args: any;
}

interface CompactToolResult {
    server: string;
    tool: string;
    success: boolean;
    timestamp: Date;
    // Store only essential data, not full results
    resultSummary?: string;
}

export class MCPService {
    private mcpManager: MCPClientManager;
    // Use compact history to reduce memory usage
    private executionHistory: Map<string, CompactToolResult[]> = new Map();
    private activeConnections: Set<string> = new Set();
    private readonly MAX_RETRIES = 3;
    private readonly MAX_HISTORY_PER_USER = 50; // Reduced from 100
    private readonly MAX_RESULT_SIZE = 1024; // Max size for result summaries
    private readonly MEMORY_CLEANUP_INTERVAL = 300000; // 5 minutes
    private cleanupTimer?: NodeJS.Timeout;

    constructor() {
        this.mcpManager = new MCPClientManager();
        this.startMemoryCleanup();
    }

    private startMemoryCleanup(): void {
        this.cleanupTimer = setInterval(() => {
            this.performMemoryCleanup();
        }, this.MEMORY_CLEANUP_INTERVAL);
    }

    private performMemoryCleanup(): void {
        try {
            // Clean up old execution history
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours

            for (const [userName, history] of this.executionHistory.entries()) {
                const filtered = history.filter(
                    item => now - item.timestamp.getTime() < maxAge
                );

                if (filtered.length !== history.length) {
                    this.executionHistory.set(userName, filtered);
                }

                // Remove empty entries
                if (filtered.length === 0) {
                    this.executionHistory.delete(userName);
                }
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            console.log(`🧹 Memory cleanup completed. Active users: ${this.executionHistory.size}`);
        } catch (error) {
            console.error('Memory cleanup failed:', error);
        }
    }

    async initialize(): Promise<void> {
        const servers = [
            {
                name: 'filesystem',
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
                description: 'File system operations'
            }
        ];

        let connectionsMade = 0;
        const connectionPromises = servers.map(async (server) => {
            try {
                await retryWithBackoff(
                    async () => this.mcpManager.connectServer(server),
                    2
                );
                this.activeConnections.add(server.name);
                connectionsMade++;
                console.log(`✅ MCP Server connected: ${server.name}`);
            } catch (error: any) {
                console.warn(`⚠️ Failed to connect to ${server.name}:`, error.message);
            }
        });

        await Promise.allSettled(connectionPromises);
        console.log(`🚀 MCP Service initialized with ${connectionsMade}/${servers.length} servers`);

        if (connectionsMade === 0) {
            console.warn("⚠️ Warning: No MCP servers were successfully connected");
        }
    }

    async executeWithContext(
        naturalLanguagePrompt: string,
        context: MCPExecutionContext
    ): Promise<MCPToolResult[]> {
        try {
            const parsedCommands = await this.parseCommandWithContext(
                naturalLanguagePrompt,
                context
            );

            const results: MCPToolResult[] = [];

            for (const command of parsedCommands) {
                const toolStartTime = Date.now();

                try {
                    if (!this.activeConnections.has(command.server)) {
                        throw new Error(`Server ${command.server} not connected`);
                    }

                    const result = await retryWithBackoff(
                        async () => this.mcpManager.callTool(
                            command.server,
                            command.tool,
                            command.args
                        ),
                        this.MAX_RETRIES
                    );

                    const toolResult: MCPToolResult = {
                        server: command.server,
                        tool: command.tool,
                        args: this.sanitizeArgs(command.args),
                        result: this.truncateResult(result),
                        executionTime: Date.now() - toolStartTime,
                        success: true,
                        timestamp: new Date()
                    };

                    results.push(toolResult);
                    this.addToUserHistoryCompact(context.userName, toolResult);

                } catch (error: any) {
                    const toolResult: MCPToolResult = {
                        server: command.server,
                        tool: command.tool,
                        args: this.sanitizeArgs(command.args),
                        result: null,
                        executionTime: Date.now() - toolStartTime,
                        success: false,
                        error: error.message?.substring(0, 500) || 'Unknown error',
                        timestamp: new Date()
                    };

                    results.push(toolResult);
                    this.addToUserHistoryCompact(context.userName, toolResult);
                }
            }

            // Update user memory asynchronously to avoid blocking
            setImmediate(() => {
                this.updateUserMemoryFromExecution(context.userName, results)
                    .catch(error => console.error('Memory update failed:', error));
            });

            return results;

        } catch (error: any) {
            console.error('MCP execution failed:', error);
            throw error;
        }
    }

    private sanitizeArgs(args: any): any {
        if (!args) return args;

        // Create a clean copy without circular references
        try {
            const sanitized = JSON.parse(JSON.stringify(args));

            // Truncate large string values
            const truncateStrings = (obj: any): any => {
                if (typeof obj === 'string') {
                    return obj.length > 500 ? obj.substring(0, 500) + '...' : obj;
                }
                if (Array.isArray(obj)) {
                    return obj.map(truncateStrings);
                }
                if (obj && typeof obj === 'object') {
                    const result: any = {};
                    for (const [key, value] of Object.entries(obj)) {
                        result[key] = truncateStrings(value);
                    }
                    return result;
                }
                return obj;
            };

            return truncateStrings(sanitized);
        } catch (error) {
            return { sanitized: true, originalType: typeof args };
        }
    }

    private truncateResult(result: any): any {
        if (!result) return result;

        try {
            const str = JSON.stringify(result);
            if (str.length <= this.MAX_RESULT_SIZE) {
                return result;
            }

            // Return truncated string representation
            return {
                truncated: true,
                summary: str.substring(0, this.MAX_RESULT_SIZE) + '...',
                originalSize: str.length
            };
        } catch (error) {
            return { error: 'Result serialization failed', type: typeof result };
        }
    }

    async parseCommandWithContext(
        prompt: string,
        context: MCPExecutionContext
    ): Promise<MCPCommand[]> {
        try {
            const availableTools = await this.getAvailableToolsForUser();
            const userHistory = this.getUserHistoryCompact(context.userName);

            // Use a more focused prompt to reduce memory usage
            const parsingPrompt = `Convert this request to MCP commands:
"${prompt.substring(0, 500)}"

Available tools: ${JSON.stringify(availableTools)}
Recent commands: ${JSON.stringify(userHistory.slice(-2))}

Return JSON array of commands:`;

            const options: GenerateResponseOptions = {
                prompt: parsingPrompt,
                conversationId: context.conversationId,
                provider: context.provider || 'deepseek',
                maxTokens: 512, // Reduced from 1024
                temperature: 0.3
            };

            const llmResponse = await generateResponse(options);
            const jsonMatch = llmResponse.match(/\[[\s\S]*?\]/);

            if (!jsonMatch) {
                return [];
            }

            const commands = JSON.parse(jsonMatch[0]) as MCPCommand[];
            return commands.slice(0, 5); // Limit to 5 commands max

        } catch (error: any) {
            console.error('Failed to parse commands:', error.message);
            return [];
        }
    }

    private addToUserHistoryCompact(userName: string, result: MCPToolResult): void {
        if (!this.executionHistory.has(userName)) {
            this.executionHistory.set(userName, []);
        }

        const userHistory = this.executionHistory.get(userName)!;

        // Create compact version
        const compactResult: CompactToolResult = {
            server: result.server,
            tool: result.tool,
            success: result.success,
            timestamp: result.timestamp,
            resultSummary: result.success && result.result
                ? JSON.stringify(result.result).substring(0, 100)
                : undefined
        };

        userHistory.push(compactResult);

        // Keep only recent entries
        if (userHistory.length > this.MAX_HISTORY_PER_USER) {
            userHistory.splice(0, userHistory.length - this.MAX_HISTORY_PER_USER);
        }
    }

    getUserHistoryCompact(userName: string): CompactToolResult[] {
        return this.executionHistory.get(userName) || [];
    }

    // Legacy method for compatibility
    getUserHistory(userName: string): MCPToolResult[] {
        const compact = this.getUserHistoryCompact(userName);
        return compact.map(c => ({
            server: c.server,
            tool: c.tool,
            args: {},
            result: c.resultSummary || null,
            executionTime: 0,
            success: c.success,
            timestamp: c.timestamp
        }));
    }

    async getAvailableToolsForUser(): Promise<Record<string, any[]>> {
        const tools: Record<string, any[]> = {};

        for (const serverName of this.activeConnections) {
            try {
                const serverTools = await this.mcpManager.listTools(serverName);
                // Truncate tool descriptions to prevent memory bloat
                tools[serverName] = serverTools.map((tool: any) => ({
                    ...tool,
                    description: tool.description?.substring(0, 200) || ''
                }));
            } catch (error) {
                console.error(`Failed to list tools for ${serverName}:`, error);
                tools[serverName] = [];
            }
        }

        return tools;
    }

    private async updateUserMemoryFromExecution(
        userName: string,
        results: MCPToolResult[]
    ): Promise<void> {
        try {
            const successfulResults = results.filter(r => r.success);
            if (successfulResults.length === 0) return;

            const memory = await this.getUserMemory(userName);
            const recentDirectories = this.extractRecentDirectories(successfulResults);
            const toolStats = this.extractToolUsageStats(successfulResults);

            // Limit facts to prevent memory bloat
            const facts: string[] = [];

            if (recentDirectories.length > 0) {
                facts.push(`Directories: ${recentDirectories.slice(0, 3).join(', ')}`);
            }

            if (Object.keys(toolStats).length > 0) {
                const topTools = Object.entries(toolStats)
                    .slice(0, 3)
                    .map(([tool, count]) => `${tool}(${count})`)
                    .join(', ');
                facts.push(`Tools: ${topTools}`);
            }

            if (facts.length > 0) {
                // Use more efficient string operations
                memory.userFact = this.updateMemorySectionContentEfficient(
                    memory.userFact,
                    'Recent Activity',
                    facts.slice(0, 3)
                );

                memory.updatedTime = new Date();
                await memory.save();
            }
        } catch (error: any) {
            console.error('Failed to update user memory:', error.message);
        }
    }

    private updateMemorySectionContentEfficient(
        content: string,
        section: string,
        facts: string[]
    ): string {
        if (!content || facts.length === 0) return content;

        const formattedFacts = facts.map(fact => `- ${fact}`).join('\n');
        const sectionHeader = `## ${section}`;

        // More efficient string manipulation
        const lines = content.split('\n');
        const sectionIndex = lines.findIndex(line => line.trim() === sectionHeader);

        if (sectionIndex !== -1) {
            // Replace existing section
            const nextSectionIndex = lines.findIndex(
                (line, i) => i > sectionIndex && line.startsWith('## ')
            );

            const beforeSection = lines.slice(0, sectionIndex + 1);
            const afterSection = nextSectionIndex !== -1 ? lines.slice(nextSectionIndex) : [];

            return [
                ...beforeSection,
                formattedFacts,
                '',
                ...afterSection
            ].join('\n');
        } else {
            // Add new section at the end
            return `${content}\n\n${sectionHeader}\n${formattedFacts}\n`;
        }
    }

    private extractRecentDirectories(results: MCPToolResult[]): string[] {
        const directories = new Set<string>();

        for (const result of results) {
            if (result.server === 'filesystem' && result.args?.path) {
                const filePath = result.args.path;
                if (typeof filePath === 'string') {
                    const dir = path.dirname(filePath);
                    if (dir && dir !== '.' && dir !== '/') {
                        directories.add(path.basename(dir));
                    }
                }
            }

            // Limit to prevent memory issues
            if (directories.size >= 5) break;
        }

        return Array.from(directories);
    }

    private extractToolUsageStats(results: MCPToolResult[]): Record<string, number> {
        const stats: Record<string, number> = {};

        for (const result of results) {
            const key = `${result.server}.${result.tool}`;
            stats[key] = (stats[key] || 0) + 1;

            // Limit to prevent memory issues
            if (Object.keys(stats).length >= 10) break;
        }

        return stats;
    }

    async getUserMemory(userName: string): Promise<UserFact> {
        try {
            // Use more efficient query
            const memory = await UserMemory.findOne({
                userFact: { $regex: `User Profile: ${userName}`, $options: 'i' }
            }).select('userFact updatedTime').lean();

            if (!memory) {
                const newMemory = new UserMemory({
                    userFact: `# User Profile: ${userName}\n\n## Personal Information\n- Name: ${userName}\n\n## Recent Activity\n\n## Preferences\n`,
                    updatedTime: new Date()
                });
                return await newMemory.save();
            }

            return new UserMemory(memory);
        } catch (error: any) {
            console.error('Error fetching user memory:', error.message);
            throw error;
        }
    }

    async getServerHealth(): Promise<Record<string, boolean>> {
        const health: Record<string, boolean> = {};

        for (const serverName of this.activeConnections) {
            try {
                const tools = await this.mcpManager.listTools(serverName);
                health[serverName] = Array.isArray(tools);
            } catch (error) {
                health[serverName] = false;
            }
        }

        return health;
    }

    // Cleanup method
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        this.executionHistory.clear();
        this.activeConnections.clear();

        console.log('🧹 MCPService cleanup completed');
    }
}