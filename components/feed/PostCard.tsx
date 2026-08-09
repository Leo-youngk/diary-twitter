'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Post } from '@/lib/types';
import { useApp } from '@/lib/context';
import { formatRelativeTime, cn } from '@/lib/utils';
import { formatDateCN } from '@/lib/export';
import Avatar from '@/components/ui/Avatar';
import PostContent from '@/components/feed/PostContent';
import ImageLightbox from '@/components/common/ImageLightbox';

interface PostCardProps {
  post: Post;
  compact?: boolean;
}

export default function PostCard({ post, compact = false }: PostCardProps) {
  const router = useRouter();
  const { toggleLike, deletePost, openReply, currentUser, exportPost, addToast } = useApp();
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const handleDelete = () => {
    setShowMenu(false);
    setConfirmDelete(false);
    setExiting(true);
    // Let the card fade out before it leaves the list, otherwise everything
    // below it snaps upward.
    setTimeout(() => { deletePost(post.id); addToast('已删除'); }, 200);
  };

  const handleCopy = async () => {
    const text = post.title ? `${post.title}\n\n${post.content}` : post.content;
    try {
      await navigator.clipboard.writeText(text);
      addToast('已复制到剪贴板');
    } catch {
      addToast('复制失败', 'error');
    }
    setShowMenu(false);
  };

  const closeMenu = () => { setShowMenu(false); setConfirmDelete(false); };

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

  const typeLabel = post.entryType === 'diary' ? '日记' : post.entryType === 'article' ? '英文' : '随想';
  const typeColor = post.entryType === 'diary'
    ? 'bg-x-green/20 text-x-green'
    : post.entryType === 'article'
    ? 'bg-amber-500/20 text-amber-500'
    : 'bg-x-blue/20 text-x-blue';

  const navigateToPost = () => {
    // The whole card is clickable, so dragging to select a passage would
    // otherwise navigate away the moment the mouse comes up.
    if (window.getSelection()?.toString()) return;
    router.push(`/post/${post.id}`);
  };

  return (
    <article
      onClick={navigateToPost}
      className={cn(
        'px-4 py-3 transition-colors cursor-pointer',
        compact
          ? 'rounded-2xl bg-white shadow-sm dark:bg-x-darker dark:shadow-none mb-3 mx-3 hover:shadow-md dark:hover:bg-white/[0.03]'
          : 'border-b border-x-border/40 hover:bg-white/[0.03]',
        exiting ? 'post-exit' : 'post-enter'
      )}
    >
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          {/* Header — tag + time + more menu */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 text-xs px-2.5 py-1 rounded-full font-medium bg-x-blue/15 text-x-blue">
                {typeLabel}
              </span>
              <span className="text-x-gray/60 text-[13px]">·</span>
              <span
                className="text-x-gray/70 text-[13px] hover:text-x-gray transition-colors whitespace-nowrap"
                title={formatDateCN(post.createdAt)}
              >
                {formatRelativeTime(post.createdAt)}
              </span>
              {post.mood && (
                <>
                  <span className="text-x-gray/60 text-[13px]">·</span>
                  <span className="text-[13px] text-x-gray/80">{post.mood}</span>
                </>
              )}
            </div>
            {/* More menu */}
            <div className="relative shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                className="p-1 rounded-full hover:bg-x-blue/10 text-x-gray/60 hover:text-x-blue transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z" />
                </svg>
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); closeMenu(); }} />
                  <div className="absolute right-0 top-full mt-1 bg-x-dark border border-x-border rounded-xl shadow-xl overflow-hidden z-50 min-w-[160px]">
                    {!confirmDelete ? (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-x-hover text-sm transition-colors flex items-center gap-2"
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" /></svg>
                          复制文本
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); exportPost(post); setShowMenu(false); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-x-hover text-sm transition-colors flex items-center gap-2"
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z" /></svg>
                          导出
                        </button>
                        <div className="border-t border-x-border" />
                        <button
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-x-hover text-sm text-x-danger transition-colors flex items-center gap-2"
                        >
                          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M16 6V4.5C16 3.12 14.88 2 13.5 2h-3C9.11 2 8 3.12 8 4.5V6H3v2h1.06l.81 11.21C4.98 20.78 6.28 22 7.86 22h8.27c1.58 0 2.88-1.22 3-2.79L19.93 8H21V6h-5zm-6-1.5c0-.28.22-.5.5-.5h3c.27 0 .5.22.5.5V6h-4V4.5zM17.13 19.1c-.04.52-.47.9-1 .9H7.86c-.53 0-.96-.38-1-.9L6.07 8h11.85l-.79 11.1zM9 17h2V10H9v7zm4 0h2V10h-2v7z" /></svg>
                          删除
                        </button>
                      </>
                    ) : (
                      <div className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <p className="text-sm font-medium mb-3">确认删除这条记录？</p>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
                            className="flex-1 py-1.5 text-sm font-bold text-white bg-x-danger hover:bg-x-danger/80 rounded-full transition-colors"
                          >
                            删除
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                            className="flex-1 py-1.5 text-sm font-bold border border-x-border rounded-full hover:bg-x-hover transition-colors"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {post.title && (
            <h3 className="font-bold text-lg mt-1 mb-0">{post.title}</h3>
          )}

          {/* Post Content — collapses long entries; diary previews to a "read more" link */}
          <PostContent post={post} compact={compact} />

          {/* Tags — only in full view */}
          {!compact && post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {post.tags.map((tag) => (
                <span key={tag} className="text-xs text-x-blue bg-x-blue/10 px-2 py-0.5 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {post.images.length > 0 && (
            <div className={cn('grid gap-0.5 mt-3 rounded-2xl overflow-hidden border border-x-border', imageGridClass, post.images.length === 3 && 'grid-rows-2')}>
              {post.images.slice(0, 4).map((img, index) => (
                <div
                  key={index}
                  onClick={(e) => { e.stopPropagation(); setLightboxIndex(index); }}
                  className={cn('relative aspect-square cursor-zoom-in', post.images.length === 3 && index === 0 && 'row-span-2')}
                >
                  <Image src={img} alt={`Image ${index + 1}`} fill className="object-cover" unoptimized />
                </div>
              ))}
            </div>
          )}

          {/* Action Bar */}
          <div className="flex items-center gap-6 mt-2 -ml-1.5">
            {/* Reply */}
            <button onClick={(e) => { e.stopPropagation(); openReply(post); }} className="group flex items-center gap-1 text-x-gray/70 hover:text-x-blue transition-colors">
              <div className="p-1.5 rounded-full group-hover:bg-x-blue/10 transition-colors">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              {post.replies.length > 0 && <span className="text-xs">{post.replies.length}</span>}
            </button>

            {/* Like */}
            <button
              onClick={(e) => { e.stopPropagation(); handleLike(); }}
              aria-pressed={post.isLiked}
              aria-label={post.isLiked ? '取消收藏' : '收藏'}
              className={cn('group flex items-center gap-1 transition-colors', post.isLiked ? 'text-x-danger' : 'text-x-gray/70 hover:text-x-danger')}
            >
              <div className={cn('p-1.5 rounded-full group-hover:bg-x-danger/10 transition-colors', likeAnimating && 'like-animation')}>
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill={post.isLiked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
            </button>

            {/* Share — reuses the existing markdown export */}
            <button
              onClick={(e) => { e.stopPropagation(); exportPost(post); }}
              aria-label="分享"
              className="group flex items-center gap-1 text-x-gray/70 hover:text-x-blue transition-colors"
            >
              <div className="p-1.5 rounded-full group-hover:bg-x-blue/10 transition-colors">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Inline Replies — avatars aligned with main post avatar */}
      {post.replies.length > 0 && (
        <div>
          {post.replies.map((reply, index) => (
            <div key={reply.id} onClick={navigateToPost} className="flex gap-3 py-2 hover:bg-white/[0.03] transition-colors cursor-pointer">
              <div className="flex flex-col items-center shrink-0">
                {index === 0 && <div className="w-0.5 h-2 bg-x-border -mt-2" />}
                <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="sm" />
                {index < post.replies.length - 1 && <div className="w-0.5 flex-1 bg-x-border mt-1" />}
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-1 text-sm">
                  <span className="font-medium text-[13px]">{currentUser.displayName}</span>
                  <span className="text-x-gray/60 text-[12px]">·</span>
                  <span className="text-x-gray/70 text-[12px]">{formatRelativeTime(reply.createdAt)}</span>
                </div>
                <p className="text-[14px] leading-[1.7] mt-0.5 whitespace-pre-wrap break-words">{reply.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {lightboxIndex !== null && (
        <ImageLightbox images={post.images} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
    </article>
  );
}
