"use client";
import React from 'react';

type Message = {
    _id: string;
    role: 'user' | 'assistant';
    content: string;
};

interface MessageItemProps {
    message: Message,
    isTyping?: boolean | undefined
}

const MessageItem = ({message, isTyping}: MessageItemProps) => {
    const formatMarkdown = (content: string) => {
        const parts = content.split(/(```[\s\S]*?```)/g);

        return parts.map((part, index) => {
            if (part.startsWith('```') && part.endsWith('```')) {
                const codeContent = part.slice(3, -3);
                const [language, ...codeLines] = codeContent.split('\n');
                const code = codeLines.join('\n');

                return (
                    <pre key={index} className="bg-gray-900 text-gray-100 p-4 rounded-lg my-3 overflow-x-auto border">
                        {language && (
                            <div className="text-gray-400 text-sm mb-2 border-b border-gray-700 pb-1">
                                {language}
                            </div>
                        )}
                        <code className="text-sm">{code}</code>
                    </pre>
                );
            }

            part = part.replace(/`([^`]+)`/g, '<code class="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-sm font-mono">$1</code>');

            part = part.replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
            part = part.replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>');
            part = part.replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');

            part = part.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');

            part = part.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

            part = part.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:text-blue-800 underline" target="_blank" rel="noopener noreferrer">$1</a>');

            part = part.replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>');

            part = part.replace(/^\d+\. (.*$)/gm, '<li class="ml-4 list-decimal">$1</li>');

            part = part.replace(/(<li class="ml-4 list-disc">[\s\S]*?<\/li>)/g, '<ul class="my-2">$1</ul>');
            part = part.replace(/(<li class="ml-4 list-decimal">[\s\S]*?<\/li>)/g, '<ol class="my-2">$1</ol>');

            part = part.replace(/\n\n/g, '</p><p class="mb-2">');
            part = part.replace(/\n/g, '<br />');

            if (!part.includes('<h1>') && !part.includes('<h2>') && !part.includes('<h3>') &&
                !part.includes('<ul>') && !part.includes('<ol>') && !part.includes('<pre>')) {
                part = `<p class="mb-2">${part}</p>`;
            }

            return (
                <div
                    key={index}
                    dangerouslySetInnerHTML={{__html: part}}
                    className="prose max-w-none"
                />
            );
        });
    };

    return (
        <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
            <div className="flex items-start space-x-3 max-w-4xl">
                <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-300 text-gray-700'
                    }`}>
                    {message.role === 'user' ? 'U' : 'AI'}
                </div>

                <div className={`rounded-lg px-4 py-3 shadow-sm ${
                    message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white text-gray-800 border border-gray-200'
                }`}>
                    <div className="text-sm leading-relaxed">
                        {formatMarkdown(message.content)}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MessageItem;