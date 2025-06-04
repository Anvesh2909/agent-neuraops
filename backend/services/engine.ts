import { OpenAI } from 'openai';
import { GoogleGenAI } from "@google/genai";
import { UserMemory, UserFact } from "../models/memory";
import { ChatMessage, ChatMessageDocument } from "../models/chatMessage";
import { Types } from "mongoose";
import { spawn, exec, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import * as os from 'os';


interface TerminalCommand {
    operation: 'execute' | 'interactive' | 'background' | 'kill' | 'list_processes';
    command?: string;
    args?: string[];
    workingDir?: string;
    timeout?: number;
    env?: Record<string, string>;
    processId?: string;
    interactive?: boolean;
}

interface TerminalResult {
    success: boolean;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    executionTime: number;
    processId?: string;
    workingDir: string;
}

interface MemoryUpdate {
    section: 'Personal Information' | 'Preferences' | 'Technical Skills' | 'Interests' | 'Recent Topics' | 'Projects';
    facts: string[];
    action?: 'append' | 'replace' | 'merge';
}

interface AIResponse {
    reply: string;
    terminalResults: TerminalResult[];
    memoryUpdated: boolean;
    executionTime: number;
}

interface GenerateResponseOptions {
    prompt: string;
    conversationId: string;
    provider?: 'deepseek' | 'openai' | 'gemini';
    maxTokens?: number;
    temperature?: number;
}

interface FileCommand {
    operation: 'read' | 'write' | 'append' | 'delete' | 'list' | 'exists' | 'mkdir';
    path: string;
    content?: string;
    encoding?: BufferEncoding;
}

// Configuration
const TERMINAL_BASE_DIR = process.env.TERMINAL_BASE_DIR || os.homedir();
const MAX_COMMAND_TIMEOUT = 30000; // 30 seconds
const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB
const CACHE_TTL = 60 * 1000; // 1 minute cache
const MAX_RETRIES = 3;

// Active processes tracking
const activeProcesses = new Map<string, ChildProcess>();
let processCounter = 0;

// Dangerous commands that require confirmation
const DANGEROUS_COMMANDS = [
    'rm -rf /',
    'mkfs',
    'dd if=',
    'shutdown',
    'reboot',
    'halt',
    'init 0',
    'init 6',
    ':(){ :|:& };:',
    'chmod -R 777 /',
    'chown -R root /'
];

// Security: Command validation
function validateCommand(command: string): { safe: boolean; reason?: string } {
    const lowerCommand = command.toLowerCase().trim();

    // Check for dangerous commands
    for (const dangerous of DANGEROUS_COMMANDS) {
        if (lowerCommand.includes(dangerous.toLowerCase())) {
            return { safe: false, reason: `Dangerous command detected: ${dangerous}` };
        }
    }

    // Prevent privilege escalation attempts
    if (lowerCommand.includes('sudo su') || lowerCommand.includes('su -')) {
        return { safe: false, reason: 'Privilege escalation not allowed' };
    }

    // Prevent system modification commands without explicit permission
    const systemCommands = ['passwd', 'usermod', 'userdel', 'groupmod'];
    if (systemCommands.some(cmd => lowerCommand.startsWith(cmd))) {
        return { safe: false, reason: 'System modification commands require explicit permission' };
    }

    return { safe: true };
}

// Security: Working directory validation
function validateWorkingDir(workingDir: string): string {
    try {
        const resolvedPath = path.resolve(workingDir);

        // Ensure we're not going outside user's home directory for sensitive operations
        const homeDir = os.homedir();
        if (!resolvedPath.startsWith(homeDir) && !resolvedPath.startsWith('/tmp') && !resolvedPath.startsWith('/var/tmp')) {
            console.warn(`Warning: Command executing outside home directory: ${resolvedPath}`);
        }

        return resolvedPath;
    } catch (error) {
        throw new Error(`Invalid working directory: ${workingDir}`);
    }
}

// Enhanced terminal command execution
async function executeTerminalCommand(command: string, options: Partial<TerminalCommand> = {}): Promise<TerminalResult> {
    const startTime = Date.now();
    const processId = `proc_${++processCounter}`;

    const {
        workingDir = TERMINAL_BASE_DIR,
        timeout = MAX_COMMAND_TIMEOUT,
        env = {},
        interactive = false
    } = options;

    // Validate command safety
    const validation = validateCommand(command);
    if (!validation.safe) {
        return {
            success: false,
            stdout: '',
            stderr: validation.reason || 'Command not allowed',
            exitCode: -1,
            executionTime: Date.now() - startTime,
            processId,
            workingDir
        };
    }

    const validatedWorkingDir = validateWorkingDir(workingDir);

    try {
        // Ensure working directory exists
        if (!existsSync(validatedWorkingDir)) {
            await fs.mkdir(validatedWorkingDir, { recursive: true });
        }

        if (interactive) {
            return await executeInteractiveCommand(command, validatedWorkingDir, processId, timeout, env);
        } else {
            return await executeNonInteractiveCommand(command, validatedWorkingDir, processId, timeout, env);
        }
    } catch (error: any) {
        return {
            success: false,
            stdout: '',
            stderr: error.message,
            exitCode: -1,
            executionTime: Date.now() - startTime,
            processId,
            workingDir: validatedWorkingDir
        };
    }
}

async function executeNonInteractiveCommand(
    command: string,
    workingDir: string,
    processId: string,
    timeout: number,
    env: Record<string, string>
): Promise<TerminalResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
        const childProcess = exec(command, {
            cwd: workingDir,
            timeout,
            maxBuffer: MAX_OUTPUT_SIZE,
            env: { ...process.env, ...env }
        }, (error, stdout, stderr) => {
            activeProcesses.delete(processId);

            const result: TerminalResult = {
                success: !error || error.code === 0,
                stdout: stdout || '',
                stderr: stderr || (error ? error.message : ''),
                exitCode: error ? (error as any).code || -1 : 0,
                executionTime: Date.now() - startTime,
                processId,
                workingDir
            };

            resolve(result);
        });

        activeProcesses.set(processId, childProcess);

        // Handle timeout
        setTimeout(() => {
            if (activeProcesses.has(processId)) {
                childProcess.kill('SIGTERM');
                setTimeout(() => {
                    if (activeProcesses.has(processId)) {
                        childProcess.kill('SIGKILL');
                    }
                }, 5000);
            }
        }, timeout);
    });
}

async function executeInteractiveCommand(
    command: string,
    workingDir: string,
    processId: string,
    timeout: number,
    env: Record<string, string>
): Promise<TerminalResult> {
    const startTime = Date.now();

    return new Promise((resolve) => {
        const args = command.split(' ');
        const cmd = args.shift()!;

        const childProcess = spawn(cmd, args, {
            cwd: workingDir,
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        childProcess.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        childProcess.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        childProcess.on('close', (code) => {
            activeProcesses.delete(processId);

            const result: TerminalResult = {
                success: code === 0,
                stdout,
                stderr,
                exitCode: code,
                executionTime: Date.now() - startTime,
                processId,
                workingDir
            };

            resolve(result);
        });

        childProcess.on('error', (error) => {
            activeProcesses.delete(processId);

            const result: TerminalResult = {
                success: false,
                stdout,
                stderr: error.message,
                exitCode: -1,
                executionTime: Date.now() - startTime,
                processId,
                workingDir
            };

            resolve(result);
        });

        activeProcesses.set(processId, childProcess);

        // Handle timeout
        setTimeout(() => {
            if (activeProcesses.has(processId)) {
                childProcess.kill('SIGTERM');
                setTimeout(() => {
                    if (activeProcesses.has(processId)) {
                        childProcess.kill('SIGKILL');
                    }
                }, 5000);
            }
        }, timeout);
    });
}

// Process management functions
async function killProcess(processId: string): Promise<string> {
    const process = activeProcesses.get(processId);
    if (!process) {
        return `❌ Process ${processId} not found or already terminated`;
    }

    try {
        process.kill('SIGTERM');
        setTimeout(() => {
            if (activeProcesses.has(processId)) {
                process.kill('SIGKILL');
            }
        }, 5000);

        activeProcesses.delete(processId);
        return `✅ Process ${processId} terminated`;
    } catch (error: any) {
        return `❌ Failed to kill process ${processId}: ${error.message}`;
    }
}

async function listActiveProcesses(): Promise<string> {
    if (activeProcesses.size === 0) {
        return "📋 No active processes";
    }

    const processes = Array.from(activeProcesses.entries()).map(([id, proc]) => {
        return `🔄 ${id}: PID ${proc.pid} (${proc.killed ? 'killed' : 'running'})`;
    });

    return `📋 Active Processes:\n${processes.join('\n')}`;
}

// Enhanced terminal command parsing and execution
async function executeTerminalCommands(responseText: string): Promise<TerminalResult[]> {
    const results: TerminalResult[] = [];
    const terminalCommandRegex = /```(?:terminal|bash|shell|cmd)\s*({[\s\S]*?})\s*```/g;
    const simpleTerminalRegex = /```(?:terminal|bash|shell|cmd)\s*\n([\s\S]*?)\n```/g;

    let match;

    // Handle JSON-formatted terminal commands
    while ((match = terminalCommandRegex.exec(responseText)) !== null) {
        try {
            const jsonStr = match[1].trim();
            const command: TerminalCommand = JSON.parse(jsonStr);

            if (!command.operation) {
                results.push({
                    success: false,
                    stdout: '',
                    stderr: 'Invalid terminal command: missing operation',
                    exitCode: -1,
                    executionTime: 0,
                    workingDir: TERMINAL_BASE_DIR
                });
                continue;
            }

            switch (command.operation.toLowerCase()) {
                case 'execute':
                    if (!command.command) {
                        results.push({
                            success: false,
                            stdout: '',
                            stderr: 'Execute operation requires command',
                            exitCode: -1,
                            executionTime: 0,
                            workingDir: TERMINAL_BASE_DIR
                        });
                        break;
                    }
                    results.push(await executeTerminalCommand(command.command, command));
                    break;

                case 'interactive':
                    if (!command.command) {
                        results.push({
                            success: false,
                            stdout: '',
                            stderr: 'Interactive operation requires command',
                            exitCode: -1,
                            executionTime: 0,
                            workingDir: TERMINAL_BASE_DIR
                        });
                        break;
                    }
                    results.push(await executeTerminalCommand(command.command, { ...command, interactive: true }));
                    break;

                case 'kill':
                    if (!command.processId) {
                        results.push({
                            success: false,
                            stdout: '',
                            stderr: 'Kill operation requires processId',
                            exitCode: -1,
                            executionTime: 0,
                            workingDir: TERMINAL_BASE_DIR
                        });
                        break;
                    }
                    const killResult = await killProcess(command.processId);
                    results.push({
                        success: !killResult.includes('❌'),
                        stdout: killResult,
                        stderr: '',
                        exitCode: killResult.includes('❌') ? -1 : 0,
                        executionTime: 0,
                        workingDir: TERMINAL_BASE_DIR
                    });
                    break;

                case 'list_processes':
                    const listResult = await listActiveProcesses();
                    results.push({
                        success: true,
                        stdout: listResult,
                        stderr: '',
                        exitCode: 0,
                        executionTime: 0,
                        workingDir: TERMINAL_BASE_DIR
                    });
                    break;

                default:
                    results.push({
                        success: false,
                        stdout: '',
                        stderr: `Unknown terminal operation: ${command.operation}`,
                        exitCode: -1,
                        executionTime: 0,
                        workingDir: TERMINAL_BASE_DIR
                    });
            }
        } catch (error: any) {
            results.push({
                success: false,
                stdout: '',
                stderr: `Terminal command error: ${error.message}`,
                exitCode: -1,
                executionTime: 0,
                workingDir: TERMINAL_BASE_DIR
            });
        }
    }

    // Handle simple terminal commands (just the command without JSON)
    while ((match = simpleTerminalRegex.exec(responseText)) !== null) {
        const commands = match[1].trim().split('\n').filter(cmd => cmd.trim() && !cmd.trim().startsWith('#'));

        for (const cmd of commands) {
            const cleanCmd = cmd.trim();
            if (cleanCmd) {
                results.push(await executeTerminalCommand(cleanCmd));
            }
        }
    }

    return results;
}

// AI clients setup with error handling
const createAIClients = () => {
    const clients: any = {};

    try {
        if (process.env.DEEPSEEK_API_KEY) {
            clients.deepseekai = new OpenAI({
                baseURL: 'https://api.deepseek.com',
                apiKey: process.env.DEEPSEEK_API_KEY,
            });
        }

        if (process.env.GEMINI_API_KEY) {
            clients.geminiai = new GoogleGenAI({
                apiKey: process.env.GEMINI_API_KEY
            });
        }

        if (process.env.OPENAI_API_KEY) {
            clients.openai = new OpenAI({
                apiKey: process.env.OPENAI_API_KEY
            });
        }
    } catch (error) {
        console.error('Error initializing AI clients:', error);
    }

    return clients;
};

const { deepseekai, geminiai, openai } = createAIClients();

// Enhanced memory management
const memoryCache = new Map<string, { data: UserFact, timestamp: number }>();

async function saveChats(chats: { role: 'user' | 'assistant', content: string, conversationId: string }[]) {
    if (chats.length === 0) return;

    try {
        return await ChatMessage.insertMany(chats);
    } catch (error) {
        console.error('Error saving chats:', error);
        throw error;
    }
}

function formatMemory(userFact: UserFact): string {
    return userFact.userFact;
}

// Enhanced token estimation
function estimateTokens(text: string): number {
    const words = text.split(/\s+/).length;
    const characters = text.length;
    const wordBasedTokens = words * 0.75;
    const charBasedTokens = characters / 4;
    return Math.ceil(Math.max(wordBasedTokens, charBasedTokens));
}

function limitMessagesByTokens(messages: { role: string, content: string }[], maxTokens = 4000) {
    let totalTokens = 0;
    const result: typeof messages = [];

    const systemMessage = messages.find(msg => msg.role === 'system');
    if (systemMessage) {
        totalTokens += estimateTokens(systemMessage.content);
        result.push(systemMessage);
    }

    const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
    for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
        const tokens = estimateTokens(nonSystemMessages[i].content);
        if (totalTokens + tokens > maxTokens) break;

        result.splice(systemMessage ? 1 : 0, 0, nonSystemMessages[i]);
        totalTokens += tokens;
    }

    return result;
}

async function getUserMemory(userName: string): Promise<UserFact> {
    const cacheKey = `memory_${userName}`;
    const cachedMemory = memoryCache.get(cacheKey);

    if (cachedMemory && Date.now() - cachedMemory.timestamp < CACHE_TTL) {
        return cachedMemory.data;
    }

    try {
        const memory = await UserMemory.findOne({
            userFact: { $regex: userName, $options: 'i' }
        });

        if (!memory) {
            const newMemory = await UserMemory.create({
                userFact: `# User Profile: ${userName}\n\n## Personal Information\n- Name: ${userName}\n- System: Ubuntu 24.04 LTS\n- Shell: ${process.env.SHELL || '/bin/bash'}\n- Home: ${os.homedir()}\n\n## Preferences\n\n## Technical Skills\n\n## Interests\n\n## Recent Topics\n\n## Projects\n`,
                updatedTime: new Date()
            });
            memoryCache.set(cacheKey, { data: newMemory, timestamp: Date.now() });
            return newMemory;
        }

        memoryCache.set(cacheKey, { data: memory, timestamp: Date.now() });
        return memory;
    } catch (error) {
        console.error('Error fetching user memory:', error);
        throw error;
    }
}

async function buildPromptWithMemory(prompt: string, conversationId: string, maxTokens = 6000) {
    const userMemory = await getUserMemory("Anvesh");

    const chatHistory = await ChatMessage.find({
        conversationId: new Types.ObjectId(conversationId)
    })
        .sort({ createdAt: 1 })
        .limit(50) as ChatMessageDocument[];

    const formattedMemory = formatMemory(userMemory);

    // Get system information
    const systemInfo = {
        platform: os.platform(),
        arch: os.arch(),
        release: os.release(),
        hostname: os.hostname(),
        user: os.userInfo().username,
        home: os.homedir(),
        cwd: process.cwd(),
        shell: process.env.SHELL || '/bin/bash'
    };

    const systemPrompt = `You are an advanced personal AI assistant with comprehensive memory capabilities and FULL LINUX TERMINAL ACCESS.

## Your Enhanced Capabilities:
1. **Memory Management**: You maintain detailed user profiles and can update them intelligently
2. **Full Terminal Access**: You can execute ANY Linux command with proper safety checks
3. **Process Management**: You can run background processes, interactive commands, and manage running processes
4. **System Administration**: You can perform system tasks, file operations, network operations, and more
5. **Context Awareness**: You remember conversation history and user preferences
6. **Adaptive Learning**: You continuously learn and adapt to user needs

## System Information:
- Platform: ${systemInfo.platform}
- Architecture: ${systemInfo.arch}
- Release: ${systemInfo.release}
- Hostname: ${systemInfo.hostname}
- User: ${systemInfo.user}
- Home Directory: ${systemInfo.home}
- Current Working Directory: ${systemInfo.cwd}
- Shell: ${systemInfo.shell}

## User Profile:
${formattedMemory}

## Terminal Operations:
Use these formats for terminal operations:

### JSON Format (for complex operations):
\`\`\`terminal
{
  "operation": "execute|interactive|kill|list_processes",
  "command": "your_command_here",
  "workingDir": "/path/to/working/directory",
  "timeout": 30000,
  "env": {"ENV_VAR": "value"},
  "processId": "proc_id_for_kill_operation"
}
\`\`\`

### Simple Format (for basic commands):
\`\`\`bash
ls -la
pwd
whoami
\`\`\`

## Available Operations:
- **execute**: Run a command and wait for completion
- **interactive**: Run interactive commands (like vim, top, htop)
- **kill**: Terminate a running process by ID
- **list_processes**: Show all active processes

## Memory Updates:
When you learn new information about the user, use this format:
\`\`\`json
{
  "memory_update": {
    "section": "Personal Information|Preferences|Technical Skills|Interests|Recent Topics|Projects",
    "facts": ["New fact to remember"],
    "action": "append|replace|merge"
  }
}
\`\`\`

## Safety Features:
- Dangerous commands are automatically blocked
- Process timeouts prevent hanging
- Output size limits prevent system overload
- Working directory validation
- Privilege escalation protection

## Guidelines:
- Provide helpful, personalized responses based on user context and system state
- Use appropriate terminal commands to gather system information when needed
- Be proactive in suggesting system optimizations and improvements
- Always explain what commands will do before executing them
- Use proper error handling and provide clear feedback
- Maintain security and privacy at all times
- Use appropriate emojis and formatting for better readability`;

    const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: prompt }
    ];

    return { messages: limitMessagesByTokens(messages, maxTokens) };
}

// Enhanced memory update function
async function extractAndApplyMemoryUpdate(responseText: string): Promise<boolean> {
    try {
        const memoryUpdateRegex = /```(?:json)?\s*({[\s\S]*?"memory_update"[\s\S]*?})\s*```/;
        const match = responseText.match(memoryUpdateRegex);

        if (!match) return false;

        const jsonStr = match[1].trim();
        const parsed = JSON.parse(jsonStr);

        if (!parsed.memory_update) return false;

        const memory = await getUserMemory("Anvesh");
        const memoryUpdate: MemoryUpdate = parsed.memory_update;

        if (memoryUpdate.section && memoryUpdate.facts && Array.isArray(memoryUpdate.facts)) {
            const section = memoryUpdate.section;
            const facts = memoryUpdate.facts.filter((fact: string) => fact.trim() !== '');

            if (facts.length === 0) return false;

            let content = memory.userFact;
            const existingFacts = content.toLowerCase();
            const newFacts = facts.filter(fact =>
                !existingFacts.includes(fact.toLowerCase().substring(0, 50))
            );

            if (newFacts.length === 0) {
                console.log('No new facts to add - all facts already exist');
                return false;
            }

            const formattedFacts = newFacts.map((fact: string) => `- ${fact}`).join('\n');
            const sectionRegex = new RegExp(`## ${section}\\s*\\n`);
            const sectionMatch = content.match(sectionRegex);

            if (sectionMatch) {
                const action = memoryUpdate.action || 'append';

                if (action === 'replace') {
                    const nextSectionRegex = new RegExp(`(## ${section}\\s*\\n)[\\s\\S]*?(?=\\n## |$)`);
                    content = content.replace(nextSectionRegex, `$1${formattedFacts}\n`);
                } else {
                    const position = sectionMatch.index! + sectionMatch[0].length;
                    const beforeSection = content.substring(0, position);
                    const afterSection = content.substring(position);

                    const nextSectionIndex = afterSection.search(/\n## /);
                    const sectionContent = nextSectionIndex !== -1
                        ? afterSection.substring(0, nextSectionIndex)
                        : afterSection;

                    const newContent = sectionContent.trim()
                        ? `${sectionContent.trim()}\n${formattedFacts}\n`
                        : `${formattedFacts}\n`;

                    content = beforeSection + newContent +
                        (nextSectionIndex !== -1 ? afterSection.substring(nextSectionIndex) : '');
                }
            } else {
                content += `\n## ${section}\n${formattedFacts}\n`;
            }

            memory.userFact = content;
            memory.updatedTime = new Date();

            try {
                await memory.save();
                memoryCache.set(`memory_Anvesh`, { data: memory, timestamp: Date.now() });
                console.log(`✅ Memory updated: ${newFacts.length} new facts in section ${section}`);
                return true;
            } catch (saveError: any) {
                console.error('❌ Memory save failed:', saveError.message);
                return false;
            }
        }

        return false;
    } catch (error: any) {
        console.error('❌ Memory update parsing failed:', error.message);
        return false;
    }
}

// Enhanced AI response processing
async function processAIResponse(reply: string, conversationId: string): Promise<AIResponse> {
    const startTime = Date.now();

    // Execute terminal commands
    const terminalResults = await executeTerminalCommands(reply);

    // Process memory updates
    const memoryUpdated = await extractAndApplyMemoryUpdate(reply);

    // Save the assistant's response
    await saveChats([{ role: "assistant", content: reply, conversationId }]);

    const executionTime = Date.now() - startTime;

    return {
        reply,
        terminalResults,
        memoryUpdated,
        executionTime
    };
}

// Retry mechanism with exponential backoff
async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = MAX_RETRIES,
    baseDelay: number = 1000
): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            if (attempt === maxRetries - 1) {
                throw lastError;
            }

            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`⏳ Retry attempt ${attempt + 1}/${maxRetries} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError!;
}

// Enhanced response generation functions
export async function generateResponseDeepseek(
    prompt: string,
    conversationId: string,
    options: Partial<GenerateResponseOptions> = {}
): Promise<string> {
    if (!deepseekai) {
        throw new Error("DeepSeek API not configured");
    }

    const { maxTokens = 2048, temperature = 0.7 } = options;

    return retryWithBackoff(async () => {
        const { messages } = await buildPromptWithMemory(prompt, conversationId);
        const savePromise = saveChats([{ role: "user", content: prompt, conversationId }]);

        const response = await deepseekai.chat.completions.create({
            model: "deepseek-chat",
            messages: messages as any,
            temperature,
            max_tokens: maxTokens,
        });

        await savePromise;
        const reply = response.choices[0].message.content || "";

        const result = await processAIResponse(reply, conversationId);

        let finalResponse = result.reply;

        if (result.terminalResults.length > 0) {
            finalResponse += '\n\n---\n💻 **Terminal Operations:**\n';
            result.terminalResults.forEach((termResult, index) => {
                finalResponse += `\n**Command ${index + 1}** (${termResult.executionTime}ms):\n`;
                if (termResult.success) {
                    finalResponse += `✅ Exit Code: ${termResult.exitCode}\n`;
                    if (termResult.stdout) {
                        finalResponse += `📤 **Output:**\n\`\`\`\n${termResult.stdout.slice(0, 2000)}${termResult.stdout.length > 2000 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
                    }
                } else {
                    finalResponse += `❌ Exit Code: ${termResult.exitCode}\n`;
                    if (termResult.stderr) {
                        finalResponse += `📤 **Error:**\n\`\`\`\n${termResult.stderr.slice(0, 1000)}${termResult.stderr.length > 1000 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
                    }
                }
                finalResponse += `📁 **Working Directory:** ${termResult.workingDir}\n`;
            });
        }

        if (result.memoryUpdated) {
            finalResponse += '\n\n🧠 *Memory updated with new information*';
        }

        finalResponse += `\n\n⏱️ *Processed in ${result.executionTime}ms*`;

        return finalResponse;
    });
}

export async function generateResponseGemini(
    prompt: string,
    conversationId: string,
    options: Partial<GenerateResponseOptions> = {}
): Promise<string> {
    if (!geminiai) {
        throw new Error("Gemini API not configured");
    }

    const { maxTokens = 2048, temperature = 0.7 } = options;

    return retryWithBackoff(async () => {
        const { messages } = await buildPromptWithMemory(prompt, conversationId);
        const savePromise = saveChats([{ role: "user", content: prompt, conversationId }]);

        const model = geminiai.getGenerativeModel({
            model: "gemini-pro",
            generationConfig: {
                temperature,
                maxOutputTokens: maxTokens,
            }
        });

        const chatSession = model.startChat({
            history: messages.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.content }]
            }))
        });

        const result = await chatSession.sendMessage(prompt);
        const response = await result.response;
        const reply = response.text();

        await savePromise;
        const processedResponse = await processAIResponse(reply, conversationId);

        // Format response with results
        let finalResponse = processedResponse.reply;

        if (processedResponse.terminalResults.length > 0) {
            finalResponse += '\n\n---\n💻 **Terminal Operations:**\n';
            processedResponse.terminalResults.forEach((termResult, index) => {
                finalResponse += `\n**Command ${index + 1}** (${termResult.executionTime}ms):\n`;
                if (termResult.success) {
                    finalResponse += `✅ Exit Code: ${termResult.exitCode}\n`;
                    if (termResult.stdout) {
                        finalResponse += `📤 **Output:**\n\`\`\`\n${termResult.stdout.slice(0, 2000)}${termResult.stdout.length > 2000 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
                    }
                } else {
                    finalResponse += `❌ Exit Code: ${termResult.exitCode}\n`;
                    if (termResult.stderr) {
                        finalResponse += `📤 **Error:**\n\`\`\`\n${termResult.stderr.slice(0, 1000)}${termResult.stderr.length > 1000 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
                    }
                }
                finalResponse += `📁 **Working Directory:** ${termResult.workingDir}\n`;
            });
        }

        if (processedResponse.memoryUpdated) {
            finalResponse += '\n\n🧠 *Memory updated with new information*';
        }

        finalResponse += `\n\n⏱️ *Processed in ${processedResponse.executionTime}ms*`;

        return finalResponse;
    });
}

export async function generateResponseOpenAI(
    prompt: string,
    conversationId: string,
    options: Partial<GenerateResponseOptions> = {}
): Promise<string> {
    if (!openai) {
        throw new Error("OpenAI API not configured");
    }

    const { maxTokens = 2048, temperature = 0.7 } = options;

    return retryWithBackoff(async () => {
        const { messages } = await buildPromptWithMemory(prompt, conversationId);
        const savePromise = saveChats([{ role: "user", content: prompt, conversationId }]);

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: messages as any,
            temperature,
            max_tokens: maxTokens,
        });

        await savePromise;
        const reply = response.choices[0].message.content || "";

        const result = await processAIResponse(reply, conversationId);

        // Format response with results
        let finalResponse = result.reply;

        if (result.terminalResults.length > 0) {
            finalResponse += '\n\n---\n💻 **Terminal Operations:**\n';
            result.terminalResults.forEach((termResult, index) => {
                finalResponse += `\n**Command ${index + 1}** (${termResult.executionTime}ms):\n`;
                if (termResult.success) {
                    finalResponse += `✅ Exit Code: ${termResult.exitCode}\n`;
                    if (termResult.stdout) {
                        finalResponse += `📤 **Output:**\n\`\`\`\n${termResult.stdout.slice(0, 2000)}${termResult.stdout.length > 2000 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
                    }
                } else {
                    finalResponse += `❌ Exit Code: ${termResult.exitCode}\n`;
                    if (termResult.stderr) {
                        finalResponse += `📤 **Error:**\n\`\`\`\n${termResult.stderr.slice(0, 1000)}${termResult.stderr.length > 1000 ? '\n... (truncated)' : ''}\n\`\`\`\n`;
                    }
                }
                finalResponse += `📁 **Working Directory:** ${termResult.workingDir}\n`;
            });
        }

        if (result.memoryUpdated) {
            finalResponse += '\n\n🧠 *Memory updated with new information*';
        }

        finalResponse += `\n\n⏱️ *Processed in ${result.executionTime}ms*`;

        return finalResponse;
    });
}




export async function generateResponse(options: GenerateResponseOptions): Promise<string> {
    const { provider = 'deepseek' } = options;

    switch (provider) {
        case 'deepseek':
            return generateResponseDeepseek(options.prompt, options.conversationId, options);
        case 'openai':
            return generateResponseOpenAI(options.prompt, options.conversationId, options);
        case 'gemini':
            return generateResponseGemini(options.prompt, options.conversationId, options);
        default:
            throw new Error(`Unknown AI provider: ${provider}`);
    }
}



export {
    estimateTokens,
    FileCommand,
    MemoryUpdate,
    AIResponse,
    GenerateResponseOptions
};