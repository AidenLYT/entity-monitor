import type { Aircraft } from '../../shared/model.ts';

const EARTH_RADIUS_NM = 3440.065;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Never project further than this: if updates stop arriving, aircraft stop instead of
 * flying on indefinitely along a stale heading.
 */
export const MAX_PROJECTION_SEC = 20;

/**
 * Dead-reckons an aircraft's position at `nowMs` from its last report, along its track at
 * its ground speed (great-circle). `sourceTimeLocal` is when the snapshot was produced,
 * expressed on the local clock (see `LiveResult.fetchedAtLocal`).
 */
export function projectPosition(a: Aircraft, sourceTimeLocal: number, nowMs: number): [number, number] {
  const speed = a.groundSpeedKt;
  if (speed === null || a.trackDeg === null || speed < 1) return [a.lat, a.lon];

  const elapsedSec = (nowMs - sourceTimeLocal) / 1000 + a.seenPosSec;
  const dt = Math.min(Math.max(elapsedSec, 0), MAX_PROJECTION_SEC);
  if (dt === 0) return [a.lat, a.lon];

  const angular = (speed * dt) / 3600 / EARTH_RADIUS_NM;
  const bearing = toRad(a.trackDeg);
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing));
  const lon2 =
    lon1 + Math.atan2(Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1), Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lat2), ((toDeg(lon2) + 540) % 360) - 180];
}
