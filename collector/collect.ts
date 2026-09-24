import {
  API_VERSION,
  type Meta,
  type Region,
  type RegionStatus,
  type Snapshot,
  type Trails,
} from '../shared/model.ts';
import { SOURCE, type FetchRegion } from './adsblol.ts';
import { toSnapshot } from './normalize.ts';
import { mergeTrails } from '../shared/trails.ts';

/** What the last deployed site published for a region; either part may be missing. */
export interface PreviousRegionData {
  snapshot: Snapshot | null;
  trails: Trails | null;
}

export interface CollectOptions {
  regions: Region[];
  fetchRegion: FetchRegion;
  loadPrevious: (region: Region) => Promise<PreviousRegionData>;
  /** Number of polls per run; each poll adds a point to every trail. */
  samples: number;
  sampleIntervalSec: number;
  /** Pause between consecutive upstream requests; adsb.lol rate-limits bursts. */
  requestGapSec?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  log?: (message: string) => void;
}

export interface RegionOutput {
  region: Region;
  snapshot: Snapshot;
  trails: Trails;
  status: RegionStatus;
}

export interface CollectResult {
  meta: Meta;
  outputs: RegionOutput[];
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Polls every region `samples` times, folding each poll into the trails carried over
 * from the previous deploy. A region whose polls all fail republishes its previous
 * snapshot (marked not fresh) so one bad upstream response never blanks the site.
 */
export async function collect(opts: CollectOptions): Promise<CollectResult> {
  const { regions, fetchRegion, samples, sampleIntervalSec, requestGapSec = 0 } = opts;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const log = opts.log ?? (() => {});

  const state = await Promise.all(
    regions.map(async (region) => {
      const previous = await opts.loadPrevious(region).catch((err): PreviousRegionData => {
        log(`${region.id}: could not load previous data (${errorMessage(err)})`);
        return { snapshot: null, trails: null };
      });
      return {
        region,
        previous,
        trails: previous.trails?.trails ?? {},
        latest: null as Snapshot | null,
        error: undefined as string | undefined,
      };
    }),
  );

  for (let sample = 0; sample < samples; sample++) {
    if (sample > 0) await sleep(sampleIntervalSec * 1000);
    for (const [i, entry] of state.entries()) {
      if (i > 0 && requestGapSec > 0) await sleep(requestGapSec * 1000);
      try {
        const snapshot = toSnapshot(entry.region.id, await fetchRegion(entry.region));
        entry.trails = mergeTrails(entry.trails, snapshot);
        entry.latest = snapshot;
        entry.error = undefined;
        log(`${entry.region.id}: sample ${sample + 1}/${samples}, ${snapshot.aircraft.length} aircraft`);
      } catch (err) {
        entry.error = errorMessage(err);
        log(`${entry.region.id}: sample ${sample + 1}/${samples} failed (${entry.error})`);
      }
    }
  }

  const generatedAt = now();
  const outputs = state.map(({ region, previous, trails, latest, error }): RegionOutput => {
    const snapshot = latest ??
      previous.snapshot ?? { apiVersion: API_VERSION, regionId: region.id, sourceTime: 0, aircraft: [] };
    const status: RegionStatus = {
      fresh: latest !== null,
      aircraftCount: snapshot.aircraft.length,
      sourceTime: snapshot.sourceTime || null,
      ...(error && { error }),
    };
    return {
      region,
      snapshot,
      trails: { apiVersion: API_VERSION, regionId: region.id, generatedAt, trails },
      status,
    };
  });

  const meta: Meta = {
    apiVersion: API_VERSION,
    generatedAt,
    source: SOURCE,
    collector: { samples, sampleIntervalSec, requestGapSec },
    regions: outputs.map(({ region, status }) => ({ ...region, status })),
  };
  return { meta, outputs };
}
