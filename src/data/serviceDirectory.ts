export interface ServiceGroupDefinition {
  group: string;
  googleIncludedTypes: string[];
  services: string[];
}

export const SERVICE_DIRECTORY_GROUPS: ServiceGroupDefinition[] = [
  {
    group: 'Shopping & Retail Stores',
    googleIncludedTypes: [
      'store',
      'grocery_store',
      'supermarket',
      'pharmacy',
      'clothing_store',
      'shoe_store',
      'jewelry_store',
      'book_store',
      'electronics_store',
      'furniture_store',
      'hardware_store',
      'bakery',
      'florist',
      'pet_store',
    ],
    services: [
      'General Store',
      'Grocery Store',
      'Supermarket',
      'Departmental Store',
      'Kirana Store',
      'Medical Store / Pharmacy',
      'Clothing Store',
      "Men's Wear Shop",
      "Women's Wear Shop",
      "Kids' Wear Shop",
      'Footwear Shop',
      'Shoe Store',
      'Watch Shop',
      'Jewellery Shop',
      'Cosmetics Shop',
      'Gift Shop',
      'Toy Shop',
      'Book Store',
      'Stationery Shop',
      'Sports Shop',
      'Electronics Shop',
      'Mobile Phone Shop',
      'Computer Shop',
      'Laptop Store',
      'Furniture Shop',
      'Hardware Store',
      'Paint Shop',
      'Electrical Store',
      'Sanitary Shop',
      'Kitchenware Shop',
      'Home Decor Store',
      'Grocery Wholesale Shop',
      'Dry Fruit Shop',
      'Bakery',
      'Sweet Shop',
      'Dairy Shop',
      'Meat Shop',
      'Fish Shop',
      'Vegetable Shop',
      'Fruit Shop',
      'Flower Shop',
      'Pet Supplies Shop',
      'Agricultural Supplies Shop',
      'Pooja Items Shop',
    ],
  },
  {
    group: 'Personal Care & Beauty Services',
    googleIncludedTypes: ['hair_salon', 'barber_shop', 'beauty_salon', 'spa', 'laundry', 'tailor'],
    services: [
      'Hair Salon',
      'Barber Shop',
      'Unisex Salon',
      'Beauty Parlour',
      'Spa',
      'Massage Centre',
      'Nail Art Studio',
      'Makeup Artist',
      'Tattoo Studio',
      'Skin Care Clinic',
      'Hair Treatment Centre',
      'Bridal Makeup Studio',
      'Grooming Centre',
      'Laundry Service',
      'Dry Cleaning Service',
      'Tailoring Shop',
      'Boutique',
      'Alteration Shop',
    ],
  },
  {
    group: 'Food & Restaurants',
    googleIncludedTypes: ['restaurant', 'fast_food_restaurant', 'cafe', 'coffee_shop', 'bakery', 'ice_cream_shop'],
    services: [
      'Restaurant',
      'Fast Food Restaurant',
      'Cafe',
      'Coffee Shop',
      'Tea Stall',
      'Juice Corner',
      'Street Food Stall',
      'Food Truck',
      'Pizza Shop',
      'Burger Shop',
      'Chinese Food Restaurant',
      'South Indian Restaurant',
      'North Indian Restaurant',
      'Sweet Shop',
      'Ice Cream Parlour',
      'Bakery',
      'Dhaba',
      'Family Restaurant',
      'Cloud Kitchen',
      'Catering Service',
    ],
  },
  {
    group: 'Entertainment & Recreation',
    googleIncludedTypes: [
      'movie_theater',
      'amusement_park',
      'bowling_alley',
      'gym',
      'fitness_center',
      'yoga_studio',
      'banquet_hall',
      'bar',
      'resort_hotel',
    ],
    services: [
      'Cinema Hall',
      'Gaming Zone',
      'Amusement Park',
      'Water Park',
      'Bowling Alley',
      'Pool / Billiards Club',
      'Sports Club',
      'Gym',
      'Fitness Centre',
      'Yoga Centre',
      'Dance Academy',
      'Music Academy',
      'Art Studio',
      'Theatre',
      'Convention Centre',
      'Banquet Hall',
      'Marriage Garden',
      'Event Management Service',
      'Pub / Bar',
      'Resort',
    ],
  },
  {
    group: 'Healthcare & Medical Services',
    googleIncludedTypes: ['hospital', 'doctor', 'dentist', 'pharmacy', 'veterinary_care', 'physiotherapist'],
    services: [
      'Hospital',
      'Government Hospital',
      'Private Hospital',
      'Clinic',
      'General Physician',
      'Dentist',
      'Eye Hospital',
      'Eye Clinic',
      'Diagnostic Centre',
      'Pathology Lab',
      'Blood Bank',
      'Physiotherapy Centre',
      'Veterinary Hospital',
      'Veterinary Clinic',
      'Medical Store',
      'Nursing Home',
      'Ambulance Service',
      'Vaccination Centre',
      'X-Ray Centre',
      'Ultrasound Centre',
    ],
  },
  {
    group: 'Transportation & Travel',
    googleIncludedTypes: [
      'bus_station',
      'train_station',
      'subway_station',
      'airport',
      'taxi_stand',
      'car_rental',
      'travel_agency',
      'gas_station',
      'electric_vehicle_charging_station',
      'parking',
      'car_repair',
      'car_wash',
      'tire_shop',
    ],
    services: [
      'Bus Station',
      'Bus Stop',
      'Railway Station',
      'Metro Station',
      'Airport',
      'Taxi Stand',
      'Auto Rickshaw Stand',
      'E-Rickshaw Stand',
      'Car Rental Service',
      'Bike Rental Service',
      'Travel Agency',
      'Tour Operator',
      'Petrol Pump',
      'CNG Station',
      'EV Charging Station',
      'Vehicle Parking',
      'Truck Parking',
      'Driving School',
      'Vehicle Service Centre',
      'Car Wash Centre',
      'Vehicle Repair Shop',
      'Tyre Shop',
      'Vehicle Insurance Office',
      'Courier Service',
      'Logistics Service',
      'Transport Company',
    ],
  },
  {
    group: 'Education & Learning',
    googleIncludedTypes: ['school', 'university', 'library'],
    services: [
      'School',
      'College',
      'University',
      'Coaching Centre',
      'Tuition Centre',
      'Computer Institute',
      'Coding Institute',
      'Language Institute',
      'Library',
      'Study Centre',
      'Competitive Exam Coaching',
      'Skill Development Centre',
      'Vocational Training Centre',
      'Music Classes',
      'Dance Classes',
      'Art Classes',
      'Driving School',
      'Online Education Centre',
    ],
  },
  {
    group: 'Financial Services',
    googleIncludedTypes: ['bank', 'atm', 'accounting', 'insurance_agency'],
    services: [
      'Bank',
      'ATM',
      'Credit Society',
      'Loan Agency',
      'Insurance Office',
      'Financial Consultancy',
      'Chartered Accountant',
      'Tax Consultant',
      'Money Transfer Centre',
      'Currency Exchange',
      'Investment Consultancy',
      'Stock Broking Office',
    ],
  },
  {
    group: 'Repair & Maintenance Services',
    googleIncludedTypes: ['electrician', 'plumber', 'locksmith', 'car_repair', 'electronics_store', 'hardware_store'],
    services: [
      'Mobile Repair Shop',
      'Computer Repair Shop',
      'Laptop Repair Shop',
      'Television Repair Shop',
      'AC Repair Service',
      'Refrigerator Repair Service',
      'Washing Machine Repair',
      'Electrician',
      'Plumber',
      'Carpenter',
      'Painter',
      'Welder',
      'Locksmith',
      'RO Water Purifier Repair',
      'CCTV Installation Service',
      'Home Appliance Repair',
      'Furniture Repair',
      'Shoe Repair Shop',
      'Watch Repair Shop',
      'Bicycle Repair Shop',
    ],
  },
  {
    group: 'Home & Professional Services',
    googleIncludedTypes: ['real_estate_agency', 'moving_company', 'painter', 'plumber', 'electrician'],
    services: [
      'House Cleaning Service',
      'Pest Control Service',
      'Interior Designer',
      'Architect',
      'Real Estate Agent',
      'Property Dealer',
      'Packers and Movers',
      'Security Agency',
      'Gardening Service',
      'Water Tank Cleaning',
      'Home Shifting Service',
      'Maid Service',
      'Cooking Service',
      'Babysitting Service',
      'Home Painting Service',
      'Home Renovation Service',
    ],
  },
  {
    group: 'Government & Public Facilities',
    googleIncludedTypes: [
      'police',
      'fire_station',
      'post_office',
      'local_government_office',
      'city_hall',
      'courthouse',
      'park',
      'community_center',
      'library',
    ],
    services: [
      'Police Station',
      'Fire Station',
      'Post Office',
      'Municipal Office',
      'Government Office',
      'Passport Office',
      'Aadhaar Centre',
      'Ration Shop',
      'Public Toilet',
      'Public Park',
      'Community Centre',
      'Public Library',
      'Court',
      'Government School',
      'Government Hospital',
      'Public Water Facility',
      'Electricity Office',
      'Water Supply Office',
      'Traffic Police Office',
      'Disaster Management Centre',
    ],
  },
  {
    group: 'Accommodation & Hospitality',
    googleIncludedTypes: ['hotel', 'guest_house', 'hostel', 'lodging', 'resort_hotel', 'banquet_hall'],
    services: [
      'Hotel',
      'Guest House',
      'Hostel',
      'PG Accommodation',
      'Paying Guest Facility',
      'Lodge',
      'Resort',
      'Homestay',
      'Service Apartment',
      'Dormitory',
      'Marriage Hall',
      'Banquet Hall',
    ],
  },
  {
    group: 'Religious Places',
    googleIncludedTypes: ['hindu_temple', 'mosque', 'church'],
    services: [
      'Temple',
      'Mosque',
      'Church',
      'Gurudwara',
      'Monastery',
      'Ashram',
      'Religious Community Centre',
      'Crematorium',
      'Burial Ground',
    ],
  },
  {
    group: 'Business & Professional Services',
    googleIncludedTypes: ['lawyer', 'consultant', 'courier_service'],
    services: [
      'Lawyer',
      'Advocate',
      'Legal Consultant',
      'Digital Marketing Agency',
      'Web Development Agency',
      'Graphic Design Studio',
      'Photography Studio',
      'Videography Service',
      'Printing Press',
      'Photocopy Shop',
      'Cyber Cafe',
      'Internet Cafe',
      'Advertising Agency',
      'Recruitment Agency',
      'Consultancy Firm',
      'Documentation Centre',
      'Translation Service',
      'Data Entry Service',
    ],
  },
  {
    group: 'Other Important Services',
    googleIncludedTypes: ['pet_store', 'veterinary_care', 'florist', 'courier_service', 'wedding_venue'],
    services: [
      'Pet Shop',
      'Pet Grooming Centre',
      'Animal Shelter',
      'NGO',
      'Old Age Home',
      'Orphanage',
      'Blood Donation Centre',
      'Recycling Centre',
      'Scrap Dealer',
      'Water Supplier',
      'Gas Agency',
      'Cylinder Booking Centre',
      'Newspaper Agency',
      'Courier Office',
      'Parcel Collection Centre',
      'Marriage Bureau',
      'Event Planner',
      'Tent House',
      'Decoration Service',
      'Florist',
    ],
  },
];

export const SERVICE_CATEGORY_GROUP_NAMES: string[] = SERVICE_DIRECTORY_GROUPS.map((g) => g.group);

export interface ServiceDirectoryEntry {
  key: string;
  name: string;
  group: string;
  isGroup: boolean;
}

// Build flat searchable catalog containing all 15 groups and all 293 services
export const SERVICE_DIRECTORY_ENTRIES: ServiceDirectoryEntry[] = (() => {
  const entries: ServiceDirectoryEntry[] = [];
  const seenNames = new Set<string>();

  for (const def of SERVICE_DIRECTORY_GROUPS) {
    entries.push({
      key: `group:${def.group}`,
      name: def.group,
      group: 'All Categories',
      isGroup: true,
    });
    seenNames.add(def.group.toLowerCase());
  }

  for (const def of SERVICE_DIRECTORY_GROUPS) {
    for (const svc of def.services) {
      const lower = svc.toLowerCase();
      if (seenNames.has(lower)) continue;
      seenNames.add(lower);
      entries.push({
        key: `svc:${svc}`,
        name: svc,
        group: def.group,
        isGroup: false,
      });
    }
  }

  return entries;
})();

const GROUP_MAP_BY_NAME = new globalThis.Map<string, ServiceGroupDefinition>(
  SERVICE_DIRECTORY_GROUPS.map((g) => [g.group.toLowerCase(), g])
);

const GROUPS_BY_SERVICE_NAME = (() => {
  const map = new globalThis.Map<string, string[]>();
  for (const def of SERVICE_DIRECTORY_GROUPS) {
    for (const svc of def.services) {
      const key = svc.toLowerCase();
      const arr = map.get(key) ?? [];
      arr.push(def.group);
      map.set(key, arr);
    }
  }
  return map;
})();

/**
 * Search services and category groups with first-letter prefix priority.
 * Typing just 1 character immediately prioritizes services starting with that letter,
 * followed by word-prefix matches and broader substring matches.
 */
export function searchServiceDirectory(rawQuery: string, limit = 40): ServiceDirectoryEntry[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) {
    return SERVICE_DIRECTORY_ENTRIES.slice(0, limit);
  }

  const startsWithName: ServiceDirectoryEntry[] = [];
  const wordStartsWith: ServiceDirectoryEntry[] = [];
  const containsNameOrGroup: ServiceDirectoryEntry[] = [];

  for (const entry of SERVICE_DIRECTORY_ENTRIES) {
    const nameLower = entry.name.toLowerCase();
    const groupLower = entry.group.toLowerCase();

    if (nameLower.startsWith(q)) {
      startsWithName.push(entry);
    } else {
      const words = nameLower.split(/[\s/&'-]+/).filter(Boolean);
      if (words.some((w) => w.startsWith(q))) {
        wordStartsWith.push(entry);
      } else if (nameLower.includes(q) || groupLower.includes(q)) {
        containsNameOrGroup.push(entry);
      }
    }
  }

  startsWithName.sort((a, b) => a.name.localeCompare(b.name));
  wordStartsWith.sort((a, b) => a.name.localeCompare(b.name));
  containsNameOrGroup.sort((a, b) => a.name.localeCompare(b.name));

  return [...startsWithName, ...wordStartsWith, ...containsNameOrGroup].slice(0, limit);
}

/**
 * Checks whether a registered service listing matches the selected category group or service name.
 */
export function matchesSelectedServiceCategory(
  listingCategory: string,
  listingTextHaystack: string,
  selectedCategory: string
): boolean {
  if (!selectedCategory || selectedCategory === 'All') return true;

  const selectedLower = selectedCategory.trim().toLowerCase();
  const listingCatLower = listingCategory.trim().toLowerCase();

  if (listingCatLower === selectedLower) return true;

  // If selectedCategory is one of the 15 groups, match any service within that group
  const groupDef = GROUP_MAP_BY_NAME.get(selectedLower);
  if (groupDef) {
    if (groupDef.services.some((s) => s.toLowerCase() === listingCatLower)) {
      return true;
    }
    if (
      (selectedLower === 'food & restaurants' && listingCatLower === 'cafe & dining') ||
      (selectedLower === 'personal care & beauty services' &&
        (listingCatLower === 'barber & salon' ||
          listingCatLower === 'beauty & spa' ||
          listingCatLower === 'tailoring')) ||
      (selectedLower === 'repair & maintenance services' && listingCatLower === 'home repairs') ||
      (selectedLower === 'transportation & travel' && listingCatLower === 'auto & bike') ||
      (selectedLower === 'entertainment & recreation' &&
        listingCatLower === 'wellness & fitness') ||
      (selectedLower === 'education & learning' && listingCatLower === 'tutoring')
    ) {
      return true;
    }
  }

  // If selectedCategory is a specific service name, check listing haystack or parent group
  const normalizedSelected = selectedLower.replace(/[^a-z0-9\s]/g, ' ').trim();
  const tokens = normalizedSelected.split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length > 0 && tokens.every((t) => listingTextHaystack.includes(t))) {
    return true;
  }

  // Also check if listingCategory is the parent group of selectedCategory (exact group match only if haystack also partially aligns or as fallback)
  const parentGroups = GROUPS_BY_SERVICE_NAME.get(selectedLower) ?? [];
  if (parentGroups.some((g) => g.toLowerCase() === listingCatLower)) {
    return true;
  }

  return false;
}

export function getGoogleIncludedTypesForGroup(groupOrCategory: string): string[] | null {
  const def = GROUP_MAP_BY_NAME.get(groupOrCategory.trim().toLowerCase());
  return def ? def.googleIncludedTypes : null;
}

export function getParentGroupsForService(serviceName: string): string[] {
  return GROUPS_BY_SERVICE_NAME.get(serviceName.trim().toLowerCase()) ?? [];
}
