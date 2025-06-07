// frontend/components/ConversationItem.tsx
"use client";
import React, { useState, useRef, useEffect } from 'react';
import {
    EllipsisHorizontalIcon,
    PencilIcon,
    TrashIcon,
    CheckIcon,
    XMarkIcon,
    ChatBubbleLeftIcon
} from '@heroicons/react/24/outline';

type Conversation = {
    _id: string;
    title: string;
    createdAt: string;
    messageCount?: number;
};

interface ConversationItemProps {
    conversation: Conversation;
    isActive: boolean;
    onSelect: (id: string) => void;
    onDelete: (id: string, e: React.MouseEvent) => Promise<void>;
    onRename: (id: string, newTitle: string) => Promise<void>;
}

const ConversationItem = ({
                              conversation,
                              isActive,
                              onSelect,
                              onDelete,
                              onRename
                          }: ConversationItemProps) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(conversation.title);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleSelect = () => {
        if (!isEditing) {
            onSelect(conversation._id);
        }
    };

    const handleRename = async () => {
        if (editTitle.trim() && editTitle.trim() !== conversation.title) {
            try {
                await onRename(conversation._id, editTitle.trim());
            } catch (error) {
                console.error('Error renaming conversation:', error);
                setEditTitle(conversation.title);
            }
        } else {
            setEditTitle(conversation.title);
        }
        setIsEditing(false);
        setIsMenuOpen(false);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDeleting(true);
        try {
            await onDelete(conversation._id, e);
        } catch (error) {
            console.error('Error deleting conversation:', error);
        } finally {
            setIsDeleting(false);
            setIsMenuOpen(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRename();
        } else if (e.key === 'Escape') {
            setEditTitle(conversation.title);
            setIsEditing(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

        if (diffInHours < 1) {
            const diffInMinutes = Math.floor(diffInHours * 60);
            return diffInMinutes <= 1 ? 'Just now' : `${diffInMinutes}m ago`;
        } else if (diffInHours < 24) {
            return `${Math.floor(diffInHours)}h ago`;
        } else {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
            });
        }
    };

    return (
        <div
            className={`relative group transition-all duration-200 mx-3 ${
                isActive
                    ? 'bg-gray-900 border-l-4 border-white rounded-r-xl'
                    : isHovered
                        ? 'bg-gray-900 rounded-xl'
                        : 'hover:bg-gray-900 rounded-xl'
            }`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                onClick={handleSelect}
                className="flex items-center justify-between p-4 cursor-pointer"
            >
                <div className="flex items-center space-x-3 flex-1 min-w-0">
                    {/* Conversation Icon */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
                        isActive
                            ? 'bg-white text-black'
                            : 'bg-gray-800 text-gray-400 group-hover:bg-gray-700 group-hover:text-white'
                    }`}>
                        <ChatBubbleLeftIcon className="h-4 w-4" />
                    </div>

                    {/* Conversation Details */}
                    <div className="flex-1 min-w-0">
                        {isEditing ? (
                            <div className="flex items-center space-x-2">
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={editTitle}
                                    onChange={(e) => setEditTitle(e.target.value)}
                                    onKeyPress={handleKeyPress}
                                    onBlur={handleRename}
                                    className="flex-1 bg-gray-800 text-white text-sm font-medium rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50"
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRename();
                                    }}
                                    className="text-green-400 hover:text-green-300 p-1"
                                >
                                    <CheckIcon className="h-3 w-3" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setEditTitle(conversation.title);
                                        setIsEditing(false);
                                    }}
                                    className="text-red-400 hover:text-red-300 p-1"
                                >
                                    <XMarkIcon className="h-3 w-3" />
                                </button>
                            </div>
                        ) : (
                            <>
                                <h3 className={`text-sm font-medium truncate transition-colors duration-200 ${
                                    isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'
                                }`}>
                                    {conversation.title}
                                </h3>
                                <div className="flex items-center space-x-2 mt-1">
                                    <span className={`text-xs transition-colors duration-200 ${
                                        isActive ? 'text-gray-300' : 'text-gray-400 group-hover:text-gray-300'
                                    }`}>
                                        {formatDate(conversation.createdAt)}
                                    </span>
                                    {conversation.messageCount && conversation.messageCount > 0 && (
                                        <>
                                            <span className={`text-xs transition-colors duration-200 ${
                                                isActive ? 'text-gray-400' : 'text-gray-500 group-hover:text-gray-400'
                                            }`}>
                                                •
                                            </span>
                                            <span className={`text-xs transition-colors duration-200 ${
                                                isActive ? 'text-gray-300' : 'text-gray-400 group-hover:text-gray-300'
                                            }`}>
                                                {conversation.messageCount} messages
                                            </span>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Menu Button */}
                {!isEditing && (isHovered || isActive || isMenuOpen) && (
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsMenuOpen(!isMenuOpen);
                            }}
                            className={`p-2 rounded-lg transition-all duration-200 ${
                                isMenuOpen
                                    ? 'bg-gray-700 text-white'
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                            }`}
                        >
                            <EllipsisHorizontalIcon className="h-4 w-4" />
                        </button>

                        {/* Dropdown Menu */}
                        {isMenuOpen && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl z-50 overflow-hidden">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setIsEditing(true);
                                        setIsMenuOpen(false);
                                    }}
                                    className="w-full flex items-center space-x-3 px-4 py-3 text-left text-gray-300 hover:bg-gray-700 hover:text-white transition-colors duration-200"
                                >
                                    <PencilIcon className="h-4 w-4" />
                                    <span className="text-sm font-medium">Rename</span>
                                </button>

                                <div className="border-t border-gray-700"></div>

                                <button
                                    onClick={handleDelete}
                                    disabled={isDeleting}
                                    className="w-full flex items-center space-x-3 px-4 py-3 text-left text-red-400 hover:bg-red-500 hover:text-white transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isDeleting ? (
                                        <>
                                            <div className="h-4 w-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin"></div>
                                            <span className="text-sm font-medium">Deleting...</span>
                                        </>
                                    ) : (
                                        <>
                                            <TrashIcon className="h-4 w-4" />
                                            <span className="text-sm font-medium">Delete</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Active Indicator */}
            {isActive && (
                <div className="absolute left-0 top-0 w-1 h-full bg-white rounded-r-full"></div>
            )}
        </div>
    );
};

export default ConversationItem;