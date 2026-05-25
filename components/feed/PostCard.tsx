'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Post } from '@/lib/types';
import { useApp } from '@/lib/context';
import { formatCount, formatRelativeTime, cn } from '@/lib/utils';
import { formatDateCN } from '@/lib/export';
import Avatar from '@/components/ui/Avatar';

interface PostCardProps {
  post: Post;
}

export default function PostCard({ post }: PostCardProps) {
  const router = useRouter();
  const { toggleLike, openReply, currentUser, exportPost } = useApp();
  const [likeAnimating, setLikeAnimating] = useState(false);

  const handleLike = () => {
    setLikeAnimating(true);
    toggleLike(post.id);
    setTimeout(() => setLikeAnimating(false), 300);
  };

  const imageGridClass =
    post.images.length === 1
      ? 'grid-cols-1'
      : post.images.length === 2
      ? 'grid-cols-2'
      : post.images.length <= 4
      ? 'grid-cols-2'
      : 'grid-cols-3';

  const typeLabel = post.entryType === 'diary' ? '日记' : '随想';
  const typeColor = post.entryType === 'diary' ? 'bg-x-green/20 text-x-green' : 'bg-x-blue/20 text-x-blue';

  const navigateToPost = () => {
    router.push(`/post/${post.id}`);
  };

  return (
    <article onClick={navigateToPost} className="border-b border-x-border px-4 py-3 hover:bg-white/[0.03] transition-colors cursor-pointer">
      <div className="flex gap-3">
        <div className="shrink-0 flex flex-col items-center">
          <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="md" />
          {post.replies.length > 0 && <div className="w-0.5 flex-1 bg-x-border mt-1" />}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1 text-[15px] flex-wrap">
            <span className="font-bold truncate">
              {currentUser.displayName}
            </span>
            <span className="text-x-gray truncate">@{currentUser.username}</span>
            <span className="text-x-gray">·</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${typeColor}`}>
              {typeLabel}
            </span>
            <span className="text-x-gray">·</span>
            <span className="text-x-gray hover:underline whitespace-nowrap" title={formatDateCN(post.createdAt)}>
              {formatRelativeTime(post.createdAt)}
            </span>
            {post.mood && (
              <>
                <span className="text-x-gray">·</span>
                <span className="text-sm">{post.mood}</span>
              </>
            )}
          </div>

          {/* Title for diary */}
          {post.title && (
            <h3 className="font-bold text-lg mt-1 mb-0.5">{post.title}</h3>
          )}

          {/* Post Content */}
          <p className="text-[15px] leading-5 mt-0.5 whitespace-pre-wrap break-words">
            {post.content}
          </p>

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {post.tags.map((tag) => (
                <span key={tag} className="text-xs text-x-blue bg-x-blue/10 px-2 py-0.5 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* Images */}
          {post.images.length > 0 && (
            <div className={cn('grid gap-0.5 mt-3 rounded-2xl overflow-hidden border border-x-border', imageGridClass, post.images.length === 3 && 'grid-rows-2')}>
              {post.images.slice(0, 4).map((img, index) => (
                <div key={index} className={cn('relative aspect-square', post.images.length === 3 && index === 0 && 'row-span-2')}>
                  <Image src={img} alt={`Image ${index + 1}`} fill className="object-cover" unoptimized />
                </div>
              ))}
            </div>
          )}

          {/* Full date */}
          <p className="text-xs text-x-gray mt-2">{formatDateCN(post.createdAt)}</p>

          {/* Action Bar */}
          <div className="flex items-center justify-between mt-2 max-w-[400px] -ml-2">
            {/* Reply */}
            <button onClick={(e) => { e.stopPropagation(); openReply(post); }} className="group flex items-center gap-1 text-x-gray hover:text-x-blue transition-colors">
              <div className="p-2 rounded-full group-hover:bg-x-blue/10 transition-colors">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.26-.9 4.42-2.51 6.01l-5.22 5.17c-.45.44-1.17.44-1.61 0l-5.22-5.17c-1.6-1.59-2.51-3.75-2.51-6.01V10zm8.005-6C7.152 4 4.751 6.41 4.751 10v.13c0 1.6.63 3.14 1.77 4.28L11.122 19l4.6-4.59c1.14-1.14 1.77-2.68 1.77-4.28V10.13c0-3.51-2.85-6.36-6.36-6.36h-4.37z" />
                </svg>
              </div>
              {post.replies.length > 0 && <span className="text-sm">{formatCount(post.replies.length)}</span>}
            </button>

            {/* Like */}
            <button onClick={(e) => { e.stopPropagation(); handleLike(); }} className={cn('group flex items-center gap-1 transition-colors', post.isLiked ? 'text-x-danger' : 'text-x-gray hover:text-x-danger')}>
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

            {/* Views */}
            <button className="group flex items-center gap-1 text-x-gray hover:text-x-blue transition-colors">
              <div className="p-2 rounded-full group-hover:bg-x-blue/10 transition-colors">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-9.5H6L6 21H4zm9.248 0V6.5h2V21h-2z" />
                </svg>
              </div>
              {post.views > 0 && <span className="text-sm">{formatCount(post.views)}</span>}
            </button>

            {/* Export */}
            <button
              onClick={(e) => { e.stopPropagation(); exportPost(post); }}
              className="group flex items-center gap-1 text-x-gray hover:text-x-blue transition-colors"
              title="导出为 Markdown"
            >
              <div className="p-2 rounded-full group-hover:bg-x-blue/10 transition-colors">
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" />
                </svg>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Inline Replies (Twitter-style thread) */}
      {post.replies.length > 0 && (
        <div className="pl-4">
          {post.replies.map((reply, index) => (
            <div key={reply.id} onClick={navigateToPost} className="flex gap-3 pl-8 pr-4 py-2 hover:bg-white/[0.03] transition-colors cursor-pointer">
              <div className="flex flex-col items-center shrink-0">
                {index === 0 && <div className="w-0.5 h-2 bg-x-border -mt-2" />}
                <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="sm" />
                {index < post.replies.length - 1 && <div className="w-0.5 flex-1 bg-x-border mt-1" />}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-1 text-sm">
                  <span className="font-bold">{currentUser.displayName}</span>
                  <span className="text-x-gray">@{currentUser.username}</span>
                  <span className="text-x-gray">·</span>
                  <span className="text-x-gray">{formatRelativeTime(reply.createdAt)}</span>
                </div>
                <p className="text-[15px] mt-0.5 whitespace-pre-wrap break-words">{reply.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
