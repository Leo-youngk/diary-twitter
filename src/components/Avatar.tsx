import { useState } from 'react';
import { imageSrc } from '@/data/blobs';
import { cn } from '@/lib/utils';

interface AvatarProps {
  src: string;
  name: string;
  size?: number;
  className?: string;
}

export default function Avatar({ src, name, size = 44, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (!src || failed) {
    return (
      <div
        style={{ ...style, fontSize: Math.round(size * 0.4) }}
        className={cn('rounded-full bg-x-search text-x-gray font-bold flex items-center justify-center shrink-0 select-none', className)}
      >
        {name.charAt(0).toUpperCase() || '我'}
      </div>
    );
  }
  return (
    <img
      src={imageSrc(src)}
      alt=""
      style={style}
      className={cn('rounded-full object-cover shrink-0 bg-x-darker', className)}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}
