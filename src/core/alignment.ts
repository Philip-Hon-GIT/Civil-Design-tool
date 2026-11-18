import type { Point2 } from './projects';

/**
 * Horizontal alignment by the PI method (tangent, clothoid, arc, clothoid, tangent).
 * Coordinates are project CRS metres (x = east, y = north). Headings are radians,
 * counter-clockwise from east. Curvature is positive for left turns.
 */

export interface PIInput extends Point2 {
  /** Circular arc radius in metres (> 0). */
  radius: number;
  /** Entry clothoid length in metres (0 = none). */
  l1: number;
  /** Exit clothoid length in metres (0 = none). */
  l2: number;
}

export interface AlignmentInput {
  start: Point2;
  pis: PIInput[];
  end: Point2;
  startStation?: number;
}

export type ElementType = 'line' | 'clothoid' | 'arc';

export interface AlignmentElement {
  type: ElementType;
  startStation: number;
  length: number;
  x0: number;
  y0: number;
  /** Heading at start. */
  h0: number;
  /** Curvature at start and end (1/m, signed). */
  k0: number;
  k1: number;
}

export interface Alignment {
  elements: AlignmentElement[];
  startStation: number;
  length: number;
  /** Geometry problems, e.g. overlapping curves. Empty when the alignment is valid. */
  warnings: string[];
}

export interface StationPoint extends Point2 {
  station: number;
  heading: number;
}

const TWO_PI = Math.PI * 2;

function normAngle(a: number): number {
  let r = a % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  if (r <= -Math.PI) r += TWO_PI;
  return r;
}

/**
 * Integrate position along an element with linearly varying curvature, from its start to
 * distance t. Composite Simpson's rule; exact for lines, sub-millimetre for road clothoids.
 */
export function integrateElement(
  e: Pick<AlignmentElement, 'x0' | 'y0' | 'h0' | 'k0' | 'k1' | 'length'>,
  t: number,
): { x: number; y: number; heading: number } {
  const dk = e.length > 0 ? (e.k1 - e.k0) / e.length : 0;
  const heading = (u: number) => e.h0 + e.k0 * u + (dk * u * u) / 2;
  if (t <= 0) return { x: e.x0, y: e.y0, heading: e.h0 };
  const n = Math.max(2, 2 * Math.ceil(t / 2)); // even, about 1 m steps
  const step = t / n;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i <= n; i++) {
    const w = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
    const h = heading(i * step);
    sx += w * Math.cos(h);
    sy += w * Math.sin(h);
  }
  return { x: e.x0 + (sx * step) / 3, y: e.y0 + (sy * step) / 3, heading: heading(t) };
}

/** Local end point of a clothoid of length L ending at radius R, starting along +x. */
function spiralEnd(length: number, radius: number) {
  return integrateElement({ x0: 0, y0: 0, h0: 0, k0: 0, k1: 1 / radius, length }, length);
}

/** Shift p and tangent extension k of a clothoid, for the tangent-length formulas. */
function spiralShift(length: number, radius: number) {
  if (length <= 0) return { p: 0, k: 0, theta: 0 };
  const end = spiralEnd(length, radius);
  const theta = length / (2 * radius);
  return {
    p: end.y - radius * (1 - Math.cos(theta)),
    k: end.x - radius * Math.sin(theta),
    theta,
  };
}

export function computeAlignment(input: AlignmentInput): Alignment {
  const startStation = input.startStation ?? 0;
  const verts: Point2[] = [input.start, ...input.pis, input.end];
  const warnings: string[] = [];
  const elements: AlignmentElement[] = [];

  // Per PI: deflection, tangent lengths and curve pieces.
  const curves = input.pis.map((pi, i) => {
    const prev = verts[i] as Point2;
    const next = verts[i + 2] as Point2;
    const hIn = Math.atan2(pi.y - prev.y, pi.x - prev.x);
    const hOut = Math.atan2(next.y - pi.y, next.x - pi.x);
    const delta = normAngle(hOut - hIn);
    const absDelta = Math.abs(delta);
    const s1 = spiralShift(pi.l1, pi.radius);
    const s2 = spiralShift(pi.l2, pi.radius);
    let t1 = 0;
    let t2 = 0;
    let arcAngle = 0;
    if (absDelta > 1e-9) {
      const r = pi.radius;
      const tanHalf = Math.tan(absDelta / 2);
      const diff = (s2.p - s1.p) / Math.sin(absDelta);
      t1 = s1.k + (r + s1.p) * tanHalf + diff;
      t2 = s2.k + (r + s2.p) * tanHalf - diff;
      arcAngle = absDelta - s1.theta - s2.theta;
      if (arcAngle < 0)
        warnings.push(`PI${i + 1}: clothoids too long for the deflection; shorten L1/L2.`);
    }
    return { pi, hIn, hOut, delta, t1, t2, arcAngle: Math.max(0, arcAngle) };
  });

  // Check tangent overlap between consecutive points.
  for (let i = 0; i < verts.length - 1; i++) {
    const a = verts[i] as Point2;
    const b = verts[i + 1] as Point2;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const used = (curves[i - 1]?.t2 ?? 0) + (curves[i]?.t1 ?? 0);
    if (used > dist + 1e-6) {
      warnings.push(
        `Curves overlap between ${i === 0 ? 'POB' : `PI${i}`} and ${i === verts.length - 2 ? 'POE' : `PI${i + 1}`}: needs ${used.toFixed(1)} m, has ${dist.toFixed(1)} m.`,
      );
    }
  }

  let station = startStation;
  let cur = { x: input.start.x, y: input.start.y };

  const push = (type: ElementType, length: number, h0: number, k0: number, k1: number) => {
    if (length <= 1e-9) return;
    const e: AlignmentElement = {
      type,
      startStation: station,
      length,
      x0: cur.x,
      y0: cur.y,
      h0,
      k0,
      k1,
    };
    elements.push(e);
    const end = integrateElement(e, length);
    cur = { x: end.x, y: end.y };
    station += length;
  };

  curves.forEach((c) => {
    // Tangent from the current point to TS (start of the entry clothoid).
    const ts = { x: c.pi.x - c.t1 * Math.cos(c.hIn), y: c.pi.y - c.t1 * Math.sin(c.hIn) };
    push('line', Math.hypot(ts.x - cur.x, ts.y - cur.y), c.hIn, 0, 0);
    cur = ts; // snap to exact TS to avoid drift
    if (Math.abs(c.delta) <= 1e-9) return;
    const sign = Math.sign(c.delta);
    const k = sign / c.pi.radius;
    push('clothoid', c.pi.l1, c.hIn, 0, k);
    const hArc = c.hIn + sign * (c.pi.l1 / (2 * c.pi.radius));
    push('arc', c.arcAngle * c.pi.radius, hArc, k, k);
    const hSpiral2 = hArc + sign * c.arcAngle;
    push('clothoid', c.pi.l2, hSpiral2, k, 0);
    cur = { x: c.pi.x + c.t2 * Math.cos(c.hOut), y: c.pi.y + c.t2 * Math.sin(c.hOut) };
  });

  const last = curves[curves.length - 1];
  const hLast = Math.atan2(input.end.y - cur.y, input.end.x - cur.x);
  push('line', Math.hypot(input.end.x - cur.x, input.end.y - cur.y), last?.hOut ?? hLast, 0, 0);

  return { elements, startStation, length: station - startStation, warnings };
}

/** Point and heading at a station. Stations outside the alignment are clamped. */
export function pointAtStation(al: Alignment, station: number): StationPoint {
  const s = Math.min(Math.max(station, al.startStation), al.startStation + al.length);
  const e =
    al.elements.find((el) => s <= el.startStation + el.length + 1e-9) ??
    al.elements[al.elements.length - 1];
  if (!e) throw new Error('Empty alignment');
  const p = integrateElement(e, s - e.startStation);
  return { x: p.x, y: p.y, heading: p.heading, station: s };
}

/** Points every `step` metres, plus every element start and the end point. */
export function sampleAlignment(al: Alignment, step = 5): StationPoint[] {
  const stations = new Set<number>();
  for (let s = al.startStation; s < al.startStation + al.length; s += step) stations.add(s);
  for (const e of al.elements) stations.add(e.startStation);
  stations.add(al.startStation + al.length);
  return [...stations].sort((a, b) => a - b).map((s) => pointAtStation(al, s));
}

/**
 * Fit default curve parameters to each PI so the geometry is valid: keep the radius and
 * shorten the clothoids where the deflection is too small for them (each L <= 0.8 R |Δ|).
 */
export function fitCurves(points: PIInput[], defaults: { radius: number; l1: number; l2: number }) {
  return points.map((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    if (!prev || !next) return { ...p, ...defaults };
    const hIn = Math.atan2(p.y - prev.y, p.x - prev.x);
    const hOut = Math.atan2(next.y - p.y, next.x - p.x);
    const delta = Math.abs(normAngle(hOut - hIn));
    // theta1 + theta2 = (L1 + L2) / 2R must stay below delta; keep 20 % for the arc.
    const maxL = 0.8 * defaults.radius * delta;
    const l = Math.round(Math.min(defaults.l1, maxL) * 10) / 10;
    return { ...p, radius: defaults.radius, l1: l, l2: l };
  });
}
