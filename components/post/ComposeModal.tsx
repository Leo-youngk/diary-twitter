'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import TextareaAutosize from 'react-textarea-autosize';
import { useApp } from '@/lib/context';
import { EntryType } from '@/lib/types';
import { getCustomCategoryNames, MAX_CUSTOM_CATEGORY_LENGTH, RESERVED_CATEGORY_NAMES } from '@/lib/categories';
import { compressImage, POST_IMAGE_OPTS } from '@/lib/image';
import Avatar from '@/components/ui/Avatar';

const MAX_CHARS_THOUGHT = 280;
const MAX_CHARS_DIARY = 2000;
const MAX_IMAGES = 4; // PostCard only renders the first 4
const DRAFT_KEY = 'diary-compose-draft';

const EMPTY_DRAFT: Draft = { content: '', title: '', entryType: 'thought', category: '' };

interface Draft {
  content: string;
  title: string;
  entryType: EntryType;
  category: string;
}

function loadDraft(): Draft {
  if (typeof window === 'undefined') return EMPTY_DRAFT;
  try {
    const stored = localStorage.getItem(DRAFT_KEY);
    if (!stored) return EMPTY_DRAFT;
    const value: unknown = JSON.parse(stored);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_DRAFT;
    const draft = value as Partial<Draft>;
    return {
      content: typeof draft.content === 'string' ? draft.content : '',
      title: typeof draft.title === 'string' ? draft.title : '',
      entryType: draft.entryType === 'diary' ? 'diary' : 'thought',
      category: typeof draft.category === 'string' ? draft.category : '',
    };
  } catch { return EMPTY_DRAFT; }
}

export default function ComposeModal() {
  const { isComposeOpen, editingPost, closeCompose, currentUser, posts, addPost, updatePost, addToast } = useApp();
  const isEditing = editingPost !== null;
  const customCategories = getCustomCategoryNames(posts);
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [entryType, setEntryType] = useState<EntryType>('thought');
  const [category, setCategory] = useState('');
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [categoryInput, setCategoryInput] = useState('');
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftLoaded = useRef(false);
  const postRef = useRef<() => void | Promise<void>>(() => {});
  const categoryOptions = category && !customCategories.includes(category)
    ? [category, ...customCategories]
    : customCategories;

  // Load the post being edited, or the saved draft, when the modal opens.
  useEffect(() => {
    if (isComposeOpen && !draftLoaded.current) {
      if (editingPost) {
        setContent(editingPost.content);
        setTitle(editingPost.title ?? '');
        setEntryType(editingPost.entryType);
        setCategory(editingPost.category ?? '');
        setImages(editingPost.images);
      } else {
        const draft = loadDraft();
        setContent(draft.content);
        setTitle(draft.title);
        setEntryType(draft.entryType);
        setCategory(draft.category);
        setImages([]);
      }
      draftLoaded.current = true;
    }
    if (!isComposeOpen) {
      draftLoaded.current = false;
    }
  }, [isComposeOpen, editingPost]);

  // Auto-save draft — skipped while editing an existing post, since that
  // content already lives in the post itself and shouldn't leak into the
  // next new-post draft.
  useEffect(() => {
    if (!isComposeOpen || isEditing) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ content, title, entryType, category })); } catch {}
    }, 500);
    return () => clearTimeout(timer);
  }, [content, title, entryType, category, isComposeOpen, isEditing]);

  // Esc closes, Cmd/Ctrl+Enter publishes — bound at the window so it works
  // regardless of which field has focus.
  useEffect(() => {
    if (!isComposeOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCompose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        postRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isComposeOpen, closeCompose]);

  const maxChars = entryType === 'diary' ? MAX_CHARS_DIARY : MAX_CHARS_THOUGHT;
  const charCount = content.length;
  const isOverLimit = charCount > maxChars;
  const canPost = content.trim().length > 0 && !isOverLimit;

  const selectCategory = (name: string) => {
    setCategory((current) => current === name ? '' : name);
    setShowCategoryInput(false);
  };

  const selectBuiltInType = (type: 'thought' | 'diary') => {
    setEntryType(type);
    setCategory('');
    setShowCategoryInput(false);
  };

  const handleAddCategory = () => {
    const name = categoryInput.trim();
    if (!name) {
      addToast('请输入分类名称', 'info');
      return;
    }
    if (name.length > MAX_CUSTOM_CATEGORY_LENGTH) {
      addToast(`分类名称不能超过 ${MAX_CUSTOM_CATEGORY_LENGTH} 个字`, 'error');
      return;
    }
    if (RESERVED_CATEGORY_NAMES.has(name)) {
      addToast('这个名称已被系统分类使用，请换一个', 'info');
      return;
    }

    const existing = customCategories.find((item) => item.toLocaleLowerCase() === name.toLocaleLowerCase());
    setCategory(existing ?? name);
    setCategoryInput('');
    setShowCategoryInput(false);
  };

  const handlePost = useCallback(async () => {
    if (!canPost || saving) return;
    setSaving(true);
    const finalTitle = entryType === 'diary' ? title : undefined;
    const finalCategory = category.trim() || undefined;
    try {
      const saved = editingPost
        ? await updatePost(editingPost.id, content.trim(), images, entryType, finalTitle, finalCategory)
        : await addPost(content.trim(), images, entryType, finalTitle, finalCategory);
      if (!saved) {
        addToast('本机保存失败，内容已保留，请重试', 'error');
        return;
      }
      if (editingPost) {
        addToast('已更新');
      } else {
        addToast(finalCategory ? `已归入「${finalCategory}」` : entryType === 'diary' ? '日记发布成功！' : '随想发布成功！');
        try { localStorage.removeItem(DRAFT_KEY); } catch {}
      }
      setContent('');
      setImages([]);
      setTitle('');
      setEntryType('thought');
      setCategory('');
      setCategoryInput('');
      setShowCategoryInput(false);
      closeCompose();
    } finally {
      setSaving(false);
    }
  }, [addPost, addToast, canPost, category, closeCompose, content, editingPost, entryType, images, saving, title, updatePost]);

  // Keep the latest handler reachable from the window-level key listener.
  useEffect(() => {
    postRef.current = handlePost;
  }, [handlePost]);

  const addImageFiles = async (files: File[]) => {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      addToast(`最多只能添加 ${MAX_IMAGES} 张图片`, 'info');
      return;
    }
    setUploading(true);
    try {
      const encoded = await Promise.all(
        files.slice(0, room).map((file) => compressImage(file, POST_IMAGE_OPTS))
      );
      setImages((prev) => [...prev, ...encoded]);
    } catch {
      addToast('图片处理失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (files.length > 0) addImageFiles(files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    addImageFiles(files);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  if (!isComposeOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={closeCompose} />
      <div className="relative bg-x-dark rounded-2xl w-full max-w-[600px] mt-12 mx-4 shadow-2xl border border-x-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={closeCompose} className="p-2 rounded-full hover:bg-x-hover transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-x-fg">
              <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z" />
            </svg>
          </button>
          {isEditing && <span className="font-bold">编辑</span>}
        </div>

        {/* Peer-level built-in and custom category selector */}
        <div className="px-4 pb-3 space-y-2">
          <div className="flex min-w-0 flex-wrap gap-2">
            <button
              onClick={() => selectBuiltInType('thought')}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
                !category && entryType === 'thought'
                  ? 'bg-x-blue text-white'
                  : 'bg-x-darker text-x-gray hover:text-x-fg'
              }`}
            >
              随想
            </button>
            <button
              onClick={() => selectBuiltInType('diary')}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
                !category && entryType === 'diary'
                  ? 'bg-x-green text-white'
                  : 'bg-x-darker text-x-gray hover:text-x-fg'
              }`}
            >
              日记
            </button>
            {categoryOptions.map((name) => (
              <button
                key={name}
                onClick={() => selectCategory(name)}
                className={`max-w-full truncate px-3 py-1.5 rounded-full text-sm transition-colors ${
                  category === name ? 'bg-violet-500/15 text-violet-600 dark:text-violet-400 font-bold' : 'bg-x-darker text-x-gray hover:text-x-fg'
                }`}
                title={name}
              >
                {name}
              </button>
            ))}
            <button
              onClick={() => { setCategoryInput(''); setShowCategoryInput(true); }}
              aria-expanded={showCategoryInput}
              className="px-3 py-1.5 rounded-full text-sm text-x-blue bg-x-blue/10 hover:bg-x-blue/20 transition-colors"
            >
              ＋添加分类
            </button>
          </div>

          {showCategoryInput && (
            <div className="flex items-center gap-2 rounded-xl bg-x-darker p-2">
              <input
                type="text"
                value={categoryInput}
                maxLength={MAX_CUSTOM_CATEGORY_LENGTH}
                onChange={(e) => setCategoryInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCategory();
                  }
                }}
                placeholder="输入分类名称"
                aria-label="自定义分类名称"
                autoFocus
                className="min-w-0 flex-1 bg-transparent px-2 py-1 text-sm text-x-fg placeholder-x-gray outline-none"
              />
              <button
                onClick={handleAddCategory}
                className="shrink-0 rounded-full bg-x-blue px-3 py-1 text-sm font-bold text-white hover:bg-x-blue-hover transition-colors"
              >
                添加
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex gap-3 px-4 pb-4">
          <Avatar src={currentUser.avatar} alt={currentUser.displayName} size="md" />
          <div className="flex-1 min-w-0">
            {/* Title input for diary */}
            {entryType === 'diary' && (
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="日记标题（可选）"
                className="w-full bg-transparent text-lg font-bold text-x-fg placeholder-x-gray outline-none mb-2 border-b border-x-border pb-2"
              />
            )}
            <TextareaAutosize
              value={content}
              onChange={(e) => {
                const el = e.target;
                setContent(el.value);
                // Voice-input IMEs insert whole sentences programmatically, which
                // doesn't trigger the browser's native "scroll caret into view" —
                // so when the caret is at the end, force it visible ourselves.
                if (el.selectionStart === el.value.length) {
                  requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
                }
              }}
              onPaste={handlePaste}
              placeholder={entryType === 'diary' ? '写下今天的日记...' : '有什么随想？'}
              className="w-full bg-transparent text-xl text-x-fg placeholder-x-gray outline-none resize-none min-h-[120px] max-h-[45vh] overflow-y-auto leading-7"
              autoFocus
            />

            {/* Image Previews */}
            {(images.length > 0 || uploading) && (
              <div className="grid grid-cols-2 gap-1 mt-2 rounded-2xl overflow-hidden">
                {uploading && (
                  <div className="relative aspect-square bg-x-darker flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-x-blue border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {images.map((img, index) => (
                  <div key={index} className="relative aspect-square">
                    <Image src={img} alt={`Upload ${index + 1}`} fill className="object-cover" unoptimized />
                    <button
                      onClick={() => removeImage(index)}
                      className="absolute top-2 left-2 bg-black/60 rounded-full p-1 hover:bg-black/80 transition-colors"
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                        <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-x-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading || images.length >= MAX_IMAGES}
                aria-label="添加图片"
                className="p-2 rounded-full hover:bg-x-blue/10 text-x-blue transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
                  <path d="M3 5.5C3 4.119 4.119 3 5.5 3h13C19.881 3 21 4.119 21 5.5v13c0 1.381-1.119 2.5-2.5 2.5h-13C4.119 21 3 19.881 3 18.5v-13zM5.5 5c-.276 0-.5.224-.5.5v9.086l3-3 3 3 5-5 3 3V5.5c0-.276-.224-.5-.5-.5h-13zM19 15.414l-3-3-5 5-3-3-3 3V18.5c0 .276.224.5.5.5h13c.276 0 .5-.224.5-.5v-3.086zM9.75 7C8.784 7 8 7.784 8 8.75s.784 1.75 1.75 1.75 1.75-.784 1.75-1.75S10.716 7 9.75 7z" />
                </svg>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
            </div>

            <div className="flex items-center gap-3">
              {charCount > 0 && (
                <div className="flex items-center gap-2">
                  <div className="relative w-6 h-6">
                    <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" fill="none" stroke="#2f3336" strokeWidth="2" />
                      <circle
                        cx="12" cy="12" r="10" fill="none"
                        stroke={isOverLimit ? '#f4212e' : charCount > maxChars * 0.9 ? '#ffd400' : entryType === 'diary' ? '#00ba7c' : '#1d9bf0'}
                        strokeWidth="2"
                        strokeDasharray={`${Math.min((charCount / maxChars) * 62.83, 62.83)} 62.83`}
                      />
                    </svg>
                  </div>
                  {isOverLimit && <span className="text-x-danger text-sm font-bold">{maxChars - charCount}</span>}
                </div>
              )}
              <button
                onClick={handlePost}
                disabled={!canPost || uploading || saving}
                title="Ctrl/⌘ + Enter"
                className={`font-bold rounded-full px-5 py-2 transition-colors disabled:bg-x-border disabled:text-x-gray disabled:cursor-not-allowed text-sm ${
                  canPost ? 'text-white' : ''
                } ${
                  entryType === 'diary' ? 'bg-x-green hover:bg-x-green/80' : 'bg-x-blue hover:bg-x-blue-hover'
                }`}
              >
                {isEditing ? '保存' : entryType === 'diary' ? '发布日记' : '发布随想'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
