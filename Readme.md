# NeuraMCP - Advanced AI Assistant Platform

NeuraMCP is a powerful AI assistant platform that integrates multiple language models (DeepSeek, Gemini, and OpenAI) with memory capabilities and terminal access. It provides an intuitive interface for managing conversations and executing system commands.

## Key Features

- **Multi-Model Support**: Switch between DeepSeek, Gemini, and OpenAI models
- **Terminal Integration**: Execute commands directly from the chat interface
- **Memory System**: Persistent memory to maintain context about the user
- **Conversation Management**: Create, rename, and organize conversations
- **Responsive UI**: Modern interface with dark mode design

## Project Structure

```
├── backend/
│   ├── models/
│   │   ├── chatMessage.ts
│   │   ├── conversation.ts
│   │   ├── memory.ts
│   │   ├── memoryUpdateLog.ts
│   │   └── mcpPreference.ts
│   ├── services/
│   │   └── engine.ts
│   └── ...
├── frontend/
│   ├── components/
│   │   ├── ConversationItem.tsx
│   │   ├── Sidebar.tsx
│   │   └── ...
│   └── ...
└── ...
```

## Setup Instructions

### Prerequisites

- Node.js 16.x or higher
- MongoDB 4.x or higher
- API keys for DeepSeek, Gemini, and/or OpenAI

### Backend Setup

1. Navigate to the backend directory and install dependencies:
   ```
   cd backend
   npm install
   ```

2. Create a `.env` file in the backend directory with the following:
   ```
   # MongoDB
   MONGODB_URI=mongodb://localhost:27017/neuramcp
   
   # API Keys
   DEEPSEEK_API_KEY=your_deepseek_api_key
   GEMINI_API_KEY=your_gemini_api_key
   OPENAI_API_KEY=your_openai_api_key
   
   # Server
   PORT=9000
   
   
   # Terminal Settings
   FILE_SYSTEM_BASE_DIR=/home/username
   MAX_COMMAND_TIMEOUT=30000
   ```

3. Start the backend server:
   ```
   nodemon server.ts
   ```

### Frontend Setup

1. Navigate to the frontend directory and install dependencies:
   ```
   cd frontend
   npm install
   ```

2. Create a `.env.local` file in the frontend directory with the following:
   ```
   NEXT_PUBLIC_BACKEND_URL=http://localhost:9000
   ```

3. Start the frontend development server:
   ```
   npm run dev
   ```

## Usage

1. Access the application at `http://localhost:3000`
2. Create a new conversation using the "New Conversation" button
3. Select your preferred AI model from the dropdown
4. Start chatting with the AI assistant
5. Use the sidebar to manage conversations

## Terminal Command Execution

The AI can execute terminal commands using the following formats:

### JSON Format (for complex operations):
```terminal
{
  "operation": "execute|interactive|kill|list_processes",
  "command": "your_command_here",
  "workingDir": "/path/to/working/directory",
  "timeout": 30000,
  "env": {"ENV_VAR": "value"},
  "processId": "proc_id_for_kill_operation"
}
```

### Simple Format (for basic commands):
```bash
ls -la
pwd
whoami
```

## Security Considerations

- Terminal commands have safety checks to prevent dangerous operations
- Working directory validation prevents access outside allowed directories
- Process timeouts prevent system resource exhaustion

## Contributing

Contributions are welcome. Please feel free to submit a Pull Request.