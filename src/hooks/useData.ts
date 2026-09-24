import { useEffect, useState } from 'react';
import type { Meta, Snapshot, Trails } from '../../shared/model.ts';
import { ApiError, fetchMeta, fetchSnapshot, fetchTrails } from '../api/client.ts';

/** The collector publishes every ~5 minutes; a 30 s check shows each deploy soon after it lands. */
export const POLL_INTERVAL_MS = 30_000;

const describe = (err: unknown) =>
  err instanceof ApiError && err.status === 404
    ? 'No data has been published yet.'
    : err instanceof Error
      ? err.message
      : String(err);

/** Polls meta.json, and re-checks immediately when the tab becomes visible again. */
export function useMeta() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const check = async () => {
      try {
        const next = await fetchMeta(controller.signal);
        // Keep the old object when nothing changed so dependants don't refetch.
        setMeta((prev) => (prev?.generatedAt === next.generatedAt ? prev : next));
        setError(null);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(describe(err));
      }
    };
    const onVisibility = () => document.visibilityState === 'visible' && void check();

    void check();
    const timer = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { meta, error };
}

interface RegionData {
  regionId: string;
  snapshot: Snapshot;
  trails: Trails | null;
}

/**
 * Loads a region's snapshot and trails, refetching whenever a new deploy (`generatedAt`)
 * lands. Previous data stays on screen while a refresh for the same region is in flight.
 */
export function useRegionData(regionId: string | null, generatedAt: number | null) {
  const [data, setData] = useState<RegionData | null>(null);
  const [error, setError] = useState<{ regionId: string; message: string } | null>(null);

  useEffect(() => {
    if (regionId === null || generatedAt === null) return;
    const controller = new AbortController();
    (async () => {
      try {
        const [snapshot, trails] = await Promise.all([
          fetchSnapshot(regionId, controller.signal),
          // Trails are an enhancement; the map still works without them.
          fetchTrails(regionId, controller.signal).catch(() => null),
        ]);
        setData({ regionId, snapshot, trails });
        setError(null);
      } catch (err) {
        if (!controller.signal.aborted) setError({ regionId, message: describe(err) });
      }
    })();
    return () => controller.abort();
  }, [regionId, generatedAt]);

  const current = data?.regionId === regionId ? data : null;
  return {
    snapshot: current?.snapshot ?? null,
    trails: current?.trails ?? null,
    error: error?.regionId === regionId ? error.message : null,
  };
}
