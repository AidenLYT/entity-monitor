import { describe, expect, it } from 'vitest';
import type { TrailPoint } from '../../shared/model.ts';
import { GROUND_COLOR } from './format.ts';
import { coloredSegments, splitTrail, trailSpanMinutes } from './trails.ts';

const points: TrailPoint[] = [
  [50, 0, 1000, 0],
  [50.1, 0, 2000, 60],
  [50.2, 0, 3000, 120],
  // 30 minute gap
  [51, 0, 30000, 1920],
  [51.1, 0, null, 1980],
];

describe('splitTrail', () => {
  it('breaks the trail at long gaps and drops single-point runs', () => {
    expect(splitTrail(points)).toEqual([
      [[50, 0], [50.1, 0], [50.2, 0]],
      [[51, 0], [51.1, 0]],
    ]);
    expect(splitTrail(points.slice(0, 4))).toHaveLength(1);
  });
});

describe('coloredSegments', () => {
  it('skips segments across gaps and colours by the end altitude', () => {
    const segments = coloredSegments(points);
    expect(segments).toHaveLength(3);
    expect(segments.at(-1)!.color).toBe(GROUND_COLOR);
  });

  it('appends the live head position unless it is already the last point', () => {
    const head: TrailPoint = [51.2, 0, 31000, 2000];
    expect(coloredSegments(points, head)).toHaveLength(4);
    expect(coloredSegments(points, points.at(-1))).toHaveLength(3);
  });
});

describe('trailSpanMinutes', () => {
  it('measures first to last point', () => {
    expect(trailSpanMinutes(points)).toBe(33);
    expect(trailSpanMinutes(points.slice(0, 1))).toBe(0);
  });
});
