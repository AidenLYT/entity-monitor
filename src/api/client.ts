import { metaPath, snapshotPath, trailsPath, type Meta, type Snapshot, type Trails } from '../../shared/model.ts';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  // GitHub Pages sends `max-age=600`; bypass caches so a new deploy shows up immediately.
  const res = await fetch(`${import.meta.env.BASE_URL}${path}?t=${Date.now()}`, { cache: 'no-store', signal });
  if (!res.ok) throw new ApiError(`${path} responded ${res.status}`, res.status);
  return (await res.json()) as T;
}

export const fetchMeta = (signal?: AbortSignal) => getJson<Meta>(metaPath(), signal);
export const fetchSnapshot = (regionId: string, signal?: AbortSignal) =>
  getJson<Snapshot>(snapshotPath(regionId), signal);
export const fetchTrails = (regionId: string, signal?: AbortSignal) => getJson<Trails>(trailsPath(regionId), signal);
