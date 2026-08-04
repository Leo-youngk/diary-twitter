'use client';

import { useEffect, useRef, useState } from 'react';
import { Post } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PostContentProps {
  post: Post;
}

export default function PostContent({ post }: PostContentProps) {
  const isDiary = post.entryType === 'diary';
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
    const el = textRef.current;
    if (!el) return;
    setIsTruncated(el.scrollHeight - el.clientHeight > 1);
  }, [post.id, post.content, post.entryType]);

  return (
    <div>
      <div className={cn(isDiary && 'relative')}>
        <p
          ref={textRef}
          className={cn(
            'text-[15px] leading-[1.75] mt-1 whitespace-pre-wrap break-words',
            !expanded && (isDiary ? 'line-clamp-4' : 'line-clamp-6')
          )}
        >
          {post.content}
        </p>
        {isDiary && isTruncated && (
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
