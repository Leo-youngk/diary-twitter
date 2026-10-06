import { addPost, addReply, replyWillSyncToX, requestPostXSync, type NewPost } from '@/data/actions';
import { toast } from './toast';
import { trackPublication } from './publications';

export function publishPost(input: NewPost): string | null {
  try {
    const id = addPost(input);
    trackPublication({ id, table: 'posts', requestedX: input.toX, skippedX: false });
    return id;
  } catch (error) {
    console.error('[post] save failed', error);
    toast('发布失败，内容仍保留在输入框，请重试', 'error');
    return null;
  }
}

export function publishReply(postId: string, content: string): string | null {
  try {
    const sending = replyWillSyncToX(postId);
    const id = addReply(postId, content);
    if (!id) { toast('原帖已被删除，追加没有保存', 'error'); return null; }
    trackPublication({ id, table: 'replies', requestedX: sending, skippedX: false });
    return id;
  } catch (error) {
    console.error('[reply] save failed', error);
    toast('追加失败，内容仍保留在输入框，请重试', 'error');
    return null;
  }
}

/** Send a saved post through the same progress and delivery pipeline as a new one. */
export function syncPostToX(id: string): void {
  const result = requestPostXSync(id);
  if (result === 'requested') {
    trackPublication({ id, table: 'posts', requestedX: true, skippedX: false });
    toast('已请求同步到 X', 'info');
  } else {
    const messages = {
      'already-requested': '这条已请求同步，请查看同步状态',
      missing: '这条已被删除',
      unsupported: '只有随想可以同步到 X',
      empty: '内容为空，无法同步到 X',
    };
    toast(messages[result], 'info');
  }
}
