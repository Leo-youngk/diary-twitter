import { useNav } from '@/app/nav';
import { syncPostToChannel, syncPostToX } from '@/app/publish';
import { copyPost, exportPost, removePost } from '@/app/postOps';
import { useChannelPost, useXPost, type Post } from '@/data/hooks';
import { CHANNELS } from '@/lib/channels';
import type { Channel } from '@/lib/schema';
import ActionSheet, { type SheetAction } from './ActionSheet';

interface PostMenuProps {
  post: Post;
  open: boolean;
  onClose: () => void;
  /** Called after 删除, e.g. to leave the detail screen. */
  onDeleted?: () => void;
}

export default function PostMenu({ post, open, onClose, onDeleted }: PostMenuProps) {
  const { push } = useNav();
  const x = useXPost(post.id);
  const substack = useChannelPost('substack', post.id);
  const threads = useChannelPost('threads', post.id);
  // Each platform is offered on its own while this post has not asked for it.
  const offer = (channel: Channel, requested: boolean, row: unknown): SheetAction[] => (post.entryType === 'thought' && !requested && !row
    ? [{ label: `同步到 ${CHANNELS[channel].name}`, onSelect: () => syncPostToChannel(channel, post.id) }] : []);
  const actions: SheetAction[] = [
    { label: '编辑', onSelect: () => push('Compose', { editId: post.id }) },
    ...(post.entryType === 'thought' && !post.xSync && !x ? [{ label: '同步到 X', onSelect: () => syncPostToX(post.id) }] : []),
    ...offer('substack', post.substackSync, substack),
    ...offer('threads', post.threadsSync, threads),
    { label: '复制文本', onSelect: () => void copyPost(post) },
    { label: '导出 Markdown', onSelect: () => exportPost(post) },
    { label: '删除', danger: true, onSelect: () => { removePost(post); onDeleted?.(); } },
  ];
  return <ActionSheet open={open} actions={actions} onClose={onClose} />;
}
