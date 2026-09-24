import type { Region, Snapshot } from '../../shared/model.ts';
import { UpstreamError, type FetchRegion } from '../../collector/adsblol.ts';
import { toSnapshot } from '../../collector/normalize.ts';

// The Cache API is a no-op on *.workers.dev, so caching lives in isolate memory. An isolate
// serves many requests, which is enough to collapse concurrent viewers into one upstream call.

export type CacheStatus = 'hit' | 'miss' | 'stale';

export interface RelayOptions {
  regions: Region[];
  fetchRegion: FetchRegion;
  /** How long a fetched snapshot is served before refetching. */
  ttlMs: number;
  /** How long an old snapshot may stand in when upstream is failing. */
  staleMs?: number;
  /** After a 429, how long to stop calling upstream at all (the limit is per IP). */
  rateLimitBackoffMs?: number;
  now?: () => number;
}

interface Entry {
  snapshot: Snapshot;
  fetchedAt: number;
}

export class RegionNotFoundError extends Error {}

export function createRelay({
  regions,
  fetchRegion,
  ttlMs,
  staleMs = 10 * 60_000,
  rateLimitBackoffMs = 15_000,
  now = Date.now,
}: RelayOptions) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, Promise<Entry>>();
  let backoffUntil = 0;

  const usableStale = (entry: Entry | undefined) => entry !== undefined && now() - entry.fetchedAt < staleMs;

  function refresh(region: Region): Promise<Entry> {
    let pending = inflight.get(region.id);
    if (!pending) {
      pending = fetchRegion(region)
        .then((raw) => {
          const entry = { snapshot: toSnapshot(region.id, raw), fetchedAt: now() };
          cache.set(region.id, entry);
          return entry;
        })
        .finally(() => inflight.delete(region.id));
      inflight.set(region.id, pending);
    }
    return pending;
  }

  const result = (entry: Entry, cache: CacheStatus) => ({ snapshot: entry.snapshot, cache, ageMs: now() - entry.fetchedAt });

  /**
   * The freshest snapshot available for a region, fetching upstream at most once per `ttlMs`.
   * `ageMs` is how long ago it was fetched, measured on this machine's clock only.
   */
  async function get(regionId: string): Promise<{ snapshot: Snapshot; cache: CacheStatus; ageMs: number }> {
    const region = byId.get(regionId);
    if (!region) throw new RegionNotFoundError(`Unknown region ${regionId}`);

    const cached = cache.get(regionId);
    if (cached && now() - cached.fetchedAt < ttlMs) return result(cached, 'hit');

    if (now() < backoffUntil) {
      if (usableStale(cached)) return result(cached!, 'stale');
      throw new UpstreamError(429, regionId);
    }

    try {
      return result(await refresh(region), 'miss');
    } catch (err) {
      if (err instanceof UpstreamError && err.status === 429) backoffUntil = now() + rateLimitBackoffMs;
      if (usableStale(cached)) return result(cached!, 'stale');
      throw err;
    }
  }

  return { get };
}

export type Relay = ReturnType<typeof createRelay>;
