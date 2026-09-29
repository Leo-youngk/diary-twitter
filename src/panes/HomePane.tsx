import { useRef } from 'react';
import { useFlow } from '@stackflow/react';
import Avatar from '@/components/Avatar';
import FeedSkeleton from '@/components/FeedSkeleton';
import Icon from '@/components/Icon';
import PaneHeader from '@/components/PaneHeader';
import Timeline from '@/components/Timeline';
import { useAwaitingFirstSync, useConnectionState } from '@/data/connection';
import { usePostIds, useProfile } from '@/data/hooks';

function ProfileButton() {
  const profile = useProfile();
  const { push } = useFlow();
  return (
    <button type="button" onClick={() => push('Profile', {})} className="pressable rounded-full" aria-label="我的">
      <Avatar src={profile.avatar} name={profile.displayName} size={32} />
    </button>
  );
}

function OfflineBadge() {
  const state = useConnectionState();
  const { push } = useFlow();
  if (state !== 'offline') return null;
  return (
    <button type="button" onClick={() => push('Settings', {})} className="pressable -mr-1 p-1 text-x-gray" aria-label="离线，点此查看同步状态">
      <Icon name="cloudOff" size={20} />
    </button>
  );
}

/** Every post, newest first. */
export default function HomePane() {
  const ids = usePostIds();
  const awaitingFirstSync = useAwaitingFirstSync();
  const offline = useConnectionState() === 'offline';
  const scrollRef = useRef<HTMLDivElement>(null);

  let empty: React.ReactNode;
  if (awaitingFirstSync) {
    empty = <FeedSkeleton />;
  } else if (offline) {
    empty = (
      <div className="px-8 py-20 text-center">
        <p className="text-[17px] font-semibold">现在离线</p>
        <p className="mt-2 text-[15px] text-x-gray">联网后会自动同步你的记录；也可以先写，稍后一起同步。</p>
      </div>
    );
  } else {
    empty = (
      <div className="px-8 py-20 text-center">
        <p className="text-[20px] font-bold">写下第一条</p>
        <p className="mt-2 text-[15px] text-x-gray">点下方的「发帖」，记下此刻的想法。</p>
      </div>
    );
  }

  return (
    <div ref={scrollRef} data-scroll-root className="relative h-full overflow-y-auto pb-28">
      <PaneHeader title="日记本" left={<ProfileButton />} right={<OfflineBadge />} />
      <Timeline ids={ids} scrollRef={scrollRef} empty={empty} />
    </div>
  );
}
