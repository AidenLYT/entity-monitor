import { describe, expect, it, vi } from 'vitest';
import type { Region, Snapshot } from '../shared/model.ts';
import type { FetchRegion, RawResponse } from './adsblol.ts';
import { collect } from './collect.ts';

const london: Region = { id: 'london', name: 'London', kind: 'point', center: [51.47, -0.45], radiusNm: 150, zoom: 7 };
const mil: Region = { id: 'military', name: 'Military', kind: 'military', center: [30, 0], zoom: 2 };

const response = (nowMs: number, lat: number): RawResponse => ({
  now: nowMs,
  ac: [{ hex: 'abc123', lat, lon: 0, alt_baro: 30000, seen_pos: 0 }],
});

const previousSnapshot: Snapshot = {
  apiVersion: 1,
  regionId: 'military',
  sourceTime: 1_000_000,
  aircraft: [],
};

const noPrevious = async () => ({ snapshot: null, trails: null });

describe('collect', () => {
  it('takes several samples and builds trails from them', async () => {
    let call = 0;
    const fetchRegion: FetchRegion = async () => response(1_790_000_000_000 + call * 60_000, 50 + call++ / 10);
    const sleep = vi.fn(async () => {});

    const { outputs, meta } = await collect({
      regions: [london],
      fetchRegion,
      loadPrevious: noPrevious,
      samples: 3,
      sampleIntervalSec: 60,
      sleep,
      now: () => 42,
    });

    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(60_000);
    expect(outputs[0]!.trails.trails.abc123).toHaveLength(3);
    expect(outputs[0]!.snapshot.aircraft[0]!.lat).toBe(50.2);
    expect(meta).toMatchObject({ generatedAt: 42, collector: { samples: 3, sampleIntervalSec: 60, requestGapSec: 0 } });
    expect(meta.regions[0]!.status).toEqual({ fresh: true, aircraftCount: 1, sourceTime: 1_790_000_120_000 });
  });

  it('spaces out requests within a sample', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    await collect({
      regions: [london, mil],
      fetchRegion: async () => response(1_790_000_000_000, 51),
      loadPrevious: noPrevious,
      samples: 2,
      sampleIntervalSec: 60,
      requestGapSec: 5,
      sleep,
    });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5_000, 60_000, 5_000]);
  });

  it('republishes the previous snapshot and trails when a region fails, without affecting others', async () => {
    const fetchRegion: FetchRegion = async (region) => {
      if (region.id === 'military') throw new Error('adsb.lol responded 503 for military');
      return response(1_790_000_000_000, 51);
    };
    const previousTrails = { apiVersion: 1, regionId: 'military', generatedAt: 1, trails: { xyz: [[1, 2, 3, 4]] } };

    const { outputs } = await collect({
      regions: [london, mil],
      fetchRegion,
      loadPrevious: async (region) =>
        region.id === 'military' ? { snapshot: previousSnapshot, trails: previousTrails as never } : noPrevious(),
      samples: 1,
      sampleIntervalSec: 60,
    });

    const [ok, failed] = outputs;
    expect(ok!.status.fresh).toBe(true);
    expect(failed!.snapshot).toBe(previousSnapshot);
    expect(failed!.trails.trails).toEqual(previousTrails.trails);
    expect(failed!.status).toEqual({
      fresh: false,
      aircraftCount: 0,
      sourceTime: 1_000_000,
      error: 'adsb.lol responded 503 for military',
    });
  });

  it('publishes an empty snapshot when there is neither fresh nor previous data', async () => {
    const { outputs } = await collect({
      regions: [london],
      fetchRegion: async () => {
        throw new Error('down');
      },
      loadPrevious: async () => {
        throw new Error('404');
      },
      samples: 1,
      sampleIntervalSec: 60,
    });
    expect(outputs[0]!.snapshot.aircraft).toEqual([]);
    expect(outputs[0]!.status).toMatchObject({ fresh: false, sourceTime: null, error: 'down' });
  });
});
