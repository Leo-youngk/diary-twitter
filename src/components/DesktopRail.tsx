import { actions } from '@/app/stack';
import { setMainTab, useMainTab, type MainTab } from '@/app/mainTab';
import { useProfile } from '@/data/hooks';
import { cn } from '@/lib/utils';
import Avatar from './Avatar';
import { MAIN_TABS } from './BottomNav';
import Icon from './Icon';

/** Wide screens: the same destinations as the phone tab bar, down the left side. */
export default function DesktopRail() {
  const current = useMainTab();
  const profile = useProfile();
  const goMain = (tab: MainTab) => {
    setMainTab(tab);
    actions.replace('Main', {}, { animate: false });
  };
  return (
    <aside className="hidden w-[88px] shrink-0 flex-col items-end gap-1 py-3 pr-3 md:flex xl:w-[240px] xl:items-stretch">
      {MAIN_TABS.map(({ tab, label, icon }) => (
        <button
          key={tab}
          type="button"
          onClick={() => goMain(tab)}
          className={cn('flex items-center gap-4 rounded-full px-3 py-3 hover:bg-x-hover', current === tab ? 'font-bold' : 'text-x-gray')}
        >
          <Icon name={icon} size={26} />
          <span className="hidden text-[19px] xl:inline">{label}</span>
        </button>
      ))}
      <button type="button" onClick={() => actions.push('Settings', {})} className="flex items-center gap-4 rounded-full px-3 py-3 text-x-gray hover:bg-x-hover">
        <Icon name="gear" size={26} />
        <span className="hidden text-[19px] xl:inline">设置</span>
      </button>
      <button
        type="button"
        onClick={() => actions.push('Compose', {})}
        className="mt-3 flex h-12 w-12 items-center justify-center rounded-full bg-x-blue font-bold text-white xl:w-full"
      >
        <Icon name="pencil" size={22} className="xl:hidden" />
        <span className="hidden text-[17px] xl:inline">发帖</span>
      </button>
      <button type="button" onClick={() => actions.push('Profile', {})} className="mt-auto flex items-center gap-3 rounded-full p-2 hover:bg-x-hover">
        <Avatar src={profile.avatar} name={profile.displayName} size={40} />
        <span className="hidden min-w-0 text-left xl:block">
          <span className="block truncate text-[15px] font-bold">{profile.displayName}</span>
          <span className="block truncate text-[14px] text-x-gray">@{profile.username}</span>
        </span>
      </button>
    </aside>
  );
}
