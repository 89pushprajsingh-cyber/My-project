import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdvancedMarker, Map, Pin, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  ExternalLink,
  Globe,
  Images,
  LocateFixed,
  MapPin,
  Maximize2,
  MessageSquare,
  Minus,
  Phone,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Star,
  Store,
  X,
} from 'lucide-react';
import {
  BillLineItem,
  formatDistanceKm,
  getAverageRating,
  getServiceCatalogItems,
  haversineDistanceKm,
  LatLngPoint,
  ServiceCategory,
  ServiceListing,
} from '../types';
import {
  matchesSelectedServiceCategory,
  searchServiceDirectory,
} from '../data/serviceDirectory';
import { PlacesSearchInput } from './PlacesSearchInput';
import { ServiceTypeaheadInput } from './ServiceTypeaheadInput';
import { MapCameraSync, MapRadiusCircle } from './MapRadiusCircle';
import { CircularRadiusDial } from './CircularRadiusDial';
import { SafeImage } from './SafeImage';
import { StarRatingDisplay } from './StarRating';
import { ProviderReviewsList } from './ProviderReviewsList';
import {
  discoverGooglePlaces,
  fetchGooglePlaceDetails,
  formatBusinessStatusLabel,
  formatPriceLevelLabel,
  GoogleMapPlaceItem,
  isQuotaExhaustedError,
} from './googlePlacesDiscovery';

interface DiscoveryWorkspaceProps {
  services: ServiceListing[];
  isLoadingServices: boolean;
  mapsReady: boolean;
  onOpenChat: (service: ServiceListing) => void;
  onStartCheckout: (service: ServiceListing, items: BillLineItem[]) => void;
}

type SourceFilter = 'all' | 'google' | 'registered';

type SelectedSelection =
  | { source: 'registered'; id: string }
  | { source: 'google'; id: string };

type DiscoveryEntry =
  | {
      source: 'registered';
      key: string;
      service: ServiceListing;
      distanceKm: number | null;
      sortDistanceKm: number;
      ratingValue: number | null;
      ratingCount: number;
    }
  | {
      source: 'google';
      key: string;
      place: GoogleMapPlaceItem;
      distanceKm: number | null;
      sortDistanceKm: number;
      ratingValue: number | null;
      ratingCount: number;
    };

const MIN_RADIUS_KM = 1;
const MAX_RADIUS_KM = 20;
const DEFAULT_SLIDER_RADIUS_KM = 5;

const DEFAULT_MAP_CENTER: LatLngPoint = { lat: 28.6139, lng: 77.209 };

function matchesSearchQuery(svc: ServiceListing, rawQuery: string): boolean {
  const cleaned = rawQuery.trim().toLowerCase();
  if (!cleaned) return true;

  const catalog = getServiceCatalogItems(svc);
  const catalogText = catalog.map((c) => `${c.name} ${c.itemType} ${c.unit}`).join(' ');
  const haystack = `${svc.shopName} ${svc.category} ${svc.ownerName} ${svc.description} ${svc.address} ${svc.servicesOffered.join(' ')} ${catalogText}`.toLowerCase();

  const normalizedHaystack = haystack.replace(/caf[eé]/g, 'cafe');
  const tokens = cleaned.split(/\s+/).filter(Boolean);

  return tokens.every((token) => {
    const normalizedToken = token.replace(/caffe/g, 'cafe').replace(/café/g, 'cafe');
    return haystack.includes(token) || normalizedHaystack.includes(normalizedToken);
  });
}

function normalizeNameForDedup(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface GooglePlacesSyncProps {
  center: LatLngPoint;
  category: 'All' | ServiceCategory;
  searchText: string;
  radiusKm: number | null;
  enabled: boolean;
  refreshSeq: number;
  onLoadingChange: (loading: boolean) => void;
  onErrorChange: (error: string | null) => void;
  onResults: (places: GoogleMapPlaceItem[], queriedCenter: LatLngPoint) => void;
}

function GooglePlacesSync({
  center,
  category,
  searchText,
  radiusKm,
  enabled,
  refreshSeq,
  onLoadingChange,
  onErrorChange,
  onResults,
}: GooglePlacesSyncProps) {
  const placesLib = useMapsLibrary('places');
  const lastQueryKeyRef = useRef<string>('');
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!placesLib || !enabled) return;

    const queryKey = `${center.lat.toFixed(4)}|${center.lng.toFixed(4)}|${category}|${searchText.trim().toLowerCase()}|${radiusKm ?? 'any'}|${refreshSeq}`;
    if (queryKey === lastQueryKeyRef.current) return;

    const timer = window.setTimeout(async () => {
      const seq = ++requestSeqRef.current;
      onLoadingChange(true);
      onErrorChange(null);

      try {
        const items = await discoverGooglePlaces({
          placesLib,
          center,
          category,
          searchText,
          radiusKm,
        });
        if (seq !== requestSeqRef.current) return;
        lastQueryKeyRef.current = queryKey;
        onResults(items, center);
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        if (isQuotaExhaustedError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          onErrorChange('Google Maps Places quota reached. Please try again later.');
        } else {
          onErrorChange('Unable to load Google Maps listings for this area.');
        }
      } finally {
        if (seq === requestSeqRef.current) {
          onLoadingChange(false);
        }
      }
    }, 420);

    return () => window.clearTimeout(timer);
  }, [
    placesLib,
    center.lat,
    center.lng,
    category,
    searchText,
    radiusKm,
    enabled,
    refreshSeq,
    onLoadingChange,
    onErrorChange,
    onResults,
  ]);

  return null;
}

interface MapViewportTrackerProps {
  lastSearchedCenter: LatLngPoint | null;
  onPannedCenterChange: (center: LatLngPoint | null) => void;
}

function MapViewportTracker({
  lastSearchedCenter,
  onPannedCenterChange,
}: MapViewportTrackerProps) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('idle', () => {
      const c = map.getCenter();
      if (!c) return;
      const currentPt = { lat: c.lat(), lng: c.lng() };
      if (!lastSearchedCenter) {
        onPannedCenterChange(null);
        return;
      }
      const movedKm = haversineDistanceKm(lastSearchedCenter, currentPt);
      if (movedKm > 0.75) {
        onPannedCenterChange(currentPt);
      } else {
        onPannedCenterChange(null);
      }
    });

    return () => {
      listener.remove();
    };
  }, [map, lastSearchedCenter, onPannedCenterChange]);

  return null;
}

export function DiscoveryWorkspace({
  services,
  isLoadingServices,
  mapsReady,
  onOpenChat,
  onStartCheckout,
}: DiscoveryWorkspaceProps) {
  const [selectedCategory, setSelectedCategory] = useState<'All' | ServiceCategory>('All');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [searchText, setSearchText] = useState('');
  const [searchCenter, setSearchCenter] = useState<LatLngPoint | null>(null);
  const [searchAddressLabel, setSearchAddressLabel] = useState('');
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<'nearest' | 'rating'>('nearest');

  const [selection, setSelection] = useState<SelectedSelection | null>(null);
  const [detailTab, setDetailTab] = useState<'catalog' | 'photos' | 'reviews'>('catalog');
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  const [quantitiesByService, setQuantitiesByService] = useState<
    Record<string, Record<number, number>>
  >({});
  const [cameraTrigger, setCameraTrigger] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Live Google Maps Places results
  const [googlePlaces, setGooglePlaces] = useState<GoogleMapPlaceItem[]>([]);
  const [googleDetailsById, setGoogleDetailsById] = useState<Record<string, GoogleMapPlaceItem>>(
    {}
  );
  const [isLoadingGooglePlaces, setIsLoadingGooglePlaces] = useState(false);
  const [googlePlacesError, setGooglePlacesError] = useState<string | null>(null);
  const [isLoadingPlaceDetail, setIsLoadingPlaceDetail] = useState(false);
  const [googleRefreshSeq, setGoogleRefreshSeq] = useState(0);
  const [lastQueriedCenter, setLastQueriedCenter] = useState<LatLngPoint | null>(null);
  const [pannedCenter, setPannedCenter] = useState<LatLngPoint | null>(null);
  const [isSearchHintsOpen, setIsSearchHintsOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const fetchingDetailIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setIsSearchHintsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const searchDirectoryHints = useMemo(() => {
    const q = searchText.trim();
    if (!q) return [];
    return searchServiceDirectory(q, 8);
  }, [searchText]);

  const effectiveCenter = useMemo<LatLngPoint>(() => {
    if (searchCenter) return searchCenter;
    if (services.length > 0) {
      return { lat: services[0].lat, lng: services[0].lng };
    }
    return DEFAULT_MAP_CENTER;
  }, [searchCenter, services]);

  const handleGoogleResults = useCallback(
    (items: GoogleMapPlaceItem[], queriedCenter: LatLngPoint) => {
      setGooglePlaces(items);
      setLastQueriedCenter(queriedCenter);
      setPannedCenter(null);
    },
    []
  );

  // Merge Google Maps items with any fetched detailed fields for this session
  const hydratedGooglePlaces = useMemo(
    () => googlePlaces.map((item) => googleDetailsById[item.id] ?? item),
    [googlePlaces, googleDetailsById]
  );

  // Blend & filter registered NearCraft shops + live Google Maps services
  const discoveredEntries = useMemo<DiscoveryEntry[]>(() => {
    const activeRegistered = services.filter((svc) => svc.isActive);

    const registeredEntries: DiscoveryEntry[] =
      sourceFilter === 'google'
        ? []
        : activeRegistered
            .filter((svc) => {
              if (selectedCategory !== 'All') {
                const catalog = getServiceCatalogItems(svc);
                const haystack = `${svc.shopName} ${svc.category} ${svc.description} ${svc.servicesOffered.join(' ')} ${catalog.map((c) => c.name).join(' ')}`.toLowerCase();
                if (!matchesSelectedServiceCategory(svc.category, haystack, selectedCategory)) {
                  return false;
                }
              }
              return matchesSearchQuery(svc, searchText);
            })
            .map((svc) => {
              const distanceKm = searchCenter
                ? haversineDistanceKm(searchCenter, { lat: svc.lat, lng: svc.lng })
                : null;
              const sortDistanceKm = haversineDistanceKm(effectiveCenter, {
                lat: svc.lat,
                lng: svc.lng,
              });
              return {
                source: 'registered' as const,
                key: `registered:${svc.id}`,
                service: svc,
                distanceKm,
                sortDistanceKm,
                ratingValue: getAverageRating(svc),
                ratingCount: svc.ratingCount ?? 0,
              };
            })
            .filter((entry) => {
              if (radiusKm !== null) {
                const dist = entry.distanceKm ?? entry.sortDistanceKm;
                return dist <= radiusKm;
              }
              return true;
            });

    const googleEntries: DiscoveryEntry[] =
      sourceFilter === 'registered'
        ? []
        : hydratedGooglePlaces
            .filter((place) => {
              // Avoid duplicating a shop that is already Aadhaar-registered on NearCraft
              const placeNameNorm = normalizeNameForDedup(place.displayName);
              const isDup = activeRegistered.some((reg) => {
                const sameSpot =
                  haversineDistanceKm({ lat: reg.lat, lng: reg.lng }, { lat: place.lat, lng: place.lng }) <
                  0.08;
                if (!sameSpot) return false;
                const regNorm = normalizeNameForDedup(reg.shopName);
                return (
                  regNorm === placeNameNorm ||
                  regNorm.includes(placeNameNorm) ||
                  placeNameNorm.includes(regNorm)
                );
              });
              return !isDup;
            })
            .map((place) => {
              const distanceKm = searchCenter
                ? haversineDistanceKm(searchCenter, { lat: place.lat, lng: place.lng })
                : null;
              const sortDistanceKm = haversineDistanceKm(effectiveCenter, {
                lat: place.lat,
                lng: place.lng,
              });
              return {
                source: 'google' as const,
                key: `google:${place.id}`,
                place,
                distanceKm,
                sortDistanceKm,
                ratingValue: place.rating,
                ratingCount: place.userRatingCount,
              };
            })
            .filter((entry) => {
              if (radiusKm !== null) {
                const dist = entry.distanceKm ?? entry.sortDistanceKm;
                return dist <= radiusKm;
              }
              return true;
            });

    const combined = [...registeredEntries, ...googleEntries];

    if (sortBy === 'rating') {
      combined.sort((a, b) => {
        const ratingA = a.ratingValue ?? -1;
        const ratingB = b.ratingValue ?? -1;
        if (ratingB !== ratingA) return ratingB - ratingA;
        if (b.ratingCount !== a.ratingCount) return b.ratingCount - a.ratingCount;
        return a.sortDistanceKm - b.sortDistanceKm;
      });
    } else if (searchCenter) {
      combined.sort((a, b) => a.sortDistanceKm - b.sortDistanceKm);
    } else {
      combined.sort((a, b) => {
        if (a.source !== b.source) {
          return a.source === 'registered' ? -1 : 1;
        }
        return a.sortDistanceKm - b.sortDistanceKm;
      });
    }

    return combined;
  }, [
    services,
    hydratedGooglePlaces,
    sourceFilter,
    selectedCategory,
    searchText,
    searchCenter,
    effectiveCenter,
    radiusKm,
    sortBy,
  ]);

  const selectedEntry = useMemo(() => {
    if (!selection) return null;
    const found = discoveredEntries.find(
      (entry) =>
        entry.source === selection.source &&
        (entry.source === 'registered'
          ? entry.service.id === selection.id
          : entry.place.id === selection.id)
    );
    if (found) return found;

    // Preserve opened Google place detail even if filter changed slightly until closed
    if (selection.source === 'google') {
      const cached = googleDetailsById[selection.id] || googlePlaces.find((p) => p.id === selection.id);
      if (cached) {
        const distanceKm = searchCenter
          ? haversineDistanceKm(searchCenter, { lat: cached.lat, lng: cached.lng })
          : null;
        return {
          source: 'google' as const,
          key: `google:${cached.id}`,
          place: cached,
          distanceKm,
          sortDistanceKm: haversineDistanceKm(effectiveCenter, {
            lat: cached.lat,
            lng: cached.lng,
          }),
          ratingValue: cached.rating,
          ratingCount: cached.userRatingCount,
        } satisfies DiscoveryEntry;
      }
    }
    return null;
  }, [selection, discoveredEntries, googleDetailsById, googlePlaces, searchCenter, effectiveCenter]);

  const selectedRegisteredService =
    selectedEntry?.source === 'registered' ? selectedEntry.service : null;
  const selectedGooglePlace =
    selectedEntry?.source === 'google' ? selectedEntry.place : null;
  const selectedDistanceKm = selectedEntry?.distanceKm ?? null;

  // Fetch rich details (hours, phone, website, photos, reviews) lazily on Google place selection
  useEffect(() => {
    if (!selectedGooglePlace || selectedGooglePlace.detailsLoaded) return;
    if (fetchingDetailIdRef.current === selectedGooglePlace.id) return;

    let cancelled = false;
    fetchingDetailIdRef.current = selectedGooglePlace.id;
    setIsLoadingPlaceDetail(true);

    void fetchGooglePlaceDetails(selectedGooglePlace)
      .then((detailed) => {
        if (cancelled) return;
        setGoogleDetailsById((prev) => ({
          ...prev,
          [detailed.id]: detailed,
        }));
      })
      .catch((err) => {
        if (cancelled) return;
        if (isQuotaExhaustedError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPlaceDetail(false);
        }
        if (fetchingDetailIdRef.current === selectedGooglePlace.id) {
          fetchingDetailIdRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedGooglePlace]);

  const selectedCatalog = useMemo(
    () => (selectedRegisteredService ? getServiceCatalogItems(selectedRegisteredService) : []),
    [selectedRegisteredService]
  );

  const selectedQuantities = useMemo(
    () =>
      selectedRegisteredService ? quantitiesByService[selectedRegisteredService.id] || {} : {},
    [quantitiesByService, selectedRegisteredService]
  );

  const selectedBillItems = useMemo<BillLineItem[]>(() => {
    if (!selectedRegisteredService) return [];
    const lines: BillLineItem[] = [];
    selectedCatalog.forEach((item, idx) => {
      const qty = selectedQuantities[idx] || 0;
      if (qty > 0) {
        lines.push({
          name: item.name,
          itemType: item.itemType,
          unit: item.unit,
          quantity: qty,
          unitPrice: item.price,
          lineTotal: Number((qty * item.price).toFixed(2)),
        });
      }
    });
    return lines;
  }, [selectedRegisteredService, selectedCatalog, selectedQuantities]);

  const selectedOrderTotals = useMemo(() => {
    let count = 0;
    let amount = 0;
    for (const line of selectedBillItems) {
      count += line.quantity;
      amount += line.lineTotal;
    }
    return { count, amount: Number(amount.toFixed(2)) };
  }, [selectedBillItems]);

  const selectedGalleryPhotos = useMemo(() => {
    if (selectedRegisteredService) {
      return (selectedRegisteredService.photoUrls || []).map((url) => ({
        url,
        attributionText: null as string | null,
        attributionUri: null as string | null,
      }));
    }
    if (selectedGooglePlace) {
      return selectedGooglePlace.photos.map((photo) => ({
        url: photo.url,
        attributionText: photo.attributions[0]?.displayName ?? null,
        attributionUri: photo.attributions[0]?.uri ?? null,
      }));
    }
    return [];
  }, [selectedRegisteredService, selectedGooglePlace]);

  const safePhotoIdx =
    selectedGalleryPhotos.length > 0
      ? Math.min(activePhotoIdx, selectedGalleryPhotos.length - 1)
      : 0;

  useEffect(() => {
    if (!isLightboxOpen || !selectedEntry) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setIsLightboxOpen(false);
      } else if (ev.key === 'ArrowLeft' && selectedGalleryPhotos.length > 1) {
        setActivePhotoIdx(
          (prev) => (prev - 1 + selectedGalleryPhotos.length) % selectedGalleryPhotos.length
        );
      } else if (ev.key === 'ArrowRight' && selectedGalleryPhotos.length > 1) {
        setActivePhotoIdx((prev) => (prev + 1) % selectedGalleryPhotos.length);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLightboxOpen, selectedEntry, selectedGalleryPhotos.length]);

  const handleSelectEntry = (next: SelectedSelection | null) => {
    setSelection(next);
    setDetailTab('catalog');
    setActivePhotoIdx(0);
    setIsLightboxOpen(false);
  };

  const handleAdjustItemQty = (serviceId: string, itemIdx: number, delta: number) => {
    setQuantitiesByService((prev) => {
      const currentMap = prev[serviceId] || {};
      const nextQty = Math.min(99, Math.max(0, (currentMap[itemIdx] || 0) + delta));
      return {
        ...prev,
        [serviceId]: {
          ...currentMap,
          [itemIdx]: nextQty,
        },
      };
    });
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
      setSearchCenter(effectiveCenter);
      if (!searchAddressLabel) {
        setSearchAddressLabel('Map Center');
      }
    }
  };

  const handleSearchPannedArea = () => {
    if (!pannedCenter) return;
    setSearchCenter(pannedCenter);
    setSearchAddressLabel('Selected Map Area');
    setPannedCenter(null);
    setGoogleRefreshSeq((prev) => prev + 1);
  };

  const selectedShopName =
    selectedRegisteredService?.shopName || selectedGooglePlace?.displayName || '';
  const selectedShopCategory =
    selectedRegisteredService?.category || selectedGooglePlace?.primaryTypeLabel || 'Service';
  const selectedCoords = selectedRegisteredService
    ? { lat: selectedRegisteredService.lat, lng: selectedRegisteredService.lng }
    : selectedGooglePlace
      ? { lat: selectedGooglePlace.lat, lng: selectedGooglePlace.lng }
      : null;

  const isLoadingCombined =
    isLoadingServices || (mapsReady && isLoadingGooglePlaces && discoveredEntries.length === 0);

  return (
    <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-65px)] overflow-hidden">
      {/* Live Google Maps Places API (New) fetcher mounted only when APIProvider is ready */}
      {mapsReady && (
        <GooglePlacesSync
          center={effectiveCenter}
          category={selectedCategory}
          searchText={searchText}
          radiusKm={radiusKm}
          enabled={sourceFilter !== 'registered'}
          refreshSeq={googleRefreshSeq}
          onLoadingChange={setIsLoadingGooglePlaces}
          onErrorChange={setGooglePlacesError}
          onResults={handleGoogleResults}
        />
      )}

      {/* Left Sidebar: Luxury Concierge Controls + Matching Providers & Google Maps Places */}
      <aside className="w-full lg:w-[440px] shrink-0 bg-[#fcfaf5] border-b lg:border-b-0 lg:border-r border-[#e4dac4] flex flex-col lg:h-full lg:overflow-y-auto">
        <div className="p-5 bg-[#141210] text-[#f7f4ed] border-b border-[#2f2920] space-y-3.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h1 className="font-serif text-xl font-semibold text-[#f7f4ed] tracking-wide">
              Find Local Services
            </h1>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-mono tabular-nums text-[#d8b66f]">
                {discoveredEntries.length} found
              </span>
              <span className="text-[#544b3d]" aria-hidden="true">·</span>
              <select
                aria-label="Sort results"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'nearest' | 'rating')}
                className="text-xs font-medium text-[#efe8d8] bg-[#1d1915] border border-[#362f24] rounded-md px-2 py-1 focus:outline-none focus:border-[#c8a45d] cursor-pointer"
              >
                <option value="nearest" className="bg-[#141210] text-[#f7f4ed]">Nearest</option>
                <option value="rating" className="bg-[#141210] text-[#f7f4ed]">Top Rated</option>
              </select>
            </div>
          </div>

          {/* Service Type Selector & Keyword Search */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label htmlFor="discover-category" className="block text-xs font-medium text-[#c9c0b0] mb-1">
                Service Type
              </label>
              <ServiceTypeaheadInput
                id="discover-category"
                value={selectedCategory}
                onChange={(val) => setSelectedCategory(val)}
                allowAll
                allLabel="All Services"
                placeholder="Type first letter (e.g., B, G, H)..."
                variant="luxury-dark"
                ariaLabel="Service Type"
              />
            </div>

            <div ref={searchBoxRef} className="relative">
              <label htmlFor="discover-search" className="block text-xs font-medium text-[#c9c0b0] mb-1">
                Search Shop, Dish, or Service
              </label>
              <input
                id="discover-search"
                type="text"
                value={searchText}
                onFocus={() => {
                  if (searchText.trim().length >= 1) setIsSearchHintsOpen(true);
                }}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setIsSearchHintsOpen(e.target.value.trim().length >= 1);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setIsSearchHintsOpen(false);
                }}
                placeholder="Type letter or dish (e.g., S, soup, cafe)"
                className="w-full px-3 py-2 text-sm bg-[#1d1915] border border-[#362f24] rounded-lg text-[#f7f4ed] placeholder:text-[#8f8677] focus:outline-none focus:ring-2 focus:ring-[#c8a45d]/25 focus:border-[#c8a45d]"
              />
              {isSearchHintsOpen && searchDirectoryHints.length > 0 && (
                <ul className="absolute z-50 mt-1.5 right-0 w-full min-w-[240px] rounded-lg shadow-2xl max-h-60 overflow-y-auto bg-[#1a1713] border border-[#3d3426] divide-y divide-[#2b251d]">
                  {searchDirectoryHints.map((hint) => (
                    <li key={hint.key}>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchText(hint.name);
                          setIsSearchHintsOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left flex items-center justify-between gap-2 text-[#e5decb] hover:bg-[#2a241b] hover:text-white transition-colors"
                      >
                        <span className="text-xs font-medium truncate">{hint.name}</span>
                        <span className="text-[10px] text-[#9b9180] shrink-0 truncate max-w-[115px]">
                          {hint.isGroup ? 'Category' : hint.group}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Location Search + GPS */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-[#c9c0b0]">
                Your Live Location / Area
              </label>
              <button
                type="button"
                onClick={handleUseMyGps}
                disabled={isLocating}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#d8b66f] hover:text-[#f0d596] whitespace-nowrap"
              >
                <Crosshair className="w-3.5 h-3.5" />
                <span>{isLocating ? 'Locating...' : 'Share Live GPS'}</span>
              </button>
            </div>

            {mapsReady ? (
              <PlacesSearchInput
                variant="luxury-dark"
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
                className="w-full px-3 py-2 text-sm bg-[#1d1915] border border-[#362f24] rounded-lg text-[#8f8677]"
              />
            )}
            {gpsError && <p className="mt-1 text-xs text-red-300">{gpsError}</p>}
          </div>

          {/* Circular Radius Dial (1 km – 20 km) + Source Filter */}
          <div className="space-y-2.5">
            <CircularRadiusDial
              value={radiusKm}
              min={MIN_RADIUS_KM}
              max={MAX_RADIUS_KM}
              defaultValue={DEFAULT_SLIDER_RADIUS_KM}
              onChange={(km) => handleSelectRadius(km)}
              onClear={() => setRadiusKm(null)}
            />

            <div className="grid grid-cols-3 gap-1 p-1 bg-[#1d1915] border border-[#362f24] rounded-lg">
              {(
                [
                  { id: 'all', label: 'All Services' },
                  { id: 'google', label: 'Google Maps' },
                  { id: 'registered', label: 'Partners' },
                ] as { id: SourceFilter; label: string }[]
              ).map((tab) => {
                const active = sourceFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSourceFilter(tab.id)}
                    className={`px-2 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap truncate ${
                      active
                        ? 'bg-[#c8a45d] text-[#14110e] font-semibold shadow-sm'
                        : 'text-[#cfc7b8] hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {googlePlacesError && (
            <p className="text-xs text-amber-200 bg-amber-950/60 border border-amber-700/60 rounded-lg px-3 py-2">
              {googlePlacesError}
            </p>
          )}
        </div>

        {/* Provider & Google Maps Results List */}
        <div className="flex-1 min-h-[240px] lg:overflow-y-auto divide-y divide-[#ebe3d3]">
          {isLoadingGooglePlaces && discoveredEntries.length > 0 && (
            <div className="px-4 py-2 bg-[#f5efe2] border-b border-[#e4dac4] flex items-center gap-2 text-xs text-[#63594a]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#9e7728] shrink-0" />
              <span>Updating nearby Google Maps services...</span>
            </div>
          )}

          {isLoadingCombined ? (
            <div className="p-5 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex gap-3.5">
                  <div className="w-20 h-20 rounded-lg bg-[#e8e0cf] shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-[#e8e0cf] rounded w-2/3" />
                    <div className="h-3 bg-[#f1eadc] rounded w-1/2" />
                    <div className="h-3 bg-[#f1eadc] rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : discoveredEntries.length === 0 ? (
            <div className="p-8 text-center">
              <MapPin className="w-8 h-8 text-[#c8a45d]/70 mx-auto mb-3" />
              <h3 className="text-sm font-semibold text-[#181512]">
                No matching services found
              </h3>
              <p className="mt-1.5 text-xs text-[#686053] leading-relaxed max-w-xs mx-auto">
                {sourceFilter === 'registered' && services.length === 0
                  ? 'No registered NearCraft partner shops are listed yet. Switch to All Services to browse live businesses on Google Maps.'
                  : 'Try widening your circular radius dial, searching a different service keyword, or viewing All Services.'}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {sourceFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSourceFilter('all')}
                    className="px-3.5 py-2 text-xs font-semibold text-[#14110e] bg-[#e9dcc0] hover:bg-[#dfcda5] rounded-lg whitespace-nowrap"
                  >
                    Show All Services
                  </button>
                )}
                {radiusKm !== null && (
                  <button
                    type="button"
                    onClick={() => setRadiusKm(null)}
                    className="px-3.5 py-2 text-xs font-medium text-[#2f2920] bg-[#efe9da] hover:bg-[#e5dcc7] rounded-lg whitespace-nowrap"
                  >
                    Show Any Distance
                  </button>
                )}
                {selectedCategory !== 'All' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('All')}
                    className="px-3.5 py-2 text-xs font-medium text-[#2f2920] bg-[#efe9da] hover:bg-[#e5dcc7] rounded-lg whitespace-nowrap"
                  >
                    All Categories
                  </button>
                )}
                {searchText.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => setSearchText('')}
                    className="px-3.5 py-2 text-xs font-semibold text-[#14110e] bg-[#e9dcc0] hover:bg-[#dfcda5] rounded-lg whitespace-nowrap"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            </div>
          ) : (
            discoveredEntries.map((entry) => {
              if (entry.source === 'registered') {
                const { service, distanceKm } = entry;
                const isSelected =
                  selection?.source === 'registered' && selection.id === service.id;
                const catalog = getServiceCatalogItems(service);
                const avgRating = getAverageRating(service);
                const minPrice = catalog.length
                  ? Math.min(...catalog.map((c) => c.price))
                  : null;

                return (
                  <div
                    key={entry.key}
                    onClick={() => {
                      handleSelectEntry({ source: 'registered', id: service.id });
                      setCameraTrigger((prev) => prev + 1);
                    }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleSelectEntry({ source: 'registered', id: service.id });
                      }
                    }}
                    className={`p-4 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#f2e8d2]' : 'hover:bg-[#f6f1e6]'
                    }`}
                  >
                    <div className="flex gap-3.5">
                      <div className="w-24 h-20 rounded-lg overflow-hidden border border-[#e3d9c3] shrink-0 bg-[#efe8d8]">
                        <SafeImage
                          src={service.photoUrls[0]}
                          alt={service.shopName}
                          fallbackLabel={service.category}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-[#181512] truncate">
                            {service.shopName}
                          </h3>
                          {distanceKm !== null && (
                            <span className="text-xs font-mono tabular-nums font-semibold text-[#7d5c1c] shrink-0">
                              {formatDistanceKm(distanceKm)}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#686053]">
                          <StarRatingDisplay
                            average={avgRating}
                            count={service.ratingCount ?? 0}
                            compact
                          />
                          <span aria-hidden="true">·</span>
                          <span>{service.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex items-center gap-1 text-[#1f6246] font-medium">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Verified Partner</span>
                          </span>
                        </div>

                        <p className="mt-1 text-xs text-[#574f43] truncate">
                          {service.address}
                        </p>

                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[#686053] truncate tabular-nums">
                            {catalog.length} {catalog.length === 1 ? 'item' : 'items'}
                            {minPrice !== null ? ` · From ₹${minPrice}` : ''}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenChat(service);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#14110e] bg-[#e9dcc0] hover:bg-[#dfcda5] rounded-md transition-colors whitespace-nowrap"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Chat</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              const { place, distanceKm } = entry;
              const isSelected = selection?.source === 'google' && selection.id === place.id;
              const priceText = formatPriceLevelLabel(place.priceLevel);

              return (
                <div
                  key={entry.key}
                  onClick={() => {
                    handleSelectEntry({ source: 'google', id: place.id });
                    setCameraTrigger((prev) => prev + 1);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleSelectEntry({ source: 'google', id: place.id });
                    }
                  }}
                  className={`p-4 cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#f2e8d2]' : 'hover:bg-[#f6f1e6]'
                  }`}
                >
                  <div className="flex gap-3.5">
                    <div className="w-24 h-20 rounded-lg overflow-hidden border border-[#e3d9c3] shrink-0 bg-[#efe8d8]">
                      <SafeImage
                        src={place.photos[0]?.url || ''}
                        alt={place.displayName}
                        fallbackLabel={place.primaryTypeLabel}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-[#181512] truncate">
                          {place.displayName}
                        </h3>
                        {distanceKm !== null && (
                          <span className="text-xs font-mono tabular-nums font-semibold text-[#7d5c1c] shrink-0">
                            {formatDistanceKm(distanceKm)}
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-[#686053]">
                        <StarRatingDisplay
                          average={place.rating}
                          count={place.userRatingCount}
                          compact
                        />
                        <span aria-hidden="true">·</span>
                        <span>{place.primaryTypeLabel}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#524a3e] font-medium">Google Maps</span>
                      </div>

                      <p className="mt-1 text-xs text-[#574f43] truncate">
                        {place.shortAddress}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#686053] truncate">
                          {priceText || formatBusinessStatusLabel(place.businessStatus) || 'Google Place'}
                        </span>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}&destination_place_id=${encodeURIComponent(place.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#2f2920] bg-[#efe9da] hover:bg-[#e5dcc7] rounded-md transition-colors whitespace-nowrap shrink-0"
                        >
                          <span>Directions</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Right Pane: Full-Size Interactive Google Map + Selected Shop Sheet */}
      <main className="relative flex-1 h-[540px] lg:h-full bg-[#efe9da]">
        {mapsReady && pannedCenter && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
            <button
              type="button"
              onClick={handleSearchPannedArea}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-[#f7f4ed] bg-[#141210] hover:bg-[#221e19] border border-[#3a3123] rounded-lg shadow-lg transition-colors whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5 text-[#d8b66f]" />
              <span>Search This Map Area</span>
            </button>
          </div>
        )}

        {mapsReady ? (
          <Map
            mapId="DEMO_MAP_ID"
            defaultCenter={effectiveCenter}
            defaultZoom={13}
            gestureHandling="greedy"
            disableDefaultUI={false}
            internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
            style={{ width: '100%', height: '100%' }}
          >
            <MapCameraSync
              center={selectedCoords || effectiveCenter}
              zoom={selectedCoords ? 15 : 13}
              triggerKey={cameraTrigger}
            />

            <MapViewportTracker
              lastSearchedCenter={lastQueriedCenter}
              onPannedCenterChange={setPannedCenter}
            />

            {searchCenter && (
              <AdvancedMarker position={searchCenter} title="Your Search Location">
                <div className="w-4 h-4 rounded-full bg-[#c8a45d] border-2 border-[#14110e] ring-2 ring-white shadow-md" />
              </AdvancedMarker>
            )}

            {searchCenter && radiusKm !== null && (
              <MapRadiusCircle center={searchCenter} radiusKm={radiusKm} />
            )}

            {discoveredEntries.map((entry) => {
              if (entry.source === 'registered') {
                const { service } = entry;
                const isSelected =
                  selection?.source === 'registered' && selection.id === service.id;
                return (
                  <AdvancedMarker
                    key={entry.key}
                    position={{ lat: service.lat, lng: service.lng }}
                    title={service.shopName}
                    zIndex={isSelected ? 1000 : 20}
                    onClick={() =>
                      handleSelectEntry({ source: 'registered', id: service.id })
                    }
                  >
                    <Pin
                      background={isSelected ? '#c8a45d' : '#171411'}
                      borderColor="#ffffff"
                      glyphColor={isSelected ? '#14110e' : '#d8b66f'}
                      scale={isSelected ? 1.2 : 1}
                    />
                  </AdvancedMarker>
                );
              }

              const { place } = entry;
              const isSelected = selection?.source === 'google' && selection.id === place.id;
              return (
                <AdvancedMarker
                  key={entry.key}
                  position={{ lat: place.lat, lng: place.lng }}
                  title={place.displayName}
                  zIndex={isSelected ? 1000 : 10}
                  onClick={() => handleSelectEntry({ source: 'google', id: place.id })}
                >
                  <Pin
                    background={isSelected ? '#c8a45d' : '#1e4d3b'}
                    borderColor="#ffffff"
                    glyphColor={isSelected ? '#14110e' : '#f5ecd8'}
                    scale={isSelected ? 1.2 : 0.95}
                  />
                </AdvancedMarker>
              );
            })}
          </Map>
        ) : (
          <div className="w-full h-full flex items-center justify-center p-8 text-center">
            <div className="max-w-sm">
              <MapPin className="w-8 h-8 text-[#9e7728] mx-auto mb-2" />
              <p className="text-sm font-medium text-[#181512]">
                Loading Google Maps...
              </p>
              <p className="mt-1 text-xs text-[#686053]">
                Verify your Google Maps API key configuration if the map does not appear.
              </p>
            </div>
          </div>
        )}

        {/* Selected Provider OR Google Maps Place Sheet */}
        {selectedEntry && selectedCoords && (
          <div className="absolute bottom-3 left-3 right-3 lg:top-4 lg:bottom-4 lg:left-auto lg:right-4 lg:w-[460px] max-h-[82vh] lg:max-h-none bg-[#fcfaf5] border border-[#dfd4bd] rounded-xl shadow-2xl overflow-hidden z-20 flex flex-col">
            {/* Photo Gallery Header */}
            <div className="relative h-40 sm:h-44 bg-[#efe8d8] shrink-0 group">
              <button
                type="button"
                onClick={() => {
                  if (selectedGalleryPhotos.length > 0) setIsLightboxOpen(true);
                }}
                aria-label={`Preview ${selectedShopName} photos fullscreen`}
                className="block w-full h-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c8a45d]"
              >
                <SafeImage
                  src={selectedGalleryPhotos[safePhotoIdx]?.url || ''}
                  alt={`${selectedShopName} photo ${safePhotoIdx + 1}`}
                  fallbackLabel={selectedShopCategory}
                  className="w-full h-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectEntry(null)}
                aria-label="Close shop details"
                className="absolute top-2.5 right-2.5 p-1.5 bg-[#141210]/90 hover:bg-[#141210] text-[#f7f4ed] rounded-lg border border-[#3d3426] shadow-sm z-10"
              >
                <X className="w-4 h-4" />
              </button>

              {selectedGalleryPhotos.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePhotoIdx(
                        (safePhotoIdx - 1 + selectedGalleryPhotos.length) %
                          selectedGalleryPhotos.length
                      );
                    }}
                    aria-label="Previous photo"
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1.5 bg-black/55 hover:bg-black/75 text-white rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActivePhotoIdx((safePhotoIdx + 1) % selectedGalleryPhotos.length);
                    }}
                    aria-label="Next photo"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 bg-black/55 hover:bg-black/75 text-white rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              )}

              <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-end justify-between gap-2 pointer-events-none">
                {selectedGalleryPhotos.length > 1 ? (
                  <div className="flex items-center gap-1.5 pointer-events-auto overflow-x-auto max-w-[260px]">
                    {selectedGalleryPhotos.slice(0, 5).map((photo, idx) => (
                      <button
                        key={`${photo.url}-${idx}`}
                        type="button"
                        onClick={() => setActivePhotoIdx(idx)}
                        aria-label={`View photo ${idx + 1}`}
                        className={`w-10 h-7 rounded overflow-hidden border-2 transition-all shrink-0 ${
                          safePhotoIdx === idx
                            ? 'border-white shadow-md scale-105'
                            : 'border-white/60 opacity-80 hover:opacity-100'
                        }`}
                      >
                        <SafeImage
                          src={photo.url}
                          alt={`${selectedShopName} thumbnail ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                ) : (
                  <span />
                )}

                {selectedGalleryPhotos.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsLightboxOpen(true)}
                    className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-white bg-black/60 hover:bg-black/80 rounded-md transition-colors whitespace-nowrap tabular-nums shrink-0"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>
                      {safePhotoIdx + 1} / {selectedGalleryPhotos.length} · Preview
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* Required Photo Author Attribution for Google Place Photos */}
            {selectedGooglePlace && selectedGalleryPhotos[safePhotoIdx]?.attributionText && (
              <div className="px-4 py-1.5 bg-[#f5efe2] border-b border-[#e4dac4] text-[11px] text-[#686053] flex items-center justify-between gap-2 shrink-0">
                <span className="truncate">
                  Photo credit:{' '}
                  {selectedGalleryPhotos[safePhotoIdx].attributionUri ? (
                    <a
                      href={selectedGalleryPhotos[safePhotoIdx].attributionUri!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#181512] hover:underline font-medium"
                    >
                      {selectedGalleryPhotos[safePhotoIdx].attributionText}
                    </a>
                  ) : (
                    <span className="text-[#181512] font-medium">
                      {selectedGalleryPhotos[safePhotoIdx].attributionText}
                    </span>
                  )}
                </span>
                <span className="text-[#887e6e] shrink-0">Google Maps</span>
              </div>
            )}

            {/* Shop Summary & Tabs */}
            <div className="px-4 pt-3.5 pb-0 border-b border-[#e4dac4] shrink-0">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-serif text-lg font-semibold text-[#181512]">
                  {selectedShopName}
                </h2>
                {selectedRegisteredService ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1f6246] shrink-0 mt-0.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Aadhaar Verified</span>
                  </span>
                ) : (
                  <span className="text-xs font-medium text-[#686053] shrink-0 mt-0.5">
                    Google Maps Place
                  </span>
                )}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#686053]">
                <StarRatingDisplay
                  average={selectedEntry.ratingValue}
                  count={selectedEntry.ratingCount}
                />
                <span aria-hidden="true">·</span>
                <span>{selectedShopCategory}</span>
                {selectedDistanceKm !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums font-medium text-[#7d5c1c]">
                      {formatDistanceKm(selectedDistanceKm)} away
                    </span>
                  </>
                )}
              </div>

              <div className="mt-3 flex items-center gap-5 text-xs font-medium overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setDetailTab('catalog')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap tabular-nums ${
                    detailTab === 'catalog'
                      ? 'border-[#b08635] text-[#181512] font-semibold'
                      : 'border-transparent text-[#686053] hover:text-[#181512]'
                  }`}
                >
                  {selectedRegisteredService
                    ? `Shop Info & Menu (${selectedCatalog.length})`
                    : 'Shop Info & Hours'}
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('photos')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap tabular-nums ${
                    detailTab === 'photos'
                      ? 'border-[#b08635] text-[#181512] font-semibold'
                      : 'border-transparent text-[#686053] hover:text-[#181512]'
                  }`}
                >
                  Photos ({selectedGalleryPhotos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab('reviews')}
                  className={`pb-2 border-b-2 transition-colors whitespace-nowrap tabular-nums ${
                    detailTab === 'reviews'
                      ? 'border-[#b08635] text-[#181512] font-semibold'
                      : 'border-transparent text-[#686053] hover:text-[#181512]'
                  }`}
                >
                  Reviews ({selectedEntry.ratingCount})
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedRegisteredService ? (
                /* Registered NearCraft Provider Detail Body */
                detailTab === 'catalog' ? (
                  <>
                    <div className="space-y-2.5 text-xs">
                      <p className="text-[#363026] leading-relaxed">
                        {selectedRegisteredService.description}
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-[#574f43]">
                        <p className="flex items-center gap-1.5">
                          <Store className="w-3.5 h-3.5 text-[#8a7d68] shrink-0" />
                          <span>Owner: {selectedRegisteredService.ownerName}</span>
                        </p>
                        <p className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#8a7d68] shrink-0" />
                          <span>{selectedRegisteredService.openHours}</span>
                        </p>
                      </div>

                      <div className="p-3 bg-[#f5efe2] rounded-lg border border-[#e4dac4] space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs text-[#2f2920] flex items-start gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-[#7d5c1c] shrink-0 mt-0.5" />
                            <span>{selectedRegisteredService.address}</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => setCameraTrigger((prev) => prev + 1)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7d5c1c] hover:underline whitespace-nowrap shrink-0"
                          >
                            <LocateFixed className="w-3 h-3" />
                            <span>Center Pin</span>
                          </button>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px] text-[#686053]">
                          <span className="font-mono tabular-nums">
                            GPS: {selectedRegisteredService.lat.toFixed(5)},{' '}
                            {selectedRegisteredService.lng.toFixed(5)}
                          </span>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${selectedRegisteredService.lat},${selectedRegisteredService.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-semibold text-[#7d5c1c] hover:underline whitespace-nowrap"
                          >
                            <span>Navigate on Google Maps</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-semibold text-[#181512]">
                          All Products & Services ({selectedCatalog.length})
                        </p>
                        <span className="text-[11px] text-[#686053]">
                          Select items to pay via app or counter
                        </span>
                      </div>

                      <ul className="border border-[#e4dac4] bg-white rounded-lg divide-y divide-[#efe8d8]">
                        {selectedCatalog.map((item, idx) => {
                          const qty = selectedQuantities[idx] || 0;
                          return (
                            <li
                              key={`${item.name}-${idx}`}
                              className="px-3 py-2.5 flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0 flex items-start gap-2">
                                <span className="text-xs font-mono tabular-nums text-[#8a7d68] pt-0.5 shrink-0">
                                  #{idx + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-[#181512]">
                                    {item.name}
                                  </p>
                                  <p className="text-[11px] text-[#686053]">
                                    {item.itemType}
                                    {item.unit ? ` · ${item.unit}` : ''}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2.5 shrink-0">
                                <span className="text-xs font-mono tabular-nums font-semibold text-[#181512]">
                                  ₹{item.price}
                                </span>

                                {qty === 0 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAdjustItemQty(selectedRegisteredService.id, idx, 1)
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#f3ddb0] bg-[#181512] hover:bg-[#2a241d] rounded-md transition-colors"
                                  >
                                    <Plus className="w-3 h-3" />
                                    <span>Add</span>
                                  </button>
                                ) : (
                                  <div className="inline-flex items-center border border-[#d8cbb0] rounded-md bg-[#f5efe2]">
                                    <button
                                      type="button"
                                      aria-label={`Decrease quantity of ${item.name}`}
                                      onClick={() =>
                                        handleAdjustItemQty(selectedRegisteredService.id, idx, -1)
                                      }
                                      className="p-1 text-[#4a4236] hover:text-[#181512]"
                                    >
                                      <Minus className="w-3 h-3" />
                                    </button>
                                    <span className="px-2 text-xs font-mono tabular-nums font-semibold text-[#181512]">
                                      {qty}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label={`Increase quantity of ${item.name}`}
                                      onClick={() =>
                                        handleAdjustItemQty(selectedRegisteredService.id, idx, 1)
                                      }
                                      className="p-1 text-[#4a4236] hover:text-[#181512]"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {selectedGalleryPhotos.length > 0 && (
                      <div className="pt-1">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-semibold text-[#181512]">
                            Shop & Product Photos ({selectedGalleryPhotos.length})
                          </p>
                          <button
                            type="button"
                            onClick={() => setDetailTab('photos')}
                            className="text-[11px] font-semibold text-[#7d5c1c] hover:underline whitespace-nowrap"
                          >
                            Open Gallery
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {selectedGalleryPhotos.map((photo, idx) => (
                            <button
                              key={`${photo.url}-strip-${idx}`}
                              type="button"
                              onClick={() => {
                                setActivePhotoIdx(idx);
                                setIsLightboxOpen(true);
                              }}
                              aria-label={`Preview shop photo ${idx + 1}`}
                              className={`group relative aspect-[4/3] rounded-lg overflow-hidden border transition-all ${
                                safePhotoIdx === idx
                                  ? 'border-[#b08635] ring-2 ring-[#c8a45d]/30'
                                  : 'border-[#e3d9c3] hover:border-[#b9a98b]'
                              }`}
                            >
                              <SafeImage
                                src={photo.url}
                                alt={`${selectedShopName} preview ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-white bg-black/60 rounded">
                                {idx + 1}/{selectedGalleryPhotos.length}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : detailTab === 'photos' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-[#574f43]">
                        Uploaded by {selectedRegisteredService.ownerName} for{' '}
                        {selectedRegisteredService.shopName}
                      </p>
                      <span className="text-xs font-mono tabular-nums text-[#686053]">
                        {selectedGalleryPhotos.length}{' '}
                        {selectedGalleryPhotos.length === 1 ? 'photo' : 'photos'}
                      </span>
                    </div>

                    {selectedGalleryPhotos.length === 0 ? (
                      <div className="py-10 text-center border border-[#e4dac4] rounded-lg bg-[#f5efe2]">
                        <Images className="w-7 h-7 text-[#b8a98e] mx-auto mb-2" />
                        <p className="text-xs font-medium text-[#3a3329]">
                          No photos uploaded yet
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2.5">
                        {selectedGalleryPhotos.map((photo, idx) => (
                          <button
                            key={`${photo.url}-gallery-${idx}`}
                            type="button"
                            onClick={() => {
                              setActivePhotoIdx(idx);
                              setIsLightboxOpen(true);
                            }}
                            aria-label={`Open photo ${idx + 1} in fullscreen`}
                            className={`group relative aspect-[4/3] rounded-lg overflow-hidden border bg-[#efe8d8] text-left transition-all ${
                              safePhotoIdx === idx
                                ? 'border-[#b08635] ring-2 ring-[#c8a45d]/30'
                                : 'border-[#e3d9c3] hover:border-[#b9a98b]'
                            }`}
                          >
                            <SafeImage
                              src={photo.url}
                              alt={`${selectedShopName} gallery photo ${idx + 1}`}
                              fallbackLabel={selectedShopCategory}
                              className="w-full h-full object-cover"
                            />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between text-white">
                              <span className="text-[11px] font-medium tabular-nums">
                                Photo {idx + 1}
                              </span>
                              <Maximize2 className="w-3.5 h-3.5 opacity-80 group-hover:opacity-100" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <ProviderReviewsList providerId={selectedRegisteredService.id} />
                )
              ) : selectedGooglePlace ? (
                /* Live Google Maps Place Detail Body */
                detailTab === 'catalog' ? (
                  <div className="space-y-4 text-xs">
                    {selectedGooglePlace.editorialSummary && (
                      <p className="text-[#363026] leading-relaxed">
                        {selectedGooglePlace.editorialSummary}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#574f43]">
                      {formatBusinessStatusLabel(selectedGooglePlace.businessStatus) && (
                        <span className="font-medium text-[#181512]">
                          {formatBusinessStatusLabel(selectedGooglePlace.businessStatus)}
                        </span>
                      )}
                      {formatPriceLevelLabel(selectedGooglePlace.priceLevel) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            Pricing: {formatPriceLevelLabel(selectedGooglePlace.priceLevel)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Exact Shop Location & Reach Links */}
                    <div className="p-3 bg-[#f5efe2] rounded-lg border border-[#e4dac4] space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-[#2f2920] flex items-start gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-[#7d5c1c] shrink-0 mt-0.5" />
                          <span>{selectedGooglePlace.formattedAddress}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => setCameraTrigger((prev) => prev + 1)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#7d5c1c] hover:underline whitespace-nowrap shrink-0"
                        >
                          <LocateFixed className="w-3 h-3" />
                          <span>Center Pin</span>
                        </button>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-[#686053]">
                        <span className="font-mono tabular-nums">
                          GPS: {selectedGooglePlace.lat.toFixed(5)},{' '}
                          {selectedGooglePlace.lng.toFixed(5)}
                        </span>
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${selectedGooglePlace.lat},${selectedGooglePlace.lng}&destination_place_id=${encodeURIComponent(selectedGooglePlace.id)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-[#7d5c1c] hover:underline whitespace-nowrap"
                        >
                          <span>Navigate on Google Maps</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    {/* Contact Links & Opening Hours */}
                    {isLoadingPlaceDetail && !selectedGooglePlace.detailsLoaded ? (
                      <div className="p-3 border border-[#e4dac4] bg-white rounded-lg text-[#686053] flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#9e7728] shrink-0" />
                        <span>Loading hours, contact details, and customer reviews...</span>
                      </div>
                    ) : (
                      <>
                        {(selectedGooglePlace.nationalPhoneNumber ||
                          selectedGooglePlace.websiteURI ||
                          selectedGooglePlace.googleMapsURI) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {selectedGooglePlace.nationalPhoneNumber && (
                              <a
                                href={`tel:${selectedGooglePlace.internationalPhoneNumber || selectedGooglePlace.nationalPhoneNumber}`}
                                className="flex items-center gap-2 p-2.5 rounded-lg border border-[#e4dac4] bg-white hover:bg-[#f5efe2] text-[#2f2920] transition-colors"
                              >
                                <Phone className="w-3.5 h-3.5 text-[#7d5c1c] shrink-0" />
                                <span className="truncate font-mono tabular-nums">
                                  {selectedGooglePlace.nationalPhoneNumber}
                                </span>
                              </a>
                            )}
                            {selectedGooglePlace.websiteURI && (
                              <a
                                href={selectedGooglePlace.websiteURI}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2.5 rounded-lg border border-[#e4dac4] bg-white hover:bg-[#f5efe2] text-[#2f2920] transition-colors"
                              >
                                <Globe className="w-3.5 h-3.5 text-[#7d5c1c] shrink-0" />
                                <span className="truncate">Official Website</span>
                              </a>
                            )}
                          </div>
                        )}

                        {selectedGooglePlace.weekdayDescriptions.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold text-[#181512] mb-2">
                              Opening Hours
                            </p>
                            <ul className="border border-[#e4dac4] bg-white rounded-lg divide-y divide-[#efe8d8]">
                              {selectedGooglePlace.weekdayDescriptions.map((line) => (
                                <li
                                  key={line}
                                  className="px-3 py-2 text-xs text-[#363026] tabular-nums"
                                >
                                  {line}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}

                    {/* Quick Photo Strip for Google Place */}
                    {selectedGalleryPhotos.length > 0 && (
                      <div className="pt-1">
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-xs font-semibold text-[#181512]">
                            Place Photos ({selectedGalleryPhotos.length})
                          </p>
                          <button
                            type="button"
                            onClick={() => setDetailTab('photos')}
                            className="text-[11px] font-semibold text-[#7d5c1c] hover:underline whitespace-nowrap"
                          >
                            Open Gallery
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {selectedGalleryPhotos.slice(0, 6).map((photo, idx) => (
                            <button
                              key={`${photo.url}-gstrip-${idx}`}
                              type="button"
                              onClick={() => {
                                setActivePhotoIdx(idx);
                                setIsLightboxOpen(true);
                              }}
                              aria-label={`Preview Google place photo ${idx + 1}`}
                              className={`relative aspect-[4/3] rounded-lg overflow-hidden border transition-all ${
                                safePhotoIdx === idx
                                  ? 'border-[#b08635] ring-2 ring-[#c8a45d]/30'
                                  : 'border-[#e3d9c3] hover:border-[#b9a98b]'
                              }`}
                            >
                              <SafeImage
                                src={photo.url}
                                alt={`${selectedShopName} preview ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-white bg-black/60 rounded">
                                {idx + 1}/{selectedGalleryPhotos.length}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedGooglePlace.attributions.length > 0 && (
                      <div className="text-[11px] text-[#686053] pt-1">
                        <span>Data attribution: </span>
                        {selectedGooglePlace.attributions.map((attr, idx) => (
                          <React.Fragment key={`${attr.provider}-${idx}`}>
                            {idx > 0 && <span>, </span>}
                            {attr.providerURI ? (
                              <a
                                href={attr.providerURI}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-[#181512]"
                              >
                                {attr.provider}
                              </a>
                            ) : (
                              <span>{attr.provider}</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                    )}

                    <div className="p-3 rounded-lg border border-[#e4dac4] bg-[#f5efe2] text-[11px] text-[#574f43] leading-relaxed">
                      Public business listing sourced live from Google Maps. Shops that register on
                      NearCraft unlock itemized service menus, direct scheduling chat, and digital
                      counter/in-app billing.
                    </div>
                  </div>
                ) : detailTab === 'photos' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-[#574f43]">
                        Google Maps photos for {selectedGooglePlace.displayName}
                      </p>
                      <span className="text-xs font-mono tabular-nums text-[#686053]">
                        {selectedGalleryPhotos.length}{' '}
                        {selectedGalleryPhotos.length === 1 ? 'photo' : 'photos'}
                      </span>
                    </div>

                    {selectedGalleryPhotos.length === 0 ? (
                      <div className="py-10 text-center border border-[#e4dac4] rounded-lg bg-[#f5efe2]">
                        <Images className="w-7 h-7 text-[#b8a98e] mx-auto mb-2" />
                        <p className="text-xs font-medium text-[#3a3329]">
                          No Google Maps photos available for this place
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2.5">
                        {selectedGalleryPhotos.map((photo, idx) => (
                          <div key={`${photo.url}-ggallery-${idx}`} className="space-y-1">
                            <button
                              type="button"
                              onClick={() => {
                                setActivePhotoIdx(idx);
                                setIsLightboxOpen(true);
                              }}
                              aria-label={`Open photo ${idx + 1} in fullscreen`}
                              className={`group relative w-full aspect-[4/3] rounded-lg overflow-hidden border bg-[#efe8d8] text-left transition-all ${
                                safePhotoIdx === idx
                                  ? 'border-[#b08635] ring-2 ring-[#c8a45d]/30'
                                  : 'border-[#e3d9c3] hover:border-[#b9a98b]'
                              }`}
                            >
                              <SafeImage
                                src={photo.url}
                                alt={`${selectedShopName} photo ${idx + 1}`}
                                fallbackLabel={selectedShopCategory}
                                className="w-full h-full object-cover"
                              />
                              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent flex items-center justify-between text-white">
                                <span className="text-[11px] font-medium tabular-nums">
                                  Photo {idx + 1}
                                </span>
                                <Maximize2 className="w-3.5 h-3.5 opacity-80 group-hover:opacity-100" />
                              </div>
                            </button>
                            {photo.attributionText && (
                              <p className="text-[10px] text-[#686053] truncate px-0.5">
                                By{' '}
                                {photo.attributionUri ? (
                                  <a
                                    href={photo.attributionUri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:underline text-[#181512]"
                                  >
                                    {photo.attributionText}
                                  </a>
                                ) : (
                                  photo.attributionText
                                )}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Google Maps Customer Reviews Tab */
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#e4dac4]">
                      <StarRatingDisplay
                        average={selectedGooglePlace.rating}
                        count={selectedGooglePlace.userRatingCount}
                      />
                      {selectedGooglePlace.googleMapsURI && (
                        <a
                          href={selectedGooglePlace.googleMapsURI}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#7d5c1c] hover:underline whitespace-nowrap"
                        >
                          <span>View on Google Maps</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {isLoadingPlaceDetail && !selectedGooglePlace.detailsLoaded ? (
                      <div className="py-6 flex items-center justify-center gap-2 text-xs text-[#686053]">
                        <RefreshCw className="w-4 h-4 animate-spin text-[#9e7728]" />
                        <span>Loading customer reviews...</span>
                      </div>
                    ) : selectedGooglePlace.reviews.length === 0 ? (
                      <p className="py-6 text-center text-xs text-[#686053]">
                        No detailed Google Maps review snippets returned for this listing.
                      </p>
                    ) : (
                      <ul className="divide-y divide-[#efe8d8]">
                        {selectedGooglePlace.reviews.map((rev, idx) => (
                          <li key={`${rev.authorName}-${idx}`} className="py-3 space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 flex items-center gap-2">
                                {rev.authorUri ? (
                                  <a
                                    href={rev.authorUri}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs font-semibold text-[#181512] hover:text-[#7d5c1c] hover:underline truncate"
                                  >
                                    {rev.authorName}
                                  </a>
                                ) : (
                                  <span className="text-xs font-semibold text-[#181512] truncate">
                                    {rev.authorName}
                                  </span>
                                )}
                              </div>
                              {rev.relativeTime && (
                                <span className="text-[11px] text-[#8a7d68] shrink-0 tabular-nums">
                                  {rev.relativeTime}
                                </span>
                              )}
                            </div>

                            {rev.rating !== null && (
                              <div className="flex items-center gap-1 text-xs text-[#2f2920]">
                                <Star className="w-3.5 h-3.5 text-[#b8892c] fill-[#c8a45d]" />
                                <span className="font-semibold tabular-nums">
                                  {rev.rating.toFixed(1)}
                                </span>
                              </div>
                            )}

                            {rev.text && (
                              <p className="text-xs text-[#363026] leading-relaxed">
                                {rev.text}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              ) : null}
            </div>

            {/* Sticky Bottom Actions */}
            {selectedRegisteredService ? (
              <div className="px-4 py-3 border-t border-[#e4dac4] bg-[#f5efe2] shrink-0 space-y-2">
                {selectedBillItems.length > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs">
                      <span className="font-semibold text-[#181512] font-mono tabular-nums">
                        {selectedOrderTotals.count}{' '}
                        {selectedOrderTotals.count === 1 ? 'item' : 'items'}
                      </span>
                      <span className="text-[#8a7d68] mx-1.5">·</span>
                      <span className="font-bold text-[#181512] font-mono tabular-nums">
                        ₹{selectedOrderTotals.amount.toFixed(0)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onStartCheckout(selectedRegisteredService, selectedBillItems)
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#c8a45d] hover:bg-[#d8b66f] text-[#14110e] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      <span>Order & View Bill</span>
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenChat(selectedRegisteredService)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                      selectedBillItems.length > 0
                        ? 'bg-white border border-[#dfd4bd] text-[#2f2920] hover:bg-[#efe8d8]'
                        : 'bg-[#181512] hover:bg-[#2a241d] text-[#f7f4ed]'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Schedule & Chat</span>
                  </button>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${selectedRegisteredService.lat},${selectedRegisteredService.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#2f2920] bg-white border border-[#dfd4bd] hover:bg-[#efe8d8] rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Directions</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ) : selectedGooglePlace ? (
              <div className="px-4 py-3 border-t border-[#e4dac4] bg-[#f5efe2] shrink-0 flex items-center gap-2">
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${selectedGooglePlace.lat},${selectedGooglePlace.lng}&destination_place_id=${encodeURIComponent(selectedGooglePlace.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#181512] hover:bg-[#2a241d] text-[#f7f4ed] text-xs font-semibold rounded-lg transition-colors whitespace-nowrap"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#d8b66f]" />
                  <span>Navigate on Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                {selectedGooglePlace.nationalPhoneNumber ? (
                  <a
                    href={`tel:${selectedGooglePlace.internationalPhoneNumber || selectedGooglePlace.nationalPhoneNumber}`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#2f2920] bg-white border border-[#dfd4bd] hover:bg-[#efe8d8] rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call</span>
                  </a>
                ) : selectedGooglePlace.googleMapsURI ? (
                  <a
                    href={selectedGooglePlace.googleMapsURI}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#2f2920] bg-white border border-[#dfd4bd] hover:bg-[#efe8d8] rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Maps Page</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

        {/* Fullscreen Photo Lightbox Modal */}
        {selectedEntry && isLightboxOpen && selectedGalleryPhotos.length > 0 && (
          <div
            className="fixed inset-0 z-50 bg-[#0b0c0e]/95 backdrop-blur-[2px] flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedShopName} photo gallery`}
            onClick={() => setIsLightboxOpen(false)}
          >
            <div
              className="px-6 py-4 flex items-center justify-between gap-4 border-b border-white/10 text-[#f7f4ed] shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-w-0">
                <h3 className="font-serif text-base sm:text-lg font-semibold truncate">
                  {selectedShopName}
                </h3>
                <p className="text-xs text-[#d8b66f] font-mono tabular-nums mt-0.5">
                  {selectedShopCategory} · Photo {safePhotoIdx + 1} of{' '}
                  {selectedGalleryPhotos.length}
                  {selectedGalleryPhotos[safePhotoIdx]?.attributionText
                    ? ` · Photo by ${selectedGalleryPhotos[safePhotoIdx].attributionText}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLightboxOpen(false)}
                aria-label="Close photo preview"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <X className="w-4 h-4" />
                <span>Close</span>
              </button>
            </div>

            <div
              className="relative flex-1 flex items-center justify-center p-4 sm:p-8 min-h-0"
              onClick={(e) => e.stopPropagation()}
            >
              {selectedGalleryPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setActivePhotoIdx(
                      (safePhotoIdx - 1 + selectedGalleryPhotos.length) %
                        selectedGalleryPhotos.length
                    )
                  }
                  aria-label="Previous photo"
                  className="absolute left-3 sm:left-6 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors z-10"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}

              <div className="w-full max-w-4xl max-h-[72vh] aspect-[4/3] rounded-xl overflow-hidden bg-[#141210] border border-white/10 flex items-center justify-center">
                <SafeImage
                  src={selectedGalleryPhotos[safePhotoIdx].url}
                  alt={`${selectedShopName} photo ${safePhotoIdx + 1}`}
                  fallbackLabel={selectedShopCategory}
                  className="w-full h-full object-contain"
                />
              </div>

              {selectedGalleryPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setActivePhotoIdx((safePhotoIdx + 1) % selectedGalleryPhotos.length)
                  }
                  aria-label="Next photo"
                  className="absolute right-3 sm:right-6 p-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors z-10"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}
            </div>

            {selectedGalleryPhotos.length > 1 && (
              <div
                className="px-6 pb-5 pt-2 flex items-center justify-center gap-2.5 overflow-x-auto shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {selectedGalleryPhotos.map((photo, idx) => (
                  <button
                    key={`${photo.url}-lightbox-${idx}`}
                    type="button"
                    onClick={() => setActivePhotoIdx(idx)}
                    aria-label={`Select photo ${idx + 1}`}
                    className={`w-16 h-12 rounded-lg overflow-hidden border-2 transition-all shrink-0 ${
                      safePhotoIdx === idx
                        ? 'border-[#d8b66f] scale-105 shadow-lg'
                        : 'border-white/25 opacity-65 hover:opacity-100'
                    }`}
                  >
                    <SafeImage
                      src={photo.url}
                      alt={`${selectedShopName} thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
