// The published JSON API contract, shared by the collector (writer) and the web app (reader).
//
//   api/v1/meta.json                  -> Meta
//   api/v1/regions/{id}/latest.json   -> Snapshot
//   api/v1/regions/{id}/trails.json   -> Trails

export const API_VERSION = 1;
export const API_ROOT = 'api/v1';

export const metaPath = () => `${API_ROOT}/meta.json`;
export const snapshotPath = (regionId: string) => `${API_ROOT}/regions/${regionId}/latest.json`;
export const trailsPath = (regionId: string) => `${API_ROOT}/regions/${regionId}/trails.json`;

export interface Aircraft {
  /** ICAO 24-bit address in lowercase hex. Prefixed with `~` for non-ICAO (TIS-B) targets. */
  hex: string;
  callsign: string | null;
  registration: string | null;
  /** ICAO type designator, e.g. `B38M`. */
  typeCode: string | null;
  /** ADS-B emitter category, e.g. `A3`. */
  category: string | null;
  lat: number;
  lon: number;
  /** Barometric altitude in feet; null when unknown. Always null when on the ground. */
  altitudeFt: number | null;
  onGround: boolean;
  groundSpeedKt: number | null;
  /** Track over ground in degrees, falling back to heading when track is unavailable. */
  trackDeg: number | null;
  verticalRateFpm: number | null;
  squawk: string | null;
  /** ADS-B emergency status (e.g. `general`, `nordo`); null when there is no emergency. */
  emergency: string | null;
  military: boolean;
  /** Seconds between the last position report and the snapshot's `sourceTime`. */
  seenPosSec: number;
}

export interface Snapshot {
  apiVersion: number;
  regionId: string;
  /** Epoch ms at which the upstream source produced this data. */
  sourceTime: number;
  aircraft: Aircraft[];
}

/** `[lat, lon, altitudeFt | null (null on ground), epochSeconds]`, oldest first. */
export type TrailPoint = [number, number, number | null, number];

export interface Trails {
  apiVersion: number;
  regionId: string;
  generatedAt: number;
  trails: Record<string, TrailPoint[]>;
}

export type RegionKind = 'point' | 'military';

export interface Region {
  id: string;
  name: string;
  kind: RegionKind;
  /** Map centre as `[lat, lon]`. For `point` regions this is also the query centre. */
  center: [number, number];
  /** Query radius in nautical miles (`point` regions only). */
  radiusNm?: number;
  zoom: number;
}

export interface RegionStatus {
  /** True when this run fetched fresh data for the region. */
  fresh: boolean;
  aircraftCount: number;
  /** Epoch ms of the published snapshot's data, or null when there is none. */
  sourceTime: number | null;
  error?: string;
}

export interface Meta {
  apiVersion: number;
  generatedAt: number;
  source: { name: string; url: string; license: string; licenseUrl: string };
  collector: { samples: number; sampleIntervalSec: number; requestGapSec: number };
  regions: Array<Region & { status: RegionStatus }>;
}
