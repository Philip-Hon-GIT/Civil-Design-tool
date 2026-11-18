import { describe, expect, it } from 'vitest';
import {
  areasBetween,
  buildSection,
  DEFAULT_TEMPLATE,
  endAreaVolumes,
  type SectionTemplate,
} from '../src/core/crossSection';

const flat: SectionTemplate = {
  ...DEFAULT_TEMPLATE,
  laneWidth: 3,
  laneCrossfall: 0,
  shoulderWidth: 0,
  shoulderCrossfall: 0,
  cutSlope: 2,
  fillSlope: 2,
};

describe('buildSection', () => {
  it('fill on flat ground: slopes daylight at 2 x height, area = trapezoid', () => {
    // Road 1 m above flat ground at 0: slope 1:2 reaches ground 2 m outside.
    const s = buildSection(flat, 1, () => 0);
    const first = s.points[0]!;
    const last = s.points.at(-1)!;
    expect(first.offset).toBeCloseTo(-5, 1);
    expect(last.offset).toBeCloseTo(5, 1);
    expect(last.z).toBeCloseTo(0, 1);
    expect(s.parts).toEqual(['fill', 'lane', 'lane', 'fill']);
    // Trapezoid: top 6 m, bottom 10 m, height 1 → 8 m².
    expect(s.fillArea).toBeCloseTo(8, 1);
    expect(s.cutArea).toBeCloseTo(0, 6);
  });

  it('cut in flat ground: slopes go up', () => {
    const s = buildSection(flat, -1, () => 0);
    expect(s.parts[0]).toBe('cut');
    expect(s.cutArea).toBeCloseTo(8, 1);
  });

  it('applies crossfall', () => {
    const s = buildSection({ ...flat, laneCrossfall: 0.03 }, 10, () => 0);
    const edge = s.points.find((p) => Math.abs(p.offset - 3) < 1e-9);
    expect(edge?.z).toBeCloseTo(10 - 0.09, 9);
  });

  it('stops the slope at the search width when there is no daylight', () => {
    const s = buildSection({ ...flat, maxSlopeWidth: 5 }, 100, () => 0);
    expect(s.points.at(-1)?.offset).toBeCloseTo(8, 6);
  });
});

describe('areasBetween / endAreaVolumes', () => {
  it('splits a crossing section into cut and fill', () => {
    const { cut, fill } = areasBetween(
      [
        { offset: -2, z: 1 },
        { offset: 2, z: 1 },
      ],
      (o) => (o < 0 ? 0 : 2),
    );
    expect(fill).toBeCloseTo(2, 6);
    expect(cut).toBeCloseTo(2, 6);
  });

  it('integrates volumes by average end area', () => {
    const v = endAreaVolumes([
      { station: 0, cutArea: 0, fillArea: 8 },
      { station: 10, cutArea: 2, fillArea: 4 },
    ]);
    expect(v.fill).toBeCloseTo(60, 9);
    expect(v.cut).toBeCloseTo(10, 9);
  });
});
