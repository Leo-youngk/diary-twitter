'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

interface AvatarProps {
  src: string;
  alt: string;
  size?: 'sm' | 'md-sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8',
  'md-sm': 'w-9 h-9',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-36 h-36',
};

export default function Avatar({ src, alt, size = 'md', className }: AvatarProps) {
  const fallbackInitial = alt.charAt(0).toUpperCase();

  if (!src) {
    return (
      <div
        className={cn(
          'rounded-full bg-x-darker flex items-center justify-center text-x-gray font-bold shrink-0',
          sizeMap[size],
          className
        )}
      >
        {fallbackInitial}
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-full overflow-hidden shrink-0', sizeMap[size], className)}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes={size === 'xl' ? '144px' : size === 'lg' ? '48px' : size === 'md' ? '40px' : size === 'md-sm' ? '36px' : '32px'}
        unoptimized
      />
    </div>
  );
}
