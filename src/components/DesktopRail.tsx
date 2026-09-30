import { actions } from '@/app/stack';
import { isWideDesktop, returnToDesktopMain, writeOnDesktop } from '@/app/desktopPanel';
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
    if (location.pathname !== '/' && !returnToDesktopMain()) actions.replace('Main', {}, { animate: false });
  };
  const write = () => {
    if (isWideDesktop()) {
      if (writeOnDesktop() && location.pathname !== '/' && !returnToDesktopMain()) actions.replace('Main', {}, { animate: false });
    } else actions.push('Compose', {});
  };
  return (
    <aside aria-label="主导航" className="hidden w-[88px] shrink-0 flex-col items-end gap-1 py-6 pr-4 md:flex lg:w-[184px] lg:items-stretch xl:w-[208px]">
      <div className="hidden px-3 pb-5 lg:block">
        <p className="text-[23px] font-semibold tracking-wide">随想</p>
        <p className="mt-1 text-[11px] text-x-gray">记录当下，慢慢回看</p>
      </div>
      {MAIN_TABS.map(({ tab, label, icon }) => (
        <button
          key={tab}
          type="button"
          aria-label={label}
          onClick={() => goMain(tab)}
          className={cn('flex items-center gap-4 rounded-xl px-3 py-3 hover:bg-x-hover', current === tab ? 'bg-x-darker font-semibold' : 'text-x-gray')}
        >
          <Icon name={icon} size={26} />
          <span className="hidden text-[17px] lg:inline">{label}</span>
        </button>
      ))}
      <button type="button" aria-label="设置" onClick={() => actions.push('Settings', {})} className="flex items-center gap-4 rounded-xl px-3 py-3 text-x-gray hover:bg-x-hover">
        <Icon name="gear" size={26} />
        <span className="hidden text-[17px] lg:inline">设置</span>
      </button>
      <button
        type="button"
        aria-label="发帖"
        onClick={write}
        className="mt-3 flex h-12 w-12 items-center justify-center rounded-xl bg-x-blue font-semibold text-white lg:w-full"
      >
        <Icon name="pencil" size={22} className="lg:hidden" />
        <span className="hidden text-[16px] lg:inline">写随想</span>
      </button>
      <button type="button" onClick={() => actions.push('Profile', {})} className="mt-auto flex items-center gap-3 rounded-full p-2 hover:bg-x-hover">
        <Avatar src={profile.avatar} name={profile.displayName} size={40} />
        <span className="hidden min-w-0 text-left lg:block">
          <span className="block truncate text-[15px] font-bold">{profile.displayName}</span>
          <span className="block truncate text-[14px] text-x-gray">@{profile.username}</span>
        </span>
      </button>
    </aside>
  );
}
