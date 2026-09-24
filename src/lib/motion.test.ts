import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../../shared/model.ts';
import { MAX_PROJECTION_SEC, projectPosition } from './motion.ts';

const base: Aircraft = {
  hex: 'abc123',
  callsign: null,
  registration: null,
  typeCode: null,
  category: null,
  lat: 0,
  lon: 0,
  altitudeFt: 35000,
  onGround: false,
  groundSpeedKt: 3600, // 1 nm per second keeps the arithmetic readable
  trackDeg: 90,
  verticalRateFpm: null,
  squawk: null,
  emergency: null,
  military: false,
  seenPosSec: 0,
};

const T = 1_790_000_000_000;
const NM_PER_DEG = 60.0405; // at the equator on a 3440.065 nm sphere

describe('projectPosition', () => {
  it('moves along the track at ground speed', () => {
    const [lat, lon] = projectPosition(base, T, T + 10_000);
    expect(lat).toBeCloseTo(0, 6);
    expect(lon * NM_PER_DEG).toBeCloseTo(10, 2);

    const [northLat] = projectPosition({ ...base, trackDeg: 0 }, T, T + 6_000);
    expect(northLat * NM_PER_DEG).toBeCloseTo(6, 2);
  });

  it('counts the age of the position report', () => {
    const [, lon] = projectPosition({ ...base, seenPosSec: 3 }, T, T + 2_000);
    expect(lon * NM_PER_DEG).toBeCloseTo(5, 2);
  });

  it('caps projection time and never projects backwards', () => {
    const [, far] = projectPosition(base, T, T + 10 * 60_000);
    expect(far * NM_PER_DEG).toBeCloseTo(MAX_PROJECTION_SEC, 2);
    expect(projectPosition(base, T, T - 5_000)).toEqual([0, 0]);
  });

  it('leaves stationary or directionless aircraft in place', () => {
    expect(projectPosition({ ...base, groundSpeedKt: 0 }, T, T + 5_000)).toEqual([0, 0]);
    expect(projectPosition({ ...base, trackDeg: null }, T, T + 5_000)).toEqual([0, 0]);
  });

  it('wraps across the antimeridian', () => {
    const [, lon] = projectPosition({ ...base, lon: 179.99 }, T, T + 10_000);
    expect(lon).toBeLessThan(-179.8);
  });
});
