import { describe, expect, it } from 'vitest';
import { computeAlignment } from '../src/core/alignment';
import { checkDesign, criteriaFor, stoppingSightDistance } from '../src/core/designCriteria';
import { computeProfile } from '../src/core/profile';

describe('criteriaFor', () => {
  it('gives increasing requirements with speed', () => {
    const c30 = criteriaFor(30, 0.1);
    const c50 = criteriaFor(50, 0.07);
    expect(c50.minRadius).toBeGreaterThan(c30.minRadius);
    expect(c50.minCrestK).toBeGreaterThan(c30.minCrestK);
    expect(c50.minSagK).toBeGreaterThan(c30.minSagK);
  });

  it('uses R = v² / 127(e + f), rounded up to 5 m', () => {
    // 50 km/h, e 0.04, f 0.18: 2500 / 27.94 = 89.5 → 90.
    // N100 Tabell B.1 (gater).
    expect(criteriaFor(50, 0.07).minRadius).toBe(60);
    expect(criteriaFor(40, 0.08).minSagK).toBe(1.5);
    expect(criteriaFor(60, 0.06).minRadius).toBe(125);
  });

  it('stopping sight distance at 50 km/h is about 55 m', () => {
    expect(stoppingSightDistance(50)).toBeGreaterThan(50);
    expect(stoppingSightDistance(50)).toBeLessThan(60);
  });
});

describe('checkDesign', () => {
  const al = computeAlignment({
    start: { x: 0, y: 0 },
    pis: [{ x: 200, y: 0, radius: 60, l1: 5, l2: 5 }],
    end: { x: 200, y: 200 },
  });

  it('flags a too-small radius and a short clothoid', () => {
    const issues = checkDesign(al, null, criteriaFor(60, 0.06));
    expect(issues.some((i) => i.message.startsWith('Radius 60'))).toBe(true);
    expect(issues.some((i) => i.message.startsWith('Clothoid A'))).toBe(true);
  });

  it('flags steep grades and sharp crests', () => {
    const p = computeProfile([
      { station: 0, elevation: 0, curveLength: 0 },
      { station: 100, elevation: 10, curveLength: 20 },
      { station: 200, elevation: 0, curveLength: 0 },
    ]);
    const msgs = checkDesign(al, p, criteriaFor(50, 0.07)).map((i) => i.message);
    expect(msgs.some((m) => m.startsWith('Grade 10.0 %'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('Crest K'))).toBe(true);
  });
});
