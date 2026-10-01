import { addPost, addReply, postWillSyncToX, replyWillSyncToX, type NewPost } from '@/data/actions';
import { getConnectionState } from '@/data/connection';
import { store } from '@/data/store';
import { toast } from './toast';

/** Local saving and X publication are separate outcomes, in every compose UI. */
function announceSaved(reply: boolean, requested: boolean, sending: boolean): void {
  const saved = reply ? '追加已保存' : '已发布到日记本';
  if (sending) {
    const online = getConnectionState() === 'online';
    toast(online ? `${saved}，正在同步到 X` : '已保存到本机，等待连接后同步到 X', online ? 'success' : 'info');
  } else if (requested) {
    toast(`${saved}，超出 X 字数限制，未同步到 X`, 'info');
  } else {
    toast(`${saved}（未同步到 X）`);
  }
}

export function publishPost(input: NewPost): string | null {
  try {
    const id = addPost(input);
    announceSaved(false, input.toX, postWillSyncToX(input.toX, input.content));
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
    announceSaved(true, requested, sending);
    return id;
  } catch (error) {
    console.error('[reply] save failed', error);
    toast('追加失败，内容仍保留在输入框，请重试', 'error');
    return null;
  }
}
