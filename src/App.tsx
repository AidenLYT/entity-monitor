import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Meta } from '../shared/model.ts';
import { AircraftDetails } from './components/AircraftDetails.tsx';
import { AircraftList } from './components/AircraftList.tsx';
import { FilterPanel } from './components/FilterPanel.tsx';
import { FlightMap } from './components/FlightMap.tsx';
import { Legend } from './components/Legend.tsx';
import { useMeta, useRegionData } from './hooks/useData.ts';
import { useHashParams } from './hooks/useHashParams.ts';
import { applyFilters, DEFAULT_FILTERS, sortAircraft, type Filters, type SortKey } from './lib/filters.ts';
import { formatAge } from './lib/format.ts';

/** Data older than this is flagged; the collector normally publishes every ~5 minutes. */
const STALE_AFTER_MS = 15 * 60_000;

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
  const { snapshot, trails, error: regionError } = useRegionData(region?.id ?? null, meta?.generatedAt ?? null);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('callsign');
  const [showAllTrails, setShowAllTrails] = useState(false);
  const now = useNow(30_000);

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
        <DataStatus meta={meta} regionId={region.id} sourceTime={snapshot?.sourceTime ?? null} now={now} error={regionError ?? metaError} />
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
          <a href="https://opendatacommons.org/licenses/odbl/1-0/">ODbL</a>, refreshed by{' '}
          <a href="https://github.com/AidenLYT/entity-monitor">a scheduled GitHub Action</a>.
        </footer>
      </div>

      <main className="map-wrap">
        <FlightMap
          region={region}
          sourceTime={snapshot?.sourceTime ?? now}
          aircraft={filtered}
          trails={trails?.trails ?? null}
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
            trail={trails?.trails[selectedHex]}
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
  sourceTime,
  now,
  error,
}: {
  meta: Meta;
  regionId: string;
  sourceTime: number | null;
  now: number;
  error: string | null;
}) {
  const status = meta.regions.find((r) => r.id === regionId)?.status;
  const age = sourceTime ? now - sourceTime : null;
  const stale = age !== null && age > STALE_AFTER_MS;
  const warning = error ?? (status && !status.fresh ? 'Upstream was unavailable on the last update' : null);

  return (
    <div className={`status${stale || warning ? ' is-warning' : ''}`} role="status">
      <span className="status-dot" aria-hidden="true" />
      <span>
        {age === null ? 'No data yet' : `Data from ${formatAge(age)}`}
        {warning && <span className="status-note"> · {warning}</span>}
        {!warning && stale && <span className="status-note"> · updates may be delayed</span>}
      </span>
    </div>
  );
}
