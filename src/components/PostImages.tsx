import { useState } from 'react';
import { imageSrc } from '@/data/blobs';
import { cn } from '@/lib/utils';
import ImageLightbox from './ImageLightbox';

/** 1 wide, 2 side by side, 3 in a row, 4 in a square — each tile rounded. */
export default function PostImages({ images, large = false }: { images: string[]; large?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;
  const shown = images.slice(0, 4);
  const columns = shown.length === 1 ? 'grid-cols-1' : shown.length === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <>
      <div className={cn('mt-2.5 grid gap-1', columns)}>
        {shown.map((ref, i) => (
          <button
            key={`${ref}-${i}`}
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(i); }}
            className={cn(
              'overflow-hidden rounded-xl border border-x-border bg-x-darker',
              shown.length === 1 ? (large ? 'aspect-[4/3]' : 'aspect-[16/10]') : 'aspect-square',
            )}
          >
            <img src={imageSrc(ref)} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
          </button>
        ))}
      </div>
      {open !== null && <ImageLightbox images={images} initialIndex={open} onClose={() => setOpen(null)} />}
    </>
  );
}
