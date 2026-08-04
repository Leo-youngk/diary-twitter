'use client';

import React, {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import { Post, User, ToastMessage, NavItem, FeedTab, EntryType } from '@/lib/types';
import { currentUser as defaultUser, mockPosts } from '@/lib/mockData';
import { generateId } from '@/lib/utils';
import { exportPostAsMarkdown, exportPostsAsMarkdown } from '@/lib/export';
import {
  getSyncId, setSyncId, pullSync, pushSync,
  getLocalUpdatedAt, setLocalUpdatedAt, reconcile,
} from '@/lib/sync';

export type Theme = 'dark' | 'light' | 'zen';
export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error';

interface AppContextType {
  posts: Post[];
  currentUser: User;
  activeNav: NavItem;
  feedTab: FeedTab;
  toasts: ToastMessage[];
  isComposeOpen: boolean;
  replyingToPost: Post | null;
  theme: Theme;
  dbLoading: boolean;
  syncId: string;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  setActiveNav: (nav: NavItem) => void;
  setFeedTab: (tab: FeedTab) => void;
  toggleLike: (postId: string) => void;
  addPost: (content: string, images: string[], entryType: EntryType, title?: string) => void;
  deletePost: (postId: string) => void;
  addReply: (postId: string, content: string) => void;
  openCompose: () => void;
  closeCompose: () => void;
  openReply: (post: Post) => void;
  closeReply: () => void;
  addToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  searchPosts: (query: string) => Post[];
  exportPost: (post: Post) => void;
  exportAll: (posts: Post[], filename?: string) => void;
  setTheme: (theme: Theme) => void;
  updateUser: (updates: Partial<User>) => void;
  restoreFromSyncId: (id: string) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUser, setCurrentUser] = useState<User>(defaultUser);
  const [activeNav, setActiveNav] = useState<NavItem>('home');
  const [feedTab, setFeedTab] = useState<FeedTab>('all');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [replyingToPost, setReplyingToPost] = useState<Post | null>(null);
  const [theme, setThemeState] = useState<Theme>('dark');
  const [dbLoading, setDbLoading] = useState(true);
  const [syncId, setSyncIdState] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  // Counts real user edits. Hydration and adopting a remote copy deliberately
  // don't bump it — otherwise every boot would look newer than the remote and
  // last-write-wins would always pick the device that opened the app last.
  const [revision, setRevision] = useState(0);
  const persistedRevision = useRef(0);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotaWarned = useRef(false);
  const pushFailed = useRef(false);

  const bump = useCallback(() => setRevision((r) => r + 1), []);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);
  const removeToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    try { const t = localStorage.getItem('diary-theme'); if (t) setThemeState(JSON.parse(t)); } catch {}
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('dark', 'light', 'zen');
    html.classList.add(theme);
    try { localStorage.setItem('diary-theme', JSON.stringify(theme)); } catch {}
  }, [theme]);

  // ── Persistence ────────────────────────────────────────────────────────────
  const writeLocal = useCallback((nextPosts: Post[], nextUser: User, updatedAt: string) => {
    try {
      localStorage.setItem('diary-posts', JSON.stringify(nextPosts));
      localStorage.setItem('diary-user', JSON.stringify(nextUser));
      setLocalUpdatedAt(updatedAt);
    } catch {
      // Almost always QuotaExceededError from base64 images. Swallowing this is
      // how data silently fails to survive a reload, so say it out loud — once.
      if (!quotaWarned.current) {
        quotaWarned.current = true;
        addToast('本地存储已满，新内容可能无法保存。请先导出备份，再删除部分带图记录', 'error');
      }
    }
  }, [addToast]);

  const schedulePush = useCallback((nextPosts: Post[], nextUser: User, updatedAt: string) => {
    const id = getSyncId();
    if (!id) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    setSyncStatus('syncing');
    pushTimer.current = setTimeout(async () => {
      const ok = await pushSync(id, { posts: nextPosts, user: nextUser, updatedAt });
      setSyncStatus(ok ? 'ok' : 'error');
      if (ok) {
        setLastSyncedAt(updatedAt);
        pushFailed.current = false;
      } else if (!pushFailed.current) {
        // Only on the transition into failure — offline shouldn't spam toasts.
        pushFailed.current = true;
        addToast('云端同步失败，数据已保存在本机', 'error');
      }
    }, 800);
  }, [addToast]);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const id = getSyncId();
    setSyncIdState(id);

    let localPosts: Post[] | null = null;
    let localUser: User | null = null;
    try {
      const sp = localStorage.getItem('diary-posts');
      if (sp) localPosts = JSON.parse(sp);
      const su = localStorage.getItem('diary-user');
      if (su) localUser = JSON.parse(su);
    } catch {}

    setPosts(localPosts ?? mockPosts);
    setCurrentUser(localUser ?? defaultUser);
    // Local data is already in hand — render now and let the network catch up.
    setDbLoading(false);

    if (!id) return;

    setSyncStatus('syncing');
    pullSync(id)
      .then((remote) => {
        if (!mounted) return;
        const decision = reconcile(getLocalUpdatedAt(), remote);
        if (decision.action === 'adopt-remote') {
          const { posts: rp, user: ru, updatedAt } = decision.payload;
          setPosts(rp as Post[]);
          setCurrentUser(ru as User);
          // Keep the remote timestamp, so the next boot reconciles to 'none'.
          writeLocal(rp as Post[], ru as User, updatedAt);
          setLastSyncedAt(updatedAt);
          setSyncStatus('ok');
        } else if (decision.action === 'push-local') {
          const updatedAt = getLocalUpdatedAt() ?? new Date().toISOString();
          schedulePush(localPosts ?? mockPosts, localUser ?? defaultUser, updatedAt);
        } else {
          setLastSyncedAt(getLocalUpdatedAt());
          setSyncStatus('ok');
        }
      })
      .catch((err) => {
        console.warn('[sync] pull failed, using local data', err);
        if (mounted) setSyncStatus('error');
      });

    return () => { mounted = false; };
  }, [writeLocal, schedulePush]);

  // Single place that persists. Runs after render, never inside a state updater.
  useEffect(() => {
    if (revision === 0 || revision === persistedRevision.current) return;
    persistedRevision.current = revision;
    const updatedAt = new Date().toISOString();
    writeLocal(posts, currentUser, updatedAt);
    schedulePush(posts, currentUser, updatedAt);
  }, [revision, posts, currentUser, writeLocal, schedulePush]);

  const restoreFromSyncId = useCallback(async (id: string): Promise<boolean> => {
    try {
      const remote = await pullSync(id);
      if (!remote) return false;
      setSyncId(id);
      setSyncIdState(id);
      setPosts(remote.posts as Post[]);
      setCurrentUser(remote.user as User);
      writeLocal(remote.posts as Post[], remote.user as User, remote.updatedAt);
      setLastSyncedAt(remote.updatedAt);
      setSyncStatus('ok');
      return true;
    } catch {
      setSyncStatus('error');
      return false;
    }
  }, [writeLocal]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setCurrentUser((prev) => ({ ...prev, ...updates }));
    bump();
  }, [bump]);

  const toggleLike = useCallback((postId: string) => {
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, isLiked: !p.isLiked } : p)));
    bump();
  }, [bump]);

  const addPost = useCallback((
    content: string, images: string[], entryType: EntryType, title?: string
  ) => {
    const newPost: Post = {
      id: generateId(), entryType,
      title: title?.trim() || undefined,
      content, images,
      createdAt: new Date().toISOString(),
      replies: [], isLiked: false,
    };
    setPosts((prev) => [newPost, ...prev]);
    bump();
  }, [bump]);

  const deletePost = useCallback((postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    bump();
  }, [bump]);

  const addReply = useCallback((postId: string, content: string) => {
    const newReply = { id: generateId(), postId, content, createdAt: new Date().toISOString() };
    setPosts((prev) => prev.map((p) => (
      p.id === postId ? { ...p, replies: [...p.replies, newReply] } : p
    )));
    bump();
  }, [bump]);

  // ── Search / Export ────────────────────────────────────────────────────────
  const searchPosts = useCallback((query: string) => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return posts.filter((p) =>
      p.content.toLowerCase().includes(lower) ||
      p.title?.toLowerCase().includes(lower) ||
      p.tags?.some((t) => t.toLowerCase().includes(lower))
    );
  }, [posts]);
  const exportPost = useCallback((post: Post) => exportPostAsMarkdown(post), []);
  const exportAll = useCallback((postsToExport: Post[], filename?: string) => exportPostsAsMarkdown(postsToExport, filename), []);

  // ── Compose / Reply ────────────────────────────────────────────────────────
  const openCompose = useCallback(() => setIsComposeOpen(true), []);
  const closeCompose = useCallback(() => setIsComposeOpen(false), []);
  const openReply = useCallback((post: Post) => setReplyingToPost(post), []);
  const closeReply = useCallback(() => setReplyingToPost(null), []);

  return (
    <AppContext.Provider value={{
      posts, currentUser, activeNav, feedTab, toasts,
      isComposeOpen, replyingToPost, theme, dbLoading, syncId,
      syncStatus, lastSyncedAt,
      setActiveNav, setFeedTab, toggleLike, addPost, deletePost,
      addReply, openCompose, closeCompose, openReply, closeReply,
      addToast, removeToast, searchPosts, exportPost, exportAll,
      setTheme, updateUser, restoreFromSyncId,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
