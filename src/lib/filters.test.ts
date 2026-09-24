import { describe, expect, it } from 'vitest';
import type { Aircraft } from '../../shared/model.ts';
import {
  applyFilters,
  countActiveFilters,
  DEFAULT_FILTERS,
  emergencyLabel,
  matchesQuery,
  sortAircraft,
} from './filters.ts';

function aircraft(hex: string, extra: Partial<Aircraft> = {}): Aircraft {
  return {
    hex,
    callsign: null,
    registration: null,
    typeCode: null,
    category: null,
    lat: 0,
    lon: 0,
    altitudeFt: null,
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

const ba = aircraft('400abc', { callsign: 'BAW123', registration: 'G-XWBA', typeCode: 'A35K', altitudeFt: 37000, groundSpeedKt: 480 });
const taxiing = aircraft('4ca92d', { callsign: 'EIN440', onGround: true, groundSpeedKt: 15 });
const heli = aircraft('ae266c', { callsign: 'C6518', military: true, altitudeFt: 400, groundSpeedKt: 90, squawk: '7700' });
const unknown = aircraft('~2a0b1c');
const all = [ba, taxiing, heli, unknown];

const hexes = (list: Aircraft[]) => list.map((a) => a.hex);

describe('matchesQuery', () => {
  it('matches callsign, hex, registration or type, case-insensitively', () => {
    expect(matchesQuery(ba, 'baw')).toBe(true);
    expect(matchesQuery(ba, '400ABC')).toBe(true);
    expect(matchesQuery(ba, 'g-xw')).toBe(true);
    expect(matchesQuery(ba, 'a35k')).toBe(true);
    expect(matchesQuery(ba, 'EZY')).toBe(false);
    expect(matchesQuery(ba, '   ')).toBe(true);
  });
});

describe('applyFilters', () => {
  it('returns everything with default filters', () => {
    expect(applyFilters(all, DEFAULT_FILTERS)).toEqual(all);
  });

  it('counts ground as 0 ft and excludes unknown altitude when an altitude bound is set', () => {
    expect(hexes(applyFilters(all, { ...DEFAULT_FILTERS, maxAltitudeFt: 1000 }))).toEqual(['4ca92d', 'ae266c']);
    expect(hexes(applyFilters(all, { ...DEFAULT_FILTERS, minAltitudeFt: 10000 }))).toEqual(['400abc']);
  });

  it('filters by minimum speed, excluding unknown speed', () => {
    expect(hexes(applyFilters(all, { ...DEFAULT_FILTERS, minSpeedKt: 50 }))).toEqual(['400abc', 'ae266c']);
  });

  it('applies the on-ground, military and emergency toggles', () => {
    expect(hexes(applyFilters(all, { ...DEFAULT_FILTERS, hideOnGround: true }))).not.toContain('4ca92d');
    expect(hexes(applyFilters(all, { ...DEFAULT_FILTERS, militaryOnly: true }))).toEqual(['ae266c']);
    expect(hexes(applyFilters(all, { ...DEFAULT_FILTERS, emergencyOnly: true }))).toEqual(['ae266c']);
  });
});

describe('emergencyLabel', () => {
  it('prefers the squawk meaning, then the ADS-B emergency status', () => {
    expect(emergencyLabel(heli)).toBe('General emergency');
    expect(emergencyLabel(aircraft('x', { emergency: 'nordo' }))).toBe('Emergency: nordo');
    expect(emergencyLabel(ba)).toBeNull();
  });
});

describe('countActiveFilters', () => {
  it('counts filters that differ from the defaults, ignoring blank queries', () => {
    expect(countActiveFilters({ ...DEFAULT_FILTERS, query: '  ' })).toBe(0);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, query: 'BAW', militaryOnly: true, minSpeedKt: 0 })).toBe(3);
  });
});

describe('sortAircraft', () => {
  it('puts emergencies first, then sorts by the key with unknown values last', () => {
    expect(hexes(sortAircraft(all, 'callsign'))).toEqual(['ae266c', '400abc', '4ca92d', '~2a0b1c']);
    expect(hexes(sortAircraft(all, 'altitude'))).toEqual(['ae266c', '400abc', '4ca92d', '~2a0b1c']);
    expect(hexes(sortAircraft(all, 'speed'))).toEqual(['ae266c', '400abc', '4ca92d', '~2a0b1c']);
  });

  it('does not mutate its input', () => {
    const input = [taxiing, ba];
    sortAircraft(input, 'callsign');
    expect(input).toEqual([taxiing, ba]);
  });
});
