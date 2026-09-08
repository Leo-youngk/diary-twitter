export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  banner: string;
  bio: string;
  joinedDate: string;
  /** ISO 'YYYY-MM-DD'. Optional — drives the calendar's life-in-weeks view. */
  birthDate?: string;
}

export type EntryType = 'thought' | 'diary' | 'article';

export interface Reply {
  id: string;
  postId: string;
  content: string;
  createdAt: string;
}

export interface Post {
  id: string;
  entryType: EntryType;
  /** Optional user-created category shown instead of the built-in type label. */
  category?: string;
  title?: string;
  content: string;
  images: string[];
  createdAt: string;
  replies: Reply[];
  isLiked: boolean;
  mood?: string;
  tags?: string[];
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export type FeedTab = 'all' | EntryType | `custom:${string}`;

export type ProfileTab = 'all' | 'thought' | 'diary' | `custom:${string}`;

export type NavItem = 'home' | 'explore' | 'calendar' | 'profile' | 'ledger';
