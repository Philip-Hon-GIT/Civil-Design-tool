import type { Alignment } from './alignment';
import type { SectionTemplate } from './crossSection';
import { kValue, type Profile } from './profile';
import { formatStation } from './station';

/**
 * Design criteria for a road class and design speed.
 *
 * NOTE: values are computed from standard formulas with stated assumptions, as indicative
 * defaults for early design. They must be checked against Statens vegvesen N100 and the
 * municipality's road norm (kommunal vegnorm) before use in a real project.
 */
export interface DesignCriteria {
  speed: number; // km/h
  minRadius: number; // m
  maxGrade: number; // fraction
  minCrestK: number; // m per % grade change
  minSagK: number;
  stoppingSightDistance: number; // m
}

/** Side friction used for minimum radius, by design speed (urban, simplified). */
const SIDE_FRICTION: Record<number, number> = {
  30: 0.22,
  40: 0.2,
  50: 0.18,
  60: 0.16,
  70: 0.15,
  80: 0.14,
};
/** Longitudinal friction for braking, by design speed (wet road, simplified). */
const BRAKE_FRICTION: Record<number, number> = {
  30: 0.44,
  40: 0.4,
  50: 0.37,
  60: 0.34,
  70: 0.32,
  80: 0.3,
};

/** Stopping sight distance: reaction 2 s plus braking on level road. */
export function stoppingSightDistance(speed: number): number {
  const f = BRAKE_FRICTION[speed] ?? 0.35;
  return (speed * 2) / 3.6 + (speed * speed) / (254 * f);
}

export function criteriaFor(
  speed: number,
  maxGrade: number,
  maxSuperelevation = 0.04,
): DesignCriteria {
  const f = SIDE_FRICTION[speed] ?? 0.18;
  const minRadius = Math.ceil((speed * speed) / (127 * (maxSuperelevation + f)) / 5) * 5;
  const ssd = stoppingSightDistance(speed);
  // Crest: sight distance S over the curve, eye 1.1 m, object 0.2 m: R = S² / (2 (√h1 + √h2)²).
  const crestR = (ssd * ssd) / (2 * (Math.sqrt(1.1) + Math.sqrt(0.2)) ** 2);
  // Sag: comfort, vertical acceleration 0.5 m/s²: R = v² / a.
  const sagR = (speed / 3.6) ** 2 / 0.5;
  return {
    speed,
    minRadius,
    maxGrade,
    minCrestK: Math.ceil(crestR / 100),
    minSagK: Math.ceil(sagR / 100),
    stoppingSightDistance: Math.round(ssd),
  };
}

export interface RoadPreset {
  id: string;
  name: string;
  speed: number;
  maxGrade: number;
  template: Partial<SectionTemplate>;
}

/** Indicative municipal road classes (verify against the municipality's road norm). */
export const ROAD_PRESETS: RoadPreset[] = [
  {
    id: 'atkomst',
    name: 'Atkomstveg, 30 km/h',
    speed: 30,
    maxGrade: 0.1,
    template: { laneWidth: 2.5, shoulderWidth: 0.25, footwayLeft: 0, footwayRight: 0 },
  },
  {
    id: 'samle',
    name: 'Samleveg, 40 km/h',
    speed: 40,
    maxGrade: 0.08,
    template: { laneWidth: 3.0, shoulderWidth: 0.25, footwayLeft: 0, footwayRight: 2.5 },
  },
  {
    id: 'hoved',
    name: 'Hovedveg i by, 50 km/h',
    speed: 50,
    maxGrade: 0.07,
    template: { laneWidth: 3.25, shoulderWidth: 0.5, footwayLeft: 2.5, footwayRight: 3.0 },
  },
  {
    id: 'hoved60',
    name: 'Hovedveg, 60 km/h',
    speed: 60,
    maxGrade: 0.06,
    template: { laneWidth: 3.25, shoulderWidth: 0.75, footwayLeft: 0, footwayRight: 3.0 },
  },
];

export interface DesignIssue {
  station: number;
  message: string;
}

/** Check an alignment and profile against design criteria. */
export function checkDesign(
  al: Alignment,
  profile: Profile | null,
  c: DesignCriteria,
): DesignIssue[] {
  const issues: DesignIssue[] = [];
  for (const e of al.elements) {
    if (e.type === 'arc') {
      const r = Math.abs(1 / e.k0);
      if (r < c.minRadius - 1e-6)
        issues.push({
          station: e.startStation,
          message: `Radius ${r.toFixed(0)} m < min ${c.minRadius} m`,
        });
    }
    if (e.type === 'clothoid') {
      const r = 1 / Math.max(Math.abs(e.k0), Math.abs(e.k1));
      const a = Math.sqrt(r * e.length);
      if (a < r / 3 - 1e-6)
        issues.push({
          station: e.startStation,
          message: `Clothoid A ${a.toFixed(0)} < R/3 (${(r / 3).toFixed(0)})`,
        });
    }
  }
  if (profile) {
    profile.grades.forEach((g, i) => {
      if (Math.abs(g) > c.maxGrade + 1e-9)
        issues.push({
          station: profile.pvis[i]!.station,
          message: `Grade ${(g * 100).toFixed(1)} % > max ${(c.maxGrade * 100).toFixed(0)} %`,
        });
    });
    for (let i = 1; i < profile.pvis.length - 1; i++) {
      const g1 = profile.grades[i - 1]!;
      const g2 = profile.grades[i]!;
      const k = kValue(profile, i);
      const crest = g2 < g1;
      const min = crest ? c.minCrestK : c.minSagK;
      if (k < min - 1e-6)
        issues.push({
          station: profile.pvis[i]!.station,
          message: `${crest ? 'Crest' : 'Sag'} K ${k.toFixed(1)} < min ${min}`,
        });
    }
  }
  return issues.sort((a, b) => a.station - b.station);
}

export function formatIssue(i: DesignIssue): string {
  return `${formatStation(i.station, 0)}: ${i.message}`;
}
