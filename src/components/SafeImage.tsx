import React, { useState } from 'react';
import { Store } from 'lucide-react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function SafeImage({
  src,
  alt,
  className = '',
  fallbackLabel = 'Service Photo',
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  const isSafePath =
    typeof src === 'string' &&
    (src.startsWith('/uploads/') ||
      src.startsWith('/src/assets/images/') ||
      src.startsWith('https://'));

  if (!isSafePath || failed) {
    return (
      <div
        className={`bg-slate-100 border border-slate-200 flex flex-col items-center justify-center text-slate-400 p-4 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Store className="w-6 h-6 text-slate-400 mb-1.5" />
        <span className="text-xs font-medium text-slate-500 text-center line-clamp-1">
          {fallbackLabel}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
