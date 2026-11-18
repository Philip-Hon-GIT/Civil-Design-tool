import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDxf } from '../src/io/dxf';
import { decodeSosi, parseSosi } from '../src/io/sosi';

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6));

describe('parseSosi', () => {
  const data = parseSosi(decodeSosi(readFileSync('samples/small-survey.sos')));

  it('reads the coordinate system', () => {
    expect(data.epsg).toBe(25832);
  });

  it('reads points and curves with origin and unit, and skips surfaces', () => {
    expect(data.features.map((f) => [f.kind, f.type])).toEqual([
      ['point', 'Terrengpunkt'],
      ['line', 'Høydekurve'],
      ['line', 'Vegkant'],
    ]);
    const [p, contour, edge] = data.features;
    close(p!.coords, [569840, 7032930, 50.12]);
    // 2D curve takes its height from KOTE.
    close(contour!.coords.slice(3, 6), [569840.2, 7032930.5, 51]);
    expect(edge!.coords[2]).toBeCloseTo(49.8, 9);
  });
});

describe('parseDxf', () => {
  const data = parseDxf(readFileSync('samples/small-drawing.dxf', 'utf8'));

  it('reads points, lines and polylines with layers', () => {
    expect(data.features.map((f) => [f.kind, f.type, f.coords.length / 3])).toEqual([
      ['point', 'POINTS', 1],
      ['line', 'KERB', 2],
      ['line', 'CONTOUR', 3],
      ['line', 'BREAKLINE', 2],
    ]);
    expect(data.features[2]!.coords.slice(3, 6)).toEqual([569820, 7032955, 51]);
    expect(data.features[3]!.coords.slice(3, 6)).toEqual([569860, 7032920, 49.8]);
  });
});
