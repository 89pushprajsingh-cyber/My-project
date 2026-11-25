import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { MessageSquareQuote, Star } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { ServiceReview } from '../types';

interface ProviderReviewsListProps {
  providerId: string;
  compact?: boolean;
}

function formatReviewDate(ts: unknown): string {
  if (
    ts &&
    typeof ts === 'object' &&
    'toDate' in ts &&
    typeof (ts as { toDate: () => Date }).toDate === 'function'
  ) {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return 'Recent';
}

export function ProviderReviewsList({
  providerId,
  compact = false,
}: ProviderReviewsListProps) {
  const [reviews, setReviews] = useState<ServiceReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const reviewsPath = `services/${providerId}/reviews`;
    const q = query(
      collection(db, 'services', providerId, 'reviews'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setReviews(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ServiceReview, 'id'>),
          }))
        );
        setIsLoading(false);
      },
      (err) => {
        setIsLoading(false);
        handleFirestoreError(err, OperationType.LIST, reviewsPath);
      }
    );

    return () => unsubscribe();
  }, [providerId]);

  const stats = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    let sum = 0;
    for (const r of reviews) {
      const clamped = Math.min(5, Math.max(1, Math.round(r.rating)));
      counts[clamped] = (counts[clamped] || 0) + 1;
      sum += r.rating;
    }
    const total = reviews.length;
    const avg = total > 0 ? sum / total : 0;
    return { counts, total, avg };
  }, [reviews]);

  if (isLoading) {
    return (
      <div className="py-6 text-xs text-slate-400 text-center">
        Loading customer reviews...
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="py-6 text-center px-4">
        <MessageSquareQuote className="w-6 h-6 text-slate-300 mx-auto mb-2" />
        <p className="text-xs font-medium text-slate-700">No reviews yet</p>
        <p className="mt-1 text-xs text-slate-500">
          Verified customers can submit a star rating and review after completing an appointment.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rating Summary & Breakdown */}
      <div className={`flex items-center gap-5 ${compact ? 'pb-3 border-b border-slate-100' : 'pb-5 border-b border-slate-100'}`}>
        <div className="text-center shrink-0">
          <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {stats.avg.toFixed(1)}
          </div>
          <div className="flex items-center justify-center gap-0.5 mt-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-3 h-3 ${
                  star <= Math.round(stats.avg)
                    ? 'text-amber-500 fill-amber-500'
                    : 'text-slate-200'
                }`}
              />
            ))}
          </div>
          <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
            {stats.total} {stats.total === 1 ? 'review' : 'reviews'}
          </p>
        </div>

        <div className="flex-1 space-y-1">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = stats.counts[star] || 0;
            const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
            return (
              <div key={star} className="flex items-center gap-2 text-[11px]">
                <span className="w-3 font-mono tabular-nums text-slate-600 text-right">
                  {star}
                </span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-5 font-mono tabular-nums text-slate-400 text-right">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reviews List */}
      <div className={`divide-y divide-slate-100 ${compact ? 'max-h-52 overflow-y-auto pr-1' : ''}`}>
        {reviews.map((review) => (
          <article key={review.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-900 truncate">
                {review.reviewerName}
              </span>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums shrink-0">
                {formatReviewDate(review.createdAt)}
              </span>
            </div>

            <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
              <span className="inline-flex items-center gap-0.5 text-amber-600 font-semibold font-mono tabular-nums">
                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                <span>{review.rating}.0</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{review.serviceItem}</span>
            </div>

            <p className="mt-1.5 text-xs text-slate-700 leading-relaxed">
              {review.comment}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
