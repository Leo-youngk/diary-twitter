'use client';

import { useState } from 'react';
import { useApp } from '@/lib/context';
import { formatRelativeTime } from '@/lib/utils';
import Avatar from '@/components/ui/Avatar';

export default function ReplyModal() {
  const { replyingToPost, closeReply, currentUser, addReply, addToast } = useApp();
  const [content, setContent] = useState('');

  if (!replyingToPost) return null;

  const canReply = content.trim().length > 0;

  const handleReply = () => {
    if (!canReply) return;
    addReply(replyingToPost.id, content.trim());
    addToast('回复成功！');
    setContent('');
    closeReply();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={closeReply} />

      <div className="relative bg-x-dark rounded-2xl w-full max-w-[600px] mt-12 mx-4 shadow-2xl border border-x-border">
        {/* Header */}
        <div className="flex items-center px-4 py-3">
          <button onClick={closeReply} className="p-2 rounded-full hover:bg-x-hover transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
              <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z" />
            </svg>
          </button>
        </div>

        {/* Original Post */}
        <div className="px-4 pb-3">
          <div className="flex gap-3">
            <div className="flex flex-col items-center">
              <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="md" />
              <div className="w-0.5 flex-1 bg-x-border mt-2" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1 text-sm">
                <span className="font-bold">{currentUser.displayName}</span>
                <span className="text-x-gray">@{currentUser.username}</span>
                <span className="text-x-gray">·</span>
                <span className="text-x-gray">{formatRelativeTime(replyingToPost.createdAt)}</span>
              </div>
              <p className="text-[15px] mt-0.5 line-clamp-3">{replyingToPost.content}</p>
              <p className="text-x-gray text-sm mt-1">
                回复自己的 thread
              </p>
            </div>
          </div>
        </div>

        {/* Reply Input */}
        <div className="flex gap-3 px-4 pb-4">
          <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="md" />
          <div className="flex-1 min-w-0">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写下你的回复..."
              className="w-full bg-transparent text-xl text-white placeholder-x-gray outline-none resize-none min-h-[80px] leading-7"
              autoFocus
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-x-border px-4 py-3 flex items-center justify-end">
          <button
            onClick={handleReply}
            disabled={!canReply}
            className="bg-x-blue hover:bg-x-blue-hover text-white font-bold rounded-full px-5 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
          >
            回复
          </button>
        </div>
      </div>
    </div>
  );
}
