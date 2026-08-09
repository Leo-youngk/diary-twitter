'use client';

import { useEffect, useState } from 'react';

// TEMPORARY — remove once the bottom-nav safe-area issue is diagnosed.
const BUILD = 'v6-debug';

export default function DebugOverlay() {
  const [info, setInfo] = useState<string[]>([]);

  useEffect(() => {
    const read = () => {
      // env() can't be read directly, so measure it through a probe element.
      const probe = document.createElement('div');
      probe.style.cssText =
        'position:fixed;left:-9999px;top:0;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);';
      document.body.appendChild(probe);
      const pcs = getComputedStyle(probe);
      const safeTop = pcs.paddingTop;
      const safeBottom = pcs.paddingBottom;
      probe.remove();

      const rootCs = getComputedStyle(document.documentElement);
      const nav = document.querySelector('nav');
      const navRect = nav?.getBoundingClientRect();
      const navCs = nav ? getComputedStyle(nav) : null;
      const vv = window.visualViewport;

      setInfo([
        `BUILD ${BUILD}`,
        `safe T/B ${safeTop} / ${safeBottom}`,
        `screen ${window.screen.width}x${window.screen.height}`,
        `inner ${window.innerWidth}x${window.innerHeight} outerH ${window.outerHeight}`,
        `clientH ${document.documentElement.clientHeight}  bodyH ${document.body.clientHeight}`,
        `visualVP h ${vv ? Math.round(vv.height) : '-'} offT ${vv ? Math.round(vv.offsetTop) : '-'}`,
        `--nav-gap ${rootCs.getPropertyValue('--nav-gap').trim() || '(unset)'} --nav-h ${rootCs.getPropertyValue('--nav-h').trim() || '(unset)'}`,
        `nav css-bottom ${navCs?.bottom ?? '-'}`,
        `nav rect t/b/h ${navRect ? `${Math.round(navRect.top)} / ${Math.round(navRect.bottom)} / ${Math.round(navRect.height)}` : '(no nav yet)'}`,
        `standalone ${String((window.navigator as unknown as { standalone?: boolean }).standalone)}`,
      ]);
    };

    read();
    // AppShell renders a loading spinner instead of children on first paint, so
    // <nav> doesn't exist yet — keep re-reading until the real UI is up.
    const timer = window.setInterval(read, 500);
    window.setTimeout(() => window.clearInterval(timer), 15000);
    window.addEventListener('resize', read);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', read);
    };
  }, []);

  return (
    <>
      {/* Viewport outline + edge bars: the screenshot shows directly where the
          viewport's top and bottom edges land on the physical screen. */}
      <div className="fixed inset-0 z-[199] pointer-events-none border-[3px] border-fuchsia-500" />
      <div className="fixed top-0 left-0 right-0 h-[6px] z-[199] pointer-events-none bg-cyan-400" />
      <div className="fixed bottom-0 left-0 right-0 h-[6px] z-[199] pointer-events-none bg-red-500" />
      <div
        className="fixed left-0 right-0 z-[200] pointer-events-none bg-black/85 text-[11px] leading-[1.45] text-lime-300 font-mono px-2 py-1"
        style={{ top: 'env(safe-area-inset-top)' }}
      >
        {info.map((line) => (
          <div key={line}>{line}</div>
        ))}
      </div>
    </>
  );
}
