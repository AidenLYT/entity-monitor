import type { Region } from '../shared/model.ts';

// Upstream: https://api.adsb.lol/docs — free, no key, data licensed ODbL.
// Responses are readsb "aircraft.json" objects; only the fields we use are typed here.

export const SOURCE = {
  name: 'adsb.lol',
  url: 'https://adsb.lol',
  license: 'ODbL 1.0',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
};

const API_BASE = 'https://api.adsb.lol';
const USER_AGENT = 'entity-monitor (+https://github.com/AidenLYT/entity-monitor)';
/** The API rejects larger point radii. */
const MAX_RADIUS_NM = 250;

export interface RawAircraft {
  hex: string;
  flight?: string;
  r?: string;
  t?: string;
  category?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | 'ground';
  gs?: number;
  track?: number;
  true_heading?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  /** Bit 0 set means military. */
  dbFlags?: number;
  seen_pos?: number;
}

export interface RawResponse {
  ac: RawAircraft[];
  /** Epoch ms. */
  now: number;
  msg?: string;
}

export function regionUrl(region: Region): string {
  if (region.kind === 'military') return `${API_BASE}/v2/mil`;
  const [lat, lon] = region.center;
  const radius = Math.min(region.radiusNm ?? MAX_RADIUS_NM, MAX_RADIUS_NM);
  return `${API_BASE}/v2/point/${lat}/${lon}/${radius}`;
}

export type FetchRegion = (region: Region) => Promise<RawResponse>;

export interface FetchRegionOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Waits before each retry of a 429 or 5xx. The API sends no Retry-After, so back off generously. */
  retryDelaysMs?: number[];
  sleep?: (ms: number) => Promise<void>;
}

const isRetryable = (status: number) => status === 429 || status >= 500;

export function createFetchRegion({
  fetchImpl = fetch,
  timeoutMs = 20_000,
  retryDelaysMs = [15_000, 30_000],
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: FetchRegionOptions = {}): FetchRegion {
  return async (region) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(regionUrl(region), {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const delay = retryDelaysMs[attempt];
        if (isRetryable(res.status) && delay !== undefined) {
          await sleep(delay);
          continue;
        }
        throw new Error(`adsb.lol responded ${res.status} for ${region.id}`);
      }
      const body = (await res.json()) as Partial<RawResponse>;
      if (!Array.isArray(body.ac) || typeof body.now !== 'number') {
        throw new Error(`adsb.lol returned an unexpected payload for ${region.id}`);
      }
      return { ac: body.ac, now: body.now, msg: body.msg };
    }
  };
}
