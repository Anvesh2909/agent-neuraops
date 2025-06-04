import { exec, spawn, ChildProcess } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);

interface CommandResult {
    success: boolean;
    output: string;
    error?: string;
    executionTime: number;
    command: string;
    pid?: number;
}

interface CommandOptions {
    timeout?: number;
    cwd?: string;
    env?: Record<string, string | undefined>;
    shell?: boolean | string;
    background?: boolean;
    sudo?: boolean;
    interactive?: boolean;
    continueOnError?: boolean;
}

class UnifiedCommandExecutor {
    private runningProcesses: Map<string, ChildProcess> = new Map();
    private commandHistory: CommandResult[] = [];
    private maxHistorySize = 1000;

    /**
     * Execute any system command with comprehensive error handling and logging
     */
    async execute(
        command: string,
        options: CommandOptions = {}
    ): Promise<CommandResult> {
        const startTime = Date.now();
        const {
            timeout = 30000,
            cwd = process.cwd(),
            env = { ...process.env } as Record<string, string | undefined>,
            shell = true,
            background = false,
            sudo = false,
            interactive = false
        } = options;

        // Sanitize and prepare command
        let finalCommand = command.trim();
        if (sudo && !finalCommand.startsWith('sudo')) {
            finalCommand = `sudo ${finalCommand}`;
        }

        const result: CommandResult = {
            success: false,
            output: '',
            command: finalCommand,
            executionTime: 0
        };

        try {
            // Log command execution
            console.log(`🔧 Executing: ${finalCommand}`);
            console.log(`📁 Working Directory: ${cwd}`);

            if (background) {
                return await this.executeBackground(finalCommand, {
                    cwd,
                    env: env as Record<string, string>,
                    shell
                });
            }

            if (interactive) {
                return await this.executeInteractive(finalCommand, {
                    cwd,
                    env: env as Record<string, string>
                });
            }

            // Standard execution
            const { stdout, stderr } = await execAsync(finalCommand, {
                timeout,
                cwd,
                env: env as Record<string, string>,
                maxBuffer: 1024 * 1024 * 10 // 10MB buffer
            });

            result.success = true;
            result.output = stdout;
            if (stderr && stderr.trim()) {
                result.output += `\n[STDERR]: ${stderr}`;
            }

        } catch (error: any) {
            result.success = false;
            result.error = error.message;
            result.output = error.stdout || '';

            if (error.stderr) {
                result.output += `\n[ERROR]: ${error.stderr}`;
            }

            // Don't throw for non-zero exit codes, just log them
            if (error.code) {
                result.output += `\n[EXIT CODE]: ${error.code}`;
            }
        }

        result.executionTime = Date.now() - startTime;
        this.addToHistory(result);

        return result;
    }

    /**
     * Execute command in background and return immediately
     */
    private async executeBackground(
        command: string,
        options: { cwd: string; env: Record<string, string>; shell: boolean | string }
    ): Promise<CommandResult> {
        const startTime = Date.now();

        return new Promise((resolve) => {
            const child = spawn(command, [], {
                cwd: options.cwd,
                env: options.env,
                shell: options.shell,
                detached: true,
                stdio: 'pipe'
            });

            const processId = `bg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            this.runningProcesses.set(processId, child);

            let output = '';

            child.stdout?.on('data', (data) => {
                output += data.toString();
            });

            child.stderr?.on('data', (data) => {
                output += `[STDERR]: ${data.toString()}`;
            });

            child.on('spawn', () => {
                resolve({
                    success: true,
                    output: `Process started in background with PID: ${child.pid}\nProcess ID: ${processId}`,
                    command,
                    executionTime: Date.now() - startTime,
                    pid: child.pid
                });
            });

            child.on('error', (error) => {
                this.runningProcesses.delete(processId);
                resolve({
                    success: false,
                    output: '',
                    error: error.message,
                    command,
                    executionTime: Date.now() - startTime
                });
            });

            // Detach the process so it continues running
            child.unref();
        });
    }

    /**
     * Execute interactive command (for commands that need user input)
     */
    private async executeInteractive(
        command: string,
        options: { cwd: string; env: Record<string, string> }
    ): Promise<CommandResult> {
        const startTime = Date.now();

        return new Promise((resolve) => {
            const child = spawn(command, [], {
                cwd: options.cwd,
                env: options.env,
                shell: true,
                stdio: 'inherit' // Inherit parent's stdio for interaction
            });

            child.on('close', (code) => {
                resolve({
                    success: code === 0,
                    output: `Interactive command completed with exit code: ${code}`,
                    command,
                    executionTime: Date.now() - startTime
                });
            });

            child.on('error', (error) => {
                resolve({
                    success: false,
                    output: '',
                    error: error.message,
                    command,
                    executionTime: Date.now() - startTime
                });
            });
        });
    }

    /**
     * Kill a background process
     */
    async killProcess(processId: string): Promise<CommandResult> {
        const process = this.runningProcesses.get(processId);

        if (!process) {
            return {
                success: false,
                output: '',
                error: `Process ${processId} not found`,
                command: `kill ${processId}`,
                executionTime: 0
            };
        }

        try {
            process.kill('SIGTERM');
            this.runningProcesses.delete(processId);

            return {
                success: true,
                output: `Process ${processId} terminated successfully`,
                command: `kill ${processId}`,
                executionTime: 0
            };
        } catch (error: any) {
            return {
                success: false,
                output: '',
                error: error.message,
                command: `kill ${processId}`,
                executionTime: 0
            };
        }
    }

    /**
     * List all running background processes
     */
    listProcesses(): string[] {
        return Array.from(this.runningProcesses.keys());
    }

    /**
     * Get system information
     */
    async getSystemInfo(): Promise<CommandResult> {
        const info = {
            platform: os.platform(),
            arch: os.arch(),
            hostname: os.hostname(),
            uptime: os.uptime(),
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            cpus: os.cpus().length,
            nodeVersion: process.version,
            cwd: process.cwd(),
            user: os.userInfo().username
        };

        return {
            success: true,
            output: JSON.stringify(info, null, 2),
            command: 'system_info',
            executionTime: 0
        };
    }

    /**
     * Add command result to history
     */
    private addToHistory(result: CommandResult): void {
        this.commandHistory.push(result);

        // Keep history size manageable
        if (this.commandHistory.length > this.maxHistorySize) {
            this.commandHistory = this.commandHistory.slice(-this.maxHistorySize);
        }
    }

    /**
     * Get command history
     */
    getHistory(limit: number = 10): CommandResult[] {
        return this.commandHistory.slice(-limit);
    }

    /**
     * Clear command history
     */
    clearHistory(): void {
        this.commandHistory = [];
    }

    /**
     * Execute multiple commands in sequence
     */
    async executeSequence(commands: string[], options: CommandOptions = {}): Promise<CommandResult[]> {
        const results: CommandResult[] = [];

        for (const command of commands) {
            const result = await this.execute(command, options);
            results.push(result);

            // Stop on first failure unless explicitly continuing
            if (!result.success && !options.continueOnError) {
                break;
            }
        }

        return results;
    }

    /**
     * Execute commands in parallel
     */
    async executeParallel(commands: string[], options: CommandOptions = {}): Promise<CommandResult[]> {
        const promises = commands.map(command => this.execute(command, options));
        return Promise.all(promises);
    }

    /**
     * Test if a command exists
     */
    async commandExists(command: string): Promise<boolean> {
        try {
            const testCommand = os.platform() === 'win32'
                ? `where ${command}`
                : `which ${command}`;

            const result = await this.execute(testCommand);
            return result.success;
        } catch {
            return false;
        }
    }

    /**
     * Execute with real-time output streaming
     */
    async executeWithStreaming(
        command: string,
        onData: (data: string) => void,
        options: CommandOptions = {}
    ): Promise<CommandResult> {
        const startTime = Date.now();
        const {
            cwd = process.cwd(),
            env = { ...process.env } as Record<string, string | undefined>
        } = options;

        return new Promise((resolve) => {
            const child = spawn(command, [], {
                cwd,
                env: env as Record<string, string>,
                shell: true,
                stdio: 'pipe'
            });

            let output = '';
            let error = '';

            child.stdout?.on('data', (data) => {
                const chunk = data.toString();
                output += chunk;
                onData(chunk);
            });

            child.stderr?.on('data', (data) => {
                const chunk = data.toString();
                error += chunk;
                onData(`[STDERR]: ${chunk}`);
            });

            child.on('close', (code) => {
                const result: CommandResult = {
                    success: code === 0,
                    output: output + (error ? `\n[STDERR]: ${error}` : ''),
                    error: code !== 0 ? `Process exited with code ${code}` : undefined,
                    command,
                    executionTime: Date.now() - startTime
                };

                this.addToHistory(result);
                resolve(result);
            });

            child.on('error', (err) => {
                const result: CommandResult = {
                    success: false,
                    output: output,
                    error: err.message,
                    command,
                    executionTime: Date.now() - startTime
                };

                this.addToHistory(result);
                resolve(result);
            });
        });
    }
}

// Create singleton instance
const commandExecutor = new UnifiedCommandExecutor();

/**
 * Main execution interface for AI commands
 */
export async function executeCommand(
    commandString: string,
    options: CommandOptions = {}
): Promise<string> {
    try {
        // Parse command string for special operations
        const command = commandString.trim();

        // Handle special commands
        if (command.startsWith('sys:info')) {
            const result = await commandExecutor.getSystemInfo();
            return formatCommandResult(result);
        }

        if (command.startsWith('sys:history')) {
            const limit = parseInt(command.split(' ')[1]) || 10;
            const history = commandExecutor.getHistory(limit);
            return `📋 **Command History (Last ${limit}):**\n` +
                history.map((h, i) => `${i + 1}. ${h.command} (${h.success ? '✅' : '❌'})`).join('\n');
        }

        if (command.startsWith('sys:processes')) {
            const processes = commandExecutor.listProcesses();
            return `🔄 **Background Processes:** ${processes.length > 0 ? processes.join(', ') : 'None'}`;
        }

        if (command.startsWith('sys:kill ')) {
            const processId = command.split(' ')[1];
            const result = await commandExecutor.killProcess(processId);
            return formatCommandResult(result);
        }

        // Handle command sequences (commands separated by &&)
        if (command.includes(' && ')) {
            const commands = command.split(' && ').map(c => c.trim());
            const results = await commandExecutor.executeSequence(commands, options);
            return results.map(formatCommandResult).join('\n\n---\n\n');
        }

        // Handle parallel commands (commands separated by &)
        if (command.includes(' & ') && !command.includes(' && ')) {
            const commands = command.split(' & ').map(c => c.trim());
            const results = await commandExecutor.executeParallel(commands, options);
            return results.map(formatCommandResult).join('\n\n---\n\n');
        }

        // Execute single command
        const result = await commandExecutor.execute(command, options);
        return formatCommandResult(result);

    } catch (error: any) {
        return `❌ **Execution Error:** ${error.message}`;
    }
}

/**
 * Format command result for display
 */
function formatCommandResult(result: CommandResult): string {
    const status = result.success ? '✅' : '❌';
    const time = result.executionTime > 0 ? ` (${result.executionTime}ms)` : '';

    let output = `${status} **Command:** \`${result.command}\`${time}\n`;

    if (result.output && result.output.trim()) {
        output += `**Output:**\n\`\`\`\n${result.output.trim()}\n\`\`\`\n`;
    }

    if (result.error) {
        output += `**Error:** ${result.error}\n`;
    }

    if (result.pid) {
        output += `**Process ID:** ${result.pid}\n`;
    }

    return output;
}

/**
 * Enhanced prompt system with direct command execution
 */
export function enhancePromptWithCommandExecution(originalPrompt: string): string {
    return originalPrompt.replace(
        '### System Operations:',
        `### System Operations:

**🚀 DIRECT COMMAND LINE ACCESS:**
You now have direct access to the system command line through a unified execution interface. Use this format:

\`\`\`execute-command
{
  "command": "your_command_here",
  "options": {
    "timeout": 30000,
    "cwd": "/path/to/directory",
    "background": false,
    "sudo": false,
    "interactive": false
  }
}
\`\`\`

**Command Examples:**
- \`ls -la\` - List directory contents
- \`npm install package-name\` - Install packages
- \`git status\` - Check git status
- \`docker ps\` - List running containers
- \`python script.py\` - Run Python scripts
- \`node server.js &\` - Run Node.js in background
- \`curl -X GET https://api.example.com\` - Make HTTP requests
- \`grep -r "search term" .\` - Search files
- \`ps aux | grep node\` - Find processes
- \`systemctl status service-name\` - Check service status

**Special Commands:**
- \`sys:info\` - Get system information
- \`sys:history [limit]\` - Show command history
- \`sys:processes\` - List background processes
- \`sys:kill <process-id>\` - Kill background process

**Command Chaining:**
- \`command1 && command2\` - Sequential execution (stop on failure)
- \`command1 & command2\` - Parallel execution

**Command Options:**
- \`timeout\`: Maximum execution time (ms)
- \`cwd\`: Working directory
- \`background\`: Run in background
- \`sudo\`: Run with elevated privileges
- \`interactive\`: For commands requiring user input

### System Operations:`
    );
}

// Export the command executor for direct use
export { commandExecutor, UnifiedCommandExecutor };
export type { CommandResult, CommandOptions };