import React from 'react';
import { Calendar, MapPin, ShieldCheck } from 'lucide-react';
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
  return (
    <div className="bg-slate-50">
      {/* Hero Split */}
      <section className="max-w-7xl mx-auto px-6 py-12 lg:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center">
            <p className="text-sm font-medium text-blue-700 mb-3">
              Aadhaar-Verified Providers · Live Map Discovery · Direct Scheduling
            </p>
            <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.1] [text-wrap:balance]">
              Find the right local service without wasting hours searching.
            </h1>
            <p className="mt-5 text-base text-slate-600 leading-relaxed max-w-xl">
              Discover barbers, salons, repair specialists, and neighborhood professionals registered live on the map. Filter by optional radius, inspect shop photos, and schedule directly in real-time chat.
            </p>

            {authError && (
              <div
                role="alert"
                className="mt-5 p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
              >
                {authError}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => onSignIn('seeker')}
                className="px-6 py-3 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {isSigningIn ? 'Signing in...' : 'Sign In to Find Services'}
              </button>
              <button
                type="button"
                disabled={isSigningIn}
                onClick={() => onSignIn('provider')}
                className="px-6 py-3 bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-900 border border-slate-200 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Register as Service Provider
              </button>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="h-72 sm:h-96 lg:h-full min-h-[340px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-200">
              <SafeImage
                src="/src/assets/images/hero_barber_craft_1795619756867.jpg"
                alt="Local barbershop studio interior with craftsmen at work"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Full-Width Key Workflows Strip */}
        <div id="how-it-works" className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6 pt-10 border-t border-slate-200">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-semibold text-base">
              <MapPin className="w-4 h-4 text-blue-700" />
              <span>01. Pick Service & Optional Radius</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Select a category like Barber & Salon, set your location, and optionally narrow results within 2 km to 25 km—or browse every active shop on the map.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-semibold text-base">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>02. Aadhaar-Verified Providers</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Every listed shop completes Aadhaar verification and uploads real workspace photos, hours, and transparent service menus before going live.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-slate-900 font-semibold text-base">
              <Calendar className="w-4 h-4 text-blue-700" />
              <span>03. Real-Time Chat & Booking</span>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              Message providers instantly and lock in an appointment date and time slot directly inside the chat thread with live confirmation updates.
            </p>
          </div>
        </div>
      </section>

      {/* Two User Types Showcase */}
      <section id="for-providers" className="bg-white border-t border-slate-200 py-14">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
              Built for both service professionals and customers
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Switch seamlessly between discovering nearby services and managing your own shop profile.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article className="border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col">
              <div className="aspect-[4/3] bg-slate-100">
                <SafeImage
                  src="/src/assets/images/category_salon_cut_1795619757806.jpg"
                  alt="Barber cutting hair in a neighborhood salon"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <p className="text-xs text-slate-500">Barber & Salon · Grooming</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">
                  Skip walk-in wait times
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  See logged-in salons around your street, check chair availability in chat, and book your exact haircut slot.
                </p>
              </div>
            </article>

            <article className="border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col">
              <div className="aspect-[4/3] bg-slate-100">
                <SafeImage
                  src="/src/assets/images/category_home_repair_1795619757431.jpg"
                  alt="Home repair tools neatly arranged on a timber workbench"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <p className="text-xs text-slate-500">Home Repairs · Skilled Trades</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">
                  Pin your craft in minutes
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  Service providers verify with their Aadhaar card, drop their shop pin on the map, and upload workspace photos.
                </p>
              </div>
            </article>

            <article className="border border-slate-200 rounded-xl overflow-hidden bg-white flex flex-col">
              <div className="aspect-[4/3] bg-slate-100">
                <SafeImage
                  src="/src/assets/images/category_wellness_spa_1795619759050.jpg"
                  alt="Serene spa and wellness studio interior"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <p className="text-xs text-slate-500">Beauty & Spa · Wellness</p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">
                  Direct appointment control
                </h3>
                <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                  Confirm, decline, or mark appointments completed in real time while keeping every customer detail in one thread.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
}
