/// <reference types="google.maps" />
import { LatLngPoint, ServiceCategory } from '../types';

export interface PlaceAuthorAttribution {
  displayName: string;
  uri: string | null;
  photoURI: string | null;
}

export interface GooglePlacePhotoItem {
  url: string;
  attributions: PlaceAuthorAttribution[];
}

export interface GooglePlaceReviewItem {
  rating: number | null;
  text: string;
  relativeTime: string;
  authorName: string;
  authorUri: string | null;
  authorPhotoUri: string | null;
}

export interface GoogleMapPlaceItem {
  id: string;
  placeRef: google.maps.places.Place;
  displayName: string;
  formattedAddress: string;
  shortAddress: string;
  lat: number;
  lng: number;
  primaryType: string | null;
  primaryTypeLabel: string;
  types: string[];
  rating: number | null;
  userRatingCount: number;
  businessStatus: string | null;
  priceLevel: string | null;
  googleMapsURI: string | null;
  photos: GooglePlacePhotoItem[];
  detailsLoaded: boolean;
  editorialSummary: string | null;
  nationalPhoneNumber: string | null;
  internationalPhoneNumber: string | null;
  websiteURI: string | null;
  weekdayDescriptions: string[];
  reviews: GooglePlaceReviewItem[];
  attributions: { provider: string; providerURI: string | null }[];
}

const CATEGORY_INCLUDED_TYPES: Record<'All' | ServiceCategory, string[]> = {
  All: [
    'cafe',
    'coffee_shop',
    'restaurant',
    'barber_shop',
    'hair_salon',
    'beauty_salon',
    'spa',
    'car_repair',
    'tailor',
    'gym',
    'electrician',
    'plumber',
    'store',
    'casino',
  ],
  'Cafe & Dining': ['cafe', 'coffee_shop', 'restaurant', 'bakery', 'tea_house'],
  'Barber & Salon': ['barber_shop', 'hair_salon'],
  'Beauty & Spa': ['beauty_salon', 'spa', 'nail_salon', 'massage'],
  'Home Repairs': ['electrician', 'plumber', 'painter', 'locksmith', 'home_improvement_store'],
  'Auto & Bike': ['car_repair', 'car_wash', 'tire_shop', 'bicycle_store'],
  Tailoring: ['tailor', 'laundry', 'clothing_store'],
  'Wellness & Fitness': ['wellness_center', 'yoga_studio', 'gym', 'fitness_center', 'massage'],
  Tutoring: ['educational_institution', 'school', 'library'],
  Other: ['store', 'casino', 'consultant', 'pet_care', 'electronics_store', 'jewelry_store'],
};

const CATEGORY_TEXT_HINT: Record<ServiceCategory, string> = {
  'Cafe & Dining': 'cafe',
  'Barber & Salon': 'barber salon',
  'Beauty & Spa': 'beauty spa',
  'Home Repairs': 'repair service',
  'Auto & Bike': 'auto bike repair',
  Tailoring: 'tailor laundry',
  'Wellness & Fitness': 'wellness gym',
  Tutoring: 'tutoring coaching center',
  Other: 'shop service',
};

const LIST_SEARCH_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'shortFormattedAddress',
  'location',
  'primaryType',
  'primaryTypeDisplayName',
  'types',
  'rating',
  'userRatingCount',
  'photos',
  'googleMapsURI',
  'businessStatus',
  'priceLevel',
];

const DETAIL_FETCH_FIELDS = [
  'editorialSummary',
  'regularOpeningHours',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteURI',
  'googleMapsURI',
  'photos',
  'reviews',
];

export function isQuotaExhaustedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('QuotaExceededError') ||
    msg.includes('429')
  );
}

export function formatPrimaryTypeLabel(
  primaryTypeDisplayName?: string | null,
  primaryType?: string | null
): string {
  if (primaryTypeDisplayName && primaryTypeDisplayName.trim()) {
    return primaryTypeDisplayName.trim();
  }
  if (!primaryType) return 'Local Service';
  return primaryType
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function formatPriceLevelLabel(priceLevel: string | null | undefined): string | null {
  if (!priceLevel) return null;
  switch (priceLevel) {
    case 'Free':
    case 'PRICE_LEVEL_FREE':
      return 'Free';
    case 'Inexpensive':
    case 'PRICE_LEVEL_INEXPENSIVE':
      return 'Budget-friendly';
    case 'Moderate':
    case 'PRICE_LEVEL_MODERATE':
      return 'Moderate';
    case 'Expensive':
    case 'PRICE_LEVEL_EXPENSIVE':
      return 'Upscale';
    case 'Very Expensive':
    case 'PRICE_LEVEL_VERY_EXPENSIVE':
      return 'Luxury';
    default:
      return null;
  }
}

export function formatBusinessStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  switch (status) {
    case 'OPERATIONAL':
      return 'Open for service';
    case 'CLOSED_TEMPORARILY':
      return 'Temporarily closed';
    case 'CLOSED_PERMANENTLY':
      return 'Permanently closed';
    default:
      return null;
  }
}

function extractPlacePhotos(place: google.maps.places.Place): GooglePlacePhotoItem[] {
  const photos = place.photos ?? [];
  const list: GooglePlacePhotoItem[] = [];
  for (const photo of photos.slice(0, 8)) {
    try {
      const url = photo.getURI({ maxWidth: 900 });
      if (!url) continue;
      const attributions: PlaceAuthorAttribution[] = (photo.authorAttributions ?? []).map(
        (attr) => ({
          displayName: attr.displayName || 'Google Maps Contributor',
          uri: attr.uri ?? null,
          photoURI: attr.photoURI ?? null,
        })
      );
      list.push({ url, attributions });
    } catch {
      // Ignore photo if URI generation fails
    }
  }
  return list;
}

export function normalizeGooglePlace(place: google.maps.places.Place): GoogleMapPlaceItem | null {
  const loc = place.location;
  if (!loc || !place.id) return null;

  const lat = typeof loc.lat === 'function' ? loc.lat() : Number(loc.lat);
  const lng = typeof loc.lng === 'function' ? loc.lng() : Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    id: place.id,
    placeRef: place,
    displayName: place.displayName || 'Google Maps Place',
    formattedAddress:
      place.formattedAddress || place.shortFormattedAddress || 'Address available on Google Maps',
    shortAddress:
      place.shortFormattedAddress || place.formattedAddress || 'Address available on Google Maps',
    lat,
    lng,
    primaryType: place.primaryType ?? null,
    primaryTypeLabel: formatPrimaryTypeLabel(place.primaryTypeDisplayName, place.primaryType),
    types: place.types ?? [],
    rating: typeof place.rating === 'number' ? Number(place.rating.toFixed(1)) : null,
    userRatingCount: typeof place.userRatingCount === 'number' ? place.userRatingCount : 0,
    businessStatus: place.businessStatus ?? null,
    priceLevel: place.priceLevel ?? null,
    googleMapsURI: place.googleMapsURI ?? null,
    photos: extractPlacePhotos(place),
    detailsLoaded: false,
    editorialSummary: place.editorialSummary ?? null,
    nationalPhoneNumber: place.nationalPhoneNumber ?? null,
    internationalPhoneNumber: place.internationalPhoneNumber ?? null,
    websiteURI: place.websiteURI ?? null,
    weekdayDescriptions: place.regularOpeningHours?.weekdayDescriptions ?? [],
    reviews: [],
    attributions: (place.attributions ?? []).map((a) => ({
      provider: a.provider || 'Google Maps',
      providerURI: a.providerURI ?? null,
    })),
  };
}

export async function discoverGooglePlaces(params: {
  placesLib: google.maps.PlacesLibrary;
  center: LatLngPoint;
  category: 'All' | ServiceCategory;
  searchText: string;
  radiusKm: number | null;
}): Promise<GoogleMapPlaceItem[]> {
  const { placesLib, center, category, searchText, radiusKm } = params;
  const { Place, SearchNearbyRankPreference } = placesLib;
  const trimmedSearch = searchText.trim();
  const clampedRadiusMeters = Math.min(Math.max((radiusKm ?? 6) * 1000, 1000), 50000);

  if (trimmedSearch.length >= 2) {
    const queryWithCategory =
      category !== 'All'
        ? `${trimmedSearch} ${CATEGORY_TEXT_HINT[category]}`
        : trimmedSearch;

    const response = await Place.searchByText({
      textQuery: queryWithCategory,
      fields: LIST_SEARCH_FIELDS,
      locationBias: {
        center,
        radius: clampedRadiusMeters,
      },
      maxResultCount: 16,
      language: 'en',
      internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
    });

    return (response?.places ?? [])
      .map(normalizeGooglePlace)
      .filter((item): item is GoogleMapPlaceItem => item !== null);
  }

  const includedTypes = CATEGORY_INCLUDED_TYPES[category] ?? CATEGORY_INCLUDED_TYPES.All;
  const response = await Place.searchNearby({
    fields: LIST_SEARCH_FIELDS,
    locationRestriction: {
      center,
      radius: clampedRadiusMeters,
    },
    includedTypes,
    maxResultCount: 20,
    rankPreference: SearchNearbyRankPreference.POPULARITY,
    language: 'en',
    internalUsageAttributionIds: ['gmp_mcp_codeassist_v1_aistudio'],
  });

  return (response?.places ?? [])
    .map(normalizeGooglePlace)
    .filter((item): item is GoogleMapPlaceItem => item !== null);
}

export async function fetchGooglePlaceDetails(
  item: GoogleMapPlaceItem
): Promise<GoogleMapPlaceItem> {
  const { placeRef } = item;
  await placeRef.fetchFields({
    fields: DETAIL_FETCH_FIELDS,
  });

  const reviews: GooglePlaceReviewItem[] = (placeRef.reviews ?? []).map((rev) => ({
    rating: typeof rev.rating === 'number' ? rev.rating : null,
    text: rev.text || '',
    relativeTime: rev.relativePublishTimeDescription || '',
    authorName: rev.authorAttribution?.displayName || 'Google Reviewer',
    authorUri: rev.authorAttribution?.uri ?? null,
    authorPhotoUri: rev.authorAttribution?.photoURI ?? null,
  }));

  const refreshedPhotos = extractPlacePhotos(placeRef);

  return {
    ...item,
    googleMapsURI: placeRef.googleMapsURI ?? item.googleMapsURI,
    photos: refreshedPhotos.length > 0 ? refreshedPhotos : item.photos,
    detailsLoaded: true,
    editorialSummary: placeRef.editorialSummary ?? null,
    nationalPhoneNumber: placeRef.nationalPhoneNumber ?? null,
    internationalPhoneNumber: placeRef.internationalPhoneNumber ?? null,
    websiteURI: placeRef.websiteURI ?? null,
    weekdayDescriptions: placeRef.regularOpeningHours?.weekdayDescriptions ?? [],
    reviews,
    attributions: (placeRef.attributions ?? []).map((a) => ({
      provider: a.provider || 'Google Maps',
      providerURI: a.providerURI ?? null,
    })),
  };
}
