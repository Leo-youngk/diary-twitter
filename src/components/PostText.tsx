import { useLayoutEffect, useRef, useState } from 'react';
import { usePreferences } from '@/app/preferences';
import { cn } from '@/lib/utils';

interface PostTextProps {
  text: string;
  lines: number;
  className?: string;
  /** Shown when the text is cut, e.g. 阅读全文; omit for an inline 显示更多 toggle. */
  moreLabel?: string;
}

/**
 * Clamped text that knows whether it was cut. It is measured in a layout
 * effect, before the browser paints, so the "more" line never appears a frame
 * later and pushes everything below it down.
 */
export default function PostText({ text, lines, className, moreLabel }: PostTextProps) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [cut, setCut] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { fontSize, font } = usePreferences();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || expanded) return;
    setCut(el.scrollHeight - el.clientHeight > 1);
  }, [text, lines, expanded, fontSize, font]);

  return (
    <>
      <p
        ref={ref}
        className={cn('whitespace-pre-wrap break-words', className)}
        style={expanded ? undefined : { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: lines, overflow: 'hidden' }}
      >
        {text}
      </p>
      {cut && moreLabel && <span className="block text-x-blue text-[14px] mt-1">{moreLabel}</span>}
      {cut && !moreLabel && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          className="text-x-blue text-[14px] mt-1"
        >
          {expanded ? '收起' : '显示更多'}
        </button>
      )}
    </>
  );
}
