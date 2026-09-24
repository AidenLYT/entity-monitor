import type { Aircraft, TrailPoint } from '../../shared/model.ts';
import { emergencyLabel } from '../lib/filters.ts';
import {
  categoryLabel,
  displayName,
  formatAltitude,
  formatPosition,
  formatSpeed,
  formatTrack,
  formatVerticalRate,
} from '../lib/format.ts';
import { trailSpanMinutes } from '../lib/trails.ts';

interface Props {
  hex: string;
  aircraft: Aircraft | null;
  trail: TrailPoint[] | undefined;
  onClose: () => void;
}

export function AircraftDetails({ hex, aircraft, trail, onClose }: Props) {
  const title = aircraft ? displayName(aircraft) : hex.toUpperCase();
  return (
    <aside className="details" aria-label={`Details for ${title}`}>
      <header className="details-header">
        <div>
          <h2>{title}</h2>
          {aircraft && (
            <p className="details-sub">
              {[aircraft.registration, aircraft.typeCode].filter(Boolean).join(' · ') || 'Unknown type'}
            </p>
          )}
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close details">
          ✕
        </button>
      </header>

      {aircraft ? (
        <>
          <Badges aircraft={aircraft} />
          <dl className="details-grid">
            <Item label="Altitude" value={formatAltitude(aircraft)} />
            <Item label="Vertical rate" value={formatVerticalRate(aircraft.verticalRateFpm)} />
            <Item label="Ground speed" value={formatSpeed(aircraft.groundSpeedKt)} />
            <Item label="Track" value={formatTrack(aircraft.trackDeg)} />
            <Item label="Squawk" value={aircraft.squawk ?? '—'} />
            <Item label="ICAO hex" value={aircraft.hex.toUpperCase()} />
            <Item label="Category" value={categoryLabel(aircraft.category)} wide />
            <Item label="Position" value={formatPosition(aircraft.lat, aircraft.lon)} wide />
            <Item
              label="Trail"
              value={trail && trail.length > 1 ? `${trail.length} points over ${trailSpanMinutes(trail) || '< 1'} min` : 'Not enough history yet'}
              wide
            />
          </dl>
          {!aircraft.hex.startsWith('~') && (
            <a className="external" href={`https://adsb.lol/?icao=${aircraft.hex}`} target="_blank" rel="noreferrer">
              Open live view on adsb.lol ↗
            </a>
          )}
        </>
      ) : (
        <p className="empty">This aircraft is not in the latest data for this region. It may have landed or left coverage.</p>
      )}
    </aside>
  );
}

function Badges({ aircraft }: { aircraft: Aircraft }) {
  const emergency = emergencyLabel(aircraft);
  if (!emergency && !aircraft.military && !aircraft.onGround) return null;
  return (
    <div className="badges">
      {emergency && <span className="badge badge-emergency">{emergency}</span>}
      {aircraft.military && <span className="badge badge-military">Military</span>}
      {aircraft.onGround && <span className="badge">On ground</span>}
    </div>
  );
}

function Item({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'wide' : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
