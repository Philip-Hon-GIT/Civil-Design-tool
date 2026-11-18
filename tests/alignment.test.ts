import { describe, expect, it } from 'vitest';
import { computeAlignment, pointAtStation, sampleAlignment } from '../src/core/alignment';

describe('computeAlignment', () => {
  it('handles a straight line', () => {
    const al = computeAlignment({ start: { x: 0, y: 0 }, pis: [], end: { x: 300, y: 400 } });
    expect(al.length).toBeCloseTo(500, 6);
    expect(al.elements.map((e) => e.type)).toEqual(['line']);
  });

  it('builds a circular curve with T = R tan(Δ/2) and arc length RΔ', () => {
    // 90° left turn at (100, 0), R = 50.
    const al = computeAlignment({
      start: { x: 0, y: 0 },
      pis: [{ x: 100, y: 0, radius: 50, l1: 0, l2: 0 }],
      end: { x: 100, y: 100 },
    });
    expect(al.warnings).toEqual([]);
    expect(al.elements.map((e) => e.type)).toEqual(['line', 'arc', 'line']);
    const [l1, arc, l2] = al.elements;
    expect(l1?.length).toBeCloseTo(50, 6); // 100 - T, T = 50
    expect(arc?.length).toBeCloseTo((50 * Math.PI) / 2, 3);
    expect(l2?.length).toBeCloseTo(50, 3);
    const end = pointAtStation(al, al.length);
    expect(end.x).toBeCloseTo(100, 3);
    expect(end.y).toBeCloseTo(100, 3);
  });

  it('builds clothoid-arc-clothoid that is continuous and ends at POE', () => {
    const al = computeAlignment({
      start: { x: 0, y: 0 },
      pis: [
        { x: 380, y: 120, radius: 450, l1: 80, l2: 80 },
        { x: 760, y: -60, radius: 350, l1: 70, l2: 50 },
      ],
      end: { x: 1150, y: 80 },
    });
    expect(al.warnings).toEqual([]);
    expect(al.elements.map((e) => e.type)).toEqual([
      'line',
      'clothoid',
      'arc',
      'clothoid',
      'line',
      'clothoid',
      'arc',
      'clothoid',
      'line',
    ]);
    // Position and heading continuity at every element joint.
    for (let i = 1; i < al.elements.length; i++) {
      const prev = al.elements[i - 1]!;
      const next = al.elements[i]!;
      const a = pointAtStation(al, prev.startStation + prev.length - 1e-9);
      expect(Math.hypot(a.x - next.x0, a.y - next.y0)).toBeLessThan(0.002);
      expect(Math.abs(a.heading - next.h0)).toBeLessThan(1e-4);
    }
    const end = pointAtStation(al, al.length);
    expect(end.x).toBeCloseTo(1150, 2);
    expect(end.y).toBeCloseTo(80, 2);
  });

  it('warns when curves overlap', () => {
    const al = computeAlignment({
      start: { x: 0, y: 0 },
      pis: [{ x: 50, y: 0, radius: 500, l1: 0, l2: 0 }],
      end: { x: 50, y: 50 },
    });
    expect(al.warnings.length).toBeGreaterThan(0);
  });

  it('samples with increasing stations', () => {
    const al = computeAlignment({
      start: { x: 0, y: 0 },
      pis: [{ x: 100, y: 0, radius: 50, l1: 20, l2: 20 }],
      end: { x: 100, y: 100 },
      startStation: 1000,
    });
    const pts = sampleAlignment(al, 10);
    expect(pts[0]?.station).toBe(1000);
    expect(pts.at(-1)?.station).toBeCloseTo(1000 + al.length, 6);
    for (let i = 1; i < pts.length; i++)
      expect(pts[i]!.station).toBeGreaterThan(pts[i - 1]!.station);
  });
});

describe('fitCurves', () => {
  it('shortens clothoids on small deflections so the geometry is valid', async () => {
    const { fitCurves } = await import('../src/core/alignment');
    const pts = fitCurves(
      [
        { x: 0, y: 0, radius: 0, l1: 0, l2: 0 },
        { x: 200, y: 0, radius: 0, l1: 0, l2: 0 },
        { x: 400, y: 20, radius: 0, l1: 0, l2: 0 },
      ],
      { radius: 150, l1: 30, l2: 30 },
    );
    expect(pts[1]?.l1).toBeLessThan(30);
    const al = computeAlignment({ start: pts[0]!, pis: [pts[1]!], end: pts[2]! });
    expect(al.warnings).toEqual([]);
  });
});
