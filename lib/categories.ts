import type { EntryType, Post } from '@/lib/types';

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  thought: '随想',
  diary: '日记',
  article: '英文',
};

export const RESERVED_CATEGORY_NAMES = new Set([
  '全部',
  ...Object.values(ENTRY_TYPE_LABELS),
  '英语',
]);

export const MAX_CUSTOM_CATEGORY_LENGTH = 20;

export function getPostCategoryLabel(post: Pick<Post, 'entryType' | 'category'>): string {
  return post.category?.trim() || ENTRY_TYPE_LABELS[post.entryType];
}

export function getCustomCategoryNames(posts: ReadonlyArray<Pick<Post, 'category'>>): string[] {
  const names = new Set<string>();
  posts.forEach((post) => {
    const name = post.category?.trim();
    if (name) names.add(name);
  });
  return Array.from(names);
}

export function getCategoryTabKey(name: string): `custom:${string}` {
  return `custom:${name}`;
}

export function getCategoryNameFromTab(tab: string): string | null {
  return tab.startsWith('custom:') ? tab.slice('custom:'.length) : null;
}

export function getPostCategoryColor(post: Pick<Post, 'entryType' | 'category'>): string {
  if (post.category?.trim()) return 'bg-violet-500/20 text-violet-600 dark:text-violet-400';
  if (post.entryType === 'diary') return 'bg-x-green/20 text-x-green';
  if (post.entryType === 'article') return 'bg-amber-500/20 text-amber-500';
  return 'bg-x-blue/20 text-x-blue';
}
