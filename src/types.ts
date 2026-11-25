export type UserRole = 'seeker' | 'provider';

export const SERVICE_CATEGORIES = [
  'Cafe & Dining',
  'Barber & Salon',
  'Beauty & Spa',
  'Home Repairs',
  'Auto & Bike',
  'Tailoring',
  'Wellness & Fitness',
  'Tutoring',
  'Other',
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const VALIDATION_LIMITS = {
  DISPLAY_NAME_MAX: 80,
  SHOP_NAME_MIN: 2,
  SHOP_NAME_MAX: 100,
  DESCRIPTION_MIN: 5,
  DESCRIPTION_MAX: 600,
  ADDRESS_MIN: 3,
  ADDRESS_MAX: 240,
  OPEN_HOURS_MIN: 2,
  OPEN_HOURS_MAX: 80,
  SERVICE_ITEM_MAX: 100,
  ITEM_TYPE_MAX: 40,
  ITEM_UNIT_MAX: 40,
  SERVICES_MAX_COUNT: 20,
  CATALOG_MAX_COUNT: 20,
  PHOTOS_MAX_COUNT: 3,
  CHAT_MESSAGE_MAX: 1000,
  APPT_NOTES_MAX: 300,
  BILL_NOTES_MAX: 300,
  REVIEW_COMMENT_MIN: 3,
  REVIEW_COMMENT_MAX: 600,
  AADHAAR_REGEX: /^\d{12}$/,
} as const;

export const STUDIO_GALLERY_PRESETS: { label: string; category: ServiceCategory; url: string }[] = [
  {
    label: 'Neighborhood Cafe & Hot Soup',
    category: 'Cafe & Dining',
    url: '/src/assets/images/category_cafe_soup_1795622933416.jpg',
  },
  {
    label: 'Modern Barbershop Interior',
    category: 'Barber & Salon',
    url: '/src/assets/images/hero_barber_craft_1795619756867.jpg',
  },
  {
    label: 'Haircut & Grooming Station',
    category: 'Barber & Salon',
    url: '/src/assets/images/category_salon_cut_1795619757806.jpg',
  },
  {
    label: 'Wellness & Spa Suite',
    category: 'Beauty & Spa',
    url: '/src/assets/images/category_wellness_spa_1795619759050.jpg',
  },
  {
    label: 'Workshop & Repair Bench',
    category: 'Home Repairs',
    url: '/src/assets/images/category_home_repair_1795619757431.jpg',
  },
];

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  role: UserRole;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ProviderKyc {
  ownerId: string;
  aadhaarNumber: string;
  aadhaarLast4: string;
  fullNameOnCard: string;
  aadhaarDocUrl: string;
  verifiedAt?: unknown;
  updatedAt?: unknown;
}

export interface CatalogItem {
  name: string;
  itemType: string;
  unit: string;
  price: number;
}

export interface ServiceListing {
  id: string;
  ownerId: string;
  ownerName: string;
  shopName: string;
  category: ServiceCategory;
  description: string;
  address: string;
  lat: number;
  lng: number;
  openHours: string;
  servicesOffered: string[];
  catalogItems?: CatalogItem[];
  photoUrls: string[];
  aadhaarVerified: boolean;
  isActive: boolean;
  ratingSum?: number;
  ratingCount?: number;
  lastReviewedAppointmentId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export function getServiceCatalogItems(
  service: Pick<ServiceListing, 'catalogItems' | 'servicesOffered' | 'category'>
): CatalogItem[] {
  if (Array.isArray(service.catalogItems) && service.catalogItems.length > 0) {
    return service.catalogItems;
  }
  return (service.servicesOffered || []).map((raw) => {
    const priceMatch = raw.match(/(?:₹|Rs\.?|INR)\s*([0-9]+(?:\.[0-9]+)?)/i);
    const parsedPrice = priceMatch ? Number(priceMatch[1]) : 0;
    const typeMatch = raw.match(/\(([^)]+)\)/);
    const cleanedName = raw
      .replace(/(?:₹|Rs\.?|INR)\s*[0-9]+(?:\.[0-9]+)?/i, '')
      .replace(/\([^)]+\)/g, '')
      .replace(/[·\-–]+$/g, '')
      .replace(/\s+·\s+/g, ' ')
      .trim();

    return {
      name: (cleanedName || raw).slice(0, VALIDATION_LIMITS.SERVICE_ITEM_MAX),
      itemType: (typeMatch?.[1] || service.category || 'Service').slice(0, VALIDATION_LIMITS.ITEM_TYPE_MAX),
      unit: '1 unit',
      price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
    };
  });
}

export interface ServiceReview {
  id: string;
  appointmentId: string;
  providerId: string;
  seekerId: string;
  reviewerName: string;
  serviceItem: string;
  rating: number;
  comment: string;
  isPublished: boolean;
  createdAt?: unknown;
}

export function getAverageRating(service: Pick<ServiceListing, 'ratingSum' | 'ratingCount'>): number | null {
  const count = service.ratingCount ?? 0;
  const sum = service.ratingSum ?? 0;
  if (count <= 0) return null;
  return Number((sum / count).toFixed(1));
}

export interface ChatThread {
  id: string;
  seekerId: string;
  seekerName: string;
  providerId: string;
  shopName: string;
  lastMessage: string;
  lastMessageAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type ChatMessageType = 'text' | 'appointment_request' | 'appointment_update';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  seekerId: string;
  providerId: string;
  type: ChatMessageType;
  text: string;
  appointmentId?: string;
  createdAt?: unknown;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'completed';

export interface Appointment {
  id: string;
  seekerId: string;
  seekerName: string;
  providerId: string;
  shopName: string;
  chatId: string;
  serviceItem: string;
  scheduledDate: string;
  scheduledTime: string;
  notes: string;
  status: AppointmentStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BillLineItem {
  name: string;
  itemType: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export type BillPaymentMethod = 'in_app' | 'counter';
export type BillPaymentStatus = 'paid' | 'pending_counter';

export interface ServiceBill {
  id: string;
  billNumber: string;
  seekerId: string;
  seekerName: string;
  providerId: string;
  shopName: string;
  shopAddress: string;
  items: BillLineItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: BillPaymentMethod;
  paymentStatus: BillPaymentStatus;
  receiptCode: string;
  notes: string;
  appointmentId: string;
  paidAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export function haversineDistanceKm(a: LatLngPoint, b: LatLngPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistanceKm(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return `${km.toFixed(1)} km`;
}
