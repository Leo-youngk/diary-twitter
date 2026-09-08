'use client';

import React, {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import { Post, User, ToastMessage, NavItem, FeedTab, EntryType } from '@/lib/types';
import { currentUser as defaultUser } from '@/lib/defaultData';
import { generateId } from '@/lib/utils';
import {
  exportPostAsMarkdown, exportPostsAsMarkdown,
  exportBackupAsJson, parseBackup,
  type DiaryBackup,
} from '@/lib/export';
import { Transaction, loadTransactions, saveTransactions } from '@/lib/ledger';
import {
  getSyncId, setSyncId, pullSync, pushSync,
  getLocalUpdatedAt, setLocalUpdatedAt, reconcile,
  hasPendingSync, markPendingSync, clearPendingSync,
} from '@/lib/sync';
import { idbGet, idbSet, idbSetMany } from '@/lib/idbStore';

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
  toggleLike: (postId: string) => Promise<boolean>;
  addPost: (content: string, images: string[], entryType: EntryType, title?: string, category?: string) => Promise<boolean>;
  updatePost: (postId: string, content: string, images: string[], entryType: EntryType, title?: string, category?: string) => Promise<boolean>;
  deletePost: (postId: string) => Promise<boolean>;
  addReply: (postId: string, content: string) => Promise<boolean>;
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
  updateUser: (updates: Partial<User>) => Promise<boolean>;
  restoreFromSyncId: (id: string) => Promise<boolean>;
  notifyLedgerChange: () => void;
  exportBackup: () => void;
  restoreBackup: (backup: DiaryBackup) => Promise<boolean>;
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

function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light' || value === 'zen';
}

function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const stored = localStorage.getItem('diary-theme');
    const parsed: unknown = stored ? JSON.parse(stored) : DEFAULT_THEME;
    return isTheme(parsed) ? parsed : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function applyTheme(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove('dark', 'light', 'zen');
  html.classList.add(theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.setAttribute('content', THEME_COLOR[theme]);
  });
  try { localStorage.setItem('diary-theme', JSON.stringify(theme)); } catch {}
}

const POSTS_KEY = 'diary-posts';
const USER_KEY = 'diary-user';

// Posts (with their base64 images) live in IndexedDB, whose quota is a share
// of free disk space rather than localStorage's small fixed cap — that's the
// actual fix for "storage full after a few image uploads". This one-time
// migration picks up anyone who still has data under the old localStorage
// keys and clears them afterwards to reclaim that space.
async function loadLocalData(): Promise<{ posts: Post[] | null; user: User | null }> {
  try {
    const [idbPosts, idbUser] = await Promise.all([
      idbGet<Post[]>(POSTS_KEY),
      idbGet<User>(USER_KEY),
    ]);
    if (idbPosts || idbUser) return { posts: idbPosts ?? null, user: idbUser ?? null };
  } catch {}

  let posts: Post[] | null = null;
  let user: User | null = null;
  try {
    const sp = localStorage.getItem(POSTS_KEY);
    if (sp) posts = JSON.parse(sp);
    const su = localStorage.getItem(USER_KEY);
    if (su) user = JSON.parse(su);
  } catch {}

  if (posts || user) {
    try {
      await Promise.all([
        posts ? idbSet(POSTS_KEY, posts) : Promise.resolve(),
        user ? idbSet(USER_KEY, user) : Promise.resolve(),
      ]);
      localStorage.removeItem(POSTS_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  }

  return { posts, user };
}

const DEFAULT_FONT_SIZE: FontSize = 'medium';

function readStoredFontSize(): FontSize {
  if (typeof window === 'undefined') return DEFAULT_FONT_SIZE;
  try {
    const stored = localStorage.getItem('diary-font-size');
    const parsed: unknown = stored ? JSON.parse(stored) : DEFAULT_FONT_SIZE;
    return parsed === 'small' || parsed === 'medium' || parsed === 'large' || parsed === 'xlarge'
      ? parsed
      : DEFAULT_FONT_SIZE;
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
  // Keep the server and first client render identical. The inline head script
  // has already painted the saved theme; React adopts it after hydration.
  const [themeState, setThemeState] = useState<Theme | null>(null);
  const [fontSizeState, setFontSizeState] = useState<FontSize | null>(null);
  const theme = themeState ?? DEFAULT_THEME;
  const fontSize = fontSizeState ?? DEFAULT_FONT_SIZE;
  const [dbLoading, setDbLoading] = useState(true);
  const [syncId, setSyncIdState] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quotaWarned = useRef(false);
  const pushFailed = useRef(false);
  const postsRef = useRef(posts);
  const userRef = useRef(currentUser);

  const setPostsSnapshot = useCallback((nextPosts: Post[]) => {
    postsRef.current = nextPosts;
    setPosts(nextPosts);
  }, []);
  const setUserSnapshot = useCallback((nextUser: User) => {
    userRef.current = nextUser;
    setCurrentUser(nextUser);
  }, []);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);
  const removeToast = useCallback((id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  // ── Theme ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (themeState === null) {
      setThemeState(readStoredTheme());
      return;
    }
    applyTheme(themeState);
  }, [themeState]);

  // ── Font size ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (fontSizeState === null) {
      setFontSizeState(readStoredFontSize());
      return;
    }
    document.documentElement.style.setProperty('--font-scale', String(FONT_SCALE[fontSizeState]));
    try { localStorage.setItem('diary-font-size', JSON.stringify(fontSizeState)); } catch {}
  }, [fontSizeState]);

  // ── Persistence ────────────────────────────────────────────────────────────
  const writeLocal = useCallback(async (
    nextPosts: Post[],
    nextUser: User,
    updatedAt: string,
    pending = true,
  ): Promise<boolean> => {
    try {
      await idbSetMany([[POSTS_KEY, nextPosts], [USER_KEY, nextUser]]);
      setLocalUpdatedAt(updatedAt);
      if (pending) markPendingSync();
      else clearPendingSync();
      return true;
    } catch {
      // A failed local write must be visible to the user instead of being
      // reported as a successful publish.
      if (!quotaWarned.current) {
        quotaWarned.current = true;
        addToast('本地保存失败，请先导出备份后重试', 'error');
      }
      return false;
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
      const result = await pushSync(id, { posts: nextPosts, user: nextUser, ledger, updatedAt });
      const isCurrentSnapshot = getLocalUpdatedAt() === updatedAt;
      if (result.ok) {
        if (isCurrentSnapshot) {
          clearPendingSync();
          setSyncStatus('ok');
          setLastSyncedAt(updatedAt);
        }
        pushFailed.current = false;
      } else if (result.conflict && isCurrentSnapshot) {
        // The server rejected an older snapshot. Adopt its newer copy only if
        // the user has not edited locally since this request was scheduled.
        const remote = result.conflict;
        const remotePosts = remote.posts as Post[];
        const remoteUser = remote.user as User;
        setPostsSnapshot(remotePosts);
        setUserSnapshot(remoteUser);
        if (Array.isArray(remote.ledger)) {
          saveTransactions(remote.ledger as Transaction[]);
          window.dispatchEvent(new Event('diary:ledger-changed'));
        }
        const saved = await writeLocal(remotePosts, remoteUser, remote.updatedAt, false);
        if (saved) {
          setLastSyncedAt(remote.updatedAt);
          setSyncStatus('ok');
        }
        pushFailed.current = false;
      } else if (isCurrentSnapshot && !pushFailed.current) {
        // Only on the transition into failure — offline shouldn't spam toasts.
        pushFailed.current = true;
        setSyncStatus('error');
        addToast('云端同步失败，数据已保存在本机', 'error');
      }
    }, 800);
  }, [addToast, setPostsSnapshot, setUserSnapshot, writeLocal]);

  const persistSnapshot = useCallback(async (nextPosts: Post[], nextUser: User): Promise<boolean> => {
    const updatedAt = new Date().toISOString();
    const saved = await writeLocal(nextPosts, nextUser, updatedAt);
    if (saved) schedulePush(nextPosts, nextUser, updatedAt);
    return saved;
  }, [schedulePush, writeLocal]);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const id = getSyncId();
    setSyncIdState(id);

    loadLocalData().then(({ posts: localPosts, user: localUser }) => {
      if (!mounted) return;
      const initialPosts = localPosts ?? [];
      const initialUser = localUser ?? defaultUser;
      setPostsSnapshot(initialPosts);
      setUserSnapshot(initialUser);
      // Local data is already in hand — render now and let the network catch up.
      setDbLoading(false);

      if (!id) return;

      setSyncStatus('syncing');
      const pullStartedAt = getLocalUpdatedAt();
      pullSync(id)
        .then((remote) => {
          if (!mounted) return;
          const localUpdatedAt = getLocalUpdatedAt();
          if (localUpdatedAt !== pullStartedAt) {
            // A local edit happened while the network request was in flight.
            // Keep that edit authoritative and let the server's version check
            // decide whether another device changed the same sync key.
            if (localUpdatedAt) schedulePush(postsRef.current, userRef.current, localUpdatedAt);
            return;
          }
          // Data created by an older build may exist without our local
          // timestamp. Keep that data instead of silently replacing it with a
          // remote copy; there is no reliable way to prove which copy is newer.
          const hasUnstampedLocalData = !localUpdatedAt
            && ((localPosts?.length ?? 0) > 0 || localUser !== null);
          if (hasUnstampedLocalData) {
            const updatedAt = new Date().toISOString();
            void writeLocal(initialPosts, initialUser, updatedAt).then((saved) => {
              if (saved && mounted) schedulePush(initialPosts, initialUser, updatedAt);
            });
            return;
          }
          const decision = reconcile(localUpdatedAt, remote);
          if (decision.action === 'adopt-remote') {
            const { posts: rp, user: ru, ledger: rl, updatedAt } = decision.payload;
            const remotePosts = rp as Post[];
            const remoteUser = ru as User;
            setPostsSnapshot(remotePosts);
            setUserSnapshot(remoteUser);
            if (Array.isArray(rl)) {
              saveTransactions(rl as Transaction[]);
              window.dispatchEvent(new Event('diary:ledger-changed'));
            }
            // Keep the remote timestamp, so the next boot reconciles to 'none'.
            void writeLocal(remotePosts, remoteUser, updatedAt, false);
            setLastSyncedAt(updatedAt);
            setSyncStatus('ok');
          } else if (decision.action === 'push-local') {
            const pushInitial = async () => {
              const updatedAt = localUpdatedAt ?? new Date().toISOString();
              if (!localUpdatedAt) {
                const saved = await writeLocal(initialPosts, initialUser, updatedAt);
                if (!saved || !mounted) return;
              }
              schedulePush(initialPosts, initialUser, updatedAt);
            };
            void pushInitial();
          } else if (hasPendingSync()) {
            const updatedAt = localUpdatedAt ?? new Date().toISOString();
            schedulePush(initialPosts, initialUser, updatedAt);
          } else {
            setLastSyncedAt(getLocalUpdatedAt());
            setSyncStatus('ok');
          }
        })
        .catch((err) => {
          console.warn('[sync] pull failed, using local data', err);
          if (mounted) setSyncStatus('error');
        });
    });

    const retryPending = () => {
      if (hasPendingSync()) {
        const updatedAt = getLocalUpdatedAt();
        if (updatedAt) schedulePush(postsRef.current, userRef.current, updatedAt);
      }
    };
    window.addEventListener('online', retryPending);
    document.addEventListener('visibilitychange', retryPending);
    return () => {
      mounted = false;
      if (pushTimer.current) clearTimeout(pushTimer.current);
      window.removeEventListener('online', retryPending);
      document.removeEventListener('visibilitychange', retryPending);
    };
  }, [schedulePush, setPostsSnapshot, setUserSnapshot, writeLocal]);

  const restoreFromSyncId = useCallback(async (id: string): Promise<boolean> => {
    try {
      const remote = await pullSync(id);
      if (!remote) return false;
      setSyncId(id);
      setSyncIdState(id);
      const remotePosts = remote.posts as Post[];
      const remoteUser = remote.user as User;
      setPostsSnapshot(remotePosts);
      setUserSnapshot(remoteUser);
      if (Array.isArray(remote.ledger)) {
        saveTransactions(remote.ledger as Transaction[]);
        window.dispatchEvent(new Event('diary:ledger-changed'));
      }
      const saved = await writeLocal(remotePosts, remoteUser, remote.updatedAt, false);
      if (!saved) return false;
      setLastSyncedAt(remote.updatedAt);
      setSyncStatus('ok');
      return true;
    } catch {
      setSyncStatus('error');
      return false;
    }
  }, [setPostsSnapshot, setUserSnapshot, writeLocal]);

  // Ledger keeps its own localStorage key and writes itself; this just piggybacks
  // on the same push cycle (and shared updatedAt) so its changes reach the cloud.
  const notifyLedgerChange = useCallback(() => {
    void persistSnapshot(postsRef.current, userRef.current);
  }, [persistSnapshot]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    setThemeState(t);
  }, []);
  const setFontSize = useCallback((s: FontSize) => setFontSizeState(s), []);

  const updateUser = useCallback((updates: Partial<User>): Promise<boolean> => {
    const nextUser = { ...userRef.current, ...updates };
    setUserSnapshot(nextUser);
    return persistSnapshot(postsRef.current, nextUser);
  }, [persistSnapshot, setUserSnapshot]);

  const toggleLike = useCallback((postId: string): Promise<boolean> => {
    const nextPosts = postsRef.current.map((p) => (
      p.id === postId ? { ...p, isLiked: !p.isLiked } : p
    ));
    setPostsSnapshot(nextPosts);
    return persistSnapshot(nextPosts, userRef.current);
  }, [persistSnapshot, setPostsSnapshot]);

  const addPost = useCallback((
    content: string, images: string[], entryType: EntryType, title?: string, category?: string
  ): Promise<boolean> => {
    const newPost: Post = {
      id: generateId(), entryType,
      category: category?.trim() || undefined,
      title: title?.trim() || undefined,
      content, images,
      createdAt: new Date().toISOString(),
      replies: [], isLiked: false,
    };
    const nextPosts = [newPost, ...postsRef.current];
    setPostsSnapshot(nextPosts);
    return persistSnapshot(nextPosts, userRef.current);
  }, [persistSnapshot, setPostsSnapshot]);

  const updatePost = useCallback((
    postId: string, content: string, images: string[], entryType: EntryType, title?: string, category?: string
  ): Promise<boolean> => {
    const nextPosts = postsRef.current.map((p) => (
      p.id === postId
        ? { ...p, content, images, entryType, title: title?.trim() || undefined, category: category?.trim() || undefined }
        : p
    ));
    setPostsSnapshot(nextPosts);
    return persistSnapshot(nextPosts, userRef.current);
  }, [persistSnapshot, setPostsSnapshot]);

  const deletePost = useCallback((postId: string): Promise<boolean> => {
    const nextPosts = postsRef.current.filter((p) => p.id !== postId);
    setPostsSnapshot(nextPosts);
    return persistSnapshot(nextPosts, userRef.current);
  }, [persistSnapshot, setPostsSnapshot]);

  const addReply = useCallback((postId: string, content: string): Promise<boolean> => {
    const newReply = { id: generateId(), postId, content, createdAt: new Date().toISOString() };
    const nextPosts = postsRef.current.map((p) => (
      p.id === postId ? { ...p, replies: [...p.replies, newReply] } : p
    ));
    setPostsSnapshot(nextPosts);
    return persistSnapshot(nextPosts, userRef.current);
  }, [persistSnapshot, setPostsSnapshot]);

  // ── Search / Export ────────────────────────────────────────────────────────
  const searchPosts = useCallback((query: string) => {
    if (!query.trim()) return [];
    const lower = query.toLowerCase();
    return posts.filter((p) =>
      p.content.toLowerCase().includes(lower) ||
      p.title?.toLowerCase().includes(lower) ||
      p.category?.toLowerCase().includes(lower) ||
      p.tags?.some((t) => t.toLowerCase().includes(lower))
    );
  }, [posts]);
  const exportPost = useCallback((post: Post) => exportPostAsMarkdown(post), []);
  const exportAll = useCallback((postsToExport: Post[], filename?: string) => exportPostsAsMarkdown(postsToExport, filename), []);
  const exportBackup = useCallback(() => {
    exportBackupAsJson({
      posts: postsRef.current,
      user: userRef.current,
      ledger: loadTransactions(),
    });
  }, []);
  const restoreBackup = useCallback(async (backup: DiaryBackup): Promise<boolean> => {
    setPostsSnapshot(backup.posts);
    setUserSnapshot(backup.user);
    saveTransactions(backup.ledger);
    window.dispatchEvent(new Event('diary:ledger-changed'));
    return persistSnapshot(backup.posts, backup.user);
  }, [persistSnapshot, setPostsSnapshot, setUserSnapshot]);

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
      exportBackup, restoreBackup,
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
