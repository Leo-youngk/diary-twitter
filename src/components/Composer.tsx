import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import TextareaAutosize from 'react-textarea-autosize';
import type { InferActivityParams } from '@stackflow/config';
import { guardDesktopPanel } from '@/app/desktopPanel';
import { toast } from '@/app/toast';
import { publishPost, publishReply } from '@/app/publish';
import { releaseKeyboard } from '@/app/keyboard';
import { useKeyboardViewport } from '@/app/useKeyboardViewport';
import Avatar from '@/components/Avatar';
import PostTime from '@/components/PostTime';
import Icon, { XLogo } from '@/components/Icon';
import { fitsOnX, updatePost } from '@/data/actions';
import { imageSrc, storeImage } from '@/data/blobs';
import { usePost, useProfile, useXPost, useXSyncEnabled } from '@/data/hooks';
import { compressImage, POST_IMAGE_OPTS } from '@/lib/image';
import { cn } from '@/lib/utils';
import { X_MAX_WEIGHT, xWeightedLength } from '@/lib/xText';

const DRAFT_KEY = 'diary-compose-draft';
const MAX_IMAGES = 4;
// A ceiling against runaway pastes; X's own limit is shown separately.
const MAX_LENGTH = 100_000;

interface Draft { content: string; thread: string[] }

function readDraft(): Draft {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as { content?: unknown; thread?: unknown } | null;
    return {
      content: typeof value?.content === 'string' ? value.content : '',
      thread: Array.isArray(value?.thread) ? value.thread.filter((part): part is string => typeof part === 'string') : [],
    };
  } catch {
    return { content: '', thread: [] };
  }
}

/** One more part of a thread, under the post (X's +). The key survives removing the parts before it. */
interface Part { key: number; text: string }
let partKey = 0;
const toParts = (texts: string[]): Part[] => texts.map((text) => ({ key: ++partKey, text }));

interface ComposerProps {
  params: InferActivityParams<'Compose'>;
  onClose: () => void;
  embedded?: boolean;
  activityId?: string;
  focusRequest?: number;
}

export default function Composer({ params, onClose, embedded = false, activityId, focusRequest = 0 }: ComposerProps) {
  const profile = useProfile();
  const editing = usePost(params.editId ?? '');
  const replyingTo = usePost(params.replyTo ?? '');
  const editingX = useXPost(params.editId ?? '');
  const xEnabled = useXSyncEnabled();
  const mode: 'new' | 'edit' | 'reply' = params.editId ? 'edit' : params.replyTo ? 'reply' : 'new';

  // Taken once, when the screen opens.
  const [initial] = useState(() => (mode === 'edit' && editing
    ? { content: editing.content, title: editing.title, images: editing.images, thread: [] as string[] }
    : { ...(mode === 'new' ? readDraft() : { content: '', thread: [] }), title: '', images: [] as string[] }));
  const [content, setContent] = useState(initial.content);
  const [parts, setParts] = useState<Part[]>(() => toParts(initial.thread));
  // Which field the length counter follows: -1 the post, otherwise a part's key.
  const [activeKey, setActiveKey] = useState(-1);
  const partRefs = useRef(new Map<number, HTMLTextAreaElement>());
  const [title, setTitle] = useState(initial.title);
  const [images, setImages] = useState<string[]>(initial.images);
  const [xOverride, setXOverride] = useState<boolean | null>(null);
  const toX = xOverride ?? xEnabled;
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  useKeyboardViewport(hostRef, !embedded);

  useEffect(() => { if (embedded && focusRequest) fieldRef.current?.focus(); }, [embedded, focusRequest]);
  useEffect(() => {
    if (embedded) return;
    const field = fieldRef.current;
    return () => releaseKeyboard(field);
  }, [embedded]);

  // Keep an unfinished new post across closes and reloads.
  useEffect(() => {
    if (mode !== 'new') return;
    const draft = JSON.stringify({ content, thread: parts.map((part) => part.text) });
    if (embedded) {
      try { localStorage.setItem(DRAFT_KEY, draft); } catch { /* storage blocked */ }
      return;
    }
    const timer = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, draft); } catch { /* best effort */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [mode, content, parts, embedded]);

  const text = content.trim();
  const thread = parts.map((part) => part.text.trim()).filter(Boolean);
  const target = mode === 'edit' ? editing : mode === 'reply' ? replyingTo : null;
  const missing = mode !== 'new' && !target;

  // What happens on X, shown before publishing rather than discovered after.
  const xBound = text.length > 0 && (mode === 'new' ? toX : mode === 'reply' && Boolean(replyingTo?.xSync) && xEnabled);
  const xFits = fitsOnX(text) && thread.every(fitsOnX);
  let xNote: { text: string; warn: boolean } | null = null;
  if (xBound && !xFits) {
    xNote = { text: '超过 X Premium 的 25,000 计数参考，仍会提交同步，结果以 X 返回为准', warn: true };
  } else if (xBound && thread.length > 0) {
    xNote = { text: `将作为一串（${thread.length + 1} 条）一起发到 X${images.length > 0 ? '，图片不会同步' : ''}`, warn: false };
  } else if (xBound && mode === 'reply') {
    xNote = { text: '将以引用原帖的形式同步到 X', warn: false };
  } else if (xBound && images.length > 0) {
    xNote = { text: '图片不会同步到 X，只发文字', warn: false };
  } else if (mode === 'edit' && editingX?.state === 'sent') {
    xNote = { text: 'X 上已发出的那条不会跟着修改', warn: false };
  } else if (mode === 'new' && !toX && text.length > 0) {
    xNote = { text: '先保存在日记本，之后可在帖子上点击「同步到 X」', warn: false };
  }

  const canPublish = text.length > 0 && content.length <= MAX_LENGTH && !uploading && !missing;
  const changed = content !== initial.content || title !== initial.title || images.join() !== initial.images.join();

  useEffect(() => {
    if (!embedded || mode === 'new') return;
    return guardDesktopPanel(() => !changed || window.confirm(mode === 'edit' ? '放弃这次的修改？' : '放弃这条追加？'));
  }, [embedded, mode, changed]);

  const close = () => {
    if (mode !== 'new' && changed && !window.confirm(mode === 'edit' ? '放弃这次的修改？' : '放弃这条追加？')) return;
    onClose();
  };

  const publish = () => {
    if (!canPublish) return;
    if (mode === 'reply' && replyingTo) {
      if (!publishReply(replyingTo.id, text)) return;
    } else if (mode === 'edit' && editing) {
      const saved = updatePost(editing.id, { content: text, images, title: initial.title ? title : undefined });
      if (!saved) { toast('这条已被删除', 'error'); return; }
      toast('已保存');
    } else {
      if (!publishPost({ content: text, images, toX, thread })) return;
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
    }
    if (embedded && mode === 'new') { setContent(''); setParts([]); setImages([]); setXOverride(null); }
    onClose();
  };

  const addImages = async (files: File[]) => {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) { toast(`最多 ${MAX_IMAGES} 张图片`, 'info'); return; }
    setUploading(true);
    try {
      const refs: string[] = [];
      for (const file of files.slice(0, room)) refs.push(await storeImage(await compressImage(file, POST_IMAGE_OPTS)));
      setImages((current) => [...current, ...refs]);
    } catch {
      toast('图片处理失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  // The tap stays inside the gesture so iOS moves the keyboard to the new field.
  const addPart = () => {
    const part: Part = { key: ++partKey, text: '' };
    flushSync(() => { setParts((current) => [...current, part]); setActiveKey(part.key); });
    partRefs.current.get(part.key)?.focus();
  };
  const removePart = (key: number) => {
    const index = parts.findIndex((part) => part.key === key);
    const before = index > 0 ? parts[index - 1].key : -1;
    flushSync(() => { setParts((current) => current.filter((part) => part.key !== key)); setActiveKey(before); });
    (before === -1 ? fieldRef.current : partRefs.current.get(before))?.focus();
  };
  const lastText = parts.length > 0 ? parts[parts.length - 1].text : content;
  const activeText = (parts.find((part) => part.key === activeKey)?.text ?? content).trim();

  const heading = mode === 'reply' ? '追加' : mode === 'edit' ? '编辑' : '新随想';
  const counter = xBound
    ? { used: xWeightedLength(activeText), max: X_MAX_WEIGHT, over: !fitsOnX(activeText) }
    : content.length > MAX_LENGTH * 0.9 ? { used: content.length, max: MAX_LENGTH, over: content.length > MAX_LENGTH } : null;

  return (
      <div
        ref={hostRef}
        data-compose-activity={activityId}
        className={cn('flex flex-col', embedded ? 'max-h-full min-h-0 overflow-hidden rounded-2xl border border-x-border' : 'h-full')}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); publish(); }
          if (e.key === 'Escape') close();
        }}
      >
        {!embedded && <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4">
          <button type="button" onClick={close} className="justify-self-start text-[16px]">取消</button>
          <h1 className="text-[16px] font-semibold">{heading}</h1>
          <span />
        </header>}

        {missing ? (
          <p className="flex-1 px-8 py-20 text-center text-x-gray">这条记录不存在，或已经删除。</p>
        ) : (
          <div data-scroll-root className={cn('relative min-h-0 flex-1 overflow-y-auto px-4 pb-6', embedded && 'pt-5')}>
            {embedded && mode === 'new' && <div className="mb-3 flex items-center gap-3">
              <Avatar src={profile.avatar} name={profile.displayName} size={32} />
              <div className="min-w-0 text-[14px]"><p className="truncate font-semibold">{profile.displayName}</p><p className="truncate text-[12px] text-x-gray">@{profile.username}</p></div>
            </div>}

            {mode === 'new' && params.writingPrompt && <aside aria-label="写作参考" className="mb-3 rounded-xl bg-x-darker px-3 py-2.5">
                <p className="text-[12px] font-medium text-x-gray">写作参考</p>
                <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-x-gray">{params.writingPrompt}</p>
              </aside>}

            <div className="flex gap-3 pt-1">
              {!embedded && (
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <Avatar src={profile.avatar} name={profile.displayName} size={32} />
                  {parts.length > 0 && <div className="mt-1 w-0.5 flex-1 rounded-full bg-x-border" />}
                </div>
              )}
              <div className={cn('min-w-0 flex-1', parts.length > 0 && 'pb-3')}>
                {initial.title && (
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="标题"
                    className="mt-1 w-full bg-transparent text-[18px] font-semibold outline-none placeholder:text-x-gray"
                  />
                )}
                <TextareaAutosize
                  ref={fieldRef}
                  data-compose-input
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onFocus={() => setActiveKey(-1)}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
                    if (files.length > 0 && mode !== 'reply') { e.preventDefault(); void addImages(files); }
                  }}
                  minRows={parts.length > 0 ? 1 : embedded ? 7 : 3}
                  maxRows={embedded ? 14 : undefined}
                  placeholder={mode === 'reply' ? '接着写…' : '有什么新鲜事？'}
                  className="w-full resize-none bg-transparent pt-1 text-[calc(17px*var(--font-scale))] leading-[1.65] outline-none placeholder:text-x-gray"
                />

                {images.length > 0 && (
                  <div className={cn('mt-2 grid gap-1.5', images.length === 1 ? 'grid-cols-1' : images.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
                    {images.map((ref, i) => (
                      <div key={`${ref}-${i}`} className="relative aspect-square overflow-hidden rounded-xl bg-x-darker">
                        <img src={imageSrc(ref)} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setImages((current) => current.filter((_, j) => j !== i))}
                          className="absolute left-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white"
                          aria-label="移除图片"
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {parts.map((part, i) => (
              <div key={part.key} className="flex gap-3">
                <div className="flex w-8 shrink-0 flex-col items-center">
                  <Avatar src={profile.avatar} name={profile.displayName} size={32} />
                  {i < parts.length - 1 && <div className="mt-1 w-0.5 flex-1 rounded-full bg-x-border" />}
                </div>
                <div className={cn('flex min-w-0 flex-1 items-start gap-2', i < parts.length - 1 && 'pb-3')}>
                  <TextareaAutosize
                    ref={(el) => { if (el) partRefs.current.set(part.key, el); else partRefs.current.delete(part.key); }}
                    value={part.text}
                    onChange={(e) => {
                      const value = e.target.value;
                      setParts((current) => current.map((p) => (p.key === part.key ? { ...p, text: value } : p)));
                    }}
                    onFocus={() => setActiveKey(part.key)}
                    minRows={1}
                    placeholder="继续写…"
                    className="min-w-0 flex-1 resize-none bg-transparent pt-1 text-[calc(17px*var(--font-scale))] leading-[1.65] outline-none placeholder:text-x-gray"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => removePart(part.key)}
                    className="pressable -m-1 mt-1 p-1 text-x-gray"
                    aria-label="删除这一条"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </div>
            ))}

            {mode === 'reply' && replyingTo && (
              <div className={cn('mt-3 rounded-2xl border border-x-border px-3 py-2.5', !embedded && 'ml-11')}>
                <div className="flex min-w-0 items-center gap-1.5 text-[14px]">
                  <Avatar src={profile.avatar} name={profile.displayName} size={18} />
                  <span className="truncate font-semibold">{profile.displayName}</span>
                  <span className="shrink-0 text-x-gray">@{profile.username} · <PostTime date={replyingTo.createdAt} /></span>
                </div>
                <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words text-[calc(14px*var(--font-scale))] leading-[1.55]">{replyingTo.content}</p>
              </div>
            )}

            {xNote && (
              <p className={cn('mt-3 flex items-start gap-1 text-[12px] leading-snug', !embedded && 'ml-11', xNote.warn ? 'text-x-danger' : 'text-x-gray')}>
                <XLogo size={11} className="mt-px shrink-0" />
                <span>{xNote.text}</span>
              </p>
            )}
          </div>
        )}

        {/* Rides on top of the keyboard, as in Threads. */}
        {!missing && (
          <div className={cn('dock flex shrink-0 flex-wrap items-center gap-3 bg-x-dark px-4 pt-2', embedded && 'border-t border-x-border pb-4')}>
            {mode !== 'reply' && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || images.length >= MAX_IMAGES}
                className="pressable -m-1 p-1 text-x-gray disabled:opacity-40"
                aria-label="添加图片"
              >
                <Icon name="image" size={23} />
              </button>
            )}
            {mode === 'new' && (
              <button
                type="button"
                // Keep the keyboard up while moving it to the new field.
                onMouseDown={(e) => e.preventDefault()}
                onClick={addPart}
                disabled={!lastText.trim()}
                className="pressable -m-1 p-1 text-x-blue disabled:text-x-gray disabled:opacity-40"
                aria-label="再写一条，作为串推"
              >
                <Icon name="plus" size={23} />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (files.length > 0) void addImages(files);
              }}
            />
            {mode === 'new' && (
              <button
                type="button"
                role="switch"
                aria-label="立即同步到 X"
                aria-checked={toX}
                onClick={() => setXOverride(!toX)}
                className={cn(
                  'pressable flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px]',
                  toX ? 'border-x-fg bg-x-fg font-semibold text-x-dark' : 'border-x-border text-x-gray',
                )}
              >
                <XLogo size={11} />
                {toX ? '立即同步' : '暂不同步'}
              </button>
            )}
            <div className="ml-auto flex items-center gap-3">
              {counter && (
                <span className={cn('text-[12px] tabular-nums', counter.over ? 'font-semibold text-x-danger' : 'text-x-gray')}>
                  {counter.used}/{counter.max}
                </span>
              )}
              <button
                type="button"
                // Keep the keyboard up: the tap must not blur the text field first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={publish}
                disabled={!canPublish}
                className={cn('pressable px-5 py-2 text-[15px] font-semibold disabled:opacity-30', embedded ? 'rounded-lg bg-x-blue text-white' : 'rounded-full bg-x-fg text-x-dark')}
              >
                {mode === 'edit' || (mode === 'new' && !toX) ? '保存' : '发布'}
              </button>
            </div>
          </div>
        )}
      </div>
  );
}
