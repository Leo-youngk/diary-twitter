import { useNav } from '@/app/nav';
import { syncPostToX } from '@/app/publish';
import { copyPost, exportPost, removePost } from '@/app/postOps';
import { useXPost, type Post } from '@/data/hooks';
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
  const actions: SheetAction[] = [
    { label: '编辑', onSelect: () => push('Compose', { editId: post.id }) },
    ...(post.entryType === 'thought' && !post.xSync && !x ? [{ label: '同步到 X', onSelect: () => syncPostToX(post.id) }] : []),
    { label: '复制文本', onSelect: () => void copyPost(post) },
    { label: '导出 Markdown', onSelect: () => exportPost(post) },
    { label: '删除', danger: true, onSelect: () => { removePost(post); onDeleted?.(); } },
  ];
  return <ActionSheet open={open} actions={actions} onClose={onClose} />;
}
