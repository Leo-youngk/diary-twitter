import { Fragment, useSyncExternalStore } from 'react';
import type { Stack } from '@stackflow/core';
import type { StackflowReactPlugin } from '@stackflow/react';

type RenderStack = Parameters<NonNullable<ReturnType<StackflowReactPlugin>['render']>>[0]['stack'];

function Activities({ stack, subscribe, getSnapshot }: {
  stack: RenderStack;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Stack | null;
}) {
  const committed = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return <>{stack.render(committed ?? stack).activities
    .filter(activity => activity.transitionState !== 'exit-done')
    .map(activity => <Fragment key={activity.key}>{activity.render()}</Fragment>)}</>;
}

/**
 * Stackflow's React provider defers its stack snapshot. That normally helps
 * transitions, but flushSync(push) can still return before a writing screen
 * mounts, losing iOS's focus gesture. Render the core's committed snapshot
 * through the public renderer API, preserving activity keys and mounted pages.
 */
export function immediateRendererPlugin(): StackflowReactPlugin {
  return () => {
    let snapshot: Stack | null = null;
    const listeners = new Set<() => void>();
    const getSnapshot = () => snapshot;
    const subscribe = (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    };
    const commit = (next: Stack) => {
      if (snapshot === next) return;
      snapshot = next;
      listeners.forEach(listener => listener());
    };
    return {
      key: 'diary-immediate-renderer',
      onInit: ({ actions }) => commit(actions.getStack()),
      onChanged: ({ actions }) => commit(actions.getStack()),
      render: ({ stack }) => <Activities stack={stack} subscribe={subscribe} getSnapshot={getSnapshot} />,
    };
  };
}
