import L from 'leaflet';
import { memo, useEffect, useMemo } from 'react';
import { Circle, MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { Aircraft, Region, TrailPoint } from '../../shared/model.ts';
import { isEmergency } from '../lib/filters.ts';
import { altitudeColor, displayName } from '../lib/format.ts';
import { coloredSegments, splitTrail } from '../lib/trails.ts';

const NM_TO_M = 1852;
const PLANE_PATH =
  'M12 2.5c.7 0 1.2.8 1.2 1.8v5.4l7.3 4.3v2l-7.3-2.2v4.3l2.2 1.7v1.6L12 20.4l-3.4 1v-1.6l2.2-1.7v-4.3l-7.3 2.2v-2l7.3-4.3V4.3c0-1 .5-1.8 1.2-1.8z';

const iconCache = new Map<string, L.DivIcon>();

/** Icons are cached by rotation bucket, colour and state so re-renders reuse Leaflet objects. */
function aircraftIcon(a: Aircraft, selected: boolean): L.DivIcon {
  const rotation = a.trackDeg === null ? null : (Math.round(a.trackDeg / 5) * 5) % 360;
  const color = altitudeColor(a.altitudeFt, a.onGround);
  const emergency = isEmergency(a);
  const key = `${rotation}|${color}|${selected}|${emergency}|${a.military}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const classes = ['ac-icon', selected && 'is-selected', emergency && 'is-emergency', a.military && 'is-military']
      .filter(Boolean)
      .join(' ');
    const shape =
      rotation === null
        ? '<circle cx="12" cy="12" r="5" />'
        : `<path d="${PLANE_PATH}" transform="rotate(${rotation} 12 12)" />`;
    icon = L.divIcon({
      className: '',
      html: `<div class="${classes}" style="--ac-color:${color}"><svg viewBox="0 0 24 24" aria-hidden="true">${shape}</svg></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

const AircraftMarker = memo(function AircraftMarker({
  aircraft,
  selected,
  onSelect,
}: {
  aircraft: Aircraft;
  selected: boolean;
  onSelect: (hex: string) => void;
}) {
  const handlers = useMemo(() => ({ click: () => onSelect(aircraft.hex) }), [aircraft.hex, onSelect]);
  return (
    <Marker
      position={[aircraft.lat, aircraft.lon]}
      icon={aircraftIcon(aircraft, selected)}
      title={displayName(aircraft)}
      alt={displayName(aircraft)}
      zIndexOffset={selected ? 1000 : isEmergency(aircraft) ? 500 : 0}
      eventHandlers={handlers}
    />
  );
});

function RegionViewport({ region }: { region: Region }) {
  const map = useMap();
  // Keyed on the id so a refetched copy of the same region doesn't reset the user's view.
  useEffect(() => {
    map.setView(region.center, region.zoom, { animate: false });
  }, [map, region.id]);
  return null;
}

/** Brings the selected aircraft into view if it is off-screen, without disturbing the zoom. */
function FollowSelection({ aircraft }: { aircraft: Aircraft | null }) {
  const map = useMap();
  const hex = aircraft?.hex;
  // Keyed on the hex so position updates for the same aircraft don't pan the map.
  useEffect(() => {
    if (!aircraft) return;
    const position = L.latLng(aircraft.lat, aircraft.lon);
    if (!map.getBounds().pad(-0.1).contains(position)) map.panTo(position);
  }, [map, hex]);
  return null;
}

function ClearSelectionOnMapClick({ onClear }: { onClear: () => void }) {
  useMapEvents({ click: onClear });
  return null;
}

const ALL_TRAILS_STYLE = { color: '#64748b', weight: 1.5, opacity: 0.55, interactive: false };

const AllTrails = memo(function AllTrails({ trails }: { trails: TrailPoint[][] }) {
  const runs = useMemo(() => trails.flatMap((points) => splitTrail(points)), [trails]);
  return runs.length > 0 ? <Polyline positions={runs} pathOptions={ALL_TRAILS_STYLE} /> : null;
});

function SelectedTrail({ points, head }: { points: TrailPoint[]; head: TrailPoint }) {
  return (
    <>
      {coloredSegments(points, head).map((segment, i) => (
        <Polyline
          key={i}
          positions={segment.positions}
          pathOptions={{ color: segment.color, weight: 3.5, opacity: 0.95, interactive: false }}
        />
      ))}
    </>
  );
}

export interface FlightMapProps {
  region: Region;
  /** Epoch ms of the snapshot the aircraft positions come from. */
  sourceTime: number;
  aircraft: Aircraft[];
  trails: Record<string, TrailPoint[]> | null;
  showAllTrails: boolean;
  selected: Aircraft | null;
  onSelect: (hex: string | null) => void;
}

export function FlightMap({ region, sourceTime, aircraft, trails, showAllTrails, selected, onSelect }: FlightMapProps) {
  const clearSelection = useMemo(() => () => onSelect(null), [onSelect]);
  const visibleTrails = useMemo(
    () => (showAllTrails && trails ? aircraft.map((a) => trails[a.hex]).filter((t) => t !== undefined) : []),
    [showAllTrails, trails, aircraft],
  );
  const selectedTrail = selected ? trails?.[selected.hex] : undefined;
  const selectedHead: TrailPoint | null = selected && [
    selected.lat,
    selected.lon,
    selected.altitudeFt,
    Math.round(sourceTime / 1000 - selected.seenPosSec),
  ];

  return (
    <MapContainer
      className="map"
      center={region.center}
      zoom={region.zoom}
      preferCanvas
      worldCopyJump
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Flight data &copy; <a href="https://adsb.lol">adsb.lol</a> (ODbL)'
        maxZoom={19}
      />
      <RegionViewport region={region} />
      <FollowSelection aircraft={selected} />
      <ClearSelectionOnMapClick onClear={clearSelection} />
      {region.kind === 'point' && region.radiusNm !== undefined && (
        <Circle
          center={region.center}
          radius={region.radiusNm * NM_TO_M}
          pathOptions={{ color: '#0f766e', weight: 1, dashArray: '6 6', fill: false, interactive: false }}
        />
      )}
      {showAllTrails && <AllTrails trails={visibleTrails} />}
      {selectedTrail && selectedHead && <SelectedTrail points={selectedTrail} head={selectedHead} />}
      {aircraft.map((a) => (
        <AircraftMarker key={a.hex} aircraft={a} selected={a.hex === selected?.hex} onSelect={onSelect} />
      ))}
    </MapContainer>
  );
}
