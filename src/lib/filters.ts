import type { Aircraft } from '../../shared/model.ts';

export interface Filters {
  /** Case-insensitive substring match on callsign, hex, registration or type. */
  query: string;
  minAltitudeFt: number | null;
  maxAltitudeFt: number | null;
  minSpeedKt: number | null;
  hideOnGround: boolean;
  militaryOnly: boolean;
  emergencyOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  query: '',
  minAltitudeFt: null,
  maxAltitudeFt: null,
  minSpeedKt: null,
  hideOnGround: false,
  militaryOnly: false,
  emergencyOnly: false,
};

export const EMERGENCY_SQUAWKS: Record<string, string> = {
  '7500': 'Hijack',
  '7600': 'Radio failure',
  '7700': 'General emergency',
};

/** A human label for the aircraft's emergency, or null when there is none. */
export function emergencyLabel(a: Aircraft): string | null {
  if (a.squawk && Object.hasOwn(EMERGENCY_SQUAWKS, a.squawk)) return EMERGENCY_SQUAWKS[a.squawk]!;
  if (a.emergency) return `Emergency: ${a.emergency}`;
  return null;
}

export const isEmergency = (a: Aircraft) => emergencyLabel(a) !== null;

export function matchesQuery(a: Aircraft, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return [a.callsign, a.hex, a.registration, a.typeCode].some((field) => field?.toLowerCase().includes(q));
}

/** Aircraft on the ground count as 0 ft; aircraft with unknown altitude fail any altitude bound. */
function withinAltitude(a: Aircraft, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true;
  const alt = a.onGround ? 0 : a.altitudeFt;
  if (alt === null) return false;
  return (min === null || alt >= min) && (max === null || alt <= max);
}

export function applyFilters(aircraft: Aircraft[], f: Filters): Aircraft[] {
  return aircraft.filter(
    (a) =>
      matchesQuery(a, f.query) &&
      withinAltitude(a, f.minAltitudeFt, f.maxAltitudeFt) &&
      (f.minSpeedKt === null || (a.groundSpeedKt !== null && a.groundSpeedKt >= f.minSpeedKt)) &&
      !(f.hideOnGround && a.onGround) &&
      (!f.militaryOnly || a.military) &&
      (!f.emergencyOnly || isEmergency(a)),
  );
}

export function countActiveFilters(f: Filters): number {
  return (Object.keys(DEFAULT_FILTERS) as Array<keyof Filters>).filter(
    (key) => (key === 'query' ? f.query.trim() !== '' : f[key] !== DEFAULT_FILTERS[key]),
  ).length;
}

export type SortKey = 'callsign' | 'altitude' | 'speed';

const compareNullable = (a: number | string | null, b: number | string | null, desc: boolean) => {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const result = typeof a === 'string' ? a.localeCompare(b as string) : a - (b as number);
  return desc ? -result : result;
};

/** Emergencies always sort first; within each group, sort by `key` with unknown values last. */
export function sortAircraft(aircraft: Aircraft[], key: SortKey): Aircraft[] {
  return [...aircraft].sort((a, b) => {
    const emergencyOrder = Number(isEmergency(b)) - Number(isEmergency(a));
    if (emergencyOrder !== 0) return emergencyOrder;
    switch (key) {
      case 'callsign':
        return compareNullable(a.callsign, b.callsign, false) || a.hex.localeCompare(b.hex);
      case 'altitude':
        return compareNullable(a.onGround ? 0 : a.altitudeFt, b.onGround ? 0 : b.altitudeFt, true);
      case 'speed':
        return compareNullable(a.groundSpeedKt, b.groundSpeedKt, true);
    }
  });
}
