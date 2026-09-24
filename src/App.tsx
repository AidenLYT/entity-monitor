import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Meta } from '../shared/model.ts';
import { AircraftDetails } from './components/AircraftDetails.tsx';
import { AircraftList } from './components/AircraftList.tsx';
import { FilterPanel } from './components/FilterPanel.tsx';
import { FlightMap } from './components/FlightMap.tsx';
import { Legend } from './components/Legend.tsx';
import { useMeta, useRegionData } from './hooks/useData.ts';
import { useHashParams } from './hooks/useHashParams.ts';
import { useLiveSnapshot, useLiveTrails, type LiveStatus } from './hooks/useLive.ts';
import { applyFilters, DEFAULT_FILTERS, sortAircraft, type Filters, type SortKey } from './lib/filters.ts';
import { formatAge } from './lib/format.ts';

/** Data older than this is flagged; the collector normally publishes every 5–15 minutes. */
const STALE_AFTER_MS = 30 * 60_000;

function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function App() {
  const [params, setParams] = useHashParams<'region' | 'hex'>();
  const { meta, error: metaError } = useMeta();
  const region = meta?.regions.find((r) => r.id === params.region) ?? meta?.regions[0] ?? null;
  const regionId = region?.id ?? null;
  const { snapshot: deployed, trails: deployedTrails, error: regionError } = useRegionData(regionId, meta?.generatedAt ?? null);
  const { live, status: liveStatus } = useLiveSnapshot(regionId);

  // Show whichever is newer: the live feed normally, the deployed snapshot until it connects.
  const liveFeed = live && live.snapshot.regionId === regionId ? live : null;
  const shownLive = liveFeed && (!deployed || liveFeed.snapshot.sourceTime >= deployed.sourceTime) ? liveFeed : null;
  const snapshot = shownLive ? shownLive.snapshot : deployed;
  const trails = useLiveTrails(regionId, deployedTrails, liveFeed?.snapshot ?? null);
  const projectFrom = shownLive?.fetchedAtLocal ?? null;

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('callsign');
  const [showAllTrails, setShowAllTrails] = useState(false);

  const allAircraft = useMemo(() => snapshot?.aircraft ?? [], [snapshot]);
  const filtered = useMemo(() => applyFilters(allAircraft, filters), [allAircraft, filters]);
  const sorted = useMemo(() => sortAircraft(filtered, sortKey), [filtered, sortKey]);

  const selectedHex = params.hex ?? null;
  const selected = useMemo(() => allAircraft.find((a) => a.hex === selectedHex) ?? null, [allAircraft, selectedHex]);
  const select = useCallback((hex: string | null) => setParams({ hex }), [setParams]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && select(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [select]);

  if (!meta || !region) {
    return (
      <div className="splash">
        <h1>Entity Monitor</h1>
        <p>{metaError ? `Could not load flight data: ${metaError}` : 'Loading flight data…'}</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={22} height={22} />
          Entity Monitor
        </h1>
        <label className="region-picker">
          <span className="visually-hidden">Region</span>
          <select
            value={region.id}
            onChange={(e) => setParams({ region: e.target.value, hex: null })}
          >
            {meta.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <DataStatus
          meta={meta}
          regionId={region.id}
          liveStatus={liveStatus}
          liveReceivedAt={shownLive?.receivedAt ?? null}
          sourceTime={snapshot?.sourceTime ?? null}
          error={regionError ?? metaError}
        />
      </header>

      <div className="sidebar">
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          showAllTrails={showAllTrails}
          onShowAllTrailsChange={setShowAllTrails}
        />
        <AircraftList
          aircraft={sorted}
          total={allAircraft.length}
          sortKey={sortKey}
          onSortChange={setSortKey}
          selectedHex={selectedHex}
          onSelect={select}
        />
        <footer className="credits">
          Flight data from <a href="https://adsb.lol">adsb.lol</a> under{' '}
          <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>, streamed through a Cloudflare Worker
          relay, with snapshots and trails from{' '}
          <a href="https://github.com/AidenLYT/entity-monitor">a scheduled GitHub Action</a>.
        </footer>
      </div>

      <main className="map-wrap">
        <FlightMap
          region={region}
          sourceTime={snapshot?.sourceTime ?? 0}
          projectFrom={projectFrom}
          aircraft={filtered}
          trails={trails}
          showAllTrails={showAllTrails}
          selected={selected}
          onSelect={select}
        />
        <Legend />
        {!snapshot && !regionError && <div className="map-overlay">Loading {region.name}…</div>}
        {selectedHex && (
          <AircraftDetails
            hex={selectedHex}
            aircraft={selected}
            trail={trails?.[selectedHex]}
            onClose={() => select(null)}
          />
        )}
      </main>
    </div>
  );
}

function DataStatus({
  meta,
  regionId,
  liveStatus,
  liveReceivedAt,
  sourceTime,
  error,
}: {
  meta: Meta;
  regionId: string;
  liveStatus: LiveStatus;
  liveReceivedAt: number | null;
  sourceTime: number | null;
  error: string | null;
}) {
  // Ticks here rather than in App so only this line re-renders every second.
  const now = useNow(liveReceivedAt !== null ? 1_000 : 30_000);

  if (liveReceivedAt !== null && liveStatus === 'live') {
    const secs = Math.max(0, Math.round((now - liveReceivedAt) / 1000));
    return (
      <div className="status is-live" role="status">
        <span className="status-dot" aria-hidden="true" />
        <span>
          <strong>Live</strong> · updated {secs < 2 ? 'just now' : `${secs} s ago`}
        </span>
      </div>
    );
  }

  const status = meta.regions.find((r) => r.id === regionId)?.status;
  const age = sourceTime ? now - sourceTime : null;
  const stale = age !== null && age > STALE_AFTER_MS;
  const liveNote =
    liveStatus === 'reconnecting' ? 'live feed unavailable, retrying' : liveStatus === 'connecting' ? 'connecting to live feed…' : null;
  const warning = error ?? (status && !status.fresh ? 'Upstream was unavailable on the last update' : null);
  const note = warning ?? liveNote ?? (stale ? 'updates may be delayed' : null);

  return (
    <div className={`status${stale || warning || liveStatus === 'reconnecting' ? ' is-warning' : ''}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      <span>
        {age === null ? 'No data yet' : `Data from ${formatAge(age)}`}
        {note && <span className="status-note"> · {note}</span>}
      </span>
    </div>
  );
}
