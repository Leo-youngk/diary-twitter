'use client';

import React, {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import { Post, User, ToastMessage, NavItem, FeedTab, EntryType } from '@/lib/types';
import { currentUser as defaultUser, mockPosts } from '@/lib/mockData';
import { generateId } from '@/lib/utils';
import { exportPostAsMarkdown, exportPostsAsMarkdown } from '@/lib/export';
import { Transaction, loadTransactions, saveTransactions } from '@/lib/ledger';
import {
  getSyncId, setSyncId, pullSync, pushSync,
  getLocalUpdatedAt, setLocalUpdatedAt, reconcile,
} from '@/lib/sync';

export type Theme = 'dark' | 'light' | 'zen';
export type FontSize = 'small' | 'medium' | 'large' | 'xlarge';
export type SyncStatus = 'idle' | 'syncing' | 'ok' | 'error';

export const FONT_SCALE: Record<FontSize, number> = {
  small: 0.9,
  medium: 1,
  large: 1.15,
  xlarge: 1.3,
};

interface AppContextType {
  posts: Post[];
  currentUser: User;
  activeNav: NavItem;
  feedTab: FeedTab;
  toasts: ToastMessage[];
  isComposeOpen: boolean;
  editingPost: Post | null;
  replyingToPost: Post | null;
  theme: Theme;
  fontSize: FontSize;
  dbLoading: boolean;
  syncId: string;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  setActiveNav: (nav: NavItem) => void;
  setFeedTab: (tab: FeedTab) => void;
  toggleLike: (postId: string) => void;
  addPost: (content: string, images: string[], entryType: EntryType, title?: string) => void;
  updatePost: (postId: string, content: string, images: string[], entryType: EntryType, title?: string) => void;
  deletePost: (postId: string) => void;
  addReply: (postId: string, content: string) => void;
  openCompose: () => void;
  closeCompose: () => void;
  openEdit: (post: Post) => void;
  openReply: (post: Post) => void;
  closeReply: () => void;
  addToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;
  searchPosts: (query: string) => Post[];
  exportPost: (post: Post) => void;
  exportAll: (posts: Post[], filename?: string) => void;
  setTheme: (theme: Theme) => void;
  setFontSize: (size: FontSize) => void;
  updateUser: (updates: Partial<User>) => void;
  restoreFromSyncId: (id: string) => Promise<boolean>;
  notifyLedgerChange: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const DEFAULT_THEME: Theme = 'zen';

// iOS paints the standalone PWA's status bar with theme-color. Keep in step
// with the pre-paint script in app/layout.tsx.
const THEME_COLOR: Record<Theme, string> = {
  dark: '#000000',
  light: '#ffffff',
  zen: '#f5f0e8',
};

// Must agree with the pre-paint script in app/layout.tsx: that script has
// already put the right class on <html>, so starting from a different value
// here would make the first effect overwrite it — and persist the wrong theme.
function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem('diary-theme');
    return stored ? JSON.parse(stored) : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

const DEFAULT_FONT_SIZE: FontSize = 'medium';

function readStoredFontSize(): FontSize {
  if (typeof window === 'undefined') return DEFAULT_FONT_SIZE;
  try {
    const stored = localStorage.getItem('diary-font-size');
    return stored ? (JSON.parse(stored) as FontSize) : DEFAULT_FONT_SIZE;
  } catch {
    return DEFAULT_FONT_SIZE;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [currentUser, setCurrentUser] = useState<User>(defaultUser);
  const [activeNav, setActiveNav] = useState<NavItem>('home');
  const [feedTab, setFeedTab] = useState<FeedTab>('all');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [replyingToPost, setReplyingToPost] = useState<Post | null>(null);
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [fontSize, setFontSizeState] = useState<FontSize>(readStoredFontSize);
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
    const html = document.documentElement;
    html.classList.remove('dark', 'light', 'zen');
    html.classList.add(theme);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', THEME_COLOR[theme]);
    try { localStorage.setItem('diary-theme', JSON.stringify(theme)); } catch {}
  }, [theme]);

  // ── Font size ──────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', String(FONT_SCALE[fontSize]));
    try { localStorage.setItem('diary-font-size', JSON.stringify(fontSize)); } catch {}
  }, [fontSize]);

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
      // Ledger is a separate, isolated module with its own localStorage key and
      // its own writer (app/ledger/page.tsx) — read the freshest copy off disk
      // here rather than threading it through every caller of schedulePush.
      const ledger = loadTransactions();
      const ok = await pushSync(id, { posts: nextPosts, user: nextUser, ledger, updatedAt });
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
          const { posts: rp, user: ru, ledger: rl, updatedAt } = decision.payload;
          setPosts(rp as Post[]);
          setCurrentUser(ru as User);
          if (Array.isArray(rl)) saveTransactions(rl as Transaction[]);
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
      if (Array.isArray(remote.ledger)) saveTransactions(remote.ledger as Transaction[]);
      writeLocal(remote.posts as Post[], remote.user as User, remote.updatedAt);
      setLastSyncedAt(remote.updatedAt);
      setSyncStatus('ok');
      return true;
    } catch {
      setSyncStatus('error');
      return false;
    }
  }, [writeLocal]);

  // Ledger keeps its own localStorage key and writes itself; this just piggybacks
  // on the same push cycle (and shared updatedAt) so its changes reach the cloud.
  const notifyLedgerChange = useCallback(() => {
    const updatedAt = new Date().toISOString();
    setLocalUpdatedAt(updatedAt);
    schedulePush(posts, currentUser, updatedAt);
  }, [posts, currentUser, schedulePush]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const setFontSize = useCallback((s: FontSize) => setFontSizeState(s), []);

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

  const updatePost = useCallback((
    postId: string, content: string, images: string[], entryType: EntryType, title?: string
  ) => {
    setPosts((prev) => prev.map((p) => (
      p.id === postId ? { ...p, content, images, entryType, title: title?.trim() || undefined } : p
    )));
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
  const closeCompose = useCallback(() => { setIsComposeOpen(false); setEditingPost(null); }, []);
  const openEdit = useCallback((post: Post) => { setEditingPost(post); setIsComposeOpen(true); }, []);
  const openReply = useCallback((post: Post) => setReplyingToPost(post), []);
  const closeReply = useCallback(() => setReplyingToPost(null), []);

  return (
    <AppContext.Provider value={{
      posts, currentUser, activeNav, feedTab, toasts,
      isComposeOpen, editingPost, replyingToPost, theme, fontSize, dbLoading, syncId,
      syncStatus, lastSyncedAt,
      setActiveNav, setFeedTab, toggleLike, addPost, updatePost, deletePost,
      addReply, openCompose, closeCompose, openEdit, openReply, closeReply,
      addToast, removeToast, searchPosts, exportPost, exportAll,
      setTheme, setFontSize, updateUser, restoreFromSyncId, notifyLedgerChange,
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
