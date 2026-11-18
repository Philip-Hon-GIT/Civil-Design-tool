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

describe('street section', () => {
  it('adds kerb and footway on the chosen side', async () => {
    const { buildSection, DEFAULT_TEMPLATE } = await import('../src/core/crossSection');
    const t = { ...DEFAULT_TEMPLATE, footwayRight: 2.5, footwayLeft: 0, kerbHeight: 0.12 };
    const s = buildSection(t, 10, () => 9);
    const rightParts = s.parts.slice(s.parts.indexOf('lane') + 1);
    expect(rightParts).toContain('kerb');
    expect(rightParts).toContain('footway');
    expect(s.parts.filter((p) => p === 'footway').length).toBe(1);
    // N100 street: kerb at the carriageway edge, no shoulder on the footway side.
    expect(rightParts).not.toContain('shoulder');
    expect(s.parts.slice(0, s.parts.indexOf('lane'))).toContain('shoulder');
    // Footway edge: lane -0.09, kerb +0.12, footway +0.05.
    const fwIdx = s.parts.lastIndexOf('footway');
    expect(s.points[fwIdx + 1]!.z).toBeCloseTo(10 - 0.09 + 0.12 + 0.05, 9);
  });
});

describe('superelevation', () => {
  it('is clamped between normal crossfall and the maximum', async () => {
    const { superelevationFor } = await import('../src/core/crossSection');
    expect(superelevationFor(40, 1000, 0.03)).toBe(0.03);
    expect(superelevationFor(50, 20, 0.03, 0.06)).toBe(0.06);
    expect(superelevationFor(40, 150, 0.03)).toBeCloseTo(1600 / (254 * 150), 9);
  });

  it('rotates the outer side to fall inwards in a left curve', async () => {
    const { sideCrossfall } = await import('../src/core/crossSection');
    const full = sideCrossfall(0.03, 1 / 150, 1 / 150, 0.05);
    expect(full.left).toBeCloseTo(0.05, 9); // inner side falls towards the centre
    expect(full.right).toBeCloseTo(-0.05, 9); // outer side rises outwards
    const half = sideCrossfall(0.03, 0.5 / 150, 1 / 150, 0.05);
    expect(half.right).toBeCloseTo(0.03 - 0.5 * 0.08, 9);
    expect(sideCrossfall(0.03, 0, 0, 0)).toEqual({ left: 0.03, right: 0.03 });
  });
});
