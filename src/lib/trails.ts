import type { TrailPoint } from '../../shared/model.ts';
import { altitudeColor } from './format.ts';

/** Gaps longer than this are drawn as breaks rather than a straight jump across the map. */
export const MAX_TRAIL_GAP_SEC = 20 * 60;

export type LatLng = [number, number];

/** Splits a trail into continuous runs, breaking wherever consecutive points are too far apart in time. */
export function splitTrail(points: TrailPoint[], maxGapSec = MAX_TRAIL_GAP_SEC): LatLng[][] {
  const runs: LatLng[][] = [];
  let current: LatLng[] = [];
  let lastTime: number | null = null;
  for (const [lat, lon, , t] of points) {
    if (lastTime !== null && t - lastTime > maxGapSec) {
      if (current.length > 1) runs.push(current);
      current = [];
    }
    current.push([lat, lon]);
    lastTime = t;
  }
  if (current.length > 1) runs.push(current);
  return runs;
}

export interface ColoredSegment {
  positions: [LatLng, LatLng];
  color: string;
}

/**
 * Two-point segments coloured by the altitude at their end, for the selected aircraft's
 * trail. `head` (the live position) is appended so the trail meets the marker.
 */
export function coloredSegments(
  points: TrailPoint[],
  head?: TrailPoint,
  maxGapSec = MAX_TRAIL_GAP_SEC,
): ColoredSegment[] {
  const all = head && points.at(-1)?.[3] !== head[3] ? [...points, head] : points;
  const segments: ColoredSegment[] = [];
  for (let i = 1; i < all.length; i++) {
    const [lat0, lon0, , t0] = all[i - 1]!;
    const [lat1, lon1, alt1, t1] = all[i]!;
    if (t1 - t0 > maxGapSec) continue;
    segments.push({ positions: [[lat0, lon0], [lat1, lon1]], color: altitudeColor(alt1) });
  }
  return segments;
}

/** Duration covered by a trail in minutes, for display. */
export const trailSpanMinutes = (points: TrailPoint[]) =>
  points.length < 2 ? 0 : Math.round((points.at(-1)![3] - points[0]![3]) / 60);
