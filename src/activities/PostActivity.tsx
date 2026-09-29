import { useEffect, useRef, useState } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import type { ActivityComponentType } from '@stackflow/react';
import { useNav } from '@/app/nav';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { sharePost } from '@/app/postOps';
import { useBack } from '@/app/useBack';
import { useKeyboardViewport } from '@/app/useKeyboardViewport';
import { toast } from '@/app/toast';
import Avatar from '@/components/Avatar';
import Icon, { XLogo } from '@/components/Icon';
import PostImages from '@/components/PostImages';
import PostMenu from '@/components/PostMenu';
import ScreenHeader from '@/components/ScreenHeader';
import XMark from '@/components/XMark';
import { addReply, fitsOnX, toggleLike } from '@/data/actions';
import { useMinute, usePost, useProfile, useReply, useReplyIds, useXPost, useXSyncEnabled } from '@/data/hooks';
import { cn, formatCompactTime, formatDateCN } from '@/lib/utils';

function ReplyItem({ id, last }: { id: string; last: boolean }) {
  const reply = useReply(id);
  const profile = useProfile();
  const x = useXPost(id);
  useMinute();
  if (!reply) return null;
  return (
    <div data-reply={id} className="flex gap-3 px-4">
      <div className="flex w-10 flex-col items-center">
        <Avatar src={profile.avatar} name={profile.displayName} size={32} />
        {!last && <div className="mt-1 w-0.5 flex-1 rounded-full bg-x-border" />}
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex items-center gap-1.5 text-[14px]">
          <span className="truncate font-semibold">{profile.displayName}</span>
          <span className="shrink-0 text-x-gray">· {formatCompactTime(reply.createdAt)}</span>
          <XMark x={x} />
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[calc(15px*var(--font-scale))] leading-[1.6]">{reply.content}</p>
        {x?.state === 'failed' && <p className="mt-1 text-[12px] text-x-danger">没有发到 X：{x.error}</p>}
      </div>
    </div>
  );
}

const PostActivity: ActivityComponentType<'Post'> = ({ params }) => {
  const post = usePost(params.postId);
  const profile = useProfile();
  const replyIds = useReplyIds(params.postId);
  const x = useXPost(params.postId);
  const xEnabled = useXSyncEnabled();
  const { push } = useNav();
  const back = useBack();
  const [draft, setDraft] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  useKeyboardViewport(hostRef);

  // Opened from a reply (我的 → 追加): bring that reply into view.
  useEffect(() => {
    if (!params.focusReply) return;
    scrollRef.current?.querySelector(`[data-reply="${params.focusReply}"]`)?.scrollIntoView({ block: 'center' });
  }, [params.focusReply]);

  if (!post) {
    return (
      <AppScreen>
        <div className="flex h-full flex-col">
          <ScreenHeader title="帖子" />
          <p className="px-8 py-20 text-center text-x-gray">这条记录不存在，或已经删除。</p>
        </div>
      </AppScreen>
    );
  }

  const text = draft.trim();
  const replyToX = xEnabled && post.xSync && text.length > 0;
  const tooLongForX = replyToX && !fitsOnX(text);
  const send = () => {
    if (!text) return;
    if (!addReply(post.id, text)) { toast('这条已被删除', 'error'); return; }
    setDraft('');
    if (tooLongForX) toast('超出 X 的长度上限，这条追加只保存在本地', 'info');
  };

  return (
    <AppScreen>
      <div ref={hostRef} className="flex h-full flex-col">
        <ScreenHeader
          title="帖子"
          right={(
            <button type="button" onClick={() => setMenuOpen(true)} className="pressable rounded-full p-2" aria-label="更多">
              <Icon name="dots" size={20} />
            </button>
          )}
        />
        <div ref={scrollRef} data-scroll-root className="relative flex-1 overflow-y-auto">
          <article className="px-4 pt-3">
            <div className="flex items-center gap-3">
              <Avatar src={profile.avatar} name={profile.displayName} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{profile.displayName}</p>
                <p className="truncate text-[14px] text-x-gray">@{profile.username}</p>
              </div>
            </div>
            {post.title && <h2 className="mt-3 text-[calc(20px*var(--font-scale))] font-bold leading-snug">{post.title}</h2>}
            <p className="mt-2 whitespace-pre-wrap break-words text-[calc(17px*var(--font-scale))] leading-[1.75]">{post.content}</p>
            <PostImages images={post.images} large />

            <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] text-x-gray">
              <span>{formatDateCN(post.createdAt)}</span>
              {post.category && <span>· {post.category}</span>}
              {x && x.state !== 'dismissed' && (
                <>
                  <span>·</span>
                  {x.state === 'sent' && x.link ? (
                    <a href={x.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-x-blue">
                      <XLogo size={12} /> 查看推文
                    </a>
                  ) : (
                    <span className={cn('inline-flex items-center gap-1', x.state === 'failed' && 'text-x-danger')}>
                      <XLogo size={12} /> {x.state === 'failed' ? '没有发到 X' : '正在发到 X'}
                    </span>
                  )}
                </>
              )}
            </div>
            {x?.state === 'failed' && (
              <p className="mt-1 text-[13px] text-x-danger">
                {x.error}{' '}
                <button type="button" onClick={() => push('Settings', {})} className="underline">去处理</button>
              </p>
            )}
            {x?.state === 'sent' && (
              <p className="mt-2 border-t border-x-border pt-2 text-[14px] text-x-gray">
                <span className="font-semibold text-x-fg">{x.impressions}</span> 曝光 ·{' '}
                <span className="font-semibold text-x-fg">{x.likes}</span> 点赞 ·{' '}
                <span className="font-semibold text-x-fg">{x.replies}</span> 回复 ·{' '}
                <span className="font-semibold text-x-fg">{x.reposts}</span> 转发
              </p>
            )}

            <div className="mt-2 flex items-center justify-around border-y border-x-border py-2 text-x-gray">
              <button type="button" onClick={() => push('Compose', { replyTo: post.id })} className="pressable p-2" aria-label="追加"><Icon name="reply" size={20} /></button>
              <button type="button" onClick={() => toggleLike(post.id)} className={cn('pressable p-2', post.isLiked && 'text-x-blue')} aria-label={post.isLiked ? '取消收藏' : '收藏'}>
                <Icon name="bookmark" size={20} filled={post.isLiked} />
              </button>
              <button type="button" onClick={() => void sharePost(post)} className="pressable p-2" aria-label="分享"><Icon name="share" size={20} /></button>
              <button type="button" onClick={() => push('Compose', { editId: post.id })} className="pressable p-2" aria-label="编辑"><Icon name="edit" size={20} /></button>
            </div>
          </article>

          <div className="pb-6 pt-3">
            {replyIds.length === 0
              ? <p className="px-4 py-6 text-center text-[14px] text-x-gray">还没有追加。想到什么，就接着写在下面。</p>
              : replyIds.map((id, i) => <ReplyItem key={id} id={id} last={i === replyIds.length - 1} />)}
          </div>
        </div>

        <div className="dock shrink-0 border-t border-x-border bg-x-dark px-3 pt-2">
          {replyToX && (
            <p className={cn('mb-1 flex items-center gap-1 px-1 text-[12px]', tooLongForX ? 'text-x-danger' : 'text-x-gray')}>
              <XLogo size={11} /> {tooLongForX ? '超出 X 的长度上限（中文每字算 2，最多 140 字），只保存在本地' : '将以引用原帖的形式同步到 X'}
            </p>
          )}
          <div className="flex items-end gap-2">
            <TextareaAutosize
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              minRows={1}
              maxRows={5}
              placeholder="追加想法…"
              className="min-w-0 flex-1 resize-none rounded-2xl bg-x-darker px-4 py-2 leading-6 outline-none placeholder:text-x-gray"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={send}
              disabled={!text}
              className="pressable mb-0.5 shrink-0 rounded-full bg-x-blue px-4 py-2 text-[15px] font-semibold text-white disabled:opacity-40"
            >
              追加
            </button>
          </div>
        </div>
      </div>
      <PostMenu post={post} open={menuOpen} onClose={() => setMenuOpen(false)} onDeleted={back} />
    </AppScreen>
  );
};

export default PostActivity;
