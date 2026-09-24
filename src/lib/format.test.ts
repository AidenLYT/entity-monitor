import { describe, expect, it } from 'vitest';
import {
  altitudeColor,
  displayName,
  formatAge,
  formatAltitude,
  formatPosition,
  formatVerticalRate,
  GROUND_COLOR,
} from './format.ts';

describe('format helpers', () => {
  it('formats altitude, including ground and unknown', () => {
    expect(formatAltitude({ altitudeFt: 37000, onGround: false })).toBe('37,000 ft');
    expect(formatAltitude({ altitudeFt: null, onGround: true })).toBe('Ground');
    expect(formatAltitude({ altitudeFt: null, onGround: false })).toBe('—');
  });

  it('formats vertical rate with direction and a level band', () => {
    expect(formatVerticalRate(1856)).toBe('▲ 1,856 ft/min');
    expect(formatVerticalRate(-640)).toBe('▼ 640 ft/min');
    expect(formatVerticalRate(32)).toBe('Level');
  });

  it('formats relative ages', () => {
    expect(formatAge(20_000)).toBe('just now');
    expect(formatAge(5 * 60_000)).toBe('5 min ago');
    expect(formatAge(3 * 3_600_000)).toBe('3 h ago');
  });

  it('formats positions with hemispheres', () => {
    expect(formatPosition(51.47, -0.45)).toBe('51.4700°N 0.4500°W');
  });

  it('colours by altitude, clamping above the scale and greying ground', () => {
    expect(altitudeColor(null, true)).toBe(GROUND_COLOR);
    expect(altitudeColor(0)).toBe('hsl(20 80% 45%)');
    expect(altitudeColor(55_000)).toBe(altitudeColor(40_000));
  });

  it('names aircraft by callsign, then registration, then hex', () => {
    expect(displayName({ callsign: 'BAW1', registration: 'G-X', hex: 'abc' })).toBe('BAW1');
    expect(displayName({ callsign: null, registration: 'G-X', hex: 'abc' })).toBe('G-X');
    expect(displayName({ callsign: null, registration: null, hex: 'abc' })).toBe('ABC');
  });
});
