"use client";
import React, { useState } from 'react';
import { TrashIcon, PencilIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { ChatBubbleLeftIcon } from '@heroicons/react/24/solid';

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
    onDelete: (id: string, e: React.MouseEvent) => void;
    onRename?: (id: string, newTitle: string) => void;
}

const ConversationItem = ({
                              conversation,
                              isActive,
                              onSelect,
                              onDelete,
                              onRename
                          }: ConversationItemProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(conversation.title);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleRename = () => {
        if (editTitle.trim() && editTitle !== conversation.title && onRename) {
            onRename(conversation._id, editTitle.trim());
        }
        setIsEditing(false);
        setEditTitle(conversation.title);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditTitle(conversation.title);
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDeleting(true);

        try {
            await onDelete(conversation._id, e);
        } finally {
            setIsDeleting(false);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return date.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        }
    };

    return (
        <li
            onClick={() => !isEditing && onSelect(conversation._id)}
            className={`group relative px-3 py-3 mx-2 mb-1 rounded-lg cursor-pointer transition-all duration-200 ${
                isActive
                    ? 'bg-gray-800 border-l-4 border-blue-500'
                    : 'hover:bg-gray-800/50'
            } ${isDeleting ? 'opacity-50' : ''}`}
        >
            <div className="flex items-start space-x-3">
                {/* Chat Icon */}
                <div className="flex-shrink-0 mt-0.5">
                    <ChatBubbleLeftIcon className="h-4 w-4 text-gray-400" />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {isEditing ? (
                        <div className="flex items-center space-x-2">
                            <input
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRename();
                                    if (e.key === 'Escape') handleCancelEdit();
                                }}
                                className="flex-1 bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
                                autoFocus
                                maxLength={50}
                            />
                            <button
                                onClick={handleRename}
                                className="text-green-400 hover:text-green-300 p-1"
                            >
                                <CheckIcon className="h-4 w-4" />
                            </button>
                            <button
                                onClick={handleCancelEdit}
                                className="text-red-400 hover:text-red-300 p-1"
                            >
                                <XMarkIcon className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-medium text-white truncate pr-2">
                                    {conversation.title}
                                </h3>
                                <span className="text-xs text-gray-400 flex-shrink-0">
                                    {formatDate(conversation.createdAt)}
                                </span>
                            </div>

                            {conversation.messageCount !== undefined && (
                                <p className="text-xs text-gray-500 mt-1">
                                    {conversation.messageCount} messages
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* Action Buttons */}
                {!isEditing && (
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {onRename && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsEditing(true);
                                }}
                                className="text-gray-400 hover:text-blue-400 p-1 rounded transition-colors"
                                title="Rename conversation"
                            >
                                <PencilIcon className="h-4 w-4" />
                            </button>
                        )}

                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="text-gray-400 hover:text-red-400 p-1 rounded transition-colors disabled:opacity-50"
                            title="Delete conversation"
                        >
                            {isDeleting ? (
                                <div className="h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <TrashIcon className="h-4 w-4" />
                            )}
                        </button>
                    </div>
                )}
            </div>
        </li>
    );
};

export default ConversationItem;