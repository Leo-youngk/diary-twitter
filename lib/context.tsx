'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { Post, User, ToastMessage, NavItem, FeedTab, EntryType } from '@/lib/types';
import { mockPosts, currentUser as mockCurrentUser } from '@/lib/mockData';
import { generateId } from '@/lib/utils';
import { exportPostAsMarkdown, exportPostsAsMarkdown } from '@/lib/export';

export type Theme = 'dark' | 'light';

interface AppState {
  posts: Post[];
  currentUser: User;
  activeNav: NavItem;
  feedTab: FeedTab;
  toasts: ToastMessage[];
  isComposeOpen: boolean;
  replyingToPost: Post | null;
  theme: Theme;
}

interface AppContextType extends AppState {
  setActiveNav: (nav: NavItem) => void;
  setFeedTab: (tab: FeedTab) => void;
  toggleLike: (postId: string) => void;
  addPost: (content: string, images: string[], entryType: EntryType, title?: string) => void;
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [posts, setPosts] = useState<Post[]>(mockPosts);
  const [currentUser, setCurrentUser] = useState<User>(mockCurrentUser);
  const [activeNav, setActiveNav] = useState<NavItem>('home');
  const [feedTab, setFeedTab] = useState<FeedTab>('all');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [replyingToPost, setReplyingToPost] = useState<Post | null>(null);
  const [theme, setThemeState] = useState<Theme>('dark');
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage after hydration
  useEffect(() => {
    try {
      const storedPosts = localStorage.getItem('diary-posts');
      if (storedPosts) setPosts(JSON.parse(storedPosts));
      const storedUser = localStorage.getItem('diary-user');
      if (storedUser) setCurrentUser(JSON.parse(storedUser));
      const storedTheme = localStorage.getItem('diary-theme');
      if (storedTheme) setThemeState(JSON.parse(storedTheme));
    } catch {}
    setHydrated(true);
  }, []);

  // Persist posts to localStorage
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('diary-posts', JSON.stringify(posts));
  }, [posts, hydrated]);

  // Persist user to localStorage
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('diary-user', JSON.stringify(currentUser));
  }, [currentUser, hydrated]);

  // Apply theme
  useEffect(() => {
    const html = document.documentElement;
    if (theme === 'dark') {
      html.classList.add('dark');
      html.classList.remove('light');
    } else {
      html.classList.add('light');
      html.classList.remove('dark');
    }
    if (hydrated) {
      localStorage.setItem('diary-theme', JSON.stringify(theme));
    }
  }, [theme, hydrated]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setCurrentUser((prev) => ({ ...prev, ...updates }));
  }, []);

  const toggleLike = useCallback((postId: string) => {
    setPosts((prev) =>
      prev.map((post) => {
        if (post.id !== postId) return post;
        return { ...post, isLiked: !post.isLiked };
      })
    );
  }, []);

  const addPost = useCallback(
    (content: string, images: string[], entryType: EntryType, title?: string) => {
      const newPost: Post = {
        id: generateId(),
        entryType,
        title: title?.trim() || undefined,
        content,
        images,
        createdAt: new Date().toISOString(),
        replies: [],
        isLiked: false,
        views: 0,
      };
      setPosts((prev) => [newPost, ...prev]);
    },
    []
  );

  const addReply = useCallback(
    (postId: string, content: string) => {
      const newReply = {
        id: generateId(),
        postId,
        content,
        createdAt: new Date().toISOString(),
      };
      setPosts((prev) =>
        prev.map((post) => {
          if (post.id !== postId) return post;
          return { ...post, replies: [...post.replies, newReply] };
        })
      );
    },
    []
  );

  const openCompose = useCallback(() => setIsComposeOpen(true), []);
  const closeCompose = useCallback(() => setIsComposeOpen(false), []);
  const openReply = useCallback((post: Post) => setReplyingToPost(post), []);
  const closeReply = useCallback(() => setReplyingToPost(null), []);

  const addToast = useCallback((message: string, type: ToastMessage['type'] = 'success') => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const searchPosts = useCallback(
    (query: string) => {
      if (!query.trim()) return [];
      const lower = query.toLowerCase();
      return posts.filter(
        (p) =>
          p.content.toLowerCase().includes(lower) ||
          p.title?.toLowerCase().includes(lower) ||
          p.tags?.some((t) => t.toLowerCase().includes(lower))
      );
    },
    [posts]
  );

  const exportPost = useCallback((post: Post) => {
    exportPostAsMarkdown(post);
  }, []);

  const exportAll = useCallback((postsToExport: Post[], filename?: string) => {
    exportPostsAsMarkdown(postsToExport, filename);
  }, []);

  return (
    <AppContext.Provider
      value={{
        posts,
        currentUser,
        activeNav,
        feedTab,
        toasts,
        isComposeOpen,
        replyingToPost,
        theme,
        setActiveNav,
        setFeedTab,
        toggleLike,
        addPost,
        addReply,
        openCompose,
        closeCompose,
        openReply,
        closeReply,
        addToast,
        removeToast,
        searchPosts,
        exportPost,
        exportAll,
        setTheme,
        updateUser,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
