import { describe, expect, it } from 'vitest';
import { computeAlignment } from '../src/core/alignment';
import { buildCorridor } from '../src/core/corridor';
import { DEFAULT_TEMPLATE } from '../src/core/crossSection';
import { computeProfile } from '../src/core/profile';

describe('buildCorridor', () => {
  it('computes fill volume for a road 1 m above flat ground', () => {
    const al = computeAlignment({ start: { x: 0, y: 0 }, pis: [], end: { x: 100, y: 0 } });
    const profile = computeProfile([
      { station: 0, elevation: 1, curveLength: 0 },
      { station: 100, elevation: 1, curveLength: 0 },
    ]);
    const t = {
      ...DEFAULT_TEMPLATE,
      laneCrossfall: 0,
      shoulderWidth: 0,
      laneWidth: 3,
      fillSlope: 2,
    };
    const c = buildCorridor(al, profile, t, () => 0, 10);
    expect(c.sections.length).toBe(11);
    // 8 m² per section over 100 m.
    expect(c.fillVolume).toBeCloseTo(800, -1);
    expect(c.cutVolume).toBeCloseTo(0, 6);
    // Right is -y for a road heading east.
    expect(c.sections[0]?.rightY).toBeCloseTo(-1, 9);
  });
});
