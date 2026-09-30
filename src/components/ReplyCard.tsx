import { useProfile, useReply } from '@/data/hooks';
import PostTime from './PostTime';
import Avatar from './Avatar';

/** The latest 追加 under a post, as a quoted card. */
export default function ReplyCard({ replyId, more }: { replyId: string; more: number }) {
  const reply = useReply(replyId);
  const profile = useProfile();
  if (!reply) return null;
  return (
    <div className="mt-2.5 rounded-xl border border-x-border px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <Avatar src={profile.avatar} name={profile.displayName} size={18} />
        <span className="truncate font-semibold">{profile.displayName}</span>
        <span className="shrink-0 text-x-gray">@{profile.username} · <PostTime date={reply.createdAt} /></span>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-[calc(14px*var(--font-scale))] leading-[1.55] line-clamp-3">{reply.content}</p>
      {more > 0 && <p className="mt-1 text-[13px] text-x-gray">还有 {more} 条追加</p>}
    </div>
  );
}
