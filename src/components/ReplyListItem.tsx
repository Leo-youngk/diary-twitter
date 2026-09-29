import { memo } from 'react';
import { useNav } from '@/app/nav';
import { useMinute, usePost, useProfile, useReply, useXPost } from '@/data/hooks';
import { formatCompactTime } from '@/lib/utils';
import Avatar from './Avatar';
import XMark from './XMark';

/** A 追加 in a list of replies, with the post it belongs to underneath. Opens that post. */
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
      <Avatar src={profile.avatar} name={profile.displayName} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[15px] leading-5">
          <span className="max-w-[55%] shrink-0 truncate font-semibold">{profile.displayName}</span>
          <span className="min-w-0 truncate text-x-gray">@{profile.username}</span>
          <span className="shrink-0 text-x-gray">· {formatCompactTime(reply.createdAt)}</span>
          <XMark x={x} />
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-[calc(15px*var(--font-scale))] leading-[1.6]">{reply.content}</p>
        <div className="mt-2 rounded-xl border border-x-border px-3 py-2">
          {post ? (
            <p className="line-clamp-2 whitespace-pre-wrap break-words text-[14px] leading-[1.5] text-x-gray">{post.title || post.content}</p>
          ) : (
            <p className="text-[14px] text-x-gray">原帖已删除</p>
          )}
        </div>
      </div>
    </article>
  );
}

export default memo(ReplyListItem);
