import { describe, expect, it, vi } from 'vitest';
import type { Region } from '../shared/model.ts';
import { createFetchRegion, regionUrl } from './adsblol.ts';

const london: Region = { id: 'london', name: 'London', kind: 'point', center: [51.47, -0.45], radiusNm: 400, zoom: 7 };
const mil: Region = { id: 'military', name: 'Military', kind: 'military', center: [30, 0], zoom: 2 };

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('regionUrl', () => {
  it('builds point queries, clamping the radius to the API maximum', () => {
    expect(regionUrl(london)).toBe('https://api.adsb.lol/v2/point/51.47/-0.45/250');
    expect(regionUrl(mil)).toBe('https://api.adsb.lol/v2/mil');
  });
});

describe('createFetchRegion', () => {
  it('retries rate-limited requests with the configured backoff', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ ac: [], now: 1 }));
    const sleep = vi.fn(async () => {});
    const result = await createFetchRegion({ fetchImpl, sleep, retryDelaysMs: [100, 200] })(mil);
    expect(result).toEqual({ ac: [], now: 1, msg: undefined });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(100);
  });

  it('gives up after the last retry and does not retry client errors', async () => {
    const sleep = vi.fn(async () => {});
    const limited = createFetchRegion({ fetchImpl: async () => json({}, 429), sleep, retryDelaysMs: [1, 1] });
    await expect(limited(mil)).rejects.toThrow('adsb.lol responded 429 for military');
    expect(sleep).toHaveBeenCalledTimes(2);

    const notFound = createFetchRegion({ fetchImpl: async () => json({}, 404), sleep: vi.fn(), retryDelaysMs: [1] });
    await expect(notFound(mil)).rejects.toThrow('404');
  });

  it('rejects payloads that are not aircraft lists', async () => {
    const fetchRegion = createFetchRegion({ fetchImpl: async () => json({ error: 'x' }) });
    await expect(fetchRegion(mil)).rejects.toThrow('unexpected payload');
  });
});
