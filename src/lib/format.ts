import type { Aircraft } from '../../shared/model.ts';

const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatAltitude(a: Pick<Aircraft, 'altitudeFt' | 'onGround'>): string {
  if (a.onGround) return 'Ground';
  return a.altitudeFt === null ? '—' : `${nf.format(a.altitudeFt)} ft`;
}

export const formatSpeed = (kt: number | null) => (kt === null ? '—' : `${nf.format(kt)} kt`);

export const formatTrack = (deg: number | null) => (deg === null ? '—' : `${nf.format(deg)}°`);

export function formatVerticalRate(fpm: number | null): string {
  if (fpm === null) return '—';
  if (Math.abs(fpm) < 64) return 'Level';
  return `${fpm > 0 ? '▲' : '▼'} ${nf.format(Math.abs(fpm))} ft/min`;
}

export function formatAge(ms: number): string {
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export const formatPosition = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;

export const ALTITUDE_SCALE_MAX_FT = 40_000;
export const GROUND_COLOR = '#8b929c';

/** Low (orange) through green and blue to high (magenta), bucketed to 1,000 ft. */
export function altitudeColor(altitudeFt: number | null, onGround = false): string {
  if (onGround || altitudeFt === null) return GROUND_COLOR;
  const bucket = Math.min(Math.max(Math.round(altitudeFt / 1000) * 1000, 0), ALTITUDE_SCALE_MAX_FT);
  const hue = 20 + (bucket / ALTITUDE_SCALE_MAX_FT) * 280;
  return `hsl(${Math.round(hue)} 80% 45%)`;
}

const CATEGORY_LABELS: Record<string, string> = {
  A1: 'Light (< 15,500 lb)',
  A2: 'Small (15,500–75,000 lb)',
  A3: 'Large (75,000–300,000 lb)',
  A4: 'High vortex large',
  A5: 'Heavy (> 300,000 lb)',
  A6: 'High performance',
  A7: 'Rotorcraft',
  B1: 'Glider / sailplane',
  B2: 'Lighter-than-air',
  B3: 'Parachutist / skydiver',
  B4: 'Ultralight / hang-glider',
  B6: 'Unmanned aerial vehicle',
  B7: 'Space vehicle',
  C1: 'Surface emergency vehicle',
  C2: 'Surface service vehicle',
  C3: 'Ground obstruction',
};

export const categoryLabel = (category: string | null) =>
  category === null ? '—' : (CATEGORY_LABELS[category] ?? category);

export const displayName = (a: Pick<Aircraft, 'callsign' | 'registration' | 'hex'>) =>
  a.callsign ?? a.registration ?? a.hex.toUpperCase();
