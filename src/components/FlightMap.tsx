import L from 'leaflet';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Circle, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { Aircraft, Region, TrailPoint } from '../../shared/model.ts';
import { isEmergency } from '../lib/filters.ts';
import { altitudeColor, displayName } from '../lib/format.ts';
import { projectPosition } from '../lib/motion.ts';
import { coloredSegments, splitTrail } from '../lib/trails.ts';

const NM_TO_M = 1852;
const PLANE_PATH =
  'M12 2.5c.7 0 1.2.8 1.2 1.8v5.4l7.3 4.3v2l-7.3-2.2v4.3l2.2 1.7v1.6L12 20.4l-3.4 1v-1.6l2.2-1.7v-4.3l-7.3 2.2v-2l7.3-4.3V4.3c0-1 .5-1.8 1.2-1.8z';

const iconCache = new Map<string, L.DivIcon>();

/** Icons are cached by rotation bucket, colour and state, so updates reuse Leaflet objects. */
function aircraftIcon(a: Aircraft, selected: boolean): { icon: L.DivIcon; key: string } {
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
  return { icon, key };
}

/** Marker positions are re-projected at most this often while live (~8 fps). */
const MOTION_FRAME_MS = 120;

interface MarkerEntry {
  marker: L.Marker;
  aircraft: Aircraft;
  iconKey: string;
}

/**
 * Aircraft markers, managed imperatively rather than as React components: a live update
 * touches only the markers that changed, and the motion loop moves markers without
 * re-rendering anything. `projectFrom` (the snapshot time in the local clock) enables motion.
 */
function AircraftLayer({
  aircraft,
  selectedHex,
  onSelect,
  projectFrom,
}: {
  aircraft: Aircraft[];
  selectedHex: string | null;
  onSelect: (hex: string) => void;
  projectFrom: number | null;
}) {
  const map = useMap();
  const layer = useMemo(() => L.layerGroup(), []);
  const entries = useRef(new Map<string, MarkerEntry>());
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const markers = entries.current;
    layer.addTo(map);
    return () => {
      layer.clearLayers().remove();
      markers.clear();
    };
  }, [map, layer]);

  useEffect(() => {
    const now = Date.now();
    const positionOf = (a: Aircraft): [number, number] =>
      projectFrom === null ? [a.lat, a.lon] : projectPosition(a, projectFrom, now);
    const seen = new Set<string>();
    for (const a of aircraft) {
      seen.add(a.hex);
      const selected = a.hex === selectedHex;
      const { icon, key } = aircraftIcon(a, selected);
      const zIndexOffset = selected ? 1000 : isEmergency(a) ? 500 : 0;
      const entry = entries.current.get(a.hex);
      if (entry) {
        entry.aircraft = a;
        entry.marker.setLatLng(positionOf(a)).setZIndexOffset(zIndexOffset);
        if (entry.iconKey !== key) {
          entry.marker.setIcon(icon);
          entry.iconKey = key;
        }
      } else {
        const name = displayName(a);
        const marker = L.marker(positionOf(a), { icon, title: name, alt: name, zIndexOffset })
          .on('click', () => onSelectRef.current(a.hex))
          .addTo(layer);
        entries.current.set(a.hex, { marker, aircraft: a, iconKey: key });
      }
    }
    for (const [hex, entry] of entries.current) {
      if (seen.has(hex)) continue;
      layer.removeLayer(entry.marker);
      entries.current.delete(hex);
    }
  }, [aircraft, selectedHex, projectFrom, layer]);

  useEffect(() => {
    if (projectFrom === null) return;
    let frame = 0;
    let last = 0;
    let zooming = false;
    const onZoomStart = () => (zooming = true);
    const onZoomEnd = () => (zooming = false);
    map.on('zoomstart', onZoomStart).on('zoomend', onZoomEnd);

    // requestAnimationFrame pauses in background tabs, so this costs nothing when hidden.
    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      if (zooming || t - last < MOTION_FRAME_MS) return;
      last = t;
      const now = Date.now();
      const bounds = map.getBounds().pad(0.25);
      for (const { marker, aircraft: a } of entries.current.values()) {
        const position = projectPosition(a, projectFrom, now);
        if (bounds.contains(position)) marker.setLatLng(position);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      map.off('zoomstart', onZoomStart).off('zoomend', onZoomEnd);
    };
  }, [map, projectFrom]);

  return null;
}

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
  /** When set, aircraft are dead-reckoned forward from this local-clock snapshot time. */
  projectFrom: number | null;
  aircraft: Aircraft[];
  trails: Record<string, TrailPoint[]> | null;
  showAllTrails: boolean;
  selected: Aircraft | null;
  onSelect: (hex: string | null) => void;
}

export function FlightMap({ region, sourceTime, projectFrom, aircraft, trails, showAllTrails, selected, onSelect }: FlightMapProps) {
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
      <AircraftLayer aircraft={aircraft} selectedHex={selected?.hex ?? null} onSelect={onSelect} projectFrom={projectFrom} />
    </MapContainer>
  );
}
