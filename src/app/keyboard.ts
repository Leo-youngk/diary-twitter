import { flushSync } from 'react-dom';

/**
 * iOS needs focus inside the original tap. Commit the unanimated writing
 * screen first, then focus its actual field while that gesture is still live.
 * A hidden keyboard proxy could receive input while the page was still on
 * the timeline, and its handoff depended on an animation finishing.
 */
export function openComposer(push: () => { activityId: string }): void {
  let activityId = '';
  flushSync(() => { activityId = push().activityId; });
  // Scope to this exact activity: a previous composer may still be mounted.
  const host = Array.from(document.querySelectorAll<HTMLElement>('[data-compose-activity]'))
    .find((element) => element.dataset.composeActivity === activityId);
  takeKeyboard(host?.querySelector<HTMLTextAreaElement>('[data-compose-input]') ?? null);
}

/** Focus only a connected, visible field; never open a keyboard by itself. */
export function takeKeyboard(field: HTMLTextAreaElement | HTMLInputElement | null): void {
  if (!field?.isConnected || field.getClientRects().length === 0) return;
  try {
    field.focus({ preventScroll: true });
    const end = field.value.length;
    field.setSelectionRange(end, end);
  } catch { /* The visible editor remains tappable if automatic focus fails. */ }
}

/** Do not blur another screen's input when an older composer unmounts. */
export function releaseKeyboard(field: HTMLTextAreaElement | null): void {
  if (field && document.activeElement === field) field.blur();
}
