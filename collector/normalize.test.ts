import { describe, expect, it } from 'vitest';
import type { RawResponse } from './adsblol.ts';
import fixture from './__fixtures__/adsblol-point.json' with { type: 'json' };
import { normalizeAircraft, toSnapshot } from './normalize.ts';

const response = fixture as RawResponse;
const raw = (hex: string) => response.ac.find((a) => a.hex === hex)!;

describe('normalizeAircraft', () => {
  it('maps an airborne aircraft', () => {
    expect(normalizeAircraft(raw('4cadbe'))).toEqual({
      hex: '4cadbe',
      callsign: 'RYR89XA',
      registration: 'EI-IGL',
      typeCode: 'B38M',
      category: 'A3',
      lat: 52.79892,
      lon: -6.63071,
      altitudeFt: 20200,
      onGround: false,
      groundSpeedKt: 375.5,
      trackDeg: 213.3,
      verticalRateFpm: 1856,
      squawk: '3610',
      emergency: null,
      military: false,
      seenPosSec: 0.2,
    });
  });

  it('treats "ground" altitude as on-ground and falls back to heading for track', () => {
    const a = normalizeAircraft(raw('4ca92d'))!;
    expect(a.onGround).toBe(true);
    expect(a.altitudeFt).toBeNull();
    expect(a.trackDeg).toBe(174.4);
  });

  it('flags military aircraft and emergencies, lowercases hex and uses geometric rate as fallback', () => {
    const a = normalizeAircraft(raw('AE266C'))!;
    expect(a).toMatchObject({ hex: 'ae266c', military: true, emergency: 'general', verticalRateFpm: 256 });
  });

  it('drops aircraft without a position or with a stale one', () => {
    expect(normalizeAircraft(raw('406abc'))).toBeNull();
    expect(normalizeAircraft(raw('400123'))).toBeNull();
  });

  it('treats an all-placeholder callsign as missing', () => {
    expect(normalizeAircraft({ ...raw('4cadbe'), flight: '@@@@@@@@' })?.callsign).toBeNull();
  });

  it('drops fixed ground transmitters', () => {
    expect(normalizeAircraft({ hex: '42584b', r: 'TWR', t: 'TWR', alt_baro: 'ground', lat: 51.47, lon: -0.45 })).toBeNull();
  });

  it('keeps non-ICAO targets with their ~ prefix', () => {
    expect(normalizeAircraft(raw('~2a0b1c'))?.hex).toBe('~2a0b1c');
  });
});

describe('toSnapshot', () => {
  it('keeps positioned aircraft sorted by hex, stamped with the source time', () => {
    const snapshot = toSnapshot('london', response);
    expect(snapshot).toMatchObject({ apiVersion: 1, regionId: 'london', sourceTime: 1790227328001 });
    expect(snapshot.aircraft.map((a) => a.hex)).toEqual(['4ca92d', '4cadbe', 'ae266c', '~2a0b1c']);
  });

  it('keeps the freshest report when a hex appears twice', () => {
    const older = { ...raw('4cadbe'), lat: 50, seen_pos: 10 };
    const snapshot = toSnapshot('x', { now: 0, ac: [older, raw('4cadbe')] });
    expect(snapshot.aircraft).toHaveLength(1);
    expect(snapshot.aircraft[0]!.lat).toBe(52.79892);
  });
});
