import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

interface MCPServerConfig {
    name: string;
    command: string;
    args: string[];
    description: string;
}

export class MCPClientManager {
    private clients: Map<string, Client> = new Map();
    private transports: Map<string, StdioClientTransport> = new Map();

    async connectServer(config: MCPServerConfig): Promise<void> {
        try {
            const transport = new StdioClientTransport({
                command: config.command,
                args: config.args,
            });

            const client = new Client(
                {
                    name: "neura-mcp-agent",
                    version: "1.0.0",
                },
                {
                    capabilities: {
                        tools: {},
                    },
                }
            );

            await client.connect(transport);

            this.clients.set(config.name, client);
            this.transports.set(config.name, transport);

            console.log(`Connected to MCP server: ${config.name}`);
        } catch (error) {
            console.error(`Failed to connect to ${config.name}:`, error);
            throw error;
        }
    }

    async disconnectServer(serverName: string): Promise<void> {
        const client = this.clients.get(serverName);
        const transport = this.transports.get(serverName);

        if (client && transport) {
            await client.close();
            this.clients.delete(serverName);
            this.transports.delete(serverName);
            console.log(`Disconnected from MCP server: ${serverName}`);
        }
    }

    async listTools(serverName: string): Promise<any[]> {
        try {
            const client = this.clients.get(serverName);
            if (!client) {
                throw new Error(`No client found for server: ${serverName}`);
            }

            // Add proper protocol handling with error timeout
            const response = await Promise.race([
                client.listTools(),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Connection to ${serverName} timed out`)), 5000)
                )
            ]) as any;

            // Properly handle null/undefined responses
            if (!response) {
                console.warn(`Received empty response from ${serverName}`);
                return [];
            }

            return response.tools || [];
        } catch (error) {
            console.error(`Error listing tools from ${serverName}:`, error);
            return [];
        }
    }

    async callTool(serverName: string, toolName: string, args: any): Promise<any> {
        const client = this.clients.get(serverName);
        if (!client) {
            throw new Error(`Server ${serverName} not connected`);
        }

        const response = await client.request(
            {
                method: "tools/call",
                params: {
                    name: toolName,
                    arguments: args,
                },
            },
            CallToolRequestSchema
        );

        return response;
    }

    getConnectedServers(): string[] {
        return Array.from(this.clients.keys());
    }

    async disconnectAll(): Promise<void> {
        const disconnectPromises = Array.from(this.clients.keys()).map(
            serverName => this.disconnectServer(serverName)
        );
        await Promise.all(disconnectPromises);
    }
}