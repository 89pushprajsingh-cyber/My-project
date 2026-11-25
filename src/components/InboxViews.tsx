import React from 'react';
import { User } from 'firebase/auth';
import { Calendar, Check, Clock, MessageSquare, Star, XCircle } from 'lucide-react';
import { Appointment, AppointmentStatus, ChatThread } from '../types';
import { doc, serverTimestamp, writeBatch, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';

interface MessagesInboxProps {
  user: User;
  chats: ChatThread[];
  onSelectChat: (chat: ChatThread) => void;
  onGoToMap: () => void;
}

export function MessagesInbox({
  user,
  chats,
  onSelectChat,
  onGoToMap,
}: MessagesInboxProps) {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="pb-5 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Messages</h1>
          <p className="mt-1 text-sm text-slate-600">
            Real-time conversations with service providers and customers.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToMap}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
        >
          Browse Map
        </button>
      </div>

      {chats.length === 0 ? (
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-10 text-center">
          <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900">No conversations yet</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            Select any service provider on the map to start chatting or request an appointment time.
          </p>
          <button
            type="button"
            onClick={onGoToMap}
            className="mt-5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg"
          >
            Find a Service on Map
          </button>
        </div>
      ) : (
        <div className="mt-6 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {chats.map((chat) => {
            const isProvider = user.uid === chat.providerId && user.uid !== chat.seekerId;
            const counterpart = isProvider ? chat.seekerName : chat.shopName;
            const roleLabel = isProvider ? 'Customer Inquiry' : 'Service Provider';

            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => onSelectChat(chat)}
                className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 truncate">
                      {counterpart}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500">{roleLabel}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 truncate">
                    {chat.lastMessage || 'Open conversation'}
                  </p>
                </div>
                <span className="text-xs font-medium text-blue-700 whitespace-nowrap shrink-0">
                  Open Chat
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface AppointmentsViewProps {
  user: User;
  appointments: Appointment[];
  reviewedRatingsByApptId: Record<string, number>;
  onOpenReview: (appt: Appointment) => void;
  onOpenChatByThread: (appt: Appointment) => void;
  onGoToMap: () => void;
}

export function AppointmentsView({
  user,
  appointments,
  reviewedRatingsByApptId,
  onOpenReview,
  onOpenChatByThread,
  onGoToMap,
}: AppointmentsViewProps) {
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
        senderName: (user.displayName || 'User').slice(0, 80),
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

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="pb-5 border-b border-slate-200 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Appointments</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track upcoming bookings you requested or received as a service provider.
          </p>
        </div>
        <button
          type="button"
          onClick={onGoToMap}
          className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg whitespace-nowrap shrink-0"
        >
          Book Another Service
        </button>
      </div>

      {appointments.length === 0 ? (
        <div className="mt-8 bg-white border border-slate-200 rounded-xl p-10 text-center">
          <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900">No appointments scheduled</h2>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            Find a verified salon or local service provider on the map and propose a time slot directly in chat.
          </p>
          <button
            type="button"
            onClick={onGoToMap}
            className="mt-5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg"
          >
            Explore Services
          </button>
        </div>
      ) : (
        <div className="mt-6 bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
          {appointments.map((appt) => {
            const isProvider = user.uid === appt.providerId;
            const isSeeker = user.uid === appt.seekerId;
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
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">
                      {appt.serviceItem}
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className={`text-xs font-semibold capitalize ${statusColor}`}>
                      {appt.status}
                    </span>
                  </div>

                  <p className="text-sm text-slate-600">
                    {isProvider ? `Customer: ${appt.seekerName}` : `Shop: ${appt.shopName}`}
                  </p>

                  <div className="flex items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{appt.scheduledDate}</span>
                    <span>·</span>
                    <span>{appt.scheduledTime}</span>
                  </div>

                  {appt.notes && (
                    <p className="text-xs text-slate-500 pt-0.5">Note: {appt.notes}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {!isTerminal && isProvider && appt.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(appt, 'confirmed')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Confirm</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleStatusChange(appt, 'declined')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </>
                  )}

                  {!isTerminal && isProvider && appt.status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(appt, 'completed')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Complete</span>
                    </button>
                  )}

                  {!isTerminal && isSeeker && (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(appt, 'cancelled')}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-red-600 border border-slate-200 rounded-lg"
                    >
                      Cancel
                    </button>
                  )}

                  {isSeeker && appt.status === 'completed' && (
                    reviewedRatingsByApptId[appt.id] !== undefined ? (
                      <span className="inline-flex items-center gap-1 px-2 text-xs font-medium text-amber-700 font-mono tabular-nums whitespace-nowrap">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span>Reviewed · {reviewedRatingsByApptId[appt.id]}.0</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onOpenReview(appt)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
                      >
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span>Leave Review</span>
                      </button>
                    )
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenChatByThread(appt)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Open Chat</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
