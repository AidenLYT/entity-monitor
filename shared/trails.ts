import type { Snapshot, TrailPoint } from './model.ts';

export const TRAIL_MAX_AGE_SEC = 45 * 60;
export const TRAIL_MAX_POINTS = 60;

type TrailMap = Record<string, TrailPoint[]>;

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Appends each aircraft's position in `snapshot` to its trail, then expires old points.
 * Aircraft missing from the snapshot keep their trail until it ages out, so a track
 * resumes if the aircraft reappears. Pure: `previous` is not mutated.
 *
 * `minSpacingSec` thins frequent updates (the live feed arrives every few seconds) so
 * `maxPoints` still covers a useful stretch of time.
 */
export function mergeTrails(
  previous: TrailMap,
  snapshot: Snapshot,
  { maxAgeSec = TRAIL_MAX_AGE_SEC, maxPoints = TRAIL_MAX_POINTS, minSpacingSec = 0 } = {},
): TrailMap {
  const nowSec = Math.floor(snapshot.sourceTime / 1000);
  const next: TrailMap = {};
  for (const [hex, points] of Object.entries(previous)) next[hex] = [...points];

  for (const a of snapshot.aircraft) {
    const t = Math.round(nowSec - a.seenPosSec);
    const point: TrailPoint = [round4(a.lat), round4(a.lon), a.altitudeFt, t];
    const trail = (next[a.hex] ??= []);
    const last = trail.at(-1);
    if (last && (t - last[3] < Math.max(minSpacingSec, 1) || (last[0] === point[0] && last[1] === point[1]))) continue;
    trail.push(point);
  }

  const cutoff = nowSec - maxAgeSec;
  for (const [hex, points] of Object.entries(next)) {
    const kept = points.filter((p) => p[3] >= cutoff).slice(-maxPoints);
    if (kept.length === 0) delete next[hex];
    else next[hex] = kept;
  }
  return next;
}
