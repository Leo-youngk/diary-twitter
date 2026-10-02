import { addPost, addReply, postWillSyncToX, replyWillSyncToX, type NewPost } from '@/data/actions';
import { store } from '@/data/store';
import { toast } from './toast';
import { trackPublication } from './publications';

/** The bar along the top shows the progress; only an X request that was dropped needs saying. */
function announceSaved(reply: boolean, requested: boolean, sending: boolean): void {
  if (requested && !sending) toast(`${reply ? '追加已保存' : '已发布到日记本'}，超出 X 字数限制，未同步到 X`, 'info');
}

export function publishPost(input: NewPost): string | null {
  try {
    const id = addPost(input);
    const sending = postWillSyncToX(input.toX, input.content, input.thread);
    trackPublication({ id, table: 'posts', requestedX: sending, skippedX: input.toX && !sending });
    announceSaved(false, input.toX, sending);
    return id;
  } catch (error) {
    console.error('[post] save failed', error);
    toast('发布失败，内容仍保留在输入框，请重试', 'error');
    return null;
  }
}

export function publishReply(postId: string, content: string): string | null {
  try {
    const requested = store.getValue('xSyncEnabled') && store.getCell('posts', postId, 'xSync') === true;
    const sending = replyWillSyncToX(postId, content);
    const id = addReply(postId, content);
    if (!id) { toast('原帖已被删除，追加没有保存', 'error'); return null; }
    trackPublication({ id, table: 'replies', requestedX: sending, skippedX: requested && !sending });
    announceSaved(true, requested, sending);
    return id;
  } catch (error) {
    console.error('[reply] save failed', error);
    toast('追加失败，内容仍保留在输入框，请重试', 'error');
    return null;
  }
}
