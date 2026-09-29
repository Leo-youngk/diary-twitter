import { useRef } from 'react';
import { setProfileOpen } from '@/app/profilePanel';
import { useNav } from '@/app/nav';
import { useMainTab } from '@/app/mainTab';
import { useScrollChrome } from '@/app/scrollChrome';
import Avatar from '@/components/Avatar';
import FeedSkeleton from '@/components/FeedSkeleton';
import Icon, { XLogo } from '@/components/Icon';
import PaneHeader from '@/components/PaneHeader';
import Timeline from '@/components/Timeline';
import { useAwaitingFirstSync, useConnectionState } from '@/data/connection';
import { usePostIds, useProfile } from '@/data/hooks';

function ProfileButton() {
  const profile = useProfile();
  return (
    <button type="button" onClick={() => setProfileOpen(true)} className="pressable rounded-full" aria-label="我的">
      <Avatar src={profile.avatar} name={profile.displayName} size={32} />
    </button>
  );
}

function OfflineBadge() {
  const state = useConnectionState();
  const { push } = useNav();
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
  const headerRef = useRef<HTMLElement>(null);
  useScrollChrome(scrollRef, headerRef, useMainTab() === 'home');

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
      <PaneHeader
        title={<XLogo size={24} />}
        left={<ProfileButton />}
        right={<OfflineBadge />}
        ref={headerRef}
      />
      <Timeline ids={ids} scrollRef={scrollRef} empty={empty} />
    </div>
  );
}
