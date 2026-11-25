import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import { collection, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import {
  Calendar,
  Check,
  Clock,
  Eye,
  EyeOff,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Star,
  Store,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Appointment,
  AppointmentStatus,
  getAverageRating,
  getServiceCatalogItems,
  ServiceListing,
} from '../types';
import { SafeImage } from './SafeImage';
import { StarRatingDisplay } from './StarRating';
import { ProviderReviewsList } from './ProviderReviewsList';

interface ProviderDashboardProps {
  user: User;
  ownService: ServiceListing | null;
  appointments: Appointment[];
  pendingCounterBillsCount: number;
  onEditShop: () => void;
  onOpenAllBookings: () => void;
  onOpenBills: () => void;
  onOpenChatByThread: (appt: Appointment) => void;
}

export function ProviderDashboard({
  user,
  ownService,
  appointments,
  pendingCounterBillsCount,
  onEditShop,
  onOpenAllBookings,
  onOpenBills,
  onOpenChatByThread,
}: ProviderDashboardProps) {
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  const metrics = useMemo(() => {
    let pending = 0;
    let confirmed = 0;
    let completed = 0;
    for (const appt of appointments) {
      if (appt.status === 'pending') pending += 1;
      else if (appt.status === 'confirmed') confirmed += 1;
      else if (appt.status === 'completed') completed += 1;
    }
    return { pending, confirmed, completed };
  }, [appointments]);

  const activeQueue = useMemo(
    () =>
      appointments
        .filter((a) => a.status === 'pending' || a.status === 'confirmed')
        .slice(0, 6),
    [appointments]
  );

  const handleToggleVisibility = async () => {
    if (!ownService || isTogglingStatus) return;
    setIsTogglingStatus(true);
    try {
      const legacyRatingBackfill =
        ownService.ratingSum === undefined
          ? {
              ratingSum: 0,
              ratingCount: 0,
              lastReviewedAppointmentId: '',
            }
          : {};

      await updateDoc(doc(db, 'services', user.uid), {
        isActive: !ownService.isActive,
        ...legacyRatingBackfill,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `services/${user.uid}`);
    } finally {
      setIsTogglingStatus(false);
    }
  };

  const handleStatusChange = async (appt: Appointment, nextStatus: AppointmentStatus) => {
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'appointments', appt.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });

      const statusText =
        nextStatus === 'confirmed'
          ? 'Confirmed'
          : nextStatus === 'declined'
            ? 'Declined'
            : nextStatus === 'completed'
              ? 'Completed'
              : 'Cancelled';

      const summary = `Appointment ${statusText}: ${appt.serviceItem} (${appt.scheduledDate} at ${appt.scheduledTime})`;

      batch.update(doc(db, 'chats', appt.chatId), {
        lastMessage: summary.slice(0, 300),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(collection(db, 'chats', appt.chatId, 'messages')), {
        senderId: user.uid,
        senderName: (user.displayName || 'Provider').slice(0, 80),
        seekerId: appt.seekerId,
        providerId: appt.providerId,
        type: 'appointment_update',
        text: summary,
        appointmentId: appt.id,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `appointments/${appt.id}`);
    }
  };

  if (!ownService) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <div className="max-w-2xl">
            <p className="text-xs font-medium text-blue-700 mb-2">
              Service Provider Studio
            </p>
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
              Set up your shop to start receiving local bookings
            </h1>
            <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
              Customers searching the discovery map only see Aadhaar-verified shops with an active location pin and service catalog. Complete your one-time setup to go live.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-5 pt-6 border-t border-slate-100">
              <div>
                <p className="text-xs font-semibold text-slate-900">01. Aadhaar Verification</p>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Stored privately to unlock your verified trust mark for local customers.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">02. Map Pin & Hours</p>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Place your shop pin accurately so nearby seekers find you within radius.
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-900">03. Photos & Menu</p>
                <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                  Upload up to 3 shop photos and list prices so customers can book in chat.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <button
                type="button"
                onClick={onEditShop}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap"
              >
                <Store className="w-4 h-4" />
                <span>Complete Shop & KYC Setup</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const avgRating = getAverageRating(ownService);
  const reviewCount = ownService.ratingCount ?? 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Header & Live Status Control */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
            <span>{ownService.category}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Aadhaar Verified</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className={ownService.isActive ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
              {ownService.isActive ? 'Live on Customer Map' : 'Paused (Hidden from Map)'}
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight truncate">
            {ownService.shopName}
          </h1>
          <p className="mt-1 text-xs text-slate-500 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">{ownService.address} · {ownService.openHours}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {pendingCounterBillsCount > 0 && (
            <button
              type="button"
              onClick={onOpenBills}
              className="px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors whitespace-nowrap tabular-nums"
            >
              {pendingCounterBillsCount} Counter Bill{pendingCounterBillsCount > 1 ? 's' : ''} Due
            </button>
          )}
          <button
            type="button"
            disabled={isTogglingStatus}
            onClick={() => void handleToggleVisibility()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
          >
            {ownService.isActive ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                <span>Pause Listing</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Go Live on Map</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onEditShop}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
          >
            Edit Shop & KYC
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Pending Requests</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.pending}
          </p>
          <p className="mt-1 text-xs text-slate-500">Awaiting your confirmation</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Confirmed Slots</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.confirmed}
          </p>
          <p className="mt-1 text-xs text-slate-500">Upcoming customer visits</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Completed Services</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 font-mono tabular-nums">
            {metrics.completed}
          </p>
          <p className="mt-1 text-xs text-slate-500">Eligible for customer review</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-xs font-medium text-slate-500">Customer Rating</p>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {avgRating !== null ? avgRating.toFixed(1) : '—'}
            </span>
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
          </div>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {reviewCount} verified {reviewCount === 1 ? 'review' : 'reviews'}
          </p>
        </div>
      </div>

      {/* Main Two-Column Operations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Active Booking Queue */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Active Booking Queue
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Respond to incoming requests or mark finished appointments as completed.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenAllBookings}
              className="text-xs font-semibold text-blue-700 hover:underline whitespace-nowrap shrink-0"
            >
              View All
            </button>
          </div>

          {activeQueue.length === 0 ? (
            <div className="p-10 text-center">
              <Calendar className="w-7 h-7 text-slate-300 mx-auto mb-2.5" />
              <p className="text-sm font-medium text-slate-800">No pending or upcoming bookings</p>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                When customers discover your shop on the map and request a slot in chat, their requests appear here immediately.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeQueue.map((appt) => (
                <div
                  key={appt.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {appt.seekerName}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">·</span>
                      <span
                        className={`text-xs font-semibold capitalize ${
                          appt.status === 'confirmed' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {appt.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 truncate">{appt.serviceItem}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{appt.scheduledDate}</span>
                      <span aria-hidden="true">·</span>
                      <span>{appt.scheduledTime}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {appt.status === 'pending' && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(appt, 'confirmed')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg whitespace-nowrap"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Confirm</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(appt, 'declined')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg whitespace-nowrap"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      </>
                    )}

                    {appt.status === 'confirmed' && (
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(appt, 'completed')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Complete</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenChatByThread(appt)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Chat</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: Shop Preview & Verified Reviews */}
        <section className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="h-36 bg-slate-100">
              <SafeImage
                src={ownService.photoUrls[0]}
                alt={ownService.shopName}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  Customer Map Listing Preview
                </p>
                <p className="text-xs text-slate-500 truncate mt-0.5 tabular-nums">
                  {getServiceCatalogItems(ownService).length} catalog items · {ownService.photoUrls.length} photos
                </p>
              </div>
              <StarRatingDisplay average={avgRating} count={reviewCount} compact />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-900">
                Customer Reviews
              </h2>
              <StarRatingDisplay average={avgRating} count={reviewCount} compact />
            </div>
            <div className="mt-4">
              <ProviderReviewsList providerId={user.uid} compact />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
