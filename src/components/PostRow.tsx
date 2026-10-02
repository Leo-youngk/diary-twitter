import { memo, useState } from 'react';
import { useNav } from '@/app/nav';
import { useDesktopSelection } from '@/app/desktopPanel';
import { sharePost } from '@/app/postOps';
import { toggleLike } from '@/data/actions';
import { usePost, useProfile, useReply, useReplyIds, useThreadIds, useTweetStats, useXPost } from '@/data/hooks';
import { cn } from '@/lib/utils';
import Avatar from './Avatar';
import Icon from './Icon';
import PostImages from './PostImages';
import PostMenu from './PostMenu';
import PostText from './PostText';
import PostTime from './PostTime';
import XMark from './XMark';
import XDeliveryStatus from './XDeliveryStatus';

function Action({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn('pressable -m-2 flex items-center gap-1.5 p-2 text-[13px] tabular-nums', active ? 'text-x-blue' : 'text-x-gray')}
    >
      {children}
    </button>
  );
}

/** A part written with the post (its +), under it as the rest of the thread, as on X. */
function ThreadPart({ id, last }: { id: string; last: boolean }) {
  const reply = useReply(id);
  const profile = useProfile();
  const x = useXPost(id);
  if (!reply) return null;
  return (
    <div className="flex gap-3">
      <div className="flex w-9 shrink-0 flex-col items-center">
        <Avatar src={profile.avatar} name={profile.displayName} size={36} />
        {!last && <div className="mt-1 w-0.5 flex-1 rounded-full bg-x-border" />}
      </div>
      <div className={cn('min-w-0 flex-1', !last && 'pb-3')}>
        <div className="flex items-center gap-1.5 text-[15px] leading-5">
          <span className="max-w-[55%] shrink-0 truncate font-semibold">{profile.displayName}</span>
          <span className="min-w-0 truncate text-x-gray">@{profile.username}</span>
          <span className="shrink-0 text-x-gray">· <PostTime date={reply.createdAt} /></span>
        </div>
        <PostText text={reply.content} lines={8} className="mt-0.5 text-[calc(15px*var(--font-scale))] leading-[1.6] md:mt-2 md:text-[calc(16px*var(--font-scale))] md:leading-[1.85]" />
        <XDeliveryStatus id={id} requested={reply.xSync} x={x} table="replies" />
      </div>
    </div>
  );
}

/** One post in a list. Re-renders only when this post, its replies or its X state change. */
function PostRow({ id }: { id: string }) {
  const post = usePost(id);
  const selected = useDesktopSelection(id);
  const profile = useProfile();
  const replyIds = useReplyIds(id);
  const threadIds = useThreadIds(id);
  const x = useXPost(id);
  const tweet = useTweetStats(x?.state === 'sent' ? x.link : undefined);
  const { push } = useNav();
  const [menuOpen, setMenuOpen] = useState(false);
  if (!post) return null;

  const open = () => {
    if (window.getSelection()?.toString()) return;
    push('Post', { postId: id });
  };
  // 日记 and 英文 posts from before the app became 随想-only are long; they open to read in full.
  const longForm = post.entryType !== 'thought';
  const onX = x?.state === 'sent';

  return (
    <article data-post-id={id} aria-current={selected ? 'true' : undefined} onClick={open} className={cn('cursor-pointer border-b border-x-border px-4 pb-2.5 pt-3 active:bg-x-hover md:px-6 md:py-5 md:hover:bg-x-hover', selected && 'xl:bg-x-darker/50')}>
      <div className="flex gap-3">
        <div className="flex w-9 shrink-0 flex-col items-center">
          <Avatar src={profile.avatar} name={profile.displayName} size={36} />
          {threadIds.length > 0 && <div className="mt-1 w-0.5 flex-1 rounded-full bg-x-border" />}
        </div>
        <div className={cn('min-w-0 flex-1', threadIds.length > 0 && 'pb-3')}>
          <div className="flex items-center gap-1.5 text-[15px] leading-5">
            <span className="max-w-[55%] shrink-0 truncate font-semibold">{profile.displayName}</span>
            <span className="min-w-0 truncate text-x-gray">@{profile.username}</span>
            <span className="shrink-0 text-x-gray">· <PostTime date={post.createdAt} /></span>
            {post.category && <span className="min-w-0 shrink truncate text-[13px] text-x-gray">· {post.category}</span>}
            <XMark x={x} />
            <button
              type="button"
              aria-label="更多"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(true); }}
              className="pressable -my-2 -mr-2 ml-auto shrink-0 p-2 text-x-gray"
            >
              <Icon name="dots" size={18} />
            </button>
          </div>

          {post.title && <h3 className="mt-1 text-[calc(16px*var(--font-scale))] font-semibold leading-snug">{post.title}</h3>}
          <PostText
            text={post.content}
            lines={longForm ? 4 : 8}
            moreLabel={longForm ? '阅读全文' : undefined}
            className="mt-0.5 text-[calc(15px*var(--font-scale))] leading-[1.6] md:mt-2 md:text-[calc(16px*var(--font-scale))] md:leading-[1.85]"
          />
          <PostImages images={post.images} />
          <XDeliveryStatus id={id} requested={post.xSync} x={x} />

          <div className="mt-2 flex items-center justify-between pr-1">
            <Action label="追加" onClick={() => push('Compose', { replyTo: id })}>
              <Icon name="reply" size={18} />
              {replyIds.length > 0 && <span>{replyIds.length}</span>}
            </Action>
            <Action label="X 上的点赞" onClick={() => (x?.link ? window.open(x.link, '_blank', 'noopener') : open())}>
              <Icon name="heart" size={18} />
              {onX && tweet && <span>{tweet.likes}</span>}
            </Action>
            <Action label={post.isLiked ? '取消收藏' : '收藏'} active={post.isLiked} onClick={() => toggleLike(id)}>
              <Icon name="bookmark" size={18} filled={post.isLiked} />
            </Action>
            <Action label="分享" onClick={() => void sharePost(post)}>
              <Icon name="share" size={18} />
            </Action>
          </div>
        </div>
      </div>
      {threadIds.map((replyId, i) => <ThreadPart key={replyId} id={replyId} last={i === threadIds.length - 1} />)}
      <PostMenu post={post} open={menuOpen} onClose={() => setMenuOpen(false)} />
    </article>
  );
}

export default memo(PostRow);
