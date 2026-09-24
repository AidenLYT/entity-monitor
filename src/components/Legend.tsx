import { ALTITUDE_SCALE_MAX_FT, altitudeColor, GROUND_COLOR } from '../lib/format.ts';

const STOPS = [0, 10_000, 20_000, 30_000, ALTITUDE_SCALE_MAX_FT];
const gradient = `linear-gradient(to right, ${STOPS.map((ft) => altitudeColor(ft)).join(', ')})`;

export function Legend() {
  return (
    <div className="legend" aria-label="Altitude colour key">
      <div className="legend-row">
        <span className="swatch" style={{ background: GROUND_COLOR }} />
        <span>Ground</span>
        <span className="legend-bar" style={{ background: gradient }} />
      </div>
      <div className="legend-scale">
        {STOPS.map((ft) => (
          <span key={ft}>{ft === 0 ? '0' : `${ft / 1000}k${ft === ALTITUDE_SCALE_MAX_FT ? '+' : ''}`}</span>
        ))}
      </div>
    </div>
  );
}
