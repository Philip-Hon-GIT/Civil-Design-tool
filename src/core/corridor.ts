import { pointAtStation, type Alignment } from './alignment';
import { buildSection, endAreaVolumes, type Section, type SectionTemplate } from './crossSection';
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

/** Cross-section at one station. */
export function sectionAtStation(
  al: Alignment,
  profile: Profile,
  template: SectionTemplate,
  ground: GroundSampler,
  station: number,
): CorridorSection {
  const p = pointAtStation(al, station);
  const rightX = Math.sin(p.heading);
  const rightY = -Math.cos(p.heading);
  const section = buildSection(template, elevationAt(profile, p.station), (o) =>
    ground(p.x + rightX * o, p.y + rightY * o),
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
): Corridor {
  const stations: number[] = [];
  for (let s = al.startStation; s < al.startStation + al.length; s += step) stations.push(s);
  stations.push(al.startStation + al.length);
  const sections = stations.map((s) => sectionAtStation(al, profile, template, ground, s));
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
