import { describe, expect, it } from 'vitest';
import type { Aircraft, Snapshot } from './model.ts';
import { mergeTrails } from './trails.ts';

const T0 = 1_790_000_000; // epoch seconds

function aircraft(hex: string, lat: number, lon: number, extra: Partial<Aircraft> = {}): Aircraft {
  return {
    hex,
    callsign: null,
    registration: null,
    typeCode: null,
    category: null,
    lat,
    lon,
    altitudeFt: 10000,
    onGround: false,
    groundSpeedKt: null,
    trackDeg: null,
    verticalRateFpm: null,
    squawk: null,
    emergency: null,
    military: false,
    seenPosSec: 0,
    ...extra,
  };
}

const snapshot = (sec: number, list: Aircraft[]): Snapshot => ({
  apiVersion: 1,
  regionId: 'r',
  sourceTime: sec * 1000,
  aircraft: list,
});

describe('mergeTrails', () => {
  it('appends positions timestamped by when they were reported', () => {
    let trails = mergeTrails({}, snapshot(T0, [aircraft('a', 51, 0, { seenPosSec: 4 })]));
    trails = mergeTrails(trails, snapshot(T0 + 60, [aircraft('a', 51.1, 0.1)]));
    expect(trails).toEqual({
      a: [
        [51, 0, 10000, T0 - 4],
        [51.1, 0.1, 10000, T0 + 60],
      ],
    });
  });

  it('skips a point that is not newer or has not moved', () => {
    const first = mergeTrails({}, snapshot(T0, [aircraft('a', 51, 0)]));
    expect(mergeTrails(first, snapshot(T0, [aircraft('a', 52, 0)])).a).toHaveLength(1);
    expect(mergeTrails(first, snapshot(T0 + 60, [aircraft('a', 51, 0)])).a).toHaveLength(1);
  });

  it('thins points closer together than minSpacingSec', () => {
    let trails = mergeTrails({}, snapshot(T0, [aircraft('a', 51, 0)]));
    trails = mergeTrails(trails, snapshot(T0 + 5, [aircraft('a', 51.01, 0)]), { minSpacingSec: 20 });
    expect(trails.a).toHaveLength(1);
    trails = mergeTrails(trails, snapshot(T0 + 25, [aircraft('a', 51.05, 0)]), { minSpacingSec: 20 });
    expect(trails.a).toHaveLength(2);
  });

  it('keeps trails of aircraft missing from the snapshot until they expire', () => {
    const first = mergeTrails({}, snapshot(T0, [aircraft('gone', 51, 0)]));
    expect(mergeTrails(first, snapshot(T0 + 60, [])).gone).toHaveLength(1);
    expect(mergeTrails(first, snapshot(T0 + 3600, []), { maxAgeSec: 1800 }).gone).toBeUndefined();
  });

  it('caps each trail to the most recent points', () => {
    let trails = {};
    for (let i = 0; i < 5; i++) {
      trails = mergeTrails(trails, snapshot(T0 + i * 60, [aircraft('a', 51 + i / 10, 0)]), { maxPoints: 3 });
    }
    expect((trails as Record<string, unknown[]>).a).toHaveLength(3);
    expect((trails as Record<string, number[][]>).a![0]![3]).toBe(T0 + 120);
  });

  it('records ground positions with null altitude and does not mutate its input', () => {
    const previous = { a: [[50, 0, 3000, T0 - 60] as [number, number, number | null, number]] };
    const next = mergeTrails(previous, snapshot(T0, [aircraft('a', 50.5, 0, { altitudeFt: null, onGround: true })]));
    expect(next.a!.at(-1)).toEqual([50.5, 0, null, T0]);
    expect(previous.a).toHaveLength(1);
  });
});
