export interface User {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  banner: string;
  bio: string;
  joinedDate: string;
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
  title?: string;
  content: string;
  images: string[];
  createdAt: string;
  replies: Reply[];
  isLiked: boolean;
  views: number;
  mood?: string;
  tags?: string[];
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export type FeedTab = 'all' | 'thought' | 'diary' | 'article';

export type ProfileTab = 'all' | 'thought' | 'diary';

export type NavItem = 'home' | 'explore' | 'calendar' | 'profile' | 'ledger';
