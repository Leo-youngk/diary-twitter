import { useMemo } from 'react';
import { useActivity, useFlow } from '@stackflow/react';
import type { InferActivityParams, RegisteredActivityName } from '@stackflow/config';
import { openComposer } from './keyboard';
import { isWideDesktop, showDesktopPanel } from './desktopPanel';

/**
 * Navigation that ignores a second tap while a page is still sliding in or
 * out. Without it a quick double tap pushed the same screen twice, and a
 * burst of taps could leave the stack mid-transition.
 */

const LOCK_MS = 450; // a little longer than the 350ms transition
const COMPOSE_LOCK_MS = 150; // the editor opens immediately, without a transition

let lockedUntil = 0;

export function acquireNavigation(duration = LOCK_MS): boolean {
  const now = Date.now();
  if (now < lockedUntil) return false;
  lockedUntil = now + duration;
  return true;
}

export interface Nav {
  push<K extends RegisteredActivityName>(name: K, params: InferActivityParams<K>): void;
  replace<K extends RegisteredActivityName>(name: K, params: InferActivityParams<K>, options?: { animate?: boolean }): void;
  pop(): void;
}

export function useNav(): Nav {
  const flow = useFlow();
  const activity = useActivity();
  return useMemo<Nav>(() => ({
    push(name, params) {
      if (activity.name === 'Main' && isWideDesktop()) {
        if (name === 'Post') {
          showDesktopPanel({ kind: 'post', params: params as InferActivityParams<'Post'> });
          return;
        }
        if (name === 'Compose') {
          showDesktopPanel({ kind: 'compose', params: params as InferActivityParams<'Compose'>, focus: Date.now() });
          return;
        }
      }
      if (!acquireNavigation(name === 'Compose' ? COMPOSE_LOCK_MS : LOCK_MS)) return;
      if (name === 'Compose') {
        openComposer(() => flow.push(name, params, { animate: false }));
      } else flow.push(name, params);
    },
    replace(name, params, options) { if (acquireNavigation()) flow.replace(name, params, options); },
    pop() {
      const composing = activity.name === 'Compose';
      if (acquireNavigation(composing ? COMPOSE_LOCK_MS : LOCK_MS)) flow.pop({ animate: !composing });
    },
  }), [flow, activity.name]);
}
