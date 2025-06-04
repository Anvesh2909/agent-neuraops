"use client";
import React, { useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Chat from '@/components/Chat';

const Page = () => {
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [selectedModel, setSelectedModel] = useState<'deepseek' | 'gemini' | 'openai'>('deepseek');

    return (
        <div className="flex h-screen bg-gray-50">
            <Sidebar
                activeConversationId={activeConversationId}
                setActiveConversationId={setActiveConversationId}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
            />
            <Chat
                conversationId={activeConversationId}
                selectedModel={selectedModel}
            />
        </div>
    );
};

export default Page;