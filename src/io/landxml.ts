/** A triangulated surface read from LandXML, in project coordinates (x = east, y = north). */
export interface TinSurface {
  name: string;
  /** Flat array of x, y, z per point. */
  positions: Float64Array;
  /** Flat array of triangle vertex indices (0-based). */
  indices: Uint32Array;
}

const SURFACE_RE = /<Surface\b([^>]*)>([\s\S]*?)<\/Surface>/g;
const NAME_RE = /\bname="([^"]*)"/;
const POINT_RE = /<P\b[^>]*\bid="([^"]+)"[^>]*>([^<]+)<\/P>/g;
const FACE_RE = /<F\b([^>]*)>([^<]+)<\/F>/g;

/**
 * Parse TIN surfaces from a LandXML 1.x document.
 * LandXML stores points as "northing easting elevation"; we swap to x = east, y = north.
 * Faces marked i="1" (invisible, e.g. outside the boundary) are skipped.
 */
export function parseLandXmlSurfaces(xml: string): TinSurface[] {
  const surfaces: TinSurface[] = [];
  for (const [, attrs = '', body = ''] of xml.matchAll(SURFACE_RE)) {
    const name = NAME_RE.exec(attrs)?.[1] ?? `Surface ${surfaces.length + 1}`;
    const idToIndex = new Map<string, number>();
    const positions: number[] = [];
    for (const [, id = '', text = ''] of body.matchAll(POINT_RE)) {
      const [n, e, z] = text.trim().split(/\s+/).map(Number);
      if (n === undefined || e === undefined || z === undefined || [n, e, z].some(Number.isNaN))
        continue;
      idToIndex.set(id, positions.length / 3);
      positions.push(e, n, z);
    }
    const indices: number[] = [];
    for (const [, fAttrs = '', text = ''] of body.matchAll(FACE_RE)) {
      if (/\bi="1"/.test(fAttrs)) continue;
      const ids = text.trim().split(/\s+/);
      if (ids.length !== 3) continue;
      const tri = ids.map((id) => idToIndex.get(id));
      if (tri.some((i) => i === undefined)) continue;
      indices.push(...(tri as number[]));
    }
    if (indices.length > 0) {
      surfaces.push({
        name,
        positions: Float64Array.from(positions),
        indices: Uint32Array.from(indices),
      });
    }
  }
  return surfaces;
}
