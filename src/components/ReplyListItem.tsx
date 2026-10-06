import { memo } from 'react';
import { useNav } from '@/app/nav';
import { useMinute, usePost, useProfile, useReply, useXPost } from '@/data/hooks';
import { formatCompactTime } from '@/lib/utils';
import Avatar from './Avatar';
import PostTime from './PostTime';
import { ChannelMarks, ChannelStatuses } from './ChannelDelivery';
import XMark from './XMark';
import XDeliveryStatus from './XDeliveryStatus';

/**
 * A 追加 on its own, as X shows a quote: its text, with the post it quotes as a
 * card underneath. A part of a post's thread is a reply there, so it says so instead. Opens the post.
 */
function ReplyListItem({ id }: { id: string }) {
  const reply = useReply(id);
  const post = usePost(reply?.postId ?? '');
  const profile = useProfile();
  const x = useXPost(id);
  const { push } = useNav();
  useMinute();
  if (!reply) return null;
  return (
    <article
      onClick={() => post && push('Post', { postId: post.id, focusReply: id })}
      className="flex cursor-pointer gap-3 border-b border-x-border px-4 pb-3 pt-3 active:bg-x-hover"
    >
      <Avatar src={profile.avatar} name={profile.displayName} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px] leading-5">
          <span className="max-w-[55%] shrink-0 truncate font-semibold">{profile.displayName}</span>
          <span className="min-w-0 truncate text-x-gray">@{profile.username}</span>
          <span className="shrink-0 text-x-gray">· {formatCompactTime(reply.createdAt)}</span>
          <XMark x={x} />
          <ChannelMarks id={id} />
        </div>
        {reply.thread && <p className="text-[14px] text-x-gray">回复 <span className="text-x-blue">@{profile.username}</span></p>}
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[calc(15px*var(--font-scale))] leading-[1.6]">{reply.content}</p>
        <XDeliveryStatus id={id} requested={reply.xSync} x={x} />
        <ChannelStatuses id={id} />
        {!reply.thread && (
          <div className="mt-2.5 rounded-2xl border border-x-border px-3 py-2.5">
            {post ? (
              <>
                <div className="flex min-w-0 items-center gap-1.5 text-[14px]">
                  <Avatar src={profile.avatar} name={profile.displayName} size={18} />
                  <span className="truncate font-semibold">{profile.displayName}</span>
                  <span className="shrink-0 text-x-gray">@{profile.username} · <PostTime date={post.createdAt} /></span>
                </div>
                {post.title && <p className="mt-1 text-[14px] font-semibold">{post.title}</p>}
                <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words text-[calc(14px*var(--font-scale))] leading-[1.55]">{post.content}</p>
              </>
            ) : (
              <p className="text-[14px] text-x-gray">原帖已删除</p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export default memo(ReplyListItem);
