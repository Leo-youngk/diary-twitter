import { useLayoutEffect, type RefObject } from 'react';

const KEYBOARD_MIN_PX = 120;

/**
 * Keeps a full-screen page inside the part of the screen the keyboard leaves
 * free, so a toolbar at its bottom rides on top of the keyboard (as in
 * Threads). iOS only shrinks the visual viewport when the keyboard opens; the
 * page itself keeps its height and may be scrolled up underneath. So the host
 * takes the visual viewport's height and follows its offset.
 *
 * The same approach runs on-device in 人生之书's writing page. The element gets
 * data-keyboard="open|closed" for styling (e.g. dropping the home-indicator gap).
 */
export function useKeyboardViewport(ref: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const viewport = window.visualViewport;
    const sync = () => {
      const host = ref.current;
      if (!host) return;
      const open = Boolean(viewport && window.innerHeight - viewport.height > KEYBOARD_MIN_PX);
      host.style.height = open && viewport ? `${viewport.height}px` : '';
      host.style.transform = open && viewport ? `translateY(${viewport.offsetTop}px)` : '';
      host.dataset.keyboard = open ? 'open' : 'closed';
    };
    sync();
    viewport?.addEventListener('resize', sync);
    viewport?.addEventListener('scroll', sync);
    return () => {
      viewport?.removeEventListener('resize', sync);
      viewport?.removeEventListener('scroll', sync);
    };
  }, [ref]);
}
