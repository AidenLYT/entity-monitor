import { useEffect, useState } from 'react';
import type { Snapshot, TrailPoint, Trails } from '../../shared/model.ts';
import { mergeTrails } from '../../shared/trails.ts';
import { fetchLive, RELAY_URL, type LiveResult } from '../api/live.ts';

/** Matches the relay's cache TTL; polling faster would only return the same snapshot. */
export const LIVE_POLL_MS = 5_000;
const MAX_BACKOFF_MS = 60_000;

export type LiveStatus = 'disabled' | 'connecting' | 'live' | 'reconnecting';

interface LiveState {
  regionId: string;
  result: LiveResult | null;
  failures: number;
}

/**
 * Polls the live relay for a region every few seconds while the tab is visible. Requests
 * never overlap; failures back off exponentially up to a minute.
 */
export function useLiveSnapshot(regionId: string | null): { live: LiveResult | null; status: LiveStatus } {
  const [state, setState] = useState<LiveState | null>(null);

  useEffect(() => {
    if (!RELAY_URL || regionId === null) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let failures = 0;

    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(poll, ms);
    };

    async function poll() {
      if (inFlight || document.visibilityState === 'hidden') return; // resumed on visibilitychange
      inFlight = true;
      try {
        const result = await fetchLive(regionId!, controller.signal);
        failures = 0;
        setState({ regionId: regionId!, result, failures });
      } catch {
        if (controller.signal.aborted) return;
        failures++;
        setState((prev) => ({ regionId: regionId!, result: prev?.regionId === regionId ? prev.result : null, failures }));
      } finally {
        inFlight = false;
      }
      schedule(failures === 0 ? LIVE_POLL_MS : Math.min(LIVE_POLL_MS * 2 ** failures, MAX_BACKOFF_MS));
    }

    const onVisibility = () => (document.visibilityState === 'visible' ? schedule(0) : clearTimeout(timer));
    void poll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [regionId]);

  if (!RELAY_URL) return { live: null, status: 'disabled' };
  const current = state?.regionId === regionId ? state : null;
  const status: LiveStatus = !current ? 'connecting' : current.failures > 0 ? 'reconnecting' : 'live';
  return { live: current?.result ?? null, status };
}

/** Live updates arrive every 5 s; keep one trail point per this many seconds. */
const LIVE_TRAIL_SPACING_SEC = 15;
const LIVE_TRAIL_MAX_POINTS = 180;

/**
 * Extends the deployed trails with positions from the live feed. Resets whenever a new
 * deploy (or region) brings a new `staticTrails` object, which already covers the history.
 */
export function useLiveTrails(
  regionId: string | null,
  staticTrails: Trails | null,
  live: Snapshot | null,
): Record<string, TrailPoint[]> | null {
  const [state, setState] = useState<{
    regionId: string;
    base: Trails | null;
    trails: Record<string, TrailPoint[]>;
  } | null>(null);

  useEffect(() => {
    if (!live || live.regionId !== regionId || (staticTrails && staticTrails.regionId !== regionId)) return;
    setState((prev) => {
      const continuing = prev?.regionId === regionId && prev.base === staticTrails;
      const from = continuing ? prev.trails : (staticTrails?.trails ?? {});
      return {
        regionId,
        base: staticTrails,
        trails: mergeTrails(from, live, { minSpacingSec: LIVE_TRAIL_SPACING_SEC, maxPoints: LIVE_TRAIL_MAX_POINTS }),
      };
    });
  }, [regionId, staticTrails, live]);

  if (state && state.regionId === regionId && state.base === staticTrails) return state.trails;
  return staticTrails?.regionId === regionId ? staticTrails.trails : null;
}
