import { describe, expect, it, vi } from 'vitest';
import type { Region } from '../../shared/model.ts';
import { UpstreamError, type FetchRegion, type RawResponse } from '../../collector/adsblol.ts';
import { handleRequest } from './handler.ts';
import { createRelay } from './relay.ts';

const london: Region = { id: 'london', name: 'London', kind: 'point', center: [51.47, -0.45], radiusNm: 150, zoom: 7 };
const ORIGIN = 'https://aidenlyt.github.io';

const upstream = (lat = 51): RawResponse => ({ now: 1_790_000_000_000, ac: [{ hex: 'abc123', lat, lon: 0, seen_pos: 0 }] });

function setup(fetchRegion: FetchRegion) {
  let clock = 0;
  const relay = createRelay({ regions: [london], fetchRegion, ttlMs: 5_000, staleMs: 60_000, now: () => clock });
  return { relay, advance: (ms: number) => (clock += ms) };
}

const request = (path: string, init: RequestInit & { origin?: string } = {}) =>
  new Request(`https://relay.example${path}`, {
    ...init,
    headers: { ...(init.origin !== undefined ? { Origin: init.origin } : { Origin: ORIGIN }) },
  });

describe('createRelay', () => {
  it('serves from memory within the TTL and refetches after it', async () => {
    const fetchRegion = vi.fn<FetchRegion>(async () => upstream());
    const { relay, advance } = setup(fetchRegion);

    expect((await relay.get('london')).cache).toBe('miss');
    advance(4_000);
    expect(await relay.get('london')).toMatchObject({ cache: 'hit', ageMs: 4_000 });
    advance(2_000);
    expect((await relay.get('london')).cache).toBe('miss');
    expect(fetchRegion).toHaveBeenCalledTimes(2);
  });

  it('collapses concurrent requests into one upstream call', async () => {
    const fetchRegion = vi.fn<FetchRegion>(async () => upstream());
    const { relay } = setup(fetchRegion);
    await Promise.all([relay.get('london'), relay.get('london'), relay.get('london')]);
    expect(fetchRegion).toHaveBeenCalledTimes(1);
  });

  it('serves the last good snapshot when upstream fails, and backs off after a 429', async () => {
    const fetchRegion = vi
      .fn<FetchRegion>()
      .mockResolvedValueOnce(upstream(51))
      .mockRejectedValueOnce(new UpstreamError(429, 'london'))
      .mockResolvedValue(upstream(52));
    const { relay, advance } = setup(fetchRegion);

    await relay.get('london');
    advance(6_000);
    const stale = await relay.get('london');
    expect(stale.cache).toBe('stale');
    expect(stale.snapshot.aircraft[0]!.lat).toBe(51);

    advance(6_000); // still inside the 15 s back-off: upstream is not called
    expect((await relay.get('london')).cache).toBe('stale');
    expect(fetchRegion).toHaveBeenCalledTimes(2);

    advance(10_000);
    const fresh = await relay.get('london');
    expect(fresh.cache).toBe('miss');
    expect(fresh.snapshot.aircraft[0]!.lat).toBe(52);
  });

  it('fails when upstream is down and nothing usable is cached', async () => {
    const { relay } = setup(async () => {
      throw new UpstreamError(500, 'london');
    });
    await expect(relay.get('london')).rejects.toThrow('500');
  });
});

describe('handleRequest', () => {
  const okRelay = () => setup(async () => upstream()).relay;

  it('returns the live snapshot with CORS for allowed origins', async () => {
    const res = await handleRequest(request('/v1/regions/london/live'), okRelay(), [ORIGIN]);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('X-Relay-Cache')).toBe('miss');
    expect(res.headers.get('X-Snapshot-Age')).toBe('0');
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('X-Snapshot-Age');
    expect(await res.json()).toMatchObject({ regionId: 'london', aircraft: [{ hex: 'abc123' }] });
  });

  it('omits CORS headers for other origins', async () => {
    const res = await handleRequest(request('/v1/regions/london/live', { origin: 'https://evil.example' }), okRelay(), [ORIGIN]);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('answers preflight, health, unknown routes and unknown regions', async () => {
    const relay = okRelay();
    expect((await handleRequest(request('/v1/regions/london/live', { method: 'OPTIONS' }), relay, [ORIGIN])).status).toBe(204);
    expect(await (await handleRequest(request('/v1/health'), relay, [ORIGIN])).json()).toEqual({ ok: true });
    expect((await handleRequest(request('/nope'), relay, [ORIGIN])).status).toBe(404);
    expect((await handleRequest(request('/v1/regions/mars/live'), relay, [ORIGIN])).status).toBe(404);
    expect((await handleRequest(request('/v1/health', { method: 'POST' }), relay, [ORIGIN])).status).toBe(405);
  });

  it('maps upstream rate limiting to 503 with Retry-After', async () => {
    const { relay } = setup(async () => {
      throw new UpstreamError(429, 'london');
    });
    const res = await handleRequest(request('/v1/regions/london/live'), relay, [ORIGIN]);
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('15');
  });
});
