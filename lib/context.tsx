'use client';

import React, {
  createContext, useContext, useState, useCallback,
  useEffect, useRef, ReactNode,
} from 'react';
import { Post, User, ToastMessage, NavItem, FeedTab, EntryType } from '@/lib/types';
import { currentUser as defaultUser } from '@/lib/mockData';
import { generateId } from '@/lib/utils';
import { exportPostAsMarkdown, exportPostsAsMarkdown } from '@/lib/export';
import { supabase, rowToPost, postToRow, rowToUser, profileToRow } from '@/lib/supabase';

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
  sessionReady: boolean;   // false = no session → show auth gate
  isAnonymous: boolean;    // true = anonymous session (not synced)
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
  // Auth
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  bindEmail: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
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
  const [sessionReady, setSessionReady] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const userIdRef = useRef<string | null>(null);

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

  // ── Load user data from Supabase ───────────────────────────────────────────
  const loadUserData = useCallback(async (userId: string) => {
    // Migrate localStorage → Supabase (one-time)
    const migrationKey = `diary-supabase-migrated-${userId}`;
    if (!localStorage.getItem(migrationKey)) {
      try {
        const sp = localStorage.getItem('diary-posts');
        if (sp) {
          const oldPosts: Post[] = JSON.parse(sp);
          if (oldPosts.length > 0)
            await supabase.from('diary_posts').upsert(oldPosts.map(p => postToRow(p, userId)), { onConflict: 'id' });
        }
        const su = localStorage.getItem('diary-user');
        if (su) {
          const oldUser: User = JSON.parse(su);
          await supabase.from('diary_profile').upsert(
            profileToRow({ ...oldUser, id: userId }, userId), { onConflict: 'user_id' }
          );
        }
        localStorage.setItem(migrationKey, '1');
      } catch (e) { console.warn('[Migration]', e); }
    }

    // Load posts
    const { data: postRows } = await supabase
      .from('diary_posts').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (postRows) setPosts(postRows.map(rowToPost));

    // Load or create profile
    const { data: profileRow } = await supabase
      .from('diary_profile').select('*').eq('user_id', userId).single();
    if (profileRow) {
      setCurrentUser(rowToUser(profileRow, defaultUser));
    } else {
      const newProfile = profileToRow(
        { ...defaultUser, id: userId, joinedDate: new Date().toISOString().split('T')[0] }, userId
      );
      await supabase.from('diary_profile').insert(newProfile);
      setCurrentUser({ ...defaultUser, id: userId });
    }
  }, []);

  // ── Bootstrap on mount ─────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          // No session — show auth gate
          if (mounted) { setSessionReady(false); setDbLoading(false); }
          return;
        }
        const userId = session.user.id;
        userIdRef.current = userId;
        const anon = session.user.is_anonymous ?? false;
        if (mounted) { setIsAnonymous(anon); setSessionReady(true); }
        await loadUserData(userId);
      } catch (err) {
        console.error('[init]', err);
        // Fallback: try localStorage
        try {
          const sp = localStorage.getItem('diary-posts');
          if (sp && mounted) setPosts(JSON.parse(sp));
          const su = localStorage.getItem('diary-user');
          if (su && mounted) setCurrentUser(JSON.parse(su));
        } catch {}
        if (mounted) setSessionReady(true); // Let user in anyway
      } finally {
        if (mounted) setDbLoading(false);
      }
    }
    init();
    return () => { mounted = false; };
  }, [loadUserData]);

  // ── Auth methods ────────────────────────────────────────────────────────────

  /**
   * Unified login + signup.
   * Tries login first; if "Invalid login credentials", auto-creates the account.
   * Returns null on success, or an error string.
   */
  const signInWithEmail = useCallback(async (
    email: string, password: string
  ): Promise<string | null> => {
    const doLogin = async (em: string, pw: string) => {
      const { data, error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
      return { data, error };
    };

    // 1. Try login
    let { data: loginData, error: loginErr } = await doLogin(email, password);
    if (!loginErr && loginData.session) {
      const userId = loginData.session.user.id;
      userIdRef.current = userId;
      setIsAnonymous(false);
      setSessionReady(true);
      setDbLoading(true);
      await loadUserData(userId);
      setDbLoading(false);
      return null;
    }

    // 1b. Email exists but is unconfirmed → auto-confirm via server and retry
    if (loginErr?.message?.toLowerCase().includes('email not confirmed')) {
      const res = await fetch('/api/auth/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        // Retry login after confirmation
        const retry = await doLogin(email, password);
        if (!retry.error && retry.data.session) {
          const userId = retry.data.session.user.id;
          userIdRef.current = userId;
          setIsAnonymous(false);
          setSessionReady(true);
          setDbLoading(true);
          await loadUserData(userId);
          setDbLoading(false);
          return null;
        }
        return retry.error?.message || '登录失败，请重试';
      }
      return '登录失败，请重试';
    }

    // 2. If wrong credentials → try signup (first-time user)
    const isInvalid = loginErr?.message?.toLowerCase().includes('invalid login credentials')
      || loginErr?.message?.toLowerCase().includes('invalid');
    if (isInvalid) {
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({ email, password });
      if (signUpErr) {
        if (signUpErr.message.includes('already registered')) {
          return '密码错误，请重试';
        }
        return signUpErr.message;
      }

      // Use session from signUp directly (works when email confirmation is OFF)
      const session = signUpData.session;
      if (session) {
        const userId = session.user.id;
        userIdRef.current = userId;
        setIsAnonymous(false);
        setSessionReady(true);
        setDbLoading(true);
        await loadUserData(userId);
        setDbLoading(false);
        return null;
      }

      // Session is null → email confirmation is still ON in Supabase
      return '请前往 Supabase → Authentication → Email，关闭「Confirm email」后重试。';
    }

    return loginErr?.message || '登录失败，请重试';
  }, [loadUserData]);

  /**
   * Upgrade anonymous session to email account (bind email).
   * Preserves all existing data since user_id stays the same.
   */
  const bindEmail = useCallback(async (
    email: string, password: string
  ): Promise<string | null> => {
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) {
      // If email already in use, offer to sign in instead
      if (error.message.includes('already registered') || error.message.includes('already been registered')) {
        return '该邮箱已有账号，请先退出后再登录已有账号。';
      }
      return error.message;
    }
    setIsAnonymous(false);
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    userIdRef.current = null;
    setPosts([]);
    setCurrentUser(defaultUser);
    setIsAnonymous(false);
    setSessionReady(false);
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  const updateUser = useCallback(async (updates: Partial<User>) => {
    setCurrentUser((prev) => ({ ...prev, ...updates }));
    const uid = userIdRef.current;
    if (!uid) return;
    const dbMap: Record<string, unknown> = {};
    if (updates.displayName !== undefined) dbMap.display_name = updates.displayName;
    if (updates.username !== undefined) dbMap.username = updates.username;
    if (updates.bio !== undefined) dbMap.bio = updates.bio;
    if (updates.avatar !== undefined) dbMap.avatar = updates.avatar;
    if (updates.banner !== undefined) dbMap.banner = updates.banner;
    if (updates.joinedDate !== undefined) dbMap.joined_date = updates.joinedDate;
    await supabase.from('diary_profile').update(dbMap).eq('user_id', uid);
  }, []);

  const toggleLike = useCallback(async (postId: string) => {
    let newLiked = false;
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      newLiked = !p.isLiked;
      return { ...p, isLiked: newLiked };
    }));
    const uid = userIdRef.current;
    if (uid) await supabase.from('diary_posts').update({ is_liked: newLiked }).eq('id', postId).eq('user_id', uid);
  }, []);

  const addPost = useCallback(async (
    content: string, images: string[], entryType: EntryType, title?: string
  ) => {
    const newPost: Post = {
      id: generateId(), entryType,
      title: title?.trim() || undefined,
      content, images,
      createdAt: new Date().toISOString(),
      replies: [], isLiked: false, views: 0,
    };
    setPosts((prev) => [newPost, ...prev]);
    const uid = userIdRef.current;
    if (uid) await supabase.from('diary_posts').insert(postToRow(newPost, uid));
  }, []);

  const deletePost = useCallback(async (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    const uid = userIdRef.current;
    if (uid) await supabase.from('diary_posts').delete().eq('id', postId).eq('user_id', uid);
  }, []);

  const addReply = useCallback(async (postId: string, content: string) => {
    const newReply = { id: generateId(), postId, content, createdAt: new Date().toISOString() };
    let updatedReplies: Post['replies'] = [];
    setPosts((prev) => prev.map((p) => {
      if (p.id !== postId) return p;
      updatedReplies = [...p.replies, newReply];
      return { ...p, replies: updatedReplies };
    }));
    const uid = userIdRef.current;
    if (uid) await supabase.from('diary_posts').update({ replies: updatedReplies }).eq('id', postId).eq('user_id', uid);
  }, []);

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
      isComposeOpen, replyingToPost, theme, dbLoading,
      sessionReady, isAnonymous,
      setActiveNav, setFeedTab, toggleLike, addPost, deletePost,
      addReply, openCompose, closeCompose, openReply, closeReply,
      addToast, removeToast, searchPosts, exportPost, exportAll,
      setTheme, updateUser, signInWithEmail, bindEmail, signOut,
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
