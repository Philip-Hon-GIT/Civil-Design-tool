import { describe, expect, it } from 'vitest';
import { autoProfile, computeProfile, elevationAt, kValue } from '../src/core/profile';

describe('vertical profile', () => {
  const profile = computeProfile([
    { station: 0, elevation: 100, curveLength: 0 },
    { station: 200, elevation: 110, curveLength: 100 }, // +5 % then -3 %
    { station: 400, elevation: 104, curveLength: 0 },
  ]);

  it('computes grades', () => {
    expect(profile.grades[0]).toBeCloseTo(0.05, 9);
    expect(profile.grades[1]).toBeCloseTo(-0.03, 9);
  });

  it('follows tangents outside the curve', () => {
    expect(elevationAt(profile, 100)).toBeCloseTo(105, 9);
    expect(elevationAt(profile, 300)).toBeCloseTo(107, 9);
  });

  it('uses the parabola inside the curve: PVI offset = A·L/8', () => {
    // A = 8 %, L = 100 → offset 1.0 m below the PVI.
    expect(elevationAt(profile, 200)).toBeCloseTo(109, 9);
    // Continuous at BVC/EVC.
    expect(elevationAt(profile, 150)).toBeCloseTo(107.5, 9);
    expect(elevationAt(profile, 250)).toBeCloseTo(108.5, 9);
  });

  it('computes K and clamps stations', () => {
    expect(kValue(profile, 1)).toBeCloseTo(12.5, 9);
    expect(elevationAt(profile, -10)).toBe(100);
    expect(elevationAt(profile, 999)).toBe(104);
  });

  it('warns when curves overlap', () => {
    const p = computeProfile([
      { station: 0, elevation: 0, curveLength: 0 },
      { station: 50, elevation: 2, curveLength: 80 },
      { station: 100, elevation: 0, curveLength: 80 },
      { station: 150, elevation: 1, curveLength: 0 },
    ]);
    expect(p.warnings.length).toBeGreaterThan(0);
  });

  it('auto profile follows the ground', () => {
    const ground = Array.from({ length: 301 }, (_, i) => ({
      station: i * 2,
      elevation: 50 + i * 0.02,
    }));
    const pvis = autoProfile(ground, 150, 60);
    expect(pvis[0]?.station).toBe(0);
    expect(pvis.at(-1)?.station).toBe(600);
    expect(pvis.length).toBe(5);
    const p = computeProfile(pvis);
    expect(p.warnings).toEqual([]);
    expect(Math.abs(elevationAt(p, 300) - 53)).toBeLessThan(0.5);
  });
});
