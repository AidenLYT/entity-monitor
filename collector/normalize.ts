import { API_VERSION, type Aircraft, type Snapshot } from '../shared/model.ts';
import type { RawAircraft, RawResponse } from './adsblol.ts';

/** Positions older than this are dropped rather than shown at a stale location. */
export const MAX_POSITION_AGE_SEC = 60;

/** Type codes for fixed transmitters (e.g. airport tower beacons) that are not aircraft. */
const NON_AIRCRAFT_TYPES = new Set(['TWR']);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
};
const round = (v: number | null, digits: number): number | null =>
  v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits;

export function normalizeAircraft(raw: RawAircraft): Aircraft | null {
  const lat = num(raw.lat);
  const lon = num(raw.lon);
  const hex = str(raw.hex);
  if (lat === null || lon === null || hex === null) return null;
  if (raw.t && NON_AIRCRAFT_TYPES.has(raw.t)) return null;

  const seenPosSec = num(raw.seen_pos) ?? 0;
  if (seenPosSec > MAX_POSITION_AGE_SEC) return null;

  const onGround = raw.alt_baro === 'ground';
  const emergency = str(raw.emergency);

  return {
    hex: hex.toLowerCase(),
    callsign: str(raw.flight),
    registration: str(raw.r),
    typeCode: str(raw.t),
    category: str(raw.category),
    lat: round(lat, 5)!,
    lon: round(lon, 5)!,
    altitudeFt: onGround ? null : num(raw.alt_baro),
    onGround,
    groundSpeedKt: round(num(raw.gs), 1),
    trackDeg: round(num(raw.track) ?? num(raw.true_heading), 1),
    verticalRateFpm: num(raw.baro_rate) ?? num(raw.geom_rate),
    squawk: str(raw.squawk),
    emergency: emergency === 'none' ? null : emergency,
    military: ((raw.dbFlags ?? 0) & 1) === 1,
    seenPosSec: round(seenPosSec, 1)!,
  };
}

export function toSnapshot(regionId: string, response: RawResponse): Snapshot {
  const byHex = new Map<string, Aircraft>();
  for (const raw of response.ac) {
    const aircraft = normalizeAircraft(raw);
    if (!aircraft) continue;
    const existing = byHex.get(aircraft.hex);
    if (!existing || aircraft.seenPosSec < existing.seenPosSec) byHex.set(aircraft.hex, aircraft);
  }
  // Code-unit order, not localeCompare, so output is byte-identical across machines.
  const aircraft = [...byHex.values()].sort((a, b) => (a.hex < b.hex ? -1 : a.hex > b.hex ? 1 : 0));
  return { apiVersion: API_VERSION, regionId, sourceTime: response.now, aircraft };
}
