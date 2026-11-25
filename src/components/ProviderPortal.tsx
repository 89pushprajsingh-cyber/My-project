import React, { useEffect, useState } from 'react';
import {
  Map,
  AdvancedMarker,
  Pin,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Crosshair,
  ImagePlus,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType, uploadImageFile } from '../firebase';
import {
  CatalogItem,
  getAverageRating,
  getServiceCatalogItems,
  LatLngPoint,
  ProviderKyc,
  SERVICE_CATEGORIES,
  ServiceCategory,
  ServiceListing,
  STUDIO_GALLERY_PRESETS,
  VALIDATION_LIMITS,
} from '../types';
import { PlacesSearchInput } from './PlacesSearchInput';
import { MapCameraSync } from './MapRadiusCircle';
import { SafeImage } from './SafeImage';
import { StarRatingDisplay } from './StarRating';
import { ProviderReviewsList } from './ProviderReviewsList';

interface ProviderPortalProps {
  user: User;
  existingService: ServiceListing | null;
  onSaved: () => void;
  mapsReady: boolean;
}

const DEFAULT_CENTER: LatLngPoint = { lat: 28.6139, lng: 77.209 };

export function ProviderPortal({
  user,
  existingService,
  onSaved,
  mapsReady,
}: ProviderPortalProps) {
  const [shopName, setShopName] = useState(existingService?.shopName || '');
  const [ownerName, setOwnerName] = useState(
    existingService?.ownerName || user.displayName || ''
  );
  const [category, setCategory] = useState<ServiceCategory>(
    existingService?.category || 'Barber & Salon'
  );
  const [description, setDescription] = useState(existingService?.description || '');
  const [openHours, setOpenHours] = useState(
    existingService?.openHours || 'Mon–Sun · 9:30 AM – 8:30 PM'
  );
  const [address, setAddress] = useState(existingService?.address || '');
  const [pinLocation, setPinLocation] = useState<LatLngPoint>(
    existingService
      ? { lat: existingService.lat, lng: existingService.lng }
      : DEFAULT_CENTER
  );
  const [cameraTrigger, setCameraTrigger] = useState(0);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>(
    existingService
      ? getServiceCatalogItems(existingService)
      : [
          { name: 'Classic Haircut', itemType: 'Haircut', unit: '30 mins', price: 250 },
          { name: 'Beard Trim & Styling', itemType: 'Grooming', unit: '20 mins', price: 150 },
        ]
  );
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState('Service');
  const [newItemUnit, setNewItemUnit] = useState('1 unit');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>(
    existingService?.photoUrls?.length
      ? existingService.photoUrls
      : [STUDIO_GALLERY_PRESETS[0].url]
  );
  const [isActive, setIsActive] = useState<boolean>(existingService?.isActive ?? true);

  // Aadhaar KYC fields (private collection)
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [existingLast4, setExistingLast4] = useState('');
  const [fullNameOnCard, setFullNameOnCard] = useState(user.displayName || '');
  const [aadhaarDocUrl, setAadhaarDocUrl] = useState('');

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isUploadingKycDoc, setIsUploadingKycDoc] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (existingService) {
      setShopName(existingService.shopName);
      setOwnerName(existingService.ownerName);
      setCategory(existingService.category);
      setDescription(existingService.description);
      setOpenHours(existingService.openHours);
      setAddress(existingService.address);
      setPinLocation({ lat: existingService.lat, lng: existingService.lng });
      setCatalogItems(getServiceCatalogItems(existingService));
      setPhotoUrls(existingService.photoUrls);
      setIsActive(existingService.isActive);
    }
  }, [existingService]);

  useEffect(() => {
    let mounted = true;
    async function loadKyc() {
      const kycPath = `providers/${user.uid}/private/kyc`;
      try {
        const snap = await getDoc(doc(db, 'providers', user.uid, 'private', 'kyc'));
        if (mounted && snap.exists()) {
          const data = snap.data() as ProviderKyc;
          setAadhaarNumber(data.aadhaarNumber || '');
          setExistingLast4(data.aadhaarLast4 || '');
          setFullNameOnCard(data.fullNameOnCard || user.displayName || '');
          setAadhaarDocUrl(data.aadhaarDocUrl || '');
        }
      } catch (err) {
        // Only surface permission errors via handleFirestoreError
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('permission')) {
          handleFirestoreError(err, OperationType.GET, kycPath);
        }
      }
    }
    void loadKyc();
    return () => {
      mounted = false;
    };
  }, [user.uid, user.displayName]);

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPinLocation(next);
        setCameraTrigger((prev) => prev + 1);
        if (!address.trim()) {
          setAddress(`GPS Pin (${next.lat.toFixed(5)}, ${next.lng.toFixed(5)})`);
        }
        setIsLocating(false);
      },
      () => {
        setErrorMsg('Unable to access GPS location. Please search your address or click the map.');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAddCatalogItem = () => {
    const cleanName = newItemName.trim().slice(0, VALIDATION_LIMITS.SERVICE_ITEM_MAX);
    const cleanType = (newItemType.trim() || category || 'Service').slice(
      0,
      VALIDATION_LIMITS.ITEM_TYPE_MAX
    );
    const cleanUnit = newItemUnit.trim().slice(0, VALIDATION_LIMITS.ITEM_UNIT_MAX);
    const parsedPrice = Number(newItemPrice);

    if (!cleanName) {
      setErrorMsg('Enter a product or service name before adding.');
      return;
    }
    if (newItemPrice.trim() === '' || !Number.isFinite(parsedPrice) || parsedPrice < 0 || parsedPrice > 1000000) {
      setErrorMsg('Enter a valid price (₹0 – ₹10,00,000) for this item.');
      return;
    }
    if (catalogItems.length >= VALIDATION_LIMITS.CATALOG_MAX_COUNT) {
      setErrorMsg(`You can list up to ${VALIDATION_LIMITS.CATALOG_MAX_COUNT} products and services.`);
      return;
    }

    setCatalogItems((prev) => [
      ...prev,
      {
        name: cleanName,
        itemType: cleanType,
        unit: cleanUnit,
        price: Number(parsedPrice.toFixed(2)),
      },
    ]);
    setNewItemName('');
    setNewItemPrice('');
    setErrorMsg(null);
  };

  const handleLoadCategorySampleMenu = () => {
    if (category === 'Cafe & Dining') {
      setCatalogItems([
        { name: 'Hot Tomato Herb Soup', itemType: 'Soup', unit: '1 plate', price: 140 },
        { name: 'Sweet Corn Veg Soup', itemType: 'Soup', unit: '1 plate', price: 150 },
        { name: 'Cream of Mushroom Soup', itemType: 'Soup', unit: '1 bowl', price: 180 },
        { name: 'Grilled Cheese Garlic Toast', itemType: 'Snack', unit: '2 pcs', price: 120 },
        { name: 'Artisan Filter Coffee', itemType: 'Beverage', unit: '1 cup', price: 90 },
      ]);
      setNewItemType('Soup');
      setNewItemUnit('1 plate');
    } else if (category === 'Barber & Salon') {
      setCatalogItems([
        { name: 'Classic Haircut', itemType: 'Haircut', unit: '30 mins', price: 250 },
        { name: 'Skin Fade & Wash', itemType: 'Haircut', unit: '45 mins', price: 350 },
        { name: 'Beard Trim & Styling', itemType: 'Grooming', unit: '20 mins', price: 150 },
      ]);
      setNewItemType('Haircut');
      setNewItemUnit('30 mins');
    } else {
      setCatalogItems([
        { name: `${category} Consultation`, itemType: 'Service', unit: '30 mins', price: 200 },
        { name: `Standard ${category} Package`, itemType: 'Package', unit: '1 session', price: 450 },
      ]);
      setNewItemType('Service');
      setNewItemUnit('1 session');
    }
    setErrorMsg(null);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (photoUrls.length >= VALIDATION_LIMITS.PHOTOS_MAX_COUNT) {
      setErrorMsg(`Maximum ${VALIDATION_LIMITS.PHOTOS_MAX_COUNT} service photos allowed.`);
      return;
    }
    try {
      setIsUploadingPhoto(true);
      setErrorMsg(null);
      const uploadedUrl = await uploadImageFile(file);
      setPhotoUrls((prev) => [...prev, uploadedUrl]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to upload photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleKycDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setIsUploadingKycDoc(true);
      setErrorMsg(null);
      const uploadedUrl = await uploadImageFile(file);
      setAadhaarDocUrl(uploadedUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to upload Aadhaar document.');
    } finally {
      setIsUploadingKycDoc(false);
    }
  };

  const handleTogglePresetPhoto = (presetUrl: string) => {
    if (photoUrls.includes(presetUrl)) {
      if (photoUrls.length > 1) {
        setPhotoUrls((prev) => prev.filter((p) => p !== presetUrl));
      }
      return;
    }
    if (photoUrls.length >= VALIDATION_LIMITS.PHOTOS_MAX_COUNT) {
      setPhotoUrls((prev) => [...prev.slice(0, VALIDATION_LIMITS.PHOTOS_MAX_COUNT - 1), presetUrl]);
    } else {
      setPhotoUrls((prev) => [...prev, presetUrl]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanShopName = shopName.trim().slice(0, VALIDATION_LIMITS.SHOP_NAME_MAX);
    const cleanOwnerName = ownerName.trim().slice(0, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
    const cleanDescription = description.trim().slice(0, VALIDATION_LIMITS.DESCRIPTION_MAX);
    const cleanAddress = address.trim().slice(0, VALIDATION_LIMITS.ADDRESS_MAX);
    const cleanHours = openHours.trim().slice(0, VALIDATION_LIMITS.OPEN_HOURS_MAX);
    const cleanAadhaar = aadhaarNumber.replace(/\D/g, '');
    const cleanFullNameOnCard = fullNameOnCard.trim().slice(0, 100);

    if (!VALIDATION_LIMITS.AADHAAR_REGEX.test(cleanAadhaar)) {
      setErrorMsg('Please enter a valid 12-digit Aadhaar Card number.');
      return;
    }
    if (cleanFullNameOnCard.length < 2) {
      setErrorMsg('Please enter your full name as shown on your Aadhaar Card.');
      return;
    }
    if (cleanShopName.length < VALIDATION_LIMITS.SHOP_NAME_MIN) {
      setErrorMsg('Shop or service name must be at least 2 characters.');
      return;
    }
    if (cleanDescription.length < VALIDATION_LIMITS.DESCRIPTION_MIN) {
      setErrorMsg('Please provide a short service description (at least 5 characters).');
      return;
    }
    if (cleanAddress.length < VALIDATION_LIMITS.ADDRESS_MIN) {
      setErrorMsg('Please search or enter your shop address and set the map pin.');
      return;
    }
    const cleanCatalog: CatalogItem[] = catalogItems
      .slice(0, VALIDATION_LIMITS.CATALOG_MAX_COUNT)
      .map((item) => ({
        name: item.name.trim().slice(0, VALIDATION_LIMITS.SERVICE_ITEM_MAX),
        itemType: (item.itemType.trim() || category || 'Service').slice(
          0,
          VALIDATION_LIMITS.ITEM_TYPE_MAX
        ),
        unit: item.unit.trim().slice(0, VALIDATION_LIMITS.ITEM_UNIT_MAX),
        price: Number(Math.min(1000000, Math.max(0, Number(item.price) || 0)).toFixed(2)),
      }))
      .filter((item) => item.name.length >= 1);

    if (cleanCatalog.length === 0) {
      setErrorMsg('Add at least one product or service with a name and price.');
      return;
    }
    if (photoUrls.length === 0) {
      setErrorMsg('Upload or select at least one service photo.');
      return;
    }

    const derivedServicesOffered = cleanCatalog.map((item) =>
      `${item.name}${item.unit ? ` (${item.unit})` : ''} · ₹${item.price}`.slice(0, 120)
    );

    setIsSaving(true);
    try {
      const batch = writeBatch(db);
      const kycRef = doc(db, 'providers', user.uid, 'private', 'kyc');
      const serviceRef = doc(db, 'services', user.uid);

      const kycExistsSnap = await getDoc(kycRef);
      const last4 = cleanAadhaar.slice(-4);

      if (kycExistsSnap.exists()) {
        batch.update(kycRef, {
          aadhaarNumber: cleanAadhaar,
          aadhaarLast4: last4,
          fullNameOnCard: cleanFullNameOnCard,
          aadhaarDocUrl: aadhaarDocUrl || '',
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(kycRef, {
          ownerId: user.uid,
          aadhaarNumber: cleanAadhaar,
          aadhaarLast4: last4,
          fullNameOnCard: cleanFullNameOnCard,
          aadhaarDocUrl: aadhaarDocUrl || '',
          verifiedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (existingService) {
        const legacyRatingBackfill =
          existingService.ratingSum === undefined
            ? {
                ratingSum: 0,
                ratingCount: 0,
                lastReviewedAppointmentId: '',
              }
            : {};

        batch.update(serviceRef, {
          ownerName: cleanOwnerName,
          shopName: cleanShopName,
          category,
          description: cleanDescription,
          address: cleanAddress,
          lat: Number(pinLocation.lat.toFixed(6)),
          lng: Number(pinLocation.lng.toFixed(6)),
          openHours: cleanHours,
          servicesOffered: derivedServicesOffered,
          catalogItems: cleanCatalog,
          photoUrls: photoUrls.slice(0, VALIDATION_LIMITS.PHOTOS_MAX_COUNT),
          aadhaarVerified: true,
          isActive,
          ...legacyRatingBackfill,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(serviceRef, {
          ownerId: user.uid,
          ownerName: cleanOwnerName,
          shopName: cleanShopName,
          category,
          description: cleanDescription,
          address: cleanAddress,
          lat: Number(pinLocation.lat.toFixed(6)),
          lng: Number(pinLocation.lng.toFixed(6)),
          openHours: cleanHours,
          servicesOffered: derivedServicesOffered,
          catalogItems: cleanCatalog,
          photoUrls: photoUrls.slice(0, VALIDATION_LIMITS.PHOTOS_MAX_COUNT),
          aadhaarVerified: true,
          isActive,
          ratingSum: 0,
          ratingCount: 0,
          lastReviewedAppointmentId: '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      await batch.commit();
      setExistingLast4(last4);
      setSuccessMsg(
        existingService
          ? 'Your service listing and verification profile were updated.'
          : 'Your shop is now live on the discovery map with Aadhaar verification.'
      );
      onSaved();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `services/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <p className="text-xs font-medium text-blue-700 mb-1">
            Service Provider Onboarding & Listing
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            {existingService ? 'Manage Your Service Shop' : 'Register Your Service on the Map'}
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 max-w-2xl">
            Complete Aadhaar identity verification, pin your exact shop location, and upload service photos so nearby customers can find you and schedule appointments directly.
          </p>
        </div>

        {existingService && (
          <div className="flex items-center gap-2 text-sm text-emerald-700 font-medium shrink-0">
            <ShieldCheck className="w-4 h-4" />
            <span>Aadhaar Verified</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-slate-600">
              {existingLast4 ? `XXXX-XXXX-${existingLast4}` : 'Active'}
            </span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800"
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800 flex items-center gap-2.5"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-10">
        {/* Section 1: Aadhaar Verification (Isolated Private KYC) */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start justify-between gap-4 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                01. Aadhaar Identity Verification
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your 12-digit Aadhaar number and card photo are stored in an encrypted private record and never shown to customers. Customers only see a verified badge.
              </p>
            </div>
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-1" />
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="aadhaar-number"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                12-Digit Aadhaar Number
              </label>
              <input
                id="aadhaar-number"
                type="text"
                inputMode="numeric"
                maxLength={12}
                required
                value={aadhaarNumber}
                onChange={(e) => setAadhaarNumber(e.target.value.replace(/\D/g, '').slice(0, 12))}
                placeholder="Enter 12-digit Aadhaar number"
                className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
              <p className="mt-1 text-xs text-slate-400 tabular-nums">
                {aadhaarNumber.length}/12 digits
              </p>
            </div>

            <div>
              <label
                htmlFor="aadhaar-name"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Full Name on Aadhaar Card
              </label>
              <input
                id="aadhaar-name"
                type="text"
                required
                maxLength={100}
                value={fullNameOnCard}
                onChange={(e) => setFullNameOnCard(e.target.value)}
                placeholder="e.g., Rajesh Sharma"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Aadhaar Card Image (Optional supporting scan)
              </label>
              <div className="flex flex-wrap items-center gap-4">
                <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors">
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span>{isUploadingKycDoc ? 'Uploading...' : 'Upload Aadhaar Photo'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleKycDocUpload}
                    disabled={isUploadingKycDoc}
                    className="sr-only"
                  />
                </label>
                {aadhaarDocUrl && (
                  <div className="flex items-center gap-3">
                    <SafeImage
                      src={aadhaarDocUrl}
                      alt="Uploaded Aadhaar verification document"
                      className="w-16 h-10 object-cover rounded border border-slate-200"
                    />
                    <span className="text-xs text-emerald-700 font-medium">
                      Document attached privately
                    </span>
                    <button
                      type="button"
                      onClick={() => setAadhaarDocUrl('')}
                      className="text-xs text-slate-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: Shop & Service Information */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="pb-5 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">
              02. Shop & Service Menu
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Tell service seekers what your business specializes in, your hours, and your service catalog.
            </p>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="shop-name"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Shop or Provider Name
              </label>
              <input
                id="shop-name"
                type="text"
                required
                maxLength={VALIDATION_LIMITS.SHOP_NAME_MAX}
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="e.g., Crown & Blade Barber Studio"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="service-category"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Service Category
              </label>
              <select
                id="service-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as ServiceCategory)}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                {SERVICE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="owner-name"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Lead Specialist / Owner Name
              </label>
              <input
                id="owner-name"
                type="text"
                required
                maxLength={VALIDATION_LIMITS.DISPLAY_NAME_MAX}
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Your display name"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label
                htmlFor="open-hours"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Working Hours
              </label>
              <input
                id="open-hours"
                type="text"
                required
                maxLength={VALIDATION_LIMITS.OPEN_HOURS_MAX}
                value={openHours}
                onChange={(e) => setOpenHours(e.target.value)}
                placeholder="e.g., Mon–Sun · 9:00 AM – 9:00 PM"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="shop-description"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                About Your Service
              </label>
              <textarea
                id="shop-description"
                rows={3}
                required
                maxLength={VALIDATION_LIMITS.DESCRIPTION_MAX}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe your experience, hygiene standards, walk-in vs appointment policy, and specialties."
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <label className="block text-sm font-medium text-slate-700">
                    Products & Services Menu ({catalogItems.length}/{VALIDATION_LIMITS.CATALOG_MAX_COUNT})
                  </label>
                  <p className="text-xs text-slate-500">
                    List every dish, product, or service with its type, portion/unit, and price (₹) so customers can view your full menu and pay cleanly.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLoadCategorySampleMenu}
                  className="text-xs font-medium text-blue-700 hover:underline whitespace-nowrap"
                >
                  Load {category} Sample Menu
                </button>
              </div>

              {/* Add Item Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.SERVICE_ITEM_MAX}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCatalogItem();
                    }
                  }}
                  placeholder="Item name (e.g., Hot Tomato Herb Soup)"
                  aria-label="New product or service name"
                  className="sm:col-span-5 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.ITEM_TYPE_MAX}
                  value={newItemType}
                  onChange={(e) => setNewItemType(e.target.value)}
                  placeholder="Type (e.g., Soup)"
                  aria-label="New item type"
                  className="sm:col-span-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <input
                  type="text"
                  maxLength={VALIDATION_LIMITS.ITEM_UNIT_MAX}
                  value={newItemUnit}
                  onChange={(e) => setNewItemUnit(e.target.value)}
                  placeholder="Unit (1 plate)"
                  aria-label="New item unit"
                  className="sm:col-span-2 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  step="any"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCatalogItem();
                    }
                  }}
                  placeholder="Price ₹"
                  aria-label="New item price"
                  className="sm:col-span-2 px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={handleAddCatalogItem}
                  className="sm:col-span-1 inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
                  aria-label="Add product or service"
                >
                  <Plus className="w-4 h-4" />
                  <span className="sm:hidden">Add</span>
                </button>
              </div>

              {/* Numbered Editable Catalog Table */}
              <div className="mt-3 border border-slate-200 rounded-lg overflow-hidden">
                <div className="hidden sm:grid sm:grid-cols-12 gap-2 px-3.5 py-2 bg-slate-50 border-b border-slate-200 text-xs font-medium text-slate-500">
                  <span className="col-span-1">#</span>
                  <span className="col-span-4">Item / Service Name</span>
                  <span className="col-span-2">Type</span>
                  <span className="col-span-2">Portion / Unit</span>
                  <span className="col-span-2 text-right">Price (₹)</span>
                  <span className="col-span-1 text-right">Action</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {catalogItems.map((item, index) => (
                    <li
                      key={`${index}-${item.name}`}
                      className="px-3.5 py-2.5 grid grid-cols-1 sm:grid-cols-12 gap-2 items-center text-sm"
                    >
                      <span className="sm:col-span-1 font-mono tabular-nums text-xs text-slate-400">
                        {index + 1}.
                      </span>
                      <div className="sm:col-span-4">
                        <input
                          type="text"
                          value={item.name}
                          maxLength={VALIDATION_LIMITS.SERVICE_ITEM_MAX}
                          onChange={(e) =>
                            setCatalogItems((prev) =>
                              prev.map((row, idx) =>
                                idx === index ? { ...row, name: e.target.value } : row
                              )
                            )
                          }
                          aria-label={`Item ${index + 1} name`}
                          className="w-full px-2 py-1 text-sm text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-600 focus:bg-white rounded focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          value={item.itemType}
                          maxLength={VALIDATION_LIMITS.ITEM_TYPE_MAX}
                          onChange={(e) =>
                            setCatalogItems((prev) =>
                              prev.map((row, idx) =>
                                idx === index ? { ...row, itemType: e.target.value } : row
                              )
                            )
                          }
                          aria-label={`Item ${index + 1} type`}
                          className="w-full px-2 py-1 text-xs text-slate-600 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-600 focus:bg-white rounded focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="text"
                          value={item.unit}
                          maxLength={VALIDATION_LIMITS.ITEM_UNIT_MAX}
                          onChange={(e) =>
                            setCatalogItems((prev) =>
                              prev.map((row, idx) =>
                                idx === index ? { ...row, unit: e.target.value } : row
                              )
                            )
                          }
                          aria-label={`Item ${index + 1} unit`}
                          className="w-full px-2 py-1 text-xs text-slate-600 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-600 focus:bg-white rounded focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min={0}
                          max={1000000}
                          step="any"
                          value={item.price}
                          onChange={(e) => {
                            const nextVal = Number(e.target.value);
                            setCatalogItems((prev) =>
                              prev.map((row, idx) =>
                                idx === index
                                  ? { ...row, price: Number.isFinite(nextVal) ? nextVal : 0 }
                                  : row
                              )
                            );
                          }}
                          aria-label={`Item ${index + 1} price`}
                          className="w-full px-2 py-1 text-sm text-right font-mono tabular-nums font-medium text-slate-900 bg-transparent border border-transparent hover:border-slate-200 focus:border-blue-600 focus:bg-white rounded focus:outline-none"
                        />
                      </div>
                      <div className="sm:col-span-1 flex justify-end">
                        {catalogItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setCatalogItems((prev) => prev.filter((_, i) => i !== index))
                            }
                            aria-label={`Remove ${item.name}`}
                            className="text-slate-400 hover:text-red-600 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Location Pinning on Map */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                03. Shop Location & Map Pin
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Search your address, use GPS, or click directly on the map to position your shop pin accurately.
              </p>
            </div>
            <button
              type="button"
              onClick={handleUseCurrentGps}
              disabled={isLocating}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Crosshair className="w-4 h-4" />
              <span>{isLocating ? 'Locating...' : 'Use My GPS'}</span>
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {mapsReady && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Search Address on Google Places
                </label>
                <PlacesSearchInput
                  initialValue={address}
                  placeholder="Type your street, neighborhood, or landmark"
                  onLocationSelected={({ address: resolved, location }) => {
                    setAddress(resolved);
                    setPinLocation(location);
                    setCameraTrigger((prev) => prev + 1);
                  }}
                />
              </div>
            )}

            <div>
              <label
                htmlFor="shop-address"
                className="block text-sm font-medium text-slate-700 mb-1.5"
              >
                Full Display Address
              </label>
              <input
                id="shop-address"
                type="text"
                required
                maxLength={VALIDATION_LIMITS.ADDRESS_MAX}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop No., Street, Landmark, City"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
              <span>
                Coordinates: {pinLocation.lat.toFixed(5)}, {pinLocation.lng.toFixed(5)}
              </span>
              <span>Click map or drag pin to adjust</span>
            </div>

            {mapsReady ? (
              <div className="h-72 w-full rounded-xl overflow-hidden border border-slate-200">
                <Map
                  mapId="DEMO_MAP_ID"
                  defaultCenter={pinLocation}
                  defaultZoom={14}
                  gestureHandling="greedy"
                  disableDefaultUI={false}
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  onClick={(ev: MapMouseEvent) => {
                    if (ev.detail.latLng) {
                      setPinLocation({
                        lat: ev.detail.latLng.lat,
                        lng: ev.detail.latLng.lng,
                      });
                    }
                  }}
                  style={{ width: '100%', height: '100%' }}
                >
                  <MapCameraSync center={pinLocation} zoom={15} triggerKey={cameraTrigger} />
                  <AdvancedMarker
                    position={pinLocation}
                    draggable
                    onDragEnd={(e) => {
                      const pos = e.latLng;
                      if (pos) {
                        setPinLocation({ lat: pos.lat(), lng: pos.lng() });
                      }
                    }}
                  >
                    <Pin background="#1d4ed8" borderColor="#1e3a8a" glyphColor="#ffffff" />
                  </AdvancedMarker>
                </Map>
              </div>
            ) : (
              <div className="h-40 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
                Google Maps preview is initializing. You can still enter your address and GPS coordinates.
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Service Photos */}
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="pb-5 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">
              04. Service & Shop Photos (1–3 photos)
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload photos of your shop, equipment, or past work—or select studio reference images below.
            </p>
          </div>

          <div className="mt-5 space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors">
                <ImagePlus className="w-4 h-4" />
                <span>{isUploadingPhoto ? 'Uploading Photo...' : 'Upload Shop Photo'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoUpload}
                  disabled={isUploadingPhoto || photoUrls.length >= VALIDATION_LIMITS.PHOTOS_MAX_COUNT}
                  className="sr-only"
                />
              </label>
              <span className="text-xs text-slate-500 tabular-nums">
                {photoUrls.length} / {VALIDATION_LIMITS.PHOTOS_MAX_COUNT} selected
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {photoUrls.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-[4/3] bg-slate-100"
                >
                  <SafeImage
                    src={url}
                    alt={`Service photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  {photoUrls.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPhotoUrls((prev) => prev.filter((_, i) => i !== idx))}
                      aria-label={`Remove photo ${idx + 1}`}
                      className="absolute top-2 right-2 p-1.5 bg-white/95 text-slate-700 hover:text-red-600 rounded-md shadow-sm border border-slate-200"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-medium text-slate-500 mb-2.5">
                Quick-pick studio photos (optional):
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {STUDIO_GALLERY_PRESETS.map((preset) => {
                  const selected = photoUrls.includes(preset.url);
                  return (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => handleTogglePresetPhoto(preset.url)}
                      className={`text-left rounded-lg overflow-hidden border transition-all ${
                        selected
                          ? 'border-blue-600 ring-2 ring-blue-600/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="aspect-[4/3] bg-slate-100">
                        <SafeImage
                          src={preset.url}
                          alt={preset.label}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="px-2.5 py-1.5 text-xs font-medium text-slate-700 truncate bg-white">
                        {preset.label}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Visibility & Submit */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 rounded-xl p-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
            />
            <div>
              <span className="text-sm font-medium text-slate-900 block">
                Publish shop on the live discovery map
              </span>
              <span className="text-xs text-slate-500">
                Uncheck anytime to temporarily pause incoming bookings.
              </span>
            </div>
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            {isSaving
              ? 'Saving & Verifying...'
              : existingService
                ? 'Update Service Listing'
                : 'Verify & Publish Shop'}
          </button>
        </div>
      </form>

      {existingService && (
        <section className="mt-10 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Customer Ratings & Reviews
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Verified feedback submitted by customers after completing appointments at {existingService.shopName}.
              </p>
            </div>
            <StarRatingDisplay
              average={getAverageRating(existingService)}
              count={existingService.ratingCount ?? 0}
            />
          </div>

          <div className="mt-5">
            <ProviderReviewsList providerId={user.uid} />
          </div>
        </section>
      )}
    </div>
  );
}
