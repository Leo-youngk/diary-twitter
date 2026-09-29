import { useRef, useState } from 'react';
import { setProfileOpen, useProfileOpen } from '@/app/profilePanel';
import { cn } from '@/lib/utils';
import ProfileView from './ProfileView';

const CLOSE_DRAG_PX = 80;

/**
 * The profile page, sliding in from the left over the main tabs when the
 * avatar is tapped. It lives inside the main screen, so posts and 设置 opened
 * from it slide in on top as usual, and going back returns here.
 * Mounted on first open and kept, so it remembers its tab and scroll.
 * Back button or a leftward swipe closes it.
 */
export default function ProfilePanel() {
  const open = useProfileOpen();
  const [opened, setOpened] = useState(false);
  if (open && !opened) setOpened(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; dx: number; horizontal: boolean | null } | null>(null);

  const close = () => setProfileOpen(false);
  const follow = (dx: number | null) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = dx === null ? '' : 'none';
    panel.style.transform = dx === null ? '' : `translateX(${Math.min(0, dx)}px)`;
  };

  if (!opened) return null;
  return (
    <div className={cn('overlay absolute inset-0 z-40 overflow-hidden', open && 'open')} aria-hidden={!open}>
      <div className="absolute inset-0 bg-black/25" onClick={close} />
      <div
        ref={panelRef}
        className={cn('absolute inset-0 transition-transform duration-300 ease-out', open ? 'translate-x-0' : '-translate-x-full')}
        onTouchStart={(e) => { drag.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, horizontal: null }; }}
        onTouchMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.touches[0].clientX - d.x;
          const dy = e.touches[0].clientY - d.y;
          // Decide once per gesture: a mostly-sideways drag closes, anything else scrolls.
          if (d.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) d.horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
          if (!d.horizontal) return;
          d.dx = dx;
          follow(dx);
        }}
        onTouchEnd={() => {
          const d = drag.current;
          drag.current = null;
          if (!d?.horizontal) return;
          follow(null);
          if (d.dx < -CLOSE_DRAG_PX) close();
        }}
      >
        <ProfileView onBack={close} />
      </div>
    </div>
  );
}
