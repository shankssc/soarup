// apps/web/src/lib/utils/timezones.ts
// IANA timezone list with search and browser detection utilities

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Timezone {
  value: string; // IANA string e.g. "America/New_York"
  label: string; // Display label e.g. "New York"
  region: string; // Group label e.g. "Americas"
}

export interface TimezoneGroup {
  region: string;
  timezones: Timezone[];
}

// ─── Full IANA list grouped by region ─────────────────────────────────────────

export const TIMEZONES: Timezone[] = [
  // Americas
  { value: 'America/Anchorage', label: 'Anchorage', region: 'Americas' },
  {
    value: 'America/Argentina/Buenos_Aires',
    label: 'Buenos Aires',
    region: 'Americas',
  },
  { value: 'America/Bogota', label: 'Bogota', region: 'Americas' },
  { value: 'America/Caracas', label: 'Caracas', region: 'Americas' },
  { value: 'America/Chicago', label: 'Chicago', region: 'Americas' },
  { value: 'America/Denver', label: 'Denver', region: 'Americas' },
  { value: 'America/Halifax', label: 'Halifax', region: 'Americas' },
  { value: 'America/Indiana/Indianapolis', label: 'Indianapolis', region: 'Americas' },
  { value: 'America/Juneau', label: 'Juneau', region: 'Americas' },
  { value: 'America/La_Paz', label: 'La Paz', region: 'Americas' },
  { value: 'America/Lima', label: 'Lima', region: 'Americas' },
  { value: 'America/Los_Angeles', label: 'Los Angeles', region: 'Americas' },
  { value: 'America/Manaus', label: 'Manaus', region: 'Americas' },
  { value: 'America/Mexico_City', label: 'Mexico City', region: 'Americas' },
  { value: 'America/New_York', label: 'New York', region: 'Americas' },
  { value: 'America/Phoenix', label: 'Phoenix', region: 'Americas' },
  { value: 'America/Puerto_Rico', label: 'Puerto Rico', region: 'Americas' },
  { value: 'America/Santiago', label: 'Santiago', region: 'Americas' },
  { value: 'America/Sao_Paulo', label: 'São Paulo', region: 'Americas' },
  { value: 'America/St_Johns', label: "St. John's", region: 'Americas' },
  { value: 'America/Toronto', label: 'Toronto', region: 'Americas' },
  { value: 'America/Vancouver', label: 'Vancouver', region: 'Americas' },
  { value: 'Pacific/Honolulu', label: 'Honolulu', region: 'Americas' },

  // Europe
  { value: 'Europe/Amsterdam', label: 'Amsterdam', region: 'Europe' },
  { value: 'Europe/Athens', label: 'Athens', region: 'Europe' },
  { value: 'Europe/Belgrade', label: 'Belgrade', region: 'Europe' },
  { value: 'Europe/Berlin', label: 'Berlin', region: 'Europe' },
  { value: 'Europe/Brussels', label: 'Brussels', region: 'Europe' },
  { value: 'Europe/Bucharest', label: 'Bucharest', region: 'Europe' },
  { value: 'Europe/Budapest', label: 'Budapest', region: 'Europe' },
  { value: 'Europe/Copenhagen', label: 'Copenhagen', region: 'Europe' },
  { value: 'Europe/Dublin', label: 'Dublin', region: 'Europe' },
  { value: 'Europe/Helsinki', label: 'Helsinki', region: 'Europe' },
  { value: 'Europe/Istanbul', label: 'Istanbul', region: 'Europe' },
  { value: 'Europe/Kiev', label: 'Kyiv', region: 'Europe' },
  { value: 'Europe/Lisbon', label: 'Lisbon', region: 'Europe' },
  { value: 'Europe/London', label: 'London', region: 'Europe' },
  { value: 'Europe/Madrid', label: 'Madrid', region: 'Europe' },
  { value: 'Europe/Moscow', label: 'Moscow', region: 'Europe' },
  { value: 'Europe/Oslo', label: 'Oslo', region: 'Europe' },
  { value: 'Europe/Paris', label: 'Paris', region: 'Europe' },
  { value: 'Europe/Prague', label: 'Prague', region: 'Europe' },
  { value: 'Europe/Rome', label: 'Rome', region: 'Europe' },
  { value: 'Europe/Stockholm', label: 'Stockholm', region: 'Europe' },
  { value: 'Europe/Vienna', label: 'Vienna', region: 'Europe' },
  { value: 'Europe/Warsaw', label: 'Warsaw', region: 'Europe' },
  { value: 'Europe/Zurich', label: 'Zurich', region: 'Europe' },

  // Asia / Pacific
  { value: 'Asia/Almaty', label: 'Almaty', region: 'Asia / Pacific' },
  { value: 'Asia/Baghdad', label: 'Baghdad', region: 'Asia / Pacific' },
  { value: 'Asia/Baku', label: 'Baku', region: 'Asia / Pacific' },
  { value: 'Asia/Bangkok', label: 'Bangkok', region: 'Asia / Pacific' },
  { value: 'Asia/Colombo', label: 'Colombo', region: 'Asia / Pacific' },
  { value: 'Asia/Dhaka', label: 'Dhaka', region: 'Asia / Pacific' },
  { value: 'Asia/Dubai', label: 'Dubai', region: 'Asia / Pacific' },
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh City', region: 'Asia / Pacific' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong', region: 'Asia / Pacific' },
  { value: 'Asia/Jakarta', label: 'Jakarta', region: 'Asia / Pacific' },
  { value: 'Asia/Karachi', label: 'Karachi', region: 'Asia / Pacific' },
  { value: 'Asia/Kathmandu', label: 'Kathmandu', region: 'Asia / Pacific' },
  { value: 'Asia/Kolkata', label: 'Kolkata', region: 'Asia / Pacific' },
  { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur', region: 'Asia / Pacific' },
  { value: 'Asia/Kuwait', label: 'Kuwait', region: 'Asia / Pacific' },
  { value: 'Asia/Manila', label: 'Manila', region: 'Asia / Pacific' },
  { value: 'Asia/Muscat', label: 'Muscat', region: 'Asia / Pacific' },
  { value: 'Asia/Riyadh', label: 'Riyadh', region: 'Asia / Pacific' },
  { value: 'Asia/Seoul', label: 'Seoul', region: 'Asia / Pacific' },
  { value: 'Asia/Shanghai', label: 'Shanghai', region: 'Asia / Pacific' },
  { value: 'Asia/Singapore', label: 'Singapore', region: 'Asia / Pacific' },
  { value: 'Asia/Taipei', label: 'Taipei', region: 'Asia / Pacific' },
  { value: 'Asia/Tashkent', label: 'Tashkent', region: 'Asia / Pacific' },
  { value: 'Asia/Tehran', label: 'Tehran', region: 'Asia / Pacific' },
  { value: 'Asia/Tokyo', label: 'Tokyo', region: 'Asia / Pacific' },
  { value: 'Asia/Yerevan', label: 'Yerevan', region: 'Asia / Pacific' },
  { value: 'Pacific/Auckland', label: 'Auckland', region: 'Asia / Pacific' },
  { value: 'Pacific/Fiji', label: 'Fiji', region: 'Asia / Pacific' },
  { value: 'Pacific/Guam', label: 'Guam', region: 'Asia / Pacific' },
  { value: 'Pacific/Sydney', label: 'Sydney', region: 'Asia / Pacific' },

  // Africa
  { value: 'Africa/Abidjan', label: 'Abidjan', region: 'Africa' },
  { value: 'Africa/Accra', label: 'Accra', region: 'Africa' },
  { value: 'Africa/Addis_Ababa', label: 'Addis Ababa', region: 'Africa' },
  { value: 'Africa/Cairo', label: 'Cairo', region: 'Africa' },
  { value: 'Africa/Casablanca', label: 'Casablanca', region: 'Africa' },
  { value: 'Africa/Johannesburg', label: 'Johannesburg', region: 'Africa' },
  { value: 'Africa/Lagos', label: 'Lagos', region: 'Africa' },
  { value: 'Africa/Nairobi', label: 'Nairobi', region: 'Africa' },
  { value: 'Africa/Tunis', label: 'Tunis', region: 'Africa' },

  // UTC
  { value: 'UTC', label: 'UTC', region: 'UTC' },
];

// ─── Grouped list ──────────────────────────────────────────────────────────────

export function getGroupedTimezones(): TimezoneGroup[] {
  const regionOrder = ['Americas', 'Europe', 'Asia / Pacific', 'Africa', 'UTC'];
  const groups: Record<string, Timezone[]> = {};

  for (const tz of TIMEZONES) {
    if (!groups[tz.region]) groups[tz.region] = [];
    groups[tz.region].push(tz);
  }

  return regionOrder
    .filter((r) => groups[r])
    .map((region) => ({ region, timezones: groups[region] }));
}

// ─── Search ────────────────────────────────────────────────────────────────────

export function searchTimezones(query: string): Timezone[] {
  if (!query.trim()) return TIMEZONES;
  const q = query.toLowerCase().trim();
  return TIMEZONES.filter(
    (tz) =>
      tz.label.toLowerCase().includes(q) ||
      tz.value.toLowerCase().includes(q) ||
      tz.region.toLowerCase().includes(q),
  );
}

// ─── Browser detection ─────────────────────────────────────────────────────────

export function detectBrowserTimezone(): Timezone {
  try {
    const ianaValue = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const match = TIMEZONES.find((tz) => tz.value === ianaValue);
    if (match) return match;

    // Partial match — browser returned a timezone not in our curated list
    // Find closest by prefix (e.g. "America/Indiana/Knox" → "Americas")
    const region = ianaValue.split('/')[0];
    const regionMap: Record<string, string> = {
      America: 'Americas',
      Pacific: 'Americas',
      Europe: 'Europe',
      Asia: 'Asia / Pacific',
      Australia: 'Asia / Pacific',
      Africa: 'Africa',
    };

    return {
      value: ianaValue,
      label: ianaValue.split('/').pop()?.replace(/_/g, ' ') ?? ianaValue,
      region: regionMap[region] ?? 'UTC',
    };
  } catch {
    return { value: 'UTC', label: 'UTC', region: 'UTC' };
  }
}

// ─── Lookup by value ───────────────────────────────────────────────────────────

export function getTimezoneByValue(value: string): Timezone | undefined {
  return TIMEZONES.find((tz) => tz.value === value);
}
