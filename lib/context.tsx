'use client';

import React, {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import { Post, User, ToastMessage, NavItem, FeedTab, EntryType } from '@/lib/types';
import { currentUser as defaultUser, mockPosts } from '@/lib/mockData';
import { generateId } from '@/lib/utils';
import { exportPostAsMarkdown, exportPostsAsMarkdown } from '@/lib/export';
import { getSyncId, setSyncId, pullSync, pushSync } from '@/lib/sync';

export type Theme = 'dark' | 'light' | 'zen';

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
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Theme (localStorage only) ───────────────────────────────────────────────
  useEffect(() => {
    try { const t = localStorage.getItem('diary-theme'); if (t) setThemeState(JSON.parse(t)); } catch {}
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
      html.classList.remove('light', 'zen');
    } else if (theme === 'light') {
      html.classList.add('light');
      html.classList.remove('dark', 'zen');
    } else {
      html.classList.add('zen');
      html.classList.remove('dark', 'light');
    }
    try { localStorage.setItem('diary-theme', JSON.stringify(theme)); } catch {}
  }, [theme]);

  // ── Bootstrap: load from localStorage, then reconcile with remote KV ────────
  useEffect(() => {
    let mounted = true;
    async function init() {
      const id = getSyncId();
      if (mounted) setSyncIdState(id);

      let localPosts: Post[] | null = null;
      let localUser: User | null = null;
      try {
        const sp = localStorage.getItem('diary-posts');
        if (sp) localPosts = JSON.parse(sp);
        const su = localStorage.getItem('diary-user');
        if (su) localUser = JSON.parse(su);
      } catch {}

      if (mounted) {
        setPosts(localPosts ?? mockPosts);
        setCurrentUser(localUser ?? defaultUser);
      }

      if (id) {
        try {
          const remote = await pullSync(id);
          if (remote && mounted) {
            setPosts(remote.posts as Post[]);
            setCurrentUser(remote.user as User);
          } else if (localPosts) {
            // No remote copy yet — push what we have locally.
            await pushSync(id, { posts: localPosts, user: localUser ?? defaultUser, updatedAt: new Date().toISOString() });
          }
        } catch (err) {
          console.warn('[sync] pull failed, using local data', err);
        }
      }

      if (mounted) setDbLoading(false);
    }
    init();
    return () => { mounted = false; };
  }, []);

  // ── Persist to localStorage + debounced push to KV ──────────────────────────
  const persist = useCallback((nextPosts: Post[], nextUser: User) => {
    try {
      localStorage.setItem('diary-posts', JSON.stringify(nextPosts));
      localStorage.setItem('diary-user', JSON.stringify(nextUser));
    } catch {}

    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      const id = getSyncId();
      if (id) pushSync(id, { posts: nextPosts, user: nextUser, updatedAt: new Date().toISOString() });
    }, 800);
  }, []);

  const restoreFromSyncId = useCallback(async (id: string): Promise<boolean> => {
    const remote = await pullSync(id);
    if (!remote) return false;
    setSyncId(id);
    setSyncIdState(id);
    setPosts(remote.posts as Post[]);
    setCurrentUser(remote.user as User);
    try {
      localStorage.setItem('diary-posts', JSON.stringify(remote.posts));
      localStorage.setItem('diary-user', JSON.stringify(remote.user));
    } catch {}
    return true;
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setCurrentUser((prev) => {
      const next = { ...prev, ...updates };
      persist(posts, next);
      return next;
    });
  }, [persist, posts]);

  const toggleLike = useCallback((postId: string) => {
    setPosts((prev) => {
      const next = prev.map((p) => p.id === postId ? { ...p, isLiked: !p.isLiked } : p);
      persist(next, currentUser);
      return next;
    });
  }, [persist, currentUser]);

  const addPost = useCallback((
    content: string, images: string[], entryType: EntryType, title?: string
  ) => {
    const newPost: Post = {
      id: generateId(), entryType,
      title: title?.trim() || undefined,
      content, images,
      createdAt: new Date().toISOString(),
      replies: [], isLiked: false, views: 0,
    };
    setPosts((prev) => {
      const next = [newPost, ...prev];
      persist(next, currentUser);
      return next;
    });
  }, [persist, currentUser]);

  const deletePost = useCallback((postId: string) => {
    setPosts((prev) => {
      const next = prev.filter((p) => p.id !== postId);
      persist(next, currentUser);
      return next;
    });
  }, [persist, currentUser]);

  const addReply = useCallback((postId: string, content: string) => {
    const newReply = { id: generateId(), postId, content, createdAt: new Date().toISOString() };
    setPosts((prev) => {
      const next = prev.map((p) => p.id === postId ? { ...p, replies: [...p.replies, newReply] } : p);
      persist(next, currentUser);
      return next;
    });
  }, [persist, currentUser]);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);
  const removeToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

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
