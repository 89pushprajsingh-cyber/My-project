import React, { useState } from 'react';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { User } from 'firebase/auth';
import { X } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Appointment, ServiceListing, VALIDATION_LIMITS } from '../types';
import { StarRatingInput } from './StarRating';

interface ReviewModalProps {
  user: User;
  appointment: Appointment;
  onClose: () => void;
  onSubmitted: (appointmentId: string, rating: number) => void;
}

export function ReviewModal({
  user,
  appointment,
  onClose,
  onSubmitted,
}: ReviewModalProps) {
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanComment = comment.trim().slice(0, VALIDATION_LIMITS.REVIEW_COMMENT_MAX);
    if (rating < 1 || rating > 5) {
      setErrorMsg('Please select a star rating between 1 and 5.');
      return;
    }
    if (cleanComment.length < VALIDATION_LIMITS.REVIEW_COMMENT_MIN) {
      setErrorMsg('Please write a brief review (at least 3 characters).');
      return;
    }

    setIsSubmitting(true);
    try {
      const serviceRef = doc(db, 'services', appointment.providerId);
      const serviceSnap = await getDoc(serviceRef);
      if (!serviceSnap.exists()) {
        setErrorMsg('This service listing is no longer available.');
        setIsSubmitting(false);
        return;
      }

      const serviceData = serviceSnap.data() as ServiceListing;
      const currentSum = typeof serviceData.ratingSum === 'number' ? serviceData.ratingSum : 0;
      const currentCount = typeof serviceData.ratingCount === 'number' ? serviceData.ratingCount : 0;

      const reviewRef = doc(
        db,
        'services',
        appointment.providerId,
        'reviews',
        appointment.id
      );

      const batch = writeBatch(db);
      batch.set(reviewRef, {
        appointmentId: appointment.id,
        providerId: appointment.providerId,
        seekerId: user.uid,
        reviewerName: (user.displayName || appointment.seekerName || 'Customer').slice(
          0,
          VALIDATION_LIMITS.DISPLAY_NAME_MAX
        ),
        serviceItem: appointment.serviceItem.slice(0, 120),
        rating,
        comment: cleanComment,
        isPublished: true,
        createdAt: serverTimestamp(),
      });

      batch.update(serviceRef, {
        ratingSum: currentSum + rating,
        ratingCount: currentCount + 1,
        lastReviewedAppointmentId: appointment.id,
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      onSubmitted(appointment.id, rating);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Missing or insufficient permissions')) {
        handleFirestoreError(
          err,
          OperationType.WRITE,
          `services/${appointment.providerId}/reviews/${appointment.id}`
        );
      }
      setErrorMsg('Unable to submit review. Please confirm this appointment is completed and has not been reviewed yet.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Review ${appointment.shopName}`}
    >
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 truncate">
              Rate Your Experience
            </h2>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {appointment.shopName} · {appointment.serviceItem}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close review dialog"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {errorMsg && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700"
            >
              {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-2">
              Overall Rating
            </label>
            <StarRatingInput value={rating} onChange={setRating} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="review-comment"
                className="text-xs font-medium text-slate-700"
              >
                Written Feedback
              </label>
              <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                {comment.length}/{VALIDATION_LIMITS.REVIEW_COMMENT_MAX}
              </span>
            </div>
            <textarea
              id="review-comment"
              rows={4}
              required
              minLength={VALIDATION_LIMITS.REVIEW_COMMENT_MIN}
              maxLength={VALIDATION_LIMITS.REVIEW_COMMENT_MAX}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share how the service went, punctuality, hygiene, and overall quality."
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors"
            >
              {isSubmitting ? 'Publishing...' : 'Submit Review'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
