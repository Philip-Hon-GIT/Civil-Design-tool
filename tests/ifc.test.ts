import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeAlignment } from '../src/core/alignment';
import { buildCorridor } from '../src/core/corridor';
import { DEFAULT_TEMPLATE } from '../src/core/crossSection';
import { criteriaFor } from '../src/core/designCriteria';
import { computeProfile } from '../src/core/profile';
import { KLAEBUVEIEN } from '../src/core/projects';
import { exportIfc, verticalSegments } from '../src/io/ifc/exportIfc';
import { encodeString, formatReal, ifcGuid } from '../src/io/ifc/step';

describe('STEP encoding', () => {
  it('encodes strings', () => {
    expect(encodeString("Klæbu's")).toBe("'Kl\\X2\\00E6\\X0\\bu''s'");
  });
  it('formats reals with a decimal point', () => {
    expect(formatReal(1)).toBe('1.');
    expect(formatReal(0)).toBe('0.');
    expect(formatReal(-2.5)).toBe('-2.5');
    expect(formatReal(1e-9)).toMatch(/^1\.0*E-9$/);
  });
  it('makes 22-character GUIDs', () => {
    const g = ifcGuid();
    expect(g).toHaveLength(22);
    expect('0123').toContain(g[0]);
  });
});

describe('verticalSegments', () => {
  it('splits tangents and curves and ends with a zero-length segment', () => {
    const p = computeProfile([
      { station: 0, elevation: 10, curveLength: 0 },
      { station: 100, elevation: 12, curveLength: 40 },
      { station: 200, elevation: 11, curveLength: 0 },
    ]);
    const segs = verticalSegments(p);
    expect(segs.map((s) => s.type)).toEqual([
      'CONSTANTGRADIENT',
      'PARABOLICARC',
      'CONSTANTGRADIENT',
      'CONSTANTGRADIENT',
    ]);
    expect(segs.map((s) => s.length)).toEqual([80, 40, 80, 0]);
    expect(segs[1]!.radius).toBeCloseTo(40 / (-0.01 - 0.02), 9);
    expect(segs[2]!.startHeight).toBeCloseTo(12 - 0.2, 9);
  });
});

describe('exportIfc', () => {
  it('writes a georeferenced IFC 4.3 file with alignment and road', () => {
    const c0 = KLAEBUVEIEN.center;
    const al = computeAlignment({
      start: { x: c0.x, y: c0.y - 200 },
      pis: [{ x: c0.x + 60, y: c0.y, radius: 150, l1: 20, l2: 20 }],
      end: { x: c0.x, y: c0.y + 200 },
    });
    const profile = computeProfile([
      { station: 0, elevation: 50, curveLength: 0 },
      { station: al.length / 2, elevation: 53, curveLength: 60 },
      { station: al.length, elevation: 51, curveLength: 0 },
    ]);
    const corridor = buildCorridor(al, profile, DEFAULT_TEMPLATE, () => 51, 5);
    const ifc = exportIfc({
      area: KLAEBUVEIEN,
      alignment: al,
      profile,
      corridor,
      template: DEFAULT_TEMPLATE,
      criteria: criteriaFor(50, 0.08),
      terrain: {
        x0: c0.x - 50,
        y0: c0.y - 50,
        step: 25,
        nx: 5,
        ny: 5,
        z: new Float64Array(25).fill(51),
      },
      timestamp: '2026-01-01T00:00:00',
    });
    expect(ifc).toContain("FILE_SCHEMA(('IFC4X3_ADD2'))");
    expect(ifc).toContain('IFCMAPCONVERSION');
    expect(ifc).toContain("IFCPROJECTEDCRS('EPSG:25832'");
    expect(ifc).toContain('IFCALIGNMENTHORIZONTALSEGMENT');
    expect(ifc).toContain('.CLOTHOID.');
    expect(ifc).toContain('.PARABOLICARC.');
    expect(ifc).toContain('IFCROAD(');
    expect(ifc).toContain('IFCPAVEMENT(');
    expect(ifc).toContain('.TERRAIN.');
    if (process.env.IFC_OUT) writeFileSync(process.env.IFC_OUT, ifc);
  });
});
