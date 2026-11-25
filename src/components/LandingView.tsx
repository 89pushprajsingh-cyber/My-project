import React, { useState } from 'react';
import { ArrowRight, Lock, MapPin, Receipt, ShieldCheck } from 'lucide-react';
import { UserRole } from '../types';
import { SafeImage } from './SafeImage';

interface LandingViewProps {
  onSignIn: (intendedRole: UserRole) => void;
  isSigningIn: boolean;
  authError: string | null;
}

export function LandingView({
  onSignIn,
  isSigningIn,
  authError,
}: LandingViewProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('seeker');

  return (
    <div className="bg-[#0b0c0e] text-[#f7f4ed]">
      {/* Hero Split + Integrated Luxury Member / Partner Login Suite */}
      <section className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <div>
              <p className="text-xs font-medium tracking-wide text-[#d4b26e] mb-3">
                Aadhaar-Verified Establishments · Live Map · Digital Billing
              </p>
              <h1 className="font-serif text-4xl sm:text-5xl lg:text-[3.5rem] font-semibold text-[#f7f4ed] tracking-tight leading-[1.08] [text-wrap:balance]">
                Reserve the city&apos;s finest salons, eyewear ateliers, and private lounges.
              </h1>
              <p className="mt-4 text-base text-stone-300 leading-relaxed max-w-xl tracking-wide">
                Discover top-rated neighborhood establishments near your live location, browse curated photo galleries and complete priced menus, navigate effortlessly, and settle your bill in-app or at the counter.
              </p>
            </div>

            {authError && (
              <div
                role="alert"
                className="p-3.5 bg-red-950/60 border border-red-800/70 rounded-xl text-sm text-red-200"
              >
                {authError}
              </div>
            )}

            {/* Luxury Concierge Login Suite */}
            <div
              id="member-access"
              className="bg-[#131519] border border-stone-800 rounded-2xl p-6 space-y-5"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-stone-800/90">
                <div>
                  <h2 className="font-serif text-xl font-semibold text-[#f7f4ed] tracking-wide">
                    Private Member &amp; Partner Access
                  </h2>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Choose your workspace before signing in
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs text-[#d4b26e] shrink-0">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Verified Sign-In</span>
                </span>
              </div>

              {/* Segmented Workspace Selector */}
              <div
                role="tablist"
                aria-label="Choose sign-in experience"
                className="grid grid-cols-2 gap-1.5 p-1 bg-[#0b0c0e] border border-stone-800 rounded-xl"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedRole === 'seeker'}
                  onClick={() => setSelectedRole('seeker')}
                  className={`px-3.5 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap truncate ${
                    selectedRole === 'seeker'
                      ? 'bg-[#c8a45d] text-stone-950 shadow-sm'
                      : 'text-stone-300 hover:text-white'
                  }`}
                >
                  Guest &amp; Client Access
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedRole === 'provider'}
                  onClick={() => setSelectedRole('provider')}
                  className={`px-3.5 py-2.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap truncate ${
                    selectedRole === 'provider'
                      ? 'bg-[#c8a45d] text-stone-950 shadow-sm'
                      : 'text-stone-300 hover:text-white'
                  }`}
                >
                  Atelier &amp; Venue Partner
                </button>
              </div>

              <p className="text-xs text-stone-300 leading-relaxed">
                {selectedRole === 'seeker'
                  ? 'Enter the client discovery map to search eyewear showrooms, top salons, cafes, or lounges around you, compare verified ratings, and pay via app or counter receipt.'
                  : 'Enter your private Partner Studio to complete Aadhaar verification, pin your venue on Google Maps, publish numbered menus and galleries, and manage client bills.'}
              </p>

              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => onSignIn(selectedRole)}
                className="w-full inline-flex items-center justify-center gap-2.5 px-6 py-3 bg-[#c8a45d] hover:bg-[#d8b66f] disabled:opacity-60 text-stone-950 text-sm font-semibold rounded-xl transition-colors whitespace-nowrap"
              >
                <span>
                  {isSigningIn
                    ? 'Connecting Securely...'
                    : selectedRole === 'seeker'
                      ? 'Continue with Google — Enter Guest Concierge'
                      : 'Continue with Google — Enter Partner Studio'}
                </span>
                <ArrowRight className="w-4 h-4 shrink-0" />
              </button>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-400">
                <span>Instant workspace switching anytime</span>
                <span aria-hidden="true" className="hidden sm:inline">·</span>
                <span>Aadhaar-verified local directory</span>
              </div>
            </div>
          </div>

          {/* Dominant 16:9 Architectural Luxury Hero Showcase */}
          <div className="lg:col-span-6">
            <div className="relative h-80 sm:h-[420px] lg:h-full min-h-[380px] rounded-2xl overflow-hidden border border-stone-800 bg-[#131519]">
              <SafeImage
                src="/src/assets/images/luxury_salon_hero_1795623737357.jpg"
                alt="Ultra-luxury architectural grooming salon with travertine walls, brushed brass mirrors, and cognac leather chairs"
                className="w-full h-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-5 left-5 right-5 flex flex-col sm:flex-row sm:items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-[#d4b26e]">
                    Flagship Grooming &amp; Salon Partner
                  </p>
                  <p className="font-serif text-xl font-semibold text-[#f7f4ed] mt-0.5">
                    Travertine Mirrors &amp; Private Chair Concierge
                  </p>
                </div>
                <span className="text-xs font-mono tabular-nums text-stone-300 whitespace-nowrap">
                  4.9 Rated · Verified
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Curated Aesthetic Venues Showcase (Goggles Showroom, Luxury Salon, Grand Casino) */}
      <section
        id="featured-venues"
        className="bg-[#101216] border-t border-stone-800/80 py-16"
      >
        <div className="max-w-7xl mx-auto px-6 space-y-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-wide text-[#d4b26e] mb-2">
                Curated Destination Directory
              </p>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[#f7f4ed] tracking-tight [text-wrap:balance]">
                From bespoke eyewear showrooms to premier salons and grand lounges.
              </h2>
            </div>
            <p className="text-sm text-stone-400 max-w-sm leading-relaxed">
              Every listed venue presents real interior galleries, transparent numbered product pricing, and verified client ratings.
            </p>
          </div>

          {/* Asymmetric Bento Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Showcase 1: Designer Goggles & Eyewear Showroom */}
            <article className="lg:col-span-7 bg-[#15181e] border border-stone-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="aspect-[4/3] lg:aspect-[16/11] bg-[#0b0c0e] overflow-hidden">
                <SafeImage
                  src="/src/assets/images/luxury_goggles_showroom_1795623737552.jpg"
                  alt="Luxury designer goggles and eyewear showroom with backlit travertine display niches"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <p className="text-xs text-[#d4b26e] tracking-wide">
                    Optical &amp; Designer Eyewear Showroom
                  </p>
                  <h3 className="font-serif text-2xl font-semibold text-[#f7f4ed] mt-1">
                    Curated Goggles &amp; Optical Ateliers
                  </h3>
                  <p className="mt-2 text-sm text-stone-300 leading-relaxed">
                    Browse polarized sunglasses, alpine goggles, and handcrafted acetate frames with itemized pricing, gallery previews, and private fitting slots.
                  </p>
                </div>
                <div className="pt-2 text-xs text-stone-400 flex flex-wrap items-center gap-2">
                  <span>Full Frame Catalog</span>
                  <span aria-hidden="true">·</span>
                  <span>Live Inventory &amp; Directions</span>
                  <span aria-hidden="true">·</span>
                  <span>In-App or Counter Settlement</span>
                </div>
              </div>
            </article>

            {/* Showcase 2: Top-Notch Hair & Beauty Salon */}
            <article className="lg:col-span-5 bg-[#15181e] border border-stone-800 rounded-2xl overflow-hidden flex flex-col">
              <div className="aspect-[4/3] bg-[#0b0c0e] overflow-hidden">
                <SafeImage
                  src="/src/assets/images/luxury_salon_lounge_1795623736541.jpg"
                  alt="Top-notch luxury hair styling salon suite with walnut paneling and arched illuminated mirrors"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between gap-3">
                <div>
                  <p className="text-xs text-[#d4b26e] tracking-wide">
                    Top-Notch Hair &amp; Grooming Salon
                  </p>
                  <h3 className="font-serif text-2xl font-semibold text-[#f7f4ed] mt-1">
                    Premier Styling Suites
                  </h3>
                  <p className="mt-2 text-sm text-stone-300 leading-relaxed">
                    Compare verified stylist ratings nearby, inspect interior suite photos before leaving home, and confirm your chair directly in real-time chat.
                  </p>
                </div>
                <div className="pt-2 text-xs text-stone-400 flex flex-wrap items-center gap-2">
                  <span>Verified Stylist Ratings</span>
                  <span aria-hidden="true">·</span>
                  <span>Direct Chair Booking</span>
                </div>
              </div>
            </article>

            {/* Showcase 3: Opulent Casino & VIP Lounge */}
            <article className="lg:col-span-12 bg-[#15181e] border border-stone-800 rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-7 aspect-[4/3] lg:aspect-auto lg:min-h-[340px] bg-[#0b0c0e] overflow-hidden">
                <SafeImage
                  src="/src/assets/images/luxury_casino_lounge_1795623737471.jpg"
                  alt="Opulent grand casino and emerald VIP lounge illuminated by warm crystal chandeliers"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="lg:col-span-5 p-6 lg:p-8 flex flex-col justify-between gap-6">
                <div>
                  <p className="text-xs text-[#d4b26e] tracking-wide">
                    Grand Hospitality &amp; Evening Lounges
                  </p>
                  <h3 className="font-serif text-2xl sm:text-3xl font-semibold text-[#f7f4ed] mt-1.5 [text-wrap:balance]">
                    Signature Casino &amp; Velvet VIP Lounges
                  </h3>
                  <p className="mt-3 text-sm text-stone-300 leading-relaxed">
                    Explore verified late-evening lounges, fine dining cafes, and private hospitality tables. View complete hospitality menus, navigate straight to the entrance, and receive digital payment receipts in your account.
                  </p>
                </div>

                <div className="space-y-4 pt-4 border-t border-stone-800">
                  <div className="text-xs text-stone-400 flex flex-wrap items-center gap-2">
                    <span>Aadhaar-Verified Owners</span>
                    <span aria-hidden="true">·</span>
                    <span>Photo Lightbox Preview</span>
                    <span aria-hidden="true">·</span>
                    <span>Digital Bill Receipts</span>
                  </div>
                  <button
                    type="button"
                    disabled={isSigningIn}
                    onClick={() => onSignIn('seeker')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#c8a45d] hover:bg-[#d8b66f] disabled:opacity-60 text-stone-950 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap"
                  >
                    <span>Explore Map &amp; Sign In</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* Numbered Concierge Workflow Strip */}
      <section
        id="how-it-works"
        className="bg-[#0b0c0e] border-t border-stone-800/80 py-14"
      >
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[#f7f4ed] font-semibold text-base">
                <MapPin className="w-4 h-4 text-[#d4b26e]" />
                <span>01. Live Location &amp; Star Ratings</span>
              </div>
              <p className="text-sm text-stone-400 leading-relaxed tracking-wide">
                Share your live GPS, search any venue or item, and sort nearby results by distance or top verified customer ratings.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[#f7f4ed] font-semibold text-base">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>02. Galleries, Menus &amp; Directions</span>
              </div>
              <p className="text-sm text-stone-400 leading-relaxed tracking-wide">
                Inspect full-screen photo previews, numbered product and service catalogs with transparent pricing, and Google Maps routing.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[#f7f4ed] font-semibold text-base">
                <Receipt className="w-4 h-4 text-[#d4b26e]" />
                <span>03. App or Counter Digital Receipts</span>
              </div>
              <p className="text-sm text-stone-400 leading-relaxed tracking-wide">
                Pay directly in the app for instant settlement or generate a counter bill and keep your verified digital receipt.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quiet Editorial Footer */}
      <footer className="bg-[#0b0c0e] border-t border-stone-800/80 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-stone-400">
          <span className="font-serif text-base font-semibold text-[#f7f4ed] tracking-wide">
            NearCraft
          </span>
          <div className="flex items-center gap-6">
            <a href="#featured-venues" className="hover:text-stone-200 transition-colors">
              Venues
            </a>
            <a href="#how-it-works" className="hover:text-stone-200 transition-colors">
              Concierge Flow
            </a>
            <a href="#member-access" className="hover:text-stone-200 transition-colors">
              Member Sign In
            </a>
          </div>
          <span>Verified Local Venues &amp; Digital Concierge</span>
        </div>
      </footer>
    </div>
  );
}
