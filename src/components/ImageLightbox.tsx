import { useEffect, useState } from 'react';
import { imageSrc } from '@/data/blobs';
import { cn } from '@/lib/utils';
import Icon from './Icon';

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export default function ImageLightbox({ images, initialIndex, onClose }: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + images.length) % images.length);
      else if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  const step = (delta: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setIndex((i) => (i + delta + images.length) % images.length);
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-black/95" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <img src={imageSrc(images[index])} alt="" className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        className="pressable absolute right-4 z-10 rounded-full bg-white/10 p-2 text-white"
        style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
        aria-label="关闭"
      >
        <Icon name="close" size={22} />
      </button>
      {images.length > 1 && (
        <>
          <button type="button" onClick={step(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white" aria-label="上一张">
            <Icon name="chevronLeft" size={22} />
          </button>
          <button type="button" onClick={step(1)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white" aria-label="下一张">
            <Icon name="chevronRight" size={22} />
          </button>
          <div className="absolute left-1/2 flex -translate-x-1/2 gap-1.5" style={{ bottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}>
            {images.map((_, i) => (
              <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i === index ? 'bg-white' : 'bg-white/30')} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
