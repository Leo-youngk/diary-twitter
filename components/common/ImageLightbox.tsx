'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export default function ImageLightbox({ images, initialIndex, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  // Esc to close, arrow keys to switch — desktop convenience only.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + images.length) % images.length);
      else if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setIndex((i) => (i - 1 + images.length) % images.length); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setIndex((i) => (i + 1) % images.length); };

  return (
    // overflow-hidden wrapper: on iOS a position:fixed element can otherwise
    // still make the page scrollable — see ProfileDrawer.tsx for the same fix.
    <div className="fixed inset-0 overflow-hidden z-[100]" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div className="absolute inset-0 bg-black/90" />

      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
        aria-label="关闭"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
        </svg>
      </button>

      <div className="relative w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <div className="relative w-full h-full max-w-4xl max-h-[85vh] m-auto">
          <Image src={images[index]} alt={`Image ${index + 1}`} fill className="object-contain" unoptimized />
        </div>

        {images.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
              aria-label="上一张"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
                <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
              </svg>
            </button>
            <button
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
              aria-label="下一张"
            >
              <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current rotate-180">
                <path d="M7.414 13l5.043 5.04-1.414 1.42L3.586 12l7.457-7.46 1.414 1.42L7.414 11H21v2H7.414z" />
              </svg>
            </button>
            <div
              className={cn(
                'absolute left-1/2 -translate-x-1/2 flex gap-1.5',
              )}
              style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            >
              {images.map((_, i) => (
                <span
                  key={i}
                  className={cn('w-1.5 h-1.5 rounded-full transition-colors', i === index ? 'bg-white' : 'bg-white/30')}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
