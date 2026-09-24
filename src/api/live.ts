import type { Snapshot } from '../../shared/model.ts';
import { ApiError } from './client.ts';

/** Base URL of the live relay (see relay/), set at build time. Live mode is off without it. */
export const RELAY_URL: string | null = import.meta.env.VITE_RELAY_URL?.replace(/\/+$/, '') || null;

export interface LiveResult {
  snapshot: Snapshot;
  /** Local epoch ms when the response arrived. */
  receivedAt: number;
  /** When the upstream data was fetched, on the local clock (immune to local clock skew). */
  fetchedAtLocal: number;
}

export async function fetchLive(regionId: string, signal?: AbortSignal): Promise<LiveResult> {
  const startedAt = Date.now();
  const res = await fetch(`${RELAY_URL}/v1/regions/${encodeURIComponent(regionId)}/live`, { cache: 'no-store', signal });
  if (!res.ok) throw new ApiError(`Live relay responded ${res.status}`, res.status);
  const snapshot = (await res.json()) as Snapshot;
  const receivedAt = Date.now();
  const ageMs = Number(res.headers.get('X-Snapshot-Age')) || 0;
  // Assume the relay answered halfway through the round trip.
  const fetchedAtLocal = (startedAt + receivedAt) / 2 - ageMs;
  return { snapshot, receivedAt, fetchedAtLocal };
}
