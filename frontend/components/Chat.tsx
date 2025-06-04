// frontend/components/Chat.tsx
"use client";
import React, { useState, useEffect, useRef } from 'react';
import {
    PaperAirplaneIcon,
    StopIcon,
    ArrowPathIcon,
    ClipboardDocumentIcon,
    SpeakerWaveIcon,
    SpeakerXMarkIcon
} from '@heroicons/react/24/solid';
import {
    SparklesIcon,
    LightBulbIcon,
    CodeBracketIcon,
    DocumentTextIcon
} from '@heroicons/react/24/outline';
import MessageItem from './MessageItem';
import axios from 'axios';

type Message = {
    _id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: string;
    isTyping?: boolean;
};

interface ChatProps {
    conversationId: string | null;
    selectedModel: 'deepseek' | 'gemini' | 'openai';
}

const suggestedPrompts = [
    {
        icon: SparklesIcon,
        title: "Creative Ideas",
        prompt: "Help me brainstorm creative ideas for..."
    },
    {
        icon: CodeBracketIcon,
        title: "Code Assistant",
        prompt: "Help me write code for..."
    },
    {
        icon: DocumentTextIcon,
        title: "Write Content",
        prompt: "Help me write professional content for..."
    },
    {
        icon: LightBulbIcon,
        title: "Problem Solving",
        prompt: "Help me solve this problem..."
    }
];

const Chat = ({ conversationId, selectedModel }: ChatProps) => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isTyping, setIsTyping] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:9000';

    useEffect(() => {
        if (conversationId) {
            fetchMessages();
        } else {
            setMessages([]);
        }
    }, [conversationId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        adjustTextareaHeight();
    }, [prompt]);

    const fetchMessages = async () => {
        if (!conversationId) return;

        try {
            const { data } = await axios.get(`${backendUrl}/api/conversations/${conversationId}`);
            if (data.messages) {
                setMessages(data.messages);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
        }
    };

    const adjustTextareaHeight = () => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = '20px';
            const scrollHeight = Math.min(textarea.scrollHeight, 200);
            textarea.style.height = `${scrollHeight}px`;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim() || isLoading) return;

        const userMessage = prompt.trim();
        setPrompt('');

        // Optimistically add user message
        const tempUserMsg = {
            _id: Date.now().toString(),
            role: 'user' as const,
            content: userMessage,
            createdAt: new Date().toISOString()
        };

        setMessages(prev => [...prev, tempUserMsg]);
        setIsLoading(true);
        setIsTyping(true);

        // Add typing indicator
        const typingMsg = {
            _id: 'typing',
            role: 'assistant' as const,
            content: '',
            createdAt: new Date().toISOString(),
            isTyping: true
        };
        setMessages(prev => [...prev, typingMsg]);

        try {
            const { data } = await axios.post(`${backendUrl}/api/generate-response`, {
                prompt: userMessage,
                model: selectedModel,
                conversationId
            });

            // Remove typing indicator and add real response
            setMessages(prev => prev.filter(msg => msg._id !== 'typing'));

            if (data.response) {
                const assistantMsg = {
                    _id: (Date.now() + 1).toString(),
                    role: 'assistant' as const,
                    content: data.response,
                    createdAt: new Date().toISOString()
                };

                setMessages(prev => [...prev, assistantMsg]);

                if (!conversationId && data.conversationId) {
                    window.history.pushState(null, '', `?id=${data.conversationId}`);
                }
            }
        } catch (error) {
            console.error('Error generating response:', error);
            setMessages(prev => prev.filter(msg => msg._id !== 'typing'));

            // Add error message
            const errorMsg = {
                _id: 'error-' + Date.now().toString(),
                role: 'assistant' as const,
                content: 'Sorry, I encountered an error while processing your request. Please try again.',
                createdAt: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
            setIsTyping(false);
        }
    };

    const handleSuggestedPrompt = (suggestedPrompt: string) => {
        setPrompt(suggestedPrompt);
        textareaRef.current?.focus();
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const stopGeneration = () => {
        setIsLoading(false);
        setIsTyping(false);
        setMessages(prev => prev.filter(msg => msg._id !== 'typing'));
    };

    const regenerateResponse = () => {
        if (messages.length > 0) {
            const lastUserMessage = messages
                .slice()
                .reverse()
                .find(msg => msg.role === 'user');

            if (lastUserMessage) {
                setPrompt(lastUserMessage.content);
                // Remove the last assistant message
                setMessages(prev => {
                    const lastAssistantIndex = prev.length - 1;
                    if (prev[lastAssistantIndex]?.role === 'assistant') {
                        return prev.slice(0, -1);
                    }
                    return prev;
                });
            }
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-white">
            {!conversationId ? (
                <div className="flex-1 flex items-center justify-center p-8">
                    <div className="max-w-4xl w-full text-center">
                        {/* Welcome Header */}
                        <div className="mb-12">
                            <div className="w-20 h-20 bg-black rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                                    <div className="w-5 h-5 bg-black rounded-sm"></div>
                                </div>
                            </div>
                            <h1 className="text-4xl font-bold text-black mb-4 tracking-tight">
                                Welcome to NeuraMCP
                            </h1>
                            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto leading-relaxed">
                                Your intelligent AI assistant powered by advanced language models.
                                Start a conversation or choose from the suggestions below.
                            </p>
                        </div>

                        {/* Suggested Prompts */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                            {suggestedPrompts.map((suggestion, index) => {
                                const IconComponent = suggestion.icon;
                                return (
                                    <button
                                        key={index}
                                        onClick={() => handleSuggestedPrompt(suggestion.prompt)}
                                        className="group p-6 bg-gray-50 hover:bg-black border border-gray-200 hover:border-black rounded-2xl transition-all duration-300 text-left shadow-sm hover:shadow-xl transform hover:-translate-y-1"
                                    >
                                        <div className="flex items-start space-x-4">
                                            <div className="w-12 h-12 bg-black group-hover:bg-white rounded-xl flex items-center justify-center transition-all duration-300">
                                                <IconComponent className="h-6 w-6 text-white group-hover:text-black transition-colors duration-300" />
                                            </div>
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-black group-hover:text-white mb-2 transition-colors duration-300">
                                                    {suggestion.title}
                                                </h3>
                                                <p className="text-gray-600 group-hover:text-gray-300 text-sm transition-colors duration-300">
                                                    {suggestion.prompt}
                                                </p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Input Area */}
                        <div className="max-w-3xl mx-auto">
                            <form onSubmit={handleSubmit} className="relative">
                                <div className="relative">
                                    <textarea
                                        ref={textareaRef}
                                        value={prompt}
                                        onChange={e => setPrompt(e.target.value)}
                                        onKeyPress={handleKeyPress}
                                        placeholder="Type your message here... (Press Enter to send, Shift+Enter for new line)"
                                        disabled={isLoading}
                                        className="w-full resize-none border-2 border-gray-200 focus:border-black rounded-2xl px-6 py-4 pr-16 focus:outline-none transition-all duration-200 text-black placeholder-gray-400 shadow-lg focus:shadow-xl bg-white"
                                        style={{ minHeight: '60px', maxHeight: '200px' }}
                                    />
                                    <button
                                        type="submit"
                                        disabled={isLoading || !prompt.trim()}
                                        className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-black text-white rounded-xl px-4 py-2 hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 transition-all duration-200 flex items-center justify-center min-w-[50px] shadow-lg hover:shadow-xl"
                                    >
                                        {isLoading ? (
                                            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <PaperAirplaneIcon className="h-5 w-5" />
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Chat Header */}
                    <div className="border-b border-gray-200 p-6 bg-white">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
                                    <div className="w-5 h-5 bg-white rounded-sm"></div>
                                </div>
                                <div>
                                    <h2 className="font-semibold text-black">NeuraMCP Assistant</h2>
                                    <p className="text-sm text-gray-500">
                                        Powered by {selectedModel.charAt(0).toUpperCase() + selectedModel.slice(1)}
                                        {isTyping && <span className="ml-2 text-green-500">● Typing...</span>}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center space-x-2">
                                {isLoading && (
                                    <button
                                        onClick={stopGeneration}
                                        className="flex items-center space-x-2 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors duration-200"
                                    >
                                        <StopIcon className="h-4 w-4" />
                                        <span className="text-sm font-medium">Stop</span>
                                    </button>
                                )}

                                {messages.length > 0 && !isLoading && (
                                    <button
                                        onClick={regenerateResponse}
                                        className="flex items-center space-x-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors duration-200"
                                    >
                                        <ArrowPathIcon className="h-4 w-4" />
                                        <span className="text-sm font-medium">Regenerate</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto bg-gray-50">
                        {messages.length === 0 ? (
                            <div className="h-full flex items-center justify-center p-8">
                                <div className="text-center">
                                    <div className="w-16 h-16 bg-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                        <SparklesIcon className="h-8 w-8 text-gray-400" />
                                    </div>
                                    <p className="text-gray-500 text-lg mb-2">Ready to chat!</p>
                                    <p className="text-gray-400 text-sm">Send a message to start the conversation</p>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-4xl mx-auto py-8">
                                <div className="space-y-8">
                                    {messages.map(message => (
                                        <MessageItem
                                            key={message._id}
                                            message={message}
                                            isTyping={message.isTyping}
                                        />
                                    ))}
                                    <div ref={messagesEndRef} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="border-t border-gray-200 bg-white p-6">
                        <div className="max-w-4xl mx-auto">
                            <form onSubmit={handleSubmit} className="relative">
                                <div className="flex items-end space-x-4">
                                    <div className="flex-1 relative">
                                        <textarea
                                            ref={textareaRef}
                                            value={prompt}
                                            onChange={e => setPrompt(e.target.value)}
                                            onKeyPress={handleKeyPress}
                                            placeholder="Type your message here... (Press Enter to send, Shift+Enter for new line)"
                                            disabled={isLoading}
                                            className="w-full resize-none border-2 border-gray-200 focus:border-black rounded-xl px-4 py-3 focus:outline-none transition-all duration-200 text-black placeholder-gray-400 bg-white"
                                            style={{ minHeight: '20px', maxHeight: '150px' }}
                                        />
                                    </div>

                                    <div className="flex items-center space-x-2">
                                        {/* Voice Input Button */}
                                        <button
                                            type="button"
                                            onClick={() => setIsListening(!isListening)}
                                            className={`p-3 rounded-xl transition-all duration-200 ${
                                                isListening
                                                    ? 'bg-red-500 text-white hover:bg-red-600'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            {isListening ? (
                                                <SpeakerXMarkIcon className="h-5 w-5" />
                                            ) : (
                                                <SpeakerWaveIcon className="h-5 w-5" />
                                            )}
                                        </button>

                                        {/* Send Button */}
                                        <button
                                            type="submit"
                                            disabled={isLoading || !prompt.trim()}
                                            className="bg-black text-white rounded-xl px-6 py-3 hover:bg-gray-800 disabled:bg-gray-300 disabled:text-gray-500 transition-all duration-200 flex items-center justify-center min-w-[60px] shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:transform-none"
                                        >
                                            {isLoading ? (
                                                <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            ) : (
                                                <PaperAirplaneIcon className="h-5 w-5" />
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Input Footer */}
                                <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                                    <div className="flex items-center space-x-4">
                                        <span>Press Enter to send • Shift+Enter for new line</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <span>{prompt.length} characters</span>
                                        {prompt.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setPrompt('')}
                                                className="text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Chat;