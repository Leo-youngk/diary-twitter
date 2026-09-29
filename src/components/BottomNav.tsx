import { useFlow } from '@stackflow/react';
import { scrollPaneToTop, setMainTab, useMainTab, type MainTab } from '@/app/mainTab';
import { cn } from '@/lib/utils';
import Icon, { type IconName } from './Icon';

export const MAIN_TABS: Array<{ tab: MainTab; label: string; icon: IconName }> = [
  { tab: 'home', label: '首页', icon: 'home' },
  { tab: 'goals', label: '目标', icon: 'target' },
  { tab: 'calendar', label: '日历', icon: 'calendar' },
  { tab: 'stats', label: '统计', icon: 'chart' },
];

/** Floating tab bar; the post button sits in the middle. */
export default function BottomNav() {
  const current = useMainTab();
  const { push } = useFlow();

  const item = ({ tab, label, icon }: (typeof MAIN_TABS)[number]) => {
    const active = current === tab;
    return (
      <button
        key={tab}
        type="button"
        onClick={() => (active ? scrollPaneToTop(tab) : setMainTab(tab))}
        aria-current={active ? 'page' : undefined}
        className={cn('pressable flex w-14 flex-col items-center gap-0.5 text-[11px]', active ? 'text-x-fg' : 'text-x-gray')}
      >
        <Icon name={icon} size={24} filled={active && tab === 'home'} strokeWidth={active ? 2.1 : 1.8} />
        <span className={active ? 'font-semibold' : ''}>{label}</span>
      </button>
    );
  };

  return (
    <nav
      className="absolute inset-x-3 z-30 flex h-[62px] items-center justify-around rounded-[28px] border backdrop-blur-xl md:hidden"
      style={{
        bottom: 'max(10px, calc(env(safe-area-inset-bottom) - 6px))',
        background: 'var(--nav-bg)',
        borderColor: 'var(--nav-border)',
        boxShadow: 'var(--nav-shadow)',
      }}
    >
      {MAIN_TABS.slice(0, 2).map(item)}
      <button
        type="button"
        onClick={() => push('Compose', {})}
        className="pressable flex w-14 flex-col items-center gap-0.5 text-[11px] text-x-gray"
        aria-label="发帖"
      >
        <span className="-mt-3 flex h-12 w-12 items-center justify-center rounded-full bg-x-blue text-white shadow-lg">
          <Icon name="pencil" size={22} strokeWidth={2} />
        </span>
        <span>发帖</span>
      </button>
      {MAIN_TABS.slice(2).map(item)}
    </nav>
  );
}
