'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useApp } from '@/lib/context';
import { formatCount, formatRelativeTime, cn } from '@/lib/utils';
import { formatDateCN } from '@/lib/export';
import Avatar from '@/components/ui/Avatar';

export default function PostDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { posts, currentUser, toggleLike, deletePost, addReply, exportPost, addToast } = useApp();
  const [replyContent, setReplyContent] = useState('');
  const [likeAnimating, setLikeAnimating] = useState(false);

  const post = posts.find((p) => p.id === params.id);
  if (!post) {
    return (
      <div className="py-12 text-center text-x-gray">
        <p className="text-xl font-bold mb-2">找不到这条记录</p>
        <button onClick={() => router.back()} className="text-x-blue hover:underline">返回</button>
      </div>
    );
  }

  const typeLabel = post.entryType === 'diary' ? '日记' : post.entryType === 'article' ? '英文' : '随想';
  const typeColor = post.entryType === 'diary'
    ? 'bg-x-green/20 text-x-green'
    : post.entryType === 'article'
    ? 'bg-amber-500/20 text-amber-500'
    : 'bg-x-blue/20 text-x-blue';

  const handleLike = () => {
    setLikeAnimating(true);
    toggleLike(post.id);
    setTimeout(() => setLikeAnimating(false), 300);
  };

  const handleReply = () => {
    if (!replyContent.trim()) return;
    addReply(post.id, replyContent.trim());
    setReplyContent('');
    addToast('回复成功！');
  };

  const imageGridClass =
    post.images.length === 1
      ? 'grid-cols-1'
      : post.images.length === 2
      ? 'grid-cols-2'
      : 'grid-cols-2';

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 bg-x-dark border-b border-x-border">
        <div className="flex items-center gap-4 px-4 py-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-full hover:bg-x-hover transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
              <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">帖子</h1>
        </div>
      </div>

      {/* Post Content (expanded view) */}
      <div className="px-4 pt-4">
        {/* User header */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="md" />
          <div>
            <p className="font-bold text-[15px]">{currentUser.displayName}</p>
            <p className="text-x-gray text-sm">@{currentUser.username}</p>
          </div>
        </div>

        {/* Title */}
        {post.title && (
          <h2 className="font-bold text-xl mb-2">{post.title}</h2>
        )}

        {/* Content */}
        <p className="text-[17px] leading-[1.9] whitespace-pre-wrap break-words">
          {post.content}
        </p>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {post.tags.map((tag) => (
              <span key={tag} className="text-sm text-x-blue bg-x-blue/10 px-2 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Images */}
        {post.images.length > 0 && (
          <div className={cn('grid gap-0.5 mt-4 rounded-2xl overflow-hidden border border-x-border', imageGridClass)}>
            {post.images.slice(0, 4).map((img, index) => (
              <div key={index} className="relative aspect-video">
                <Image src={img} alt={`Image ${index + 1}`} fill className="object-cover" unoptimized />
              </div>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-2 mt-5 pb-4 border-b border-x-border">
          <span className="text-x-gray text-sm">{formatDateCN(post.createdAt)}</span>
          <span className="text-x-gray">·</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${typeColor}`}>{typeLabel}</span>
          {post.mood && (
            <>
              <span className="text-x-gray">·</span>
              <span>{post.mood}</span>
            </>
          )}
        </div>

        {/* Stats + Action Bar (single row) */}
        <div className="flex items-center justify-between py-4 border-b border-x-border">
          <div className="flex items-center gap-4 text-sm">
            {post.replies.length > 0 && (
              <span><strong>{post.replies.length}</strong> <span className="text-x-gray">回复</span></span>
            )}
            {post.views > 0 && (
              <span><strong>{formatCount(post.views)}</strong> <span className="text-x-gray">浏览</span></span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleLike} className={cn('group flex items-center transition-colors p-2 rounded-full', post.isLiked ? 'text-x-danger' : 'text-x-gray hover:text-x-danger')}>
              <div className={cn('p-2 rounded-full group-hover:bg-x-danger/10 transition-colors', likeAnimating && 'like-animation')}>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  {post.isLiked ? (
                    <path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.45-4.97-.334-6.79C3.9 4.57 5.965 3.5 8.204 3.5c1.837 0 3.136.78 3.796 1.41.66-.63 1.959-1.41 3.796-1.41 2.24 0 4.304 1.07 5.422 2.9 1.116 1.82 1.026 4.29-.334 6.79z" />
                  ) : (
                    <path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.45-4.97-.334-6.79C3.9 4.57 5.965 3.5 8.204 3.5c1.837 0 3.136.78 3.796 1.41.66-.63 1.959-1.41 3.796-1.41 2.24 0 4.304 1.07 5.422 2.9 1.116 1.82 1.026 4.29-.334 6.79z" />
                  )}
                </svg>
              </div>
            </button>

            <button onClick={() => exportPost(post)} className="group text-x-gray hover:text-x-blue transition-colors p-2 rounded-full" title="导出">
              <div className="p-2 rounded-full group-hover:bg-x-blue/10 transition-colors">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" />
                </svg>
              </div>
            </button>

            <button onClick={() => { deletePost(post.id); addToast('已删除'); router.back(); }} className="group text-x-gray hover:text-x-danger transition-colors p-2 rounded-full" title="删除">
              <div className="p-2 rounded-full group-hover:bg-x-danger/10 transition-colors">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M16 6V4.5C16 3.12 14.88 2 13.5 2h-3C9.11 2 8 3.12 8 4.5V6H3v2h1.06l.81 11.21C4.98 20.78 6.28 22 7.86 22h8.27c1.58 0 2.88-1.22 3-2.79L19.93 8H21V6h-5zm-6-1.5c0-.28.22-.5.5-.5h3c.27 0 .5.22.5.5V6h-4V4.5zM17.13 19.1c-.04.52-.47.9-1 .9H7.86c-.53 0-.96-.38-1-.9L6.07 8h11.85l-.79 11.1zM9 17h2V10H9v7zm4 0h2V10h-2v7z" />
                </svg>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Reply input — button on second line (same pattern as compose area) */}
      <div className="px-4 py-4 border-b border-x-border">
        <div className="flex gap-3">
          <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="sm" />
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && replyContent.trim()) handleReply(); }}
              placeholder="追加想法..."
              className="w-full bg-transparent text-base text-white placeholder-x-gray outline-none"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleReply}
                disabled={!replyContent.trim()}
                className={cn(
                  'font-bold rounded-full px-5 py-2 text-sm transition-all duration-200',
                  replyContent.trim()
                    ? 'bg-x-blue hover:bg-x-blue-hover text-white'
                    : 'border border-x-border/60 text-x-gray/60 bg-transparent cursor-default'
                )}
              >
                追加
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Replies / Thread — consistent with PostCard inline reply style */}
      {post.replies.length > 0 && (
        <div>
          {post.replies.map((reply) => (
            <div key={reply.id} className="flex gap-3 px-4 py-4 border-b border-x-border/40 hover:bg-white/[0.02] transition-colors">
              <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-[13px]">{currentUser.displayName}</span>
                  <span className="text-x-gray/60 text-[12px]">·</span>
                  <span className="text-x-gray/70 text-[12px]">{formatRelativeTime(reply.createdAt)}</span>
                </div>
                <p className="text-[14px] leading-[1.7] mt-1 whitespace-pre-wrap break-words">{reply.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
