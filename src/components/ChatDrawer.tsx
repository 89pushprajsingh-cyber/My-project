import React, { useEffect, useRef, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import {
  Calendar,
  Check,
  Clock,
  Send,
  ShieldCheck,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Appointment,
  AppointmentStatus,
  ChatMessage,
  ServiceListing,
  VALIDATION_LIMITS,
} from '../types';

interface ChatDrawerProps {
  user: User;
  chatId: string;
  seekerId: string;
  seekerName: string;
  providerId: string;
  shopName: string;
  serviceListing?: ServiceListing | null;
  appointments: Appointment[];
  reviewedRatingsByApptId?: Record<string, number>;
  onOpenReview?: (appt: Appointment) => void;
  onClose: () => void;
}

const TIME_SLOTS = [
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
];

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function ChatDrawer({
  user,
  chatId,
  seekerId,
  seekerName,
  providerId,
  shopName,
  serviceListing,
  appointments,
  reviewedRatingsByApptId,
  onOpenReview,
  onClose,
}: ChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [selectedServiceItem, setSelectedServiceItem] = useState(
    serviceListing?.servicesOffered?.[0] || 'Standard Service Appointment'
  );
  const [scheduledDate, setScheduledDate] = useState(getTodayDateString());
  const [scheduledTime, setScheduledTime] = useState('11:00');
  const [bookingNotes, setBookingNotes] = useState('');
  const [isBooking, setIsBooking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isProvider = user.uid === providerId;
  const isSeeker = user.uid === seekerId;

  useEffect(() => {
    if (serviceListing?.servicesOffered?.length) {
      setSelectedServiceItem(serviceListing.servicesOffered[0]);
    }
  }, [serviceListing]);

  useEffect(() => {
    const messagesPath = `chats/${chatId}/messages`;
    const q = query(
      collection(db, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const loaded: ChatMessage[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ChatMessage, 'id'>),
        }));
        setMessages(loaded);
      },
      (err) => {
        // Ignore initial not-found if chat hasn't been created yet, surface real errors
        const msg = err.message || '';
        if (msg.includes('Missing or insufficient permissions')) {
          // Only throw if the chat doc actually exists and failed auth
          void getDoc(doc(db, 'chats', chatId)).then((chatSnap) => {
            if (chatSnap.exists()) {
              handleFirestoreError(err, OperationType.LIST, messagesPath);
            }
          });
        }
      }
    );

    return () => unsubscribe();
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, appointments.length]);

  const chatAppointments = appointments.filter((a) => a.chatId === chatId);

  const ensureChatBatch = async (
    batch: ReturnType<typeof writeBatch>,
    summaryText: string
  ) => {
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    const clippedSummary = summaryText.slice(0, 300);

    if (chatSnap.exists()) {
      batch.update(chatRef, {
        lastMessage: clippedSummary,
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(chatRef, {
        seekerId,
        seekerName: seekerName.slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
        providerId,
        shopName: shopName.slice(0, VALIDATION_LIMITS.SHOP_NAME_MAX),
        lastMessage: clippedSummary,
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = messageText.trim().slice(0, VALIDATION_LIMITS.CHAT_MESSAGE_MAX);
    if (!trimmed) return;

    setIsSending(true);
    setActionError(null);
    try {
      const batch = writeBatch(db);
      await ensureChatBatch(batch, trimmed);

      const msgRef = doc(collection(db, 'chats', chatId, 'messages'));
      batch.set(msgRef, {
        senderId: user.uid,
        senderName: (user.displayName || 'User').slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
        seekerId,
        providerId,
        type: 'text',
        text: trimmed,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      setMessageText('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to send message.');
      handleFirestoreError(err, OperationType.WRITE, `chats/${chatId}/messages`);
    } finally {
      setIsSending(false);
    }
  };

  const handleRequestAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSeeker) return;

    const cleanService = selectedServiceItem.trim().slice(0, 120);
    const cleanNotes = bookingNotes.trim().slice(0, VALIDATION_LIMITS.APPT_NOTES_MAX);
    if (!cleanService || !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !/^\d{2}:\d{2}$/.test(scheduledTime)) {
      setActionError('Please choose a valid service, date, and time slot.');
      return;
    }

    setIsBooking(true);
    setActionError(null);
    try {
      const batch = writeBatch(db);
      const summary = `Appointment requested: ${cleanService} on ${scheduledDate} at ${scheduledTime}`;
      await ensureChatBatch(batch, summary);

      const apptRef = doc(collection(db, 'appointments'));
      batch.set(apptRef, {
        seekerId,
        seekerName: seekerName.slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
        providerId,
        shopName: shopName.slice(0, VALIDATION_LIMITS.SHOP_NAME_MAX),
        chatId,
        serviceItem: cleanService,
        scheduledDate,
        scheduledTime,
        notes: cleanNotes,
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const msgRef = doc(collection(db, 'chats', chatId, 'messages'));
      batch.set(msgRef, {
        senderId: user.uid,
        senderName: (user.displayName || 'Customer').slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
        seekerId,
        providerId,
        type: 'appointment_request',
        text: `${summary}${cleanNotes ? ` — ${cleanNotes}` : ''}`.slice(0, VALIDATION_LIMITS.CHAT_MESSAGE_MAX),
        appointmentId: apptRef.id,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
      setBookingNotes('');
      setShowBookingForm(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to schedule appointment.');
      handleFirestoreError(err, OperationType.WRITE, 'appointments');
    } finally {
      setIsBooking(false);
    }
  };

  const handleUpdateAppointmentStatus = async (
    appt: Appointment,
    nextStatus: AppointmentStatus
  ) => {
    setActionError(null);
    try {
      const batch = writeBatch(db);
      const apptRef = doc(db, 'appointments', appt.id);
      batch.update(apptRef, {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });

      const statusLabel =
        nextStatus === 'confirmed'
          ? 'Confirmed'
          : nextStatus === 'declined'
            ? 'Declined'
            : nextStatus === 'completed'
              ? 'Completed'
              : 'Cancelled';

      const updateText = `Appointment ${statusLabel}: ${appt.serviceItem} (${appt.scheduledDate} at ${appt.scheduledTime})`;
      await ensureChatBatch(batch, updateText);

      const msgRef = doc(collection(db, 'chats', chatId, 'messages'));
      batch.set(msgRef, {
        senderId: user.uid,
        senderName: (user.displayName || 'User').slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
        seekerId,
        providerId,
        type: 'appointment_update',
        text: updateText,
        appointmentId: appt.id,
        createdAt: serverTimestamp(),
      });

      await batch.commit();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not update appointment.');
      handleFirestoreError(err, OperationType.UPDATE, `appointments/${appt.id}`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label={`Chat with ${shopName}`}
    >
      <div className="w-full max-w-lg bg-white h-full flex flex-col border-l border-slate-200 shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 truncate">
                {isProvider && user.uid !== seekerId ? seekerName : shopName}
              </h2>
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
            <p className="text-xs text-slate-500 truncate mt-0.5">
              {isProvider && user.uid !== seekerId
                ? `Inquiry for ${shopName}`
                : 'Real-time chat · Direct appointment scheduling'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat panel"
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Appointment Action Bar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {chatAppointments.length > 0 ? (
              <span className="tabular-nums font-medium text-slate-800">
                {chatAppointments.length} appointment{chatAppointments.length > 1 ? 's' : ''} in thread
              </span>
            ) : (
              <span>Need a slot? Propose a time directly.</span>
            )}
          </div>
          {isSeeker && (
            <button
              type="button"
              onClick={() => setShowBookingForm((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{showBookingForm ? 'Hide Scheduler' : 'Schedule Slot'}</span>
            </button>
          )}
        </div>

        {/* Inline Appointment Request Composer */}
        {showBookingForm && isSeeker && (
          <form
            onSubmit={handleRequestAppointment}
            className="p-4 bg-blue-50/60 border-b border-blue-100 space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Select Service
                </label>
                {serviceListing?.servicesOffered?.length ? (
                  <select
                    value={selectedServiceItem}
                    onChange={(e) => setSelectedServiceItem(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
                  >
                    {serviceListing.servicesOffered.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={selectedServiceItem}
                    onChange={(e) => setSelectedServiceItem(e.target.value)}
                    placeholder="Service name"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  required
                  min={getTodayDateString()}
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Time Slot
                </label>
                <select
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
                >
                  {TIME_SLOTS.map((slot) => (
                    <option key={slot} value={slot}>
                      {slot}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.APPT_NOTES_MAX}
                  value={bookingNotes}
                  onChange={(e) => setBookingNotes(e.target.value)}
                  placeholder="Optional notes (e.g., preferred barber or style)"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBookingForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBooking}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg disabled:opacity-60"
              >
                {isBooking ? 'Sending Request...' : 'Send Appointment Request'}
              </button>
            </div>
          </form>
        )}

        {actionError && (
          <div className="px-5 py-2.5 bg-red-50 border-b border-red-200 text-xs text-red-700">
            {actionError}
          </div>
        )}

        {/* Active Appointments Summary inside Thread */}
        {chatAppointments.length > 0 && (
          <div className="px-5 py-3 border-b border-slate-200 bg-white space-y-2 max-h-44 overflow-y-auto">
            {chatAppointments.map((appt) => {
              const isTerminal =
                appt.status === 'declined' ||
                appt.status === 'cancelled' ||
                appt.status === 'completed';

              const statusColor =
                appt.status === 'confirmed'
                  ? 'text-emerald-700'
                  : appt.status === 'pending'
                    ? 'text-amber-700'
                    : appt.status === 'completed'
                      ? 'text-blue-700'
                      : 'text-slate-500';

              return (
                <div
                  key={appt.id}
                  className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {appt.serviceItem}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-600 font-mono tabular-nums mt-0.5">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>{appt.scheduledDate}</span>
                        <span aria-hidden="true">·</span>
                        <span>{appt.scheduledTime}</span>
                      </div>
                    </div>
                    <span className={`text-xs font-semibold capitalize ${statusColor}`}>
                      {appt.status}
                    </span>
                  </div>

                  {!isTerminal && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {isProvider && appt.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => void handleUpdateAppointmentStatus(appt, 'confirmed')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md"
                          >
                            <Check className="w-3 h-3" />
                            <span>Confirm</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleUpdateAppointmentStatus(appt, 'declined')}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md"
                          >
                            <XCircle className="w-3 h-3" />
                            <span>Decline</span>
                          </button>
                        </>
                      )}

                      {isProvider && appt.status === 'confirmed' && (
                        <button
                          type="button"
                          onClick={() => void handleUpdateAppointmentStatus(appt, 'completed')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md"
                        >
                          <Check className="w-3 h-3" />
                          <span>Mark Completed</span>
                        </button>
                      )}

                      {isSeeker && (appt.status === 'pending' || appt.status === 'confirmed') && (
                        <button
                          type="button"
                          onClick={() => void handleUpdateAppointmentStatus(appt, 'cancelled')}
                          className="text-xs font-medium text-slate-600 hover:text-red-600"
                        >
                          Cancel Request
                        </button>
                      )}
                    </div>
                  )}

                  {isSeeker && appt.status === 'completed' && onOpenReview && (
                    <div className="pt-1">
                      {reviewedRatingsByApptId?.[appt.id] !== undefined ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 font-mono tabular-nums">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span>Reviewed · {reviewedRatingsByApptId[appt.id]}.0</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenReview(appt)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors whitespace-nowrap"
                        >
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <span>Leave Review</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50/40">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <p className="text-sm font-medium text-slate-700">
                Start a conversation with {shopName}
              </p>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">
                Ask about availability, pricing, or use Schedule Slot above to book an appointment directly.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const mine = msg.senderId === user.uid;
              const isEvent = msg.type !== 'text';

              if (isEvent) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div className="px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 max-w-[90%] text-center">
                      <span className="font-medium text-slate-900">{msg.senderName}: </span>
                      <span>{msg.text}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[11px] text-slate-400 mb-1 px-1">
                    {mine ? 'You' : msg.senderName}
                  </span>
                  <div
                    className={`px-3.5 py-2.5 rounded-xl text-sm max-w-[82%] leading-relaxed ${
                      mine
                        ? 'bg-blue-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-800'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Input */}
        <form
          onSubmit={handleSendMessage}
          className="p-4 border-t border-slate-200 bg-white flex items-center gap-2.5"
        >
          <input
            type="text"
            maxLength={VALIDATION_LIMITS.CHAT_MESSAGE_MAX}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder="Write a message..."
            className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
          <button
            type="submit"
            disabled={isSending || !messageText.trim()}
            aria-label="Send message"
            className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg inline-flex items-center gap-1.5 transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
