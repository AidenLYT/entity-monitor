import type { Region } from '../shared/model.ts';

// Every region costs one upstream request per sample, so keep this list short.
export const REGIONS: Region[] = [
  { id: 'london', name: 'London & South East England', kind: 'point', center: [51.47, -0.45], radiusNm: 150, zoom: 7 },
  { id: 'frankfurt', name: 'Frankfurt & Central Europe', kind: 'point', center: [50.03, 8.56], radiusNm: 150, zoom: 7 },
  { id: 'new-york', name: 'New York Metro', kind: 'point', center: [40.64, -73.78], radiusNm: 150, zoom: 7 },
  { id: 'los-angeles', name: 'Los Angeles Basin', kind: 'point', center: [33.94, -118.41], radiusNm: 150, zoom: 7 },
  { id: 'singapore', name: 'Singapore & Malacca Strait', kind: 'point', center: [1.36, 103.99], radiusNm: 200, zoom: 7 },
  { id: 'military', name: 'Military (worldwide)', kind: 'military', center: [30, 0], zoom: 2 },
];
