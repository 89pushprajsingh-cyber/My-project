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
import { ArrowLeftRight, ChevronDown, LogOut } from 'lucide-react';
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
  BillLineItem,
  ChatThread,
  ServiceBill,
  ServiceListing,
  UserRole,
  VALIDATION_LIMITS,
} from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingView } from './components/LandingView';
import { DiscoveryWorkspace } from './components/DiscoveryWorkspace';
import { ProviderPortal } from './components/ProviderPortal';
import { ProviderDashboard } from './components/ProviderDashboard';
import { AppointmentsView, MessagesInbox } from './components/InboxViews';
import { BillsView } from './components/BillsView';
import { BillCheckoutModal } from './components/BillCheckoutModal';
import { BillReceiptModal } from './components/BillReceiptModal';
import { ChatDrawer } from './components/ChatDrawer';
import { ReviewModal, ReviewSource } from './components/ReviewModal';

type AppTab =
  | 'discover'
  | 'appointments'
  | 'bills'
  | 'messages'
  | 'provider-dashboard'
  | 'provider';

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
  const [userRole, setUserRole] = useState<UserRole>('seeker');
  const [activeTab, setActiveTab] = useState<AppTab>('discover');
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const explicitSignInRoleRef = useRef<UserRole | null>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

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
  const [seekerBills, setSeekerBills] = useState<ServiceBill[]>([]);
  const [providerBills, setProviderBills] = useState<ServiceBill[]>([]);

  const [activeChat, setActiveChat] = useState<ActiveChatContext | null>(null);
  const [checkoutContext, setCheckoutContext] = useState<{
    service: ServiceListing;
    items: BillLineItem[];
  } | null>(null);
  const [activeReceiptBillId, setActiveReceiptBillId] = useState<string | null>(null);
  const [activeReceiptFallback, setActiveReceiptFallback] = useState<ServiceBill | null>(null);

  const [reviewedRatingsBySourceId, setReviewedRatingsBySourceId] = useState<Record<string, number>>({});
  const [reviewTarget, setReviewTarget] = useState<ReviewSource | null>(null);
  const checkedReviewSourceIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!showAccountMenu) return;
    const onPointerDown = (ev: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(ev.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setShowAccountMenu(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showAccountMenu]);

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
        const requestedRole = explicitSignInRoleRef.current;
        explicitSignInRoleRef.current = null;

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

          let resolvedRole: UserRole = requestedRole || 'seeker';

          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: nextUser.uid,
              displayName: safeDisplayName,
              email: (nextUser.email || '').slice(0, 160),
              photoURL: safePhoto,
              role: resolvedRole,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          } else {
            const storedRole: UserRole =
              snap.data()?.role === 'provider' ? 'provider' : 'seeker';
            resolvedRole = requestedRole || storedRole;
            await updateDoc(userRef, {
              displayName: safeDisplayName,
              photoURL: safePhoto,
              role: resolvedRole,
              updatedAt: serverTimestamp(),
            });
          }

          setUserRole(resolvedRole);
          setActiveTab(resolvedRole === 'provider' ? 'provider-dashboard' : 'discover');
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('Missing or insufficient permissions')) {
            handleFirestoreError(err, OperationType.WRITE, `users/${nextUser.uid}`);
          }
        }
      } else {
        setUserRole('seeker');
        setActiveTab('discover');
        setShowAccountMenu(false);
        setPublicServices([]);
        setOwnService(null);
        setSeekerChats([]);
        setProviderChats([]);
        setSeekerAppointments([]);
        setProviderAppointments([]);
        setSeekerBills([]);
        setProviderBills([]);
        setActiveChat(null);
        setCheckoutContext(null);
        setActiveReceiptBillId(null);
        setActiveReceiptFallback(null);
        setReviewedRatingsBySourceId({});
        setReviewTarget(null);
        checkedReviewSourceIdsRef.current.clear();
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

    const seekerBillsQ = query(
      collection(db, 'bills'),
      where('seekerId', '==', user.uid)
    );
    const unsubSeekerBills = onSnapshot(
      seekerBillsQ,
      (snap) => {
        setSeekerBills(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServiceBill, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bills')
    );

    const providerBillsQ = query(
      collection(db, 'bills'),
      where('providerId', '==', user.uid)
    );
    const unsubProviderBills = onSnapshot(
      providerBillsQ,
      (snap) => {
        setProviderBills(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ServiceBill, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'bills')
    );

    return () => {
      unsubPublicServices();
      unsubOwnService();
      unsubSeekerChats();
      unsubProviderChats();
      unsubSeekerAppts();
      unsubProviderAppts();
      unsubSeekerBills();
      unsubProviderBills();
    };
  }, [authReady, user]);

  const toMillis = (ts: unknown): number => {
    if (ts && typeof ts === 'object' && 'toMillis' in ts && typeof (ts as { toMillis: () => number }).toMillis === 'function') {
      return (ts as { toMillis: () => number }).toMillis();
    }
    return 0;
  };

  const sortedSeekerChats = useMemo(
    () =>
      [...seekerChats].sort(
        (a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt)
      ),
    [seekerChats]
  );

  const sortedProviderChats = useMemo(
    () =>
      [...providerChats].sort(
        (a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt)
      ),
    [providerChats]
  );

  const sortedSeekerAppointments = useMemo(
    () =>
      [...seekerAppointments].sort(
        (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
      ),
    [seekerAppointments]
  );

  const sortedProviderAppointments = useMemo(
    () =>
      [...providerAppointments].sort(
        (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
      ),
    [providerAppointments]
  );

  const mergedAppointments = useMemo(() => {
    const byId: Record<string, Appointment> = {};
    for (const a of [...seekerAppointments, ...providerAppointments]) {
      byId[a.id] = a;
    }
    return Object.values(byId).sort(
      (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
    );
  }, [seekerAppointments, providerAppointments]);

  const sortedSeekerBills = useMemo(
    () =>
      [...seekerBills].sort(
        (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
      ),
    [seekerBills]
  );

  const sortedProviderBills = useMemo(
    () =>
      [...providerBills].sort(
        (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
      ),
    [providerBills]
  );

  const pendingCounterBillsCount = useMemo(
    () => sortedProviderBills.filter((b) => b.paymentStatus === 'pending_counter').length,
    [sortedProviderBills]
  );

  const activeReceiptBill = useMemo(() => {
    if (!activeReceiptBillId) return null;
    return (
      sortedSeekerBills.find((b) => b.id === activeReceiptBillId) ||
      sortedProviderBills.find((b) => b.id === activeReceiptBillId) ||
      (activeReceiptFallback?.id === activeReceiptBillId ? activeReceiptFallback : null)
    );
  }, [activeReceiptBillId, sortedSeekerBills, sortedProviderBills, activeReceiptFallback]);

  useEffect(() => {
    if (!user) return;
    const reviewCandidates: { id: string; providerId: string }[] = [];

    for (const appt of mergedAppointments) {
      if (
        appt.status === 'completed' &&
        appt.seekerId === user.uid &&
        !checkedReviewSourceIdsRef.current.has(appt.id)
      ) {
        reviewCandidates.push({ id: appt.id, providerId: appt.providerId });
      }
    }

    for (const bill of seekerBills) {
      if (
        bill.paymentStatus === 'paid' &&
        bill.seekerId === user.uid &&
        !checkedReviewSourceIdsRef.current.has(bill.id)
      ) {
        reviewCandidates.push({ id: bill.id, providerId: bill.providerId });
      }
    }

    if (reviewCandidates.length === 0) return;

    let cancelled = false;
    reviewCandidates.forEach((candidate) => {
      checkedReviewSourceIdsRef.current.add(candidate.id);
      const reviewPath = `services/${candidate.providerId}/reviews/${candidate.id}`;
      void getDoc(doc(db, 'services', candidate.providerId, 'reviews', candidate.id))
        .then((snap) => {
          if (!cancelled && snap.exists()) {
            const ratingVal = snap.data()?.rating;
            if (typeof ratingVal === 'number') {
              setReviewedRatingsBySourceId((prev) => ({
                ...prev,
                [candidate.id]: ratingVal,
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
  }, [user, mergedAppointments, seekerBills]);

  const openReviewForAppointment = (appt: Appointment) => {
    setReviewTarget({
      id: appt.id,
      providerId: appt.providerId,
      shopName: appt.shopName,
      serviceItem: appt.serviceItem,
      seekerName: appt.seekerName,
    });
  };

  const openReviewForBill = (bill: ServiceBill) => {
    setReviewTarget({
      id: bill.id,
      providerId: bill.providerId,
      shopName: bill.shopName,
      serviceItem: bill.items.map((i) => `${i.quantity}x ${i.name}`).join(', ').slice(0, 120),
      seekerName: bill.seekerName,
    });
  };

  const handleSignIn = async (intendedRole: UserRole) => {
    explicitSignInRoleRef.current = intendedRole;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      explicitSignInRoleRef.current = null;
      const msg = err instanceof Error ? err.message : 'Unable to sign in with Google.';
      if (!msg.includes('popup-closed-by-user')) {
        setAuthError(msg);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSwitchRole = async (nextRole: UserRole) => {
    if (!user) return;
    setShowAccountMenu(false);
    setActiveChat(null);
    setUserRole(nextRole);
    setActiveTab(nextRole === 'provider' ? 'provider-dashboard' : 'discover');

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        role: nextRole,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
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

  const isGuestLanding = authReady && !user;

  const appShell = (
    <div
      className={`min-h-screen flex flex-col ${
        isGuestLanding ? 'bg-[#0b0c0e] text-stone-100' : 'bg-slate-50 text-slate-900'
      }`}
    >
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
      <header
        className={`sticky top-0 z-30 border-b transition-colors ${
          isGuestLanding
            ? 'bg-[#0b0c0e]/95 backdrop-blur-md border-stone-800/80 text-stone-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="max-w-full mx-auto px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() =>
              setActiveTab(userRole === 'provider' ? 'provider-dashboard' : 'discover')
            }
            className={`whitespace-nowrap shrink-0 tracking-tight ${
              isGuestLanding
                ? 'font-serif text-2xl font-semibold text-[#f7f4ed] tracking-wide'
                : 'text-xl font-extrabold text-slate-900'
            }`}
          >
            NearCraft
          </button>

          {/* Zone 2: Concise single-line nav links strictly scoped to active user role */}
          {user ? (
            userRole === 'seeker' ? (
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
                  Find Services
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
                  My Bookings
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('bills')}
                  className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    activeTab === 'bills'
                      ? 'border-blue-700 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  My Bills
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
              </nav>
            ) : (
              <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
                <button
                  type="button"
                  onClick={() => setActiveTab('provider-dashboard')}
                  className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    activeTab === 'provider-dashboard'
                      ? 'border-blue-700 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Shop Dashboard
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
                  Bookings
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('bills')}
                  className={`py-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                    activeTab === 'bills'
                      ? 'border-blue-700 text-slate-900'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bills & Sales
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
                  Inquiries
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
                  Shop & KYC
                </button>
              </nav>
            )
          ) : (
            <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-stone-300">
              <a
                href="#featured-venues"
                className="hover:text-[#f7f4ed] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Venues
              </a>
              <a
                href="#how-it-works"
                className="hover:text-[#f7f4ed] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Concierge Flow
              </a>
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void handleSignIn('seeker')}
                className="hover:text-[#f7f4ed] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Guest Discovery
              </button>
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void handleSignIn('provider')}
                className="hover:text-[#f7f4ed] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
              >
                Partner Studio
              </button>
            </nav>
          )}

          {/* Zone 3: Single Primary Action / Account Menu */}
          <div className="relative flex items-center shrink-0" ref={accountMenuRef}>
            {user ? (
              <>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={showAccountMenu}
                  onClick={() => setShowAccountMenu((prev) => !prev)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span className="max-w-[140px] truncate">
                    {user.displayName || user.email}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                </button>

                {showAccountMenu && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-40"
                  >
                    <div className="px-3.5 py-2 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {user.displayName || 'Signed-In Account'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {userRole === 'provider' ? 'Service Provider Studio' : 'Customer Discovery Mode'}
                      </p>
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() =>
                        void handleSwitchRole(userRole === 'provider' ? 'seeker' : 'provider')
                      }
                      className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors"
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 text-blue-700 shrink-0" />
                      <span>
                        {userRole === 'provider'
                          ? 'Switch to Customer Mode'
                          : 'Switch to Provider Studio'}
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setShowAccountMenu(false);
                        void signOutUser();
                      }}
                      className="w-full text-left px-3.5 py-2.5 text-xs font-medium text-red-700 hover:bg-red-50 flex items-center gap-2 transition-colors border-t border-slate-100"
                    >
                      <LogOut className="w-3.5 h-3.5 shrink-0" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => void handleSignIn('seeker')}
                className="px-4 py-2 text-xs font-semibold text-stone-950 bg-[#c8a45d] hover:bg-[#d8b66f] disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {isSigningIn ? 'Signing In...' : 'Member Sign In'}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Tab Navigation (Scoped by Role) */}
        {user && (
          <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium">
            {(userRole === 'seeker'
              ? ([
                  { id: 'discover', label: 'Find Services' },
                  { id: 'appointments', label: 'My Bookings' },
                  { id: 'bills', label: 'My Bills' },
                  { id: 'messages', label: 'Messages' },
                ] as { id: AppTab; label: string }[])
              : ([
                  { id: 'provider-dashboard', label: 'Dashboard' },
                  { id: 'appointments', label: 'Bookings' },
                  { id: 'bills', label: 'Bills & Sales' },
                  { id: 'messages', label: 'Inquiries' },
                  { id: 'provider', label: 'Shop & KYC' },
                ] as { id: AppTab; label: string }[])
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-1 whitespace-nowrap shrink-0 ${
                  activeTab === tab.id ? 'text-blue-700 font-semibold' : 'text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
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
          {userRole === 'seeker' && activeTab === 'discover' && (
            <DiscoveryWorkspace
              services={publicServices}
              isLoadingServices={isLoadingServices}
              mapsReady={mapsReady}
              onOpenChat={handleOpenChatWithService}
              onStartCheckout={(service, items) => setCheckoutContext({ service, items })}
            />
          )}

          {userRole === 'provider' && activeTab === 'provider-dashboard' && (
            <ProviderDashboard
              user={user}
              ownService={ownService}
              appointments={sortedProviderAppointments}
              pendingCounterBillsCount={pendingCounterBillsCount}
              onEditShop={() => setActiveTab('provider')}
              onOpenAllBookings={() => setActiveTab('appointments')}
              onOpenBills={() => setActiveTab('bills')}
              onOpenChatByThread={(appt) =>
                setActiveChat({
                  chatId: appt.chatId,
                  seekerId: appt.seekerId,
                  seekerName: appt.seekerName,
                  providerId: appt.providerId,
                  shopName: appt.shopName,
                })
              }
            />
          )}

          {userRole === 'provider' && activeTab === 'provider' && (
            <ProviderPortal
              user={user}
              existingService={ownService}
              mapsReady={mapsReady}
              onSaved={() => setActiveTab('provider-dashboard')}
            />
          )}

          {activeTab === 'bills' && (
            <BillsView
              mode={userRole}
              bills={userRole === 'provider' ? sortedProviderBills : sortedSeekerBills}
              reviewedRatingsBySourceId={reviewedRatingsBySourceId}
              onOpenReviewForBill={openReviewForBill}
              onPrimaryAction={() =>
                setActiveTab(userRole === 'provider' ? 'provider-dashboard' : 'discover')
              }
            />
          )}

          {activeTab === 'messages' && (
            <MessagesInbox
              user={user}
              mode={userRole}
              chats={userRole === 'provider' ? sortedProviderChats : sortedSeekerChats}
              onSelectChat={(chat) =>
                setActiveChat({
                  chatId: chat.id,
                  seekerId: chat.seekerId,
                  seekerName: chat.seekerName,
                  providerId: chat.providerId,
                  shopName: chat.shopName,
                })
              }
              onPrimaryAction={() =>
                setActiveTab(userRole === 'provider' ? 'provider-dashboard' : 'discover')
              }
            />
          )}

          {activeTab === 'appointments' && (
            <AppointmentsView
              user={user}
              mode={userRole}
              appointments={
                userRole === 'provider'
                  ? sortedProviderAppointments
                  : sortedSeekerAppointments
              }
              reviewedRatingsByApptId={reviewedRatingsBySourceId}
              onOpenReview={openReviewForAppointment}
              onOpenChatByThread={(appt) =>
                setActiveChat({
                  chatId: appt.chatId,
                  seekerId: appt.seekerId,
                  seekerName: appt.seekerName,
                  providerId: appt.providerId,
                  shopName: appt.shopName,
                })
              }
              onPrimaryAction={() =>
                setActiveTab(userRole === 'provider' ? 'provider-dashboard' : 'discover')
              }
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
          reviewedRatingsByApptId={reviewedRatingsBySourceId}
          onOpenReview={openReviewForAppointment}
          onClose={() => setActiveChat(null)}
        />
      )}

      {/* Bill Checkout Modal (In-App or Counter Payment) */}
      {user && checkoutContext && (
        <BillCheckoutModal
          user={user}
          service={checkoutContext.service}
          items={checkoutContext.items}
          onClose={() => setCheckoutContext(null)}
          onBillCreated={(createdBill) => {
            setCheckoutContext(null);
            setActiveReceiptFallback(createdBill);
            setActiveReceiptBillId(createdBill.id);
          }}
        />
      )}

      {/* Digital Payment Bill & Receipt Modal */}
      {user && activeReceiptBill && (
        <BillReceiptModal
          bill={activeReceiptBill}
          viewerRole={userRole}
          isReviewed={reviewedRatingsBySourceId[activeReceiptBill.id] !== undefined}
          onClose={() => {
            setActiveReceiptBillId(null);
            setActiveReceiptFallback(null);
          }}
          onRateShop={(billToReview) => {
            setActiveReceiptBillId(null);
            setActiveReceiptFallback(null);
            openReviewForBill(billToReview);
          }}
        />
      )}

      {/* Post-Appointment / Post-Payment Star Rating & Review Modal */}
      {user && reviewTarget && (
        <ReviewModal
          user={user}
          source={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onSubmitted={(sourceId, rating) => {
            checkedReviewSourceIdsRef.current.add(sourceId);
            setReviewedRatingsBySourceId((prev) => ({
              ...prev,
              [sourceId]: rating,
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
