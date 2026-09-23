'use client';

import { useEffect, useRef, useState } from 'react';
import { Post } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PostContentProps {
  post: Post;
  compact?: boolean;
}

export default function PostContent({ post, compact = false }: PostContentProps) {
  const isDiary = post.entryType === 'diary';
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [post.id]);

  useEffect(() => {
    if (expanded) return;
    const el = textRef.current;
    if (!el) return;
    // ResizeObserver runs after layout. Reading here avoids forcing a full
    // timeline layout for every newly mounted card during pagination.
    let active = true;
    const measure = () => {
      if (active) setIsTruncated(el.scrollHeight - el.clientHeight > 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    void document.fonts?.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [expanded, post.id, post.content, post.entryType]);

  return (
    <div>
      <div className={cn(isDiary && !compact && 'relative')}>
        <p
          ref={textRef}
          className={cn(
            'text-[length:calc(15px*var(--font-scale))] leading-[1.65] mt-1.5 whitespace-pre-wrap break-words',
            !expanded && (isDiary ? 'line-clamp-4' : 'line-clamp-6')
          )}
        >
          {post.content}
        </p>
        {/* The fade blends into the page background, so it only works outside a card. */}
        {!compact && isDiary && isTruncated && (
          <div className="absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-x-dark to-transparent pointer-events-none" />
        )}
      </div>

      {isDiary && isTruncated && (
        <span className="block text-x-blue text-[14px] font-bold mt-1">
          阅读全文 →
        </span>
      )}

      {!isDiary && isTruncated && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className="text-x-blue text-[14px] font-bold mt-1 hover:underline"
        >
          {expanded ? '收起' : '显示更多'}
        </button>
      )}
    </div>
  );
}
