'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useApp } from '@/lib/context';
import { EntryType } from '@/lib/types';
import { compressImage, POST_IMAGE_OPTS } from '@/lib/image';
import Avatar from '@/components/ui/Avatar';

const MAX_CHARS_THOUGHT = 280;
const MAX_CHARS_DIARY = 2000;
const MAX_IMAGES = 4; // PostCard only renders the first 4
const DRAFT_KEY = 'diary-compose-draft';

interface Draft {
  content: string;
  title: string;
  entryType: EntryType;
}

function loadDraft(): Draft {
  if (typeof window === 'undefined') return { content: '', title: '', entryType: 'thought' };
  try {
    const stored = localStorage.getItem(DRAFT_KEY);
    return stored ? JSON.parse(stored) : { content: '', title: '', entryType: 'thought' };
  } catch { return { content: '', title: '', entryType: 'thought' }; }
}

export default function ComposeModal() {
  const { isComposeOpen, closeCompose, currentUser, addPost, addToast } = useApp();
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [entryType, setEntryType] = useState<EntryType>('thought');
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftLoaded = useRef(false);
  const postRef = useRef<() => void>(() => {});

  // Load draft when modal opens
  useEffect(() => {
    if (isComposeOpen && !draftLoaded.current) {
      const draft = loadDraft();
      if (draft.content || draft.title) {
        setContent(draft.content);
        setTitle(draft.title);
        setEntryType(draft.entryType);
      }
      draftLoaded.current = true;
    }
    if (!isComposeOpen) {
      draftLoaded.current = false;
    }
  }, [isComposeOpen]);

  // Auto-save draft
  useEffect(() => {
    if (!isComposeOpen) return;
    const timer = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ content, title, entryType }));
    }, 500);
    return () => clearTimeout(timer);
  }, [content, title, entryType, isComposeOpen]);

  // Grow the textarea with its content; CSS max-height turns it back into a scroller.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [content, entryType, isComposeOpen]);

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

  const handlePost = () => {
    if (!canPost) return;
    addPost(content.trim(), images, entryType, entryType === 'diary' ? title : undefined);
    addToast(entryType === 'diary' ? '日记发布成功！' : '随想发布成功！');
    setContent('');
    setImages([]);
    setTitle('');
    setEntryType('thought');
    localStorage.removeItem(DRAFT_KEY);
    closeCompose();
  };

  // Keep the latest handler reachable from the window-level key listener.
  postRef.current = handlePost;

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
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
              <path d="M10.59 12L4.54 5.96l1.42-1.42L12 10.59l6.04-6.05 1.42 1.42L13.41 12l6.05 6.04-1.42 1.42L12 13.41l-6.04 6.05-1.42-1.42L10.59 12z" />
            </svg>
          </button>
        </div>

        {/* Entry Type Selector */}
        <div className="px-4 pb-2">
          <div className="flex gap-2">
            <button
              onClick={() => setEntryType('thought')}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
                entryType === 'thought'
                  ? 'bg-x-blue text-white'
                  : 'bg-x-darker text-x-gray hover:text-white'
              }`}
            >
              随想
            </button>
            <button
              onClick={() => setEntryType('diary')}
              className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${
                entryType === 'diary'
                  ? 'bg-x-green text-white'
                  : 'bg-x-darker text-x-gray hover:text-white'
              }`}
            >
              日记
            </button>
          </div>
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
                className="w-full bg-transparent text-lg font-bold text-white placeholder-x-gray outline-none mb-2 border-b border-x-border pb-2"
              />
            )}
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={handlePaste}
              placeholder={entryType === 'diary' ? '写下今天的日记...' : '有什么随想？'}
              className="w-full bg-transparent text-xl text-white placeholder-x-gray outline-none resize-none min-h-[120px] max-h-[45vh] overflow-y-auto leading-7"
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
                      className="absolute top-2 left-2 bg-x-dark/70 rounded-full p-1 hover:bg-x-dark transition-colors"
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
                disabled={!canPost || uploading}
                title="Ctrl/⌘ + Enter"
                className={`font-bold rounded-full px-5 py-2 transition-colors disabled:bg-x-border disabled:text-x-gray disabled:cursor-not-allowed text-sm ${
                  canPost ? 'text-white' : ''
                } ${
                  entryType === 'diary' ? 'bg-x-green hover:bg-x-green/80' : 'bg-x-blue hover:bg-x-blue-hover'
                }`}
              >
                {entryType === 'diary' ? '发布日记' : '发布随想'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
