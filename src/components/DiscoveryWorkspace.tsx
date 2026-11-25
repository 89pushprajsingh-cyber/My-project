import React, { useMemo, useState } from 'react';
import { AdvancedMarker, Map, Pin } from '@vis.gl/react-google-maps';
import {
  Calendar,
  Crosshair,
  ExternalLink,
  MapPin,
  MessageSquare,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  formatDistanceKm,
  getAverageRating,
  haversineDistanceKm,
  LatLngPoint,
  SERVICE_CATEGORIES,
  ServiceCategory,
  ServiceListing,
} from '../types';
import { PlacesSearchInput } from './PlacesSearchInput';
import { MapCameraSync, MapRadiusCircle } from './MapRadiusCircle';
import { SafeImage } from './SafeImage';
import { StarRatingDisplay } from './StarRating';
import { ProviderReviewsList } from './ProviderReviewsList';

interface DiscoveryWorkspaceProps {
  services: ServiceListing[];
  isLoadingServices: boolean;
  mapsReady: boolean;
  onOpenChat: (service: ServiceListing) => void;
  onGoToProviderPortal: () => void;
}

const RADIUS_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Any distance', value: null },
  { label: '2 km', value: 2 },
  { label: '5 km', value: 5 },
  { label: '10 km', value: 10 },
  { label: '25 km', value: 25 },
];

const DEFAULT_MAP_CENTER: LatLngPoint = { lat: 28.6139, lng: 77.209 };

export function DiscoveryWorkspace({
  services,
  isLoadingServices,
  mapsReady,
  onOpenChat,
  onGoToProviderPortal,
}: DiscoveryWorkspaceProps) {
  const [selectedCategory, setSelectedCategory] = useState<'All' | ServiceCategory>('Barber & Salon');
  const [searchText, setSearchText] = useState('');
  const [searchCenter, setSearchCenter] = useState<LatLngPoint | null>(null);
  const [searchAddressLabel, setSearchAddressLabel] = useState('');
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'nearest' | 'rating'>('nearest');
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'overview' | 'reviews'>('overview');
  const [cameraTrigger, setCameraTrigger] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const effectiveCenter = useMemo<LatLngPoint>(() => {
    if (searchCenter) return searchCenter;
    if (services.length > 0) {
      return { lat: services[0].lat, lng: services[0].lng };
    }
    return DEFAULT_MAP_CENTER;
  }, [searchCenter, services]);

  const filteredServices = useMemo(() => {
    const queryLower = searchText.trim().toLowerCase();

    const mapped = services
      .filter((svc) => svc.isActive)
      .filter((svc) => {
        if (selectedCategory !== 'All' && svc.category !== selectedCategory) {
          return false;
        }
        if (queryLower) {
          const haystack = `${svc.shopName} ${svc.description} ${svc.address} ${svc.servicesOffered.join(' ')}`.toLowerCase();
          if (!haystack.includes(queryLower)) return false;
        }
        return true;
      })
      .map((svc) => {
        const distanceKm = searchCenter
          ? haversineDistanceKm(searchCenter, { lat: svc.lat, lng: svc.lng })
          : null;
        return { service: svc, distanceKm };
      })
      .filter((item) => {
        if (radiusKm !== null && item.distanceKm !== null) {
          return item.distanceKm <= radiusKm;
        }
        return true;
      });

    if (sortBy === 'rating') {
      mapped.sort((a, b) => {
        const avgA = getAverageRating(a.service) ?? -1;
        const avgB = getAverageRating(b.service) ?? -1;
        if (avgB !== avgA) return avgB - avgA;
        const countDiff = (b.service.ratingCount ?? 0) - (a.service.ratingCount ?? 0);
        if (countDiff !== 0) return countDiff;
        return (a.distanceKm ?? 0) - (b.distanceKm ?? 0);
      });
    } else if (searchCenter) {
      mapped.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }

    return mapped;
  }, [services, selectedCategory, searchText, searchCenter, radiusKm, sortBy]);

  const selectedService = useMemo(
    () => filteredServices.find((item) => item.service.id === selectedServiceId)?.service || null,
    [filteredServices, selectedServiceId]
  );

  const handleSelectService = (serviceId: string | null) => {
    setSelectedServiceId(serviceId);
    setDetailTab('overview');
  };

  const handleUseMyGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by this browser.');
      return;
    }
    setIsLocating(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setSearchCenter(pt);
        setSearchAddressLabel('Current GPS Location');
        setCameraTrigger((prev) => prev + 1);
        setIsLocating(false);
      },
      () => {
        setGpsError('Could not read GPS position. Try searching your area above.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSelectRadius = (value: number | null) => {
    setRadiusKm(value);
    if (value !== null && !searchCenter) {
      // Anchor radius around current effective center so user sees radius filtering immediately
      setSearchCenter(effectiveCenter);
      if (!searchAddressLabel) {
        setSearchAddressLabel('Map Center');
      }
    }
  };

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-65px)] overflow-hidden">
      {/* Left Sidebar: Filters & Matching Providers */}
      <aside className="w-full lg:w-[440px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col lg:h-full">
        <div className="p-5 border-b border-slate-200 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
              Find Verified Local Services
            </h1>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono tabular-nums text-slate-500">
                {filteredServices.length} found
              </span>
              <span className="text-slate-300" aria-hidden="true">·</span>
              <select
                aria-label="Sort results"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'nearest' | 'rating')}
                className="text-xs font-medium text-slate-700 bg-transparent border-0 pr-1 py-0.5 focus:outline-none cursor-pointer"
              >
                <option value="nearest">Nearest</option>
                <option value="rating">Top Rated</option>
              </select>
            </div>
          </div>

          {/* Service Type Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="discover-category" className="block text-xs font-medium text-slate-600 mb-1">
                Service Type
              </label>
              <select
                id="discover-category"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as 'All' | ServiceCategory)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="All">All Services</option>
                {SERVICE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="discover-search" className="block text-xs font-medium text-slate-600 mb-1">
                Filter by Name or Service
              </label>
              <input
                id="discover-search"
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="e.g., haircut, fade, beard"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>

          {/* Location Search + GPS */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-600">
                Your Area / Reference Point
              </label>
              <button
                type="button"
                onClick={handleUseMyGps}
                disabled={isLocating}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-800"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>{isLocating ? 'Locating...' : 'Use My GPS'}</span>
              </button>
            </div>

            {mapsReady ? (
              <PlacesSearchInput
                initialValue={searchAddressLabel}
                placeholder="Search neighborhood or city"
                onLocationSelected={({ address, location }) => {
                  setSearchAddressLabel(address);
                  setSearchCenter(location);
                  setCameraTrigger((prev) => prev + 1);
                }}
              />
            ) : (
              <input
                type="text"
                disabled
                placeholder="Initializing Places search..."
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-400"
              />
            )}
            {gpsError && <p className="mt-1 text-xs text-red-600">{gpsError}</p>}
          </div>

          {/* Optional Radius Filter */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-600">
                Search Radius (optional)
              </span>
              {searchCenter && radiusKm !== null && (
                <button
                  type="button"
                  onClick={() => setRadiusKm(null)}
                  className="text-xs text-blue-700 hover:underline"
                >
                  Clear radius
                </button>
              )}
            </div>
            <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 rounded-lg">
              {RADIUS_OPTIONS.map((opt) => {
                const active = radiusKm === opt.value;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => handleSelectRadius(opt.value)}
                    className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                      active
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label === 'Any distance' ? 'Any' : opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Provider Results List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {isLoadingServices ? (
            <div className="p-5 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex gap-3.5">
                  <div className="w-20 h-20 rounded-lg bg-slate-200 shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-slate-200 rounded w-2/3" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                    <div className="h-3 bg-slate-100 rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="p-8 text-center">
              <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-slate-900">
                No matching providers found
              </h3>
              <p className="mt-1.5 text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
                {services.length === 0
                  ? 'No service providers have registered yet. Register your own shop in the Provider Portal to appear on the map.'
                  : 'Try widening your optional radius, clearing search text, or switching to All Services.'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {radiusKm !== null && (
                  <button
                    type="button"
                    onClick={() => setRadiusKm(null)}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    Show Any Distance
                  </button>
                )}
                {selectedCategory !== 'All' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('All')}
                    className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                  >
                    All Categories
                  </button>
                )}
                <button
                  type="button"
                  onClick={onGoToProviderPortal}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                >
                  Register a Shop
                </button>
              </div>
            </div>
          ) : (
            filteredServices.map(({ service, distanceKm }) => {
              const isSelected = service.id === selectedServiceId;
              return (
                <div
                  key={service.id}
                  onClick={() => {
                    handleSelectService(service.id);
                    setCameraTrigger((prev) => prev + 1);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectService(service.id);
                    }
                  }}
                  className={`p-4 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex gap-3.5">
                    <div className="w-24 h-20 rounded-lg overflow-hidden border border-slate-200 shrink-0 bg-slate-100">
                      <SafeImage
                        src={service.photoUrls[0]}
                        alt={service.shopName}
                        fallbackLabel={service.category}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 truncate">
                          {service.shopName}
                        </h3>
                        {distanceKm !== null && (
                          <span className="text-xs font-mono tabular-nums font-medium text-blue-700 shrink-0">
                            {formatDistanceKm(distanceKm)}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <span>{service.category}</span>
                        <span aria-hidden="true">·</span>
                        <StarRatingDisplay
                          average={getAverageRating(service)}
                          count={service.ratingCount ?? 0}
                          compact
                        />
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Aadhaar Verified</span>
                        </span>
                      </div>

                      <p className="mt-1 text-xs text-slate-600 truncate">
                        {service.address}
                      </p>

                      <div className="mt-2.5 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500 truncate">
                          {service.servicesOffered[0]}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenChat(service);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Chat & Book</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Pane: Full-Size Interactive Google Map + Selected Shop Card */}
      <main className="relative flex-1 h-[500px] lg:h-full bg-slate-100">
        {mapsReady ? (
          <Map
            mapId="DEMO_MAP_ID"
            defaultCenter={effectiveCenter}
            defaultZoom={12}
            gestureHandling="greedy"
            disableDefaultUI={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            <MapCameraSync
              center={
                selectedService
                  ? { lat: selectedService.lat, lng: selectedService.lng }
                  : effectiveCenter
              }
              zoom={selectedService ? 15 : 12}
              triggerKey={cameraTrigger}
            />

            {searchCenter && (
              <AdvancedMarker position={searchCenter} title="Your Search Location">
                <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white shadow-md" />
              </AdvancedMarker>
            )}

            {searchCenter && radiusKm !== null && (
              <MapRadiusCircle center={searchCenter} radiusKm={radiusKm} />
            )}

            {filteredServices.map(({ service }) => {
              const isSelected = service.id === selectedServiceId;
              return (
                <AdvancedMarker
                  key={service.id}
                  position={{ lat: service.lat, lng: service.lng }}
                  title={service.shopName}
                  zIndex={isSelected ? 1000 : 10}
                  onClick={() => handleSelectService(service.id)}
                >
                  <Pin
                    background={isSelected ? '#1d4ed8' : '#0f172a'}
                    borderColor="#ffffff"
                    glyphColor="#ffffff"
                    scale={isSelected ? 1.2 : 1}
                  />
                </AdvancedMarker>
              );
            })}
          </Map>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-8 text-center">
            <div className="max-w-sm">
              <MapPin className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-700">
                Loading Google Maps...
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Verify your Google Maps API key configuration if the map does not appear.
              </p>
            </div>
          </div>
        )}

        {/* Selected Provider Detail Sheet Over Map */}
        {selectedService && (
          <div className="absolute bottom-4 left-4 right-4 lg:left-auto lg:right-5 lg:w-[400px] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-20">
            <div className="relative h-36 bg-slate-100">
              <SafeImage
                src={selectedService.photoUrls[0]}
                alt={selectedService.shopName}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => handleSelectService(null)}
                aria-label="Close shop details"
                className="absolute top-2.5 right-2.5 p-1.5 bg-white/95 hover:bg-white text-slate-700 rounded-lg border border-slate-200 shadow-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    {selectedService.shopName}
                  </h2>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 shrink-0 mt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Aadhaar Verified</span>
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                  <StarRatingDisplay
                    average={getAverageRating(selectedService)}
                    count={selectedService.ratingCount ?? 0}
                  />
                  <span aria-hidden="true">·</span>
                  <span>{selectedService.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>By {selectedService.ownerName}</span>
                </div>
              </div>

              {/* Overview / Reviews Tabs */}
              <div className="flex items-center gap-5 border-b border-slate-200 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setDetailTab('overview')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
                    detailTab === 'overview'
                      ? 'border-blue-700 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Overview
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('reviews')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap tabular-nums ${
                    detailTab === 'reviews'
                      ? 'border-blue-700 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Reviews ({selectedService.ratingCount ?? 0})
                </button>
              </div>

              {detailTab === 'overview' ? (
                <div className="space-y-2.5">
                  <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                    {selectedService.description}
                  </p>

                  <p className="text-xs text-slate-500 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      {selectedService.address} · {selectedService.openHours}
                    </span>
                  </p>

                  {selectedService.photoUrls.length > 1 && (
                    <div className="flex gap-2">
                      {selectedService.photoUrls.slice(1).map((url, idx) => (
                        <div
                          key={`${url}-${idx}`}
                          className="w-16 h-12 rounded-md overflow-hidden border border-slate-200 bg-slate-100"
                        >
                          <SafeImage
                            src={url}
                            alt={`${selectedService.shopName} photo ${idx + 2}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-100">
                    <p className="text-xs font-medium text-slate-700 mb-1">Services</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
                      {selectedService.servicesOffered.slice(0, 4).map((item, idx) => (
                        <span key={`${item}-${idx}`}>
                          {idx > 0 && <span className="mr-3 text-slate-300">·</span>}
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <ProviderReviewsList providerId={selectedService.id} compact />
              )}

              <div className="pt-2 flex items-center gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => onOpenChat(selectedService)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Schedule & Chat</span>
                </button>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedService.lat},${selectedService.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Directions</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
