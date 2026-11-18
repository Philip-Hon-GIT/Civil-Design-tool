/**
 * Road cross-section: a symmetric template of lanes and shoulders with side slopes that
 * daylight to the terrain. Offsets in metres, positive to the right of the alignment.
 * Elevations relative to NN2000. Crossfall and slopes are positive downwards from the centre.
 */

export interface SectionTemplate {
  /** Width of each lane (one per side). */
  laneWidth: number;
  /** Crossfall of lanes, fraction (0.03 = 3 %), falling outwards (roof shape). */
  laneCrossfall: number;
  /** Shoulder width outside each lane. */
  shoulderWidth: number;
  shoulderCrossfall: number;
  /** Side slopes as horizontal:vertical ratio n in 1:n (e.g. 2 means 1:2). */
  cutSlope: number;
  fillSlope: number;
  /** Max horizontal distance searched for daylight from the shoulder edge. */
  maxSlopeWidth: number;
}

/** Municipal street, about 6.5 m paved: 2 x 3.0 m lanes + 0.25 m shoulders. */
export const DEFAULT_TEMPLATE: SectionTemplate = {
  laneWidth: 3.0,
  laneCrossfall: 0.03,
  shoulderWidth: 0.25,
  shoulderCrossfall: 0.04,
  cutSlope: 2,
  fillSlope: 2,
  maxSlopeWidth: 25,
};

export type SectionPart = 'lane' | 'shoulder' | 'cut' | 'fill';

export interface SectionPoint {
  offset: number;
  z: number;
}

export interface Section {
  /** Points from left daylight to right daylight. */
  points: SectionPoint[];
  /** Part type of each segment between consecutive points (points.length - 1 items). */
  parts: SectionPart[];
  /** Cross-section areas in m² between design surface and ground. */
  cutArea: number;
  fillArea: number;
}

/** Ground elevation at an offset from the alignment (undefined if unknown). */
export type GroundProfile = (offset: number) => number | undefined;

/** One side of the section (side = +1 right, -1 left), from the centre outwards. */
function buildSide(
  t: SectionTemplate,
  centerZ: number,
  ground: GroundProfile,
  side: 1 | -1,
): { points: SectionPoint[]; parts: SectionPart[] } {
  const points: SectionPoint[] = [{ offset: 0, z: centerZ }];
  const parts: SectionPart[] = [];
  let o = 0;
  let z = centerZ;
  o += t.laneWidth;
  z -= t.laneWidth * t.laneCrossfall;
  points.push({ offset: side * o, z });
  parts.push('lane');
  if (t.shoulderWidth > 0) {
    o += t.shoulderWidth;
    z -= t.shoulderWidth * t.shoulderCrossfall;
    points.push({ offset: side * o, z });
    parts.push('shoulder');
  }
  // Daylight: go up (cut) or down (fill) from the shoulder edge until the ground is met.
  const g0 = ground(side * o);
  if (g0 === undefined) return { points, parts };
  const isCut = g0 > z;
  const n = isCut ? t.cutSlope : t.fillSlope;
  const dz = isCut ? 1 / n : -1 / n; // per metre outwards
  const step = 0.25;
  let prevDiff = g0 - z;
  for (let d = step; d <= t.maxSlopeWidth + 1e-9; d += step) {
    const off = o + d;
    const sz = z + dz * d;
    const g = ground(side * off);
    if (g === undefined) break;
    const diff = g - sz;
    if (Math.sign(diff) !== Math.sign(prevDiff) || diff === 0) {
      // Linear interpolation of the crossing within this step.
      const f = prevDiff / (prevDiff - diff);
      const dd = d - step + f * step;
      points.push({ offset: side * (o + dd), z: z + dz * dd });
      parts.push(isCut ? 'cut' : 'fill');
      return { points, parts };
    }
    prevDiff = diff;
  }
  // No daylight within the search width: stop the slope there.
  points.push({ offset: side * (o + t.maxSlopeWidth), z: z + dz * t.maxSlopeWidth });
  parts.push(isCut ? 'cut' : 'fill');
  return { points, parts };
}

export function buildSection(t: SectionTemplate, centerZ: number, ground: GroundProfile): Section {
  const right = buildSide(t, centerZ, ground, 1);
  const left = buildSide(t, centerZ, ground, -1);
  const points = [...left.points.slice().reverse(), ...right.points.slice(1)];
  const parts = [...left.parts.slice().reverse(), ...right.parts];
  const { cut, fill } = areasBetween(points, ground);
  return { points, parts, cutArea: cut, fillArea: fill };
}

/**
 * Cut and fill areas between a design polyline and the ground, integrated over offset
 * with 0.1 m strips (trapezoids).
 */
export function areasBetween(points: SectionPoint[], ground: GroundProfile) {
  let cut = 0;
  let fill = 0;
  const step = 0.1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const w = b.offset - a.offset;
    const n = Math.max(1, Math.ceil(Math.abs(w) / step));
    for (let k = 0; k < n; k++) {
      const om = a.offset + (w * (k + 0.5)) / n;
      const zm = a.z + ((b.z - a.z) * (k + 0.5)) / n;
      const g = ground(om);
      if (g === undefined) continue;
      const diff = (zm - g) * (Math.abs(w) / n);
      if (diff > 0) fill += diff;
      else cut -= diff;
    }
  }
  return { cut, fill };
}

/** Volumes by average end area from sections at increasing stations. */
export function endAreaVolumes(sections: { station: number; cutArea: number; fillArea: number }[]) {
  let cut = 0;
  let fill = 0;
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1]!;
    const b = sections[i]!;
    const L = b.station - a.station;
    cut += ((a.cutArea + b.cutArea) / 2) * L;
    fill += ((a.fillArea + b.fillArea) / 2) * L;
  }
  return { cut, fill };
}
