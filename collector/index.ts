// Collector CLI: polls adsb.lol and writes the static JSON API into an output directory.
//
//   npm run collect -- --out dist
//
// Environment:
//   PREVIOUS_BASE_URL    Base URL of the live site; trails are continued from its data.
//   SAMPLES              Polls per run (default 1).
//   SAMPLE_INTERVAL_SEC  Seconds between polls (default 60).
//   REQUEST_GAP_SEC      Seconds between upstream requests within a poll (default 8).

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { API_VERSION, metaPath, snapshotPath, trailsPath, type Region } from '../shared/model.ts';
import { createFetchRegion } from './adsblol.ts';
import { collect, type PreviousRegionData } from './collect.ts';
import { REGIONS } from './regions.ts';

const { values } = parseArgs({ options: { out: { type: 'string', default: 'dist' } } });
const outDir = values.out!;
const previousBaseUrl = process.env.PREVIOUS_BASE_URL?.replace(/\/+$/, '');
const samples = positiveInt(process.env.SAMPLES, 1);
const sampleIntervalSec = positiveInt(process.env.SAMPLE_INTERVAL_SEC, 60);
const requestGapSec = positiveInt(process.env.REQUEST_GAP_SEC, 8);

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

async function fetchPublished<T extends { apiVersion: number }>(path: string): Promise<T | null> {
  if (!previousBaseUrl) return null;
  const res = await fetch(`${previousBaseUrl}/${path}`, { signal: AbortSignal.timeout(15_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET ${path} responded ${res.status}`);
  const body = (await res.json()) as T;
  return body.apiVersion === API_VERSION ? body : null;
}

async function loadPrevious(region: Region): Promise<PreviousRegionData> {
  const [snapshot, trails] = await Promise.all([
    fetchPublished<NonNullable<PreviousRegionData['snapshot']>>(snapshotPath(region.id)),
    fetchPublished<NonNullable<PreviousRegionData['trails']>>(trailsPath(region.id)),
  ]);
  return { snapshot, trails };
}

async function writeJson(path: string, data: unknown) {
  const file = join(outDir, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

const { meta, outputs } = await collect({
  regions: REGIONS,
  fetchRegion: createFetchRegion(),
  loadPrevious,
  samples,
  sampleIntervalSec,
  requestGapSec,
  log: (message) => console.log(message),
});

for (const { region, snapshot, trails, status } of outputs) {
  await writeJson(snapshotPath(region.id), snapshot);
  await writeJson(trailsPath(region.id), trails);
  // Surface failures as annotations on the workflow run without failing the deploy.
  if (!status.fresh) console.log(`::warning::${region.id}: no fresh data this run (${status.error ?? 'unknown error'})`);
}
await writeJson(metaPath(), meta);

const fresh = outputs.filter((o) => o.status.fresh).length;
console.log(`Wrote ${outputs.length} regions to ${outDir} (${fresh} fresh)`);
