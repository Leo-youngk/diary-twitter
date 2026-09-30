import { showDesktopPanel, useDesktopPanel, useWideDesktop } from '@/app/desktopPanel';
import Composer from './Composer';
import PostDetail from './PostDetail';

/** The new-post form stays mounted while details or another form are open. */
export default function DesktopPanel() {
  const panel = useDesktopPanel();
  const wide = useWideDesktop();
  const newPost = panel.kind === 'compose' && !panel.params.editId && !panel.params.replyTo;
  if (!wide) return null;

  const write = () => showDesktopPanel({ kind: 'compose', params: {}, focus: 0 }, true);
  const returnToPost = () => {
    const id = panel.kind === 'compose' && (panel.params.editId || panel.params.replyTo);
    if (id) showDesktopPanel({ kind: 'post', params: { postId: id } }, true);
    else write();
  };

  return (
    <aside aria-label="随想工作区" className="flex h-full w-[360px] shrink-0 flex-col border-l border-x-border px-5 py-6">
      <div className="mb-5 flex shrink-0 items-center justify-between gap-2">
        <h2 className="text-[18px] font-semibold">{panel.kind === 'post' ? '这条随想' : panel.params.editId ? '编辑随想' : panel.params.replyTo ? '追加想法' : '写一条随想'}</h2>
        {!newPost && <button type="button" onClick={() => showDesktopPanel({ kind: 'compose', params: {}, focus: Date.now() })} className="text-[13px] text-x-blue">继续写作</button>}
      </div>
      <div className="min-h-0 flex-1" hidden={!newPost}>
        <Composer params={{}} embedded onClose={write} focusRequest={newPost ? panel.focus : 0} />
        <p className="mt-4 text-[12px] leading-7 text-x-gray">一边浏览，一边记录。<br />离开写作区时，草稿会保留。</p>
      </div>
      {panel.kind === 'post' && <div className="min-h-0 flex-1"><PostDetail key={panel.params.postId} params={panel.params} embedded onBack={write} /></div>}
      {panel.kind === 'compose' && !newPost && <div className="min-h-0 flex-1"><Composer key={panel.params.editId ?? panel.params.replyTo} params={panel.params} embedded onClose={returnToPost} focusRequest={panel.focus} /></div>}
    </aside>
  );
}
