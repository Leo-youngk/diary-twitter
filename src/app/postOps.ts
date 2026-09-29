import { deletePost, restorePost } from '@/data/actions';
import { blobUrl } from '@/data/blobs';
import type { Post } from '@/data/hooks';
import { indexes, store } from '@/data/store';
import { blobHashOf } from '@/lib/schema';
import { exportPostMarkdown, type MarkdownPost } from '@/lib/markdown';
import { toast } from './toast';

/** Shared post actions used by the timeline, the detail screen and menus. */

export function removePost(post: Post): void {
  const onX = store.getCell('xposts', post.id, 'state') === 'sent';
  const deleted = deletePost(post.id);
  if (!deleted) return;
  toast(onX ? '已删除，X 上的那条需要到 X 删除' : '已删除', 'info', {
    label: '撤销',
    run: () => restorePost(deleted),
  });
}

export function postText(post: Pick<Post, 'title' | 'content'>): string {
  return post.title ? `${post.title}\n\n${post.content}` : post.content;
}

export async function copyPost(post: Post): Promise<void> {
  try {
    await navigator.clipboard.writeText(postText(post));
    toast('已复制');
  } catch {
    toast('复制失败', 'error');
  }
}

/** The system share sheet where there is one (iOS), otherwise copy. */
export async function sharePost(post: Post): Promise<void> {
  const text = postText(post);
  if (navigator.share) {
    try {
      await navigator.share({ text });
    } catch {
      // Closing the share sheet is not an error.
    }
    return;
  }
  await copyPost(post);
}

export function toMarkdownPost(post: Post): MarkdownPost {
  const replies = indexes.getSliceRowIds('repliesByPost', post.id).map((id) => ({
    content: String(store.getCell('replies', id, 'content') ?? ''),
    createdAt: String(store.getCell('replies', id, 'createdAt') ?? ''),
  }));
  return {
    category: post.category,
    title: post.title,
    content: post.content,
    createdAt: post.createdAt,
    imageUrls: post.images.map((ref) => {
      const hash = blobHashOf(ref);
      return hash ? new URL(blobUrl(hash), location.origin).toString() : ref;
    }),
    replies,
  };
}

export function exportPost(post: Post): void {
  exportPostMarkdown(toMarkdownPost(post));
}
