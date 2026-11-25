import React, { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingDisplayProps {
  average: number | null;
  count: number;
  compact?: boolean;
}

export function StarRatingDisplay({
  average,
  count,
  compact = false,
}: StarRatingDisplayProps) {
  if (average === null || count === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
        <Star className="w-3.5 h-3.5 text-slate-300" />
        <span>New</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate-700">
      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
      <span className="font-semibold text-slate-900 tabular-nums">
        {average.toFixed(1)}
      </span>
      <span className="text-slate-500 tabular-nums">
        {compact ? `(${count})` : `(${count} ${count === 1 ? 'review' : 'reviews'})`}
      </span>
    </span>
  );
}

const RATING_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

interface StarRatingInputProps {
  value: number;
  onChange: (rating: number) => void;
}

export function StarRatingInput({ value, onChange }: StarRatingInputProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const activeValue = hovered ?? value;

  return (
    <div className="flex items-center gap-3">
      <div
        role="radiogroup"
        aria-label="Star rating"
        className="flex items-center gap-1"
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= activeValue;
          return (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={value === star}
              aria-label={`${star} star${star > 1 ? 's' : ''} — ${RATING_LABELS[star]}`}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onChange(star)}
              className="p-1.5 rounded-lg hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-colors"
            >
              <Star
                className={`w-6 h-6 transition-colors ${
                  filled
                    ? 'text-amber-500 fill-amber-500'
                    : 'text-slate-300'
                }`}
              />
            </button>
          );
        })}
      </div>
      <span className="text-sm font-medium text-slate-700 tabular-nums">
        {activeValue > 0 ? `${activeValue}/5 · ${RATING_LABELS[activeValue]}` : 'Select rating'}
      </span>
    </div>
  );
}
