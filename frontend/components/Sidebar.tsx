"use client";
import React, { useState, useEffect } from 'react';
import {
    PlusIcon,
    MagnifyingGlassIcon,
    Cog6ToothIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    Bars3Icon
} from '@heroicons/react/24/outline';
import {
    CpuChipIcon,
    SparklesIcon,
    BoltIcon
} from '@heroicons/react/24/solid';
import ConversationItem from './ConversationItem';
import axios from 'axios';

type Conversation = {
    _id: string;
    title: string;
    createdAt: string;
    messageCount?: number;
};

interface SidebarProps {
    activeConversationId: string | null;
    setActiveConversationId: (id: string | null) => void;
    selectedModel: 'deepseek' | 'gemini' | 'openai';
    setSelectedModel: (model: 'deepseek' | 'gemini' | 'openai') => void;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

const modelConfig = {
    deepseek: {
        name: 'DeepSeek',
        icon: CpuChipIcon,
        color: 'text-white',
        bgColor: 'bg-gradient-to-r from-gray-800 to-gray-700',
        description: 'Advanced reasoning'
    },
    gemini: {
        name: 'Gemini',
        icon: SparklesIcon,
        color: 'text-white',
        bgColor: 'bg-gradient-to-r from-gray-800 to-gray-700',
        description: 'Multimodal AI'
    },
    openai: {
        name: 'OpenAI',
        icon: BoltIcon,
        color: 'text-white',
        bgColor: 'bg-gradient-to-r from-gray-800 to-gray-700',
        description: 'Creative & versatile'
    }
};

const Sidebar = ({
                     activeConversationId,
                     setActiveConversationId,
                     selectedModel,
                     setSelectedModel,
                     isCollapsed = false,
                     onToggleCollapse
                 }: SidebarProps) => {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [hoveredModel, setHoveredModel] = useState<string | null>(null);

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:9000';

    useEffect(() => {
        fetchConversations();
    }, []);

    const fetchConversations = async () => {
        try {
            setIsLoading(true);
            const { data } = await axios.get(`${backendUrl}/api/conversations`);
            setConversations(data.conversations || []);
        } catch (error) {
            console.error('Error fetching conversations:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const createNewConversation = async () => {
        if (isCreating) return;

        try {
            setIsCreating(true);
            const { data } = await axios.post(`${backendUrl}/api/conversations`, {
                title: 'New Conversation'
            });

            if (data.conversation) {
                setConversations(prev => [data.conversation, ...prev]);
                setActiveConversationId(data.conversation._id);
            }
        } catch (error) {
            console.error('Error creating conversation:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const deleteConversation = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();

        try {
            await axios.delete(`${backendUrl}/api/conversations/${id}`);
            setConversations(prev => prev.filter(conv => conv._id !== id));
            if (activeConversationId === id) {
                setActiveConversationId(null);
            }
        } catch (error) {
            console.error('Error deleting conversation:', error);
            throw error;
        }
    };

    const renameConversation = async (id: string, newTitle: string) => {
        try {
            await axios.patch(`${backendUrl}/api/conversations/${id}`, {
                title: newTitle
            });
            setConversations(prev =>
                prev.map(conv =>
                    conv._id === id ? { ...conv, title: newTitle } : conv
                )
            );
        } catch (error) {
            console.error('Error renaming conversation:', error);
        }
    };

    const filteredConversations = conversations.filter(conv =>
        conv.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const groupedConversations = {
        today: filteredConversations.filter(conv => {
            const date = new Date(conv.createdAt);
            const today = new Date();
            return date.toDateString() === today.toDateString();
        }),
        yesterday: filteredConversations.filter(conv => {
            const date = new Date(conv.createdAt);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return date.toDateString() === yesterday.toDateString();
        }),
        thisWeek: filteredConversations.filter(conv => {
            const date = new Date(conv.createdAt);
            const today = new Date();
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            return date >= weekAgo && date.toDateString() !== today.toDateString() && date.toDateString() !== yesterday.toDateString();
        }),
        older: filteredConversations.filter(conv => {
            const date = new Date(conv.createdAt);
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            return date < weekAgo;
        })
    };

    const CurrentModelIcon = modelConfig[selectedModel].icon;

    if (isCollapsed) {
        return (
            <div className="w-16 bg-black border-r border-gray-800 flex flex-col h-full">
                <div className="p-3 border-b border-gray-800">
                    <button
                        onClick={onToggleCollapse}
                        className="w-full flex items-center justify-center p-2 rounded-lg hover:bg-gray-900 transition-all duration-200"
                    >
                        <Bars3Icon className="h-6 w-6 text-white" />
                    </button>
                </div>
                <div className="p-3">
                    <button
                        onClick={createNewConversation}
                        disabled={isCreating}
                        className="w-full flex items-center justify-center p-2 rounded-lg bg-white text-black hover:bg-gray-200 transition-all duration-200 disabled:opacity-50"
                    >
                        {isCreating ? (
                            <div className="h-5 w-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <PlusIcon className="h-5 w-5" />
                        )}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-80 bg-black text-white flex flex-col h-full border-r border-gray-800 shadow-2xl">
            {/* Header */}
            <div className="p-6 border-b border-gray-800">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                            <div className="w-4 h-4 bg-black rounded-sm"></div>
                        </div>
                        <h1 className="text-xl font-bold tracking-tight">
                            NeuraMCP
                        </h1>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={onToggleCollapse}
                            className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-900 transition-all duration-200"
                        >
                            <Bars3Icon className="h-5 w-5" />
                        </button>
                        <button className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-gray-900 transition-all duration-200">
                            <Cog6ToothIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* New Conversation Button */}
                <button
                    onClick={createNewConversation}
                    disabled={isCreating}
                    className="w-full flex items-center justify-center gap-3 bg-white text-black hover:bg-gray-100 py-4 px-6 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                    {isCreating ? (
                        <div className="h-5 w-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <PlusIcon className="h-5 w-5" />
                    )}
                    <span>New Conversation</span>
                </button>
            </div>

            {/* Model Selection */}
            <div className="p-6 border-b border-gray-800">
                <div className="relative">
                    <button
                        onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                        className="w-full flex items-center justify-between bg-gray-900 hover:bg-gray-800 py-4 px-5 rounded-xl transition-all duration-200 border border-gray-700 hover:border-gray-600"
                    >
                        <div className="flex items-center space-x-4">
                            <div className="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-800 rounded-lg flex items-center justify-center">
                                <CurrentModelIcon className="h-5 w-5 text-white" />
                            </div>
                            <div className="text-left">
                                <div className="font-semibold text-white">{modelConfig[selectedModel].name}</div>
                                <div className="text-sm text-gray-400">{modelConfig[selectedModel].description}</div>
                            </div>
                        </div>
                        {isModelDropdownOpen ? (
                            <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                        ) : (
                            <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                        )}
                    </button>

                    {isModelDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-10 overflow-hidden">
                            {Object.entries(modelConfig).map(([key, config]) => {
                                const IconComponent = config.icon;
                                const isSelected = selectedModel === key;
                                const isHovered = hoveredModel === key;

                                return (
                                    <button
                                        key={key}
                                        onClick={() => {
                                            setSelectedModel(key as 'deepseek' | 'gemini' | 'openai');
                                            setIsModelDropdownOpen(false);
                                        }}
                                        onMouseEnter={() => setHoveredModel(key)}
                                        onMouseLeave={() => setHoveredModel(null)}
                                        className={`w-full flex items-center space-x-4 px-5 py-4 transition-all duration-200 ${
                                            isSelected
                                                ? 'bg-gray-800 border-l-4 border-white'
                                                : isHovered
                                                    ? 'bg-gray-800'
                                                    : 'hover:bg-gray-800'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                                            isSelected ? 'bg-white' : 'bg-gray-700'
                                        }`}>
                                            <IconComponent className={`h-4 w-4 ${isSelected ? 'text-black' : 'text-white'}`} />
                                        </div>
                                        <div className="text-left flex-1">
                                            <div className={`font-medium ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                                                {config.name}
                                            </div>
                                            <div className="text-sm text-gray-400">{config.description}</div>
                                        </div>
                                        {isSelected && (
                                            <div className="w-2 h-2 bg-white rounded-full"></div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Search */}
            <div className="p-6 border-b border-gray-800">
                <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search conversations..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-gray-900 text-white pl-12 pr-4 py-4 rounded-xl border border-gray-700 focus:outline-none focus:border-white focus:ring-2 focus:ring-white focus:ring-opacity-20 transition-all duration-200 placeholder-gray-400"
                    />
                </div>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex items-center justify-center p-12">
                        <div className="flex flex-col items-center space-y-4">
                            <div className="h-8 w-8 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-gray-400 text-sm">Loading conversations...</p>
                        </div>
                    </div>
                ) : filteredConversations.length === 0 ? (
                    <div className="p-8 text-center">
                        <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <PlusIcon className="h-8 w-8 text-gray-400" />
                        </div>
                        <p className="text-gray-400 text-lg mb-2">
                            {searchQuery ? 'No conversations found' : 'No conversations yet'}
                        </p>
                        <p className="text-gray-500 text-sm">
                            {searchQuery ? 'Try a different search term' : 'Start your first conversation'}
                        </p>
                    </div>
                ) : (
                    <div className="py-4">
                        {groupedConversations.today.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-6 mb-3">
                                    Today
                                </h3>
                                <ul className="space-y-1">
                                    {groupedConversations.today.map(conv => (
                                        <ConversationItem
                                            key={conv._id}
                                            conversation={conv}
                                            isActive={activeConversationId === conv._id}
                                            onSelect={setActiveConversationId}
                                            onDelete={deleteConversation}
                                            onRename={renameConversation}
                                        />
                                    ))}
                                </ul>
                            </div>
                        )}

                        {groupedConversations.yesterday.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-6 mb-3">
                                    Yesterday
                                </h3>
                                <ul className="space-y-1">
                                    {groupedConversations.yesterday.map(conv => (
                                        <ConversationItem
                                            key={conv._id}
                                            conversation={conv}
                                            isActive={activeConversationId === conv._id}
                                            onSelect={setActiveConversationId}
                                            onDelete={deleteConversation}
                                            onRename={renameConversation}
                                        />
                                    ))}
                                </ul>
                            </div>
                        )}

                        {groupedConversations.thisWeek.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-6 mb-3">
                                    This Week
                                </h3>
                                <ul className="space-y-1">
                                    {groupedConversations.thisWeek.map(conv => (
                                        <ConversationItem
                                            key={conv._id}
                                            conversation={conv}
                                            isActive={activeConversationId === conv._id}
                                            onSelect={setActiveConversationId}
                                            onDelete={deleteConversation}
                                            onRename={renameConversation}
                                        />
                                    ))}
                                </ul>
                            </div>
                        )}

                        {groupedConversations.older.length > 0 && (
                            <div className="mb-6">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-6 mb-3">
                                    Older
                                </h3>
                                <ul className="space-y-1">
                                    {groupedConversations.older.map(conv => (
                                        <ConversationItem
                                            key={conv._id}
                                            conversation={conv}
                                            isActive={activeConversationId === conv._id}
                                            onSelect={setActiveConversationId}
                                            onDelete={deleteConversation}
                                            onRename={renameConversation}
                                        />
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sidebar;