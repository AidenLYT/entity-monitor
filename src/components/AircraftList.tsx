import { useEffect, useRef } from 'react';
import type { Aircraft } from '../../shared/model.ts';
import { emergencyLabel, type SortKey } from '../lib/filters.ts';
import { altitudeColor, displayName, formatAltitude, formatSpeed } from '../lib/format.ts';

interface Props {
  aircraft: Aircraft[];
  total: number;
  sortKey: SortKey;
  onSortChange: (key: SortKey) => void;
  selectedHex: string | null;
  onSelect: (hex: string) => void;
}

export function AircraftList({ aircraft, total, sortKey, onSortChange, selectedHex, onSelect }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!selectedHex) return;
    listRef.current
      ?.querySelector(`[data-hex="${CSS.escape(selectedHex)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedHex]);

  return (
    <section className="panel list" aria-label="Aircraft">
      <div className="list-header">
        <span aria-live="polite">
          <strong>{aircraft.length.toLocaleString()}</strong> of {total.toLocaleString()} aircraft
        </span>
        <label className="sort">
          Sort
          <select value={sortKey} onChange={(e) => onSortChange(e.target.value as SortKey)}>
            <option value="callsign">Callsign</option>
            <option value="altitude">Altitude</option>
            <option value="speed">Speed</option>
          </select>
        </label>
      </div>
      {aircraft.length === 0 ? (
        <p className="empty">No aircraft match these filters.</p>
      ) : (
        <ul ref={listRef}>
          {aircraft.map((a) => {
            const emergency = emergencyLabel(a);
            return (
              <li key={a.hex} data-hex={a.hex}>
                <button
                  type="button"
                  className={`row${a.hex === selectedHex ? ' is-selected' : ''}`}
                  aria-pressed={a.hex === selectedHex}
                  onClick={() => onSelect(a.hex)}
                >
                  <span className="swatch" style={{ background: altitudeColor(a.altitudeFt, a.onGround) }} />
                  <span className="row-main">
                    <span className="row-title">
                      {displayName(a)}
                      {emergency && <span className="badge badge-emergency" title={emergency}>{a.squawk ?? 'EMRG'}</span>}
                      {a.military && <span className="badge badge-military">MIL</span>}
                    </span>
                    <span className="row-sub">{[a.typeCode, a.registration].filter(Boolean).join(' · ') || a.hex}</span>
                  </span>
                  <span className="row-stats">
                    <span>{formatAltitude(a)}</span>
                    <span>{formatSpeed(a.groundSpeedKt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
