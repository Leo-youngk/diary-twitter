'use client';

import { useEffect, useState } from 'react';

// TEMPORARY — remove once the bottom-nav safe-area issue is diagnosed.
const BUILD = 'v5-debug';

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

      setInfo([
        `BUILD ${BUILD}`,
        `safe T/B ${safeTop} / ${safeBottom}`,
        `--nav-gap ${rootCs.getPropertyValue('--nav-gap').trim() || '(unset)'}`,
        `--nav-h ${rootCs.getPropertyValue('--nav-h').trim() || '(unset)'}`,
        `nav.bottom(css) ${navCs?.bottom ?? '-'}`,
        `nav rect b/h ${navRect ? `${Math.round(navRect.bottom)} / ${Math.round(navRect.height)}` : '-'}`,
        `innerH ${window.innerHeight}  clientH ${document.documentElement.clientHeight}`,
        `visualVP ${window.visualViewport ? Math.round(window.visualViewport.height) : '-'}`,
        `standalone ${String((window.navigator as unknown as { standalone?: boolean }).standalone)}`,
      ]);
    };

    read();
    window.addEventListener('resize', read);
    return () => window.removeEventListener('resize', read);
  }, []);

  return (
    <div
      className="fixed left-0 right-0 z-[200] pointer-events-none bg-black/85 text-[11px] leading-[1.45] text-lime-300 font-mono px-2 py-1"
      style={{ top: 'env(safe-area-inset-top)' }}
    >
      {info.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}
