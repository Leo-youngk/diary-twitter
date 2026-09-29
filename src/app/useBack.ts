import { useFlow, useStack } from '@stackflow/react';
import { acquireNavigation } from './nav';

/** Go back, or to the timeline when this screen was opened directly. */
export function useBack(): () => void {
  const { pop, replace } = useFlow();
  const stack = useStack();
  return () => {
    if (!acquireNavigation()) return;
    const active = stack.activities.filter((activity) => activity.transitionState === 'enter-active' || activity.transitionState === 'enter-done');
    if (active.length > 1) pop();
    else replace('Main', {}, { animate: false });
  };
}
