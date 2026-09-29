import { memo, useState } from 'react';
import { useFlow } from '@stackflow/react';
import { sharePost } from '@/app/postOps';
import { toggleLike } from '@/data/actions';
import { useMinute, usePost, useProfile, useReplyIds, useXPost } from '@/data/hooks';
import { cn, formatCompactTime } from '@/lib/utils';
import Avatar from './Avatar';
import Icon from './Icon';
import PostImages from './PostImages';
import PostMenu from './PostMenu';
import PostText from './PostText';
import ReplyCard from './ReplyCard';
import XMark from './XMark';

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

/** One post in a list. Re-renders only when this post, its replies or its X state change. */
function PostRow({ id }: { id: string }) {
  const post = usePost(id);
  const profile = useProfile();
  const replyIds = useReplyIds(id);
  const x = useXPost(id);
  const { push } = useFlow();
  const [menuOpen, setMenuOpen] = useState(false);
  useMinute();
  if (!post) return null;

  const open = () => {
    if (window.getSelection()?.toString()) return;
    push('Post', { postId: id });
  };
  // 日记 and 英文 posts from before the app became 随想-only are long; they open to read in full.
  const longForm = post.entryType !== 'thought';
  const latestReply = replyIds[replyIds.length - 1];
  const onX = x?.state === 'sent';

  return (
    <article onClick={open} className="flex cursor-pointer gap-3 border-b border-x-border px-4 pb-2.5 pt-3 active:bg-x-hover">
      <Avatar src={profile.avatar} name={profile.displayName} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px] leading-5">
          <span className="max-w-[55%] shrink-0 truncate font-semibold">{profile.displayName}</span>
          <span className="min-w-0 truncate text-x-gray">@{profile.username}</span>
          <span className="shrink-0 text-x-gray">· {formatCompactTime(post.createdAt)}</span>
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
          className="mt-0.5 text-[calc(15px*var(--font-scale))] leading-[1.6]"
        />
        <PostImages images={post.images} />
        {latestReply && <ReplyCard replyId={latestReply} more={replyIds.length - 1} />}

        <div className="mt-2 flex items-center justify-between pr-1">
          <Action label="追加" onClick={() => push('Compose', { replyTo: id })}>
            <Icon name="reply" size={18} />
            {replyIds.length > 0 && <span>{replyIds.length}</span>}
          </Action>
          <Action label="X 上的点赞" onClick={() => (x?.link ? window.open(x.link, '_blank', 'noopener') : open())}>
            <Icon name="heart" size={18} />
            {onX && <span>{x.likes}</span>}
          </Action>
          <Action label={post.isLiked ? '取消收藏' : '收藏'} active={post.isLiked} onClick={() => toggleLike(id)}>
            <Icon name="bookmark" size={18} filled={post.isLiked} />
          </Action>
          <Action label="分享" onClick={() => void sharePost(post)}>
            <Icon name="share" size={18} />
          </Action>
        </div>
      </div>
      <PostMenu post={post} open={menuOpen} onClose={() => setMenuOpen(false)} />
    </article>
  );
}

export default memo(PostRow);
