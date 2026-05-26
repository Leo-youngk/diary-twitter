import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ── Row ↔ App type helpers ──────────────────────────────────────────────────

import type { Post, User } from '@/lib/types';

export function rowToPost(row: Record<string, unknown>): Post {
  return {
    id: row.id as string,
    entryType: row.entry_type as Post['entryType'],
    title: (row.title as string) || undefined,
    content: row.content as string,
    images: (row.images as string[]) || [],
    replies: (row.replies as Post['replies']) || [],
    isLiked: row.is_liked as boolean,
    views: row.views as number,
    mood: (row.mood as string) || undefined,
    tags: (row.tags as string[]) || undefined,
    createdAt: row.created_at as string,
  };
}

export function postToRow(post: Post, userId: string) {
  return {
    id: post.id,
    user_id: userId,
    entry_type: post.entryType,
    title: post.title ?? null,
    content: post.content,
    images: post.images,
    replies: post.replies,
    is_liked: post.isLiked,
    views: post.views,
    mood: post.mood ?? null,
    tags: post.tags ?? null,
    created_at: post.createdAt,
  };
}

export function profileToRow(user: User, userId: string) {
  return {
    user_id: userId,
    display_name: user.displayName,
    username: user.username,
    bio: user.bio,
    avatar: user.avatar,
    banner: user.banner,
    joined_date: user.joinedDate,
  };
}

export function rowToUser(row: Record<string, unknown>, fallback: User): User {
  return {
    id: row.user_id as string,
    displayName: (row.display_name as string) || fallback.displayName,
    username: (row.username as string) || fallback.username,
    bio: (row.bio as string) || fallback.bio,
    avatar: (row.avatar as string) || fallback.avatar,
    banner: (row.banner as string) || fallback.banner,
    joinedDate: (row.joined_date as string) || fallback.joinedDate,
  };
}
