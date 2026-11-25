import React, { useEffect, useMemo, useRef, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { onAuthStateChanged, User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { LogOut } from 'lucide-react';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  signInWithGoogle,
  signOutUser,
} from './firebase';
import {
  Appointment,
  ChatThread,
  ServiceListing,
  UserRole,
  VALIDATION_LIMITS,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingView } from './components/LandingView';
import { DiscoveryWorkspace } from './components/DiscoveryWorkspace';
import { ProviderPortal } from './components/ProviderPortal';
import { AppointmentsView, MessagesInbox } from './components/InboxViews';
import { ChatDrawer } from './components/ChatDrawer';
import { ReviewModal } from './components/ReviewModal';

type AppTab = 'discover' | 'messages' | 'appointments' | 'provider';

interface ActiveChatContext {
  chatId: string;
  seekerId: string;
  seekerName: string;
  providerId: string;
  shopName: string;
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('discover');
  const intendedRoleRef = useRef<UserRole>('seeker');

  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );

  // Real-time Firestore state
  const [publicServices, setPublicServices] = useState<ServiceListing[]>([]);
  const [ownService, setOwnService] = useState<ServiceListing | null>(null);
  const [isLoadingServices, setIsLoadingServices] = useState(true);

  const [seekerChats, setSeekerChats] = useState<ChatThread[]>([]);
  const [providerChats, setProviderChats] = useState<ChatThread[]>([]);
  const [seekerAppointments, setSeekerAppointments] = useState<Appointment[]>([]);
  const [providerAppointments, setProviderAppointments] = useState<Appointment[]>([]);

  const [activeChat, setActiveChat] = useState<ActiveChatContext | null>(null);
  const [reviewedRatingsByApptId, setReviewedRatingsByApptId] = useState<Record<string, number>>({});
  const [reviewTargetAppt, setReviewTargetAppt] = useState<Appointment | null>(null);
  const checkedReviewApptIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const onQuotaExceeded = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    if (mapsApiKey) return;
    let mounted = true;
    fetch('/api/maps-key')
      .then((res) => (res.ok ? res.json() : { mapsApiKey: '' }))
      .then((data: { mapsApiKey?: string }) => {
        if (mounted && data.mapsApiKey) {
          setMapsApiKey(data.mapsApiKey);
        }
      })
      .catch(() => {
        // Ignore if unavailable
      });
    return () => {
      mounted = false;
    };
  }, [mapsApiKey]);

  // Auth listener & user profile sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (nextUser) {
        const userRef = doc(db, 'users', nextUser.uid);
        try {
          const snap = await getDoc(userRef);
          const safeDisplayName = (nextUser.displayName || nextUser.email || 'User').slice(
            0,
            VALIDATION_LIMITS.DISPLAY_NAME_MAX
          );
          const safePhoto =
            nextUser.photoURL && nextUser.photoURL.startsWith('https://')
              ? nextUser.photoURL.slice(0, 500)
              : '';

          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: nextUser.uid,
              displayName: safeDisplayName,
              email: (nextUser.email || '').slice(0, 160),
              photoURL: safePhoto,
              role: intendedRoleRef.current,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            await updateDoc(userRef, {
              displayName: safeDisplayName,
              photoURL: safePhoto,
              updatedAt: serverTimestamp(),
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Missing or insufficient permissions')) {
            handleFirestoreError(err, OperationType.WRITE, `users/${nextUser.uid}`);
          }
        }
      } else {
        setPublicServices([]);
        setOwnService(null);
        setSeekerChats([]);
        setProviderChats([]);
        setSeekerAppointments([]);
        setProviderAppointments([]);
        setActiveChat(null);
        setReviewedRatingsByApptId({});
        setReviewTargetAppt(null);
        checkedReviewApptIdsRef.current.clear();
      }
    });

    return () => unsubscribe();
  }, []);

  // Firestore real-time subscriptions (only when authenticated)
  useEffect(() => {
    if (!authReady || !user) {
      setIsLoadingServices(false);
      return;
    }

    setIsLoadingServices(true);

    const servicesQuery = query(
      collection(db, 'services'),
      where('isActive', '==', true)
    );
    const unsubPublicServices = onSnapshot(
      servicesQuery,
      (snapshot) => {
        const list: ServiceListing[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ServiceListing, 'id'>),
        }));
        setPublicServices(list);
        setIsLoadingServices(false);
      },
      (err) => {
        setIsLoadingServices(false);
        handleFirestoreError(err, OperationType.LIST, 'services');
      }
    );

    const ownServiceRef = doc(db, 'services', user.uid);
    const unsubOwnService = onSnapshot(
      ownServiceRef,
      (snap) => {
        if (snap.exists()) {
          setOwnService({
            id: snap.id,
            ...(snap.data() as Omit<ServiceListing, 'id'>),
          });
        } else {
          setOwnService(null);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `services/${user.uid}`);
      }
    );

    const seekerChatsQ = query(
      collection(db, 'chats'),
      where('seekerId', '==', user.uid)
    );
    const unsubSeekerChats = onSnapshot(
      seekerChatsQ,
      (snap) => {
        setSeekerChats(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatThread, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chats')
    );

    const providerChatsQ = query(
      collection(db, 'chats'),
      where('providerId', '==', user.uid)
    );
    const unsubProviderChats = onSnapshot(
      providerChatsQ,
      (snap) => {
        setProviderChats(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatThread, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'chats')
    );

    const seekerApptsQ = query(
      collection(db, 'appointments'),
      where('seekerId', '==', user.uid)
    );
    const unsubSeekerAppts = onSnapshot(
      seekerApptsQ,
      (snap) => {
        setSeekerAppointments(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'appointments')
    );

    const providerApptsQ = query(
      collection(db, 'appointments'),
      where('providerId', '==', user.uid)
    );
    const unsubProviderAppts = onSnapshot(
      providerApptsQ,
      (snap) => {
        setProviderAppointments(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Appointment, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'appointments')
    );

    return () => {
      unsubPublicServices();
      unsubOwnService();
      unsubSeekerChats();
      unsubProviderChats();
      unsubSeekerAppts();
      unsubProviderAppts();
    };
  }, [authReady, user]);

  const toMillis = (ts: unknown): number => {
    if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
      return (ts as { toMillis: () => number }).toMillis();
    }
    return 0;
  };

  const mergedChats = useMemo(() => {
    const byId: Record<string, ChatThread> = {};
    for (const c of [...seekerChats, ...providerChats]) {
      byId[c.id] = c;
    }
    return Object.values(byId).sort(
      (a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt)
    );
  }, [seekerChats, providerChats]);

  const mergedAppointments = useMemo(() => {
    const byId: Record<string, Appointment> = {};
    for (const a of [...seekerAppointments, ...providerAppointments]) {
      byId[a.id] = a;
    }
    return Object.values(byId).sort(
      (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
    );
  }, [seekerAppointments, providerAppointments]);

  useEffect(() => {
    if (!user) return;
    const completedSeekerAppts = mergedAppointments.filter(
      (appt) =>
        appt.status === 'completed' &&
        appt.seekerId === user.uid &&
        !checkedReviewApptIdsRef.current.has(appt.id)
    );
    if (completedSeekerAppts.length === 0) return;

    let cancelled = false;
    completedSeekerAppts.forEach((appt) => {
      checkedReviewApptIdsRef.current.add(appt.id);
      const reviewPath = `services/${appt.providerId}/reviews/${appt.id}`;
      void getDoc(doc(db, 'services', appt.providerId, 'reviews', appt.id))
        .then((snap) => {
          if (!cancelled && snap.exists()) {
            const ratingVal = snap.data()?.rating;
            if (typeof ratingVal === 'number') {
              setReviewedRatingsByApptId((prev) => ({
                ...prev,
                [appt.id]: ratingVal,
              }));
            }
          }
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Missing or insufficient permissions')) {
            handleFirestoreError(err, OperationType.GET, reviewPath);
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [user, mergedAppointments]);

  const handleSignIn = async (intendedRole: UserRole) => {
    intendedRoleRef.current = intendedRole;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
      setActiveTab(intendedRole === 'provider' ? 'provider' : 'discover');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleOpenChatWithService = (service: ServiceListing) => {
    if (!user) return;
    const chatId = `${user.uid}_${service.ownerId}`;
    setActiveChat({
      chatId,
      seekerId: user.uid,
      seekerName: user.displayName || user.email || 'Customer',
      providerId: service.ownerId,
      shopName: service.shopName,
    });
  };

  const activeChatService = useMemo(() => {
    if (!activeChat) return null;
    return (
      publicServices.find((s) => s.ownerId === activeChat.providerId) ||
      (ownService?.ownerId === activeChat.providerId ? ownService : null)
    );
  }, [activeChat, publicServices, ownService]);

  const mapsReady = Boolean(mapsApiKey);

  const appShell = (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Required Maps Demo Quota Banner (Case A) */}
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Three-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-full mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('discover')}
            className="text-xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            NearCraft
          </button>

          {/* Zone 2: Concise single-line nav links */}
          {user ? (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('discover')}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                  activeTab === 'discover'
                    ? 'border-blue-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Discover Map
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('messages')}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                  activeTab === 'messages'
                    ? 'border-blue-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Messages
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('appointments')}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                  activeTab === 'appointments'
                    ? 'border-blue-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Appointments
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('provider')}
                className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                  activeTab === 'provider'
                    ? 'border-blue-700 text-slate-900'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                Provider Portal
              </button>
            </nav>
          ) : (
            <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <a href="#how-it-works" className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
                How It Works
              </a>
              <a href="#for-providers" className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0">
                Service Categories
              </a>
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void handleSignIn('seeker')}
                className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Find Services
              </button>
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void handleSignIn('provider')}
                className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                List a Shop
              </button>
            </nav>
          )}

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-3 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <span className="max-w-[140px] truncate">
                  {user.displayName || user.email}
                </span>
                <LogOut className="w-3.5 h-3.5 text-slate-500" />
              </button>
            ) : (
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void handleSignIn('seeker')}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {isSigningIn ? 'Signing In...' : 'Sign In'}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Tab Navigation */}
        {user && (
          <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium">
            {(['discover', 'messages', 'appointments', 'provider'] as AppTab[]).map((tab) => {
              const label =
                tab === 'discover'
                  ? 'Discover'
                  : tab === 'messages'
                    ? 'Messages'
                    : tab === 'appointments'
                      ? 'Appointments'
                      : 'Provider';
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`py-1 whitespace-nowrap shrink-0 ${
                    activeTab === tab ? 'text-blue-700 font-semibold' : 'text-slate-600'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Main Content */}
      {!authReady ? (
        <div className="flex-1 flex items-center justify-center p-12 text-sm text-slate-500">
          Connecting to workspace...
        </div>
      ) : !user ? (
        <LandingView
          onSignIn={(role) => void handleSignIn(role)}
          isSigningIn={isSigningIn}
          authError={authError}
        />
      ) : (
        <div className="flex-1">
          {activeTab === 'discover' && (
            <DiscoveryWorkspace
              services={publicServices}
              isLoadingServices={isLoadingServices}
              mapsReady={mapsReady}
              onOpenChat={handleOpenChatWithService}
              onGoToProviderPortal={() => setActiveTab('provider')}
            />
          )}

          {activeTab === 'provider' && (
            <ProviderPortal
              user={user}
              existingService={ownService}
              mapsReady={mapsReady}
              onSaved={() => setActiveTab('discover')}
            />
          )}

          {activeTab === 'messages' && (
            <MessagesInbox
              user={user}
              chats={mergedChats}
              onSelectChat={(chat) =>
                setActiveChat({
                  chatId: chat.id,
                  seekerId: chat.seekerId,
                  seekerName: chat.seekerName,
                  providerId: chat.providerId,
                  shopName: chat.shopName,
                })
              }
              onGoToMap={() => setActiveTab('discover')}
            />
          )}

          {activeTab === 'appointments' && (
            <AppointmentsView
              user={user}
              appointments={mergedAppointments}
              reviewedRatingsByApptId={reviewedRatingsByApptId}
              onOpenReview={(appt) => setReviewTargetAppt(appt)}
              onOpenChatByThread={(appt) =>
                setActiveChat({
                  chatId: appt.chatId,
                  seekerId: appt.seekerId,
                  seekerName: appt.seekerName,
                  providerId: appt.providerId,
                  shopName: appt.shopName,
                })
              }
              onGoToMap={() => setActiveTab('discover')}
            />
          )}
        </div>
      )}

      {/* Real-Time Chat & Direct Appointment Scheduling Drawer */}
      {user && activeChat && (
        <ChatDrawer
          user={user}
          chatId={activeChat.chatId}
          seekerId={activeChat.seekerId}
          seekerName={activeChat.seekerName}
          providerId={activeChat.providerId}
          shopName={activeChat.shopName}
          serviceListing={activeChatService}
          appointments={mergedAppointments}
          reviewedRatingsByApptId={reviewedRatingsByApptId}
          onOpenReview={(appt) => setReviewTargetAppt(appt)}
          onClose={() => setActiveChat(null)}
        />
      )}

      {/* Post-Appointment Star Rating & Review Modal */}
      {user && reviewTargetAppt && (
        <ReviewModal
          user={user}
          appointment={reviewTargetAppt}
          onClose={() => setReviewTargetAppt(null)}
          onSubmitted={(appointmentId, rating) => {
            checkedReviewApptIdsRef.current.add(appointmentId);
            setReviewedRatingsByApptId((prev) => ({
              ...prev,
              [appointmentId]: rating,
            }));
          }}
        />
      )}
    </div>
  );

  if (!mapsApiKey) {
    return appShell;
  }

  return (
    <APIProvider
      apiKey={mapsApiKey}
      language="en"
      libraries={['places', 'maps', 'marker']}
    >
      {appShell}
    </APIProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
