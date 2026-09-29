import { useState } from 'react';
import type { ActivityComponentType } from '@stackflow/react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useMainTab, type MainTab } from '@/app/mainTab';
import BottomNav from '@/components/BottomNav';
import ProfileDrawer from '@/components/ProfileDrawer';
import { cn } from '@/lib/utils';
import CalendarPane from '@/panes/CalendarPane';
import GoalsPane from '@/panes/GoalsPane';
import HomePane from '@/panes/HomePane';
import StatsPane from '@/panes/StatsPane';

const PANES: Array<[MainTab, () => React.ReactElement]> = [
  ['home', HomePane],
  ['goals', GoalsPane],
  ['calendar', CalendarPane],
  ['stats', StatsPane],
];

/**
 * A tab is mounted the first time it is opened and then stays mounted, only
 * hidden, so it keeps its scroll position and state when you switch away and
 * back — and startup only pays for the tab that is showing.
 */
const MainActivity: ActivityComponentType<'Main'> = () => {
  const tab = useMainTab();
  const [opened, setOpened] = useState<MainTab[]>([tab]);
  if (!opened.includes(tab)) setOpened([...opened, tab]);

  return (
    <AppScreen>
      <div className="relative h-full">
        {PANES.filter(([key]) => opened.includes(key)).map(([key, Pane]) => (
          <div
            key={key}
            data-pane={key}
            className={cn('absolute inset-0', tab === key ? 'visible' : 'invisible pointer-events-none')}
            aria-hidden={tab !== key}
          >
            <Pane />
          </div>
        ))}
        <BottomNav />
        <ProfileDrawer />
      </div>
    </AppScreen>
  );
};

export default MainActivity;
