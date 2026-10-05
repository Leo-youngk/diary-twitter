import { useEffect, useState } from 'react';
import { useActivity, useFlow, useStack, type ActivityComponentType } from '@stackflow/react';
import { AppScreen } from '@stackflow/plugin-basic-ui';
import { useMainTab, type MainTab } from '@/app/mainTab';
import { registerDesktopMainReturn } from '@/app/desktopPanel';
import BottomNav from '@/components/BottomNav';
import DesktopPanel from '@/components/DesktopPanel';
import ProfilePanel from '@/components/ProfilePanel';
import UpdatePrompt from '@/components/UpdatePrompt';
import { cn } from '@/lib/utils';
import AnalysisPane from '@/panes/AnalysisPane';
import GoalsPane from '@/panes/GoalsPane';
import HomePane from '@/panes/HomePane';
import StatsPane from '@/panes/StatsPane';

const PANES: Array<[MainTab, () => React.ReactElement]> = [
  ['home', HomePane],
  ['goals', GoalsPane],
  ['analysis', AnalysisPane],
  ['stats', StatsPane],
];

/**
 * A tab is mounted the first time it is opened and then stays mounted, only
 * hidden, so it keeps its scroll position and state when you switch away and
 * back — and startup only pays for the tab that is showing.
 */
const MainActivity: ActivityComponentType<'Main'> = () => {
  const tab = useMainTab();
  const activity = useActivity();
  const stack = useStack();
  const flow = useFlow();
  useEffect(() => registerDesktopMainReturn(() => {
    const active = stack.activities.filter((item) => item.transitionState === 'enter-active' || item.transitionState === 'enter-done');
    const index = active.findIndex((item) => item.id === activity.id);
    if (index >= 0 && active.length > index + 1) flow.pop(active.length - index - 1, { animate: false });
  }), [activity.id, stack.activities, flow]);
  const [opened, setOpened] = useState<MainTab[]>([tab]);
  if (!opened.includes(tab)) setOpened([...opened, tab]);

  return (
    <AppScreen>
      <div className="relative flex h-full">
        <div className="relative h-full min-w-0 flex-1">
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
        <UpdatePrompt />
        <ProfilePanel />
        </div>
        <DesktopPanel />
      </div>
    </AppScreen>
  );
};

export default MainActivity;
