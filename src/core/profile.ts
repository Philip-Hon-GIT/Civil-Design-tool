/**
 * Vertical alignment (longitudinal profile) by PVIs with symmetric parabolic curves.
 * Stations in metres along the horizontal alignment, elevations in metres (NN2000).
 */

export interface PVI {
  station: number;
  elevation: number;
  /** Vertical curve length in metres (0 = sharp grade break). Ignored at start/end. */
  curveLength: number;
}

export interface Profile {
  /** Sorted by station. First and last are the start and end of the profile. */
  pvis: PVI[];
  /** Grades between PVIs, as fractions (0.05 = 5 %). */
  grades: number[];
  warnings: string[];
}

export function computeProfile(pvis: PVI[]): Profile {
  const sorted = [...pvis].sort((a, b) => a.station - b.station);
  const grades: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const ds = b.station - a.station;
    grades.push(ds > 0 ? (b.elevation - a.elevation) / ds : 0);
  }
  const warnings: string[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const halfA = i - 1 === 0 ? 0 : a.curveLength / 2;
    const halfB = i === sorted.length - 1 ? 0 : b.curveLength / 2;
    if (halfA + halfB > b.station - a.station + 1e-6) {
      warnings.push(
        `Vertical curves overlap between stations ${a.station.toFixed(0)} and ${b.station.toFixed(0)}.`,
      );
    }
  }
  return { pvis: sorted, grades, warnings };
}

/** Design elevation at a station (clamped to the profile ends). */
export function elevationAt(profile: Profile, station: number): number {
  const { pvis, grades } = profile;
  if (pvis.length === 0) return 0;
  const first = pvis[0]!;
  const last = pvis[pvis.length - 1]!;
  if (pvis.length === 1) return first.elevation;
  const s = Math.min(Math.max(station, first.station), last.station);

  // Inside a vertical curve? (interior PVIs only)
  for (let i = 1; i < pvis.length - 1; i++) {
    const p = pvis[i]!;
    const half = p.curveLength / 2;
    if (half > 0 && s >= p.station - half && s <= p.station + half) {
      const g1 = grades[i - 1]!;
      const g2 = grades[i]!;
      const bvc = p.station - half;
      const x = s - bvc;
      const elevBvc = p.elevation - g1 * half;
      return elevBvc + g1 * x + ((g2 - g1) / (2 * p.curveLength)) * x * x;
    }
  }
  // On a tangent.
  let i = 1;
  while (i < pvis.length - 1 && s > pvis[i]!.station) i++;
  const a = pvis[i - 1]!;
  return a.elevation + grades[i - 1]! * (s - a.station);
}

/** K-value (curve length per % grade change) of an interior PVI. */
export function kValue(profile: Profile, index: number): number {
  const p = profile.pvis[index];
  const g1 = profile.grades[index - 1];
  const g2 = profile.grades[index];
  if (!p || g1 === undefined || g2 === undefined) return Infinity;
  const dg = Math.abs(g2 - g1) * 100;
  return dg > 0 ? p.curveLength / dg : Infinity;
}

/**
 * A first-guess profile that follows the ground: PVIs about every `spacing` metres at the
 * smoothed ground elevation, with vertical curves.
 */
export function autoProfile(
  ground: { station: number; elevation: number }[],
  spacing = 150,
  curveLength = 60,
): PVI[] {
  if (ground.length < 2) return [];
  const start = ground[0]!.station;
  const end = ground[ground.length - 1]!.station;
  const n = Math.max(1, Math.round((end - start) / spacing));
  const smooth = (s: number) => {
    const win = ground.filter((g) => Math.abs(g.station - s) <= spacing / 4);
    const pts = win.length > 0 ? win : ground;
    return pts.reduce((sum, g) => sum + g.elevation, 0) / pts.length;
  };
  const pvis: PVI[] = [];
  for (let i = 0; i <= n; i++) {
    const s = start + ((end - start) * i) / n;
    const len = i === 0 || i === n ? 0 : Math.min(curveLength, ((end - start) / n) * 0.8);
    pvis.push({ station: s, elevation: Math.round(smooth(s) * 100) / 100, curveLength: len });
  }
  return pvis;
}
