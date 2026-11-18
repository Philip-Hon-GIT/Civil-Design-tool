import { curvatureAt, pointAtStation, type Alignment } from './alignment';
import {
  buildSection,
  endAreaVolumes,
  sideCrossfall,
  superelevationFor,
  type Section,
  type SectionTemplate,
} from './crossSection';
import { elevationAt, type Profile } from './profile';

/** Ground elevation at a map position (undefined if unknown). */
export type GroundSampler = (x: number, y: number) => number | undefined;

export interface CorridorSection extends Section {
  station: number;
  /** Alignment point and unit vector to the right, to place offsets in the map. */
  x: number;
  y: number;
  rightX: number;
  rightY: number;
}

export interface Corridor {
  sections: CorridorSection[];
  cutVolume: number;
  fillVolume: number;
}

/** Design speed for superelevation; 0 or undefined = no superelevation. */
export interface CorridorOptions {
  speed?: number;
}

/** Cross-section at one station. */
export function sectionAtStation(
  al: Alignment,
  profile: Profile,
  template: SectionTemplate,
  ground: GroundSampler,
  station: number,
  options: CorridorOptions = {},
): CorridorSection {
  const p = pointAtStation(al, station);
  const rightX = Math.sin(p.heading);
  const rightY = -Math.cos(p.heading);
  let crossfall;
  if (options.speed) {
    const { k, kArc } = curvatureAt(al, p.station);
    const eArc = kArc
      ? superelevationFor(options.speed, 1 / Math.abs(kArc), template.laneCrossfall)
      : 0;
    crossfall = sideCrossfall(template.laneCrossfall, k, kArc, eArc);
  }
  const section = buildSection(
    template,
    elevationAt(profile, p.station),
    (o) => ground(p.x + rightX * o, p.y + rightY * o),
    crossfall,
  );
  return { ...section, station: p.station, x: p.x, y: p.y, rightX, rightY };
}

/** Sections every `step` metres along the alignment, and cut/fill volumes. */
export function buildCorridor(
  al: Alignment,
  profile: Profile,
  template: SectionTemplate,
  ground: GroundSampler,
  step = 5,
  options: CorridorOptions = {},
): Corridor {
  const stations: number[] = [];
  for (let s = al.startStation; s < al.startStation + al.length; s += step) stations.push(s);
  stations.push(al.startStation + al.length);
  const sections = stations.map((s) => sectionAtStation(al, profile, template, ground, s, options));
  const { cut, fill } = endAreaVolumes(sections);
  return { sections, cutVolume: cut, fillVolume: fill };
}

/** Outline of the corridor (left daylight forward, right daylight back) in map coordinates. */
export function corridorFootprint(corridor: Corridor): [number, number][] {
  const edge = (s: CorridorSection, i: number): [number, number] => {
    const p = s.points[i]!;
    return [s.x + s.rightX * p.offset, s.y + s.rightY * p.offset];
  };
  const left = corridor.sections.map((s) => edge(s, 0));
  const right = corridor.sections.map((s) => edge(s, s.points.length - 1)).reverse();
  const ring = [...left, ...right];
  if (ring.length > 0) ring.push(ring[0]!);
  return ring;
}

/**
 * Whether two neighbouring sections can be joined into a surface: same parts in the same
 * order, where a cut and a fill slope count as the same (the slope just changes direction).
 */
export function sameStructure(a: { parts: string[] }, b: { parts: string[] }): boolean {
  if (a.parts.length !== b.parts.length) return false;
  const slope = (p: string) => (p === 'cut' || p === 'fill' ? 'slope' : p);
  return a.parts.every((p, i) => slope(p) === slope(b.parts[i]!));
}
