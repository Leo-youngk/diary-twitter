import { useEffect, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import type { ActivityComponentType } from '@stackflow/react';
import { useNav } from '@/app/nav';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { toast } from '@/app/toast';
import { useKeyboardViewport } from '@/app/useKeyboardViewport';
import Avatar from '@/components/Avatar';
import Icon, { XLogo } from '@/components/Icon';
import { addPost, addReply, fitsOnX, postWillSyncToX, replyWillSyncToX, updatePost } from '@/data/actions';
import { imageSrc, storeImage } from '@/data/blobs';
import { usePost, useProfile, useXPost, useXSyncEnabled } from '@/data/hooks';
import { compressImage, POST_IMAGE_OPTS } from '@/lib/image';
import { cn } from '@/lib/utils';
import { X_MAX_WEIGHT, xWeightedLength } from '@/lib/xText';

const DRAFT_KEY = 'diary-compose-draft';
const MAX_IMAGES = 4;
// A ceiling against runaway pastes; X's own limit is shown separately.
const MAX_LENGTH = 20_000;

function readDraft(): string {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as { content?: unknown } | null;
    return typeof value?.content === 'string' ? value.content : '';
  } catch {
    return '';
  }
}

const ComposeActivity: ActivityComponentType<'Compose'> = ({ params }) => {
  const { pop } = useNav();
  const profile = useProfile();
  const editing = usePost(params.editId ?? '');
  const replyingTo = usePost(params.replyTo ?? '');
  const editingX = useXPost(params.editId ?? '');
  const xEnabled = useXSyncEnabled();
  const mode: 'new' | 'edit' | 'reply' = params.editId ? 'edit' : params.replyTo ? 'reply' : 'new';

  // Taken once, when the screen opens.
  const [initial] = useState(() => (mode === 'edit' && editing
    ? { content: editing.content, title: editing.title, images: editing.images }
    : { content: mode === 'new' ? readDraft() : '', title: '', images: [] as string[] }));
  const [content, setContent] = useState(initial.content);
  const [title, setTitle] = useState(initial.title);
  const [images, setImages] = useState<string[]>(initial.images);
  const [toX, setToX] = useState(xEnabled);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  useKeyboardViewport(hostRef);

  // Keep an unfinished new post across closes and reloads.
  useEffect(() => {
    if (mode !== 'new') return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ content })); } catch { /* best effort */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [mode, content]);

  const text = content.trim();
  const target = mode === 'edit' ? editing : mode === 'reply' ? replyingTo : null;
  const missing = mode !== 'new' && !target;

  // What happens on X, shown before publishing rather than discovered after.
  const xBound = text.length > 0 && (mode === 'new' ? toX : mode === 'reply' && Boolean(replyingTo?.xSync) && xEnabled);
  const xFits = fitsOnX(text);
  let xNote: { text: string; warn: boolean } | null = null;
  if (xBound && !xFits) {
    xNote = { text: `超出 X 的长度上限（中文每字算 2，最多 140 字），这条只保存在本机`, warn: true };
  } else if (xBound && mode === 'reply') {
    xNote = { text: '将以引用原帖的形式同步到 X', warn: false };
  } else if (xBound && images.length > 0) {
    xNote = { text: '图片不会同步到 X，只发文字', warn: false };
  } else if (mode === 'edit' && editingX?.state === 'sent') {
    xNote = { text: 'X 上已发出的那条不会跟着修改', warn: false };
  }

  const canPublish = text.length > 0 && content.length <= MAX_LENGTH && !uploading && !missing;
  const changed = content !== initial.content || title !== initial.title || images.join() !== initial.images.join();

  const close = () => {
    if (mode !== 'new' && changed && !window.confirm(mode === 'edit' ? '放弃这次的修改？' : '放弃这条追加？')) return;
    pop();
  };

  const publish = () => {
    if (!canPublish) return;
    if (mode === 'reply' && replyingTo) {
      if (!addReply(replyingTo.id, text)) { toast('原帖已被删除', 'error'); return; }
      if (replyingTo.xSync && xEnabled && !replyWillSyncToX(replyingTo.id, text)) toast('这条追加只保存在本地', 'info');
    } else if (mode === 'edit' && editing) {
      const saved = updatePost(editing.id, { content: text, images, title: initial.title ? title : undefined });
      if (!saved) { toast('这条已被删除', 'error'); return; }
      toast('已保存');
    } else {
      const sending = postWillSyncToX(toX, text);
      addPost({ content: text, images, toX });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* nothing to clear */ }
      toast(sending ? '已发布，正在同步到 X' : '已发布');
    }
    pop();
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

  const heading = mode === 'reply' ? '追加' : mode === 'edit' ? '编辑' : '新随想';
  const counter = xBound
    ? { used: xWeightedLength(text), max: X_MAX_WEIGHT, over: !xFits }
    : content.length > MAX_LENGTH * 0.9 ? { used: content.length, max: MAX_LENGTH, over: content.length > MAX_LENGTH } : null;

  return (
    <AppScreen CUPERTINO_ONLY_modalPresentationStyle="fullScreen" preventSwipeBack>
      <div
        ref={hostRef}
        className="flex h-full flex-col"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); publish(); }
          if (e.key === 'Escape') close();
        }}
      >
        <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-4">
          <button type="button" onClick={close} className="justify-self-start text-[16px]">取消</button>
          <h1 className="text-[16px] font-semibold">{heading}</h1>
          <span />
        </header>

        {missing ? (
          <p className="flex-1 px-8 py-20 text-center text-x-gray">这条记录不存在，或已经删除。</p>
        ) : (
          <div data-scroll-root className="relative flex-1 overflow-y-auto px-4 pb-6">
            {mode === 'reply' && replyingTo && (
              <div className="flex gap-3">
                <div className="flex w-9 flex-col items-center">
                  <Avatar src={profile.avatar} name={profile.displayName} size={36} />
                  <div className="my-1 w-0.5 flex-1 rounded-full bg-x-border" />
                </div>
                <div className="min-w-0 flex-1 pb-4">
                  <p className="text-[15px] font-semibold">{profile.displayName}</p>
                  <p className="line-clamp-4 whitespace-pre-wrap break-words text-[15px] leading-[1.6] text-x-gray">{replyingTo.content}</p>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Avatar src={profile.avatar} name={profile.displayName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-5">{profile.displayName}</p>
                {initial.title && (
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="标题"
                    className="mt-1 w-full bg-transparent text-[18px] font-semibold outline-none placeholder:text-x-gray"
                  />
                )}
                <TextareaAutosize
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
                    if (files.length > 0 && mode !== 'reply') { e.preventDefault(); void addImages(files); }
                  }}
                  minRows={3}
                  placeholder={mode === 'reply' ? '接着写…' : '有什么新鲜事？'}
                  className="w-full resize-none bg-transparent pt-0.5 text-[calc(17px*var(--font-scale))] leading-[1.65] outline-none placeholder:text-x-gray"
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

                {xNote && (
                  <p className={cn('mt-3 flex items-start gap-1 text-[12px] leading-snug', xNote.warn ? 'text-x-danger' : 'text-x-gray')}>
                    <XLogo size={11} className="mt-px shrink-0" />
                    <span>{xNote.text}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rides on top of the keyboard, as in Threads. */}
        {!missing && (
          <div className="dock flex shrink-0 items-center gap-3 bg-x-dark px-4 pt-2">
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
                aria-checked={toX}
                onClick={() => setToX((value) => !value)}
                className={cn(
                  'pressable flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px]',
                  toX ? 'border-x-fg bg-x-fg font-semibold text-x-dark' : 'border-x-border text-x-gray',
                )}
              >
                <XLogo size={11} />
                {toX ? '同步' : '不同步'}
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
                className="pressable rounded-full bg-x-fg px-5 py-2 text-[15px] font-semibold text-x-dark disabled:opacity-30"
              >
                {mode === 'edit' ? '保存' : '发布'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppScreen>
  );
};

export default ComposeActivity;
